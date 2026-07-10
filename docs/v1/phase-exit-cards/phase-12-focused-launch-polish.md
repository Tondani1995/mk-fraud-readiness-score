# Phase 12 Focused Launch Polish Exit Card

## Status

PASS WITH CONDITIONS — draft PR review required before merge.

This document records the focused launch-polish work performed after the Phase 12 live UAT evidence was merged into `main`.

## Source

- Base main commit: `f6c1a1f25d6a6945ac1ac9056ee1c697927cbafe`
- Branch: `phase12/focused-launch-polish`
- Latest reviewed branch head before this exit-card commit: `56007557988963896c8fdf40fa876f91a467ad4c`
- Latest reviewed Vercel preview deployment before this exit-card commit: `dpl_H2YjEV23hCa1AjvBD6dUDkXEWRqd`
- Latest reviewed Vercel preview state before this exit-card commit: READY

## Phase 12 Conditions Addressed

### 1. Scenario J — incident-response weakness

Scenario J was completed through the live application flow using a fresh assessment.

- Assessment reference: `MKFRS-2026-148EB550C3`
- Scenario pattern: Fraud Incident Response deliberately weak, with other domains kept at a materially stronger baseline.
- Result observed: D5 Fraud Incident Response scored approximately 7/100 with 2 critical gaps, while other domains remained materially stronger.
- Snapshot behaviour: the free snapshot isolated D5, showed the hard-gate cap, and avoided both false reassurance and alarmist language.
- Report-content review: D5 low-maturity paid-report content uses the report template fallback where no specific low-band content block exists. The fallback was reviewed and found to be aligned enough for Phase 12 launch-polish closure because it addresses incident improvisation, roles, escalation, evidence handling, and playbook weakness in practical language.

Outcome: no immediate code or content fix required for Scenario J in this focused polish PR.

Remaining observation: D5 gap-level commentary could be made more tailored in a later content-quality pass, but this is not a Phase 12 blocker.

### 2. First-viewport MK brand treatment

The root application layout now wires the shared MK Fraud header and footer into the app shell, improving first-viewport brand presence and giving the score journey clearer MK Fraud identity.

Outcome: addressed for Phase 12 focused polish. Further visual refinement can continue in Phase 13/14 if needed.

### 3. PDF cover report reference alignment

The admin report-generation route was updated so the versioned persisted report reference is resolved before rendering the PDF. The assembled report data is updated with the persisted reference before `renderReportHtml(...)` runs.

Expected outcome: the PDF cover and body now use the same versioned reference that is persisted to the `reports` table and storage path, including suffixes such as `-V1` or `-V2`.

### 4. Admin phase-label / scaffold polish

The focused branch updates visible admin wording on the pages identified during Phase 12 review:

- audit log
- content configuration
- questions configuration
- methodology
- settings

Outcome: admin screens should read more like an operational MK Fraud console and less like a development-phase tracker.

### 5. Copy-polish condition

The focused branch has not yet introduced an MFRS-V1.2 methodology-copy migration. That is intentional. The Phase 12 instruction was to avoid uncontrolled methodology changes and keep this polish PR narrow.

Outcome: no broad methodology migration is included. Any deeper question-copy changes should be handled as a separate versioned methodology-copy PR if still required after visual review.

## Files Changed on Focused Branch

At the latest reviewed comparison before this exit-card commit, the branch changed the following files relative to `main`:

- `.github/workflows/phase7-verification.yml`
- `src/app/admin/audit-log/page.tsx`
- `src/app/admin/config/content/page.tsx`
- `src/app/admin/config/questions/page.tsx`
- `src/app/admin/methodology/page.tsx`
- `src/app/admin/settings/page.tsx`
- `src/app/api/admin/orders/[orderReference]/generate-report/route.ts`
- `src/app/layout.tsx`

This exit card adds:

- `docs/v1/phase-exit-cards/phase-12-focused-launch-polish.md`

## Tests and Verification

### Verified by available remote evidence

- Vercel preview for commit `56007557988963896c8fdf40fa876f91a467ad4c`: READY.
- Branch was 8 commits ahead of `main` and 0 commits behind at the latest reviewed comparison before this exit-card commit.
- Vercel status for the latest reviewed branch head was successful.

### Not independently verified in this exit-card commit

The following were not re-run locally by the controller because no local checkout was available:

- `pnpm install`
- `pnpm run typecheck`
- `pnpm run build`
- `pnpm run phase7:test-snapshot`
- `pnpm run phase8:test-admin`
- `pnpm run methodology:copy-test`
- `pnpm run phase9:test-orders`
- `pnpm run phase10:test-report`
- `pnpm run phase11:test-security`

These should be verified through GitHub Checks on the draft PR before merge.

## Scope Boundary Confirmed

This focused polish branch does not intentionally add:

- PayFast or card payments
- payment proof upload
- automated payment verification
- automated report release
- automated email delivery
- client portal or respondent accounts
- subscriptions
- public benchmarks or peer averages
- live AI-generated recommendations
- scoring methodology changes
- database schema changes
- Next.js framework upgrade

## Remaining Conditions Before Closing Phase 12

Before Phase 12 can be closed fully, the draft PR should be reviewed and merged only after:

1. GitHub Checks complete successfully on the draft PR head.
2. Vercel preview for the final PR head is READY.
3. A quick visual smoke confirms the header/footer brand treatment does not break `/score/start`, the assessment journey, the snapshot, order confirmation, or admin pages.
4. The PDF report-reference change is accepted as correct by code review or verified through one generated report on the preview/production-equivalent flow.

## Recommendation

Open the focused launch-polish branch as a draft PR, review the diff, verify checks, and merge once the remaining PR-level checks pass. After that, Phase 12 can be closed and the project can move to Phase 13 launch preparation.
