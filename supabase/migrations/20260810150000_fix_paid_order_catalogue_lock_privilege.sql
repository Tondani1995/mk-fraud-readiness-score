-- P1 corrective: paid-order creation failed for BOTH paid products.
--
-- SYMPTOM
-- A customer choosing Essential (R7,500) or Comprehensive (R35,000) received
-- "permission denied for table products" and no order was created.
--
-- ROOT CAUSE
-- public.create_paid_order() is deliberately SECURITY INVOKER (20260810124000 asserts it, so the
-- RC1 operational-freeze trigger on public.orders still applies). It therefore executes as
-- service_role. It took FOR SHARE row locks on public.products and public.product_price_versions.
--
-- PostgreSQL requires UPDATE (or DELETE) privilege IN ADDITION to SELECT for any row-locking
-- clause. 20260810120000 deliberately grants the catalogue to the server READ-ONLY -- "Price
-- versions are minted by migration, never by application code" -- so service_role holds SELECT
-- only. The two accepted migrations were therefore mutually incompatible and every paid order
-- failed before a row was ever attempted.
--
-- Verified on Staging as service_role:
--   products               FOR SHARE  -> 42501 permission denied for table products
--   product_price_versions FOR SHARE  -> 42501 permission denied for table product_price_versions
--   products               plain SELECT -> OK
--   assessments            FOR UPDATE   -> OK   (service_role does hold UPDATE here)
--
-- THE FIX, AND WHY IT IS SAFE WITHOUT THE CATALOGUE LOCKS
-- The catalogue locks are removed. Nothing else changes. The read-only grant stands: this
-- migration adds NO privilege, and the function stays SECURITY INVOKER.
--
-- The locks were defending against a price supersession committing between reading the open price
-- version and inserting the order. Three existing controls already close that window, and all are
-- retained verbatim:
--
--   1. product_price_versions_one_current_uidx guarantees at most one open version per product, so
--      the "current price" is never ambiguous. The <> 1 check still fails closed.
--   2. The order is stamped with created_at = v_now, the SAME instant validated against the
--      version window, and is bound to that exact version id, price, currency. A later reprice
--      opens a NEW version and cannot retroactively alter this row.
--   3. After the insert, public.order_price_version_entitled(v_order.id) is re-evaluated against
--      the committed row. If a supersession did land concurrently, the order is no longer entitled
--      under its own creation instant and the whole transaction aborts with
--      paid_order_price_entitlement_inconsistent. The window fails CLOSED, not silently.
--
-- The assessment FOR UPDATE lock is deliberately KEPT: it is what serialises concurrent order
-- attempts for one assessment and upholds the one-live-Comprehensive-engagement invariant.
-- service_role holds UPDATE on public.assessments, so that lock is legal.

begin;

create or replace function public.create_paid_order(
  p_tier text,
  p_assessment_id uuid,
  p_expected_product_code text,
  p_expected_amount_cents int,
  p_expected_currency text,
  p_report_request_id uuid default null,
  p_customer_email text default null,
  p_customer_name text default null,
  p_organisation_name text default null,
  p_product_name text default null,
  p_eft_instructions_snapshot jsonb default '{}'::jsonb,
  p_requested_by_respondent_id uuid default null,
  p_assessment_reference text default null
)
returns jsonb
language plpgsql
volatile
set search_path = pg_catalog, public
as $$
declare
  v_now timestamptz := now();
  v_assessment public.assessments%rowtype;
  v_product public.products%rowtype;
  v_version public.product_price_versions%rowtype;
  v_open_versions int;
  v_engagement public.comprehensive_engagements%rowtype;
  v_existing_order public.orders%rowtype;
  v_order public.orders%rowtype;
  v_reference text;
  v_attempt int := 0;
  v_engagement_id uuid := null;
  v_engagement_state text := null;
begin
  if p_tier not in ('essential', 'comprehensive') then
    raise exception 'paid_order_tier_not_self_service: %', p_tier using errcode = 'check_violation';
  end if;

  -- Serialise every concurrent order attempt for this assessment. RETAINED.
  select * into v_assessment from public.assessments where id = p_assessment_id for update;
  if not found then
    raise exception 'paid_order_assessment_not_found' using errcode = 'foreign_key_violation';
  end if;

  -- Catalogue reads are now plain SELECTs. The server's grant on these tables is SELECT only.
  select * into v_product from public.products where product_code = p_expected_product_code;
  if not found then
    raise exception 'paid_order_product_not_found: %', p_expected_product_code using errcode = 'foreign_key_violation';
  end if;
  if not v_product.active then
    raise exception 'paid_order_product_inactive: %', p_expected_product_code using errcode = 'check_violation';
  end if;

  select count(*) into v_open_versions
  from public.product_price_versions
  where product_id = v_product.id and effective_to is null;
  if v_open_versions <> 1 then
    raise exception 'paid_order_open_price_version_invalid: % open version(s) for %', v_open_versions, p_expected_product_code
      using errcode = 'check_violation';
  end if;

  select * into v_version
  from public.product_price_versions
  where product_id = v_product.id and effective_to is null;

  if not (v_now >= v_version.effective_from
          and (v_version.effective_to is null or v_now < v_version.effective_to)) then
    raise exception 'paid_order_price_version_not_effective' using errcode = 'check_violation';
  end if;

  if v_version.price_cents is distinct from p_expected_amount_cents
     or upper(v_version.currency) is distinct from upper(p_expected_currency)
     or v_product.product_code is distinct from p_expected_product_code then
    raise exception 'paid_order_catalogue_contract_mismatch: caller expected % %, database has % %',
      p_expected_amount_cents, upper(coalesce(p_expected_currency, '')), v_version.price_cents, v_version.currency
      using errcode = 'check_violation';
  end if;

  if p_tier = 'comprehensive' then
    select * into v_engagement
    from public.comprehensive_engagements
    where assessment_id = p_assessment_id and state <> 'cancelled'
    for update;

    if found then
      select * into v_existing_order from public.orders where id = v_engagement.order_id;
      return jsonb_build_object(
        'created', false,
        'tier', p_tier,
        'order_id', v_existing_order.id,
        'order_reference', v_existing_order.order_reference,
        'product_code', p_expected_product_code,
        'product_name', v_existing_order.product_name,
        'amount_cents', v_existing_order.amount_cents,
        'currency', v_existing_order.currency,
        'status', v_existing_order.status::text,
        'product_price_version_id', v_existing_order.product_price_version_id,
        'engagement_id', v_engagement.id,
        'engagement_state', v_engagement.state::text
      );
    end if;
  end if;

  if p_tier = 'essential' and p_report_request_id is not null then
    select * into v_existing_order
    from public.orders
    where assessment_id = p_assessment_id and report_request_id = p_report_request_id
    for update;
    if found then
      return jsonb_build_object(
        'created', false,
        'tier', p_tier,
        'order_id', v_existing_order.id,
        'order_reference', v_existing_order.order_reference,
        'product_code', p_expected_product_code,
        'product_name', v_existing_order.product_name,
        'amount_cents', v_existing_order.amount_cents,
        'currency', v_existing_order.currency,
        'status', v_existing_order.status::text,
        'product_price_version_id', v_existing_order.product_price_version_id,
        'engagement_id', null,
        'engagement_state', null
      );
    end if;
  end if;

  loop
    v_attempt := v_attempt + 1;
    v_reference := 'MKORD-' || to_char(v_now, 'YYYY') || '-'
      || upper(substr(encode(extensions.gen_random_bytes(6), 'hex'), 1, 8));
    begin
      insert into public.orders (
        order_reference, assessment_id, report_request_id, product_id, product_name,
        product_price_version_id, amount_cents, currency, status,
        requested_by_respondent_id, customer_email, customer_name, organisation_name,
        eft_instructions_snapshot, created_at
      ) values (
        v_reference, p_assessment_id, p_report_request_id, v_product.id,
        coalesce(p_product_name, v_product.name),
        v_version.id, v_version.price_cents, v_version.currency, 'awaiting_payment',
        p_requested_by_respondent_id, p_customer_email::public.citext, p_customer_name,
        p_organisation_name, coalesce(p_eft_instructions_snapshot, '{}'::jsonb), v_now
      )
      returning * into v_order;
      exit;
    exception when unique_violation then
      if v_attempt >= 5 then
        raise exception 'paid_order_reference_allocation_failed' using errcode = 'check_violation';
      end if;
    end;
  end loop;

  -- Fail-closed re-check against the COMMITTED row. This is what makes the catalogue locks
  -- unnecessary: a concurrent supersession is detected here and aborts the whole transaction.
  if not public.order_price_version_entitled(v_order.id) then
    raise exception 'paid_order_price_entitlement_inconsistent' using errcode = 'check_violation';
  end if;

  if p_tier = 'comprehensive' then
    insert into public.comprehensive_engagements (order_id, assessment_id, organisation_id, state)
    values (v_order.id, p_assessment_id, v_assessment.organisation_id, 'awaiting_payment')
    returning id, state::text into v_engagement_id, v_engagement_state;

    insert into public.comprehensive_engagement_events (
      engagement_id, event_type, new_state, actor_type, metadata_json
    ) values (
      v_engagement_id, 'engagement_created', 'awaiting_payment', 'respondent_token',
      jsonb_build_object(
        'order_reference', v_order.order_reference,
        'assessment_reference', coalesce(p_assessment_reference, v_assessment.assessment_reference),
        'product_code', p_expected_product_code,
        'amount_cents', v_order.amount_cents
      )
    );
  end if;

  insert into public.order_events (order_id, event_type, new_status, metadata_json)
  values (
    v_order.id, 'order_created_from_report_request', v_order.status,
    jsonb_build_object(
      'actor_type', 'respondent_token',
      'assessment_reference', coalesce(p_assessment_reference, v_assessment.assessment_reference),
      'tier', p_tier,
      'product_code', p_expected_product_code,
      'product_price_version_id', v_version.id,
      'atomic_rpc', true,
      'payment_gateway', false,
      'proof_upload', false,
      'report_unlock', false
    )
  );

  insert into public.audit_logs (actor_type, assessment_id, entity_table, entity_id, action, after_json)
  values (
    'respondent_token', p_assessment_id, 'orders', v_order.id, 'paid_order_created',
    jsonb_build_object(
      'order_reference', v_order.order_reference,
      'tier', p_tier,
      'product_code', p_expected_product_code,
      'amount_cents', v_order.amount_cents,
      'currency', v_order.currency,
      'product_price_version_id', v_version.id,
      'status', v_order.status,
      'engagement_id', v_engagement_id
    )
  );

  return jsonb_build_object(
    'created', true,
    'tier', p_tier,
    'order_id', v_order.id,
    'order_reference', v_order.order_reference,
    'product_code', p_expected_product_code,
    'product_name', v_order.product_name,
    'amount_cents', v_order.amount_cents,
    'currency', v_order.currency,
    'status', v_order.status::text,
    'product_price_version_id', v_order.product_price_version_id,
    'engagement_id', v_engagement_id,
    'engagement_state', v_engagement_state
  );
end;
$$;

comment on function public.create_paid_order(text, uuid, text, int, text, uuid, text, text, text, text, jsonb, uuid, text) is
  'Transactional paid-order creation. Locks the assessment; reads the product and its single open price version WITHOUT a row lock (the server holds SELECT only on the catalogue by design); verifies the caller''s catalogue contract against the database; and creates the order, the Comprehensive engagement and the authoritative creation trail in one transaction. A concurrent price supersession is caught by the post-insert entitlement re-check and aborts the transaction.';

revoke all on function public.create_paid_order(text, uuid, text, int, text, uuid, text, text, text, text, jsonb, uuid, text)
  from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.create_paid_order(text, uuid, text, int, text, uuid, text, text, text, text, jsonb, uuid, text) to service_role';
  end if;
end $$;

-- Verification -----------------------------------------------------------------------------------

do $$
declare
  v_def text;
begin
  select pg_catalog.pg_get_functiondef(p.oid) into v_def
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'create_paid_order';

  if v_def is null then
    raise exception 'paid_order_lock_fix_function_missing';
  end if;

  -- The invoker contract from 20260810124000 must survive this migration.
  if exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_paid_order' and p.prosecdef
  ) then
    raise exception 'paid_order_lock_fix_must_not_be_security_definer';
  end if;

  -- No catalogue row lock may remain.
  if v_def ~* 'public\.products[^;]*for\s+(share|update|key\s+share|no\s+key\s+update)'
     or v_def ~* 'product_price_versions[^;]*for\s+(share|update|key\s+share|no\s+key\s+update)' then
    raise exception 'paid_order_lock_fix_catalogue_lock_remains';
  end if;

  -- The assessment lock must NOT have been removed.
  if v_def !~* 'from public\.assessments where id = p_assessment_id for update' then
    raise exception 'paid_order_lock_fix_assessment_lock_missing';
  end if;

  -- The fail-closed controls must all survive.
  if v_def !~ 'paid_order_catalogue_contract_mismatch'
     or v_def !~ 'paid_order_open_price_version_invalid'
     or v_def !~ 'paid_order_price_version_not_effective'
     or v_def !~ 'paid_order_price_entitlement_inconsistent' then
    raise exception 'paid_order_lock_fix_dropped_a_failclosed_check';
  end if;
end $$;

-- The catalogue stays read-only to the server. This migration grants NOTHING on products or
-- product_price_versions, and asserts that no UPDATE privilege has appeared on either.
do $$
declare
  v_writable int;
begin
  select count(*) into v_writable
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name in ('products', 'product_price_versions')
    and grantee in ('service_role', 'anon', 'authenticated')
    and privilege_type in ('UPDATE', 'INSERT', 'DELETE');
  if v_writable > 0 then
    raise exception 'paid_order_lock_fix_catalogue_became_writable: % grant(s)', v_writable;
  end if;
end $$;

commit;
