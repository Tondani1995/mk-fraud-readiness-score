# Phase 10 Exit Card — Premium PDF Report Engine

## Status

`BLOCKED`

Phase 10 is not ready and PR #13 must remain draft. ZIP-based local testing passed after the first patch, and Claude later completed live schema reconciliation and local live-data PDF rendering, but current-head deployed report generation, real Supabase Storage upload, download/security UAT and final PDF quality sign-off are still outstanding.

## Branching

- Base branch: `main`
- Phase 9 merge SHA on `main`: `92cbb6516cc8a777f94ce0adfa7c9e9f9b36462b`
- Phase 10 branch: `phase10/pdf-report-engine`
- PR: `#13`

## What this draft adds

- Server-side report-data assembly from persisted score tables only.
- Admin-only report-generation route keyed by order reference.
- Payment gate: generation is allowed only after the Phase 9 order is in `payment_received` state.
- Versioned report rows in `reports`.
- Supersession on regeneration; prior reports are not silently overwritten.
- Private report storage through `generated-reports`.
- Admin signed download route with short-lived signed URLs.
- Admin order-detail report-generation and report-version controls.
- Static Phase 10 verification script.

## Patch applied after Codex ZIP testing

- Removed legacy `verified` eligibility from report assembly.
- Fixed content-block selection to match persisted domain codes rather than domain display names.
- Removed stale public phase/proof-upload wording from the report request page.
- Added regression coverage for the eligibility gate, content-code matching and public wording boundary.

## Patch applied after Claude schema reconciliation

Claude identified additional live-schema defects that would have broken real generation:

- `report_templates` was empty while `reports.template_id` is `NOT NULL`.
- The generate route did not select or insert a `template_id` in a schema-safe way for all report types.
- The generate route hardcoded `essential_self_assessment` instead of deriving the report type from the ordered product.
- Version lookup was scoped by `order_id` while the live uniqueness constraint is scoped by `(assessment_id, report_type, version_number)`.
- With 0 active content blocks, the generated report uses fallback content only.

The GitHub branch now includes fixes for those issues:

- Report assembly returns the linked product code.
- Product codes map to supported report types.
- Active report template lookup uses the derived report type.
- Report version lookup follows `(assessment_id, report_type)`.
- Report inserts use the derived report type.
- Migration seeds active template rows for both supported report types.
- Regression tests cover the route and migration expectations.

## Runtime UAT issue observed on preview

Manual browser UAT against the exact-head Vercel preview for `4bd2b19383cda71104321b46dc267cb21519079e` reached the order detail page and showed the controlled report-generation panel for order `MKORD-2026-KDV20GFY`.

Clicking **Generate report version** returned a browser-level HTTP 500 before any `reports` row or `audit_logs` report entry was created. A follow-up patch now wraps PDF rendering, storage upload and report insertion with controlled error handling so the next preview can return an auditable failure reason instead of a raw 500.

## Local ZIP test results reported by Codex

The following passed from the uploaded PR #13 ZIP after the first patch:

- `phase7:test-snapshot`
- `phase8:test-admin`
- `methodology:copy-test`
- `phase9:test-orders`
- `phase10:test-report`
- `typecheck`
- `build` with safe dummy build-time environment values

Note: Codex used bundled `pnpm` because `npm` was unavailable in that workspace.

## Live schema / local rendering results reported by Claude

- Supabase table reconciliation was completed.
- Both storage buckets were confirmed private.
- Real data was used for local report rendering:
  - Assessment reference: `MKFRS-2026-32D6B98B03`
  - Order reference: `MKORD-2026-KDV20GFY`
- Local live-data PDF rendering produced a 21-page fallback-only PDF with no internal-code scan findings, no clipping, and no `null` / `undefined` / `NaN` text.
- No `reports` row or storage object was written because Claude did not have Supabase Storage API access and correctly refused to fake a report row pointing at a non-existent file.

## Explicitly excluded

No PayFast, card payments, automated payment verification, proof upload, automated email delivery, respondent portal, subscriptions, public benchmarks or live AI-generated recommendations are added.

## Known gaps before PASS

- CI must pass on the latest patched GitHub head.
- The Phase 10 migration has not been applied by ChatGPT.
- Current-head Vercel/runtime generation must create a real PDF, a real private storage object and a real `reports` row.
- Download/security UAT must prove signed admin-only access and private storage.
- Unpaid orders must be proven unable to generate a report.
- Generated PDF must be visually reviewed against the premium MK report standard.
- Draft content blocks remain unapproved. Until MK approves active content blocks, real reports will use fallback content only.

## Current recommendation

Keep PR #13 draft. Do not mark ready and do not merge until CI passes on the latest patched head, live Supabase runtime generation succeeds through the deployed route, download/security UAT passes and the generated PDF passes premium-quality review.
