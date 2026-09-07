-- Report lineage, version allocation and finalisation scope correction.
--
-- Defect. The order-scoped claim and finalisation RPCs treated the ORDER as the report identity
-- scope. They detected an existing report, allocated the next version_number and resolved the
-- previous live report using `where order_id = <this order>`. The authoritative report identity
-- constraints are not order-scoped:
--
--   * unique (assessment_id, report_type, version_number)
--   * unique (report_reference)
--   * reports_one_current_assessment_type_uidx: one live row per (assessment_id, report_type)
--
-- A report generated for an assessment outside this order -- for example an earlier V1 whose
-- order_id is NULL -- was therefore invisible to the allocator. The claim allocated version 1
-- again, the completion built 'RPT-<assessment>-V1', found no previous report to supersede
-- because the previous row carried no order_id, and the insert failed with 23505 on
-- reports_report_reference_key AFTER the writer, PDF and storage spend had already happened.
--
-- Correction. Version allocation and previous-report resolution move to the authoritative scope,
-- assessment + report_type, which is the scope the constraints are actually written in. The
-- assessment-scoped RPCs added in 20260826114407 already work this way; this brings the
-- order-scoped ones onto the same rule.
--
-- No unique constraint is dropped, weakened or replaced. No historical report row is deleted or
-- mutated by this migration. Order-level idempotency ("this order already has a ready report") is
-- preserved exactly as it was, and the new report stays bound to the paying order via order_id.
--
-- Locking. Both order-scoped claims now lock the ASSESSMENT row, not only the order row. Several
-- orders can reference one assessment, so an order-only lock lets two concurrent claims for the
-- same assessment read the same max(version_number) and reserve the same version. Locking the
-- assessment serialises every claim that shares a report identity.

begin;

-- ---------------------------------------------------------------------------
-- Deterministic product -> report type. One definition, used by every RPC below,
-- so a claim can never allocate a version in a different lineage from the one
-- finalisation writes into.
-- ---------------------------------------------------------------------------
create or replace function public.report_type_for_product_code(p_product_code text)
returns public.report_type
language sql
immutable
set search_path = public, pg_temp
as $$
  select case p_product_code
    when 'essential_self_assessment' then 'essential_self_assessment'::public.report_type
    when 'mk_validated_assessment' then 'mk_validated'::public.report_type
  end;
$$;

comment on function public.report_type_for_product_code(text) is
  'Deterministic purchased-product to report_type resolution. Returns NULL for any product that carries no paid report entitlement.';

-- ---------------------------------------------------------------------------
-- Single report-reference rule, mirroring the application rule in
-- src/lib/reports/report-reference.ts. Comprehensive keeps the bare
-- assessment reference here: its -COMP- namespace is applied by the existing
-- ensure_comprehensive_report_reference_namespace() trigger and is not
-- re-implemented in this function.
-- ---------------------------------------------------------------------------
create or replace function public.mk_report_reference(
  p_assessment_reference text,
  p_report_type public.report_type,
  p_version integer
) returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_report_type = 'essential_self_assessment'::public.report_type
      then 'RPT-' || replace(p_assessment_reference, '-COMP-', '-ESS-') || '-V' || p_version::text
    else 'RPT-' || p_assessment_reference || '-V' || p_version::text
  end;
$$;

comment on function public.mk_report_reference(text, public.report_type, integer) is
  'Authoritative report-reference construction shared by every report finalisation RPC.';

-- ---------------------------------------------------------------------------
-- claim_manual_report_generation: admin-triggered order-scoped claim.
-- ---------------------------------------------------------------------------
create or replace function public.claim_manual_report_generation(
  p_order_reference text,
  p_requested_by uuid,
  p_request_key text,
  p_trigger_source text,
  p_technical_reference text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_assessment public.assessments%rowtype;
  v_score public.score_runs%rowtype;
  v_profile public.admin_profiles%rowtype;
  v_active public.manual_report_generation_attempts%rowtype;
  v_existing public.manual_report_generation_attempts%rowtype;
  v_ready public.reports%rowtype;
  v_attempt public.manual_report_generation_attempts%rowtype;
  v_product_code text;
  v_report_type public.report_type;
  v_version integer;
  v_retries integer;
begin
  if coalesce(trim(p_request_key),'') = '' or coalesce(trim(p_technical_reference),'') = '' then
    raise exception 'phase1_request_identity_required';
  end if;
  if p_trigger_source not in ('admin_generate','admin_retry','admin_regenerate') then
    raise exception 'phase1_generation_trigger_invalid';
  end if;

  select * into v_profile from public.admin_profiles where id = p_requested_by and status = 'active';
  if not found or v_profile.role not in ('platform_admin','reviewer','approver') then
    raise exception 'phase1_generation_permission_denied';
  end if;
  if p_trigger_source = 'admin_regenerate' and v_profile.role not in ('platform_admin','approver') then
    raise exception 'phase1_regeneration_permission_denied';
  end if;

  select * into v_existing from public.manual_report_generation_attempts where request_key = p_request_key;
  if found then
    return jsonb_build_object('claimed', false, 'reason', 'idempotent_replay', 'attempt', to_jsonb(v_existing));
  end if;

  select * into v_order from public.orders where order_reference = p_order_reference for update;
  if not found then raise exception 'phase1_order_not_found'; end if;
  if v_order.status <> 'payment_received' then raise exception 'phase1_order_not_eligible'; end if;

  -- Lock the ASSESSMENT, not only the order. Report identity is per assessment + report type, so
  -- two orders on one assessment must not allocate a version concurrently.
  select * into v_assessment from public.assessments where id = v_order.assessment_id for update;
  if not found or v_assessment.current_score_run_id is null
     or v_assessment.status not in ('scored','snapshot_available','report_requested','under_review','closed') then
    raise exception 'phase1_assessment_incomplete';
  end if;
  select * into v_score from public.score_runs
    where id = v_assessment.current_score_run_id and status = 'completed';
  if not found or v_score.locked_at is null then raise exception 'phase1_assessment_incomplete'; end if;

  select p.product_code into v_product_code from public.products p where p.id = v_order.product_id;
  v_report_type := public.report_type_for_product_code(v_product_code);
  if v_report_type is null then raise exception 'phase1_order_product_not_eligible'; end if;

  select * into v_active from public.manual_report_generation_attempts
    where order_id = v_order.id and status in ('REPORT_QUEUED','REPORT_GENERATING')
    order by created_at desc limit 1;
  if found then
    if p_trigger_source = 'admin_retry' and v_active.updated_at < now() - interval '15 minutes' then
      update public.manual_report_generation_attempts
      set status='GENERATION_FAILED',completed_at=now(),updated_at=now(),
          error_category='generation_stuck_recovered',
          safe_operational_error='The previous generation attempt stopped responding and was closed for an authorised retry.'
      where id=v_active.id;
      insert into public.order_events(order_id,event_type,actor_admin_user_id,note,metadata_json)
      values(v_order.id,'generation_failed',p_requested_by,
        'The previous generation attempt stopped responding and was closed for an authorised retry.',
        jsonb_build_object('attempt_id',v_active.id,'technical_reference',v_active.technical_reference,
          'retry_count',v_active.retry_count,'error_category','generation_stuck_recovered'));
    else
      return jsonb_build_object('claimed', false, 'reason', 'already_active', 'attempt', to_jsonb(v_active));
    end if;
  end if;

  -- Unchanged order-level idempotency: a report already delivered FOR THIS ORDER is reused rather
  -- than regenerated. This deliberately stays order-scoped -- it answers "has this buyer already
  -- been served?", which is a different question from "what version is next for this assessment?".
  select * into v_ready from public.reports
    where order_id = v_order.id and storage_bucket is not null and storage_path is not null
      and checksum is not null and storage_status not in ('MISSING','FAILED')
      and status not in ('superseded','voided')
    order by version_number desc limit 1;
  if found and p_trigger_source = 'admin_retry' and v_profile.role not in ('platform_admin','approver') then
    raise exception 'phase1_regeneration_permission_denied';
  end if;
  if found and p_trigger_source = 'admin_generate' then
    return jsonb_build_object('claimed', false, 'reason', 'report_exists', 'report', to_jsonb(v_ready));
  end if;

  -- Authoritative allocation scope: assessment + report type, matching
  -- reports_assessment_id_report_type_version_number_key and reports_report_reference_key.
  select coalesce(max(version_number),0) + 1 into v_version
    from public.reports
    where assessment_id = v_assessment.id and report_type = v_report_type;
  select count(*)::integer into v_retries
    from public.manual_report_generation_attempts
    where order_id = v_order.id and status = 'GENERATION_FAILED';

  begin
    insert into public.manual_report_generation_attempts (
      request_key, order_id, report_version, trigger_source, requested_by,
      status, retry_count, technical_reference
    ) values (
      p_request_key, v_order.id, v_version, p_trigger_source, p_requested_by,
      'REPORT_QUEUED', v_retries, p_technical_reference
    ) returning * into v_attempt;
  exception when unique_violation then
    -- manual_report_generation_one_active_assessment_uidx allows one queued or generating claim
    -- per ASSESSMENT, so the claim that beat this one may belong to a different order on the same
    -- assessment. Resolve the conflicting attempt in that scope: looking it up by this order alone
    -- returned an empty attempt payload and hid which claim actually holds the identity.
    select * into v_active from public.manual_report_generation_attempts
      where assessment_id = v_assessment.id and status in ('REPORT_QUEUED','REPORT_GENERATING')
      order by created_at desc limit 1;
    if not found then
      select * into v_active from public.manual_report_generation_attempts
        where order_id = v_order.id and status in ('REPORT_QUEUED','REPORT_GENERATING')
        order by created_at desc limit 1;
    end if;
    return jsonb_build_object('claimed', false, 'reason', 'already_active', 'attempt', to_jsonb(v_active));
  end;

  insert into public.order_events (
    order_id,event_type,actor_admin_user_id,new_status,note,metadata_json
  ) values (
    v_order.id,'generation_requested',p_requested_by,v_order.status,
    'Manual report generation requested.',
    jsonb_build_object('attempt_id',v_attempt.id,'technical_reference',p_technical_reference,
      'retry_count',v_attempt.retry_count,'report_version',v_attempt.report_version)
  );
  if p_trigger_source = 'admin_retry' then
    insert into public.order_events(order_id,event_type,actor_admin_user_id,note,metadata_json)
    values(v_order.id,'retry_requested',p_requested_by,'Report-generation retry requested.',
      jsonb_build_object('attempt_id',v_attempt.id,'technical_reference',p_technical_reference,
        'retry_count',v_attempt.retry_count,'operation','generation'));
  end if;
  return jsonb_build_object('claimed', true, 'reason', 'created', 'attempt', to_jsonb(v_attempt),
    'report_type', v_report_type::text, 'report_reference',
    public.mk_report_reference(v_assessment.assessment_reference, v_report_type, v_version));
end;
$$;

-- ---------------------------------------------------------------------------
-- claim_payment_report_generation: verified-payment order-scoped claim.
-- ---------------------------------------------------------------------------
create or replace function public.claim_payment_report_generation(
  p_order_reference text, p_request_key text, p_technical_reference text
) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_order public.orders%rowtype;
  v_assessment public.assessments%rowtype;
  v_score public.score_runs%rowtype;
  v_payment public.payment_automation_records%rowtype;
  v_existing public.manual_report_generation_attempts%rowtype;
  v_active public.manual_report_generation_attempts%rowtype;
  v_ready public.reports%rowtype;
  v_attempt public.manual_report_generation_attempts%rowtype;
  v_product_code text;
  v_report_type public.report_type;
  v_version integer;
begin
  select * into v_existing from public.manual_report_generation_attempts where request_key = p_request_key;
  if found then
    if v_existing.status = 'REPORT_QUEUED' and v_existing.lease_owner is not null then
      return jsonb_build_object('claimed', true, 'reason', 'worker_lease_resumed', 'attempt', to_jsonb(v_existing));
    end if;
    return jsonb_build_object('claimed', false, 'reason', 'idempotent_replay', 'attempt', to_jsonb(v_existing));
  end if;
  select * into v_order from public.orders where order_reference = p_order_reference for update;
  if not found then raise exception 'phase1_order_not_found'; end if;
  select * into v_payment from public.payment_automation_records where order_id = v_order.id;
  if not found or v_payment.state <> 'PAID' or v_order.status::text <> 'payment_received' then raise exception 'phase1_order_not_eligible'; end if;
  -- Same assessment-level lock as the admin claim, for the same reason.
  select * into v_assessment from public.assessments where id = v_order.assessment_id for update;
  if not found or v_assessment.current_score_run_id is null or v_assessment.status not in ('scored', 'snapshot_available', 'report_requested', 'under_review', 'closed') then raise exception 'phase1_assessment_incomplete'; end if;
  select * into v_score from public.score_runs where id = v_assessment.current_score_run_id and status = 'completed';
  if not found or v_score.locked_at is null then raise exception 'phase1_assessment_incomplete'; end if;
  select p.product_code into v_product_code from public.products p where p.id = v_order.product_id;
  v_report_type := public.report_type_for_product_code(v_product_code);
  if v_report_type is null then raise exception 'phase1_order_product_not_eligible'; end if;
  select * into v_active from public.manual_report_generation_attempts
    where order_id = v_order.id and status in ('REPORT_QUEUED', 'REPORT_GENERATING') limit 1;
  if found then return jsonb_build_object('claimed', false, 'reason', 'already_active', 'attempt', to_jsonb(v_active)); end if;
  select * into v_ready from public.reports where order_id = v_order.id and storage_status = 'VERIFIED'
    and status not in ('superseded', 'voided') order by version_number desc limit 1;
  if found then return jsonb_build_object('claimed', false, 'reason', 'report_exists', 'report', to_jsonb(v_ready)); end if;
  select coalesce(max(version_number), 0) + 1 into v_version
    from public.reports
    where assessment_id = v_assessment.id and report_type = v_report_type;
  insert into public.manual_report_generation_attempts(
    request_key, order_id, report_version, trigger_source, requested_by, status, retry_count, technical_reference
  ) values (p_request_key, v_order.id, v_version, 'payment_confirmation', null, 'REPORT_QUEUED', 0, p_technical_reference)
  returning * into v_attempt;
  insert into public.order_events(order_id, event_type, note, metadata_json)
  values (v_order.id, 'generation_requested', 'Verified payment queued deterministic Phase 1 generation.',
    jsonb_build_object('attempt_id', v_attempt.id, 'source', 'payment_confirmation', 'technical_reference', p_technical_reference));
  return jsonb_build_object('claimed', true, 'reason', 'claimed', 'attempt', to_jsonb(v_attempt),
    'report_type', v_report_type::text, 'report_reference',
    public.mk_report_reference(v_assessment.assessment_reference, v_report_type, v_version));
end $$;

-- ---------------------------------------------------------------------------
-- complete_manual_report_generation: order-scoped finalisation.
-- ---------------------------------------------------------------------------
create or replace function public.complete_manual_report_generation(
  p_attempt_id uuid, p_template_id uuid, p_report_type public.report_type,
  p_storage_bucket text, p_storage_path text, p_file_name text, p_mime_type text,
  p_file_size_bytes bigint, p_checksum text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempt public.manual_report_generation_attempts%rowtype;
  v_order public.orders%rowtype;
  v_assessment public.assessments%rowtype;
  v_previous public.reports%rowtype;
  v_report public.reports%rowtype;
  v_reference text;
begin
  select * into v_attempt from public.manual_report_generation_attempts
    where id=p_attempt_id for update;
  if not found or v_attempt.status <> 'REPORT_GENERATING' then
    raise exception 'phase1_generation_attempt_not_active';
  end if;
  if coalesce(p_file_size_bytes,0) <= 0 or p_mime_type <> 'application/pdf'
     or p_checksum !~ '^[0-9a-f]{64}$'
     or coalesce(trim(p_storage_bucket),'') = '' or coalesce(trim(p_storage_path),'') = '' then
    raise exception 'phase1_report_integrity_invalid';
  end if;
  select * into v_order from public.orders where id=v_attempt.order_id;
  -- Lock the assessment for the whole finalisation, so the supersede + insert pair cannot
  -- interleave with a concurrent claim or finalisation on the same report identity.
  select * into v_assessment from public.assessments where id=v_order.assessment_id for update;
  if p_storage_bucket <> 'generated-reports'
     or position('/' || v_order.id::text || '/v' || v_attempt.report_version::text || '/' in p_storage_path) = 0
     or p_file_name not like '%.pdf' then
    raise exception 'phase1_report_storage_binding_invalid';
  end if;

  -- Authoritative previous-report scope: assessment + report type. Resolving by order_id alone
  -- missed a live report generated outside this order (order_id NULL, or a different order on the
  -- same assessment), so nothing was superseded and the insert collided on report_reference.
  select * into v_previous from public.reports
    where assessment_id = v_assessment.id
      and report_type = p_report_type
      and status not in ('superseded','voided')
    order by version_number desc limit 1 for update;

  v_reference := public.mk_report_reference(v_assessment.assessment_reference, p_report_type, v_attempt.report_version);

  -- Supersede the previous current report FIRST so the new insert never collides with
  -- reports_one_current_assessment_type_uidx, which allows one live row per
  -- (assessment_id, report_type) and is enforced immediately, not deferred. Supersede and insert
  -- are one transaction: if the insert fails, the previous report stays live.
  if v_previous.id is not null then
    update public.reports set status='superseded',updated_at=now() where id=v_previous.id;
  end if;

  insert into public.reports (
    assessment_id,organisation_id,order_id,score_run_id,template_id,report_type,status,
    report_reference,version_number,storage_bucket,storage_path,checksum,file_name,mime_type,
    file_size_bytes,storage_status,storage_verified_at,generated_by,generated_at,supersedes_report_id
  ) values (
    v_assessment.id,v_assessment.organisation_id,v_order.id,v_assessment.current_score_run_id,
    p_template_id,p_report_type,'generated',v_reference,v_attempt.report_version,p_storage_bucket,
    p_storage_path,p_checksum,p_file_name,p_mime_type,p_file_size_bytes,'VERIFIED',now(),
    v_attempt.requested_by,now(),v_previous.id
  ) returning * into v_report;

  update public.manual_report_generation_attempts
  set status='REPORT_READY',output_report_id=v_report.id,completed_at=now(),updated_at=now(),
      safe_operational_error=null,error_category=null
  where id=v_attempt.id;

  perform set_config('phase14.authoritative_transition', 'authenticated_rpc', true);

  insert into public.report_events(report_id,event_type,from_status,to_status,actor_user_id,note,metadata_json)
  values(v_report.id,case when v_previous.id is null then 'generated' else 'regenerated' end,
    'REPORT_GENERATING','REPORT_READY',v_attempt.requested_by,
    'Private report object stored and integrity verified.',
    jsonb_build_object('attempt_id',v_attempt.id,'technical_reference',v_attempt.technical_reference,
      'retry_count',v_attempt.retry_count,'storage_status','VERIFIED','file_size_bytes',p_file_size_bytes));
  insert into public.order_events(order_id,event_type,actor_admin_user_id,note,metadata_json)
  values
    (v_order.id,'report_stored',v_attempt.requested_by,'Private PDF stored and verified.',
      jsonb_build_object('attempt_id',v_attempt.id,'report_id',v_report.id,'storage_status','VERIFIED',
        'technical_reference',v_attempt.technical_reference,'report_version',v_attempt.report_version)),
    (v_order.id,'generation_succeeded',v_attempt.requested_by,'Report generation completed.',
      jsonb_build_object('attempt_id',v_attempt.id,'report_id',v_report.id,'technical_reference',v_attempt.technical_reference,
        'retry_count',v_attempt.retry_count,'report_version',v_attempt.report_version));
  return jsonb_build_object('attempt',to_jsonb(v_attempt),'report',to_jsonb(v_report),
    'superseded_report_id',v_previous.id);
end;
$$;

-- ---------------------------------------------------------------------------
-- finalise_manual_report_with_supporting_register: Comprehensive finalisation.
-- Same previous-report scope correction; every other check is unchanged.
-- ---------------------------------------------------------------------------
create or replace function public.finalise_manual_report_with_supporting_register(
  p_attempt_id uuid,
  p_template_id uuid,
  p_report_type public.report_type,
  p_storage_bucket text,
  p_storage_path text,
  p_file_name text,
  p_mime_type text,
  p_file_size_bytes bigint,
  p_checksum text,
  p_register_storage_path text,
  p_register_file_name text,
  p_register_mime_type text,
  p_register_file_size_bytes bigint,
  p_register_checksum text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempt public.manual_report_generation_attempts%rowtype;
  v_order public.orders%rowtype;
  v_assessment public.assessments%rowtype;
  v_previous public.reports%rowtype;
  v_report public.reports%rowtype;
  v_artifact public.report_artifacts%rowtype;
  v_reference text;
begin
  select * into v_attempt from public.manual_report_generation_attempts
    where id=p_attempt_id for update;
  if not found or v_attempt.status <> 'REPORT_GENERATING' then
    raise exception 'phase1_generation_attempt_not_active';
  end if;
  if coalesce(p_file_size_bytes,0) <= 0 or p_mime_type <> 'application/pdf'
     or p_checksum !~ '^[0-9a-f]{64}$'
     or coalesce(trim(p_storage_bucket),'') = '' or coalesce(trim(p_storage_path),'') = '' then
    raise exception 'phase1_report_integrity_invalid';
  end if;
  if coalesce(p_register_file_size_bytes,0) <= 0
     or p_register_mime_type <> 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
     or p_register_checksum !~ '^[0-9a-f]{64}$'
     or coalesce(trim(p_register_storage_path),'') = ''
     or coalesce(trim(p_register_file_name),'') = '' then
    raise exception 'phase1_supporting_register_integrity_invalid';
  end if;

  select * into v_order from public.orders where id=v_attempt.order_id;
  select * into v_assessment from public.assessments where id=v_order.assessment_id for update;
  if p_storage_bucket <> 'generated-reports'
     or position('/' || v_order.id::text || '/v' || v_attempt.report_version::text || '/' in p_storage_path) = 0
     or p_file_name not like '%.pdf' then
    raise exception 'phase1_report_storage_binding_invalid';
  end if;
  if position('/' || v_order.id::text || '/v' || v_attempt.report_version::text || '/' in p_register_storage_path) = 0
     or p_register_file_name not like '%.xlsx' then
    raise exception 'phase1_supporting_register_storage_binding_invalid';
  end if;

  select * into v_previous from public.reports
    where assessment_id = v_assessment.id
      and report_type = p_report_type
      and status not in ('superseded','voided')
    order by version_number desc limit 1 for update;
  v_reference := public.mk_report_reference(v_assessment.assessment_reference, p_report_type, v_attempt.report_version);

  if v_previous.id is not null then
    update public.reports set status='superseded',updated_at=now() where id=v_previous.id;
  end if;

  insert into public.reports (
    assessment_id,organisation_id,order_id,score_run_id,template_id,report_type,status,
    report_reference,version_number,storage_bucket,storage_path,checksum,file_name,mime_type,
    file_size_bytes,storage_status,storage_verified_at,generated_by,generated_at,supersedes_report_id
  ) values (
    v_assessment.id,v_assessment.organisation_id,v_order.id,v_assessment.current_score_run_id,
    p_template_id,p_report_type,'generated',v_reference,v_attempt.report_version,p_storage_bucket,
    p_storage_path,p_checksum,p_file_name,p_mime_type,p_file_size_bytes,'VERIFIED',now(),
    v_attempt.requested_by,now(),v_previous.id
  ) returning * into v_report;

  insert into public.report_artifacts (
    report_id,artefact_type,storage_bucket,storage_path,checksum_sha256,
    file_name,mime_type,file_size_bytes,storage_status,storage_verified_at
  ) values (
    v_report.id,'supporting_register',p_storage_bucket,p_register_storage_path,p_register_checksum,
    p_register_file_name,p_register_mime_type,p_register_file_size_bytes,'VERIFIED',now()
  ) returning * into v_artifact;
  update public.manual_report_generation_attempts
  set status='REPORT_READY',output_report_id=v_report.id,completed_at=now(),updated_at=now(),
      safe_operational_error=null,error_category=null
  where id=v_attempt.id;

  perform set_config('phase14.authoritative_transition', 'authenticated_rpc', true);

  insert into public.report_events(report_id,event_type,from_status,to_status,actor_user_id,note,metadata_json)
  values(v_report.id,case when v_previous.id is null then 'generated' else 'regenerated' end,
    'REPORT_GENERATING','REPORT_READY',v_attempt.requested_by,
    'Private report object stored and integrity verified.',
    jsonb_build_object('attempt_id',v_attempt.id,'technical_reference',v_attempt.technical_reference,
      'retry_count',v_attempt.retry_count,'storage_status','VERIFIED','file_size_bytes',p_file_size_bytes,
      'supporting_register_bytes',p_register_file_size_bytes));
  insert into public.order_events(order_id,event_type,actor_admin_user_id,note,metadata_json)
  values
    (v_order.id,'report_stored',v_attempt.requested_by,'Private PDF stored and verified.',
      jsonb_build_object('attempt_id',v_attempt.id,'report_id',v_report.id,'storage_status','VERIFIED',
        'technical_reference',v_attempt.technical_reference,'report_version',v_attempt.report_version)),
    (v_order.id,'generation_succeeded',v_attempt.requested_by,'Report generation completed.',
      jsonb_build_object('attempt_id',v_attempt.id,'report_id',v_report.id,'technical_reference',v_attempt.technical_reference,
        'retry_count',v_attempt.retry_count,'report_version',v_attempt.report_version));

  return jsonb_build_object('attempt',to_jsonb(v_attempt),'report',to_jsonb(v_report),
    'supporting_register',to_jsonb(v_artifact),'superseded_report_id',v_previous.id);
end;
$$;

-- Signatures are unchanged, so the existing grants still apply. They are restated because this
-- repository's service-role privilege contract asserts them explicitly.
revoke all on function public.report_type_for_product_code(text) from public, anon, authenticated;
grant execute on function public.report_type_for_product_code(text) to service_role;
revoke all on function public.mk_report_reference(text, public.report_type, integer) from public, anon, authenticated;
grant execute on function public.mk_report_reference(text, public.report_type, integer) to service_role;
revoke all on function public.claim_manual_report_generation(text,uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.claim_manual_report_generation(text,uuid,text,text,text) to service_role;
revoke all on function public.claim_payment_report_generation(text,text,text) from public, anon, authenticated;
grant execute on function public.claim_payment_report_generation(text,text,text) to service_role;
revoke all on function public.complete_manual_report_generation(uuid,uuid,public.report_type,text,text,text,text,bigint,text) from public, anon, authenticated;
grant execute on function public.complete_manual_report_generation(uuid,uuid,public.report_type,text,text,text,text,bigint,text) to service_role;
revoke all on function public.finalise_manual_report_with_supporting_register(
  uuid,uuid,public.report_type,text,text,text,text,bigint,text,text,text,text,bigint,text
) from public, anon, authenticated;
grant execute on function public.finalise_manual_report_with_supporting_register(
  uuid,uuid,public.report_type,text,text,text,text,bigint,text,text,text,text,bigint,text
) to service_role;

commit;
