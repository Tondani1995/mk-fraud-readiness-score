-- Joint launch: secure client-evidence intake foundation for Comprehensive engagements.
--
-- Scope is deliberately narrow: this is an evidence intake surface, not a client portal. It stores
-- what a reviewer needs to validate a control claim and nothing else.
--
-- SECURITY POSTURE
--   * Objects live in a PRIVATE storage bucket. storage.objects has RLS enabled with no permissive
--     policies, so anon and authenticated cannot read or list evidence at all; only the server's
--     service-role key can, and that key never reaches the browser (enforced by the AST contract
--     analysis in scripts/rc1-service-role-privilege-contract-analysis.mjs).
--   * A closed MIME allowlist is applied at the bucket, so Storage itself refuses anything outside
--     it even if application validation were bypassed. Nothing executable is accepted.
--   * Evidence rows are bound to an engagement AND to the order and assessment behind it, and a
--     constraint keeps that triple consistent, so a cross-order read cannot be constructed by
--     supplying a mismatched pair of identifiers.
--   * Reviewer decisions are append-only in the audit table and every decision records the actor.
--
-- RETENTION: retention_policy_key is a configuration seam only. No retention period has been
-- approved, so rows carry 'unset' and nothing deletes evidence automatically. When a policy is
-- approved it attaches here without a schema change.

begin;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'evidence_validation_status') then
    create type public.evidence_validation_status as enum (
      'not_requested',
      'requested',
      'received',
      'reviewed',
      'supported',
      'not_supported',
      'insufficient',
      'not_applicable'
    );
  end if;
end $$;

create table if not exists public.comprehensive_evidence_items (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.comprehensive_engagements(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  organisation_id uuid references public.organisations(id) on delete set null,
  storage_bucket text not null default 'comprehensive-evidence',
  storage_path text not null,
  original_filename text not null,
  content_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  checksum_sha256 text,
  uploaded_at timestamptz not null default now(),
  submitted_by_respondent_id uuid references public.respondents(id) on delete set null,
  submitted_by_email public.citext,
  submitter_context_json jsonb not null default '{}'::jsonb,
  evidence_label text,
  validation_status public.evidence_validation_status not null default 'received',
  reviewer_observation text,
  reviewed_by uuid references public.admin_profiles(id) on delete set null,
  reviewed_at timestamptz,
  retention_policy_key text not null default 'unset',
  retention_review_due_at timestamptz,
  erasure_requested_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comprehensive_evidence_items_storage_unique unique (storage_bucket, storage_path),
  constraint comprehensive_evidence_items_private_bucket_chk check (storage_bucket = 'comprehensive-evidence'),
  constraint comprehensive_evidence_items_checksum_chk check (checksum_sha256 is null or checksum_sha256 ~ '^[0-9a-f]{64}$'),
  -- 25 MB, identical to the bucket file_size_limit set below.
  constraint comprehensive_evidence_items_size_chk check (size_bytes <= 26214400),
  constraint comprehensive_evidence_items_mime_allowlist_chk check (content_type in (
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/csv',
    'text/plain',
    'image/png',
    'image/jpeg'
  )),
  constraint comprehensive_evidence_items_review_pairing_chk check (
    (reviewed_by is null and reviewed_at is null) or (reviewed_by is not null and reviewed_at is not null)
  ),
  -- A reviewer decision must name the reviewer who made it.
  constraint comprehensive_evidence_items_decision_actor_chk check (
    validation_status not in ('reviewed', 'supported', 'not_supported', 'insufficient', 'not_applicable')
    or reviewed_by is not null
  ),
  -- Storage paths are derived server-side; reject anything carrying traversal or an absolute root.
  constraint comprehensive_evidence_items_storage_path_shape_chk check (
    storage_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9-]+/[0-9a-f-]{36}(\.[a-z0-9]+)?$'
  )
);

create index if not exists comprehensive_evidence_items_engagement_idx
  on public.comprehensive_evidence_items(engagement_id, uploaded_at desc);
create index if not exists comprehensive_evidence_items_order_idx on public.comprehensive_evidence_items(order_id);
create index if not exists comprehensive_evidence_items_assessment_idx on public.comprehensive_evidence_items(assessment_id);
create index if not exists comprehensive_evidence_items_organisation_idx on public.comprehensive_evidence_items(organisation_id);
create index if not exists comprehensive_evidence_items_status_idx on public.comprehensive_evidence_items(validation_status);
create index if not exists comprehensive_evidence_items_reviewed_by_idx on public.comprehensive_evidence_items(reviewed_by);
create index if not exists comprehensive_evidence_items_respondent_idx on public.comprehensive_evidence_items(submitted_by_respondent_id);

-- The engagement/order/assessment triple on an evidence row must match the engagement itself, so a
-- caller cannot pair a legitimate engagement id with somebody else's order or assessment.

create or replace function public.comprehensive_evidence_binding_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  bound record;
begin
  select order_id, assessment_id, organisation_id
    into bound
  from public.comprehensive_engagements
  where id = new.engagement_id;

  if not found then
    raise exception 'comprehensive_evidence_engagement_not_found' using errcode = 'foreign_key_violation';
  end if;

  if new.order_id is distinct from bound.order_id or new.assessment_id is distinct from bound.assessment_id then
    raise exception 'comprehensive_evidence_binding_mismatch' using errcode = 'check_violation';
  end if;

  if new.organisation_id is null then
    new.organisation_id := bound.organisation_id;
  elsif new.organisation_id is distinct from bound.organisation_id then
    raise exception 'comprehensive_evidence_binding_mismatch' using errcode = 'check_violation';
  end if;

  if tg_op = 'UPDATE' then
    -- The stored object and who supplied it are facts, not editable fields.
    if new.storage_bucket is distinct from old.storage_bucket
       or new.storage_path is distinct from old.storage_path
       or new.uploaded_at is distinct from old.uploaded_at
       or new.size_bytes is distinct from old.size_bytes
       or new.content_type is distinct from old.content_type
       or new.checksum_sha256 is distinct from old.checksum_sha256 then
      raise exception 'comprehensive_evidence_intake_facts_immutable' using errcode = 'check_violation';
    end if;
    new.updated_at := now();
  end if;

  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_comprehensive_evidence_binding_guard') then
    create trigger trg_comprehensive_evidence_binding_guard
      before insert or update on public.comprehensive_evidence_items
      for each row execute function public.comprehensive_evidence_binding_guard();
  end if;
end $$;

-- Reviewer decision audit trail ------------------------------------------------------------------

create table if not exists public.comprehensive_evidence_events (
  id uuid primary key default gen_random_uuid(),
  evidence_item_id uuid not null references public.comprehensive_evidence_items(id) on delete cascade,
  engagement_id uuid not null references public.comprehensive_engagements(id) on delete cascade,
  event_type text not null,
  previous_status public.evidence_validation_status,
  new_status public.evidence_validation_status,
  actor_type text not null default 'admin',
  actor_admin_user_id uuid references public.admin_profiles(id) on delete set null,
  observation text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint comprehensive_evidence_events_actor_type_chk check (actor_type in ('admin', 'system', 'respondent_token')),
  constraint comprehensive_evidence_events_event_type_chk check (event_type in (
    'evidence_uploaded',
    'validation_status_changed',
    'reviewer_observation_recorded'
  ))
);

create index if not exists comprehensive_evidence_events_item_idx
  on public.comprehensive_evidence_events(evidence_item_id, created_at desc);
create index if not exists comprehensive_evidence_events_engagement_idx
  on public.comprehensive_evidence_events(engagement_id, created_at desc);
create index if not exists comprehensive_evidence_events_actor_idx
  on public.comprehensive_evidence_events(actor_admin_user_id);

create or replace function public.comprehensive_evidence_events_append_only()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'comprehensive_evidence_events_are_append_only' using errcode = 'check_violation';
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_comprehensive_evidence_events_append_only') then
    create trigger trg_comprehensive_evidence_events_append_only
      before update or delete on public.comprehensive_evidence_events
      for each row execute function public.comprehensive_evidence_events_append_only();
  end if;
end $$;

-- RLS and grants ---------------------------------------------------------------------------------
-- No policy grants anon or authenticated anything. Reviewer-role administrators read through the
-- admin session; customers never read evidence back through the database at all.

alter table public.comprehensive_evidence_items enable row level security;
alter table public.comprehensive_evidence_events enable row level security;
revoke all on table public.comprehensive_evidence_items from anon, authenticated;
revoke all on table public.comprehensive_evidence_events from anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'comprehensive_evidence_items'
      and policyname = 'comprehensive_evidence_items_reviewer_select'
  ) then
    create policy comprehensive_evidence_items_reviewer_select on public.comprehensive_evidence_items
      for select using (public.current_admin_role() in ('platform_admin', 'reviewer', 'approver'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'comprehensive_evidence_events'
      and policyname = 'comprehensive_evidence_events_reviewer_select'
  ) then
    create policy comprehensive_evidence_events_reviewer_select on public.comprehensive_evidence_events
      for select using (public.current_admin_role() in ('platform_admin', 'reviewer', 'approver'));
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update on table public.comprehensive_evidence_items to service_role';
    -- INSERT only, for the same reason as the engagement audit trail.
    execute 'grant insert on table public.comprehensive_evidence_events to service_role';
  end if;
end $$;

-- Private storage bucket ---------------------------------------------------------------------------
-- public = false, and no storage.objects policy is created: the deny-by-default posture that already
-- protects payment-proofs and generated-reports is what makes this private. Adding a permissive
-- policy is the thing that would weaken it.

do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema absent (local replay harness); comprehensive-evidence bucket not created';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'comprehensive-evidence',
    'comprehensive-evidence',
    false,
    26214400,
    array[
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/csv',
      'text/plain',
      'image/png',
      'image/jpeg'
    ]::text[]
  )
  on conflict (id) do update set
    public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

  if not exists (
    select 1 from storage.buckets
    where id = 'comprehensive-evidence' and public = false and file_size_limit = 26214400
  ) then
    raise exception 'joint_launch_evidence_bucket_not_private';
  end if;
end $$;

-- No app_settings row is written here.
--
-- public.app_settings sits on the RC1 'activation_control' freeze surface, so a direct write from a
-- migration is refused while the database is frozen -- correctly, because activation state is meant
-- to change only inside a deliberate RELEASED window through an audited RPC. The launch contract is
-- therefore asserted by this migration's own verification block and by the schema objects it
-- creates, not by a settings row that would either fail the replay or quietly bypass that control.

commit;
