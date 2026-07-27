# RC1 Production-Change Runbook

**Status:** RC PREPARATION: CODE COMPLETE — CONTROLLER ACCEPTED; RC1 OPERATIONAL READINESS: IN
PROGRESS; RC MIGRATION/DEPLOYMENT: **NO-GO**; CLOUD CERTIFICATION: **NO-GO**; PUBLIC LAUNCH:
**NO-GO**; **DO NOT MERGE**.

**Accepted preparation head:** `19a2d139c702ce6a2cbf767253af62244dec75dc`.

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
- The only authorised migration files are the seven listed in §5, in that exact order.

Each step below records: actor, exact action, expected result, retained evidence, stop condition and
whether it changes cloud state.

## 1. Preconditions

**Actor:** Tondani Netili, then Codex.

**Exact action:** Confirm the PR is open, draft and DO NOT MERGE; confirm the accepted preparation
SHA; confirm all six established CI workflows are green at that SHA; confirm the seven-file allowlist;
confirm this runbook, the freeze plan, the manual operating model, the anonymised 18-order register,
the abort matrix and the evidence requirements are the versions approved for the event.

**Expected result:** The controller records a dated GO to begin only the preflight sequence, not a
GO to apply migrations.

**Evidence retained:** PR URL, exact SHA, six workflow links/results, signed controller approval,
runbook version and seven-file allowlist.

**Stop condition:** Any SHA mismatch, non-green workflow, closed/non-draft PR, missing approval or
unexpected file in the allowlist.

**Cloud state:** No.

## 2. Backup/PITR evidence

**Actor:** Tondani Netili from the Supabase dashboard; Codex records only the supplied evidence.

**Exact action:** Confirm whether PITR is enabled, retention period, latest recoverable point, whether
an on-demand or logical backup is additionally required, and who may initiate restoration. Capture
the approved recovery point timestamp and restoration authority without exposing credentials.

**Expected result:** A recoverable point is explicitly approved for this event.

**Evidence retained:** Dashboard screenshot or equivalent export, project identifier only, retention,
latest recoverable point, backup decision and restoration-authority name.

**Stop condition:** Any item is unknown, stale, unavailable or not approved. No migration or freeze
progresses while this gate is unresolved.

**Cloud state:** No, except any separately approved backup operation; Codex does not initiate one.

## 3. Operational-freeze activation

**Actor:** Tondani Netili activates the freeze; Codex verifies evidence.

**Exact action:** Apply the approved freeze mechanism from `28-rc1-operational-freeze-and-canary-plan.md`.
Make public assessment/order intake unavailable; suspend assessment submission, order creation,
payment confirmation/status changes, manual and backlog generation, quality review, delivery,
redelivery, recipient correction, payment webhooks, Resend webhook processing and fulfilment workers.
Keep provider mode disabled. Permit only one predesignated synthetic canary after explicit approval.

**Expected result:** Every listed mutation surface is unavailable or fail-closed, and the freeze is
observable through the approved evidence checks.

**Evidence retained:** Freeze activation timestamp, owner approval, route/RPC gate results, provider
mode-disabled evidence, worker-disabled evidence and a non-PII health check.

**Stop condition:** Any mutation surface remains available, any webhook/worker can mutate state, or
the freeze cannot be evidenced. Administrator discipline alone is not sufficient.

**Cloud state:** Yes; operational behaviour changes. Do not proceed without owner confirmation.

## 4. Final read-only preflight

**Actor:** Codex, under Tondani Netili's approval.

**Exact action:** Run `scripts/rc1-production-preflight.sql` against the approved Production target
using a read-only connection. Compare the output with the accepted readiness inventory: 34 ledger
rows, newest `20260721150808`, zero pending-seven rows already recorded, 18 payment-received orders,
2 `CURRENT_VERIFIED`, 13 `CURRENT_NOT_STORED`, 3 `NO_REPORT`, zero active/queued attempts, zero
payment automation records and no unexpected delivery/fulfilment/alert activity.

**Expected result:** Every `*_result` line is `PASS`; RPC definition fingerprints are captured without
printing function bodies or data.

**Evidence retained:** Redacted aggregate preflight output, connection target fingerprint without
credentials, timestamp, CLI/client versions and operator approval.

**Stop condition:** Any count, version, fingerprint, provider state or activity result differs from
the approved baseline; do not investigate by mutating Production.

**Cloud state:** No.

## 5. Seven-migration execution order

**Status:** No migration command is approved in this RC1A cycle.

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
3. In a disposable staging directory, copy only the seven exact migration files listed below.
   Verify the directory contains exactly seven `.sql` files, the expected `(version,name)` pairs,
   and the approved SHA-256 file manifest. Do not place canonical-history files in this staging
   directory, so a previously applied file cannot be selected for rerun.
4. Use only the dry-run command and application command printed by that installed tool's help.
   The exact command strings must be captured in the evidence bundle; this package intentionally
   leaves them **unapproved** because the executable is absent. If the runner has no supported
   way to target the linked project while consuming only the seven-file staging directory, STOP.
5. Before application, require the read-only preflight to prove 34 rows, newest
   `20260721150808`, no pending seven versions, the approved RPC baseline and the protected-pair
   fingerprint. After each successful file, require one matching ledger row and the per-step
   object manifest.
6. Run with the executor's fail-fast mode, no automatic retry, and a trap that records the first
   failing file. Never continue after an error and never manually insert a ledger row.
7. The seven-file staging manifest plus the postflight check for exactly 41 rows, seven exact pairs,
   no duplicate version and no version beyond the approved preflight boundary prevents an eighth or
   unlisted migration. If the tool can still read outside the staging directory, or cannot prove
   that constraint, do not apply anything.

**Exact authorised order remains:**

1. `20260722143000_checkpoint_e_phase1_ai_attempt_binding.sql`
2. `20260724150000_release_a_backlog_reconciliation.sql`
3. `20260724160000_release_b_durable_fulfilment.sql`
4. `20260724170000_release_c_email_secure_delivery.sql`
5. `20260724180000_release_c_closure_delivery_exceptions.sql`
6. `20260725090000_release_c_runtime_secret_admin_provisioning.sql`
7. `20260725150000_release_d_operational_alert_lifecycle.sql`

The eventual approved sequence must include the separate freeze-bootstrap migration before this list,
making the future cutover eight migrations. The seven behaviour migrations are not applied by this
RC1A correction cycle.

## 6. Schema and RPC postflight

**Actor:** Codex; Tondani Netili reviews the result.

**Exact action:** Run `scripts/rc1-production-postflight.sql` read-only with the freeze-start timestamp.
Verify all seven ledger rows exactly once; required tables, columns, indexes, RLS/grants; all listed
RPC signatures; `SECURITY DEFINER` and explicit search-path controls; durable fulfilment, secure
customer-access, runtime-secret and operational-alert capabilities.

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

## 9. Secret provisioning

**Actor:** Tondani Netili approves; Codex executes only the approved provisioning path.

**Exact action:** Provision the two runtime HMAC secrets through the approved admin-only RPC and
matching environment mechanism. Record only secret names, rotation timestamps and fingerprints; keep
provider mode disabled and do not test a real provider callback.

**Expected result:** Both secret names exist, are at least the approved length, are auditable and are
not exposed in logs, git, screenshots or client responses.

**Evidence retained:** Secret-name-only inventory, rotation timestamps, non-reversible fingerprints,
actor and approval record.

**Stop condition:** Any secret value exposure, missing audit record, wrong actor, provider mode change
or inability to prove the values are not in ordinary output.

**Cloud state:** Yes; secrets change. This step is currently prohibited.

## 10. Same-SHA redeployment after environment changes

**Actor:** Codex; Tondani Netili approves.

**Exact action:** Redeploy/restart the same application SHA after environment changes. Re-run build-info,
health and provider-mode-disabled checks.

**Expected result:** READY deployment SHA is unchanged; provider mode remains disabled; no worker,
webhook or email activity occurs.

**Evidence retained:** Before/after deployment records, exact SHA comparison, environment-change
record naming only, and smoke-test output.

**Stop condition:** Any SHA drift, failed health check, enabled provider, worker claim or event.

**Cloud state:** Yes; Vercel state changes. This step is currently prohibited.

## 11. Controlled synthetic certification

**Actor:** Tondani Netili approves the canary; Codex executes the approved synthetic path.

**Exact action:** Use only the one predesignated synthetic canary and test mailbox. Exercise the
approved assessment/order/payment-to-report/review/delivery path exactly once, with provider mode and
workers still disabled unless the controller-approved certification sequence explicitly enables the
minimum required test mode. Never use a real customer or real mailbox.

**Expected result:** The canary follows the approved state transitions, quality review and recipient
confirmation; delivery evidence is limited to the designated test mailbox; no real order is touched.

**Evidence retained:** Synthetic canary identifier outside git, approval, state-transition counts,
quality-review result, recipient confirmation and provider/test evidence with secret values removed.

**Stop condition:** Any real-order mutation, second canary, duplicate generation, wrong mailbox,
webhook-correlation failure, unresolved alert or unexpected worker claim.

**Cloud state:** Yes; synthetic state and possibly controlled test-provider state change.

## 12. Post-certification return to disabled resting state

**Actor:** Codex; Tondani Netili confirms.

**Exact action:** Disable any temporary provider/test mode, disable the canary path, confirm workers
and webhooks are unavailable, and redeploy/restart the same SHA if required to load the disabled state.

**Expected result:** Provider mode is disabled, no worker cadence is active, no webhook can mutate,
and the synthetic canary is the only non-production test residue.

**Evidence retained:** Disabled-state environment confirmation, deployment SHA, no-new-event query,
worker-disabled evidence and canary closure record.

**Stop condition:** Cannot prove disabled resting state or any non-canary capability remains active.

**Cloud state:** Yes; environment/control state changes.

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
order approvals. Release the freeze explicitly. Do not release it merely because the deployment is
READY.

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

## RC1A provider-certification correction

The three secret relationships are separate and must be evidenced separately:

1. `RESEND_WEBHOOK_SECRET` is the provider's signed-webhook verification secret.
2. `PHASE14_PROVIDER_WEBHOOK_DB_HMAC_SECRET` is the database-attestation HMAC relationship used
   by the Resend webhook path.
3. `PHASE14_PROVIDER_LOOKUP_DB_HMAC_SECRET` is the provider-lookup attestation HMAC relationship.

The future certification sequence is exactly:

1. Deploy the integrated approved SHA with provider mode **disabled**.
2. Keep the Resend webhook disabled.
3. Confirm/provision all three secret relationships; record names, actors, timestamps and
   non-reversible fingerprints only.
4. Redeploy the same SHA with provider mode still disabled.
5. Verify all three fingerprints and the disabled resting state.
6. Enable the Resend webhook.
7. Change `MK_EMAIL_PROVIDER_MODE` to `test`.
8. Redeploy the same SHA.
9. Use one preapproved synthetic canary and the designated MK test mailbox only.
10. Certify payment acknowledgement and secure report-ready delivery.
11. Require the signed webhook to return HTTP 200.
12. Prove the provider event correlates to the intended email event.
13. Prove no unrelated order or job is eligible.
14. Return `MK_EMAIL_PROVIDER_MODE` to `disabled`.
15. Redeploy the same SHA.
16. Disable the Resend webhook.
17. Independently verify the final disabled resting state, including workers, webhooks, provider mode
    and no unrelated state changes.

RC1 certification must never set provider mode to `live`. The sequence is design/evidence only in
this correction cycle; no secret, webhook, provider mode, deployment or canary action is performed.

## Current decision

This runbook does not issue RC MIGRATION/DEPLOYMENT GO. RC1 decision-package structure is accepted, but RC1 operational readiness is **CORRECTIONS REQUIRED**. Supabase PITR/backup evidence, the approved recovery point, the exact technical freeze design, the 18-order approvals, the worker/manual operating-model decision and all other §1–§16 gates remain owner/controller gates.
