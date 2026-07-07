# Phase 5 v1.1 Repair Log

## Repair decision

Phase 5 v1 did not pass approval because it implemented the visible assessment engine but left several control-grade gaps around N/A applicability, methodology immutability, database-side submission locks and edge-case testing. Phase 5 v1.1 repairs those blockers before any scoring work begins.

## Repairs completed

| Gap identified | Phase 5 v1.1 repair |
|---|---|
| N/A was mostly controlled by a simple `n_a_allowed` flag | Added shared N/A rule engine in `src/lib/respondent/na-rules.ts` and database-side profile-derived N/A checks in `0005_phase5_v1_1_guards.sql`. |
| Hard-gate N/A could be selected manually without a real profile rule | Hard-gate N/A now requires exposure-profile rules to return true; otherwise save/submit is rejected. |
| Autosave rejected incomplete N/A reasons too early | Draft autosave now permits incomplete N/A reason text, but progress/submission only treats N/A as complete once the reason has at least five characters. |
| Clearing a draft answer could leave stale saved values | Non-N/A null answers are now treated as draft clear/delete actions. |
| Submit relied too much on progress only | Submit now performs question-by-question validation, including N/A eligibility and minimum reason length. |
| Assessment lock was application-level only | Added database triggers preventing answer/exposure insert/update/delete once the assessment is no longer draft or has `submitted_at`/`locked_at`. |
| Methodology seed could mutate active methodology after use | Added database triggers blocking updates/deletes to used methodology versions and methodology child tables. |
| Critical-control count ambiguity | V1 is reconciled as 19 critical controls, of which 17 are hard gates. This is documented and enforced in the smoke check. |
| Smoke check was surface-level | Smoke check now checks guard migration, N/A rule engine, critical/hard-gate counts, conditional N/A count, no-scoring guardrails, lock guards and expanded test documentation. |

## Approved V1 counts for Phase 5 onward

| Item | Count |
|---|---:|
| Domains | 10 |
| Questions | 68 |
| Conditional N/A questions | 11 |
| Critical controls | 19 |
| Hard-gate controls | 17 |
| Exposure factors | 8 |

## Important boundary

Phase 5 v1.1 still does not score the assessment, generate a Free Snapshot, create an order, unlock reports or generate PDFs. It only captures, autosaves, validates and locks assessment inputs so that Phase 6 can score them reliably.
