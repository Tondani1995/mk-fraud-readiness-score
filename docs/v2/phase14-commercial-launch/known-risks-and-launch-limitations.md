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

### H6/M14 — the `supabase-migration-replay.yml` "fresh vs. upgraded schema" equivalence check is currently red for real

This branch's first real CI run against Docker/Supabase CLI (this sandbox has never had either
available, so this specific check was never previously exercised) surfaced a genuine, currently
unresolved divergence: `fresh_hash` (canonical migration `0017` + the full `0023`–`0031` ledger)
does not equal `upgrade_hash` (the historical incremental `docs/v1/phase14/migration-audit-archive/
uat-applied/` snapshot + `scripts/phase14-uat-canonical-reconciliation.sql`, applied twice for a
safe-restart idempotency check, + the same `0023`–`0031` ledger). Every other step in this
workflow -- the full 0001-0031 replay, every Phase 14 SQL test suite (transactional remediation,
AAL2/security-gate, fourth/fifth/sixth adversarial remediation, multi-session concurrency, atomic
capability completion, service-role mutation guards, signed webhook route-to-database, database
lint, grant inventory) -- passes cleanly on this exact head. Only this specific relative-equality
assertion (not a pinned literal -- there is no separate pin to re-pin; see the workflow file's own
inline note) currently fails.

**Not yet root-caused.** Local reproduction attempts (a disposable embedded-postgres harness
replaying both paths) hit successive environment-fidelity gaps of their own (PL/pgSQL
`check_function_bodies` forward-reference validation stricter than Supabase's real Postgres image;
`phase14_private` schema ordering) that made local diagnosis unreliable -- real CI is the
authoritative environment here and it genuinely disagrees between the two paths, not just this
sandbox. The workflow has been updated (this session) to persist **both** raw schema inventories
to disk (`tmp/migration-replay/fresh-canonical-schema-inventory.txt` and
`upgrade-canonical-schema-inventory.txt`) and auto-generate a unified diff
(`fresh-vs-upgrade.diff`) in the uploaded evidence artifact whenever they differ, specifically so
the exact diverging schema objects can be inspected directly from the next real CI run's artifact
without needing another round trip just to capture the data. **Action required**: pull that diff
from the next CI run on this branch and determine whether the divergence is a real defect (the
reconciliation script needs updating to match a change made to canonical `0017` during this
remediation pass -- most likely candidate given the pattern of every other bug found this session)
or an artifact of the historical archive path itself, then fix and re-verify. This is the one
concrete, currently-open gap blocking `Supabase Migration Replay` from being fully green. See
`production-activation-runbook.md` Section 2.

## Resolved this pass (was a known residual risk)

### H4 concurrency-determinism: `phase14-delivery-reconciliation-tests.mjs` test #4 — fixed, not a harness race

Earlier disposition of this item (superseded by this section) claimed the intermittent failure of
"concurrent duplicate webhook never double-applies" was a timing-sensitive race in the test
harness itself, unrelated to application logic. That claim was investigated directly rather than
accepted: PL/pgSQL `RAISE NOTICE` instrumentation of a real failing run (both concurrent
transactions traced by `txid_current()`) proved the harness's synchronization was not the cause —
the two-client race always serialised correctly through `apply_email_provider_event_atomic`'s
`select ... for update` dedup path, and the "loser" of the race was never a data-integrity problem.

The real, narrow root cause: `apply_email_provider_event_atomic`'s recency guard compared
`p_event_created_at` (client-supplied, millisecond precision — both Resend's webhook payload and
this application's own `new Date().toISOString()` calls truncate to milliseconds) against
`v_email.delivery_updated_at` (database-set via Postgres `now()`, microsecond precision) with
`>=`. A concrete traced example from a real failing run: `delivery_updated_at = 19:34:20.630181`
vs. `p_event_created_at` (after truncation) `= 19:34:20.630000` — 181 microseconds "earlier" purely
from truncation noise, causing a genuinely current, rank-increasing webhook event to be spuriously
rejected as stale. This is a real correctness defect independent of concurrency (concurrent
delivery merely made it reliably reproducible in testing, since it is the one place these two
timestamp sources are captured close enough together for the precision gap to matter).

**Fix**: migration `0031_phase14_delivery_event_recency_precision_fix.sql` truncates both sides of
the comparison to millisecond precision via `date_trunc('milliseconds', ...)`, preserving the
guard's event-ordering intent while removing the spurious sub-millisecond rejection. Verified via:

- `node scripts/phase14-delivery-reconciliation-tests.mjs` run 20 consecutive times with zero
  failures (previously ~2 of 3 runs failed with zero code changes in the loop).
- Test #4 was also strengthened to assert the underlying database invariant directly (not just the
  RPC's self-reported counters): exactly one `email_provider_events` row for the raced
  `provider_event_id`, exactly one `phase14_provider_attestations` row for the same, exactly one
  `email_events` row bound to the resulting `provider_message_id`, and — behaviourally — that a
  fresh, non-force-resend authorization attempt after the race resolved reuses the existing send
  (`reused_existing_send: true`) rather than being permitted to dispatch a duplicate.
- No regression in the other four real-Postgres suites that also apply migration `0031`
  (`phase14-ai-attempt-budget-tests.mjs`, `phase14-delivery-entitlement-wiring-tests.mjs`,
  `phase14-report-access-eligibility-tests.mjs`, `phase14-workflow-start-reconciliation-tests.mjs`)
  — all pass cleanly.
- `npm run typecheck` and `npm run lint` clean after the change.

See `round-7-remediation-register.md`'s H4 entry and `test-evidence.md` for the evidence citation.

## Unresolved -- not a deferred finding, a genuine gap

### M7, M8, M10: original Round 7 finding text is unrecoverable

The Round 7 remediation register lists M7, M8, and M10 as "carried forward" from a prior session
in this engagement. Neither that session nor this one could locate the original finding text
anywhere accessible: not in this repository's git history or docs, not in the imported MK Fraud
knowledge project (its saved memory is unrelated, stale Phase 10-era content), and not anywhere
else in available context -- despite an expectation that it would be available. The user was asked
directly and confirmed: do not fabricate finding text or a disposition to close these out.

**These three findings are not fixed, not proven safe, and not deliberately deferred with an owner
and date -- they are simply unknown.** Whatever M7/M8/M10 originally identified has not been
verified against the current codebase at all this remediation pass. A controller with access to
the original Round 7 review document must supply the finding text before these can be genuinely
dispositioned. Until then this is an open, unquantified gap in this branch's security review
coverage and should be treated as such in any commercial-launch go/no-go decision -- not waved
through as "previously handled." See `round-7-remediation-register.md`'s M7/M8/M10 entries.

### Security Scans / L3 (CodeQL) currently red: repository setting, not a code defect

GitHub Code Scanning is not yet enabled for this private repository (confirmed via the GitHub API:
`code-scanning/alerts` returns 403 "Code scanning is not enabled for this repository"). The
`sast` job's CodeQL analysis itself runs to completion successfully; only the final results-upload
step fails, because there is nowhere in GitHub's UI for it to upload to yet. M11 (dependency audit)
and M12 (secret scanning) -- the other two jobs in the same `Security Scans` workflow -- both pass.
This requires the repository owner to enable Code Scanning once in
**Settings → Code security and analysis** (see `production-activation-runbook.md` Section 5.3);
it cannot be enabled from this development sandbox or fixed by any workflow YAML change.

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
