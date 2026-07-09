# Phase 10 Schema Reconciliation Evidence

## Status

`BLOCKED BY RUNTIME / ADMIN UAT`

Claude completed live read-only Supabase schema reconciliation and then identified route/migration fixes required before current-head runtime report generation can be trusted.

## Live Supabase findings reported by Claude

- All 13 required public tables were present.
- `report_templates` was empty.
- `reports.template_id` is `NOT NULL`, so the previous generate route would have failed without an active template row.
- `report_content_blocks` had 36 rows: 36 draft, 0 active.
- Both `payment-proofs` and `generated-reports` buckets were present and private.
- `reports` has a uniqueness constraint scoped by `(assessment_id, report_type, version_number)`, not by `order_id`.
- A real `payment_received` order was available for pipeline testing: `MKORD-2026-KDV20GFY`.
- Claude could render a real PDF from live data locally, but could not perform a legitimate Supabase Storage upload because its environment had SQL/migration access but no Storage API access.

## Fixes applied after reconciliation

- Report assembly now returns the linked product code.
- The admin generate route maps product codes to the correct report type:
  - `essential_self_assessment` -> `essential_self_assessment`
  - `mk_validated_assessment` -> `mk_validated`
- The admin generate route now loads an active template for the actual report type.
- Report version lookup now follows the real uniqueness scope: `(assessment_id, report_type)`.
- Report inserts now store the actual report type instead of hardcoding `essential_self_assessment`.
- The Phase 10 migration now seeds active template rows for both supported report types.
- Regression checks were added for product-code mapping, template selection and versioning scope.

## What remains unverified

- The patched GitHub head still needs CI confirmation after these fixes.
- The patched migration has not been applied by ChatGPT.
- A current-head Vercel/runtime route call has not generated a real report row and storage object.
- Download/security UAT is still outstanding.
- The generated PDF still needs a final premium-quality review from the actual deployed route.

## Recommendation

Keep PR #13 draft. Do not mark ready and do not merge until CI passes on the patched GitHub head, live runtime report generation writes a real private storage object and report row, download/security UAT passes, and the generated PDF passes the MK premium-quality review.
