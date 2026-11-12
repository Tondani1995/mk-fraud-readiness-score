# Report revision: MK's direction of 12 November (second direction), as delivered

Continued from commit `afa6915` on `review/mk-integrated-readiness`. Every organisation is fictional and every calculated figure is a labelled test fixture. The revised scoring method stays inactive. No product, price, historical MFRS report, order, entitlement, payment pathway, production system or shared preview was touched; nothing has been pushed, merged or deployed; release blockers B2, B3, B4, B5, B6, B7, B11 and J-01 remain open. These are fictional prototypes, not certified paid reports: the AI manuscript stage and a real customer workflow remain untested.

## Outcome against the acceptance gate

MK's gate is whether the corrected reports give specific, logically defensible and commercially meaningful management guidance from self-reported information, while distinguishing what the assessment establishes from what remains unknown. On the four fictional organisations, they now do so in four ways they did not before. Each report states separately what was calculated, what is inconsistent, how the answers read and what has been concluded (nothing, because no method is approved), with no maturity band anywhere. The overstated organisation is told that one scenario has answers that cannot both be right and that five raise written questions, rather than being told that six controls cannot operate. Every control acted on has a specific target practice, owner, activities, record, measure, cycle and failure response from a reusable library. The roadmap and the programme are proposed stages with factors for management to order the work, not deadlines or a silent ranking. What remains for MK is set out under "Decisions for MK" below.

## The eight items

| # | Direction | What was done | Where | Evidence |
|---|---|---|---|---|
| 1 | Correct the information-sufficiency evaluator | Rebuilt per promised deliverable: Essential findings and actions; Comprehensive findings, blueprints, governance and programme. Information conditions are separated from method conditions, and only questions actually asked count. Both reproduced defects now fail. Candidate only, connected to nothing commercial | `PRODUCT-SUFFICIENCY-CANDIDATE.md`; `information-sufficiency.ts` | SA-01 to SA-09, 9 of 9, run through the real engine: incomplete breadth, a declined function package, missing blueprint inputs, incomplete governance (two forms), outstanding confirmations, optional diagnostics, information against method, isolation |
| 2 | Correct the answer-relationship model | "Not applicable" excluded; routing never read as dependency; necessary dependency needs reviewed semantics; unreviewed pairs not established. The six pairs reassessed: the AI pair stays a direct contradiction, five become reviewed questions for management. Review table 0.2 | `ANSWER-RELATIONSHIP-RULES.md`; `relationships.ts`; `relationship-review-v0.2.json` | RS-01 to RS-09, 9 of 9, including all 826 pairs and two mutation tests; RQ-01, RQ-02 |
| 3 | Resolve score presentation | Four position statements on the cover and position page of both reports, for every organisation, from one module; the band removed everywhere (visible and hidden); area figures in the method's order in one neutral colour; the R-1 threshold withdrawn | `position.ts`; `essential-presentation.ts`; `comprehensive.ts` | RQ-07; Essential page 2 and Comprehensive Section 1 in the PDF samples |
| 4 | Remove implicit materiality and prioritisation | Headings and question labels rewritten ("Fraud scenarios the answers point to", "How these scenarios could occur", "Management matters requiring attention"); rank numbers and priority columns removed; scenario references in the method's order; programmes alphabetical; every selection states its rule; a factor-based decision method proposed and illustrated | `PRIORITISATION-METHODOLOGY-PROPOSAL.md` (revision at the top); `report-revision/prioritisation-illustration.json` | RQ-03, RQ-15 |
| 5 | Reusable control content | Fifteen archetypes and 146 entries covering every control in the four reports, sourced from the bank's level 4 wording and evidence, MK's MFRS playbooks and the bank's questions; no generic measure remains | `CONTROL-CONTENT-LIBRARY.md`; `control-content/` | RQ-14; 152 generic measures and 692 mechanical activity lines removed |
| 6 | 30/60/90 without invented deadlines | Stages labelled as proposed, windows as "proposed window", the page states that the windows are not deadlines, contractual dates or estimates and that whether a control works is known after its first full cycle; prerequisites only from reviewed dependencies (none remain) | `essential-presentation.ts`; `evidence-model.ts` (`PHASES`) | RQ-16 |
| 7 | Refine the Comprehensive | Structure kept. Appendix C rewritten as one readable block per control; the scorecard grouped by owner without repeating measure text; the action register grouped by stage and owner; a new Appendix J on information coverage; contents page and heading breaks fixed | `comprehensive.ts`; `workbook.ts` | RQ-09 (every register row printed and in the workbook, reconciled) |
| 8 | Corrected evidence | The four organisations rebuilt; before-and-after comparison; full suites with dependency-blocked tests separated; rules, evaluator, enrichment examples, PDF samples and the decision register | `REVISION-COMPARISON.md`; `report-revision/` | Below |

## Change register

| Area | Change |
|---|---|
| Relationships | Review table 0.2 with semantics fields (`holdsWhen`, `whenValue`, `dependency`) and validation; a neutral "not established" status; scenario kind "question to clarify" |
| Sufficiency | Version 0.2: nineteen conditions across six deliverables, named thresholds, information and method conditions apart |
| Position | Four statements in one module used by both reports; no band, no threshold |
| Language | Materiality, priority and ranking wording removed from both reports and the workbook; "fraud scenario" used throughout |
| Content | Control-content library 0.1; blueprints, records, measures and failure responses from it |
| Programme | Proposed planning windows on every stage; actions grouped by stage and owner; prerequisite stage only with reviewed dependencies |
| Oversight | The organisation's own answer reported accurately ("the board" for a board without an audit or risk committee); an unknown answer stated as not identified |
| Comprehensive | Block layout for blueprints; scorecard by owner; Appendix J; contents page no longer clipped |
| Journey driver | Optional hooks for adversarial journeys (`respond`, `answer`, `stopAfterCore`); package sends skipped while the core stage is incomplete; defaults unchanged |

## Verification

| Check | Result |
|---|---|
| Report quality (`report-quality-tests.mjs`) | 16 of 16 (RQ-01 to RQ-16; RQ-14 to RQ-16 new) |
| Answer relationships (`relationship-semantics-tests.mjs`) | 9 of 9, new |
| Product sufficiency (`sufficiency-adversarial-tests.mjs`) | 9 of 9, new |
| Contract, build 1.6, standard status, dispatch, dispatch parity, report engine | 23, 19, 10, 9, 8 and 17, all passing |
| Existing Essential validator on the four Essentials | All pass; no internal identifier and no em dash in any report |
| Integrity guard, TypeScript, ESLint | Pass, clean, clean |
| Full regression run (158 suites) | 93 pass, 65 fail, identical suite by suite to `afa6915`, and the 65 fail for the same recorded causes at `3f933ac` |

The 65 failures, separated as MK asked (`report-revision/suite-run.json`): **24 are dependency-blocked** (15 need embedded Postgres, which cannot start in this environment; 7 need a database URL, Supabase keys or a running database; 2 need an AI provider); 9 fail in the test environment itself (8 module-resolution problems under the test runner and 1 rendered-PDF audit that times out in the parallel run); 3 are operator scripts that need an argument; and 29 are test defects already present at the baseline (17 stale source-text assertions, 10 fixture or behaviour expectations, 2 freeze checks). None is caused by this revision.

PDF samples: the Essential (8 pages each) and Comprehensive (26 to 65 pages) for all four organisations, with the supporting workbook, in the package under `reports/revision/`; the first correction's reports are under `reports/first-correction/` for comparison.

## Decisions for MK

Only these block taking the reports further; each is in `DECISION-REGISTER.md`.

| # | Decision |
|---|---|
| D-1 | Adopt the four-statement position convention for paid reports, and confirm that no band is shown until a readiness method is approved |
| D-2 | Approve the answer-relationship rules and review table 0.2, and commission review of the 770 unreviewed pairs (until then they are not established) |
| D-3 | Approve the factor-based decision method (P-13), the direct-loss classification (P-14) and a preventive or detective attribute per control (P-15) |
| D-4 | Approve the shape and thresholds of the candidate product-sufficiency rules, and what a customer is told when a product's conditions are not met |
| D-5 | Approve the control-content library's archetypes and entries as MK advisory content, name its owner and decide its extension to the remaining practice questions |
| D-6 | Confirm the proposed-stage convention for the 30/60/90 roadmap and the twelve-month programme |
