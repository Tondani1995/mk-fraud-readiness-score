# Phase 14 Known Risks and Launch Limitations

This document lists every residual risk, disclosed environment constraint, and deliberately
deferred item known at the close of this remediation pass. Nothing here is hidden or silently
accepted — each item has an owner, a way to detect it, and a plan.

## Deliberately deferred findings

### L4 — `supabase-migration-replay.yml` branch-name exclusion guard

Not restructured this pass; documented in place (see the workflow file and
`round-7-remediation-register.md`). Owner: platform-engineering. Target: 2026-10-16 or the next
Phase 1/Phase 14 branch-topology change, whichever comes first. Current risk: low — the fail mode
is a wasted/likely-failing CI job against an ephemeral database, not a production impact.

### M13 (partial) — Next.js CVEs

`security/dependency-audit-exceptions.json` documents this exception: this repository's own
`docs/v1/phase14/no-go-boundary.md` prohibits a Node/Next/React version upgrade during this
remediation pass, so the Next.js-major-version CVEs identified by `npm audit` are tracked as a
time-boxed exception (expires 2026-10-16) rather than fixed. Owner: platform-engineering.

### L4/L5 area — the `supabase-migration-replay.yml` schema-equivalence hash pin

The workflow's absolute-equality assertion for "fresh vs. upgraded schema at current head" is
currently a recorded/observed value rather than a pinned literal, because migrations `0026`–`0030`
(renumbered from `0024`–`0028` after merging `main`'s Phase 2-3 work — see
`architecture-and-state-machine.md`'s "Migration renumbering" note) changed the real hash and this
sandbox cannot mint a new correct pinned value (no Docker/Supabase CLI available here). **Action
required**: re-pin (or explicitly decide to leave as an observed value) from this PR's first real
CI run. See `production-activation-runbook.md` Section 2.

## Known residual risk (not a Round 7 finding — disclosed for completeness)

### Flaky test: `phase14-delivery-reconciliation-tests.mjs` test #4

"Concurrent duplicate webhook never double-applies" failed intermittently in this sandbox
(observed 2 of 3 re-runs with zero code changes in the loop) — a timing-sensitive race in the test
harness's two-real-concurrent-Postgres-client setup, not in the H4 idempotency logic itself. This
predates this remediation pass and is unrelated to any change made in it. It requires separate
investigation (likely a harness synchronization fix, not an application fix) before this specific
test can be trusted as a reliable CI gate. Until resolved, a red run of this specific test in CI
should be re-run once before treating it as a real regression, and should not be used as evidence
that H4's actual database-level idempotency guarantee (the `provider_event_id` uniqueness
constraint and dedup logic in `ingest_phase14_provider_webhook`) is broken — that guarantee is
enforced at the database constraint level, not by the test's timing.

## Disclosed environment constraints (not defects)

### Development sandbox Node version

This development sandbox runs Node.js 22.22.3. Production and CI (`engines.node: "24.x"` in
`package.json`, `actions/setup-node@v4` with `node-version: '24'` throughout the workflows) run
Node 24. This is a pre-existing, previously-disclosed gap between the development environment used
for this remediation pass and the actually-enforced runtime; it does not indicate the application
targets the wrong runtime.

### `phase14-node24-chromium-smoke.mjs` cannot complete in this sandbox

The packaged Chromium binary (`@sparticuz/chromium`) requires Amazon Linux 2023 shared libraries
(`libnss3` and related) that this sandbox's ARM64 Linux environment does not have, so the real
render smoke test fails at browser-process launch here specifically. This is a sandbox limitation,
not a code defect — GitHub Actions' `ubuntu-latest` runners have the required libraries, and this
same test is wired into `live-uat.yml` as real CI's actual rendering proof. See
`architecture-and-state-machine.md`'s "Rendering proof" section for the exact failure observed and
why it is expected.

### `M7`, `M8`, `M10` — documentation gap, not a code gap

This session could not locate the original Round 7 finding text, a corresponding commit, or any
docs reference for findings M7, M8, or M10 anywhere in this repository. They are carried forward as
"previously closed" per this engagement's standing instruction to preserve completed work absent a
failing regression, but this is flagged honestly as a real gap: **the original Round 7 review
register (external to this repository) is the only way to re-verify M7/M8/M10 with the same
rigor applied to every other finding in this pass.** If that register is available, it should be
consulted and this document updated before treating M7/M8/M10 as confidently closed.

## Launch operating model reminders (not risks — for completeness)

- Every automation flag defaults to `false` and the security gate defaults to unsatisfied;
  production today has neither the schema nor the flags to run any Phase 14 automation. Nothing in
  this remediation pass changes production behaviour by itself — see
  `production-activation-runbook.md` for the explicit, staged, reversible activation sequence.
- The R50,000 MK-validated engagement remains explicitly out of scope for automation, unchanged by
  this remediation pass.
- **Corrected claim**: an earlier version of this document (before this branch merged `main`)
  stated "no Stitch/payment webhook route exists in this repository." That was true only relative
  to this branch's own work — it was never true of the repository as a whole once Phase 2-3's
  payment automation PR (#28) merged to `main`. The real current state, after merging `main` into
  this branch: `src/app/score/api/webhooks/stitch/route.ts` and `src/lib/payments/stitch-adapter.ts`
  exist, added by Phase 2-3 and reviewed under its own, separate review process (see
  `docs/v2/phases-2-3/payment-automation-implementation.md` and
  `docs/v2/phases-2-3/payment-current-state-and-root-causes.md`). Per that implementation's own
  documentation: "Runtime mode defaults to `disabled`; the only implemented active mode is an
  in-process double. It makes no live request." (`payment-automation-implementation.md:17`). No
  live Stitch credentials are configured or required for this state, and no production activation
  of Stitch has occurred as part of either branch's work. This is Phase 2-3's own scope, not a
  Round 7 finding and not fixed by this remediation pass — noted here only so this document does
  not misstate the repository's actual current contents.
