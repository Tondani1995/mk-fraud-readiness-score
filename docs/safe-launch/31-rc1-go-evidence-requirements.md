# RC1 GO Evidence Requirements

This is the minimum evidence bundle for a future RC MIGRATION/DEPLOYMENT GO decision. It is not a
GO decision and does not authorise any cloud or Production action. Every item must reference one
exact application SHA and one cutover window. Evidence must be anonymised and must not contain secret
values, customer identifiers, order references, organisation names, email addresses, report content
or access tokens.

## Required bundle

- [ ] Exact approved RC SHA and PR #45 link; PR remains open, draft and DO NOT MERGE.
- [ ] All six exact-head CI results: V1 Verification, V7 Report Hardening, Supabase Migration Replay,
      Phase 1 Release Safety, Phase 2-3 Release Safety and Security Scans.
- [ ] Supabase backup/PITR screenshot or equivalent evidence.
- [ ] Approved recovery-point timestamp, retention period and restoration authority.
- [ ] Signed operational-freeze activation evidence covering every mutation surface in
      `28-rc1-operational-freeze-and-canary-plan.md`.
- [ ] Read-only preflight output: 34 ledger rows, newest `20260721150808`, no pending-seven rows,
      18 paid orders, classification totals 2/13/3, zero active attempts, zero payment automation
      records, no unexpected activity and RPC fingerprints.
- [ ] Per-migration results for exactly the seven authorised migrations in exact order.
- [ ] Ledger postflight: seven new rows exactly once, final newest version `20260725150000`, no
      unlisted migration and no duplicate version.
- [ ] Schema, index, grant, RLS and RPC fingerprints, including security-definer/search-path checks.
- [ ] Vercel READY deployment evidence with the exact approved SHA.
- [ ] Provider-mode-disabled confirmation before and after deployment/environment changes.
- [ ] Disabled-state no-send/no-worker evidence and smoke-test results.
- [ ] Secret provisioning evidence containing names, timestamps and non-reversible fingerprints only.
- [ ] Controlled synthetic-canary approval, result, designated-mailbox evidence and closure record.
- [ ] Confirmation that the environment returned to disabled resting state after certification.
- [ ] Completed anonymised 18-order disposition totals and owner-approved action register outside git.
- [ ] Evidence that the 2 `CURRENT_VERIFIED` orders remained excluded and no worker claimed an order.
- [ ] Named canary approver, freeze activator and freeze-release authority.
- [ ] Approved abort/forward-repair matrix and named business/technical owners.
- [ ] Signed final owner/controller decision stating GO, NO-GO or deferred, with timestamp.

## Evidence integrity rules

1. Redact before upload or commit; do not rely on a viewer's hidden-field behaviour.
2. Prefer aggregate counts, version strings, object names, fingerprints and reason codes.
3. Keep raw provider or dashboard evidence in the approved restricted evidence store, not git.
4. Tie every screenshot/log/output to the exact SHA and UTC timestamp.
5. A missing, contradictory or stale item is a STOP, not an implied approval.
