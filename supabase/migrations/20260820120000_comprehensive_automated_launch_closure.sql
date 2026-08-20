-- Comprehensive launch closure.
--
-- The reviewed-engagement tables and RPCs remain available for legacy/Advisory compatibility, but
-- this migration makes the active Comprehensive path orderable and fulfilable without them:
--
--   order -> verified payment -> automated PDF + supporting-register package -> release -> delivery
--
-- The package is bound to one order, report and exact report version. No customer-facing path reads
-- a reviewer, evidence or sign-off state.

begin;

-- The active product is the automated analytical product described by the frozen catalogue.
update public.products
set delivery_mode = 'mk_controlled_pdf',
    updated_at = now()
where product_code = 'mk_validated_assessment';

-- Both self-service paid products are entitled through the immutable order price-version snapshot.
-- This replaces the historical Essential-only predicate without weakening payment, relationship,
-- current-version, private-storage or recipient checks.
create or replace function public.phase14_delivery_entitlement(
  p_report_id uuid,
  p_recipient text,
  p_allow_test_override boolean default false,
  p_purpose text default 'email_delivery'::text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.reports%rowtype;
  v_order public.orders%rowtype;
  v_product public.products%rowtype;
  v_assessment public.assessments%rowtype;
  v_score_run public.score_runs%rowtype;
  v_customer_email text;
  v_current_report_id uuid;
  v_object record;
begin
  select * into v_report from public.reports where id = p_report_id for share;
  if not found then raise exception 'report_not_found'; end if;
  select * into v_order from public.orders where id = v_report.order_id for share;
  if not found then raise exception 'report_order_missing'; end if;
  select * into v_product from public.products where id = v_order.product_id for share;
  if not found then raise exception 'delivery_product_missing'; end if;
  select * into v_assessment from public.assessments where id = v_report.assessment_id for share;
  select * into v_score_run from public.score_runs where id = v_report.score_run_id for share;
  select id into v_current_report_id from public.reports
  where assessment_id = v_report.assessment_id
    and report_type = v_report.report_type
    and status not in ('superseded', 'voided', 'draft')
  order by version_number desc limit 1;

  if v_report.report_type = 'essential_self_assessment'
     and v_product.product_code = 'essential_self_assessment' then
    null;
  elsif v_report.report_type = 'mk_validated'
        and v_product.product_code = 'mk_validated_assessment' then
    null;
  else
    raise exception 'delivery_report_type_ineligible';
  end if;
  if not public.order_price_version_entitled(v_order.id) then raise exception 'delivery_price_mismatch'; end if;
  if v_order.currency <> 'ZAR' or v_product.currency <> 'ZAR' then raise exception 'delivery_currency_mismatch'; end if;
  if v_order.status::text <> 'payment_received' then raise exception 'delivery_order_not_paid'; end if;
  if v_order.verified_at is null or v_order.verified_by is null then raise exception 'delivery_manual_verification_missing'; end if;
  if not v_product.active or not v_product.requires_payment_verification or v_product.delivery_mode <> 'mk_controlled_pdf' then raise exception 'delivery_product_policy_mismatch'; end if;
  if v_report.assessment_id <> v_order.assessment_id
     or v_score_run.assessment_id <> v_assessment.id then raise exception 'delivery_relationship_mismatch'; end if;
  if v_assessment.current_score_run_id <> v_score_run.id then raise exception 'delivery_stale_score_run'; end if;
  if v_score_run.status::text <> 'completed'
     or v_score_run.locked_at is null
     or v_score_run.input_hash !~ '^[0-9a-f]{64}$' then raise exception 'delivery_score_run_ineligible'; end if;
  if v_current_report_id is distinct from v_report.id
     or v_report.status in ('draft', 'superseded', 'voided') then raise exception 'delivery_report_not_current'; end if;
  if p_purpose = 'email_delivery' and v_report.status not in ('generated', 'approved', 'released') then raise exception 'delivery_report_status_forbidden'; end if;
  if p_purpose = 'admin_download' and v_report.status not in ('generated', 'under_review', 'approved', 'released') then raise exception 'download_report_status_forbidden'; end if;
  if coalesce(v_report.storage_bucket, '') = ''
     or coalesce(v_report.storage_path, '') = ''
     or v_report.checksum !~ '^[0-9a-f]{64}$' then raise exception 'delivery_storage_metadata_invalid'; end if;
  select bucket_id, name, metadata, user_metadata into v_object from storage.objects
  where bucket_id = v_report.storage_bucket and name = v_report.storage_path;
  if not found then raise exception 'report_storage_object_missing'; end if;
  if coalesce(v_object.metadata->>'mimetype', '') <> 'application/pdf'
     or coalesce(v_object.user_metadata->>'sha256', v_object.metadata->>'sha256', v_object.metadata->'metadata'->>'sha256', '') <> v_report.checksum then raise exception 'report_storage_metadata_mismatch'; end if;
  v_customer_email := lower(trim(v_order.customer_email::text));
  if not p_allow_test_override and lower(trim(p_recipient)) is distinct from v_customer_email then raise exception 'delivery_recipient_override_forbidden'; end if;
  return jsonb_build_object(
    'report_id', v_report.id,
    'report_reference', v_report.report_reference,
    'report_status', v_report.status,
    'report_checksum', v_report.checksum,
    'storage_bucket', v_report.storage_bucket,
    'storage_path', v_report.storage_path,
    'order_id', v_order.id,
    'assessment_id', v_assessment.id,
    'score_run_id', v_score_run.id,
    'product_code', v_product.product_code,
    'customer_email', v_customer_email,
    'recipient', lower(trim(p_recipient)),
    'test_delivery', lower(trim(p_recipient)) is distinct from v_customer_email
  );
end;
$$;

revoke all on function public.phase14_delivery_entitlement(uuid, text, boolean, text) from public, anon, authenticated;
grant execute on function public.phase14_delivery_entitlement(uuid, text, boolean, text) to service_role;

-- Order creation remains one atomic product/price/order transaction. Comprehensive no longer creates
-- or reads a reviewed-engagement row; the assessment lock serialises duplicate tier requests.
create or replace function public.create_paid_order(
  p_tier text,
  p_assessment_id uuid,
  p_expected_product_code text,
  p_expected_amount_cents int,
  p_expected_currency text,
  p_report_request_id uuid default null,
  p_customer_email text default null,
  p_customer_name text default null,
  p_organisation_name text default null,
  p_product_name text default null,
  p_eft_instructions_snapshot jsonb default '{}'::jsonb,
  p_requested_by_respondent_id uuid default null,
  p_assessment_reference text default null
)
returns jsonb
language plpgsql
volatile
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := now();
  v_assessment public.assessments%rowtype;
  v_product public.products%rowtype;
  v_version public.product_price_versions%rowtype;
  v_open_versions int;
  v_existing_order public.orders%rowtype;
  v_order public.orders%rowtype;
  v_reference text;
  v_attempt int := 0;
begin
  if p_tier not in ('essential', 'comprehensive') then
    raise exception 'paid_order_tier_not_self_service: %', p_tier using errcode = 'check_violation';
  end if;

  select * into v_assessment from public.assessments where id = p_assessment_id for update;
  if not found then raise exception 'paid_order_assessment_not_found' using errcode = 'foreign_key_violation'; end if;

  select * into v_product from public.products where product_code = p_expected_product_code;
  if not found then raise exception 'paid_order_product_not_found: %', p_expected_product_code using errcode = 'foreign_key_violation'; end if;
  if not v_product.active then raise exception 'paid_order_product_inactive: %', p_expected_product_code using errcode = 'check_violation'; end if;

  select count(*) into v_open_versions
  from public.product_price_versions
  where product_id = v_product.id and effective_to is null;
  if v_open_versions <> 1 then
    raise exception 'paid_order_open_price_version_invalid: % open version(s) for %', v_open_versions, p_expected_product_code using errcode = 'check_violation';
  end if;
  select * into v_version
  from public.product_price_versions
  where product_id = v_product.id and effective_to is null;
  if not (v_now >= v_version.effective_from and (v_version.effective_to is null or v_now < v_version.effective_to)) then
    raise exception 'paid_order_price_version_not_effective' using errcode = 'check_violation';
  end if;
  if v_version.price_cents is distinct from p_expected_amount_cents
     or upper(v_version.currency) is distinct from upper(p_expected_currency)
     or v_product.product_code is distinct from p_expected_product_code then
    raise exception 'paid_order_catalogue_contract_mismatch: caller expected % %, database has % %', p_expected_amount_cents, upper(coalesce(p_expected_currency, '')), v_version.price_cents, v_version.currency using errcode = 'check_violation';
  end if;

  if p_tier = 'comprehensive' then
    select o.* into v_existing_order
    from public.orders o
    join public.products existing_product on existing_product.id = o.product_id
    where o.assessment_id = p_assessment_id
      and existing_product.product_code = 'mk_validated_assessment'
      and o.status::text <> 'cancelled';
    if found then
      return jsonb_build_object(
        'created', false, 'tier', p_tier, 'order_id', v_existing_order.id,
        'order_reference', v_existing_order.order_reference, 'product_code', p_expected_product_code,
        'product_name', v_existing_order.product_name, 'amount_cents', v_existing_order.amount_cents,
        'currency', v_existing_order.currency, 'status', v_existing_order.status::text,
        'product_price_version_id', v_existing_order.product_price_version_id,
        'engagement_id', null, 'engagement_state', null
      );
    end if;
  end if;

  if p_tier = 'essential' and p_report_request_id is not null then
    select * into v_existing_order
    from public.orders
    where assessment_id = p_assessment_id and report_request_id = p_report_request_id;
    if found then
      return jsonb_build_object(
        'created', false, 'tier', p_tier, 'order_id', v_existing_order.id,
        'order_reference', v_existing_order.order_reference, 'product_code', p_expected_product_code,
        'product_name', v_existing_order.product_name, 'amount_cents', v_existing_order.amount_cents,
        'currency', v_existing_order.currency, 'status', v_existing_order.status::text,
        'product_price_version_id', v_existing_order.product_price_version_id,
        'engagement_id', null, 'engagement_state', null
      );
    end if;
  end if;

  loop
    v_attempt := v_attempt + 1;
    v_reference := 'MKORD-' || to_char(v_now, 'YYYY') || '-' || upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 8));
    begin
      insert into public.orders (
        order_reference, assessment_id, report_request_id, product_id, product_name,
        product_price_version_id, amount_cents, currency, status,
        requested_by_respondent_id, customer_email, customer_name, organisation_name,
        eft_instructions_snapshot, created_at
      ) values (
        v_reference, p_assessment_id, p_report_request_id, v_product.id,
        coalesce(p_product_name, v_product.name), v_version.id, v_version.price_cents,
        v_version.currency, 'awaiting_payment', p_requested_by_respondent_id,
        p_customer_email::public.citext, p_customer_name, p_organisation_name,
        coalesce(p_eft_instructions_snapshot, '{}'::jsonb), v_now
      ) returning * into v_order;
      exit;
    exception when unique_violation then
      if v_attempt >= 5 then raise exception 'paid_order_reference_allocation_failed' using errcode = 'check_violation'; end if;
    end;
  end loop;

  if not public.order_price_version_entitled(v_order.id) then
    raise exception 'paid_order_price_entitlement_inconsistent' using errcode = 'check_violation';
  end if;

  insert into public.order_events (order_id, event_type, new_status, metadata_json)
  values (
    v_order.id, 'order_created_from_report_request', v_order.status,
    jsonb_build_object(
      'actor_type', 'respondent_token',
      'assessment_reference', coalesce(p_assessment_reference, v_assessment.assessment_reference),
      'tier', p_tier, 'product_code', p_expected_product_code,
      'product_price_version_id', v_version.id, 'atomic_rpc', true,
      'payment_gateway', false, 'proof_upload', false, 'report_unlock', false,
      'automated_fulfilment', p_tier = 'comprehensive'
    )
  );
  insert into public.audit_logs (actor_type, assessment_id, entity_table, entity_id, action, after_json)
  values (
    'respondent_token', p_assessment_id, 'orders', v_order.id, 'paid_order_created',
    jsonb_build_object(
      'order_reference', v_order.order_reference, 'tier', p_tier,
      'product_code', p_expected_product_code, 'amount_cents', v_order.amount_cents,
      'currency', v_order.currency, 'product_price_version_id', v_version.id,
      'status', v_order.status, 'reviewed_engagement_created', false
    )
  );
  return jsonb_build_object(
    'created', true, 'tier', p_tier, 'order_id', v_order.id,
    'order_reference', v_order.order_reference, 'product_code', p_expected_product_code,
    'product_name', v_order.product_name, 'amount_cents', v_order.amount_cents,
    'currency', v_order.currency, 'status', v_order.status::text,
    'product_price_version_id', v_order.product_price_version_id,
    'engagement_id', null, 'engagement_state', null
  );
end;
$$;

comment on function public.create_paid_order(text, uuid, text, int, text, uuid, text, text, text, text, jsonb, uuid, text) is
  'Atomic self-service paid-order creation for Essential or the automated Comprehensive product. The order is bound to the versioned price contract; active Comprehensive fulfilment has no reviewed-engagement dependency.';
revoke all on function public.create_paid_order(text, uuid, text, int, text, uuid, text, text, text, text, jsonb, uuid, text) from public, anon, authenticated;
grant execute on function public.create_paid_order(text, uuid, text, int, text, uuid, text, text, text, text, jsonb, uuid, text) to service_role;

-- Comprehensive's atomic finalisation is deliberately a separate RPC. Essential keeps the accepted
-- generic finaliser; this one stamps the exact report version and the automated validation envelope,
-- and inserts the one active supporting register with a null legacy engagement binding.
create or replace function public.finalise_comprehensive_automated_report_with_supporting_register(
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
  v_product public.products%rowtype;
  v_assessment public.assessments%rowtype;
  v_previous public.reports%rowtype;
  v_report public.reports%rowtype;
  v_artifact public.report_artifacts%rowtype;
  v_reference text;
begin
  select * into v_attempt from public.manual_report_generation_attempts where id = p_attempt_id for update;
  if not found or v_attempt.status <> 'REPORT_GENERATING' then raise exception 'phase1_generation_attempt_not_active'; end if;
  if p_report_type <> 'mk_validated' then raise exception 'comprehensive_report_type_required'; end if;
  if coalesce(p_file_size_bytes, 0) <= 0 or p_mime_type <> 'application/pdf'
     or p_checksum !~ '^[0-9a-f]{64}$' or coalesce(trim(p_storage_bucket), '') = ''
     or coalesce(trim(p_storage_path), '') = '' then raise exception 'phase1_report_integrity_invalid'; end if;
  if coalesce(p_register_file_size_bytes, 0) <= 0
     or p_register_mime_type <> 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
     or p_register_checksum !~ '^[0-9a-f]{64}$'
     or coalesce(trim(p_register_storage_path), '') = ''
     or coalesce(trim(p_register_file_name), '') = ''
     or p_register_file_name !~* 'comprehensive'
     or p_register_file_name !~* '\.xlsx$' then raise exception 'comprehensive_supporting_register_integrity_invalid'; end if;

  select * into v_order from public.orders where id = v_attempt.order_id;
  select * into v_product from public.products where id = v_order.product_id;
  if v_product.product_code <> 'mk_validated_assessment' then raise exception 'comprehensive_order_product_mismatch'; end if;
  select * into v_assessment from public.assessments where id = v_order.assessment_id;
  if p_storage_bucket <> 'generated-reports'
     or position('/' || v_order.id::text || '/v' || v_attempt.report_version::text || '/' in p_storage_path) = 0
     or p_file_name !~* '\.pdf$' then raise exception 'phase1_report_storage_binding_invalid'; end if;
  if position('/' || v_order.id::text || '/v' || v_attempt.report_version::text || '/' in p_register_storage_path) = 0 then
    raise exception 'comprehensive_supporting_register_storage_binding_invalid';
  end if;

  select * into v_previous from public.reports where order_id = v_order.id
    and status not in ('superseded', 'voided') order by version_number desc limit 1 for update;
  v_reference := 'RPT-' || v_assessment.assessment_reference || '-V' || v_attempt.report_version;
  if v_previous.id is not null then update public.reports set status = 'superseded', updated_at = now() where id = v_previous.id; end if;

  insert into public.reports (
    assessment_id, organisation_id, order_id, score_run_id, template_id, report_type, status,
    report_reference, version_number, storage_bucket, storage_path, checksum, file_name, mime_type,
    file_size_bytes, storage_status, storage_verified_at, generated_by, generated_at, supersedes_report_id
  ) values (
    v_assessment.id, v_assessment.organisation_id, v_order.id, v_assessment.current_score_run_id,
    p_template_id, p_report_type, 'generated', v_reference, v_attempt.report_version,
    p_storage_bucket, p_storage_path, p_checksum, p_file_name, p_mime_type, p_file_size_bytes,
    'VERIFIED', now(), v_attempt.requested_by, now(), v_previous.id
  ) returning * into v_report;

  perform set_config('phase14.authoritative_transition', 'authenticated_rpc', true);
  insert into public.report_artifacts (
    report_id, engagement_id, artefact_type, storage_bucket, storage_path, checksum_sha256,
    file_name, mime_type, file_size_bytes, storage_status, storage_verified_at, artifact_version, release_state
  ) values (
    v_report.id, null, 'supporting_register', p_storage_bucket, p_register_storage_path,
    p_register_checksum, p_register_file_name, p_register_mime_type, p_register_file_size_bytes,
    'VERIFIED', now(), v_attempt.report_version, 'verified'
  ) returning * into v_artifact;

  update public.manual_report_generation_attempts
  set status = 'REPORT_READY', output_report_id = v_report.id, completed_at = now(), updated_at = now(),
      safe_operational_error = null, error_category = null,
      evidence_checksum = p_checksum,
      final_validation_json = jsonb_build_object(
        'validation_mode', 'automated_comprehensive',
        'contract_version', 'comprehensive-product-v1.1',
        'report_checksum', p_checksum,
        'supporting_register_checksum', p_register_checksum,
        'artifact_version', v_attempt.report_version,
        'review_required', false,
        'independent_validation_performed', false,
        'operating_effectiveness_tested', false,
        'assurance_opinion_provided', false
      )
  where id = v_attempt.id returning * into v_attempt;

  insert into public.report_events(report_id, event_type, from_status, to_status, actor_user_id, note, metadata_json)
  values (
    v_report.id, case when v_previous.id is null then 'generated' else 'regenerated' end,
    'REPORT_GENERATING', 'REPORT_READY', v_attempt.requested_by,
    'Automated Comprehensive PDF and supporting register stored and integrity verified.',
    jsonb_build_object(
      'attempt_id', v_attempt.id, 'technical_reference', v_attempt.technical_reference,
      'retry_count', v_attempt.retry_count, 'storage_status', 'VERIFIED',
      'file_size_bytes', p_file_size_bytes, 'supporting_register_bytes', p_register_file_size_bytes,
      'artifact_version', v_attempt.report_version, 'review_required', false
    )
  );
  insert into public.order_events(order_id, event_type, actor_admin_user_id, note, metadata_json)
  values
    (v_order.id, 'report_stored', v_attempt.requested_by, 'Automated Comprehensive PDF stored and verified.',
      jsonb_build_object('attempt_id', v_attempt.id, 'report_id', v_report.id, 'storage_status', 'VERIFIED', 'report_version', v_attempt.report_version)),
    (v_order.id, 'generation_succeeded', v_attempt.requested_by, 'Automated Comprehensive package completed.',
      jsonb_build_object('attempt_id', v_attempt.id, 'report_id', v_report.id, 'supporting_register_id', v_artifact.id, 'report_version', v_attempt.report_version));

  return jsonb_build_object('attempt', to_jsonb(v_attempt), 'report', to_jsonb(v_report), 'supporting_register', to_jsonb(v_artifact), 'superseded_report_id', v_previous.id);
end;
$$;

revoke all on function public.finalise_comprehensive_automated_report_with_supporting_register(
  uuid, uuid, public.report_type, text, text, text, text, bigint, text, text, text, text, bigint, text
) from public, anon, authenticated;
grant execute on function public.finalise_comprehensive_automated_report_with_supporting_register(
  uuid, uuid, public.report_type, text, text, text, text, bigint, text, text, text, text, bigint, text
) to service_role;

-- The existing quality gate and delivery implementation are preserved. This narrow wrapper adds the
-- active Comprehensive package invariant and releases its null-legacy-binding register atomically
-- after the existing payment, score, PDF, recipient and delivery-entitlement checks pass.
alter function public.automatic_release_completed_fulfilment(uuid, uuid, text)
  rename to automatic_release_completed_fulfilment_quality_gate_impl;

create function public.automatic_release_completed_fulfilment(
  p_attempt_id uuid,
  p_report_id uuid,
  p_lease_owner text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_attempt public.manual_report_generation_attempts%rowtype;
  v_report public.reports%rowtype;
  v_order public.orders%rowtype;
  v_product public.products%rowtype;
  v_package_count integer;
  v_result jsonb;
  v_updated integer;
begin
  perform public.rc1_require_operation_open('quality_review');
  select * into v_attempt from public.manual_report_generation_attempts where id = p_attempt_id for share;
  if not found then raise exception 'fulfilment_job_not_found'; end if;
  select * into v_report from public.reports where id = p_report_id for share;
  select * into v_order from public.orders where id = v_attempt.order_id for share;
  select * into v_product from public.products where id = v_order.product_id for share;

  if v_product.product_code = 'mk_validated_assessment' then
    if v_report.report_type <> 'mk_validated' or v_report.version_number <> v_attempt.report_version then
      perform pg_catalog.set_config('phase14.authoritative_transition', 'worker_rpc', true);
      return public.record_automatic_fulfilment_exception(v_attempt.id, null, 'automatic_quality_release', 'comprehensive_package_incomplete', coalesce(v_attempt.technical_reference, v_attempt.id::text), 'Reconcile the exact Comprehensive PDF/package version before release.') || pg_catalog.jsonb_build_object('released', false, 'delivery_authorization_id', null);
    end if;
    select count(*) into v_package_count
    from public.report_artifacts
    where report_id = p_report_id
      and engagement_id is null
      and artefact_type = 'supporting_register'
      and artifact_version = v_report.version_number
      and storage_status = 'VERIFIED'
      and release_state in ('verified', 'released');
    if v_package_count <> 1 then
      perform pg_catalog.set_config('phase14.authoritative_transition', 'worker_rpc', true);
      return public.record_automatic_fulfilment_exception(v_attempt.id, null, 'automatic_quality_release', 'comprehensive_package_incomplete', coalesce(v_attempt.technical_reference, v_attempt.id::text), 'Reconcile the exact Comprehensive PDF and supporting register before release.') || pg_catalog.jsonb_build_object('released', false, 'delivery_authorization_id', null);
    end if;
  end if;

  v_result := public.automatic_release_completed_fulfilment_quality_gate_impl(p_attempt_id, p_report_id, p_lease_owner);
  if coalesce((v_result->>'released')::boolean, false) and v_product.product_code = 'mk_validated_assessment' then
    perform pg_catalog.set_config('phase14.authoritative_transition', 'worker_rpc', true);
    update public.report_artifacts
    set release_state = 'released', released_by = null, released_at = coalesce(released_at, pg_catalog.now()), updated_at = pg_catalog.now()
    where report_id = p_report_id
      and engagement_id is null
      and artefact_type = 'supporting_register'
      and artifact_version = v_report.version_number
      and storage_status = 'VERIFIED'
      and release_state in ('verified', 'released');
    get diagnostics v_updated = row_count;
    if v_updated <> 1 then raise exception 'comprehensive_package_release_binding_failed'; end if;
  end if;
  return v_result;
end;
$$;

revoke all on function public.automatic_release_completed_fulfilment(uuid, uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.automatic_release_completed_fulfilment(uuid, uuid, text) to service_role;

-- Replay-safe structural assertions for the active boundaries.
do $$
declare
  v_definition text;
begin
  select pg_catalog.pg_get_functiondef(p.oid) into v_definition
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'create_paid_order';
  if v_definition is null or v_definition ~* 'comprehensive_engagements' then
    raise exception 'comprehensive_active_order_still_depends_on_reviewed_engagement';
  end if;
  if not exists (select 1 from public.products where product_code = 'mk_validated_assessment' and price_cents = 3500000 and delivery_mode = 'mk_controlled_pdf' and active) then
    raise exception 'comprehensive_database_catalogue_contract_missing';
  end if;
end $$;

commit;
