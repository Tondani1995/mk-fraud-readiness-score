# Phase 07 Production Hotfix - Snapshot Route

Date: 2026-07-08  
Branch: `v1/phase7-production-hotfix`  
Scope: Phase 7 hotfix only.

## Production Finding

A controlled production smoke test submitted a full assessment successfully, created a completed score run, persisted all domain results and question traces, and created the expected `snapshot` token. The free snapshot page then failed at render time.

## Defects Fixed

1. The submit API returned a snapshot URL without the `/score` base path because `new URL('/snapshot/...', '<origin>/score')` treats the first argument as an origin-rooted path and strips `/score`.
2. The snapshot and resume server pages called `.get()` on the result of `headers()` without awaiting it. In the deployed App Router runtime this caused `TypeError: ... .get is not a function`.

## Files Changed

- `src/app/api/assessments/[assessmentRef]/submit/route.ts`
- `src/app/snapshot/[assessmentRef]/page.tsx`
- `src/app/assessment/[assessmentRef]/page.tsx`

## Expected Result

- Submit returns a copyable snapshot URL under `/score/snapshot/[assessmentRef]?token=...`.
- The snapshot page awaits request headers before rate-limit and IP-hash handling.
- The assessment resume page awaits request headers before rate-limit handling.
- Snapshot reload remains token-scoped and uses `consume: false`.

## No-Go Boundary Preserved

This hotfix does not add admin console, EFT/order flow, PDF generation, PayFast, AI recommendations, benchmarks, respondent accounts, dashboards, subscriptions or any Phase 8/9/10 scope.

## Verification Required

After merge/deploy, repeat the narrow production smoke test:

1. Start one test assessment.
2. Complete exposure factors and all 68 questions.
3. Submit once.
4. Confirm the returned snapshot URL includes `/score/snapshot/`.
5. Open and refresh the snapshot URL.
6. Confirm the old resume link shows the intended blocked-access message rather than a 500.
7. Confirm snapshot values reconcile to `score_runs` and `score_domain_results`.
