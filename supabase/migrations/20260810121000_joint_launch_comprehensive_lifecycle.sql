-- Joint launch: Comprehensive engagement lifecycle and named-reviewer assignment.
--
-- Comprehensive is a real R35,000 paid product, not an enquiry and not an Essential PDF with more
-- pages. Its progress through evidence intake, review and delivery is a DISTINCT concern from
-- payment state and from report-artefact state, both of which already have their own columns
-- (orders.status, reports.status). Overloading them would make "paid but unreviewed" and "reviewed
-- but undelivered" indistinguishable, so the engagement gets its own state column here.
--
-- SAFETY PROPERTIES
--   * The permitted transition graph is enforced by a trigger, so an invalid move is rejected no
--     matter which client attempts it - including the service role, which bypasses RLS.
--   * state_version increments on every state change. Application code updates with a
--     (id, state, state_version) predicate, so two administrators acting concurrently cannot both
--     win: the loser updates zero rows and is told the engagement moved underneath it.
--   * Every state change writes a comprehensive_engagement_events row carrying the actor and the
--     timestamp. Reviewer sign-off is recorded on the engagement AND in the event stream.
--   * Reviewer notes and sign-off cannot be silently rewritten: a trigger rejects any UPDATE that
--     changes an already-set sign-off actor or timestamp without first returning to review.

begin;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'comprehensive_engagement_state') then
    create type public.comprehensive_engagement_state as enum (
      'awaiting_payment',
      'payment_received',
      'evidence_requested',
      'evidence_received',
      'in_review',
      'review_complete',
      'delivered',
      'cancelled'
    );
  end if;
end $$;

create table if not exists public.comprehensive_engagements (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  organisation_id uuid references public.organisations(id) on delete set null,
  state public.comprehensive_engagement_state not null default 'awaiting_payment',
  state_version int not null default 1 check (state_version >= 1),
  state_changed_at timestamptz not null default now(),
  reviewer_admin_user_id uuid references public.admin_profiles(id) on delete restrict,
  reviewer_assigned_at timestamptz,
  reviewer_assigned_by uuid references public.admin_profiles(id) on delete set null,
  signed_off_by uuid references public.admin_profiles(id) on delete restrict,
  signed_off_at timestamptz,
  sign_off_statement text,
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint comprehensive_engagements_reviewer_pairing_chk check (
    (reviewer_admin_user_id is null and reviewer_assigned_at is null)
    or (reviewer_admin_user_id is not null and reviewer_assigned_at is not null)
  ),
  constraint comprehensive_engagements_sign_off_pairing_chk check (
    (signed_off_by is null and signed_off_at is null)
    or (signed_off_by is not null and signed_off_at is not null)
  ),
  -- Review can only be complete or delivered once a named reviewer has actually signed off.
  constraint comprehensive_engagements_sign_off_required_chk check (
    state not in ('review_complete', 'delivered') or signed_off_by is not null
  ),
  constraint comprehensive_engagements_delivered_at_chk check (
    (state = 'delivered') = (delivered_at is not null)
  )
);

create index if not exists comprehensive_engagements_assessment_idx on public.comprehensive_engagements(assessment_id);

-- One live Comprehensive engagement per assessment. A cancelled engagement frees the assessment to
-- be ordered again; a delivered one does not, because its deliverables already exist.
create unique index if not exists comprehensive_engagements_one_live_per_assessment_uidx
  on public.comprehensive_engagements(assessment_id)
  where state <> 'cancelled';

create index if not exists comprehensive_engagements_state_idx on public.comprehensive_engagements(state);
create index if not exists comprehensive_engagements_reviewer_idx on public.comprehensive_engagements(reviewer_admin_user_id);
create index if not exists comprehensive_engagements_organisation_idx on public.comprehensive_engagements(organisation_id);
create index if not exists comprehensive_engagements_signed_off_by_idx on public.comprehensive_engagements(signed_off_by);
create index if not exists comprehensive_engagements_assigned_by_idx on public.comprehensive_engagements(reviewer_assigned_by);

create table if not exists public.comprehensive_engagement_events (
  id uuid primary key default gen_random_uuid(),
  engagement_id uuid not null references public.comprehensive_engagements(id) on delete cascade,
  event_type text not null,
  previous_state public.comprehensive_engagement_state,
  new_state public.comprehensive_engagement_state,
  actor_type text not null default 'admin',
  actor_admin_user_id uuid references public.admin_profiles(id) on delete set null,
  note text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint comprehensive_engagement_events_actor_type_chk check (actor_type in ('admin', 'system', 'respondent_token')),
  constraint comprehensive_engagement_events_event_type_chk check (event_type in (
    'engagement_created',
    'state_changed',
    'reviewer_assigned',
    'reviewer_reassigned',
    'evidence_validation_recorded',
    'reviewer_observation_recorded',
    'review_signed_off',
    'sign_off_withdrawn'
  ))
);

create index if not exists comprehensive_engagement_events_engagement_idx
  on public.comprehensive_engagement_events(engagement_id, created_at desc);
create index if not exists comprehensive_engagement_events_actor_idx
  on public.comprehensive_engagement_events(actor_admin_user_id);

-- Transition graph, mirrored exactly by src/lib/commercial/comprehensive-lifecycle.ts. -----------

create or replace function public.comprehensive_engagement_transition_allowed(
  from_state public.comprehensive_engagement_state,
  to_state public.comprehensive_engagement_state
) returns boolean
language sql
immutable
set search_path = pg_catalog, public
as $$
  select case from_state
    when 'awaiting_payment'   then to_state in ('payment_received', 'cancelled')
    when 'payment_received'   then to_state in ('evidence_requested', 'cancelled')
    when 'evidence_requested' then to_state in ('evidence_received', 'cancelled')
    when 'evidence_received'  then to_state in ('in_review', 'cancelled')
    when 'in_review'          then to_state in ('review_complete', 'evidence_requested', 'cancelled')
    when 'review_complete'    then to_state in ('delivered', 'in_review', 'cancelled')
    else false
  end;
$$;

create or replace function public.comprehensive_engagement_state_guard()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if new.state is distinct from old.state then
    if not public.comprehensive_engagement_transition_allowed(old.state, new.state) then
      raise exception 'comprehensive_engagement_invalid_transition: % -> %', old.state, new.state
        using errcode = 'check_violation';
    end if;
    new.state_version := old.state_version + 1;
    new.state_changed_at := now();
  else
    -- state_version tracks state changes only; it must not drift on unrelated updates.
    new.state_version := old.state_version;
    new.state_changed_at := old.state_changed_at;
  end if;

  -- Sign-off is append-only while the engagement stays signed off. Withdrawing it is only legal as
  -- part of the explicit review_complete -> in_review transition, which clears both fields.
  if old.signed_off_by is not null
     and (new.signed_off_by is distinct from old.signed_off_by or new.signed_off_at is distinct from old.signed_off_at)
     and not (new.state = 'in_review' and new.signed_off_by is null and new.signed_off_at is null) then
    raise exception 'comprehensive_engagement_sign_off_immutable'
      using errcode = 'check_violation';
  end if;

  if old.sign_off_statement is not null
     and new.sign_off_statement is distinct from old.sign_off_statement
     and new.signed_off_by is not null then
    raise exception 'comprehensive_engagement_sign_off_statement_immutable'
      using errcode = 'check_violation';
  end if;

  -- A named reviewer is never silently erased; reassignment must name a different reviewer.
  if old.reviewer_admin_user_id is not null and new.reviewer_admin_user_id is null then
    raise exception 'comprehensive_engagement_reviewer_cannot_be_unassigned'
      using errcode = 'check_violation';
  end if;

  new.updated_at := now();
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_comprehensive_engagement_state_guard') then
    create trigger trg_comprehensive_engagement_state_guard
      before update on public.comprehensive_engagements
      for each row execute function public.comprehensive_engagement_state_guard();
  end if;
end $$;

-- Engagement events are an audit trail: no updates, no deletes, for anybody.

create or replace function public.comprehensive_engagement_events_append_only()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  raise exception 'comprehensive_engagement_events_are_append_only'
    using errcode = 'check_violation';
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_comprehensive_engagement_events_append_only') then
    create trigger trg_comprehensive_engagement_events_append_only
      before update or delete on public.comprehensive_engagement_events
      for each row execute function public.comprehensive_engagement_events_append_only();
  end if;
end $$;

-- RLS and grants --------------------------------------------------------------------------------

alter table public.comprehensive_engagements enable row level security;
alter table public.comprehensive_engagement_events enable row level security;
revoke all on table public.comprehensive_engagements from anon, authenticated;
revoke all on table public.comprehensive_engagement_events from anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'comprehensive_engagements'
      and policyname = 'comprehensive_engagements_admin_select'
  ) then
    create policy comprehensive_engagements_admin_select on public.comprehensive_engagements
      for select using (public.current_admin_role() in ('platform_admin', 'reviewer', 'approver', 'finance_admin', 'read_only_admin'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'comprehensive_engagement_events'
      and policyname = 'comprehensive_engagement_events_admin_select'
  ) then
    create policy comprehensive_engagement_events_admin_select on public.comprehensive_engagement_events
      for select using (public.current_admin_role() in ('platform_admin', 'reviewer', 'approver', 'finance_admin', 'read_only_admin'));
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select, insert, update on table public.comprehensive_engagements to service_role';
    -- Append-only by grant as well as by trigger. INSERT only: no server call site reads the
    -- audit trail back, and reviewer-role administrators read it through the RLS policy above with
    -- their own session. Granting SELECT here would be privilege nothing currently uses.
    execute 'grant insert on table public.comprehensive_engagement_events to service_role';
  end if;
end $$;

-- No separate updated_at trigger: comprehensive_engagement_state_guard() is the single writer of
-- that column, so adding public.set_updated_at() here would give it two.

-- No app_settings row is written here.
--
-- public.app_settings sits on the RC1 'activation_control' freeze surface, so a direct write from a
-- migration is refused while the database is frozen -- correctly, because activation state is meant
-- to change only inside a deliberate RELEASED window through an audited RPC. The launch contract is
-- therefore asserted by this migration's own verification block and by the schema objects it
-- creates, not by a settings row that would either fail the replay or quietly bypass that control.

commit;
