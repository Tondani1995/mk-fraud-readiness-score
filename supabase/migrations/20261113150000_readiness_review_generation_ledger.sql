-- Durable accounting and audit checkpoints for revised (readiness_review) report generation.
--
-- Independent review of the corrective pass (13 November 2026), findings F1 and F2:
--   F1  the AI call allowance was counted afterwards, by parsing free-text failure records, and an unreadable history
--       counted as zero; a crash, a lost record or a rendering failure made paid calls invisible.
--   F2  a report could be finalised while its audit package failed to save, and the success was still returned.
--
-- This migration adds three append-only records in the review schema, service role only:
--   generation_budgets      an owner-approved campaign: a ceiling on paid calls and on cost, in USD. No paid call can
--                           be reserved without one; this migration inserts none.
--   generation_calls        one row per paid call, reserved BEFORE it is dispatched and counted from that moment,
--                           whatever happens next. Settlement records the outcome and the usage; a call that is never
--                           settled (crash, lost response) stays counted at its reserved worst-case cost.
--   generation_checkpoints  the draft awaiting repair, the validated manuscript with its full audit package (written
--                           before any report is composed or finalised), and the link to the finalised report.
--
-- Nothing here changes any existing table, function or behaviour. Applying it without inserting a budget row leaves
-- revised generation refusing every paid call, which is the intended fail-closed state.

-- 1. Approved campaigns ----------------------------------------------------------------------------------------------
create table readiness_review.generation_budgets (
  campaign text primary key check (campaign ~ '^[a-z0-9][a-z0-9-]{2,62}$'),
  max_calls integer not null check (max_calls between 1 and 50),
  max_cost_usd numeric(10, 4) not null check (max_cost_usd > 0 and max_cost_usd <= 25),
  approved_by text not null check (length(approved_by) between 2 and 120),
  approved_at timestamptz not null default now(),
  note text
);

-- 2. Paid calls ------------------------------------------------------------------------------------------------------
create table readiness_review.generation_calls (
  call_id uuid primary key default gen_random_uuid(),
  campaign text not null references readiness_review.generation_budgets (campaign),
  order_reference text not null check (length(order_reference) between 3 and 80),
  input_digest text not null check (input_digest ~ '^[0-9a-f]{64}$'),
  attempt_id text not null check (length(attempt_id) between 1 and 80),
  stage text not null check (stage in ('writer', 'repair')),
  model text not null check (length(model) between 3 and 120),
  max_output_tokens integer not null check (max_output_tokens > 0),
  reserved_cost_usd numeric(10, 4) not null check (reserved_cost_usd > 0),
  status text not null default 'reserved' check (status in ('reserved', 'succeeded', 'failed', 'indeterminate')),
  usage jsonb,
  settled_cost_usd numeric(10, 4) check (settled_cost_usd >= 0),
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  check ((status = 'reserved') = (settled_at is null))
);
create index generation_calls_order on readiness_review.generation_calls (order_reference);
create index generation_calls_campaign on readiness_review.generation_calls (campaign);

-- 3. Checkpoints and audit packages --------------------------------------------------------------------------------
create table readiness_review.generation_checkpoints (
  checkpoint_id uuid primary key default gen_random_uuid(),
  order_reference text not null check (length(order_reference) between 3 and 80),
  input_digest text not null check (input_digest ~ '^[0-9a-f]{64}$'),
  attempt_id text not null check (length(attempt_id) between 1 and 80),
  stage text not null check (stage in ('drafted', 'validated', 'linked')),
  fact_pack_digest text check (fact_pack_digest ~ '^[0-9a-f]{64}$'),
  manuscript text,
  audit_package jsonb,
  report_id uuid,
  payload_digest text not null check (payload_digest ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique (attempt_id, stage),
  check (stage <> 'drafted' or (manuscript is not null and fact_pack_digest is not null)),
  check (stage <> 'validated' or (manuscript is not null and fact_pack_digest is not null and audit_package is not null)),
  check (stage <> 'linked' or report_id is not null)
);
create index generation_checkpoints_order on readiness_review.generation_checkpoints (order_reference, input_digest, created_at desc);

-- Append-only: budgets and checkpoints never change; a call changes once, from reserved to its outcome.
create trigger generation_budgets_append_only before update or delete on readiness_review.generation_budgets
  for each row execute function readiness_review.forbid_change();
create trigger generation_checkpoints_append_only before update or delete on readiness_review.generation_checkpoints
  for each row execute function readiness_review.forbid_change();

create function readiness_review.guard_generation_call() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'readiness_review.generation_calls is append-only' using errcode = 'RV405';
  end if;
  if old.status <> 'reserved' then
    raise exception 'a settled generation call cannot change' using errcode = 'RV405';
  end if;
  if (new.call_id, new.campaign, new.order_reference, new.input_digest, new.attempt_id, new.stage, new.model,
      new.max_output_tokens, new.reserved_cost_usd, new.created_at)
     is distinct from
     (old.call_id, old.campaign, old.order_reference, old.input_digest, old.attempt_id, old.stage, old.model,
      old.max_output_tokens, old.reserved_cost_usd, old.created_at) then
    raise exception 'only the settlement of a generation call can be recorded' using errcode = 'RV405';
  end if;
  return new;
end
$$;
create trigger generation_calls_guard before update or delete on readiness_review.generation_calls
  for each row execute function readiness_review.guard_generation_call();

alter table readiness_review.generation_budgets enable row level security;
alter table readiness_review.generation_calls enable row level security;
alter table readiness_review.generation_checkpoints enable row level security;

-- 4. Reserve a paid call before dispatch --------------------------------------------------------------------------
-- Limits, all enforced here under locks so that concurrent requests cannot both take the last unit:
--   order    every call ever reserved for the order, across attempts and report versions (lifetime), at most the
--            approved bound of 6, or less if the caller asks for less;
--   campaign the owner-approved number of calls and cost. Cost committed = settled cost where the usage was known,
--            otherwise the reserved worst case. An indeterminate or unsettled call is charged at its worst case.
create function public.review_reserve_generation_call(p jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_budget readiness_review.generation_budgets%rowtype;
  v_order text := p->>'orderReference';
  v_cost numeric := (p->>'reservedCostUsd')::numeric;
  v_ceiling integer := least(greatest(coalesce((p->>'orderCeiling')::integer, 6), 1), 6);
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
  if v_campaign_calls + 1 > v_budget.max_calls then
    return jsonb_build_object('allowed', false, 'reason', 'campaign_calls_exhausted', 'campaignCalls', v_campaign_calls, 'maxCalls', v_budget.max_calls);
  end if;
  if v_committed + v_cost > v_budget.max_cost_usd then
    return jsonb_build_object('allowed', false, 'reason', 'campaign_cost_exhausted', 'committedUsd', v_committed, 'requestedUsd', v_cost, 'maxCostUsd', v_budget.max_cost_usd);
  end if;
  insert into readiness_review.generation_calls (campaign, order_reference, input_digest, attempt_id, stage, model, max_output_tokens, reserved_cost_usd)
  values (v_budget.campaign, v_order, p->>'inputDigest', p->>'attemptId', p->>'stage', p->>'model', (p->>'maxOutputTokens')::integer, v_cost)
  returning call_id into v_call;
  return jsonb_build_object('allowed', true, 'callId', v_call, 'orderCalls', v_order_calls + 1, 'orderCeiling', v_ceiling,
    'campaignCalls', v_campaign_calls + 1, 'maxCalls', v_budget.max_calls, 'committedUsd', v_committed + v_cost, 'maxCostUsd', v_budget.max_cost_usd);
end
$$;

-- 5. Settle a reserved call (once) ----------------------------------------------------------------------------------
create function public.review_settle_generation_call(p jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_row readiness_review.generation_calls%rowtype;
begin
  update readiness_review.generation_calls
     set status = p->>'status', usage = p->'usage', settled_at = now(),
         settled_cost_usd = case when p->>'status' = 'indeterminate' then null else (p->>'costUsd')::numeric end
   where call_id = (p->>'callId')::uuid and status = 'reserved'
  returning * into v_row;
  if not found then
    return jsonb_build_object('settled', false);
  end if;
  return jsonb_build_object('settled', true, 'status', v_row.status);
end
$$;

-- 6. Accounting summary for an order and its campaign --------------------------------------------------------------
create function public.review_generation_accounting(p_order text, p_campaign text)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'orderCalls', (select count(*) from readiness_review.generation_calls where order_reference = p_order),
    'orderUnsettled', (select count(*) from readiness_review.generation_calls where order_reference = p_order and status = 'reserved'),
    'campaign', (select jsonb_build_object('campaign', b.campaign, 'maxCalls', b.max_calls, 'maxCostUsd', b.max_cost_usd,
        'calls', (select count(*) from readiness_review.generation_calls c where c.campaign = b.campaign),
        'committedUsd', (select coalesce(sum(case when status in ('succeeded', 'failed') and settled_cost_usd is not null then settled_cost_usd else reserved_cost_usd end), 0)
                           from readiness_review.generation_calls c where c.campaign = b.campaign))
      from readiness_review.generation_budgets b where b.campaign = p_campaign))
$$;

-- 7. Checkpoints -----------------------------------------------------------------------------------------------------
-- Idempotent on (attempt, stage): a repeated write (for example after a lost response) returns the stored digest, and
-- the caller compares it with its own; a different payload for the same attempt and stage is refused.
create function public.review_record_generation_checkpoint(p jsonb)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_row readiness_review.generation_checkpoints%rowtype; v_inserted boolean;
begin
  insert into readiness_review.generation_checkpoints (order_reference, input_digest, attempt_id, stage, fact_pack_digest, manuscript, audit_package, report_id, payload_digest)
  values (p->>'orderReference', p->>'inputDigest', p->>'attemptId', p->>'stage', p->>'factPackDigest', p->>'manuscript', p->'auditPackage',
          nullif(p->>'reportId', '')::uuid, p->>'payloadDigest')
  on conflict (attempt_id, stage) do nothing
  returning * into v_row;
  v_inserted := found;
  if not v_inserted then
    select * into v_row from readiness_review.generation_checkpoints where attempt_id = p->>'attemptId' and stage = p->>'stage';
  end if;
  return jsonb_build_object('recorded', true, 'duplicate', not v_inserted, 'payloadDigest', v_row.payload_digest,
    'matches', v_row.payload_digest = p->>'payloadDigest', 'checkpointId', v_row.checkpoint_id);
end
$$;

-- The resumable state of an order on a bound input: its most recent drafted and validated checkpoints, and which
-- attempts are already linked to a report. Only each package's small resumeMeta is returned, never the package.
create function public.review_generation_checkpoints(p_order text, p_input_digest text)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('attemptId', c.attempt_id, 'stage', c.stage, 'factPackDigest', c.fact_pack_digest,
      'manuscript', case when c.stage in ('drafted', 'validated') then c.manuscript end, 'reportId', c.report_id,
      'resumeMeta', c.audit_package->'resumeMeta',
      'payloadDigest', c.payload_digest, 'createdAt', c.created_at) order by c.created_at desc), '[]'::jsonb)
  from readiness_review.generation_checkpoints c
  where c.order_reference = p_order and c.input_digest = p_input_digest
$$;

-- Validated audit packages that have no link to a report yet: the operator's recovery list.
create function public.review_unlinked_generation_audits(p_order text)
returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('attemptId', v.attempt_id, 'inputDigest', v.input_digest, 'createdAt', v.created_at,
      'payloadDigest', v.payload_digest) order by v.created_at desc), '[]'::jsonb)
  from readiness_review.generation_checkpoints v
  where v.order_reference = p_order and v.stage = 'validated'
    and not exists (select 1 from readiness_review.generation_checkpoints l where l.attempt_id = v.attempt_id and l.stage = 'linked')
$$;

revoke all on table readiness_review.generation_budgets, readiness_review.generation_calls, readiness_review.generation_checkpoints from public, anon, authenticated;
revoke all on function public.review_reserve_generation_call(jsonb) from public, anon, authenticated;
revoke all on function public.review_settle_generation_call(jsonb) from public, anon, authenticated;
revoke all on function public.review_generation_accounting(text, text) from public, anon, authenticated;
revoke all on function public.review_record_generation_checkpoint(jsonb) from public, anon, authenticated;
revoke all on function public.review_generation_checkpoints(text, text) from public, anon, authenticated;
revoke all on function public.review_unlinked_generation_audits(text) from public, anon, authenticated;
grant execute on function public.review_reserve_generation_call(jsonb) to service_role;
grant execute on function public.review_settle_generation_call(jsonb) to service_role;
grant execute on function public.review_generation_accounting(text, text) to service_role;
grant execute on function public.review_record_generation_checkpoint(jsonb) to service_role;
grant execute on function public.review_generation_checkpoints(text, text) to service_role;
grant execute on function public.review_unlinked_generation_audits(text) to service_role;
