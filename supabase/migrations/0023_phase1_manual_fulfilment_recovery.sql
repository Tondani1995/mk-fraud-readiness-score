-- MK Fraud Readiness Platform V2 - Phase 1 manual fulfilment recovery.
-- Additive, production-compatible state for the permitted synchronous/manual model.
-- This migration is intentionally independent of, and does not enable, migration 0017.

alter table public.reports
  add column if not exists organisation_id uuid references public.organisations(id) on delete set null,
  add column if not exists file_name text,
  add column if not exists mime_type text,
  add column if not exists file_size_bytes bigint,
  add column if not exists storage_status text not null default 'NOT_STORED',
  add column if not exists storage_verified_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'reports_phase1_storage_status_chk'
  ) then
    alter table public.reports add constraint reports_phase1_storage_status_chk
      check (storage_status in ('NOT_STORED','STORING','VERIFIED','MISSING','FAILED'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'reports_phase1_file_size_chk'
  ) then
    alter table public.reports add constraint reports_phase1_file_size_chk
      check (file_size_bytes is null or file_size_bytes > 0);
  end if;
end $$;

update public.reports r
set organisation_id = a.organisation_id,
    file_name = coalesce(r.file_name, regexp_replace(r.report_reference, '[^A-Za-z0-9._-]', '_', 'g') || '.pdf'),
    mime_type = case when r.storage_path is not null then coalesce(r.mime_type, 'application/pdf') else r.mime_type end,
    storage_status = r.storage_status,
    storage_verified_at = r.storage_verified_at
from public.assessments a
where a.id = r.assessment_id;

create index if not exists reports_order_version_idx on public.reports(order_id, version_number desc);
create index if not exists reports_organisation_idx on public.reports(organisation_id);
create index if not exists reports_storage_status_idx on public.reports(storage_status);

create table if not exists public.manual_report_generation_attempts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null default gen_random_uuid(),
  request_key text not null unique,
  order_id uuid not null references public.orders(id) on delete cascade,
  report_version integer not null check (report_version > 0),
  trigger_source text not null check (trigger_source in ('admin_generate','admin_retry','admin_regenerate')),
  requested_by uuid not null references public.admin_profiles(id) on delete restrict,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  status text not null default 'REPORT_QUEUED' check (status in (
    'NOT_REQUESTED','REPORT_QUEUED','REPORT_GENERATING','REPORT_READY','GENERATION_FAILED'
  )),
  retry_count integer not null default 0 check (retry_count >= 0),
  error_category text,
  safe_operational_error text,
  technical_reference text not null,
  output_report_id uuid references public.reports(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists manual_report_generation_one_active_order_uidx
  on public.manual_report_generation_attempts(order_id)
  where status in ('REPORT_QUEUED','REPORT_GENERATING');
create index if not exists manual_report_generation_order_created_idx
  on public.manual_report_generation_attempts(order_id, created_at desc);
create index if not exists manual_report_generation_status_created_idx
  on public.manual_report_generation_attempts(status, created_at desc);
create unique index if not exists manual_report_generation_request_id_uidx
  on public.manual_report_generation_attempts(request_id);

create table if not exists public.manual_report_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null default gen_random_uuid(),
  request_key text not null unique,
  order_id uuid not null references public.orders(id) on delete cascade,
  report_id uuid not null references public.reports(id) on delete restrict,
  requested_by uuid not null references public.admin_profiles(id) on delete restrict,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  status text not null default 'DELIVERY_PENDING' check (status in (
    'NOT_READY','DELIVERY_PENDING','DELIVERING','DELIVERED','DELIVERY_FAILED'
  )),
  retry_count integer not null default 0 check (retry_count >= 0),
  recipient_email public.citext,
  provider_mode text not null default 'disabled' check (provider_mode in ('disabled','double')),
  error_category text,
  safe_operational_error text,
  technical_reference text not null,
  email_event_id uuid references public.email_events(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists manual_report_delivery_one_active_report_uidx
  on public.manual_report_delivery_attempts(report_id)
  where status in ('DELIVERY_PENDING','DELIVERING');
create index if not exists manual_report_delivery_order_created_idx
  on public.manual_report_delivery_attempts(order_id, created_at desc);
create index if not exists manual_report_delivery_status_created_idx
  on public.manual_report_delivery_attempts(status, created_at desc);
create unique index if not exists manual_report_delivery_request_id_uidx
  on public.manual_report_delivery_attempts(request_id);

insert into public.order_events(order_id,event_type,note,metadata_json,created_at)
select o.id,'assessment_completed','Assessment completion is linked to this existing order.',
  jsonb_build_object('actor_type','system','assessment_reference',a.assessment_reference),
  coalesce(a.submitted_at,o.created_at)
from public.orders o
join public.assessments a on a.id=o.assessment_id
where a.submitted_at is not null
  and not exists (
    select 1 from public.order_events e
    where e.order_id=o.id and e.event_type='assessment_completed'
  );

alter table public.email_events
  add column if not exists request_id uuid,
  add column if not exists provider_mode text not null default 'disabled',
  add column if not exists retry_count integer not null default 0,
  add column if not exists updated_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'email_events_phase1_provider_mode_chk'
  ) then
    alter table public.email_events add constraint email_events_phase1_provider_mode_chk
      check (provider_mode in ('disabled','double','external'));
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'email_events_phase1_retry_count_chk'
  ) then
    alter table public.email_events add constraint email_events_phase1_retry_count_chk
      check (retry_count >= 0);
  end if;
end $$;

alter table public.manual_report_generation_attempts enable row level security;
alter table public.manual_report_delivery_attempts enable row level security;
revoke all on public.manual_report_generation_attempts from anon, authenticated;
revoke all on public.manual_report_delivery_attempts from anon, authenticated;
grant select on public.manual_report_generation_attempts to authenticated;
grant select on public.manual_report_delivery_attempts to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'manual_report_generation_attempts'
      and policyname = 'manual_report_generation_attempts_admin_select'
  ) then
    create policy manual_report_generation_attempts_admin_select
      on public.manual_report_generation_attempts for select
      using (public.current_admin_role() in ('platform_admin','reviewer','approver','finance_admin','read_only_admin'));
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public'
      and tablename = 'manual_report_delivery_attempts'
      and policyname = 'manual_report_delivery_attempts_admin_select'
  ) then
    create policy manual_report_delivery_attempts_admin_select
      on public.manual_report_delivery_attempts for select
      using (public.current_admin_role() in ('platform_admin','reviewer','approver','finance_admin','read_only_admin'));
  end if;
end $$;

create or replace function public.claim_manual_report_generation(
  p_order_reference text,
  p_requested_by uuid,
  p_request_key text,
  p_trigger_source text,
  p_technical_reference text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_order public.orders%rowtype;
  v_assessment public.assessments%rowtype;
  v_score public.score_runs%rowtype;
  v_profile public.admin_profiles%rowtype;
  v_active public.manual_report_generation_attempts%rowtype;
  v_existing public.manual_report_generation_attempts%rowtype;
  v_ready public.reports%rowtype;
  v_attempt public.manual_report_generation_attempts%rowtype;
  v_version integer;
  v_retries integer;
begin
  if coalesce(trim(p_request_key),'') = '' or coalesce(trim(p_technical_reference),'') = '' then
    raise exception 'phase1_request_identity_required';
  end if;
  if p_trigger_source not in ('admin_generate','admin_retry','admin_regenerate') then
    raise exception 'phase1_generation_trigger_invalid';
  end if;

  select * into v_profile from public.admin_profiles where id = p_requested_by and status = 'active';
  if not found or v_profile.role not in ('platform_admin','reviewer','approver') then
    raise exception 'phase1_generation_permission_denied';
  end if;
  if p_trigger_source = 'admin_regenerate' and v_profile.role not in ('platform_admin','approver') then
    raise exception 'phase1_regeneration_permission_denied';
  end if;

  select * into v_existing from public.manual_report_generation_attempts where request_key = p_request_key;
  if found then
    return jsonb_build_object('claimed', false, 'reason', 'idempotent_replay', 'attempt', to_jsonb(v_existing));
  end if;

  select * into v_order from public.orders where order_reference = p_order_reference for update;
  if not found then raise exception 'phase1_order_not_found'; end if;
  if v_order.status <> 'payment_received' then raise exception 'phase1_order_not_eligible'; end if;

  select * into v_assessment from public.assessments where id = v_order.assessment_id;
  if not found or v_assessment.current_score_run_id is null
     or v_assessment.status not in ('scored','snapshot_available','report_requested','under_review','closed') then
    raise exception 'phase1_assessment_incomplete';
  end if;
  select * into v_score from public.score_runs
    where id = v_assessment.current_score_run_id and status = 'completed';
  if not found or v_score.locked_at is null then raise exception 'phase1_assessment_incomplete'; end if;

  select * into v_active from public.manual_report_generation_attempts
    where order_id = v_order.id and status in ('REPORT_QUEUED','REPORT_GENERATING')
    order by created_at desc limit 1;
  if found then
    if p_trigger_source = 'admin_retry' and v_active.updated_at < now() - interval '15 minutes' then
      update public.manual_report_generation_attempts
      set status='GENERATION_FAILED',completed_at=now(),updated_at=now(),
          error_category='generation_stuck_recovered',
          safe_operational_error='The previous generation attempt stopped responding and was closed for an authorised retry.'
      where id=v_active.id;
      insert into public.order_events(order_id,event_type,actor_admin_user_id,note,metadata_json)
      values(v_order.id,'generation_failed',p_requested_by,
        'The previous generation attempt stopped responding and was closed for an authorised retry.',
        jsonb_build_object('attempt_id',v_active.id,'technical_reference',v_active.technical_reference,
          'retry_count',v_active.retry_count,'error_category','generation_stuck_recovered'));
    else
      return jsonb_build_object('claimed', false, 'reason', 'already_active', 'attempt', to_jsonb(v_active));
    end if;
  end if;

  select * into v_ready from public.reports
    where order_id = v_order.id and storage_bucket is not null and storage_path is not null
      and checksum is not null and storage_status not in ('MISSING','FAILED')
      and status not in ('superseded','voided')
    order by version_number desc limit 1;
  if found and p_trigger_source = 'admin_retry' and v_profile.role not in ('platform_admin','approver') then
    raise exception 'phase1_regeneration_permission_denied';
  end if;
  if found and p_trigger_source = 'admin_generate' then
    return jsonb_build_object('claimed', false, 'reason', 'report_exists', 'report', to_jsonb(v_ready));
  end if;

  select coalesce(max(version_number),0) + 1 into v_version
    from public.reports where order_id = v_order.id;
  select count(*)::integer into v_retries
    from public.manual_report_generation_attempts
    where order_id = v_order.id and status = 'GENERATION_FAILED';

  begin
    insert into public.manual_report_generation_attempts (
      request_key, order_id, report_version, trigger_source, requested_by,
      status, retry_count, technical_reference
    ) values (
      p_request_key, v_order.id, v_version, p_trigger_source, p_requested_by,
      'REPORT_QUEUED', v_retries, p_technical_reference
    ) returning * into v_attempt;
  exception when unique_violation then
    select * into v_active from public.manual_report_generation_attempts
      where order_id = v_order.id and status in ('REPORT_QUEUED','REPORT_GENERATING')
      order by created_at desc limit 1;
    return jsonb_build_object('claimed', false, 'reason', 'already_active', 'attempt', to_jsonb(v_active));
  end;

  insert into public.order_events (
    order_id,event_type,actor_admin_user_id,new_status,note,metadata_json
  ) values (
    v_order.id,'generation_requested',p_requested_by,v_order.status,
    'Manual report generation requested.',
    jsonb_build_object('attempt_id',v_attempt.id,'technical_reference',p_technical_reference,
      'retry_count',v_attempt.retry_count,'report_version',v_attempt.report_version)
  );
  if p_trigger_source = 'admin_retry' then
    insert into public.order_events(order_id,event_type,actor_admin_user_id,note,metadata_json)
    values(v_order.id,'retry_requested',p_requested_by,'Report-generation retry requested.',
      jsonb_build_object('attempt_id',v_attempt.id,'technical_reference',p_technical_reference,
        'retry_count',v_attempt.retry_count,'operation','generation'));
  end if;
  return jsonb_build_object('claimed', true, 'reason', 'created', 'attempt', to_jsonb(v_attempt));
end;
$$;

create or replace function public.start_manual_report_generation(p_attempt_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_attempt public.manual_report_generation_attempts%rowtype;
begin
  update public.manual_report_generation_attempts
  set status='REPORT_GENERATING',started_at=coalesce(started_at,now()),updated_at=now()
  where id=p_attempt_id and status='REPORT_QUEUED'
  returning * into v_attempt;
  if not found then raise exception 'phase1_generation_attempt_not_queued'; end if;
  insert into public.order_events(order_id,event_type,actor_admin_user_id,note,metadata_json)
  values(v_attempt.order_id,'generation_started',v_attempt.requested_by,'Deterministic report generation started.',
    jsonb_build_object('attempt_id',v_attempt.id,'technical_reference',v_attempt.technical_reference,
      'retry_count',v_attempt.retry_count,'report_version',v_attempt.report_version));
  return to_jsonb(v_attempt);
end;
$$;

create or replace function public.complete_manual_report_generation(
  p_attempt_id uuid,
  p_template_id uuid,
  p_report_type public.report_type,
  p_storage_bucket text,
  p_storage_path text,
  p_file_name text,
  p_mime_type text,
  p_file_size_bytes bigint,
  p_checksum text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempt public.manual_report_generation_attempts%rowtype;
  v_order public.orders%rowtype;
  v_assessment public.assessments%rowtype;
  v_previous public.reports%rowtype;
  v_report public.reports%rowtype;
  v_reference text;
begin
  select * into v_attempt from public.manual_report_generation_attempts
    where id=p_attempt_id for update;
  if not found or v_attempt.status <> 'REPORT_GENERATING' then
    raise exception 'phase1_generation_attempt_not_active';
  end if;
  if coalesce(p_file_size_bytes,0) <= 0 or p_mime_type <> 'application/pdf'
     or p_checksum !~ '^[0-9a-f]{64}$'
     or coalesce(trim(p_storage_bucket),'') = '' or coalesce(trim(p_storage_path),'') = '' then
    raise exception 'phase1_report_integrity_invalid';
  end if;
  select * into v_order from public.orders where id=v_attempt.order_id;
  select * into v_assessment from public.assessments where id=v_order.assessment_id;
  if p_storage_bucket <> 'generated-reports'
     or position('/' || v_order.id::text || '/v' || v_attempt.report_version::text || '/' in p_storage_path) = 0
     or p_file_name not like '%.pdf' then
    raise exception 'phase1_report_storage_binding_invalid';
  end if;
  select * into v_previous from public.reports where order_id=v_order.id
    and status not in ('superseded','voided') order by version_number desc limit 1 for update;
  v_reference := 'RPT-' || v_assessment.assessment_reference || '-V' || v_attempt.report_version;

  insert into public.reports (
    assessment_id,organisation_id,order_id,score_run_id,template_id,report_type,status,
    report_reference,version_number,storage_bucket,storage_path,checksum,file_name,mime_type,
    file_size_bytes,storage_status,storage_verified_at,generated_by,generated_at,supersedes_report_id
  ) values (
    v_assessment.id,v_assessment.organisation_id,v_order.id,v_assessment.current_score_run_id,
    p_template_id,p_report_type,'generated',v_reference,v_attempt.report_version,p_storage_bucket,
    p_storage_path,p_checksum,p_file_name,p_mime_type,p_file_size_bytes,'VERIFIED',now(),
    v_attempt.requested_by,now(),v_previous.id
  ) returning * into v_report;

  if v_previous.id is not null then
    update public.reports set status='superseded',updated_at=now() where id=v_previous.id;
  end if;
  update public.manual_report_generation_attempts
  set status='REPORT_READY',output_report_id=v_report.id,completed_at=now(),updated_at=now(),
      safe_operational_error=null,error_category=null
  where id=v_attempt.id;
  insert into public.report_events(report_id,event_type,from_status,to_status,actor_user_id,note,metadata_json)
  values(v_report.id,case when v_previous.id is null then 'generated' else 'regenerated' end,
    'REPORT_GENERATING','REPORT_READY',v_attempt.requested_by,
    'Private report object stored and integrity verified.',
    jsonb_build_object('attempt_id',v_attempt.id,'technical_reference',v_attempt.technical_reference,
      'retry_count',v_attempt.retry_count,'storage_status','VERIFIED','file_size_bytes',p_file_size_bytes));
  insert into public.order_events(order_id,event_type,actor_admin_user_id,note,metadata_json)
  values
    (v_order.id,'report_stored',v_attempt.requested_by,'Private PDF stored and verified.',
      jsonb_build_object('attempt_id',v_attempt.id,'report_id',v_report.id,'storage_status','VERIFIED',
        'technical_reference',v_attempt.technical_reference,'report_version',v_attempt.report_version)),
    (v_order.id,'generation_succeeded',v_attempt.requested_by,'Report generation completed.',
      jsonb_build_object('attempt_id',v_attempt.id,'report_id',v_report.id,'technical_reference',v_attempt.technical_reference,
        'retry_count',v_attempt.retry_count,'report_version',v_attempt.report_version));
  return jsonb_build_object('attempt',to_jsonb(v_attempt),'report',to_jsonb(v_report),
    'superseded_report_id',v_previous.id);
end;
$$;

create or replace function public.fail_manual_report_generation(
  p_attempt_id uuid,
  p_error_category text,
  p_safe_message text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_attempt public.manual_report_generation_attempts%rowtype;
begin
  update public.manual_report_generation_attempts
  set status='GENERATION_FAILED',completed_at=now(),updated_at=now(),
      error_category=left(coalesce(p_error_category,'generation_failed'),80),
      safe_operational_error=left(coalesce(p_safe_message,'Report generation failed.'),500)
  where id=p_attempt_id and status in ('REPORT_QUEUED','REPORT_GENERATING')
  returning * into v_attempt;
  if not found then return jsonb_build_object('updated',false); end if;
  insert into public.order_events(order_id,event_type,actor_admin_user_id,note,metadata_json)
  values(v_attempt.order_id,'generation_failed',v_attempt.requested_by,v_attempt.safe_operational_error,
    jsonb_build_object('attempt_id',v_attempt.id,'technical_reference',v_attempt.technical_reference,
      'retry_count',v_attempt.retry_count,'error_category',v_attempt.error_category));
  return jsonb_build_object('updated',true,'attempt',to_jsonb(v_attempt));
end;
$$;

create or replace function public.claim_manual_report_delivery(
  p_report_id uuid,
  p_order_reference text,
  p_requested_by uuid,
  p_request_key text,
  p_provider_mode text,
  p_technical_reference text
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile public.admin_profiles%rowtype;
  v_report public.reports%rowtype;
  v_order public.orders%rowtype;
  v_existing public.manual_report_delivery_attempts%rowtype;
  v_active public.manual_report_delivery_attempts%rowtype;
  v_attempt public.manual_report_delivery_attempts%rowtype;
  v_retries integer;
begin
  select * into v_profile from public.admin_profiles where id=p_requested_by and status='active';
  if not found or v_profile.role not in ('platform_admin','approver') then
    raise exception 'phase1_delivery_permission_denied';
  end if;
  if p_provider_mode not in ('disabled','double') then raise exception 'phase1_delivery_provider_invalid'; end if;
  select * into v_existing from public.manual_report_delivery_attempts where request_key=p_request_key;
  if found then return jsonb_build_object('claimed',false,'reason','idempotent_replay','attempt',to_jsonb(v_existing)); end if;
  select * into v_order from public.orders where order_reference=p_order_reference;
  if not found then raise exception 'phase1_order_not_found'; end if;
  select * into v_report from public.reports where id=p_report_id;
  if not found then raise exception 'phase1_report_record_missing'; end if;
  if v_report.order_id is distinct from v_order.id then raise exception 'phase1_report_order_mismatch'; end if;
  if v_report.storage_status <> 'VERIFIED' or v_report.storage_path is null or v_report.checksum is null then
    raise exception 'phase1_report_not_ready';
  end if;
  if v_order.customer_email is null then raise exception 'phase1_delivery_recipient_missing'; end if;
  select * into v_active from public.manual_report_delivery_attempts
    where report_id=v_report.id and status in ('DELIVERY_PENDING','DELIVERING') order by created_at desc limit 1;
  if found then return jsonb_build_object('claimed',false,'reason','already_active','attempt',to_jsonb(v_active)); end if;
  select * into v_active from public.manual_report_delivery_attempts
    where report_id=v_report.id and status='DELIVERED' order by created_at desc limit 1;
  if found then return jsonb_build_object('claimed',false,'reason','already_delivered','attempt',to_jsonb(v_active)); end if;
  select count(*)::integer into v_retries from public.manual_report_delivery_attempts
    where report_id=v_report.id and status='DELIVERY_FAILED';
  begin
    insert into public.manual_report_delivery_attempts(
      request_key,order_id,report_id,requested_by,status,retry_count,recipient_email,
      provider_mode,technical_reference
    ) values(
      p_request_key,v_order.id,v_report.id,p_requested_by,'DELIVERY_PENDING',v_retries,
      v_order.customer_email,p_provider_mode,p_technical_reference
    ) returning * into v_attempt;
  exception when unique_violation then
    select * into v_active from public.manual_report_delivery_attempts
      where report_id=v_report.id and status in ('DELIVERY_PENDING','DELIVERING') order by created_at desc limit 1;
    return jsonb_build_object('claimed',false,'reason','already_active','attempt',to_jsonb(v_active));
  end;
  insert into public.order_events(order_id,event_type,actor_admin_user_id,note,metadata_json)
  values(v_order.id,'delivery_requested',p_requested_by,
    case when p_provider_mode='disabled' then 'Delivery recorded; provider delivery is disabled.' else 'Delivery using provider double requested.' end,
    jsonb_build_object('attempt_id',v_attempt.id,'report_id',v_report.id,'technical_reference',p_technical_reference,
      'retry_count',v_attempt.retry_count,'provider_mode',p_provider_mode));
  if v_attempt.retry_count > 0 then
    insert into public.order_events(order_id,event_type,actor_admin_user_id,note,metadata_json)
    values(v_order.id,'retry_requested',p_requested_by,'Report-delivery retry requested.',
      jsonb_build_object('attempt_id',v_attempt.id,'report_id',v_report.id,
        'technical_reference',p_technical_reference,'retry_count',v_attempt.retry_count,
        'operation','delivery'));
  end if;
  return jsonb_build_object('claimed',true,'reason','created','attempt',to_jsonb(v_attempt));
end;
$$;

create or replace function public.complete_manual_report_delivery(
  p_attempt_id uuid,
  p_status text,
  p_error_category text default null,
  p_safe_message text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_attempt public.manual_report_delivery_attempts%rowtype;
  v_event public.email_events%rowtype;
begin
  if p_status not in ('DELIVERED','DELIVERY_FAILED') then raise exception 'phase1_delivery_terminal_status_invalid'; end if;
  select * into v_attempt from public.manual_report_delivery_attempts where id=p_attempt_id for update;
  if not found or v_attempt.status not in ('DELIVERY_PENDING','DELIVERING') then
    raise exception 'phase1_delivery_attempt_not_active';
  end if;
  update public.manual_report_delivery_attempts
  set status='DELIVERING',started_at=coalesce(started_at,now()),updated_at=now()
  where id=v_attempt.id;
  insert into public.order_events(order_id,event_type,actor_admin_user_id,note,metadata_json)
  values(v_attempt.order_id,'delivery_started',v_attempt.requested_by,
    'Provider-double delivery processing started.',
    jsonb_build_object('attempt_id',v_attempt.id,'report_id',v_attempt.report_id,
      'technical_reference',v_attempt.technical_reference,'retry_count',v_attempt.retry_count,
      'provider_mode',v_attempt.provider_mode));
  insert into public.email_events(
    order_id,report_id,recipient_email,template_key,notification_type,dedupe_key,status,
    error_message,request_id,provider_mode,retry_count,metadata_json,sent_at,updated_at
  ) values(
    v_attempt.order_id,v_attempt.report_id,v_attempt.recipient_email,'customer_report_delivery',
    'customer_report_delivery','phase1_delivery:'||v_attempt.id,
    case when p_status='DELIVERED' then 'delivered_double' else 'failed' end,
    case when p_status='DELIVERY_FAILED' then left(coalesce(p_safe_message,'Delivery failed.'),500) else null end,
    v_attempt.request_id,v_attempt.provider_mode,v_attempt.retry_count,
    jsonb_build_object('provider_send_attempted',false,'provider_mode',v_attempt.provider_mode,
      'technical_reference',v_attempt.technical_reference,'report_id',v_attempt.report_id),
    case when p_status='DELIVERED' then now() else null end,now()
  ) on conflict (dedupe_key) where dedupe_key is not null do update
    set status=excluded.status,error_message=excluded.error_message,retry_count=excluded.retry_count,
        metadata_json=excluded.metadata_json,sent_at=excluded.sent_at,updated_at=now()
  returning * into v_event;
  update public.manual_report_delivery_attempts
  set status=p_status,started_at=coalesce(started_at,now()),completed_at=now(),updated_at=now(),
      error_category=case when p_status='DELIVERY_FAILED' then left(coalesce(p_error_category,'delivery_failed'),80) else null end,
      safe_operational_error=case when p_status='DELIVERY_FAILED' then left(coalesce(p_safe_message,'Delivery failed.'),500) else null end,
      email_event_id=v_event.id
  where id=v_attempt.id returning * into v_attempt;
  insert into public.order_events(order_id,event_type,actor_admin_user_id,note,metadata_json)
  values(v_attempt.order_id,case when p_status='DELIVERED' then 'delivery_succeeded' else 'delivery_failed' end,
    v_attempt.requested_by,case when p_status='DELIVERED' then 'Provider double recorded a successful delivery.' else v_attempt.safe_operational_error end,
    jsonb_build_object('attempt_id',v_attempt.id,'report_id',v_attempt.report_id,'email_event_id',v_event.id,
      'technical_reference',v_attempt.technical_reference,'retry_count',v_attempt.retry_count,
      'provider_mode',v_attempt.provider_mode,'error_category',v_attempt.error_category));
  return jsonb_build_object('attempt',to_jsonb(v_attempt),'email_event',to_jsonb(v_event));
end;
$$;

revoke all on function public.claim_manual_report_generation(text,uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.start_manual_report_generation(uuid) from public, anon, authenticated;
revoke all on function public.complete_manual_report_generation(uuid,uuid,public.report_type,text,text,text,text,bigint,text) from public, anon, authenticated;
revoke all on function public.fail_manual_report_generation(uuid,text,text) from public, anon, authenticated;
revoke all on function public.claim_manual_report_delivery(uuid,text,uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.complete_manual_report_delivery(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.claim_manual_report_generation(text,uuid,text,text,text) to service_role;
grant execute on function public.start_manual_report_generation(uuid) to service_role;
grant execute on function public.complete_manual_report_generation(uuid,uuid,public.report_type,text,text,text,text,bigint,text) to service_role;
grant execute on function public.fail_manual_report_generation(uuid,text,text) to service_role;
grant execute on function public.claim_manual_report_delivery(uuid,text,uuid,text,text,text) to service_role;
grant execute on function public.complete_manual_report_delivery(uuid,text,text,text) to service_role;
grant select on public.manual_report_generation_attempts to service_role;
grant select on public.manual_report_delivery_attempts to service_role;
grant select, insert, update on public.reports to service_role;
grant select, insert, update on public.email_events to service_role;

create or replace function public.phase1_manual_fulfilment_capability()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  v_missing_tables text[];
  v_missing_report_columns text[];
  v_missing_email_columns text[];
  v_missing_functions text[];
  v_missing_permissions text[];
begin
  select coalesce(array_agg(required_name order by required_name), array[]::text[])
  into v_missing_tables
  from unnest(array[
    'manual_report_generation_attempts',
    'manual_report_delivery_attempts'
  ]) required_name
  where to_regclass('public.' || required_name) is null;

  select coalesce(array_agg(required_name order by required_name), array[]::text[])
  into v_missing_report_columns
  from unnest(array[
    'organisation_id',
    'file_name',
    'mime_type',
    'file_size_bytes',
    'storage_status',
    'storage_verified_at'
  ]) required_name
  where not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='reports' and column_name=required_name
  );

  select coalesce(array_agg(required_name order by required_name), array[]::text[])
  into v_missing_email_columns
  from unnest(array[
    'request_id',
    'provider_mode',
    'retry_count',
    'updated_at'
  ]) required_name
  where not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='email_events' and column_name=required_name
  );

  select coalesce(array_agg(required_name order by required_name), array[]::text[])
  into v_missing_functions
  from unnest(array[
    'claim_manual_report_generation(text,uuid,text,text,text)',
    'start_manual_report_generation(uuid)',
    'complete_manual_report_generation(uuid,uuid,report_type,text,text,text,text,bigint,text)',
    'fail_manual_report_generation(uuid,text,text)',
    'claim_manual_report_delivery(uuid,text,uuid,text,text,text)',
    'complete_manual_report_delivery(uuid,text,text,text)'
  ]) required_name
  where to_regprocedure('public.' || required_name) is null;

  select coalesce(array_agg(required_name order by required_name), array[]::text[])
  into v_missing_permissions
  from unnest(array[
    'manual_report_generation_attempts:select',
    'manual_report_delivery_attempts:select',
    'reports:select',
    'reports:insert',
    'reports:update',
    'email_events:select',
    'email_events:insert',
    'email_events:update'
  ]) required_name
  where not has_table_privilege(
    'service_role',
    'public.' || split_part(required_name,':',1),
    upper(split_part(required_name,':',2))
  );

  v_missing_permissions := v_missing_permissions || coalesce(array(
    select 'function:' || required_name
    from unnest(array[
      'claim_manual_report_generation(text,uuid,text,text,text)',
      'start_manual_report_generation(uuid)',
      'complete_manual_report_generation(uuid,uuid,report_type,text,text,text,text,bigint,text)',
      'fail_manual_report_generation(uuid,text,text)',
      'claim_manual_report_delivery(uuid,text,uuid,text,text,text)',
      'complete_manual_report_delivery(uuid,text,text,text)'
    ]) required_name
    where to_regprocedure('public.' || required_name) is not null
      and not has_function_privilege('service_role', to_regprocedure('public.' || required_name), 'EXECUTE')
  ), array[]::text[]);

  return jsonb_build_object(
    'available', cardinality(v_missing_tables)=0
      and cardinality(v_missing_report_columns)=0
      and cardinality(v_missing_email_columns)=0
      and cardinality(v_missing_functions)=0
      and cardinality(v_missing_permissions)=0,
    'schema_version', '0023',
    'missing_tables', to_jsonb(v_missing_tables),
    'missing_report_columns', to_jsonb(v_missing_report_columns),
    'missing_email_columns', to_jsonb(v_missing_email_columns),
    'missing_functions', to_jsonb(v_missing_functions),
    'missing_permissions', to_jsonb(v_missing_permissions)
  );
end;
$$;

revoke all on function public.phase1_manual_fulfilment_capability() from public, anon, authenticated;
grant execute on function public.phase1_manual_fulfilment_capability() to service_role;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('generated-reports','generated-reports',false,15728640,array['application/pdf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

insert into public.app_settings(setting_key,value_json)
values('v2_phase1_manual_fulfilment',jsonb_build_object(
  'schema_version','0023','status','manual_only','phase14_enabled',false,'automatic_generation',false,
  'automatic_delivery',false,'email_provider_mode','disabled','storage_bucket','generated-reports'
)) on conflict(setting_key) do update set value_json=excluded.value_json,updated_at=now();

-- Forward repair: failed attempts are retained and retried as new rows; never delete history.
-- Rollback: disable Phase 1 routes, then drop the two manual attempt tables/functions and
-- the additive report/email columns only after confirming no Phase 1 records rely on them.
