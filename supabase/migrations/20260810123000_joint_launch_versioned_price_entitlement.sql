-- Joint launch: move the DATABASE-side price entitlement onto the versioned price contract.
--
-- WHY THIS EXISTS
-- The TypeScript guard was not the only place the R5,000 price was hard-coded. Two live SECURITY
-- DEFINER functions still carry the same literal in SQL:
--
--   phase14_generation_entitlement                 'essential_price_mismatch'
--   phase14_delivery_entitlement                   'delivery_price_mismatch'
--
--     if v_order.amount_cents <> 500000 or v_product.price_cents <> 500000 then ...
--
-- 0017 originally installed the same predicate in assert_premium_report_generation_entitlement and
-- assert_premium_report_delivery_entitlement as well, but later migrations replaced both bodies and
-- neither carries a price check any more -- verified against a full replay of the committed chain,
-- not assumed. This migration therefore rewrites exactly two functions and asserts that count, so a
-- future body that reintroduces the literal fails the migration instead of slipping through.
--
-- That predicate reads products.price_cents LIVE. After the catalogue moves to R7,500 it breaks in
-- BOTH directions: a new R7,500 order fails (amount <> 500000) and every already-paid R5,000 order
-- also fails (the live product price is no longer 500000). Automatic release and delivery would
-- stop for every Essential order, old and new. Repricing without this migration is not safe.
--
-- HOW
-- Rather than re-emitting long function bodies by hand -- which risks silently dropping an
-- unrelated check -- this reads each function's current definition with pg_get_functiondef() and
-- replaces ONLY the price predicate, then re-executes it. Every other line of every function is
-- preserved byte-for-byte, and the migration asserts exactly how many replacements it made.
--
-- The replacement delegates to one helper that mirrors
-- src/lib/commercial/order-price-entitlement.ts: the order's immutable amount snapshot must equal
-- the price its product genuinely carried at the order's creation instant. So a legitimately paid
-- R5,000 order stays entitled, a new R7,500 order is entitled, and an order booked at R5,000 after
-- the cutover is not -- without any standing dual-price allowance.

begin;

-- The SQL mirror of validateOrderPriceEntitlement(). Fully schema-qualified and search_path-pinned
-- because every caller runs with `search_path = ''`.
create or replace function public.order_price_version_entitled(p_order_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.orders o
    join public.product_price_versions v on v.product_id = o.product_id
    where o.id = p_order_id
      and v.price_cents = o.amount_cents
      and v.currency = o.currency
      -- Half-open window [effective_from, effective_to) containing the order's creation instant.
      and o.created_at >= v.effective_from
      and (v.effective_to is null or o.created_at < v.effective_to)
      -- An order explicitly bound to a version must match that exact version, so a stale or
      -- hand-set reference cannot buy entitlement at a price that never applied to it.
      and (o.product_price_version_id is null or o.product_price_version_id = v.id)
  );
$$;

comment on function public.order_price_version_entitled(uuid) is
  'True when an order''s immutable amount snapshot equals the price its product carried when the order was created. Never reads the current catalogue price, so a reprice cannot de-entitle an already-paid order.';

revoke all on function public.order_price_version_entitled(uuid) from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.order_price_version_entitled(uuid) to service_role';
  end if;
end $$;

-- Rewrite the price predicates in place.

do $$
declare
  v_function record;
  v_definition text;
  v_rewritten text;
  v_replacements int := 0;
  v_pinned_before int;
  v_generation_literal constant text :=
    'if v_order.amount_cents <> 500000 or v_product.price_cents <> 500000 then raise exception ''essential_price_mismatch''; end if;';
  v_delivery_literal constant text :=
    'if v_order.amount_cents <> 500000 or v_product.price_cents <> 500000 then raise exception ''delivery_price_mismatch''; end if;';
  v_generation_replacement constant text :=
    'if not public.order_price_version_entitled(v_order.id) then raise exception ''essential_price_mismatch''; end if;';
  v_delivery_replacement constant text :=
    'if not public.order_price_version_entitled(v_order.id) then raise exception ''delivery_price_mismatch''; end if;';
begin
  -- Replay-safety: on a re-apply the predicate is already rewritten, so there is nothing left to
  -- find and zero replacements is the correct outcome. The invariant asserted is therefore "every
  -- function that still pinned the literal was rewritten", not a fixed count.
  select count(*) into v_pinned_before from (
    select pg_catalog.pg_get_functiondef(p.oid) as definition
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    join pg_catalog.pg_language l on l.oid = p.prolang
    where n.nspname = 'public' and p.prokind = 'f' and l.lanname in ('sql', 'plpgsql')
  ) candidates
  where definition like '%amount_cents <> 500000%';

  for v_function in
    select oid, proname, definition from (
      select p.oid, p.proname, pg_catalog.pg_get_functiondef(p.oid) as definition
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      join pg_catalog.pg_language l on l.oid = p.prolang
      -- pg_get_functiondef() raises on aggregates and window functions, so only plain SQL and
      -- PL/pgSQL routines are considered. Every entitlement function is one of those.
      where n.nspname = 'public' and p.prokind = 'f' and l.lanname in ('sql', 'plpgsql')
    ) candidates
    where definition like '%amount_cents <> 500000%'
  loop
    v_definition := v_function.definition;
    v_rewritten := pg_catalog.replace(v_definition, v_generation_literal, v_generation_replacement);
    v_rewritten := pg_catalog.replace(v_rewritten, v_delivery_literal, v_delivery_replacement);

    if v_rewritten = v_definition then
      raise exception 'joint_launch_price_predicate_shape_unexpected: %', v_function.proname;
    end if;

    execute v_rewritten;
    v_replacements := v_replacements + 1;
    raise notice 'joint_launch_versioned_price_entitlement: rewrote %', v_function.proname;
  end loop;

  if v_replacements <> v_pinned_before then
    raise exception 'joint_launch_price_predicate_rewrite_incomplete: rewrote % of % pinned function(s)',
      v_replacements, v_pinned_before;
  end if;

  -- On a first application exactly two functions carry the literal (phase14_generation_entitlement
  -- and phase14_delivery_entitlement), established by replaying the whole committed chain. A larger
  -- number means a body reintroduced the literal and the rewrite must be reviewed, not assumed.
  if v_pinned_before > 2 then
    raise exception 'joint_launch_price_predicate_count_unexpected: % pinned function(s), expected at most 2', v_pinned_before;
  end if;
end $$;

-- Verification: no function in public may still pin a hard-coded Essential price, and both Phase 14
-- entitlement functions must now delegate to the versioned contract.

do $$
declare
  v_remaining int;
  v_delegating int;
begin
  select count(*) into v_remaining from (
    select pg_catalog.pg_get_functiondef(p.oid) as definition
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    join pg_catalog.pg_language l on l.oid = p.prolang
    where n.nspname = 'public' and p.prokind = 'f' and l.lanname in ('sql', 'plpgsql')
  ) candidates
  where definition like '%amount_cents <> 500000%';
  if v_remaining > 0 then
    raise exception 'joint_launch_hardcoded_price_predicate_remains: % function(s)', v_remaining;
  end if;

  select count(*) into v_delegating
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  join pg_catalog.pg_language l on l.oid = p.prolang
  where n.nspname = 'public' and p.prokind = 'f' and l.lanname in ('sql', 'plpgsql')
    and p.proname in ('phase14_generation_entitlement', 'phase14_delivery_entitlement')
    and pg_catalog.pg_get_functiondef(p.oid) like '%order_price_version_entitled%';
  if v_delegating <> 2 then
    raise exception 'joint_launch_price_delegation_incomplete: % of 2 functions delegate', v_delegating;
  end if;
end $$;

commit;
