-- Joint-launch last mile: authoritative release ordering and an atomic Comprehensive package writer.
-- This migration is intentionally after 20260810130000. It does not change Essential semantics.

begin;

create or replace function public.comprehensive_required_artifacts_present(p_engagement_id uuid)
returns boolean
language plpgsql
stable
set search_path = pg_catalog, public
as $$
declare
  v_report public.reports%rowtype;
  v_version integer;
  v_count integer;
begin
  select r.* into v_report
  from public.comprehensive_engagements e
  join public.reports r on r.order_id = e.order_id
  where e.id = p_engagement_id
    and r.report_type = 'mk_validated'
    and r.status in ('generated', 'approved', 'released')
    and r.storage_status = 'VERIFIED'
  order by r.version_number desc
  limit 1;
  if not found then return false; end if;

  select min(a.artifact_version), count(*) into v_version, v_count
  from public.report_artifacts a
  where a.report_id = v_report.id
    and a.engagement_id = p_engagement_id
    and a.artefact_type in ('supporting_register', 'board_readout', 'executive_presentation', 'workshop_material')
    and a.storage_status = 'VERIFIED'
    and a.release_state in ('verified', 'released')
    and a.checksum_sha256 ~ '^[0-9a-f]{64}$'
    and coalesce(a.file_size_bytes, 0) > 0;
  return v_count = 4
    and v_version = v_report.version_number
    and (select count(*) from public.report_artifacts a where a.report_id = v_report.id and a.engagement_id = p_engagement_id and a.artifact_version = v_version and a.artefact_type in ('supporting_register', 'board_readout', 'executive_presentation', 'workshop_material') and a.storage_status = 'VERIFIED' and a.release_state in ('verified', 'released')) = 4;
end;
$$;

create or replace function public.comprehensive_delivery_ready(p_engagement_id uuid)
returns boolean
language plpgsql
stable
set search_path = pg_catalog, public
as $$
declare
  v_engagement public.comprehensive_engagements%rowtype;
  v_report public.reports%rowtype;
  v_count integer;
begin
  select * into v_engagement from public.comprehensive_engagements where id = p_engagement_id;
  if not found or v_engagement.signed_off_artifact_version is null then return false; end if;
  select r.* into v_report
  from public.reports r
  where r.order_id = v_engagement.order_id and r.report_type = 'mk_validated' and r.status = 'released' and r.storage_status = 'VERIFIED'
  order by r.version_number desc limit 1;
  if not found or v_report.version_number <> v_engagement.signed_off_artifact_version then return false; end if;
  select count(*) into v_count
  from public.report_artifacts a
  where a.report_id = v_report.id and a.engagement_id = p_engagement_id
    and a.artifact_version = v_engagement.signed_off_artifact_version
    and a.artefact_type in ('supporting_register', 'board_readout', 'executive_presentation', 'workshop_material')
    and a.storage_status = 'VERIFIED' and a.release_state = 'released'
    and a.checksum_sha256 ~ '^[0-9a-f]{64}$' and coalesce(a.file_size_bytes, 0) > 0;
  return v_count = 4;
end;
$$;

create or replace function public.complete_comprehensive_package(
  p_engagement_id uuid,
  p_report_id uuid,
  p_template_id uuid,
  p_artifact_version integer,
  p_primary jsonb,
  p_secondary jsonb,
  p_generated_by uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_engagement public.comprehensive_engagements%rowtype;
  v_assessment public.assessments%rowtype;
  v_report public.reports%rowtype;
  v_item jsonb;
  v_type text;
  v_object_id uuid;
  v_seen text[] := array[]::text[];
  v_version integer := coalesce(p_artifact_version, 0);
begin
  if coalesce((nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb)->>'role', '') <> 'service_role' then raise exception 'comprehensive_package_service_role_required'; end if;
  if v_version < 1 or pg_catalog.jsonb_typeof(p_primary) <> 'object' or pg_catalog.jsonb_typeof(p_secondary) <> 'array' or pg_catalog.jsonb_array_length(p_secondary) <> 3 then raise exception 'comprehensive_package_manifest_invalid'; end if;
  select * into v_engagement from public.comprehensive_engagements where id = p_engagement_id for update;
  if not found or v_engagement.state not in ('payment_received', 'evidence_received', 'in_review') then raise exception 'comprehensive_package_engagement_state_invalid'; end if;
  select * into v_assessment from public.assessments where id = v_engagement.assessment_id;
  if not found or v_assessment.current_score_run_id is null then raise exception 'comprehensive_package_assessment_not_scored'; end if;
  if p_primary->>'storage_bucket' <> 'comprehensive-reports'
     or p_primary->>'storage_path' !~ ('^' || p_engagement_id::text || '/v' || v_version::text || '/' || p_report_id::text || '\.pdf$')
     or p_primary->>'mime_type' <> 'application/pdf'
     or coalesce((p_primary->>'file_size_bytes')::bigint, 0) <= 0
     or p_primary->>'checksum' !~ '^[0-9a-f]{64}$' then raise exception 'comprehensive_package_primary_invalid'; end if;
  if exists (select 1 from public.reports where id = p_report_id) then raise exception 'comprehensive_package_report_id_exists'; end if;

  insert into public.reports(
    id, assessment_id, organisation_id, order_id, score_run_id, template_id, report_type, status,
    report_reference, version_number, storage_bucket, storage_path, checksum, file_name, mime_type,
    file_size_bytes, storage_status, storage_verified_at, generated_by, generated_at
  ) values (
    p_report_id, v_assessment.id, v_assessment.organisation_id, v_engagement.order_id, v_assessment.current_score_run_id,
    p_template_id, 'mk_validated', 'generated',
    'RPT-' || v_assessment.assessment_reference || '-COMPREHENSIVE-V' || v_version::text, v_version,
    p_primary->>'storage_bucket', p_primary->>'storage_path', p_primary->>'checksum', p_primary->>'file_name',
    p_primary->>'mime_type', (p_primary->>'file_size_bytes')::bigint, 'VERIFIED', pg_catalog.now(), p_generated_by, pg_catalog.now()
  ) returning * into v_report;

  insert into public.report_events(report_id, event_type, from_status, to_status, actor_user_id, note)
  values (v_report.id, 'generated', 'IN_REVIEW', 'GENERATED', p_generated_by, 'Comprehensive package generated from persisted assessment and reviewer input.');

  for v_item in select value from pg_catalog.jsonb_array_elements(p_secondary) loop
    v_type := v_item->>'artefact_type';
    if v_type not in ('supporting_register', 'board_readout', 'workshop_material') or v_type = any(v_seen) then raise exception 'comprehensive_package_secondary_manifest_invalid'; end if;
    v_seen := array_append(v_seen, v_type);
    v_object_id := (v_item->>'object_id')::uuid;
    if v_item->>'storage_bucket' <> 'comprehensive-reports'
       or v_item->>'storage_path' !~ ('^' || p_engagement_id::text || '/v' || v_version::text || '/' || v_object_id::text || '\.(pdf|xlsx)$')
       or coalesce((v_item->>'file_size_bytes')::bigint, 0) <= 0
       or v_item->>'checksum' !~ '^[0-9a-f]{64}$' then raise exception 'comprehensive_package_secondary_invalid'; end if;
    insert into public.report_artifacts(id, report_id, engagement_id, artefact_type, storage_bucket, storage_path, checksum_sha256, file_name, mime_type, file_size_bytes, storage_status, storage_verified_at, artifact_version, release_state)
    values (v_object_id, v_report.id, p_engagement_id, v_type, v_item->>'storage_bucket', v_item->>'storage_path', v_item->>'checksum', v_item->>'file_name', v_item->>'mime_type', (v_item->>'file_size_bytes')::bigint, 'VERIFIED', pg_catalog.now(), v_version, 'verified');
  end loop;
  if cardinality(v_seen) <> 3 then raise exception 'comprehensive_package_secondary_set_incomplete'; end if;
  insert into public.audit_logs(actor_type, actor_user_id, assessment_id, entity_table, entity_id, action, after_json)
  values ('admin', p_generated_by, v_assessment.id, 'reports', v_report.id, 'comprehensive_package_generated', pg_catalog.jsonb_build_object('engagement_id', p_engagement_id, 'artifact_version', v_version, 'secondary_count', 3));
  return pg_catalog.jsonb_build_object('ok', true, 'report_id', v_report.id, 'artifact_version', v_version, 'presentation_upload_required', true);
end;
$$;

revoke all on function public.complete_comprehensive_package(uuid, uuid, uuid, integer, jsonb, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.complete_comprehensive_package(uuid, uuid, uuid, integer, jsonb, jsonb, uuid) to service_role;

create or replace function public.finalise_comprehensive_artifact_set(
  p_engagement_id uuid,
  p_report_id uuid,
  p_artifact_version integer default 1,
  p_actor_admin_user_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_engagement public.comprehensive_engagements%rowtype;
  v_report public.reports%rowtype;
  v_count integer;
begin
  if coalesce((nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb)->>'role', '') <> 'service_role' then raise exception 'comprehensive_artifact_release_service_role_required'; end if;
  select * into v_engagement from public.comprehensive_engagements where id = p_engagement_id for update;
  if not found then raise exception 'comprehensive_artifact_engagement_not_found'; end if;
  if v_engagement.state <> 'review_complete' or v_engagement.signed_off_artifact_version is distinct from p_artifact_version then raise exception 'comprehensive_artifact_release_requires_exact_signoff'; end if;
  select * into v_report from public.reports where id = p_report_id and order_id = v_engagement.order_id for update;
  if not found or v_report.version_number <> p_artifact_version or v_report.storage_status <> 'VERIFIED' or v_report.status not in ('generated', 'approved', 'released') then raise exception 'comprehensive_artifact_primary_report_not_ready'; end if;
  select count(*) into v_count from public.report_artifacts where report_id = p_report_id and engagement_id = p_engagement_id and artifact_version = p_artifact_version and artefact_type in ('supporting_register', 'board_readout', 'executive_presentation', 'workshop_material') and storage_status = 'VERIFIED' and release_state in ('verified', 'released');
  if v_count <> 4 then raise exception 'comprehensive_artifact_set_incomplete'; end if;
  update public.report_artifacts set release_state = 'released', released_by = p_actor_admin_user_id, released_at = pg_catalog.now(), updated_at = pg_catalog.now() where report_id = p_report_id and engagement_id = p_engagement_id and artifact_version = p_artifact_version and artefact_type in ('supporting_register', 'board_readout', 'executive_presentation', 'workshop_material');
  update public.reports set status = 'released', released_at = coalesce(released_at, pg_catalog.now()), updated_at = pg_catalog.now() where id = p_report_id;
  insert into public.audit_logs(actor_type, actor_user_id, assessment_id, entity_table, entity_id, action, after_json)
  values ('admin', p_actor_admin_user_id, v_report.assessment_id, 'comprehensive_engagements', p_engagement_id, 'comprehensive_artifact_set_finalised', pg_catalog.jsonb_build_object('report_id', p_report_id, 'artifact_version', p_artifact_version, 'required_secondary_artifacts', 4, 'primary_report_released', true));
  return pg_catalog.jsonb_build_object('ok', true, 'engagement_id', p_engagement_id, 'report_id', p_report_id, 'artifact_version', p_artifact_version);
end;
$$;

revoke all on function public.finalise_comprehensive_artifact_set(uuid, uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.finalise_comprehensive_artifact_set(uuid, uuid, integer, uuid) to service_role;

create or replace function public.comprehensive_engagement_state_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.state is distinct from old.state then
    if not public.comprehensive_engagement_transition_allowed(old.state, new.state) then raise exception 'comprehensive_engagement_invalid_transition: % -> %', old.state, new.state using errcode = 'check_violation'; end if;
    if new.state = 'review_complete' and not public.comprehensive_closure_ready(new.id) then raise exception 'comprehensive_engagement_closure_not_ready' using errcode = 'check_violation'; end if;
    if new.state = 'delivered' and not public.comprehensive_delivery_ready(new.id) then raise exception 'comprehensive_engagement_delivery_not_ready' using errcode = 'check_violation'; end if;
    new.state_version := old.state_version + 1;
    new.state_changed_at := now();
  else
    new.state_version := old.state_version;
    new.state_changed_at := old.state_changed_at;
  end if;
  if old.signed_off_by is not null and (new.signed_off_by is distinct from old.signed_off_by or new.signed_off_at is distinct from old.signed_off_at) and not (new.state = 'in_review' and new.signed_off_by is null and new.signed_off_at is null) then raise exception 'comprehensive_engagement_sign_off_immutable' using errcode = 'check_violation'; end if;
  if old.sign_off_statement is not null and new.sign_off_statement is distinct from old.sign_off_statement and new.signed_off_by is not null then raise exception 'comprehensive_engagement_sign_off_statement_immutable' using errcode = 'check_violation'; end if;
  if old.signed_off_artifact_version is not null and new.signed_off_artifact_version is distinct from old.signed_off_artifact_version and not (new.state = 'in_review' and new.signed_off_artifact_version is null) then raise exception 'comprehensive_engagement_sign_off_artifact_version_immutable' using errcode = 'check_violation'; end if;
  if old.reviewer_admin_user_id is not null and new.reviewer_admin_user_id is null then raise exception 'comprehensive_engagement_reviewer_cannot_be_unassigned' using errcode = 'check_violation'; end if;
  new.updated_at := now();
  return new;
end;
$$;

-- The prior immutable-artifact migration used pg_catalog.nullif inside the service-role guard.
-- NULLIF is a SQL special form, not a pg_catalog function; replaying the definition succeeds but
-- the first real RPC call would fail at execution. Re-emit that accepted function body with only
-- this qualification corrected, preserving its signature, checks and grants.
do $$
declare
  v_definition text;
begin
  select pg_catalog.replace(pg_catalog.pg_get_functiondef(p.oid), 'pg_catalog.nullif', 'nullif')
    into v_definition
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'complete_comprehensive_artifact'
  limit 1;
  if v_definition is null then raise exception 'complete_comprehensive_artifact_definition_missing'; end if;
  execute v_definition;
end;
$$;

-- Customer downloads use the same immutable audit binding for every released artefact in the
-- Comprehensive package. The older function remains unchanged in its original migration for
-- replay compatibility; this additive replacement expands only its closed vocabulary.
create or replace function public.record_customer_report_artefact_access(
  p_token_id uuid,
  p_order_id uuid,
  p_report_id uuid,
  p_success boolean,
  p_artefact_type text,
  p_reason text default null,
  p_technical_reference text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_type text := case when p_success then 'customer_report_accessed' else 'customer_report_access_failed' end;
  v_note text := case when p_success then 'Customer accessed the secure report link.'
    else 'Customer access failed: ' || coalesce(p_reason, 'unknown') || '.' end;
  v_metadata jsonb;
  v_token public.customer_report_access_tokens%rowtype;
begin
  if coalesce((nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb)->>'role', '') <> 'service_role' then
    raise exception 'customer_report_access_service_role_required';
  end if;
  if p_success is null then raise exception 'customer_report_access_success_required'; end if;
  if p_artefact_type is null or p_artefact_type not in ('pdf', 'supporting_register', 'board_readout', 'executive_presentation', 'workshop_material') then
    raise exception 'customer_report_access_artefact_type_invalid';
  end if;
  v_metadata := pg_catalog.jsonb_build_object(
    'token_id', p_token_id, 'technical_reference', p_technical_reference,
    'success', p_success, 'error_category', p_reason, 'artefact_type', p_artefact_type
  );
  if p_token_id is not null then
    select * into v_token from public.customer_report_access_tokens where id = p_token_id;
    if not found then raise exception 'customer_report_access_token_missing'; end if;
    if v_token.order_id is distinct from p_order_id or v_token.report_id is distinct from p_report_id then
      raise exception 'customer_report_access_binding_mismatch';
    end if;
  elsif p_order_id is not null or p_report_id is not null then
    raise exception 'customer_report_access_partial_binding';
  end if;
  if p_report_id is not null then
    insert into public.report_events(report_id, event_type, note, metadata_json)
    values (p_report_id, v_event_type, v_note, v_metadata);
  end if;
  if p_order_id is not null then
    insert into public.order_events(order_id, event_type, note, metadata_json)
    values (p_order_id, v_event_type, v_note, v_metadata);
  end if;
  insert into public.audit_logs(actor_type, entity_table, entity_id, action, after_json)
  values ('respondent_token', 'customer_report_access_tokens', p_token_id, v_event_type, v_metadata);
  return pg_catalog.jsonb_build_object('ok', true, 'event_type', v_event_type, 'actor_type', 'respondent_token', 'artefact_type', p_artefact_type, 'report_event_recorded', p_report_id is not null, 'order_event_recorded', p_order_id is not null);
end;
$$;

revoke all on function public.record_customer_report_artefact_access(uuid, uuid, uuid, boolean, text, text, text) from public, anon, authenticated;
grant execute on function public.record_customer_report_artefact_access(uuid, uuid, uuid, boolean, text, text, text) to service_role;

commit;
