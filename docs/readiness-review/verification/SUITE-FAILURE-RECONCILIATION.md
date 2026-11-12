# Wider test suites: the 65 failures reconciled against the baseline

Every test suite under `scripts/` (158) was run on the working tree after this delivery and on a worktree of `3f933ac`, the commit before build 1.6, four at a time with 300 seconds each, with the same Node 24 runtime. On this tree 93 suites pass and 65 fail. At `3f933ac` the same 65 fail, and one more, `meta-tracking-tests`, fails only because the baseline worktree has no production build: the suite stops at its bundle check with ".next/static missing - run `npm run build` before this suite". It passes on this tree, which has a build. (Corrected on 12 November 2026: the earlier text said 93 pass in both trees. The suite run of 12 November on the corrected tree gives the same 93 and 65 as 11 November.) For 64 of the 65 the first failure is identical apart from paths and timings. The remaining one (`phase-v7-checkpoint-f-rendered-pdf-tests`) timed out at 30 seconds in the parallel run while a production build was running alongside; run again on its own on the final tree it fails with exactly the four PDF-audit findings it produces at `3f933ac` (three AI-mode Essentials whose AI body is not rendered and one clean-assurance wording finding), so all 65 match the baseline. The integrity guard confirms that every protected library, score API, font and package file matches the baseline; the changed files are the review track, the public review-track preview (`SnapshotPreview.tsx`), new modules and documents. Four failing suites read website components; one of them, `v12-premium-experience-recovery-tests`, reads `SnapshotPreview.tsx`, which changed after the full run, so it was run again on the final tree: it fails with the same first assertion (`/Clarify the position/`), which concerns a different component.

`suite-failure-reconciliation.json` holds every row with its exit codes and first error. The classification below is by cause, and by the commercial area each suite exercises, read from what the suite opens.

## By cause

| Cause | Suites | What it means here |
|---|---|---|
| Source-text assertion no longer matching the baseline source (stale test) | 17 | The suite asserts text in a source file (a call, a regex, a file path) that the baseline no longer contains; the behaviour moved before 3f933ac. |
| Embedded Postgres cannot start here (initdb EACCES) | 15 | The suites start a disposable Postgres; this workspace does not allow its binary to execute. Not a code failure. |
| Fixture or behaviour expectation not met at the baseline | 10 | Real assertions that fail at the baseline: listed individually below. |
| Module resolution under the test runner (next/server, extensionless import) | 8 | The plain Node runner cannot resolve `next/server` or an extensionless import that the Next build resolves. |
| Needs a hosted or local database URL, Supabase keys or a running database | 7 | Integration suites that need staging, a local Supabase or keys that are not provided here (B1). |
| Operator script needing an argument (order reference or pre/post) | 3 | Operator scripts in `scripts/` that expect an argument; they are not test suites. |
| Freeze or protected-behaviour check already failing at the baseline | 2 | Freeze checks whose recorded state predates later approved changes (home page, adaptive result route). |
| Needs an AI provider or the manuscript-first path (deterministic fallback disabled by design) | 2 | Paid-report paths that require the AI manuscript; deterministic fallback is disabled by the reporting rules. |
| Rendered-PDF audit findings (timed out in the parallel run) | 1 | Timed out under load; run on its own it fails with the same four PDF-audit findings in both trees. |

## By commercial area

A suite can touch more than one area.

| Area | Suites failing | Of which environment, runner or argument | Of which stale text or freeze | Of which real expectation, AI or timeout |
|---|---|---|---|---|
| assessment | 6 | 1 | 5 | 0 |
| scoring | 3 | 1 | 1 | 1 |
| reporting | 21 | 6 | 5 | 10 |
| payment | 5 | 1 | 4 | 0 |
| fulfilment | 33 | 26 | 4 | 3 |
| other (website, release control) | 2 | 0 | 2 | 0 |

## Failures that are real expectations, relevant to assessment, scoring, reporting, payment or fulfilment

These fail at the baseline for reasons that are not the environment. None is caused or changed by this delivery; each is a pre-existing item for MK's engineering backlog.

| Suite | Area | First failure (identical at 3f933ac) |
|---|---|---|
| `commercial-pdf-composition-tests` | reporting | not ok - the template renders the bounded projection roadmap, never the full L1 set |
| `comprehensive-deliverables-tests` | reporting | AssertionError [ERR_ASSERTION]: Expected values to be strictly equal: |
| `essential-customer-residue-contract-tests` | reporting | TypeError: pack.facts is not iterable |
| `essential-v7-equivalent-certification` | reporting | not ok - the supporting-detail statement reports the authoritative L1 counts |
| `phase-v7-checkpoint-b-commercial-quality-gate-tests` | reporting | FAIL - C1-C8,C14. Quality failure: no storage upload/verification/completion RPC, previous report untouched, failure RPC called once with commercial_quality_failed, no cleanup needed |
| `phase-v7-checkpoint-e-ai-narrative-integration-tests` | reporting | FAIL - E4: administrator Phase 1 AI mode reaches the real shared pipeline, HTML, PDF and provenance |
| `phase-v7-checkpoint-f-rendered-pdf-tests` | reporting | Run on its own: PDF audit, 4 findings (`PDF_AI_BODY_NOT_RENDERED` for three AI-mode Essentials, `PDF_CLEAN_ASSURANCE_SEMANTIC_FAILURE` on "cannot be relied upon" and "provide false comfort"); in the parallel run it timed out |
| `phase14-ai-narrative-integrity-tests` | reporting | NarrativeManuscriptFirstBoundaryError: Reporting Bible v1.1 requires a validated, owner-approved plain-text manuscript before any paid report PDF is composed; deterministic narrative fallback is disab |
| `phase14-ai-settlement-parity-tests` | reporting | FAIL - the paid Essential path has no fallback to the old completion RPC |
| `rc1-delivery-entitlement-metadata-tests` | fulfilment | FAIL - E6. the uploader really writes the checksum Supabase stores as user metadata |
| `rc1-narrative-domain-scope-tests` | scoring, reporting | TypeError: Cannot read properties of undefined (reading 'array') |
| `rc1-near-real-time-fulfilment-tests` | fulfilment | AssertionError [ERR_ASSERTION]: Vercel waitUntil is used |
| `rc1-notification-recovery-tests` | fulfilment | ✖ T1 provider disabled: event is recorded but not sent (Nms) |

## Every failing suite

| Suite | Area | Cause | Same at 3f933ac |
|---|---|---|---|
| `certification-freeze-tests` | other (website, release control) | Freeze or protected-behaviour check already failing at the baseline | yes |
| `commercial-pdf-composition-tests` | reporting | Fixture or behaviour expectation not met at the baseline | yes |
| `comprehensive-deliverables-tests` | reporting | Fixture or behaviour expectation not met at the baseline | yes |
| `cx-v12-customer-experience-tests` | assessment | Source-text assertion no longer matching the baseline source (stale test) | yes |
| `essential-customer-residue-contract-tests` | reporting | Fixture or behaviour expectation not met at the baseline | yes |
| `essential-v7-equivalent-certification` | reporting | Fixture or behaviour expectation not met at the baseline | yes |
| `joint-launch-comprehensive-tests` | reporting | Source-text assertion no longer matching the baseline source (stale test) | yes |
| `joint-launch-comprehensive-workbook-tests` | reporting, fulfilment | Operator script needing an argument (order reference or pre/post) | yes |
| `joint-launch-customer-operability-tests` | assessment | Source-text assertion no longer matching the baseline source (stale test) | yes |
| `joint-launch-integrated-journey-tests` | assessment | Source-text assertion no longer matching the baseline source (stale test) | yes |
| `joint-launch-migration-replay-tests` | fulfilment | Embedded Postgres cannot start here (initdb EACCES) | yes |
| `joint-launch-review-authority-refs-tests` | reporting | Operator script needing an argument (order reference or pre/post) | yes |
| `joint-launch-transactional-safety-tests` | fulfilment | Embedded Postgres cannot start here (initdb EACCES) | yes |
| `phase-v7-checkpoint-a-response-label-db-integration-tests` | scoring | Needs a hosted or local database URL, Supabase keys or a running database | yes |
| `phase-v7-checkpoint-b-commercial-quality-gate-tests` | reporting | Fixture or behaviour expectation not met at the baseline | yes |
| `phase-v7-checkpoint-e-ai-narrative-integration-tests` | reporting | Needs an AI provider or the manuscript-first path (deterministic fallback disabled by design) | yes |
| `phase-v7-checkpoint-e-migration-replay-tests` | reporting, fulfilment | Embedded Postgres cannot start here (initdb EACCES) | yes |
| `phase-v7-checkpoint-f-rendered-pdf-tests` | reporting | Rendered-PDF audit findings (timed out in the parallel run) | yes, when run on its own |
| `phase-v7-current-manuscript-first-certification` | reporting | Source-text assertion no longer matching the baseline source (stale test) | yes |
| `phase14-ai-attempt-budget-tests` | reporting | Embedded Postgres cannot start here (initdb EACCES) | yes |
| `phase14-ai-narrative-integrity-tests` | reporting | Needs an AI provider or the manuscript-first path (deterministic fallback disabled by design) | yes |
| `phase14-ai-settlement-parity-tests` | reporting | Fixture or behaviour expectation not met at the baseline | yes |
| `phase14-autonomous-report-tests` | reporting | Source-text assertion no longer matching the baseline source (stale test) | yes |
| `phase14-delivery-entitlement-wiring-tests` | fulfilment | Embedded Postgres cannot start here (initdb EACCES) | yes |
| `phase14-delivery-reconciliation-tests` | fulfilment | Embedded Postgres cannot start here (initdb EACCES) | yes |
| `phase14-pdf-renderer-crash-recovery-tests` | reporting | Module resolution under the test runner (next/server, extensionless import) | yes |
| `phase14-report-access-eligibility-tests` | reporting | Embedded Postgres cannot start here (initdb EACCES) | yes |
| `phase14-webhook-route-db-test` | payment | Needs a hosted or local database URL, Supabase keys or a running database | yes |
| `phase14-workflow-start-reconciliation-tests` | fulfilment | Embedded Postgres cannot start here (initdb EACCES) | yes |
| `phase9-manual-eft-order-tests` | payment | Source-text assertion no longer matching the baseline source (stale test) | yes |
| `production-email-hmac-bootstrap-tests` | fulfilment | Embedded Postgres cannot start here (initdb EACCES) | yes |
| `production-monitor-database-tests` | fulfilment | Needs a hosted or local database URL, Supabase keys or a running database | yes |
| `rc1-application-freeze-tests` | fulfilment | Module resolution under the test runner (next/server, extensionless import) | yes |
| `rc1-certification-enablement-tests` | fulfilment | Module resolution under the test runner (next/server, extensionless import) | yes |
| `rc1-control-plane-profile-read-tests` | fulfilment | Operator script needing an argument (order reference or pre/post) | yes |
| `rc1-control-plane-route-tests` | fulfilment | Module resolution under the test runner (next/server, extensionless import) | yes |
| `rc1-delivery-entitlement-metadata-tests` | fulfilment | Fixture or behaviour expectation not met at the baseline | yes |
| `rc1-narrative-domain-scope-tests` | scoring, reporting | Fixture or behaviour expectation not met at the baseline | yes |
| `rc1-near-real-time-fulfilment-tests` | fulfilment | Fixture or behaviour expectation not met at the baseline | yes |
| `rc1-notification-recovery-tests` | fulfilment | Fixture or behaviour expectation not met at the baseline | yes |
| `rc1-old-schema-freeze-compatibility-tests` | fulfilment | Embedded Postgres cannot start here (initdb EACCES) | yes |
| `rc1-orphan-remediation-tests` | fulfilment | Module resolution under the test runner (next/server, extensionless import) | yes |
| `rc1-prepostflight-disposable-tests` | fulfilment | Embedded Postgres cannot start here (initdb EACCES) | yes |
| `rc1-preview-development-delivery-db-test` | fulfilment | Needs a hosted or local database URL, Supabase keys or a running database | yes |
| `rc1-replay-matrix-c-tests` | fulfilment | Embedded Postgres cannot start here (initdb EACCES) | yes |
| `rc1-service-role-privilege-contract-tests` | fulfilment | Needs a hosted or local database URL, Supabase keys or a running database | yes |
| `rc1-staging-postflight-hardening-tests` | fulfilment | Needs a hosted or local database URL, Supabase keys or a running database | yes |
| `rc1-synthetic-cleanup-route-tests` | fulfilment | Module resolution under the test runner (next/server, extensionless import) | yes |
| `rc1-synthetic-marking-route-test` | fulfilment | Needs a hosted or local database URL, Supabase keys or a running database | yes |
| `rc1-synthetic-marking-tests` | fulfilment | Module resolution under the test runner (next/server, extensionless import) | yes |
| `rc1-synthetic-notification-contract-tests` | payment | Source-text assertion no longer matching the baseline source (stale test) | yes |
| `release-b-durable-fulfilment-tests` | fulfilment | Source-text assertion no longer matching the baseline source (stale test) | yes |
| `release-c-email-secure-delivery-tests` | payment, fulfilment | Source-text assertion no longer matching the baseline source (stale test) | yes |
| `release-c-order-detail-delivery-truth-tests` | fulfilment | Embedded Postgres cannot start here (initdb EACCES) | yes |
| `release-c-runtime-secret-provisioning-tests` | fulfilment | Source-text assertion no longer matching the baseline source (stale test) | yes |
| `release-d-operational-alerts-tests` | fulfilment | Embedded Postgres cannot start here (initdb EACCES) | yes |
| `snapshot-advisory-notification-tests` | assessment | Module resolution under the test runner (next/server, extensionless import) | yes |
| `synthetic-comprehensive-route-contract-tests` | reporting | Source-text assertion no longer matching the baseline source (stale test) | yes |
| `v12-essential-productionisation-contract-tests` | reporting | Source-text assertion no longer matching the baseline source (stale test) | yes |
| `v12-manual-fulfilment-contract-tests` | payment, fulfilment | Source-text assertion no longer matching the baseline source (stale test) | yes |
| `v12-premium-experience-recovery-tests` | assessment | Source-text assertion no longer matching the baseline source (stale test) | yes |
| `v12-stalled-lead-controls-setter-tests` | fulfilment | Embedded Postgres cannot start here (initdb EACCES) | yes |
| `visual-coherence-contract-tests` | scoring | Freeze or protected-behaviour check already failing at the baseline | yes |
| `website-ai-fraud-methodology-tests` | assessment | Source-text assertion no longer matching the baseline source (stale test) | yes |
| `website-indexing-analytics-health-tests` | other (website, release control) | Source-text assertion no longer matching the baseline source (stale test) | yes |
