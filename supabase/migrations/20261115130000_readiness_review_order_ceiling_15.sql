-- DR-15 revised by the owner on 15 November 2026: a report (order) may use at most 15 AI calls over its lifetime, up
-- from 6. DR-15 also stands that there is no overall production budget, so the per-order limit is the only cap.
--
-- 1. A campaign may now be uncapped: max_calls and max_cost_usd both null. A capped campaign keeps the existing checks
--    (1 to 50 calls, cost above 0 and at most US$25). Rows already recorded are unchanged (the table stays append-only).
-- 2. review_reserve_generation_call clamps the order ceiling to 15 instead of 6 and, for an uncapped campaign, skips
--    the campaign call and cost limits. Every call is still reserved before dispatch and settled afterwards, and still
--    needs an approved campaign row: without one, no paid call is possible.
alter table readiness_review.generation_budgets alter column max_calls drop not null;
alter table readiness_review.generation_budgets alter column max_cost_usd drop not null;
alter table readiness_review.generation_budgets add constraint generation_budgets_capped_or_uncapped
  check ((max_calls is null) = (max_cost_usd is null));

create or replace function public.review_reserve_generation_call(p jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_budget readiness_review.generation_budgets%rowtype;
  v_order text := p->>'orderReference';
  v_cost numeric := (p->>'reservedCostUsd')::numeric;
  v_ceiling integer := least(greatest(coalesce((p->>'orderCeiling')::integer, 15), 1), 15);
  v_order_calls integer;
  v_campaign_calls integer;
  v_committed numeric;
  v_call uuid;
begin
  if p->>'campaign' is null then
    return jsonb_build_object('allowed', false, 'reason', 'campaign_budget_missing');
  end if;
  select * into v_budget from readiness_review.generation_budgets where campaign = p->>'campaign' for update;
  if not found then
    return jsonb_build_object('allowed', false, 'reason', 'campaign_budget_missing');
  end if;
  if v_cost is null or v_cost <= 0 then
    return jsonb_build_object('allowed', false, 'reason', 'cost_not_bounded');
  end if;
  perform pg_advisory_xact_lock(hashtextextended('rv-generation-order:' || v_order, 0));
  select count(*) into v_order_calls from readiness_review.generation_calls where order_reference = v_order;
  if v_order_calls >= v_ceiling then
    return jsonb_build_object('allowed', false, 'reason', 'order_ceiling_reached', 'orderCalls', v_order_calls, 'orderCeiling', v_ceiling);
  end if;
  select count(*), coalesce(sum(case when status in ('succeeded', 'failed') and settled_cost_usd is not null
                                     then settled_cost_usd else reserved_cost_usd end), 0)
    into v_campaign_calls, v_committed
    from readiness_review.generation_calls where campaign = v_budget.campaign;
  if v_budget.max_calls is not null and v_campaign_calls + 1 > v_budget.max_calls then
    return jsonb_build_object('allowed', false, 'reason', 'campaign_calls_exhausted', 'campaignCalls', v_campaign_calls, 'maxCalls', v_budget.max_calls);
  end if;
  if v_budget.max_cost_usd is not null and v_committed + v_cost > v_budget.max_cost_usd then
    return jsonb_build_object('allowed', false, 'reason', 'campaign_cost_exhausted', 'committedUsd', v_committed, 'requestedUsd', v_cost, 'maxCostUsd', v_budget.max_cost_usd);
  end if;
  insert into readiness_review.generation_calls (campaign, order_reference, input_digest, attempt_id, stage, model, max_output_tokens, reserved_cost_usd)
  values (v_budget.campaign, v_order, p->>'inputDigest', p->>'attemptId', p->>'stage', p->>'model', (p->>'maxOutputTokens')::integer, v_cost)
  returning call_id into v_call;
  return jsonb_build_object('allowed', true, 'callId', v_call, 'orderCalls', v_order_calls + 1, 'orderCeiling', v_ceiling,
    'campaignCalls', v_campaign_calls + 1, 'maxCalls', v_budget.max_calls, 'committedUsd', v_committed + v_cost, 'maxCostUsd', v_budget.max_cost_usd);
end
$$;

revoke all on function public.review_reserve_generation_call(jsonb) from public, anon, authenticated;
grant execute on function public.review_reserve_generation_call(jsonb) to service_role;
