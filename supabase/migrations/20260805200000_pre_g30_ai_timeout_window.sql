-- PRE-G30: allow the application-side 240-second AI budget to be persisted safely.
-- The route remains explicitly bounded at 300 seconds, leaving a 30-second post-provider
-- processing margin for identity validation, accounting, validation, PDF and finalisation.
alter table public.report_ai_attempts
  drop constraint if exists report_ai_attempts_timeout_ms_check;

alter table public.report_ai_attempts
  add constraint report_ai_attempts_timeout_ms_check
  check (timeout_ms between 1000 and 300000);

comment on constraint report_ai_attempts_timeout_ms_check on public.report_ai_attempts is
  'PRE-G30: durable AI timeout must fit within the bounded report route duration.';
