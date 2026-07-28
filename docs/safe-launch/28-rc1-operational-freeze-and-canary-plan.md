# RC1 Operational Freeze and Canary Plan

**Decision status:** RC1D APPLICATION FREEZE AND ROUTE FOUNDATION: **ACCEPTED**; RC1D OLD-SCHEMA,
REPLAY AND CHECKSUM EVIDENCE: **ACCEPTED**; RC1D CANARY STRICT-STOP DECISION: **ACCEPTED**;
RC1D BOOTSTRAP AND CONTROL PLANE: **CORRECTIONS REQUIRED**; RC1E CONTROL-PLANE CORRECTION:
**CODE COMPLETE — CONTROLLER REVIEW REQUIRED**; RC1 OPERATIONAL READINESS: **NO-GO**;
RC MIGRATION/DEPLOYMENT: **NO-GO**; CLOUD CERTIFICATION: **NO-GO**; **DO NOT MERGE**.
The foundation is implemented in source and disposable tests only. No Production freeze or cloud
change is authorised or performed.

**Owner and freeze activator:** Tondani Netili. **Canary approver:** Tondani Netili.
**Freeze-release authority:** Tondani Netili. Codex may execute only after explicit approval and may
not treat administrator discipline as a technical control.

## Required resting state during the freeze

- Public assessment and order intake unavailable.
- Assessment submission unavailable.
- Payment confirmation and payment-status changes unavailable.
- Manual generation, backlog generation and worker claims unavailable.
- Quality review, delivery, redelivery and recipient correction unavailable.
- Payment webhooks and Resend webhook processing unavailable.
- Email provider mode disabled.
- Only one predesignated synthetic canary may be used after explicit approval.
- No real order, customer mailbox, or customer data may be used for certification.

## Mutation-surface audit

The table below preserves the accepted pre-RC1D gap audit. Its “implementation required” entries are
superseded by the RC1D as-built foundation section: application and database enforcement now exist
in source and disposable tests, but remain undeployed and require controller acceptance.

| Surface | Current RC control | Freeze control required before GO | Gap status |
|---|---|---|---|
| New assessments | Public assessment-start route and respondent flow; no single global RC1 freeze gate is evidenced in this preparation | A central, fail-closed operational-freeze gate at the route/service boundary, plus a read-only health indicator | **Gap — implementation required** |
| Assessment submission | Respondent submission route and scoring path; no single global RC1 freeze gate is evidenced | Same central gate before final submission/scoring mutation | **Gap — implementation required** |
| Order creation | Manual/order service paths; no single global RC1 freeze gate is evidenced | Freeze gate before insert and payment-state transition | **Gap — implementation required** |
| Payment confirmation | Authenticated admin controls and audited payment transition RPCs | Freeze gate in the authoritative payment transition path, not only UI disabling | **Gap — implementation required** |
| Status changes | Role-gated/admin and payment-transition paths | Freeze gate in every authoritative status RPC | **Gap — implementation required** |
| Manual generation | Admin route, entitlement checks, claim/start/complete RPCs and audit trail | Freeze gate before claim and before any retry/regeneration action | **Gap — implementation required** |
| Backlog generation | Release A classification/queue RPCs; Release B worker claim path | Freeze gate in classifier/queue and worker claim RPCs; no queue claim during freeze | **Gap — implementation required** |
| Quality review | Authenticated quality-review RPCs with audit trail | Freeze gate before approve/reject/retry and an aggregate no-change check | **Gap — implementation required** |
| Delivery/redelivery | Release C delivery/token RPCs with role/worker controls | Freeze gate before authorization, claim, dispatch, retry, reissue and recipient correction | **Gap — implementation required** |
| Recipient correction | Release C closure RPC is role-gated and audited | Freeze gate in the RPC itself; UI disablement is insufficient | **Gap — implementation required** |
| Payment webhooks | Provider route and payment transition path; provider-side disablement is not a complete database control | Provider callback disablement plus fail-closed application/RPC freeze gate | **Gap — implementation required** |
| Resend webhook | Route uses provider verification and disabled provider mode for outbound sends; inbound mutation must still be frozen explicitly | Disable provider delivery and add a fail-closed freeze gate before webhook mutation | **Gap — implementation required** |
| Fulfilment workers | No active Vercel cron is currently configured; internal worker route is bearer-protected | Keep cadence disabled and add a durable freeze check in claim RPC/worker route | **Gap — implementation required** |

The implemented foundation uses one database-visible, audited `rc1_operation_freeze_state`
state read by every authoritative mutation RPC and route, with fail-closed behaviour when the state is
unknown. Public intake and webhooks additionally require an application/edge gate so requests are
rejected before any write. Worker claims must check the same state inside the claim transaction.
The change is additive and tested on disposable databases. It remains undeployed and separately
reviewable.

## Activation sequence

1. Tondani Netili records the freeze start timestamp and owner approval.
2. The approved technical gate is activated and its state is queried read-only.
3. Public intake, admin mutation, webhook and worker probes are run without submitting data.
4. Email provider mode is confirmed disabled; Vercel worker cadence is confirmed unavailable.
5. `scripts/rc1-production-preflight.sql` is run and all result lines are checked.
6. Only after the freeze evidence is complete may the eight-migration runbook proceed.

## Canary sequence

The canary is a single synthetic path approved by Tondani Netili. Its identifier and mailbox are
maintained outside git. The canary must be run only after schema postflight and exact-SHA deployment,
with provider mode disabled unless the approved certification step explicitly enables a disposable
test mode. It must never use a real order or recipient. The canary must prove generation, quality
review, recipient confirmation, delivery handling and audit evidence, then return the environment to
the disabled resting state before any freeze release.

RC1D provides no bypass for this sequence. The sequence remains a strict STOP until document 33 has
a controller-approved implementation meeting the transactional, single-use and scope requirements.

## Release criteria

The freeze cannot be released until the owner has approved the **CONDITIONAL PASS** backup gate and
its cutover evidence: the latest evidenced scheduled physical backup is
**2026-07-27 01:03:57 UTC** and the latest available scheduled backup must be retained as fallback;
a fresh logical database
backup created after freeze activation and successful final preflight immediately before migration 1,
and a restricted safeguard of critical Storage objects including `generated-reports` and
`payment-proofs`, with logical-backup timestamp/checksum, aggregate bucket object counts/size totals
and protected recovery artifacts outside git. It also requires all eight ledger postflight checks, exact-SHA deployment,
disabled-state smoke tests, canary closure, an anonymised 18-order action register and the complete
GO evidence bundle. PITR remains disabled and no compute upgrade or add-on is approved. Any missing
technical control remains a NO-GO.


## RC1D as-built foundation

The centralized application gate is controlled by `MK_RC1_OPERATION_FREEZE_MODE`. Missing, invalid
or explicitly frozen mode fails closed before a database client is created. Released mode also
requires a valid released database status; timeout, RPC absence, malformed state or layer
disagreement fails closed. Mutation routes return HTTP 423, provider callbacks return HTTP 503 with
`Retry-After`, and workers return without claiming.

The bootstrap migration creates an initial `FROZEN` singleton state, AAL2 platform-admin
activate/release controls, non-PII audit records, relation-level guards that include `service_role`,
and an event trigger for recognized future mutation tables. Forty relation guards include
report/enquiry request state and legacy manual delivery. Disposable replay verifies 34 old-schema
migrations, then bootstrap plus the seven accepted payloads, for exactly 42 ledger rows.

No genuine canary bypass is implemented. The current multi-request application/provider/Storage
workflow cannot bind a one-time authorization transactionally across pooled HTTP requests. The
strict STOP and safest design options are recorded in
`33-rc1-canary-transaction-design.md`. CLOUD CERTIFICATION remains **NO-GO**.

## RC1E supported freeze-control sequence

The dedicated status, activation and release routes remain reachable while ordinary business
mutations are frozen. All require an authenticated AAL2 `platform_admin`; they expose only safe
state, epoch, timestamp and fingerprint fields.

Activation/re-freeze order:

1. Set application mode exactly `frozen` and redeploy the exact approved SHA.
2. Verify all 34 ordinary mutation routes block.
3. Invoke `POST /score/api/admin/rc1-freeze/activate` with a meaningful reason.
4. Verify application and database both report `FROZEN`.

Final release order:

1. Keep the database `FROZEN`.
2. Set application mode exactly `released` and redeploy the same exact SHA.
3. Verify operations remain frozen because the database is still `FROZEN`.
4. Invoke `POST /score/api/admin/rc1-freeze/release` with exact epoch, meaningful reason and valid
   nonzero evidence.
5. Verify the database reports `RELEASED`; operations open only when both layers agree.

Certification HMAC provisioning does not release either layer. While both remain frozen, the owner
uses only `POST /score/api/admin/rc1-certification/runtime-secret`. Its one-use transaction token
permits one approved runtime-secret row and no other mutation. The ordinary Phase 14 secret route,
workers, webhooks, canary paths and all business surfaces remain frozen.
