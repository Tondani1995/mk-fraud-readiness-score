# Phase 13 PR B Exit Card - Customer Commercial Conversion Journey

## Phase Result

`Runtime and visual UAT Pass` for the Phase 13 PR B runtime code head.

PR #18 remains draft and unmerged pending controller approval.

## Exact Runtime Evidence

- PR: #18
- Branch: `phase13/customer-commercial-conversion`
- Runtime code head tested: `4f5c99429087e0c9a6ddf00ae564723d2053592d`
- Runtime deployment: `dpl_Ad9ddGtEBznnpta4rGEjMznRygSY`
- Runtime URL: `https://mk-fraud-readiness-score-pbec70el9-tondanis-projects.vercel.app`
- Deployment state: `READY`
- Vercel metadata commit: `4f5c99429087e0c9a6ddf00ae564723d2053592d`
- GitHub Actions: V1 Verification run #415 passed.
- Production Supabase project: `jvjxlphdyzerrhwcgkup`

Evidence documentation updates were committed after runtime UAT. Those commits are documentation-only and do not change runtime behavior.

## Scope Delivered

- Deterministic premium executive interpretation from persisted free snapshot inputs.
- Approved results arrival headed by `Assessment complete` and `Your organisation's fraud readiness position`.
- Priority areas and strengths in context using controlled domain content.
- Free-vs-paid value comparison, including paid-report roadmap mention without exposing roadmap content.
- `Full MK Fraud Readiness Report` at `R5,000 including VAT`.
- `Advanced Personalised Fraud Readiness Report` at `From R50,000 including VAT`.
- R5 order-summary step before manual EFT order creation.
- R50 controlled enquiry path that creates/updates `data_requests` only.
- Token-scoped customer commercial event tracking.
- Personalised enquiry admin queue and detail view.

## Files Inspected

- `docs/v1/current-state-audit.md`
- `src/app/snapshot/[assessmentRef]/page.tsx`
- `src/components/assessment/FreeSnapshot.tsx`
- `src/lib/snapshot/free-snapshot.ts`
- `src/lib/snapshot/commercial-insights.ts`
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
- `supabase/migrations/0012_phase13_commercial_event_foundation.sql`
- `supabase/migrations/0014_phase13_customer_commercial_conversion.sql`
- `supabase/migrations/0015_phase13_data_request_policy_cleanup.sql`
- `scripts/phase7-free-snapshot-tests.mjs`
- `scripts/phase9-manual-eft-order-tests.mjs`
- `scripts/phase13-commercial-event-tests.mjs`
- `scripts/phase13-customer-commercial-conversion-tests.mjs`
- PR #18 controller review.

## Files Changed During Runtime Assurance

- `src/app/api/assessments/[assessmentRef]/submit/route.ts`
- `scripts/phase7-free-snapshot-tests.mjs`
- `src/app/snapshot/[assessmentRef]/page.tsx`
- `src/app/api/assessments/[assessmentRef]/report-request/route.ts`
- `src/app/admin/enquiries/page.tsx`
- `docs/v1/phase13/customer-commercial-conversion-runtime-uat.md`
- `docs/v1/phase13/customer-commercial-conversion-visual-acceptance.md`
- `docs/v1/phase13/customer-commercial-conversion-pr-b.md`
- `docs/v1/phase-exit-cards/phase-13-pr-b-customer-commercial-conversion.md`

## Database Migration

Production migration state supplied by controller and verified during runtime work:

- `0014_phase13_customer_commercial_conversion` applied.
- `0015_phase13_data_request_policy_cleanup` applied and committed.

Runtime queries confirmed the PR B tables/columns were active for the customer flow and admin enquiry flow.

## Code-Level Checks

V1 Verification run #415 passed on `4f5c99429087e0c9a6ddf00ae564723d2053592d`:

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

## Runtime UAT Evidence

Fresh respondent assessment:

- Organisation: `MK Commercial PRB Runtime UAT 20260711215125`
- Assessment: `MKFRS-2026-4D59A2EA9E`
- Score shown: `80/100`
- Final maturity: `Strategic`
- Coverage: `100%`
- Exposure band: `High`
- Critical controls: `0`

Passed:

- Start link stayed on the exact preview/deployment host.
- Exposure profile completed.
- All 68 questions completed.
- Assessment submitted from UI.
- Private snapshot rendered and refreshed.
- Tokenless snapshot access was blocked.
- Customer-facing boundary scan found no phase labels, internal codes, AI-generated claims, public benchmark/peer-average wording or unsupported payment/report features.

R5 path:

- Order: `MKORD-2026-7LT7KO4P`
- EFT snapshot displayed FNB / MK Fraud Insights / `63106109332` / `250655` / `ZAR` / `hello@mkfraud.co.za`.
- Payment reference matched order reference.
- Duplicate request reused the same order.
- No report row or report event was created.
- No PayFast, card payment, proof upload, automatic payment verification, report unlock or download appeared.

R50 path:

- Enquiry: `MKENQ-2026-236E17B4`
- Form and consent copy displayed correctly.
- Duplicate submission reused/enriched the same enquiry.
- No order, payment obligation, report row, PDF or download was created.

## Event and Notification Evidence

Production DB evidence for `MKFRS-2026-4D59A2EA9E`:

- `executive_summary_viewed`: count `1`.
- `report_options_opened`: count `2`.
- `report_option_selected/full_report_5000`: count `2`.
- `full_report_5000_selected`: count `2`.
- `eft_order_created`: count `2`, linked to `MKORD-2026-7LT7KO4P`.
- `report_option_selected/personalised_report_50000`: count `1` before enquiry persistence.
- `personalised_report_50000_selected`: count `2`, linked to `MKENQ-2026-236E17B4` after persistence.

Metadata reviewed was safe and did not contain snapshot tokens, resume tokens, free-text notes, raw questionnaire answers, passwords, signed URLs or confidential operational records.

Notification evidence:

- `report_options_opened` created no notification row.
- R5 customer queue row: `template_key = detailed_report_request_received`, `status = queued`, `provider_message_id = null`, `sent_at = null`.
- Repeated R5 request did not create a duplicate customer queue row after the fix.
- No provider delivery status was invented.
- Internal notification provider delivery remains out of scope; helper behavior is queue/skip-only.

## Admin Evidence

- `/score/admin/enquiries` is admin-protected.
- Patched list page shows enquiry reference, assessment, organisation, respondent, email, reason, status and updated date.
- Detail page shows assessment, organisation/respondent context, email, focus areas, note, consent and timestamps.
- Detail boundary copy confirms no order, payment obligation, PDF, report unlock, customer download or automatic report generation.
- Opening detail wrote `personalised_enquiry_opened` audit events for `MKENQ-2026-236E17B4` with `order_created: false` and `report_generation: false`.
- Logged-out access redirected to `/score/admin/login`.

## Visual and Accessibility Evidence

Screenshots captured locally under:

`/Users/tondani/Documents/Codex/2026-07-07/what/tmp/phase13-pr18-uat-da440`

Key screenshots:

- `31-clean-results-first-viewport-1440.png`
- `33-clean-executive-priority-1440.png`
- `34-clean-value-comparison-1440.png`
- `35-clean-report-options-1440.png`
- `36-clean-r5-order-summary-1440.png`
- `37-clean-r5-eft-confirmation-1440.png`
- `38-clean-r50-enquiry-form-1440.png`
- `39-clean-r50-success-1440.png`
- `40-mobile-results-390x844.png`
- `40-mobile-results-360x800.png`
- `50-patched-admin-enquiry-list-1440.png`
- `51-patched-admin-enquiry-detail-1440.png`
- `52-logged-out-admin-enquiries-blocked-1440.png`

Visual/accessibility smoke passed for desktop and mobile:

- No horizontal overflow at tested sizes.
- Logical heading hierarchy.
- Semantic buttons.
- Labelled controls.
- Visible keyboard focus.
- Reduced-motion preference did not break the page.
- No status conveyed by colour alone.

## Supabase Advisor Result

Advisors were refreshed on production project `jvjxlphdyzerrhwcgkup`.

Security advisors still report residual project-wide findings including:

- RLS enabled without policies on internal tables such as `assessment_tokens` and `rate_limit_hits`.
- Mutable search path on `public.set_updated_at`.
- `citext` extension in public schema.
- Authenticated executable security-definer admin helper functions.
- Leaked password protection disabled.

Performance advisors still report residual project-wide findings including:

- Unindexed foreign keys across existing tables.
- Multiple permissive policies across existing RLS-protected tables.

These were not all introduced by PR B and were not all remediated in this customer-conversion runtime pass. They remain recorded risks for a controlled database-hardening pass.

## Defects Found and Fixed During Runtime Assurance

1. Submit-generated snapshot links used the production canonical host on preview deployments.
   - Fixed in `src/app/api/assessments/[assessmentRef]/submit/route.ts` and covered by Phase 7 snapshot test assertions.
2. Snapshot-page self-link double-prefixed `/score/score/snapshot/...` after refresh.
   - Fixed in `src/app/snapshot/[assessmentRef]/page.tsx`.
3. Repeated R5 request reused the order but queued duplicate customer email rows.
   - Fixed in `src/app/api/assessments/[assessmentRef]/report-request/route.ts`.
4. Admin enquiry list omitted email in the Contact column.
   - Fixed in `src/app/admin/enquiries/page.tsx`.

## Remaining Risks

- Supabase advisor residuals remain and should be handled separately.
- Internal notification delivery provider remains out of scope; queue/skip behavior only.
- Evidence docs were updated after runtime testing as documentation-only commits.
- PR #18 remains draft and unmerged until controller approval.

## Recommendation

PR #18 has passed runtime and visual UAT for the tested runtime code head. Keep the PR draft until the controller reviews the evidence and explicitly approves ready-for-review or merge.
