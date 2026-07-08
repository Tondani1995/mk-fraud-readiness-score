# Phase 08 Exit Card - Admin Console

Date: 2026-07-08  
Repository: `Tondani1995/mk-fraud-readiness-score`  
Branch: `v1/phase-8-admin-console`  
Phase result: Pending CI and admin smoke verification.

## Deliverable

Phase 8 adds a minimum MK admin console that allows authenticated MK admins to inspect assessment submissions, organisation and respondent details, answer trace, score trace, configuration foundations and audit events.

## Scope Boundary

This phase does not build EFT verification, proof-of-payment upload, PDF generation, PayFast/card payments, AI recommendations, benchmarks, respondent accounts, respondent dashboards, subscriptions, a broad CRM, a client portal or Phase 9/10 functionality.

## Implemented

- Created a fresh Phase 8 branch from `main`.
- Upgraded the admin dashboard to show assessment, report-request, product and audit-event counts.
- Upgraded `/admin/assessments` with server-side status filtering, safe page sizing and score-status visibility.
- Added `/admin/assessments/[assessmentRef]` for admin-only assessment detail review.
- Added organisation and respondent detail panels.
- Added persisted score-run summary, domain score trace, exposure answers, answer trace and question-level score trace.
- Added report-request visibility using `data_requests`.
- Added audit-event visibility for the assessment and global audit-log route.
- Added `/admin/config/questions` as a read-only question/scoring configuration review surface.
- Added `/admin/config/products` as a product/pricing and EFT-setting configuration foundation.
- Added `/admin/config/content` as a report-content block review foundation.
- Added `admin_assessment_detail_viewed` audit logging when an admin opens an assessment detail.
- Extended CI to run Phase 8 admin console tests.

## Files Changed

- `.github/workflows/phase7-verification.yml`
- `package.json`
- `src/app/admin/page.tsx`
- `src/app/admin/assessments/page.tsx`
- `src/app/admin/assessments/[assessmentRef]/page.tsx`
- `src/app/admin/config/questions/page.tsx`
- `src/app/admin/config/products/page.tsx`
- `src/app/admin/config/content/page.tsx`
- `src/app/admin/audit-log/page.tsx`
- `src/components/admin/AdminShell.tsx`
- `src/lib/admin/dashboard.ts`
- `src/lib/admin/assessment-review.ts`
- `scripts/phase8-admin-console-tests.mjs`
- `docs/v1/phase-exit-cards/phase-08-admin-console.md`

## Database Changes

No migration was added. Phase 8 uses existing tables:

- `admin_profiles`
- `assessments`
- `organisations`
- `respondents`
- `assessment_answers`
- `exposure_answers`
- `score_runs`
- `score_domain_results`
- `score_question_traces`
- `maturity_cap_events`
- `methodology_versions`
- `domains`
- `questions`
- `exposure_factors`
- `products`
- `app_settings`
- `report_content_blocks`
- `data_requests`
- `audit_logs`

## Environment Variables

No new environment variable was added.

## Automated Tests

Added:

```bash
npm run phase8:test-admin
```

CI now runs:

```bash
npm run phase7:test-snapshot
npm run phase8:test-admin
npm run typecheck
npm run build
```

## Manual Verification Required

After merge or preview deployment, verify with an active MK admin profile:

1. Unauthenticated user is redirected from `/score/admin` or `/score/admin/assessments` to login.
2. Active MK admin can open `/score/admin`.
3. Active MK admin can list assessments.
4. Active MK admin can open a submitted/scored assessment detail page.
5. Assessment detail shows organisation, respondent, answers, exposure answers, domain scores and question-level score trace.
6. Opening an assessment detail creates an `admin_assessment_detail_viewed` audit log row.
7. Admin can view question config, product/EFT foundation, report-content blocks and audit log.
8. Orders, payment verification and reports remain placeholders or blocked for Phase 9/10.

## Risks

- Live admin smoke depends on a valid Supabase admin user/session and cannot be proven by GitHub Actions alone.
- Configuration pages are intentionally review-first. Product/EFT/report-content editing is not broadly enabled in this phase to avoid unsafe overreach.
- Phase 9 must still create the manual EFT order flow and payment verification state machine.
- Phase 10 must still create the PDF report engine and versioned storage.

## Decision

Proceed to PR review once CI passes. Do not start Phase 9 until Phase 8 CI and at least one admin smoke test pass.

## Parking Lot

- Dedicated admin notes/commentary per assessment.
- Admin reopen workflow, if explicitly approved later.
- More granular role UI for reviewer vs approver actions.
- CSV export for internal review after security/QA.

## Next Smallest Action

Open PR `Complete Phase 8 Admin Console and audit controls`, wait for CI, then run one narrow admin smoke test with a real MK admin login.
