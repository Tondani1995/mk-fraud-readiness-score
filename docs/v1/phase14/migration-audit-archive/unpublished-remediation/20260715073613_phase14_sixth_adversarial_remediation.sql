-- Phase 14 sixth adversarial remediation.
--
-- This migration is deliberately disabled-by-default.  It creates no secret,
-- enables no gate or policy, and performs no provider or storage operation.
begin;

-- ---------------------------------------------------------------------------
-- 1. Immutable ownership for Phase 14 rows in shared event/audit tables.
-- ---------------------------------------------------------------------------

alter table public.audit_logs add column phase14_operation_ref text;
alter table public.report_events add column phase14_operation_ref text;
alter table public.assessment_events add column phase14_operation_ref text;
alter table public.email_events add column phase14_operation_ref text;
alter table public.email_provider_events add column phase14_operation_ref text;

alter table public.audit_logs add constraint audit_logs_phase14_operation_ref_chk
  check (phase14_operation_ref is null or phase14_operation_ref ~ '^phase14:[a-z0-9_.:-]+$');
alter table public.report_events add constraint report_events_phase14_operation_ref_chk
  check (phase14_operation_ref is null or phase14_operation_ref ~ '^phase14:[a-z0-9_.:-]+$');
alter table public.assessment_events add constraint assessment_events_phase14_operation_ref_chk
  check (phase14_operation_ref is null or phase14_operation_ref ~ '^phase14:[a-z0-9_.:-]+$');
alter table public.email_events add constraint email_events_phase14_operation_ref_chk
  check (phase14_operation_ref is null or phase14_operation_ref ~ '^phase14:[a-z0-9_.:-]+$');
alter table public.email_provider_events add constraint email_provider_events_phase14_operation_ref_chk
  check (phase14_operation_ref is null or phase14_operation_ref ~ '^phase14:[a-z0-9_.:-]+$');

-- Reviewed deterministic backfill.  Event/action names are used once to locate
-- historical rows; after this statement ownership is carried by an immutable
-- operation reference and is independent of the row's current shape.
select set_config('phase14.authoritative_transition','migration',true);
update public.audit_logs
set phase14_operation_ref = 'phase14:audit:' || id::text
where phase14_operation_ref is null and (
  action ~ '^(phase14_|premium_report_|report_(generated|regenerated|download_))'
  or entity_table in (
    'phase14_security_gates','phase14_feature_policies','phase14_worker_capabilities',
    'report_fulfilments','report_generation_runs','report_ai_attempts',
    'report_generation_claims','report_delivery_authorizations',
    'report_delivery_finalizations','report_delivery_remediations',
    'phase14_provider_attestations','phase14_storage_cleanup_queue'
  )
);
update public.report_events
set phase14_operation_ref = 'phase14:report-event:' || id::text
where phase14_operation_ref is null and event_type in (
  'generated','regenerated','email_sent','email_test_sent','download_requested'
);
update public.assessment_events
set phase14_operation_ref = 'phase14:assessment-event:' || id::text
where phase14_operation_ref is null and event_type in (
  'report_generated','admin_report_downloaded','report_emailed_to_customer'
);
update public.email_events
set phase14_operation_ref = 'phase14:email-event:' || id::text
where phase14_operation_ref is null and (
  notification_type = 'premium_report_pdf' or provider_request_key is not null
);
update public.email_provider_events p
set phase14_operation_ref = 'phase14:provider-event:' || p.id::text
where p.phase14_operation_ref is null and exists (
  select 1 from public.email_events e
  where e.id = p.email_event_id and e.phase14_operation_ref is not null
);

create or replace function public.phase14_shared_row_was_owned(
  p_table_name text,
  p_row jsonb
) returns boolean
language sql
immutable
set search_path = ''
as $function$
  select case p_table_name
    when 'audit_logs' then
      coalesce(p_row->>'phase14_operation_ref','') like 'phase14:%'
      or coalesce(p_row->>'action','') ~ '^(phase14_|premium_report_|report_(generated|regenerated|download_))'
      or coalesce(p_row->>'entity_table','') in (
        'phase14_security_gates','phase14_feature_policies','phase14_worker_capabilities',
        'report_fulfilments','report_generation_runs','report_ai_attempts',
        'report_generation_claims','report_delivery_authorizations',
        'report_delivery_finalizations','report_delivery_remediations',
        'phase14_provider_attestations','phase14_storage_cleanup_queue'
      )
    when 'report_events' then
      coalesce(p_row->>'phase14_operation_ref','') like 'phase14:%'
      or coalesce(p_row->>'event_type','') in (
        'generated','regenerated','email_sent','email_test_sent','download_requested'
      )
    when 'assessment_events' then
      coalesce(p_row->>'phase14_operation_ref','') like 'phase14:%'
      or coalesce(p_row->>'event_type','') in (
        'report_generated','admin_report_downloaded','report_emailed_to_customer'
      )
    when 'email_events' then
      coalesce(p_row->>'phase14_operation_ref','') like 'phase14:%'
      or coalesce(p_row->>'notification_type','') = 'premium_report_pdf'
      or coalesce(p_row->>'provider_request_key','') <> ''
    when 'email_provider_events' then
      coalesce(p_row->>'phase14_operation_ref','') like 'phase14:%'
    else false
  end;
$function$;

create or replace function public.guard_phase14_authoritative_mutation()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_old jsonb := case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else '{}'::jsonb end;
  v_new jsonb := case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else '{}'::jsonb end;
  v_old_owned boolean := false;
  v_new_owned boolean := false;
  v_context text := nullif(current_setting('phase14.authoritative_transition', true), '');
  v_transition_owner name;
begin
  if tg_table_name = 'phase14_operational_alerts' then
    v_old_owned := tg_op in ('UPDATE','DELETE');
    v_new_owned := tg_op in ('INSERT','UPDATE');
  else
    v_old_owned := public.phase14_shared_row_was_owned(tg_table_name, v_old);
    v_new_owned := public.phase14_shared_row_was_owned(tg_table_name, v_new);
  end if;
  if tg_table_name='email_provider_events' and tg_op in ('INSERT','UPDATE')
     and not v_new_owned and nullif(v_new->>'email_event_id','') is not null then
    v_new_owned:=exists(select 1 from public.email_events e
      where e.id=(v_new->>'email_event_id')::uuid and e.phase14_operation_ref is not null);
  end if;

  select pg_get_userbyid(p.proowner) into v_transition_owner
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'phase14_require_security'
  order by p.oid limit 1;

  if v_old_owned or v_new_owned then
    if current_user is distinct from v_transition_owner
       or coalesce(v_context,'') not in (
         'authenticated_rpc','fulfilment_queue_rpc','fulfilment_transition_rpc',
         'gate_administration','gate_invalidation','migration','operational_alert_rpc',
         'policy_approval','runtime_secret_rotation','trusted_provider_attestation',
         'worker_authorization','worker_attested_rpc','worker_rpc','worker_completion'
       ) then
      raise exception 'phase14_authoritative_rpc_required:%:%', tg_table_name, tg_op;
    end if;
  end if;

  if tg_table_name <> 'phase14_operational_alerts' and tg_op = 'UPDATE' and v_old_owned then
    if old.phase14_operation_ref is distinct from new.phase14_operation_ref then
      raise exception 'phase14_operation_ref_immutable:%', tg_table_name;
    end if;
  end if;

  if tg_table_name <> 'phase14_operational_alerts' then
    if tg_op in ('INSERT','UPDATE') and v_new_owned
       and new.phase14_operation_ref is null then
      new.phase14_operation_ref := 'phase14:' || replace(tg_table_name,'_','-') || ':' || new.id::text;
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

-- Operational alerts are an authoritative table with no runtime DML grants;
-- unlike the five shared tables, they do not need the shared-row marker guard.
drop trigger if exists trg_phase14_authoritative_mutation on public.phase14_operational_alerts;

-- ---------------------------------------------------------------------------
-- 2. Monotonic authority epoch and invalidation.
-- ---------------------------------------------------------------------------

alter table public.phase14_security_gates
  add column authority_epoch bigint not null default 1 check (authority_epoch > 0);
alter table public.phase14_feature_policies
  add column approved_authority_epoch bigint check (approved_authority_epoch is null or approved_authority_epoch > 0);
alter table public.phase14_ai_route_policies
  add column approved_authority_epoch bigint check (approved_authority_epoch is null or approved_authority_epoch > 0);
alter table public.phase14_worker_capabilities
  add column authority_epoch bigint not null default 1 check (authority_epoch > 0),
  add column expected_step text not null default 'claim',
  add column workflow_execution_id text;
alter table public.phase14_provider_attestations
  add column authority_epoch bigint not null default 1 check (authority_epoch > 0),
  add column authorization_status text,
  add column authorization_updated_at timestamptz;

create or replace function public.bump_phase14_authority_epoch()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if old.required_version is distinct from new.required_version
     or old.satisfied_version is distinct from new.satisfied_version
     or old.status is distinct from new.status then
    new.authority_epoch := old.authority_epoch + 1;
  elsif new.authority_epoch is distinct from old.authority_epoch then
    raise exception 'phase14_authority_epoch_managed';
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_phase14_gate_bump_authority_epoch on public.phase14_security_gates;
create trigger trg_phase14_gate_bump_authority_epoch
  before update on public.phase14_security_gates
  for each row execute function public.bump_phase14_authority_epoch();

create or replace function public.invalidate_phase14_authority_on_gate_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if old.authority_epoch is distinct from new.authority_epoch then
    perform set_config('phase14.authoritative_transition', 'gate_invalidation', true);
    update public.phase14_feature_policies
    set enabled = false, approved_gate_version = null,
        approved_authority_epoch = null, approved_at = null,
        reason = 'Automatically disabled because the Phase 14 authority epoch changed.',
        updated_at = now();
    update public.phase14_ai_route_policies
    set enabled = false, approved_gate_version = null,
        approved_authority_epoch = null, approved_by = null,
        approved_session_id = null, approved_at = null, updated_at = now();
    update public.phase14_worker_capabilities
    set status = 'revoked', revoked_at = now(),
        revoked_reason = 'Phase 14 authority epoch changed.',
        lease_secret_hash = null, lease_expires_at = null, updated_at = now()
    where status in ('authorised','leased');
    insert into public.audit_logs(actor_type,entity_table,action,before_json,after_json)
    values ('system','phase14_security_gates','phase14_authority_epoch_changed',
      jsonb_build_object('authority_epoch',old.authority_epoch,'status',old.status,
        'required_version',old.required_version,'satisfied_version',old.satisfied_version),
      jsonb_build_object('authority_epoch',new.authority_epoch,'status',new.status,
        'required_version',new.required_version,'satisfied_version',new.satisfied_version));
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_phase14_gate_invalidate_authority on public.phase14_security_gates;
create trigger trg_phase14_gate_invalidate_authority
  after update on public.phase14_security_gates
  for each row
  when (old.authority_epoch is distinct from new.authority_epoch)
  execute function public.invalidate_phase14_authority_on_gate_change();

-- ---------------------------------------------------------------------------
-- 3. Private worker attestation key boundary and nonce ledger.
-- ---------------------------------------------------------------------------

create schema if not exists phase14_private;
revoke all on schema phase14_private from public, anon, authenticated, service_role;

create table phase14_private.worker_attestation_keys (
  key_id text primary key check (key_id ~ '^[a-zA-Z0-9._:-]{1,80}$'),
  vault_secret_id uuid not null unique,
  status text not null check (status in ('current','previous','retired')),
  valid_from timestamptz not null,
  valid_until timestamptz,
  created_at timestamptz not null default now(),
  check (valid_until is null or valid_until > valid_from)
);
create unique index phase14_worker_attestation_one_current_idx
  on phase14_private.worker_attestation_keys(status) where status = 'current';

create table phase14_private.worker_attestation_nonces (
  nonce uuid primary key,
  capability_id uuid not null references public.phase14_worker_capabilities(id) on delete restrict,
  action text not null,
  lease_generation integer not null,
  request_payload_hash text not null check (request_payload_hash ~ '^[0-9a-f]{64}$'),
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  consumed_at timestamptz not null default now()
);
revoke all on all tables in schema phase14_private from public, anon, authenticated, service_role;
alter default privileges in schema phase14_private revoke all on tables from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Durable workflow-start outbox.
-- ---------------------------------------------------------------------------

create table public.phase14_workflow_start_outbox (
  id uuid primary key default extensions.gen_random_uuid(),
  fulfilment_id uuid not null references public.report_fulfilments(id) on delete restrict,
  capability_id uuid not null references public.phase14_worker_capabilities(id) on delete restrict,
  operation_key text not null,
  external_idempotency_key text not null,
  attempt_number integer not null default 1 check (attempt_number > 0),
  lease_owner text,
  lease_generation integer not null default 0 check (lease_generation >= 0),
  lease_expires_at timestamptz,
  status text not null default 'pending' check (status in (
    'pending','leased','acceptance_uncertain','started','failed_before_provider',
    'reconciliation_required','cancelled'
  )),
  run_id text,
  requested_at timestamptz not null default now(),
  accepted_at timestamptz,
  last_error text,
  reconciliation_status text not null default 'not_required' check (reconciliation_status in (
    'not_required','required','in_progress','resolved','failed'
  )),
  authority_epoch bigint not null check (authority_epoch > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (capability_id),
  unique (operation_key),
  unique (external_idempotency_key),
  check ((status = 'started' and run_id is not null and accepted_at is not null)
      or status <> 'started')
);
create index phase14_workflow_start_takeover_idx
  on public.phase14_workflow_start_outbox(status,lease_expires_at)
  where status in ('pending','leased');
alter table public.phase14_workflow_start_outbox enable row level security;
revoke all on table public.phase14_workflow_start_outbox from public,anon,authenticated,service_role;
grant select on table public.phase14_workflow_start_outbox to authenticated;
create policy phase14_workflow_start_outbox_admin_select
  on public.phase14_workflow_start_outbox for select to authenticated
  using (public.current_admin_role() = any(array[
    'platform_admin','reviewer','approver','read_only_admin'
  ]::public.admin_role[]));

-- ---------------------------------------------------------------------------
-- 5. Immutable customer contact verification.
-- ---------------------------------------------------------------------------

create table public.customer_contact_verifications (
  id uuid primary key default extensions.gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  assessment_id uuid not null references public.assessments(id) on delete restrict,
  customer_identity text not null,
  previous_email public.citext not null,
  corrected_email public.citext not null,
  verification_method text not null check (verification_method in (
    'verified_email_link','support_callback','identity_provider','in_person'
  )),
  evidence_reference text not null,
  verified_at timestamptz not null,
  verified_by_actor uuid references public.admin_profiles(id) on delete restrict,
  verified_by_system text,
  expires_at timestamptz not null,
  status text not null default 'verified' check (status in ('verified','consumed','expired','revoked')),
  consumed_at timestamptz,
  consumed_by_remediation_id uuid,
  created_at timestamptz not null default now(),
  check (lower(previous_email::text) <> lower(corrected_email::text)),
  check (coalesce(trim(customer_identity),'') <> ''),
  check (coalesce(trim(evidence_reference),'') <> ''),
  check ((verified_by_actor is not null) <> (verified_by_system is not null)),
  check (expires_at > verified_at),
  check ((status = 'consumed' and consumed_at is not null and consumed_by_remediation_id is not null)
      or status <> 'consumed')
);
create index customer_contact_verifications_active_idx
  on public.customer_contact_verifications(order_id,status,expires_at);
alter table public.customer_contact_verifications enable row level security;
revoke all on table public.customer_contact_verifications from public,anon,authenticated,service_role;
grant select on table public.customer_contact_verifications to authenticated;
create policy customer_contact_verifications_admin_select
  on public.customer_contact_verifications for select to authenticated
  using (public.current_admin_role() = any(array['platform_admin','approver','read_only_admin']::public.admin_role[]));

create or replace function public.guard_customer_contact_verification_immutable()
returns trigger language plpgsql set search_path=''
as $function$
begin
  if tg_op = 'DELETE' then raise exception 'customer_contact_verification_immutable'; end if;
  if old.status = 'verified' and new.status = 'consumed'
     and old.id = new.id and old.order_id = new.order_id
     and old.assessment_id = new.assessment_id
     and old.customer_identity = new.customer_identity
     and old.previous_email = new.previous_email
     and old.corrected_email = new.corrected_email
     and old.verification_method = new.verification_method
     and old.evidence_reference = new.evidence_reference
     and old.verified_at = new.verified_at
     and old.verified_by_actor is not distinct from new.verified_by_actor
     and old.verified_by_system is not distinct from new.verified_by_system
     and old.expires_at = new.expires_at
     and new.consumed_at is not null and new.consumed_by_remediation_id is not null
     and current_user = (select pg_get_userbyid(p.proowner) from pg_proc p
       join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='authorize_bounced_report_redelivery'
       order by p.oid desc limit 1) then
    return new;
  end if;
  raise exception 'customer_contact_verification_immutable';
end;
$function$;
create trigger trg_customer_contact_verification_immutable
  before update or delete on public.customer_contact_verifications
  for each row execute function public.guard_customer_contact_verification_immutable();

create or replace function public.create_customer_contact_verification(
  p_order_id uuid,
  p_corrected_email text,
  p_verification_method text,
  p_evidence_reference text,
  p_valid_for_seconds integer default 1800
) returns uuid
language plpgsql security definer set search_path=''
as $function$
declare v_actor jsonb; v_order public.orders%rowtype; v_id uuid; v_corrected public.citext;
begin
  v_actor:=public.phase14_require_security(
    'email_resend',array['platform_admin','approver']::public.admin_role[],true,false
  );
  if p_verification_method not in ('verified_email_link','support_callback','identity_provider','in_person')
     or coalesce(trim(p_evidence_reference),'')='' or p_valid_for_seconds<300 or p_valid_for_seconds>3600 then
    raise exception 'customer_contact_verification_input_invalid';
  end if;
  v_corrected:=lower(trim(p_corrected_email))::public.citext;
  if v_corrected::text !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'customer_contact_verification_email_invalid';
  end if;
  select * into v_order from public.orders where id=p_order_id for share;
  if not found or v_order.assessment_id is null or v_corrected=v_order.customer_email then
    raise exception 'customer_contact_verification_order_binding_invalid';
  end if;
  insert into public.customer_contact_verifications(
    order_id,assessment_id,customer_identity,previous_email,corrected_email,
    verification_method,evidence_reference,verified_at,verified_by_actor,expires_at
  ) values (
    v_order.id,v_order.assessment_id,coalesce(v_order.customer_name,v_order.customer_email::text),
    v_order.customer_email,v_corrected,p_verification_method,p_evidence_reference,
    clock_timestamp(),(v_actor->>'user_id')::uuid,
    clock_timestamp()+make_interval(secs=>p_valid_for_seconds)
  ) returning id into v_id;
  insert into public.audit_logs(actor_type,actor_user_id,assessment_id,entity_table,entity_id,action,after_json)
  values ('admin',(v_actor->>'user_id')::uuid,v_order.assessment_id,
    'customer_contact_verifications',v_id,'phase14_customer_contact_verified',
    jsonb_build_object('order_id',v_order.id,'verification_method',p_verification_method,
      'evidence_reference',p_evidence_reference,'expires_in_seconds',p_valid_for_seconds));
  return v_id;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 6. Cleanup evidence classification and durable final-object orphan jobs.
-- ---------------------------------------------------------------------------

alter table public.phase14_storage_cleanup_queue
  add column deletion_requested_at timestamptz,
  add column delete_api_accepted_at timestamptz,
  add column absence_verified_at timestamptz,
  add column verification_error text,
  add column provider_result_class text check (provider_result_class is null or provider_result_class in (
    'object_present','object_not_found','authentication_failure','authorization_failure',
    'rate_limited','timeout','network_failure','provider_outage','malformed_response',
    'checksum_read_failure','unknown_provider_error','delete_accepted'
  ));
alter table public.phase14_storage_cleanup_queue
  drop constraint phase14_storage_cleanup_queue_status_check,
  add constraint phase14_storage_cleanup_queue_status_check check (status in (
    'pending','leased','failed','deleted','dead_letter','retained'
  ));

-- Claims are settled, not deleted, so terminal publication has durable replay
-- evidence and remains recoverable until its transaction commits.
alter table public.report_generation_claims drop constraint report_generation_claims_state_chk;
alter table public.report_generation_claims add constraint report_generation_claims_state_chk
  check (state in ('claimed','committed','settled','abandoned'));
alter table public.report_generation_claims drop constraint report_generation_claims_storage_binding_chk;
alter table public.report_generation_claims add constraint report_generation_claims_storage_binding_chk check (
  state in ('claimed','abandoned') or state in ('committed','settled')
  and report_id is not null and temporary_storage_bucket is not null
  and temporary_storage_path is not null and final_storage_bucket is not null
  and final_storage_path is not null and expected_checksum ~ '^[0-9a-f]{64}$'
);

-- Bind all newly approved authority to the current epoch.  These triggers run
-- inside the reviewed SECURITY DEFINER administration functions; direct table
-- DML remains blocked by the pre-existing mutation guards and grants.
create or replace function public.bind_phase14_feature_policy_epoch()
returns trigger language plpgsql set search_path=''
as $function$
declare v_gate public.phase14_security_gates%rowtype;
begin
  if new.enabled then
    select * into strict v_gate from public.phase14_security_gates
    where gate_key='phase14-premium-report' for share;
    if v_gate.status <> 'satisfied' or v_gate.satisfied_version <> v_gate.required_version then
      raise exception 'phase14_security_gate_unsatisfied:%',new.policy_key;
    end if;
    new.approved_authority_epoch := v_gate.authority_epoch;
  else
    new.approved_authority_epoch := null;
  end if;
  return new;
end;
$function$;
create trigger trg_phase14_feature_policy_bind_epoch
  before insert or update on public.phase14_feature_policies
  for each row execute function public.bind_phase14_feature_policy_epoch();

create or replace function public.bind_phase14_ai_route_epoch()
returns trigger language plpgsql set search_path=''
as $function$
declare v_gate public.phase14_security_gates%rowtype;
begin
  if new.enabled then
    select * into strict v_gate from public.phase14_security_gates
    where gate_key='phase14-premium-report' for share;
    if v_gate.status <> 'satisfied' or v_gate.satisfied_version <> v_gate.required_version then
      raise exception 'phase14_security_gate_unsatisfied:ai_route';
    end if;
    new.approved_authority_epoch := v_gate.authority_epoch;
  else
    new.approved_authority_epoch := null;
  end if;
  return new;
end;
$function$;
create trigger trg_phase14_ai_route_bind_epoch
  before insert or update on public.phase14_ai_route_policies
  for each row execute function public.bind_phase14_ai_route_epoch();

create or replace function public.bind_phase14_capability_epoch()
returns trigger language plpgsql set search_path=''
as $function$
declare v_gate public.phase14_security_gates%rowtype;
begin
  select * into strict v_gate from public.phase14_security_gates
  where gate_key='phase14-premium-report' for share;
  new.authority_epoch := v_gate.authority_epoch;
  new.expected_step := 'claim';
  new.workflow_execution_id := null;
  return new;
end;
$function$;
create trigger trg_phase14_capability_bind_epoch
  before insert on public.phase14_worker_capabilities
  for each row execute function public.bind_phase14_capability_epoch();

create or replace function public.bind_phase14_provider_attestation_epoch()
returns trigger language plpgsql set search_path=''
as $function$
declare v_gate public.phase14_security_gates%rowtype; v_auth public.report_delivery_authorizations%rowtype;
begin
  select * into strict v_gate from public.phase14_security_gates
  where gate_key='phase14-premium-report' for share;
  new.authority_epoch := v_gate.authority_epoch;
  if new.authorization_id is not null then
    select * into v_auth from public.report_delivery_authorizations
    where id=new.authorization_id for share;
    if not found then raise exception 'phase14_provider_attestation_authorization_missing'; end if;
    new.authorization_status := v_auth.status;
    new.authorization_updated_at := v_auth.updated_at;
  end if;
  return new;
end;
$function$;
create trigger trg_phase14_provider_attestation_bind_epoch
  before insert on public.phase14_provider_attestations
  for each row execute function public.bind_phase14_provider_attestation_epoch();

create or replace function public.phase14_require_policy(p_policy_key text)
returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare v_policy public.phase14_feature_policies%rowtype; v_gate public.phase14_security_gates%rowtype;
begin
  select * into v_gate from public.phase14_security_gates
  where gate_key='phase14-premium-report' for share;
  if not found or v_gate.status <> 'satisfied'
     or v_gate.satisfied_version <> v_gate.required_version then
    raise exception 'phase14_security_gate_unsatisfied:%',p_policy_key;
  end if;
  select * into v_policy from public.phase14_feature_policies
  where policy_key=p_policy_key for share;
  if not found or not v_policy.enabled then raise exception 'phase14_policy_disabled:%',p_policy_key; end if;
  if v_policy.approved_gate_version is distinct from v_gate.satisfied_version
     or v_policy.required_gate_version is distinct from v_gate.required_version
     or v_policy.approved_authority_epoch is distinct from v_gate.authority_epoch then
    raise exception 'phase14_policy_authority_epoch_stale:%',p_policy_key;
  end if;
  return jsonb_build_object('policy_key',v_policy.policy_key,
    'gate_version',v_gate.satisfied_version,'authority_epoch',v_gate.authority_epoch,
    'approved_at',v_policy.approved_at);
end;
$function$;

-- Provisioning/rotation is an explicit, AAL2-gated enablement action.  The
-- migration never calls it.  The HMAC value lives only in Supabase Vault and
-- is never returned by an RPC, view, log, operational row, or setting.
create or replace function public.rotate_phase14_worker_attestation_key(
  p_key_id text,
  p_secret text,
  p_overlap_seconds integer,
  p_reason text
) returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare v_actor jsonb; v_secret_id uuid; v_now timestamptz:=now();
begin
  v_actor := public.phase14_require_security(
    'runtime_secret_rotation',array['platform_admin']::public.admin_role[],true,false
  );
  if p_key_id !~ '^[a-zA-Z0-9._:-]{1,80}$' or length(p_secret)<32 then
    raise exception 'phase14_worker_attestation_key_invalid';
  end if;
  if p_overlap_seconds<300 or p_overlap_seconds>86400 or coalesce(trim(p_reason),'')='' then
    raise exception 'phase14_worker_attestation_rotation_invalid';
  end if;
  update phase14_private.worker_attestation_keys
  set status='previous',valid_until=v_now+make_interval(secs=>p_overlap_seconds)
  where status='current';
  v_secret_id := vault.create_secret(p_secret,
    'phase14-worker-attestation-'||p_key_id,
    'Phase 14 worker/database attestation verification key',null);
  insert into phase14_private.worker_attestation_keys(
    key_id,vault_secret_id,status,valid_from
  ) values (p_key_id,v_secret_id,'current',v_now);
  insert into public.audit_logs(actor_type,actor_user_id,entity_table,action,after_json)
  values ('admin',(v_actor->>'user_id')::uuid,'phase14_worker_attestation_keys',
    'phase14_worker_attestation_key_rotated',
    jsonb_build_object('key_id',p_key_id,'overlap_seconds',p_overlap_seconds,'reason',p_reason));
  return jsonb_build_object('key_id',p_key_id,'activated_at',v_now,
    'previous_key_valid_for_seconds',p_overlap_seconds);
end;
$function$;

create or replace function phase14_private.verify_worker_attestation(
  p_attestation jsonb,
  p_signature text,
  p_request_payload text,
  p_expected_action text
) returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare
  v_cap public.phase14_worker_capabilities%rowtype;
  v_gate public.phase14_security_gates%rowtype;
  v_key phase14_private.worker_attestation_keys%rowtype;
  v_secret text; v_canonical text; v_expected_signature text; v_request_hash text;
  v_issued timestamptz; v_expires timestamptz; v_nonce uuid;
  v_capability_id uuid; v_lease_generation integer; v_action text; v_step text;
begin
  v_action := p_attestation->>'action';
  v_step := p_attestation->>'step';
  if v_action is distinct from p_expected_action
     or v_action !~ '^[a-z0-9_]{1,100}$'
     or v_step !~ '^[a-z0-9_]{1,100}$'
     or coalesce(p_attestation->>'operation_key','') !~ '^[a-zA-Z0-9._:/-]{1,240}$'
     or coalesce(p_attestation->>'execution_id','') !~ '^[a-zA-Z0-9._:/-]{1,240}$' then
    raise exception 'phase14_worker_attestation_shape_invalid';
  end if;
  begin
    v_capability_id := (p_attestation->>'capability_id')::uuid;
    v_lease_generation := (p_attestation->>'lease_generation')::integer;
    v_issued := to_timestamp((p_attestation->>'issued_at_epoch')::double precision);
    v_expires := to_timestamp((p_attestation->>'expires_at_epoch')::double precision);
    v_nonce := (p_attestation->>'nonce')::uuid;
  exception when others then
    raise exception 'phase14_worker_attestation_shape_invalid';
  end;
  v_request_hash := encode(extensions.digest(convert_to(p_request_payload,'utf8'),'sha256'),'hex');
  if p_attestation->>'request_payload_hash' is distinct from v_request_hash then
    raise exception 'phase14_worker_attestation_payload_mismatch';
  end if;
  if v_issued > clock_timestamp()+interval '5 seconds'
     or v_issued < clock_timestamp()-interval '2 minutes'
     or v_expires <= clock_timestamp()
     or v_expires > v_issued+interval '2 minutes' then
    raise exception 'phase14_worker_attestation_time_invalid';
  end if;

  select * into v_cap from public.phase14_worker_capabilities
  where id=v_capability_id for update;
  if not found then raise exception 'phase14_worker_capability_missing'; end if;
  select * into strict v_gate from public.phase14_security_gates
  where gate_key='phase14-premium-report' for share;
  if v_gate.status<>'satisfied' or v_gate.satisfied_version<>v_gate.required_version
     or v_cap.security_gate_version<>v_gate.satisfied_version
     or v_cap.authority_epoch<>v_gate.authority_epoch
     or (p_attestation->>'authority_epoch')::bigint<>v_gate.authority_epoch then
    raise exception 'phase14_worker_capability_authority_epoch_stale';
  end if;
  if p_attestation->>'capability_type' is distinct from v_cap.capability_type
     or p_attestation->>'operation_key' is distinct from v_cap.operation_key then
    raise exception 'phase14_worker_attestation_capability_binding_invalid';
  end if;
  if v_cap.order_id is distinct from nullif(p_attestation->>'order_id','')::uuid
     or v_cap.assessment_id is distinct from nullif(p_attestation->>'assessment_id','')::uuid
     or v_cap.score_run_id is distinct from nullif(p_attestation->>'score_run_id','')::uuid
     or v_cap.fulfilment_id is distinct from nullif(p_attestation->>'fulfilment_id','')::uuid
     or (v_cap.report_id is not null and v_cap.report_id is distinct from nullif(p_attestation->>'report_id','')::uuid)
     or (v_cap.recipient_email is not null and lower(v_cap.recipient_email::text)
         is distinct from lower(nullif(p_attestation->>'recipient',''))) then
    raise exception 'phase14_worker_attestation_commercial_binding_invalid';
  end if;
  if v_action='claim_phase14_worker_operation' then
    if v_cap.status not in ('authorised','leased') or v_cap.expected_step<>'claim'
       or v_lease_generation<>v_cap.lease_generation then
      raise exception 'phase14_worker_capability_claim_state_invalid';
    end if;
  else
    if v_cap.status<>'leased' or v_cap.lease_expires_at<=clock_timestamp()
       or v_cap.expires_at<=clock_timestamp()
       or v_cap.expected_step<>v_step
       or v_cap.lease_generation<>v_lease_generation
       or v_cap.workflow_execution_id is distinct from p_attestation->>'execution_id' then
      raise exception 'phase14_worker_attestation_step_or_lease_invalid';
    end if;
  end if;
  perform public.phase14_require_policy(v_cap.policy_key);

  select * into v_key from phase14_private.worker_attestation_keys
  where key_id=p_attestation->>'key_id'
    and status in ('current','previous')
    and valid_from<=clock_timestamp()
    and (valid_until is null or valid_until>clock_timestamp())
  for share;
  if not found then raise exception 'phase14_worker_attestation_key_invalid'; end if;
  select decrypted_secret into v_secret from vault.decrypted_secrets
  where id=v_key.vault_secret_id;
  if v_secret is null then raise exception 'phase14_worker_attestation_key_unavailable'; end if;

  v_canonical := concat_ws('|',
    p_attestation->>'key_id',p_attestation->>'capability_id',p_attestation->>'capability_type',
    p_attestation->>'operation_key',p_attestation->>'execution_id',v_action,v_step,
    coalesce(p_attestation->>'order_id',''),coalesce(p_attestation->>'assessment_id',''),
    coalesce(p_attestation->>'score_run_id',''),coalesce(p_attestation->>'fulfilment_id',''),
    coalesce(p_attestation->>'report_id',''),coalesce(lower(p_attestation->>'recipient'),''),
    p_attestation->>'lease_generation',p_attestation->>'request_payload_hash',
    p_attestation->>'issued_at_epoch',p_attestation->>'expires_at_epoch',
    p_attestation->>'nonce',p_attestation->>'authority_epoch'
  );
  v_expected_signature := encode(extensions.hmac(
    convert_to(v_canonical,'utf8'),convert_to(v_secret,'utf8'),'sha256'
  ),'hex');
  if p_signature !~ '^[0-9a-f]{64}$'
     or extensions.digest(convert_to(p_signature,'utf8'),'sha256')
        <> extensions.digest(convert_to(v_expected_signature,'utf8'),'sha256') then
    raise exception 'phase14_worker_attestation_signature_invalid';
  end if;
  begin
    insert into phase14_private.worker_attestation_nonces(
      nonce,capability_id,action,lease_generation,request_payload_hash,issued_at,expires_at
    ) values (v_nonce,v_cap.id,v_action,v_lease_generation,v_request_hash,v_issued,v_expires);
  exception when unique_violation then
    raise exception 'phase14_worker_attestation_replay';
  end;
  return to_jsonb(v_cap)-'issue_secret_hash'-'lease_secret_hash';
end;
$function$;

-- Workflow-start outbox internals.  The platform's start() API exposes no
-- start-idempotency option, so a lost response is deliberately uncertain and
-- cannot cause an automatic second start.
create or replace function phase14_private.claim_workflow_start(
  p_capability_id uuid,p_fulfilment_id uuid,p_execution_id text
) returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare v_cap public.phase14_worker_capabilities%rowtype; v_out public.phase14_workflow_start_outbox%rowtype;
begin
  select * into strict v_cap from public.phase14_worker_capabilities where id=p_capability_id for update;
  if v_cap.fulfilment_id is distinct from p_fulfilment_id then raise exception 'phase14_workflow_start_binding_invalid'; end if;
  insert into public.phase14_workflow_start_outbox(
    fulfilment_id,capability_id,operation_key,external_idempotency_key,
    lease_owner,lease_generation,lease_expires_at,status,authority_epoch
  ) values (
    p_fulfilment_id,p_capability_id,v_cap.operation_key,
    'phase14-workflow-start:'||v_cap.operation_key,p_execution_id,v_cap.lease_generation,
    least(v_cap.expires_at,clock_timestamp()+interval '5 minutes'),'leased',v_cap.authority_epoch
  ) on conflict (capability_id) do nothing;
  select * into strict v_out from public.phase14_workflow_start_outbox
  where capability_id=p_capability_id for update;
  if v_out.status='started' then
    return jsonb_build_object('claimed',false,'status','started','run_id',v_out.run_id,
      'outbox_id',v_out.id,'external_idempotency_key',v_out.external_idempotency_key);
  end if;
  if v_out.status in ('acceptance_uncertain','reconciliation_required') then
    return jsonb_build_object('claimed',false,'status',v_out.status,'run_id',v_out.run_id,
      'outbox_id',v_out.id,'reconciliation_required',true);
  end if;
  if v_out.status='leased' and v_out.lease_expires_at>clock_timestamp()
     and v_out.lease_owner is distinct from p_execution_id then
    raise exception 'phase14_workflow_start_already_leased';
  end if;
  update public.phase14_workflow_start_outbox
  set status='leased',lease_owner=p_execution_id,lease_generation=v_cap.lease_generation,
      lease_expires_at=least(v_cap.expires_at,clock_timestamp()+interval '5 minutes'),
      attempt_number=attempt_number+case when lease_expires_at<=clock_timestamp() then 1 else 0 end,
      updated_at=clock_timestamp()
  where id=v_out.id returning * into v_out;
  return jsonb_build_object('claimed',true,'status',v_out.status,'outbox_id',v_out.id,
    'external_idempotency_key',v_out.external_idempotency_key,'attempt_number',v_out.attempt_number);
end;
$function$;

create or replace function phase14_private.mark_workflow_start_uncertain(
  p_capability_id uuid,p_outbox_id uuid
) returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare v_out public.phase14_workflow_start_outbox%rowtype;
begin
  update public.phase14_workflow_start_outbox
  set status='acceptance_uncertain',reconciliation_status='required',updated_at=clock_timestamp()
  where id=p_outbox_id and capability_id=p_capability_id and status='leased'
  returning * into v_out;
  if not found then raise exception 'phase14_workflow_start_dispatch_boundary_invalid'; end if;
  return jsonb_build_object('outbox_id',v_out.id,'status',v_out.status);
end;
$function$;

create or replace function phase14_private.settle_workflow_start(
  p_capability_id uuid,p_outbox_id uuid,p_run_id text,p_error text
) returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare v_out public.phase14_workflow_start_outbox%rowtype;
begin
  select * into strict v_out from public.phase14_workflow_start_outbox
  where id=p_outbox_id and capability_id=p_capability_id for update;
  if coalesce(trim(p_run_id),'')<>'' then
    update public.phase14_workflow_start_outbox
    set status='started',run_id=p_run_id,accepted_at=clock_timestamp(),last_error=null,
        reconciliation_status='resolved',lease_expires_at=null,updated_at=clock_timestamp()
    where id=v_out.id and status in ('acceptance_uncertain','reconciliation_required')
    returning * into v_out;
    update public.report_fulfilments
    set workflow_start_status='started',workflow_run_id=p_run_id,
        workflow_started_at=coalesce(workflow_started_at,clock_timestamp()),
        workflow_start_error=null,updated_at=clock_timestamp()
    where id=v_out.fulfilment_id;
  else
    update public.phase14_workflow_start_outbox
    set status='reconciliation_required',last_error=left(coalesce(p_error,'workflow start response unavailable'),2000),
        reconciliation_status='required',lease_expires_at=null,updated_at=clock_timestamp()
    where id=v_out.id and status='acceptance_uncertain' returning * into v_out;
    update public.report_fulfilments
    set workflow_start_status='starting',
        workflow_start_error='External workflow acceptance is uncertain; reconciliation is required.',
        updated_at=clock_timestamp()
    where id=v_out.fulfilment_id;
  end if;
  return jsonb_build_object('outbox_id',v_out.id,'status',v_out.status,'run_id',v_out.run_id,
    'reconciliation_required',v_out.status='reconciliation_required');
end;
$function$;

-- Strict provider result classifier used by cleanup settlement.
create or replace function public.phase14_storage_result_is_verified_absence(p_class text)
returns boolean language sql immutable set search_path=''
as $function$ select p_class='object_not_found'; $function$;

create or replace function phase14_private.settle_storage_cleanup(
  p_capability_id uuid,p_cleanup_id uuid,p_work_lease_token uuid,
  p_expected_bucket text,p_expected_path text,p_expected_checksum text,
  p_deletion_requested boolean,p_delete_api_accepted boolean,
  p_provider_result_class text,p_error text
) returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare v_queue public.phase14_storage_cleanup_queue%rowtype; v_absent boolean;
begin
  select * into v_queue from public.phase14_storage_cleanup_queue
  where id=p_cleanup_id for update;
  if not found or v_queue.status<>'leased' or v_queue.lease_owner_capability_id<>p_capability_id
     or v_queue.lease_token<>p_work_lease_token or v_queue.lease_expires_at<=clock_timestamp() then
    raise exception 'cleanup_job_lease_invalid';
  end if;
  if v_queue.storage_bucket<>p_expected_bucket or v_queue.storage_path<>p_expected_path
     or v_queue.expected_checksum<>p_expected_checksum then raise exception 'cleanup_job_object_binding_invalid'; end if;
  if p_provider_result_class not in (
    'object_present','object_not_found','authentication_failure','authorization_failure','rate_limited',
    'timeout','network_failure','provider_outage','malformed_response','checksum_read_failure',
    'unknown_provider_error','delete_accepted'
  ) then raise exception 'cleanup_provider_result_class_invalid'; end if;
  v_absent := public.phase14_storage_result_is_verified_absence(p_provider_result_class);
  if v_absent and not p_deletion_requested and p_delete_api_accepted then
    raise exception 'cleanup_deletion_evidence_inconsistent';
  end if;
  update public.phase14_storage_cleanup_queue set
    status=case when v_absent then 'deleted'
      when attempt_count+1>=5 then 'dead_letter' else 'failed' end,
    attempt_count=attempt_count+1,last_attempt_at=clock_timestamp(),
    deletion_requested_at=case when p_deletion_requested then clock_timestamp() else deletion_requested_at end,
    delete_api_accepted_at=case when p_delete_api_accepted then clock_timestamp() else delete_api_accepted_at end,
    absence_verified_at=case when v_absent then clock_timestamp() else null end,
    deletion_verified_at=case when v_absent then clock_timestamp() else null end,
    deleted_at=case when v_absent then clock_timestamp() else null end,
    provider_result_class=p_provider_result_class,
    verification_error=case when v_absent then null else left(coalesce(p_error,p_provider_result_class),2000) end,
    last_error=case when v_absent then null else left(coalesce(p_error,p_provider_result_class),2000) end,
    dead_lettered_at=case when not v_absent and attempt_count+1>=5 then clock_timestamp() else null end,
    next_attempt_at=case when v_absent then next_attempt_at else clock_timestamp()+interval '15 minutes' end,
    lease_owner_capability_id=null,lease_token=null,lease_expires_at=null,updated_at=clock_timestamp()
  where id=v_queue.id returning * into v_queue;
  return jsonb_build_object('cleanup_id',v_queue.id,'status',v_queue.status,
    'absence_verified',v_absent,'provider_result_class',p_provider_result_class);
end;
$function$;

create or replace function phase14_private.settle_owned_storage_cleanup(
  p_capability_id uuid,p_cleanup_id uuid,p_deletion_requested boolean,
  p_delete_api_accepted boolean,p_provider_result_class text,p_error text
) returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare v_queue public.phase14_storage_cleanup_queue%rowtype; v_absent boolean;
begin
  select * into v_queue from public.phase14_storage_cleanup_queue
  where id=p_cleanup_id for update;
  if not found or v_queue.owner_capability_id is distinct from p_capability_id
     or v_queue.status not in ('pending','failed') then
    raise exception 'cleanup_job_owner_invalid';
  end if;
  if p_provider_result_class not in (
    'object_present','object_not_found','authentication_failure','authorization_failure','rate_limited',
    'timeout','network_failure','provider_outage','malformed_response','checksum_read_failure',
    'unknown_provider_error','delete_accepted'
  ) then raise exception 'cleanup_provider_result_class_invalid'; end if;
  v_absent:=public.phase14_storage_result_is_verified_absence(p_provider_result_class);
  update public.phase14_storage_cleanup_queue set
    status=case when v_absent then 'deleted' when attempt_count+1>=5 then 'dead_letter' else 'failed' end,
    attempt_count=attempt_count+1,last_attempt_at=clock_timestamp(),
    deletion_requested_at=case when p_deletion_requested then clock_timestamp() else deletion_requested_at end,
    delete_api_accepted_at=case when p_delete_api_accepted then clock_timestamp() else delete_api_accepted_at end,
    absence_verified_at=case when v_absent then clock_timestamp() else null end,
    deletion_verified_at=case when v_absent then clock_timestamp() else null end,
    deleted_at=case when v_absent then clock_timestamp() else null end,
    provider_result_class=p_provider_result_class,
    verification_error=case when v_absent then null else left(coalesce(p_error,p_provider_result_class),2000) end,
    last_error=case when v_absent then null else left(coalesce(p_error,p_provider_result_class),2000) end,
    dead_lettered_at=case when not v_absent and attempt_count+1>=5 then clock_timestamp() else null end,
    next_attempt_at=case when v_absent then next_attempt_at else clock_timestamp()+interval '15 minutes' end,
    updated_at=clock_timestamp()
  where id=v_queue.id returning * into v_queue;
  return jsonb_build_object('cleanup_id',v_queue.id,'status',v_queue.status,
    'absence_verified',v_absent,'provider_result_class',p_provider_result_class);
end;
$function$;

-- Bounce remediation consumes independent, immutable contact verification.
create or replace function public.authorize_bounced_report_redelivery(
  p_prior_email_event_id uuid,
  p_verification_id uuid,
  p_reason text
) returns uuid
language plpgsql security definer set search_path=''
as $function$
declare
  v_actor jsonb; v_event public.email_events%rowtype; v_order public.orders%rowtype;
  v_ver public.customer_contact_verifications%rowtype; v_id uuid;
begin
  v_actor := public.phase14_require_security(
    'email_resend',array['platform_admin','approver']::public.admin_role[],true,false
  );
  if coalesce(trim(p_reason),'')='' then raise exception 'bounce_remediation_reason_required'; end if;
  select * into v_event from public.email_events where id=p_prior_email_event_id for update;
  if not found or v_event.status<>'bounced' or v_event.order_id is null or v_event.report_id is null then
    raise exception 'bounce_remediation_event_ineligible';
  end if;
  -- Complaints are permanently non-retriable even if a later bounce exists.
  if exists(select 1 from public.email_events e where e.report_id=v_event.report_id and e.status='complained') then
    raise exception 'bounce_remediation_complaint_permanent';
  end if;
  select * into v_ver from public.customer_contact_verifications
  where id=p_verification_id for update;
  if not found or v_ver.status<>'verified' or v_ver.expires_at<=clock_timestamp()
     or v_ver.verified_at>clock_timestamp()+interval '5 seconds' then
    raise exception 'bounce_remediation_verification_invalid';
  end if;
  select * into v_order from public.orders where id=v_event.order_id for update;
  if not found or v_ver.order_id<>v_order.id or v_ver.assessment_id<>v_order.assessment_id
     or lower(v_ver.previous_email::text)<>lower(v_event.recipient_email::text)
     or lower(v_order.customer_email::text)<>lower(v_ver.previous_email::text)
     or lower(v_ver.corrected_email::text)=lower(v_ver.previous_email::text)
     or v_ver.customer_identity<>coalesce(v_order.customer_name,v_order.customer_email::text) then
    raise exception 'bounce_remediation_verification_binding_invalid';
  end if;
  insert into public.report_delivery_remediations(
    prior_email_event_id,report_id,recipient_email,remediation_type,previous_recipient_email,
    corrected_recipient_email,reason,evidence_json,authorised_by,authorised_session_id,
    customer_update_applied_at
  ) values (
    v_event.id,v_event.report_id,v_ver.corrected_email,'bounce_retry',v_ver.previous_email,
    v_ver.corrected_email,p_reason,
    jsonb_build_object('contact_verification_id',v_ver.id,'verification_method',v_ver.verification_method,
      'evidence_reference',v_ver.evidence_reference,'verified_at',v_ver.verified_at),
    (v_actor->>'user_id')::uuid,(v_actor->>'session_id')::uuid,clock_timestamp()
  ) returning id into v_id;
  update public.customer_contact_verifications
  set status='consumed',consumed_at=clock_timestamp(),consumed_by_remediation_id=v_id
  where id=v_ver.id and status='verified';
  if not found then raise exception 'bounce_remediation_verification_consumption_failed'; end if;
  update public.orders set customer_email=v_ver.corrected_email,updated_at=clock_timestamp()
  where id=v_order.id and customer_email=v_ver.previous_email;
  if not found then raise exception 'bounce_remediation_order_recipient_cas_failed'; end if;
  insert into public.audit_logs(actor_type,actor_user_id,assessment_id,entity_table,entity_id,action,after_json)
  values ('admin',(v_actor->>'user_id')::uuid,v_order.assessment_id,'report_delivery_remediations',v_id,
    'premium_report_bounce_remediation_authorized',
    jsonb_build_object('contact_verification_id',v_ver.id,'prior_email_event_id',v_event.id,
      'previous_recipient',v_ver.previous_email,'corrected_recipient',v_ver.corrected_email));
  insert into public.assessment_events(
    assessment_id,order_id,report_id,event_type,dedupe_key,metadata_json
  ) values (
    v_order.assessment_id,v_order.id,v_event.report_id,'report_emailed_to_customer',
    'phase14-bounce-remediation:'||v_id,
    jsonb_build_object('remediation_id',v_id,'contact_verification_id',v_ver.id,
      'authorization_only',true)
  );
  return v_id;
end;
$function$;

create or replace function public.resolve_premium_report_delivery_reconciliation(
  p_authorization_id uuid,
  p_resolution text,
  p_attestation_id uuid,
  p_operator_override boolean default false,
  p_reason text default null
) returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare
  v_actor jsonb; v_auth public.report_delivery_authorizations%rowtype;
  v_event public.email_events%rowtype; v_att public.phase14_provider_attestations%rowtype;
  v_gate public.phase14_security_gates%rowtype; v_result jsonb;
begin
  v_actor:=public.phase14_require_security(
    'provider_reconciliation',array['platform_admin','approver']::public.admin_role[],true,false
  );
  if p_resolution not in ('accepted','not_accepted') then raise exception 'delivery_reconciliation_resolution_invalid'; end if;
  if coalesce(trim(p_reason),'')='' then raise exception 'delivery_reconciliation_reason_required'; end if;
  select * into strict v_gate from public.phase14_security_gates
  where gate_key='phase14-premium-report' for share;
  select * into v_auth from public.report_delivery_authorizations
  where id=p_authorization_id for update;
  if not found or v_auth.status<>'reconciliation_required' then raise exception 'delivery_reconciliation_state_invalid'; end if;
  select * into strict v_event from public.email_events where id=v_auth.email_event_id for update;
  select * into v_att from public.phase14_provider_attestations
  where id=p_attestation_id for update;
  if not found or v_att.attestation_source<>'provider_lookup'
     or v_att.provider<>v_auth.provider
     or v_att.authorization_id is distinct from v_auth.id
     or v_att.email_event_id is distinct from v_auth.email_event_id
     or v_att.provider_request_key is distinct from v_event.provider_request_key
     or v_att.recorded_at<v_auth.dispatch_started_at
     or v_att.recorded_at>clock_timestamp()+interval '5 seconds'
     or v_att.recorded_at<clock_timestamp()-interval '10 minutes'
     or v_att.authority_epoch<>v_gate.authority_epoch
     or v_att.authorization_status is distinct from v_auth.status
     or v_att.authorization_updated_at is distinct from v_auth.updated_at then
    raise exception 'delivery_reconciliation_attestation_binding_or_age_invalid';
  end if;
  if exists(select 1 from public.phase14_provider_attestation_consumptions where attestation_id=v_att.id) then
    raise exception 'delivery_reconciliation_attestation_already_consumed';
  end if;
  if p_resolution='accepted' then
    if v_att.provider_state<>'accepted' or coalesce(trim(v_att.provider_message_id),'')='' then
      raise exception 'delivery_reconciliation_acceptance_not_attested';
    end if;
  else
    if not p_operator_override then raise exception 'delivery_reconciliation_operator_override_required'; end if;
    if v_att.provider_state<>'not_found' then raise exception 'delivery_reconciliation_non_acceptance_not_attested'; end if;
  end if;
  insert into public.phase14_provider_attestation_consumptions(
    attestation_id,authorization_id,consumed_by,consumed_session_id
  ) values (v_att.id,v_auth.id,(v_actor->>'user_id')::uuid,(v_actor->>'session_id')::uuid);
  if p_resolution='accepted' then
    v_result:=public.finalize_premium_report_delivery(v_auth.id,v_auth.email_event_id,v_att.provider_message_id);
  else
    update public.report_delivery_authorizations
    set status='revoked',revoked_reason=p_reason,lease_token=null,lease_expires_at=null,updated_at=clock_timestamp()
    where id=v_auth.id and status='reconciliation_required';
    if not found then raise exception 'delivery_reconciliation_authorization_cas_failed'; end if;
    update public.email_events set
      status='failed_before_provider',error_message=p_reason,reconciliation_attempted_at=clock_timestamp(),
      reconciliation_result_json=jsonb_build_object('attestation_id',v_att.id,'provider_state',v_att.provider_state),
      delivery_updated_at=clock_timestamp()
    where id=v_auth.email_event_id and status='reconciliation_required';
    if not found then raise exception 'delivery_reconciliation_email_cas_failed'; end if;
    v_result:=jsonb_build_object('resolved',true,'resolution','not_accepted','authorization_id',v_auth.id);
  end if;
  insert into public.audit_logs(actor_type,actor_user_id,assessment_id,entity_table,entity_id,action,after_json)
  values ('admin',(v_actor->>'user_id')::uuid,v_auth.assessment_id,'report_delivery_authorizations',v_auth.id,
    'premium_report_delivery_reconciliation_resolved',
    jsonb_build_object('resolution',p_resolution,'attestation_id',v_att.id,
      'provider_message_id',v_att.provider_message_id,'operator_override',p_operator_override,
      'authority_epoch',v_gate.authority_epoch,'reason',p_reason));
  return v_result;
end;
$function$;

create or replace function phase14_private.fault_if_requested(p_fault_after text,p_point text)
returns void language plpgsql immutable set search_path=''
as $function$
begin
  if p_fault_after=p_point then raise exception 'phase14_terminal_fault:%',p_point; end if;
end;
$function$;

-- One attested terminal publication transaction.  Storage copy is intentionally
-- outside this transaction; the bound final-object cleanup row exists before
-- copy and is changed to retained only when every database effect commits.
create or replace function public.terminal_phase14_generation_publication(
  p_attestation jsonb,
  p_signature text,
  p_request_payload text
) returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare
  v_payload jsonb:=p_request_payload::jsonb;
  v_capability_id uuid:=(v_payload->>'capability_id')::uuid;
  v_claim_token uuid:=(v_payload->>'claim_token')::uuid;
  v_fulfilment_id uuid:=(v_payload->>'fulfilment_id')::uuid;
  v_generation_run_id uuid:=(v_payload->>'generation_run_id')::uuid;
  v_report_id uuid:=(v_payload->>'report_id')::uuid;
  v_cleanup_id uuid:=(v_payload->>'final_cleanup_id')::uuid;
  v_fault_after text:=nullif(v_payload->>'fault_after','');
  v_cap public.phase14_worker_capabilities%rowtype;
  v_claim public.report_generation_claims%rowtype;
  v_report public.reports%rowtype;
  v_fulfilment public.report_fulfilments%rowtype;
  v_cleanup public.phase14_storage_cleanup_queue%rowtype;
  v_object record; v_order_reference text; v_event_type text; v_metadata jsonb;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then
    raise exception 'phase14_worker_service_role_required';
  end if;
  perform phase14_private.verify_worker_attestation(
    p_attestation,p_signature,p_request_payload,'terminal_phase14_generation_publication'
  );
  perform phase14_private.fault_if_requested(v_fault_after,'after_attestation');
  perform set_config('phase14.worker_capability_id',v_capability_id::text,true);
  perform phase14_private.fault_if_requested(v_fault_after,'after_capability_context');
  select * into strict v_cap from public.phase14_worker_capabilities
  where id=v_capability_id for update;
  perform phase14_private.fault_if_requested(v_fault_after,'after_capability_lock');
  if v_cap.capability_type not in ('automatic_generation','generation_recovery')
     or v_cap.expected_step<>'terminal_publication'
     or v_cap.fulfilment_id is distinct from v_fulfilment_id then
    raise exception 'phase14_terminal_capability_binding_invalid';
  end if;
  perform set_config('phase14.worker_capability_type',v_cap.capability_type,true);
  perform set_config('phase14.authoritative_transition','worker_attested_rpc',true);
  select * into strict v_claim from public.report_generation_claims
  where claim_token=v_claim_token for update;
  perform phase14_private.fault_if_requested(v_fault_after,'after_claim_lock');
  if v_claim.state<>'committed' or v_claim.report_id is distinct from v_report_id
     or v_claim.fulfilment_id is distinct from v_fulfilment_id
     or v_claim.lease_expires_at<=clock_timestamp() then
    raise exception 'phase14_terminal_generation_claim_invalid';
  end if;
  select * into strict v_report from public.reports where id=v_report_id for update;
  perform phase14_private.fault_if_requested(v_fault_after,'after_report_lock');
  if v_report.status<>'draft' or v_report.order_id<>v_claim.order_id
     or v_report.assessment_id<>v_claim.assessment_id
     or v_report.score_run_id<>v_claim.score_run_id
     or v_report.version_number<>v_claim.version_number
     or v_report.checksum<>v_claim.expected_checksum
     or v_report.storage_bucket<>v_claim.temporary_storage_bucket
     or v_report.storage_path<>v_claim.temporary_storage_path then
    raise exception 'phase14_terminal_report_claim_binding_invalid';
  end if;
  select * into strict v_fulfilment from public.report_fulfilments
  where id=v_fulfilment_id for update;
  perform phase14_private.fault_if_requested(v_fault_after,'after_fulfilment_lock');
  if v_fulfilment.order_id<>v_claim.order_id
     or v_fulfilment.assessment_id<>v_claim.assessment_id
     or v_fulfilment.score_run_id<>v_claim.score_run_id
     or v_fulfilment.status not in ('storing','rendering','generating','validating','assembling') then
    raise exception 'phase14_terminal_fulfilment_binding_invalid';
  end if;
  select * into strict v_cleanup from public.phase14_storage_cleanup_queue
  where id=v_cleanup_id for update;
  perform phase14_private.fault_if_requested(v_fault_after,'after_cleanup_lock');
  if v_cleanup.storage_bucket<>v_claim.final_storage_bucket
     or v_cleanup.storage_path<>v_claim.final_storage_path
     or v_cleanup.expected_checksum<>v_claim.expected_checksum
     or v_cleanup.report_id is distinct from v_report.id
     or v_cleanup.owner_capability_id is distinct from v_cap.id
     or v_cleanup.status not in ('pending','failed') then
    raise exception 'phase14_terminal_orphan_cleanup_binding_invalid';
  end if;
  select order_reference into strict v_order_reference from public.orders
  where id=v_claim.order_id;
  perform phase14_private.fault_if_requested(v_fault_after,'after_order_read');
  perform public.phase14_generation_entitlement(
    v_order_reference,v_claim.order_id,v_claim.assessment_id,v_claim.score_run_id,v_claim.score_input_hash
  );
  perform phase14_private.fault_if_requested(v_fault_after,'after_entitlement');
  select so.bucket_id,so.name,so.metadata into strict v_object
  from storage.objects so
  where so.bucket_id=v_claim.final_storage_bucket and so.name=v_claim.final_storage_path;
  perform phase14_private.fault_if_requested(v_fault_after,'after_storage_binding');
  if coalesce(v_object.metadata->>'mimetype','')<>'application/pdf'
     or coalesce(v_object.metadata->>'sha256',v_object.metadata->'metadata'->>'sha256','')
        <>v_claim.expected_checksum then
    raise exception 'phase14_terminal_storage_checksum_invalid';
  end if;
  if v_report.supersedes_report_id is not null then
    update public.reports set status='superseded',updated_at=clock_timestamp()
    where id=v_report.supersedes_report_id and status not in ('voided','superseded');
  end if;
  perform phase14_private.fault_if_requested(v_fault_after,'after_previous_report_supersession');
  update public.reports set
    status='generated',storage_bucket=v_claim.final_storage_bucket,
    storage_path=v_claim.final_storage_path,generation_run_id=v_generation_run_id,
    updated_at=clock_timestamp()
  where id=v_report.id and status='draft';
  if not found then raise exception 'phase14_terminal_report_cas_failed'; end if;
  perform phase14_private.fault_if_requested(v_fault_after,'after_report_publication');
  update public.report_generation_runs set report_id=v_report.id,status='used'
  where id=v_generation_run_id and fulfilment_id=v_fulfilment.id
    and (report_id is null or report_id=v_report.id);
  if not found then raise exception 'phase14_terminal_generation_run_link_failed'; end if;
  perform phase14_private.fault_if_requested(v_fault_after,'after_generation_run_link');
  update public.report_generation_claims
  set state='settled',last_heartbeat_at=clock_timestamp(),updated_at=clock_timestamp()
  where claim_token=v_claim.claim_token and state='committed';
  if not found then raise exception 'phase14_terminal_claim_settlement_failed'; end if;
  perform phase14_private.fault_if_requested(v_fault_after,'after_claim_settlement');
  update public.report_fulfilments set
    status='ready_for_delivery',current_step='ready_for_email_delivery',
    generation_mode=v_payload->>'generation_mode',report_id=v_report.id,
    last_error_code=null,last_error_message=null,updated_at=clock_timestamp()
  where id=v_fulfilment.id and status=v_fulfilment.status;
  if not found then raise exception 'phase14_terminal_fulfilment_cas_failed'; end if;
  perform phase14_private.fault_if_requested(v_fault_after,'after_fulfilment_transition');
  v_event_type:=case when v_report.supersedes_report_id is null then 'generated' else 'regenerated' end;
  v_metadata:=coalesce(v_payload->'metadata','{}'::jsonb)||jsonb_build_object(
    'worker_capability_id',v_cap.id,'authority_epoch',v_cap.authority_epoch,
    'generation_run_id',v_generation_run_id,'fulfilment_id',v_fulfilment.id
  );
  insert into public.report_events(report_id,event_type,actor_user_id,note,metadata_json)
  values (v_report.id,v_event_type,null,'Atomic terminal generation publication.',v_metadata);
  perform phase14_private.fault_if_requested(v_fault_after,'after_report_event');
  insert into public.audit_logs(actor_type,assessment_id,entity_table,entity_id,action,after_json)
  values ('system',v_report.assessment_id,'reports',v_report.id,
    case when v_event_type='generated' then 'premium_report_generated' else 'premium_report_regenerated' end,
    v_metadata||jsonb_build_object('report_reference',v_report.report_reference));
  perform phase14_private.fault_if_requested(v_fault_after,'after_audit_event');
  insert into public.assessment_events(
    assessment_id,order_id,report_id,event_type,dedupe_key,metadata_json
  ) values (
    v_report.assessment_id,v_report.order_id,v_report.id,'report_generated',
    'phase14-terminal-generation:'||v_claim.claim_token,v_metadata
  );
  perform phase14_private.fault_if_requested(v_fault_after,'after_assessment_event');
  update public.phase14_storage_cleanup_queue set
    status='retained',last_error=null,verification_error=null,
    lease_owner_capability_id=null,lease_token=null,lease_expires_at=null,
    updated_at=clock_timestamp()
  where id=v_cleanup.id and status in ('pending','failed');
  if not found then raise exception 'phase14_terminal_cleanup_transition_failed'; end if;
  perform phase14_private.fault_if_requested(v_fault_after,'after_cleanup_transition');
  update public.phase14_worker_capabilities set
    status='consumed',consumed_at=clock_timestamp(),lease_owner=null,
    lease_secret_hash=null,lease_expires_at=null,last_heartbeat_at=clock_timestamp(),
    lease_generation=lease_generation+1,expected_step='consumed',updated_at=clock_timestamp()
  where id=v_cap.id and status='leased' and lease_generation=v_cap.lease_generation;
  if not found then raise exception 'phase14_terminal_capability_consumption_failed'; end if;
  perform phase14_private.fault_if_requested(v_fault_after,'after_capability_consumption');
  return jsonb_build_object('completed',true,'report_id',v_report.id,
    'fulfilment_id',v_fulfilment.id,'generation_run_id',v_generation_run_id,
    'final_storage_bucket',v_claim.final_storage_bucket,
    'final_storage_path',v_claim.final_storage_path,'checksum',v_claim.expected_checksum,
    'version_number',v_report.version_number,'superseded_report_id',v_report.supersedes_report_id,
    'lease_generation',v_cap.lease_generation+1,'expected_step','consumed');
end;
$function$;

-- All non-terminal worker transitions enter through this single attested
-- dispatcher.  Legacy worker facades remain callable only by their owner and
-- are never granted to a runtime role.
create or replace function public.execute_phase14_worker_step(
  p_attestation jsonb,
  p_signature text,
  p_request_payload text
) returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare
  v_payload jsonb:=p_request_payload::jsonb; v_action text:=p_attestation->>'action';
  v_capability_id uuid:=(p_attestation->>'capability_id')::uuid;
  v_cap public.phase14_worker_capabilities%rowtype; v_result jsonb; v_next text;
  v_terminal boolean:=false;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'phase14_worker_service_role_required'; end if;
  perform phase14_private.verify_worker_attestation(p_attestation,p_signature,p_request_payload,v_action);
  select * into strict v_cap from public.phase14_worker_capabilities where id=v_capability_id for update;
  perform set_config('phase14.worker_capability_id',v_cap.id::text,true);
  perform set_config('phase14.worker_capability_type',v_cap.capability_type,true);
  perform set_config('phase14.authoritative_transition','worker_attested_rpc',true);

  case v_action
    when 'claim_phase14_worker_operation' then
      if v_cap.status='leased' and v_cap.lease_expires_at>clock_timestamp()
         and v_cap.workflow_execution_id is distinct from p_attestation->>'execution_id' then
        raise exception 'phase14_worker_capability_already_leased';
      end if;
      v_next:=case v_cap.capability_type
        when 'automatic_generation' then 'workflow_start_claim'
        when 'generation_recovery' then 'generation_claim'
        when 'automatic_delivery' then 'delivery_authorize'
        when 'delivery_reconciliation' then 'delivery_reconcile'
        when 'storage_cleanup' then 'cleanup_expire' end;
      update public.phase14_worker_capabilities set
        status='leased',workflow_execution_id=p_attestation->>'execution_id',
        lease_owner=p_attestation->>'execution_id',lease_expires_at=least(expires_at,clock_timestamp()+interval '60 minutes'),
        lease_generation=lease_generation+1,expected_step=v_next,
        takeover_count=takeover_count+case when status='leased' and lease_expires_at<=clock_timestamp() then 1 else 0 end,
        claimed_at=coalesce(claimed_at,clock_timestamp()),last_heartbeat_at=clock_timestamp(),updated_at=clock_timestamp()
      where id=v_cap.id returning * into v_cap;
      v_result:=jsonb_build_object('capability_id',v_cap.id,'capability_type',v_cap.capability_type,
        'operation_key',v_cap.operation_key,'execution_id',v_cap.workflow_execution_id,
        'lease_expires_at',v_cap.lease_expires_at,'authority_epoch',v_cap.authority_epoch);
    when 'claim_premium_report_workflow_start' then
      if v_cap.expected_step<>'workflow_start_claim' then raise exception 'phase14_worker_step_out_of_order'; end if;
      v_result:=phase14_private.claim_workflow_start(v_cap.id,(v_payload->>'fulfilment_id')::uuid,v_cap.workflow_execution_id);
      v_next:='workflow_start_dispatch';
    when 'mark_phase14_workflow_start_dispatching' then
      if v_cap.expected_step<>'workflow_start_dispatch' then raise exception 'phase14_worker_step_out_of_order'; end if;
      v_result:=phase14_private.mark_workflow_start_uncertain(v_cap.id,(v_payload->>'outbox_id')::uuid);
      v_next:='workflow_start_settle';
    when 'record_premium_report_workflow_start' then
      if v_cap.expected_step<>'workflow_start_settle' then raise exception 'phase14_worker_step_out_of_order'; end if;
      v_result:=phase14_private.settle_workflow_start(v_cap.id,(v_payload->>'outbox_id')::uuid,
        nullif(v_payload->>'run_id',''),nullif(v_payload->>'error',''));
      v_next:=case when coalesce(v_result->>'status','')='started' then 'generation_claim' else 'workflow_start_reconcile' end;
    when 'worker_claim_premium_report_generation' then
      if v_cap.expected_step<>'generation_claim' then raise exception 'phase14_worker_step_out_of_order'; end if;
      v_result:=public.worker_claim_premium_report_generation(v_cap.id,
        v_payload->>'order_reference',v_payload->>'claim_owner',(v_payload->>'fulfilment_id')::uuid,
        (v_payload->>'report_type')::public.report_type);
      v_next:='fulfilment_assembling';
    when 'worker_recover_premium_report_generation_claim' then
      if v_cap.expected_step<>'generation_claim' then raise exception 'phase14_worker_step_out_of_order'; end if;
      v_result:=public.worker_recover_premium_report_generation_claim(v_cap.id,
        v_payload->>'order_reference',v_payload->>'claim_owner',(v_payload->>'fulfilment_id')::uuid);
      v_next:='cleanup_register_recovery_temp';
    when 'transition_premium_report_fulfilment' then
      if (v_cap.expected_step='fulfilment_assembling' and v_payload->>'status'='assembling') then
        v_next:='narrative_decision';
      elsif (v_cap.expected_step='narrative_decision' and v_payload->>'status' in ('generating','validating')) then
        v_next:=case when v_payload->>'status'='generating' then 'ai_checkpoint' else 'generation_lease_renew' end;
      elsif (v_cap.expected_step='fulfilment_rendering' and v_payload->>'status'='rendering') then
        v_next:='cleanup_register_temp';
      elsif (v_cap.expected_step='fulfilment_storing' and v_payload->>'status'='storing') then
        v_next:='draft_commit';
      else raise exception 'phase14_worker_step_out_of_order'; end if;
      v_result:=public.transition_premium_report_fulfilment(v_cap.id,
        (v_payload->>'fulfilment_id')::uuid,v_payload->>'status',v_payload->>'current_step',
        nullif(v_payload->>'generation_mode',''),nullif(v_payload->>'report_id','')::uuid,
        coalesce((v_payload->>'increment_attempt')::boolean,false),nullif(v_payload->>'error_code',''),
        nullif(v_payload->>'error_message',''));
    when 'authorize_phase14_worker_action' then
      if v_cap.expected_step not in ('ai_checkpoint','ai_or_renew')
         or v_payload->>'action'<>'ai_narrative_generation' then
        raise exception 'phase14_worker_step_out_of_order'; end if;
      v_result:=public.authorize_phase14_worker_action(v_cap.id,'ai_narrative_generation');
      v_next:='ai_attempt_claim';
    when 'claim_phase14_ai_attempt' then
      if v_cap.expected_step not in ('ai_attempt_claim','ai_or_renew') then raise exception 'phase14_worker_step_out_of_order'; end if;
      v_result:=public.claim_phase14_ai_attempt(v_cap.id,coalesce(v_payload->'attempt','{}'::jsonb));
      v_next:='ai_attempt_settle';
    when 'settle_phase14_ai_attempt' then
      if v_cap.expected_step<>'ai_attempt_settle' then raise exception 'phase14_worker_step_out_of_order'; end if;
      v_result:=public.settle_phase14_ai_attempt(v_cap.id,(v_payload->>'attempt_id')::uuid,
        coalesce(v_payload->'result','{}'::jsonb));
      v_next:='ai_or_renew';
    when 'worker_renew_premium_report_generation_lease' then
      if v_cap.expected_step not in ('generation_lease_renew','ai_or_renew') then raise exception 'phase14_worker_step_out_of_order'; end if;
      v_result:=to_jsonb(public.worker_renew_premium_report_generation_lease(v_cap.id,
        (v_payload->>'claim_token')::uuid));
      v_next:='generation_run_record';
    when 'record_premium_report_generation_run' then
      if v_cap.expected_step<>'generation_run_record' then raise exception 'phase14_worker_step_out_of_order'; end if;
      v_result:=to_jsonb(public.record_premium_report_generation_run(v_cap.id,
        (v_payload->>'fulfilment_id')::uuid,coalesce(v_payload->'run','{}'::jsonb)));
      v_next:='fulfilment_rendering';
    when 'worker_register_phase14_storage_cleanup' then
      if v_cap.expected_step='cleanup_register_temp' then v_next:='fulfilment_storing';
      elsif v_cap.expected_step='cleanup_register_recovery_temp' then v_next:='cleanup_link_temp';
      elsif v_cap.expected_step='cleanup_register_final' then v_next:='cleanup_temp_settle';
      else raise exception 'phase14_worker_step_out_of_order'; end if;
      v_result:=to_jsonb(public.worker_register_phase14_storage_cleanup(v_cap.id,
        v_payload->>'storage_bucket',v_payload->>'storage_path',v_payload->>'expected_checksum',
        nullif(v_payload->>'claim_token','')::uuid,v_payload->>'reason'));
      if v_cap.expected_step='cleanup_register_final' then
        update public.phase14_storage_cleanup_queue set report_id=(v_payload->>'report_id')::uuid,
          updated_at=clock_timestamp()
        where id=(v_result#>>'{}')::uuid and owner_capability_id=v_cap.id and report_id is null;
        if not found then raise exception 'phase14_final_cleanup_report_binding_failed'; end if;
      end if;
    when 'worker_commit_premium_report_draft' then
      if v_cap.expected_step<>'draft_commit' then raise exception 'phase14_worker_step_out_of_order'; end if;
      v_result:=to_jsonb(public.worker_commit_premium_report_draft(v_cap.id,
        (v_payload->>'claim_token')::uuid,(v_payload->>'template_id')::uuid,
        v_payload->>'storage_bucket',v_payload->>'temp_storage_path',v_payload->>'checksum',
        (v_payload->>'generation_run_id')::uuid));
      v_next:='cleanup_link_temp';
    when 'worker_link_phase14_storage_cleanup_report' then
      if v_cap.expected_step<>'cleanup_link_temp' then raise exception 'phase14_worker_step_out_of_order'; end if;
      v_result:=to_jsonb(public.worker_link_phase14_storage_cleanup_report(v_cap.id,
        (v_payload->>'cleanup_id')::uuid,(v_payload->>'report_id')::uuid));
      v_next:='cleanup_register_final';
    when 'worker_record_phase14_storage_cleanup_result' then
      if v_cap.expected_step<>'cleanup_temp_settle' then raise exception 'phase14_worker_step_out_of_order'; end if;
      v_result:=phase14_private.settle_owned_storage_cleanup(v_cap.id,
        (v_payload->>'cleanup_id')::uuid,(v_payload->>'deletion_requested')::boolean,
        (v_payload->>'delete_api_accepted')::boolean,v_payload->>'provider_result_class',
        nullif(v_payload->>'error',''));
      v_next:='terminal_publication';
    when 'worker_abandon_premium_report_generation_claim' then
      if v_cap.expected_step not in ('fulfilment_assembling','narrative_decision','ai_checkpoint','ai_attempt_claim',
        'ai_attempt_settle','ai_or_renew','generation_lease_renew','generation_run_record','fulfilment_rendering',
        'cleanup_register_temp','fulfilment_storing','draft_commit') then raise exception 'phase14_worker_step_out_of_order'; end if;
      v_result:=to_jsonb(public.worker_abandon_premium_report_generation_claim(v_cap.id,
        (v_payload->>'claim_token')::uuid,v_payload->>'reason'));
      v_next:='consumed'; v_terminal:=true;
    when 'worker_authorize_premium_report_delivery' then
      if v_cap.expected_step<>'delivery_authorize' then raise exception 'phase14_worker_step_out_of_order'; end if;
      v_result:=public.worker_authorize_premium_report_delivery(v_cap.id,(v_payload->>'report_id')::uuid,
        v_payload->>'recipient',v_payload->>'provider'); v_next:='delivery_claim';
    when 'worker_claim_premium_report_delivery' then
      if v_cap.expected_step<>'delivery_claim' then raise exception 'phase14_worker_step_out_of_order'; end if;
      v_result:=public.worker_claim_premium_report_delivery(v_cap.id,(v_payload->>'authorization_id')::uuid);
      v_next:='delivery_dispatch_start';
    when 'worker_mark_premium_report_delivery_dispatch_started' then
      if v_cap.expected_step<>'delivery_dispatch_start' then raise exception 'phase14_worker_step_out_of_order'; end if;
      v_result:=to_jsonb(public.worker_mark_premium_report_delivery_dispatch_started(v_cap.id,
        (v_payload->>'authorization_id')::uuid,(v_payload->>'delivery_lease_token')::uuid));
      v_next:='delivery_terminal';
    when 'worker_finalize_premium_report_delivery' then
      if v_cap.expected_step<>'delivery_terminal' then raise exception 'phase14_worker_step_out_of_order'; end if;
      v_result:=public.worker_finalize_premium_report_delivery(v_cap.id,
        (v_payload->>'authorization_id')::uuid,(v_payload->>'email_event_id')::uuid,
        v_payload->>'provider_message_id'); v_next:='consumed'; v_terminal:=true;
    when 'worker_fail_premium_report_delivery_before_dispatch' then
      if v_cap.expected_step<>'delivery_dispatch_start' then raise exception 'phase14_worker_step_out_of_order'; end if;
      v_result:=to_jsonb(public.worker_fail_premium_report_delivery_before_dispatch(v_cap.id,
        (v_payload->>'authorization_id')::uuid,(v_payload->>'delivery_lease_token')::uuid,v_payload->>'reason'));
      v_next:='consumed';v_terminal:=true;
    when 'worker_mark_premium_report_delivery_reconciliation_required' then
      if v_cap.expected_step<>'delivery_terminal' then raise exception 'phase14_worker_step_out_of_order'; end if;
      v_result:=to_jsonb(public.worker_mark_premium_report_delivery_reconciliation_required(v_cap.id,
        (v_payload->>'authorization_id')::uuid,nullif(v_payload->>'provider_message_id',''),v_payload->>'reason'));
      v_next:='delivery_reconcile';
    when 'worker_cleanup_expired_premium_report_claims' then
      if v_cap.expected_step<>'cleanup_expire' then raise exception 'phase14_worker_step_out_of_order'; end if;
      v_result:=public.worker_cleanup_expired_premium_report_claims(v_cap.id,(v_payload->>'older_than')::interval);
      v_next:='cleanup_claim_jobs';
    when 'claim_phase14_storage_cleanup_jobs' then
      if v_cap.expected_step<>'cleanup_claim_jobs' then raise exception 'phase14_worker_step_out_of_order'; end if;
      v_result:=public.claim_phase14_storage_cleanup_jobs(v_cap.id,(v_payload->>'limit')::integer);
      v_next:='cleanup_settle';
    when 'complete_phase14_storage_cleanup_job' then
      if v_cap.expected_step<>'cleanup_settle' then raise exception 'phase14_worker_step_out_of_order'; end if;
      v_result:=phase14_private.settle_storage_cleanup(v_cap.id,(v_payload->>'cleanup_id')::uuid,
        (v_payload->>'work_lease_token')::uuid,v_payload->>'expected_bucket',v_payload->>'expected_path',
        v_payload->>'expected_checksum',(v_payload->>'deletion_requested')::boolean,
        (v_payload->>'delete_api_accepted')::boolean,v_payload->>'provider_result_class',
        nullif(v_payload->>'error',''));
      v_next:='cleanup_settle';
    when 'renew_phase14_worker_operation' then
      if v_cap.capability_type<>'storage_cleanup' or v_cap.expected_step<>'cleanup_settle' then
        raise exception 'phase14_worker_step_out_of_order'; end if;
      v_result:=jsonb_build_object('renewed',true);
      v_next:='cleanup_expire';
    else raise exception 'phase14_worker_action_unknown:%',v_action;
  end case;

  if v_action<>'claim_phase14_worker_operation' then
    update public.phase14_worker_capabilities set
      status=case when v_terminal then 'consumed' else status end,
      consumed_at=case when v_terminal then clock_timestamp() else consumed_at end,
      lease_owner=case when v_terminal then null else lease_owner end,
      lease_expires_at=case when v_terminal then null else least(expires_at,clock_timestamp()+interval '60 minutes') end,
      lease_generation=lease_generation+1,expected_step=v_next,
      last_heartbeat_at=clock_timestamp(),updated_at=clock_timestamp()
    where id=v_cap.id and status=case when v_terminal and v_action='worker_finalize_premium_report_delivery'
      then 'consumed' else 'leased' end
    returning * into v_cap;
    -- Delivery finalization's legacy internal consumes the capability itself.
    if not found and not (v_terminal and exists(select 1 from public.phase14_worker_capabilities
      where id=v_capability_id and status='consumed')) then
      raise exception 'phase14_worker_step_advance_cas_failed';
    end if;
  end if;
  return jsonb_build_object('result',v_result,'capability_id',v_capability_id,
    'lease_generation',v_cap.lease_generation,'expected_step',v_next,
    'lease_expires_at',v_cap.lease_expires_at,'authority_epoch',v_cap.authority_epoch);
end;
$function$;

create or replace function public.get_phase14_worker_attestation_context(p_capability_id uuid)
returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare v_cap public.phase14_worker_capabilities%rowtype; v_gate public.phase14_security_gates%rowtype;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'phase14_worker_service_role_required'; end if;
  select * into v_cap from public.phase14_worker_capabilities where id=p_capability_id for share;
  if not found or v_cap.status not in ('authorised','leased') or v_cap.expires_at<=clock_timestamp() then
    raise exception 'phase14_worker_capability_context_unavailable';
  end if;
  select * into strict v_gate from public.phase14_security_gates
  where gate_key='phase14-premium-report' for share;
  if v_gate.status<>'satisfied' or v_gate.satisfied_version<>v_gate.required_version
     or v_cap.authority_epoch<>v_gate.authority_epoch then
    raise exception 'phase14_worker_capability_authority_epoch_stale';
  end if;
  perform public.phase14_require_policy(v_cap.policy_key);
  return jsonb_build_object(
    'capability_id',v_cap.id,'capability_type',v_cap.capability_type,
    'operation_key',v_cap.operation_key,'execution_id',coalesce(v_cap.workflow_execution_id,v_cap.operation_key),
    'expected_step',v_cap.expected_step,'lease_generation',v_cap.lease_generation,
    'lease_expires_at',v_cap.lease_expires_at,'expires_at',v_cap.expires_at,
    'authority_epoch',v_cap.authority_epoch,'order_id',v_cap.order_id,
    'assessment_id',v_cap.assessment_id,'score_run_id',v_cap.score_run_id,
    'fulfilment_id',v_cap.fulfilment_id,'report_id',v_cap.report_id,
    'recipient',v_cap.recipient_email
  );
end;
$function$;

-- The caller-authored evidence overload is retained only for migration replay
-- identity and is unreachable by every runtime role.
revoke all on function public.authorize_bounced_report_redelivery(uuid,text,text,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.authorize_bounced_report_redelivery(uuid,uuid,text) to authenticated;
revoke all on function public.create_customer_contact_verification(uuid,text,text,text,integer)
  from public,anon,service_role;
grant execute on function public.create_customer_contact_verification(uuid,text,text,text,integer)
  to authenticated;

do $phase14_revoke_legacy_worker_surface$
declare v record;
begin
  for v in
    select p.oid::regprocedure as signature
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and (
      p.proname like 'worker\_%' escape '\'
      or p.proname in (
        'claim_phase14_worker_operation','renew_phase14_worker_operation',
        'complete_phase14_worker_operation','authorize_phase14_worker_action',
        'claim_premium_report_workflow_start','record_premium_report_workflow_start',
        'claim_phase14_ai_attempt','settle_phase14_ai_attempt',
        'complete_phase14_generation_operation','publish_premium_report_generation',
        'claim_phase14_storage_cleanup_jobs','complete_phase14_storage_cleanup_job'
      )
    )
  loop
    execute format('revoke all on function %s from public,anon,authenticated,service_role',v.signature);
  end loop;
end;
$phase14_revoke_legacy_worker_surface$;

revoke all on function public.transition_premium_report_fulfilment(uuid,uuid,text,text,text,uuid,boolean,text,text)
  from public,anon,service_role;
grant execute on function public.transition_premium_report_fulfilment(uuid,uuid,text,text,text,uuid,boolean,text,text)
  to authenticated;
revoke all on function public.record_premium_report_generation_run(uuid,uuid,jsonb)
  from public,anon,service_role;
grant execute on function public.record_premium_report_generation_run(uuid,uuid,jsonb) to authenticated;
revoke all on function public.execute_phase14_worker_step(jsonb,text,text)
  from public,anon,authenticated,service_role;
revoke all on function public.terminal_phase14_generation_publication(jsonb,text,text)
  from public,anon,authenticated,service_role;
grant execute on function public.execute_phase14_worker_step(jsonb,text,text) to service_role;
grant execute on function public.terminal_phase14_generation_publication(jsonb,text,text) to service_role;
revoke all on function public.get_phase14_worker_attestation_context(uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.get_phase14_worker_attestation_context(uuid) to service_role;
grant select,insert,update,delete on table
  public.audit_logs,public.report_events,public.assessment_events,
  public.email_events,public.email_provider_events to service_role;
revoke truncate on table
  public.audit_logs,public.report_events,public.assessment_events,
  public.email_events,public.email_provider_events from service_role;
revoke all on function public.rotate_phase14_worker_attestation_key(text,text,integer,text)
  from public,anon,service_role;
grant execute on function public.rotate_phase14_worker_attestation_key(text,text,integer,text) to authenticated;

revoke all on all functions in schema phase14_private from public,anon,authenticated,service_role;
revoke all on schema phase14_private from public,anon,authenticated,service_role;

commit;
