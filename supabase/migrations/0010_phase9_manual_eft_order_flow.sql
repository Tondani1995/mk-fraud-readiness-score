-- MK Fraud Readiness Score V1 - Phase 9 manual EFT order flow
-- Purpose: extend the existing commercial foundation so detailed-report requests can create
-- manual EFT orders without payment gateway, proof upload, PDF generation or report unlock.

begin;

-- Extend the existing enum without removing historical values. These labels support the
-- controlled V1 manual order queue and do not trigger automated fulfilment.
do $$
begin
  alter type public.order_status add value if not exists 'draft';
  alter type public.order_status add value if not exists 'payment_received';
  alter type public.order_status add value if not exists 'expired';
exception
  when duplicate_object then null;
end $$;

create table if not exists public.eft_settings (
  id uuid primary key default gen_random_uuid(),
  bank_name text not null,
  account_holder text not null,
  account_number text not null,
  branch_code text not null,
  account_type text,
  currency text not null default 'ZAR',
  payment_reference_instruction text not null,
  customer_instruction text not null,
  contact_email public.citext not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists eft_settings_one_active_idx
  on public.eft_settings(is_active)
  where is_active;

alter table public.eft_settings enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'eft_settings' and policyname = 'eft_settings_admin_select'
  ) then
    create policy eft_settings_admin_select on public.eft_settings
      for select using (public.current_admin_role() in ('platform_admin', 'finance_admin', 'read_only_admin'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'eft_settings' and policyname = 'eft_settings_platform_finance_manage'
  ) then
    create policy eft_settings_platform_finance_manage on public.eft_settings
      for all using (public.current_admin_role() in ('platform_admin', 'finance_admin'))
      with check (public.current_admin_role() in ('platform_admin', 'finance_admin'));
  end if;
end $$;

-- If a complete active EFT profile already exists, preserve it. Otherwise activate the
-- verified MK manual EFT profile for new order snapshots.
do $$
begin
  if not exists (
    select 1
    from public.eft_settings
    where is_active
      and nullif(bank_name, '') is not null
      and nullif(account_holder, '') is not null
      and nullif(account_number, '') is not null
      and nullif(branch_code, '') is not null
      and currency = 'ZAR'
  ) then
    update public.eft_settings set is_active = false, updated_at = now() where is_active;

    insert into public.eft_settings (
      bank_name,
      account_holder,
      account_number,
      branch_code,
      account_type,
      currency,
      payment_reference_instruction,
      customer_instruction,
      contact_email,
      is_active
    ) values (
      'FNB',
      'MK Fraud Insights',
      '63106109332',
      '250655',
      null,
      'ZAR',
      'Use your order reference as the payment reference.',
      'MK Fraud Insights confirms EFT payments manually before any detailed report is released.',
      'hello@mkfraud.co.za',
      true
    );
  end if;
end $$;

alter table public.orders
  add column if not exists report_request_id uuid references public.data_requests(id) on delete set null,
  add column if not exists product_name text,
  add column if not exists customer_email public.citext,
  add column if not exists customer_name text,
  add column if not exists organisation_name text,
  add column if not exists eft_instructions_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists admin_notes text,
  add column if not exists created_by_admin_user_id uuid,
  add column if not exists updated_by_admin_user_id uuid;

update public.orders o
set product_name = coalesce(o.product_name, p.name)
from public.products p
where o.product_id = p.id
  and o.product_name is null;

alter table public.orders
  alter column product_name set default 'Detailed Fraud Readiness Report';

update public.orders
set product_name = 'Detailed Fraud Readiness Report'
where product_name is null;

alter table public.orders
  alter column product_name set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'orders_amount_cents_non_negative'
  ) then
    alter table public.orders add constraint orders_amount_cents_non_negative check (amount_cents >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'orders_v1_currency_zar'
  ) then
    alter table public.orders add constraint orders_v1_currency_zar check (currency = 'ZAR');
  end if;
end $$;

create table if not exists public.order_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  event_type text not null,
  previous_status public.order_status,
  new_status public.order_status,
  note text,
  actor_admin_user_id uuid,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists orders_report_request_idx on public.orders(report_request_id);
create index if not exists orders_created_at_idx on public.orders(created_at desc);
create unique index if not exists orders_assessment_report_request_unique
  on public.orders(assessment_id, report_request_id)
  where report_request_id is not null;
create index if not exists order_events_order_created_idx on public.order_events(order_id, created_at desc);

alter table public.order_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'order_events' and policyname = 'order_events_admin_select'
  ) then
    create policy order_events_admin_select on public.order_events
      for select using (public.current_admin_role() in ('platform_admin', 'finance_admin', 'read_only_admin'));
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'order_events' and policyname = 'order_events_finance_insert'
  ) then
    create policy order_events_finance_insert on public.order_events
      for insert with check (public.current_admin_role() in ('platform_admin', 'finance_admin'));
  end if;
end $$;

insert into public.app_settings (setting_key, value_json)
values (
  'phase9_manual_eft_order_flow',
  '{"status":"active","scope":"manual_eft_orders_only","payment_gateway":false,"proof_upload":false,"pdf_generation":false,"report_unlock":false}'::jsonb
)
on conflict (setting_key) do update set value_json = excluded.value_json, updated_at = now();

commit;
