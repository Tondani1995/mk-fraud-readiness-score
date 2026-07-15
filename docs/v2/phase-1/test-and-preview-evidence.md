# V2 Phase 1 — Test and Preview evidence

Date: 15 July 2026

Environment boundary: local/disposable infrastructure only; production, staging and UAT were not queried or modified.

## Automated and local scenario evidence

- `node scripts/phase1-production-stabilisation-tests.mjs`
  - Result: pass.
  - Covered P1-A through P1-F with in-memory storage and provider doubles.
  - Covered eligibility, unauthorised access, request replay, concurrent active-attempt control, visible failure, retry, immutable versions, missing object, delivery failure/retry, notification idempotency, queue visibility and safe timeline content.
- `tsc --noEmit`
  - Result: pass.
- `eslint .`
  - Result: pass.
- `next build`
  - Result: pass on Node 24.14.0. The build includes the new generation, preview, download and delivery endpoints and the admin order queues/detail views.
- `node scripts/phase14-node24-chromium-smoke.mjs`
  - Result: pass using the local Chrome executable; a 36,546-byte PDF was generated and the temporary artifact was removed.

## Database replay evidence

A disposable database was created inside the local Supabase Postgres container. Migrations 0001–0016 were replayed in order, migration 0017 was explicitly skipped, and migration 0018 was applied.

Result:

`manual_report_generation_attempts|manual_report_delivery_attempts|f|false`

This proves both tables exist, the report bucket remains non-public and the Phase 1 app setting records Phase 14 as false.

## Production-history simulation

A second disposable database replayed 0001–0016, received a legacy organisation/assessment/score/order/report fixture, then applied 0018.

Result:

`reports_before=1 reports_after=1 legacy_backfill=t|HISTORY-REPORT-003.pdf|application/pdf|NOT_STORED|t phase14_unapplied=t`

The migration preserved the row count, backfilled organisation/file/MIME fields, deliberately left the legacy object unverified, and left Phase 14 absent. The first authorised Preview/Download reads and checks the legacy object before it can become `VERIFIED` or delivery-ready.

The final migration was reapplied to that disposable history database after the stuck-attempt recovery addition. It remained replay-safe and returned:

`report_count_preserved=t legacy_row_preserved=t legacy_not_verified=t verified_timestamp_null=t phase14_unapplied=t`

## Database concurrency/version simulation

Two different request keys claimed the same paid order before completion. The first claim succeeded; the second returned `already_active`; the active row count remained one. Completing the attempt produced version 2 while retaining version 1 as superseded.

Result:

`first_claimed=true second_reason=already_active active_count=1`

`report_versions=2 latest_version=2 superseded_versions=1 attempt_status=REPORT_READY`

Delivery-double failure then retry produced retry count 1 without changing the two report versions. A third delivery request returned `already_delivered`.

Result:

`report_versions=2 retry_count=1 duplicate_reason=already_delivered observable_email_events=2`

## Regression and build evidence

The following final-tree suites passed:

- consolidation route checks and methodology copy checks;
- Phase 3 and Phase 4 smoke checks;
- Phase 6 scenarios, direct scoring engine and smoke checks;
- Phase 7 snapshot checks;
- Phase 8 admin console checks;
- Phase 9 manual EFT order checks;
- Phase 10 deterministic premium report checks;
- Phase 11 static security/QA checks (rendered route checks were not requested because no base URL was supplied at this stage);
- both Phase 13 commercial-event suites;
- Phase 14 autonomous-report, email-delivery, security-closure, storage-fault, provider-fault, webhook-adversarial and AI-accounting static/double suites;
- platform hardening and Phase 14 database hardening static checks.

The historical Phase 5 smoke script remains incompatible with the repository's already-implemented later phases: it rejects score runs and snapshot status by design. It fails on the base SHA for those same later-phase constructs; the final tree adds one expected `score_runs` reference in the new order-notification validator. This is recorded as a pre-existing test-boundary conflict, not a Phase 1 regression.

Intentionally not run: tests that apply migration 0017, connect with staging/UAT/production credentials, invoke providers, or need external secrets. Those operations are outside the Phase 1 safety boundary.

## Protected Preview evidence

To be updated only after a Preview-target deployment is created for the exact final SHA. No production alias or domain operation is permitted.
