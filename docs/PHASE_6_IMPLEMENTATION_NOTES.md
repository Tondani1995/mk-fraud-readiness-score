# Phase 6 v1.1 Implementation Notes

Phase 6 v1.1 repairs the scoring layer so Phase 7 is not built on technical debt.

The production scoring function remains `calculateFraudReadinessScore()` in `src/lib/scoring/scoring-engine.ts`. The new direct-engine test transpiles that exact file and calls the exported function, rather than calculating scenarios separately.

The persistence layer now uses `complete_score_run_atomic` in migration `0007_phase6_v1_1_atomic_scoring.sql`. The application calculates the scoring result, builds a deterministic input hash, and sends the summary, domain results, question traces and maturity cap events to the RPC. The RPC inserts all score records and updates the assessment in one database transaction.

The scoring endpoint remains admin-only. Respondents complete and submit assessments, but MK controls scoring until Phase 7 creates the Free Snapshot result layer.

No client-facing result UI, report generation, paid flow, PDF output, benchmarking or AI recommendation logic is added in Phase 6.
