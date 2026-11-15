# Staged assessment: review engine build 1.6 and the version-aware integration foundation

Delivery for MK's direction of 11 November 2026 (17:24), continuing from `3f933ac` on `review/mk-integrated-readiness`. Local commits only: nothing is pushed, merged or deployed, no production score or commercial pathway is changed, and every session is fictional.

This delivery is a working staged assessment on the fictional harness and the non-scoring foundation the revised method needs before any calculator is activated. It is not authorisation to release a new scoring method, and it produces no score. Blocking items **B2, B3, B4, B5, B6, B7, B11 and J-01 remain open** (`RELEASE-DECISION.md`).

## 1. What was built

| Item in MK's direction | What exists now | Where | Evidence |
|---|---|---|---|
| 4. Review engine build 1.6 | Staged completion in one session (core, breadth, function packages) with no screen ceiling; every applicable confirmation in all tiers; resumability; selectable depth questions; accountable-function packages, area delegation and declines | `src/lib/readiness-review/vendor/review-engine-build-1.6.cjs` (composes build 1.5, whose file and hash are unchanged) | B16-01 to B16-13 and six journey tests (19 of 19) |
| 4. Methodology-version dispatch | Each run is scored only by its own family's calculator; the revised family is registered and refuses to score. Routing the protected MFRS scorer through it was held as a patch (P-5); MK withdrew that on 11 November (18:33) and it is replaced by version-based dispatch from the assessment's own record (`VERSION-DISPATCH.md`) | `src/lib/scoring/methodology-dispatch.ts`; `patches/score-assessment-dispatch.patch` | Parity: eight fixed and five adaptive MFRS cases byte-identical to results pinned at `3f933ac`; the integrity guard passes |
| 4. Revised input adapter | Report input 1.3.0 (additive to 1.2.0) and adapter 0.1.0 that turns it into a methodology-neutral context; scoring status `inactive` | `report-input.ts`, `revised-adapter.ts` | B16-13 |
| 4. Methodology-scoped content registry | Report content looked up by family; MFRS lookups delegate unchanged; bank 1.3 content (question, options, levels, records, risks, owner, objectives, scenario) for all 902 live questions; the D3 code collision resolved by family | `src/lib/reports/methodology-content.ts` | Dispatch parity tests 6 to 8 |
| 4. Regression fixtures | Pinned MFRS parity inputs and results; build 1.6 golden journeys | `scripts/fixtures/` | `methodology-dispatch-parity-tests.mjs`, `readiness-review-build16-tests.mjs` |
| 5. Stage progress and delegation | Stage completion replaces the 95-screen measure in 1.6 sessions; outstanding information and progress by function; owner decline with a reason; the organisation chooses which depth questions to send | Interview header and side panel, Snapshot and management status, owner package, send panel | Screens 01 to 09 (`staged-assessment/screens/`), B16-07, B16-12 |
| 1, 2, 3. Research | The 17 uncovered objectives; depth by information gain with a re-ranking test; consistency checks per profile | `objectives/OBJECTIVES-REVIEW.md`, `staged-assessment/INFORMATION-GAIN-AND-CONSISTENCY.md` | `review.mjs --check`, `information-gain.mjs --check` |
| 7. Journeys | Respondent and function journeys for strong, weak, mixed, small, unknown-heavy and overstated profiles; a completed stage resumed by a correction | `staged-assessment/JOURNEYS.md` | Golden fixtures; B16-03 |

## 2. How build 1.6 behaves

Build 1.6 is selected only when the fictional harness is on (`MK_READINESS_REVIEW_HARNESS=fictional-local`) and `MK_READINESS_REVIEW_ENGINE=1.6` is set; it never runs in production (`VERCEL_ENV=production` forces 1.5). The build a session was created with is recorded in its ruleset and every replay uses it, so 1.5 sessions keep the 95-screen engine and contract 1.3.0 exactly as before.

**Stages.** The core stage is complete when every applicable tier 1 confirmation has an answer or is with a function, the activities screen has been answered and no consistency question is waiting. The breadth stage is complete when the same is true of every applicable confirmation in all tiers. Function packages follow. Counts are "so far": a later answer can bring further confirmations into scope or take them out, and the stage moves back if it does.

**No ceiling.** The respondent answers until every applicable confirmation is reached. In the fictional journeys that took 141 to 167 screens for a retail group and 96 for a small owner-managed firm. At screen 95, where build 1.5 stops, the retail profiles had reached 59 to 79 of 108 confirmations.

**Packages.** Questions reach a function in four ways: the respondent answered "I don't know"; the respondent delegated an area; an owner's answer opened a confirmation; or the organisation sent depth questions. Packages can be sent once the core stage is complete and sent again as answers arrive; a question already with a function is never assigned twice, and one question is one task.

**Declines.** A function can decline a question assigned to it, or a delegated-area question on its screen, with a reason. The question is then listed as outstanding with the reason, is not served again to that function and is not reassigned without a decision. A decline does not hold the stage open: what happens next is a fulfilment decision for MK. An answer of "I don't know" from the function is reported the same way.

**Corrections.** A correction that brings questions into scope reopens a completed stage and serves them; answers a correction takes out of scope are kept in history as stale and asked again, not silently reused, if they come back.

**Consistency checks.** After a tier 1 or tier 2 confirmation is reported fully in place, the first follow-up that applies and has not been asked is asked straight away, at most one per area and ten in all. Each outcome is recorded as consistent, narrower scope, partial operation, not yet operating, conflicting, untested in practice (no case yet) or missing information, and reported with the population and the number not tested. No figure is changed by any outcome; F2 and F4 stay inactive.

**Depth by information gain.** Candidates are valued by what their answer could change, never by a ranking of findings: coverage questions (the only question on an objective no confirmation covers), diagnostics of partly reported controls and follow-ups, with credit for tier, for questions other practices depend on and for objectives with no known answer. A scenario whose confirmations are in place is investigated when one of its supporting practices has already been reported as a gap, and a question blocked by a fact is replaced by that fact. At most 15 depth questions per function, four diagnostics per scenario and two coverage questions per objective; the selection is recomputed on every send.

## 3. What the research found

**The 17 objectives** (`objectives/OBJECTIVES-REVIEW.md`). Five meet all four tests for a scored confirmation and are proposed as confirmations on the scenarios they already belong to, with no new question, wording, scenario, tier or weight: D2-I-01 (risks described as specific schemes) on FS-D2-01, D4-P-01 (approval before commitment) on FS-D4-05, D5-V-01 (headcount verification) on FS-D5-02, D5-H-01 (high-risk roles identified) on FS-D5-12 and D3-A-03 (training for high-risk roles) on FS-D3-10. Nine remain diagnostic and three sit outside the scored frame. The five changes move the overstated profile P6b by 2.6 points against 24.5 under A+C: most of the A+C movement comes from 59 maturity and detail practices, and scoring them would make the number measure the depth of a domain's question set. The overstatement P6b models is a contradiction between answers, which the consistency check finds (six conflicting answers for P6b against one for P6c, whose frames are identical). Two data findings: the contract-management module is gated by D4-S-07, a practice-typed question in a scope objective that the interview never asks, and the last-case module by D10-S-05, a fact nothing asks; build 1.6 now reaches both through depth gates. None of the proposals is applied to coverage map 1.3.

**Depth by information gain** (`staged-assessment/INFORMATION-GAIN-AND-CONSISTENCY.md`). Against the earlier priority-eight selection, information gain found more gaps behind confirmations reported in place (43 against 22 for P6b) and changed the answers-aware top eight by more issues for four profiles. Measured against eight issues chosen before any depth answer, depth never changes the ranking, which is why that test is circular. For the small firm it found fewer gaps (5 against 14): its threshold leaves out tier 2 and 3 diagnostics, and whether the threshold relaxes when few confirmations apply is a burden decision for MK.

**Consistency.** The population, the checks selected and tested, each outcome and the confirmations not tested are reported for every profile. A strong profile tests 10 of 68 eligible confirmations; 58 are untested and no report may say otherwise.

## 4. Commercial release gates kept

| Gate | How it is kept |
|---|---|
| The Free Snapshot must not present a tier 1 score as an approved overall readiness score | The MFRS Free Snapshot, its scoring and routes are unchanged. The review Snapshot carries no number in 1.5 or 1.6 and says so; the screenshot check refuses a numeric score on the page. The revised family refuses to score. |
| Essential and Comprehensive continue through the existing engines | No report engine, product code, price, order, entitlement, storage or delivery file changed: `git diff 3f933ac -- src` touches only the review track and two new modules (dispatch and registry), and the integrity guard over every protected library, API, font and package file passes. The registry is not yet read by the engines. |
| Stage completion, outstanding information, waiting periods and reissues remain MK commercial decisions | The engine reports stages and outstanding information; nothing is gated on them commercially. |
| No evidence review in automated products; Advisory separate | Build 1.6 adds no evidence or reviewer step; consistency checks are labelled self-reported and not evidence. |

## 5. Results

| Suite | Result |
|---|---|
| Build 1.6 (`scripts/readiness-review-build16-tests.mjs`) | 19 of 19 |
| Methodology dispatch, MFRS parity and content registry (`scripts/methodology-dispatch-parity-tests.mjs`) | 8 of 8 |
| Review contract, build 1.5 (`scripts/readiness-review-contract-tests.mjs`) | 23 of 23 |
| Report engine Phase 2 (`scripts/readiness-review-report-engine-tests.mjs`) | 17 of 17 |
| Database store, local backend | 24 of 24, cleanup verified |
| Stage-progress screens (`scripts/readiness-review-build16-screens.cjs`) | 10 of 10 page checks at 1440 and 390px; accessibility scan of six staged pages at both widths: 0 violations (8 incomplete contrast results listed in `screens/axe.json`) |
| Research checks (objectives, information gain, earlier scoring and depth checks) | pass |
| Every other test suite under `scripts/` (158), here and at `3f933ac` | 93 pass in both, 65 fail in both with the same first error, none regresses; parked commands 29 of 30 (recovery-postgres cannot run here); integrity guard passes |
| Type check and lint | clean |

## 6. Limitations

Build 1.6 runs only on the fictional file harness and, through the same contract, the local database backend; hosted tests remain blocked (B1). Function screens and journey burdens come from deterministic fictional answers, not from people. The decline flow has no reassignment path, by design, until MK decides one. The consistency rule, the depth weights and limits and the stage definitions are proposals. The five objective changes are not applied. Every item in `UNRESOLVED-METHODOLOGICAL-DECISIONS.md` is open.
