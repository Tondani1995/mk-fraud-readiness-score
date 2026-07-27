# RC1 Operational Freeze and Canary Plan

**Decision status:** RC1 OPERATIONAL READINESS: IN PROGRESS; RC MIGRATION/DEPLOYMENT: **NO-GO**.
The controller accepted the readiness inventory but has not authorised a Production freeze or cloud
change. This document designs the required controls; it does not implement them.

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

The narrowest acceptable implementation is one database-visible, audited `rc1_operational_freeze`
state read by every authoritative mutation RPC and route, with fail-closed behaviour when the state is
unknown. Public intake and webhooks additionally require an application/edge gate so requests are
rejected before any write. Worker claims must check the same state inside the claim transaction.
The change must be additive, tested on a disposable database, and separately approved; it is not
implemented in this cycle.

## Activation sequence

1. Tondani Netili records the freeze start timestamp and owner approval.
2. The approved technical gate is activated and its state is queried read-only.
3. Public intake, admin mutation, webhook and worker probes are run without submitting data.
4. Email provider mode is confirmed disabled; Vercel worker cadence is confirmed unavailable.
5. `scripts/rc1-production-preflight.sql` is run and all result lines are checked.
6. Only after the freeze evidence is complete may the seven-migration runbook proceed.

## Canary sequence

The canary is a single synthetic path approved by Tondani Netili. Its identifier and mailbox are
maintained outside git. The canary must be run only after schema postflight and exact-SHA deployment,
with provider mode disabled unless the approved certification step explicitly enables a disposable
test mode. It must never use a real order or recipient. The canary must prove generation, quality
review, recipient confirmation, delivery handling and audit evidence, then return the environment to
the disabled resting state before any freeze release.

## Release criteria

The freeze cannot be released until the owner has approved: backup/PITR evidence, all seven ledger
postflight checks, exact-SHA deployment, disabled-state smoke tests, canary closure, an anonymised
18-order action register and the complete GO evidence bundle. Any missing technical control remains a
NO-GO; it is not replaced by a written promise that an administrator will remember not to mutate.
