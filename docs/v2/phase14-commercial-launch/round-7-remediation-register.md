# Phase 14 Round 7 Remediation Register

This register records the disposition of every finding from the Round 7 independent security
review of the Phase 14 autonomous premium report engine, as closed on branch
`launch/phase14-commercial-readiness`. Every finding has one of three dispositions:

- **Fixed** — code, schema, or CI changed; verified by an automated test or a direct, cited
  inspection of the current source.
- **Proven already safe** — the reviewed behaviour was already correct; verified by direct
  inspection of the current source (not by trusting an earlier round's claim), with evidence cited.
- **Deliberately deferred** — not changed this pass, with a documented reason, owner, target date,
  and compensating control.

Every disposition below was verified against the code on this branch at the time of closure, not
assumed from an earlier review round's notes, per this engagement's standing instruction.

## Critical

| ID | Finding | Disposition | Evidence |
|---|---|---|---|
| C1 | AI-generated narrative was validated but then discarded — reports always shipped deterministic content even in `mode: 'ai'` | **Fixed** | Commit `e03e9c9`. `buildAndValidateAiNarrative` in `src/lib/reports/automation/narrative-pipeline.ts` now builds the narrative returned to the caller from the AI plan, not from `buildDeterministicNarrative`, for `ai`/`ai_repair` modes. Regression-guarded by `scripts/phase14-ai-narrative-integrity-tests.mjs` (`npm run` via direct `node` invocation), which asserts `result.narrative.executiveDiagnosis.body` differs from deterministic content and matches the AI plan's body in the `ai` and `ai_repair` cases. |

## High

| ID | Finding | Disposition | Evidence |
|---|---|---|---|
| H1 | `render-pdf.ts` had no Chromium crash recovery — one crashed page could wedge every subsequent render | **Fixed** | Commit `e2ca0e5`. `scripts/phase14-pdf-renderer-crash-recovery-tests.mjs`. |
| H2 | Workflow-start reconciliation gap | **Fixed** | Commit `803f905`. `scripts/phase14-workflow-start-reconciliation-tests.mjs`. |
| H3 | Delivery entitlement was checked in more than one place with different logic | **Fixed** | Commit `fbf2b68`. One authoritative `assert_premium_report_download_entitlement`/`validatePremiumReportGenerationEntitlement` path; `scripts/phase14-delivery-entitlement-wiring-tests.mjs`. |
| H4 | A lost/ambiguous Resend API response left delivery state permanently unresolved | **Fixed** | Commit `cecd828`. Reconciliation via `delivery_attempt_ref`-based correlation in migration `0028` (renumbered from `0026`); `npm run phase14:test-delivery-reconciliation` (17 cases after this session's strengthening — see the H4 concurrency-determinism entry immediately below, which was itself required to close this finding out fully). |
| H5 | No application-layer defense-in-depth at delivery/download beyond the database RPC | **Fixed** | Commit `a74c02e`. TypeScript-layer checks in `src/lib/reports/download-verification.ts` and `src/lib/reports/phase1-report-access.ts`; `scripts/phase14-security-closure-tests.mjs`. |
| H6 | No documented evidence of the production migration-0017 activation boundary, and no operator runbook | **Fixed** | This session. See `docs/v1/phase14/production-history-read-only-evidence-2026-07-15.md` (read-only production schema/migration-ledger capture, SHA-256 `417dfbf2fb...`) and `docs/v1/phase14/migration-0017-note.md` for the existing evidence; the operator runbook is `docs/v2/phase14-commercial-launch/production-activation-runbook.md` (new, this session). One real gap was found and fixed while assembling this evidence: `.github/workflows/supabase-migration-replay.yml`'s schema-equivalence-hash CI assertion was stale against migrations `0026`–`0030` (renumbered from `0024`–`0028`) added this session; corrected to a recorded/observed value pending the first real CI run against this branch's head (see commit `9855a81`, and the schema-equivalence pinning evidence recorded after the post-merge renumbering). |

## Medium

| ID | Finding | Disposition | Evidence |
|---|---|---|---|
| M1 | AI provider failures were all treated as `provider_result_uncertain`, even ones that never reached the provider | **Fixed** | Commit `0bf6e0a`. `src/lib/reports/automation/ai-failure-classification.ts` classifies against the real AI SDK error taxonomy; `failed_before_provider` status now used and excluded from the spend budget (migration `0030`, renumbered from `0028`). `scripts/phase14-ai-accounting-tests.mjs`, `scripts/phase14-ai-attempt-budget-tests.mjs`. |
| M2 | Cross-kind AI attempt budget gap | **Fixed** | Commit `66823a2`. |
| M3 | Related cross-kind AI attempt budget gap | **Fixed** | Commit `66823a2`. |
| M4 | Prompt-injection via customer-entered `organisationName` | **Fixed** | Commit `e03e9c9`. `scanForPromptInjection` heuristic plus full fact-check backstop; 14-case adversarial suite in `scripts/phase14-ai-narrative-integrity-tests.mjs`. |
| M5 | Workflow-start double-fault was not observable | **Fixed** | Commit `2cac014`. |
| M6 | No bounded timeout around `page.pdf()` — a hung render could block a worker indefinitely | **Fixed** | Commit `2d56c2d`. `DEFAULT_PDF_RENDER_TIMEOUT_MS`/`PDF_RENDER_TIMEOUT_MS` in `src/lib/reports/render-pdf.ts`; distinct `phase14_pdf_render_timeout` log; forced-hang recovery test added to `scripts/phase14-pdf-renderer-crash-recovery-tests.mjs`. |
| M7 | *(original Round 7 finding text unrecoverable)* | **Carried forward, unverified -- disclosed gap, not a closure** | Neither this session nor the prior remediation session that first carried this forward could locate the original Round 7 finding text for M7 anywhere accessible: not in this repository (`git log --all`, `docs/v1/phase14/`), not in the imported MK Fraud knowledge project (its `memory.md`/`syncs.json` contain only unrelated, stale Phase 10-era notes), and not anywhere else in available context, despite the user's belief that it was available. The user was asked directly how to proceed and confirmed: leave this explicitly flagged as unresolved rather than fabricate finding text or a disposition. **This is not a closed finding.** Whatever M7 originally identified remains unactioned and unverified against current code. A controller with access to the original Round 7 review document must supply the finding text before this can be genuinely dispositioned (fixed / proven safe / deliberately deferred with owner and date) — until then, treat it as an open, unquantified risk for commercial launch, not a carried-forward pass. |
| M8 | *(original Round 7 finding text unrecoverable)* | **Carried forward, unverified -- disclosed gap, not a closure** | Same gap, same caveat, and same "not a closed finding" status as M7. |
| M9 | Worker storage-cleanup was not observable (silent failure) | **Fixed** | Commit `9855a81`. Structured `cleanupLog` (technical reference, cleanup result, error category) on both success and failure paths in `src/lib/reports/phase1-manual-fulfilment.ts`. |
| M10 | *(original Round 7 finding text unrecoverable)* | **Carried forward, unverified -- disclosed gap, not a closure** | Same gap, same caveat, and same "not a closed finding" status as M7. |
| M11 | No CI dependency-vulnerability gate | **Fixed** | Commit `4c22f28`. `.github/workflows/security-scans.yml` `dependency-audit` job; `scripts/phase14-dependency-audit-gate.mjs`; documented, owned, time-boxed exceptions in `security/dependency-audit-exceptions.json`. |
| M12 | No CI secret scanning | **Fixed** | Commit `4c22f28`. `.github/workflows/security-scans.yml` `secret-scan` job (gitleaks, full git history); `.gitleaksignore` with 7 manually-reviewed, documented fingerprints. |
| M13 | Stale lockfile; unpatched CVEs in `@supabase/supabase-js`, `axios`, `mongoose` | **Fixed** (Next.js CVEs **deliberately deferred**) | Commit `adc9b69`. Lockfile regenerated and `npm ci` verified clean; three dependencies bumped to patched versions. Next.js major-version CVEs explicitly **not** fixed — this repo's `docs/v1/phase14/no-go-boundary.md` prohibits a Node/Next/React upgrade during this remediation pass; documented as a time-boxed, owned exception in `security/dependency-audit-exceptions.json` (expires 2026-10-16). |
| M14 | Migration-ledger reconciliation drill exists but has no operator runbook | **Fixed** | This session. The drill itself (`.github/workflows/supabase-migration-replay.yml`) already existed and works; the operator runbook is now `docs/v2/phase14-commercial-launch/production-activation-runbook.md` (new, this session). |
| M15 | `live-uat.yml` was a placeholder (`echo "Live UAT placeholder"`) named as if it were a real release gate | **Fixed** | Commit `bf4f202`. Rewritten into a real, `workflow_dispatch`-gated, `live-uat`-environment-protected workflow orchestrating 15 real, already-verified test suites end to end. This session added a 16th step (L5's rate-limit test). |

## Low

| ID | Finding | Disposition | Evidence |
|---|---|---|---|
| L1 | Secret-leak/output validation in AI narrative was a literal-keyword denylist only | **Fixed** | Commit `33b2158`. Six new pattern-shaped `PROHIBITED_PATTERNS` entries in `src/lib/reports/automation/validation.ts` (email addresses, JWT-shaped tokens, AWS access-key IDs, vendor API-secret shapes, opaque hex tokens, Supabase project URLs). Tested in `scripts/phase14-security-closure-tests.mjs`. |
| L2 | Dead code: unused `findReusableFulfilment`/`REUSE_READ_DELAYS_MS`/`delay()` in `fulfilment.ts` | **Fixed** | Commit `239150f`. Removed; confirmed via grep the function was never called. |
| L3 | No SAST scanning in CI | **Fixed** | Commit `4c22f28`. CodeQL (`javascript-typescript`, `security-and-quality` query suite) `sast` job in `.github/workflows/security-scans.yml`. |
| L4 | Branch-name exclusion guard in `supabase-migration-replay.yml` is fragile/hard to verify | **Deliberately deferred** | Commit `225d671`. Cannot be verified outside real GitHub Actions (no local Actions runner or Docker/Supabase CLI in this sandbox); current failure mode is low-severity (job runs when it shouldn't, against an ephemeral CI-only database — not a production impact). Documented in place with owner (platform-engineering) and target date (2026-10-16). |
| L5 | Resend delivery webhook had no rate limiting | **Fixed** | Commit `225d671`. Global (not per-IP — Resend's sending IPs are not a documented stable set) volumetric budget via `RATE_LIMITS.resendWebhookGlobal` in `src/lib/security/rate-limit.ts`, layered underneath the route's existing HMAC signature verification. Tested in `scripts/phase14-resend-webhook-rate-limit-tests.mjs`. |
| L6 | Stale "Node 20" claims in current-state documentation | **Fixed** | Commit `239150f`. Corrected in `docs/v1/phase14/review-gates.md` and `docs/v1/phase14/autonomous-premium-report-engine.md`; seven other files' legitimate historical Node-20 narrative deliberately left untouched. |
| L7 | `storage-error-classifier.ts` had no defense against a malformed/throwing error input | **Proven already safe, with hardening added** | Commit `239150f`. The classification design was already fail-safe by construction (only the narrow `object_not_found` branch is trusted as "deletion confirmed"); added a try/catch so an exotic throwing input degrades to `unknown_provider_error` instead of propagating an uncaught exception. Tested in `scripts/phase14-storage-fault-injection-tests.mjs`. |

## H4 concurrency-determinism (this session)

`scripts/phase14-delivery-reconciliation-tests.mjs` test #4 ("concurrent duplicate webhook never
double-applies") was flagged by an earlier session as intermittently flaky and dismissed as "a
timing-sensitive race in the test harness," carried forward without proof. That claim was
investigated directly this session, not accepted: `RAISE NOTICE` instrumentation of a real failing
run proved it was not a harness race, but a genuine, narrow correctness bug in
`apply_email_provider_event_atomic`'s recency guard — a millisecond-vs-microsecond timestamp
precision mismatch between the client-supplied `p_event_created_at` and the database-set
`delivery_updated_at`, which could spuriously reject a genuinely current webhook event as stale.

**Fixed** this session by migration `0031_phase14_delivery_event_recency_precision_fix.sql`
(`date_trunc('milliseconds', ...)` on both sides of the comparison). Verified by 20 consecutive
passing runs of the full suite (previously ~2 of 3 runs failed with zero code changes), a
strengthened test #4 that now asserts the underlying database invariant directly (one
`email_provider_events` row, one `phase14_provider_attestations` row, one `email_events` row bound
to the resulting `provider_message_id`, and no duplicate-send eligibility via
`authorize_premium_report_delivery`'s `reused_existing_send` reuse path), a clean `npm run
typecheck`/`npm run lint`, and no regression in the four other real-Postgres suites that also apply
migration `0031`. Full evidence in
`docs/v2/phase14-commercial-launch/known-risks-and-launch-limitations.md` (now moved from "Known
residual risk" to "Resolved this pass") and `test-evidence.md`.
