-- Final pre-staging closure: persist the deterministic reviewer subject authority and make the
-- five-artefact Comprehensive package one immutable database transaction.

begin;

alter table public.comprehensive_evidence_items
  add column if not exists analytical_evidence_refs jsonb not null default '[]'::jsonb;
alter table public.comprehensive_evidence_items
  drop constraint if exists comprehensive_evidence_items_analytical_refs_array_chk;
alter table public.comprehensive_evidence_items
  add constraint comprehensive_evidence_items_analytical_refs_array_chk
  check (jsonb_typeof(analytical_evidence_refs) = 'array');

create table if not exists public.comprehensive_review_subject_catalog (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.comprehensive_engagements(id) on delete cascade,
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  score_run_id uuid not null references public.score_runs(id) on delete restrict,
  subject_type text not null check (subject_type in ('finding', 'risk', 'control_design', 'decision', 'management_action')),
  subject_key text not null check (length(btrim(subject_key)) between 1 and 200),
  title text not null check (length(btrim(title)) between 1 and 1000),
  detail text not null default '',
  domain text,
  materiality numeric,
  priority text,
  evidence_refs jsonb not null default '[]'::jsonb check (jsonb_typeof(evidence_refs) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (engagement_id, subject_type, subject_key, score_run_id)
);

create index if not exists comprehensive_review_subject_catalog_lookup_idx
  on public.comprehensive_review_subject_catalog(engagement_id, subject_type, subject_key, score_run_id);

alter table public.comprehensive_review_subject_catalog enable row level security;
revoke all on public.comprehensive_review_subject_catalog from public, anon, authenticated;
grant select, insert, update on public.comprehensive_review_subject_catalog to service_role;

-- Extend the existing closed operational-alert allow-list for a failed Comprehensive package
-- compensation. The payload remains identifier/path-only; no customer or content data is stored.
create or replace function public.record_phase14_operational_alert(
  p_alert_key text,
  p_category text,
  p_report_id uuid default null,
  p_email_event_id uuid default null,
  p_detail_json jsonb default '{}'::jsonb,
  p_severity text default 'critical'
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'phase14_service_role_required'; end if;
  if coalesce(trim(p_alert_key),'') = '' or length(p_alert_key) > 300 then raise exception 'phase14_alert_key_invalid'; end if;
  if p_category not in (
    'report_download_object_missing','report_download_object_size_invalid',
    'report_download_checksum_mismatch','report_email_checksum_mismatch',
    'report_temporary_object_cleanup_failed','storage_cleanup_verification_failed',
    'comprehensive_evidence_orphan_object','comprehensive_package_orphan_object'
  ) then raise exception 'phase14_alert_category_invalid'; end if;
  if p_severity not in ('warning','critical') then raise exception 'phase14_alert_severity_invalid'; end if;
  perform set_config('phase14.authoritative_transition', 'operational_alert_rpc', true);
  insert into public.phase14_operational_alerts(alert_key,severity,category,report_id,email_event_id,detail_json,status)
  values (p_alert_key,p_severity,p_category,p_report_id,p_email_event_id,coalesce(p_detail_json,'{}'::jsonb),'open')
  on conflict (alert_key) do update set severity = excluded.severity, detail_json = excluded.detail_json, status = 'open'
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.comprehensive_required_review_records_present(p_engagement_id uuid)
returns boolean
language sql
stable
set search_path = pg_catalog, public
as $$
  select coalesce((
    select count(distinct r.record_type) = 5
      and bool_and(
        jsonb_typeof(r.evidence_refs) = 'array'
        and jsonb_array_length(r.evidence_refs) > 0
        and not exists (
          select 1
          from jsonb_array_elements_text(r.evidence_refs) ref
          where not exists (
            select 1
            from public.comprehensive_review_subject_catalog s2
            where s2.engagement_id = e.id
              and s2.assessment_id = e.assessment_id
              and s2.score_run_id = a.current_score_run_id
              and s2.subject_type = r.record_type
              and s2.subject_key = r.subject_key
              and s2.evidence_refs ? ref
          )
        )
        and (
          r.record_type <> 'finding'
          or (
            jsonb_array_length(r.evidence_refs) > 0
            and not exists (
              select 1
              from jsonb_array_elements_text(r.evidence_refs) ref
              where not exists (
                select 1
                from public.comprehensive_evidence_items ei
                where ei.engagement_id = e.id
                  and ei.analytical_evidence_refs ? ref
                  and ei.validation_status in ('reviewed', 'supported', 'not_supported', 'insufficient', 'not_applicable')
              )
            )
          )
        )
      )
    from public.comprehensive_review_records r
    join public.comprehensive_engagements e on e.id = r.engagement_id
    join public.assessments a on a.id = e.assessment_id
    join public.comprehensive_review_subject_catalog s
      on s.engagement_id = e.id
     and s.assessment_id = e.assessment_id
     and s.score_run_id = a.current_score_run_id
     and s.subject_type = r.record_type
     and s.subject_key = r.subject_key
    where r.engagement_id = p_engagement_id
      and length(btrim(r.reviewer_conclusion)) > 0
  ), false);
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
grant execute on function public.complete_comprehensive_package(uuid, uuid, uuid, integer, jsonb, jsonb, uuid) to service_role;

drop function if exists public.complete_comprehensive_artifact(uuid, uuid, text, text, text, text, text, bigint, text, integer);

commit;
