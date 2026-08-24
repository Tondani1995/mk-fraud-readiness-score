-- Functional runtime plumbing for the existing Essential report assembler.
-- The service-role client reads these catalogue tables during report preflight;
-- no write privilege or public-client privilege is required by that path.
grant select on table public.products to service_role;
grant select on table public.product_price_versions to service_role;
