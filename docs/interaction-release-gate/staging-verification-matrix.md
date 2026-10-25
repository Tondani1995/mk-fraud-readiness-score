# Staging verification matrix

25 October 2026. **All hosted cases remain pending.** Local browser fixtures and disposable PostgreSQL tests do not clear these rows. See staging-readiness.md for the exact isolation/access blockers and setup prerequisites. Never use the shared preview/production project to collect this evidence.

Before execution: record the isolated host/project and exact deployed SHA; review migrations, seeds, vault, cron, worker, storage and provider egress; use fresh staging credentials and token pepper. Payments and generation must be non-chargeable, and email must terminate in an approved sink with outbound customer communications blocked. No production credentials or records may be copied. Provisioning/deployment requires separate owner authorisation.

| Gate ID | Execute in isolated staging | Evidence required | Status |
|---|---|---|---|
| identity | Verify host, project, branch, deployment SHA, graph/methodology activation and provider modes against the isolation attestation. | Redacted configuration, schema/activation identity, egress controls and exact deployment. | Pending |
| creation | Create a synthetic assessment after the normal profile/legal gates. Try invalid and duplicate requests. | Exactly one draft and hashed resume credential, accepted legal versions; invalid requests leave no draft. | Pending |
| branching | Exercise inclusion/exclusion gateways, conditional areas and uncertain scope. | Authoritative path IDs and counts reconcile with graph; no hidden-control response contributes. | Pending |
| save-resume | Save numeric zero and unknown, close context and resume from private link. Simulate failed reply/retry. | Persisted values, sequence, expiry and current node; no duplicate save. | Pending |
| completion | Review and explicitly submit; repeat/stale-submit attempts. | Locked single initial score run with correct version, result and audit trail; duplicate/stale requests rejected. | Pending |
| private-result | Open Snapshot in a fresh context with correct, missing, expired, revoked and other-assessment credentials. | Valid access only; private no-store/no-referrer responses; no token in telemetry or public artefacts. | Pending |
| essential-order | Choose Essential, fill billing with/without invoice and inspect order. | R7 500 incl. VAT and correct frozen catalogue entitlement; legal/consent versions and resumable billing. | Pending |
| comprehensive-order | Repeat for Comprehensive and prior-choice navigation. | R35 000 incl. VAT and correct entitlement; no score-driven necessity claim or silent tier change. | Pending |
| payment-negative | In the permitted test double/sandbox, send invalid signature, amount, currency, stale and out-of-order callbacks. | Every invalid transition denied and no generation entitlement. No real payment. | Pending |
| payment-confirmation | Confirm one non-chargeable test transaction; replay/concurrently deliver the callback. | One paid transition/event and one eligible report job; provider test identity and idempotency evidence. | Pending |
| report-generation | Generate each entitled report using non-chargeable permitted services; retry/fail/recover. | One valid artifact per job/version, payment gate, source/run identity and no duplicate charged calls. | Pending |
| private-delivery | Deliver only to the controlled sink, open private artifact links in new contexts and try wrong/expired links. | Sink receipt, private storage/access policy, no customer egress and denied invalid access. | Pending |
| recovery | Recover failed generation/delivery states through normal authorised routes. | Job/event counts and immutable run/artifact identity; no replayed payment or unsolicited notifications. | Pending |
| mobile-assistive | Physical phone touch, virtual keyboard, zoom, screen-reader and keyboard flow through profile/questions/review/billing/Snapshot. | Device/OS/browser/AT version, speech/focus observations and actual recordings; viewport-only evidence is insufficient. | Pending |
| committed-start | Sample at least 30 real starts; inspect committed state, history URL, reload and analytics-disabled creation. | Begin-to-usable p50/p95/worst, one draft/token, graph identity and fresh-context resume. | Pending |
| state-transfer | Save with compact-v1/fingerprint, without headers and with an incorrect fingerprint. | Full/compact parity for paths, answers, zero/unknown, counts and save sequence; mismatched fingerprint falls back to full. | Pending |
| pending-recovery | Mobile/desktop failed save, Back while pending, retry, rapid double choice and real two-tab stale sequence. | Selection retained and all choices restored; one mutation; lock respected; current saved state/focus after conflict. | Pending |
| scope-recalculation | Answer affected controls, Back to a gateway, change scope, cancel and then confirm. | Correct invalidation preview/history and score inputs; authoritative next node; cancelled change preserves responses. | Pending |
| completed-resume | Complete/lock an assessment, keep its original Snapshot link, then exchange the original resume token through POST /score/api/adaptive/{ref}/result. Test pending and every invalid token/locked-run identity; race the final token allowance. | Exactly one final-use grant; normal new Snapshot credential; old private link still works; score/report/job/notification counts unchanged. Hosted HTTP, PostgREST and RLS evidence are required. | Pending |
| performance-device | On real desktop and representative phone, collect at least 30 successful transitions for immediate/ordinary/slow conditions. Measure actual SQL access/load/commit/projection and UI phases. | Feedback <100ms and next usable p95 <1s under recorded conditions; frame trace; database vs network vs render separated; cold creation/route load separately measured. | Pending |
| assistive-motion | VoiceOver/Safari and NVDA/Firefox (or approved equivalents), OS reduced motion, keyboard and touch zoom. | Scale meanings announced before selection, saving/confirmation announcements, focus after advance/Back/retry/conflict, modal containment and no lost/trapped focus. | Pending |

Run this **read-only** evidence checker after replacing the pending entries and supplying actual evidence files:

```sh
node staging-product-gate.mjs staging-evidence.json
```

The supplied pending manifest intentionally returns exit code 2 / NO-GO. The checker validates completeness and file presence, not the truth of evidence. Human review and a separate production authorisation are always required. Resolve the unknown-response methodology decision and approve area-introduction copy before release. Do not accept a local fixture pass as a hosted pass.
