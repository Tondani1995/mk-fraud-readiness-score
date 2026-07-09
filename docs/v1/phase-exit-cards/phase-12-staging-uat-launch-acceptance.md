# Phase 12 Exit Card: Staging UAT and Launch Acceptance

Date: 2026-07-09

Branch: `phase12/staging-uat-launch-acceptance`

Scope: documentation-only Phase 12 UAT evidence. No runtime code, schema or dependency changes.

Strict phase result: PASS WITH CONDITIONS

Recommendation: focused polish PR required before broad public launch.

## Deployment Under Test

- Repository: `Tondani1995/mk-fraud-readiness-score`
- Main commit: `040b725b9a5b3b6885d9f1de4a4a53f24c604c25`
- Production deployment: `dpl_AUcTiHTs3LSdGohWNv9uxAvB7Rw8`
- Production URL: https://mk-fraud-readiness-score-h5oh6t0e2-tondanis-projects.vercel.app
- Vercel state: READY
- Exact commit match: yes

## Commands and Checks Run

Live runtime checks were run against the production deployment and production Supabase data. No local build or dependency checks were part of this documentation-only phase card.

Executed verification categories:

- Vercel deployment metadata check.
- Production `/score/start` fetch check.
- Public assessment happy path.
- Scenario matrix A-I via public flow.
- Manual EFT order request and duplicate-order check.
- Admin manual payment status update.
- Direct authenticated unpaid report-generation negative check.
- Admin report generation and download.
- PDF inspection with text extraction.
- Public negative route checks.
- Logged-out admin access checks.
- Authenticated admin page smoke checks.
- Supabase reconciliation for orders, reports, report events, order events, audit logs and storage objects.
- Vercel runtime error/log check.

## Main UAT Record

- Organisation: `MK Phase12 Launch UAT 20260709205410`
- Assessment reference: `MKFRS-2026-4116823B06`
- Order reference: `MKORD-2026-EBPPMK0O`
- Report ID: `e1194182-3101-4895-ae64-01979690d683`
- Persisted report reference: `RPT-MKFRS-2026-4116823B06-V1`

Outcome:

- Free snapshot rendered after submission.
- Detailed report request created one manual EFT order.
- Duplicate report request did not create duplicate current order state.
- Order was marked `payment_received` by admin.
- Report was generated and downloaded through admin.
- Report remained unreleased automatically.

## Scenario Coverage

Completed and reconciled:

- Launch UAT
- Scenario A: low maturity / high exposure
- Scenario B: medium maturity / medium exposure
- Scenario C: high maturity / high exposure
- Scenario D: high maturity / low exposure
- Scenario E: low maturity / low exposure
- Scenario F: domain-skewed weakness
- Scenario G: procurement/vendor weakness
- Scenario H: internal fraud/staff weakness
- Scenario I: digital/customer scam weakness

Condition:

- Scenario J incident-response weakness was interrupted by public start-rate limiting and remains incomplete. Draft assessment `MKFRS-2026-A1A9A30AC7` was created with no order and no report.

## Security and Access Results

Passed:

- Legacy result route no longer rendered a snapshot by assessment reference alone.
- Snapshot route without token returned controlled missing-token page.
- Report-request API without token returned HTTP 403.
- Report-request API with fake token returned HTTP 403.
- Order count remained one after negative report-request attempts.
- Direct authenticated unpaid report-generation POST returned HTTP 409 `order_not_eligible`.
- Logged-out admin pages redirected/rendered admin login.
- Logged-out admin report download route returned HTTP 403.
- Direct unsigned storage/object URL checks did not return a PDF.

Admin authenticated smoke passed for:

- `/score/admin`
- `/score/admin/orders`
- `/score/admin/orders/MKORD-2026-EBPPMK0O`
- `/score/admin/reports`
- `/score/admin/audit-log`
- `/score/admin/config/content`
- `/score/admin/config/products`
- `/score/admin/config/questions`

Admin password was manually entered by the user and was not stored, printed or logged.

## Report and PDF Results

- Generated PDF path during UAT: `/tmp/mk-phase12-uat-evidence/phase12-MKFRS-2026-4116823B06.pdf`
- PDF page count: 23
- Organisation name present: yes
- Executive diagnosis present: yes
- Recommendations present: yes
- Generated date present: yes
- Report reference present: yes
- Internal/scaffold scan: no obvious `EXP-*`, `D*-Q*`, phase labels, `undefined`, `NaN`, `null`, `benchmark`, or `AI-generated` terms in extracted text.

Condition:

- PDF cover shows `RPT-MKFRS-2026-4116823B06`; persisted report reference is `RPT-MKFRS-2026-4116823B06-V1`. Align display or document the shortening rule.

## Brand, UX and Mobile Results

Brand reference: MK public positioning emphasizes practical, structured fraud advisory grounded in operating reality.

Scores:

- Brand alignment: 8.0/10
- Premium feel: 8.0/10
- Visual consistency: 8.0/10
- Trust: 8.2/10

Mobile/responsive checks:

- No horizontal overflow detected on iPhone SE, iPhone 14, Android medium, tablet or desktop start-page captures.
- Start form remains usable and coherent on mobile.
- Customer-facing copy is practical and mostly aligned with MK tone.

Conditions:

- First viewport should include stronger MK logo/brand treatment before public launch.
- Some long prompts and repeated digital/change-management concepts should receive a small polish pass.

## Runtime Logs

Vercel runtime checks over the UAT window:

- Runtime error clusters: none found.
- Error/fatal logs: none found.
- No 5xx status codes observed.
- One 429 was observed and attributed to the high-volume public scenario run.

## Files Changed

- `docs/v1/uat/phase-12-uat-evidence.md`
- `docs/v1/phase-exit-cards/phase-12-staging-uat-launch-acceptance.md`

## Database Migrations

None.

## Code Changes

None.

## Remaining Risks

1. Scenario J must still be completed.
2. Brand/logo confidence is good but not excellent; first viewport needs stronger MK brand presence.
3. PDF displayed report reference should be aligned with persisted reference.
4. Admin operator screens still show internal phase labels in some headings.
5. A short copy polish pass would improve repeated and longer question prompts.

## Final Gate Position

PASS WITH CONDITIONS — the core respondent, order, payment, report-generation, access-control and storage-security flows passed on the verified production deployment. Close the listed conditions before broad public launch.
