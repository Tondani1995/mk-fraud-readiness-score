# Phase 5 Implementation Notes

## Phase 5 boundary

Phase 5 implements the assessment engine only. It collects and locks assessment inputs so Phase 6 can score them. It does not calculate scores, generate snapshots, create orders, verify payments or generate reports.

## Phase 5 v1.1 repairs

The v1.1 repair closes approval gaps found in the first Phase 5 package:

- profile-derived N/A rules are now enforced in both TypeScript and database guardrails;
- hard-gate N/A cannot be selected unless exposure answers make the control genuinely inapplicable;
- autosave no longer fails simply because an N/A reason is still being typed;
- draft answer clearing is supported so stale N/A/numeric values are not left behind;
- submit performs question-level validation rather than relying only on overall progress;
- database triggers block answer and exposure changes after submission/lock;
- database triggers prevent active methodology mutation after assessments exist;
- critical-control counts are reconciled as 19 critical controls and 17 hard gates.

## Important technical decision

N/A is not a general respondent opt-out. N/A is available only where the approved question allows it **and** the exposure profile supports genuine inapplicability. A respondent reason is still required before submission, but the reason alone is not enough.

## Why the database guardrails matter

The application uses server-side service-role operations after validating respondent tokens. That is correct for an accountless respondent flow, but it also means RLS alone cannot be the only control. Phase 5 v1.1 therefore adds triggers that enforce draft-only edits and methodology-version consistency at database level.

## Phase 6 dependency

Phase 6 may rely on:

- one active methodology version seeded as `MFRS-V1.0`;
- submitted assessments being locked;
- answer rows being tied to the correct methodology questions;
- exposure answers being tied to the correct methodology exposure factors;
- N/A answers already passing profile-derived eligibility;
- incomplete N/A answers being blocked at submit;
- no score run existing until Phase 6 creates one.
