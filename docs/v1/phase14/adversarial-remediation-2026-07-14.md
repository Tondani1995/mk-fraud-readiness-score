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
