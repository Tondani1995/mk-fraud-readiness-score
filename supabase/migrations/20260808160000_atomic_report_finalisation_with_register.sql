-- Atomic finalisation of a paid Essential report together with its required supporting register.
--
-- The defect this closes (P1-B): the manual generation path uploaded and verified the PDF, called
-- complete_manual_report_generation() -- which made the report VERIFIED, current and linked to the
-- order -- and only then generated and persisted the supporting register. If the register failed,
-- the outer catch in phase1-manual-fulfilment.ts deleted the uploaded PDF
-- (db.storage.remove([storagePath])), leaving authoritative database state pointing at an object
-- that no longer exists, and a current report with no register.
--
-- The correction does not need a new externally visible report status. A plpgsql function body is a
-- single transaction, so the report row and its dependent report_artifacts row can be inserted
-- sequentially inside one atomic unit: the FK is satisfied because the report row exists within the
-- transaction, and neither row is observable unless the whole transaction commits. If the artefact
-- insert raises, the report insert, the supersede and the attempt finalisation all roll back
-- together and the previous version simply remains current.
--
-- Caller contract: BOTH physical artefacts must already be uploaded and independently verified
-- (checksum, size, and %PDF magic for the PDF) before this is called. This function is the
-- authoritative finalisation boundary -- before it commits, nothing is customer-final and the
-- uploaded objects are safe orphans that generation-failure cleanup may remove; after it commits,
-- generation-failure cleanup must never delete either object.
--
-- Additive: complete_manual_report_generation() is left exactly as accepted and is not redefined,
-- so every existing caller and its contract are unchanged. All validation, binding, versioning,
-- supersede, event and privilege behaviour here is reproduced from that accepted function; the only
-- additions are the register parameter validation and the report_artifacts insert.

begin;

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
  -- The register is held to the same evidence standard as the PDF, on its own MIME type.
  if coalesce(p_register_file_size_bytes,0) <= 0
     or p_register_mime_type <> 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
     or p_register_checksum !~ '^[0-9a-f]{64}$'
     or coalesce(trim(p_register_storage_path),'') = ''
     or coalesce(trim(p_register_file_name),'') = '' then
    raise exception 'phase1_supporting_register_integrity_invalid';
  end if;

  select * into v_order from public.orders where id=v_attempt.order_id;
  select * into v_assessment from public.assessments where id=v_order.assessment_id;
  if p_storage_bucket <> 'generated-reports'
     or position('/' || v_order.id::text || '/v' || v_attempt.report_version::text || '/' in p_storage_path) = 0
     or p_file_name not like '%.pdf' then
    raise exception 'phase1_report_storage_binding_invalid';
  end if;
  -- The register must live under the same order/version prefix as the PDF it belongs to.
  if position('/' || v_order.id::text || '/v' || v_attempt.report_version::text || '/' in p_register_storage_path) = 0
     or p_register_file_name not like '%.xlsx' then
    raise exception 'phase1_supporting_register_storage_binding_invalid';
  end if;

  select * into v_previous from public.reports where order_id=v_order.id
    and status not in ('superseded','voided') order by version_number desc limit 1 for update;
  v_reference := 'RPT-' || v_assessment.assessment_reference || '-V' || v_attempt.report_version;

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

  -- Same transaction: the FK resolves against the row just inserted, and if this raises the report
  -- insert above rolls back with it. This is the whole point of the correction.
  insert into public.report_artifacts (
    report_id,artefact_type,storage_bucket,storage_path,checksum_sha256,
    file_name,mime_type,file_size_bytes,storage_status,storage_verified_at
  ) values (
    v_report.id,'supporting_register',p_storage_bucket,p_register_storage_path,p_register_checksum,
    p_register_file_name,p_register_mime_type,p_register_file_size_bytes,'VERIFIED',now()
  ) returning * into v_artifact;

  -- Only once BOTH rows exist does the previous version stop being current.
  if v_previous.id is not null then
    update public.reports set status='superseded',updated_at=now() where id=v_previous.id;
  end if;
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

revoke all on function public.finalise_manual_report_with_supporting_register(
  uuid,uuid,public.report_type,text,text,text,text,bigint,text,text,text,text,bigint,text
) from public, anon, authenticated;
grant execute on function public.finalise_manual_report_with_supporting_register(
  uuid,uuid,public.report_type,text,text,text,text,bigint,text,text,text,text,bigint,text
) to service_role;

commit;
