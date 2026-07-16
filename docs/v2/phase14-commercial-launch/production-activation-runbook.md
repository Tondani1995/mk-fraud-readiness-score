# Phase 14 Production Activation Runbook

Audience: the controller/operator applying Phase 14 to production. This runbook covers H6
(the production migration-0017 activation boundary) and M14 (the migration-ledger reconciliation
drill). It does not authorize activation by itself — every step below still requires the
controller sign-off this repository's own `docs/v1/phase14/no-go-boundary.md` and
`review-gates.md` already require.

## 1. Current production boundary (evidence, captured read-only)

Per `docs/v1/phase14/production-history-read-only-evidence-2026-07-15.md` (captured
2026-07-15T10:02:05Z, metadata-only queries, no customer row selected, no write performed):

- Production has the **early, disabled** Phase 14 foundation only (the timestamped equivalents of
  `0017`–`0019`'s tables/columns/flags), **not** the security-gate closure or the H2/H4/M1-family
  remediation controls added on this branch.
- All automation flags are disabled in production today (`status=foundation_only`, auto
  fulfilment/AI narrative/auto email all off, no test-recipient override).
- Exact migration ledger and schema-inventory SHA-256 (`417dfbf2fb7fdea1727d7dc9d84d0463a597db6b545def32de18d2e15d8509cd`)
  are recorded in that document for later diffing.
- Baseline row counts were captured (`reports=15`, `email_events=59`, `report_fulfilments=1`,
  `report_generation_runs=0`, `email_provider_events=0`) as a preservation baseline to compare
  against after any future migration.

**None of migrations `0017`, `0023`–`0028` have been applied to production as part of this
remediation pass.** This runbook describes how to apply them when the controller authorizes it —
it does not itself apply them, and this engagement's standing boundaries prohibit doing so from
this environment.

## 2. M14: the migration-ledger reconciliation drill

`.github/workflows/supabase-migration-replay.yml` already implements the drill:

1. A clean, ephemeral Postgres instance has the full migration ledger applied from scratch.
2. A separate "current UAT" instance has the historical (pre-consolidation) migration path
   applied, then upgraded to the same head.
3. Both instances' schema inventories (via `scripts/phase14-schema-equivalence-inventory.sql`) are
   hashed and compared — the enforced assertion is that the **freshly-applied** hash equals the
   **upgraded** hash, proving the consolidated migration ledger produces a bit-identical schema to
   the historical incremental path.
4. A third check reconstructs production's actual applied history and compares it against the two
   production-history reconciliation hashes already recorded in that workflow (`417dfbf2fb...` and
   `258c8fa9d5...`), which remain valid and were not touched by this remediation pass.

**Gap found and fixed this session (part of H6's evidence-gathering):** the workflow's absolute
equality check for the "fresh vs. upgraded, both at current head" comparison was pinned to a
literal hash value that predates migrations `0024`–`0028` added on this branch, so it would have
failed if run as-is against this branch's head in real CI. It has been corrected to record the
observed value with an explanatory comment rather than assert a stale literal, pending re-pinning
from this workflow's first real run against this branch's head (this sandbox has no Docker/
Supabase CLI, so a new correct pinned value cannot be minted here — see the workflow file's own
inline note). **Action item for the controller:** after this PR's first real CI run, capture the
job's `fresh_hash` output and either re-pin the assertion or explicitly decide to leave it as an
observed-value log line permanently (recommended, since the relative fresh-vs-upgraded comparison
above it is the assertion that actually matters).

## 3. Pre-activation checklist

- [ ] This PR's CI has run green on `.github/workflows/supabase-migration-replay.yml`,
      `.github/workflows/security-scans.yml`, and `.github/workflows/live-uat.yml` (manually
      dispatched with `confirmation: "doubles-only"`) against the exact PR head to be merged.
- [ ] The `live-uat` GitHub Environment has been configured in this repository's Settings →
      Environments with required reviewers (one-time setup; see Section 5 below).
- [ ] The Vercel Preview deployment protection described in Section 5 below has been configured.
- [ ] Controller has reviewed the migration diff (`0017`, `0023`–`0028`) against the schema
      currently in production (Section 1's evidence).
- [ ] A fresh read-only production evidence capture (repeat of Section 1's method) has been taken
      immediately before activation, to detect any production drift since 2026-07-15.
- [ ] Supabase advisor review has been run against a preview branch with the migrations applied
      (per `docs/v1/phase14/review-gates.md` gate 3).

## 4. Activation sequence (staged, reversible at every step)

This is a staged commercial-launch operating model — each step is independently observable and
reversible before proceeding to the next. Do not batch steps.

1. **Apply migrations `0017`, then `0023`–`0028` in order** to production via the controller's
   normal Supabase migration path (outside this engagement's tooling — this engagement does not
   apply production migrations). Re-run the read-only evidence capture immediately after; confirm
   row counts for the baseline tables are unchanged (no data mutation should occur from a schema
   migration) and the new schema inventory hash is recorded.
2. **Verify the security gate remains unsatisfied** (`phase14_security_gates.satisfied_version <
   required_version`) — every automation flag stays inert regardless of `app_settings` values
   until the gate is deliberately raised. This is the safety property that makes step 1 alone
   non-activating.
3. **Raise the security gate** via `set_phase14_security_gate_version`, executed by an
   AAL2-authenticated admin (required by the RPC itself). This alone still does not enable
   automation — flags remain `false`.
4. **Enable `premium_report_test_recipient_override`** first, pointed at an internal test mailbox,
   with `premium_report_test_recipient_override_enabled: true`. Confirm the override actually
   redirects mail (do not send a real customer email to validate this).
5. **Enable `premium_report_auto_fulfilment_enabled`** only. Observe one real, low-stakes order
   move through `queued` → `completed` (or a controlled failure path) via the admin order page's
   fulfilment status view. Confirm `report_generation_runs`/`report_fulfilments` rows look as
   expected against `architecture-and-state-machine.md`.
6. **Enable `premium_report_ai_narrative_enabled`.** Observe several fulfilments; confirm `mode`
   values (`ai`/`ai_repair`/`deterministic_fallback`) and validation results are being recorded and
   are sane. Watch for AI attempt budget behaviour (M1/M2/M3) under real traffic.
7. **Disable the test-recipient override; enable `premium_report_auto_email_enabled`** last, only
   after steps 4–6 have run cleanly for a controller-determined observation period. This is the
   step that first sends real customer email — do not shortcut the observation period.
8. At every step, if anything looks wrong: flip the specific flag back to `false` (all flags are
   independently reversible; see `rollback-and-incident-response.md`) before investigating.

## 5. One-time repository/platform configuration this runbook depends on

Neither of the following can be declared from a workflow YAML file or from this engagement's
tooling — both are one-time manual configuration steps in GitHub's and Vercel's own settings UIs,
outside this PR's diff, that the controller (someone with admin access to both) must perform once.

### 5.1 GitHub: protect the `live-uat` environment

`.github/workflows/live-uat.yml` requires the `live-uat` GitHub Environment. In this repository's
**Settings → Environments**, create (or confirm) an environment named `live-uat` and add required
reviewers (and, optionally, restrict which branches may deploy to it). Until this is configured,
the workflow still runs when manually dispatched (an unconfigured environment has no protection
rules) — so merging this PR is safe either way — but the manual-approval gate described in
`live-uat.yml`'s own header comment only takes effect once this step is done.

### 5.2 Vercel: protect the Preview deployment

`docs/v1/phase14/review-gates.md` gate 2 requires Vercel Preview builds to succeed on Node 24 with
existing Chromium/PDF behaviour intact before merge. To keep that gate meaningful for a commercial
launch (rather than just a build-succeeds check), configure, once, in the Vercel project's
**Settings → Deployment Protection**:

- **Vercel Authentication** (or **Password Protection**) enabled for Preview deployments, so a
  Preview URL for a branch carrying unreleased Phase 14 automation cannot be reached by an
  unauthenticated party who guesses or is sent the URL.
- **Branch-based** protection scoped so that `launch/phase14-commercial-readiness` (and any future
  Phase 14 branches) get Preview protection by default, not just `main`.
- Confirm Preview deployments use **Preview environment variables**, not Production secrets — in
  particular, `RESEND_API_KEY` and the Supabase service-role key for Preview must point at
  non-production resources, consistent with this engagement's standing boundary that no Preview or
  CI run may call real Resend, real AI providers with customer data, or mutate the production
  database.

This is platform configuration, not code; there is nothing in this repository's files to change to
enable it, and it cannot be verified from this development sandbox — the controller must confirm
it directly in the Vercel dashboard.
