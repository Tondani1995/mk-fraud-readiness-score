# Sixth adversarial remediation evidence

Status: implementation evidence only. PR #21 remains draft, open and unmerged.
Production and UAT were not modified. No policy or route was enabled outside
rolled-back/disposable local tests; no secret, identity, email, AI call,
provider call or real webhook was created or invoked.

## Closure matrix

| Finding | Closure | Behavioural evidence |
|---|---|---|
| H1 shared-row declassification | Immutable `phase14_operation_ref`, deterministic historical backfill, OLD+NEW ownership classification and function-owner transition boundary | protected/unprotected conversion, field change, nullification, unknown/legacy names, upsert, bulk update/delete, actual `service_role` |
| H2 capability ID as credential | Per-step HMAC attestation with a Vault-backed DB verification key and a distinct application secret | UUID-only denial, forged signature, wrong worker, payload binding, nonce replay |
| H3 long-lived arbitrary capability | Locked `expected_step` plus lease generation advanced on each dispatcher transition | skip, repeat, out-of-order, stale generation, competing worker and consumed replay |
| H4 split generation terminal | One `terminal_phase14_generation_publication` transaction owns all terminal database effects | injected rollback after each of 20 statement boundaries, successful commit and replay rejection |
| H5 workflow-start ambiguity | Durable outbox and explicit acceptance-uncertain boundary | competing dispatcher, lost response, no false `failed_before_provider`, durable run identity requirement |
| H6 cleanup absence | Provider-specific result classifier and separate deletion/acceptance/absence/error evidence | every non-not-found class rejected as absence; post-delete verification required |
| M1 bounce evidence | Immutable, expiring, single-use customer contact verification | forged, expired, cross-customer, concurrent consumption, consumed replay, atomic recipient CAS and permanent complaint denial |
| M2 gate approval reuse | Monotonic authority epoch bound to policies, routes, capabilities and attestations | suspend plus same-version re-satisfaction invalidates all prior authority |
| M3 provider evidence lifetime | Maximum age/future/dispatch/state/epoch bindings and atomic consumption | stale, future, state-changed and exact-once valid attestation |
| M4 unsafe unpublished history | Archived historical bytes plus one atomic canonical migration and a restartable UAT-only delta/ledger reconciliation | fresh replay, former post-commit boundary, missing ledger acknowledgement recovery, UAT convergence |

## Shared-table ownership

The five shared tables carry `phase14_operation_ref`. Existing Phase 14 rows are
backfilled using reviewed deterministic relationships and legacy identities.
The mutation trigger classifies both row images; ownership cannot be erased,
added, reassigned or bypassed with an unrecognised event name. Direct service
DML is allowed only for non-Phase-14 rows. Approved transitions must execute as
the reviewed database function owner with a matching internal transition
context, so a caller-set GUC alone never grants authority.

## Worker attestation threat model

The service-role credential authenticates a database client but does not prove
which worker or step is acting. Each worker call therefore signs a canonical
HMAC envelope binding capability/type, operation and execution identities,
action/step, all commercial IDs and recipient, lease generation, request hash,
issued/expiry times, nonce and authority epoch. The database key is referenced
through private Vault metadata; runtime roles cannot read the schema, key row or
decrypted value. Nonces are transactionally consumed. The application key is
read only while signing and is excluded from workflow values, database rows,
responses, logs and errors.

Rotation is dual-key: an AAL2 operator provisions a new `current` key, the old
key becomes `previous` for a bounded overlap, workers switch key IDs, and the
old key expires. The migration provisions no key and the rotation RPC remains
an enablement-only action.

## Capability step state

```text
authorised/claim
  -> leased/workflow_start_claim (automatic generation)
  -> workflow_start_dispatch -> workflow_start_settle
  -> generation_claim -> fulfilment_assembling -> narrative_decision
  -> AI checkpoint/attempt or lease renewal -> generation_run_record
  -> rendering -> temp cleanup registration -> storing -> draft commit
  -> temp link -> final cleanup registration -> temp cleanup settlement
  -> terminal_publication -> consumed
```

Delivery, reconciliation and cleanup capabilities use separate, similarly
closed branches. Every arrow verifies the exact signed step while holding the
capability lock, then increments the lease generation.

## Terminal generation transaction

The terminal RPC locks and validates the capability, live committed claim,
draft report, fulfilment and pre-existing final-object cleanup row; revalidates
the entitlement and immutable storage checksum/path; supersedes the prior
report; publishes the new report; links the generation run; settles (but does
not delete) the claim; advances fulfilment; inserts report, audit and assessment
events; marks the orphan-cleanup row `retained`; and consumes the capability.
Any failure rolls the entire set back. A copied final object remains represented
by the durable cleanup row until this commits.

## Workflow-start uncertainty

The outbox uses `pending`, `leased`, `acceptance_uncertain`, `started`,
`failed_before_provider`, `reconciliation_required` and `cancelled`. The row is
made acceptance-uncertain immediately before the external call. Workflow SDK
4.6.0 exposes neither an idempotency key nor a run lookup for `start`, so a lost
response is never automatically retried and remains reconciliation-required.
Startup returns success only after the returned run ID is durably recorded.

## Storage classification

| Result | Verified absence? | Handling |
|---|---:|---|
| documented HTTP 404 plus known missing code/message | yes | settle deleted/absence verified |
| authentication or authorization failure | no | error/retry or dead letter |
| rate limit or timeout | no | retry |
| DNS/network failure or provider outage | no | retry |
| malformed response or checksum-read failure | no | error/alert |
| unknown provider error | no | error/alert |

Deletion requested, delete API accepted, absence verified and verification
error are stored independently. The database rejects a verified-deletion claim
without the exact `object_not_found` classification.

## Contact verification and authority epoch

Contact verification binds order, assessment, customer identity, old/new email,
a strict method, external evidence reference, trusted verifier/time, expiry and
single-use state. Bounce remediation locks and consumes it in the same
transaction as commercial recipient CAS and immutable authorization evidence.

Every gate satisfaction, suspension, downgrade, re-satisfaction or required
version change increments `authority_epoch`. The same transaction disables
feature and AI-route approvals, revokes active capabilities and produces audit
evidence. Re-satisfying the same numeric version therefore grants no authority
until every approval is freshly issued for the new epoch.

## Canonical migration and UAT strategy

Historical UAT SQL and SHA-256 identities are preserved under
`migration-audit-archive`. The deployable directory contains one Phase 14
version, `0017_phase14_canonical_disabled_foundation.sql`, with one outer
transaction and all controls disabled. Supabase CLI 2.109.1 is pinned because
2.81.3 cannot prepare the combined canonical transaction.

The controller-only UAT script verifies the exact old ledger and schema
boundary, holds an advisory lock, applies the archived fifth and sixth deltas
and reconciles the ledger in one transaction. It preserves application data and
is a verified no-op after commit. Local fresh and simulated-UAT paths have the
same full schema inventory SHA-256 recorded in the archive README. The CI also
executes the former closure post-commit/missing-ledger boundary and canonical
commit/missing-ledger acknowledgement recovery.

## Evidence classification

- Behavioural SQL: sixth adversarial suite, existing integration/AAL2/fourth/
  fifth/concurrency/atomic/runtime-mutation suites.
- Multi-session behavioural SQL: generation claim/concurrency and capability
  takeover races.
- Unit/runtime doubles: storage and email-provider fault injection, workflow
  serialization, AI accounting and source-contract regression.
- Inventory/static: source-string tests, table/function grants and schema hash.
- Local migration: empty replay, former-boundary recovery, UAT simulation and
  convergence. These are not deployed-UAT evidence.
- Exact-head CI: the GitHub checks attached to the final pushed PR head are the
  authoritative record; no pass is claimed before those checks complete.

Another fresh independent review remains required. Do not mark the PR ready or
merge it based on this implementation round.
