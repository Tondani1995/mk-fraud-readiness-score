# Phase 14 Security and State-Machine Closure — 14 July 2026

## Decision and scope

PR #21 remains draft, open and unmerged. This closure was implemented and verified only in the branch workspace and an isolated local Supabase stack. It did not apply a production or UAT migration, change a Vercel setting, enable a Phase 14 policy, send email, call an AI provider or submit a real webhook.

The database-controlled gate `phase14-premium-report` is seeded with required version 1, satisfied version 0 and status `unsatisfied`. Editable application flags cannot override that gate. The migration also resets every Phase 14 generation, AI, automatic-email, manual-delivery and recipient-override policy to false.

## Finding-by-finding closure matrix

| # | Finding | Closure | Authoritative control | Exact evidence and classification |
|---|---|---|---|---|
| 1 | Foundation could be activated through editable flags or a deep direct call | Resolved | Versioned database gate plus shared service/RPC checks for generation, download, delivery, resend, reconciliation, webhook mutation and AI | `phase14-aal2-security-gate-tests.sql` — single-session transactional SQL; `phase14-security-closure-tests.mjs` — static source assertion |
| 2 | Privileged actions did not require server-verified AAL2 | Resolved | JWT `aal`, expiry, authenticated user identity, active admin profile and allowed role are checked in the database | `phase14-aal2-security-gate-tests.sql` — single-session transactional SQL covering no session, inactive, AAL1, AAL2, disallowed, revoked and expired |
| 3 | Download issued a status-agnostic signed URL | Resolved | Shared entitlement RPC plus authenticated streaming and runtime SHA-256; missing or mismatched objects alert and fail closed | `phase14-storage-fault-injection-tests.mjs` — application service/storage fault-injection; `phase14-remediation-integration-tests.sql` — single-session transactional SQL |
| 4 | Generation eligibility could change after claim | Resolved | Draft commit and publication reassert persisted order, assessment, score and input-hash identities and complete commercial entitlement | `phase14-remediation-integration-tests.sql` — single-session transactional SQL changing eligibility after claim and after commit |
| 5 | A committed draft was tied forever to a textual owner | Resolved | Explicit claimed/committed/abandoned states, random claim token, renewable lease, audited recovery, single recovery count and safe cleanup contract | `phase14-multi-session-concurrency-tests.sql` — multi-session concurrency test for two claimers and two takeover attempts; integration SQL — committed abandonment |
| 6 | Delivery lacked an immutable pre-dispatch authorization | Resolved | Transactional outbox binds report, checksum, recipient, order, score, actor session and gate version; worker revalidates before claim | `phase14-remediation-integration-tests.sql` — single-session transactional SQL revoking an authorization after eligibility changes |
| 7 | Provider 404 could permit a duplicate resend | Resolved | A 404 with a provider message ID remains reconciliation-required and resend-prohibited; unresolved acceptance blocks force resend | `phase14-email-delivery-tests.mjs` — pure helper/static assertions; `phase14-provider-fault-injection-tests.mjs` — application service/provider fault-injection for ambiguous acceptance |
| 8 | Successful delivery persistence was fragmented | Resolved | One idempotent compare-and-set RPC finalizes email, provider ID, report release, fulfilment completion and three event records | `phase14-remediation-integration-tests.sql` — single-session transactional SQL including duplicate finalization and exact event counts; provider fault test — finalization failure |
| 9 | Webhook bounds, identity and ordering were incomplete | Resolved | 64 KiB streaming limit, timestamp bounds, provider-qualified identities, fingerprints/conflict alerts, minimal unsupported records and terminal ranks | `phase14-webhook-adversarial-tests.mjs` — pure helper test; integration SQL — single-session transactional SQL; `phase14-multi-session-concurrency-tests.sql` — concurrent webhook database sessions |
| 10 | Regex validation could not make AI prose non-authoritative | Resolved by schema replacement | AI can return evidence identifiers only. All client prose, scores, bands, gaps, controls and roadmap states are deterministic. Identifiers are NFKC-normalized and exact-key validated | `phase14-security-closure-tests.mjs` — pure helper test for written numbers, full-width digits, ranges, synonyms and indirect assertions |
| 11 | AI attempt identity and missing accounting were unsafe | Resolved | Reuse requires generation, evidence, provider, model, prompt, schema and kind; missing usage/cost becomes `accounting_unverified` and cannot be released | `phase14-ai-accounting-tests.mjs` — application service test with injected database/provider doubles; no provider call |
| 12 | Provider data controls were not merge-appropriate | Resolved for inert merge posture | Gate blocks ingestion; body/payload limits, redaction and minimal stored fields are encoded; categories and roles are documented | `provider-data-controls.md` — controller read-only verification/documented policy; integration SQL verifies unsupported-field discard |
| 13 | Static checks were described as behavioral concurrency/fault proof | Resolved | Local replay now runs transactional SQL, real dblink sessions and injected service faults | Exact classifications in this table and the verification inventory below |
| 14 | Evidence overstated concurrency, paraphrase and recovery proof | Resolved | Claims are limited to the evidence category actually run; no real-provider or deployed-UAT claim is made here | This document — controller read-only verification |
| 15 | Closure lacked complete verification and exact-head evidence | Pending exact-head controller evidence | Local suites, clean replay, lint, typecheck and build must pass; remote CI/Preview evidence is recorded only after push | See “Verification inventory”; exact-head CI and Preview are intentionally not preclaimed |

## Verification inventory

| Test | Classification | Property proven |
|---|---|---|
| `scripts/phase14-aal2-security-gate-tests.sql` | Single-session transactional SQL test | Gate default, AAL/session/profile/role matrix |
| `scripts/phase14-remediation-integration-tests.sql` | Single-session transactional SQL test | Entitlement changes, publication checks, outbox revocation, atomic finalization, webhook conflicts/order/provider identity |
| `scripts/phase14-multi-session-concurrency-tests.sql` | Multi-session concurrency test | Same-assessment claim election, committed-draft takeover race, concurrent webhook serialization |
| `scripts/phase14-storage-fault-injection-tests.mjs` | Application service test and storage fault-injection test | Upload/copy/checksum/publication/cleanup faults; download mismatch/missing alerts |
| `scripts/phase14-provider-fault-injection-tests.mjs` | Application service test and provider fault-injection test | Pre-boundary checksum failure, ambiguous dispatch, provider acceptance/finalization failure, successful finalization call |
| `scripts/phase14-webhook-adversarial-tests.mjs` | Pure helper test | Valid signature, future/old event rejection, header and streamed body limits, distinct fingerprints |
| `scripts/phase14-security-closure-tests.mjs` | Pure helper test plus static source assertion | Evidence-only AI schema, Unicode normalization and deterministic authority |
| `scripts/phase14-ai-accounting-tests.mjs` | Application service test with injected doubles | Exact reuse fingerprint, accounting-unverified, provider/model changes and pre-dispatch size ceiling |
| `scripts/phase14-migration-replay-assertions.sql` | Clean local migration replay assertion | Tables, functions, grants, counts, private bucket and disabled policy state |
| `supabase db lint --local` | Controller read-only verification | No local schema lint errors |

There was no deployed-UAT test and no real external-provider UAT in this closure. Earlier UAT artifacts are historical and do not prove the new security state machine.

## New migrations

- `20260714194317_phase14_security_state_machine_closure.sql`
- `20260714201550_phase14_webhook_state_machine.sql`

The second migration contains only the grant transition for the new webhook overload because Supabase CLI 2.81.3 cannot prepare a direct `REVOKE FUNCTION; GRANT FUNCTION;` pair as one migration statement. The grant transition is wrapped in one database block and is replay-tested.

## Enablement-only controls

These are deliberately not completed by this inert foundation PR:

1. independent third review and controller approval of the exact head;
2. production migration approval and a separately recorded security-gate version change by an AAL2 platform administrator;
3. organization-wide MFA enrollment, recovery and break-glass operating procedure;
4. provider contract/DPA approval and automated retention/deletion schedules;
5. alert routing, runbooks and operator reconciliation training;
6. separately authorized real-provider UAT for AI, email and webhooks;
7. separately authorized policy enablement, one flag at a time, after health and rollback checks.

Until those controls are complete, the security gate and every Phase 14 policy remain disabled.

## Fourth adversarial remediation addendum

This addendum closes the third independent review findings against the local
clean-replay database. It does not claim deployed-UAT, real-provider or
production execution. The gate remains unsatisfied and every policy row remains
disabled after replay.

| Finding | Closure | Classification and exact local evidence |
|---|---|---|
| Direct service-role gate writes | Revoked direct mutation privileges; an AAL2 platform-admin function and row/truncate guards are the only gate transition path. | Single-session SQL: `phase14-fourth-remediation-tests.sql`; clean-replay grant assertion. |
| Generic worker authority | Durable, one-time/leased capability records bind type, gate, policy, order, assessment, score, fulfilment, report and recipient; generic commercial RPC execution is revoked. | Single-session SQL and clean-replay grant assertion. |
| Cookie-dependent automation | The durable workflow claims separately authorized generation and delivery capabilities; it has no browser-cookie authorization path. | Service test: `phase14-autonomous-report-tests.mjs`; single-session SQL capability cases. |
| Gate without policy | Explicit database policy rows cover manual generation, automatic fulfilment, AI, automatic email, manual delivery, recipient override and cleanup; all seed false. | Single-session SQL: remediation, AAL2 and fourth-remediation suites. |
| Direct report writes / duplicate currents | `reports_admin_manage` is removed; table mutation grants are revoked; explicit transition RPCs and one-current-report partial unique invariant remain. | Clean-replay grant assertion; single-session SQL. |
| Stale publication | Publication requires the exact live generation lease/token and competes with recovery under locks. | Multi-session SQL: `phase14-multi-session-concurrency-tests.sql`. |
| Dispatch revalidation | The irreversible dispatch RPC rechecks gate, policy, payment, product, score, current report, checksum, recipient, provider and lease under lock. | Single-session SQL: post-claim eligibility mutations. |
| Lost provider response | Reconciliation accepts only verified request-key/webhook correlation or AAL2 evidence-backed operator action; it never guesses from recipient/report identity. | Single-session SQL and provider fault-injection test. |
| Storage cleanup | Durable cleanup queue records path, owner, checksum, retention, lease, attempts, failure and alert state; queue persistence failures propagate. | Storage fault-injection service test; single-session SQL. |
| Finalization replay | Immutable authorization/event/report/provider/message identity is compared; conflicts create critical alert without mutation. | Single-session SQL. |
| Complaint/bounce resend | Complaint is permanently non-retriable. A bounce requires an AAL2 reason/evidence authorization and a separately consumed bounce-retry remediation; no generic `forceResend` input remains. | Single-session SQL and email service test. |
| Requested vs resolved AI identity | Requested provider/model are stored separately from resolved provider/model and reuse requires both. AI remains policy-disabled. | AI-accounting service test. |
| Migration atomicity | The closure migration now creates the webhook function through a single transactional `DO` block before its sole final commit. A controlled injected failure immediately before that commit rolls back closure state and its ledger entry; a clean replay then succeeds. | Controller verification plus CI migration-replay job step; local result recorded 15 July 2026. |

### Migration reconciliation strategy

`20260714194317_phase14_security_state_machine_closure.sql` is an explicitly
reconciled correction to an already-applied migration, not a silent change. The
reviewed-head blob was `19bcf877e2802600c0877aa2a8f65f85e375e75e`; the corrected
blob is `26ef6dd5a8466dd4deaa33be23faf9c053d54653`. It keeps the same version and
the same 72-statement ledger count, has no rollback or renumbering, and changes
only execution atomicity: its webhook function is installed via dynamic SQL
inside the original transaction before the final commit.

Before any UAT migration, the controller must: record the existing UAT ledger
row and database backup; record both hashes and the 72-statement count in the
change record; confirm the existing function signature and grant; and apply only
the new forward migration `20260714214023_phase14_fourth_adversarial_remediation.sql`.
No migration ledger row is deleted, repaired or renumbered. This preserves UAT
auditability while first-time clean replays receive atomic behavior.

### Verification status at this commit

| Evidence | Status |
|---|---|
| Clean local replay, ledger, SQL lint, transactional SQL and multi-session concurrency | Passed on 15 July 2026. |
| Controlled partial-failure and forward recovery | Passed locally: injected fault left neither `phase14_security_gates` nor migration version `20260714194317`; restored source cleanly replayed. |
| Application service tests, static assertions, Node 24 typecheck and production build | Passed locally. Existing `<img>` and `turbopack` configuration warnings remain non-blocking and pre-existing. |
| Node 24 Chromium smoke | Deferred to Ubuntu CI: the bundled Linux Chromium executable cannot run on this macOS host (`ENOEXEC`). |
| Exact-head CI and Preview | Pending push of this draft PR head. |
| Deployed UAT / real external-provider UAT | Not run. |
| Production read-only isolation | No production credentials, migration, policy/gate mutation, provider call, email or webhook were used. |
