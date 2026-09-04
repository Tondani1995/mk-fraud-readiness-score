-- Two bounded forward corrections for the Comprehensive current path.
--
-- 1. FAIL CLOSED ON A DISCARDED MANUSCRIPT.
--    The first real Preview Comprehensive package reached REPORT_READY, release and delivery with
--    manual_report_generation_attempts.final_narrative_json null: the Comprehensive branch rendered
--    the customer PDF from an in-memory manuscript and never crossed the provenance boundary, which
--    was only ever wired for Essential. The accepted narrative therefore stopped existing when the
--    request ended, and a provider-free revision of a released report became impossible. The
--    application now persists that provenance through the same RPC Essential uses; this trigger is
--    the durable half of the correction, so no future Comprehensive attempt can reach REPORT_READY
--    with its accepted manuscript discarded regardless of which code path sets the status.
--
-- 2. A NAMED, SINGLE-PURPOSE RECOVERY-REVISION SEAM.
--    The already-released V1 package cannot be re-rendered, because its manuscript was lost to
--    exactly the defect above. Its one customer-copy defect was instead corrected at the PDF layer
--    from the released, checksum-verified V1 bytes. This seam persists that revision as a proper
--    version of the existing report -- superseding V1 without deleting it, binding the unchanged
--    supporting register at the new artifact version, and superseding the prior version's customer
--    access -- so the revision travels the current release and delivery path rather than a parallel
--    one. It is deliberately narrow: Comprehensive only, one version step, the source report must
--    still match the checksum it was released under, and it records that no provider call was made
--    and no canonical manuscript was recovered.
--
-- Nothing here rewrites history: V1 keeps its row, checksum, storage object, delivery ledger and
-- token record, and no earlier migration is modified.

-- ---------------------------------------------------------------------------------------------
-- 1. Manuscript-provenance guard
-- ---------------------------------------------------------------------------------------------

create or replace function public.guard_comprehensive_manuscript_provenance()
returns trigger
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_is_comprehensive boolean;
  v_validation_mode text;
begin
  if new.status is distinct from 'REPORT_READY' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'REPORT_READY' then
    return new;
  end if;

  select exists (
    select 1
    from public.orders o
    join public.products p on p.id = o.product_id
    where o.id = new.order_id
      and p.product_code = 'mk_validated_assessment'
  ) into v_is_comprehensive;
  if not coalesce(v_is_comprehensive, false) then
    return new;
  end if;

  -- The one authorised exception: a legacy recovery revision produced from an already-released
  -- PDF, which by definition has no manuscript to persist. It must say so explicitly.
  v_validation_mode := new.final_validation_json->>'validation_mode';
  if v_validation_mode = 'legacy_pdf_native_recovery_revision' then
    if coalesce(new.final_validation_json->>'source_report_checksum', '') !~ '^[0-9a-f]{64}$'
       or coalesce(new.final_validation_json->>'report_checksum', '') !~ '^[0-9a-f]{64}$'
       or coalesce((new.final_validation_json->>'provider_generation_reused')::boolean, false) is not true then
      raise exception 'comprehensive_recovery_revision_provenance_invalid';
    end if;
    return new;
  end if;

  if new.final_narrative_json is null
     or new.final_validation_json is null
     or coalesce(new.evidence_checksum, '') !~ '^[0-9a-f]{64}$'
     or coalesce(pg_catalog.btrim(new.resolved_model), '') = ''
     or new.narrative_prepared_at is null then
    raise exception 'comprehensive_manuscript_provenance_missing';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_comprehensive_manuscript_provenance
  on public.manual_report_generation_attempts;
create trigger trg_guard_comprehensive_manuscript_provenance
  before insert or update on public.manual_report_generation_attempts
  for each row execute function public.guard_comprehensive_manuscript_provenance();

-- ---------------------------------------------------------------------------------------------
-- 2. Recovery-revision seam
-- ---------------------------------------------------------------------------------------------

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
  p_authorised_copy_change jsonb
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
begin
  perform public.rc1_require_operation_open('worker');

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

  -- The workbook is reused unchanged, so its bytes must still be the ones already verified.
  if p_register_checksum is distinct from v_source_register.checksum_sha256 then
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

  -- Supersede first: reports_one_current_assessment_type_uidx is a partial unique index over the
  -- live statuses and is enforced immediately, so the new row cannot be inserted alongside the old
  -- one. This is a single transaction -- if anything below fails, V1 is restored to 'released'.
  update public.reports set status = 'superseded', updated_at = pg_catalog.now()
  where id = v_source.id;

  insert into public.reports (
    assessment_id, organisation_id, order_id, score_run_id, template_id, report_type, status,
    report_reference, version_number, storage_bucket, storage_path, checksum, file_name, mime_type,
    file_size_bytes, storage_status, storage_verified_at, generated_by, generated_at,
    supersedes_report_id, approved_at, released_at
  ) values (
    v_source.assessment_id, v_source.organisation_id, v_source.order_id, v_source.score_run_id,
    v_source.template_id, v_source.report_type, 'released',
    v_reference, v_version, v_source.storage_bucket, p_storage_path, p_checksum, p_file_name,
    'application/pdf', p_file_size_bytes, 'VERIFIED', pg_catalog.now(), v_source.generated_by,
    pg_catalog.now(), v_source.id, pg_catalog.now(), pg_catalog.now()
  ) returning * into v_report;

  insert into public.report_artifacts (
    report_id, artefact_type, storage_bucket, storage_path, checksum_sha256, file_name, mime_type,
    file_size_bytes, storage_status, storage_verified_at, engagement_id, artifact_version,
    release_state, released_at
  ) values (
    v_report.id, 'supporting_register', v_source_register.storage_bucket, p_register_storage_path,
    p_register_checksum, p_register_file_name,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    p_register_file_size_bytes, 'VERIFIED', pg_catalog.now(), null, v_version,
    'released', pg_catalog.now()
  ) returning * into v_artifact;

  -- The attempt exists so the revision is delivered by the ordinary worker path rather than a
  -- second delivery mechanism. It is created already REPORT_READY against the verified package.
  insert into public.manual_report_generation_attempts (
    request_key, order_id, assessment_id, report_version, trigger_source, requested_by, status,
    technical_reference, output_report_id, evidence_checksum, final_validation_json,
    narrative_prepared_at, completed_at
  ) values (
    'comprehensive-recovery-revision-' || v_report.id::text, v_order.id, v_source.assessment_id,
    v_version, 'admin_regenerate', v_source.generated_by, 'REPORT_READY',
    v_technical_reference, v_report.id, p_checksum, v_validation,
    pg_catalog.now(), pg_catalog.now()
  ) returning * into v_attempt;

  perform pg_catalog.set_config('phase14.authoritative_transition', 'authenticated_rpc', true);

  -- The release path looks for this event to confirm the package it is about to release was
  -- actually produced and verified under this attempt.
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

  return pg_catalog.jsonb_build_object(
    'report', pg_catalog.to_jsonb(v_report),
    'supporting_register', pg_catalog.to_jsonb(v_artifact),
    'attempt', pg_catalog.to_jsonb(v_attempt),
    'superseded_report_id', v_source.id
  );
end;
$$;

revoke all on function public.create_comprehensive_recovery_revision(
  uuid, text, text, text, bigint, text, text, text, bigint, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.create_comprehensive_recovery_revision(
  uuid, text, text, text, bigint, text, text, text, bigint, text, text, jsonb
) to service_role;

-- ---------------------------------------------------------------------------------------------
-- 3. Supersede the prior version's customer access
-- ---------------------------------------------------------------------------------------------
--
-- revoke_customer_report_access_token() is the admin-session mechanism and stays exactly as it is.
-- A version supersede is not an admin action, so it needs its own audited service-role path: it may
-- only touch tokens belonging to a report that a *newer, released* version already supersedes, it
-- records the same revoked_at/revoked_reason evidence, and it leaves the token row in place.

create or replace function public.supersede_prior_version_report_access(
  p_current_report_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = 'public', 'pg_temp'
as $$
declare
  v_current public.reports%rowtype;
  v_prior public.reports%rowtype;
  v_note text := pg_catalog.btrim(coalesce(p_reason, ''));
  v_revoked jsonb;
begin
  perform public.rc1_require_operation_open('worker');
  if pg_catalog.length(v_note) < 5 then raise exception 'access_token_reason_too_short'; end if;

  select * into v_current from public.reports where id = p_current_report_id;
  if not found or v_current.status <> 'released' then
    raise exception 'supersede_access_current_report_not_released';
  end if;
  if v_current.supersedes_report_id is null then
    raise exception 'supersede_access_no_prior_version';
  end if;

  select * into v_prior from public.reports where id = v_current.supersedes_report_id for update;
  if not found or v_prior.status <> 'superseded' then
    raise exception 'supersede_access_prior_version_still_live';
  end if;

  with revoked as (
    update public.customer_report_access_tokens
    set revoked_at = pg_catalog.now(),
        revoked_reason = v_note,
        updated_at = pg_catalog.now()
    where report_id = v_prior.id and revoked_at is null
    returning id, purpose, access_count
  )
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(revoked)), '[]'::jsonb) into v_revoked from revoked;

  insert into public.report_events (report_id, event_type, actor_user_id, note, metadata_json)
  values (
    v_prior.id, 'access_revoked', null, v_note,
    pg_catalog.jsonb_build_object(
      'superseded_by_report_id', v_current.id,
      'superseded_by_reference', v_current.report_reference,
      'revoked_tokens', v_revoked
    )
  );

  return pg_catalog.jsonb_build_object(
    'prior_report_id', v_prior.id,
    'prior_report_reference', v_prior.report_reference,
    'current_report_id', v_current.id,
    'revoked_tokens', v_revoked
  );
end;
$$;

revoke all on function public.supersede_prior_version_report_access(uuid, text) from public, anon, authenticated;
grant execute on function public.supersede_prior_version_report_access(uuid, text) to service_role;
