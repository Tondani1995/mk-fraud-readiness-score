# RC1 Production-Change Runbook

**Status:** RC1D APPLICATION FREEZE AND ROUTE FOUNDATION: **ACCEPTED**; RC1D OLD-SCHEMA, REPLAY
AND CHECKSUM EVIDENCE: **ACCEPTED**; RC1D CANARY STRICT-STOP DECISION: **ACCEPTED**; RC1D
BOOTSTRAP AND CONTROL PLANE: **CORRECTIONS REQUIRED**; RC1E CONTROL-PLANE CORRECTION:
**CODE COMPLETE — CONTROLLER REVIEW REQUIRED**; RC1 OPERATIONAL READINESS: **NO-GO**;
RC MIGRATION/DEPLOYMENT: **NO-GO**; CLOUD CERTIFICATION: **NO-GO**; PUBLIC LAUNCH: **NO-GO**;
**DO NOT MERGE**.

**Accepted RC1C head:** `5b518d16f42436c608f2c6fb4422482d6b72444d`.

This is an executable runbook for a future, separately authorised Production-change event. It is
not authorisation to execute. Codex has no authority to waive, reinterpret or continue past a
failed gate. No step below may begin until its owner/controller approval and evidence requirement
are satisfied.

## Authority and operating rules

- Change owner and freeze activator: **Tondani Netili**.
- Synthetic-canary approver: **Tondani Netili**.
- Freeze-release authority: **Tondani Netili**.
- Technical executor: **Codex acting only under this approved runbook**.
- Forward-repair business owner: **Tondani Netili**.
- Forward-repair technical executor: **Codex only after explicit owner/controller approval**.
- Production and the cloud migration ledger are unchanged by this preparation commit.
- No customer-identifying data may appear in console output, committed evidence, screenshots or git.
- The future cutover allowlist contains the freeze bootstrap followed by the seven accepted
  behaviour migrations listed in §5. The seven accepted payloads remain byte-identical.

Each step below records: actor, exact action, expected result, retained evidence, stop condition and
whether it changes cloud state.

## 1. Preconditions

**Actor:** Tondani Netili, then Codex.

**Exact action:** Confirm the PR is open, draft and DO NOT MERGE; confirm the accepted preparation
SHA; confirm all six established CI workflows are green at that SHA; confirm the eight-file allowlist;
confirm this runbook, the freeze plan, the manual operating model, the anonymised 18-order register,
the abort matrix and the evidence requirements are the versions approved for the event.

**Expected result:** The controller records a dated GO to begin only the preflight sequence, not a
GO to apply migrations.

**Evidence retained:** PR URL, exact SHA, six workflow links/results, signed controller approval,
runbook version and eight-file allowlist.

**Stop condition:** Any SHA mismatch, non-green workflow, closed/non-draft PR, missing approval or
unexpected file in the allowlist.

**Cloud state:** No.

## 2. Backup/PITR evidence

**Actor:** Tondani Netili from the Supabase dashboard; Codex records only the supplied evidence.

**Exact action:** Record the supplied owner decision: Supabase organisation owner and restoration
authority are Tondani Netili; permission to initiate restoration is confirmed; scheduled physical
backups are active; PITR is disabled; PITR and compute upgrade are not approved; and the backup gate
is a **CONDITIONAL PASS**. The latest evidenced scheduled physical backup is
**2026-07-27 01:03:57 UTC**. At the eventual cutover, use that scheduled-backup class as fallback,
create a fresh logical database backup only after the technical freeze is active and successful
final preflight and immediately before migration 1, and create a restricted safeguard of critical
Storage objects including `generated-reports` and `payment-proofs`. Retain the logical-backup
timestamp/checksum and aggregate bucket object counts/size totals; keep protected recovery artifacts
outside git.

Do not enable PITR, upgrade compute, purchase an add-on, create the logical backup, copy Storage
objects or restore anything during RC preparation.

**Expected result:** The conditional backup gate is recorded, with the eventual fallback backup,
logical-backup timing and restricted Storage safeguard required as cutover evidence.

**Evidence retained:** Supplied owner decision, latest scheduled-backup identifier/timestamp when
cutover begins, logical-backup checksum/timestamp after final preflight, restricted Storage-safeguard
manifest/checksum, backup decision and restoration-authority name. Keep all evidence non-PII.

**Stop condition:** The scheduled fallback is unavailable, the logical backup is not created at the
required point, the Storage safeguard is incomplete, or any backup evidence is stale, contradictory
or unavailable. No migration progresses on a conditional pass without those cutover artefacts.

**Cloud state:** No, except any separately approved backup operation; Codex does not initiate one.

## 3. Operational-freeze activation

**Actor:** Tondani Netili activates the freeze; Codex verifies evidence.

**Exact action:** Set `MK_RC1_OPERATION_FREEZE_MODE=frozen`, redeploy the exact approved SHA, prove
all application mutation probes stop, then invoke
`POST /score/api/admin/rc1-freeze/activate` as the authenticated AAL2 platform admin with a
meaningful reason. Verify `GET /score/api/admin/rc1-freeze/status` reports `FROZEN`, the expected
positive epoch and no canary. Apply the complete mechanism from
`28-rc1-operational-freeze-and-canary-plan.md`.
Make public assessment/order intake unavailable; suspend assessment submission, order creation,
payment confirmation/status changes, manual and backlog generation, quality review, delivery,
redelivery, recipient correction, payment webhooks, Resend webhook processing and fulfilment workers.
Keep provider mode disabled. Do not authorize any canary until document 33 has a separately approved
transactional implementation.

**Expected result:** Every listed mutation surface is unavailable or fail-closed, and the freeze is
observable through the approved evidence checks.

**Evidence retained:** Freeze activation timestamp, owner approval, route/RPC gate results, provider
mode-disabled evidence, worker-disabled evidence and a non-PII health check.

**Stop condition:** Any mutation surface remains available, any webhook/worker can mutate state, or
the freeze cannot be evidenced. Administrator discipline alone is not sufficient.

**Cloud state:** Yes; operational behaviour changes. Do not proceed without owner confirmation.

## 4. Final read-only preflight

**Actor:** Codex, under Tondani Netili's approval.

**Exact action:** Run `npm run rc1:dry-evaluate-live-boundary` only after supplying all nine
controller-approved `RC1_*` variables listed below. The launcher validates every variable before
connection, sets libpq `default_transaction_read_only=on`, compares the SHA-256 fingerprint of
`host=<lowercase-host>|port=<resolved-port>|database=<database>` with the separately approved target
fingerprint, and then runs `scripts/rc1-production-preflight.sql`. It emits only result lines ending
in `PASS`, `STOP` or `NOT_DATABASE_VISIBLE`.

Required variables:

- `RC1_READ_ONLY_DATABASE_URL`
- `RC1_APPROVED_TARGET_FINGERPRINT`
- `RC1_CONNECTION_MODE=read-only`
- `RC1_APPROVED_RPC_BASELINE_JSON`
- `RC1_EXPECTED_BASELINE_COUNTS_JSON`
- `RC1_APPROVED_PROTECTED_STATE_FINGERPRINT`
- `RC1_APPROVED_EMAIL_STATUS_COUNTS_JSON`
- `RC1_APPROVED_EMAIL_STATUS_FINGERPRINT`
- `RC1_EXPECTED_APPLICATION_FREEZE_MODE=frozen`

Compare the result with the accepted readiness inventory: 34 ledger rows, newest
`20260721150808`, none of the pending eight rows, 18 payment-received orders, classifications 2/13/3, no
active generation or delivery lease, zero `email_provider_events`, and the complete historical
`email_events` status aggregate `queued=71`, `recorded_disabled=2`, `sent=2` with total 75 and
approved deterministic fingerprint. The database-visible provider mode remains a separate
`PASS`/`STOP`/`NOT_DATABASE_VISIBLE` result; Vercel `MK_EMAIL_PROVIDER_MODE=disabled` remains
separate deployment evidence.

**Expected result:** Every result is `PASS`, except that provider mode may be
`NOT_DATABASE_VISIBLE` when both known database keys are absent. No recipient, provider ID, order ID,
message ID, credential, function body or connection detail is printed.

**Evidence retained:** Redacted aggregate preflight output, connection target fingerprint without
credentials, timestamp, CLI/client versions and operator approval.

**Stop condition:** Any count, version, fingerprint, provider state or activity result differs from
the approved baseline; do not investigate by mutating Production.

**Cloud state:** No.

## 5. Eight-migration execution order

**Status:** No migration command is approved in this RC1D cycle.

The requested installed-tool verification was performed in the available workspace. There is no
installed `supabase` executable; `supabase --version`, `supabase db push --help` and
`supabase migration list --help` therefore cannot produce real output here. No CLI version, dry-run
flag, linked-project flag or allowlist flag is being invented. No cloud command is executed.

The safest executable alternative for a future controller-authorised run is:

1. Install or expose one controller-approved, pinned Supabase CLI/tool version in the controlled
   executor, then capture and retain the real output of `supabase --version`,
   `supabase db push --help`, and `supabase migration list --help`.
2. Confirm the linked project through that tool's supported command and record only the project
   reference, region and connection target fingerprint. Do not continue if the linked project
   is not the intended Production project.
3. In a disposable staging directory, copy only the eight exact migration files listed below.
   Verify the directory contains exactly eight `.sql` files, the expected `(version,name)` pairs,
   and the approved SHA-256 file manifest. Do not place canonical-history files in this staging
   directory, so a previously applied file cannot be selected for rerun.
4. Use only the dry-run command and application command printed by that installed tool's help.
   The exact command strings must be captured in the evidence bundle; this package intentionally
   leaves them **unapproved** because the executable is absent. If the runner has no supported
   way to target the linked project while consuming only the eight-file staging directory, STOP.
5. Before application, require the read-only preflight to prove 34 rows, newest
   `20260721150808`, no pending eight versions, the approved RPC baseline and the protected-state
   fingerprint. After each successful file, require one matching ledger row and the per-step
   object manifest.
6. Run with the executor's fail-fast mode, no automatic retry, and a trap that records the first
   failing file. Never continue after an error and never manually insert a ledger row.
7. The eight-file staging manifest plus the postflight check for exactly 42 rows, eight exact pairs,
   no duplicate version and no version beyond the approved preflight boundary prevents a ninth or
   unlisted migration. If the tool can still read outside the staging directory, or cannot prove
   that constraint, do not apply anything.

**Exact future cutover order:**

1. `20260722120000_rc1_operational_freeze_bootstrap.sql`
2. `20260722143000_checkpoint_e_phase1_ai_attempt_binding.sql`
3. `20260724150000_release_a_backlog_reconciliation.sql`
4. `20260724160000_release_b_durable_fulfilment.sql`
5. `20260724170000_release_c_email_secure_delivery.sql`
6. `20260724180000_release_c_closure_delivery_exceptions.sql`
7. `20260725090000_release_c_runtime_secret_admin_provisioning.sql`
8. `20260725150000_release_d_operational_alert_lifecycle.sql`

The bootstrap migration is the only new payload in RC1D. The seven behaviour migrations are guarded
by fixed SHA-256 checks in local verification and all six established workflows. None is applied by
this RC1D code-only cycle.

## 6. Schema and RPC postflight

**Actor:** Codex; Tondani Netili reviews the result.

**Exact action:** Run `scripts/rc1-production-postflight.sql` read-only with the freeze-start timestamp.
Verify all eight ledger rows exactly once and exactly 42 total rows; verify the bootstrap tables,
11 functions, 40 relation-guard triggers and event trigger; then verify required tables, columns,
indexes, RLS/grants, all listed RPC signatures, `SECURITY DEFINER` and explicit search-path controls,
durable fulfilment, secure customer-access, runtime-secret and operational-alert capabilities.

**Expected result:** All object and grant result lines are `PASS`; the two `CURRENT_VERIFIED` orders
remain protected; no worker lease exists; no duplicate current report exists; no new order, email,
provider or delivery event exists since freeze activation.

**Evidence retained:** Redacted postflight output, definition fingerprints, ledger result and
timestamped no-new-event aggregate checks.

**Stop condition:** Any missing/extra object, grant drift, unsafe function control, duplicate report,
worker lease or event created during the window.

**Cloud state:** No additional state change; read-only verification.

## 7. Exact-SHA Vercel deployment with email provider disabled

**Actor:** Codex, after Tondani Netili's explicit deployment approval.

**Exact action:** Deploy the exact approved commit SHA from the accepted RC branch. Verify the
provider mode remains disabled in the deployment environment and that no production secret value is
printed or captured.

**Expected result:** Vercel reports READY for the exact SHA; provider mode is disabled; no cron/worker
or email action is active.

**Evidence retained:** Deployment URL, READY status, exact commit SHA, provider-mode-disabled
confirmation and deployment timestamp.

**Stop condition:** SHA mismatch, deployment not READY, provider mode not disabled, unexpected cron,
or any environment drift.

**Cloud state:** Yes; Vercel state changes. This step is currently prohibited.

## 8. Disabled-state application smoke tests

**Actor:** Codex; Tondani Netili approves test scope.

**Exact action:** Run health/build-info checks and non-mutating admin page checks against the READY
deployment. Confirm disabled-state responses for generation, delivery and webhook/provider paths.
Do not submit an assessment, create an order, confirm payment, invoke a worker or send email.

**Expected result:** Health and build info report the exact SHA; disabled capabilities fail closed with
the approved safe response; no database rows or storage objects are created.

**Evidence retained:** Status codes, safe response reason codes, exact SHA and aggregate no-change
queries. Never retain request bodies containing customer data.

**Stop condition:** Any 500, unexpected enabled response, mutation, worker claim or email/provider
activity.

**Cloud state:** No intended data mutation; deployment read traffic only.

## 9. Provider certification: disabled deployment and independent secrets

Sections 9–12 are the execution authority for the complete 19-step provider certification. Every
step requires its own actor, action, expected result, evidence, stop condition and cloud-state record.
No step is authorised during RC1E.

| Step | Actor | Exact action | Expected result | Evidence retained | Stop condition | Cloud-state impact |
|---:|---|---|---|---|---|---|
| 1 | Tondani Netili approves; Codex deploys | Deploy the exact approved RC SHA with `MK_EMAIL_PROVIDER_MODE=disabled`. | READY candidate uses the approved SHA and disabled mode. | Approval, deployment record, SHA, disabled-mode record. | SHA mismatch, non-READY state or mode not disabled. | Yes: Vercel deployment. |
| 2 | Tondani Netili disables; Codex verifies | Disable the intended Resend webhook endpoint before secret or mode changes. | Provider cannot deliver callbacks. | Endpoint identity, disabled timestamp and actor. | Endpoint remains enabled or identity is uncertain. | Yes: Resend webhook state. |
| 3 | Tondani Netili confirms; Codex verifies metadata only | Confirm `RESEND_WEBHOOK_SECRET` corresponds to the intended endpoint without exposing its value. | Intended endpoint and secret relationship are established. | Secret name, endpoint fingerprint, rotation timestamp. | Value exposure, endpoint mismatch or stale relationship. | No intended mutation; provider inspection only. |
| 4 | Tondani Netili approves; Codex provisions | With application and database still exactly `FROZEN`, provision `PHASE14_PROVIDER_WEBHOOK_DB_HMAC_SECRET` independently through Vercel and `POST /score/api/admin/rc1-certification/runtime-secret` using exact epoch. Never use the ordinary Phase 14 secret route. | Environment and database hold matching webhook-attestation material while the business freeze and epoch remain unchanged. | Secret name, non-reversible fingerprint, AAL2 RC1 audit event, epoch and timestamp. | Wrong actor/epoch, fingerprint mismatch, value exposure, freeze drift or generic route use. | Yes: Vercel environment and one narrow database secret row. |
| 5 | Tondani Netili approves; Codex provisions independently | Provision `PHASE14_PROVIDER_LOOKUP_DB_HMAC_SECRET` through the same frozen certification route, independently of and distinct from step 4. Run `scripts/rc1-production-post-provisioning-evidence.sql` read-only after both writes. | Two distinct fingerprints and expected RC1 audit events exist; freeze remains `FROZEN` at the same epoch; business aggregates are unchanged. | Safe post-provisioning PASS lines, separate secret names/fingerprints and AAL2 audit references. | Reused value, missing/distinctness failure, value exposure, freeze/epoch drift or business aggregate change. | Yes: Vercel environment and one narrow database secret row; evidence query is read-only. |

## 10. Provider certification: same-SHA disabled verification and test activation

| Step | Actor | Exact action | Expected result | Evidence retained | Stop condition | Cloud-state impact |
|---:|---|---|---|---|---|---|
| 6 | Tondani Netili approves; Codex deploys | Redeploy the same exact SHA after the three secret relationships are established; keep provider mode disabled. | READY deployment loads the secret metadata without changing SHA or mode. | Before/after deployment IDs, SHA comparison and disabled-mode record. | SHA drift, deployment failure or mode not disabled. | Yes: Vercel deployment. |
| 7 | Codex verifies; Tondani Netili reviews | Confirm READY and the exact approved SHA through build-info and deployment evidence. | Runtime and deployment records agree on one SHA. | READY status, exact SHA and UTC timestamp. | Any disagreement or unavailable build identity. | No intended mutation; read-only verification. |
| 8 | Codex verifies; Tondani Netili reviews | Confirm both database-side HMAC fingerprints independently, without printing either value. | Webhook and lookup fingerprints each match their corresponding approved environment relationship. | Two named fingerprints and AAL2 audit references. | Missing, equal-when-required-distinct or mismatched fingerprint. | No intended mutation; read-only verification. |
| 9 | Tondani Netili approves; Codex enables | Enable only the intended Resend webhook endpoint. | Signed callbacks can reach the frozen test path. | Endpoint identity, enabled timestamp and actor. | Wrong endpoint, unsigned path or freeze bypass. | Yes: Resend webhook state. |
| 10 | Tondani Netili approves; Codex changes mode | Set `MK_EMAIL_PROVIDER_MODE=test`; never set `live`. | Test mode is the sole enabled provider mode. | Environment change record naming the variable and mode only. | Mode is `live`, absent, ambiguous or applied to the wrong environment. | Yes: Vercel environment state. |
| 11 | Tondani Netili approves; Codex deploys | Redeploy the same exact SHA to load test mode. | READY deployment retains the approved SHA and reports test mode. | Deployment ID, exact SHA, READY and test-mode evidence. | SHA drift, failed deployment or mode not exactly `test`. | Yes: Vercel deployment. |

## 11. Provider certification: single-canary evidence

**Current STOP:** Steps 12–17 cannot begin. RC1D has no canary bypass; document 33 requires a
separately approved and implemented transactional design first.

| Step | Actor | Exact action | Expected result | Evidence retained | Stop condition | Cloud-state impact |
|---:|---|---|---|---|---|---|
| 12 | Tondani Netili preapproves; Codex executes once | Use one preapproved synthetic canary and the designated MK test mailbox only. | Exactly one synthetic canary is eligible; no real customer/order is touched. | Approval, anonymised canary reference outside git and mailbox designation. | Second canary, real data, wrong mailbox or worker eligibility. | Yes: controlled synthetic state. |
| 13 | Codex certifies; Tondani Netili reviews | Certify the payment-acknowledgement message for that canary. | One correct acknowledgement reaches only the designated mailbox. | Template/version, event count, test mailbox evidence and timestamp. | Missing, duplicate, malformed or misdirected message. | Yes: one test email and related synthetic event. |
| 14 | Codex certifies; Tondani Netili reviews | Certify the secure report-ready message for the same canary. | One secure report-ready message reaches only the designated mailbox with no raw storage path or token exposure. | Template/version, secure-link checks, event count and timestamp. | Duplicate, wrong recipient, insecure content or unrelated report. | Yes: one test email and related synthetic event. |
| 15 | Codex verifies; Tondani Netili reviews | Submit the genuine signed callback for the approved canary and require HTTP 200. | Signature verification and route processing succeed once. | Redacted request fingerprint, endpoint identity, HTTP 200 and timestamp. | Non-200, unsigned acceptance, replay conflict or secret exposure. | Yes: one provider callback. |
| 16 | Codex verifies; Tondani Netili reviews | Prove the provider event correlates to the intended synthetic email event. | Exactly one provider event binds to exactly one intended email event. | Aggregate correlation result, event-type result and fingerprints only. | Unknown, duplicate, conflicting or unrelated correlation. | No additional intended mutation beyond step 15 verification. |
| 17 | Codex verifies; Tondani Netili reviews | Prove no unrelated order or job is eligible before leaving test mode. | Eligibility remains exactly one approved synthetic canary and zero unrelated jobs. | Aggregate eligibility counts and worker-disabled evidence. | Any unrelated eligibility, worker claim or real-order change. | No intended mutation; read-only verification. |

## 12. Provider certification: disabled resting state

| Step | Actor | Exact action | Expected result | Evidence retained | Stop condition | Cloud-state impact |
|---:|---|---|---|---|---|---|
| 18 | Tondani Netili approves; Codex executes in order | Return `MK_EMAIL_PROVIDER_MODE` to `disabled`, redeploy the same exact SHA, then disable the Resend webhook. | READY uses the same SHA in disabled mode and callbacks are unavailable. | Environment change, deployment ID, exact SHA, READY and webhook-disabled timestamp. | Wrong order, SHA drift, non-READY deployment, mode not disabled or webhook remains enabled. | Yes: Vercel environment/deployment and Resend webhook state. |
| 19 | Tondani Netili appoints independent verifier | Independently verify the final disabled resting state, including provider mode, webhook, workers, canary closure and no unrelated state changes. | All controls are disabled; only approved synthetic evidence remains; no unrelated event or job changed. | Independent sign-off, disabled-mode evidence, webhook state, worker checks and no-change aggregates. | Any enabled control, unresolved canary, unrelated mutation or missing independent sign-off. | No intended mutation; final read-only verification. |

Provider mode must never be `live` during certification. Secret values, customer identifiers and raw
provider payloads must never enter output or git.

## 13. Existing-order reconciliation

**Actor:** Tondani Netili owns each approval; Codex uses supported admin controls only.

**Exact action:** Outside git, complete the anonymised register's 18 owner-approved actions. Protect
the 2 `CURRENT_VERIFIED` orders from regeneration and duplicate delivery; individually review the 13
`CURRENT_NOT_STORED` orders, defaulting to controlled regeneration as a new version unless recovery
is approved; individually approve the 3 `NO_REPORT` orders after legitimacy/completion review. Do
not invoke a worker. Verify recipients separately before any delivery.

**Expected result:** Every row has an owner-approved action and evidence; no current verified order
changes; history is preserved and superseded rather than overwritten.

**Evidence retained:** Anonymised totals, owner approval ledger outside git, supported-admin audit
events and aggregate report/storage/delivery results.

**Stop condition:** Any missing approval, unexpected order state, attempted worker claim, duplicate
generation, recipient uncertainty or current-verified change.

**Cloud state:** Yes; approved individual order changes only, never batch automation.

## 14. Freeze release

**Actor:** Tondani Netili only.

**Exact action:** Confirm all gates, postflight, disabled resting state, canary closure and existing-
order approvals. Keep the database `FROZEN`; set `MK_RC1_OPERATION_FREEZE_MODE=released`; redeploy
the same exact SHA; prove all ordinary mutation routes remain blocked because the database is still
`FROZEN`; then invoke `POST /score/api/admin/rc1-freeze/release` as Tondani Netili's authenticated
AAL2 platform-admin session with the exact epoch, meaningful reason and valid nonzero evidence
fingerprint. Only after `GET .../status` reports `RELEASED` and both layers agree may operations
open. Do not release merely because the deployment is READY.

**Expected result:** The owner records the release timestamp and the operating model becomes active.

**Evidence retained:** Signed release decision, final no-change/no-worker check, final SHA, owner,
time and exception list (which must be empty for GO).

**Stop condition:** Any unresolved gate, unknown PITR state, pending order approval or disabled-state
failure.

**Cloud state:** Yes; operational availability changes.

## 15. Evidence capture

**Actor:** Codex assembles; Tondani Netili reviews and signs.

**Exact action:** Assemble the package defined in `31-rc1-go-evidence-requirements.md`. Redact all
customer identifiers and secret values. Cross-check every item against the abort matrix.

**Expected result:** The package is complete, internally consistent and tied to one SHA.

**Evidence retained:** Final evidence bundle, checksums, signed owner/controller approval and PR
description update. Do not attach customer records.

**Stop condition:** Any missing evidence, inconsistent timestamp/SHA, secret, identifier or unsigned
decision.

**Cloud state:** No.

## 16. Abort and forward-repair procedure

**Actor:** Codex stops immediately; Tondani Netili owns the business decision; Codex may repair only
after explicit owner/controller approval.

**Exact action:** On any trigger in `30-rc1-abort-and-forward-repair-matrix.md`, stop the current
step, preserve redacted evidence, keep the freeze active, classify the incident, and decide whether
the application may be rolled back. Do not use reverse/down migrations as the default. Schema repair
is forward-only unless a separately tested restoration procedure is approved.

**Expected result:** No further mutation occurs until the owner/controller records a repair plan,
technical executor and resume condition.

**Evidence retained:** Abort timestamp, trigger, last successful gate, ledger/schema fingerprints,
affected aggregate counts, owner decision and forward-repair record.

**Stop condition:** Any attempt to continue without an approved repair/resume decision.

**Cloud state:** Depends on the incident; the freeze remains active and Codex takes no unapproved
repair action.

## Current decision

This runbook does not issue RC MIGRATION/DEPLOYMENT GO. The three accepted RC1D components remain
accepted; RC1E corrects the bootstrap/control plane in code and requires controller review. It has
not been deployed or activated. The Supabase backup gate remains **CONDITIONAL PASS** under the supplemental owner
decision. The scheduled-backup fallback evidence, post-freeze logical-backup evidence, restricted
Storage safeguard, controller acceptance of RC1D, viable transactionally constrained canary design,
18-order approvals, worker/manual operating-model decision and all other §1–§16 gates remain
owner/controller gates. RC1 OPERATIONAL READINESS, RC MIGRATION/DEPLOYMENT, CLOUD CERTIFICATION,
PUBLIC LAUNCH and MERGE remain **NO-GO**.
