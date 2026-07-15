-- Phase 14B: idempotent PDF email delivery and provider webhook state.

begin;

alter table public.email_events
  add column if not exists provider_event_id text,
  add column if not exists delivered_at timestamptz,
  add column if not exists delivery_updated_at timestamptz,
  add column if not exists attempt_number integer not null default 1;

create unique index if not exists email_events_provider_event_uidx
  on public.email_events(provider_event_id)
  where provider_event_id is not null;

create index if not exists email_events_report_status_idx
  on public.email_events(report_id, status, created_at desc)
  where report_id is not null;

create index if not exists email_events_provider_message_idx
  on public.email_events(provider_message_id)
  where provider_message_id is not null;

commit;
