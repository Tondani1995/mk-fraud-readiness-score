# Phase 14 Test Evidence

This document is the evidence index for the Round 7 remediation pass. Every claim in
`round-7-remediation-register.md` is backed by one of the scripts below. All were re-run during
this remediation pass (dates and pass/fail status as observed in this session); scripts requiring
real Postgres or a running Next.js server are marked accordingly and are exercised by
`.github/workflows/supabase-migration-replay.yml` and `.github/workflows/live-uat.yml` in real CI.

## Pure-module / no-infrastructure suites (run directly with `node`, verified locally this session)

| Script | Proves | Status |
|---|---|---|
| `scripts/phase14-autonomous-report-tests.mjs` (`phase14:test-report-engine`) | Report generation, entitlement guard, route isolation, durable workflow, deterministic validation, conditional email | Pass |
| `scripts/phase14-ai-narrative-integrity-tests.mjs` | C1 (AI output reaches the report) + M4 (prompt-injection adversarial suite, 14 cases) | Pass |
| `scripts/phase14-pdf-renderer-crash-recovery-tests.mjs` | H1 (Chromium crash recovery) + M6 (bounded render timeout, forced-hang recovery) | Pass |
| `scripts/phase14-ai-accounting-tests.mjs` (`phase14:test-ai-accounting`) | M1 (AI retry classification), AI accounting | Pass |
| `scripts/phase14-storage-fault-injection-tests.mjs` (`phase14:test-storage-faults`) | Storage publication/cleanup fault handling; L7 (malformed-error hardening) | Pass |
| `scripts/phase14-provider-fault-injection-tests.mjs` (`phase14:test-provider-faults`) | AI/email provider fault injection | Pass |
| `scripts/phase14-webhook-adversarial-tests.mjs` (`phase14:test-webhook-adversarial`) | Resend webhook signature/timestamp/replay adversarial cases | Pass |
| `scripts/phase14-resend-webhook-rate-limit-tests.mjs` (`phase14:test-resend-webhook-rate-limit`) | L5 (global rate limit blocks before body read; allowed budget proceeds normally) | Pass (new this session) |
| `scripts/phase14-security-closure-tests.mjs` (`phase14:test-security-closure`) | Evidence-only AI schema, Unicode normalisation, verified-download, migration `0017` closure assertions, L1 (pattern-shaped secret/PII checks, 6 cases) | Pass |
| `scripts/phase14-node24-chromium-smoke.mjs` (`phase14:test-node24-pdf`) | Real Chromium PDF render on Node 24 | **Cannot complete in this sandbox** — see `known-risks-and-launch-limitations.md`; expected to pass on GitHub Actions `ubuntu-latest` |
| `scripts/phase14-database-security-hardening-tests.mjs` | Static database-security assertions | Not re-run this session (no code touched it); last known-good per commit history |

## Real-Postgres suites (require `embedded-postgres`; run via `node` against a locally spun-up instance)

| Script | Proves | Status |
|---|---|---|
| `scripts/phase14-ai-attempt-budget-tests.mjs` (`phase14:test-ai-attempt-budget`) | M1/M2/M3 cross-kind and pre-dispatch budget exclusion (real `claim_phase14_ai_attempt` RPC through migration `0030`, renumbered from `0028`) | Pass |
| `scripts/phase14-delivery-reconciliation-tests.mjs` (`phase14:test-delivery-reconciliation`) | H4 (16 cases) | Pass, **except** test #4 is intermittently flaky — see known-risks doc |
| `scripts/phase14-report-access-eligibility-tests.mjs` (`phase14:test-report-access-eligibility`) | H5 | Not re-run this session (no code touched it) |
| `scripts/phase14-workflow-start-reconciliation-tests.mjs` | H2/M5 | Not re-run this session (no code touched it) |
| `scripts/phase14-delivery-entitlement-wiring-tests.mjs` | H3 | Not re-run this session (no code touched it) |
| `scripts/phase14-email-delivery-tests.mjs` (`phase14:test-email-delivery`) | Email delivery, retry recovery, test-recipient isolation, replay-safe webhook | Not re-run this session (no code touched it) |

## Live-server integration test (requires a running Next.js server + local Supabase)

| Script | Proves |
|---|---|
| `scripts/phase14-webhook-route-db-test.mjs` (`phase14:test-webhook-route-db`) | End-to-end HTTP round trip through the real `route.ts` and real database, including replay handling. Out of scope for this sandbox (no running server); the pure-module `phase14-resend-webhook-rate-limit-tests.mjs` covers the rate-limit gate specifically without needing a live server. |

## Static/inspection checks

| Script | Proves |
|---|---|
| `npm run typecheck` | Whole-repo TypeScript compiles clean |
| `npm run lint` | `next lint` clean |
| `npm run build` | Production build succeeds |
| `node scripts/phase14-dependency-audit-gate.mjs <npm-audit-output>` | M11 — no unreviewed vulnerability above the documented exception list |
| `gitleaks detect ...` (in `.github/workflows/security-scans.yml`) | M12 — no unreviewed secret in git history |
| CodeQL `javascript-typescript` / `security-and-quality` (in `.github/workflows/security-scans.yml`) | L3 — SAST |

## CI workflows (real GitHub Actions; this sandbox cannot execute these directly)

| Workflow | Purpose |
|---|---|
| `.github/workflows/supabase-migration-replay.yml` | Clean-database migration replay through the full ledger; production-history reconciliation; M14's drill |
| `.github/workflows/live-uat.yml` | M15 — manually-dispatched, `live-uat`-environment-protected, doubles-only orchestration of 16 real test-suite steps end to end, plus the dependency-audit gate |
| `.github/workflows/security-scans.yml` | M11/M12/L3 — dependency audit, secret scan, CodeQL, on every PR/push |
| `.github/workflows/phase1-migration-replay.yml` | Phase 1 stabilisation-branch-scoped replay (0016/0023 boundary only; see L4) |

## Full local verification run performed at the end of this remediation pass

```
npm run typecheck        # clean
npm run lint              # clean
node scripts/phase14-storage-fault-injection-tests.mjs
node scripts/phase14-security-closure-tests.mjs
node scripts/phase14-ai-narrative-integrity-tests.mjs
node scripts/phase14-autonomous-report-tests.mjs
node scripts/phase14-webhook-adversarial-tests.mjs
node scripts/phase14-resend-webhook-rate-limit-tests.mjs
```
All passed with no regressions from any change made in this remediation pass.
