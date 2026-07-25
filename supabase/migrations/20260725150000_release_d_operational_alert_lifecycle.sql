-- Release D: operational-alerts lifecycle. phase14_operational_alerts (0017) already has open/
-- acknowledged/resolved status and resolved_at, and already has a live write path (Phase 14's own
-- dormant chain plus Release C's real bounce/complaint handling, 20260724180000) -- but nothing
-- reads it (confirmed: zero references anywhere in src/ before this cycle) and there is no audited,
-- role-gated way to move an alert through its lifecycle. This migration adds the minimum lifecycle
-- metadata and one authoritative SECURITY DEFINER transition RPC; it does not add a new write path
-- for alert *creation*, and does not touch any existing Phase14/Release B/C RPC.
--
-- Additive only: new nullable/defaulted columns, new indexes, one new function. No existing column,
-- constraint, or function is altered or dropped.

alter table public.phase14_operational_alerts
  add column if not exists acknowledged_at timestamptz,
  add column if not exists acknowledged_by uuid references public.admin_profiles(id) on delete set null,
  add column if not exists resolved_by uuid references public.admin_profiles(id) on delete set null,
  add column if not exists last_status_changed_at timestamptz not null default now();

-- Backfill: every row that already exists predates this column, so its "last changed" time is not
-- knowable precisely -- created_at is the best available lower bound, and resolved_at (if the row
-- is already resolved) is a better one where present.
update public.phase14_operational_alerts
set last_status_changed_at = coalesce(resolved_at, created_at)
where last_status_changed_at = now();

-- The admin page's real default view has no status filter applied (status='all') and orders
-- globally by severity, then created_at, then id (a deterministic tie-breaker for rows that share
-- a severity and created_at value -- without it, Postgres does not guarantee a stable order for
-- ties across repeated executions) before paginating -- this index supports exactly that query
-- shape without a sequential scan or an in-memory re-sort of an already-paginated page.
create index if not exists phase14_operational_alerts_severity_created_idx
  on public.phase14_operational_alerts (severity, created_at desc, id asc);
-- Supports the same ordering (including the id tie-breaker) when a status filter *is* applied,
-- plus plain status/severity filtering.
create index if not exists phase14_operational_alerts_list_idx
  on public.phase14_operational_alerts (status, severity, created_at desc, id asc);
-- Supports the nav badge's open+critical count via a small partial index rather than counting
-- the whole table.
create index if not exists phase14_operational_alerts_open_critical_idx
  on public.phase14_operational_alerts (status, severity)
  where status = 'open' and severity = 'critical';
create index if not exists phase14_operational_alerts_category_idx
  on public.phase14_operational_alerts (category);

-- The one authoritative lifecycle-transition path. No application code may update this table's
-- status/acknowledged_*/resolved_* columns directly -- table grants (0017) already only allow
-- `select` to `authenticated`, so a direct UPDATE from the API layer would fail closed anyway; this
-- RPC is additionally the only place that validates the transition matrix and writes the audit
-- entry, which a bare UPDATE grant could never do safely.
create or replace function public.transition_phase14_operational_alert(
  p_alert_id uuid,
  p_target_status text,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor jsonb;
  v_alert public.phase14_operational_alerts%rowtype;
  v_reason text;
  v_now timestamptz := now();
begin
  v_actor := public.phase14_require_actor(
    'operational_alert_transition', array['platform_admin','reviewer']::public.admin_role[], true
  );

  if p_target_status not in ('open','acknowledged','resolved') then
    raise exception 'phase14_operational_alert_status_invalid';
  end if;

  v_reason := trim(coalesce(p_reason, ''));
  if v_reason = '' or length(v_reason) > 500 then
    raise exception 'phase14_operational_alert_reason_invalid';
  end if;

  select * into v_alert from public.phase14_operational_alerts where id = p_alert_id for update;
  if not found then raise exception 'phase14_operational_alert_not_found'; end if;

  -- guard_phase14_authoritative_mutation() (0017) protects both phase14_operational_alerts itself
  -- and any audit_logs row whose action starts with 'phase14_' -- both of which this function
  -- writes below -- from any mutation outside an explicitly allow-listed RPC context.
  -- 'operational_alert_rpc' is already present in that allow-list (0017's own trigger definition),
  -- anticipating exactly this function; this is the one call that satisfies it for both writes.
  perform set_config('phase14.authoritative_transition', 'operational_alert_rpc', true);

  -- Transition matrix. Same-state "transitions" are rejected rather than treated as a silent
  -- no-op: a same-state call carries no information about what changed, so there is nothing
  -- meaningful to audit, and allowing it would let a UI bug submit a reason nobody reads.
  if not (
    (v_alert.status = 'open' and p_target_status in ('acknowledged','resolved'))
    or (v_alert.status = 'acknowledged' and p_target_status in ('resolved','open'))
    or (v_alert.status = 'resolved' and p_target_status = 'open')
  ) then
    raise exception 'phase14_operational_alert_transition_invalid:%->%', v_alert.status, p_target_status;
  end if;

  if p_target_status = 'acknowledged' then
    update public.phase14_operational_alerts set
      status = 'acknowledged',
      acknowledged_at = v_now,
      acknowledged_by = (v_actor->>'user_id')::uuid,
      last_status_changed_at = v_now
    where id = p_alert_id;
  elsif p_target_status = 'resolved' then
    update public.phase14_operational_alerts set
      status = 'resolved',
      resolved_at = v_now,
      resolved_by = (v_actor->>'user_id')::uuid,
      last_status_changed_at = v_now
    where id = p_alert_id;
  else
    -- Reopen (from 'acknowledged' or 'resolved' back to 'open'): 'open' means nothing has been
    -- acted on yet, so both the acknowledgement and resolution metadata are cleared, not only
    -- resolved_at -- an alert reading status='open' with a stale acknowledged_by would misstate
    -- who is currently handling it. The prior transition is not lost: it stays in audit_logs.
    update public.phase14_operational_alerts set
      status = 'open',
      acknowledged_at = null,
      acknowledged_by = null,
      resolved_at = null,
      resolved_by = null,
      last_status_changed_at = v_now
    where id = p_alert_id;
  end if;

  insert into public.audit_logs(actor_type, actor_user_id, entity_table, entity_id, action, before_json, after_json)
  values (
    'admin', (v_actor->>'user_id')::uuid, 'phase14_operational_alerts', p_alert_id,
    'phase14_operational_alert_transitioned',
    jsonb_build_object('alert_key', v_alert.alert_key, 'status', v_alert.status),
    jsonb_build_object('alert_key', v_alert.alert_key, 'previous_status', v_alert.status,
      'new_status', p_target_status, 'reason', v_reason)
  );

  return jsonb_build_object(
    'id', p_alert_id, 'alert_key', v_alert.alert_key, 'category', v_alert.category,
    'severity', v_alert.severity, 'status', p_target_status,
    'created_at', v_alert.created_at, 'last_status_changed_at', v_now
  );
end;
$$;

revoke all on function public.transition_phase14_operational_alert(uuid,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.transition_phase14_operational_alert(uuid,text,text) to authenticated;

select 'release_d_operational_alert_lifecycle_applied' as result;
