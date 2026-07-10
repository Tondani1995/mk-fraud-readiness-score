-- MK Fraud Readiness Score V1 - Phase 13 commercial event foundation
-- Purpose: add additive commercial/event intelligence storage and notification
-- dedupe controls without adding payment gateways, customer report download,
-- automated report release, respondent accounts, benchmarks or AI recommendations.

begin;

create table if not exists public.assessment_events (
  id uuid primary key default gen_random_uuid(),
  assessment_id uuid not null references public.assessments(id) on delete cascade,
  organisation_id uuid references public.organisations(id) on delete set null,
  respondent_id uuid references public.respondents(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  data_request_id uuid references public.data_requests(id) on delete set null,
  report_id uuid references public.reports(id) on delete set null,
  event_type text not null,
  option_code text,
  dedupe_key text not null,
  metadata_json jsonb not null default '{}'::jsonb,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  event_count integer not null default 1 check (event_count >= 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assessment_events_dedupe_key_unique unique (dedupe_key),
  constraint assessment_events_known_event_type_chk check (event_type in (
    'assessment_started',
    'assessment_submitted',
    'snapshot_viewed',
    'executive_summary_viewed',
    'report_options_opened',
    'report_option_selected',
    'full_report_5000_selected',
    'personalised_report_50000_selected',
    'eft_order_created',
    'payment_marked_received',
    'report_generated',
    'admin_report_downloaded',
    'report_emailed_to_customer',
    'internal_notification_queued',
    'internal_notification_sent',
    'internal_notification_failed'
  ))
);

alter table public.assessment_events
  add column if not exists organisation_id uuid references public.organisations(id) on delete set null,
  add column if not exists respondent_id uuid references public.respondents(id) on delete set null,
  add column if not exists order_id uuid references public.orders(id) on delete set null,
  add column if not exists data_request_id uuid references public.data_requests(id) on delete set null,
  add column if not exists report_id uuid references public.reports(id) on delete set null,
  add column if not exists option_code text,
  add column if not exists dedupe_key text,
  add column if not exists metadata_json jsonb not null default '{}'::jsonb,
  add column if not exists first_seen_at timestamptz not null default now(),
  add column if not exists last_seen_at timestamptz not null default now(),
  add column if not exists event_count integer not null default 1,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists assessment_events_dedupe_key_uidx on public.assessment_events(dedupe_key);
create index if not exists assessment_events_assessment_idx on public.assessment_events(assessment_id);
create index if not exists assessment_events_organisation_idx on public.assessment_events(organisation_id);
create index if not exists assessment_events_event_type_idx on public.assessment_events(event_type);
create index if not exists assessment_events_option_code_idx on public.assessment_events(option_code);
create index if not exists assessment_events_order_idx on public.assessment_events(order_id);
create index if not exists assessment_events_data_request_idx on public.assessment_events(data_request_id);
create index if not exists assessment_events_report_idx on public.assessment_events(report_id);
create index if not exists assessment_events_last_seen_idx on public.assessment_events(last_seen_at desc);

alter table public.assessment_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'trg_assessment_events_updated_at'
  ) then
    create trigger trg_assessment_events_updated_at
      before update on public.assessment_events
      for each row execute function public.set_updated_at();
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'assessment_events' and policyname = 'assessment_events_admin_select'
  ) then
    create policy assessment_events_admin_select on public.assessment_events
      for select using (public.current_admin_role() in ('platform_admin', 'reviewer', 'approver', 'finance_admin', 'read_only_admin'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'assessment_events' and policyname = 'assessment_events_admin_insert'
  ) then
    create policy assessment_events_admin_insert on public.assessment_events
      for insert with check (public.current_admin_role() in ('platform_admin', 'reviewer', 'approver', 'finance_admin'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'assessment_events' and policyname = 'assessment_events_admin_update'
  ) then
    create policy assessment_events_admin_update on public.assessment_events
      for update using (public.current_admin_role() in ('platform_admin', 'reviewer', 'approver', 'finance_admin'))
      with check (public.current_admin_role() in ('platform_admin', 'reviewer', 'approver', 'finance_admin'));
  end if;
end $$;

alter table public.email_events
  add column if not exists data_request_id uuid references public.data_requests(id) on delete set null,
  add column if not exists notification_type text,
  add column if not exists dedupe_key text,
  add column if not exists metadata_json jsonb not null default '{}'::jsonb;

create unique index if not exists email_events_dedupe_key_uidx
  on public.email_events(dedupe_key)
  where dedupe_key is not null;
create index if not exists email_events_notification_type_idx on public.email_events(notification_type);
create index if not exists email_events_data_request_idx on public.email_events(data_request_id);

insert into public.app_settings (setting_key, value_json)
values (
  'phase13_commercial_event_foundation',
  '{"status":"foundation_only","customer_report_options_ui":false,"premium_executive_summary_ui":false,"payment_gateway":false,"proof_upload":false,"automated_payment_verification":false,"automated_report_release":false,"customer_instant_download":false,"benchmarks":false,"ai_live_recommendations":false}'::jsonb
)
on conflict (setting_key) do update set value_json = excluded.value_json, updated_at = now();

commit;
