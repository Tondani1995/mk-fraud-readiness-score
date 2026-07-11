# Phase 13 PR B Exit Card - Customer Commercial Conversion Journey

## Phase Result

Code-level Pass; Supabase migration, runtime UAT and visual UAT are still outstanding. PR #18 remains draft and unmerged.

## Scope Delivered

This PR adds the customer commercial conversion journey after private free snapshot access:

- Deterministic premium executive interpretation from persisted free snapshot inputs.
- Approved results arrival headed by `Assessment complete` and `Your organisation's fraud readiness position`.
- Priority areas and strengths in context using controlled D1-D10 domain-code content.
- Free-vs-paid value comparison, including paid-report roadmap mention without exposing roadmap content.
- `Full MK Fraud Readiness Report` at `R5,000 including VAT`.
- `Advanced Personalised Fraud Readiness Report` at `From R50,000 including VAT`.
- R5 order-summary step before manual EFT order creation.
- R50 controlled enquiry path that creates/updates `data_requests` only.
- Token-scoped customer commercial event tracking.
- Personalised enquiry admin queue and detail view.

## Controller Corrections Completed

- Restored the approved product names and VAT wording.
- Removed the unapproved R5 `consentContact` gate from the customer flow and report-request API.
- Restored `StartAssessmentForm.tsx` to the main/current approved authority and research-consent wording.
- Replaced ad hoc executive text with deterministic maturity, exposure and leadership-priority blocks.
- Replaced keyword heuristics with an explicit D1-D10 domain-code map.
- Changed report-options tracking to observe real sections with `IntersectionObserver` threshold `0.5`.
- Stopped internal notification queueing for `report_options_opened`.
- Kept queue-only notification behavior for `full_report_5000_selected`.
- Corrected executive current-position selection to use persisted `snapshot.finalMaturity`, while retaining a separate score-derived `scoreBand` for analytics metadata.
- Restored the approved strength qualification rule: `rawScore >= 70`, `coveragePct >= 70`, and zero critical gaps.
- Corrected the R50 event journey so card selection emits only generic `report_option_selected` analytics. The specific `personalised_report_50000_selected` event and its internal notification are emitted only after the enquiry is successfully created or updated and linked to `data_request_id`.
- Removed the pre-enquiry R50-specific event/notification path from the generic commercial-event route.
- Replaced static-only Phase 13 conversion checks with executable deterministic insight-builder tests, including capped-maturity and 69.99/70 strength boundary cases.

## Files Inspected Before Changes

- `docs/v1/current-state-audit.md`
- `src/app/snapshot/[assessmentRef]/page.tsx`
- `src/components/assessment/FreeSnapshot.tsx`
- `src/lib/snapshot/free-snapshot.ts`
- `src/lib/snapshot/commercial-insights.ts`
- `src/lib/reports/select-content-blocks.ts`
- `src/lib/reports/fallback-content.ts`
- `src/lib/reports/types.ts`
- `src/lib/analytics/assessment-events.ts`
- `src/lib/notifications/internal-notifications.ts`
- `src/lib/orders/manual-eft-orders.ts`
- `src/app/api/assessments/[assessmentRef]/commercial-event/route.ts`
- `src/app/api/assessments/[assessmentRef]/report-request/route.ts`
- `src/app/api/assessments/[assessmentRef]/personalised-report-request/route.ts`
- `src/components/admin/AdminShell.tsx`
- `src/app/admin/enquiries/page.tsx`
- `src/app/admin/enquiries/[requestReference]/page.tsx`
- `src/lib/admin/personalised-enquiries.ts`
- `src/components/assessment/StartAssessmentForm.tsx`
- `supabase/migrations/0001_phase2_v1_1_schema_rls.sql`
- `supabase/migrations/0003_phase5_methodology_seed.sql`
- `supabase/migrations/0010_phase9_manual_eft_order_flow.sql`
- `supabase/migrations/0012_phase13_commercial_event_foundation.sql`
- `supabase/migrations/0014_phase13_customer_commercial_conversion.sql`
- `scripts/phase7-free-snapshot-tests.mjs`
- `scripts/phase9-manual-eft-order-tests.mjs`
- `scripts/phase13-commercial-event-tests.mjs`
- `scripts/phase13-customer-commercial-conversion-tests.mjs`
- `package.json`
- `.github/workflows/phase7-verification.yml`
- PR #18 controller review posted on 2026-07-11.

## Files Changed In Controller Correction Pass

- `src/lib/snapshot/commercial-insights.ts`
- `src/components/assessment/FreeSnapshot.tsx`
- `src/app/api/assessments/[assessmentRef]/commercial-event/route.ts`
- `src/app/api/assessments/[assessmentRef]/personalised-report-request/route.ts`
- `scripts/phase13-commercial-event-tests.mjs`
- `scripts/phase13-customer-commercial-conversion-tests.mjs`
- `docs/v1/phase-exit-cards/phase-13-pr-b-customer-commercial-conversion.md`

## Database Migration

Added but not applied:

- `supabase/migrations/0014_phase13_customer_commercial_conversion.sql`

The migration is additive to `data_requests`, adds controlled personalised-enquiry fields and constraints, keeps Data API exposure closed for `anon` and `authenticated`, and does not mutate methodology, scoring, reports, orders or prior assessment outcomes. It must be applied only through the controlled production migration process after approval.

## Code-Level Checks

GitHub Actions is the evidence path because this workspace cannot clone the private repository locally.

V1 Verification run #401 completed successfully on controller-corrected implementation head `84fae1724e90f164051f917ae72a04eddf343f13`.

Passed steps:

- checkout
- dependency install
- `npm run phase7:test-snapshot`
- `npm run phase8:test-admin`
- `npm run methodology:copy-test`
- `npm run phase9:test-orders`
- `npm run phase10:test-report`
- `npm run phase11:test-security`
- `npm run phase13:test-events`
- `npm run phase13:test-conversion`
- `npm run typecheck`
- `npm run build`

## Current-Head Preview

A Vercel preview is READY for controller-corrected implementation head `84fae1724e90f164051f917ae72a04eddf343f13`:

- Preview: `https://mk-fraud-readiness-score-git-phase13-c-dc49fb-tondanis-projects.vercel.app`
- Deployment: `dpl_Fn1RgaYG5ssQMpN2PjnzkBhLuKYW`
- Deployment URL: `https://mk-fraud-readiness-score-nhwkbf5v2-tondanis-projects.vercel.app`
- Deployment state: `READY`
- Vercel metadata commit: `84fae1724e90f164051f917ae72a04eddf343f13`

This confirms a current-head preview exists for the verified implementation head. It does not replace runtime UAT.

## Runtime UAT

Outstanding. Use `docs/v1/phase13/customer-commercial-conversion-runtime-uat.md` after the controlled migration process is approved and applied to the target Supabase environment.

## Visual UAT

Outstanding. Use `docs/v1/phase13/customer-commercial-conversion-visual-acceptance.md` against the current-head preview.

## Remaining Risks

- The new migration has not been applied to Supabase.
- Supabase advisors have not been run after applying the PR B migration.
- Runtime event dedupe and notification queue behavior for PR B have not yet been proven on a current-head deployment.
- The R50 enquiry flow depends on the new `data_requests` fields being present.
- Visual/layout review remains outstanding on desktop and mobile.
- Internal notification delivery remains queue-only; this PR does not add a sender/provider.

## Recommendation

Keep PR #18 as draft until the migration is approved/applied through the controlled process, Supabase advisors are clean or accepted, and current-head runtime plus visual UAT pass with evidence.
