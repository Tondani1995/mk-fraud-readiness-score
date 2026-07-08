# Phase 07 Exit Card - Free Snapshot

Date: 2026-07-08  
Repository: `Tondani1995/mk-fraud-readiness-score`  
Branch: `v1/phase-7-free-snapshot`  
PR: `#3`  
Phase result: Conditional Pass.

## Scope

Phase 7 hardens and proves the free snapshot result gate after assessment submission. It does not build the Phase 8 admin console, Phase 9 EFT/order flow, Phase 10 PDF report engine, PayFast, AI recommendations, benchmarks, respondent accounts, subscriptions, client portal, reseller features or multi-respondent enterprise workflow.

## Implemented

- Added server-side snapshot-token creation using the existing `assessment_tokens` table and `snapshot` token type.
- Submit now returns a durable private `/score/snapshot/[assessmentRef]?token=...` URL after scoring, using the same `/score` public base-path convention as the start/resume flow.
- `/snapshot/[assessmentRef]` now validates the snapshot token and reloads the persisted score run through `loadFreeSnapshotByReference`.
- Snapshot refresh uses `consume: false`, so reloads do not burn token budget or recalculate scores.
- Submit locking now verifies the draft-to-submitted update affected a row, returning a stale-state conflict for repeated submit races.
- Client submit now stops if the final save fails and blocks repeated submit clicks while saving/submitting.
- Free snapshot UI now shows calculated/final maturity, exposure, coverage, N/A rate, critical-gap alerting and domain-level coverage/gap indicators.
- Free snapshot copy explicitly excludes benchmark, full-report narrative, remediation-plan and generated-advisory content.
- Phase 7 fixtures added: weak, moderate and strong-with-critical-gap.
- Phase 7 tests added for fixture reconciliation, repeated calculation determinism, persisted score-to-snapshot mapping, N/A score exclusion, token route wiring, stale submit safety, `/score` snapshot URL generation and snapshot content boundary.
- `ASSESSMENT_SNAPSHOT_TOKEN_MAX_USES` documented in `.env.example`; it controls private free-snapshot token maximum use count and the server fallback is 100 when unset.
- GitHub Actions workflow `.github/workflows/phase7-verification.yml` added as the evidence path for required npm checks on PRs and pushes.

## Files Changed

- `.env.example`
- `.github/workflows/phase7-verification.yml`
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

## Command Evidence

| Command | Result |
|---|---|
| `git clone --branch v1/phase-7-free-snapshot https://github.com/Tondani1995/mk-fraud-readiness-score.git work/mk-fraud-readiness-score-pr3` | Failed: `fatal: could not read Username for 'https://github.com': Device not configured`. The repo is private and this environment has no local GitHub credential helper. |
| `command -v gh` | No output; GitHub CLI is not installed. |
| `env | rg 'GITHUB|GH_'` | Only `GH_PAGER=cat`; no GitHub token available. |
| `git config --global --get credential.helper` | No output; no credential helper configured. |
| `npm install` | Not run locally because an authenticated local checkout could not be created. GitHub Actions now runs this automatically, or `npm ci` if `package-lock.json` exists. |
| `npm run phase7:test-snapshot` | Not run locally because an authenticated local checkout could not be created. GitHub Actions now runs it automatically. |
| `npm run typecheck` | Not run locally because an authenticated local checkout could not be created. GitHub Actions now runs it automatically. |
| `npm run build` | Not run locally because an authenticated local checkout could not be created. GitHub Actions now runs it automatically with safe CI dummy env values. |

## GitHub Actions Evidence Path

Workflow: `.github/workflows/phase7-verification.yml`

The workflow triggers on `pull_request` and `push`, uses Node 20, installs dependencies with `npm ci` when `package-lock.json` exists and `npm install` otherwise, then runs:

```bash
npm run phase7:test-snapshot
npm run typecheck
npm run build
```

The workflow does not require Supabase secrets, does not run browser UAT and does not introduce Phase 8, Phase 9 or Phase 10 scope. It uses safe dummy CI environment values only where the Next.js build needs environment variables to initialize.

PR #3 must remain draft until this workflow passes.

## Acceptance Evidence

| Criterion | Evidence |
|---|---|
| Submit once | `submitAssessment` locks draft rows and now detects zero-row stale updates. |
| Free snapshot under `/score` flow | `next.config.mjs` keeps `basePath: '/score'`; submit now generates a copyable public URL under `/score/snapshot/[ref]?token=...`. |
| Overall score matches persisted score run | `loadFreeSnapshotByReference` reads `score_runs.overall_score`; Phase 7 test script asserts mapping. |
| Domain scores match persisted domain results | `loadFreeSnapshotByReference` reads `score_domain_results`; Phase 7 test script asserts every fixture domain mapping. |
| Maturity band matches scoring function | Test script compares fixture scoring output to expected maturity and snapshot fields. |
| Exposure result matches exposure model | Test script asserts exposure score and exposure band for all fixtures. |
| Coverage and N/A visible | UI shows global coverage/N/A and domain coverage; test script asserts presence. |
| Critical-gap alerts match logic | UI displays critical-control and hard-gate counts from persisted score summary; test script asserts fixture counts. |
| N/A cannot inflate score | Phase 7 test script marks a moderate fixture answer N/A and asserts no score inflation plus zero numerator/denominator contribution. |
| Refresh/back/repeated submit safety | Snapshot route reloads persisted score with `consume: false`; client blocks repeated submit; server rejects stale submit updates. |
| Submitted assessment cannot be casually edited | Resume tokens are revoked at submit and draft save still requires a valid draft resume token. |
| Snapshot-safe boundary | Component does not expose AI, 30/60/90 or benchmark content; test script asserts boundary text. |
| Three fixtures | `scripts/fixtures/phase7-free-snapshot-fixtures.json`. |
| Repeated calculation identical | `scripts/phase7-free-snapshot-tests.mjs`. |
| Snapshot max-use documented | `.env.example` includes `ASSESSMENT_SNAPSHOT_TOKEN_MAX_USES=100` and fallback wording. |

## Supabase And Browser UAT

Not run in this environment and not added to the Phase 7 verification workflow.

Reason: this environment could not create an authenticated local checkout of the private repository, and no configured Supabase dev project credentials were available. No claim is made that browser/Supabase UAT has passed.

Required UAT once a configured checkout and Supabase dev project are available:

- Start assessment at `/score/start`.
- Complete all exposure factors and all domain questions.
- Submit once and confirm the free snapshot renders immediately.
- Open the private snapshot link and refresh it several times.
- Try the old resume link after submission and confirm edit access is blocked.
- Try submitting twice quickly and confirm no duplicate/current score corruption.
- Compare snapshot score and domains against persisted `score_runs` and `score_domain_results`.

## Remaining Risks

- GitHub Actions must pass `phase7:test-snapshot`, `typecheck` and `build` before the gate can be upgraded to Pass.
- Supabase/browser UAT still needs to run in a configured dev project.
- The detailed report request endpoint remains a basic pre-Phase-9 request endpoint and is not the EFT/order workflow.
- Snapshot route uses existing resume rate-limit buckets because no dedicated snapshot bucket exists yet.

## Parking Lot

- Add a dedicated `snapshot_page` rate-limit policy if MK wants separate thresholds.
- Add full Playwright journey coverage after Supabase dev credentials are available.
- Phase 8 admin console remains out of scope.
- Phase 9 EFT/order flow remains out of scope.
- Phase 10 PDF report generation remains out of scope.
