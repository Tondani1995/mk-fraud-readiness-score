# Phase 14 Rollback and Incident Response

## Principle

Every activation step in `production-activation-runbook.md` was deliberately staged so it can be
reversed independently, without reversing the steps before it. Prefer flag rollback over schema
rollback whenever the symptom can be contained that way — it is faster, has no data-shape
consequences, and is fully covered by the fail-closed defaults already built into this system.

## Flag-level rollback (fastest, safest, first response for almost everything)

Set the relevant `app_settings` flag back to `false` via the admin path (or directly via
`set_phase14_security_gate_version`/`app_settings` update by an AAL2 admin). Effects:

| Flag disabled | Immediate effect |
|---|---|
| `premium_report_auto_email_enabled` | Stops new automated customer email immediately. In-flight fulfilments still complete and reach `ready_for_delivery`; no email is sent from that point until manually resumed. |
| `premium_report_ai_narrative_enabled` | New fulfilments fall back to deterministic content immediately (this is the same code path already exercised continuously by the `ai_feature_disabled` branch of `preparePremiumReportNarrative` — it is not a new/untested path). |
| `premium_report_auto_fulfilment_enabled` | Stops new orders from auto-queuing. Manual generation (the pre-existing operational fallback) remains available via the admin order page. |
| Lowering `phase14_security_gates.satisfied_version` below `required_version` | Fails closed on AI dispatch, email dispatch, reconciliation mutation, and webhook ingestion simultaneously — the broadest, fastest single kill switch. Use this if the specific-flag rollback above isn't narrowing the incident fast enough. |

None of these require a database migration, a deployment, or a schema change, and none affects
in-flight, already-`completed`, or historical fulfilments.

## Schema-level rollback (Phase 14 migrations `0017`, `0026`–`0031`)

Only needed if a flag-level rollback cannot contain the incident (e.g., a defect in the schema or
RPC logic itself, not in application behaviour gated by a flag). Because every one of these
migrations is additive (new tables, new columns with defaults, new functions) rather than
destructive, the lowest-risk rollback is usually **leave the schema in place and rely on flag-level
rollback**, since the schema alone (with all automation flags false and the security gate lowered)
is inert. A true schema rollback (dropping the added tables/columns/functions) should be treated as
a last resort, requires a controller-authored down-migration (none exists in this repository — none
was requested or authorized as part of this remediation pass), and must be rehearsed on a preview
branch first, per `docs/v1/phase14/review-gates.md`.

## Incident playbooks

### AI narrative producing incorrect/ungrounded content in production

1. Disable `premium_report_ai_narrative_enabled` immediately (see flag-level rollback above).
   Existing `validatePremiumReportNarrative` fact-checking should have already rejected the
   specific bad output and fallen back deterministically — if a bad narrative genuinely reached a
   report, that is itself the incident (a validator gap), not just a bad AI response.
2. Pull the corresponding `report_generation_runs` row(s) (keyed by `evidence_checksum` +
   `requested_model` + `attempt_kind`) to get the exact model, provider, evidence checksum, and
   validation result that produced the report — this is the AI provenance trail described in
   `architecture-and-state-machine.md`.
3. Identify which `validatePremiumReportNarrative` rule should have caught it (or didn't exist)
   and treat that as a new finding requiring its own fix and regression test, following the same
   pattern as L1/M4 in this remediation pass — do not silently patch around it.
4. Re-enable only after a fix is verified via `scripts/phase14-ai-narrative-integrity-tests.mjs`
   with a new adversarial case covering the specific failure.

### PDF render failures / stuck workers

1. Check for `phase14_pdf_render_timeout` or Chromium crash-recovery log entries
   (`src/lib/reports/render-pdf.ts`, M6/H1). A bounded timeout (`PDF_RENDER_TIMEOUT_MS`, default
   30s) and automatic browser-relaunch-on-crash are already in place — a stuck worker should
   self-recover within one timeout window.
2. If renders are failing systematically (not just timing out), consider temporarily lowering
   `PDF_RENDER_TIMEOUT_MS` to fail faster and free workers, while investigating the root cause.
3. This does not require disabling `premium_report_auto_fulfilment_enabled` — fulfilments that
   fail rendering surface as `failed` (or repeatedly `rendering`) in the admin fulfilment status
   view rather than silently disappearing, and manual generation remains an operational fallback
   for the affected order.

### Ambiguous/lost Resend delivery response

1. This is exactly the class of incident H4 was built to make recoverable rather than to prevent
   entirely (a lost HTTP response from Resend cannot be prevented at the application layer). Check
   the admin resolution path added in migration `0027` for fulfilments requiring manual
   reconciliation.
2. `scripts/phase14-delivery-reconciliation-tests.mjs` documents the exact state transitions this
   path is expected to produce — use it as the reference for "is this fulfilment's current state
   expected or anomalous."
3. Do not manually resend email as a first response — confirm via the reconciliation path whether
   the original send actually succeeded (Resend accepted it) before resending, to avoid a duplicate
   customer email.

### Resend webhook flood / suspected abuse

1. L5's global rate limit (`RATE_LIMITS.resendWebhookGlobal`,
   `RATE_LIMIT_RESEND_WEBHOOK_GLOBAL_PER_MINUTE`, default 600/min) should already be containing
   pure volumetric flooding. If legitimate traffic is being throttled, raise the env var; if
   illegitimate traffic is getting through the limit, the limit is sized too high — lower it.
2. Because the limit is global (not per-IP; see L5's rationale in
   `round-7-remediation-register.md`), a sustained flood will affect legitimate Resend delivery
   events too once the shared budget is exhausted — this is the accepted tradeoff over risking
   false-positive throttling of legitimate Resend infrastructure IPs. If this tradeoff proves wrong
   in practice, revisit with real production traffic data (Resend's actual sending IP behaviour,
   observed here for the first time) rather than guessing further in advance.
3. Signature verification (HMAC + timestamp window) remains the primary defense and should already
   be rejecting forged/replayed requests before they reach any expensive work — confirm this is
   still functioning (check for a spike in `invalid_webhook` responses vs. `rate_limited`
   responses to distinguish "forged traffic being correctly rejected" from "legitimate traffic
   being rate-limited").

### Migration replay / schema-equivalence CI failure

1. See L4 and M14 in `round-7-remediation-register.md` and `production-activation-runbook.md`
   Section 2 — a stale hardcoded hash in `supabase-migration-replay.yml` was a known, disclosed gap
   at the time of this remediation pass. If the failure is that specific assertion, this is
   expected until re-pinned per the runbook's action item, not a new incident.
2. If the failure is the branch-name exclusion guard (L4) misbehaving, see L4's disposition in the
   register — the documented fail mode is "job runs when it shouldn't" against an ephemeral
   CI-only database, not a production impact; treat as a CI hygiene issue, not a production
   incident.

## Resolved: H4 concurrency-determinism (was a known residual risk affecting incident response)

`scripts/phase14-delivery-reconciliation-tests.mjs` test #4 was previously intermittently flaky.
This session proved (via direct `RAISE NOTICE` instrumentation, not assumption) that it was not a
test-harness timing race but a real millisecond-vs-microsecond timestamp precision bug in
`apply_email_provider_event_atomic`'s recency guard, fixed by migration
`0031_phase14_delivery_event_recency_precision_fix.sql` and verified by 20 consecutive passing
runs. If a real production incident resembles "concurrent duplicate webhook applied twice,"
investigate the real database rows first as this playbook already directs — but this specific test
is no longer a known-flaky signal to discount; a red run of it now indicates a real regression. See
`known-risks-and-launch-limitations.md` and `round-7-remediation-register.md`'s H4 entry.
