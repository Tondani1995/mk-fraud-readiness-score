-- MK Fraud Readiness Platform V2 - Phases 2-3 payment automation.
-- Additive payment state, event idempotency and a payment-owned Phase 1 request claim.
-- Requires the reviewed 0023 Phase 1 migration. Does not use or activate 0017-0022.

create table public.payment_automation_records (
  order_id uuid primary key references public.orders(id) on delete cascade,
  state text not null default 'PAYMENT_PENDING' check (state in (
    'PAYMENT_PENDING','PAYMENT_PROCESSING','PAID','PAYMENT_FAILED',
    'PAYMENT_REVIEW_REQUIRED','REFUNDED','CANCELLED'
  )),
  expected_amount_cents integer not null check (expected_amount_cents >= 0),
  received_amount_cents integer check (received_amount_cents is null or received_amount_cents >= 0),
  currency text not null,
  confirmation_source text check (confirmation_source in ('manual_admin','stitch_webhook','system_recovery')),
  actor_reference text,
  provider_transaction_reference text,
  provider_event_reference text,
  verification_result text,
  review_reason text,
  fulfilment_trigger_result text not null default 'NOT_REQUESTED' check (fulfilment_trigger_result in (
    'NOT_REQUESTED','PHASE1_UNAVAILABLE','QUEUED','ALREADY_ACTIVE','ALREADY_FULFILLED','FAILED'
  )),
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payment_transition_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  order_reference text not null,
  old_state text not null,
  new_state text not null,
  source text not null check (source in ('manual_admin','stitch_webhook','system_recovery')),
  actor_reference text,
  amount_cents integer,
  currency text,
  provider_transaction_reference text,
  provider_event_reference text,
  provider_event_at timestamptz,
  safe_note text,
  verification_result text not null,
  idempotency_key text not null unique,
  technical_reference text not null,
  payload_sha256 text,
  processing_result text not null default 'applied' check (processing_result in ('applied','duplicate','rejected')),
  created_at timestamptz not null default now()
);

create unique index payment_transition_provider_event_uidx
  on public.payment_transition_events(source, provider_event_reference)
  where provider_event_reference is not null;
create index payment_transition_order_created_idx
  on public.payment_transition_events(order_id, created_at desc);
create index payment_automation_state_updated_idx
  on public.payment_automation_records(state, updated_at desc);

create table public.payment_unmatched_events (
  id uuid primary key default gen_random_uuid(),
  provider_event_reference text not null unique,
  supplied_order_reference text,
  source text not null,
  rejection_reason text not null,
  payload_sha256 text,
  technical_reference text not null,
  created_at timestamptz not null default now()
);

create table public.payment_sessions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  provider_mode text not null check (provider_mode in ('disabled','double')),
  provider_session_reference text not null unique,
  return_token_hash text not null unique,
  status text not null default 'created' check (status in ('created','redirected','expired','cancelled')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index payment_sessions_order_created_idx on public.payment_sessions(order_id, created_at desc);

alter table public.payment_automation_records enable row level security;
alter table public.payment_transition_events enable row level security;
alter table public.payment_unmatched_events enable row level security;
alter table public.payment_sessions enable row level security;

revoke all on public.payment_automation_records, public.payment_transition_events,
  public.payment_unmatched_events, public.payment_sessions from public, anon, authenticated;
grant select, insert, update on public.payment_automation_records to service_role;
grant select, insert on public.payment_transition_events, public.payment_unmatched_events to service_role;
grant select, insert, update on public.payment_sessions to service_role;

create policy payment_automation_admin_select on public.payment_automation_records
  for select to authenticated
  using (public.current_admin_role() in ('platform_admin','finance_admin','reviewer','approver','read_only_admin'));
create policy payment_transition_admin_select on public.payment_transition_events
  for select to authenticated
  using (public.current_admin_role() in ('platform_admin','finance_admin','reviewer','approver','read_only_admin'));
create policy payment_unmatched_admin_select on public.payment_unmatched_events
  for select to authenticated
  using (public.current_admin_role() in ('platform_admin','finance_admin','read_only_admin'));

-- Payment-triggered requests are system-owned; admin-triggered requests retain their required actor.
alter table public.manual_report_generation_attempts alter column requested_by drop not null;
alter table public.manual_report_generation_attempts drop constraint if exists manual_report_generation_attempts_trigger_source_check;
alter table public.manual_report_generation_attempts add constraint manual_report_generation_attempts_trigger_source_check
  check (trigger_source in ('admin_generate','admin_retry','admin_regenerate','payment_confirmation'));

create or replace function public.record_payment_transition(
  p_order_reference text,
  p_new_state text,
  p_source text,
  p_actor_reference text,
  p_amount_cents integer,
  p_currency text,
  p_provider_transaction_reference text,
  p_provider_event_reference text,
  p_provider_event_at timestamptz,
  p_safe_note text,
  p_verification_result text,
  p_idempotency_key text,
  p_technical_reference text,
  p_payload_sha256 text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_record public.payment_automation_records%rowtype;
  v_existing public.payment_transition_events%rowtype;
  v_old_state text;
  v_allowed boolean := false;
  v_event public.payment_transition_events%rowtype;
begin
  if p_new_state not in ('PAYMENT_PENDING','PAYMENT_PROCESSING','PAID','PAYMENT_FAILED','PAYMENT_REVIEW_REQUIRED','REFUNDED','CANCELLED')
     or p_source not in ('manual_admin','stitch_webhook','system_recovery')
     or coalesce(trim(p_idempotency_key),'') = ''
     or coalesce(trim(p_technical_reference),'') = '' then
    raise exception 'payment_transition_invalid_input';
  end if;

  select * into v_existing from public.payment_transition_events where idempotency_key=p_idempotency_key;
  if found then
    return jsonb_build_object('applied',false,'duplicate',true,'state',v_existing.new_state,'event_id',v_existing.id);
  end if;

  select * into v_order from public.orders where order_reference=p_order_reference for update;
  if not found then raise exception 'payment_order_not_found'; end if;

  insert into public.payment_automation_records(order_id,state,expected_amount_cents,currency)
  values(v_order.id,
    case when v_order.status::text='payment_received' then 'PAID'
         when v_order.status::text in ('cancelled','expired') then 'CANCELLED'
         else 'PAYMENT_PENDING' end,
    v_order.amount_cents,v_order.currency)
  on conflict(order_id) do nothing;

  select * into v_record from public.payment_automation_records where order_id=v_order.id for update;
  v_old_state := v_record.state;

  if v_old_state=p_new_state then
    select * into v_existing from public.payment_transition_events
      where order_id=v_order.id and new_state=p_new_state order by created_at desc limit 1;
    return jsonb_build_object('applied',false,'duplicate',true,'state',p_new_state,'event_id',v_existing.id);
  elsif v_old_state='PAYMENT_PENDING' and p_new_state in ('PAYMENT_PROCESSING','PAID','PAYMENT_FAILED','PAYMENT_REVIEW_REQUIRED','CANCELLED') then v_allowed := true;
  elsif v_old_state='PAYMENT_PROCESSING' and p_new_state in ('PAID','PAYMENT_FAILED','PAYMENT_REVIEW_REQUIRED','CANCELLED') then v_allowed := true;
  elsif v_old_state='PAYMENT_FAILED' and p_new_state in ('PAYMENT_PROCESSING','PAYMENT_REVIEW_REQUIRED','CANCELLED') then v_allowed := true;
  elsif v_old_state='PAYMENT_REVIEW_REQUIRED' and p_new_state in ('PAYMENT_PROCESSING','PAID','PAYMENT_FAILED','REFUNDED','CANCELLED') then v_allowed := true;
  elsif v_old_state='PAID' and p_new_state in ('PAYMENT_REVIEW_REQUIRED','REFUNDED') then v_allowed := true;
  end if;
  if not v_allowed then raise exception 'payment_transition_not_allowed:%->%',v_old_state,p_new_state; end if;

  insert into public.payment_transition_events(
    order_id,order_reference,old_state,new_state,source,actor_reference,amount_cents,currency,
    provider_transaction_reference,provider_event_reference,provider_event_at,safe_note,
    verification_result,idempotency_key,technical_reference,payload_sha256
  ) values(
    v_order.id,v_order.order_reference,v_old_state,p_new_state,p_source,left(p_actor_reference,200),p_amount_cents,upper(p_currency),
    left(p_provider_transaction_reference,300),left(p_provider_event_reference,300),p_provider_event_at,left(p_safe_note,500),
    left(p_verification_result,100),left(p_idempotency_key,300),left(p_technical_reference,200),p_payload_sha256
  ) returning * into v_event;

  update public.payment_automation_records set
    state=p_new_state,
    received_amount_cents=p_amount_cents,
    currency=upper(p_currency),
    confirmation_source=p_source,
    actor_reference=left(p_actor_reference,200),
    provider_transaction_reference=left(p_provider_transaction_reference,300),
    provider_event_reference=left(p_provider_event_reference,300),
    verification_result=left(p_verification_result,100),
    review_reason=case when p_new_state='PAYMENT_REVIEW_REQUIRED' then left(p_safe_note,500) else null end,
    last_event_at=coalesce(p_provider_event_at,now()),updated_at=now()
  where order_id=v_order.id;

  update public.orders set
    status=case
      when p_new_state='PAID' then 'payment_received'::public.order_status
      when p_new_state in ('CANCELLED','REFUNDED') then 'cancelled'::public.order_status
      else 'awaiting_payment'::public.order_status end,
    verified_at=case when p_new_state='PAID' then now() else verified_at end,
    verified_by=case when p_new_state='PAID' and p_source='manual_admin' and p_actor_reference ~* '^[0-9a-f-]{36}$'
      then p_actor_reference::uuid else verified_by end,
    updated_at=now()
  where id=v_order.id;

  insert into public.order_events(order_id,event_type,previous_status,new_status,note,actor_admin_user_id,metadata_json)
  values(v_order.id,'payment_transition',v_order.status,
    case when p_new_state='PAID' then 'payment_received'::public.order_status
         when p_new_state in ('CANCELLED','REFUNDED') then 'cancelled'::public.order_status
         else 'awaiting_payment'::public.order_status end,
    left(p_safe_note,500),
    case when p_source='manual_admin' and p_actor_reference ~* '^[0-9a-f-]{36}$' then p_actor_reference::uuid else null end,
    jsonb_build_object('payment_state',p_new_state,'source',p_source,'verification_result',p_verification_result,
      'provider_event_reference',p_provider_event_reference,'technical_reference',p_technical_reference));

  return jsonb_build_object('applied',true,'duplicate',false,'state',p_new_state,'event_id',v_event.id,'order_id',v_order.id);
exception when unique_violation then
  select * into v_existing from public.payment_transition_events
    where idempotency_key=p_idempotency_key
       or (provider_event_reference is not null and provider_event_reference=p_provider_event_reference and source=p_source)
    order by created_at limit 1;
  if found then return jsonb_build_object('applied',false,'duplicate',true,'state',v_existing.new_state,'event_id',v_existing.id); end if;
  raise;
end $$;

create or replace function public.record_unmatched_payment_event(
  p_provider_event_reference text,p_order_reference text,p_source text,p_reason text,
  p_payload_sha256 text,p_technical_reference text
) returns void language sql security definer set search_path=public,pg_temp as $$
  insert into public.payment_unmatched_events(provider_event_reference,supplied_order_reference,source,rejection_reason,payload_sha256,technical_reference)
  values(left(p_provider_event_reference,300),left(p_order_reference,200),left(p_source,50),left(p_reason,300),p_payload_sha256,left(p_technical_reference,200))
  on conflict(provider_event_reference) do nothing;
$$;

create or replace function public.claim_payment_report_generation(
  p_order_reference text,p_request_key text,p_technical_reference text
) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_order public.orders%rowtype;
  v_assessment public.assessments%rowtype;
  v_score public.score_runs%rowtype;
  v_payment public.payment_automation_records%rowtype;
  v_existing public.manual_report_generation_attempts%rowtype;
  v_active public.manual_report_generation_attempts%rowtype;
  v_ready public.reports%rowtype;
  v_attempt public.manual_report_generation_attempts%rowtype;
  v_version integer;
begin
  select * into v_existing from public.manual_report_generation_attempts where request_key=p_request_key;
  if found then return jsonb_build_object('claimed',false,'reason','idempotent_replay','attempt',to_jsonb(v_existing)); end if;
  select * into v_order from public.orders where order_reference=p_order_reference for update;
  if not found then raise exception 'phase1_order_not_found'; end if;
  select * into v_payment from public.payment_automation_records where order_id=v_order.id;
  if not found or v_payment.state<>'PAID' or v_order.status::text<>'payment_received' then raise exception 'phase1_order_not_eligible'; end if;
  select * into v_assessment from public.assessments where id=v_order.assessment_id;
  if not found or v_assessment.current_score_run_id is null or v_assessment.status not in ('scored','snapshot_available','report_requested','under_review','closed') then raise exception 'phase1_assessment_incomplete'; end if;
  select * into v_score from public.score_runs where id=v_assessment.current_score_run_id and status='completed';
  if not found or v_score.locked_at is null then raise exception 'phase1_assessment_incomplete'; end if;
  select * into v_active from public.manual_report_generation_attempts
    where order_id=v_order.id and status in ('REPORT_QUEUED','REPORT_GENERATING') limit 1;
  if found then return jsonb_build_object('claimed',false,'reason','already_active','attempt',to_jsonb(v_active)); end if;
  select * into v_ready from public.reports where order_id=v_order.id and storage_status='VERIFIED'
    and status not in ('superseded','voided') order by version_number desc limit 1;
  if found then return jsonb_build_object('claimed',false,'reason','report_exists','report',to_jsonb(v_ready)); end if;
  select coalesce(max(version_number),0)+1 into v_version from public.reports where order_id=v_order.id;
  insert into public.manual_report_generation_attempts(
    request_key,order_id,report_version,trigger_source,requested_by,status,retry_count,technical_reference
  ) values(p_request_key,v_order.id,v_version,'payment_confirmation',null,'REPORT_QUEUED',0,p_technical_reference)
  returning * into v_attempt;
  insert into public.order_events(order_id,event_type,note,metadata_json)
  values(v_order.id,'generation_requested','Verified payment queued deterministic Phase 1 generation.',
    jsonb_build_object('attempt_id',v_attempt.id,'source','payment_confirmation','technical_reference',p_technical_reference));
  return jsonb_build_object('claimed',true,'reason','claimed','attempt',to_jsonb(v_attempt));
end $$;

create or replace function public.payment_automation_capability() returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_missing text[] := array[]::text[]; v_permissions text[] := array[]::text[];
begin
  if to_regclass('public.payment_automation_records') is null then v_missing:=array_append(v_missing,'payment_automation_records'); end if;
  if to_regclass('public.payment_transition_events') is null then v_missing:=array_append(v_missing,'payment_transition_events'); end if;
  if to_regclass('public.payment_sessions') is null then v_missing:=array_append(v_missing,'payment_sessions'); end if;
  if to_regprocedure('public.record_payment_transition(text,text,text,text,integer,text,text,text,timestamp with time zone,text,text,text,text,text)') is null then v_missing:=array_append(v_missing,'record_payment_transition'); end if;
  if to_regprocedure('public.claim_payment_report_generation(text,text,text)') is null then v_missing:=array_append(v_missing,'claim_payment_report_generation'); end if;
  if not has_table_privilege('service_role','public.payment_automation_records','SELECT,INSERT,UPDATE') then v_permissions:=array_append(v_permissions,'payment_automation_records'); end if;
  return jsonb_build_object('status',case when cardinality(v_permissions)>0 then 'error' when cardinality(v_missing)=0 then 'available' else 'unavailable' end,
    'available',cardinality(v_missing)=0 and cardinality(v_permissions)=0,'schema_version','0024','missing_objects',v_missing,'missing_permissions',v_permissions);
end $$;

revoke all on function public.record_payment_transition(text,text,text,text,integer,text,text,text,timestamptz,text,text,text,text,text),
  public.record_unmatched_payment_event(text,text,text,text,text,text),
  public.claim_payment_report_generation(text,text,text),
  public.payment_automation_capability() from public,anon,authenticated;
grant execute on function public.record_payment_transition(text,text,text,text,integer,text,text,text,timestamptz,text,text,text,text,text),
  public.record_unmatched_payment_event(text,text,text,text,text,text),
  public.claim_payment_report_generation(text,text,text), public.payment_automation_capability() to service_role;

insert into public.app_settings(setting_key,value_json) values(
  'v2_phase23_payment_automation',
  '{"schema_version":"0024","provider_mode":"disabled","phase14_enabled":false}'::jsonb
) on conflict(setting_key) do update set value_json=excluded.value_json,updated_at=now();
