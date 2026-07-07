# Phase 6 v1.1 Repair Log

## Repair decision

Phase 6 v1 was not approved because it carried technical-debt risk into the scoring layer. The scenario tests calculated fixtures separately from the production scoring engine, score persistence used multiple Supabase writes instead of an atomic contract, and database trace integrity did not yet strongly bind score traces to the same assessment and methodology version.

Phase 6 v1.1 repairs those issues and becomes the approval candidate for the scoring engine.

## Repairs completed

| Issue | Phase 6 v1.1 repair |
|---|---|
| Scenario tests did not call the actual scoring engine | Added `scripts/phase6-engine-direct-tests.mjs`, which transpiles and calls `calculateFraudReadinessScore()` from `src/lib/scoring/scoring-engine.ts` directly. |
| Repeatability was not explicitly tested | Direct engine tests run the same fixture twice and require identical output. |
| Score persistence was not atomic | Added `complete_score_run_atomic` RPC in `0007_phase6_v1_1_atomic_scoring.sql`. Score run, domain results, question traces, maturity caps, assessment status and audit log are persisted in one database transaction. |
| Partial scoring failure could leave technical debt | The RPC raises and rolls back on any validation or write failure; no completed-but-partial score run should remain. |
| Trace integrity was mostly application-level | Added `guard_score_trace_identity()` triggers that enforce trace/domain/cap records belong to the same score run methodology and assessment context. |
| Source-of-truth critical-control count was inconsistent | The active source-of-truth is now recorded as 19 critical controls and 17 hard gates, matching the Phase 5 v1.1 methodology seed and Phase 6 tests. |
| Smoke check was too shallow | Updated `phase6:smoke` to run independent scenario reconciliation and direct actual-engine tests, and to check for atomic RPC and trace identity guards. |

## Source-of-truth clarification

The approved V1 implementation source-of-truth is:

- 68 assessment questions.
- 10 domains.
- 19 critical controls.
- 17 hard gates.
- 0-5 response scale.
- Readiness score and exposure score remain separate.
- No generative AI is used in scoring.

If an older document says 16 critical controls, that wording is superseded by Phase 5 v1.1 and Phase 6 v1.1.

## Remaining approval condition

Phase 6 v1.1 remains Supabase-dev-test pending. Before moving to Phase 7, migrations `0001` to `0006` must run in a Supabase development project and a submitted test assessment must produce one completed score run, 10 domain result rows, 68 question trace rows, maturity cap rows where applicable, and assessment status `scored`.
