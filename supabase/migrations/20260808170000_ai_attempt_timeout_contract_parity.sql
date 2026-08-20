-- Production-bound AI-attempt timeout contract.
--
-- Independent read-only Production verification confirmed report_ai_attempts_timeout_ms_check still
-- enforces the 0017 baseline of `timeout_ms between 1000 and 120000`. The widening to 300000 lives
-- in 20260805200000_pre_g30_ai_timeout_window.sql, which is Staging-only and excluded from the
-- Production ledger, so Production cannot persist the runtime's intended 240-second AI budget at
-- all: a real attempt would be rejected by the constraint before any provider result was recorded.
--
-- This carries the same contract as that Staging-only migration -- application AI budget 240s,
-- durable range 1000..300000, leaving a 30-second post-provider margin inside the 300s route bound
-- -- but as a Production-bound migration, so Production is not made to inherit a Staging-only
-- identifier.
--
-- Deliberately narrow: only report_ai_attempts_timeout_ms_check is touched. No other constraint, no
-- function body, no privilege, no data. Replay-safe in both directions -- dropping IF EXISTS before
-- re-adding means applying this onto the 0017 baseline (Production) or onto a state that already
-- carries the 300000 constraint (Staging) converges on the identical contract. Runtime timeout
-- values themselves are unchanged; this only lets the database record what the runtime already uses.

begin;

alter table public.report_ai_attempts
  drop constraint if exists report_ai_attempts_timeout_ms_check;

alter table public.report_ai_attempts
  add constraint report_ai_attempts_timeout_ms_check
  check (timeout_ms between 1000 and 300000);

comment on constraint report_ai_attempts_timeout_ms_check on public.report_ai_attempts is
  'Durable AI timeout must fit within the bounded report route duration (Production-bound parity).';

-- Assert the exact resulting semantic contract, at apply time and on every replay.
do $$
declare
  v_def text;
begin
  select pg_catalog.pg_get_constraintdef(c.oid) into v_def
  from pg_catalog.pg_constraint c
  join pg_catalog.pg_class t on t.oid = c.conrelid
  join pg_catalog.pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public' and t.relname = 'report_ai_attempts'
    and c.conname = 'report_ai_attempts_timeout_ms_check';

  if v_def is null then
    raise exception 'report_ai_attempts_timeout_ms_check_missing';
  end if;
  if pg_catalog.strpos(v_def, '300000') = 0 then
    raise exception 'report_ai_attempts_timeout_ms_check_upper_bound_not_300000: %', v_def;
  end if;
  if pg_catalog.strpos(v_def, '1000') = 0 then
    raise exception 'report_ai_attempts_timeout_ms_check_lower_bound_not_1000: %', v_def;
  end if;

  -- The runtime's 240-second budget must be representable, and the route bound must remain the cap.
  if not (240000 between 1000 and 300000) then
    raise exception 'report_ai_attempts_timeout_runtime_budget_not_representable';
  end if;
end;
$$;

commit;
