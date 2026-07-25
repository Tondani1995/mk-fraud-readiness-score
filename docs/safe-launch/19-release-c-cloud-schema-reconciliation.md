# Release C Cloud-Schema Reconciliation — Read-Only Audit and Decision Memo

Written in response to a controller-verified finding: the deployed `release-c/email-secure-delivery`
Preview (PR #43, code head `dc881623313ca54df041e759a154345688b27d9f`, all 6 required GitHub
workflows green) calls the extended 3-argument `set_phase14_runtime_secret` RPC, but the live
Supabase project (`jvjxlphdyzerrhwcgkup`) only exposes the original 2-argument version. This
document is the required read-only reconciliation: what is actually on the live database, migration
by migration, versus what the code assumes — and a decision memo on how to safely close the gap.

**No write action was taken to produce this document.** Every finding below comes from read-only
`information_schema`/`pg_catalog` queries and `list_migrations` against `jvjxlphdyzerrhwcgkup`, and
from reading the migration files already committed to this branch. No migration was applied, no
function was recreated, no secret was inserted, no order was modified, and the Supabase SQL editor
was not used.

## 0. Headline finding: it is not just the runtime-secret migration

The live migration ledger (`list_migrations`) stops at `20260721150808_fix_complete_manual_report_generation_supersede_order`.
None of the following are present, in ledger order:

- `20260722143000_checkpoint_e_phase1_ai_attempt_binding`
- `20260724150000_release_a_backlog_reconciliation`
- `20260724160000_release_b_durable_fulfilment`
- `20260724170000_release_c_email_secure_delivery`
- `20260724180000_release_c_closure_delivery_exceptions`
- `20260725090000_release_c_runtime_secret_admin_provisioning`

**Releases A, B, and C are all unapplied to the live database, not only Release C's three
migrations.** This changes the shape of the problem: it is not "Release C's cloud schema is one
migration cycle behind," it is "the live database reflects pre-Release-A state, and every release
built since has been developed, tested (locally, via disposable-Postgres replay), and CI-verified
against a schema that has never existed anywhere the running application can reach." This is
consistent with, and extends, the standing item already carried in `09-release-evidence.md` and
every release's own evidence section: *"Supabase Cloud migration execution: no Supabase Cloud
environment has applied this migration, deferred to the integrated release-candidate cloud branch
planned after Releases A-D."* That item was correctly flagged as open throughout; this audit is the
first time its concrete, present-day impact has been measured against the live schema object by
object.

This also resolves an apparent puzzle: real Resend sends worked this cycle (see PR #43 / commit
`dc88162`) for `customer_order_confirmation` and `admin_new_order_notification`. Those two message
types run through `recordPhase1OrderNotifications()` → `sendEmail()`, against `email_events`
columns (`provider`, `provider_message_id`, `notification_type`, `dedupe_key`, `provider_mode`)
that were all added by migrations already in the live ledger (`0012`, `0017`, `0023`) — not by
Release C. They needed no unapplied migration to work, which is why they did.

## 1. Per-migration comparison

### 1.1 `20260724170000_release_c_email_secure_delivery`

| # | Dimension | Expected (from migration source) | Live `jvjxlphdyzerrhwcgkup` | Verdict |
|---|---|---|---|---|
| 1 | Tables | `public.customer_report_access_tokens` (new) | Absent — `information_schema.tables` query returns no row for this name | **Missing** |
| 2 | Columns | `report_delivery_authorizations.next_attempt_at`, `.max_attempts`, `.retry_count` (new); `.security_gate_version` relaxed to nullable | None of the three new columns exist; `security_gate_version` is still `is_nullable = 'NO'` | **Missing** |
| 3 | Constraints/indexes | Relaxed `security_gate_version` check; rebuilt `report_delivery_authorizations_status_check` (adds `retry_scheduled`, keeps existing values); new indexes/RLS on `customer_report_access_tokens` | Cannot exist — the constraint targets a column/table state that isn't present | **Missing** |
| 4 | RPCs absent | `claim_next_delivery`, `mark_delivery_dispatch_started`, `finalize_delivery`, `fail_delivery`, `retry_delivery`, `revoke_customer_report_access_token`, `issue_customer_report_access_token`, `reissue_customer_report_access_token` | `pg_proc` query for all of these (any signature) returns **zero rows** for every one | **Missing** |
| 5 | RPCs with an older signature/body | `approve_quality_review(uuid, text)` redefined here to atomically release the report and create the delivery authorization | The function doesn't exist under *any* signature on live — it was originally introduced by Release B's own migration (`20260724160000`), which is also unapplied. Not "older" — **absent entirely** | **Missing** |
| 6 | Grants | `grant execute on function ... to authenticated` for each new/redefined RPC above | Moot — the functions don't exist to have grants | **N/A** |
| 7 | Policies/security-gate dependencies | `enable row level security` on `customer_report_access_tokens`; relies on the already-live Phase 14 `phase14_security_gates`/`phase14_feature_policies` tables (those *are* live, from `0017`) | Table absent, so no policy exists; the Phase 14 gate/policy tables it would depend on are present and unaffected | **Partially N/A** (dependency target exists; dependent object doesn't) |
| 8 | Application routes depending on missing objects | `/score/api/admin/orders/[orderReference]/delivery/*` (retry/revoke/reissue-token), `/score/api/admin/orders/[orderReference]/fulfilment/approve`, `/score/report/access/[token]`, the fulfilment-worker route's delivery-claim phase | Every one of these routes would fail at the RPC-call step in production traffic — the route code deployed to Preview matches the *intended* schema, not the live one | **At risk** |
| 9 | What worked against pre-existing infra | `customer_order_confirmation` / `admin_new_order_notification` sends (see §0) | — | Confirmed working |
| 10 | What cannot work without this migration | Any real report-delivery authorization creation, customer secure-link issuance/access, delivery retry/revoke, `payment_confirmed`/`report_ready` message types (the latter is created inside `finalize_delivery`) | — | Confirmed blocked |

### 1.2 `20260724180000_release_c_closure_delivery_exceptions`

| # | Dimension | Expected | Live | Verdict |
|---|---|---|---|---|
| 1 | Tables | None new | — | N/A |
| 2 | Columns | None new (redefines functions only) | — | N/A |
| 3 | Constraints/indexes | None new | — | N/A |
| 4 | RPCs absent | `correct_delivery_recipient_and_queue` | `pg_proc` query returns zero rows | **Missing** |
| 5 | RPCs with an older body | `apply_email_provider_event_atomic(text,text,text,text,timestamptz,text,jsonb)` — this migration's version adds bounce/complaint owned-exception handling and default resend suppression; `approve_quality_review(uuid,text)` — adds missing-recipient exception handling; `reissue_customer_report_access_token` — adds the `p_override_suppression` bounce/complaint-block-bypass parameter | The live database has **two** overloads of `apply_email_provider_event_atomic`: a 7-arg one (`...,text,jsonb`, matching migration `0031`'s signature, live and correct as far as `0031` goes) and an unrelated older 6-arg one with no `payload_fingerprint` param. Neither carries this migration's bounce/complaint-suppression body — confirmed by reading the live function's actual source via `pg_get_functiondef`, not inferred from its signature. `approve_quality_review` and `reissue_customer_report_access_token` are absent entirely (see §1.1) | **Older body / missing** |
| 6 | Grants | `grant execute ... to authenticated` for `correct_delivery_recipient_and_queue` | Moot — function absent | **N/A** |
| 7 | Policies/security-gate dependencies | None new | — | N/A |
| 8 | Application routes depending on missing objects | `/score/api/admin/orders/[orderReference]/delivery/correct-recipient`, `/score/api/webhooks/resend` (the transient/permanent-bounce classification path calls into the redefined `apply_email_provider_event_atomic`) | — | **At risk** |
| 9 | What worked against pre-existing infra | Nothing in this migration was exercised this cycle (no bounce/complaint/missing-recipient scenario was tested) | — | N/A |
| 10 | What cannot work without this migration | Bounce/complaint owned-exception handling with resend suppression, missing-recipient admin correction flow | — | Confirmed blocked |

### 1.3 `20260725090000_release_c_runtime_secret_admin_provisioning`

| # | Dimension | Expected | Live | Verdict |
|---|---|---|---|---|
| 1 | Tables | None new | — | N/A |
| 2 | Columns | None new | — | N/A |
| 3 | Constraints/indexes | None new | — | N/A |
| 4 | RPCs absent | The 3-argument `set_phase14_runtime_secret(text,text,text)` overload | `pg_proc` confirms only `set_phase14_runtime_secret(text,text)` exists — the 2-arg original from `0017` | **Missing** (this is the controller's original finding, independently reconfirmed) |
| 5 | RPCs with an older signature | Same row: the live 2-arg version has no `p_reason` parameter and cannot store a reason in its audit entry | — | **Older signature confirmed** |
| 6 | Grants | `authenticated` should have `EXECUTE` on the 3-arg overload | `information_schema.routine_privileges` shows `authenticated` has `EXECUTE` on the **2-arg** version only (`postgres` also, as owner) | **Grant target doesn't exist** |
| 7 | Policies/security-gate dependencies | None beyond `phase14_require_actor`'s existing platform_admin/AAL2 check (already live, from `0017`, unaffected) | Present and correct for the 2-arg function | N/A |
| 8 | Application routes depending on missing objects | `POST /score/api/admin/phase14-activation/runtime-secret` (this cycle's new route) | This route calls `db.rpc('set_phase14_runtime_secret', { p_secret_key, p_secret_value, p_reason })`. PostgREST resolves RPC calls by matching the named JSON parameters against a function's parameter list; since no live function has a `p_reason` parameter, this call fails at the schema level (PostgREST would report the function not found for that argument set) | **Confirmed broken against live cloud** — this is the exact incompatibility the controller flagged |
| 9 | What worked against pre-existing infra | The admin UI renders (it's pure React, no RPC call until submission) and the 2-arg RPC itself is fully functional for a raw 2-arg caller (per `scripts/phase14-delivery-reconciliation-tests.mjs`'s local-replay proof) | — | Confirmed |
| 10 | What cannot work without this migration | Submitting a value through the new admin control — it would return a schema error, not silently misbehave, but it also would not succeed | — | Confirmed blocked |

## 2. Release decision memo

### Option A — Isolated Supabase branch for Release C external-provider certification

**Setup required:** Create a Supabase branch (Database → Branching) off `main` at its current
state, or off a specific commit. Supabase branching copies schema and, depending on plan/branch
type, can be configured to seed data or start empty. **Cost/plan implications:** Supabase branching
is a paid-plan feature (Pro tier and above) with per-branch compute cost while the branch is running
— confirm current plan tier before proceeding; this alone means Option A cannot be started without
owner approval, both for the plan-tier question and the recurring cost. Not created or priced
against the actual account in this audit — no branch was created.

**Vercel Preview variable changes:** `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (and
any other Supabase-scoped Preview variables) would need to point at the new branch's connection
details instead of the shared `main` project, scoped to Preview on `release-c/email-secure-delivery`
only — this is exactly the kind of change this programme's standing rule requires extreme care with,
since a misconfigured scope could accidentally point Production traffic at a throwaway branch.

**Synthetic test data:** Yes, must be recreated. A fresh branch has none of the two orders created
this cycle (`MKORD-2026-YXL7D5UD`, `MKORD-2026-960J4HDD`) or their `email_events` rows — those exist
only in the shared `main` project. This is not a loss (they were synthetic and disposable by design)
but it does mean the whole controlled-send cycle (assessment → order → two real sends) would need to
run again from scratch against the branch.

**Migration application sequence:** Apply all pending migrations, in ledger order, starting from
`20260722143000_checkpoint_e_phase1_ai_attempt_binding` through `20260725090000_release_c_runtime_secret_admin_provisioning`
(i.e. Releases A, B, and C together — Release C's own migrations depend on tables/columns Release B
adds, e.g. `manual_report_generation_attempts`'s quality-review columns feed `approve_quality_review`,
which Release C redefines again). Applying only Release C's three migrations on a branch cloned from
`main`'s current (pre-Release-A) state would likely fail or leave the schema in a state no code path
was ever tested against.

**Cleanup:** Delete the branch once certification evidence is captured (screenshots/DB exports of
the attestation rows, webhook logs, provider message IDs) and documented in `09-release-evidence.md`.
Branches are billed while they exist, so cleanup isn't optional housekeeping — it's a cost control.

**Operational advantages:** Zero risk to the shared `main` database or its 18 `payment_received`
orders; a genuinely faithful test of the full migration sequence against a clean target before ever
touching shared infrastructure; the Preview app's actual runtime behaviour (not a local
embedded-postgres approximation) gets exercised end to end, including the real webhook round-trip
this whole verification cycle exists to prove.

**Risks:** Cost while the branch runs; the Vercel env-var rewiring is itself a change that needs
care and its own rollback plan (revert the Preview variables back to `main` afterward, and confirm
they're reverted — don't leave Preview permanently pointed at a branch slated for deletion); a
second, parallel schema now exists that must be kept mentally distinct from `main` for the duration;
does not, by itself, get Release A/B/C's migrations onto `main` — that's still Option B or C's job
whenever it happens.

### Option B — Defer to an integrated release-candidate migration

**What Release C evidence remains valid:** Everything already independently observed and recorded
stays valid as evidence of *code correctness*, not of *production readiness*: the 21-check
order-detail delivery-truth suite, the Release A/B/C static suites, the new runtime-secret
provisioning suite (all of which run against disposable local Postgres with every migration
replayed, not against `jvjxlphdyzerrhwcgkup`), all 6 GitHub workflows green on `dc88162`, and —
critically — the two real Resend sends and one owner-confirmed mailbox receipt this cycle, since
those didn't depend on any unapplied migration (§0).

**What remains uncertified:** Everything gated on the missing migrations: signed webhook
verification against the real Resend account (the actual point of this whole verification cycle),
`payment_confirmed` and `report_ready` message types, quality-review approval, real customer
secure-link issuance and access, bounce/complaint handling, missing-recipient correction. None of
this can be certified in Preview against the current shared database, no matter how the runtime
secrets are handled.

**How the integrated certification would be performed:** Once Releases A–D are merged into one
release-candidate branch, apply the complete accumulated migration set to `main` in one reviewed,
approved cloud change (see Option C's preflight/rollback requirements below — the *mechanics* are
the same whether it happens now or later; Option B is about *when*, not *how*), then run this exact
controlled-Resend-send-plus-webhook cycle again against the now-current shared database, plus the
deferred bounce/complaint and missing-recipient scenarios this cycle didn't reach.

**Whether Release D can safely proceed as code-only work before cloud certification:** Yes, with
the same caveat that has applied to every release so far: Release D's own migrations (if any) can be
written, and its TypeScript/RPC-calling code can be built and CI-verified against disposable local
Postgres replay, exactly as Releases A–C were. It cannot be *cloud-certified* before Release C is,
for the same structural reason Release C can't be cloud-certified before Release B — later
migrations build on earlier ones. Building code-only is safe; claiming any cloud-level verification
for Release D before this reconciliation is resolved would repeat exactly the mistake this audit
exists to prevent.

### Option C — Apply Release C's migrations to shared `main` now (assessed, not recommended)

**Blast radius:** Not scoped to Release C alone — to be schema-consistent, Releases A and B's
migrations would need to apply first (§0), meaning this option is really "apply six pending
migrations to the shared database Production also uses," not three. Every table/function each of
them touches is listed in §1 above; `manual_report_generation_attempts`, `report_delivery_authorizations`,
and every RPC listed as "missing" would change state simultaneously.

**Compatibility with Production code currently on `main`:** Not independently confirmed in this
audit — this would require knowing exactly which commit is deployed to the Production Vercel
project, which no tool available in this session can read. What can be said from the evidence
gathered: Production's code, if built against the same migration history as this repo's `main`
branch at whatever commit predates Release A, is very likely compatible with the *current* live
schema (that's presumably why nothing is broken today) precisely because it was built against it.
Applying six additive migrations should not, on their own additive-only design (every migration
this session reviewed uses `add column if not exists`, `create table`, `add constraint` — no drops
or renames of anything Production would still be reading), break Production's *reads*. But
`record_payment_transition`'s Release B redefinition changes its *behaviour* (queues a fulfilment
job) while keeping its signature — Production's payment webhook would start calling the new body
immediately upon migration, whether or not Production's own code has anything ready to process that
new queue. This is exactly the kind of behavioural-change-under-an-unchanged-signature risk that
`information_schema` alone cannot surface, which is why §1.2 dug into function bodies rather than
just signatures.

**Rollback feasibility:** Column additions and new tables are trivially reversible (`drop column`,
`drop table`). Function redefinitions are reversible in principle (restore the prior `CREATE OR
REPLACE` body) but only if the prior body is captured *before* applying — this audit has now done
exactly that for `record_payment_transition` (§1 above) and could do the same for any other
about-to-be-redefined function as a pre-migration safety step, if this option were ever chosen.

**Lock and downtime risk:** The `alter table ... add column ... default ...` calls with a literal
default (e.g. `max_attempts integer not null default 5`) take a brief `ACCESS EXCLUSIVE` lock while
rewriting the table on older Postgres versions; on modern Postgres (12+, which Supabase runs) a
constant default does *not* require a table rewrite, so this is low-risk in practice, but a
migration window with low traffic is still the safer default assumption, not something to skip
checking against the actual Postgres version at execution time.

**Effect on the 18 existing `payment_received` orders:** Confirmed via read-only query: 18 orders in
`payment_received`, 5 in `awaiting_payment`. None of the reviewed migrations modify existing order
rows or their `status` values. The risk is prospective, not retroactive: the *next* payment
transition or quality-review action against any of these 18 orders, after migration, would run
through the new Release B/C RPC bodies (durable-fulfilment job queuing, atomic delivery-authorization
creation) for the first time on real, non-synthetic orders — which is precisely the scenario this
whole verification programme has been built to de-risk before it happens for real.

**Whether older deployed code remains compatible:** Additive schema changes, yes, for reads.
Function-body behaviour changes under unchanged signatures (as above), not guaranteed — this is the
single biggest unresolved question standing between "assessed" and "recommended," and it isn't
answerable from this database alone; it requires knowing what Production actually runs.

**Exact preflight and rollback requirements, if this were ever approved:** (1) confirm exactly what
commit/branch is deployed to Production and diff it against what each pending migration assumes;
(2) capture `pg_get_functiondef` for every function about to be redefined (this audit has already
done so for `record_payment_transition`; the same should be done for every other listed function
immediately before migration, not from this document, since more time will have passed by then);
(3) take a full logical backup or point-in-time-recovery checkpoint immediately before migrating;
(4) apply during a confirmed low-traffic window; (5) apply Releases A, B, then C in that exact
order, each as its own reviewed step, not as one combined operation; (6) re-run this document's
§1 comparison immediately after, confirming every "Missing" row above now reads "Present" before
declaring success; (7) have the prior function bodies from step 2 ready to restore via a new,
forward-only migration (never an edit to an already-applied one) if anything regresses.

This document does not recommend Option C. It is assessed here, as required, and is not to be
executed without explicit owner approval — Option C would be a Production database change (per the
explicit safety boundary above: Preview and Production share `main`), and no migration was applied
in the course of writing this document.

## 3. What this means for PR #43 right now

- The runtime-secret provisioning capability (migration + route + admin UI + tests, commits
  `5fa9653`/`7b1dfa7`) is implemented and CI-verified against disposable local Postgres. It is
  **not operational against the live database** until the cloud-schema gap above is closed by one
  of the options in §2 — owner secret entry must not be attempted before then, since the deployed
  route would simply fail against the live 2-arg RPC (§1.3, row 8).
- Real Resend acceptance and delivery, and one owner-confirmed mailbox receipt, remain valid
  evidence for messages 1 and 2 (§0) — that part of the cycle is genuinely certified.
- Signed webhook ingestion, and messages 3 and 4, remain uncertified, and cannot become certified
  under the current cloud schema regardless of secret provisioning.
- Production status remains `NOT READY FOR PRODUCTION`.

## Cross-references

- Release C evidence pack: `09-release-evidence.md`
- Release C owner-executed verification runbook: `18-controlled-resend-preview-verification.md`
- PR #43: `feat(release-c): real transactional email and secure customer report delivery`, base
  `release-b/durable-fulfilment` (stacked)
