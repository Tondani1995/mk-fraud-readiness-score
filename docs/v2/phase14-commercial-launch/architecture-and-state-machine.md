# Phase 14 Architecture and State Machine

## Scope

This document describes the current (post-Round-7-remediation) architecture of the autonomous
premium report engine on branch `launch/phase14-commercial-readiness`. It supersedes nothing in
`docs/v1/phase14/autonomous-premium-report-engine.md`, which remains the canonical product-outcome
description; this document adds the operational state-machine and control-flow detail needed to
run and support the system.

## Deterministic authority (unchanged)

Scoring, maturity, exposure, domain coverage, gaps, maturity caps, and roadmap priority/owner/
severity/actions remain entirely deterministic. The AI layer is restricted to evidence-cited
narrative prose within bounded fields; it cannot alter or restate an authoritative number, band,
or count without being rejected by `validatePremiumReportNarrative`
(`src/lib/reports/automation/validation.ts`).

## Fulfilment state machine

Table `report_fulfilments` (migration `0017`) holds one replay-safe state machine per
(order, score run). Statuses, in normal-path order:

```
queued -> assembling -> generating -> validating -> rendering -> storing -> ready_for_delivery -> completed
                                                                                              \-> failed
```

`ACTIVE_STATUSES` (`src/lib/reports/automation/fulfilment.ts`) is the subset treated as "in
flight" for idempotency purposes: `queued`, `assembling`, `generating`, `validating`, `rendering`,
`storing`, `ready_for_delivery`. `getActivePremiumReportFulfilment` uses this set to find (and thus
reuse, rather than duplicate) an in-flight fulfilment for the same order.

Transitions go through `transition_premium_report_fulfilment`, called either directly (privileged
client path) or via `executePhase14WorkerStep` under a worker lease (see "Worker leases and
capabilities" below). Every transition records `current_step`, optionally `generation_mode`,
`report_id`, and (on `incrementAttempt`) an incremented `attempt_count`.

## Narrative pipeline (`src/lib/reports/automation/narrative-pipeline.ts`)

```
preparePremiumReportNarrative
  |
  |-- flags disabled / no generator / no identity --> fallbackResult('ai_*_disabled/unavailable')
  |
  |-- build evidence pack + SHA-256 evidence checksum
  |-- scan organisationName for prompt injection (M4) --> suspicious? fallbackResult, no AI call made
  |
  |-- generator.generate() [durable, at-most-once-dispatch via durable-ai-attempts.ts]
  |     |
  |     |-- plan fails structural check (validatePremiumReportAiEditorialPlan) --> attemptRepair()
  |     |-- plan passes --> build narrative, run validatePremiumReportNarrative (full fact-check)
  |           |-- ok --> mode: 'ai'
  |           |-- not ok --> attemptRepair()
  |
  |-- attemptRepair() [at most one repair attempt, budget-enforced by durable-ai-attempts.ts]
        |-- repair plan fails structural check --> fallbackResult('ai_repair_plan_validation_failed')
        |-- repair narrative fails fact-check --> fallbackResult('ai_repair_narrative_validation_failed')
        |-- repair narrative passes --> mode: 'ai_repair'
        |-- repair call itself throws --> fallbackResult('ai_repair_failed:<reason>')
  |
  |-- any AI generation call throws --> fallbackResult('ai_generation_failed:<reason>')
```

Every terminal path returns a `PreparedPremiumReportNarrative` carrying `mode`
(`'ai' | 'ai_repair' | 'deterministic_fallback'`), the evidence pack, its checksum, the
validation result, and (for AI/repair paths) the `generation`/`repairGeneration` provenance
records — see "AI provenance" and "Rendering proof" below.

### AI provenance

Every AI dispatch attempt is persisted to `report_generation_runs` **before** the provider is
called (`src/lib/reports/automation/durable-ai-attempts.ts`), keyed by `evidence_checksum` +
`requested_model` + `attempt_kind`, and updated afterward with `resolved_model`, `provider`, and
(M1) a classified terminal `status` (`succeeded`, `failed_before_provider`,
`provider_result_uncertain`, `reconciliation_required`, ...). This gives every report a traceable
answer to "what evidence, what model, what provider, what attempt number produced this narrative,
and did the provider definitely receive the request." The evidence pack itself excludes contact
details, EFT details, admin notes, access tokens, and secrets (data minimisation — see
`docs/v1/phase14/ai-provider-boundary.md` and `provider-data-controls.md`), and L1 (this
engagement) added pattern-shaped output-side checks (email/JWT/AWS-key/vendor-secret/opaque-hex/
Supabase-URL) as a backstop against anything unexpected surfacing in generated prose regardless.

### Rendering proof

`scripts/phase14-node24-chromium-smoke.mjs` compiles the real `src/lib/reports/render-pdf.ts` with
the TypeScript compiler and drives an actual `@sparticuz/chromium` + `puppeteer-core` render of a
representative HTML document, asserting a valid PDF buffer (`%PDF` header) comes back. It also
statically asserts the renderer uses the supported zero-argument `chromium.executablePath()` call
and does not spoof AWS Lambda runtime environment variables. **Disclosed environment constraint**:
this smoke test cannot currently complete inside this development sandbox — the sandbox's ARM64
Linux environment lacks the Amazon Linux 2023 shared libraries (`libnss3` and related) that the
packaged Chromium binary requires, and fails at browser-process launch
(`Unterminated quoted string` / exit code 2), a pre-existing, previously-disclosed constraint of
this development sandbox, not a regression introduced by this remediation pass. It is expected to
run to completion on GitHub Actions' `ubuntu-latest` runners (which have the required libraries)
and is wired into `live-uat.yml`'s `phase14:test-node24-pdf` step, which is real CI's actual
rendering proof.

## Worker leases and capabilities

Automated (non-human-initiated) transitions go through `executePhase14WorkerStep`
(`src/lib/reports/phase14-security.ts`), which requires a `Phase14WorkerLease` — a scoped
capability grant rather than a raw service-role client, so a worker can only perform the specific
step it holds a lease for. Human-initiated actions (admin manual generation) go through
`createPhase14PrivilegedClient` directly, gated by the `phase14_security_gates` table (see below).

## Security gate (`phase14_security_gates`, migration `0017`)

A single `required_version`/`satisfied_version` pair is authoritative over every automation flag.
While `satisfied_version < required_version`, AI dispatch, email dispatch, reconciliation
mutation, and webhook ingestion all fail closed regardless of the `app_settings` flags below —
this makes flipping a flag alone insufficient to enable anything; the gate must be raised first,
deliberately, by an authorized admin via `set_phase14_security_gate_version`.

## Automation flags (`app_settings`, migration `0017`)

| Flag | Default | Effect when true (and gate satisfied) |
|---|---|---|
| `premium_report_auto_fulfilment_enabled` | `false` | Marking an eligible R5,000 order `payment_received` queues a fulfilment automatically. |
| `premium_report_ai_narrative_enabled` | `false` | AI narrative generation runs instead of always falling back to deterministic content. |
| `premium_report_auto_email_enabled` | `false` | Report email is sent automatically on completion. |
| `premium_report_test_recipient_override` / `premium_report_test_recipient_override_enabled` | `null` / `false` | Redirects all automated report email to a fixed test address regardless of the real customer recipient — for staged rollout only. |

Missing configuration, a database error, or an unsatisfied security gate always resolves to
automation disabled (fail closed), per `docs/v1/phase14/autonomous-premium-report-engine.md`.

## Storage and delivery

Report PDFs are rendered, uploaded to a temporary path, checksummed (SHA-256), copied to a final
path, and only then does the temporary object get removed — in that order — so a failure after
copy but before cleanup leaves the final object already verified-committed and the cleanup safely
retryable (`src/lib/reports/storage-publication.ts`). Cleanup-result classification
(`src/lib/reports/storage-error-classifier.ts`, hardened for L7 this session) is deliberately
narrow: only an exact HTTP 404 + provider "not found" match is ever trusted as "confirmed deleted";
every other outcome, including a malformed/throwing error, resolves to "not confirmed" and is
retried. Downloads are re-verified against the persisted checksum before being served
(`src/lib/reports/download-verification.ts`).

## Webhook ingestion (Resend delivery events)

`src/app/score/api/webhooks/resend/route.ts`: global rate limit (L5, this session) → 64 KiB
body-size cap → HMAC-SHA256 svix signature verification with a ±300s timestamp replay window →
`ingest_phase14_provider_webhook` RPC, which independently re-verifies an HMAC attestation minted
by the route and deduplicates by `provider_event_id`. H4's reconciliation logic
(migration `0028`) additionally correlates a "lost response" delivery attempt (one whose
`provider_message_id` was never captured because the original send's HTTP response was itself
ambiguous/lost) via `delivery_attempt_ref` tags Resend echoes back on the webhook event.

## Migration ledger (this remediation pass)

| Migration | Purpose |
|---|---|
| `0017_phase14_canonical_disabled_foundation` | The complete, disabled-by-default Phase 14 foundation: fulfilment/generation-run/report-link tables, security gate, automation flags, RLS. |
| `0023_phase1_manual_fulfilment_recovery` | Phase 1 stabilisation (unrelated branch topology; see L4). |
| `0024_phase23_payment_automation` | Not part of this remediation pass — landed on `main` via the separately-reviewed Phase 2-3 payment automation PR (#28), merged into this branch. Adds the Stitch payment adapter/webhook foundation; `provider_mode` defaults to `"disabled"` (see `known-risks-and-launch-limitations.md`). |
| `0025_phase23_assessment_resume` | Not part of this remediation pass — same Phase 2-3 PR; native assessment resume capability. |
| `0026_phase14_workflow_start_admin_recovery` | H2. Renumbered from `0024` during this remediation pass to resolve a migration-number collision with Phase 2-3's `0024`/`0025` after merging `main` — see "Migration renumbering" below. |
| `0027_phase14_delivery_ambiguity_admin_resolution` | H4 admin resolution path. Renumbered from `0025`. |
| `0028_phase14_attestation_canonicalisation_hardening` | H4 `delivery_attempt_ref` correlation. Renumbered from `0026`. |
| `0029_phase14_ai_attempt_cross_kind_budget` | M2/M3. Renumbered from `0027`. |
| `0030_phase14_ai_attempt_pre_dispatch_budget_exclusion` | M1 — excludes `failed_before_provider` attempts from the spend budget. Renumbered from `0028`. |
| `0031_phase14_delivery_event_recency_precision_fix` | H4 concurrency-determinism fix (this session) — layers a corrected `apply_email_provider_event_atomic` on top of `0017`'s definition, truncating the recency-guard comparison to millisecond precision so a client-supplied, millisecond-truncated event timestamp can never be spuriously treated as stale against a microsecond-precision database timestamp. Not a renumbering — this is a new migration, added after the renumbering above. |

None of `0017`, `0023`–`0031` have been applied to production as part of this remediation pass.
See `production-activation-runbook.md` for the controlled application procedure.

### Migration renumbering (this branch, post-`main`-merge)

This branch was created before Phase 2-3's payment automation PR (#28) merged to `main`. Both
branches independently added migrations at version numbers `0024` and `0025` — Phase 2-3's own
payment/resume migrations on `main`, and this branch's H2/H4 admin-recovery migrations. After
merging `main` into this branch, that collision was resolved by renumbering only this branch's
Phase 14 migrations (originally `0024`–`0028`) to `0026`–`0030`, preserving Phase 2-3's `0024`/
`0025` unchanged. Every internal cross-reference (SQL comments, TypeScript comments citing a
migration number, test-harness migration-application lists, and this documentation set) was
updated to match — see the merge and renumbering commits on this branch for the exact diff.
