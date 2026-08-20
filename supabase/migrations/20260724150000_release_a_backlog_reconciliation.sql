-- MK Fraud Readiness Platform - Release A: paid-order backlog reconciliation.
-- Purpose: let an authorised operator classify every payment_received order into a fixed
-- set of dispositions without direct SQL edits, with a full audit trail, and give the
-- admin console a non-PII exception queue to work from. Additive only; does not touch
-- Phase 14 (still gated separately) and does not change any existing order/report flow.

begin;

-- ---------------------------------------------------------------------------
-- 1. Governance table: one current-state reconciliation row per order.
-- ---------------------------------------------------------------------------

create table public.backlog_reconciliation_records (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  report_id uuid references public.reports(id) on delete set null,
  classification text not null check (classification in (
    'genuine_customer_order',
    'internal_test_order',
    'legacy_superseded',
    'cancelled',
    'refunded',
    'delivered_outside_platform',
    'report_still_owed',
    'payment_requires_review',
    'unresolved_exception'
  )),
  resolution_note text not null check (length(trim(resolution_note)) >= 5),
  assigned_owner uuid references public.admin_profiles(id) on delete set null,
  next_action text,
  completion_date date,
  evidence_reference text,
  classified_by uuid not null references public.admin_profiles(id) on delete restrict,
  classified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index backlog_reconciliation_records_classification_idx
  on public.backlog_reconciliation_records(classification);
create index backlog_reconciliation_records_assigned_owner_idx
  on public.backlog_reconciliation_records(assigned_owner);

create trigger trg_backlog_reconciliation_records_updated_at
  before update on public.backlog_reconciliation_records
  for each row execute function public.set_updated_at();

-- RLS: locked down like the Phase 14 governance tables. No direct grants to authenticated
-- for insert/update/delete; all mutation goes through classify_backlog_order() below.
alter table public.backlog_reconciliation_records enable row level security;

revoke all on table public.backlog_reconciliation_records from public, anon, authenticated;
grant select on table public.backlog_reconciliation_records to authenticated;

create policy backlog_reconciliation_records_admin_select on public.backlog_reconciliation_records
  for select to authenticated
  using (public.current_admin_role() in ('platform_admin', 'finance_admin', 'reviewer', 'approver'));

-- ---------------------------------------------------------------------------
-- 2. Mutation RPC: classify_backlog_order.
-- ---------------------------------------------------------------------------
-- Security definer so it can bypass the table-level RLS above (which intentionally grants
-- no direct write access) while still enforcing its own actor/role/input checks and writing
-- a paired audit_logs row for every classification, matching the phase14 governance pattern
-- in 0017_phase14_canonical_disabled_foundation.sql (phase14_require_actor /
-- guard_phase14_feature_policy_mutation) and the note-length validation style used by
-- confirmManualPayment() in src/lib/payments/payment-service.ts.

create or replace function public.classify_backlog_order(
  p_order_id uuid,
  p_report_id uuid,
  p_classification text,
  p_resolution_note text,
  p_assigned_owner uuid,
  p_next_action text,
  p_completion_date date,
  p_evidence_reference text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor public.admin_profiles%rowtype;
  v_before public.backlog_reconciliation_records%rowtype;
  v_after public.backlog_reconciliation_records%rowtype;
  v_order public.orders%rowtype;
  v_note text := trim(coalesce(p_resolution_note, ''));
begin
  if v_actor_id is null then
    raise exception 'backlog_reconciliation_no_session';
  end if;

  select * into v_actor from public.admin_profiles where id = v_actor_id;
  if not found or v_actor.status <> 'active' then
    raise exception 'backlog_reconciliation_profile_inactive';
  end if;
  if v_actor.role not in ('platform_admin', 'finance_admin') then
    raise exception 'backlog_reconciliation_role_forbidden';
  end if;

  if length(v_note) < 5 then
    raise exception 'backlog_reconciliation_note_too_short';
  end if;

  if p_classification not in (
    'genuine_customer_order', 'internal_test_order', 'legacy_superseded', 'cancelled',
    'refunded', 'delivered_outside_platform', 'report_still_owed', 'payment_requires_review',
    'unresolved_exception'
  ) then
    raise exception 'backlog_reconciliation_classification_invalid';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'backlog_reconciliation_order_not_found';
  end if;

  if p_report_id is not null then
    if not exists (select 1 from public.reports where id = p_report_id and order_id = p_order_id) then
      raise exception 'backlog_reconciliation_report_mismatch';
    end if;
  end if;

  if p_assigned_owner is not null then
    if not exists (select 1 from public.admin_profiles where id = p_assigned_owner and status = 'active') then
      raise exception 'backlog_reconciliation_owner_invalid';
    end if;
  end if;

  select * into v_before from public.backlog_reconciliation_records where order_id = p_order_id;

  insert into public.backlog_reconciliation_records as r (
    order_id, report_id, classification, resolution_note, assigned_owner,
    next_action, completion_date, evidence_reference, classified_by, classified_at
  ) values (
    p_order_id, p_report_id, p_classification, v_note, p_assigned_owner,
    nullif(trim(coalesce(p_next_action, '')), ''), p_completion_date,
    nullif(trim(coalesce(p_evidence_reference, '')), ''), v_actor_id, now()
  )
  on conflict (order_id) do update set
    report_id = excluded.report_id,
    classification = excluded.classification,
    resolution_note = excluded.resolution_note,
    assigned_owner = excluded.assigned_owner,
    next_action = excluded.next_action,
    completion_date = excluded.completion_date,
    evidence_reference = excluded.evidence_reference,
    classified_by = excluded.classified_by,
    classified_at = now(),
    updated_at = now()
  returning * into v_after;

  insert into public.audit_logs (
    actor_type, actor_user_id, entity_table, entity_id, action, before_json, after_json
  ) values (
    'admin', v_actor_id, 'backlog_reconciliation_records', v_after.id, 'backlog_order_classified',
    case when v_before.id is null then null else to_jsonb(v_before) end,
    to_jsonb(v_after)
  );

  return to_jsonb(v_after);
end;
$$;

revoke all on function public.classify_backlog_order(uuid, uuid, text, text, uuid, text, date, text)
  from public, anon, authenticated;
grant execute on function public.classify_backlog_order(uuid, uuid, text, text, uuid, text, date, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Read-only RPC: backlog_reconciliation_queue.
-- ---------------------------------------------------------------------------
-- Returns only non-PII operational fields for payment_received orders: order reference,
-- product, payment state, payment confirmation date, current report state/version, storage
-- verification state, delivery state (best-effort from manual_report_delivery_attempts),
-- exception age, assigned owner, reconciliation classification, resolution note, next
-- action, completion date and technical references (order id, report id). It deliberately
-- never selects orders.customer_name, orders.customer_email, orders.organisation_name or
-- any assessment/response content.
--
-- The orders table has no dedicated "payment confirmed at" column (checked against
-- 0010_phase9_manual_eft_order_flow.sql). orders.verified_at is set to now() at the moment
-- an order transitions to payment_received (see record_payment_transition() in
-- 0024_phase23_payment_automation.sql and updateAdminOrderStatus() in
-- src/lib/orders/manual-eft-orders.ts), so it is used as the payment confirmation
-- timestamp, falling back to updated_at/created_at for any row where it was never set.
--
-- Security definer: finance_admin can classify backlog orders but has no direct SELECT
-- policy on public.reports (see reports_admin_select in 0001_phase2_v1_1_schema_rls.sql),
-- so this function centralises the access check the same way the Phase 14 RPCs do rather
-- than relying on per-table RLS grants across four different tables.

create or replace function public.backlog_reconciliation_queue()
returns table (
  order_id uuid,
  order_reference text,
  product_name text,
  payment_state text,
  payment_confirmed_at timestamptz,
  report_id uuid,
  report_status text,
  report_version integer,
  storage_status text,
  delivery_state text,
  exception_age_days integer,
  assigned_owner uuid,
  assigned_owner_name text,
  classification text,
  resolution_note text,
  next_action text,
  completion_date date,
  classified_by uuid,
  classified_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if public.current_admin_role() not in ('platform_admin', 'finance_admin', 'reviewer', 'approver') then
    raise exception 'backlog_reconciliation_role_forbidden';
  end if;

  return query
  select
    o.id as order_id,
    o.order_reference,
    o.product_name,
    o.status::text as payment_state,
    coalesce(o.verified_at, o.updated_at, o.created_at) as payment_confirmed_at,
    r.id as report_id,
    r.status::text as report_status,
    r.version_number as report_version,
    r.storage_status,
    d.status as delivery_state,
    greatest(
      0,
      floor(extract(epoch from (now() - coalesce(o.verified_at, o.updated_at, o.created_at))) / 86400)::integer
    ) as exception_age_days,
    b.assigned_owner,
    ap.full_name as assigned_owner_name,
    b.classification,
    b.resolution_note,
    b.next_action,
    b.completion_date,
    b.classified_by,
    b.classified_at
  from public.orders o
  left join lateral (
    select rr.id, rr.status, rr.version_number, rr.storage_status
    from public.reports rr
    where rr.order_id = o.id
    order by rr.version_number desc
    limit 1
  ) r on true
  left join lateral (
    select da.status
    from public.manual_report_delivery_attempts da
    where da.order_id = o.id
    order by da.created_at desc
    limit 1
  ) d on true
  left join public.backlog_reconciliation_records b on b.order_id = o.id
  left join public.admin_profiles ap on ap.id = b.assigned_owner
  where o.status = 'payment_received'
  order by coalesce(o.verified_at, o.updated_at, o.created_at) asc;
end;
$$;

revoke all on function public.backlog_reconciliation_queue() from public, anon, authenticated;
grant execute on function public.backlog_reconciliation_queue() to authenticated;

commit;
