-- Phase 14 fourth adversarial remediation.
-- Forward-only and fail-closed. This migration intentionally leaves every
-- commercial policy disabled and does not satisfy the Phase 14 security gate.

begin;

-- 1. Make the gate internally consistent and impossible to mutate through a
-- service-role Data API client or a direct table grant.
alter table public.phase14_security_gates
  drop constraint if exists phase14_security_gate_consistency;

alter table public.phase14_security_gates
  add constraint phase14_security_gate_consistency check (
    (
      status = 'satisfied'
      and satisfied_version >= required_version
      and satisfied_by is not null
      and satisfied_at is not null
      and coalesce(trim(reason), '') <> ''
    )
    or (
      status <> 'satisfied'
      and satisfied_version < required_version
    )
  );

revoke all on table public.phase14_security_gates from public, anon, authenticated, service_role;
grant select on table public.phase14_security_gates to authenticated, service_role;

create or replace function public.guard_phase14_security_gate_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform public.phase14_require_actor(
    'security_gate_table_mutation',
    array['platform_admin']::public.admin_role[],
    true
  );
  if tg_op = 'DELETE' then return old; end if;
  if tg_level = 'STATEMENT' then return null; end if;
  return new;
end;
$function$;

-- 2. Database-authoritative, action-specific policies. Application settings may
-- still hold presentation/configuration values, but never confer authority.
create table public.phase14_feature_policies (
  policy_key text primary key check (policy_key in (
    'manual_generation',
    'automatic_fulfilment',
    'ai_narrative',
    'automatic_email',
    'manual_delivery',
    'recipient_override',
    'storage_cleanup'
  )),
  enabled boolean not null default false,
  required_gate_version integer not null default 1 check (required_gate_version > 0),
  updated_by uuid references public.admin_profiles(id) on delete restrict,
  reason text not null default 'Disabled pending controlled approval' check (coalesce(trim(reason), '') <> ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.phase14_feature_policies(policy_key, enabled, reason)
select key, false, 'Disabled by fourth adversarial remediation pending separate AAL2 approval.'
from unnest(array[
  'manual_generation', 'automatic_fulfilment', 'ai_narrative',
  'automatic_email', 'manual_delivery', 'recipient_override', 'storage_cleanup'
]) as key;

alter table public.phase14_feature_policies enable row level security;
revoke all on table public.phase14_feature_policies from public, anon, authenticated, service_role;
grant select on table public.phase14_feature_policies to authenticated, service_role;
create policy phase14_feature_policies_admin_select on public.phase14_feature_policies
  for select to authenticated
  using (public.current_admin_role() in ('platform_admin','reviewer','approver','read_only_admin'));

create or replace function public.guard_phase14_feature_policy_row_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform public.phase14_require_actor(
    'feature_policy_table_mutation',
    array['platform_admin']::public.admin_role[],
    true
  );
  if tg_op = 'DELETE' then return old; end if;
  if tg_level = 'STATEMENT' then return null; end if;
  return new;
end;
$function$;

create trigger trg_guard_phase14_feature_policy_rows
  before insert or update or delete on public.phase14_feature_policies
  for each row execute function public.guard_phase14_feature_policy_row_mutation();
create trigger trg_guard_phase14_feature_policy_truncate
  before truncate on public.phase14_feature_policies
  for each statement execute function public.guard_phase14_feature_policy_row_mutation();

create or replace function public.set_phase14_feature_policy(
  p_policy_key text,
  p_enabled boolean,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare v_actor jsonb; v_policy public.phase14_feature_policies%rowtype;
begin
  v_actor := public.phase14_require_security(
    'feature_policy_change', array['platform_admin']::public.admin_role[], true, false
  );
  if coalesce(trim(p_reason), '') = '' then raise exception 'phase14_policy_reason_required'; end if;
  update public.phase14_feature_policies
  set enabled = p_enabled,
      updated_by = (v_actor->>'user_id')::uuid,
      reason = p_reason,
      updated_at = now()
  where policy_key = p_policy_key
  returning * into v_policy;
  if not found then raise exception 'phase14_policy_not_supported:%', p_policy_key; end if;
  insert into public.audit_logs(actor_type, actor_user_id, entity_table, action, after_json)
  values ('admin', (v_actor->>'user_id')::uuid, 'phase14_feature_policies',
    'phase14_feature_policy_changed',
    jsonb_build_object('policy_key', p_policy_key, 'enabled', p_enabled, 'reason', p_reason));
  return to_jsonb(v_policy);
end;
$function$;

create or replace function public.phase14_require_policy(p_policy_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare v_policy public.phase14_feature_policies%rowtype; v_gate public.phase14_security_gates%rowtype;
begin
  select * into v_gate from public.phase14_security_gates
  where gate_key = 'phase14-premium-report' for share;
  if not found or v_gate.status <> 'satisfied' or v_gate.satisfied_version < v_gate.required_version then
    raise exception 'phase14_security_gate_unsatisfied:%', p_policy_key;
  end if;
  select * into v_policy from public.phase14_feature_policies where policy_key = p_policy_key for share;
  if not found or not v_policy.enabled then raise exception 'phase14_policy_disabled:%', p_policy_key; end if;
  if v_gate.satisfied_version < v_policy.required_gate_version then
    raise exception 'phase14_policy_gate_version_stale:%', p_policy_key;
  end if;
  return jsonb_build_object('policy_key', v_policy.policy_key, 'gate_version', v_gate.satisfied_version);
end;
$function$;

-- 3. Durable, human-issued worker capabilities. Raw issue/lease secrets are
-- returned once and never stored; only SHA-256 digests are durable.
create table public.phase14_worker_capabilities (
  id uuid primary key default gen_random_uuid(),
  capability_type text not null check (capability_type in (
    'automatic_generation', 'automatic_delivery', 'generation_recovery',
    'delivery_reconciliation', 'storage_cleanup'
  )),
  policy_key text not null references public.phase14_feature_policies(policy_key) on delete restrict,
  operation_key text not null check (coalesce(trim(operation_key), '') <> ''),
  issue_secret_hash text not null check (issue_secret_hash ~ '^[0-9a-f]{64}$'),
  order_id uuid references public.orders(id) on delete restrict,
  assessment_id uuid references public.assessments(id) on delete restrict,
  score_run_id uuid references public.score_runs(id) on delete restrict,
  fulfilment_id uuid references public.report_fulfilments(id) on delete restrict,
  report_id uuid references public.reports(id) on delete restrict,
  recipient_email citext,
  security_gate_version integer not null check (security_gate_version > 0),
  authorised_by uuid not null references public.admin_profiles(id) on delete restrict,
  authorised_session_id uuid,
  reason text not null check (coalesce(trim(reason), '') <> ''),
  status text not null default 'authorised' check (status in ('authorised','leased','consumed','revoked','expired')),
  expires_at timestamptz not null,
  lease_secret_hash text check (lease_secret_hash is null or lease_secret_hash ~ '^[0-9a-f]{64}$'),
  lease_expires_at timestamptz,
  claimed_at timestamptz,
  consumed_at timestamptz,
  revoked_at timestamptz,
  revoked_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint phase14_worker_capability_lease_chk check (
    (status = 'leased' and lease_secret_hash is not null and lease_expires_at is not null)
    or status <> 'leased'
  )
);

create unique index phase14_worker_capabilities_one_active_uidx
  on public.phase14_worker_capabilities(capability_type, operation_key)
  where status in ('authorised','leased');
create index phase14_worker_capabilities_expiry_idx
  on public.phase14_worker_capabilities(status, expires_at);
alter table public.phase14_worker_capabilities enable row level security;
revoke all on table public.phase14_worker_capabilities from public, anon, authenticated, service_role;
grant select on table public.phase14_worker_capabilities to authenticated;
create policy phase14_worker_capabilities_admin_select on public.phase14_worker_capabilities
  for select to authenticated
  using (public.current_admin_role() in ('platform_admin','reviewer','approver','read_only_admin'));

alter table public.report_fulfilments
  add column generation_capability_id uuid references public.phase14_worker_capabilities(id) on delete restrict,
  add column delivery_capability_id uuid references public.phase14_worker_capabilities(id) on delete restrict;

alter table public.report_delivery_authorizations
  alter column authorised_by drop not null,
  add column worker_capability_id uuid references public.phase14_worker_capabilities(id) on delete restrict,
  add column bounce_remediation_id uuid;

create or replace function public.authorize_phase14_worker_operation(
  p_capability_type text,
  p_operation_key text,
  p_order_id uuid,
  p_assessment_id uuid,
  p_score_run_id uuid,
  p_fulfilment_id uuid,
  p_report_id uuid default null,
  p_recipient text default null,
  p_expires_in_seconds integer default 21600,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor jsonb; v_gate public.phase14_security_gates%rowtype; v_policy_key text;
  v_secret text; v_capability public.phase14_worker_capabilities%rowtype;
  v_order public.orders%rowtype; v_fulfilment public.report_fulfilments%rowtype;
begin
  v_actor := public.phase14_require_security(
    'worker_capability_authorization', array['platform_admin']::public.admin_role[], true, false
  );
  if p_expires_in_seconds < 300 or p_expires_in_seconds > 86400 then
    raise exception 'phase14_worker_capability_expiry_out_of_range';
  end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'phase14_worker_capability_reason_required'; end if;
  v_policy_key := case p_capability_type
    when 'automatic_generation' then 'automatic_fulfilment'
    when 'generation_recovery' then 'automatic_fulfilment'
    when 'automatic_delivery' then 'automatic_email'
    when 'delivery_reconciliation' then 'automatic_email'
    when 'storage_cleanup' then 'storage_cleanup'
    else null end;
  if v_policy_key is null then raise exception 'phase14_worker_capability_type_invalid'; end if;
  perform public.phase14_require_policy(v_policy_key);
  select * into v_gate from public.phase14_security_gates where gate_key = 'phase14-premium-report';
  if p_capability_type = 'storage_cleanup' then
    if p_order_id is not null or p_assessment_id is not null or p_score_run_id is not null
       or p_fulfilment_id is not null or p_report_id is not null or p_recipient is not null then
      raise exception 'storage_cleanup_capability_must_be_unbound';
    end if;
  else
    if p_order_id is null or p_assessment_id is null or p_score_run_id is null then
      raise exception 'worker_capability_commercial_binding_required';
    end if;
    select * into v_order from public.orders where id = p_order_id for share;
    if not found or v_order.assessment_id <> p_assessment_id then raise exception 'worker_capability_order_binding_invalid'; end if;
    perform public.phase14_generation_entitlement(
      v_order.order_reference,p_order_id,p_assessment_id,p_score_run_id,null
    );
  end if;
  if p_fulfilment_id is not null then
    select * into v_fulfilment from public.report_fulfilments where id = p_fulfilment_id for share;
    if not found or v_fulfilment.order_id <> p_order_id or v_fulfilment.assessment_id <> p_assessment_id
       or v_fulfilment.score_run_id <> p_score_run_id then
      raise exception 'worker_capability_fulfilment_binding_invalid';
    end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('phase14-capability:' || p_capability_type || ':' || p_operation_key, 0));
  update public.phase14_worker_capabilities
  set status = 'expired', updated_at = now()
  where capability_type = p_capability_type and operation_key = p_operation_key
    and status = 'authorised' and expires_at <= now();
  if exists (select 1 from public.phase14_worker_capabilities
    where capability_type = p_capability_type and operation_key = p_operation_key
      and status in ('authorised','leased')) then
    raise exception 'phase14_worker_capability_already_active';
  end if;
  v_secret := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.phase14_worker_capabilities(
    capability_type, policy_key, operation_key, issue_secret_hash,
    order_id, assessment_id, score_run_id, fulfilment_id, report_id, recipient_email,
    security_gate_version, authorised_by, authorised_session_id, reason, expires_at
  ) values (
    p_capability_type, v_policy_key, p_operation_key,
    encode(extensions.digest(convert_to(v_secret, 'UTF8'), 'sha256'), 'hex'),
    p_order_id, p_assessment_id, p_score_run_id, p_fulfilment_id, p_report_id,
    nullif(lower(trim(p_recipient)), ''), v_gate.satisfied_version,
    (v_actor->>'user_id')::uuid, nullif(v_actor->>'session_id','')::uuid,
    p_reason, now() + make_interval(secs => p_expires_in_seconds)
  ) returning * into v_capability;
  if p_fulfilment_id is not null then
    update public.report_fulfilments
    set generation_capability_id = case when p_capability_type in ('automatic_generation','generation_recovery') then v_capability.id else generation_capability_id end,
        delivery_capability_id = case when p_capability_type in ('automatic_delivery','delivery_reconciliation') then v_capability.id else delivery_capability_id end,
        updated_at = now()
    where id = p_fulfilment_id;
  end if;
  insert into public.audit_logs(actor_type, actor_user_id, assessment_id, entity_table, entity_id, action, after_json)
  values ('admin', (v_actor->>'user_id')::uuid, p_assessment_id, 'phase14_worker_capabilities',
    v_capability.id, 'phase14_worker_capability_authorized',
    jsonb_build_object('capability_type', p_capability_type, 'operation_key', p_operation_key,
      'policy_key', v_policy_key, 'expires_at', v_capability.expires_at));
  return jsonb_build_object(
    'capability_id', v_capability.id, 'capability_type', v_capability.capability_type,
    'operation_key', v_capability.operation_key, 'issue_secret', v_secret,
    'expires_at', v_capability.expires_at, 'security_gate_version', v_capability.security_gate_version
  );
end;
$function$;

create or replace function public.claim_phase14_worker_capability(
  p_capability_id uuid,
  p_issue_secret text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare v_cap public.phase14_worker_capabilities%rowtype; v_lease text; v_gate public.phase14_security_gates%rowtype;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'phase14_worker_service_role_required'; end if;
  select * into v_cap from public.phase14_worker_capabilities where id = p_capability_id for update;
  if not found then raise exception 'phase14_worker_capability_missing'; end if;
  if v_cap.status <> 'authorised' then raise exception 'phase14_worker_capability_not_claimable:%', v_cap.status; end if;
  if v_cap.expires_at <= now() then
    update public.phase14_worker_capabilities set status = 'expired', updated_at = now() where id = v_cap.id;
    raise exception 'phase14_worker_capability_expired';
  end if;
  if encode(extensions.digest(convert_to(coalesce(p_issue_secret,''), 'UTF8'), 'sha256'), 'hex') <> v_cap.issue_secret_hash then
    raise exception 'phase14_worker_capability_secret_invalid';
  end if;
  select * into v_gate from public.phase14_security_gates where gate_key = 'phase14-premium-report' for share;
  if not found or v_gate.status <> 'satisfied' or v_gate.satisfied_version <> v_cap.security_gate_version then
    raise exception 'phase14_worker_capability_gate_changed';
  end if;
  perform public.phase14_require_policy(v_cap.policy_key);
  v_lease := encode(extensions.gen_random_bytes(32), 'hex');
  update public.phase14_worker_capabilities
  set status = 'leased', lease_secret_hash = encode(extensions.digest(convert_to(v_lease, 'UTF8'), 'sha256'), 'hex'),
      lease_expires_at = least(expires_at, now() + interval '60 minutes'), claimed_at = now(), updated_at = now()
  where id = v_cap.id returning * into v_cap;
  return jsonb_build_object(
    'capability_id', v_cap.id, 'capability_type', v_cap.capability_type,
    'operation_key', v_cap.operation_key, 'lease_token', v_lease,
    'lease_expires_at', v_cap.lease_expires_at
  );
end;
$function$;

create or replace function public.phase14_activate_worker_capability(
  p_capability_id uuid,
  p_lease_token text,
  p_expected_types text[],
  p_order_id uuid default null,
  p_assessment_id uuid default null,
  p_score_run_id uuid default null,
  p_fulfilment_id uuid default null,
  p_report_id uuid default null,
  p_recipient text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare v_cap public.phase14_worker_capabilities%rowtype; v_gate public.phase14_security_gates%rowtype;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then raise exception 'phase14_worker_service_role_required'; end if;
  select * into v_cap from public.phase14_worker_capabilities where id = p_capability_id for share;
  if not found or v_cap.status <> 'leased' then raise exception 'phase14_worker_capability_not_leased'; end if;
  if not (v_cap.capability_type = any(p_expected_types)) then raise exception 'phase14_worker_capability_type_mismatch'; end if;
  if v_cap.expires_at <= now() or v_cap.lease_expires_at <= now() then raise exception 'phase14_worker_capability_lease_expired'; end if;
  if encode(extensions.digest(convert_to(coalesce(p_lease_token,''), 'UTF8'), 'sha256'), 'hex') <> v_cap.lease_secret_hash then
    raise exception 'phase14_worker_capability_lease_invalid';
  end if;
  select * into v_gate from public.phase14_security_gates where gate_key = 'phase14-premium-report' for share;
  if not found or v_gate.status <> 'satisfied' or v_gate.satisfied_version <> v_cap.security_gate_version then
    raise exception 'phase14_worker_capability_gate_changed';
  end if;
  perform public.phase14_require_policy(v_cap.policy_key);
  if v_cap.order_id is not null and v_cap.order_id is distinct from p_order_id then raise exception 'worker_capability_order_mismatch'; end if;
  if v_cap.assessment_id is not null and v_cap.assessment_id is distinct from p_assessment_id then raise exception 'worker_capability_assessment_mismatch'; end if;
  if v_cap.score_run_id is not null and v_cap.score_run_id is distinct from p_score_run_id then raise exception 'worker_capability_score_run_mismatch'; end if;
  if v_cap.fulfilment_id is not null and v_cap.fulfilment_id is distinct from p_fulfilment_id then raise exception 'worker_capability_fulfilment_mismatch'; end if;
  if v_cap.report_id is not null and v_cap.report_id is distinct from p_report_id then raise exception 'worker_capability_report_mismatch'; end if;
  if v_cap.recipient_email is not null and lower(trim(p_recipient)) is distinct from lower(v_cap.recipient_email::text) then
    raise exception 'worker_capability_recipient_mismatch';
  end if;
  perform set_config('phase14.worker_capability_id', v_cap.id::text, true);
  perform set_config('phase14.worker_capability_type', v_cap.capability_type, true);
  return to_jsonb(v_cap) - 'issue_secret_hash' - 'lease_secret_hash';
end;
$function$;

-- Replace the old service-role boolean bypass with a transaction-local worker
-- context that only the non-exposed activation helper can establish.
create or replace function public.phase14_require_security(
  p_action text,
  p_allowed_roles public.admin_role[] default array['platform_admin']::public.admin_role[],
  p_require_aal2 boolean default true,
  p_allow_service_role boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_gate public.phase14_security_gates%rowtype; v_actor jsonb; v_policy_key text;
  v_capability_id uuid; v_capability_type text; v_cap public.phase14_worker_capabilities%rowtype;
begin
  select * into v_gate from public.phase14_security_gates
  where gate_key = 'phase14-premium-report' for share;
  if not found or v_gate.status <> 'satisfied' or v_gate.satisfied_version < v_gate.required_version then
    raise exception 'phase14_security_gate_unsatisfied:%', p_action;
  end if;

  if coalesce(auth.jwt()->>'role','') = 'service_role' then
    begin
      v_capability_id := nullif(current_setting('phase14.worker_capability_id', true), '')::uuid;
      v_capability_type := nullif(current_setting('phase14.worker_capability_type', true), '');
    exception when others then
      raise exception 'phase14_worker_context_missing:%', p_action;
    end;
    if v_capability_id is null or v_capability_type is null then raise exception 'phase14_worker_context_missing:%', p_action; end if;
    select * into v_cap from public.phase14_worker_capabilities where id = v_capability_id for share;
    if not found or v_cap.status <> 'leased' or v_cap.lease_expires_at <= now()
       or v_cap.security_gate_version <> v_gate.satisfied_version then
      raise exception 'phase14_worker_context_invalid:%', p_action;
    end if;
    if not (
      (v_capability_type in ('automatic_generation','generation_recovery') and p_action in ('report_generation','report_regeneration','ai_narrative_generation'))
      or (v_capability_type = 'automatic_delivery' and p_action in ('email_delivery','automatic_delivery','delivery_finalization','provider_reconciliation'))
      or (v_capability_type = 'delivery_reconciliation' and p_action in ('provider_reconciliation','delivery_finalization','automatic_delivery'))
      or (v_capability_type = 'storage_cleanup' and p_action = 'storage_cleanup')
    ) then raise exception 'phase14_worker_action_forbidden:%', p_action; end if;
    perform public.phase14_require_policy(v_cap.policy_key);
    return jsonb_build_object('actor_type','worker','capability_id',v_cap.id,
      'capability_type',v_cap.capability_type,'gate_version',v_gate.satisfied_version,'action',p_action);
  end if;

  v_actor := public.phase14_require_actor(p_action, p_allowed_roles, p_require_aal2);
  v_policy_key := case
    when p_action in ('report_generation','report_regeneration') then 'manual_generation'
    when p_action = 'ai_narrative_generation' then 'ai_narrative'
    when p_action in ('email_delivery','email_resend','provider_reconciliation','delivery_finalization','automatic_delivery') then 'manual_delivery'
    else null end;
  if v_policy_key is not null then perform public.phase14_require_policy(v_policy_key); end if;
  return v_actor || jsonb_build_object('gate_version',v_gate.satisfied_version,'action',p_action);
end;
$function$;

create or replace function public.authorize_phase14_worker_action(
  p_capability_id uuid,
  p_lease_token text,
  p_action text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare v_cap public.phase14_worker_capabilities%rowtype;
begin
  select * into v_cap from public.phase14_worker_capabilities where id = p_capability_id;
  if not found then raise exception 'phase14_worker_capability_missing'; end if;
  perform public.phase14_activate_worker_capability(
    p_capability_id, p_lease_token, array[v_cap.capability_type],
    v_cap.order_id, v_cap.assessment_id, v_cap.score_run_id, v_cap.fulfilment_id,
    v_cap.report_id, v_cap.recipient_email::text
  );
  return public.phase14_require_security(p_action, array['platform_admin']::public.admin_role[], true, false);
end;
$function$;

create or replace function public.complete_phase14_worker_capability(
  p_capability_id uuid,
  p_lease_token text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare v_cap public.phase14_worker_capabilities%rowtype;
begin
  select * into v_cap from public.phase14_worker_capabilities where id = p_capability_id for update;
  if not found or v_cap.status <> 'leased' or v_cap.lease_expires_at <= now()
     or encode(extensions.digest(convert_to(coalesce(p_lease_token,''), 'UTF8'), 'sha256'), 'hex') <> v_cap.lease_secret_hash then
    raise exception 'phase14_worker_capability_completion_invalid';
  end if;
  update public.phase14_worker_capabilities
  set status = 'consumed', consumed_at = now(), lease_secret_hash = null,
      lease_expires_at = null, updated_at = now()
  where id = v_cap.id;
  return true;
end;
$function$;
-- 4. Reports are RPC-owned. Reconcile any UAT-only duplicate "current" rows by
-- keeping the highest version and superseding older rows before adding the
-- invariant. This is transactional and therefore restartable after failure.
drop policy if exists reports_admin_manage on public.reports;

with ranked as (
  select r.id, r.assessment_id, r.report_type, r.status, r.version_number,
    row_number() over (
      partition by r.assessment_id, r.report_type
      order by r.version_number desc, r.created_at desc, r.id desc
    ) as current_rank
  from public.reports r
  where r.status in ('generated','under_review','approved','released')
), reconciled as (
  update public.reports r
  set status = 'superseded', updated_at = now()
  from ranked x
  where r.id = x.id and x.current_rank > 1
  returning r.id, r.assessment_id, r.report_reference, r.version_number
)
insert into public.report_events(report_id, event_type, note, metadata_json)
select id, 'migration_duplicate_current_reconciled',
  'Older current report superseded by forward-only Phase 14 remediation.',
  jsonb_build_object('report_reference', report_reference, 'version_number', version_number)
from reconciled;

create unique index reports_one_current_assessment_type_uidx
  on public.reports(assessment_id, report_type)
  where status in ('generated','under_review','approved','released');

revoke all on table public.reports from public, anon, authenticated, service_role;
grant select on table public.reports to authenticated, service_role;

-- 5. Requested AI routing identity and provider-resolved identity are distinct.
alter table public.report_ai_attempts
  add column requested_provider text,
  add column requested_model text,
  add column resolved_provider text,
  add column resolved_model text;

update public.report_ai_attempts
set requested_provider = coalesce(requested_provider, provider),
    requested_model = coalesce(requested_model, model),
    resolved_provider = coalesce(resolved_provider, output_json->>'provider', provider),
    resolved_model = coalesce(resolved_model, output_json->>'model', model);

alter table public.report_ai_attempts
  alter column requested_provider set not null,
  alter column requested_model set not null,
  drop constraint if exists report_ai_attempts_full_fingerprint_unique;

alter table public.report_ai_attempts
  add constraint report_ai_attempts_full_fingerprint_unique unique (
    generation_identity, evidence_checksum, requested_provider, requested_model,
    prompt_version, schema_version, attempt_kind, attempt_number
  ),
  add constraint report_ai_attempts_resolved_identity_chk check (
    status not in ('succeeded','accounting_unverified')
    or (coalesce(trim(resolved_provider), '') <> '' and coalesce(trim(resolved_model), '') <> '')
  );

alter table public.report_generation_runs
  add column requested_provider text,
  add column requested_model text,
  add column resolved_provider text,
  add column resolved_model text;

update public.report_generation_runs
set requested_provider = case when generation_mode = 'deterministic_fallback' then null else coalesce(requested_provider, provider) end,
    requested_model = case when generation_mode = 'deterministic_fallback' then null else coalesce(requested_model, model) end,
    resolved_provider = case when generation_mode = 'deterministic_fallback' then null else coalesce(resolved_provider, provider) end,
    resolved_model = case when generation_mode = 'deterministic_fallback' then null else coalesce(resolved_model, model) end;

alter table public.report_generation_runs
  add constraint report_generation_runs_routing_identity_chk check (
    generation_mode = 'deterministic_fallback'
    or (
      coalesce(trim(requested_provider), '') <> '' and coalesce(trim(requested_model), '') <> ''
      and coalesce(trim(resolved_provider), '') <> '' and coalesce(trim(resolved_model), '') <> ''
    )
  );

-- 6. Durable object-cleanup queue. A path is recorded before publication and
-- every deletion attempt is leased, counted, and alertable.
create table public.phase14_storage_cleanup_queue (
  id uuid primary key default gen_random_uuid(),
  storage_bucket text not null check (coalesce(trim(storage_bucket), '') <> ''),
  storage_path text not null check (storage_path like 'tmp/%'),
  expected_checksum text not null check (expected_checksum ~ '^[0-9a-f]{64}$'),
  claim_token uuid,
  report_id uuid references public.reports(id) on delete restrict,
  owner_admin_user_id uuid references public.admin_profiles(id) on delete restrict,
  owner_capability_id uuid references public.phase14_worker_capabilities(id) on delete restrict,
  cleanup_reason text not null check (coalesce(trim(cleanup_reason), '') <> ''),
  status text not null default 'pending' check (status in ('pending','leased','failed','deleted','dead_letter')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  lease_owner_capability_id uuid references public.phase14_worker_capabilities(id) on delete restrict,
  lease_token uuid,
  lease_expires_at timestamptz,
  last_attempt_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  deleted_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint phase14_storage_cleanup_owner_chk check (
    owner_admin_user_id is not null or owner_capability_id is not null
  ),
  constraint phase14_storage_cleanup_lease_chk check (
    (status = 'leased' and lease_owner_capability_id is not null and lease_token is not null and lease_expires_at is not null)
    or status <> 'leased'
  ),
  unique(storage_bucket, storage_path)
);
create index phase14_storage_cleanup_work_idx
  on public.phase14_storage_cleanup_queue(status, next_attempt_at, created_at)
  where status in ('pending','failed');
alter table public.phase14_storage_cleanup_queue enable row level security;
revoke all on table public.phase14_storage_cleanup_queue from public, anon, authenticated, service_role;
grant select on table public.phase14_storage_cleanup_queue to authenticated;
create policy phase14_storage_cleanup_admin_select on public.phase14_storage_cleanup_queue
  for select to authenticated
  using (public.current_admin_role() in ('platform_admin','reviewer','approver','read_only_admin'));

create or replace function public.register_phase14_storage_cleanup(
  p_storage_bucket text,
  p_storage_path text,
  p_expected_checksum text,
  p_claim_token uuid,
  p_reason text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare v_actor jsonb; v_id uuid; v_capability_id uuid;
begin
  v_actor := public.phase14_require_security(
    'report_generation', array['platform_admin','reviewer','approver']::public.admin_role[], true, false
  );
  if p_storage_path not like 'tmp/%' then raise exception 'cleanup_temporary_path_required'; end if;
  if p_expected_checksum !~ '^[0-9a-f]{64}$' then raise exception 'cleanup_checksum_invalid'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'cleanup_reason_required'; end if;
  v_capability_id := nullif(v_actor->>'capability_id','')::uuid;
  insert into public.phase14_storage_cleanup_queue(
    storage_bucket, storage_path, expected_checksum, claim_token,
    owner_admin_user_id, owner_capability_id, cleanup_reason
  ) values (
    p_storage_bucket, p_storage_path, p_expected_checksum, p_claim_token,
    nullif(v_actor->>'user_id','')::uuid, v_capability_id, p_reason
  )
  on conflict (storage_bucket, storage_path) do update
  set updated_at = now()
  where public.phase14_storage_cleanup_queue.expected_checksum = excluded.expected_checksum
    and public.phase14_storage_cleanup_queue.claim_token is not distinct from excluded.claim_token
  returning id into v_id;
  if v_id is null then raise exception 'cleanup_path_ownership_conflict'; end if;
  return v_id;
end;
$function$;

create or replace function public.link_phase14_storage_cleanup_report(
  p_cleanup_id uuid,
  p_report_id uuid
) returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare v_queue public.phase14_storage_cleanup_queue%rowtype; v_report public.reports%rowtype;
begin
  perform public.phase14_require_security(
    'report_generation', array['platform_admin','reviewer','approver']::public.admin_role[], true, false
  );
  select * into v_queue from public.phase14_storage_cleanup_queue where id = p_cleanup_id for update;
  select * into v_report from public.reports where id = p_report_id for share;
  if not found then raise exception 'cleanup_report_missing'; end if;
  if v_queue.claim_token is not null and not exists (
    select 1 from public.report_generation_claims c
    where c.claim_token = v_queue.claim_token and c.report_id = p_report_id
  ) then raise exception 'cleanup_report_claim_binding_mismatch'; end if;
  update public.phase14_storage_cleanup_queue set report_id = p_report_id, updated_at = now() where id = p_cleanup_id;
  return true;
end;
$function$;

create or replace function public.record_phase14_storage_cleanup_result(
  p_cleanup_id uuid,
  p_deleted boolean,
  p_error text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare v_actor jsonb; v_queue public.phase14_storage_cleanup_queue%rowtype; v_attempt integer;
begin
  v_actor := public.phase14_require_security(
    'report_generation', array['platform_admin','reviewer','approver']::public.admin_role[], true, false
  );
  select * into v_queue from public.phase14_storage_cleanup_queue where id = p_cleanup_id for update;
  if not found then raise exception 'cleanup_queue_item_missing'; end if;
  v_attempt := v_queue.attempt_count + 1;
  if p_deleted then
    update public.phase14_storage_cleanup_queue
    set status = 'deleted', attempt_count = v_attempt, last_attempt_at = now(), deleted_at = now(),
        last_error = null, lease_owner_capability_id = null, lease_token = null,
        lease_expires_at = null, updated_at = now()
    where id = p_cleanup_id;
  else
    if coalesce(trim(p_error), '') = '' then raise exception 'cleanup_error_required'; end if;
    update public.phase14_storage_cleanup_queue
    set status = case when v_attempt >= 5 then 'dead_letter' else 'failed' end,
        attempt_count = v_attempt, last_attempt_at = now(), last_error = p_error,
        next_attempt_at = now() + make_interval(secs => least(3600, 30 * (2 ^ least(v_attempt, 7))::integer)),
        lease_owner_capability_id = null, lease_token = null, lease_expires_at = null, updated_at = now()
    where id = p_cleanup_id;
    insert into public.phase14_operational_alerts(
      alert_key, severity, category, report_id, detail_json
    ) values (
      'storage-cleanup:' || p_cleanup_id::text,
      case when v_attempt >= 5 then 'critical' else 'warning' end,
      'report_temporary_object_cleanup_failed', v_queue.report_id,
      jsonb_build_object('cleanup_id', p_cleanup_id, 'bucket', v_queue.storage_bucket,
        'path', v_queue.storage_path, 'attempt_count', v_attempt, 'error', p_error)
    ) on conflict (alert_key) do update
      set severity = excluded.severity, detail_json = excluded.detail_json, status = 'open';
  end if;
  return jsonb_build_object('cleanup_id', p_cleanup_id, 'deleted', p_deleted, 'attempt_count', v_attempt);
end;
$function$;

create or replace function public.cleanup_expired_premium_report_claims(
  p_older_than interval default interval '24 hours'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare v_count integer; v_queued integer;
begin
  perform public.phase14_require_security('storage_cleanup', array['platform_admin']::public.admin_role[], true, false);
  if p_older_than < interval '1 hour' or p_older_than > interval '30 days' then
    raise exception 'phase14_cleanup_retention_out_of_range';
  end if;
  with candidates as (
    select * from public.report_generation_claims
    where report_id is null and state in ('claimed','abandoned')
      and lease_expires_at < now() - p_older_than
    for update
  ), queued as (
    insert into public.phase14_storage_cleanup_queue(
      storage_bucket, storage_path, expected_checksum, claim_token,
      owner_capability_id, cleanup_reason
    )
    select temporary_storage_bucket, temporary_storage_path,
      coalesce(expected_checksum, repeat('0',64)), claim_token,
      nullif(current_setting('phase14.worker_capability_id', true),'')::uuid,
      'Expired generation claim cleanup'
    from candidates
    where temporary_storage_bucket is not null and temporary_storage_path is not null
    on conflict (storage_bucket, storage_path) do nothing
    returning 1
  ), deleted as (
    delete from public.report_generation_claims c using candidates x
    where c.claim_token = x.claim_token returning 1
  )
  select (select count(*) from deleted), (select count(*) from queued)
  into v_count, v_queued;
  return jsonb_build_object('deleted_claims', v_count, 'queued_cleanup_objects', v_queued);
end;
$function$;

create or replace function public.claim_phase14_storage_cleanup_jobs(
  p_capability_id uuid,
  p_lease_token text,
  p_limit integer default 10
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare v_work_lease uuid := gen_random_uuid(); v_jobs jsonb;
begin
  if p_limit < 1 or p_limit > 50 then raise exception 'cleanup_job_limit_out_of_range'; end if;
  perform public.phase14_activate_worker_capability(
    p_capability_id, p_lease_token, array['storage_cleanup'], null, null, null, null, null, null
  );
  with selected as (
    select id from public.phase14_storage_cleanup_queue
    where status in ('pending','failed') and next_attempt_at <= now() and attempt_count < 5
    order by created_at for update skip locked limit p_limit
  ), leased as (
    update public.phase14_storage_cleanup_queue q
    set status = 'leased', lease_owner_capability_id = p_capability_id,
        lease_token = v_work_lease, lease_expires_at = now() + interval '10 minutes', updated_at = now()
    from selected s where q.id = s.id
    returning q.id, q.storage_bucket, q.storage_path, q.expected_checksum, q.attempt_count
  )
  select coalesce(jsonb_agg(to_jsonb(leased)), '[]'::jsonb) into v_jobs from leased;
  return jsonb_build_object('work_lease_token', v_work_lease, 'jobs', v_jobs);
end;
$function$;

create or replace function public.complete_phase14_storage_cleanup_job(
  p_capability_id uuid,
  p_capability_lease_token text,
  p_cleanup_id uuid,
  p_work_lease_token uuid,
  p_deleted boolean,
  p_error text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare v_queue public.phase14_storage_cleanup_queue%rowtype; v_attempt integer;
begin
  perform public.phase14_activate_worker_capability(
    p_capability_id, p_capability_lease_token, array['storage_cleanup'], null, null, null, null, null, null
  );
  select * into v_queue from public.phase14_storage_cleanup_queue where id = p_cleanup_id for update;
  if not found or v_queue.status <> 'leased' or v_queue.lease_owner_capability_id <> p_capability_id
     or v_queue.lease_token <> p_work_lease_token or v_queue.lease_expires_at <= now() then
    raise exception 'cleanup_job_lease_invalid';
  end if;
  v_attempt := v_queue.attempt_count + 1;
  update public.phase14_storage_cleanup_queue
  set status = case when p_deleted then 'deleted' when v_attempt >= 5 then 'dead_letter' else 'failed' end,
      attempt_count = v_attempt, last_attempt_at = now(),
      deleted_at = case when p_deleted then now() else null end,
      last_error = case when p_deleted then null else nullif(trim(p_error),'') end,
      next_attempt_at = case when p_deleted then next_attempt_at else now() + make_interval(secs => least(3600, 30 * (2 ^ least(v_attempt,7))::integer)) end,
      lease_owner_capability_id = null, lease_token = null, lease_expires_at = null, updated_at = now()
  where id = p_cleanup_id;
  if not p_deleted then
    if coalesce(trim(p_error), '') = '' then raise exception 'cleanup_error_required'; end if;
    insert into public.phase14_operational_alerts(alert_key,severity,category,report_id,detail_json)
    values ('storage-cleanup:' || p_cleanup_id::text,
      case when v_attempt >= 5 then 'critical' else 'warning' end,
      'report_temporary_object_cleanup_failed', v_queue.report_id,
      jsonb_build_object('cleanup_id',p_cleanup_id,'bucket',v_queue.storage_bucket,
        'path',v_queue.storage_path,'attempt_count',v_attempt,'error',p_error))
    on conflict (alert_key) do update
      set severity=excluded.severity,detail_json=excluded.detail_json,status='open';
  end if;
  return jsonb_build_object('cleanup_id',p_cleanup_id,'deleted',p_deleted,'attempt_count',v_attempt);
end;
$function$;

-- 7. Complaint and bounce outcomes are separate. Complaints are permanently
-- non-retriable; a bounce requires a fresh AAL2 remediation record with evidence.
create table public.report_delivery_remediations (
  id uuid primary key default gen_random_uuid(),
  prior_email_event_id uuid not null references public.email_events(id) on delete restrict,
  report_id uuid not null references public.reports(id) on delete restrict,
  recipient_email citext not null,
  remediation_type text not null check (remediation_type = 'bounce_retry'),
  reason text not null check (coalesce(trim(reason), '') <> ''),
  evidence_json jsonb not null check (evidence_json <> '{}'::jsonb),
  authorised_by uuid not null references public.admin_profiles(id) on delete restrict,
  status text not null default 'authorised' check (status in ('authorised','consumed','revoked')),
  authorised_at timestamptz not null default now(),
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.report_delivery_remediations enable row level security;
revoke all on table public.report_delivery_remediations from public,anon,authenticated,service_role;
grant select on table public.report_delivery_remediations to authenticated;
create policy report_delivery_remediations_admin_select on public.report_delivery_remediations
  for select to authenticated
  using (public.current_admin_role() in ('platform_admin','approver','reviewer','read_only_admin'));

alter table public.report_delivery_authorizations
  add constraint report_delivery_authorizations_bounce_remediation_fk
  foreign key (bounce_remediation_id) references public.report_delivery_remediations(id) on delete restrict;

create or replace function public.authorize_bounced_report_redelivery(
  p_prior_email_event_id uuid,
  p_reason text,
  p_evidence jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare v_actor jsonb; v_event public.email_events%rowtype; v_id uuid;
begin
  v_actor := public.phase14_require_security(
    'email_resend', array['platform_admin','approver']::public.admin_role[], true, false
  );
  if coalesce(trim(p_reason),'') = '' or coalesce(p_evidence,'{}'::jsonb) = '{}'::jsonb then
    raise exception 'bounce_remediation_evidence_required';
  end if;
  select * into v_event from public.email_events where id = p_prior_email_event_id for share;
  if not found or v_event.status <> 'bounced' then raise exception 'bounce_remediation_event_ineligible'; end if;
  insert into public.report_delivery_remediations(
    prior_email_event_id, report_id, recipient_email, remediation_type,
    reason, evidence_json, authorised_by
  ) values (
    v_event.id, v_event.report_id, v_event.recipient_email, 'bounce_retry',
    p_reason, p_evidence, (v_actor->>'user_id')::uuid
  ) returning id into v_id;
  insert into public.audit_logs(actor_type,actor_user_id,assessment_id,entity_table,entity_id,action,after_json)
  values ('admin',(v_actor->>'user_id')::uuid,v_event.assessment_id,'report_delivery_remediations',v_id,
    'premium_report_bounce_retry_authorized',jsonb_build_object('prior_email_event_id',v_event.id,'reason',p_reason,'evidence',p_evidence));
  return v_id;
end;
$function$;
-- 8. Publication requires a live generation lease. Capability-specific worker
-- facades activate scoped context; direct service-role execution stays revoked.
create or replace function public.publish_premium_report_generation(
  p_claim_token uuid,
  p_report_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_claim public.report_generation_claims%rowtype;
  v_report public.reports%rowtype;
  v_order_reference text;
  v_object record;
begin
  perform public.phase14_require_security(
    'report_generation', array['platform_admin','reviewer','approver']::public.admin_role[], true, false
  );
  select * into v_claim from public.report_generation_claims where claim_token = p_claim_token for update;
  if not found or v_claim.report_id <> p_report_id or v_claim.state <> 'committed' then
    raise exception 'generation_claim_report_mismatch';
  end if;
  if v_claim.lease_expires_at <= now() then raise exception 'generation_claim_expired_at_publication'; end if;
  select * into v_report from public.reports where id = p_report_id for update;
  if not found or v_report.status <> 'draft' then raise exception 'report_draft_missing'; end if;
  if v_report.order_id <> v_claim.order_id or v_report.assessment_id <> v_claim.assessment_id
     or v_report.score_run_id <> v_claim.score_run_id or v_report.version_number <> v_claim.version_number
     or v_report.checksum <> v_claim.expected_checksum then raise exception 'report_claim_binding_mismatch'; end if;
  select order_reference into v_order_reference from public.orders where id = v_claim.order_id;
  perform public.phase14_generation_entitlement(
    v_order_reference, v_claim.order_id, v_claim.assessment_id, v_claim.score_run_id, v_claim.score_input_hash
  );
  if v_claim.final_storage_path like 'tmp/%' or coalesce(v_claim.final_storage_path, '') = '' then
    raise exception 'final_storage_path_invalid';
  end if;
  select so.bucket_id, so.name, so.metadata into v_object
  from storage.objects so
  where so.bucket_id = v_claim.final_storage_bucket and so.name = v_claim.final_storage_path;
  if not found then raise exception 'final_storage_object_missing'; end if;
  if coalesce(v_object.metadata->>'mimetype', '') <> 'application/pdf' then
    raise exception 'final_storage_content_type_invalid';
  end if;
  if coalesce(v_object.metadata->>'sha256', v_object.metadata->'metadata'->>'sha256', '') <> v_claim.expected_checksum then
    raise exception 'final_storage_checksum_metadata_mismatch';
  end if;
  if v_report.supersedes_report_id is not null then
    update public.reports set status = 'superseded'
    where id = v_report.supersedes_report_id and status not in ('voided','superseded');
  end if;
  update public.reports
  set status = 'generated', storage_bucket = v_claim.final_storage_bucket,
      storage_path = v_claim.final_storage_path, updated_at = now()
  where id = p_report_id;
  delete from public.report_generation_claims where claim_token = p_claim_token;
  return jsonb_build_object(
    'report_id', p_report_id, 'report_reference', v_report.report_reference,
    'version_number', v_report.version_number, 'superseded_report_id', v_report.supersedes_report_id,
    'final_storage_bucket', v_claim.final_storage_bucket, 'final_storage_path', v_claim.final_storage_path
  );
end;
$function$;

create or replace function public.worker_claim_premium_report_generation(
  p_capability_id uuid,
  p_capability_lease_token text,
  p_order_reference text,
  p_claim_owner text,
  p_fulfilment_id uuid,
  p_report_type public.report_type default 'essential_self_assessment'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare v_context jsonb;
begin
  v_context := public.phase14_generation_entitlement(p_order_reference);
  perform public.phase14_activate_worker_capability(
    p_capability_id, p_capability_lease_token,
    array['automatic_generation','generation_recovery'],
    (v_context->>'order_id')::uuid, (v_context->>'assessment_id')::uuid,
    (v_context->>'score_run_id')::uuid, p_fulfilment_id, null, null
  );
  return public.claim_premium_report_generation(
    p_order_reference, p_claim_owner, p_fulfilment_id, p_report_type
  );
end;
$function$;

create or replace function public.worker_renew_premium_report_generation_lease(
  p_capability_id uuid,
  p_capability_lease_token text,
  p_claim_token uuid
) returns timestamptz
language plpgsql
security definer
set search_path = ''
as $function$
declare v_claim public.report_generation_claims%rowtype;
begin
  select * into v_claim from public.report_generation_claims where claim_token = p_claim_token;
  if not found then raise exception 'generation_claim_missing'; end if;
  perform public.phase14_activate_worker_capability(
    p_capability_id,p_capability_lease_token,array['automatic_generation','generation_recovery'],
    v_claim.order_id,v_claim.assessment_id,v_claim.score_run_id,v_claim.fulfilment_id,v_claim.report_id,null
  );
  return public.renew_premium_report_generation_lease(p_claim_token);
end;
$function$;

create or replace function public.worker_recover_premium_report_generation_claim(
  p_capability_id uuid,
  p_capability_lease_token text,
  p_order_reference text,
  p_claim_owner text,
  p_fulfilment_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare v_context jsonb;
begin
  v_context := public.phase14_generation_entitlement(p_order_reference);
  perform public.phase14_activate_worker_capability(
    p_capability_id,p_capability_lease_token,array['automatic_generation','generation_recovery'],
    (v_context->>'order_id')::uuid,(v_context->>'assessment_id')::uuid,
    (v_context->>'score_run_id')::uuid,p_fulfilment_id,null,null
  );
  return public.recover_premium_report_generation_claim(p_order_reference,p_claim_owner);
end;
$function$;

create or replace function public.worker_commit_premium_report_draft(
  p_capability_id uuid,
  p_capability_lease_token text,
  p_claim_token uuid,
  p_template_id uuid,
  p_storage_bucket text,
  p_temp_storage_path text,
  p_checksum text,
  p_generation_run_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare v_claim public.report_generation_claims%rowtype;
begin
  select * into v_claim from public.report_generation_claims where claim_token = p_claim_token;
  if not found then raise exception 'generation_claim_missing'; end if;
  perform public.phase14_activate_worker_capability(
    p_capability_id,p_capability_lease_token,array['automatic_generation','generation_recovery'],
    v_claim.order_id,v_claim.assessment_id,v_claim.score_run_id,v_claim.fulfilment_id,v_claim.report_id,null
  );
  return public.commit_premium_report_draft(
    p_claim_token,p_template_id,p_storage_bucket,p_temp_storage_path,p_checksum,null,p_generation_run_id
  );
end;
$function$;

create or replace function public.worker_publish_premium_report_generation(
  p_capability_id uuid,
  p_capability_lease_token text,
  p_claim_token uuid,
  p_report_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare v_claim public.report_generation_claims%rowtype;
begin
  select * into v_claim from public.report_generation_claims where claim_token = p_claim_token;
  if not found then raise exception 'generation_claim_missing'; end if;
  perform public.phase14_activate_worker_capability(
    p_capability_id,p_capability_lease_token,array['automatic_generation','generation_recovery'],
    v_claim.order_id,v_claim.assessment_id,v_claim.score_run_id,v_claim.fulfilment_id,p_report_id,null
  );
  return public.publish_premium_report_generation(p_claim_token,p_report_id);
end;
$function$;

create or replace function public.worker_abandon_premium_report_generation_claim(
  p_capability_id uuid,
  p_capability_lease_token text,
  p_claim_token uuid,
  p_reason text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare v_claim public.report_generation_claims%rowtype; v_result boolean;
begin
  select * into v_claim from public.report_generation_claims where claim_token = p_claim_token;
  if not found then return false; end if;
  perform public.phase14_activate_worker_capability(
    p_capability_id,p_capability_lease_token,array['automatic_generation','generation_recovery'],
    v_claim.order_id,v_claim.assessment_id,v_claim.score_run_id,v_claim.fulfilment_id,v_claim.report_id,null
  );
  v_result := public.abandon_premium_report_generation_claim(p_claim_token,p_reason);
  return v_result;
end;
$function$;

create or replace function public.worker_register_phase14_storage_cleanup(
  p_capability_id uuid,
  p_capability_lease_token text,
  p_storage_bucket text,
  p_storage_path text,
  p_expected_checksum text,
  p_claim_token uuid,
  p_reason text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare v_claim public.report_generation_claims%rowtype;
begin
  select * into v_claim from public.report_generation_claims where claim_token = p_claim_token;
  if not found then raise exception 'generation_claim_missing'; end if;
  perform public.phase14_activate_worker_capability(
    p_capability_id,p_capability_lease_token,array['automatic_generation','generation_recovery'],
    v_claim.order_id,v_claim.assessment_id,v_claim.score_run_id,v_claim.fulfilment_id,v_claim.report_id,null
  );
  return public.register_phase14_storage_cleanup(
    p_storage_bucket,p_storage_path,p_expected_checksum,p_claim_token,p_reason
  );
end;
$function$;

create or replace function public.worker_link_phase14_storage_cleanup_report(
  p_capability_id uuid,
  p_capability_lease_token text,
  p_cleanup_id uuid,
  p_report_id uuid
) returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare v_report public.reports%rowtype; v_fulfilment_id uuid;
begin
  select * into v_report from public.reports where id = p_report_id;
  if not found then raise exception 'cleanup_report_missing'; end if;
  select fulfilment_id into v_fulfilment_id from public.reports where id = p_report_id;
  perform public.phase14_activate_worker_capability(
    p_capability_id,p_capability_lease_token,array['automatic_generation','generation_recovery'],
    v_report.order_id,v_report.assessment_id,v_report.score_run_id,v_fulfilment_id,p_report_id,null
  );
  return public.link_phase14_storage_cleanup_report(p_cleanup_id,p_report_id);
end;
$function$;

create or replace function public.worker_record_phase14_storage_cleanup_result(
  p_capability_id uuid,
  p_capability_lease_token text,
  p_cleanup_id uuid,
  p_deleted boolean,
  p_error text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare v_queue public.phase14_storage_cleanup_queue%rowtype; v_cap public.phase14_worker_capabilities%rowtype;
begin
  select * into v_queue from public.phase14_storage_cleanup_queue where id = p_cleanup_id;
  select * into v_cap from public.phase14_worker_capabilities where id = p_capability_id;
  if not found then raise exception 'phase14_worker_capability_missing'; end if;
  perform public.phase14_activate_worker_capability(
    p_capability_id,p_capability_lease_token,array['automatic_generation','generation_recovery'],
    v_cap.order_id,v_cap.assessment_id,v_cap.score_run_id,v_cap.fulfilment_id,v_queue.report_id,null
  );
  return public.record_phase14_storage_cleanup_result(p_cleanup_id,p_deleted,p_error);
end;
$function$;

-- 9. Delivery authorization distinguishes complaints, bounce remediation, and
-- manual versus automatic policy. Recipient override has its own policy.
drop function if exists public.authorize_premium_report_delivery(uuid,text,boolean,boolean,text);

create function public.authorize_premium_report_delivery(
  p_report_id uuid,
  p_recipient text,
  p_delivery_mode text default 'initial',
  p_allow_test_override boolean default false,
  p_provider text default 'resend',
  p_bounce_remediation_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor jsonb; v_context jsonb; v_gate_version integer; v_event public.email_events%rowtype;
  v_auth public.report_delivery_authorizations%rowtype; v_attempt integer; v_dedupe text;
  v_prior_bounce public.email_events%rowtype; v_remediation public.report_delivery_remediations%rowtype;
  v_worker_capability_id uuid;
begin
  if p_delivery_mode not in ('initial','bounce_retry') then
    raise exception 'delivery_mode_invalid';
  end if;
  v_actor := public.phase14_require_security(
    case when p_delivery_mode = 'bounce_retry' then 'email_resend' else 'email_delivery' end,
    array['platform_admin','approver']::public.admin_role[], true, false
  );
  if p_allow_test_override then perform public.phase14_require_policy('recipient_override'); end if;
  if coalesce(trim(p_provider), '') = '' then raise exception 'delivery_provider_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'phase14-delivery:' || p_report_id::text || ':' || lower(trim(p_recipient)), 0
  ));
  v_context := public.phase14_delivery_entitlement(p_report_id,p_recipient,p_allow_test_override,'email_delivery');
  v_gate_version := (v_actor->>'gate_version')::integer;
  v_worker_capability_id := nullif(v_actor->>'capability_id','')::uuid;

  if exists (
    select 1 from public.email_events where report_id = p_report_id
      and recipient_email = lower(trim(p_recipient)) and status = 'complained'
  ) then raise exception 'delivery_complaint_permanently_non_retriable'; end if;

  if exists (
    select 1 from public.email_events where report_id = p_report_id
      and recipient_email = lower(trim(p_recipient))
      and status in ('sending','provider_acceptance_uncertain','reconciliation_required')
  ) then raise exception 'delivery_provider_acceptance_unresolved'; end if;

  select * into v_prior_bounce from public.email_events
  where report_id = p_report_id and recipient_email = lower(trim(p_recipient))
    and notification_type = 'premium_report_pdf' and status = 'bounced'
  order by created_at desc limit 1;
  if found and p_delivery_mode = 'bounce_retry' then
    select * into v_remediation from public.report_delivery_remediations
    where id = p_bounce_remediation_id and prior_email_event_id = v_prior_bounce.id
      and report_id = p_report_id and recipient_email = lower(trim(p_recipient))
      and remediation_type = 'bounce_retry' and status = 'authorised'
    for update;
    if not found then raise exception 'delivery_bounce_remediation_required'; end if;
  elsif p_delivery_mode = 'bounce_retry' then
    raise exception 'delivery_bounce_remediation_not_applicable';
  end if;

  if p_delivery_mode = 'initial' then
    select * into v_event from public.email_events
    where report_id = p_report_id and recipient_email = lower(trim(p_recipient))
      and notification_type = 'premium_report_pdf'
      and status in ('sent','delivery_delayed','delivered','bounced','complained')
    order by created_at desc limit 1;
    if found then
      return jsonb_build_object('reused_existing_send',true,'email_event_id',v_event.id,
        'provider_message_id',v_event.provider_message_id,'status',v_event.status,
        'recipient',lower(trim(p_recipient)),'test_delivery',(v_context->>'test_delivery')::boolean);
    end if;
  end if;

  select count(*) + 1 into v_attempt from public.email_events
  where report_id = p_report_id and recipient_email = lower(trim(p_recipient))
    and notification_type = 'premium_report_pdf';
  v_dedupe := 'premium-report-delivery:' || p_report_id || ':' || lower(trim(p_recipient)) || ':attempt-' || v_attempt;
  insert into public.email_events(
    assessment_id,order_id,report_id,recipient_email,template_key,notification_type,
    dedupe_key,provider_request_key,provider_idempotency_key,provider,status,attempt_number,metadata_json
  ) values (
    (v_context->>'assessment_id')::uuid,(v_context->>'order_id')::uuid,p_report_id,
    lower(trim(p_recipient)),'premium_report_pdf_v1','premium_report_pdf',v_dedupe,
    v_dedupe,v_dedupe,lower(trim(p_provider)),'queued',v_attempt,
    jsonb_build_object('attachment_checksum',v_context->>'report_checksum',
      'test_delivery',(v_context->>'test_delivery')::boolean,'bounce_remediation_id',p_bounce_remediation_id)
  ) returning * into v_event;
  insert into public.report_delivery_authorizations(
    report_id,report_checksum,recipient_email,order_id,assessment_id,score_run_id,
    security_gate_version,authorised_by,authorised_session_id,worker_capability_id,
    provider,email_event_id,test_delivery,bounce_remediation_id
  ) values (
    p_report_id,v_context->>'report_checksum',lower(trim(p_recipient)),
    (v_context->>'order_id')::uuid,(v_context->>'assessment_id')::uuid,
    (v_context->>'score_run_id')::uuid,v_gate_version,nullif(v_actor->>'user_id','')::uuid,
    nullif(v_actor->>'session_id','')::uuid,v_worker_capability_id,
    lower(trim(p_provider)),v_event.id,(v_context->>'test_delivery')::boolean,p_bounce_remediation_id
  ) returning * into v_auth;
  if p_bounce_remediation_id is not null then
    update public.report_delivery_remediations
    set status = 'consumed', consumed_at = now() where id = p_bounce_remediation_id;
  end if;
  return jsonb_build_object(
    'reused_existing_send',false,'authorization_id',v_auth.id,'email_event_id',v_event.id,
    'provider_request_key',v_event.provider_request_key,'attempt_number',v_event.attempt_number,
    'recipient',v_auth.recipient_email,'test_delivery',v_auth.test_delivery,'status',v_auth.status
  );
end;
$function$;

-- Revalidate the complete commercial and storage entitlement at the last
-- reversible point, immediately before provider dispatch.
create or replace function public.mark_premium_report_delivery_dispatch_started(
  p_authorization_id uuid,
  p_lease_token uuid
) returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare v_auth public.report_delivery_authorizations%rowtype; v_context jsonb; v_security jsonb;
begin
  v_security := public.phase14_require_security(
    'automatic_delivery',array['platform_admin','approver']::public.admin_role[],true,false
  );
  select * into v_auth from public.report_delivery_authorizations where id = p_authorization_id for update;
  if not found or v_auth.status <> 'claimed' or v_auth.lease_token <> p_lease_token
     or v_auth.lease_expires_at <= now() then raise exception 'delivery_authorization_lease_invalid'; end if;
  if v_auth.security_gate_version <> (v_security->>'gate_version')::integer then
    raise exception 'delivery_authorization_gate_changed_at_dispatch';
  end if;
  v_context := public.phase14_delivery_entitlement(
    v_auth.report_id,v_auth.recipient_email::text,v_auth.test_delivery,'email_delivery'
  );
  if v_context->>'report_checksum' <> v_auth.report_checksum
     or (v_context->>'order_id')::uuid <> v_auth.order_id
     or (v_context->>'assessment_id')::uuid <> v_auth.assessment_id
     or (v_context->>'score_run_id')::uuid <> v_auth.score_run_id then
    raise exception 'delivery_authorization_binding_changed_at_dispatch';
  end if;
  if v_auth.test_delivery then perform public.phase14_require_policy('recipient_override'); end if;
  update public.report_delivery_authorizations
  set status='dispatching',dispatch_started_at=now(),updated_at=now() where id=v_auth.id;
  update public.email_events
  set status='sending',send_lease_token=p_lease_token,send_lease_expires_at=v_auth.lease_expires_at,
      delivery_updated_at=now(),error_message=null
  where id=v_auth.email_event_id and status='queued';
  if not found then raise exception 'delivery_email_event_not_queued'; end if;
  return true;
end;
$function$;

-- Exact idempotent replay: every immutable binding must match. A mismatch is
-- retained as a critical alert and returns a non-mutating conflict result.
create or replace function public.finalize_premium_report_delivery(
  p_authorization_id uuid,
  p_email_event_id uuid,
  p_provider_message_id text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_auth public.report_delivery_authorizations%rowtype;
  v_existing public.report_delivery_finalizations%rowtype;
  v_report public.reports%rowtype; v_now timestamptz := now(); v_context jsonb;
begin
  perform public.phase14_require_security(
    'delivery_finalization',array['platform_admin','approver']::public.admin_role[],true,false
  );
  select * into v_auth from public.report_delivery_authorizations where id=p_authorization_id for update;
  if not found or v_auth.email_event_id <> p_email_event_id then raise exception 'delivery_finalization_binding_mismatch'; end if;
  if coalesce(trim(p_provider_message_id),'') = '' then raise exception 'provider_message_id_required'; end if;
  select * into v_existing from public.report_delivery_finalizations where authorization_id=p_authorization_id;
  if found then
    if v_existing.authorization_id = p_authorization_id
       and v_existing.email_event_id = p_email_event_id
       and v_existing.report_id = v_auth.report_id
       and v_existing.provider = v_auth.provider
       and v_existing.provider_message_id = p_provider_message_id then
      return jsonb_build_object('finalized',true,'idempotent_replay',true,
        'report_id',v_existing.report_id,'email_event_id',v_existing.email_event_id);
    end if;
    insert into public.phase14_operational_alerts(alert_key,severity,category,report_id,email_event_id,detail_json)
    values ('delivery-finalization-replay-conflict:' || p_authorization_id::text,'critical',
      'delivery_finalization_replay_conflict',v_auth.report_id,p_email_event_id,
      jsonb_build_object('authorization_id',p_authorization_id,'incoming_email_event_id',p_email_event_id,
        'incoming_provider',v_auth.provider,'incoming_provider_message_id',p_provider_message_id,
        'persisted',to_jsonb(v_existing)))
    on conflict (alert_key) do update set severity='critical',detail_json=excluded.detail_json,status='open';
    return jsonb_build_object('finalized',false,'conflict',true,'reason','delivery_finalization_replay_conflict');
  end if;
  if v_auth.status not in ('dispatching','reconciliation_required') then
    raise exception 'delivery_finalization_state_invalid:%',v_auth.status;
  end if;
  v_context := public.phase14_delivery_entitlement(
    v_auth.report_id,v_auth.recipient_email::text,v_auth.test_delivery,'email_delivery'
  );
  if v_context->>'report_checksum' <> v_auth.report_checksum then raise exception 'delivery_finalization_entitlement_changed'; end if;
  select * into v_report from public.reports where id=v_auth.report_id for update;
  if not found then raise exception 'delivery_finalization_report_missing'; end if;
  update public.email_events
  set status='sent',provider=v_auth.provider,provider_message_id=p_provider_message_id,
      sent_at=coalesce(sent_at,v_now),delivery_updated_at=v_now,send_lease_token=null,
      send_lease_expires_at=null,error_message=null
  where id=p_email_event_id and status in ('sending','provider_acceptance_uncertain','reconciliation_required');
  if not found then raise exception 'delivery_finalization_email_cas_failed'; end if;
  if not v_auth.test_delivery then
    update public.reports set status='released',released_at=coalesce(released_at,v_now),updated_at=v_now
    where id=v_report.id and status not in ('draft','superseded','voided');
    if not found then raise exception 'delivery_finalization_report_cas_failed'; end if;
    if v_report.fulfilment_id is not null then
      update public.report_fulfilments
      set status='completed',current_step='email_sent',completed_at=coalesce(completed_at,v_now),
          report_id=v_report.id,updated_at=v_now
      where id=v_report.fulfilment_id and status not in ('cancelled','completed');
    end if;
  end if;
  insert into public.report_delivery_finalizations(
    authorization_id,email_event_id,report_id,provider,provider_message_id,finalized_at
  ) values (v_auth.id,p_email_event_id,v_report.id,v_auth.provider,p_provider_message_id,v_now);
  insert into public.report_events(report_id,event_type,actor_user_id,note,metadata_json)
  values (v_report.id,case when v_auth.test_delivery then 'email_test_sent' else 'email_sent' end,
    v_auth.authorised_by,'Atomic provider-acceptance finalization.',
    jsonb_build_object('authorization_id',v_auth.id,'email_event_id',p_email_event_id,
      'provider_message_id',p_provider_message_id,'test_delivery',v_auth.test_delivery,
      'worker_capability_id',v_auth.worker_capability_id));
  insert into public.audit_logs(actor_type,actor_user_id,assessment_id,entity_table,entity_id,action,after_json)
  values (case when v_auth.worker_capability_id is null then 'admin'::public.audit_actor_type else 'system'::public.audit_actor_type end,
    v_auth.authorised_by,v_auth.assessment_id,'reports',v_report.id,
    case when v_auth.test_delivery then 'premium_report_test_delivery_finalized' else 'premium_report_delivery_finalized' end,
    jsonb_build_object('authorization_id',v_auth.id,'email_event_id',p_email_event_id,
      'provider_message_id',p_provider_message_id,'worker_capability_id',v_auth.worker_capability_id));
  if not v_auth.test_delivery then
    insert into public.assessment_events(assessment_id,order_id,report_id,event_type,dedupe_key,metadata_json)
    values (v_auth.assessment_id,v_auth.order_id,v_report.id,'report_emailed_to_customer',
      'phase14-delivery-finalization:' || v_auth.id,
      jsonb_build_object('authorization_id',v_auth.id,'email_event_id',p_email_event_id,'test_delivery',false));
  end if;
  update public.report_delivery_authorizations
  set status='finalized',provider_message_id=p_provider_message_id,finalized_at=v_now,
      lease_token=null,lease_expires_at=null,updated_at=v_now where id=v_auth.id;
  return jsonb_build_object('finalized',true,'idempotent_replay',false,
    'report_id',v_report.id,'email_event_id',p_email_event_id);
end;
$function$;

-- Controlled operator reconciliation. Accepted requires a verified provider
-- correlation and canonical ID; not-accepted requires explicit AAL2 override.
create or replace function public.resolve_premium_report_delivery_reconciliation(
  p_authorization_id uuid,
  p_resolution text,
  p_provider_message_id text,
  p_correlation_evidence jsonb,
  p_operator_override boolean default false,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare v_actor jsonb; v_auth public.report_delivery_authorizations%rowtype; v_event public.email_events%rowtype; v_result jsonb;
begin
  v_actor := public.phase14_require_security(
    'provider_reconciliation',array['platform_admin','approver']::public.admin_role[],true,false
  );
  if p_resolution not in ('accepted','not_accepted') then raise exception 'delivery_reconciliation_resolution_invalid'; end if;
  if coalesce(p_correlation_evidence,'{}'::jsonb)='{}'::jsonb or coalesce(trim(p_reason),'')='' then
    raise exception 'delivery_reconciliation_evidence_required';
  end if;
  select * into v_auth from public.report_delivery_authorizations where id=p_authorization_id for update;
  if not found or v_auth.status <> 'reconciliation_required' then raise exception 'delivery_reconciliation_state_invalid'; end if;
  select * into v_event from public.email_events where id=v_auth.email_event_id for update;
  if p_resolution='accepted' then
    if coalesce(trim(p_provider_message_id),'')='' then raise exception 'delivery_reconciliation_provider_id_required'; end if;
    if coalesce(p_correlation_evidence->>'provider_request_key','') <> coalesce(v_event.provider_request_key,'')
       or coalesce(p_correlation_evidence->>'verification_method','')='' then
      raise exception 'delivery_reconciliation_correlation_unverified';
    end if;
    v_result := public.finalize_premium_report_delivery(v_auth.id,v_auth.email_event_id,p_provider_message_id);
  else
    if not p_operator_override then raise exception 'delivery_reconciliation_operator_override_required'; end if;
    update public.report_delivery_authorizations
    set status='revoked',revoked_reason=p_reason,lease_token=null,lease_expires_at=null,updated_at=now()
    where id=v_auth.id;
    update public.email_events
    set status='failed_before_provider',error_message=p_reason,reconciliation_attempted_at=now(),
        reconciliation_result_json=p_correlation_evidence,delivery_updated_at=now()
    where id=v_auth.email_event_id and status='reconciliation_required';
    v_result := jsonb_build_object('resolved',true,'resolution','not_accepted','authorization_id',v_auth.id);
  end if;
  insert into public.audit_logs(actor_type,actor_user_id,assessment_id,entity_table,entity_id,action,after_json)
  values ('admin',(v_actor->>'user_id')::uuid,v_auth.assessment_id,'report_delivery_authorizations',v_auth.id,
    'premium_report_delivery_reconciliation_resolved',jsonb_build_object('resolution',p_resolution,
      'provider_message_id',p_provider_message_id,'operator_override',p_operator_override,
      'reason',p_reason,'evidence',p_correlation_evidence));
  return v_result;
end;
$function$;

-- Capability-specific automatic delivery facades.
create or replace function public.worker_authorize_premium_report_delivery(
  p_capability_id uuid,p_capability_lease_token text,p_report_id uuid,p_recipient text,p_provider text default 'resend'
) returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare v_report public.reports%rowtype; v_fulfilment_id uuid;
begin
  select * into v_report from public.reports where id=p_report_id;
  if not found then raise exception 'report_not_found'; end if;
  v_fulfilment_id := v_report.fulfilment_id;
  perform public.phase14_activate_worker_capability(
    p_capability_id,p_capability_lease_token,array['automatic_delivery'],
    v_report.order_id,v_report.assessment_id,v_report.score_run_id,v_fulfilment_id,p_report_id,p_recipient
  );
  return public.authorize_premium_report_delivery(p_report_id,p_recipient,'initial',false,p_provider,null);
end;
$function$;

create or replace function public.worker_claim_premium_report_delivery(
  p_capability_id uuid,p_capability_lease_token text,p_authorization_id uuid
) returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare v_auth public.report_delivery_authorizations%rowtype; v_report public.reports%rowtype;
begin
  select * into v_auth from public.report_delivery_authorizations where id=p_authorization_id;
  select * into v_report from public.reports where id=v_auth.report_id;
  perform public.phase14_activate_worker_capability(
    p_capability_id,p_capability_lease_token,array['automatic_delivery'],
    v_auth.order_id,v_auth.assessment_id,v_auth.score_run_id,v_report.fulfilment_id,v_auth.report_id,v_auth.recipient_email::text
  );
  return public.claim_premium_report_delivery(p_authorization_id);
end;
$function$;

create or replace function public.worker_mark_premium_report_delivery_dispatch_started(
  p_capability_id uuid,p_capability_lease_token text,p_authorization_id uuid,p_delivery_lease_token uuid
) returns boolean
language plpgsql security definer set search_path=''
as $function$
declare v_auth public.report_delivery_authorizations%rowtype; v_report public.reports%rowtype;
begin
  select * into v_auth from public.report_delivery_authorizations where id=p_authorization_id;
  select * into v_report from public.reports where id=v_auth.report_id;
  perform public.phase14_activate_worker_capability(
    p_capability_id,p_capability_lease_token,array['automatic_delivery'],
    v_auth.order_id,v_auth.assessment_id,v_auth.score_run_id,v_report.fulfilment_id,v_auth.report_id,v_auth.recipient_email::text
  );
  return public.mark_premium_report_delivery_dispatch_started(p_authorization_id,p_delivery_lease_token);
end;
$function$;

create or replace function public.worker_fail_premium_report_delivery_before_dispatch(
  p_capability_id uuid,p_capability_lease_token text,p_authorization_id uuid,
  p_delivery_lease_token uuid,p_reason text
) returns boolean
language plpgsql security definer set search_path=''
as $function$
declare v_auth public.report_delivery_authorizations%rowtype; v_report public.reports%rowtype;
begin
  select * into v_auth from public.report_delivery_authorizations where id=p_authorization_id;
  select * into v_report from public.reports where id=v_auth.report_id;
  perform public.phase14_activate_worker_capability(
    p_capability_id,p_capability_lease_token,array['automatic_delivery'],
    v_auth.order_id,v_auth.assessment_id,v_auth.score_run_id,v_report.fulfilment_id,v_auth.report_id,v_auth.recipient_email::text
  );
  return public.fail_premium_report_delivery_before_dispatch(p_authorization_id,p_delivery_lease_token,p_reason);
end;
$function$;

create or replace function public.worker_finalize_premium_report_delivery(
  p_capability_id uuid,p_capability_lease_token text,p_authorization_id uuid,
  p_email_event_id uuid,p_provider_message_id text
) returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare v_auth public.report_delivery_authorizations%rowtype; v_report public.reports%rowtype;
begin
  select * into v_auth from public.report_delivery_authorizations where id=p_authorization_id;
  select * into v_report from public.reports where id=v_auth.report_id;
  perform public.phase14_activate_worker_capability(
    p_capability_id,p_capability_lease_token,array['automatic_delivery','delivery_reconciliation'],
    v_auth.order_id,v_auth.assessment_id,v_auth.score_run_id,v_report.fulfilment_id,v_auth.report_id,v_auth.recipient_email::text
  );
  return public.finalize_premium_report_delivery(p_authorization_id,p_email_event_id,p_provider_message_id);
end;
$function$;

create or replace function public.worker_mark_premium_report_delivery_reconciliation_required(
  p_capability_id uuid,p_capability_lease_token text,p_authorization_id uuid,
  p_provider_message_id text,p_reason text
) returns boolean
language plpgsql security definer set search_path=''
as $function$
declare v_auth public.report_delivery_authorizations%rowtype; v_report public.reports%rowtype;
begin
  select * into v_auth from public.report_delivery_authorizations where id=p_authorization_id;
  select * into v_report from public.reports where id=v_auth.report_id;
  perform public.phase14_activate_worker_capability(
    p_capability_id,p_capability_lease_token,array['automatic_delivery','delivery_reconciliation'],
    v_auth.order_id,v_auth.assessment_id,v_auth.score_run_id,v_report.fulfilment_id,v_auth.report_id,v_auth.recipient_email::text
  );
  return public.mark_premium_report_delivery_reconciliation_required(
    p_authorization_id,p_provider_message_id,p_reason
  );
end;
$function$;

create or replace function public.worker_recover_stale_premium_report_email_send(
  p_capability_id uuid,
  p_capability_lease_token text,
  p_authorization_id uuid
) returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare v_auth public.report_delivery_authorizations%rowtype; v_report public.reports%rowtype;
begin
  select * into v_auth from public.report_delivery_authorizations where id=p_authorization_id for update;
  if not found then raise exception 'delivery_authorization_missing'; end if;
  select * into v_report from public.reports where id=v_auth.report_id;
  perform public.phase14_activate_worker_capability(
    p_capability_id,p_capability_lease_token,array['delivery_reconciliation'],
    v_auth.order_id,v_auth.assessment_id,v_auth.score_run_id,v_report.fulfilment_id,
    v_auth.report_id,v_auth.recipient_email::text
  );
  if v_auth.status <> 'dispatching' or v_auth.lease_expires_at >= now() then
    raise exception 'delivery_authorization_not_stale';
  end if;
  update public.report_delivery_authorizations set status='reconciliation_required',updated_at=now()
  where id=v_auth.id and status='dispatching' and lease_expires_at<now();
  update public.email_events
  set status='reconciliation_required',reconciliation_required_at=coalesce(reconciliation_required_at,now()),
      delivery_updated_at=now(),error_message='Dispatch lease expired; provider acceptance remains unresolved.'
  where id=v_auth.email_event_id and status='sending' and send_lease_expires_at<now();
  return true;
end;
$function$;

create or replace function public.worker_cleanup_expired_premium_report_claims(
  p_capability_id uuid,
  p_capability_lease_token text,
  p_older_than interval default interval '24 hours'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform public.phase14_activate_worker_capability(
    p_capability_id,p_capability_lease_token,array['storage_cleanup'],null,null,null,null,null,null
  );
  return public.cleanup_expired_premium_report_claims(p_older_than);
end;
$function$;

create or replace function public.assert_premium_report_delivery_entitlement(
  p_report_id uuid,
  p_recipient text,
  p_allow_test_override boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
begin
  perform public.phase14_require_security(
    'email_delivery',array['platform_admin','approver']::public.admin_role[],true,false
  );
  if p_allow_test_override then perform public.phase14_require_policy('recipient_override'); end if;
  return public.phase14_delivery_entitlement(p_report_id,p_recipient,p_allow_test_override,'email_delivery');
end;
$function$;

-- Remove every broad service-role path. Only the worker facade functions below
-- are executable by service_role; every facade requires a live scoped lease.
do $phase14_fourth_grants$
declare v_signature text;
begin
  foreach v_signature in array array[
    'public.guard_phase14_security_gate_mutation()',
    'public.guard_phase14_feature_policy_row_mutation()',
    'public.phase14_require_policy(text)',
    'public.phase14_activate_worker_capability(uuid,text,text[],uuid,uuid,uuid,uuid,uuid,text)',
    'public.phase14_require_actor(text,public.admin_role[],boolean)',
    'public.phase14_require_security(text,public.admin_role[],boolean,boolean)',
    'public.phase14_generation_entitlement(text,uuid,uuid,uuid,text)',
    'public.phase14_delivery_entitlement(uuid,text,boolean,text)',
    'public.guard_phase14_feature_policy_mutation()'
  ] loop
    execute 'revoke execute on function ' || v_signature || ' from public,anon,authenticated,service_role';
  end loop;

  foreach v_signature in array array[
    'public.set_phase14_security_gate_version(integer,text)',
    'public.set_phase14_feature_policy(text,boolean,text)',
    'public.update_phase14_feature_policy(text,jsonb)',
    'public.authorize_phase14_action(text)',
    'public.authorize_phase14_worker_operation(text,text,uuid,uuid,uuid,uuid,uuid,text,integer,text)',
    'public.assert_premium_report_generation_entitlement(text)',
    'public.claim_premium_report_generation(text,text,uuid,public.report_type)',
    'public.renew_premium_report_generation_lease(uuid)',
    'public.recover_premium_report_generation_claim(text,text)',
    'public.commit_premium_report_draft(uuid,uuid,text,text,text,uuid,uuid)',
    'public.publish_premium_report_generation(uuid,uuid)',
    'public.abandon_premium_report_generation_claim(uuid,text)',
    'public.register_phase14_storage_cleanup(text,text,text,uuid,text)',
    'public.link_phase14_storage_cleanup_report(uuid,uuid)',
    'public.record_phase14_storage_cleanup_result(uuid,boolean,text)',
    'public.assert_premium_report_delivery_entitlement(uuid,text,boolean)',
    'public.assert_premium_report_download_entitlement(uuid,text)',
    'public.authorize_bounced_report_redelivery(uuid,text,jsonb)',
    'public.authorize_premium_report_delivery(uuid,text,text,boolean,text,uuid)',
    'public.claim_premium_report_delivery(uuid)',
    'public.mark_premium_report_delivery_dispatch_started(uuid,uuid)',
    'public.fail_premium_report_delivery_before_dispatch(uuid,uuid,text)',
    'public.finalize_premium_report_delivery(uuid,uuid,text)',
    'public.mark_premium_report_delivery_reconciliation_required(uuid,text,text)',
    'public.resolve_premium_report_delivery_reconciliation(uuid,text,text,jsonb,boolean,text)'
  ] loop
    execute 'revoke execute on function ' || v_signature || ' from public,anon,service_role';
    execute 'grant execute on function ' || v_signature || ' to authenticated';
  end loop;

  foreach v_signature in array array[
    'public.claim_phase14_worker_capability(uuid,text)',
    'public.authorize_phase14_worker_action(uuid,text,text)',
    'public.complete_phase14_worker_capability(uuid,text)',
    'public.worker_claim_premium_report_generation(uuid,text,text,text,uuid,public.report_type)',
    'public.worker_renew_premium_report_generation_lease(uuid,text,uuid)',
    'public.worker_recover_premium_report_generation_claim(uuid,text,text,text,uuid)',
    'public.worker_commit_premium_report_draft(uuid,text,uuid,uuid,text,text,text,uuid)',
    'public.worker_publish_premium_report_generation(uuid,text,uuid,uuid)',
    'public.worker_abandon_premium_report_generation_claim(uuid,text,uuid,text)',
    'public.worker_register_phase14_storage_cleanup(uuid,text,text,text,text,uuid,text)',
    'public.worker_link_phase14_storage_cleanup_report(uuid,text,uuid,uuid)',
    'public.worker_record_phase14_storage_cleanup_result(uuid,text,uuid,boolean,text)',
    'public.worker_authorize_premium_report_delivery(uuid,text,uuid,text,text)',
    'public.worker_claim_premium_report_delivery(uuid,text,uuid)',
    'public.worker_mark_premium_report_delivery_dispatch_started(uuid,text,uuid,uuid)',
    'public.worker_fail_premium_report_delivery_before_dispatch(uuid,text,uuid,uuid,text)',
    'public.worker_finalize_premium_report_delivery(uuid,text,uuid,uuid,text)',
    'public.worker_mark_premium_report_delivery_reconciliation_required(uuid,text,uuid,text,text)',
    'public.worker_recover_stale_premium_report_email_send(uuid,text,uuid)',
    'public.worker_cleanup_expired_premium_report_claims(uuid,text,interval)',
    'public.claim_phase14_storage_cleanup_jobs(uuid,text,integer)',
    'public.complete_phase14_storage_cleanup_job(uuid,text,uuid,uuid,boolean,text)'
  ] loop
    execute 'revoke execute on function ' || v_signature || ' from public,anon,authenticated';
    execute 'grant execute on function ' || v_signature || ' to service_role';
  end loop;

  foreach v_signature in array array[
    'public.cleanup_expired_premium_report_claims(interval)',
    'public.recover_stale_premium_report_email_sends()'
  ] loop
    execute 'revoke execute on function ' || v_signature || ' from public,anon,authenticated,service_role';
  end loop;
end;
$phase14_fourth_grants$;

comment on table public.phase14_worker_capabilities is
  'AAL2-human-issued, operation-bound authority. Raw issue and lease secrets are never stored.';
comment on table public.phase14_storage_cleanup_queue is
  'Durable temporary-object deletion queue with bounded retries, leases, checksums and alerts.';
comment on index public.reports_one_current_assessment_type_uidx is
  'At most one current generated/review/approved/released report per assessment and report type.';

drop trigger if exists trg_guard_phase14_security_gate_rows on public.phase14_security_gates;
create trigger trg_guard_phase14_security_gate_rows
  before insert or update or delete on public.phase14_security_gates
  for each row execute function public.guard_phase14_security_gate_mutation();

drop trigger if exists trg_guard_phase14_security_gate_truncate on public.phase14_security_gates;
create trigger trg_guard_phase14_security_gate_truncate
  before truncate on public.phase14_security_gates
  for each statement execute function public.guard_phase14_security_gate_mutation();

commit;
