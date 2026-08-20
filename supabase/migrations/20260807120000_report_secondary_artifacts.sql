-- Generic secondary report artefacts.
--
-- Additive only. public.reports and its existing single PDF artefact columns
-- (storage_bucket / storage_path / checksum / file_name / mime_type /
-- file_size_bytes / storage_status / storage_verified_at) are untouched, and every
-- existing RPC signature is left exactly as accepted. A report with zero secondary
-- artefacts behaves precisely as it does today.
--
-- Why a separate table rather than register_* columns on public.reports:
--   * the supporting register is the first of several planned secondary artefacts
--     (board readout and other Comprehensive supporting artefacts follow), and a
--     column-per-artefact model would require a schema redesign for each one;
--   * public.reports rows are already version-scoped (one row per report version,
--     with supersedes_report_id lineage), so report_id is a version-exact parent key
--     and no additional version column is required here;
--   * report_type must keep describing the commercial report, not its file set.
--
-- Vocabulary is closed and fail-closed via a check constraint rather than a new enum:
-- extending a check constraint is a trivial additive migration, whereas
-- `alter type ... add value` is irreversible and has transaction restrictions.

begin;

create table if not exists public.report_artifacts (
  id uuid primary key default gen_random_uuid(),
  report_id uuid not null references public.reports(id) on delete cascade,
  artefact_type text not null,
  storage_bucket text not null,
  storage_path text not null,
  checksum_sha256 text not null,
  file_name text not null,
  mime_type text not null,
  file_size_bytes bigint not null,
  storage_status text not null default 'PENDING',
  storage_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint report_artifacts_type_chk
    check (artefact_type in ('supporting_register', 'board_readout')),
  constraint report_artifacts_checksum_chk
    check (checksum_sha256 ~ '^[0-9a-f]{64}$'),
  constraint report_artifacts_status_chk
    check (storage_status in ('PENDING', 'VERIFIED', 'MISSING', 'FAILED')),
  constraint report_artifacts_size_chk
    check (file_size_bytes > 0),
  constraint report_artifacts_bucket_chk
    check (length(btrim(storage_bucket)) > 0 and length(btrim(storage_path)) > 0)
);

-- One artefact of each type per report version. reports.id is already version-exact,
-- so this is the report-version-scoped uniqueness the contract requires.
create unique index if not exists report_artifacts_report_type_uidx
  on public.report_artifacts(report_id, artefact_type);

create index if not exists report_artifacts_report_idx
  on public.report_artifacts(report_id);

comment on table public.report_artifacts is
  'Secondary customer-deliverable artefacts belonging to a specific report version. The primary report PDF remains on public.reports and is not represented here.';

alter table public.report_artifacts enable row level security;
revoke all on public.report_artifacts from public, anon, authenticated;
grant select on public.report_artifacts to service_role;

-- Authoritative-state table: participates in the RC1 operational freeze exactly like
-- every other artefact/delivery table.
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_trigger t
    join pg_catalog.pg_class c on c.oid = t.tgrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'report_artifacts'
      and t.tgname = 'trg_rc1_operation_freeze'
  ) then
    create trigger trg_rc1_operation_freeze
      before insert or update or delete on public.report_artifacts
      for each row execute function public.rc1_guard_authoritative_mutation();
  end if;
end $$;

-- Closed customer-delivery vocabulary. Fail-closed: anything not named here is never
-- served to a customer, whatever the application layer asks for.
create or replace function public.report_artifact_customer_deliverable(p_artefact_type text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(p_artefact_type, '') in ('supporting_register');
$$;

revoke all on function public.report_artifact_customer_deliverable(text)
  from public, anon, authenticated;
grant execute on function public.report_artifact_customer_deliverable(text) to service_role;

-- Explicit additive write path. Deliberately NOT an overload of
-- complete_manual_report_generation(): that accepted signature stays untouched.
--
-- Fail-closed, report-bound, service-role only, and idempotent under the existing
-- report-version rules -- a repeated call for the same (report_id, artefact_type)
-- with identical storage identity and checksum succeeds and returns the same row,
-- while a conflicting rewrite of an already-verified artefact is rejected.
create or replace function public.complete_report_secondary_artefact(
  p_report_id uuid,
  p_artefact_type text,
  p_storage_bucket text,
  p_storage_path text,
  p_file_name text,
  p_mime_type text,
  p_file_size_bytes bigint,
  p_checksum_sha256 text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.reports%rowtype;
  v_existing public.report_artifacts%rowtype;
  v_row public.report_artifacts%rowtype;
begin
  if coalesce(pg_catalog.current_setting('request.jwt.claims', true), '') <> ''
     and coalesce((pg_catalog.current_setting('request.jwt.claims', true)::jsonb)->>'role', '') <> 'service_role' then
    raise exception 'report_artifact_service_role_required';
  end if;

  select * into v_report from public.reports where id = p_report_id for share;
  if not found then raise exception 'report_artifact_report_not_found'; end if;

  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conname = 'report_artifacts_type_chk'
  ) then
    raise exception 'report_artifact_vocabulary_missing';
  end if;

  select * into v_existing
  from public.report_artifacts
  where report_id = p_report_id and artefact_type = p_artefact_type
  for update;

  if found then
    -- Idempotent replay of the identical artefact.
    if v_existing.storage_bucket = p_storage_bucket
       and v_existing.storage_path = p_storage_path
       and v_existing.checksum_sha256 = p_checksum_sha256
       and v_existing.file_size_bytes = p_file_size_bytes then
      update public.report_artifacts
      set storage_status = 'VERIFIED',
          storage_verified_at = coalesce(storage_verified_at, now()),
          updated_at = now()
      where id = v_existing.id
      returning * into v_row;
      return pg_catalog.jsonb_build_object('artifact', pg_catalog.to_jsonb(v_row), 'created', false);
    end if;
    -- A verified artefact is immutable; a new report version gets a new report row.
    if v_existing.storage_status = 'VERIFIED' then
      raise exception 'report_artifact_already_verified';
    end if;
    update public.report_artifacts
    set storage_bucket = p_storage_bucket,
        storage_path = p_storage_path,
        checksum_sha256 = p_checksum_sha256,
        file_name = p_file_name,
        mime_type = p_mime_type,
        file_size_bytes = p_file_size_bytes,
        storage_status = 'VERIFIED',
        storage_verified_at = now(),
        updated_at = now()
    where id = v_existing.id
    returning * into v_row;
    return pg_catalog.jsonb_build_object('artifact', pg_catalog.to_jsonb(v_row), 'created', false);
  end if;

  insert into public.report_artifacts(
    report_id, artefact_type, storage_bucket, storage_path, checksum_sha256,
    file_name, mime_type, file_size_bytes, storage_status, storage_verified_at
  ) values (
    p_report_id, p_artefact_type, p_storage_bucket, p_storage_path, p_checksum_sha256,
    p_file_name, p_mime_type, p_file_size_bytes, 'VERIFIED', now()
  )
  returning * into v_row;

  insert into public.audit_logs(
    actor_type, assessment_id, entity_table, entity_id, action, after_json
  ) values (
    'system', v_report.assessment_id, 'report_artifacts', v_row.id,
    'report_secondary_artefact_completed',
    pg_catalog.jsonb_build_object(
      'report_id', p_report_id,
      'artefact_type', p_artefact_type,
      'checksum_sha256', p_checksum_sha256,
      'file_size_bytes', p_file_size_bytes
    )
  );

  return pg_catalog.jsonb_build_object('artifact', pg_catalog.to_jsonb(v_row), 'created', true);
end;
$$;

revoke all on function public.complete_report_secondary_artefact(
  uuid, text, text, text, text, text, bigint, text
) from public, anon, authenticated;
grant execute on function public.complete_report_secondary_artefact(
  uuid, text, text, text, text, text, bigint, text
) to service_role;

-- Customer access audit: NO schema change is required.
--
-- record_customer_report_access() already writes structured metadata_json into
-- public.report_events, public.order_events and public.audit_logs. That existing
-- structured metadata is sufficient to record which artefact of an already-authorised
-- report was served, so the accepted audit control is reused rather than altered,
-- bypassed or weakened. The artefact discriminator is added to that metadata by the
-- accompanying application change; no column, table or signature changes here.

commit;
