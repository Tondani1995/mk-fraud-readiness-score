-- Correct Production API-failure classification and environment attribution.
--
-- Legacy production_monitor_events rows are intentionally left with environment NULL. They remain
-- available for audit/history but are excluded from the corrected Production API failure metric
-- because the original schema did not preserve enough evidence to distinguish Preview from
-- Production reliably.

begin;

alter table public.production_monitor_events
  add column if not exists environment text;

alter table public.production_monitor_events
  drop constraint if exists production_monitor_events_environment_check;

alter table public.production_monitor_events
  add constraint production_monitor_events_environment_check
  check (environment is null or environment in ('preview', 'production'));

create index if not exists production_monitor_events_environment_occurred_idx
  on public.production_monitor_events(environment, occurred_at desc);

comment on column public.production_monitor_events.environment is
  'Runtime environment recorded at event creation. NULL denotes legacy events created before environment attribution was introduced.';

commit;
