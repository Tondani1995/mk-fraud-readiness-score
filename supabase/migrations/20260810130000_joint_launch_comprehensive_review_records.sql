-- Joint launch: persisted Comprehensive human-review records and fail-closed artefact release.
--
-- This migration is intentionally additive and is ordered after 20260810125000. It does not alter
-- payment verification, evidence statuses, the existing report-access authority, or the existing
-- Essential fulfilment path. Human judgement is stored separately from evidence validation status.

begin;

create table if not exists public.comprehensive_review_records (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.comprehensive_engagements(id) on delete cascade,
  record_type text not null,
  subject_key text not null,
  reviewer_admin_user_id uuid not null references public.admin_profiles(id) on delete restrict,
  reviewer_conclusion text not null,
  reviewer_observation text,
  evidence_refs jsonb not null default '[]'::jsonb,
  decision_options jsonb not null default '[]'::jsonb,
  management_action jsonb not null default '{}'::jsonb,
  record_version integer not null default 1 check (record_version >= 1),
  created_by uuid not null references public.admin_profiles(id) on delete restrict,
  updated_by uuid not null references public.admin_profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comprehensive_review_records_type_chk check (
    record_type in ('finding', 'risk', 'control_design', 'decision', 'management_action')
  ),
  constraint comprehensive_review_records_subject_chk check (length(btrim(subject_key)) between 1 and 200),
  constraint comprehensive_review_records_conclusion_chk check (length(btrim(reviewer_conclusion)) between 1 and 4000),
  constraint comprehensive_review_records_evidence_refs_array_chk check (jsonb_typeof(evidence_refs) = 'array'),
  constraint comprehensive_review_records_decision_options_array_chk check (jsonb_typeof(decision_options) = 'array'),
  constraint comprehensive_review_records_management_action_object_chk check (jsonb_typeof(management_action) = 'object'),
  unique (engagement_id, record_type, subject_key)
);

create index if not exists comprehensive_review_records_engagement_idx
  on public.comprehensive_review_records(engagement_id, record_type, subject_key);
create index if not exists comprehensive_review_records_reviewer_idx
  on public.comprehensive_review_records(reviewer_admin_user_id);

create table if not exists public.comprehensive_review_record_events (
  id uuid primary key default gen_random_uuid(),
  record_id uuid not null references public.comprehensive_review_records(id) on delete cascade,
  engagement_id uuid not null references public.comprehensive_engagements(id) on delete cascade,
  record_type text not null,
  subject_key text not null,
  action text not null check (action in ('created', 'updated')),
  actor_admin_user_id uuid not null references public.admin_profiles(id) on delete restrict,
  from_version integer,
  to_version integer not null,
  before_json jsonb,
  after_json jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists comprehensive_review_record_events_record_idx
  on public.comprehensive_review_record_events(record_id, created_at desc);
create index if not exists comprehensive_review_record_events_engagement_idx
  on public.comprehensive_review_record_events(engagement_id, created_at desc);

create or replace function public.comprehensive_review_record_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_engagement public.comprehensive_engagements%rowtype;
begin
  select * into v_engagement from public.comprehensive_engagements where id = new.engagement_id;
  if not found then raise exception 'comprehensive_review_engagement_not_found'; end if;
  if v_engagement.reviewer_admin_user_id is null
     or new.reviewer_admin_user_id is distinct from v_engagement.reviewer_admin_user_id then
    raise exception 'comprehensive_review_reviewer_not_assigned' using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.engagement_id is distinct from old.engagement_id
       or new.record_type is distinct from old.record_type
       or new.subject_key is distinct from old.subject_key
       or new.created_by is distinct from old.created_by
       or new.created_at is distinct from old.created_at
       or new.record_version <> old.record_version + 1 then
      raise exception 'comprehensive_review_record_identity_or_version_invalid' using errcode = 'check_violation';
    end if;
  else
    if new.record_version <> 1 then
      raise exception 'comprehensive_review_record_initial_version_invalid' using errcode = 'check_violation';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_comprehensive_review_record_guard') then
    create trigger trg_comprehensive_review_record_guard
      before insert or update on public.comprehensive_review_records
      for each row execute function public.comprehensive_review_record_guard();
  end if;
end $$;

create or replace function public.comprehensive_review_record_event_append_only()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'comprehensive_review_record_events_are_append_only' using errcode = 'check_violation';
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_comprehensive_review_record_events_append_only') then
    create trigger trg_comprehensive_review_record_events_append_only
      before update or delete on public.comprehensive_review_record_events
      for each row execute function public.comprehensive_review_record_event_append_only();
  end if;
end $$;

create or replace function public.comprehensive_review_record_audit()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  insert into public.comprehensive_review_record_events(
    record_id, engagement_id, record_type, subject_key, action,
    actor_admin_user_id, from_version, to_version, before_json, after_json
  ) values (
    new.id, new.engagement_id, new.record_type, new.subject_key,
    case when tg_op = 'INSERT' then 'created' else 'updated' end,
    new.updated_by,
    case when tg_op = 'INSERT' then null else old.record_version end,
    new.record_version,
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    to_jsonb(new)
  );
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_comprehensive_review_record_audit') then
    create trigger trg_comprehensive_review_record_audit
      after insert or update on public.comprehensive_review_records
      for each row execute function public.comprehensive_review_record_audit();
  end if;
end $$;

alter table public.comprehensive_review_records enable row level security;
alter table public.comprehensive_review_record_events enable row level security;
revoke all on public.comprehensive_review_records from public, anon, authenticated;
revoke all on public.comprehensive_review_record_events from public, anon, authenticated;
grant select, insert, update on public.comprehensive_review_records to service_role;
revoke all on public.comprehensive_review_record_events from service_role;

-- Comprehensive deliverables are version-exact. Existing Essential register/board rows remain
-- valid; only new Comprehensive rows need the engagement binding and release state.
alter table public.report_artifacts add column if not exists engagement_id uuid references public.comprehensive_engagements(id) on delete cascade;
alter table public.report_artifacts add column if not exists artifact_version integer not null default 1;
alter table public.report_artifacts add column if not exists release_state text not null default 'verified';
alter table public.report_artifacts add column if not exists released_by uuid references public.admin_profiles(id) on delete set null;
alter table public.report_artifacts add column if not exists released_at timestamptz;
alter table public.comprehensive_engagements add column if not exists signed_off_artifact_version integer;

alter table public.report_artifacts drop constraint if exists report_artifacts_type_chk;
alter table public.report_artifacts add constraint report_artifacts_type_chk check (
  artefact_type in ('supporting_register', 'board_readout', 'executive_presentation', 'workshop_material')
);
alter table public.report_artifacts drop constraint if exists report_artifacts_release_state_chk;
alter table public.report_artifacts add constraint report_artifacts_release_state_chk check (
  release_state in ('verified', 'released', 'superseded')
);
alter table public.report_artifacts drop constraint if exists report_artifacts_version_chk;
alter table public.report_artifacts add constraint report_artifacts_version_chk check (artifact_version >= 1);
update public.comprehensive_engagements
set signed_off_artifact_version = 1
where state in ('review_complete', 'delivered') and signed_off_artifact_version is null;
alter table public.comprehensive_engagements drop constraint if exists comprehensive_engagements_sign_off_artifact_version_chk;
alter table public.comprehensive_engagements add constraint comprehensive_engagements_sign_off_artifact_version_chk check (
  state not in ('review_complete', 'delivered') or signed_off_artifact_version is not null
);

create index if not exists report_artifacts_engagement_idx
  on public.report_artifacts(engagement_id, artefact_type, artifact_version);

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'comprehensive-reports', 'comprehensive-reports', false, 52428800,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.comprehensive_report_artifact_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE' and old.storage_status in ('VERIFIED', 'MISSING', 'FAILED') then
    if new.report_id is distinct from old.report_id
       or new.engagement_id is distinct from old.engagement_id
       or new.artefact_type is distinct from old.artefact_type
       or new.artifact_version is distinct from old.artifact_version
       or new.storage_bucket is distinct from old.storage_bucket
       or new.storage_path is distinct from old.storage_path
       or new.checksum_sha256 is distinct from old.checksum_sha256
       or new.file_name is distinct from old.file_name
       or new.mime_type is distinct from old.mime_type
       or new.file_size_bytes is distinct from old.file_size_bytes then
      raise exception 'comprehensive_report_artifact_version_immutable' using errcode = 'check_violation';
    end if;
  end if;
  if new.artefact_type in ('executive_presentation', 'workshop_material', 'board_readout', 'supporting_register')
     and new.engagement_id is not null
     and new.release_state = 'released'
     and (new.released_by is null or new.released_at is null) then
    raise exception 'comprehensive_report_artifact_release_actor_required' using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_comprehensive_report_artifact_guard') then
    create trigger trg_comprehensive_report_artifact_guard
      before insert or update on public.report_artifacts
      for each row execute function public.comprehensive_report_artifact_guard();
  end if;
end $$;

create or replace function public.comprehensive_required_review_records_present(p_engagement_id uuid)
returns boolean
language sql
stable
set search_path = pg_catalog, public
as $$
  select coalesce((
    select count(distinct record_type) = 5
    from public.comprehensive_review_records
    where engagement_id = p_engagement_id
      and length(btrim(reviewer_conclusion)) > 0
  ), false);
$$;

create or replace function public.comprehensive_required_artifacts_present(p_engagement_id uuid)
returns boolean
language sql
stable
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.comprehensive_engagements e
    join public.reports r on r.order_id = e.order_id
    where e.id = p_engagement_id
      and r.report_type = 'mk_validated'
      and r.status in ('approved', 'released')
      and r.storage_status = 'VERIFIED'
      and r.storage_bucket is not null and r.storage_path is not null
      and r.checksum is not null and r.mime_type = 'application/pdf'
      and coalesce(r.file_size_bytes, 0) > 0
      and (
        select count(*)
        from public.report_artifacts a
        where a.report_id = r.id
          and a.engagement_id = e.id
          and a.artefact_type in ('supporting_register', 'board_readout', 'executive_presentation', 'workshop_material')
          and a.storage_status = 'VERIFIED'
          and a.release_state in ('verified', 'released')
          and a.checksum_sha256 ~ '^[0-9a-f]{64}$'
          and coalesce(a.file_size_bytes, 0) > 0
      ) = 4
  );
$$;

create or replace function public.comprehensive_closure_ready(p_engagement_id uuid)
returns boolean
language sql
stable
set search_path = pg_catalog, public
as $$
  select public.comprehensive_required_review_records_present(p_engagement_id)
     and public.comprehensive_required_artifacts_present(p_engagement_id);
$$;

create or replace function public.complete_comprehensive_artifact(
  p_engagement_id uuid,
  p_report_id uuid,
  p_artefact_type text,
  p_storage_bucket text,
  p_storage_path text,
  p_file_name text,
  p_mime_type text,
  p_file_size_bytes bigint,
  p_checksum_sha256 text,
  p_artifact_version integer default 1
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_engagement public.comprehensive_engagements%rowtype;
  v_report public.reports%rowtype;
  v_existing public.report_artifacts%rowtype;
  v_row public.report_artifacts%rowtype;
begin
  if coalesce((pg_catalog.nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb)->>'role', '') <> 'service_role' then
    raise exception 'comprehensive_artifact_service_role_required';
  end if;
  if p_artefact_type not in ('supporting_register', 'board_readout', 'executive_presentation', 'workshop_material') then
    raise exception 'comprehensive_artifact_type_invalid';
  end if;
  if p_storage_bucket <> 'comprehensive-reports'
     or p_storage_path !~ '^[0-9a-f-]{36}/v[0-9]+/[0-9a-f-]{36}\.[a-z0-9]+$' then
    raise exception 'comprehensive_artifact_storage_binding_invalid';
  end if;
  if coalesce(p_file_size_bytes, 0) <= 0 or p_file_size_bytes > 52428800
     or p_checksum_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'comprehensive_artifact_integrity_metadata_invalid';
  end if;

  select * into v_engagement from public.comprehensive_engagements where id = p_engagement_id;
  if not found then raise exception 'comprehensive_artifact_engagement_not_found'; end if;
  select * into v_report from public.reports where id = p_report_id;
  if not found or v_report.order_id is distinct from v_engagement.order_id then
    raise exception 'comprehensive_artifact_report_binding_mismatch';
  end if;
  if p_artefact_type = 'supporting_register' and p_mime_type <> 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' then
    raise exception 'comprehensive_artifact_register_mime_invalid';
  end if;
  if p_artefact_type = 'executive_presentation' and p_mime_type <> 'application/vnd.openxmlformats-officedocument.presentationml.presentation' then
    raise exception 'comprehensive_artifact_presentation_mime_invalid';
  end if;
  if p_artefact_type in ('board_readout', 'workshop_material') and p_mime_type <> 'application/pdf' then
    raise exception 'comprehensive_artifact_pdf_mime_invalid';
  end if;

  select * into v_existing from public.report_artifacts
  where report_id = p_report_id and artefact_type = p_artefact_type for update;
  if found then
    if v_existing.storage_status = 'VERIFIED' then
      if v_existing.engagement_id = p_engagement_id
         and v_existing.artifact_version = p_artifact_version
         and v_existing.storage_path = p_storage_path
         and v_existing.checksum_sha256 = p_checksum_sha256
         and v_existing.file_size_bytes = p_file_size_bytes then
        return pg_catalog.jsonb_build_object('ok', true, 'created', false, 'artifact_id', v_existing.id, 'artifact_version', v_existing.artifact_version);
      end if;
      raise exception 'comprehensive_artifact_version_already_verified';
    end if;
    raise exception 'comprehensive_artifact_rewrite_requires_new_report_version';
  end if;

  insert into public.report_artifacts(
    report_id, engagement_id, artefact_type, storage_bucket, storage_path,
    checksum_sha256, file_name, mime_type, file_size_bytes, storage_status,
    storage_verified_at, artifact_version, release_state
  ) values (
    p_report_id, p_engagement_id, p_artefact_type, p_storage_bucket, p_storage_path,
    p_checksum_sha256, p_file_name, p_mime_type, p_file_size_bytes, 'VERIFIED',
    pg_catalog.now(), p_artifact_version, 'verified'
  ) returning * into v_row;

  insert into public.audit_logs(actor_type, assessment_id, entity_table, entity_id, action, after_json)
  values ('system', v_report.assessment_id, 'report_artifacts', v_row.id, 'comprehensive_artifact_completed',
    pg_catalog.jsonb_build_object('engagement_id', p_engagement_id, 'report_id', p_report_id, 'artefact_type', p_artefact_type, 'artifact_version', p_artifact_version, 'checksum_sha256', p_checksum_sha256, 'file_size_bytes', p_file_size_bytes));
  return pg_catalog.jsonb_build_object('ok', true, 'created', true, 'artifact_id', v_row.id, 'artifact_version', p_artifact_version);
end;
$$;

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
  if coalesce((pg_catalog.nullif(pg_catalog.current_setting('request.jwt.claims', true), '')::jsonb)->>'role', '') <> 'service_role' then
    raise exception 'comprehensive_artifact_release_service_role_required';
  end if;
  select * into v_engagement from public.comprehensive_engagements where id = p_engagement_id for update;
  if not found then raise exception 'comprehensive_artifact_engagement_not_found'; end if;
  select * into v_report from public.reports where id = p_report_id for share;
  if not found or v_report.order_id is distinct from v_engagement.order_id then raise exception 'comprehensive_artifact_report_binding_mismatch'; end if;
  if v_report.status not in ('approved', 'released') or v_report.storage_status <> 'VERIFIED' or v_report.mime_type <> 'application/pdf' then
    raise exception 'comprehensive_artifact_primary_report_not_ready';
  end if;
  if not public.comprehensive_required_review_records_present(p_engagement_id) then
    raise exception 'comprehensive_artifact_human_review_incomplete';
  end if;
  select count(*) into v_count from public.report_artifacts
  where report_id = p_report_id and engagement_id = p_engagement_id and artifact_version = p_artifact_version
    and artefact_type in ('supporting_register', 'board_readout', 'executive_presentation', 'workshop_material')
    and storage_status = 'VERIFIED' and release_state = 'verified';
  if v_count <> 4 then raise exception 'comprehensive_artifact_set_incomplete'; end if;
  update public.report_artifacts
  set release_state = 'released', released_by = p_actor_admin_user_id, released_at = pg_catalog.now(), updated_at = pg_catalog.now()
  where report_id = p_report_id and engagement_id = p_engagement_id and artifact_version = p_artifact_version
    and artefact_type in ('supporting_register', 'board_readout', 'executive_presentation', 'workshop_material');
  insert into public.audit_logs(actor_type, actor_user_id, assessment_id, entity_table, entity_id, action, after_json)
  values ('admin', p_actor_admin_user_id, v_report.assessment_id, 'comprehensive_engagements', p_engagement_id, 'comprehensive_artifact_set_finalised',
    pg_catalog.jsonb_build_object('report_id', p_report_id, 'artifact_version', p_artifact_version, 'required_secondary_artifacts', 4));
  return pg_catalog.jsonb_build_object('ok', true, 'engagement_id', p_engagement_id, 'report_id', p_report_id, 'artifact_version', p_artifact_version);
end;
$$;

revoke all on function public.complete_comprehensive_artifact(uuid, uuid, text, text, text, text, text, bigint, text, integer) from public, anon, authenticated;
grant execute on function public.complete_comprehensive_artifact(uuid, uuid, text, text, text, text, text, bigint, text, integer) to service_role;
revoke all on function public.finalise_comprehensive_artifact_set(uuid, uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.finalise_comprehensive_artifact_set(uuid, uuid, integer, uuid) to service_role;

-- Preserve the accepted engagement transition graph and add the mandatory human-review and
-- artefact gate. This applies to service-role writes too, so no client or worker can bypass it.
create or replace function public.comprehensive_engagement_state_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.state is distinct from old.state then
    if not public.comprehensive_engagement_transition_allowed(old.state, new.state) then
      raise exception 'comprehensive_engagement_invalid_transition: % -> %', old.state, new.state using errcode = 'check_violation';
    end if;
    if new.state in ('review_complete', 'delivered') and not public.comprehensive_closure_ready(new.id) then
      raise exception 'comprehensive_engagement_closure_not_ready' using errcode = 'check_violation';
    end if;
    new.state_version := old.state_version + 1;
    new.state_changed_at := now();
  else
    new.state_version := old.state_version;
    new.state_changed_at := old.state_changed_at;
  end if;

  if old.signed_off_by is not null
     and (new.signed_off_by is distinct from old.signed_off_by or new.signed_off_at is distinct from old.signed_off_at)
     and not (new.state = 'in_review' and new.signed_off_by is null and new.signed_off_at is null) then
    raise exception 'comprehensive_engagement_sign_off_immutable' using errcode = 'check_violation';
  end if;
  if old.sign_off_statement is not null
     and new.sign_off_statement is distinct from old.sign_off_statement
     and new.signed_off_by is not null then
    raise exception 'comprehensive_engagement_sign_off_statement_immutable' using errcode = 'check_violation';
  end if;
  if old.signed_off_artifact_version is not null
     and new.signed_off_artifact_version is distinct from old.signed_off_artifact_version
     and not (new.state = 'in_review' and new.signed_off_artifact_version is null) then
    raise exception 'comprehensive_engagement_sign_off_artifact_version_immutable' using errcode = 'check_violation';
  end if;
  if old.reviewer_admin_user_id is not null and new.reviewer_admin_user_id is null then
    raise exception 'comprehensive_engagement_reviewer_cannot_be_unassigned' using errcode = 'check_violation';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

commit;
