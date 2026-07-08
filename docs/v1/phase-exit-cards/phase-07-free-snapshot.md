# Phase 07 Exit Card - Free Snapshot

Date: 2026-07-08  
Repository: `Tondani1995/mk-fraud-readiness-score`  
Branch: `v1/phase-7-free-snapshot`  
Phase result: Conditional pass pending Supabase/browser execution in a configured dev environment.

## Scope

Phase 7 hardens and proves the free snapshot result gate after assessment submission. It does not build the Phase 8 admin console, Phase 9 EFT/order flow, Phase 10 PDF report engine, PayFast, AI recommendations, benchmarks, respondent accounts, subscriptions, client portal, reseller features or multi-respondent enterprise workflow.

## Implemented

- Added server-side snapshot-token creation using the existing `assessment_tokens` table and `snapshot` token type.
- Submit now returns a durable private `/snapshot/[assessmentRef]?token=...` URL after scoring.
- `/snapshot/[assessmentRef]` now validates the snapshot token and reloads the persisted score run through `loadFreeSnapshotByReference`.
- Snapshot refresh uses `consume: false`, so reloads do not burn token budget or recalculate scores.
- Submit locking now verifies the draft-to-submitted update affected a row, returning a stale-state conflict for repeated submit races.
- Client submit now stops if the final save fails and blocks repeated submit clicks while saving/submitting.
- Free snapshot UI now shows calculated/final maturity, exposure, coverage, N/A rate, critical-gap alerting and domain-level coverage/gap indicators.
- Free snapshot copy explicitly excludes benchmark, full-report narrative, remediation-plan and generated-advisory content.
- Phase 7 fixtures added: weak, moderate and strong-with-critical-gap.
- Phase 7 tests added for fixture reconciliation, repeated calculation determinism, persisted score-to-snapshot mapping, N/A score exclusion, token route wiring, stale submit safety and snapshot content boundary.

## Files Changed

- `package.json`
- `src/app/api/assessments/[assessmentRef]/submit/route.ts`
- `src/app/snapshot/[assessmentRef]/page.tsx`
- `src/components/assessment/AssessmentEngine.tsx`
- `src/components/assessment/FreeSnapshot.tsx`
- `src/lib/respondent/assessment-save.ts`
- `src/lib/respondent/tokens.ts`
- `scripts/fixtures/phase7-free-snapshot-fixtures.json`
- `scripts/phase7-free-snapshot-tests.mjs`
- `docs/v1/phase-exit-cards/phase-07-free-snapshot.md`

## Database Changes

No new migration was required. Phase 7 uses existing schema objects:

- `assessment_tokens.token_type = 'snapshot'`
- `score_runs`
- `score_domain_results`
- `score_question_traces`
- `maturity_cap_events`
- `complete_score_run_atomic`

## Acceptance Evidence

| Criterion | Evidence |
|---|---|
| Submit once | `submitAssessment` locks draft rows and now detects zero-row stale updates. |
| Free snapshot under `/score` flow | `next.config.mjs` keeps `basePath: '/score'`; submit returns `/snapshot/[ref]?token=...`, which Next serves under the base path. |
| Overall score matches persisted score run | `loadFreeSnapshotByReference` reads `score_runs.overall_score`; Phase 7 tests assert mapping. |
| Domain scores match persisted domain results | `loadFreeSnapshotByReference` reads `score_domain_results`; Phase 7 tests assert every fixture domain mapping. |
| Maturity band matches scoring function | Tests compare fixture scoring output to expected maturity and snapshot fields. |
| Exposure result matches exposure model | Tests assert exposure score and exposure band for all fixtures. |
| Coverage and N/A visible | UI shows global coverage/N/A and domain coverage; tests assert presence. |
| Critical-gap alerts match logic | UI displays critical-control and hard-gate counts from persisted score summary; tests assert fixture counts. |
| N/A cannot inflate score | Phase 7 test marks a moderate fixture answer N/A and asserts no score inflation plus zero numerator/denominator contribution. |
| Refresh/back/repeated submit safety | Snapshot route reloads persisted score with `consume: false`; client blocks repeated submit; server rejects stale submit updates. |
| Submitted assessment cannot be casually edited | Resume tokens are revoked at submit and draft save still requires a valid draft resume token. |
| Snapshot-safe boundary | Component does not expose AI, 30/60/90 or benchmark content; tests assert boundary text. |
| Three fixtures | `scripts/fixtures/phase7-free-snapshot-fixtures.json`. |
| Repeated calculation identical | `scripts/phase7-free-snapshot-tests.mjs`. |
| Exit card | This file. |

## Commands To Run

```bash
npm install
npm run phase7:test-snapshot
npm run typecheck
npm run build
```

A configured Supabase dev project is still required for full browser and database UAT.

## Manual Verification Checklist

- Start assessment at `/score/start`.
- Complete all exposure factors and all domain questions.
- Submit once and confirm the free snapshot renders immediately.
- Open the private snapshot link and refresh it several times.
- Try the old resume link after submission and confirm edit access is blocked.
- Try submitting twice quickly and confirm no duplicate/current score corruption.
- Compare snapshot score and domains against persisted `score_runs` and `score_domain_results`.

## Defects And Risks

- This implementation was authored through the GitHub connector. Local clone/build/browser execution still needs to be run in an authenticated environment with dependencies and Supabase variables.
- The detailed report request endpoint remains a basic pre-Phase-9 request endpoint and is not the EFT/order workflow.
- Snapshot route uses existing rate-limit buckets because no dedicated snapshot bucket exists yet.

## Parking Lot

- Add a dedicated `snapshot_page` rate-limit policy if MK wants separate thresholds.
- Add full Playwright journey coverage after Supabase dev credentials are available.
- Phase 8 admin console remains out of scope.
- Phase 9 EFT/order flow remains out of scope.
- Phase 10 PDF report generation remains out of scope.
