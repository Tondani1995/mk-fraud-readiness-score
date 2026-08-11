-- Final two production-required corrections for Comprehensive package generation.
--
-- 1. AUTHORITATIVE TRANSITION CONTEXT
-- complete_comprehensive_package() inserts into public.report_events. That table carries
-- guard_phase14_authoritative_mutation(), which refuses any insert on a Phase-14-owned row unless
-- current_setting('phase14.authoritative_transition') is one of its closed allow-list values. The
-- function never set it, so every generation attempt aborted with
-- 'phase14_authoritative_rpc_required:report_events:INSERT' and the whole transaction rolled back:
-- no report row, no artefacts, no Comprehensive package on any environment.
--
-- The single behavioural change is one set_config() immediately before that insert, using
-- 'authenticated_rpc' -- a value already present in the guard's allow-list. The guard itself is not
-- touched, no new allow-list value is introduced, no Phase-14 control is weakened, and report
-- lifecycle behaviour is unchanged. set_config(..., true) is transaction-local, so the context does
-- not leak beyond this RPC.
--
-- 2. COMPREHENSIVE TEMPLATE SEED
-- generation-service.ts resolves report_templates where report_type='mk_validated' and
-- status='active'. No migration ever seeded that row, so reports.template_id came back null and the
-- insert failed its NOT NULL constraint. The row is codified here as migration-managed reference
-- data. The insert is idempotent: it is a no-op where an active mk_validated template already
-- exists (current Staging, registered by hand during UAT) and seeds it on a fresh environment. No
-- other template is touched, and the Essential template is left exactly as it is.

begin;

insert into public.report_templates (report_type, template_code, version_number, status, content_schema_json)
select 'mk_validated', 'comprehensive_v1', 1, 'active',
       jsonb_build_object(
         'engine', 'html-to-pdf',
         'notes', 'Comprehensive MK-validated engagement. Primary PDF plus four secondary artefacts registered atomically by complete_comprehensive_package().'
       )
where not exists (
  select 1 from public.report_templates
  where report_type = 'mk_validated' and status = 'active'
);

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
  v_expected_extension text;
begin
  if coalesce((nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb)->>'role', '') <> 'service_role' then raise exception 'comprehensive_package_service_role_required'; end if;
  if v_version < 1 or pg_catalog.jsonb_typeof(p_primary) <> 'object' or pg_catalog.jsonb_typeof(p_secondary) <> 'array' or pg_catalog.jsonb_array_length(p_secondary) <> 4 then raise exception 'comprehensive_package_manifest_invalid'; end if;
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

  -- THE CORRECTION. report_events carries guard_phase14_authoritative_mutation(); declare the
  -- authoritative context using an already allow-listed value. Transaction-local, so it does not
  -- leak past this RPC.
  perform set_config('phase14.authoritative_transition', 'authenticated_rpc', true);

  insert into public.report_events(report_id, event_type, from_status, to_status, actor_user_id, note)
  values (v_report.id, 'generated', 'IN_REVIEW', 'GENERATED', p_generated_by, 'Comprehensive package generated from persisted assessment and reviewer input.');

  for v_item in select value from pg_catalog.jsonb_array_elements(p_secondary) loop
    v_type := v_item->>'artefact_type';
    if v_type not in ('supporting_register', 'board_readout', 'executive_presentation', 'workshop_material') or v_type = any(v_seen) then raise exception 'comprehensive_package_secondary_manifest_invalid'; end if;
    v_seen := array_append(v_seen, v_type);
    v_object_id := (v_item->>'object_id')::uuid;
    v_expected_extension := case when v_type = 'supporting_register' then 'xlsx' when v_type = 'executive_presentation' then 'pptx' else 'pdf' end;
    if v_item->>'storage_bucket' <> 'comprehensive-reports'
       or v_item->>'storage_path' !~ ('^' || p_engagement_id::text || '/v' || v_version::text || '/' || v_object_id::text || '\.' || v_expected_extension || '$')
       or coalesce((v_item->>'file_size_bytes')::bigint, 0) <= 0
       or v_item->>'checksum' !~ '^[0-9a-f]{64}$'
       or (v_type = 'supporting_register' and v_item->>'mime_type' <> 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
       or (v_type = 'executive_presentation' and v_item->>'mime_type' <> 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
       or (v_type in ('board_readout', 'workshop_material') and v_item->>'mime_type' <> 'application/pdf') then raise exception 'comprehensive_package_secondary_invalid'; end if;
    insert into public.report_artifacts(id, report_id, engagement_id, artefact_type, storage_bucket, storage_path, checksum_sha256, file_name, mime_type, file_size_bytes, storage_status, storage_verified_at, artifact_version, release_state)
    values (v_object_id, v_report.id, p_engagement_id, v_type, v_item->>'storage_bucket', v_item->>'storage_path', v_item->>'checksum', v_item->>'file_name', v_item->>'mime_type', (v_item->>'file_size_bytes')::bigint, 'VERIFIED', pg_catalog.now(), v_version, 'verified');
  end loop;
  if cardinality(v_seen) <> 4 then raise exception 'comprehensive_package_secondary_set_incomplete'; end if;
  insert into public.audit_logs(actor_type, actor_user_id, assessment_id, entity_table, entity_id, action, after_json)
  values ('admin', p_generated_by, v_assessment.id, 'reports', v_report.id, 'comprehensive_package_generated', pg_catalog.jsonb_build_object('engagement_id', p_engagement_id, 'artifact_version', v_version, 'secondary_count', 4));
  return pg_catalog.jsonb_build_object('ok', true, 'report_id', v_report.id, 'artifact_version', v_version, 'secondary_count', 4);
end;
$$;

revoke all on function public.complete_comprehensive_package(uuid, uuid, uuid, integer, jsonb, jsonb, uuid) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.complete_comprehensive_package(uuid, uuid, uuid, integer, jsonb, jsonb, uuid) to service_role';
  end if;
end $$;

-- Verification ------------------------------------------------------------------------------------

do $$
declare
  v_def text;
  v_templates int;
  v_essential int;
  v_writable int;
begin
  select pg_catalog.pg_get_functiondef(p.oid) into v_def
  from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'complete_comprehensive_package';
  if v_def is null then raise exception 'comprehensive_package_fix_function_missing'; end if;

  -- The authoritative context must be declared, and it must use an allow-listed value.
  if v_def !~ 'phase14\.authoritative_transition' then
    raise exception 'comprehensive_package_fix_context_not_set';
  end if;
  if v_def !~ 'authenticated_rpc' then
    raise exception 'comprehensive_package_fix_context_value_unexpected';
  end if;

  -- The guarded path itself must survive: still SECURITY DEFINER, still service-role gated, still
  -- writing the generated report event.
  if not exists (
    select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'complete_comprehensive_package' and p.prosecdef
  ) then raise exception 'comprehensive_package_fix_must_remain_security_definer'; end if;
  if v_def !~ 'comprehensive_package_service_role_required'
     or v_def !~ 'public\.report_events'
     or v_def !~ 'comprehensive_package_secondary_set_incomplete' then
    raise exception 'comprehensive_package_fix_dropped_a_control';
  end if;

  -- The guard is untouched and still enforces its closed allow-list.
  if not exists (
    select 1 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'guard_phase14_authoritative_mutation'
      and pg_catalog.pg_get_functiondef(p.oid) like '%phase14_authoritative_rpc_required%'
  ) then raise exception 'comprehensive_package_fix_guard_altered'; end if;

  -- Exactly one active Comprehensive template, and the Essential template is untouched.
  select count(*) into v_templates from public.report_templates where report_type = 'mk_validated' and status = 'active';
  if v_templates <> 1 then raise exception 'comprehensive_template_seed_not_singular: %', v_templates; end if;
  select count(*) into v_essential from public.report_templates where report_type = 'essential_self_assessment' and template_code = 'phase10_premium_v2' and status = 'active';
  if v_essential <> 1 then raise exception 'comprehensive_template_seed_disturbed_essential'; end if;

  -- No broad write privilege was introduced on the catalogue of templates.
  select count(*) into v_writable
  from information_schema.role_table_grants
  where table_schema = 'public' and table_name = 'report_templates'
    and grantee in ('anon', 'authenticated') and privilege_type in ('INSERT', 'UPDATE', 'DELETE');
  if v_writable > 0 then raise exception 'comprehensive_template_seed_widened_privileges: %', v_writable; end if;
end $$;

commit;
