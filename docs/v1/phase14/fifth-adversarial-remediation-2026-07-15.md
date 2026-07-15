# Fifth adversarial remediation evidence

Status: implementation evidence only. All Phase 14 policies remain disabled. This record does not claim production deployment, gate satisfaction, paid AI execution, live provider reconciliation, or production cleanup readiness.

## Closure matrix

| Finding | Closure mechanism | Evidence class |
|---|---|---|
| H1 direct service mutation | Phase 14 table DML revoked; shared rows guarded; workflow, fulfilment, provenance, AI, email and event changes use transactional RPCs | migration replay, grant inventory, behavioural SQL |
| H2 durable secrets | workflow input contains opaque capability UUIDs only; token-bearing facade overloads revoked | source test, RPC inventory, workflow serialization test |
| H3 capability recovery | renewal, expiry, single-lock takeover, gate revocation and terminal consumption transitions | concurrent behavioural SQL |
| H4 webhook trust | provider signature plus private-key HMAC facade, false-by-default webhook policy, immutable receipt | route-to-local-database test |
| H5 provider evidence | immutable lookup/webhook attestations and separate single-use consumption | behavioural SQL |
| H6 download authority | `manual_download` false by default and required by the shared security mapping | behavioural SQL |
| H7 finalisation | locked fulfilment binding, allowed source state, exact CAS and identity-bound replay | behavioural SQL |
| M1 session validity | required session ID plus authoritative `auth.sessions` active/not-after lookup | behavioural SQL |
| M2 cleanup | hourly worker, checksum-bound work lease, absence verification, mandatory dead letter/alert | route/unit plus behavioural SQL |
| M3 AI identity | per-gate route approval and gateway response identity; missing/mismatched identity rejected | unit plus behavioural SQL; no paid call |
| M4 bounce correction | verified previous/corrected address, order CAS, bounced event and one-time remediation | behavioural SQL |
| M5 policy versioning/history | exact-version approvals, invalidation/revocation trigger, restored historical blob and forward-only migration | hash, replay/equivalence, behavioural SQL |

## Migration identity and replay

| Artifact | Git blob | SHA-256 |
|---|---|---|
| Restored `20260714194317_phase14_security_state_machine_closure.sql` | `19bcf877e2802600c0877aa2a8f65f85e375e75e` | `5037c698eb2acab09ee1c588c6b67909428b742600fa1cb7523272a71d7e1b93` |
| Forward-only `20260715022146_phase14_fifth_adversarial_remediation.sql` | `9f239133c47646daec17b56237d88ff970d7e2f2` | `a472e8d9a93052c8a51d2ec1cc2bc97a6b827a0b5fba97d3fdaa6f150ffab84b` |

The canonical schema inventory includes tables, columns, constraints, indexes, functions and ACLs, triggers, policies and RLS state. A fresh replay and a local replay stopped at the current UAT boundary (`20260714214023`) then upgraded through the forward migration both produced SHA-256 `d3a88f96abf1d80b05b4baf6ce7f8db9558f001d917c7157a02d6e5d56cc94ef`. The migration-replay CI artifact recomputes this comparison for the candidate commit.

The workflow also injects a deliberate failure before the forward migration's sole `commit`, verifies that neither fifth-remediation schema nor its ledger row survives, restores the byte-identical migration, and replays it. PostgreSQL commit and the Supabase migration-ledger acknowledgement remain an unavoidable two-system boundary; reconciliation must compare the reviewed migration hash and canonical schema before recording a missing ledger acknowledgement.

## Table and transition grant inventory

Authoritative Phase 14 tables expose no generic service-role `INSERT`, `UPDATE`, `DELETE`, or `TRUNCATE`. This includes reports, fulfilments, generation runs and claims, AI attempts, worker capabilities, feature/route policies, security gates, delivery authorizations/finalizations/remediations, cleanup queue and alerts, and provider attestation/consumption tables.

The shared tables `audit_logs`, `report_events`, `assessment_events`, `email_events`, and `email_provider_events` retain non-Phase-14 service use. Their Phase 14 row/event types have insert/update/delete trigger guards limited to recognized transactional transition contexts, and service-role `TRUNCATE` is revoked. Behavioural tests execute all four mutation verbs as the actual `service_role`, including a forged guard-context attempt.

Reviewed mappings are:

| State class | Reviewed facade |
|---|---|
| Workflow start | `claim_premium_report_workflow_start`, `record_premium_report_workflow_start` |
| Fulfilment progress | `transition_premium_report_fulfilment` |
| Generation provenance/final transition | `record_premium_report_generation_run`, `complete_phase14_generation_operation` |
| AI attempt | `claim_phase14_ai_attempt`, `settle_phase14_ai_attempt` |
| Delivery | tokenless `worker_*premium_report_delivery` facades and `finalize_premium_report_delivery` |
| Webhook/provider evidence | `ingest_phase14_provider_webhook`, `record_phase14_provider_lookup_attestation` |
| Operator reconciliation | `resolve_premium_report_delivery_reconciliation` |
| Download event | `record_phase14_report_download` |
| Storage cleanup | `claim_phase14_storage_cleanup_jobs`, `complete_phase14_storage_cleanup_job` |
| Operational alert | `record_phase14_operational_alert` |

The CI grant artifact enumerates every Phase 14-related overload and the effective `PUBLIC`, `anon`, `authenticated`, and `service_role` execute privilege. Secret-bearing legacy worker/reconciliation overloads and the internal worker activation helper are explicitly non-executable by runtime roles.

## Demonstrated evidence by class

- Fresh local replay through the forward migration: passed with the pinned Supabase CLI `2.81.3`.
- TypeScript validation and optimized Next.js production build on Node 24: passed. The build has only pre-existing image optimization warnings and a Workflow-injected Next.js option warning.
- Direct service-role mutation denial and shared-table guard insert/update/delete/truncate attempts: passed.
- Opaque workflow serialization: passed with deliberately supplied `issueSecret` and `leaseToken` properties stripped before workflow start.
- Lease expiry/takeover and concurrent recovery: passed in independent database sessions.
- Post-publication atomic completion: an injected event failure rolled back generation-run linkage, fulfilment transition, event creation and capability consumption together; exact retry then committed and response-loss replay was idempotent.
- Signed route-to-database webhook: passed locally using a cryptographically valid synthetic Resend-shaped event and the same service-role/HMAC RPC path as production. Exact signed replay resolved to the original immutable receipt. This is not evidence of a live provider webhook.
- Provider lookup receipt: synthetic server-HMAC receipt was bound to provider request key, authorization and email event, consumed once by an AAL2 reconciliation decision, and rejected on replay. Caller-authored legacy evidence was denied.
- Download policy disabled while gate satisfied, cancelled-fulfilment finalization, revoked/expired Auth sessions, cleanup work-lease/object binding, provider identity mismatch, corrected-address bounce remediation, and gate-version policy invalidation: passed as transactional behavioural SQL.
- Node regression suites for report generation, delivery, security closure, webhook parsing and AI accounting: passed without paid calls or external provider access.

Exact-head GitHub CI is intentionally not claimed in this local record before the candidate commit is pushed. The PR check attached to that immutable commit is the authoritative exact-head CI evidence.

## Enablement-only controls remaining

- Independently review this exact head and its CI artifacts.
- Provision route/database HMAC keys under separation of duties.
- Demonstrate the signed webhook and provider lookup against a non-production provider sandbox.
- Configure immutable external audit export and alert delivery.
- Approve the exact gate version with AAL2, then approve individual policies separately. Do not enable AI, email, downloads, webhooks or cleanup merely because the gate is satisfied.

Production and UAT were not modified by this remediation. All policy enablement in behavioural tests occurred only inside rolled-back local transactions or disposable local databases.
