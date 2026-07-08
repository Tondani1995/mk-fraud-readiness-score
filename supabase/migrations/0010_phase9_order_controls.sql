-- MK Fraud Readiness Score V1 - Phase 9 order control seed
-- Purpose: activate a controlled order queue for paid detailed-report requests.

begin;

insert into public.products (
  product_code,
  name,
  price_cents,
  currency,
  requires_payment_verification,
  delivery_mode,
  active,
  display_order
)
values (
  'detailed_readiness_report_v1',
  'Detailed MK Fraud Readiness Report',
  0,
  'ZAR',
  true,
  'manual_order_review',
  true,
  10
)
on conflict (product_code) do update set
  name = excluded.name,
  requires_payment_verification = excluded.requires_payment_verification,
  delivery_mode = excluded.delivery_mode,
  active = excluded.active,
  display_order = excluded.display_order,
  updated_at = now();

insert into public.app_settings (setting_key, value_json)
values (
  'manual_order_flow_v1',
  '{
    "mode":"manual_order_review",
    "product_code":"detailed_readiness_report_v1",
    "customer_message":"MK Fraud Insights will confirm the detailed report process by email. Please quote the order reference in any correspondence.",
    "admin_note":"Phase 9 is a manual order-control workflow only. Report creation and release remain outside this step.",
    "report_generation_enabled":false,
    "report_release_enabled":false
  }'::jsonb
)
on conflict (setting_key) do update set
  value_json = excluded.value_json,
  updated_at = now();

create unique index if not exists orders_one_open_detailed_report_order_idx
on public.orders (assessment_id, product_id)
where status not in ('rejected','cancelled','refunded');

commit;
