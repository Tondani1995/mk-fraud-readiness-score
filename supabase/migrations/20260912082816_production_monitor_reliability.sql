-- Immutable internal monitoring notifications. No assessment/order/report relationships or triggers.
create table public.production_monitor_notifications (
  notification_key text primary key,
  payload_json jsonb not null check (jsonb_typeof(payload_json) = 'object'),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  provider_message_id text
);
alter table public.production_monitor_notifications enable row level security;
revoke all on public.production_monitor_notifications from public, anon, authenticated;
grant select, insert on public.production_monitor_notifications to service_role;
grant update (sent_at, provider_message_id) on public.production_monitor_notifications to service_role;
