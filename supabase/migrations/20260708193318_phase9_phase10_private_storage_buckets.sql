-- Source/cloud reconciliation (docs/safe-launch/25-source-cloud-migration-reconciliation.md):
-- this version identity was applied to jvjxlphdyzerrhwcgkup but had no corresponding file anywhere
-- in this repository's git history before this reconciliation. Recovered VERBATIM from
-- supabase_migrations.schema_migrations.statements, retrieved read-only via the Supabase MCP
-- execute_sql tool on 2026-07-25. Nothing here was invented.
--
-- Overlap note (see doc 25): the already-committed 0011_phase10_pdf_report_engine_additions.sql
-- also creates/updates the 'generated-reports' bucket, at a different file_size_limit (15MB there
-- vs 50MB here) via ON CONFLICT DO UPDATE; and 0017_phase14_canonical_disabled_foundation.sql
-- separately, unconditionally UPDATEs 'generated-reports' to file_size_limit=15728640 regardless of
-- how it got created. The three together converge on the live database's actual current state
-- (15MB) regardless of relative order, confirmed by fresh replay (doc 25) -- this migration's own
-- 50MB value is transient/superseded, not a live discrepancy. 'payment-proofs' is created only
-- here; no other committed migration touches it.

-- Creates the two private storage buckets referenced by the schema (payment_proofs.storage_bucket,
-- reports.storage_bucket) and by env vars (SUPABASE_BUCKET_PAYMENT_PROOFS, SUPABASE_BUCKET_REPORTS)
-- but which never actually existed in Supabase Storage - confirmed via direct inspection
-- (select id,name,public from storage.buckets returned zero rows) before this migration.
--
-- Both are created with public=false. storage.objects already has RLS enabled with zero
-- existing policies, which means the default posture is already fully deny-by-default for
-- anon/authenticated - only the service-role key (used exclusively by the Next.js server,
-- never client-side) can read or write objects. No additional policy is required to achieve
-- "private" here; adding a permissive policy would be the thing that weakens this, not
-- omitting one.

insert into storage.buckets (id, name, public, file_size_limit)
values
  ('payment-proofs', 'payment-proofs', false, 10485760),   -- 10MB limit, proof-of-payment images/PDFs
  ('generated-reports', 'generated-reports', false, 52428800) -- 50MB limit, generated PDF reports
on conflict (id) do nothing;
