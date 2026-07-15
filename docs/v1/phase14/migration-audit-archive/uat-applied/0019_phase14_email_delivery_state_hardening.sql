-- Phase 14 email delivery state hardening.
-- Preserve every provider webhook event so retries and out-of-order delivery cannot regress the current email state.

begin;

create table if not exists public.email_provider_events (
  id uuid primary key default gen_random_uuid(),
  email_event_id uuid not null references public.email_events(id) on delete cascade,
  provider text not null,
  provider_event_id text not null,
  provider_message_id text not null,
  event_type text not null,
  event_created_at timestamptz,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text,
  payload_json jsonb not null default '{}'::jsonb,
  constraint email_provider_events_provider_event_unique unique (provider, provider_event_id)
);

create index if not exists email_provider_events_email_event_idx
  on public.email_provider_events(email_event_id, received_at desc);
create index if not exists email_provider_events_message_idx
  on public.email_provider_events(provider, provider_message_id, received_at desc);
create index if not exists email_provider_events_unprocessed_idx
  on public.email_provider_events(received_at)
  where processed_at is null;

alter table public.email_provider_events enable row level security;
revoke all on table public.email_provider_events from anon, authenticated;
grant select on table public.email_provider_events to authenticated;

create policy email_provider_events_admin_select on public.email_provider_events
  for select using (
    public.current_admin_role() in ('platform_admin', 'reviewer', 'approver', 'read_only_admin')
  );

commit;
