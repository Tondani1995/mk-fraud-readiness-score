-- Bounded forward forensic recovery for the one synthetic Comprehensive Preview case.
--
-- V1 is immutable historical evidence. V2 was released out-of-band, but its queued delivery
-- authorization was never claimed, tokenized or sent. This migration adds one service-role-only,
-- hard-pinned transaction that quarantines that queued authorization, supersedes V2 and creates
-- the already-proven PDF-native V3 package. It then reuses the existing automatic release path so
-- V3 has exactly the same delivery authorization and worker semantics as Essential.
--
-- This is intentionally not a relaxation of create_comprehensive_recovery_revision(). That RPC
-- remains the normal released-source -> immediate-next-version seam. This function is a named,
-- one-case forensic continuation for the interrupted V2 state and refuses every other input.

begin;

create or replace function public.recover_comprehensive_v3_forward_forensic(
  p_actor_admin_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- The constants below are the exact Preview certification fixture. They are deliberately not
  -- parameters: a service-role caller cannot redirect this recovery to an arbitrary customer,
  -- report, storage object or delivery authorization.
  c_assessment_id constant uuid := 'bdf65b33-fa79-4839-8dbc-382cad61fa2b';
  c_order_id constant uuid := '9affc194-17a2-49cf-bc0e-b45d0535e336';
  c_score_run_id constant uuid := '965ca8e3-3185-47c4-a09e-3f814d64848f';
  c_template_id constant uuid := 'bc333899-a3e2-479a-8f56-33a08dabeb27';
  c_v1_report_id constant uuid := 'd097ca1e-471c-4c4b-b668-d96c4b052f55';
  c_v2_report_id constant uuid := '6b7ad75f-a3db-47f3-b2da-a6f34c32fda3';
  c_v1_artifact_id constant uuid := '1c2f36dc-33ce-440d-8020-9a100f967cfd';
  c_v2_artifact_id constant uuid := 'c60e868e-9343-4ca0-8c16-6cb94539768f';
  c_v2_authorization_id constant uuid := '83e2ca2e-528f-4dd0-bcb5-4a6bd260634f';
  c_v2_email_event_id constant uuid := 'c7473fff-6c5d-4c5e-9c11-f23d14836e6e';
  c_v1_pdf_checksum constant text := 'd65a3b4802445b3fb6d6b759c66b93a28897cc510081a6438c8817263f613ec3';
  c_v2_pdf_checksum constant text := '0768edd3658e528e740220d4c261631b722068de2d5797a885cc85e43c01ac26';
  c_v3_pdf_checksum constant text := '87e7fd6a550c3bd816665116c3e437f7133a8af591836670d5437787f86f0d8f';
  c_v1_register_checksum constant text := '2a28045444165e33a7379b2f00db4aa7ca34f2665ef0076c60a5e90c2192b4f6';
  c_v2_register_checksum constant text := '41a52aa814d73d5a7ed2dbe8228917b897d91b19bdf8064b7e0c4d3b9054aa77';
  c_bucket constant text := 'generated-reports';
  c_order_storage_prefix constant text := '6600c416-7970-4188-a488-65084d4cb996/9affc194-17a2-49cf-bc0e-b45d0535e336';
  c_v1_pdf_path constant text := '6600c416-7970-4188-a488-65084d4cb996/9affc194-17a2-49cf-bc0e-b45d0535e336/v1/RPT-MKFRS-2026-63D3103D95-V1-d65a3b4802445b3f.pdf';
  c_v2_pdf_path constant text := '6600c416-7970-4188-a488-65084d4cb996/9affc194-17a2-49cf-bc0e-b45d0535e336/v2/RPT-MKFRS-2026-63D3103D95-V2.pdf';
  c_v1_register_path constant text := '6600c416-7970-4188-a488-65084d4cb996/9affc194-17a2-49cf-bc0e-b45d0535e336/v1/RPT-MKFRS-2026-63D3103D95-V1-supporting-register.xlsx';
  c_v2_register_path constant text := '6600c416-7970-4188-a488-65084d4cb996/9affc194-17a2-49cf-bc0e-b45d0535e336/v2/RPT-MKFRS-2026-63D3103D95-V2-Comprehensive-supporting-register.xlsx';
  c_v3_pdf_path constant text := '6600c416-7970-4188-a488-65084d4cb996/9affc194-17a2-49cf-bc0e-b45d0535e336/v3/RPT-MKFRS-2026-63D3103D95-V3.pdf';
  c_v3_register_path constant text := '6600c416-7970-4188-a488-65084d4cb996/9affc194-17a2-49cf-bc0e-b45d0535e336/v3/RPT-MKFRS-2026-63D3103D95-V3-Comprehensive-supporting-register.xlsx';
  c_v3_reference constant text := 'RPT-MKFRS-2026-63D3103D95-V3';
  c_v3_pdf_file_name constant text := 'RPT-MKFRS-2026-63D3103D95-V3.pdf';
  c_v3_register_file_name constant text := 'RPT-MKFRS-2026-63D3103D95-V3-Comprehensive-supporting-register.xlsx';
  c_recovery_method constant text := 'bounded_pdf_native_copy_correction';
  c_quarantine_reason constant text := 'V2 queued authorization quarantined before V3 currentness: exact forensic recovery confirmed it was never claimed, tokenized or sent.';

  v_actor public.admin_profiles%rowtype;
  v_assessment public.assessments%rowtype;
  v_order public.orders%rowtype;
  v_product public.products%rowtype;
  v_source public.reports%rowtype;
  v_interrupted public.reports%rowtype;
  v_source_artifact public.report_artifacts%rowtype;
  v_interrupted_artifact public.report_artifacts%rowtype;
  v_v2_auth public.report_delivery_authorizations%rowtype;
  v_v2_auth_before jsonb;
  v_v2_auth_after jsonb;
  v_v2_event public.email_events%rowtype;
  v_v2_event_before jsonb;
  v_report public.reports%rowtype;
  v_artifact public.report_artifacts%rowtype;
  v_attempt public.manual_report_generation_attempts%rowtype;
  v_v3_release jsonb;
  v_v3_auth public.report_delivery_authorizations%rowtype;
  v_storage_object record;
  v_existing_v3 public.reports%rowtype;
  v_current_count integer;
  v_token_count integer;
  v_finalization_count integer;
  v_v1_token_count integer;
  v_v1_revoked_token_count integer;
  v_v2_event_updated integer;
  v_v2_auth_updated integer;
  v_lease_owner text := 'comprehensive-v3-forensic-recovery:' || pg_catalog.gen_random_uuid()::text;
  v_technical_reference text := pg_catalog.gen_random_uuid()::text;
  v_validation jsonb;
begin
  -- PostgREST service-role requests carry this claim. The security-definer owner must not make
  -- the RPC callable by anon/authenticated callers merely because the function runs as owner.
  if coalesce(nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'service_role' then
    raise exception 'comprehensive_v3_recovery_service_role_required';
  end if;

  if p_actor_admin_id is null then
    raise exception 'comprehensive_v3_recovery_actor_required';
  end if;

  select * into v_actor
  from public.admin_profiles
  where id = p_actor_admin_id
    and status = 'active'
    and role = 'platform_admin'
  for share;
  if not found then
    raise exception 'comprehensive_v3_recovery_platform_admin_required';
  end if;

  -- Serialise all accidental replays of this single-case control without changing any report
  -- state. A completed run is a terminal outcome, not an invitation to create another version.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('mk-comprehensive-v3-forward-forensic-63D3103D95', 0)
  );

  select * into v_existing_v3
  from public.reports
  where id <> c_v2_report_id
    and report_reference = c_v3_reference
  for update;
  if found then
    raise exception 'comprehensive_v3_recovery_already_applied';
  end if;

  select * into v_assessment
  from public.assessments
  where id = c_assessment_id
  for update;
  if not found
     or v_assessment.assessment_reference <> 'MKFRS-2026-63D3103D95' then
    raise exception 'comprehensive_v3_recovery_assessment_mismatch';
  end if;

  select * into v_order
  from public.orders
  where id = c_order_id
  for update;
  if not found
     or v_order.assessment_id is distinct from c_assessment_id
     or v_order.order_reference <> 'MKORD-2026-A5C67840'
     or v_order.status::text <> 'payment_received' then
    raise exception 'comprehensive_v3_recovery_order_mismatch';
  end if;

  select * into v_product
  from public.products
  where id = v_order.product_id
  for share;
  if not found
     or v_product.product_code <> 'mk_validated_assessment'
     or v_product.name <> 'Comprehensive' then
    raise exception 'comprehensive_v3_recovery_product_mismatch';
  end if;
  if v_assessment.current_score_run_id is distinct from c_score_run_id then
    raise exception 'comprehensive_v3_recovery_score_run_mismatch';
  end if;

  select * into v_source
  from public.reports
  where id = c_v1_report_id
  for update;
  if not found
     or v_source.assessment_id is distinct from c_assessment_id
     or v_source.order_id is distinct from c_order_id
     or v_source.score_run_id is distinct from c_score_run_id
     or v_source.template_id is distinct from c_template_id
     or v_source.report_type <> 'mk_validated'
     or v_source.report_reference <> 'RPT-MKFRS-2026-63D3103D95-V1'
     or v_source.version_number <> 1
     or v_source.status <> 'superseded'
     or v_source.storage_status <> 'VERIFIED'
     or v_source.storage_bucket <> c_bucket
     or v_source.storage_path <> c_v1_pdf_path
     or v_source.checksum <> c_v1_pdf_checksum
     or v_source.file_name <> 'RPT-MKFRS-2026-63D3103D95-V1.pdf'
     or v_source.file_size_bytes <> 303473
     or v_source.mime_type <> 'application/pdf' then
    raise exception 'comprehensive_v3_recovery_v1_integrity_mismatch';
  end if;

  select * into v_interrupted
  from public.reports
  where id = c_v2_report_id
  for update;
  if not found
     or v_interrupted.assessment_id is distinct from c_assessment_id
     or v_interrupted.order_id is distinct from c_order_id
     or v_interrupted.score_run_id is distinct from c_score_run_id
     or v_interrupted.template_id is distinct from c_template_id
     or v_interrupted.report_type <> 'mk_validated'
     or v_interrupted.report_reference <> 'RPT-MKFRS-2026-63D3103D95-V2'
     or v_interrupted.version_number <> 2
     or v_interrupted.status <> 'released'
     or v_interrupted.supersedes_report_id is distinct from c_v1_report_id
     or v_interrupted.storage_status <> 'VERIFIED'
     or v_interrupted.storage_bucket <> c_bucket
     or v_interrupted.storage_path <> c_v2_pdf_path
     or v_interrupted.checksum <> c_v2_pdf_checksum
     or v_interrupted.file_name <> 'RPT-MKFRS-2026-63D3103D95-V2.pdf'
     or v_interrupted.file_size_bytes <> 343373
     or v_interrupted.mime_type <> 'application/pdf' then
    raise exception 'comprehensive_v3_recovery_v2_integrity_mismatch';
  end if;

  select count(*) into v_current_count
  from public.reports
  where assessment_id = c_assessment_id
    and report_type = 'mk_validated'
    and status not in ('draft', 'superseded', 'voided');
  if v_current_count <> 1 then
    raise exception 'comprehensive_v3_recovery_current_version_precondition_failed';
  end if;

  select * into v_source_artifact
  from public.report_artifacts
  where id = c_v1_artifact_id
  for update;
  if not found
     or v_source_artifact.report_id is distinct from c_v1_report_id
     or v_source_artifact.artefact_type <> 'supporting_register'
     or v_source_artifact.engagement_id is not null
     or v_source_artifact.storage_bucket <> c_bucket
     or v_source_artifact.storage_path <> c_v1_register_path
     or v_source_artifact.checksum_sha256 <> c_v1_register_checksum
     or v_source_artifact.file_name <> 'RPT-MKFRS-2026-63D3103D95-V1-supporting-register.xlsx'
     or v_source_artifact.mime_type <> 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
     or v_source_artifact.file_size_bytes <> 19283
     or v_source_artifact.storage_status <> 'VERIFIED'
     or v_source_artifact.release_state <> 'released'
     or v_source_artifact.artifact_version <> 1 then
    raise exception 'comprehensive_v3_recovery_v1_register_mismatch';
  end if;

  select * into v_interrupted_artifact
  from public.report_artifacts
  where id = c_v2_artifact_id
  for share;
  if not found
     or v_interrupted_artifact.report_id is distinct from c_v2_report_id
     or v_interrupted_artifact.artefact_type <> 'supporting_register'
     or v_interrupted_artifact.engagement_id is not null
     or v_interrupted_artifact.storage_bucket <> c_bucket
     or v_interrupted_artifact.storage_path <> c_v2_register_path
     or v_interrupted_artifact.checksum_sha256 <> c_v2_register_checksum
     or v_interrupted_artifact.file_name <> 'RPT-MKFRS-2026-63D3103D95-V2-Comprehensive-supporting-register.xlsx'
     or v_interrupted_artifact.mime_type <> 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
     or v_interrupted_artifact.file_size_bytes <> 26336
     or v_interrupted_artifact.storage_status <> 'VERIFIED'
     or v_interrupted_artifact.release_state <> 'released'
     or v_interrupted_artifact.artifact_version <> 2 then
    raise exception 'comprehensive_v3_recovery_v2_register_mismatch';
  end if;

  -- This is the critical fail-closed boundary. Any evidence that V2 was claimed, tokenized or
  -- sent makes the forensic continuation unsafe and aborts before any row can be changed.
  select * into v_v2_auth
  from public.report_delivery_authorizations
  where id = c_v2_authorization_id
  for update;
  if not found
     or v_v2_auth.report_id is distinct from c_v2_report_id
     or v_v2_auth.order_id is distinct from c_order_id
     or v_v2_auth.assessment_id is distinct from c_assessment_id
     or v_v2_auth.score_run_id is distinct from c_score_run_id
     or v_v2_auth.email_event_id is distinct from c_v2_email_event_id
     or v_v2_auth.report_checksum <> c_v2_pdf_checksum
     or v_v2_auth.recipient_email::text <> 'admin@mkfraud.co.za'
     or v_v2_auth.status <> 'queued'
     or v_v2_auth.provider_message_id is not null
     or v_v2_auth.claimed_at is not null
     or v_v2_auth.dispatch_started_at is not null
     or v_v2_auth.finalized_at is not null
     or v_v2_auth.lease_token is not null
     or v_v2_auth.lease_expires_at is not null then
    raise exception 'comprehensive_v3_recovery_v2_authorization_not_untouched';
  end if;

  select * into v_v2_event
  from public.email_events
  where id = c_v2_email_event_id
  for update;
  if not found
     or v_v2_event.id is distinct from c_v2_email_event_id
     or v_v2_event.order_id is distinct from c_order_id
     or v_v2_event.report_id is distinct from c_v2_report_id
     or v_v2_event.recipient_email::text <> 'admin@mkfraud.co.za'
     or v_v2_event.status <> 'QUEUED'
     or v_v2_event.provider_mode is distinct from 'disabled'
     or v_v2_event.provider_message_id is not null
     or v_v2_event.provider_event_id is not null
     or v_v2_event.sent_at is not null
     or v_v2_event.delivered_at is not null
     or v_v2_event.send_lease_token is not null
     or v_v2_event.send_lease_expires_at is not null then
    raise exception 'comprehensive_v3_recovery_v2_event_not_untouched';
  end if;

  select count(*) into v_token_count
  from public.customer_report_access_tokens
  where report_id = c_v2_report_id;
  if v_token_count <> 0 then
    raise exception 'comprehensive_v3_recovery_v2_token_exists';
  end if;

  select count(*) into v_finalization_count
  from public.report_delivery_finalizations
  where authorization_id = c_v2_authorization_id
     or report_id = c_v2_report_id;
  if v_finalization_count <> 0 then
    raise exception 'comprehensive_v3_recovery_v2_finalization_exists';
  end if;

  select count(*) into v_v1_token_count
  from public.customer_report_access_tokens
  where report_id = c_v1_report_id;
  select count(*) into v_v1_revoked_token_count
  from public.customer_report_access_tokens
  where report_id = c_v1_report_id and revoked_at is not null;
  if v_v1_token_count <> 1 or v_v1_revoked_token_count <> 1 then
    raise exception 'comprehensive_v3_recovery_v1_token_history_mismatch';
  end if;

  -- The target PDF must already be the exact proven native transformation. Storage metadata is
  -- checked here as well as by the ordinary release entitlement; the application route reads and
  -- writes/read-backs this object before invoking this RPC.
  select o.bucket_id, o.name, o.metadata, o.user_metadata into v_storage_object
  from storage.objects o
  where o.bucket_id = c_bucket and o.name = c_v3_pdf_path;
  if not found
     or coalesce(v_storage_object.metadata->>'mimetype', '') <> 'application/pdf'
     or coalesce(v_storage_object.user_metadata->>'sha256', v_storage_object.metadata->>'sha256', '') <> c_v3_pdf_checksum then
    raise exception 'comprehensive_v3_recovery_pdf_storage_not_verified';
  end if;

  select o.bucket_id, o.name, o.metadata, o.user_metadata into v_storage_object
  from storage.objects o
  where o.bucket_id = c_bucket and o.name = c_v3_register_path;
  if not found
     or coalesce(v_storage_object.metadata->>'mimetype', '') <> 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
     or coalesce(v_storage_object.user_metadata->>'sha256', v_storage_object.metadata->>'sha256', '') <> c_v1_register_checksum then
    raise exception 'comprehensive_v3_recovery_register_storage_not_verified';
  end if;

  v_v2_auth_before := pg_catalog.to_jsonb(v_v2_auth);
  v_v2_event_before := pg_catalog.to_jsonb(v_v2_event);

  -- All shared-table changes below are made under the existing authoritative transition context.
  -- This is the same current worker boundary used by automatic release; it does not re-enable or
  -- consult the retired Phase 14 AI-generation controls.
  perform pg_catalog.set_config('phase14.authoritative_transition', 'worker_rpc', true);

  update public.report_delivery_authorizations
  set status = 'revoked',
      revoked_reason = c_quarantine_reason,
      lease_token = null,
      lease_expires_at = null,
      next_attempt_at = null,
      updated_at = pg_catalog.now()
  where id = c_v2_authorization_id
    and status = 'queued'
    and provider_message_id is null
    and claimed_at is null
    and dispatch_started_at is null
    and finalized_at is null;
  get diagnostics v_v2_auth_updated = row_count;
  if v_v2_auth_updated <> 1 then
    raise exception 'comprehensive_v3_recovery_v2_authorization_revoke_failed';
  end if;
  select * into v_v2_auth from public.report_delivery_authorizations where id = c_v2_authorization_id;
  v_v2_auth_after := pg_catalog.to_jsonb(v_v2_auth);

  -- Keep the queued event as historical evidence. Its status remains QUEUED so the record says
  -- what was scheduled; the revoked authorization is what makes it unreachable to delivery.
  update public.email_events
  set metadata_json = coalesce(metadata_json, '{}'::jsonb) || pg_catalog.jsonb_build_object(
        'forensic_quarantine', pg_catalog.jsonb_build_object(
          'reason', c_quarantine_reason,
          'source_report_reference', 'RPT-MKFRS-2026-63D3103D95-V1',
          'interrupted_report_reference', 'RPT-MKFRS-2026-63D3103D95-V2',
          'target_report_reference', c_v3_reference,
          'authorization_revoked', true,
          'provider_calls', 0
        )
      ),
      send_lease_token = null,
      send_lease_expires_at = null,
      updated_at = pg_catalog.now()
  where id = c_v2_email_event_id
    and status = 'QUEUED'
    and provider_message_id is null
    and provider_event_id is null
    and sent_at is null
    and delivered_at is null;
  get diagnostics v_v2_event_updated = row_count;
  if v_v2_event_updated <> 1 then
    raise exception 'comprehensive_v3_recovery_v2_event_annotation_failed';
  end if;
  select * into v_v2_event from public.email_events where id = c_v2_email_event_id;

  insert into public.audit_logs(
    actor_type, actor_user_id, assessment_id, entity_table, entity_id, action, before_json, after_json
  ) values (
    'admin', p_actor_admin_id, c_assessment_id,
    'report_delivery_authorizations', c_v2_authorization_id,
    'comprehensive_v2_delivery_authorization_revoked',
    v_v2_auth_before,
    v_v2_auth_after || pg_catalog.jsonb_build_object(
      'forensic_reason', c_quarantine_reason,
      'queued_email_event_preserved', true,
      'email_event_id', c_v2_email_event_id
    )
  );

  insert into public.report_events(
    report_id, event_type, from_status, to_status, actor_user_id, note, metadata_json
  ) values (
    c_v2_report_id, 'delivery_quarantined', 'RELEASED', 'RELEASED', p_actor_admin_id,
    c_quarantine_reason,
    pg_catalog.jsonb_build_object(
      'authorization_id', c_v2_authorization_id,
      'email_event_id', c_v2_email_event_id,
      'provider_message_id', null,
      'customer_token_count', 0,
      'finalization_count', 0,
      'historical_event_preserved', true
    )
  );

  update public.reports
  set status = 'superseded', updated_at = pg_catalog.now()
  where id = c_v2_report_id and status = 'released';
  if not found then
    raise exception 'comprehensive_v3_recovery_v2_supersede_failed';
  end if;

  insert into public.report_events(
    report_id, event_type, from_status, to_status, actor_user_id, note, metadata_json
  ) values (
    c_v2_report_id, 'superseded', 'RELEASED', 'SUPERSEDED', p_actor_admin_id,
    'Out-of-band V2 superseded after its undelivered authorization was quarantined for V3 recovery.',
    pg_catalog.jsonb_build_object(
      'target_report_reference', c_v3_reference,
      'target_report_version', 3,
      'source_report_reference', 'RPT-MKFRS-2026-63D3103D95-V1',
      'interrupted_report_reference', 'RPT-MKFRS-2026-63D3103D95-V2'
    )
  );

  v_validation := pg_catalog.jsonb_build_object(
    'validation_mode', 'legacy_pdf_native_recovery_revision',
    'contract_version', 'comprehensive-product-v1.1',
    'recovery_method', c_recovery_method,
    'source_report_id', c_v1_report_id,
    'source_report_reference', 'RPT-MKFRS-2026-63D3103D95-V1',
    'source_report_checksum', c_v1_pdf_checksum,
    'interrupted_report_id', c_v2_report_id,
    'interrupted_report_reference', 'RPT-MKFRS-2026-63D3103D95-V2',
    'interrupted_report_checksum', c_v2_pdf_checksum,
    'target_report_reference', c_v3_reference,
    'report_checksum', c_v3_pdf_checksum,
    'supporting_register_checksum', c_v1_register_checksum,
    'supporting_register_bytes_reused_unchanged', true,
    'artifact_version', 3,
    'provider_generation_reused', true,
    'provider_calls', 0,
    'canonical_manuscript_recovered', false,
    'bounded_pdf_native_copy_correction', true,
    'review_required', false,
    'independent_validation_performed', false,
    'operating_effectiveness_tested', false,
    'assurance_opinion_provided', false,
    'v2_delivery_authorization_revoked', true,
    'v2_queued_event_preserved', true
  );

  insert into public.reports(
    assessment_id, organisation_id, order_id, score_run_id, template_id, report_type, status,
    report_reference, version_number, storage_bucket, storage_path, checksum, file_name, mime_type,
    file_size_bytes, storage_status, storage_verified_at, generated_by, generated_at,
    supersedes_report_id
  ) values (
    c_assessment_id, v_source.organisation_id, c_order_id, c_score_run_id, c_template_id,
    'mk_validated', 'generated', c_v3_reference, 3, c_bucket, c_v3_pdf_path, c_v3_pdf_checksum,
    c_v3_pdf_file_name, 'application/pdf', 303597, 'VERIFIED', pg_catalog.now(), p_actor_admin_id,
    pg_catalog.now(), c_v2_report_id
  ) returning * into v_report;

  insert into public.report_artifacts(
    report_id, engagement_id, artefact_type, storage_bucket, storage_path, checksum_sha256,
    file_name, mime_type, file_size_bytes, storage_status, storage_verified_at, artifact_version,
    release_state
  ) values (
    v_report.id, null, 'supporting_register', c_bucket, c_v3_register_path, c_v1_register_checksum,
    c_v3_register_file_name, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    19283, 'VERIFIED', pg_catalog.now(), 3, 'verified'
  ) returning * into v_artifact;

  insert into public.manual_report_generation_attempts(
    request_key, order_id, assessment_id, report_version, trigger_source, requested_by, requested_at,
    started_at, completed_at, status, retry_count, technical_reference, output_report_id,
    evidence_checksum, final_validation_json, lease_owner, lease_expires_at, heartbeat_at
  ) values (
    'comprehensive-v3-forward-forensic-20260904', c_order_id, c_assessment_id, 3, 'admin_regenerate',
    p_actor_admin_id, pg_catalog.now(), pg_catalog.now(), pg_catalog.now(), 'REPORT_READY', 0,
    v_technical_reference, v_report.id, c_v3_pdf_checksum, v_validation, v_lease_owner,
    pg_catalog.now() + interval '5 minutes', pg_catalog.now()
  ) returning * into v_attempt;

  insert into public.report_events(
    report_id, event_type, from_status, to_status, actor_user_id, note, metadata_json
  ) values (
    v_report.id, 'regenerated', 'REPORT_GENERATING', 'REPORT_READY', p_actor_admin_id,
    'V3 created from immutable V1 supporting evidence after the undelivered V2 attempt was quarantined.',
    pg_catalog.jsonb_build_object(
      'attempt_id', v_attempt.id,
      'technical_reference', v_technical_reference,
      'storage_status', 'VERIFIED',
      'file_size_bytes', 303597,
      'supporting_register_bytes', 19283,
      'recovery_method', c_recovery_method,
      'source_report_reference', 'RPT-MKFRS-2026-63D3103D95-V1',
      'interrupted_report_reference', 'RPT-MKFRS-2026-63D3103D95-V2',
      'target_report_reference', c_v3_reference,
      'provider_calls', 0
    )
  );
  insert into public.order_events(order_id, event_type, actor_admin_user_id, note, metadata_json)
  values
    (c_order_id, 'report_stored', p_actor_admin_id,
      'V3 Comprehensive package stored and verified for the existing paid order.',
      pg_catalog.jsonb_build_object(
        'attempt_id', v_attempt.id, 'report_id', v_report.id, 'report_version', 3,
        'storage_status', 'VERIFIED', 'superseded_report_id', c_v2_report_id
      )),
    (c_order_id, 'generation_succeeded', p_actor_admin_id,
      'V3 Comprehensive package recovered without provider regeneration.',
      pg_catalog.jsonb_build_object(
        'attempt_id', v_attempt.id, 'report_id', v_report.id, 'supporting_register_id', v_artifact.id,
        'report_version', 3, 'provider_calls', 0, 'provider_generation_reused', true
      ));

  -- The existing release RPC is the sole creator of the V3 delivery authorization. The lease
  -- above is required because this is a REPORT_READY worker continuation rather than a normal
  -- generation request.
  v_v3_release := public.automatic_release_completed_fulfilment(
    v_attempt.id, v_report.id, v_lease_owner
  );
  if coalesce((v_v3_release->>'released')::boolean, false) is not true
     or (v_v3_release->>'delivery_authorization_id') is null then
    raise exception 'comprehensive_v3_recovery_release_failed';
  end if;

  select * into v_v3_auth
  from public.report_delivery_authorizations
  where id = (v_v3_release->>'delivery_authorization_id')::uuid
  for share;
  if not found
     or v_v3_auth.id = c_v2_authorization_id
     or v_v3_auth.report_id is distinct from v_report.id
     or v_v3_auth.order_id is distinct from c_order_id
     or v_v3_auth.assessment_id is distinct from c_assessment_id
     or v_v3_auth.score_run_id is distinct from c_score_run_id
     or v_v3_auth.status <> 'queued'
     or v_v3_auth.report_checksum <> c_v3_pdf_checksum then
    raise exception 'comprehensive_v3_recovery_new_authorization_invalid';
  end if;

  select * into v_report from public.reports where id = v_report.id for share;
  select * into v_artifact from public.report_artifacts where id = v_artifact.id for share;
  select * into v_attempt from public.manual_report_generation_attempts where id = v_attempt.id for share;
  if v_report.status <> 'released'
     or v_artifact.storage_status <> 'VERIFIED'
     or v_artifact.release_state <> 'released'
     or v_attempt.status <> 'DELIVERY_QUEUED'
     or v_attempt.automatic_delivery_authorization_id is distinct from v_v3_auth.id then
    raise exception 'comprehensive_v3_recovery_post_release_state_invalid';
  end if;

  insert into public.audit_logs(
    actor_type, actor_user_id, assessment_id, entity_table, entity_id, action, after_json
  ) values (
    'admin', p_actor_admin_id, c_assessment_id, 'reports', v_report.id,
    'comprehensive_v3_forward_forensic_recovery_committed',
    pg_catalog.jsonb_build_object(
      'source_report_id', c_v1_report_id,
      'interrupted_report_id', c_v2_report_id,
      'target_report_id', v_report.id,
      'target_report_reference', c_v3_reference,
      'target_report_checksum', c_v3_pdf_checksum,
      'supporting_register_checksum', c_v1_register_checksum,
      'v2_authorization_id', c_v2_authorization_id,
      'v2_authorization_status', 'revoked',
      'v3_delivery_authorization_id', v_v3_auth.id,
      'provider_generation_reused', true,
      'provider_calls', 0,
      'canonical_manuscript_recovered', false,
      'recovery_method', c_recovery_method
    )
  );

  return pg_catalog.jsonb_build_object(
    'ok', true,
    'source_report_reference', 'RPT-MKFRS-2026-63D3103D95-V1',
    'interrupted_report_reference', 'RPT-MKFRS-2026-63D3103D95-V2',
    'target_report_reference', c_v3_reference,
    'report_id', v_report.id,
    'attempt_id', v_attempt.id,
    'delivery_authorization_id', v_v3_auth.id,
    'v2_authorization_id', c_v2_authorization_id,
    'v2_authorization_status', 'revoked',
    'v2_email_event_id', c_v2_email_event_id,
    'v2_email_event_preserved', true,
    'v3_pdf_checksum', c_v3_pdf_checksum,
    'v3_register_checksum', c_v1_register_checksum,
    'provider_calls', 0,
    'provider_generation_reused', true,
    'canonical_manuscript_recovered', false,
    'recovery_method', c_recovery_method
  );
end;
$$;

comment on function public.recover_comprehensive_v3_forward_forensic(uuid) is
  'Preview-only service-role forensic continuation for the pinned Comprehensive V1/V2 fixture; quarantines an untouched queued V2 authorization and atomically creates/releases V3 without provider regeneration.';

revoke all on function public.recover_comprehensive_v3_forward_forensic(uuid) from public, anon, authenticated;
grant execute on function public.recover_comprehensive_v3_forward_forensic(uuid) to service_role;

commit;
