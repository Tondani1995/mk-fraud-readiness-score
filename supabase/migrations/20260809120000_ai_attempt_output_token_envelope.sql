-- Production-bound AI-attempt output-token contract.
--
-- The application ceiling PREMIUM_REPORT_AI_MAX_OUTPUT_TOKENS moves from 5,000 to 6,500 after V5
-- (AI attempt 50b0a33e) truncated at exactly 5,000: finishReason 'length', rawFinishReason
-- 'max_output_tokens', settled structured_output_truncated. report_ai_attempts_max_output_tokens_check
-- still enforces the 0017 baseline of `max_output_tokens between 1 and 5000`, so without this the
-- durable attempt row could not even be INSERTED at the new ceiling -- the generation would fail at
-- attempt creation, before any provider dispatch, and the truncation fix would never be exercised.
--
-- This was not anticipated when the fix was scoped. It is required by the constraint itself, proved
-- by direct read-only inspection of Staging (penhenkzfrtmcxklodtu):
--   report_ai_attempts_max_output_tokens_check := CHECK ((max_output_tokens >= 1)
--                                                    AND (max_output_tokens <= 5000))
--
-- Deliberately narrow, following 20260808170000 exactly: only this one constraint is touched. No
-- other constraint, no function body, no privilege, no data. Replay-safe in both directions --
-- dropping IF EXISTS before re-adding means applying onto the 0017 baseline (Production) or onto a
-- state that already carries 6500 (Staging) converges on the identical contract.
--
-- The ceiling remains bounded, not opened: 6,500 output against the V5 actual input of 10,850 gives
-- ~17,350 total, inside the existing 24,000 hard total-token ceiling, and cost stays far below the
-- 500,000-micro hard ceiling. Neither of those hard ceilings is changed here.

begin;

alter table public.report_ai_attempts
  drop constraint if exists report_ai_attempts_max_output_tokens_check;

alter table public.report_ai_attempts
  add constraint report_ai_attempts_max_output_tokens_check
  check (max_output_tokens between 1 and 6500);

comment on constraint report_ai_attempts_max_output_tokens_check on public.report_ai_attempts is
  'Durable AI output ceiling must admit the tightened structured-output envelope (Production-bound parity).';

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
    and c.conname = 'report_ai_attempts_max_output_tokens_check';

  if v_def is null then
    raise exception 'report_ai_attempts_max_output_tokens_check_missing';
  end if;
  if pg_catalog.strpos(v_def, '6500') = 0 then
    raise exception 'report_ai_attempts_max_output_tokens_check_upper_bound_not_6500: %', v_def;
  end if;
  if pg_catalog.strpos(v_def, '1') = 0 then
    raise exception 'report_ai_attempts_max_output_tokens_check_lower_bound_missing: %', v_def;
  end if;

  -- The runtime ceiling must be representable, and the corridor above it must remain the cap.
  if not (6500 between 1 and 6500) then
    raise exception 'report_ai_attempts_output_ceiling_not_representable';
  end if;
  -- The bounded corridor is unchanged by this migration: worst-case total stays inside 24,000.
  if (10850 + 6500) >= 24000 then
    raise exception 'report_ai_attempts_output_ceiling_breaches_total_token_corridor';
  end if;
end;
$$;

commit;
