# RC1 Technical-Freeze Implementation Design

**Status:** RC1 OPERATIONAL READINESS: CORRECTIONS REQUIRED. Design for controller approval only.

This document does not implement a freeze, alter the schema, change application routes, or perform
any cloud action. It records the exact current mutation inventory, the bootstrap design, and the
recommended implementation boundary for a future authorised cycle.

## 1. Design decision

The eventual cutover must become **eight migrations**: one freeze-bootstrap migration followed by
the seven already-approved behaviour-changing migrations. The bootstrap migration is required before
the first of the seven because the current Production application has no common freeze gate and can
continue calling legacy direct writes/RPCs during a schema/application deployment gap.

The bootstrap migration must be additive and independently fingerprinted. It must create the freeze
state, the database enforcement trigger/function, and the three AAL2 platform-admin control RPCs.
The seven existing migrations must not be edited to implement the freeze in this correction cycle.

The application/edge deployment remains same-SHA work and is not counted as a migration. The
bootstrap migration itself must be applied only after the owner has activated the existing manual
operational freeze for the short bootstrap transaction; once committed, the database guard protects
the old Production app until the new application is deployed.

## 2. Exact current mutation inventory

The inventory is based on the current RC head `226c25eed98eed5d62fbc2a3067a6c96d9920127`. “Old app
call” means the current Production application version can reach the route/service/RPC before the
same-SHA application deployment. Every row below therefore requires a database guard, even where an
application check will be added later.

| Surface | Current route/service/RPC | Current authorization | Tables or storage mutated | Old app can call during gap? | Required DB gate | Required app/edge gate | Freeze response | Canary bypass |
|---|---|---|---|---|---|---|---|---|
| Assessment creation | `POST /score/api/assessments/start` → `startAccountlessAssessment` | Public respondent input plus rate limit | `organisations`, `respondents`, `assessments`, `assessment_tokens`, audit/event rows | Yes | `assessment_create` trigger/RPC guard | Public intake gate | HTTP 423 `RC1_OPERATION_FROZEN` | No |
| Assessment answers | `POST /score/api/assessments/[assessmentRef]/answers` → assessment-save service | Resume token | `assessment_answers`, `exposure_answers`, assessment progress/event rows | Yes | `assessment_write` guard | Token-route gate | HTTP 423 | No |
| Assessment submission/scoring | `POST /score/api/assessments/[assessmentRef]/submit` → `submitAssessment`, `scoreSubmittedAssessment` | Resume token | `assessments`, score runs/results/traces, `assessment_tokens`, report/order event rows | Yes | `assessment_submit` guard | Token-route gate | HTTP 423 | No |
| Admin scoring/review | `POST /score/api/admin/assessments/[assessmentRef]/score` → `scoreSubmittedAssessment` | `platform_admin`, `reviewer`, `approver` | score runs/results/traces, assessment status, audit rows | Yes | `quality_review`/assessment guard | `requireAdmin` plus freeze gate | HTTP 423 | Synthetic only, never a real assessment |
| Order creation | report-request routes → manual EFT order service | Respondent token/session | `orders`, `payment_sessions`, `order_events`, `email_events` | Yes | `order_create` guard | Public order gate | HTTP 423 | No |
| Payment confirmation/status | admin status route → `confirmManualPayment`/`processVerifiedPayment` → `record_payment_transition`; `POST /score/api/webhooks/stitch` | Finance/platform admin or signed Stitch webhook | `orders`, `payment_automation_records`, `payment_transition_events`, `order_events`, generation attempts/reports | Yes | `payment_status` guard at table/RPC boundary | Admin gate and webhook gate | HTTP 423; webhook HTTP 503 with `Retry-After` | One synthetic canary only after explicit ticket |
| Manual generation/retry/regeneration | admin `generate-report`, fulfilment service, `generateManualPhase1Report`; `claim_payment_report_generation` | Admin generation roles; RPC rechecks | `manual_report_generation_attempts`, `reports`, `report_generation_runs`, `report_events`, Storage | Yes | `generation` guard and claim guard | Admin gate | HTTP 423 | One preapproved synthetic job ticket |
| Backlog classification/queueing | `/score/api/admin/backlog-reconciliation` → `classifyOrder`; `classify_backlog_order`, `backlog_reconciliation_queue` | Finance/platform admin; RPC role check | `backlog_reconciliation_records`, `audit_logs` | Yes after Release A | `backlog` guard | Admin AAL2 gate | HTTP 423 | No real order; synthetic fixture only |
| Worker claim/recovery | `GET /score/api/internal/fulfilment-worker`; `claim_next_fulfilment_job`, `recover_expired_fulfilment_leases`, delivery claim RPCs | Bearer `CRON_SECRET`/service role | generation attempts, delivery authorizations, leases, reports, email/event rows, Storage | Yes if invoked manually or by scheduler | `worker` guard in every claim/recovery RPC | Worker route gate and scheduler disable | HTTP 423; no claim | Canary ticket cannot authorise a worker batch |
| Quality review | admin fulfilment approve/reject routes → `approve_quality_review`, `reject_quality_review` | Admin review roles; AAL2 for governance path | attempts, reports, delivery authorizations, report events, audit rows | Yes | `quality_review` guard | Admin AAL2 gate | HTTP 423 | One synthetic report only |
| Delivery/redelivery | worker delivery phase; admin retry route → `retry_delivery`; `claim_next_delivery`, `mark_delivery_dispatch_started`, `finalize_delivery`, `fail_delivery` | Service role worker or delivery admin roles | delivery authorizations/finalizations/remediations, `email_events`, reports | Yes after Release C | `delivery` guard before claim/dispatch/finalize | Worker/admin gate; provider mode gate | Worker 423; admin 423; provider dispatch never reached | Synthetic canary only, no real recipient |
| Token issue/reissue/revocation | admin delivery routes → `issue_customer_report_access_token`, `reissue_customer_report_access_token`, `revoke_customer_report_access_token` | Service role issuance; admin roles for recovery | `customer_report_access_tokens`, audit/event rows | Yes after Release C | `customer_token` guard | Admin AAL2 gate | HTTP 423 | Synthetic token only; test mailbox only |
| Recipient correction | admin correct-recipient route → `correct_delivery_recipient_and_queue` | Delivery/access-token admin roles | delivery authorizations, tokens, email events, audit rows | Yes after Release C | `recipient_correction` guard | Admin AAL2 gate | HTTP 423 | No real recipient; synthetic mailbox only |
| Payment webhook | `/score/api/webhooks/stitch` → `processVerifiedPayment` → `record_payment_transition` | Signed provider request plus capability check | payment records, orders, events, fulfilment attempts | Yes | `payment_webhook` guard | Signature + provider-mode + freeze gate | HTTP 503 `RC1_OPERATION_FROZEN` | Only approved synthetic event |
| Resend webhook | `/score/api/webhooks/resend` → `ingest_phase14_provider_webhook` | Svix signature, rate limit, attestation/security gate | provider events, delivery state, operational alerts, audit rows | Yes where the dormant route is reachable | `resend_webhook` guard | Signature + secret relationship + provider-mode + freeze gate | HTTP 503 with retry signal | One preapproved synthetic provider event |
| Operational-alert mutation | admin transition route → `transition_phase14_operational_alert` | `platform_admin`/`reviewer`, AAL2 | `phase14_operational_alerts`, `audit_logs` | Yes after Release D | `operational_alert` guard | `requireAdmin` + AAL2 + freeze gate | HTTP 423 | No; alert control is not a canary path |

The database guard must cover the underlying DML targets as well as the listed RPCs. This is what
protects legacy code paths that do not yet know about the application gate.

## 3. Bootstrap object design

The future bootstrap migration should create, in one transaction:

1. A single-row `public.rc1_operation_freeze_state` table with a fixed key, state, epoch,
   activated/released timestamps, actor IDs, mandatory reason, and an explicit canary-ticket hash
   and expiry. The table is RLS-enabled, has no direct public/anon/authenticated write grants, and
   is readable only through a non-PII diagnostics RPC.
2. `public.rc1_require_operation_open(surface text)` as a `SECURITY DEFINER` function with an
   empty controlled `search_path`. Missing row, unknown state, expired state or malformed state
   raises `rc1_operation_frozen` rather than defaulting open.
3. A database trigger function on every protected DML table. The trigger calls the guard before
   INSERT/UPDATE/DELETE. It permits only a validated, short-lived, surface-scoped synthetic ticket
   for the canary; it never permits a customer row or arbitrary order reference to bypass the gate.
4. `rc1_activate_freeze(reason text)`, `rc1_authorize_canary(surface text, reason text)` and
   `rc1_release_freeze(reason text)`. Each requires an active platform admin with an AAL2 session,
   a non-empty mandatory reason, and writes an audit row. Release is impossible while a canary is
   active or when the final disabled-state checks are not recorded.
5. A non-PII `rc1_freeze_status()` RPC for evidence. It returns state, epoch, timestamps and
   fingerprints only; never customer IDs, emails, names or ticket values.

The control RPCs must verify AAL2 from the server-side auth context, not from user-editable metadata.
The canary authorization must be single-use, surface-scoped, time-limited, and bound to the
controller-approved synthetic fixture and designated test mailbox outside git.

## 4. Old-application protection and bootstrap gap

The owner first activates the existing manual operational freeze. The bootstrap migration is then
applied as the first schema operation. Its commit creates the fail-closed row and triggers before
any of the seven behaviour-changing migrations are attempted. From that commit onward, the old app
can still receive requests, but every protected mutation reaches a trigger and stops.

The seven later migrations must not drop the freeze table, replace the guard function, remove guard
triggers, or widen grants. The postflight must fingerprint the bootstrap objects and verify trigger
coverage before accepting any later migration. A stale or missing freeze row is a STOP, not an
implicit released state.

## 5. Application/edge gate

The same-SHA application correction adds a single gate helper called before every route/service
listed in §2. It reads the non-PII `rc1_freeze_status()` result and fails closed on timeout, unknown
state or RPC absence. User/admin mutations return HTTP 423 with reason `RC1_OPERATION_FROZEN`.
Payment and Resend webhooks return HTTP 503 with `Retry-After` so the provider can retry without a
false acknowledgment. The worker returns HTTP 423 without claiming a lease. Provider mode remains
disabled throughout RC1 certification.

The application gate is defence in depth only. The database trigger/RPC guard is the authority that
protects the old application during the schema/application gap.

## 6. Options considered

| Option | Result |
|---|---|
| Application-only boolean/env flag | Reject. Old Production code can still mutate during the gap, and a missing flag can accidentally default open. |
| RPC wrappers only | Reject. Legacy direct writes and already-existing RPCs can bypass a new wrapper. |
| Provider/webhook/worker disable only | Reject. It does not stop public assessment/order writes or admin status/generation actions. |
| Database trigger guard plus AAL2 control RPCs plus application gate | **Recommend.** It protects old and new callers, fails closed on missing state, and gives auditable narrow canary control. |
| Connection-pool or cloud firewall block | Reject as the primary control. It is coarse, provider-dependent, and does not provide a transaction-level canary scope or an auditable release RPC. |

## 7. Acceptance conditions for a future implementation

The controller must approve the bootstrap migration and its exact object/fingerprint manifest before
implementation. The future cycle must then prove, in a disposable database, that every surface in
§2 stops while frozen, that the old RPC/direct-DML paths cannot bypass the guard, that one synthetic
canary can pass only through its scoped ticket, and that activation/canary/release each require AAL2,
reason and audit evidence.

No freeze capability is implemented by this RC1A correction cycle.

## 8. Unresolved owner decisions retained

- Supabase PITR/backup evidence and the approved recovery point.
- Named absence-cover operator.
- Owner-approved external action for all 18 paid orders.
- Final worker/manual fulfilment operating-model decision.
