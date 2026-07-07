# Phase 6 Scoring Contract

## Purpose

Phase 6 converts a submitted Phase 5 assessment into a deterministic, traceable and versioned scoring record. It does not create the Free Snapshot UI, paid report flow, PDF report or benchmarking layer.

## Active scoring source of truth

| Item | V1 value |
|---|---:|
| Domains | 10 |
| Questions | 68 |
| Critical controls | 19 |
| Hard gates | 17 |
| Response scale | 0-5 |
| Coverage minimum for a score | 80% |
| Exposure score | Separate from readiness |

Older references to 16 critical controls are superseded by Phase 5 v1.1 and Phase 6 v1.1.

## Deterministic rule

The scoring engine must use only respondent answers, methodology configuration, question weights, domain weights, N/A rules, exposure answers and approved maturity-cap rules. Generative AI must not calculate, alter or override any score.

## Calculation rules

Each non-N/A answer is normalised as `response_value / 5 * 100`. Domain scores are weighted averages of applicable answered questions. Overall readiness is the weighted average of domain scores using approved domain weights. Valid N/A responses are excluded from numerator and denominator. Exposure is calculated separately and is never added into readiness.

## Maturity-cap rules

The calculated maturity comes from the weighted readiness score. The final maturity may be capped by hard-gate critical controls, three or more critical gaps, or weak core-domain performance. The cap events must be stored so the final maturity is explainable.

## Persistence contract

Scoring persistence must go through `public.complete_score_run_atomic`. The application may calculate the score in TypeScript, but it must persist the score run, domain results, question traces, cap events, assessment status update and audit log through the atomic RPC.

Direct multi-step inserts from the application into score trace tables are not allowed for Phase 6 approval because they can create partial score runs.

## Trace requirements

Every completed score run must have:

- one score run row;
- 10 domain result rows;
- 68 question trace rows;
- zero or more maturity cap event rows;
- a deterministic input hash;
- a completed/locked score-run status;
- an assessment `current_score_run_id` pointing to that completed run.

The database must reject traces that do not belong to the same methodology version and assessment context.
