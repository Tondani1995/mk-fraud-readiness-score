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

**Actor:** Codex, technical executor only after Tondani Netili's explicit GO for this step.

**Exact action:** Use the approved Supabase migration runner against the linked Production project,
constrained to this exact allowlist and no other file:

1. `20260722143000_checkpoint_e_phase1_ai_attempt_binding.sql` — ledger newest becomes
   `20260722143000`; adds the Checkpoint E AI-attempt binding columns/index and four manual-AI RPCs.
2. `20260724150000_release_a_backlog_reconciliation.sql` — ledger newest becomes `20260724150000`;
   adds `backlog_reconciliation_records`, its two indexes, RLS/policy and classification/queue RPCs.
3. `20260724160000_release_b_durable_fulfilment.sql` — ledger newest becomes `20260724160000`;
   adds durable lease/heartbeat/backoff/quality-review columns and indexes, constraints, and the
   fulfilment/payment/quality RPC definitions.
4. `20260724170000_release_c_email_secure_delivery.sql` — ledger newest becomes `20260724170000`;
   adds delivery retry columns/indexes, `customer_report_access_tokens`, its indexes/RLS, delivery,
   token and quality-review RPC definitions.
5. `20260724180000_release_c_closure_delivery_exceptions.sql` — ledger newest becomes
   `20260724180000`; replaces provider-event, recipient-correction and token-reissue RPCs.
6. `20260725090000_release_c_runtime_secret_admin_provisioning.sql` — ledger newest becomes
   `20260725090000`; replaces `set_phase14_runtime_secret(text,text,text)` with a required optional
   reason/audit path while retaining provider mode disabled.
7. `20260725150000_release_d_operational_alert_lifecycle.sql` — ledger newest becomes
   `20260725150000`; adds alert lifecycle metadata/indexes and the audited transition RPC.

### Exact post-step object manifest

The executor must compare the post-step catalog to this manifest before continuing. The names below
are the expected additions/replacements; an unexpected object or signature is a STOP.

| Migration | Expected tables | Expected columns | Expected indexes | Expected RPC signatures |
|---|---|---|---|---|
| `20260722143000` | none | `report_ai_attempts.manual_generation_attempt_id`; `manual_report_generation_attempts.generation_mode`; `report_generation_runs.final_narrative_json` | `report_ai_attempts_manual_generation_idx` | `authorize_manual_report_ai_action(uuid,text)`; `claim_manual_report_ai_attempt(jsonb)`; `settle_manual_report_ai_attempt(uuid,jsonb)`; `record_manual_report_narrative_provenance(uuid,jsonb)`; `record_premium_report_generation_run(uuid,uuid,jsonb)` |
| `20260724150000` | `backlog_reconciliation_records` | table definition includes `order_id`, `report_id`, `classification`, `resolution_note`, `assigned_owner`, `next_action`, `completion_date`, `evidence_reference`, actor/timestamp audit columns | `backlog_reconciliation_records_classification_idx`; `backlog_reconciliation_records_assigned_owner_idx` | `classify_backlog_order(uuid,uuid,text,text,uuid,text,date,text)`; `backlog_reconciliation_queue()` |
| `20260724160000` | none | `manual_report_generation_attempts.lease_owner`; `lease_expires_at`; `heartbeat_at`; `next_attempt_at`; `max_attempts`; `quality_reviewed_by`; `quality_reviewed_at`; `quality_review_decision`; `quality_review_reason`; `regenerated_from_attempt_id`; `delivery_queued_at` | `manual_report_generation_attempts_status_next_attempt_idx`; `manual_report_generation_attempts_lease_expiry_idx` | `claim_next_fulfilment_job(text,integer)`; `fail_fulfilment_job(uuid,text,text,text,text)`; `submit_for_quality_review(uuid,text)`; `recover_expired_fulfilment_leases()`; `approve_quality_review(uuid,text)`; `reject_quality_review(uuid,text)`; `retry_fulfilment_job(uuid)`; `recover_fulfilment_job(uuid)`; `claim_payment_report_generation(text,text,text)`; `record_payment_transition(text,text,text,text,integer,text,text,text,timestamptz,text,text,text,text,text)` |
| `20260724170000` | `customer_report_access_tokens` | `report_delivery_authorizations.next_attempt_at`; `max_attempts`; `retry_count`; token table includes order/report binding, recipient, hash, purpose, issue/expiry/revocation/access audit fields | `report_delivery_authorizations_status_next_attempt_idx`; `report_delivery_authorizations_lease_expiry_idx`; `customer_report_access_tokens_active_uidx`; `customer_report_access_tokens_order_idx`; `customer_report_access_tokens_expiry_idx` | `claim_next_delivery(text,integer)`; `mark_delivery_dispatch_started(uuid,uuid)`; `finalize_delivery(uuid,uuid,text)`; `fail_delivery(uuid,uuid,text,text,text)`; `retry_delivery(uuid)`; `issue_customer_report_access_token(uuid,uuid,text,integer)`; `revoke_customer_report_access_token(uuid,text)`; `reissue_customer_report_access_token(uuid,uuid,text,text,integer)`; `approve_quality_review(uuid,text)` |
| `20260724180000` | none | none | none | `apply_email_provider_event_atomic(text,text,text,text,timestamptz,text,jsonb)`; `correct_delivery_recipient_and_queue(uuid,text,text)`; `reissue_customer_report_access_token(uuid,uuid,text,text,integer,boolean)`; replacement definitions for `approve_quality_review(uuid,text)` |
| `20260725090000` | none | none | none | `set_phase14_runtime_secret(text,text,text)` |
| `20260725150000` | none | `phase14_operational_alerts.acknowledged_at`; `acknowledged_by`; `resolved_by`; `last_status_changed_at` | `phase14_operational_alerts_severity_created_idx`; `phase14_operational_alerts_list_idx`; `phase14_operational_alerts_open_critical_idx`; `phase14_operational_alerts_category_idx` | `transition_phase14_operational_alert(uuid,text,text)` |

For every RPC, postflight must confirm the expected `SECURITY DEFINER` posture, explicit controlled
`search_path`, exact identity arguments and intended grants. The manifest is descriptive evidence,
not permission to execute any migration outside the seven-file allowlist.

After each file, query the ledger for exactly one matching `(version,name)` row and run that
migration's schema/RPC postflight assertions before continuing. The runner must stop on the first
error. Never skip, reorder, edit or manually mark a migration applied.

**Expected result:** Seven successful applications, ledger total 41, newest version
`20260725150000`, no duplicate version rows and no unlisted version applied.

**Evidence retained:** Per-migration runner output, ledger row/version, migration checksum, CLI
version, start/end timestamps and post-step assertion output. No SQL payload containing customer data.

**Stop condition:** Any error, ledger mismatch, unexpected object, unexpected function definition,
or mutation outside the freeze. Do not retry blindly.

**Cloud state:** Yes; this is the first schema-changing step. It is prohibited until all prior gates
are approved.

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

## Current decision

This runbook does not issue RC MIGRATION/DEPLOYMENT GO. Supabase backup/PITR evidence, the exact
freeze controls, the 18-order approvals and all other §1–§16 gates remain owner/controller gates.
