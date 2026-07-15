# V2 Phase 1 — release-safety evidence

Date: 15 July 2026

Environment boundary: local/disposable infrastructure only. Production, staging and UAT were not queried or modified. No remote migration was applied and no provider/webhook operation was invoked.

## Clean build and static scenarios

- Fresh `npm ci`: pass after synchronising the existing package lock with the pinned package manifest.
- ESLint: pass, no warnings or errors.
- TypeScript: pass.
- Next.js production build: pass on Node 24.14.0.
- `phase1-production-stabilisation-tests.mjs`: pass; P1-A through P1-F cover eligibility, roles, idempotency/concurrency, generation failure/retry, immutable versions, missing private object, delivery failure/retry, notifications, queues and safe event content.
- Node 24 Chromium smoke: pass with the explicit local Chrome override; valid 36,546-byte PDF produced.

## Pre-0023 application compatibility

A disposable Supabase schema was reset through version 0016. Ledger versions 0017–0023 and all Phase 1/Phase 14 objects were absent. The local harness reproduced the service-role ACLs already expected by the production-compatible application.

The production build then passed the following against that database:

- `/`, `/score/admin/login`, `/score/admin/orders`, an existing order detail, and `/score/admin/reports` returned successfully;
- the exact upgrade-not-activated message appeared on all new fulfilment surfaces;
- Generate, Preview, Download and Delivery controls were not rendered;
- authenticated generation, preview, download and delivery requests returned controlled HTTP 503 responses with the exact operational message;
- existing order status mutation persisted successfully;
- server logs contained no missing generation-ledger, delivery-ledger, report-column, or capability-RPC query.

Result: `expected=unavailable`, normal order status advanced to `payment_received`.

## Post-0023 activation

The same exact controller applied reviewed migration 0023 to the disposable through-0016 database. The capability function returned `available`, and the production build passed an end-to-end designated-test flow:

- controls became available to the authorised platform administrator;
- a fully scored, paid and manually verified Essential Self-Assessment produced one generation attempt, one report version and one private checksum-verified PDF;
- authorised Preview and Download returned short-lived signed links and recorded access evidence;
- Delivery created `DELIVERY_PENDING` in explicit disabled-provider mode and sent no email;
- the existing order status path remained functional after fulfilment.

Result: `expected=available`, one report ID returned, existing order status changed independently to `awaiting_payment`.

## Exact 0023-only replay

`phase1-0023-replay-tests.sh` invokes the same checksum- and target-bound mechanism documented for a future approved production window. All scenarios passed:

- fresh schema through 0016: readiness pass; only ledger version 0023 added;
- production-style historical ledger: all prior version/name rows and preservation fixture unchanged; only 0023 added;
- already applied: duplicate safely rejected with one 0023 row retained;
- prohibited version 0018: readiness safely rejected and no 0023 object created;
- controlled failure immediately before ledger insert: the migration objects, columns, marker and ledger entry all rolled back;
- final replay: capability available, 0017–0022 absent, Phase 14 objects absent, reviewed SHA-256 recorded in the sole 0023 entry.

Forward repair and source rollback procedures are documented in `production-deployment-and-rollback-plan.md`. The mechanism was not run against production.

## Allowed regression boundary

Passing final-tree suites cover consolidation routes and methodology copy; Phase 3/4; Phase 6 scenarios/engine/smoke; Phase 7; Phase 8; Phase 9; Phase 10; Phase 11 static security; both Phase 13 suites; allowed Phase 14 static/double suites for report, email, security closure, storage/provider faults, webhook and AI accounting; platform hardening; and database-security static checks.

The historical Phase 5 smoke remains intentionally excluded because it rejects score runs and snapshot status introduced by later completed phases; it fails on the base revision for that same reason. Tests that apply migration 0017, connect to staging/UAT/production, use external secrets, or invoke real providers remain prohibited.

## Protected Preview

The final Git-linked Preview must be created only after the release-safety commit is pushed. It must remain Preview-only and access-protected, have no production alias, and use no production/staging/UAT database or provider secret. Its deployment ID, URL, READY state, exact final SHA, protected health response and final CI run IDs are recorded in draft PR #26 so that adding live evidence does not change the attested source SHA.
