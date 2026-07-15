-- Phase 14 fifth adversarial remediation.
-- Forward-only repair layered after the exact migration blob already applied in UAT.
-- Every commercial/runtime policy remains disabled. This migration does not satisfy
-- the Phase 14 gate, provision provider secrets, or enable any production path.

begin;

-- The UAT-applied historical migration ended its transaction before installing the
-- webhook function. Reinstall the final function inside this forward transaction so
-- fresh and UAT-shaped databases converge without changing historical bytes.
do $phase14_historical_atomicity_repair$
begin
  if to_regprocedure('public.apply_email_provider_event_atomic(text,text,text,text,timestamptz,text,jsonb)') is null then
    raise exception 'phase14_historical_webhook_function_missing';
  end if;
end;
$phase14_historical_atomicity_repair$;

-- 1. Exact-version policies. A gate change or suspension invalidates every policy
-- approval and every unconsumed worker operation immediately.
alter table public.phase14_feature_policies
  drop constraint if exists phase14_feature_policies_policy_key_check;

alter table public.phase14_feature_policies
  add constraint phase14_feature_policies_policy_key_check check (policy_key in (
    'manual_generation',
    'automatic_fulfilment',
    'ai_narrative',
    'automatic_email',
    'manual_delivery',
    'manual_download',
    'recipient_override',
    'provider_webhook_ingestion',
    'storage_cleanup'
  )),
  add column approved_gate_version integer check (approved_gate_version is null or approved_gate_version > 0),
  add column approved_at timestamptz;

set local session_replication_role = replica;

update public.phase14_feature_policies
set enabled = false,
    approved_gate_version = null,
    approved_at = null,
    reason = 'Disabled by fifth adversarial remediation pending exact-version approval.',
    updated_at = now();

insert into public.phase14_feature_policies(policy_key, enabled, reason)
values
  ('manual_download', false, 'Disabled by fifth adversarial remediation pending exact-version approval.'),
  ('provider_webhook_ingestion', false, 'Disabled by fifth adversarial remediation pending exact-version approval.')
on conflict (policy_key) do update
set enabled = false,
    approved_gate_version = null,
    approved_at = null,
    reason = excluded.reason,
    updated_at = now();

set local session_replication_role = origin;

create or replace function public.phase14_require_actor(
  p_action text,
  p_allowed_roles public.admin_role[],
  p_require_aal2 boolean default true
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_claims jsonb := coalesce(auth.jwt(), '{}'::jsonb);
  v_user_id uuid := auth.uid();
  v_profile public.admin_profiles%rowtype;
  v_session_id uuid;
  v_exp bigint;
begin
  if v_user_id is null then raise exception 'phase14_no_session:%', p_action; end if;
  v_exp := nullif(v_claims->>'exp', '')::bigint;
  if v_exp is null or to_timestamp(v_exp) <= now() then
    raise exception 'phase14_session_expired:%', p_action;
  end if;
  begin
    v_session_id := nullif(v_claims->>'session_id', '')::uuid;
  exception when others then
    raise exception 'phase14_session_id_invalid:%', p_action;
  end;
  if v_session_id is null then raise exception 'phase14_session_id_required:%', p_action; end if;
  if not exists (
    select 1
    from auth.sessions s
    where s.id = v_session_id
      and s.user_id = v_user_id
      and (s.not_after is null or s.not_after > now())
  ) then
    raise exception 'phase14_session_revoked_or_expired:%', p_action;
  end if;

  select * into v_profile from public.admin_profiles where id = v_user_id;
  if not found then raise exception 'phase14_profile_missing:%', p_action; end if;
  if v_profile.status = 'revoked' then raise exception 'phase14_profile_revoked:%', p_action; end if;
  if v_profile.status <> 'active' then raise exception 'phase14_profile_inactive:%', p_action; end if;
  if not (v_profile.role = any(p_allowed_roles)) then raise exception 'phase14_role_forbidden:%', p_action; end if;
  if p_require_aal2 and coalesce(v_claims->>'aal', 'aal1') <> 'aal2' then
    raise exception 'phase14_aal2_required:%', p_action;
  end if;

  return jsonb_build_object(
    'user_id', v_user_id,
    'role', v_profile.role,
    'aal', coalesce(v_claims->>'aal', 'aal1'),
    'session_id', v_session_id
  );
end;
$function$;

-- 9. Cleanup execution is leased to an opaque capability and every success is
-- independently verified against the exact bucket, path and checksum.
alter table public.phase14_storage_cleanup_queue
  add column deletion_verified_at timestamptz,
  add column dead_lettered_at timestamptz;

alter table public.phase14_storage_cleanup_queue
  drop constraint phase14_storage_cleanup_queue_storage_path_check,
  add constraint phase14_storage_cleanup_queue_storage_path_check check (
    storage_path like 'tmp/%' or storage_path like 'reports/%'
  );

create or replace function public.cleanup_expired_premium_report_claims(
  p_older_than interval default interval '24 hours'
) returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare v_count integer; v_queued integer; v_unresolved integer;
begin
  perform public.phase14_require_security('storage_cleanup',array['platform_admin']::public.admin_role[],true,false);
  if p_older_than < interval '1 hour' or p_older_than > interval '30 days' then
    raise exception 'phase14_cleanup_retention_out_of_range';
  end if;
  with candidates as (
    select * from public.report_generation_claims
    where report_id is null and state in ('claimed','abandoned')
      and lease_expires_at < now()-p_older_than for update
  ), unresolved as (
    select * from candidates where temporary_storage_path is not null
      and coalesce(expected_checksum,'') !~ '^[0-9a-f]{64}$'
  ), alerted as (
    insert into public.phase14_operational_alerts(alert_key,severity,category,detail_json)
    select 'storage-cleanup-unbound:'||claim_token,'critical',
      'storage_cleanup_verification_failed',
      jsonb_build_object('claim_token',claim_token,'bucket',temporary_storage_bucket,
        'path',temporary_storage_path,'reason','expected_checksum_missing')
    from unresolved on conflict(alert_key) do update set status='open',detail_json=excluded.detail_json
    returning 1
  ), queued as (
    insert into public.phase14_storage_cleanup_queue(
      storage_bucket,storage_path,expected_checksum,claim_token,owner_capability_id,cleanup_reason
    ) select temporary_storage_bucket,temporary_storage_path,expected_checksum,claim_token,
        nullif(current_setting('phase14.worker_capability_id',true),'')::uuid,
        'Expired generation claim cleanup'
      from candidates where temporary_storage_bucket is not null
        and temporary_storage_path is not null and expected_checksum ~ '^[0-9a-f]{64}$'
    on conflict(storage_bucket,storage_path) do nothing returning claim_token
  ), deleted as (
    delete from public.report_generation_claims c using candidates x
    where c.claim_token=x.claim_token and (
      x.temporary_storage_path is null or exists(select 1 from queued q where q.claim_token=x.claim_token)
      or exists(select 1 from public.phase14_storage_cleanup_queue q where q.claim_token=x.claim_token)
    ) returning 1
  ) select (select count(*) from deleted),(select count(*) from queued),(select count(*) from unresolved)
    into v_count,v_queued,v_unresolved;
  return jsonb_build_object('deleted_claims',v_count,'queued_cleanup_objects',v_queued,
    'unresolved_checksum_claims',v_unresolved);
end;
$function$;

create or replace function public.worker_cleanup_expired_premium_report_claims(
  p_capability_id uuid,p_older_than interval default interval '24 hours'
) returns jsonb language plpgsql security definer set search_path=''
as $function$
begin
  perform public.phase14_activate_worker_operation(p_capability_id,array['storage_cleanup'],null,null,null,null,null,null);
  return public.cleanup_expired_premium_report_claims(p_older_than);
end;
$function$;

create or replace function public.claim_phase14_storage_cleanup_jobs(
  p_capability_id uuid,p_limit integer default 10
) returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_work_lease uuid:=gen_random_uuid(); v_jobs jsonb;
begin
  if p_limit<1 or p_limit>50 then raise exception 'cleanup_job_limit_out_of_range'; end if;
  perform public.phase14_activate_worker_operation(p_capability_id,array['storage_cleanup'],null,null,null,null,null,null);
  with selected as (
    select id from public.phase14_storage_cleanup_queue
    where ((status in ('pending','failed') and next_attempt_at<=now())
      or (status='leased' and lease_expires_at<=now())) and attempt_count<5
    order by created_at for update skip locked limit p_limit
  ), leased as (
    update public.phase14_storage_cleanup_queue q set status='leased',
      lease_owner_capability_id=p_capability_id,lease_token=v_work_lease,
      lease_expires_at=now()+interval '10 minutes',updated_at=now()
    from selected s where q.id=s.id
    returning q.id,q.storage_bucket,q.storage_path,q.expected_checksum,q.attempt_count
  ) select coalesce(jsonb_agg(to_jsonb(leased)),'[]'::jsonb) into v_jobs from leased;
  return jsonb_build_object('work_lease_token',v_work_lease,'jobs',v_jobs);
end;
$function$;

create or replace function public.complete_phase14_storage_cleanup_job(
  p_capability_id uuid,p_cleanup_id uuid,p_work_lease_token uuid,
  p_expected_bucket text,p_expected_path text,p_expected_checksum text,
  p_deleted boolean,p_deletion_verified boolean,p_error text default null
) returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_queue public.phase14_storage_cleanup_queue%rowtype; v_attempt integer;
begin
  perform public.phase14_activate_worker_operation(p_capability_id,array['storage_cleanup'],null,null,null,null,null,null);
  select * into v_queue from public.phase14_storage_cleanup_queue where id=p_cleanup_id for update;
  if not found or v_queue.status<>'leased' or v_queue.lease_owner_capability_id<>p_capability_id
    or v_queue.lease_token<>p_work_lease_token or v_queue.lease_expires_at<=now() then
    raise exception 'cleanup_job_lease_invalid';
  end if;
  if v_queue.storage_bucket is distinct from p_expected_bucket
     or v_queue.storage_path is distinct from p_expected_path
     or v_queue.expected_checksum is distinct from p_expected_checksum then
    raise exception 'cleanup_job_object_binding_invalid';
  end if;
  if p_deleted and not p_deletion_verified then raise exception 'cleanup_deletion_verification_required'; end if;
  if not p_deleted and coalesce(trim(p_error),'')='' then raise exception 'cleanup_error_required'; end if;
  v_attempt:=v_queue.attempt_count+1;
  update public.phase14_storage_cleanup_queue set
    status=case when p_deleted then 'deleted' when v_attempt>=5 then 'dead_letter' else 'failed' end,
    attempt_count=v_attempt,last_attempt_at=now(),deleted_at=case when p_deleted then now() end,
    deletion_verified_at=case when p_deleted then now() end,
    dead_lettered_at=case when not p_deleted and v_attempt>=5 then now() end,
    last_error=case when p_deleted then null else p_error end,
    next_attempt_at=case when p_deleted then next_attempt_at else now()+make_interval(secs=>least(3600,30*(2^least(v_attempt,7))::integer)) end,
    lease_owner_capability_id=null,lease_token=null,lease_expires_at=null,updated_at=now()
  where id=p_cleanup_id;
  if not p_deleted then
    insert into public.phase14_operational_alerts(alert_key,severity,category,report_id,detail_json)
    values('storage-cleanup:'||p_cleanup_id,case when v_attempt>=5 then 'critical' else 'warning' end,
      'report_temporary_object_cleanup_failed',v_queue.report_id,
      jsonb_build_object('cleanup_id',p_cleanup_id,'capability_id',p_capability_id,
        'work_lease',p_work_lease_token,'bucket',v_queue.storage_bucket,'path',v_queue.storage_path,
        'checksum',v_queue.expected_checksum,'attempt_count',v_attempt,'error',p_error))
    on conflict(alert_key) do update set severity=excluded.severity,detail_json=excluded.detail_json,status='open';
  end if;
  return jsonb_build_object('cleanup_id',p_cleanup_id,'deleted',p_deleted,
    'deletion_verified',p_deletion_verified,'attempt_count',v_attempt,
    'dead_letter',not p_deleted and v_attempt>=5);
end;
$function$;

-- 10. AI routing is separately approved for the exact gate version. Attempt
-- persistence is a database transition and resolved identity must come from
-- gateway/provider response metadata.
create table public.phase14_ai_route_policies(
  requested_provider text primary key,
  enabled boolean not null default false,
  approved_gate_version integer,
  approved_by uuid references public.admin_profiles(id) on delete restrict,
  approved_session_id uuid,
  approved_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint phase14_ai_route_approval_chk check (
    (not enabled) or (approved_gate_version is not null and approved_by is not null
      and approved_session_id is not null and approved_at is not null)
  )
);
insert into public.phase14_ai_route_policies(requested_provider,enabled) values('openai',false);
alter table public.phase14_ai_route_policies enable row level security;
revoke all on public.phase14_ai_route_policies from public,anon,authenticated,service_role;
grant select on public.phase14_ai_route_policies to authenticated,service_role;

create or replace function public.set_phase14_ai_route_policy(p_provider text,p_enabled boolean)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_actor jsonb; v_gate public.phase14_security_gates%rowtype; v_row public.phase14_ai_route_policies%rowtype;
begin
  v_actor:=public.phase14_require_actor('ai_route_policy_change',array['platform_admin']::public.admin_role[],true);
  select * into v_gate from public.phase14_security_gates where gate_key='phase14-premium-report' for share;
  if p_enabled and (v_gate.status<>'satisfied' or v_gate.satisfied_version<>v_gate.required_version) then
    raise exception 'phase14_security_gate_not_satisfied'; end if;
  insert into public.phase14_ai_route_policies(requested_provider,enabled,approved_gate_version,
    approved_by,approved_session_id,approved_at)
  values(lower(trim(p_provider)),p_enabled,case when p_enabled then v_gate.satisfied_version end,
    case when p_enabled then (v_actor->>'user_id')::uuid end,
    case when p_enabled then (v_actor->>'session_id')::uuid end,case when p_enabled then now() end)
  on conflict(requested_provider) do update set enabled=excluded.enabled,
    approved_gate_version=excluded.approved_gate_version,approved_by=excluded.approved_by,
    approved_session_id=excluded.approved_session_id,approved_at=excluded.approved_at,updated_at=now()
  returning * into v_row;
  return to_jsonb(v_row);
end;
$function$;

create or replace function public.claim_phase14_ai_attempt(p_capability_id uuid,p_attempt jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_f public.report_fulfilments%rowtype; v_route public.phase14_ai_route_policies%rowtype;
  v_row public.report_ai_attempts%rowtype; v_n integer;
begin
  select * into v_f from public.report_fulfilments where id=(p_attempt->>'fulfilment_id')::uuid for share;
  if not found then raise exception 'phase14_ai_fulfilment_missing'; end if;
  perform public.phase14_activate_worker_operation(p_capability_id,array['automatic_generation','generation_recovery'],
    v_f.order_id,v_f.assessment_id,v_f.score_run_id,v_f.id,null,null);
  perform public.phase14_require_policy('ai_narrative');
  select * into v_route from public.phase14_ai_route_policies
    where requested_provider=lower(p_attempt->>'requested_provider') for share;
  if not found or not v_route.enabled or v_route.approved_gate_version<>(
    select required_version from public.phase14_security_gates where gate_key='phase14-premium-report'
  ) then raise exception 'phase14_ai_provider_route_disabled'; end if;
  select coalesce(max(attempt_number),0)+1 into v_n from public.report_ai_attempts
   where generation_identity=p_attempt->>'generation_identity'
     and evidence_checksum=p_attempt->>'evidence_checksum'
     and requested_provider=p_attempt->>'requested_provider'
     and requested_model=p_attempt->>'requested_model'
     and prompt_version=p_attempt->>'prompt_version' and schema_version=p_attempt->>'schema_version'
     and attempt_kind=p_attempt->>'attempt_kind';
  if v_n>2 then raise exception 'phase14_ai_attempt_limit_reached'; end if;
  insert into public.report_ai_attempts(generation_identity,fulfilment_id,attempt_kind,attempt_number,
    provider_request_key,provider,model,requested_provider,requested_model,evidence_checksum,
    prompt_version,schema_version,input_size_bytes,estimated_input_tokens,max_output_tokens,
    max_estimated_cost_micros,timeout_ms,status,accounting_status)
  values(p_attempt->>'generation_identity',v_f.id,p_attempt->>'attempt_kind',v_n,
    p_attempt->>'provider_request_key',p_attempt->>'requested_provider',p_attempt->>'requested_model',
    p_attempt->>'requested_provider',p_attempt->>'requested_model',p_attempt->>'evidence_checksum',
    p_attempt->>'prompt_version',p_attempt->>'schema_version',(p_attempt->>'input_size_bytes')::integer,
    (p_attempt->>'estimated_input_tokens')::integer,(p_attempt->>'max_output_tokens')::integer,
    (p_attempt->>'max_estimated_cost_micros')::bigint,(p_attempt->>'timeout_ms')::integer,
    'started','unverified') returning * into v_row;
  return to_jsonb(v_row);
end;
$function$;

create or replace function public.settle_phase14_ai_attempt(p_capability_id uuid,p_attempt_id uuid,p_result jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_row public.report_ai_attempts%rowtype; v_f public.report_fulfilments%rowtype; v_status text;
begin
  select * into v_row from public.report_ai_attempts where id=p_attempt_id for update;
  if not found or v_row.status<>'started' then raise exception 'phase14_ai_attempt_cas_failed'; end if;
  select * into v_f from public.report_fulfilments where id=v_row.fulfilment_id for share;
  perform public.phase14_activate_worker_operation(p_capability_id,array['automatic_generation','generation_recovery'],
    v_f.order_id,v_f.assessment_id,v_f.score_run_id,v_f.id,null,null);
  v_status:=p_result->>'status';
  if v_status in ('succeeded','accounting_unverified') then
    if coalesce(trim(p_result->>'resolved_provider'),'')='' or coalesce(trim(p_result->>'resolved_model'),'')='' then
      raise exception 'phase14_ai_resolved_identity_required'; end if;
    if lower(p_result->>'resolved_provider')<>lower(v_row.requested_provider) then
      raise exception 'phase14_ai_unexpected_provider_route'; end if;
  elsif v_status not in ('failed_before_provider','provider_result_uncertain','reconciliation_required') then
    raise exception 'phase14_ai_result_status_invalid';
  end if;
  update public.report_ai_attempts set status=v_status,output_json=p_result->'output_json',
    resolved_provider=nullif(p_result->>'resolved_provider',''),resolved_model=nullif(p_result->>'resolved_model',''),
    provider=coalesce(nullif(p_result->>'resolved_provider',''),provider),
    model=coalesce(nullif(p_result->>'resolved_model',''),model),
    input_token_count=nullif(p_result->>'input_token_count','')::integer,
    output_token_count=nullif(p_result->>'output_token_count','')::integer,
    total_token_count=nullif(p_result->>'total_token_count','')::integer,
    estimated_cost_micros=nullif(p_result->>'estimated_cost_micros','')::bigint,
    latency_ms=nullif(p_result->>'latency_ms','')::integer,
    accounting_status=coalesce(nullif(p_result->>'accounting_status',''),'unverified'),
    error_message=nullif(p_result->>'error_message',''),completed_at=now(),updated_at=now()
  where id=p_attempt_id and status='started' returning * into v_row;
  if not found then raise exception 'phase14_ai_attempt_cas_failed'; end if;
  return to_jsonb(v_row);
end;
$function$;

create or replace function public.guard_phase14_feature_policy_row_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if current_setting('phase14.authoritative_transition', true) in ('gate_invalidation','migration') then
    if tg_op = 'DELETE' then return old; end if;
    if tg_level = 'STATEMENT' then return null; end if;
    return new;
  end if;
  perform public.phase14_require_actor(
    'feature_policy_table_mutation', array['platform_admin']::public.admin_role[], true
  );
  if tg_op = 'DELETE' then return old; end if;
  if tg_level = 'STATEMENT' then return null; end if;
  return new;
end;
$function$;

create or replace function public.set_phase14_feature_policy(
  p_policy_key text,
  p_enabled boolean,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor jsonb;
  v_policy public.phase14_feature_policies%rowtype;
  v_gate public.phase14_security_gates%rowtype;
begin
  v_actor := public.phase14_require_security(
    'feature_policy_change', array['platform_admin']::public.admin_role[], true, false
  );
  if coalesce(trim(p_reason), '') = '' then raise exception 'phase14_policy_reason_required'; end if;
  select * into v_gate from public.phase14_security_gates
  where gate_key = 'phase14-premium-report' for share;
  if not found or v_gate.status <> 'satisfied' or v_gate.satisfied_version <> v_gate.required_version then
    raise exception 'phase14_policy_gate_not_exact';
  end if;
  perform set_config('phase14.authoritative_transition', 'policy_approval', true);
  update public.phase14_feature_policies
  set enabled = p_enabled,
      required_gate_version = v_gate.required_version,
      approved_gate_version = case when p_enabled then v_gate.satisfied_version else null end,
      approved_at = case when p_enabled then now() else null end,
      updated_by = (v_actor->>'user_id')::uuid,
      reason = p_reason,
      updated_at = now()
  where policy_key = p_policy_key
  returning * into v_policy;
  if not found then raise exception 'phase14_policy_not_supported:%', p_policy_key; end if;
  insert into public.audit_logs(actor_type, actor_user_id, entity_table, action, after_json)
  values ('admin', (v_actor->>'user_id')::uuid, 'phase14_feature_policies',
    'phase14_feature_policy_changed',
    jsonb_build_object('policy_key', p_policy_key, 'enabled', p_enabled,
      'approved_gate_version', v_policy.approved_gate_version, 'reason', p_reason));
  return to_jsonb(v_policy);
end;
$function$;

create or replace function public.set_phase14_security_gate_version(
  p_satisfied_version integer,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor jsonb;
  v_gate public.phase14_security_gates%rowtype;
begin
  v_actor := public.phase14_require_actor(
    'security_gate_administration',array['platform_admin']::public.admin_role[],true
  );
  if coalesce(trim(p_reason),'')='' then raise exception 'phase14_gate_reason_required'; end if;
  if p_satisfied_version < 0 then raise exception 'phase14_gate_version_invalid'; end if;
  perform set_config('phase14.authoritative_transition','gate_administration',true);
  update public.phase14_security_gates
  set satisfied_version=p_satisfied_version,
      status=case when p_satisfied_version>=required_version then 'satisfied' else 'unsatisfied' end,
      satisfied_by=(v_actor->>'user_id')::uuid,
      satisfied_at=case when p_satisfied_version>=required_version then now() else null end,
      reason=p_reason,updated_at=now()
  where gate_key='phase14-premium-report'
  returning * into v_gate;
  if not found then raise exception 'phase14_security_gate_missing'; end if;
  insert into public.audit_logs(actor_type,actor_user_id,entity_table,action,after_json)
  values ('admin',(v_actor->>'user_id')::uuid,'phase14_security_gates',
    'phase14_security_gate_changed',jsonb_build_object(
      'required_version',v_gate.required_version,
      'satisfied_version',v_gate.satisfied_version,
      'status',v_gate.status,'reason',p_reason
    ));
  return to_jsonb(v_gate);
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
  if not found or v_gate.status <> 'satisfied'
     or v_gate.satisfied_version <> v_gate.required_version then
    raise exception 'phase14_security_gate_unsatisfied:%', p_policy_key;
  end if;
  select * into v_policy from public.phase14_feature_policies
  where policy_key = p_policy_key for share;
  if not found or not v_policy.enabled then raise exception 'phase14_policy_disabled:%', p_policy_key; end if;
  if v_policy.approved_gate_version is null
     or v_policy.approved_gate_version <> v_gate.satisfied_version
     or v_policy.required_gate_version <> v_gate.required_version then
    raise exception 'phase14_policy_gate_version_stale:%', p_policy_key;
  end if;
  return jsonb_build_object('policy_key', v_policy.policy_key,
    'gate_version', v_gate.satisfied_version, 'approved_at', v_policy.approved_at);
end;
$function$;

create or replace function public.invalidate_phase14_authority_on_gate_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if old.required_version is distinct from new.required_version
     or old.satisfied_version is distinct from new.satisfied_version
     or old.status is distinct from new.status then
    perform set_config('phase14.authoritative_transition', 'gate_invalidation', true);
    update public.phase14_feature_policies
    set enabled = false,
        approved_gate_version = null,
        approved_at = null,
        reason = 'Automatically disabled because the Phase 14 gate changed or was suspended.',
        updated_at = now();
    update public.phase14_worker_capabilities
    set status = 'revoked',
        revoked_at = now(),
        revoked_reason = 'Phase 14 gate changed or was suspended.',
        lease_secret_hash = null,
        lease_expires_at = null,
        updated_at = now()
    where status in ('authorised','leased');
  end if;
  return new;
end;
$function$;

drop trigger if exists trg_phase14_gate_invalidate_authority on public.phase14_security_gates;
create trigger trg_phase14_gate_invalidate_authority
  after update of required_version, satisfied_version, status on public.phase14_security_gates
  for each row execute function public.invalidate_phase14_authority_on_gate_change();

create or replace function public.suspend_phase14_security_gate(p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare v_actor jsonb; v_gate public.phase14_security_gates%rowtype;
begin
  v_actor := public.phase14_require_actor(
    'security_gate_suspension', array['platform_admin']::public.admin_role[], true
  );
  if coalesce(trim(p_reason), '') = '' then raise exception 'phase14_gate_reason_required'; end if;
  perform set_config('phase14.authoritative_transition', 'gate_administration', true);
  update public.phase14_security_gates
  set status = 'suspended', satisfied_version = 0, satisfied_by = null,
      satisfied_at = null, reason = p_reason, updated_at = now()
  where gate_key = 'phase14-premium-report'
  returning * into v_gate;
  insert into public.audit_logs(actor_type, actor_user_id, entity_table, action, after_json)
  values ('admin', (v_actor->>'user_id')::uuid, 'phase14_security_gates',
    'phase14_security_gate_suspended', jsonb_build_object('reason', p_reason));
  return to_jsonb(v_gate);
end;
$function$;

-- 2. Opaque worker-operation broker. The durable workflow carries only UUIDs;
-- issue secrets and lease tokens are no longer returned or accepted.
alter table public.phase14_worker_capabilities
  add column lease_owner text,
  add column lease_generation integer not null default 0 check (lease_generation >= 0),
  add column last_heartbeat_at timestamptz,
  add column takeover_count integer not null default 0 check (takeover_count >= 0);

alter table public.phase14_worker_capabilities
  drop constraint if exists phase14_worker_capability_lease_chk;
alter table public.phase14_worker_capabilities
  add constraint phase14_worker_capability_lease_chk check (
    (status = 'leased' and lease_owner is not null and lease_expires_at is not null)
    or status <> 'leased'
  );

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
  v_capability public.phase14_worker_capabilities%rowtype;
  v_order public.orders%rowtype; v_fulfilment public.report_fulfilments%rowtype;
begin
  v_actor := public.phase14_require_security(
    'worker_capability_authorization', array['platform_admin']::public.admin_role[], true, false
  );
  if p_expires_in_seconds < 300 or p_expires_in_seconds > 86400 then
    raise exception 'phase14_worker_capability_expiry_out_of_range';
  end if;
  if coalesce(trim(p_operation_key), '') = '' then raise exception 'phase14_worker_operation_key_required'; end if;
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
  select * into v_gate from public.phase14_security_gates
  where gate_key = 'phase14-premium-report' for share;
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
    if not found or v_order.assessment_id <> p_assessment_id then
      raise exception 'worker_capability_order_binding_invalid';
    end if;
    perform public.phase14_generation_entitlement(
      v_order.order_reference, p_order_id, p_assessment_id, p_score_run_id, null
    );
  end if;
  if p_fulfilment_id is not null then
    select * into v_fulfilment from public.report_fulfilments where id = p_fulfilment_id for share;
    if not found or v_fulfilment.order_id <> p_order_id
       or v_fulfilment.assessment_id <> p_assessment_id
       or v_fulfilment.score_run_id <> p_score_run_id then
      raise exception 'worker_capability_fulfilment_binding_invalid';
    end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'phase14-capability:' || p_capability_type || ':' || p_operation_key, 0
  ));
  update public.phase14_worker_capabilities
  set status = 'expired', updated_at = now()
  where capability_type = p_capability_type and operation_key = p_operation_key
    and status in ('authorised','leased') and expires_at <= now();
  if exists (select 1 from public.phase14_worker_capabilities
    where capability_type = p_capability_type and operation_key = p_operation_key
      and status in ('authorised','leased')) then
    raise exception 'phase14_worker_capability_already_active';
  end if;
  perform set_config('phase14.authoritative_transition', 'worker_authorization', true);
  insert into public.phase14_worker_capabilities(
    capability_type, policy_key, operation_key, issue_secret_hash,
    order_id, assessment_id, score_run_id, fulfilment_id, report_id, recipient_email,
    security_gate_version, authorised_by, authorised_session_id, reason, expires_at
  ) values (
    p_capability_type, v_policy_key, p_operation_key,
    encode(extensions.digest(extensions.gen_random_bytes(32), 'sha256'), 'hex'),
    p_order_id, p_assessment_id, p_score_run_id, p_fulfilment_id, p_report_id,
    nullif(lower(trim(p_recipient)), ''), v_gate.satisfied_version,
    (v_actor->>'user_id')::uuid, (v_actor->>'session_id')::uuid,
    p_reason, now() + make_interval(secs => p_expires_in_seconds)
  ) returning * into v_capability;
  if p_fulfilment_id is not null then
    update public.report_fulfilments
    set generation_capability_id = case
          when p_capability_type in ('automatic_generation','generation_recovery') then v_capability.id
          else generation_capability_id end,
        delivery_capability_id = case
          when p_capability_type in ('automatic_delivery','delivery_reconciliation') then v_capability.id
          else delivery_capability_id end,
        updated_at = now()
    where id = p_fulfilment_id;
  end if;
  insert into public.audit_logs(actor_type, actor_user_id, assessment_id,
    entity_table, entity_id, action, after_json)
  values ('admin', (v_actor->>'user_id')::uuid, p_assessment_id,
    'phase14_worker_capabilities', v_capability.id,
    'phase14_worker_capability_authorized',
    jsonb_build_object('capability_type', p_capability_type,
      'operation_key', p_operation_key, 'policy_key', v_policy_key,
      'expires_at', v_capability.expires_at, 'opaque_identifier_only', true));
  return jsonb_build_object(
    'capability_id', v_capability.id,
    'capability_type', v_capability.capability_type,
    'operation_key', v_capability.operation_key,
    'expires_at', v_capability.expires_at,
    'security_gate_version', v_capability.security_gate_version
  );
end;
$function$;

create or replace function public.claim_phase14_worker_operation(
  p_capability_id uuid,
  p_lease_owner text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_cap public.phase14_worker_capabilities%rowtype;
  v_gate public.phase14_security_gates%rowtype;
  v_takeover boolean := false;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'phase14_worker_service_role_required';
  end if;
  if coalesce(trim(p_lease_owner), '') = '' or length(p_lease_owner) > 200 then
    raise exception 'phase14_worker_lease_owner_invalid';
  end if;
  select * into v_cap from public.phase14_worker_capabilities
  where id = p_capability_id for update;
  if not found then raise exception 'phase14_worker_capability_missing'; end if;
  if v_cap.expires_at <= now() then
    update public.phase14_worker_capabilities
    set status = 'expired', lease_owner = null, lease_expires_at = null, updated_at = now()
    where id = v_cap.id;
    raise exception 'phase14_worker_capability_expired';
  end if;
  if v_cap.status = 'leased' and v_cap.lease_expires_at > now()
     and v_cap.lease_owner <> p_lease_owner then
    raise exception 'phase14_worker_capability_already_leased';
  end if;
  if v_cap.status = 'leased' and v_cap.lease_expires_at <= now() then
    v_takeover := true;
  elsif v_cap.status not in ('authorised','leased') then
    raise exception 'phase14_worker_capability_not_claimable:%', v_cap.status;
  end if;
  select * into v_gate from public.phase14_security_gates
  where gate_key = 'phase14-premium-report' for share;
  if not found or v_gate.status <> 'satisfied'
     or v_gate.satisfied_version <> v_gate.required_version
     or v_gate.satisfied_version <> v_cap.security_gate_version then
    raise exception 'phase14_worker_capability_gate_changed';
  end if;
  perform public.phase14_require_policy(v_cap.policy_key);
  perform set_config('phase14.authoritative_transition', 'worker_claim', true);
  update public.phase14_worker_capabilities
  set status = 'leased', lease_owner = p_lease_owner,
      lease_secret_hash = null,
      lease_expires_at = least(expires_at, now() + interval '60 minutes'),
      lease_generation = lease_generation + 1,
      takeover_count = takeover_count + case when v_takeover then 1 else 0 end,
      claimed_at = coalesce(claimed_at, now()), last_heartbeat_at = now(), updated_at = now()
  where id = v_cap.id
  returning * into v_cap;
  return jsonb_build_object(
    'capability_id', v_cap.id, 'capability_type', v_cap.capability_type,
    'operation_key', v_cap.operation_key, 'lease_owner', v_cap.lease_owner,
    'lease_generation', v_cap.lease_generation,
    'lease_expires_at', v_cap.lease_expires_at, 'takeover', v_takeover
  );
end;
$function$;

create or replace function public.renew_phase14_worker_operation(
  p_capability_id uuid,
  p_lease_owner text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare v_cap public.phase14_worker_capabilities%rowtype;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'phase14_worker_service_role_required';
  end if;
  select * into v_cap from public.phase14_worker_capabilities
  where id = p_capability_id for update;
  if not found or v_cap.status <> 'leased' or v_cap.lease_owner <> p_lease_owner
     or v_cap.lease_expires_at <= now() or v_cap.expires_at <= now() then
    raise exception 'phase14_worker_operation_renewal_invalid';
  end if;
  perform public.phase14_require_policy(v_cap.policy_key);
  update public.phase14_worker_capabilities
  set lease_expires_at = least(expires_at, now() + interval '60 minutes'),
      last_heartbeat_at = now(), updated_at = now()
  where id = v_cap.id returning * into v_cap;
  return jsonb_build_object('capability_id', v_cap.id,
    'lease_generation', v_cap.lease_generation,
    'lease_expires_at', v_cap.lease_expires_at);
end;
$function$;

create or replace function public.phase14_activate_worker_operation(
  p_capability_id uuid,
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
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'phase14_worker_service_role_required';
  end if;
  select * into v_cap from public.phase14_worker_capabilities
  where id = p_capability_id for share;
  if not found or v_cap.status <> 'leased' then
    raise exception 'phase14_worker_capability_not_leased';
  end if;
  if not (v_cap.capability_type = any(p_expected_types)) then
    raise exception 'phase14_worker_capability_type_mismatch';
  end if;
  if v_cap.expires_at <= now() or v_cap.lease_expires_at <= now() then
    raise exception 'phase14_worker_capability_lease_expired';
  end if;
  select * into v_gate from public.phase14_security_gates
  where gate_key = 'phase14-premium-report' for share;
  if not found or v_gate.status <> 'satisfied'
     or v_gate.satisfied_version <> v_gate.required_version
     or v_gate.satisfied_version <> v_cap.security_gate_version then
    raise exception 'phase14_worker_capability_gate_changed';
  end if;
  perform public.phase14_require_policy(v_cap.policy_key);
  if v_cap.order_id is not null and v_cap.order_id is distinct from p_order_id then
    raise exception 'worker_capability_order_mismatch'; end if;
  if v_cap.assessment_id is not null and v_cap.assessment_id is distinct from p_assessment_id then
    raise exception 'worker_capability_assessment_mismatch'; end if;
  if v_cap.score_run_id is not null and v_cap.score_run_id is distinct from p_score_run_id then
    raise exception 'worker_capability_score_run_mismatch'; end if;
  if v_cap.fulfilment_id is not null and v_cap.fulfilment_id is distinct from p_fulfilment_id then
    raise exception 'worker_capability_fulfilment_mismatch'; end if;
  if v_cap.report_id is not null and v_cap.report_id is distinct from p_report_id then
    raise exception 'worker_capability_report_mismatch'; end if;
  if v_cap.recipient_email is not null
     and lower(trim(p_recipient)) is distinct from lower(v_cap.recipient_email::text) then
    raise exception 'worker_capability_recipient_mismatch';
  end if;
  perform set_config('phase14.worker_capability_id', v_cap.id::text, true);
  perform set_config('phase14.worker_capability_type', v_cap.capability_type, true);
  perform set_config('phase14.authoritative_transition', 'worker_rpc', true);
  return to_jsonb(v_cap) - 'issue_secret_hash' - 'lease_secret_hash';
end;
$function$;

create or replace function public.authorize_phase14_worker_action(
  p_capability_id uuid,
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
  perform public.phase14_activate_worker_operation(
    p_capability_id, array[v_cap.capability_type], v_cap.order_id, v_cap.assessment_id,
    v_cap.score_run_id, v_cap.fulfilment_id, v_cap.report_id, v_cap.recipient_email::text
  );
  return public.phase14_require_security(
    p_action, array['platform_admin']::public.admin_role[], true, false
  );
end;
$function$;

create or replace function public.complete_phase14_worker_operation(p_capability_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare v_cap public.phase14_worker_capabilities%rowtype;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'phase14_worker_service_role_required';
  end if;
  select * into v_cap from public.phase14_worker_capabilities
  where id = p_capability_id for update;
  if not found or v_cap.status <> 'leased' or v_cap.lease_expires_at <= now() then
    raise exception 'phase14_worker_capability_completion_invalid';
  end if;
  perform public.phase14_require_policy(v_cap.policy_key);
  perform set_config('phase14.authoritative_transition', 'worker_completion', true);
  update public.phase14_worker_capabilities
  set status = 'consumed', consumed_at = now(), lease_owner = null,
      lease_secret_hash = null, lease_expires_at = null,
      last_heartbeat_at = now(), updated_at = now()
  where id = v_cap.id and status = 'leased';
  if not found then raise exception 'phase14_worker_capability_completion_cas_failed'; end if;
  return true;
end;
$function$;

-- All authorised paths mark their transaction before touching authoritative or
-- shared Phase 14 rows. A generic service-role request has no such context.
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
  if not found or v_gate.status <> 'satisfied'
     or v_gate.satisfied_version <> v_gate.required_version then
    raise exception 'phase14_security_gate_unsatisfied:%', p_action;
  end if;
  if coalesce(auth.jwt()->>'role','') = 'service_role' then
    if p_action = 'webhook_mutation'
       and current_setting('phase14.authoritative_transition', true) = 'trusted_provider_attestation' then
      return jsonb_build_object('actor_type','trusted_provider_attestation',
        'gate_version',v_gate.satisfied_version,'action',p_action);
    end if;
    begin
      v_capability_id := nullif(current_setting('phase14.worker_capability_id', true), '')::uuid;
      v_capability_type := nullif(current_setting('phase14.worker_capability_type', true), '');
    exception when others then
      raise exception 'phase14_worker_context_missing:%', p_action;
    end;
    if v_capability_id is null or v_capability_type is null then
      raise exception 'phase14_worker_context_missing:%', p_action;
    end if;
    select * into v_cap from public.phase14_worker_capabilities
    where id = v_capability_id for share;
    if not found or v_cap.status <> 'leased' or v_cap.lease_expires_at <= now()
       or v_cap.security_gate_version <> v_gate.satisfied_version then
      raise exception 'phase14_worker_context_invalid:%', p_action;
    end if;
    if not (
      (v_capability_type in ('automatic_generation','generation_recovery')
        and p_action in ('report_generation','report_regeneration','ai_narrative_generation'))
      or (v_capability_type = 'automatic_delivery'
        and p_action in ('email_delivery','automatic_delivery','delivery_finalization'))
      or (v_capability_type = 'delivery_reconciliation'
        and p_action in ('provider_reconciliation','delivery_finalization','automatic_delivery'))
      or (v_capability_type = 'storage_cleanup' and p_action = 'storage_cleanup')
    ) then raise exception 'phase14_worker_action_forbidden:%', p_action; end if;
    perform public.phase14_require_policy(v_cap.policy_key);
    perform set_config('phase14.authoritative_transition', 'worker_rpc', true);
    return jsonb_build_object('actor_type','worker','capability_id',v_cap.id,
      'capability_type',v_cap.capability_type,'gate_version',v_gate.satisfied_version,
      'action',p_action);
  end if;
  v_actor := public.phase14_require_actor(p_action, p_allowed_roles, p_require_aal2);
  v_policy_key := case
    when p_action in ('report_generation','report_regeneration') then 'manual_generation'
    when p_action = 'ai_narrative_generation' then 'ai_narrative'
    when p_action in ('email_delivery','email_resend','provider_reconciliation',
      'delivery_finalization','automatic_delivery') then 'manual_delivery'
    when p_action = 'report_download' then 'manual_download'
    else null end;
  if v_policy_key is not null then perform public.phase14_require_policy(v_policy_key); end if;
  perform set_config('phase14.authoritative_transition', 'authenticated_rpc', true);
  return v_actor || jsonb_build_object('gate_version',v_gate.satisfied_version,'action',p_action);
end;
$function$;

-- 3. Shared-table mutation guards. Only an RPC that established a transaction-
-- local authoritative context may mutate a Phase 14-owned row.
create or replace function public.guard_phase14_authoritative_mutation()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_protected boolean := false;
  v_context text := nullif(current_setting('phase14.authoritative_transition', true), '');
begin
  v_protected := case tg_table_name
    when 'audit_logs' then
      coalesce(v_row->>'action','') ~ '^(phase14_|premium_report_|report_(generated|regenerated|download_))'
      or coalesce(v_row->>'entity_table','') in (
        'phase14_security_gates','phase14_feature_policies','phase14_worker_capabilities',
        'report_fulfilments','report_generation_runs','report_ai_attempts',
        'report_generation_claims','report_delivery_authorizations',
        'report_delivery_finalizations','report_delivery_remediations'
      )
    when 'report_events' then coalesce(v_row->>'event_type','') in (
      'generated','regenerated','email_sent','email_test_sent','download_requested'
    )
    when 'assessment_events' then coalesce(v_row->>'event_type','') in (
      'report_generated','admin_report_downloaded','report_emailed_to_customer'
    )
    when 'email_events' then
      coalesce(v_row->>'notification_type','') = 'premium_report_pdf'
      or coalesce(v_row->>'provider_request_key','') <> ''
    when 'email_provider_events' then true
    when 'phase14_operational_alerts' then true
    else false
  end;
  if v_protected and coalesce(v_context,'') not in (
    'authenticated_rpc','fulfilment_queue_rpc','fulfilment_transition_rpc',
    'gate_administration','gate_invalidation','migration','operational_alert_rpc',
    'policy_approval','runtime_secret_rotation','trusted_provider_attestation',
    'worker_authorization','worker_claim','worker_completion','worker_rpc'
  ) then
    raise exception 'phase14_authoritative_rpc_required:%:%', tg_table_name, tg_op;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

do $phase14_shared_guards$
declare v_table text;
begin
  foreach v_table in array array[
    'audit_logs','report_events','assessment_events','email_events',
    'email_provider_events','phase14_operational_alerts'
  ] loop
    execute format('drop trigger if exists trg_phase14_authoritative_mutation on public.%I', v_table);
    execute format(
      'create trigger trg_phase14_authoritative_mutation before insert or update or delete on public.%I for each row execute function public.guard_phase14_authoritative_mutation()',
      v_table
    );
  end loop;
end;
$phase14_shared_guards$;

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
as $function$
declare v_id uuid;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'phase14_service_role_required';
  end if;
  if coalesce(trim(p_alert_key),'') = '' or length(p_alert_key) > 300 then
    raise exception 'phase14_alert_key_invalid';
  end if;
  if p_category not in (
    'report_download_object_missing','report_download_object_size_invalid',
    'report_download_checksum_mismatch','report_email_checksum_mismatch',
    'report_temporary_object_cleanup_failed','storage_cleanup_verification_failed'
  ) then raise exception 'phase14_alert_category_invalid'; end if;
  if p_severity not in ('warning','critical') then raise exception 'phase14_alert_severity_invalid'; end if;
  perform set_config('phase14.authoritative_transition', 'operational_alert_rpc', true);
  insert into public.phase14_operational_alerts(
    alert_key,severity,category,report_id,email_event_id,detail_json,status
  ) values (
    p_alert_key,p_severity,p_category,p_report_id,p_email_event_id,
    coalesce(p_detail_json,'{}'::jsonb),'open'
  ) on conflict (alert_key) do update
  set severity = excluded.severity, detail_json = excluded.detail_json, status = 'open'
  returning id into v_id;
  return v_id;
end;
$function$;

-- 4. Fulfilment, workflow-start, provenance, and shared-event transitions are
-- explicit RPCs. No application code needs direct DML on authoritative tables.
create or replace function public.queue_premium_report_fulfilment(
  p_order_reference text,
  p_trigger_source text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor jsonb; v_context jsonb; v_order public.orders%rowtype;
  v_fulfilment public.report_fulfilments%rowtype; v_key text; v_created boolean := false;
begin
  v_actor := public.phase14_require_security(
    'automatic_fulfilment_request', array['platform_admin']::public.admin_role[], true, false
  );
  perform public.phase14_require_policy('automatic_fulfilment');
  if p_trigger_source not in ('payment_confirmation','admin_generate','admin_retry','admin_regenerate') then
    raise exception 'phase14_fulfilment_trigger_invalid';
  end if;
  v_context := public.phase14_generation_entitlement(p_order_reference);
  select * into v_order from public.orders where id = (v_context->>'order_id')::uuid for share;
  v_key := 'premium-report:' || (v_context->>'order_id') || ':' || (v_context->>'score_run_id');
  perform pg_advisory_xact_lock(hashtextextended(v_key, 0));
  select * into v_fulfilment from public.report_fulfilments
  where idempotency_key = v_key for update;
  if not found then
    perform set_config('phase14.authoritative_transition', 'fulfilment_queue_rpc', true);
    insert into public.report_fulfilments(
      order_id,assessment_id,score_run_id,idempotency_key,trigger_source,status,
      current_step,requested_by_admin_user_id
    ) values (
      (v_context->>'order_id')::uuid,(v_context->>'assessment_id')::uuid,
      (v_context->>'score_run_id')::uuid,v_key,p_trigger_source,'queued',
      'claim_fulfilment',(v_actor->>'user_id')::uuid
    ) returning * into v_fulfilment;
    v_created := true;
    insert into public.order_events(order_id,event_type,note,actor_admin_user_id,metadata_json)
    values (v_fulfilment.order_id,'premium_report_fulfilment_queued',
      'Autonomous premium-report fulfilment queued.',(v_actor->>'user_id')::uuid,
      jsonb_build_object('fulfilment_id',v_fulfilment.id,'trigger_source',p_trigger_source,
        'idempotency_key',v_key));
    insert into public.audit_logs(actor_type,actor_user_id,assessment_id,
      entity_table,entity_id,action,after_json)
    values ('admin',(v_actor->>'user_id')::uuid,v_fulfilment.assessment_id,
      'report_fulfilments',v_fulfilment.id,'premium_report_fulfilment_queued',
      jsonb_build_object('order_reference',p_order_reference,'trigger_source',p_trigger_source,
        'score_run_id',v_fulfilment.score_run_id));
  end if;
  return jsonb_build_object(
    'created',v_created,'fulfilment',to_jsonb(v_fulfilment),
    'context',jsonb_build_object('order_id',v_fulfilment.order_id,
      'assessment_id',v_fulfilment.assessment_id,'score_run_id',v_fulfilment.score_run_id,
      'recipient',lower(v_order.customer_email::text))
  );
end;
$function$;

create or replace function public.transition_premium_report_fulfilment(
  p_capability_id uuid,
  p_fulfilment_id uuid,
  p_status text,
  p_current_step text,
  p_generation_mode text default null,
  p_report_id uuid default null,
  p_increment_attempt boolean default false,
  p_error_code text default null,
  p_error_message text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare v_row public.report_fulfilments%rowtype; v_allowed boolean := false; v_now timestamptz := now();
begin
  select * into v_row from public.report_fulfilments where id = p_fulfilment_id for update;
  if not found then raise exception 'phase14_fulfilment_missing'; end if;
  if p_capability_id is not null then
    perform public.phase14_activate_worker_operation(
      p_capability_id,array['automatic_generation','generation_recovery','automatic_delivery'],
      v_row.order_id,v_row.assessment_id,v_row.score_run_id,v_row.id,
      case when p_status = 'completed' then coalesce(p_report_id,v_row.report_id) else null end,
      null
    );
  else
    perform public.phase14_require_security(
      'report_generation',array['platform_admin','reviewer','approver']::public.admin_role[],true,false
    );
  end if;
  if coalesce(trim(p_current_step),'') = '' then raise exception 'phase14_fulfilment_step_required'; end if;
  if p_generation_mode is not null and p_generation_mode not in ('ai','ai_repair','deterministic_fallback') then
    raise exception 'phase14_fulfilment_generation_mode_invalid';
  end if;
  v_allowed := p_status = v_row.status or case v_row.status
    when 'queued' then p_status in ('assembling','failed','cancelled')
    when 'assembling' then p_status in ('generating','validating','failed')
    when 'generating' then p_status in ('validating','rendering','failed')
    when 'validating' then p_status in ('rendering','failed')
    when 'rendering' then p_status in ('storing','failed')
    when 'storing' then p_status in ('ready_for_delivery','failed')
    when 'ready_for_delivery' then p_status in ('completed','failed')
    when 'failed' then p_status in ('assembling','failed')
    else false end;
  if not v_allowed then raise exception 'phase14_fulfilment_transition_invalid:%->%',v_row.status,p_status; end if;
  if p_report_id is not null and not exists (
    select 1 from public.reports r where r.id = p_report_id
      and r.order_id = v_row.order_id and r.assessment_id = v_row.assessment_id
      and r.score_run_id = v_row.score_run_id
  ) then raise exception 'phase14_fulfilment_report_binding_invalid'; end if;
  perform set_config('phase14.authoritative_transition', 'fulfilment_transition_rpc', true);
  update public.report_fulfilments
  set status = p_status, current_step = p_current_step,
      generation_mode = coalesce(p_generation_mode,generation_mode),
      report_id = coalesce(p_report_id,report_id),
      attempt_count = attempt_count + case when p_increment_attempt then 1 else 0 end,
      last_error_code = p_error_code, last_error_message = p_error_message,
      started_at = case when p_status='assembling' then coalesce(started_at,v_now) else started_at end,
      completed_at = case when p_status='completed' then coalesce(completed_at,v_now) else completed_at end,
      failed_at = case when p_status='failed' then v_now else failed_at end,
      updated_at = v_now
  where id = p_fulfilment_id and status = v_row.status
  returning * into v_row;
  if not found then raise exception 'phase14_fulfilment_transition_cas_failed'; end if;
  return to_jsonb(v_row);
end;
$function$;

create or replace function public.claim_premium_report_workflow_start(
  p_capability_id uuid,
  p_fulfilment_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare v_row public.report_fulfilments%rowtype;
begin
  select * into v_row from public.report_fulfilments where id=p_fulfilment_id for update;
  if not found then raise exception 'phase14_fulfilment_missing'; end if;
  perform public.phase14_activate_worker_operation(
    p_capability_id,array['automatic_generation','generation_recovery'],
    v_row.order_id,v_row.assessment_id,v_row.score_run_id,v_row.id,null,null
  );
  if v_row.workflow_run_id is not null or v_row.workflow_start_status='started' then
    return jsonb_build_object('claimed',false,'workflow_run_id',v_row.workflow_run_id,
      'workflow_start_status',v_row.workflow_start_status);
  end if;
  if v_row.workflow_start_status='starting' then
    return jsonb_build_object('claimed',false,'workflow_run_id',null,
      'workflow_start_status','starting');
  end if;
  update public.report_fulfilments
  set workflow_start_status='starting',workflow_start_error=null,updated_at=now()
  where id=v_row.id and workflow_start_status in ('not_started','failed')
  returning * into v_row;
  if not found then raise exception 'phase14_workflow_start_claim_cas_failed'; end if;
  return jsonb_build_object('claimed',true,'workflow_start_status','starting');
end;
$function$;

create or replace function public.record_premium_report_workflow_start(
  p_capability_id uuid,
  p_fulfilment_id uuid,
  p_started boolean,
  p_workflow_run_id text default null,
  p_error text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare v_row public.report_fulfilments%rowtype;
begin
  select * into v_row from public.report_fulfilments where id=p_fulfilment_id for update;
  if not found then raise exception 'phase14_fulfilment_missing'; end if;
  perform public.phase14_activate_worker_operation(
    p_capability_id,array['automatic_generation','generation_recovery'],
    v_row.order_id,v_row.assessment_id,v_row.score_run_id,v_row.id,null,null
  );
  if p_started and coalesce(trim(p_workflow_run_id),'')='' then raise exception 'phase14_workflow_run_id_required'; end if;
  if not p_started and coalesce(trim(p_error),'')='' then raise exception 'phase14_workflow_start_error_required'; end if;
  update public.report_fulfilments
  set workflow_start_status=case when p_started then 'started' else 'failed' end,
      workflow_run_id=case when p_started then p_workflow_run_id else workflow_run_id end,
      workflow_started_at=case when p_started then coalesce(workflow_started_at,now()) else workflow_started_at end,
      workflow_start_error=case when p_started then null else p_error end,
      last_error_code=case when p_started then last_error_code else 'workflow_start_failed' end,
      last_error_message=case when p_started then last_error_message else p_error end,
      updated_at=now()
  where id=v_row.id and workflow_start_status='starting'
  returning * into v_row;
  if not found then
    if p_started and v_row.workflow_start_status='started' and v_row.workflow_run_id=p_workflow_run_id then
      return to_jsonb(v_row) || jsonb_build_object('idempotent_replay',true);
    end if;
    raise exception 'phase14_workflow_start_record_cas_failed';
  end if;
  return to_jsonb(v_row) || jsonb_build_object('idempotent_replay',false);
end;
$function$;

create or replace function public.record_premium_report_generation_run(
  p_capability_id uuid,
  p_fulfilment_id uuid,
  p_run jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare v_f public.report_fulfilments%rowtype; v_id uuid; v_attempt integer;
begin
  select * into v_f from public.report_fulfilments where id=p_fulfilment_id for update;
  if not found then raise exception 'phase14_fulfilment_missing'; end if;
  if p_capability_id is not null then
    perform public.phase14_activate_worker_operation(
      p_capability_id,array['automatic_generation','generation_recovery'],
      v_f.order_id,v_f.assessment_id,v_f.score_run_id,v_f.id,null,null
    );
  else
    perform public.phase14_require_security(
      'report_generation',array['platform_admin','reviewer','approver']::public.admin_role[],true,false
    );
  end if;
  select id into v_id from public.report_generation_runs
  where fulfilment_id=p_fulfilment_id and status='used' limit 1;
  if v_id is not null then return v_id; end if;
  select coalesce(max(attempt_number),0)+1 into v_attempt
  from public.report_generation_runs where fulfilment_id=p_fulfilment_id;
  insert into public.report_generation_runs(
    fulfilment_id,attempt_number,generation_mode,provider,model,requested_provider,
    requested_model,resolved_provider,resolved_model,prompt_version,schema_version,
    evidence_checksum,evidence_snapshot_json,structured_output_json,
    validation_result_json,validation_errors_json,input_token_count,output_token_count,
    total_token_count,estimated_cost_micros,accounting_status,latency_ms,status,
    error_code,error_message,completed_at
  ) values (
    p_fulfilment_id,v_attempt,p_run->>'generation_mode',nullif(p_run->>'provider',''),
    nullif(p_run->>'model',''),nullif(p_run->>'requested_provider',''),
    nullif(p_run->>'requested_model',''),nullif(p_run->>'resolved_provider',''),
    nullif(p_run->>'resolved_model',''),p_run->>'prompt_version',p_run->>'schema_version',
    p_run->>'evidence_checksum',coalesce(p_run->'evidence_snapshot_json','{}'::jsonb),
    p_run->'structured_output_json',coalesce(p_run->'validation_result_json','{}'::jsonb),
    coalesce(p_run->'validation_errors_json','[]'::jsonb),
    nullif(p_run->>'input_token_count','')::integer,
    nullif(p_run->>'output_token_count','')::integer,
    nullif(p_run->>'total_token_count','')::integer,
    nullif(p_run->>'estimated_cost_micros','')::bigint,
    p_run->>'accounting_status',nullif(p_run->>'latency_ms','')::integer,'used',
    nullif(p_run->>'error_code',''),nullif(p_run->>'error_message',''),now()
  ) returning id into v_id;
  return v_id;
end;
$function$;

create or replace function public.link_premium_report_generation_run(
  p_capability_id uuid,
  p_generation_run_id uuid,
  p_report_id uuid
) returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare v_run public.report_generation_runs%rowtype; v_f public.report_fulfilments%rowtype;
begin
  select * into v_run from public.report_generation_runs where id=p_generation_run_id for update;
  if not found then raise exception 'phase14_generation_run_missing'; end if;
  select * into v_f from public.report_fulfilments where id=v_run.fulfilment_id for share;
  perform public.phase14_activate_worker_operation(
    p_capability_id,array['automatic_generation','generation_recovery'],
    v_f.order_id,v_f.assessment_id,v_f.score_run_id,v_f.id,null,null
  );
  if not exists (select 1 from public.reports where id=p_report_id and fulfilment_id=v_f.id) then
    raise exception 'phase14_generation_run_report_binding_invalid';
  end if;
  update public.report_generation_runs set report_id=p_report_id where id=v_run.id;
  return true;
end;
$function$;

create or replace function public.record_phase14_report_generated(
  p_capability_id uuid,
  p_report_id uuid,
  p_actor_user_id uuid,
  p_event_type text,
  p_note text,
  p_metadata jsonb
) returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare v_report public.reports%rowtype; v_f public.report_fulfilments%rowtype;
begin
  if p_event_type not in ('generated','regenerated') then raise exception 'phase14_report_event_type_invalid'; end if;
  select * into v_report from public.reports where id=p_report_id for share;
  if not found then raise exception 'phase14_report_missing'; end if;
  if p_capability_id is not null then
    select * into v_f from public.report_fulfilments where id=v_report.fulfilment_id for share;
    perform public.phase14_activate_worker_operation(
      p_capability_id,array['automatic_generation','generation_recovery'],
      v_report.order_id,v_report.assessment_id,v_report.score_run_id,v_f.id,null,null
    );
  else
    perform public.phase14_require_security(
      'report_generation',array['platform_admin','reviewer','approver']::public.admin_role[],true,false
    );
  end if;
  insert into public.report_events(report_id,event_type,actor_user_id,note,metadata_json)
  values (v_report.id,p_event_type,p_actor_user_id,p_note,coalesce(p_metadata,'{}'::jsonb));
  insert into public.audit_logs(actor_type,actor_user_id,assessment_id,
    entity_table,entity_id,action,after_json)
  values (case when p_capability_id is null then 'admin'::public.audit_actor_type else 'system'::public.audit_actor_type end,
    p_actor_user_id,v_report.assessment_id,'reports',v_report.id,
    case when p_event_type='regenerated' then 'report_regenerated' else 'report_generated' end,
    coalesce(p_metadata,'{}'::jsonb));
  insert into public.assessment_events(
    assessment_id,order_id,report_id,event_type,dedupe_key,metadata_json
  ) values (
    v_report.assessment_id,v_report.order_id,v_report.id,'report_generated',
    'phase14-report-generated:' || v_report.id,coalesce(p_metadata,'{}'::jsonb)
  ) on conflict (dedupe_key) do update
  set event_count=public.assessment_events.event_count+1,last_seen_at=now(),
      metadata_json=public.assessment_events.metadata_json || excluded.metadata_json,
      updated_at=now();
  return true;
end;
$function$;

-- Publication happens before the durable business transition because object
-- storage cannot participate in the database transaction. Everything after
-- publication, including capability consumption, is therefore one RPC/one
-- transaction. A raised error rolls back the linkage, fulfilment transition,
-- events, and capability state together.
create or replace function public.complete_phase14_generation_operation(
  p_capability_id uuid,
  p_fulfilment_id uuid,
  p_generation_run_id uuid,
  p_report_id uuid,
  p_generation_mode text,
  p_actor_user_id uuid,
  p_event_type text,
  p_note text,
  p_metadata jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_cap public.phase14_worker_capabilities%rowtype;
  v_fulfilment public.report_fulfilments%rowtype;
  v_metadata jsonb;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'phase14_worker_service_role_required';
  end if;
  select * into v_cap from public.phase14_worker_capabilities
  where id=p_capability_id for update;
  if not found then raise exception 'phase14_worker_capability_missing'; end if;

  -- A response-loss retry is accepted only when every durable effect from the
  -- original atomic completion is present and bound to this exact capability.
  if v_cap.status='consumed' then
    if v_cap.fulfilment_id is distinct from p_fulfilment_id
       or not exists (
         select 1 from public.report_fulfilments f
         where f.id=p_fulfilment_id and f.report_id=p_report_id
           and f.status in ('ready_for_delivery','completed')
       )
       or (p_generation_run_id is not null and not exists (
         select 1 from public.report_generation_runs r
         where r.id=p_generation_run_id and r.fulfilment_id=p_fulfilment_id
           and r.report_id=p_report_id
       ))
       or not exists (
         select 1 from public.report_events e
         where e.report_id=p_report_id and e.event_type=p_event_type
           and e.metadata_json->>'worker_capability_id'=p_capability_id::text
       ) then
      raise exception 'phase14_generation_completion_replay_mismatch';
    end if;
    return jsonb_build_object('completed',true,'idempotent_replay',true,
      'report_id',p_report_id,'fulfilment_id',p_fulfilment_id);
  end if;

  perform public.phase14_activate_worker_operation(
    p_capability_id,array['automatic_generation','generation_recovery'],
    v_cap.order_id,v_cap.assessment_id,v_cap.score_run_id,p_fulfilment_id,null,null
  );
  if p_generation_run_id is not null then
    perform public.link_premium_report_generation_run(
      p_capability_id,p_generation_run_id,p_report_id
    );
  end if;
  perform public.transition_premium_report_fulfilment(
    p_capability_id,p_fulfilment_id,'ready_for_delivery','ready_for_email_delivery',
    p_generation_mode,p_report_id,false,null,null
  );
  v_metadata := coalesce(p_metadata,'{}'::jsonb)
    || jsonb_build_object('worker_capability_id',p_capability_id);
  perform public.record_phase14_report_generated(
    p_capability_id,p_report_id,p_actor_user_id,p_event_type,p_note,v_metadata
  );
  perform public.complete_phase14_worker_operation(p_capability_id);
  select * into strict v_fulfilment from public.report_fulfilments
  where id=p_fulfilment_id;
  return jsonb_build_object('completed',true,'idempotent_replay',false,
    'report_id',p_report_id,'fulfilment_id',p_fulfilment_id,
    'fulfilment_status',v_fulfilment.status);
end;
$function$;

create or replace function public.record_phase14_report_download(
  p_report_id uuid,
  p_success boolean,
  p_detail jsonb
) returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare v_actor jsonb; v_report public.reports%rowtype;
begin
  v_actor := public.phase14_require_security(
    'report_download',array['platform_admin','reviewer','approver','read_only_admin']::public.admin_role[],true,false
  );
  select * into v_report from public.reports where id=p_report_id for share;
  if not found then raise exception 'phase14_report_missing'; end if;
  if p_success then
    insert into public.report_events(report_id,event_type,actor_user_id,note,metadata_json)
    values (v_report.id,'download_requested',(v_actor->>'user_id')::uuid,
      'Authenticated report bytes streamed after SHA-256 verification.',coalesce(p_detail,'{}'::jsonb));
    insert into public.assessment_events(assessment_id,order_id,report_id,event_type,dedupe_key,metadata_json)
    values (v_report.assessment_id,v_report.order_id,v_report.id,'admin_report_downloaded',
      'phase14-report-download:' || v_report.id || ':' || (v_actor->>'session_id'),
      coalesce(p_detail,'{}'::jsonb));
  end if;
  insert into public.audit_logs(actor_type,actor_user_id,assessment_id,
    entity_table,entity_id,action,after_json)
  values ('admin',(v_actor->>'user_id')::uuid,v_report.assessment_id,'reports',v_report.id,
    case when p_success then 'report_download_streamed' else 'report_download_denied' end,
    coalesce(p_detail,'{}'::jsonb));
  return true;
end;
$function$;

-- 5. Provider trust boundary. Runtime HMAC keys live in a non-exposed schema;
-- service_role cannot read them. Receipts are append-only and consumption is
-- recorded separately so the attestation itself remains immutable.
create schema if not exists phase14_private;
revoke all on schema phase14_private from public, anon, authenticated, service_role;

create table phase14_private.runtime_secrets (
  secret_key text primary key check (secret_key in (
    'provider_webhook_db_hmac','provider_lookup_db_hmac'
  )),
  secret_value text not null check (length(secret_value) >= 32),
  rotated_at timestamptz not null default now(),
  rotated_by uuid not null references public.admin_profiles(id) on delete restrict
);
revoke all on table phase14_private.runtime_secrets from public, anon, authenticated, service_role;

create table public.phase14_provider_attestations (
  id uuid primary key default gen_random_uuid(),
  attestation_source text not null check (attestation_source in ('webhook','provider_lookup')),
  provider text not null check (coalesce(trim(provider),'') <> ''),
  provider_event_id text,
  provider_request_key text,
  authorization_id uuid references public.report_delivery_authorizations(id) on delete restrict,
  email_event_id uuid references public.email_events(id) on delete restrict,
  provider_message_id text,
  provider_state text not null,
  event_created_at timestamptz,
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  nonce uuid not null,
  attested_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  minimal_payload_json jsonb not null default '{}'::jsonb,
  constraint phase14_provider_attestation_identity_chk check (
    (attestation_source='webhook' and provider_event_id is not null)
    or (attestation_source='provider_lookup' and provider_request_key is not null
      and authorization_id is not null and email_event_id is not null)
  ),
  unique(attestation_source,provider,nonce)
);
create unique index phase14_provider_attestation_event_uidx
  on public.phase14_provider_attestations(provider,provider_event_id)
  where attestation_source='webhook';
create index phase14_provider_attestation_lookup_idx
  on public.phase14_provider_attestations(provider,provider_request_key,recorded_at desc)
  where attestation_source='provider_lookup';

create table public.phase14_provider_attestation_consumptions (
  attestation_id uuid primary key references public.phase14_provider_attestations(id) on delete restrict,
  authorization_id uuid not null references public.report_delivery_authorizations(id) on delete restrict,
  consumed_by uuid not null references public.admin_profiles(id) on delete restrict,
  consumed_session_id uuid not null,
  consumed_at timestamptz not null default now()
);

alter table public.phase14_provider_attestations enable row level security;
alter table public.phase14_provider_attestation_consumptions enable row level security;
revoke all on table public.phase14_provider_attestations from public,anon,authenticated,service_role;
revoke all on table public.phase14_provider_attestation_consumptions from public,anon,authenticated,service_role;
grant select on table public.phase14_provider_attestations to authenticated;
grant select on table public.phase14_provider_attestation_consumptions to authenticated;
create policy phase14_provider_attestations_admin_select on public.phase14_provider_attestations
  for select to authenticated using (
    public.current_admin_role() in ('platform_admin','approver','reviewer','read_only_admin')
  );
create policy phase14_provider_attestation_consumptions_admin_select
  on public.phase14_provider_attestation_consumptions
  for select to authenticated using (
    public.current_admin_role() in ('platform_admin','approver','reviewer','read_only_admin')
  );

create or replace function public.guard_phase14_provider_attestation_immutable()
returns trigger language plpgsql set search_path=''
as $function$
begin
  raise exception 'phase14_provider_attestation_immutable';
end;
$function$;
create trigger trg_phase14_provider_attestation_immutable
  before update or delete on public.phase14_provider_attestations
  for each row execute function public.guard_phase14_provider_attestation_immutable();

create or replace function public.set_phase14_runtime_secret(
  p_secret_key text,
  p_secret_value text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare v_actor jsonb;
begin
  v_actor := public.phase14_require_actor(
    'runtime_secret_rotation',array['platform_admin']::public.admin_role[],true
  );
  if p_secret_key not in ('provider_webhook_db_hmac','provider_lookup_db_hmac') then
    raise exception 'phase14_runtime_secret_key_invalid';
  end if;
  if length(coalesce(p_secret_value,'')) < 32 then raise exception 'phase14_runtime_secret_too_short'; end if;
  insert into phase14_private.runtime_secrets(secret_key,secret_value,rotated_at,rotated_by)
  values (p_secret_key,p_secret_value,now(),(v_actor->>'user_id')::uuid)
  on conflict (secret_key) do update
  set secret_value=excluded.secret_value,rotated_at=excluded.rotated_at,rotated_by=excluded.rotated_by;
  perform set_config('phase14.authoritative_transition','runtime_secret_rotation',true);
  insert into public.audit_logs(actor_type,actor_user_id,entity_table,action,after_json)
  values ('admin',(v_actor->>'user_id')::uuid,'phase14_private.runtime_secrets',
    'phase14_runtime_secret_rotated',jsonb_build_object('secret_key',p_secret_key));
  return jsonb_build_object('secret_key',p_secret_key,'rotated_at',now(),
    'fingerprint',encode(extensions.digest(convert_to(p_secret_value,'UTF8'),'sha256'),'hex'));
end;
$function$;

create or replace function phase14_private.verify_hmac(
  p_secret_key text,
  p_canonical text,
  p_signature text,
  p_attested_at_epoch bigint
) returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare v_secret text; v_expected text;
begin
  if abs(extract(epoch from now())::bigint - p_attested_at_epoch) > 300 then
    raise exception 'phase14_attestation_timestamp_invalid';
  end if;
  if p_signature !~ '^[0-9a-f]{64}$' then raise exception 'phase14_attestation_hmac_invalid'; end if;
  select secret_value into v_secret from phase14_private.runtime_secrets
  where secret_key=p_secret_key;
  if v_secret is null then raise exception 'phase14_attestation_secret_unprovisioned'; end if;
  v_expected := encode(extensions.hmac(
    convert_to(p_canonical,'UTF8'),convert_to(v_secret,'UTF8'),'sha256'
  ),'hex');
  if v_expected <> p_signature then raise exception 'phase14_attestation_hmac_invalid'; end if;
  return true;
end;
$function$;

create or replace function public.ingest_phase14_provider_webhook(
  p_provider text,
  p_provider_event_id text,
  p_provider_message_id text,
  p_event_type text,
  p_event_created_at text,
  p_payload_sha256 text,
  p_payload_json jsonb,
  p_attested_at_epoch bigint,
  p_nonce uuid,
  p_attestation_hmac text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_canonical text; v_id uuid; v_result jsonb; v_created timestamptz;
  v_authorization_id uuid; v_email_event_id uuid;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'phase14_service_role_required';
  end if;
  perform public.phase14_require_policy('provider_webhook_ingestion');
  if p_payload_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'webhook_payload_fingerprint_invalid'; end if;
  v_created := p_event_created_at::timestamptz;
  v_canonical := concat_ws('|','webhook',lower(trim(p_provider)),p_provider_event_id,
    coalesce(p_provider_message_id,''),p_event_type,p_event_created_at,p_payload_sha256,
    p_attested_at_epoch::text,p_nonce::text);
  perform phase14_private.verify_hmac(
    'provider_webhook_db_hmac',v_canonical,p_attestation_hmac,p_attested_at_epoch
  );
  select e.id,a.id into v_email_event_id,v_authorization_id
  from public.email_events e
  left join public.report_delivery_authorizations a on a.email_event_id=e.id
  where e.provider=lower(trim(p_provider))
    and e.provider_message_id=p_provider_message_id
  order by e.created_at desc limit 1;
  insert into public.phase14_provider_attestations(
    attestation_source,provider,provider_event_id,authorization_id,email_event_id,
    provider_message_id,provider_state,
    event_created_at,payload_sha256,nonce,attested_at,minimal_payload_json
  ) values (
    'webhook',lower(trim(p_provider)),p_provider_event_id,v_authorization_id,v_email_event_id,
    p_provider_message_id,
    p_event_type,v_created,p_payload_sha256,p_nonce,to_timestamp(p_attested_at_epoch),
    jsonb_strip_nulls(jsonb_build_object('type',p_payload_json->>'type',
      'created_at',p_payload_json->>'created_at','reason',p_payload_json->>'reason'))
  ) on conflict (provider,provider_event_id) where attestation_source='webhook'
  do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.phase14_provider_attestations
    where attestation_source='webhook' and provider=lower(trim(p_provider))
      and provider_event_id=p_provider_event_id
      and provider_message_id is not distinct from p_provider_message_id
      and provider_state=p_event_type and event_created_at=v_created
      and payload_sha256=p_payload_sha256;
    if v_id is null then raise exception 'phase14_webhook_replay_mismatch'; end if;
  end if;
  perform set_config('phase14.authoritative_transition','trusted_provider_attestation',true);
  v_result := public.apply_email_provider_event_atomic(
    p_provider,p_provider_event_id,p_provider_message_id,p_event_type,v_created,
    p_payload_sha256,p_payload_json
  );
  return v_result || jsonb_build_object('attestation_id',v_id);
end;
$function$;

create or replace function public.get_phase14_provider_attestation(
  p_attestation_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare v_att public.phase14_provider_attestations%rowtype;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'phase14_service_role_required';
  end if;
  select * into v_att from public.phase14_provider_attestations
  where id=p_attestation_id;
  if not found then raise exception 'phase14_provider_attestation_missing'; end if;
  return jsonb_build_object(
    'id',v_att.id,'attestation_source',v_att.attestation_source,
    'provider',v_att.provider,'provider_event_id',v_att.provider_event_id,
    'provider_request_key',v_att.provider_request_key,
    'authorization_id',v_att.authorization_id,'email_event_id',v_att.email_event_id,
    'provider_message_id',v_att.provider_message_id,
    'provider_state',v_att.provider_state,
    'event_created_at',v_att.event_created_at,
    'payload_sha256',v_att.payload_sha256,
    'attested_at',v_att.attested_at,'recorded_at',v_att.recorded_at
  );
end;
$function$;

create or replace function public.record_phase14_provider_lookup_attestation(
  p_provider text,
  p_provider_request_key text,
  p_authorization_id uuid,
  p_email_event_id uuid,
  p_provider_message_id text,
  p_provider_state text,
  p_payload_sha256 text,
  p_payload_json jsonb,
  p_attested_at_epoch bigint,
  p_nonce uuid,
  p_attestation_hmac text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_canonical text; v_id uuid;
  v_auth public.report_delivery_authorizations%rowtype;
  v_event public.email_events%rowtype;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'phase14_service_role_required';
  end if;
  perform public.phase14_require_policy('manual_delivery');
  if p_provider_state not in ('accepted','not_found','pending','unknown') then
    raise exception 'phase14_provider_attestation_state_invalid';
  end if;
  if p_payload_sha256 !~ '^[0-9a-f]{64}$' then raise exception 'phase14_provider_attestation_payload_invalid'; end if;
  select * into v_auth from public.report_delivery_authorizations
  where id=p_authorization_id for share;
  select * into v_event from public.email_events where id=p_email_event_id for share;
  if v_auth.id is null or v_event.id is null
     or v_auth.email_event_id is distinct from p_email_event_id
     or v_event.provider_request_key is distinct from p_provider_request_key
     or v_auth.provider is distinct from lower(trim(p_provider)) then
    raise exception 'phase14_provider_lookup_binding_invalid';
  end if;
  v_canonical := concat_ws('|','provider_lookup',lower(trim(p_provider)),
    p_provider_request_key,p_authorization_id::text,p_email_event_id::text,
    coalesce(p_provider_message_id,''),p_provider_state,
    p_payload_sha256,p_attested_at_epoch::text,p_nonce::text);
  perform phase14_private.verify_hmac(
    'provider_lookup_db_hmac',v_canonical,p_attestation_hmac,p_attested_at_epoch
  );
  insert into public.phase14_provider_attestations(
    attestation_source,provider,provider_request_key,authorization_id,email_event_id,
    provider_message_id,provider_state,
    payload_sha256,nonce,attested_at,minimal_payload_json
  ) values (
    'provider_lookup',lower(trim(p_provider)),p_provider_request_key,p_authorization_id,
    p_email_event_id,p_provider_message_id,
    p_provider_state,p_payload_sha256,p_nonce,to_timestamp(p_attested_at_epoch),
    jsonb_strip_nulls(jsonb_build_object('state',p_payload_json->>'state',
      'detail',left(p_payload_json->>'detail',500)))
  ) returning id into v_id;
  return v_id;
end;
$function$;

-- 6. Tokenless worker facades. Each facade rebinds the opaque operation to the
-- exact commercial rows before invoking the existing transactional state machine.
create or replace function public.worker_claim_premium_report_generation(
  p_capability_id uuid,
  p_order_reference text,
  p_claim_owner text,
  p_fulfilment_id uuid,
  p_report_type public.report_type default 'essential_self_assessment'
) returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare v_context jsonb;
begin
  v_context := public.phase14_generation_entitlement(p_order_reference);
  perform public.phase14_activate_worker_operation(
    p_capability_id,array['automatic_generation','generation_recovery'],
    (v_context->>'order_id')::uuid,(v_context->>'assessment_id')::uuid,
    (v_context->>'score_run_id')::uuid,p_fulfilment_id,null,null
  );
  return public.claim_premium_report_generation(
    p_order_reference,p_claim_owner,p_fulfilment_id,p_report_type
  );
end;
$function$;

create or replace function public.worker_renew_premium_report_generation_lease(
  p_capability_id uuid,
  p_claim_token uuid
) returns timestamptz
language plpgsql security definer set search_path=''
as $function$
declare v_claim public.report_generation_claims%rowtype;
begin
  select * into v_claim from public.report_generation_claims where claim_token=p_claim_token;
  if not found then raise exception 'generation_claim_missing'; end if;
  perform public.phase14_activate_worker_operation(
    p_capability_id,array['automatic_generation','generation_recovery'],
    v_claim.order_id,v_claim.assessment_id,v_claim.score_run_id,v_claim.fulfilment_id,
    v_claim.report_id,null
  );
  return public.renew_premium_report_generation_lease(p_claim_token);
end;
$function$;

create or replace function public.worker_recover_premium_report_generation_claim(
  p_capability_id uuid,
  p_order_reference text,
  p_claim_owner text,
  p_fulfilment_id uuid
) returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare v_context jsonb;
begin
  v_context := public.phase14_generation_entitlement(p_order_reference);
  perform public.phase14_activate_worker_operation(
    p_capability_id,array['automatic_generation','generation_recovery'],
    (v_context->>'order_id')::uuid,(v_context->>'assessment_id')::uuid,
    (v_context->>'score_run_id')::uuid,p_fulfilment_id,null,null
  );
  return public.recover_premium_report_generation_claim(p_order_reference,p_claim_owner);
end;
$function$;

create or replace function public.worker_commit_premium_report_draft(
  p_capability_id uuid,
  p_claim_token uuid,
  p_template_id uuid,
  p_storage_bucket text,
  p_temp_storage_path text,
  p_checksum text,
  p_generation_run_id uuid default null
) returns uuid
language plpgsql security definer set search_path=''
as $function$
declare v_claim public.report_generation_claims%rowtype;
begin
  select * into v_claim from public.report_generation_claims where claim_token=p_claim_token;
  if not found then raise exception 'generation_claim_missing'; end if;
  perform public.phase14_activate_worker_operation(
    p_capability_id,array['automatic_generation','generation_recovery'],
    v_claim.order_id,v_claim.assessment_id,v_claim.score_run_id,v_claim.fulfilment_id,
    v_claim.report_id,null
  );
  return public.commit_premium_report_draft(
    p_claim_token,p_template_id,p_storage_bucket,p_temp_storage_path,p_checksum,null,p_generation_run_id
  );
end;
$function$;

create or replace function public.worker_publish_premium_report_generation(
  p_capability_id uuid,
  p_claim_token uuid,
  p_report_id uuid
) returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare v_claim public.report_generation_claims%rowtype;
begin
  select * into v_claim from public.report_generation_claims where claim_token=p_claim_token;
  if not found then raise exception 'generation_claim_missing'; end if;
  perform public.phase14_activate_worker_operation(
    p_capability_id,array['automatic_generation','generation_recovery'],
    v_claim.order_id,v_claim.assessment_id,v_claim.score_run_id,v_claim.fulfilment_id,p_report_id,null
  );
  return public.publish_premium_report_generation(p_claim_token,p_report_id);
end;
$function$;

create or replace function public.worker_abandon_premium_report_generation_claim(
  p_capability_id uuid,
  p_claim_token uuid,
  p_reason text
) returns boolean
language plpgsql security definer set search_path=''
as $function$
declare v_claim public.report_generation_claims%rowtype;
begin
  select * into v_claim from public.report_generation_claims where claim_token=p_claim_token;
  if not found then return false; end if;
  perform public.phase14_activate_worker_operation(
    p_capability_id,array['automatic_generation','generation_recovery'],
    v_claim.order_id,v_claim.assessment_id,v_claim.score_run_id,v_claim.fulfilment_id,
    v_claim.report_id,null
  );
  return public.abandon_premium_report_generation_claim(p_claim_token,p_reason);
end;
$function$;

create or replace function public.worker_register_phase14_storage_cleanup(
  p_capability_id uuid,
  p_storage_bucket text,
  p_storage_path text,
  p_expected_checksum text,
  p_claim_token uuid,
  p_reason text
) returns uuid
language plpgsql security definer set search_path=''
as $function$
declare v_claim public.report_generation_claims%rowtype;
begin
  select * into v_claim from public.report_generation_claims where claim_token=p_claim_token;
  if not found then raise exception 'generation_claim_missing'; end if;
  perform public.phase14_activate_worker_operation(
    p_capability_id,array['automatic_generation','generation_recovery'],
    v_claim.order_id,v_claim.assessment_id,v_claim.score_run_id,v_claim.fulfilment_id,
    v_claim.report_id,null
  );
  return public.register_phase14_storage_cleanup(
    p_storage_bucket,p_storage_path,p_expected_checksum,p_claim_token,p_reason
  );
end;
$function$;

create or replace function public.worker_link_phase14_storage_cleanup_report(
  p_capability_id uuid,
  p_cleanup_id uuid,
  p_report_id uuid
) returns boolean
language plpgsql security definer set search_path=''
as $function$
declare v_report public.reports%rowtype;
begin
  select * into v_report from public.reports where id=p_report_id;
  if not found then raise exception 'cleanup_report_missing'; end if;
  perform public.phase14_activate_worker_operation(
    p_capability_id,array['automatic_generation','generation_recovery'],
    v_report.order_id,v_report.assessment_id,v_report.score_run_id,v_report.fulfilment_id,
    p_report_id,null
  );
  return public.link_phase14_storage_cleanup_report(p_cleanup_id,p_report_id);
end;
$function$;

create or replace function public.worker_record_phase14_storage_cleanup_result(
  p_capability_id uuid,
  p_cleanup_id uuid,
  p_deleted boolean,
  p_error text default null
) returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare v_queue public.phase14_storage_cleanup_queue%rowtype; v_cap public.phase14_worker_capabilities%rowtype;
begin
  select * into v_queue from public.phase14_storage_cleanup_queue where id=p_cleanup_id;
  select * into v_cap from public.phase14_worker_capabilities where id=p_capability_id;
  if not found then raise exception 'phase14_worker_capability_missing'; end if;
  perform public.phase14_activate_worker_operation(
    p_capability_id,array['automatic_generation','generation_recovery'],
    v_cap.order_id,v_cap.assessment_id,v_cap.score_run_id,v_cap.fulfilment_id,
    v_queue.report_id,null
  );
  return public.record_phase14_storage_cleanup_result(p_cleanup_id,p_deleted,p_error);
end;
$function$;

create or replace function public.worker_authorize_premium_report_delivery(
  p_capability_id uuid,
  p_report_id uuid,
  p_recipient text,
  p_provider text default 'resend'
) returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare v_report public.reports%rowtype;
begin
  select * into v_report from public.reports where id=p_report_id;
  if not found then raise exception 'report_not_found'; end if;
  perform public.phase14_activate_worker_operation(
    p_capability_id,array['automatic_delivery'],v_report.order_id,v_report.assessment_id,
    v_report.score_run_id,v_report.fulfilment_id,p_report_id,p_recipient
  );
  return public.authorize_premium_report_delivery(p_report_id,p_recipient,'initial',false,p_provider,null);
end;
$function$;

create or replace function public.worker_claim_premium_report_delivery(
  p_capability_id uuid,
  p_authorization_id uuid
) returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare v_auth public.report_delivery_authorizations%rowtype; v_report public.reports%rowtype;
begin
  select * into v_auth from public.report_delivery_authorizations where id=p_authorization_id;
  select * into v_report from public.reports where id=v_auth.report_id;
  perform public.phase14_activate_worker_operation(
    p_capability_id,array['automatic_delivery'],v_auth.order_id,v_auth.assessment_id,
    v_auth.score_run_id,v_report.fulfilment_id,v_auth.report_id,v_auth.recipient_email::text
  );
  return public.claim_premium_report_delivery(p_authorization_id);
end;
$function$;

create or replace function public.worker_mark_premium_report_delivery_dispatch_started(
  p_capability_id uuid,
  p_authorization_id uuid,
  p_delivery_lease_token uuid
) returns boolean
language plpgsql security definer set search_path=''
as $function$
declare v_auth public.report_delivery_authorizations%rowtype; v_report public.reports%rowtype;
begin
  select * into v_auth from public.report_delivery_authorizations where id=p_authorization_id;
  select * into v_report from public.reports where id=v_auth.report_id;
  perform public.phase14_activate_worker_operation(
    p_capability_id,array['automatic_delivery'],v_auth.order_id,v_auth.assessment_id,
    v_auth.score_run_id,v_report.fulfilment_id,v_auth.report_id,v_auth.recipient_email::text
  );
  return public.mark_premium_report_delivery_dispatch_started(p_authorization_id,p_delivery_lease_token);
end;
$function$;

create or replace function public.worker_fail_premium_report_delivery_before_dispatch(
  p_capability_id uuid,
  p_authorization_id uuid,
  p_delivery_lease_token uuid,
  p_reason text
) returns boolean
language plpgsql security definer set search_path=''
as $function$
declare v_auth public.report_delivery_authorizations%rowtype; v_report public.reports%rowtype;
begin
  select * into v_auth from public.report_delivery_authorizations where id=p_authorization_id;
  select * into v_report from public.reports where id=v_auth.report_id;
  perform public.phase14_activate_worker_operation(
    p_capability_id,array['automatic_delivery'],v_auth.order_id,v_auth.assessment_id,
    v_auth.score_run_id,v_report.fulfilment_id,v_auth.report_id,v_auth.recipient_email::text
  );
  return public.fail_premium_report_delivery_before_dispatch(
    p_authorization_id,p_delivery_lease_token,p_reason
  );
end;
$function$;

create or replace function public.worker_finalize_premium_report_delivery(
  p_capability_id uuid,
  p_authorization_id uuid,
  p_email_event_id uuid,
  p_provider_message_id text
) returns jsonb
language plpgsql security definer set search_path=''
as $function$
declare
  v_auth public.report_delivery_authorizations%rowtype;
  v_report public.reports%rowtype;
  v_cap public.phase14_worker_capabilities%rowtype;
  v_result jsonb;
begin
  select * into v_auth from public.report_delivery_authorizations where id=p_authorization_id;
  select * into v_report from public.reports where id=v_auth.report_id;
  select * into v_cap from public.phase14_worker_capabilities
  where id=p_capability_id for update;
  if not found then raise exception 'phase14_worker_capability_missing'; end if;
  if v_cap.status='consumed' then
    if v_auth.worker_capability_id is distinct from p_capability_id
       or not exists (
         select 1 from public.report_delivery_finalizations f
         where f.authorization_id=p_authorization_id
           and f.email_event_id=p_email_event_id
           and f.report_id=v_auth.report_id
           and f.provider=v_auth.provider
           and f.provider_message_id=p_provider_message_id
       ) then
      raise exception 'phase14_delivery_completion_replay_mismatch';
    end if;
    return jsonb_build_object('finalized',true,'idempotent_replay',true,
      'report_id',v_auth.report_id,'email_event_id',p_email_event_id,
      'worker_capability_consumed',true);
  end if;
  perform public.phase14_activate_worker_operation(
    p_capability_id,array['automatic_delivery','delivery_reconciliation'],
    v_auth.order_id,v_auth.assessment_id,v_auth.score_run_id,v_report.fulfilment_id,
    v_auth.report_id,v_auth.recipient_email::text
  );
  v_result := public.finalize_premium_report_delivery(
    p_authorization_id,p_email_event_id,p_provider_message_id
  );
  if coalesce((v_result->>'finalized')::boolean,false) then
    perform public.complete_phase14_worker_operation(p_capability_id);
    return v_result || jsonb_build_object('worker_capability_consumed',true);
  end if;
  return v_result;
end;
$function$;

create or replace function public.worker_mark_premium_report_delivery_reconciliation_required(
  p_capability_id uuid,
  p_authorization_id uuid,
  p_provider_message_id text,
  p_reason text
) returns boolean
language plpgsql security definer set search_path=''
as $function$
declare v_auth public.report_delivery_authorizations%rowtype; v_report public.reports%rowtype;
begin
  select * into v_auth from public.report_delivery_authorizations where id=p_authorization_id;
  select * into v_report from public.reports where id=v_auth.report_id;
  perform public.phase14_activate_worker_operation(
    p_capability_id,array['automatic_delivery','delivery_reconciliation'],
    v_auth.order_id,v_auth.assessment_id,v_auth.score_run_id,v_report.fulfilment_id,
    v_auth.report_id,v_auth.recipient_email::text
  );
  return public.mark_premium_report_delivery_reconciliation_required(
    p_authorization_id,p_provider_message_id,p_reason
  );
end;
$function$;

-- 7. Finalization locks the fulfilment row before any terminal write, requires a
-- successful compare-and-set, and preserves exact idempotent replay semantics.
alter table public.report_delivery_finalizations
  add column fulfilment_id uuid references public.report_fulfilments(id) on delete restrict;

update public.report_delivery_finalizations f
set fulfilment_id=r.fulfilment_id
from public.reports r
where r.id=f.report_id and f.fulfilment_id is null;

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
  v_report public.reports%rowtype;
  v_fulfilment public.report_fulfilments%rowtype;
  v_email public.email_events%rowtype;
  v_now timestamptz := now(); v_context jsonb;
begin
  perform public.phase14_require_security(
    'delivery_finalization',array['platform_admin','approver']::public.admin_role[],true,false
  );
  select * into v_auth from public.report_delivery_authorizations
  where id=p_authorization_id for update;
  if not found or v_auth.email_event_id <> p_email_event_id then
    raise exception 'delivery_finalization_binding_mismatch';
  end if;
  if coalesce(trim(p_provider_message_id),'') = '' then raise exception 'provider_message_id_required'; end if;
  select * into v_existing from public.report_delivery_finalizations
  where authorization_id=p_authorization_id for share;
  if found then
    if v_existing.email_event_id=p_email_event_id
       and v_existing.report_id=v_auth.report_id
       and v_existing.provider=v_auth.provider
       and v_existing.provider_message_id=p_provider_message_id
       and v_existing.fulfilment_id is not distinct from (
         select r.fulfilment_id from public.reports r where r.id=v_auth.report_id
       )
       and (v_auth.test_delivery or exists (
         select 1 from public.report_fulfilments f
         where f.id=v_existing.fulfilment_id and f.status='completed'
           and f.order_id=v_auth.order_id and f.assessment_id=v_auth.assessment_id
           and f.score_run_id=v_auth.score_run_id and f.report_id=v_auth.report_id
       )) then
      return jsonb_build_object('finalized',true,'idempotent_replay',true,
        'report_id',v_existing.report_id,'email_event_id',v_existing.email_event_id);
    end if;
    insert into public.phase14_operational_alerts(
      alert_key,severity,category,report_id,email_event_id,detail_json
    ) values (
      'delivery-finalization-replay-conflict:' || p_authorization_id,'critical',
      'delivery_finalization_replay_conflict',v_auth.report_id,p_email_event_id,
      jsonb_build_object('authorization_id',p_authorization_id,
        'incoming_email_event_id',p_email_event_id,'incoming_provider',v_auth.provider,
        'incoming_provider_message_id',p_provider_message_id,'persisted',to_jsonb(v_existing))
    ) on conflict (alert_key) do update
      set severity='critical',detail_json=excluded.detail_json,status='open';
    return jsonb_build_object('finalized',false,'conflict',true,
      'reason','delivery_finalization_replay_conflict');
  end if;
  if v_auth.status not in ('dispatching','reconciliation_required') then
    raise exception 'delivery_finalization_state_invalid:%',v_auth.status;
  end if;
  v_context := public.phase14_delivery_entitlement(
    v_auth.report_id,v_auth.recipient_email::text,v_auth.test_delivery,'email_delivery'
  );
  if v_context->>'report_checksum' <> v_auth.report_checksum then
    raise exception 'delivery_finalization_entitlement_changed';
  end if;
  select * into v_report from public.reports where id=v_auth.report_id for update;
  if not found then raise exception 'delivery_finalization_report_missing'; end if;
  if not v_auth.test_delivery and v_report.fulfilment_id is null then
    raise exception 'delivery_finalization_fulfilment_missing';
  end if;
  if v_report.fulfilment_id is not null then
    select * into v_fulfilment from public.report_fulfilments
    where id=v_report.fulfilment_id for update;
    if not found then raise exception 'delivery_finalization_fulfilment_missing'; end if;
    if v_fulfilment.order_id <> v_auth.order_id
       or v_fulfilment.assessment_id <> v_auth.assessment_id
       or v_fulfilment.score_run_id <> v_auth.score_run_id
       or v_fulfilment.report_id is distinct from v_report.id then
      raise exception 'delivery_finalization_fulfilment_binding_changed';
    end if;
    if not v_auth.test_delivery and v_fulfilment.status <> 'ready_for_delivery' then
      raise exception 'delivery_finalization_fulfilment_state_invalid:%',v_fulfilment.status;
    end if;
  end if;
  select * into v_email from public.email_events where id=p_email_event_id for update;
  if not found then raise exception 'delivery_finalization_email_missing'; end if;
  update public.email_events
  set status='sent',provider=v_auth.provider,provider_message_id=p_provider_message_id,
      sent_at=coalesce(sent_at,v_now),delivery_updated_at=v_now,send_lease_token=null,
      send_lease_expires_at=null,error_message=null
  where id=p_email_event_id
    and status in ('sending','provider_acceptance_uncertain','reconciliation_required');
  if not found then raise exception 'delivery_finalization_email_cas_failed'; end if;
  if not v_auth.test_delivery then
    update public.reports
    set status='released',released_at=coalesce(released_at,v_now),updated_at=v_now
    where id=v_report.id and status in ('generated','under_review','approved','released');
    if not found then raise exception 'delivery_finalization_report_cas_failed'; end if;
    if v_report.fulfilment_id is not null then
      update public.report_fulfilments
      set status='completed',current_step='email_sent',completed_at=coalesce(completed_at,v_now),
          report_id=v_report.id,updated_at=v_now
      where id=v_report.fulfilment_id and status='ready_for_delivery'
        and report_id=v_report.id;
      if not found then raise exception 'delivery_finalization_fulfilment_cas_failed'; end if;
    end if;
  end if;
  insert into public.report_delivery_finalizations(
    authorization_id,email_event_id,report_id,fulfilment_id,provider,provider_message_id,finalized_at
  ) values (v_auth.id,p_email_event_id,v_report.id,v_report.fulfilment_id,
    v_auth.provider,p_provider_message_id,v_now);
  insert into public.report_events(report_id,event_type,actor_user_id,note,metadata_json)
  values (v_report.id,case when v_auth.test_delivery then 'email_test_sent' else 'email_sent' end,
    v_auth.authorised_by,'Atomic provider-acceptance finalization.',
    jsonb_build_object('authorization_id',v_auth.id,'email_event_id',p_email_event_id,
      'provider_message_id',p_provider_message_id,'test_delivery',v_auth.test_delivery,
      'worker_capability_id',v_auth.worker_capability_id));
  insert into public.audit_logs(actor_type,actor_user_id,assessment_id,
    entity_table,entity_id,action,after_json)
  values (case when v_auth.worker_capability_id is null
      then 'admin'::public.audit_actor_type else 'system'::public.audit_actor_type end,
    v_auth.authorised_by,v_auth.assessment_id,'reports',v_report.id,
    case when v_auth.test_delivery then 'premium_report_test_delivery_finalized'
      else 'premium_report_delivery_finalized' end,
    jsonb_build_object('authorization_id',v_auth.id,'email_event_id',p_email_event_id,
      'provider_message_id',p_provider_message_id,'worker_capability_id',v_auth.worker_capability_id));
  if not v_auth.test_delivery then
    insert into public.assessment_events(
      assessment_id,order_id,report_id,event_type,dedupe_key,metadata_json
    ) values (
      v_auth.assessment_id,v_auth.order_id,v_report.id,'report_emailed_to_customer',
      'phase14-delivery-finalization:' || v_auth.id,
      jsonb_build_object('authorization_id',v_auth.id,'email_event_id',p_email_event_id,
        'test_delivery',false)
    );
  end if;
  update public.report_delivery_authorizations
  set status='finalized',provider_message_id=p_provider_message_id,finalized_at=v_now,
      lease_token=null,lease_expires_at=null,updated_at=v_now
  where id=v_auth.id and status in ('dispatching','reconciliation_required');
  if not found then raise exception 'delivery_finalization_authorization_cas_failed'; end if;
  return jsonb_build_object('finalized',true,'idempotent_replay',false,
    'report_id',v_report.id,'email_event_id',p_email_event_id);
end;
$function$;

create or replace function public.resolve_premium_report_delivery_reconciliation(
  p_authorization_id uuid,
  p_resolution text,
  p_attestation_id uuid,
  p_operator_override boolean default false,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor jsonb; v_auth public.report_delivery_authorizations%rowtype;
  v_event public.email_events%rowtype; v_att public.phase14_provider_attestations%rowtype;
  v_result jsonb;
begin
  v_actor := public.phase14_require_security(
    'provider_reconciliation',array['platform_admin','approver']::public.admin_role[],true,false
  );
  if p_resolution not in ('accepted','not_accepted') then
    raise exception 'delivery_reconciliation_resolution_invalid';
  end if;
  if coalesce(trim(p_reason),'')='' then raise exception 'delivery_reconciliation_reason_required'; end if;
  select * into v_auth from public.report_delivery_authorizations
  where id=p_authorization_id for update;
  if not found or v_auth.status <> 'reconciliation_required' then
    raise exception 'delivery_reconciliation_state_invalid';
  end if;
  select * into v_event from public.email_events where id=v_auth.email_event_id for update;
  select * into v_att from public.phase14_provider_attestations
  where id=p_attestation_id for share;
  if not found or v_att.attestation_source <> 'provider_lookup'
     or v_att.provider <> v_auth.provider
     or v_att.authorization_id is distinct from v_auth.id
     or v_att.email_event_id is distinct from v_auth.email_event_id
     or v_att.provider_request_key is distinct from v_event.provider_request_key
     or v_att.recorded_at < v_auth.dispatch_started_at then
    raise exception 'delivery_reconciliation_attestation_binding_invalid';
  end if;
  if exists (select 1 from public.phase14_provider_attestation_consumptions
    where attestation_id=v_att.id) then
    raise exception 'delivery_reconciliation_attestation_already_consumed';
  end if;
  if p_resolution='accepted' then
    if v_att.provider_state <> 'accepted'
       or coalesce(trim(v_att.provider_message_id),'')='' then
      raise exception 'delivery_reconciliation_acceptance_not_attested';
    end if;
  else
    if not p_operator_override then raise exception 'delivery_reconciliation_operator_override_required'; end if;
    if v_att.provider_state <> 'not_found' then
      raise exception 'delivery_reconciliation_non_acceptance_not_attested';
    end if;
  end if;
  insert into public.phase14_provider_attestation_consumptions(
    attestation_id,authorization_id,consumed_by,consumed_session_id
  ) values (
    v_att.id,v_auth.id,(v_actor->>'user_id')::uuid,(v_actor->>'session_id')::uuid
  );
  if p_resolution='accepted' then
    v_result := public.finalize_premium_report_delivery(
      v_auth.id,v_auth.email_event_id,v_att.provider_message_id
    );
  else
    update public.report_delivery_authorizations
    set status='revoked',revoked_reason=p_reason,lease_token=null,lease_expires_at=null,updated_at=now()
    where id=v_auth.id and status='reconciliation_required';
    if not found then raise exception 'delivery_reconciliation_authorization_cas_failed'; end if;
    update public.email_events
    set status='failed_before_provider',error_message=p_reason,reconciliation_attempted_at=now(),
        reconciliation_result_json=jsonb_build_object('attestation_id',v_att.id,
          'provider_state',v_att.provider_state),delivery_updated_at=now()
    where id=v_auth.email_event_id and status='reconciliation_required';
    if not found then raise exception 'delivery_reconciliation_email_cas_failed'; end if;
    v_result := jsonb_build_object('resolved',true,'resolution','not_accepted',
      'authorization_id',v_auth.id);
  end if;
  insert into public.audit_logs(actor_type,actor_user_id,assessment_id,
    entity_table,entity_id,action,after_json)
  values ('admin',(v_actor->>'user_id')::uuid,v_auth.assessment_id,
    'report_delivery_authorizations',v_auth.id,
    'premium_report_delivery_reconciliation_resolved',
    jsonb_build_object('resolution',p_resolution,'attestation_id',v_att.id,
      'provider_message_id',v_att.provider_message_id,'operator_override',p_operator_override,
      'reason',p_reason));
  return v_result;
end;
$function$;

-- 8. Bounce remediation proves an actual address correction and applies the
-- verified customer/order update atomically before a retry can be authorised.
alter table public.report_delivery_remediations
  add column previous_recipient_email citext,
  add column corrected_recipient_email citext,
  add column customer_update_applied_at timestamptz,
  add column authorised_session_id uuid;

update public.report_delivery_remediations
set previous_recipient_email=recipient_email
where previous_recipient_email is null;

create or replace function public.authorize_bounced_report_redelivery(
  p_prior_email_event_id uuid,
  p_corrected_recipient text,
  p_reason text,
  p_evidence jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor jsonb; v_event public.email_events%rowtype; v_order public.orders%rowtype;
  v_corrected public.citext; v_id uuid;
begin
  v_actor := public.phase14_require_security(
    'email_resend',array['platform_admin','approver']::public.admin_role[],true,false
  );
  v_corrected := lower(trim(p_corrected_recipient))::public.citext;
  if v_corrected::text !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'bounce_remediation_corrected_recipient_invalid';
  end if;
  if coalesce(trim(p_reason),'')='' or coalesce(p_evidence,'{}'::jsonb)='{}'::jsonb
     or coalesce(trim(p_evidence->>'verification_method'),'')=''
     or coalesce(trim(p_evidence->>'verified_at'),'')='' then
    raise exception 'bounce_remediation_verified_evidence_required';
  end if;
  select * into v_event from public.email_events
  where id=p_prior_email_event_id for update;
  if not found or v_event.status <> 'bounced' or v_event.order_id is null
     or v_event.report_id is null then
    raise exception 'bounce_remediation_event_ineligible';
  end if;
  if v_corrected = v_event.recipient_email then
    raise exception 'bounce_remediation_recipient_not_corrected';
  end if;
  select * into v_order from public.orders where id=v_event.order_id for update;
  if not found or lower(v_order.customer_email::text) <> lower(v_event.recipient_email::text) then
    raise exception 'bounce_remediation_order_recipient_changed';
  end if;
  update public.orders
  set customer_email=v_corrected,updated_at=now()
  where id=v_order.id and customer_email=v_event.recipient_email;
  if not found then raise exception 'bounce_remediation_customer_update_cas_failed'; end if;
  insert into public.report_delivery_remediations(
    prior_email_event_id,report_id,recipient_email,previous_recipient_email,
    corrected_recipient_email,remediation_type,reason,evidence_json,authorised_by,
    authorised_session_id,customer_update_applied_at
  ) values (
    v_event.id,v_event.report_id,v_corrected,v_event.recipient_email,
    v_corrected,'bounce_retry',p_reason,p_evidence,(v_actor->>'user_id')::uuid,
    (v_actor->>'session_id')::uuid,now()
  ) returning id into v_id;
  insert into public.audit_logs(actor_type,actor_user_id,assessment_id,
    entity_table,entity_id,action,before_json,after_json)
  values ('admin',(v_actor->>'user_id')::uuid,v_event.assessment_id,
    'report_delivery_remediations',v_id,'premium_report_bounce_retry_authorized',
    jsonb_build_object('previous_recipient',v_event.recipient_email),
    jsonb_build_object('prior_email_event_id',v_event.id,
      'corrected_recipient',v_corrected,'reason',p_reason,
      'verification_method',p_evidence->>'verification_method'));
  return v_id;
end;
$function$;

create or replace function public.authorize_premium_report_delivery(
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
  if p_delivery_mode not in ('initial','bounce_retry') then raise exception 'delivery_mode_invalid'; end if;
  v_actor := public.phase14_require_security(
    case when p_delivery_mode='bounce_retry' then 'email_resend' else 'email_delivery' end,
    array['platform_admin','approver']::public.admin_role[],true,false
  );
  if p_allow_test_override then perform public.phase14_require_policy('recipient_override'); end if;
  if coalesce(trim(p_provider),'')='' then raise exception 'delivery_provider_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'phase14-delivery:' || p_report_id || ':' || lower(trim(p_recipient)),0
  ));
  v_context := public.phase14_delivery_entitlement(
    p_report_id,p_recipient,p_allow_test_override,'email_delivery'
  );
  v_gate_version := (v_actor->>'gate_version')::integer;
  v_worker_capability_id := nullif(v_actor->>'capability_id','')::uuid;
  if exists (select 1 from public.email_events
    where report_id=p_report_id and status='complained') then
    raise exception 'delivery_complaint_permanently_non_retriable';
  end if;
  if exists (select 1 from public.email_events
    where report_id=p_report_id
      and status in ('sending','provider_acceptance_uncertain','reconciliation_required')) then
    raise exception 'delivery_provider_acceptance_unresolved';
  end if;
  if p_delivery_mode='bounce_retry' then
    select * into v_remediation from public.report_delivery_remediations
    where id=p_bounce_remediation_id and report_id=p_report_id
      and corrected_recipient_email=lower(trim(p_recipient))
      and recipient_email=lower(trim(p_recipient))
      and remediation_type='bounce_retry' and status='authorised'
      and customer_update_applied_at is not null
    for update;
    if not found then raise exception 'delivery_bounce_remediation_required'; end if;
    select * into v_prior_bounce from public.email_events
    where id=v_remediation.prior_email_event_id and report_id=p_report_id
      and recipient_email=v_remediation.previous_recipient_email
      and notification_type='premium_report_pdf' and status='bounced'
    for share;
    if not found then raise exception 'delivery_bounce_remediation_prior_event_invalid'; end if;
  elsif p_bounce_remediation_id is not null then
    raise exception 'delivery_bounce_remediation_not_applicable';
  end if;
  if p_delivery_mode='initial' then
    select * into v_event from public.email_events
    where report_id=p_report_id and recipient_email=lower(trim(p_recipient))
      and notification_type='premium_report_pdf'
      and status in ('sent','delivery_delayed','delivered','bounced','complained')
    order by created_at desc limit 1;
    if found then
      return jsonb_build_object('reused_existing_send',true,'email_event_id',v_event.id,
        'provider_message_id',v_event.provider_message_id,'status',v_event.status,
        'recipient',lower(trim(p_recipient)),'test_delivery',(v_context->>'test_delivery')::boolean);
    end if;
  end if;
  select count(*)+1 into v_attempt from public.email_events where report_id=p_report_id;
  v_dedupe := 'premium-report-delivery:' || p_report_id || ':' || lower(trim(p_recipient))
    || ':attempt-' || v_attempt;
  insert into public.email_events(
    assessment_id,order_id,report_id,recipient_email,template_key,notification_type,
    dedupe_key,provider_request_key,provider_idempotency_key,provider,status,
    attempt_number,metadata_json
  ) values (
    (v_context->>'assessment_id')::uuid,(v_context->>'order_id')::uuid,p_report_id,
    lower(trim(p_recipient)),'premium_report_pdf_v1','premium_report_pdf',v_dedupe,
    v_dedupe,v_dedupe,lower(trim(p_provider)),'queued',v_attempt,
    jsonb_build_object('attachment_checksum',v_context->>'report_checksum',
      'test_delivery',(v_context->>'test_delivery')::boolean,
      'bounce_remediation_id',p_bounce_remediation_id)
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
    lower(trim(p_provider)),v_event.id,(v_context->>'test_delivery')::boolean,
    p_bounce_remediation_id
  ) returning * into v_auth;
  if p_bounce_remediation_id is not null then
    update public.report_delivery_remediations
    set status='consumed',consumed_at=now()
    where id=p_bounce_remediation_id and status='authorised';
    if not found then raise exception 'delivery_bounce_remediation_consume_cas_failed'; end if;
  end if;
  return jsonb_build_object('reused_existing_send',false,'authorization_id',v_auth.id,
    'email_event_id',v_event.id,'provider_request_key',v_event.provider_request_key,
    'attempt_number',v_event.attempt_number,'recipient',v_auth.recipient_email,
    'test_delivery',v_auth.test_delivery,'status',v_auth.status);
end;
$function$;

-- 11. Runtime grant inventory: generic service clients can read only where
-- explicitly needed and mutate solely through the reviewed facades.
do $phase14_grants$
declare v_function record;
begin
  for v_function in
    select n.nspname,p.proname,pg_get_function_identity_arguments(p.oid) as args
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname=any(array[
      'authorize_bounced_report_redelivery','authorize_phase14_worker_action',
      'authorize_phase14_worker_operation','authorize_premium_report_delivery',
      'claim_phase14_ai_attempt','claim_phase14_storage_cleanup_jobs',
      'claim_phase14_worker_operation','claim_premium_report_workflow_start',
      'cleanup_expired_premium_report_claims','complete_phase14_storage_cleanup_job',
      'complete_phase14_generation_operation','complete_phase14_worker_operation',
      'finalize_premium_report_delivery','get_phase14_provider_attestation',
      'ingest_phase14_provider_webhook','link_premium_report_generation_run',
      'phase14_activate_worker_operation',
      'queue_premium_report_fulfilment','record_phase14_operational_alert',
      'record_phase14_provider_lookup_attestation','record_phase14_report_download',
      'record_phase14_report_generated','record_premium_report_generation_run',
      'record_premium_report_workflow_start','renew_phase14_worker_operation',
      'resolve_premium_report_delivery_reconciliation','set_phase14_ai_route_policy',
      'set_phase14_feature_policy','set_phase14_runtime_secret',
      'set_phase14_security_gate_version',
      'settle_phase14_ai_attempt','suspend_phase14_security_gate',
      'transition_premium_report_fulfilment','worker_abandon_premium_report_generation_claim',
      'worker_authorize_premium_report_delivery','worker_claim_premium_report_delivery',
      'worker_claim_premium_report_generation','worker_cleanup_expired_premium_report_claims',
      'worker_commit_premium_report_draft','worker_fail_premium_report_delivery_before_dispatch',
      'worker_finalize_premium_report_delivery','worker_link_phase14_storage_cleanup_report',
      'worker_mark_premium_report_delivery_dispatch_started',
      'worker_mark_premium_report_delivery_reconciliation_required',
      'worker_publish_premium_report_generation','worker_record_phase14_storage_cleanup_result',
      'worker_recover_premium_report_generation_claim',
      'worker_recover_stale_premium_report_email_send','worker_register_phase14_storage_cleanup',
      'worker_renew_premium_report_generation_lease'
    ])
  loop
    execute format('revoke all on function %I.%I(%s) from public,anon,authenticated,service_role',
      v_function.nspname,v_function.proname,v_function.args);
  end loop;
  execute 'revoke insert,update,delete,truncate on public.report_fulfilments,
    public.report_generation_runs,public.report_ai_attempts,public.report_generation_claims,
    public.report_delivery_authorizations,public.report_delivery_finalizations,
    public.phase14_operational_alerts,
    public.phase14_storage_cleanup_queue,public.report_delivery_remediations,
    public.phase14_provider_attestations,public.phase14_provider_attestation_consumptions
    from service_role';
  execute 'revoke truncate on public.audit_logs,public.report_events,
    public.assessment_events,public.email_events,public.email_provider_events
    from service_role';
  execute 'revoke execute on function public.claim_phase14_worker_capability(uuid,text) from public,anon,authenticated,service_role';
  execute 'revoke execute on function public.complete_phase14_worker_capability(uuid,text) from public,anon,authenticated,service_role';
  execute 'revoke execute on function public.apply_email_provider_event_atomic(text,text,text,text,timestamptz,text,jsonb) from public,anon,authenticated,service_role';
  execute 'revoke execute on function public.claim_phase14_storage_cleanup_jobs(uuid,text,integer) from public,anon,authenticated,service_role';
  execute 'revoke execute on function public.complete_phase14_storage_cleanup_job(uuid,text,uuid,uuid,boolean,text) from public,anon,authenticated,service_role';
  execute 'revoke execute on function public.resolve_premium_report_delivery_reconciliation(uuid,text,text,jsonb,boolean,text) from public,anon,authenticated,service_role';
  execute 'revoke execute on function public.authorize_bounced_report_redelivery(uuid,text,jsonb) from public,anon,authenticated,service_role';
  execute 'grant execute on function public.claim_phase14_worker_operation(uuid,text),
    public.renew_phase14_worker_operation(uuid,text),public.complete_phase14_worker_operation(uuid),
    public.authorize_phase14_worker_action(uuid,text),
    public.claim_premium_report_workflow_start(uuid,uuid),
    public.record_premium_report_workflow_start(uuid,uuid,boolean,text,text),
    public.worker_cleanup_expired_premium_report_claims(uuid,interval),
    public.claim_phase14_storage_cleanup_jobs(uuid,integer),
    public.complete_phase14_storage_cleanup_job(uuid,uuid,uuid,text,text,text,boolean,boolean,text),
    public.ingest_phase14_provider_webhook(text,text,text,text,text,text,jsonb,bigint,uuid,text),
    public.get_phase14_provider_attestation(uuid),
    public.record_phase14_provider_lookup_attestation(text,text,uuid,uuid,text,text,text,jsonb,bigint,uuid,text),
    public.claim_phase14_ai_attempt(uuid,jsonb),public.settle_phase14_ai_attempt(uuid,uuid,jsonb),
    public.transition_premium_report_fulfilment(uuid,uuid,text,text,text,uuid,boolean,text,text),
    public.record_premium_report_generation_run(uuid,uuid,jsonb),
    public.link_premium_report_generation_run(uuid,uuid,uuid),
    public.record_phase14_report_generated(uuid,uuid,uuid,text,text,jsonb),
    public.complete_phase14_generation_operation(uuid,uuid,uuid,uuid,text,uuid,text,text,jsonb),
    public.record_phase14_operational_alert(text,text,uuid,uuid,jsonb,text),
    public.worker_claim_premium_report_generation(uuid,text,text,uuid,public.report_type),
    public.worker_renew_premium_report_generation_lease(uuid,uuid),
    public.worker_recover_premium_report_generation_claim(uuid,text,text,uuid),
    public.worker_commit_premium_report_draft(uuid,uuid,uuid,text,text,text,uuid),
    public.worker_publish_premium_report_generation(uuid,uuid,uuid),
    public.worker_abandon_premium_report_generation_claim(uuid,uuid,text),
    public.worker_register_phase14_storage_cleanup(uuid,text,text,text,uuid,text),
    public.worker_link_phase14_storage_cleanup_report(uuid,uuid,uuid),
    public.worker_record_phase14_storage_cleanup_result(uuid,uuid,boolean,text),
    public.worker_authorize_premium_report_delivery(uuid,uuid,text,text),
    public.worker_claim_premium_report_delivery(uuid,uuid),
    public.worker_mark_premium_report_delivery_dispatch_started(uuid,uuid,uuid),
    public.worker_fail_premium_report_delivery_before_dispatch(uuid,uuid,uuid,text),
    public.worker_finalize_premium_report_delivery(uuid,uuid,uuid,text),
    public.worker_mark_premium_report_delivery_reconciliation_required(uuid,uuid,text,text)
    to service_role';
  execute 'grant execute on function public.set_phase14_ai_route_policy(text,boolean),
    public.set_phase14_feature_policy(text,boolean,text),
    public.set_phase14_security_gate_version(integer,text),
    public.suspend_phase14_security_gate(text),
    public.set_phase14_runtime_secret(text,text),
    public.authorize_phase14_worker_operation(text,text,uuid,uuid,uuid,uuid,uuid,text,integer,text),
    public.queue_premium_report_fulfilment(text,text),
    public.transition_premium_report_fulfilment(uuid,uuid,text,text,text,uuid,boolean,text,text),
    public.record_premium_report_generation_run(uuid,uuid,jsonb),
    public.link_premium_report_generation_run(uuid,uuid,uuid),
    public.record_phase14_report_generated(uuid,uuid,uuid,text,text,jsonb),
    public.record_phase14_report_download(uuid,boolean,jsonb),
    public.authorize_premium_report_delivery(uuid,text,text,boolean,text,uuid),
    public.finalize_premium_report_delivery(uuid,uuid,text),
    public.authorize_bounced_report_redelivery(uuid,text,text,jsonb),
    public.resolve_premium_report_delivery_reconciliation(uuid,text,uuid,boolean,text)
    to authenticated';
end;
$phase14_grants$;

commit;
