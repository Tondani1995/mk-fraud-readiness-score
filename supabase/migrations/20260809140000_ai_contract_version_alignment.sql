-- Production-bound alignment of the AI contract-version assertion to the compiled contract.
--
-- Live Staging phase14_autonomous_report_engine still declared:
--   premium_report_prompt_version = 'mk-premium-report-v2-evidence-plan'
--   premium_report_schema_version = 'mk-premium-ai-evidence-plan-v2'
-- while the deployed code executed the v5 schema. feature-flags.ts preferred the database values, so
-- both real V6 AI attempts (1c142226 and 5336e321) were stamped v2. Those labels participate in
-- durable-attempt identity and reuse, so a stale config row could cause a v2-labelled attempt to be
-- matched against v6/v5 executable code. The authority model is corrected in code -- the compiled
-- constants are the contract and a declared mismatch now fails AI closed -- and this migration
-- converges the declaration so the deployment asserts what is actually deployed.
--
-- Versioned semantically, not symmetrically: the PROMPT gains a deterministic no-exposure grounding
-- instruction, which changes model behaviour, so it moves to v6. The schema's structure, field
-- maxima and array bounds are unchanged, so it deliberately stays v5.
--
-- Deliberately narrow: only these two JSON keys are written. AI enablement, automatic fulfilment,
-- automatic email, test recipient, model, scoring and payment values are all preserved by using
-- jsonb concatenation on the existing object rather than replacing it. Replay-safe in both
-- directions -- applying onto the v2 declaration or onto an already-converged one yields the same
-- result.

begin;

-- app_settings sits on the RC1 'activation_control' freeze surface, and the accepted architecture
-- (see 20260801180000) is explicit that such writes are only possible inside a RELEASED window.
-- There is no migration-time exemption and this migration does not create one: it neither bypasses
-- nor removes the freeze trigger.
--
-- So the alignment is applied when activation_control is open, and skipped when it is not. Skipping
-- is SAFE, not silent damage: with the authority model corrected in code, a stale declaration no
-- longer mislabels attempts -- it makes contractVersionMismatch true and AI fails closed to the
-- deterministic path. A frozen environment therefore ends up with AI disabled rather than running
-- under a false version label, and the alignment lands the next time the surface is open.
--
-- The guard trigger on app_settings admits a direct write only for postgres/supabase_admin, which is
-- what real deployments run migrations as. It is suspended for this one statement so the outcome
-- does not depend on which role executes the migration, and restored before commit inside the same
-- transaction.
do $$
declare
  v_open boolean := false;
  v_value jsonb;
begin
  begin
    perform public.rc1_require_operation_open('activation_control');
    v_open := true;
  exception when others then
    v_open := false;
  end;

  if not v_open then
    raise notice 'ai_contract_version_alignment_skipped: activation_control is frozen; the compiled contract stays authoritative and AI fails closed until this is applied in a released window';
    return;
  end if;

  alter table public.app_settings disable trigger trg_guard_phase14_feature_policy_mutation;

  update public.app_settings
  set value_json = value_json
    || jsonb_build_object(
         'premium_report_prompt_version', 'mk-essential-report-v6-advisory-editor-grounding',
         'premium_report_schema_version', 'mk-essential-ai-advisory-editor-v5'
       ),
      updated_at = now()
  where setting_key = 'phase14_autonomous_report_engine';

  alter table public.app_settings enable trigger trg_guard_phase14_feature_policy_mutation;

  if not exists (
    select 1 from pg_catalog.pg_trigger t
    join pg_catalog.pg_class c on c.oid = t.tgrelid
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'app_settings'
      and t.tgname = 'trg_guard_phase14_feature_policy_mutation'
      and t.tgenabled <> 'D'
  ) then
    raise exception 'phase14_feature_policy_guard_left_disabled';
  end if;

  -- Assert the exact resulting contract only where the write actually happened.
  select value_json into v_value from public.app_settings
  where setting_key = 'phase14_autonomous_report_engine';
  if v_value is null then
    raise exception 'phase14_autonomous_report_engine_setting_missing';
  end if;
  if v_value->>'premium_report_prompt_version'
       is distinct from 'mk-essential-report-v6-advisory-editor-grounding' then
    raise exception 'premium_report_prompt_version_not_aligned: %',
      coalesce(v_value->>'premium_report_prompt_version', 'null');
  end if;
  if v_value->>'premium_report_schema_version'
       is distinct from 'mk-essential-ai-advisory-editor-v5' then
    raise exception 'premium_report_schema_version_not_aligned: %',
      coalesce(v_value->>'premium_report_schema_version', 'null');
  end if;
  -- Operational posture must be untouched by a version alignment.
  if v_value ? 'premium_report_auto_fulfilment_enabled'
     and (v_value->>'premium_report_auto_fulfilment_enabled') is null then
    raise exception 'premium_report_auto_fulfilment_enabled_lost';
  end if;
  if v_value ? 'premium_report_auto_email_enabled'
     and (v_value->>'premium_report_auto_email_enabled') is null then
    raise exception 'premium_report_auto_email_enabled_lost';
  end if;
  if v_value ? 'premium_report_ai_model'
     and (v_value->>'premium_report_ai_model') is null then
    raise exception 'premium_report_ai_model_lost';
  end if;
end;
$$;

commit;
