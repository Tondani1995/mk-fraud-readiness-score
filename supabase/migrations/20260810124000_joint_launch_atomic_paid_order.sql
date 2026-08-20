-- Joint launch: one transactional primitive for paid-order creation.
--
-- THE DEFECT THIS CLOSES
-- createPaidOrderForAssessment() inserted the order first and, for Comprehensive, the engagement
-- afterwards, in separate statements. Two concurrent Comprehensive requests for one assessment
-- could therefore:
--   1. both insert an R35,000 order row;
--   2. let one engagement insert win;
--   3. lose the other on comprehensive_engagements_one_live_per_assessment_uidx;
--   4. return engagement_already_active to the loser;
--   5. leave the loser's R35,000 order row orphaned -- a paid-product order with no engagement,
--      invisible to the reviewer workflow and indistinguishable from a real one to finance.
--
-- It also read the current price version in one statement and inserted the order in another, so a
-- price supersession committing between the two would bind an order to a version that no longer
-- covered its creation instant.
--
-- HOW THIS FIXES IT
-- Everything that must agree now happens in one transaction, under locks taken in a fixed order:
--
--   assessment row        FOR UPDATE  -- serialises every order attempt for one assessment, which
--                                        is exactly the scope of the one-live-engagement invariant
--   product row           FOR SHARE   -- the product cannot be repriced or deactivated underneath
--   open price version    FOR SHARE   -- a supersession must wait; the window we validated is the
--                                        window the order is bound to
--
-- The caller passes the catalogue contract it compiled against (product code, amount, currency). If
-- that does not match what the database currently says, the order is refused. That is the guard
-- against a stale application: a deployment still carrying the R5,000 Essential contract cannot
-- create an order against a repriced database -- it is rejected rather than writing a mispriced row.
--
-- SECURITY INVOKER, deliberately. The brief allows a narrow SECURITY DEFINER, but none is needed:
-- service_role already holds exactly the INSERT rights this function uses, so DEFINER would add
-- privilege without adding capability. Running as INVOKER also keeps every existing control live --
-- in particular the RC1 operational-freeze trigger on public.orders still refuses order creation
-- while the database is frozen, which the joint-launch cutover sequence depends on.
--
-- Notifications, analytics and email stay OUT of this transaction. They are post-commit concerns
-- and must never be able to abort or delay an authoritative commercial write.

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

  -- 1. Serialise every concurrent order attempt for this assessment.
  select * into v_assessment from public.assessments where id = p_assessment_id for update;
  if not found then
    raise exception 'paid_order_assessment_not_found' using errcode = 'foreign_key_violation';
  end if;

  -- 2. Pin the product and its single open price version for the life of the transaction.
  select * into v_product from public.products where product_code = p_expected_product_code for share;
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
  where product_id = v_product.id and effective_to is null
  for share;

  -- 3. The window we validated must actually contain the instant this order is stamped with, so the
  --    resolved version and the order's creation time cannot disagree.
  if not (v_now >= v_version.effective_from
          and (v_version.effective_to is null or v_now < v_version.effective_to)) then
    raise exception 'paid_order_price_version_not_effective' using errcode = 'check_violation';
  end if;

  -- 4. The caller's compiled catalogue contract must match the database. A stale deployment is
  --    refused here rather than allowed to write a mispriced order.
  if v_version.price_cents is distinct from p_expected_amount_cents
     or upper(v_version.currency) is distinct from upper(p_expected_currency)
     or v_product.product_code is distinct from p_expected_product_code then
    raise exception 'paid_order_catalogue_contract_mismatch: caller expected % %, database has % %',
      p_expected_amount_cents, upper(coalesce(p_expected_currency, '')), v_version.price_cents, v_version.currency
      using errcode = 'check_violation';
  end if;

  -- 5. Comprehensive: one live engagement per assessment. Because the assessment row is already
  --    locked, a concurrent attempt is queued behind this check rather than racing it -- so the
  --    loser observes the winner's engagement and returns it, and no second order is ever inserted.
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

  -- 6. Essential reuses the order already linked to this report request, matching the pre-existing
  --    orders_assessment_report_request_unique contract instead of racing it.
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

  -- 7. Insert the immutable order snapshot. created_at is set explicitly to the instant validated
  --    above rather than left to the column default, so the row cannot be stamped with a different
  --    time than the one the price window was checked against.
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

  -- 8. The committed row must be entitled under the versioned contract. If it is not, something
  --    moved despite the locks and the whole transaction is abandoned rather than half-applied.
  if not public.order_price_version_entitled(v_order.id) then
    raise exception 'paid_order_price_entitlement_inconsistent' using errcode = 'check_violation';
  end if;

  -- 9. Comprehensive engagement, in the SAME transaction as its order. There is no instant at which
  --    a Comprehensive order exists without its engagement.
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

  -- 10. Authoritative creation trail, same transaction.
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
  'Transactional paid-order creation. Locks the assessment, product and open price version; verifies the caller''s catalogue contract against the database; and creates the order, the Comprehensive engagement and the authoritative creation trail in one transaction. Two concurrent Comprehensive attempts for one assessment yield exactly one order and one engagement, never an orphan.';

revoke all on function public.create_paid_order(text, uuid, text, int, text, uuid, text, text, text, text, jsonb, uuid, text)
  from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant execute on function public.create_paid_order(text, uuid, text, int, text, uuid, text, text, text, text, jsonb, uuid, text) to service_role';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_paid_order'
  ) then
    raise exception 'joint_launch_atomic_paid_order_not_installed';
  end if;

  -- INVOKER, not DEFINER: the freeze trigger and every existing control must still apply.
  if exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_paid_order' and p.prosecdef
  ) then
    raise exception 'joint_launch_atomic_paid_order_must_not_be_security_definer';
  end if;
end $$;

commit;
