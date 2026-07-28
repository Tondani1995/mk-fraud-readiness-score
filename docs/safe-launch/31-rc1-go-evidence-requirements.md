# RC1 GO Evidence Requirements

This is the minimum evidence bundle for a future RC MIGRATION/DEPLOYMENT GO decision. RC1D
application freeze/route foundation, old-schema/replay/checksum evidence and canary strict STOP are
**ACCEPTED**. RC1D bootstrap/control plane required correction; RC1E CONTROL-PLANE CORRECTION is
**CODE COMPLETE — CONTROLLER REVIEW REQUIRED**. RC1 OPERATIONAL READINESS remains **NO-GO**. This is not a GO decision and
does not authorise any cloud or Production action. Every item must reference one
exact application SHA and one cutover window. Evidence must be anonymised and must not contain
secret values, customer identifiers, order references, organisation names, email addresses, report
content or access tokens.

## Required bundle

- [ ] Exact approved RC SHA and PR #45 link; PR remains open, draft and DO NOT MERGE.
- [ ] All six exact-head CI results: V1 Verification, V7 Report Hardening, Supabase Migration Replay,
      Phase 1 Release Safety, Phase 2-3 Release Safety and Security Scans.
- [ ] Supabase backup/PITR screenshot or equivalent evidence.
- [ ] Approved recovery-point timestamp, retention period and restoration authority.
- [x] Supplemental owner decision recorded: Tondani Netili owns the Supabase organisation and
      restoration authority; restoration permission is confirmed; scheduled physical backups are
      active; latest evidenced backup is `2026-07-27 01:03:57 UTC`; PITR is disabled; PITR/compute
      upgrade is not approved; backup gate is CONDITIONAL PASS.
- [ ] Cutover backup evidence: latest scheduled physical backup as fallback, fresh logical backup
      after freeze activation and successful final preflight immediately before migration 1, and
      restricted safeguards of critical Storage objects including `generated-reports` and
      `payment-proofs`; retain logical-backup timestamp/checksum, aggregate bucket object counts and
      size totals, and protected recovery artifacts outside git.
- [ ] Signed operational-freeze activation evidence covering every mutation surface in
      `28-rc1-operational-freeze-and-canary-plan.md`.
- [ ] Read-only preflight output: 34 ledger rows, newest `20260721150808`, no pending-eight rows,
      18 paid orders, classification totals 2/13/3, zero active attempts, zero payment automation
      records, no unexpected activity and RPC fingerprints.
- [ ] Per-migration results for the bootstrap plus exactly seven accepted behaviour migrations in
      exact order, with all seven accepted payload checksums unchanged.
- [ ] Ledger postflight: eight new rows exactly once, 42 rows total, final newest version
      `20260725150000`, no
      unlisted migration and no duplicate version.
- [ ] Schema, index, grant, RLS and RPC fingerprints, including security-definer/search-path checks.
- [ ] Vercel READY deployment evidence with the exact approved SHA.
- [ ] Provider-mode-disabled confirmation before and after deployment/environment changes.
- [ ] Disabled-state no-send/no-worker evidence and smoke-test results.
- [ ] Frozen certification-secret provisioning evidence from the dedicated AAL2 route/RPC containing
      only two approved names, timestamps, distinct non-reversible fingerprints, exact epoch,
      expected RC1 audit events, consumed-token count and unchanged business aggregates.
- [ ] Controller-approved transactional canary implementation from document 33, followed by
      controlled synthetic-canary approval, result, designated-mailbox evidence and closure record.
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


## RC1C/RC1D/RC1E corrected gate evidence

- [ ] Preflight is executed through `npm run rc1:dry-evaluate-live-boundary` with the
      machine-readable manifest, approved target fingerprint, explicit read-only mode,
      controller-supplied RPC fingerprints, all 14 aggregate counts, protected-state fingerprint,
      and approved email-status JSON/fingerprint; every assertion is PASS or the gate is STOP.
- [ ] Historical `email_events` match the full aggregate `queued=71`, `recorded_disabled=2`,
      `sent=2` (total 75) and approved SHA-256 fingerprint; `email_provider_events=0`; no recipient,
      provider ID, order ID or message ID is emitted.
- [ ] Preflight proves the exact current-boundary columns, no duplicate current report per order/report type, and compares the non-reversible protected-state and 2/13/3 classification fingerprints.
- [ ] Postflight proves 42 total ledger rows, final version `20260725150000`, exact eight
      `(version,name)` pairs, no duplicate or unlisted version, the bootstrap tables/functions,
      40 relation guards and event trigger, full backlog/token structures, all 14
      migration-derived indexes, all 29 behaviour RPCs including
      `recover_expired_fulfilment_leases()` and
      `record_premium_report_generation_run(...)`, exact grants, RLS/policies and combined
      fingerprints.
- [ ] Postflight no-change evidence includes order/report/generation/payment/email/provider/delivery/token/alert/storage aggregates and the exact protected-state fingerprint supplied by preflight.
- [ ] Disposable runtime tests prove the baseline and postflight gates pass, then prove STOP for each controller-required defect, including wrong migration name, unlisted migration, missing index/RPC, unsafe search path, PUBLIC EXECUTE, disabled RLS, changed protected fingerprint, worker lease, new order/email event and duplicate current report.
- [ ] The exact Supabase runner/tool version and real `--help` output are captured. The current workspace has no Supabase CLI, so no dry-run or application command is approved or invented.
- [ ] The RC1E corrected bootstrap/control plane and exact manifest are controller accepted.
- [ ] Old-34-schema compatibility proves health/read-only diagnostics remain available and every
      authoritative application mutation surface is stopped before database access.
- [ ] Missing, invalid, malformed, timed-out or disagreeing freeze state fails closed; service-role
      direct DML, unknown surface and unsafe control-RPC attempts produce STOP.
- [ ] Runtime constraint tests reject null actor/reason/evidence, malformed/all-zero evidence,
      inconsistent release timestamps, RELEASED canary data, canary mismatch, invalid state and
      zero/null epoch; with exact constraints/NOT NULL deliberately removed, status and operation
      guards still stop every malformed case and the exact controls are restored.
- [ ] Dedicated control-route tests prove status/activate/release and certification-secret access
      require authenticated AAL2 `platform_admin`; AAL1, reviewer, anonymous and service-role
      attempts fail; the generic Phase 14 secret route remains HTTP 423.
- [ ] Final release evidence follows the same-SHA two-layer order: application `released` while
      database `FROZEN` remains closed, then owner AAL2 exact-epoch release, then both `RELEASED`.
- [ ] Document 33 has an accepted and implemented transactional canary design. RC1D intentionally
      implements no bypass, so this item is currently outstanding and CLOUD CERTIFICATION is NO-GO.

## Provider-certification evidence sequence

All 19 steps are required in order:

1. Exact approved RC SHA deployed with `MK_EMAIL_PROVIDER_MODE=disabled`.
2. Resend webhook disabled.
3. `RESEND_WEBHOOK_SECRET` confirmed against the intended endpoint.
4. `PHASE14_PROVIDER_WEBHOOK_DB_HMAC_SECRET` provisioned through Vercel plus the AAL2 admin RPC.
5. `PHASE14_PROVIDER_LOOKUP_DB_HMAC_SECRET` provisioned independently through Vercel plus the AAL2
   admin RPC.
6. Same-SHA redeployment while provider mode remains disabled.
7. READY/exact-SHA evidence verified.
8. Both database fingerprints independently verified.
9. Resend webhook enabled.
10. `MK_EMAIL_PROVIDER_MODE=test`.
11. Same-SHA redeployment.
12. One approved synthetic canary and designated MK test mailbox only.
13. Payment-acknowledgement message certified.
14. Secure report-ready message certified.
15. Signed webhook returns HTTP 200.
16. Provider event correlates to the intended email event.
17. No unrelated order or job is eligible.
18. `MK_EMAIL_PROVIDER_MODE=disabled`, same-SHA redeployed, and Resend webhook disabled.
19. Final disabled resting state independently verified.

Provider mode must never be `live` during certification.
