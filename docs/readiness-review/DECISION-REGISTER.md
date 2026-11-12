# Decision register: staged assessment delivery (11 November 2026)

Concise record of what this delivery decided, what it only proposes, and what it leaves to MK. "Implemented" means built in the fictional harness and inactive for customers; nothing here changes a production score, price, product, order, entitlement or report. The open methodological questions are set out in `UNRESOLVED-METHODOLOGICAL-DECISIONS.md`.

## Taken by MK (inputs to this delivery)

| # | Decision | Source |
|---|---|---|
| K-1 | The 95-screen ceiling is replaced by staged completion within one assessment | MK, 11 November, 17:00 and 17:24 |
| K-2 | All applicable scenario confirmations are the candidate basis for the final Fraud Readiness Score (candidate, not approved) | MK, 17:24 |
| K-3 | Free Snapshot, Essential, Comprehensive and Advisory, their prices, orders, entitlements, storage and delivery are preserved | MK, 17:24 |
| K-4 | No evidence review in any automated product; Advisory stays separate | MK, 17:24 |
| K-5 | F2 score adjustments and F4 maturity caps stay inactive until MK approves them | MK, 17:24 |
| K-6 | Coverage practices are not added to the score automatically | MK, 17:24 |

## Engineering decisions in this delivery (implemented, inactive)

| # | Decision | Why | Evidence |
|---|---|---|---|
| E-1 | Build 1.6 composes build 1.5 without changing it; selected only by the fictional harness with `MK_READINESS_REVIEW_ENGINE=1.6`; never in production | Keeps every 1.5 session, hash and test as it was | B16-01, contract tests 23 of 23 |
| E-2 | A session records its build; staged sessions use contract 1.4.0 and action schema 2; 1.5 sessions stay on 1.3.0 | Replay never reinterprets a record under other rules | B16-02 |
| E-3 | Core stage: every applicable tier 1 confirmation reached, activities screen answered, no consistency question waiting. Breadth: the same for all tiers | Stages measured by the method's own scenario picture, not by screens | B16-J, B16-12 |
| E-4 | Gap follow-ups are not put to the respondent; they are package candidates | Keeps the respondent on confirmations | Journeys |
| E-5 | Consistency check: one follow-up after a tier 1 or 2 confirmation reported fully in place, one per area, ten in all; outcomes recorded, never applied | Deterministic, applicability-aware and honest about what was not tested | B16-05, research section 5 |
| E-6 | Depth by information gain, never by a ranking of findings; contested scenarios and dependency gates; recomputed on every send; the organisation can choose | MK's item 2 | B16-06, research sections 1 to 4 |
| E-7 | Declines keep the question outstanding with the reason, are never re-served or reassigned automatically and do not hold a stage open | Avoids duplicate tasks and leaves fulfilment to MK | B16-07 |
| E-8 | A function's "I don't know" is reported as outstanding ("not known by the function") | Distinguishes it from a question still waiting | View model, screens |
| E-9 | One question is one task: a question assigned to a function, or declined, is never served through a delegated area | Overlapping assignments | B16-08 |
| E-10 | A correction that brings questions into scope reopens a completed stage; answers taken out of scope are kept as stale and reconfirmed | Resumability without losing valid answers | B16-03, B16-04 |
| E-11 | Stage progress replaces the 95-screen measure for 1.6 sessions only | MK's item 5 | B16-12, screens 01 to 09 |
| E-12 | Report input 1.3.0 is additive to 1.2.0; adapter 0.1.0 produces a methodology-neutral context with scoring `inactive` | Integration foundation without a calculator | B16-13 |
| E-13 | Methodology-version dispatch with parity pinned at `3f933ac` for eight fixed and five adaptive cases; the revised family refuses to score. Superseded on 11 November (18:33) by E-17: the family is now resolved from the assessment's recorded mode, methodology and graph pin | Historical MFRS behaviour preserved before any new calculator | Dispatch parity tests 1 to 5; integrity guard passes |
| E-14 | Method-scoped content registry; MFRS lookups delegate unchanged; not yet read by the report engines | D3 collision resolved by family | Dispatch parity tests 6 to 8 |
| E-15 | Workload measured per actor from the action log and combined per person by stated staffing | MK's item 5 | B16-09, `JOURNEYS.md` |

## Proposed for MK (not applied)

| # | Proposal | Evidence |
|---|---|---|
| P-1 | Five questions already in bank 1.3 become confirmations on the scenarios they belong to: D2-I-01 (FS-D2-01), D4-P-01 (FS-D4-05), D5-V-01 (FS-D5-02), D5-H-01 (FS-D5-12), D3-A-03 (FS-D3-10). No new question, wording, scenario, tier or weight | `objectives/OBJECTIVES-REVIEW.md`, `proposed-coverage-changes.json` |
| P-2 | Nine objectives stay diagnostic (asked in packages, reported as findings and blueprint current state); three sit outside the scored frame | Same |
| P-3 | D4-S-07 retyped as a fact (it gates the contract-management module but is typed as a practice in a scope objective) | Same |
| P-4 | The stage definitions, consistency rule, depth weights, threshold and limits in E-3, E-5 and E-6 adopted as the method's rules | `staged-assessment/INFORMATION-GAIN-AND-CONSISTENCY.md` |
| ~~P-5~~ | **Withdrawn (MK, 18:33).** The patch passed a null graph-version identifier and read nothing the assessment recorded; it is removed and no exception is requested. Replaced by E-17 | `VERSION-DISPATCH.md` |

## Integration prototype delivery (MK direction, 11 November, 18:33)

| # | Decision | Why | Evidence |
|---|---|---|---|
| E-16 | The standard assessment's status is four separate statements: interview, function packages, information and report eligibility. Completion is the interview completed with nothing outstanding; a decline, an unanswered question and a function's "I don't know" are outstanding, never resolved; report eligibility is shown as not determined by the assessment. Evidence review and reviewer actions are shown only in a separate Advisory section, with every record kept | MK's product boundary | SS-01 to SS-09; contract test C-09 updated; screens `standard-status-screens/` |
| E-17 | Methodology dispatch resolved from `assessment_mode`, the methodology version code and the adaptive graph pin (id, version, fingerprint), failing closed with a reason; one entry point that calls the unchanged scorers; routes and scorers untouched | MK item 2 | `VERSION-DISPATCH.md`; VD-01 to VD-09 |
| E-18 | Build 1.6 offers to hand an area to its function at the area's first question; a confirmation in a handed-over area counts as with a function for the stages | MK item 3; the timing experiment | `staged-assessment/delegation/DELEGATION-TIMING.md`; SS-08, SS-10 |
| E-19 | Consistency outcomes worded as self-reported cross-checks: "no case yet" replaces "untested in practice", and reports state the number cross-checked and the eligible population and conclude nothing about the rest | MK item 4 | Engine 1.6 labels; Essential diagnosis panel |
| E-20 | Report integration prototype: a revised evidence model (the fraud scheme as the unit), reworked Essential presentation content and Comprehensive scenario facts, all in new files, feeding the unchanged engines; numbers from a labelled test fixture | MK items 5 and 6 | `REPORT-COMPARISON.md` |

| # | Proposal (not applied) | Evidence |
|---|---|---|
| P-6 | Of the five candidate confirmations (P-1): D2-I-01 only as a route-conditional confirmation; D4-P-01 distinct but covering half of FS-D4-05 (second confirmation or a separate scheme); D5-V-01 distinct, moving to the core stage; D5-H-01 and D3-A-03 not adopted as confirmations | `objectives/CANDIDATE-CONFIRMATIONS.md` |
| P-7 | Withdrawn on MK's direction of 12 November. The prototype's presentation conventions (scheme tier to selection reasons, risk priority, likelihood and impact labels, the 30, 60 and 90-day windows) adopted for customer reports | `src/lib/reports/revised/evidence-model.ts`; `REPORT-COMPARISON.md` section 6 |

Decisions that block taking the reports further are R-1 to R-3 in `REPORT-COMPARISON.md` section 6.

## Reporting-quality correction (MK direction, 12 November)

R-1 to R-3 are now prototype conventions for testing (MK item 4), and P-7 is withdrawn: MK directed that tier and answer class are not turned into ratings, periods or deadlines. Summary and change register: `REPORT-QUALITY-CORRECTION.md`.

| # | Engineering decision (prototype, inactive) | Basis | Evidence |
|---|---|---|---|
| E-21 | Answers that appear to conflict are classified pair by pair into five relationships; only a direct contradiction or a method-established dependency leaves a confirmation unresolved; unreviewed pairs default to a complementary weakness | MK item 1 | `CONTRADICTION-CLASSIFICATION.md`; RQ-01, RQ-02 |
| E-22 | No priority, likelihood, impact, difficulty, period or deadline is derived; risks read "Not rated"; work is ordered by information, decision, prerequisites, build, strengthen and operate (presentation convention PC-1) | MK item 2 | RQ-03 |
| E-23 | Answer and standard wording per response format in one module; context questions never given a standard; method content gaps declared, not filled | MK item 3 | `METHOD-CONTENT-GAPS.md`; RQ-04 to RQ-06 |
| E-24 | R-1: the calculated figure is labelled a test fixture everywhere and leaves the cover headline when unresolved answers affect 3 or more schemes or 10% of tier 1 schemes reported covered | MK item 4 | RQ-07 |
| E-25 | R-2: stages, outstanding information, analytical sufficiency and release kept separate; candidate rules A, E and C in a tested evaluator, connected to nothing commercial | MK item 4 | `INFORMATION-SUFFICIENCY-AND-RELEASE.md`; RQ-08 |
| E-26 | R-3: concise Comprehensive management sections on the existing style sheet; each control once; consolidated roles; appendices A to I and a supporting workbook, reconciled | MK item 4 | RQ-09 |
| E-27 | Build 1.6 cross-check label "Conflicting answer" replaced by a neutral label; the outcome code is unchanged | MK item 1 | Engine rehash; build 1.6 suite 19 of 19 |

| # | Proposal (not applied) | Evidence |
|---|---|---|
| P-8 to P-12 | Prioritisation method: option A now, option B (MK priority groups with an MK-approved direct-loss list) for the first paid version; wording; no exposure questions yet | `PRIORITISATION-METHODOLOGY-PROPOSAL.md` |
| R2-a to R2-e | Candidate sufficiency and release rules and thresholds | `INFORMATION-SUFFICIENCY-AND-RELEASE.md` |
| C-1 | Approve the relationship classification and table; carry "requires" relationships in the method; review the remaining 770 pairs | `CONTRADICTION-CLASSIFICATION.md` |
| C-2 | Method content for practice questions: target state, records and cycle | `METHOD-CONTENT-GAPS.md` |
| C-3 | Confirm or adjust the R-1 trigger and the R-3 shape | `REPORT-QUALITY-CORRECTION.md` |

## Reserved for MK

Every item in `UNRESOLVED-METHODOLOGICAL-DECISIONS.md`, and the release blockers **B2, B3, B4, B5, B6, B7, B11 and J-01, which remain open** (`RELEASE-DECISION.md`).
