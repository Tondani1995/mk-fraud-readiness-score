-- Correct the recovery seam so it enters the existing automatic quality release rather than
-- pre-empting it. 20260904030000 is not edited; only the seam is redefined forward.

create or replace function public.create_comprehensive_recovery_revision(
  p_source_report_id uuid,
  p_source_checksum text,
  p_storage_path text,
  p_file_name text,
  p_file_size_bytes bigint,
  p_checksum text,
  p_register_storage_path text,
  p_register_file_name text,
  p_register_file_size_bytes bigint,
  p_register_checksum text,
  p_recovery_method text,
  p_authorised_copy_change jsonb,
  p_lease_owner text default 'comprehensive-recovery-revision',
  p_lease_seconds integer default 300
) returns jsonb
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_source public.reports%rowtype;
  v_order public.orders%rowtype;
  v_product public.products%rowtype;
  v_assessment public.assessments%rowtype;
  v_source_register public.report_artifacts%rowtype;
  v_report public.reports%rowtype;
  v_artifact public.report_artifacts%rowtype;
  v_attempt public.manual_report_generation_attempts%rowtype;
  v_version integer;
  v_reference text;
  v_technical_reference text := pg_catalog.gen_random_uuid()::text;
  v_validation jsonb;
  v_release jsonb;
  v_lease_owner text := coalesce(pg_catalog.btrim(p_lease_owner), '');
begin
  perform public.rc1_require_operation_open('worker');
  if v_lease_owner = '' then raise exception 'comprehensive_recovery_lease_owner_required'; end if;
  if p_lease_seconds is null or p_lease_seconds < 30 or p_lease_seconds > 3600 then
    raise exception 'comprehensive_recovery_lease_seconds_out_of_range';
  end if;

  select * into v_source from public.reports where id = p_source_report_id for update;
  if not found then raise exception 'comprehensive_recovery_source_missing'; end if;
  if v_source.status <> 'released'
     or v_source.storage_status <> 'VERIFIED'
     or v_source.checksum is distinct from p_source_checksum then
    raise exception 'comprehensive_recovery_source_not_released_as_certified';
  end if;

  select * into v_order from public.orders where id = v_source.order_id for share;
  select * into v_product from public.products where id = v_order.product_id for share;
  if v_product.product_code is distinct from 'mk_validated_assessment' then
    raise exception 'comprehensive_recovery_product_not_comprehensive';
  end if;
  select * into v_assessment from public.assessments where id = v_source.assessment_id for share;

  select * into v_source_register from public.report_artifacts
  where report_id = v_source.id
    and artefact_type = 'supporting_register'
    and engagement_id is null
    and storage_status = 'VERIFIED'
  order by artifact_version desc limit 1;
  if not found then raise exception 'comprehensive_recovery_source_register_missing'; end if;

  if coalesce(p_file_size_bytes, 0) <= 0
     or p_checksum !~ '^[0-9a-f]{64}$'
     or p_checksum = p_source_checksum
     or coalesce(pg_catalog.btrim(p_storage_path), '') = ''
     or p_file_name not like '%.pdf'
     or coalesce(p_register_file_size_bytes, 0) <= 0
     or p_register_checksum !~ '^[0-9a-f]{64}$'
     or coalesce(pg_catalog.btrim(p_register_storage_path), '') = ''
     or p_register_file_name not like '%.xlsx'
     or coalesce(pg_catalog.btrim(p_recovery_method), '') = ''
     or p_authorised_copy_change is null then
    raise exception 'comprehensive_recovery_input_invalid';
  end if;

  if p_register_checksum is distinct from v_source_register.checksum_sha256
     or p_register_file_size_bytes is distinct from v_source_register.file_size_bytes then
    raise exception 'comprehensive_recovery_register_bytes_changed';
  end if;

  v_version := v_source.version_number + 1;
  v_reference := 'RPT-' || v_assessment.assessment_reference || '-V' || v_version;
  if position('/' || v_order.id::text || '/v' || v_version::text || '/' in p_storage_path) = 0
     or position('/' || v_order.id::text || '/v' || v_version::text || '/' in p_register_storage_path) = 0 then
    raise exception 'comprehensive_recovery_storage_binding_invalid';
  end if;
  if exists (select 1 from public.reports where report_reference = v_reference) then
    raise exception 'comprehensive_recovery_revision_already_exists';
  end if;

  v_validation := pg_catalog.jsonb_build_object(
    'validation_mode', 'legacy_pdf_native_recovery_revision',
    'contract_version', 'comprehensive-product-v1.1',
    'recovery_method', p_recovery_method,
    'source_report_id', v_source.id,
    'source_report_reference', v_source.report_reference,
    'source_report_checksum', p_source_checksum,
    'report_checksum', p_checksum,
    'supporting_register_checksum', p_register_checksum,
    'supporting_register_bytes_reused_unchanged', true,
    'artifact_version', v_version,
    'authorised_copy_change', p_authorised_copy_change,
    'provider_generation_reused', true,
    'provider_calls', 0,
    'canonical_manuscript_recovered', false,
    'review_required', false,
    'independent_validation_performed', false,
    'operating_effectiveness_tested', false,
    'assurance_opinion_provided', false
  );

  update public.reports set status = 'superseded', updated_at = pg_catalog.now()
  where id = v_source.id;

  insert into public.reports (
    assessment_id, organisation_id, order_id, score_run_id, template_id, report_type, status,
    report_reference, version_number, storage_bucket, storage_path, checksum, file_name, mime_type,
    file_size_bytes, storage_status, storage_verified_at, generated_by, generated_at,
    supersedes_report_id
  ) values (
    v_source.assessment_id, v_source.organisation_id, v_source.order_id, v_source.score_run_id,
    v_source.template_id, v_source.report_type, 'generated',
    v_reference, v_version, v_source.storage_bucket, p_storage_path, p_checksum, p_file_name,
    'application/pdf', p_file_size_bytes, 'VERIFIED', pg_catalog.now(), v_source.generated_by,
    pg_catalog.now(), v_source.id
  ) returning * into v_report;

  insert into public.report_artifacts (
    report_id, artefact_type, storage_bucket, storage_path, checksum_sha256, file_name, mime_type,
    file_size_bytes, storage_status, storage_verified_at, engagement_id, artifact_version,
    release_state
  ) values (
    v_report.id, 'supporting_register', v_source_register.storage_bucket, p_register_storage_path,
    p_register_checksum, p_register_file_name,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    p_register_file_size_bytes, 'VERIFIED', pg_catalog.now(), null, v_version,
    'verified'
  ) returning * into v_artifact;

  insert into public.manual_report_generation_attempts (
    request_key, order_id, assessment_id, report_version, trigger_source, requested_by, status,
    technical_reference, output_report_id, evidence_checksum, final_validation_json,
    narrative_prepared_at, lease_owner, lease_expires_at, heartbeat_at
  ) values (
    'comprehensive-recovery-revision-' || v_report.id::text, v_order.id, v_source.assessment_id,
    v_version, 'admin_regenerate', v_source.generated_by, 'REPORT_READY',
    v_technical_reference, v_report.id, p_checksum, v_validation,
    pg_catalog.now(), v_lease_owner,
    pg_catalog.now() + pg_catalog.make_interval(secs => p_lease_seconds), pg_catalog.now()
  ) returning * into v_attempt;

  perform pg_catalog.set_config('phase14.authoritative_transition', 'authenticated_rpc', true);

  insert into public.report_events (report_id, event_type, from_status, to_status, actor_user_id, note, metadata_json)
  values (
    v_report.id, 'regenerated', 'REPORT_GENERATING', 'REPORT_READY', v_source.generated_by,
    'Recovery revision produced from the released, checksum-verified previous version.',
    pg_catalog.jsonb_build_object(
      'attempt_id', v_attempt.id,
      'technical_reference', v_technical_reference,
      'retry_count', 0,
      'storage_status', 'VERIFIED',
      'file_size_bytes', p_file_size_bytes,
      'supporting_register_bytes', p_register_file_size_bytes,
      'recovery_method', p_recovery_method,
      'source_report_id', v_source.id,
      'provider_calls', 0
    )
  );
  insert into public.order_events (order_id, event_type, actor_admin_user_id, note, metadata_json)
  values (
    v_order.id, 'report_stored', v_source.generated_by,
    'Recovery revision stored and verified; previous version superseded and retained.',
    pg_catalog.jsonb_build_object(
      'attempt_id', v_attempt.id, 'report_id', v_report.id, 'storage_status', 'VERIFIED',
      'technical_reference', v_technical_reference, 'report_version', v_version,
      'superseded_report_id', v_source.id
    )
  );

  v_release := public.automatic_release_completed_fulfilment(v_attempt.id, v_report.id, v_lease_owner);
  if not coalesce((v_release->>'released')::boolean, false) then
    raise exception 'comprehensive_recovery_release_refused: %',
      coalesce(v_release->>'category', v_release->>'error_category', v_release::text);
  end if;
  if (v_release->>'delivery_authorization_id') is null then
    raise exception 'comprehensive_recovery_release_authorization_missing';
  end if;

  select * into v_report from public.reports where id = v_report.id;
  select * into v_artifact from public.report_artifacts where id = v_artifact.id;
  select * into v_attempt from public.manual_report_generation_attempts where id = v_attempt.id;
  if v_report.status <> 'released' or v_artifact.release_state <> 'released' then
    raise exception 'comprehensive_recovery_release_state_incomplete';
  end if;

  return pg_catalog.jsonb_build_object(
    'report', pg_catalog.to_jsonb(v_report),
    'supporting_register', pg_catalog.to_jsonb(v_artifact),
    'attempt', pg_catalog.to_jsonb(v_attempt),
    'superseded_report_id', v_source.id,
    'release', v_release,
    'delivery_authorization_id', v_release->>'delivery_authorization_id'
  );
end;
$$;

revoke all on function public.create_comprehensive_recovery_revision(
  uuid, text, text, text, bigint, text, text, text, bigint, text, text, jsonb, text, integer
) from public, anon, authenticated;
grant execute on function public.create_comprehensive_recovery_revision(
  uuid, text, text, text, bigint, text, text, text, bigint, text, text, jsonb, text, integer
) to service_role;

drop function if exists public.create_comprehensive_recovery_revision(
  uuid, text, text, text, bigint, text, text, text, bigint, text, text, jsonb
);
