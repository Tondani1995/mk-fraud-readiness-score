# Phase 10 Schema Reconciliation Evidence

## Status

`BLOCKED BY SUPABASE CONNECTOR LIMIT`

This file records the schema-reconciliation status after Codex ZIP-based testing. The code patch was tested locally from the uploaded PR #13 source ZIP, but live Supabase read-only reconciliation could not be completed because the Supabase connector returned a usage-limit error before execution.

## What was confirmed locally

- Phase 10 report generation is now gated only on `payment_received`.
- The legacy `verified` order status is not treated as eligible for Phase 10 report generation.
- Content block matching uses persisted domain codes rather than display names.
- The public report request page no longer exposes stale phase wording or proof-upload wording.
- Regression coverage was added to `scripts/phase10-premium-report-tests.mjs` for those defects.

## What still requires live verification

Before PR #13 can pass, the following must be verified against the live Supabase project:

- `reports.template_id` requirements match the generate route.
- `report_templates` has a usable active Phase 10 template row.
- `report_content_blocks.actions_json` requirements are satisfied by any seeded content blocks.
- `generated-reports` exists and is private.
- Existing Phase 10-ish migrations/content drift is understood before applying any new migration.
- Report generation can insert `reports`, write `report_events`, write `audit_logs`, and upload a private storage object.

## Recommendation

Keep PR #13 draft. Do not apply a production migration and do not mark Phase 10 ready until live Supabase reconciliation, current-head runtime PDF generation, download/security UAT and PDF quality inspection are complete.
