# Integrated A-D Release Candidate — RC0 Discovery Plan (Revision 3)

**This document plans RC preparation, which is now underway on a dedicated branch. Current status
— see §11 for the full four-way framework:**

| State | Status |
|---|---|
| RC PREPARATION | **GO** — branch/draft-PR/reconciliation/docs/tests only |
| RC MIGRATION/DEPLOYMENT | **NO-GO** |
| CLOUD CERTIFICATION | **NO-GO** |
| PUBLIC LAUNCH | **NO-GO** |

No Supabase migration was applied, no migration-ledger row was altered, no Supabase branch was
created, no cloud data was modified, no Vercel configuration or billing was changed, no Resend
feature was enabled, no synthetic cloud order was created, no worker was triggered, no change was
made to Production, and no PR was merged in the course of producing this revision or the branch it
now lives on.

**Revision 3 record.** Following controller acceptance of Revision 2 as the discovery baseline, this
revision executes the authorised RC PREPARATION work: branch `release-candidate/v7-a-d-integration`
created directly from the exact accepted Release D head; source-controlled migration-history
reconciliation attempted (§3 — four of five missing files fully restored and verified safe by fresh
replay; the fifth, plus the `0034` rename, together surfaced one genuine, confirmed replay failure,
documented and **not** silently patched, per the controller's own "stop and return a design" rule);
the four-state GO framework defined in full (§11); the cutover freeze broadened and given explicit
governance (§8); the three-secret provisioning sequence corrected with its required stages (§10).
Revision 2's own corrections (migration count, V7 classification, order classification, secret
naming) all stand and are not restated in full here — see `09-release-evidence.md` and the prior
revision's own text, retained below.

## 0. Where things stand right now

| Item | State |
|---|---|
| Release A (PR #41) / B (PR #42) / C (PR #43) / D (PR #44) | All accepted, `CODE IMPLEMENTATION COMPLETE — CLOUD CERTIFICATION DEFERRED`. All four PRs remain open, draft, DO NOT MERGE. |
| V7 commercial-report base (PR #37, `feat/essential-report-v2-commercial-rebuild`) | Code approved at Checkpoints A-F (merged sub-PR #39 within that branch); **PR #37 itself remains open, not merged to `main`**, not Production-authorised. See §2/§4a. |
| Production (`main`) | `fdf4d55b10b08a7fea05000feb6970860f3bb694` — unchanged. |
| Cloud database (`jvjxlphdyzerrhwcgkup`) | Unchanged. 34 applied migration records, newest `20260721150808`. |
| RC preparation branch | `release-candidate/v7-a-d-integration`, created directly from `f9cf016a67eeb342b32db81df09f0de90f6f56a5` (exact accepted Release D head). |
| This document's decision status | **RC PREPARATION: GO. RC MIGRATION/DEPLOYMENT, CLOUD CERTIFICATION, PUBLIC LAUNCH: NO-GO.** See §11/§12. |

## 1. Comparison against Production `main` (`fdf4d55b10b08a7fea05000feb6970860f3bb694`)

Re-confirmed: `refs/heads/main` is exactly `fdf4d55b10b08a7fea05000feb6970860f3bb694`.

The accepted A-D stack is **not** `main + A + B + C + D`. It is:

```
main (fdf4d55b…)
 └─ feat/essential-report-v2-commercial-rebuild @ feace689…  -- PR #37, V7, code approved (Checkpoints A-F, via merged sub-PR #39), NOT merged to main
      └─ two documentation-only commits (current-state discovery report; release evidence pack)
           = docs/safe-launch-discovery @ 27ff72c…
                └─ release-a/backlog-reconciliation @ 1cfa751…   -- ACCEPTED, PR #41
                     └─ release-b/durable-fulfilment @ e21078…   -- ACCEPTED, PR #42
                          └─ release-c/email-secure-delivery @ 16a14e2…   -- ACCEPTED, PR #43
                               └─ release-d/operational-readiness @ f9cf016…   -- ACCEPTED, PR #44
```

Every arrow re-verified this session with `git merge-base --is-ancestor` in both directions. This
corrects Revision 1's treatment of the pre-existing layer as a single undifferentiated block: it is
in fact two distinct things — **(a) the V7 commercial-report code base**, which has its own
controller approval (Checkpoints A-F, PR #39 merged into PR #37's branch) but has not itself been
merged to `main`, is not Production-authorised, and has Production AI still disabled pending its own
integrated-release decision and a live-provider smoke test; and **(b) two small, uncontroversial
documentation-only commits** that constitute `docs/safe-launch-discovery` on top of it. Releases A-D
were reviewed and accepted; V7 was reviewed and approved as code on its own separate track; neither
approval extends to the other, and bringing Production up to the accepted A-D stack necessarily
brings V7 along too, since it is a required ancestor.

## 2. Exact ancestry and accepted/approved heads

| Component | Head | Status |
|---|---|---|
| Production `main` | `fdf4d55b10b08a7fea05000feb6970860f3bb694` | Currently serving |
| V7 commercial-report base, PR #37 | `feace689ce7d3b1ecabd288e91006d4ac56df271` | **Code approved** (Checkpoints A-F, sub-PR #39 merged); PR #37 itself open, "DO NOT MERGE without commercial review"; 103 commits ahead of `main` (re-counted via `git rev-list --count`, consistent with the controller's ~105 figure) |
| `docs/safe-launch-discovery` | `27ff72c7ee6a7e18ecf2b5f17de7bf6a2caf23a4` | Documentation only, not independently reviewed as a release |
| Release A, PR #41 | `1cfa75117939276b19bab75c8201c919cc676400` | **Accepted** |
| Release B, PR #42 | `e2107809a1fb5094088cbdc338cfbe82d85ac141` | **Accepted** |
| Release C, PR #43 | `16a14e2247263b9675022d9e55b9252b8995170e` | **Accepted** |
| Release D, PR #44 | `f9cf016a67eeb342b32db81df09f0de90f6f56a5` | **Accepted** |

Clean, linear ancestry confirmed end to end — no divergence, no rebase or cherry-pick needed to
assemble an eventual integration branch from `release-d/operational-readiness`'s exact head. See §13
for how that branch should actually be constructed once this document is accepted.

## 3. Migration inventory — corrected

**Cloud ledger (`jvjxlphdyzerrhwcgkup`), re-queried fresh this session: 34 applied migration
records, not 33.** Revision 1 miscounted the same query result. Newest applied version remains
`20260721150808`, unchanged.

**Independently re-confirmed applied** (all three, by exact version string, present in the fresh
`list_migrations` result): `20260720200442` (`phase_v2_content_library_domain_code_and_activation`),
`20260720200735` (`phase_v2_fix_singular_cap_wording`), `20260721150808`
(`fix_complete_manual_report_generation_supersede_order`).

**The true pending set is exactly seven migrations, in exact execution order:**

| # | Version | File | Origin |
|---|---|---|---|
| 1 | `20260722143000` | `checkpoint_e_phase1_ai_attempt_binding.sql` | Pre-existing (`docs/safe-launch-discovery`), not Release A-D |
| 2 | `20260724150000` | `release_a_backlog_reconciliation.sql` | Release A |
| 3 | `20260724160000` | `release_b_durable_fulfilment.sql` | Release B |
| 4 | `20260724170000` | `release_c_email_secure_delivery.sql` | Release C |
| 5 | `20260724180000` | `release_c_closure_delivery_exceptions.sql` | Release C |
| 6 | `20260725090000` | `release_c_runtime_secret_admin_provisioning.sql` | Release C |
| 7 | `20260725150000` | `release_d_operational_alert_lifecycle.sql` | Release D |

No migration in this document is described as independently idempotent as a blanket claim — see §3a
for the one confirmed counter-example, found by actually reading the file rather than only diffing
version strings.

### 3a. Source/cloud migration-history reconciliation — executed this cycle on the RC branch; one confirmed conflict remains open

Full detail, exact SQL, and fresh-replay evidence: `docs/safe-launch/25-source-cloud-migration-reconciliation.md`. Summary:

**Completed and verified safe by fresh replay:**
- `0034_phase_v2_content_library_activation.sql` removed; replaced by
  `20260720200442_phase_v2_content_library_domain_code_and_activation.sql`, containing the exact
  statement text retrieved from `supabase_migrations.schema_migrations.statements` for that version
  (read-only, via the Supabase MCP `execute_sql` tool) — not a rename-and-assume-equivalence, the
  full text was compared and the differences recorded in doc 25.
- Three of the five fileless ledger versions restored verbatim from the same source:
  `20260708193238_phase10_report_engine_additions.sql`,
  `20260708193318_phase9_phase10_private_storage_buckets.sql`,
  `20260708194834_phase10_v2_report_engine_content.sql`. Their interaction with the already-committed
  `0011_phase10_pdf_report_engine_additions.sql` was analysed explicitly and proven safe by an actual
  fresh-database replay (doc 25): all `report_content_blocks` inserts use `on conflict do nothing`
  against the same natural key, so restoring these alongside `0011` produces no duplication; the two
  migrations that touch the `generated-reports` storage bucket at different sizes both converge on
  the value `0017` unconditionally sets afterward, confirmed live in the replay.
- `20260719081858_phase14_gate_invalidation_safe_update_fix.sql` restored verbatim, corroborated by
  two independent sources (the ledger and the never-merged `hotfix/phase14-safe-update-invalidation`
  branch, byte-identical) — fully idempotent, no conflict.

**One confirmed, unresolved conflict — not silently patched, per the controller's own instruction to
stop and return a design rather than edit historical SQL casually:**

`20260709033522_phase10_v2_report_template_seed.sql` was **not** restored as a live migration file.
Its exact ledger SQL inserts one `report_templates` row (`phase10_premium_v2`) that is confirmed
live in `jvjxlphdyzerrhwcgkup` (the only `report_templates` row that exists there). The
already-committed `0011_phase10_pdf_report_engine_additions.sql` inserts two *different*
`report_templates` rows (`mk_fraud_readiness_advisory_v1`, `mk_fraud_readiness_validated_advisory_v1`)
that are confirmed **absent** from production — meaning `0011` itself has never actually been
applied to `jvjxlphdyzerrhwcgkup` under any version identity. Restoring `20260709033522` alongside
the already-committed `0011` would make a fresh replay produce 3 `report_templates` rows where
production genuinely has 1 — a real, unintended divergence, not a false alarm. **Two candidate
resolutions are presented in doc 25 for controller decision; neither has been applied.**

**A second, separate and more severe finding, discovered only by actually running a fresh replay
after the above changes: the reconciled migration set does not currently replay cleanly.**
`20260720200442` (the `0034` replacement, containing the exact, unedited, live-production SQL) fails
on a fresh database with `insert or update on table "report_content_blocks" violates foreign key
constraint "report_content_blocks_methodology_version_id_fkey"` — because it inserts using a
hardcoded literal `methodology_version_id` that exists in production's `methodology_versions` table
but does not exist in any freshly-seeded database's own (independently-generated-UUID) row for the
same `version_code`. This was disclosed in the file's own header comment before the replay was run,
and the replay confirms it precisely: **every migration through and including `20260719081858`
replays successfully; `20260720200442` is the first and only failure.** This is the exact scenario
the controller's own reconciliation instruction anticipated. **Not resolved here** — see doc 25 for
the two candidate designs (a new, honestly-versioned, idempotent follow-up migration using dynamic
`methodology_version_id` lookup instead of the literal; or archiving this file outside the
live-replayed migration path). No historical SQL was edited to make this pass.

**Consequence for this document's own gates**: "migration-history reconciliation is complete" and
"fresh replay passes," both required preconditions for RC MIGRATION/DEPLOYMENT GO (§11), are **not
yet met**. RC PREPARATION itself is unaffected — branch creation, the draft PR, this documentation,
and the parts of the verification suite that do not require a full migration replay all proceed; see
§13 for exactly what did and did not run this cycle.

**No Supabase CLI `db push`, `apply_migration`, or any other automated migration runner is
authorised against `jvjxlphdyzerrhwcgkup` until source/cloud reconciliation is fully complete,
including the two open items above.**

## 4. Changed RPCs, tables, columns, indexes, grants, and routes

Computed as the diff `docs/safe-launch-discovery..release-d/operational-readiness` — the correct
boundary per §1 — separating the V7 layer, the pre-existing non-release layer, and each release's
own contribution. Verified by direct `grep` of every DDL statement, not reconstructed from memory.

### 4a. V7 commercial-report base (PR #37) — component inventory, included per controller instruction

Report-generation/content-library/AI-narrative code: `src/lib/reports/automation/**`,
`src/lib/reports/evidence-model/**`, `src/lib/reports/render-validated-commercial-pdf.ts`,
`src/lib/reports/response-labels.ts`, `src/lib/reports/commercial-quality.ts`, and related
`assemble-report-data.ts`/`fallback-content.ts`/`roadmap.ts`/`select-content-blocks.ts` changes.
**Status: code approved at Checkpoints A-F (PR #39, merged within PR #37's own branch); PR #37 to
`main` remains open and not merged; not Production-authorised; Production AI generation remains
disabled; the integrated release decision for this component and its own live-provider smoke test
are both still outstanding**, independent of Releases A-D's own acceptance. None of this touches
order, payment, delivery, or admin-alert logic — it is scoped to report content generation — but it
is a required ancestor of every accepted release and will be part of the same integration event.

### 4b. Pre-existing, non-V7, non-Release-A-D layer

The `docs/safe-launch-discovery` documentation-only commits themselves: two new files
(`00-current-state.md`, `09-release-evidence.md` plus `10-migration-discrepancy-investigation.md`),
no application or schema code.

### 4c. Release A — new, additive only

Table `backlog_reconciliation_records` (RLS, `select`-only to `authenticated`); indexes
`backlog_reconciliation_records_classification_idx`, `..._assigned_owner_idx`; functions
`classify_backlog_order(...)`, `backlog_reconciliation_queue()` (→ `authenticated`); routes
`/score/admin/backlog-reconciliation`, `/score/api/admin/backlog-reconciliation` (+ `/export`).

### 4d. Release B — new, additive, plus one widened check constraint

Columns added to `manual_report_generation_attempts`: `lease_owner`, `lease_expires_at`,
`heartbeat_at`, `next_attempt_at`, `max_attempts`, `quality_reviewed_by`/`_at`/`_decision`/`_reason`,
`regenerated_from_attempt_id`, `delivery_queued_at`. Status/trigger-source check constraints
widened (additive, no value removed). New functions: `claim_next_fulfilment_job`,
`fail_fulfilment_job`, `submit_for_quality_review`, `recover_expired_fulfilment_leases`,
`retry_fulfilment_job`, `recover_fulfilment_job`, `claim_payment_report_generation`,
`record_payment_transition`, `reject_quality_review`. `approve_quality_review` first defined here
(redefined again by Release C twice — see §4e, "last one wins" is intended and tested behaviour).
Routes: `/score/api/internal/fulfilment-worker`, four
`/score/api/admin/orders/[orderReference]/fulfilment/*` routes.

**Compatibility note required by §5's cutover analysis**: `record_payment_transition` is
redefined by this migration to *atomically* create the durable fulfilment job as part of recording a
payment transition — Production's currently-deployed application calls this function and then
separately triggers fulfilment as two steps. See §8 (cutover freeze).

### 4e. Release C — new, additive, plus one widened check constraint and two function redefinitions

Columns added to `report_delivery_authorizations`: `next_attempt_at`, `max_attempts`,
`retry_count`; `security_gate_version` made nullable. New table `customer_report_access_tokens`
(RLS, `select`-only). New functions: `claim_next_delivery`, `mark_delivery_dispatch_started`,
`finalize_delivery`, `fail_delivery`, `retry_delivery`, `revoke_customer_report_access_token`,
`issue_customer_report_access_token`, `reissue_customer_report_access_token` (redefined again in
the closure migration, adding an override-suppression parameter), `apply_email_provider_event_atomic`
(additive to the existing lowercase Phase14 rank vocabulary — confirmed by direct read),
`correct_delivery_recipient_and_queue`. `approve_quality_review` redefined a second and third time
(closure migration) to extend delivery-queueing and bounce/complaint-safe behaviour.
`set_phase14_runtime_secret` redefined (extended signature, audited reason parameter; old
2-argument call site still resolves). Routes: `/score/report/access/[token]`, four
`/score/api/admin/orders/[orderReference]/delivery/*` routes,
`/score/api/admin/phase14-activation/runtime-secret`, `/score/api/webhooks/resend` (bounce/complaint
classification added, signature check untouched).

### 4f. Release D — new, additive only (as amended and hardened)

Columns added to `phase14_operational_alerts`: `acknowledged_at`, `acknowledged_by`,
`resolved_by`, `last_status_changed_at`. Indexes: `phase14_operational_alerts_severity_created_idx`
`(severity, created_at desc, id asc)`, `..._list_idx` `(status, severity, created_at desc, id asc)`,
the pre-existing `..._open_critical_idx` (untouched), `..._category_idx`. New function
`transition_phase14_operational_alert` (→ `authenticated`, internally role-gated). Routes:
`/score/admin/operational-alerts`, `/score/api/admin/operational-alerts/[alertId]/transition`.

### 4g. Cross-release consistency

No destructive DDL (`drop table`/`drop column`/`truncate`/unscoped `delete from`) anywhere in the
7 pending migrations. No two releases' migrations conflict on the same table's DDL. Every
multiply-redefined function is redefined by a strictly later migration in the same linear stack, so
"last one wins" resolves correctly — the same behaviour every release's own live-Postgres test suite
already exercises by replaying the full accumulated set in order.

## 5. Compatibility with the currently-deployed Production application

Production's current code has no reference to any table, column, function, or route introduced by
V7, the pre-existing layer, or Releases A-D (confirmed: none of the new paths in §4 exist on
`main`). Every column Production's current code reads or writes continues to exist unchanged in
every pending migration; no table it depends on is dropped, renamed, or has a column removed. Every
new RPC is grant-restricted to `authenticated` or `service_role`, never `anon`. The one confirmed
schema-fidelity item requiring attention is §3a's git-reproducibility gap, which does not block the
7-migration apply sequence (§3a). **The one confirmed *behavioural* compatibility item is §4d's
`record_payment_transition` note, which §8's cutover freeze exists specifically to close** — not a
migration-safety problem, an old-app-vs-new-schema concurrency problem.

## 6. Existing real orders/records — corrected classification

Revision 1 stated "23 reports for 23 orders" as if every paid order were already fulfilled. **This
was wrong: 23 is a count of report ROWS, not fulfilled orders — several orders have multiple report
versions (regenerations), and the correct unit of analysis is per-order fulfilment state, which this
revision re-derives from a fresh, row-level, read-only query** (`orders` left-joined to `reports`,
classified by each order's non-superseded/highest-version report's `storage_status`) — independently
reproducing the controller's exact figures, not merely restating them:

| Classification | Count | Definition |
|---|---|---|
| **CURRENT_VERIFIED** | **2** | Has a current (non-superseded) report with `storage_status = 'VERIFIED'` |
| **CURRENT_NOT_STORED** | **13** | Has a current report, but `storage_status = 'NOT_STORED'` |
| **NO_REPORT** | **3** | No `reports` row exists for this order at all |
| Total `payment_received` orders | **18** | (5 further orders are `awaiting_payment`, unaffected) |
| Total `reports` rows across these 18 orders | 23 | Confirms the "23" figure — it is report-version rows, not orders |
| `payment_automation_records` | **0** | |
| `manual_report_generation_attempts` | **15** | One per order that has at least one report (18 − 3 `NO_REPORT` = 15) |
| Active/queued attempts (`REPORT_QUEUED`/`REPORT_GENERATING`/`DELIVERY_QUEUED`/`RETRY_SCHEDULED`/`AWAITING_QUALITY_REVIEW`) | **0** | Nothing currently in flight |

**Required future treatment, per order classification, before any worker claim is permitted against
these 18 orders:**

- **CURRENT_VERIFIED (2 orders)**: must be explicitly protected from regeneration and from duplicate
  delivery. Release B's `claim_payment_report_generation` idempotency (`on conflict (request_key) do
  nothing`) prevents a *second identical claim*, but does not by itself prevent a *new, different*
  regeneration request from being queued for an order that already has a verified, current report —
  that exclusion must be an explicit precondition checked before these two orders are ever exposed
  to the worker or an admin regenerate action.
- **CURRENT_NOT_STORED (13 orders)**: for each, a decision is required — regenerate as a new,
  controlled version, or attempt to recover/re-verify the existing stored object — not a default
  action applied uniformly to all 13 without individual review.
- **NO_REPORT (3 orders)**: report generation may be queued only after explicit backlog approval per
  order (matching Release A's own backlog-reconciliation classifier/approval flow) — not
  auto-queued as a side effect of the worker starting to run.
- **No worker claim against any of these 18 orders until every one has a recorded classification and
  an intended action** — this document records the classification; the intended action per order is
  a separate, owner/controller-reviewed decision not made here.
- **Before any worker is enabled**, prove (via a dry-run/read-only pass, not live claiming) that the
  2 `CURRENT_VERIFIED` orders are excluded from every generation-claim path, and that no
  `payment_received` order can be claimed and generated twice — both provable against
  `claim_payment_report_generation`'s real, already-committed logic without executing it for real.

`report_delivery_authorizations`, `phase14_operational_alerts`, `email_provider_events`,
`phase14_provider_attestations`: all confirmed empty (0 rows), re-queried fresh — Release C/D's
delivery and alert lifecycles have no existing row to reconcile; the risk there remains entirely in
first-use behaviour. `admin_profiles`: 1 row, `platform_admin` — unchanged, still the only account
able to reach any AAL2-gated RPC across the entire stack.

## 7. Preflight queries, backup, migration execution, deployment, and verification

### 7a. Preflight queries (read-only, immediately before any cloud action)

1. `select version, name from supabase_migrations.schema_migrations order by version;` — reconfirm
   34 records, newest `20260721150808`, unchanged from this document.
2. `select pg_get_functiondef('public.invalidate_phase14_authority_on_gate_change()'::regprocedure);`
   — reconfirm the live function still has the `where true` clauses (§3a).
3. Re-run §6's per-order classification query — real orders may have arrived or changed state
   between this document and execution; do not reuse this document's counts without re-checking.
4. `select * from public.phase14_security_gates;` — confirm gate state before any gated RPC is
   exercised for real.
5. `select secret_key, rotated_at from phase14_private.runtime_secrets;` (existence/rotation
   timestamp only, never `secret_value`) — confirm whether the two HMAC secrets are already
   provisioned before assuming §9's sequence starts from zero.

### 7b. Backup/PITR checkpoint

Not resolved by this document — Supabase PITR configuration/retention for `jvjxlphdyzerrhwcgkup` is
an account/plan-level setting this session's tools cannot confirm. **Owner-confirmation item**,
required before §8's freeze is activated.

### 7c. Migration execution procedure (for the eventual RC branch, not this cycle)

1. Confirm §3a's reconciliation is fully complete (both open items resolved by controller decision,
   git migration files aligned to the cloud ledger, fresh-replay-verified end to end) — this
   precedes and is independent of the steps below, and is **not yet true** as of this revision.
2. Confirm §7a's preflight queries match this document's assumptions; halt and re-plan on any
   mismatch.
3. Apply the 7 pending migrations from §3 in exact version order: `20260722143000`,
   `20260724150000` (A), `20260724160000` (B), `20260724170000` (C), `20260724180000` (C),
   `20260725090000` (C), `20260725150000` (D).
4. After each migration, validate that migration's own resulting schema/function definitions match
   intent (per §3a step 4's pattern) before proceeding to the next.
5. Do not proceed past any migration that errors; forward-only repair only
   (`22-release-and-rollback-runbook.md` §9), never edit an already-applied migration.

### 7d. Application deployment order

Stacked order per `22-release-and-rollback-runbook.md` §1 — but see §13 below for how the
integration branch itself is constructed; application deploys only after §7c's migrations are
confirmed applied.

### 7e. Smoke tests

`/score/api/health` and `/score/api/system/build-info` return the new deployment's exact commit;
each new/changed admin surface loads for a `platform_admin` session without a 500;
`phase14_security_gates` state re-read before any AAL2-gated action.

### 7f. Controlled Resend certification and 7g. Durable-worker verification

Unchanged in substance from Revision 1, sequenced strictly after §8's freeze is lifted and §9's
secrets are provisioned — see those sections; not restated here to avoid the earlier sequencing
error of treating certification as reachable before the freeze/secret sequence is defined.

## 8. Database/application cutover freeze — required, previously missing

**Migrations cannot be treated as behaviour-neutral while the currently-deployed application remains
live**, because at least one migration changes a function the live application actively calls in a
way that changes its atomicity: `record_payment_transition` (§4d) is redefined by Release B to
atomically create the durable fulfilment job as part of recording a payment transition, whereas
Production's current application calls the (pre-Release-B) version and then separately triggers
fulfilment as a second step. Applying that migration while the old application is still live and
actively processing payments creates a window where the old app's second, separate trigger step
could race against or duplicate the new atomic behaviour.

**A formal operational freeze is required for the cutover window, covering:**
- New assessment/order submission
- Manual payment confirmation
- Payment-status changes
- Manual report generation
- Backlog generation (Release A's own classifier/queue)
- Quality-review approval/rejection
- Delivery and redelivery
- Recipient correction
- Fulfilment-worker invocation (already effectively frozen — no cron currently targets any of
  Release B's functions, but this must remain explicitly true through the window, not assumed)
- Any inbound payment-automation or webhook event capable of changing an order's state (the Resend
  webhook is already disabled per §10; this extends the same posture to any other provider callback)

**During the freeze, only explicitly approved synthetic canary actions are permitted** — no other
order-affecting action of any kind, real or synthetic, proceeds without individual authorisation.

**Freeze governance (roles, not yet assigned to named individuals by this document):**
- **Activation**: the controller or the owner activates the freeze — not automatically triggered by
  any code or deployment event.
- **Evidence**: activation and release are each recorded as their own `audit_logs`/`order_events`
  entry (or equivalent durable record) with a timestamp and the authorising party, not left as an
  undocumented operational convention.
- **Canary authorisation**: any synthetic canary action during the freeze requires explicit,
  per-action authorisation from the controller or owner — a standing "canaries are fine" approval is
  not sufficient; each one is its own decision.
- **Release**: only the controller or owner releases the freeze, and only after §8's cutover sequence
  step 9 (all required paths exercised and passing) — never automatically once smoke tests pass.
- **Abort authority**: any party observing an unexpected order/payment/generation/delivery event
  during the freeze may halt the cutover immediately (see abort threshold below); resuming requires
  the same controller/owner authorisation as initial activation, not a unilateral decision to
  continue.

**Not built or activated this cycle**: a Production-level "maintenance mode" (e.g. an application-wide
read-only banner or a hard block on mutating routes) is a real, separate mechanism that could
strengthen this freeze, but is not built or activated in this RC PREPARATION cycle — it would itself
be a Production-facing change requiring its own review. This document records it as a **future
mechanism to design and return for review**, not something assumed to exist or silently added.

**Required future cutover sequence:**

1. Confirm `MK_EMAIL_PROVIDER_MODE` remains `disabled` and the Resend webhook remains disabled
   (§9 has not yet run).
2. Activate the operational freeze (owner/controller action — no order-affecting admin action
   proceeds until released).
3. Capture the backup/PITR checkpoint (§7b) or an approved equivalent.
4. Re-run §7a's preflight facts.
5. Apply only the 7 genuinely pending migrations (§7c) — §3a's reconciliation must already be done.
6. Validate each required schema/RPC definition (§7c step 4).
7. Deploy the integrated application immediately after migrations are confirmed applied — no gap
   where new schema exists but old application code is still live against it.
8. Confirm the exact build SHA is what was intended and run §7e's smoke tests.
9. Keep the freeze active until payment, generation, review, and delivery paths have each been
   exercised (read-only/dry-run first, per §6's required per-order review) and pass.
10. Release the freeze only by an explicit controller/owner decision — not automatically once smoke
    tests pass.

**Abort threshold**: any payment-status change, fulfilment-job creation, or delivery event observed
during the freeze window that was not initiated by this cutover sequence itself is treated as a
freeze violation — halt immediately, capture the event via `audit_logs`/`order_events`, and do not
proceed until the controller reviews it. This is distinct from and precedes
`22-release-and-rollback-runbook.md`'s own post-deployment rollback criteria, which govern the
period after the freeze is released.

## 9. Vercel plan/cron decision — owner gate, the four-state framework governs its consequence

Carried forward from `23-vercel-operational-inventory.md`, unchanged: `vercel.json` ships one cron
entry, `/score/api/internal/fulfilment-worker` at `0 3 * * *` (once daily); Release B's target is a
1-2 minute interval, understood (owner-attested, not independently verified) to exceed the current
plan tier. **This document does not change `vercel.json` or request a plan change.** The cron
decision is **not optional or indefinite** — §11 requires an explicit, named resolution (an approved
plan/cron change, or a documented manual-fulfilment operating model) before **PUBLIC LAUNCH GO**
specifically. A once-daily cron may be explicitly tolerated for controlled testing under **RC
MIGRATION/DEPLOYMENT GO** or **CLOUD CERTIFICATION GO**, but does not by itself satisfy the
operational requirement real customer traffic needs, and does not carry forward to PUBLIC LAUNCH GO
without its own explicit decision.

## 10. Paired HMAC secret-provisioning sequence — corrected

**Three distinct secrets, not two, and they must not be conflated:**

| Secret | Where it lives | Purpose |
|---|---|---|
| `RESEND_WEBHOOK_SECRET` | Vercel env var only | Resend/Svix's own webhook signature verification, checked entirely in application code (`src/lib/reports/email/resend-webhook.ts`) — confirms the HTTP request genuinely came from Resend. Already exists on Preview. |
| `PHASE14_PROVIDER_WEBHOOK_DB_HMAC_SECRET` | Vercel env var **and** `phase14_private.runtime_secrets` row with `secret_key = 'provider_webhook_db_hmac'` | A separate, database-level HMAC check (confirmed live in `0017`: `hmac(canonical_payload, secret_value, 'sha256')` compared against a submitted signature) — defense-in-depth so a compromised app-layer path alone cannot forge a `webhook`-sourced attestation. |
| `PHASE14_PROVIDER_LOOKUP_DB_HMAC_SECRET` | Vercel env var **and** `phase14_private.runtime_secrets` row with `secret_key = 'provider_lookup_db_hmac'` | The same DB-level HMAC mechanism, for the separate active-lookup/reconciliation attestation path (`attestation_source = 'provider_lookup'`), distinct from the passive webhook path. |

**The two Phase 14 HMAC values must be independently generated, not the same value reused** — they
authenticate two structurally different attestation sources; sharing a value would let a compromise
of one path forge attestations on the other. Confirmed storage target this session by reading
`0017`'s own schema: `phase14_private.runtime_secrets` (schema access revoked from `public`, `anon`,
`authenticated`, and even `service_role` — only reachable via the `SECURITY DEFINER` RPC), **not**
Supabase's built-in `vault.decrypted_secrets` mechanism, which this application does not use for
this purpose (Revision 1's error).

**Corrected sequence — four stages, not two, matching the controller's exact specification:**

**Stage 1 — initial deployed state:**
- Integrated RC application deployed (post §7c/§7d).
- `MK_EMAIL_PROVIDER_MODE=disabled`.
- Resend webhook disabled.
- §8's operational freeze active.

**Stage 2 — secret provisioning (owner-executed; no value ever generated, entered, or seen by any
tool this session):**
- Confirm or provision the Production `RESEND_WEBHOOK_SECRET`, matching the intended Resend endpoint
  (this secret may already exist from earlier cycles — confirm, do not assume it needs regenerating).
- Generate two independent Phase 14 HMAC values, out-of-band, via the existing admin browser
  workflow (`/score/admin/phase14-activation`).
- Add each value to its own Production Vercel environment variable
  (`PHASE14_PROVIDER_WEBHOOK_DB_HMAC_SECRET`, `PHASE14_PROVIDER_LOOKUP_DB_HMAC_SECRET`).
- Submit each matching value through the AAL2-gated `platform_admin`-only `set_phase14_runtime_secret`
  RPC, via the same admin UI, with an audited reason.
- Retain only fingerprints (the RPC's own `sha256` digest return value) and rotation timestamps as
  evidence — never a secret value, in logs, documentation, chat, or a screenshot.

**Stage 3 — disabled-mode redeployment (required, previously omitted):**
- Redeploy the **exact same RC commit** after the environment-variable changes — Vercel does not
  hot-reload environment variables into an already-running deployment, and no code should change at
  this step.
- Verify the resulting deployment is `READY` and its commit SHA is unchanged from what was intended.
- Verify both database-side secrets are present via `select secret_key, rotated_at from
  phase14_private.runtime_secrets;` (existence and rotation time only).
- `MK_EMAIL_PROVIDER_MODE` remains `disabled` through this entire stage.

**Stage 4 — controlled test activation:**
- Enable the intended Resend webhook (owner action).
- Set `MK_EMAIL_PROVIDER_MODE=test`.
- Redeploy the same exact commit again (the mode change is an env-var change like Stage 3's).
- Use exactly one explicitly authorised synthetic canary order (per §8's canary-authorisation
  governance) and only the designated MK test mailbox — never a real customer address.
- Certify messages 3 and 4 (payment-confirmed, report-ready), the two not yet certified per
  `09-release-evidence.md`.
- Verify signed webhook HTTP 200, database attestation, and correlation between the webhook event
  and the canary order.
- Verify no unrelated order or worker job became eligible for any action as a side effect of this
  test.

**Post-certification resting state (unless PUBLIC LAUNCH GO has already been separately granted):**
- Set `MK_EMAIL_PROVIDER_MODE` back to `disabled`.
- Redeploy the same approved commit.
- Disable the Resend webhook again.
- Verify the deployment is `READY`.
- Keep the operational freeze active, or transition to a separately approved limited-operating
  state — never left implicitly "live" between certification and an explicit PUBLIC LAUNCH GO.

**`MK_EMAIL_PROVIDER_MODE` is never set to `live` during RC preparation or initial cloud
certification** — only `disabled` (Stages 1-3, post-certification) or `test` (Stage 4).

## 11. Four-state decision framework

Four separate, independently-gated states — a GO at one level never implies a GO at the next.
**Unreconciled migration history is not, by itself, a reason to block RC PREPARATION — the
reconciliation work itself is authorised RC PREPARATION activity and happens on this branch (§3a).**

### RC PREPARATION GO

**Granted.** Permits only:
- Creating the RC branch (done — `release-candidate/v7-a-d-integration`, from `f9cf016…`).
- Creating a draft RC PR against `main` (§13).
- Reconciling source-controlled migration history (§3a — in progress, two items open).
- Adding tests and release documentation.
- CI and local disposable-database verification (§13 — reports exactly what could and could not run
  given §3a's open replay failure).

Does **not** permit any cloud action, any Vercel/Resend change, any Supabase branch or migration
application, or any worker trigger.

### RC MIGRATION/DEPLOYMENT GO

**Not granted. Requires a later, separate controller decision**, after:
- Migration-history reconciliation is fully complete (§3a's two open items resolved).
- A fresh replay passes end to end, with no failure.
- All CI is green on the RC branch's exact final head.
- The exact 7 pending migrations (§3) are reconfirmed against the cloud ledger at decision time, not
  reused from this document.
- PITR/backup availability is confirmed by the owner (§7b).
- The 18-order 2/13/3 action register (§6, `docs/safe-launch/26-existing-order-action-register.md`)
  is reviewed and every order has a recorded intended action.
- The freeze mechanism and cutover runbook (§8) are accepted by the controller/owner.
- The exact RC commit intended for deployment is explicitly approved.

### CLOUD CERTIFICATION GO

**Not granted. Requires a later, separate controller decision**, after RC MIGRATION/DEPLOYMENT GO
has been exercised and:
- The 7 migrations are applied to `jvjxlphdyzerrhwcgkup`.
- The exact RC application is deployed.
- Schema and application smoke tests (§7e) pass.
- The operational freeze (§8) remains active throughout.
- All three secret mechanisms (§10) are correctly provisioned and verified.
- Controlled email, webhook, and worker tests are explicitly authorised (not assumed from a prior
  GO) and confined to the designated test mailbox and canary order.

### PUBLIC LAUNCH GO

**Not granted. Requires a later, separate controller decision**, after CLOUD CERTIFICATION GO has
been exercised and:
- Cloud certification has passed.
- `MK_EMAIL_PROVIDER_MODE` is set to `live` (the only state in this whole framework where that
  happens).
- The worker cadence (an approved Vercel plan/cron change) or a documented manual-fulfilment
  operating model (named owner, monitoring, response time, coverage) is approved — the cron decision
  is **not optional or indefinite**; one of the two must be explicitly chosen, not left as a
  standing gap.
- Monitoring and alert ownership (Release D's own operational-alerts surface) are active with a
  named owner.
- The 18-order backlog treatment (§6) is approved in full, not just recorded.
- The operational freeze (§8) is formally released by explicit controller/owner decision.

## 12. Current decision status

**RC PREPARATION: GO (exercised this cycle). RC MIGRATION/DEPLOYMENT: NO-GO. CLOUD CERTIFICATION:
NO-GO. PUBLIC LAUNCH: NO-GO.**

RC MIGRATION/DEPLOYMENT remains NO-GO specifically because:
- §3a's migration-history reconciliation surfaced one confirmed, unresolved conflict
  (`report_templates` duplication risk between the deferred `20260709033522` and the already-committed
  `0011`) and one confirmed, unresolved replay failure (`20260720200442`'s hardcoded
  `methodology_version_id` foreign-key violation on a fresh database) — both discovered by actually
  attempting the reconciliation and running a real fresh replay, not assumed. Neither was silently
  patched.
- A fresh migration replay therefore does not currently pass end to end (§13).
- The 18-order action register (§6) records classification but not yet an approved intended action
  per order.
- PITR/backup availability remains unconfirmed by the owner.

None of this affects Releases A-D's own acceptance, which stands, or blocks RC PREPARATION work
itself, which continues on this branch.

## 13. Integration-branch construction

Branch `release-candidate/v7-a-d-integration` created directly from the exact accepted Release D
head, `f9cf016a67eeb342b32db81df09f0de90f6f56a5` — the clean linear ancestry confirmed in §2 means no
merge of V7/A/B/C/D was needed to assemble it; that history is already there. The branch receives
**only new, controller-reviewed RC reconciliation/activation commits** — §3a's migration-history
reconciliation (this revision's own commits), the anonymised action-register template
(`26-existing-order-action-register.md`), this document's own revisions, and (in a future cycle, once
authorised) any cutover-freeze tooling or secret-activation UI changes. **PRs #37, #41, #42, #43,
#44 are not merged or cherry-picked into this branch** — they remain immutable review/evidence
units, exactly as reviewed and accepted; this branch's history already contains their content by
direct descent, which is why no merge/cherry-pick step exists. A draft pull request against `main`
is opened once the first reconciliation commit is pushed (§13), explicitly stating RC PREPARATION
ONLY, NO CLOUD ACTION AUTHORISED, DO NOT MERGE, RC MIGRATION/DEPLOYMENT remains NO-GO, and Production
remains unchanged. **The RC PR is not merged this cycle or any cycle before an explicit PUBLIC
LAUNCH GO-adjacent decision authorises it** — merging is a separate, later, explicit controller
action, not a natural conclusion of RC PREPARATION passing CI.

## Cross-references

- Release D acceptance: PR #44, `09-release-evidence.md` "Controller hardening pass"
- V7 commercial-report approval: PR #37, PR #39 (merged within #37's branch)
- Source/cloud migration-history reconciliation, full evidence:
  `25-source-cloud-migration-reconciliation.md`
- 18-order action-register template: `26-existing-order-action-register.md`
- Cloud-schema reconciliation (source of the original 18-order/migration-ledger findings, now
  superseded in detail by this document's own fresh re-verification):
  `19-release-c-cloud-schema-reconciliation.md`
- Go-live checklist: `21-go-live-checklist.md`
- Release and rollback runbook: `22-release-and-rollback-runbook.md`
- Vercel operational inventory: `23-vercel-operational-inventory.md`
- Full evidence pack: `09-release-evidence.md`
