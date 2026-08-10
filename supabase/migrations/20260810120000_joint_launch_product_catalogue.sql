-- Joint launch: authoritative commercial product catalogue.
--
-- Establishes the two paid products that launch together - Essential at R7,500 incl VAT and
-- Comprehensive at R35,000 incl VAT - and replaces "compare the order amount against the live
-- catalogue price" entitlement with a versioned price contract.
--
-- WHY A PRICE VERSION TABLE
-- Before this migration, premium-report entitlement asserted orders.amount_cents == 500000 AND
-- products.price_cents == 500000, reading the catalogue price live at generation time. Repricing
-- Essential would therefore have de-entitled every already-paid R5,000 order, and the only cheap
-- repair would have been a standing "500000 or 750000 is always acceptable" allowance - which also
-- entitles a NEW order booked at the OLD price. Instead every catalogue price becomes a row with a
-- half-open validity window, exactly one of which is open (effective_to is null) per product. An
-- order is entitled when its immutable amount snapshot equals the price that genuinely applied at
-- the order's creation instant. Legacy orders are matched by window and are NOT rewritten.
--
-- HISTORICAL ORDERS ARE NOT TOUCHED. orders.product_price_version_id is added as a nullable column
-- and is deliberately left null on every pre-existing row. Their disposition is the owner's
-- decision (see scripts/joint-launch-r5k-disposition-report.mjs); this migration only makes their
-- entitlement resolvable without a dangerous dual-price exception.
--
-- COMPREHENSIVE PRODUCT CODE. The pre-existing 'mk_validated_assessment' row is repriced in place
-- rather than superseded by a new code. Read-only verification on 2026-08-10 showed zero orders
-- reference it in Production (jvjxlphdyzerrhwcgkup) and zero in Staging (penhenkzfrtmcxklodtu), so
-- there is no historical order snapshot to preserve, and repricing avoids leaving an active
-- R50,000 product row behind next to a new Comprehensive row. Its delivery_mode
-- ('mk_led_validated_engagement') and requires_payment_verification (true) were already correct.

begin;

-- 1. Price versions ---------------------------------------------------------------------------

create table if not exists public.product_price_versions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  version_number int not null check (version_number >= 1),
  price_cents int not null check (price_cents >= 0),
  currency text not null default 'ZAR',
  effective_from timestamptz not null,
  -- Null means "current". Exactly one open row per product, enforced below.
  effective_to timestamptz,
  note text,
  created_at timestamptz not null default now(),
  constraint product_price_versions_currency_zar_chk check (currency = 'ZAR'),
  constraint product_price_versions_window_chk check (effective_to is null or effective_to > effective_from),
  constraint product_price_versions_product_version_unique unique (product_id, version_number)
);

create unique index if not exists product_price_versions_one_current_uidx
  on public.product_price_versions(product_id)
  where effective_to is null;

create index if not exists product_price_versions_product_window_idx
  on public.product_price_versions(product_id, effective_from desc);

alter table public.product_price_versions enable row level security;
revoke all on table public.product_price_versions from anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'product_price_versions'
      and policyname = 'product_price_versions_admin_select'
  ) then
    create policy product_price_versions_admin_select on public.product_price_versions
      for select using (public.current_admin_role() in ('platform_admin', 'reviewer', 'approver', 'finance_admin', 'read_only_admin'));
  end if;
end $$;

-- 2. Order reference to the price version it was created against ------------------------------

alter table public.orders
  add column if not exists product_price_version_id uuid references public.product_price_versions(id) on delete restrict;

create index if not exists orders_product_price_version_idx
  on public.orders(product_price_version_id)
  where product_price_version_id is not null;

-- 3. Seed the superseded and current price windows --------------------------------------------
--
-- The cutover instant is now(): every order that already exists was created strictly before this
-- statement runs, so each one falls inside its product's superseded window and keeps the price it
-- was actually sold at. Orders created from this instant onward fall in the new window.

do $$
declare
  cutover timestamptz := now();
  -- Predates the earliest order in any environment (earliest observed: 2026-07-09), so every
  -- historical order resolves to exactly one superseded window.
  epoch_start constant timestamptz := timestamptz '2026-01-01 00:00:00+00';
  free_id uuid;
  essential_id uuid;
  comprehensive_id uuid;
begin
  select id into free_id from public.products where product_code = 'free_snapshot';
  select id into essential_id from public.products where product_code = 'essential_self_assessment';
  select id into comprehensive_id from public.products where product_code = 'mk_validated_assessment';

  if essential_id is null then
    raise exception 'joint_launch_catalogue_missing_product: essential_self_assessment';
  end if;
  if comprehensive_id is null then
    raise exception 'joint_launch_catalogue_missing_product: mk_validated_assessment';
  end if;

  -- Free carries a single, never-superseded zero-price window.
  if free_id is not null and not exists (select 1 from public.product_price_versions where product_id = free_id) then
    insert into public.product_price_versions (product_id, version_number, price_cents, currency, effective_from, effective_to, note)
    values (free_id, 1, 0, 'ZAR', epoch_start, null, 'Free tier carries no paid entitlement.');
  end if;

  -- Essential: R5,000 superseded window, then R7,500 current.
  if not exists (select 1 from public.product_price_versions where product_id = essential_id) then
    insert into public.product_price_versions (product_id, version_number, price_cents, currency, effective_from, effective_to, note)
    values
      (essential_id, 1, 500000, 'ZAR', epoch_start, cutover, 'Superseded pre-joint-launch Essential price (R5,000 incl VAT).'),
      (essential_id, 2, 750000, 'ZAR', cutover, null, 'Joint launch Essential price (R7,500 incl VAT).');
  end if;

  -- Comprehensive: the R50,000 window is closed and R35,000 becomes current. No order references
  -- the superseded window in any environment; it exists so the product has a continuous history.
  if not exists (select 1 from public.product_price_versions where product_id = comprehensive_id) then
    insert into public.product_price_versions (product_id, version_number, price_cents, currency, effective_from, effective_to, note)
    values
      (comprehensive_id, 1, 5000000, 'ZAR', epoch_start, cutover, 'Superseded MK-validated engagement price (R50,000). Zero orders referenced it.'),
      (comprehensive_id, 2, 3500000, 'ZAR', cutover, null, 'Joint launch Comprehensive price (R35,000 incl VAT).');
  end if;
end $$;

-- 4. Bring the catalogue rows themselves to the launch contract --------------------------------
--
-- orders.product_name snapshots the customer-facing name per order, so renaming the catalogue row
-- cannot alter what a historical order says it sold.

update public.products
set name = 'Essential',
    price_cents = 750000,
    currency = 'ZAR',
    requires_payment_verification = true,
    delivery_mode = 'mk_controlled_pdf',
    active = true,
    display_order = 2,
    updated_at = now()
where product_code = 'essential_self_assessment';

update public.products
set name = 'Comprehensive',
    price_cents = 3500000,
    currency = 'ZAR',
    requires_payment_verification = true,
    delivery_mode = 'mk_led_validated_engagement',
    active = true,
    display_order = 3,
    updated_at = now()
where product_code = 'mk_validated_assessment';

update public.products
set name = 'Free',
    price_cents = 0,
    requires_payment_verification = false,
    updated_at = now()
where product_code = 'free_snapshot';

-- 5. Assert the launch contract actually landed -------------------------------------------------

do $$
declare
  offending int;
begin
  if not exists (
    select 1 from public.products where product_code = 'essential_self_assessment' and price_cents = 750000 and active
  ) then
    raise exception 'joint_launch_catalogue_essential_price_not_applied';
  end if;

  if not exists (
    select 1 from public.products where product_code = 'mk_validated_assessment' and price_cents = 3500000 and active
  ) then
    raise exception 'joint_launch_catalogue_comprehensive_price_not_applied';
  end if;

  -- No active paid product may still carry a legacy R5,000 or R50,000 contract.
  select count(*) into offending
  from public.products
  where active and price_cents in (500000, 5000000);
  if offending > 0 then
    raise exception 'joint_launch_catalogue_legacy_price_still_active: % product(s)', offending;
  end if;

  -- Every product referenced by an order must have exactly one open price version.
  select count(*) into offending
  from public.products p
  where exists (select 1 from public.orders o where o.product_id = p.id)
    and (select count(*) from public.product_price_versions v where v.product_id = p.id and v.effective_to is null) <> 1;
  if offending > 0 then
    raise exception 'joint_launch_catalogue_open_price_version_invalid: % product(s)', offending;
  end if;

  -- Every existing order must resolve to exactly one price window carrying its own amount, so no
  -- already-paid order silently loses entitlement at this migration.
  select count(*) into offending
  from public.orders o
  where (
    select count(*)
    from public.product_price_versions v
    where v.product_id = o.product_id
      and o.created_at >= v.effective_from
      and (v.effective_to is null or o.created_at < v.effective_to)
      and v.price_cents = o.amount_cents
      and v.currency = o.currency
  ) <> 1;
  if offending > 0 then
    raise exception 'joint_launch_catalogue_order_price_window_unresolved: % order(s)', offending;
  end if;
end $$;

-- 6. Commercial event taxonomy ------------------------------------------------------------------
--
-- The legacy 'full_report_5000_selected' and 'personalised_report_50000_selected' values stay in
-- the allowlist because rows carrying them already exist and are historical fact. New code emits
-- the tier-named events instead; nothing new is ever written with a legacy value.

do $$
begin
  alter table public.assessment_events drop constraint if exists assessment_events_known_event_type_chk;
  alter table public.assessment_events
    add constraint assessment_events_known_event_type_chk check (event_type in (
      'assessment_started',
      'assessment_submitted',
      'snapshot_viewed',
      'executive_summary_viewed',
      'report_options_opened',
      'report_option_selected',
      -- Historical compatibility only. Not emitted by any current code path.
      'full_report_5000_selected',
      'personalised_report_50000_selected',
      -- Joint launch tier-named commercial events.
      'essential_selected',
      'comprehensive_selected',
      'comprehensive_order_created',
      'comprehensive_evidence_submitted',
      'comprehensive_review_signed_off',
      'eft_order_created',
      'payment_marked_received',
      'report_generated',
      'admin_report_downloaded',
      'report_emailed_to_customer',
      'internal_notification_queued',
      'internal_notification_sent',
      'internal_notification_failed'
    ));
end $$;

-- 7. Least-privilege grants ---------------------------------------------------------------------
-- Read-only for the server. Price versions are minted by migration, never by application code.

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant select on table public.product_price_versions to service_role';
  end if;
end $$;

-- No app_settings row is written here.
--
-- public.app_settings sits on the RC1 'activation_control' freeze surface, so a direct write from a
-- migration is refused while the database is frozen -- correctly, because activation state is meant
-- to change only inside a deliberate RELEASED window through an audited RPC. The launch contract is
-- therefore asserted by this migration's own verification block and by the schema objects it
-- creates, not by a settings row that would either fail the replay or quietly bypass that control.

commit;
