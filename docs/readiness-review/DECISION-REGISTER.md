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

## Report revision (MK direction, 12 November, second direction)

E-21, E-24 and E-25 are superseded in part, as stated below; the rest of the first correction stands. Summary and change register: `REPORT-REVISION.md`.

| # | Engineering decision (prototype, inactive) | Basis | Evidence |
|---|---|---|---|
| E-28 | Relationship review table 0.2 replaces 0.1 (supersedes the default in E-21): "not applicable" has no relationship; routing is never read as dependency; a necessary dependency needs reviewed semantics and a direct contradiction its holding answers; an unreviewed pair is "not established"; documentation gaps are not proof that a control cannot operate. The six pairs reassessed: one direct contradiction kept, five reviewed questions | MK item 2 | `ANSWER-RELATIONSHIP-RULES.md`; RS-01 to RS-09; RQ-01, RQ-02 |
| E-29 | Scenario kind "question to clarify" for a reviewed pair the answers leave open; unresolved inconsistencies are only direct contradictions and necessary dependencies | MK item 2 | RQ-12 |
| E-30 | Four position statements in both reports for every organisation; no band, visible or hidden; area figures in the method's order; the R-1 threshold of E-24 withdrawn | MK item 3 | RQ-07 |
| E-31 | No materiality, priority or ranking language; no rank numbers; scenario references in the method's order; every selection states its rule | MK item 4 | RQ-03, RQ-15 |
| E-32 | Control-content library 0.1 (15 archetypes, 146 entries) supplies target practice, activities, records, measure, cycle and failure response; a control without an entry uses the method's wording and is flagged | MK item 5 | `CONTROL-CONTENT-LIBRARY.md`; RQ-14 |
| E-33 | The 30/60/90 roadmap and the twelve-month programme are proposed stages with proposed planning windows, not deadlines or estimates; prerequisites only from reviewed dependencies; control actions grouped by stage and owner | MK item 6 | RQ-16 |
| E-34 | Candidate product-sufficiency rules 0.2 per deliverable (supersedes rules A, E and C of E-25), connected to nothing commercial | MK item 1 | `PRODUCT-SUFFICIENCY-CANDIDATE.md`; SA-01 to SA-09 |
| E-35 | Comprehensive refinements: blueprint blocks, scorecard by owner, action register by stage, Appendix J on information coverage | MK item 7 | RQ-09; PDF samples |
| E-36 | Oversight reported from the organisation's own answer; an unanswered oversight question is stated as not identified | Defect found in this revision | SA-05 |

| # | Proposal for MK (not applied) | Evidence |
|---|---|---|
| D-1 | Adopt the four-statement position convention for paid reports; no band until a readiness method is approved | `REPORT-REVISION.md` |
| D-2 | Approve the relationship rules and table 0.2; review the 770 pairs not yet reviewed; decide whether dependency semantics belong in the method itself | `ANSWER-RELATIONSHIP-RULES.md` |
| D-3 (P-13 to P-15) | Approve the factor-based decision method, the direct-loss classification and a preventive or detective attribute per control; decide whether reports show attention groups once approved. Supersedes P-8 to P-12 option B | `PRIORITISATION-METHODOLOGY-PROPOSAL.md` |
| D-4 | Approve the shape and thresholds of the product-sufficiency rules and the customer message when they are not met. Supersedes R2-a to R2-e | `PRODUCT-SUFFICIENCY-CANDIDATE.md` |
| D-5 | Approve the control-content library as MK advisory content, name its owner, and decide its extension to the remaining practice questions. Takes the place of C-2 | `CONTROL-CONTENT-LIBRARY.md` |
| D-6 | Confirm the proposed-stage convention for the roadmap and the programme. With D-1, takes the place of C-3 | `REPORT-REVISION.md` |

## Premium report excellence (MK direction, 12 November, 19:33)

The Reporting Bible v1.1 governs layout and assembly; it supersedes E-35 where the two differ (no appendix; registers in the workbook). Summary: `REPORT-EXCELLENCE.md`.

| # | Engineering decision (prototype, inactive) | Basis | Evidence |
|---|---|---|---|
| E-37 | Manuscript-first construction restored for the revised model: Fact Pack, Story Plan and writer brief per report; manuscript with paragraph provenance and figure slots; factual and editorial validation; plain-text manuscript; composition; manifest. A manuscript that fails validation is never composed | Bible 3 to 5, 16, 21.1 | `report-excellence/`; gates G01 to G03, G11 |
| E-38 | Essential in six movements (19 to 21 pages) and Comprehensive in the Bible sequence (28 to 33 pages); no appendix; Appendices A to J of E-35 withdrawn | Bible 9 to 15; brief items 3 and 4 | Gates G04, G12 |
| E-39 | MK publication system: Poppins embedded, the corporate-profile palette measured from the profile (navy, slate, rules, sage accent), profile-style cover and running header. Production templates unchanged | Brief item 5 | `VISUAL-AND-BRAND-ACCEPTANCE.md`; gate G05 |
| E-40 | Method status moved out of the prose: the position panel reads as a released report would, the calculated result carries a "test fixture" tag, and a composer-rendered prototype notice states what a released report adds | Brief item 7 | Gates G06, G07 |
| E-41 | Bible eight-sheet workbooks for each product, with every register and every control's twelve-field specification; frozen headers, filters, formula-safe; rows reconcile with the model | Bible 15, 20 | Gates G08 to G10 |
| E-42 | South African legal context drawn from the method's own guidance (PRECCA sections 34 and 34A, POPIA section 22) where a finding concerns it; a statute citation is permitted only when a cited legal fact carries that section | Bible 19.1; scorecard dimension 20 | Fact Pack `legal`; validator |
| E-43 | Escalation and proposed service-level wording by control type (gate, periodic, event); service levels labelled as proposals | Defect found in review | Blueprint panels; workbook |
| E-44 | Page-rhythm pass: a section that would start after a near-empty page follows on; each blueprint after the first starts a page | Bible 19.2, 21 | `build-summary.json` (no sparse pages) |
| E-45 | Production AI manuscript run recorded as acceptance test AT-AI-01 with a ready harness; status BLOCKED in this environment | Brief item 2 | `ai-run-status.json`; `excellence-ai-run.mjs` |

| # | Proposal for MK (not applied) | Evidence |
|---|---|---|
| D-7 | Run AT-AI-01 on a machine that holds the gateway credential; review its manuscripts against the 34 dimensions; decide whether manuscripts written under the writer contract outside the production model may ever serve as an owner-approved fallback (Bible 5.2) | `REPORT-EXCELLENCE.md` |
| D-8 | Approve the scenario structures 0.1 and decision options 0.1 as MK advisory content (with D-5 for the control library), and name their owner | `QUALITY-SCORECARD-34.md` dimensions 9, 15 |
| D-9 | Adopt the MK publication system for the production Essential and Comprehensive templates, and confirm sage as the restrained accent (the corporate profile uses it; the website direction of 25 October retired it) | `VISUAL-AND-BRAND-ACCEPTANCE.md` |
| D-10 | Update the Bible where later decisions conflict with it: how the paid report states its conclusion and order of work while D-1 and D-3 are open (C-1, C-2); the production Essential register's missing eighth sheet (C-8); "analytical truth" for self-reported positions (C-9) | `BIBLE-COMPLIANCE-AND-GAP.md` |
| D-11 | Set the Comprehensive depth standard: a finding construction with control interaction and management consequence, at about one and a half times the Essential's length, enforced in the writer brief and validator | `QUALITY-SCORECARD-34.md` dimensions 8, 29, 31 |

## Reserved for MK

Every item in `UNRESOLVED-METHODOLOGICAL-DECISIONS.md`, and the release blockers **B2, B3, B4, B5, B6, B7, B11 and J-01, which remain open** (`RELEASE-DECISION.md`).

## Corrective pass (13 November 2026): decisions reserved for MK

Nothing below is implemented. Each item names what the candidate does today, so that nothing is silently redefined. Prices (Essential R7 500, Comprehensive R35 000, Advisory from R150 000, all incl. VAT), the catalogue, payment logic and issued results are unchanged.

| # | Decision | What the candidate does today | Why it matters now |
|---|---|---|---|
| DR-01 | Does the revised review replace, supplement or stay separate from the scored MFRS assessment for new customers; how historical MFRS results stay distinguishable | **Decided by the owner, 14 November 2026: replace. Switch-over implemented on the review branch, not released (`readiness-release.ts`): with the release switch on and the review able to run, `/score/start` leads to the revised review, the scored start routes refuse new starts, the paid-order route refuses previous-method assessments, and earlier results are labelled as the previous method. Production keeps the scored assessment until the release step lifts the revised track's production refusal.** For new customers the revised review replaces the scored MFRS assessment; the scored assessment stops taking new orders at release. Labelling confirmed by the owner, 14 November 2026: existing MFRS results and reports stay where they are, labelled as produced under the previous method (DR-02 point 6). Until release, the revised track runs only on the restricted test deployment | A customer expecting a numerical result would receive an unscored report; storefront, terms and deliverables must change together |
| DR-02 | The revised scoring frame and the treatment of unknown, unasked and unresolved answers; any readiness conclusion | **Decided by the owner, 14 November 2026; implemented on the review branch (`score.ts`, score 1.0), not released.** Two readings confirmed by the owner on 14 November 2026: "contradicted" covers every scenario whose answers raise a question or cannot both be right (half credit); and the outstanding sentence names unreached scenarios when no question is unanswered, and is left out when unanswered questions hold back no scenario. (1) Unknown and unanswered core answers are left out of the score. (2) Scenarios whose applicability is still outstanding do not count. (3) Controls reported in place but contradicted earn half credit; those with a weaker related practice earn three-quarters credit. (4) Every report carries a score. (5) No report ever concludes that an organisation is "ready": there is always something to find, so the conclusion never states readiness as achieved. The score is a percentage (0 to 100). (6) Earlier scored (MFRS) reports stay where they are, labelled as produced under the previous method. (7) Conclusion wording, agreed by the owner on 14 November 2026: heading "Where [Organisation] stands and what to address next"; paragraph "On its own answers, [Organisation] scores [S]% under the MK Fraud Readiness method, across the [N] fraud scenarios that apply to it. The score shows how far the core controls the organisation reports in place cover those scenarios. It is not a finding that the organisation is protected against fraud, and it does not confirm that any control operates as described, because nothing in this assessment was tested. The responses this report sets out first are where the score can move most directly."; when answers are outstanding, add "[K] questions were not answered, so [M] scenarios are not yet counted; the score may change once they are settled." Rules: no readiness label, band or pass mark; no ranking language; the self-reported and untested basis is stated. Implementing the wording waits on the scoring work | Implementation changes scoring and is owner-reserved; it needs its own reviewed change |
| DR-03 | Treatment of supporting weaknesses, contradictions and unreviewed relationships before "controls in place" carries management meaning | **Decided by the owner, 14 November 2026: they do not change the conclusion.** "In place" rests on the core control answer alone. Weaker related practices, contradictions and unreviewed relationships are reported alongside it as qualifications, never as a downgrade. The existing convention already does this: "every core control in place for N (for M of these the answers raise a question or cannot both be right; for the other K ... though Q of them have a related practice reported weaker, which does not establish that the controls operate)". Areas whose only issues are weaker related practices still read as stable (Marula: seven areas) | The false-comfort risk (review Q5) is reduced, not resolved |
| DR-04 | Product sufficiency: the conditions for ordering, generating and releasing each product with information outstanding | **Decided by the owner, 14 November 2026: at least half must be covered. Implemented on the review branch, not released: the order bridge refuses to bind (`coverage_insufficient`) and generation refuses before any AI call when fewer than half of the applicable scenarios are counted (`score.ts` `reportCoverage`).** A report can be sold and released with answers outstanding only when at least half of the assessment is covered; outstanding answers are disclosed and kept out of the score (DR-02). How "half" is measured is an implementation detail, not an open decision: it is measured on the applicable scenarios counted in the score, so the rule and the score use the same base. Today the bridge requires an ended interview only; the candidate sufficiency rules (0.2) are reported, not enforced; Kestrel was bound with 20 outstanding | A report must not be sold on an assessment MK would not accept |
| DR-05 | Priority and selection conventions | Work is listed in the method's order with stated factors; nothing is ranked. **Confirmed by the owner, 14 November 2026: keep listing; no ranking.** | Listing first must never read as an approved risk ranking |
| DR-06 | Comprehensive depth standard for R35 000 | **Resolved by the owner, 14 November 2026: the Comprehensive depth is accepted for R35 000.** Same themes, findings and pathways as the Essential for the same input (Kestrel 2/5/1, Marula 2/7/3); adds blueprints, governance, decisions, programme and the workbook | Review Q6: the tier difference rests on blueprints and registers |
| DR-07 | Risk Register scope | One risk row per scenario whose core control is a gap or whose answers cannot both be right; findings with a weaker related practice or a question to clarify have no risk row (Marula: 1 risk row for 19 material findings). The workbook now states this rule and its effect. **Confirmed by the owner, 14 November 2026: keep this scope.** | Changing it changes the register's meaning; it is not changed here |
| DR-08 | Operator console access | **Settled by the owner, 14 November 2026:** the current live setup (console bound to the active admin profile, reachable on the custom domains, no passwords or MFA) is preferred and stays. The candidate's exact-host containment was removed; no release changes console access | Do not reintroduce containment or sign-in without a new owner decision |
| DR-09 | Access model for customer roles, function owners and Advisory reviewers | **Decided by the owner, 14 November 2026: keep the private role links.** Customers, function owners and reviewers each enter through their own link, with no account, password or one-time code, for real organisations too. Accepted risk: a forwarded link gives the holder that role, and actions are not tied to a named person | Must be real authentication before any real organisation |
| DR-10 | Control-content library approval | **Approved by the owner, 14 November 2026.** The whole control-content library 0.2 (all entries and archetypes, including the 34 added for the test reports) is approved; recorded as `MK_APPROVAL` in `src/lib/reports/revised/control-content/index.ts`, hashes in `outputs/control-library-0.2-approval-record.json`. The question bank, classifications and method keep their own unapproved status | Formatting is not advice; MK must supply or approve the content, or bound the deliverable |
| DR-11 | Retention and access for the successful-generation audit package | **Decided by the owner, 14 November 2026.** Audit packages in `readiness_review.generation_checkpoints` are kept for 5 years and deleted manually by MK after that; no automatic purge. Access stays service role only | The table is append-only, so a manual deletion path (an owner-run procedure) is still to be prepared |
| DR-12 | Correct the shared "Deterministic report generation started" event note | **Resolved by the owner, 14 November 2026.** Migration `20261114170000_neutral_generation_started_note.sql` changes the note to "Report generation started." for every path; the event type, metadata and grants are unchanged, and past events are not rewritten. Applied to the isolated test database only | Production receives it only with the candidate's migrations, on a separately approved release |
| DR-13 | Revised delivery copy | **Resolved by the owner, 14 November 2026: not needed.** Fulfilment is manual, so no report-ready email is sent. Verified on the review branch: the console's send-email action refuses every report (`manual_customer_delivery_required`: "MK sends the completed deliverable directly after manual preparation."), and nothing calls the report-ready template (`buildReportReadyMessage`) that says "has passed our quality review". If email delivery is ever enabled, that sentence must change first (assurance-mode invariant) | That sentence would be false for a revised report (assurance-mode invariant) |
| DR-14 | Durable background generation for revised orders | **Settled by the owner, 14 November 2026: accepted as a limitation for a first, operator-run, low-volume launch.** Generation stays in the operator request (observed 71 to 183 s against the 300 s platform limit), with checkpoints so a retry resumes rather than rewrites, and overrun calls held at worst case in the ledger. The worker's automatic trigger stays refused for revised orders | Revisit before higher volume, automatic generation after payment, or a slower model |
| DR-15 | Bounded repair policy, order allowance and test campaign budget | One repair per attempt; at most 6 AI calls per order over its lifetime, across attempts and report versions (configurable lower, never higher); every paid call needs an owner-approved campaign budget of calls and cost in `generation_budgets` (proposed: `b5-live-2`, 10 calls, US$1.00); heading length is a warning, not a blocking rule | Sets the cost and retry envelope per order |
| DR-16 | Terms, privacy and delivery copy for the revised service | **Decided by the owner, 14 November 2026: not needed for now.** No separate terms, privacy or delivery copy is drafted for the revised service at this stage | Required before any customer |
| DR-17 | Does Essential include a workbook? | **Resolved by the owner, 14 November 2026: no.** Essential is PDF-only, as the deployed product contract and the candidate already enforce (the validator blocks any Essential manuscript that mentions a workbook; Essential workbook downloads are refused). Reporting Bible v1.1 section 20 is superseded on this point. Excellence gate G01 failing for the four 12 November prototype Essential manuscripts is therefore correct, not a defect | None remaining; the Bible text should be amended to match |
