# MK Fraud Readiness: integrated review track

Candidate integration of the parked MK digital experience with the rebuilt readiness method. Isolated branch, fictional local harness, not merged, not deployed.

| | |
|---|---|
| Parked source baseline | `75451fc69149cf2a5a08a0a0bfa3161ce84ffcf2` (`design/mk-spatial-experience`) |
| Readiness baseline | build 1.4 (engine `6d374561…`), extended additively as engine build 1.5 (`7f8ca08f…`) |
| Candidate branch | `review/mk-integrated-readiness` |
| Candidate source commit | see `SOURCE-COMMIT.txt` in the package |
| Data contract | `mk-readiness-review` 1.3.0 |
| Release decision | **Not releasable.** Candidate ready for MK review on the fictional harness, with the independent review's six findings corrected. See `RELEASE-DECISION.md`. |

## Documents

| Document | Contents |
|---|---|
| `CRITIQUE-AND-DISPOSITION.md` | Evidence-backed critique of the parked work and retain, improve, replace or retire for each part |
| `INTEGRATION-MAP.md` | Each method concept traced to engine, route, component, API, record and output |
| `DATA-CONTRACT.md` | Versioned adapter contract: ruleset hashes, record, actions, errors, routes, views, export, version history |
| `COMMERCIAL-RECONCILIATION.md` | Nine specific conflicts with the catalogue and site, each with a proposed change for MK |
| `LEGACY-UNKNOWN-SCORING.md` | The unknown-response scoring discrepancy, every output path it reaches, and the decisions needed |
| `CHANGE-LOG.md` | Material product decisions and the defects found and fixed during integration |
| `VERIFICATION.md` | Results by layer, with conditions and what was not tested |
| `RELEASE-DECISION.md` | Decision, blocking items, decisions MK must take, limitations |
| `INDEPENDENT-REVIEW-RESPONSE.md` | Each finding of the independent review of `fb91178`, its correction, commit and regression evidence |
| `DATABASE-DESIGN.md` | The database store: tables, functions, access, errors, what was verified where, and what is still open |
| `REPORT-INPUT-CONTRACT.md` | What a report engine consumes (version 1.2.0): the input built from the stored answer log, its lineage, the method's own content, and the rules a report must keep |
| `REPORT-ENGINE-DESIGN.md` | The report engine's architecture and output specification, revision 3: the boundary between the Snapshot, the Comprehensive Report and Advisory; the standard self-reported report in four layers; the Advisory record kept apart; release criteria; checks V01 to V20 and A01 to A06; decisions D1 to D12 |
| `REPORT-ENGINE-PHASE-1.md` | Phase 1 as built (accepted): document contract, input gate, claims ledger, validation and mutation tests; its draft builder is replaced by Phase 2 |
| `REPORT-ENGINE-PHASE-2.md` | Phase 2 as built: the standard self-reported report for fictional records, how each review finding and the Advisory correction were addressed, 17 tests with 78 mutations, and the four assessments |
| `REPORT-ENGINES-AND-REVISED-ASSESSMENT.md` | The current direction (11 November): the existing Snapshot, Essential and Comprehensive engines as implemented, input compatibility with the revised assessment, the assumptions that no longer hold, the proposed scoring methodology for MK approval, minimal changes, quality plan, versioning, tests and acceptance criteria |
| `APPENDIX-MFRS-BANK-CANDIDATES.md` | Wording-similarity candidates between the 68 MFRS questions and bank 1.3, as evidence for MK; none adopted |
| `METHODOLOGY-DECISION-PACKAGE.md` | The scoring methodology decisions for the revised assessment (MK, 16:13): frame Option A simulated on fictional records, the membership of all 902 questions, the treatment of the 40 non-anchored confirmations, the corrected unknown test, the scoring impact on fixtures and six representative profiles, false comfort, comparability, the necessary report-engine changes, and decisions MD-1 to MD-16 each with a recommendation. Every value hypothetical; nothing implemented |
| `STAGED-ASSESSMENT-AND-SCORING-PLAN.md` | MK's direction of 11 November (17:00): the 95-screen ceiling replaced by a staged assessment in one session (core, breadth, function packages); why the 534 related practices are never reached and which to ask; tier 1 against all confirmations and a broader frame; a fixed consistency sample for false comfort; what the depth changes in the Snapshot, Essential and Comprehensive; the recommendation and the implementation plan, immediate work separated from MK decisions MD-B1 to MD-B11 |
| `staged-assessment/` | Its evidence: `RESULTS.md`, `depth-matrix.csv` (674 follow-up and related practices classified), `results.json`; produced by `scripts/research/depth/run.mjs` and checked by `check.mjs` (research hooks around the vendored engine; the engine file is unchanged) |
| `methodology-simulation/` | The generated evidence for that package: `SIMULATION-RESULTS.md`, `membership-matrix.csv` (902 rows), `membership-summary.json`, `results.json`; produced by `scripts/research/scoring-simulation/run.mjs` and checked by `check.mjs` (research only, imported by nothing under `src`) |
| `REPORT-ENGINE-MK-DECISIONS.md` | The methodological, copy, presentation and commercial decisions still reserved for MK, each with what the engine does now |
| `examples/` | Fictional examples for MK review, generated by the Phase 2 tests: the executive brief, the management report in four layers, the before-and-after comparison with Phase 1, the Advisory record and the end-to-end trace; `examples/phase-1/` keeps the Phase 1 examples |

## Commits

The branch is layered so each concern can be reviewed on its own. Every commit type-checks on its own.

| Commit subject prefix | Contents |
|---|---|
| Docs | `AGENTS.md`, the owner brand direction that was untracked in the parked worktree |
| Engine | vendored engine, bank, coverage map, contract, replay, views (no I/O) |
| Security and persistence | fictional file store, harness switch, role-scoped links, review API |
| Presentation | review pages and components; public site behind the track switch; later presentation fixes |
| Verification | contract tests and browser, layout, timing, accessibility and recording scripts |
| Docs | these documents |
| Security and persistence, Engine adapter, Security, Presentation, Verification | the corrections for the independent review (F1 to F5), one concern per commit |
| Presentation, Verification | what re-verifying the corrections found: the phone placement correction, the management view's result after sending, the located-error, p95, phone placement and hydration probes, and state-based waits in the scripts |

The commit-by-commit working history, including the defect fixes in the order they were found, is kept on `review/mk-integrated-readiness-worklog`. Its final tree is identical to the layered branch at the first Verification commit; the later presentation fixes, verification scripts and these documents were added on the layered branch only.

## Running it

Requirements: Node 24 (as `package.json` `engines`), npm 11, a Chromium for the browser scripts (Playwright 1.63 used here). No `.env` file, Supabase project or credential is needed for the review track.

```bash
# The bundle is self-contained: it carries the full history to the candidate and needs no other repository.
git clone --branch review/mk-integrated-readiness mk-integrated-readiness.bundle mk && cd mk
git rev-parse HEAD   # compare with SOURCE-COMMIT.txt
npm ci --ignore-scripts --no-audit --no-fund

# Review-track build
NEXT_PUBLIC_MK_READINESS_TRACK=review npx next build

# Start with the fictional local harness (sessions are written to ./.readiness-review-harness)
MK_READINESS_REVIEW_HARNESS=fictional-local \
NEXT_PUBLIC_MK_READINESS_TRACK=review \
npx next start -p 3200
# Open http://localhost:3200/review and start a fictional review.
# Add MK_READINESS_REVIEW_FAULTS=enabled to allow ?fault=save on a respondent link (save-failure test only).
```

A build without `NEXT_PUBLIC_MK_READINESS_TRACK` is the unchanged legacy site, and `/review` returns not found.

### Checks

```bash
# Contract tests (no server)
node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs \
  scripts/readiness-review-contract-tests.mjs

# Against a running review build with the harness and faults enabled
node scripts/readiness-review-browser-journeys.cjs   http://localhost:3200 out/journeys
node scripts/readiness-review-viewport-journeys.cjs  http://localhost:3200 out/viewports
node scripts/readiness-review-transition-timing.cjs  http://localhost:3200 out/timing.json 40
node scripts/readiness-review-settle-probe.cjs       http://localhost:3200 6
node scripts/readiness-review-seed.cjs               http://localhost:3200 out/seed.json
node scripts/readiness-review-layout-sweep.cjs       http://localhost:3200 out/sweep after '<pages json>' --companion --perf
node scripts/readiness-review-axe-scan.cjs           http://localhost:3200 out/axe.json '<pages json>' --states
node scripts/readiness-review-record.cjs             http://localhost:3200 out/recordings [baseline url]

# Intermittent problems that need a busy processor: run each beside another journeys run
node scripts/readiness-review-phone-placement-probe.cjs http://localhost:3200 out/phone-placement.json 12
node scripts/readiness-review-hydration-probe.cjs       http://localhost:3200 out/hydration.json 60 management
```

`<pages json>` maps page names to paths, for example `{"home":"/","start":"/review","snapshot":"/review/s/<management link>/snapshot"}`; the seed script prints the links it creates.

The journeys, recorder, axe scan and phone placement probe exit non-zero on any failure. The recorder writes a record per clip; the axe scan keeps incomplete results. The hydration probe runs from the repository root of the build it is checking, because it reads the production React chunk from `.next`.

All organisations and answers used by these scripts are fictional.
