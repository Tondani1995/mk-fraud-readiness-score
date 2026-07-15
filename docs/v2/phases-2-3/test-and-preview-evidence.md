# Test and Preview evidence

## Local evidence

The following evidence is generated only against loopback/disposable infrastructure:

- Phase 2–3 release-safety test: valid/invalid signature, replay tolerance, malformed payload, manual and webhook normalisation, unknown order, under/over/wrong-currency review, failure, refund, cancellation, duplicate and concurrent duplicate, return without webhook, pre/post-0023 fulfilment, existing-report suppression, no Phase 14 path, native no-iframe rendering, save-before-advance, retry, resume and accessibility structure.
- Database-backed payment concurrency: eight simultaneous verified-webhook calls and eight simultaneous manual-confirmation calls each produced one transition and one order-timeline event; eight simultaneous fulfilment claims produced one Phase 1 generation attempt.
- Exact migration replay: fresh 0016→0023→0024→0025, production-history reproduction, duplicate refusal, prohibited-history refusal, controlled rollback and partial-state refusal.
- Consolidated respondent integration: exactly 68 active questions and 8 exposure factors saved, submitted and scored through the existing deterministic engine; the all-3 fixture remained score 60 and maturity Structured.
- Native browser measurements: 320×700, 390×844, 768×1024 and 1440×1000 Chromium viewports; no iframe, no nested scroll container, no horizontal overflow, native form visible and reduced-motion preference recognised. The active journey also proved failed-save retention, retry, save-before-advance, domain advance, one request for rapid taps, completed-domain reopen/amendment and refresh resume.
- Regression gates: fresh `npm ci` (990 packages), ESLint with no warnings, TypeScript, production build, Phase 1, Phase 6 deterministic engine, Phase 8 admin, Phase 9 orders, Phase 10 reports, Phase 11 security, platform hardening, retained inert Phase 14 double/static suites and a 36,546-byte PDF smoke all passed. The dependency audit reports the baseline seven findings (one moderate and six high); no forced dependency upgrade was made in this scoped release.

Final command outcomes, CI run IDs and Preview exact-SHA proof are added to the PR after the final commit. No claim of native Safari-engine testing is made by the Chromium viewport evidence.

## Historical test disposition

The former iframe-height browser test is obsolete because its subject was deliberately removed. It is excluded and replaced by `phase23-assessment-browser-tests.mjs`, which verifies the native one-scroll architecture. Historical Phase 14 tests remain inert doubles/static checks only; no Phase 14 migration or runtime activation is permitted.
