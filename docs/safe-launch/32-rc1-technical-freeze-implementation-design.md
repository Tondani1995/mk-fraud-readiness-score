# RC1 Technical-Freeze Implementation Design

**Status:** RC1 TECHNICAL BASE: **ACCEPTED**; RC1 NEAR-REAL-TIME AUTOMATIC FULFILMENT:
**CONTROLLER REVIEW REQUIRED**; RC1 OPERATIONAL READINESS and RC MIGRATION/DEPLOYMENT:
**NO-GO**; **DO NOT MERGE**.

This document records the accepted code-only control-plane design. The source contains the
bootstrap migration, application gates, supported operator routes and disposable proofs. Nothing has been applied to Production
and no cloud action has been performed.

## 1. Design decision

The eventual schema cutover contains **nine migrations**: one freeze-bootstrap migration, the seven
already-approved behaviour-changing migrations, and the additive near-real-time automatic
fulfilment correction. Before any schema operation, however,
the final RC application SHA must already be deployed with a fail-closed, environment-controlled
technical freeze active. The current Production application has no common freeze gate and can
continue calling legacy direct writes/RPCs, so a procedural or administrator-only freeze is rejected.

The bootstrap migration must be additive and independently fingerprinted. It must create the freeze
state, the database enforcement trigger/function, and the three AAL2 platform-admin control RPCs.
The seven existing migrations must not be edited to implement the freeze in this correction cycle.

The application/edge deployment remains same-SHA work and is not counted as a migration. The final
RC application must be compatible with the old 34-migration schema while frozen and must stop every
mutation before database access. Only after technical mutation probes pass may the bootstrap
migration run in an already-frozen environment. The same application SHA remains deployed throughout.

## 2. Exact current mutation inventory

The inventory is based on the controller-reviewed RC1A base
`fa2b57c133baccf3069b0a2e280b50ecb7e1e613`. “Old app
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

The “Canary bypass” column records the original desired scope. RC1D implements none of those
exceptions; every surface remains frozen. Document 33 supersedes the ticket assumptions wherever the
table says “synthetic” or “approved ticket”.

The database guard must cover the underlying DML targets as well as the listed RPCs. This is what
protects legacy code paths that do not yet know about the application gate.

## 3. Bootstrap object design

The RC1D bootstrap migration creates, in one transaction:

1. A single-row `public.rc1_operation_freeze_state` table with a fixed key, state, epoch,
   activated/released timestamps, actor fingerprints, mandatory reason, and inactive canary fields.
   RELEASED requires explicit non-null valid fingerprints, nonzero evidence and no canary fields.
   The table is RLS-enabled, has no direct public/anon/authenticated write grants, and
   is readable only through a non-PII diagnostics RPC.
2. `public.rc1_require_operation_open(surface text)` as a `SECURITY DEFINER` function with an
   empty controlled `search_path`. Missing row, unknown state, expired state or malformed state
   raises `rc1_operation_frozen` rather than defaulting open.
3. A database trigger function on every protected DML table. The trigger calls the guard before
   INSERT/UPDATE/DELETE. RC1D intentionally permits no canary bypass.
4. `rc1_activate_freeze(reason text)` and
   `rc1_release_freeze(reason text, evidence_sha256 text, expected_epoch bigint)`. Each requires an
   active platform admin with an AAL2 session, a non-empty mandatory reason, and writes an audit row.
   Release requires the exact current epoch, a nonzero SHA-256 evidence fingerprint and no active
   canary record.
5. A non-PII `rc1_freeze_status()` RPC for evidence. It returns state, epoch, timestamps and
   fingerprints only; never customer IDs, emails, names or ticket values.
6. `rc1_provision_certification_runtime_secret(text,text,text,bigint)`, authenticated-only and
   internally AAL2 `platform_admin`, for exactly the two certification HMAC keys while state is
   exactly `FROZEN` at the expected epoch. A private one-use transaction token binds the exact key,
   value fingerprint, actor and epoch; the relation trigger consumes it for only that
   `runtime_secrets` INSERT/UPDATE. A GUC/header, token marker alone, generic RPC or `service_role`
   cannot authorize a write.

The control RPCs verify AAL2 from the server-side auth context, not from user-editable metadata.
Canary authorization remains a STOP because the current workflow cannot enforce a genuine
single-use transaction across database, Storage, provider and pooled HTTP boundaries. See document
33.

## 4. Pre-schema technical isolation and bootstrap gap

The chosen design is a two-layer technical freeze with no procedural-only interval:

1. The final RC application contains a fail-closed application/edge gate controlled by a Production
   freeze environment setting. It is deployed with that setting active while the database still has
   exactly the old 34-migration schema.
2. Every public `/score` intake route and every mutation route in §2 checks the freeze before any
   database client or service call. Public/admin mutations return HTTP 423. Payment and Resend
   callbacks are disabled at the provider and also fail closed at the route with HTTP 503 and
   `Retry-After`. Scheduled and manual worker invocation are unavailable.
3. Compatibility tests deploy or run that freeze-enabled RC application against the old schema and
   prove health/read-only paths work while all mutation probes produce no writes. The pre-schema gate
   must not call the not-yet-created `rc1_freeze_status()` RPC.
4. Only after those probes pass does the freeze-bootstrap migration run. It creates the database
   freeze row and guards already in the frozen state.
5. The seven behaviour migrations then apply while both the application gate and database guard are
   frozen. The same application SHA remains deployed across the transition.

The seven later migrations must not drop the freeze table, replace the guard function, remove guard
triggers, or widen grants. The postflight must fingerprint the bootstrap objects and verify trigger
coverage before accepting any later migration. A stale or missing freeze row is a STOP, not an
implicit released state.

## 5. Application/edge gate

The same-SHA application correction adds a single gate helper called before every route/service
listed in §2. Before bootstrap, its authoritative input is the fail-closed Production freeze
environment setting, so it is compatible with the old schema. After bootstrap, it also reads the
non-PII `rc1_freeze_status()` result and fails closed on timeout, disagreement, unknown state or RPC
absence. User/admin mutations return HTTP 423 with reason `RC1_OPERATION_FROZEN`.
Payment and Resend webhooks return HTTP 503 with `Retry-After` so the provider can retry without a
false acknowledgment. The worker returns HTTP 423 without claiming a lease. Provider mode remains
disabled throughout RC1 certification.

Before bootstrap, the application/edge gate is the technical isolation authority. After bootstrap,
the database trigger/RPC guard becomes the authoritative second layer. Freeze release requires both
layers to agree and must happen only after postflight, disabled-state smoke and certification.

The supported operator routes are:

- `GET /score/api/admin/rc1-freeze/status`
- `POST /score/api/admin/rc1-freeze/activate`
- `POST /score/api/admin/rc1-freeze/release`
- `POST /score/api/admin/rc1-certification/runtime-secret`

They use the authenticated access token, require active `platform_admin` and AAL2, and call only the
corresponding narrow RPC. The release route is available only in exact application mode `released`;
the application still blocks until database state also becomes valid `RELEASED`.

## 6. Options considered

| Option | Result |
|---|---|
| Final RC application/edge gate deployed freeze-active before schema change | **Choose for pre-schema isolation.** It is implementable in the application without assuming a paid Vercel feature, can cover public/admin/webhook/worker routes before DB access, and is testable against the old schema. Missing/unknown state defaults frozen. |
| Existing application plus manual/admin freeze | Reject. It leaves an interval where the old application can mutate and relies on discipline. |
| RPC wrappers only | Reject. Legacy direct writes and already-existing RPCs can bypass a new wrapper. |
| Provider/webhook/worker disable only | Reject. It does not stop public assessment/order writes or admin status/generation actions. |
| Database trigger guard plus AAL2 control RPCs | **Choose after bootstrap.** It protects old and new database callers, fails closed on missing state, and gives auditable narrow canary control. |
| Vercel Firewall/WAF or maintenance rule as the sole gate | Reject as the primary control. Actual paid-feature availability is not assumed or approved; route coverage for provider callbacks, admin paths and manual worker invocation must not depend on an unverified plan capability. It may be supplemental only if separately evidenced. |
| Vercel deployment protection/maintenance page | Reject as the primary control. It does not prove every internal mutation route and provider callback fails before database access. |
| Connection-pool or cloud firewall block | Reject as the primary control. It is coarse, provider-dependent, and does not provide a transaction-level canary scope or an auditable release RPC. |

## 7. RC1D acceptance evidence

The controller must approve the bootstrap migration and its exact object/fingerprint manifest before
any deployment. The disposable suite proves that every inventoried application surface stops while
frozen; the same application stays healthy against the old 34-migration schema; old RPC/direct-DML
paths and `service_role` cannot bypass relation guards; unknown surfaces fail; and activation/release
require AAL2, reason, audit evidence, exact epoch and release-evidence fingerprint.

The manifest pins the corrected bootstrap SHA-256, three tables including constraints, 12 functions,
40 relation triggers and one event
trigger. The accepted seven behaviour migrations are independently checksum-pinned and remain
byte-identical. Full replay proves exactly 43 migration-ledger rows, with the correction migration
last.

Canary acceptance is not claimed. No bypass function exists in RC1D, and certification remains
NO-GO until document 33 has a separately accepted and implemented transactional design.

## 8. Final expected cutover

1. Deploy the exact final RC application SHA with the pre-schema technical freeze active.
2. Disable payment/Resend callbacks at their providers and make route callbacks fail closed.
3. Make scheduled and manual worker invocation unavailable.
4. Prove old-34-schema compatibility and zero-write mutation probes.
5. Run final preflight and create the separately authorised logical backup/Storage safeguards.
6. Apply the freeze-bootstrap migration in frozen state.
7. Apply the seven behaviour migrations in exact order.
8. Apply the additive near-real-time automatic fulfilment correction.
9. Run postflight.
10. Run same-SHA disabled-state smoke tests.
11. Run the separately controlled certification sequence.
12. Release both database and application freeze layers under named authority.

## 9. Unresolved owner decisions retained

- Supabase backup gate is **CONDITIONAL PASS**: Tondani Netili is the Supabase organisation owner
  and restoration authority, permission to initiate restoration is confirmed, scheduled physical
  backups are active, latest evidenced backup is **2026-07-27 01:03:57 UTC**, PITR is disabled, and
  PITR/compute upgrade is not approved. Cutover evidence remains outstanding: latest scheduled
  physical backup as fallback, fresh logical backup after
  freeze activation and successful final preflight immediately before migration 1, and restricted
  safeguards of critical Storage objects including `generated-reports` and `payment-proofs`, with
  logical-backup timestamp/checksum, aggregate bucket counts/size totals and protected artifacts
  outside git.
- Named absence-cover operator.
- Owner-approved external action for all 18 paid orders.
- The final operating-model decision is recorded in documents 29 and 34: manual payment
  verification, automatic downstream fulfilment, and manual exception management.
