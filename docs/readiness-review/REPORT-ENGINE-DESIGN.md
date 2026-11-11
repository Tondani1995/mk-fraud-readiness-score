# Report engine: architecture and output specification

Status: **proposal for MK review. Nothing here is implemented.** No report generation will be built until MK has decided the points in "Decisions for MK" below.

The report engine turns one review session into a management-level report: what the organisation reported about its fraud practice, what MK has seen evidence for and concluded, what is still unknown, and what should happen next. It reads only the report input contract (`REPORT-INPUT-CONTRACT.md`, version 1.1.0) and records every run against the stored answer log.

It is a new, separate path. It does not change, feed or reuse the scoring of the existing commercial Snapshot and Comprehensive products, and the legacy scored reports are untouched (B5 remains open).

## What the report must be able to defend

Every sentence in the report must survive the question "how do you know?". The answer is always one of five kinds of knowledge, and the report keeps them apart in its wording, in its layout and in its data:

| Basis | Meaning | Source in the input | How the report may phrase it |
|---|---|---|---|
| `reported` | Someone in the organisation said so | `control.answer` with `source` and `by` | "The respondent reported…", "Finance reported…" |
| `evidenced` | MK reviewed evidence for an answer version | `control.evidence` with `current: true` | "MK reviewed evidence and found it sufficient / insufficient / contradictory…" |
| `concluded` | An authorised reviewer reached a conclusion | `control.review` with `current: true` and a conclusion | "An MK reviewer confirmed / partly confirmed / did not confirm…" |
| `open` | Not yet known, and why | `control.waiting.provenance`, `openWork`, `scenarios[].undecided` | "Not yet known: waiting for Legal, compliance and ethics…" |
| `not-covered` and `scope` | Not asked, or excluded by a recorded fact | `state` of `unconfirmed`, `scope-unconfirmed`, `prerequisite`, `outofscope`, `proportion`, `assumed`, `precluded` | "Not covered by this review", "Does not apply because…" |

The report never upgrades a basis. A reported practice is never described as evidenced, an evidence record is never described as a conclusion, and nothing open or not covered is ever described as a weakness.

## Principles

1. **One input.** The engine reads the report input and nothing else: not the answer log, the engine, the bank or the store. Every report is therefore traceable to one input digest.
2. **Every statement is traceable.** Each statement is produced by a named rule from a named template, and lists the input fields (JSON pointers) it rests on. A statement cannot contain a value that is not in one of those fields.
3. **No interpretation beyond the method.** The engine selects, groups, orders and words what the input holds. It draws no inference the method does not already make. Where the method has not decided something (a scenario route, an applicability fact), the report says it is undecided.
4. **Unknown is not weak.** Waiting, not asked, not decided and out-of-scope controls appear only under "Open information" or "Not covered", with wording that nothing is concluded about them. They never count towards gaps and never appear in a gap list.
5. **No scoring.** No score, band, rating, maturity level, confidence, percentage, risk level, colour rating or ranking of the organisation, of an area or of a control, and no aggregate that could be read as one. Counts appear only as counts of things, always with what they are counts of and what was not covered. This holds until MK approves a supported method (B4), which would be a separate contract.
6. **Priorities are next steps, not risk rankings.** The report orders what should happen next by a published convention that uses only attributes the method already defines (below). It never says one gap is worse than another.
7. **Deterministic.** The same input, engine version and copy version give the same report, byte for byte. The report's date is the input's `asOf`, never the clock.
8. **Fails closed.** If any validation check fails, no report is produced; the failed run is recorded with the checks that failed.
9. **Honest about status.** Every report states whether the review is complete and why not, that the method is not yet approved by MK, and that it carries no score.

## Architecture

```
stored answer log ──replay──▶ report input 1.1.x ──▶ [1 input gate] ──▶ [2 claims ledger] ──▶ [3 rules] ──▶ statements
                                                                                                   │
                                     [6 run record] ◀── report document ◀── [5 validation] ◀── [4 assembly] ◀┘
                                                              │
                                                              └──▶ [7 renderer, later] ──▶ HTML / PDF
```

| Stage | Module (proposed, `src/lib/readiness-review/report/`) | Does | Must not |
|---|---|---|---|
| 1 Input gate | `input-gate.ts` | Accepts `mk-readiness-report-input` 1.1.x only; recomputes the input digest; checks with the store that `lineage.actionCount` is within the stored log and that `lineage.logDigest` matches the stored prefix | Repair or reinterpret an input |
| 2 Claims ledger | `ledger.ts` | Flattens the input into typed claims, each with a stable id and a JSON pointer: reported practice, answer version and source, evidence record, review record, waiting item with provenance, scope decision, scenario status, undecided route, open action | Add a claim that is not in the input |
| 3 Rules | `rules/*.ts`, rule set `report-rules` 0.1.0 | Pure functions from claims to statements. Each rule has an id, a condition, a template and the claims it cites | Read anything but the ledger; use a number other than a count |
| 4 Assembly | `assemble.ts` | Places statements into sections and orders them by the published conventions | Drop or merge statements silently |
| 5 Validation | `validate.ts` | Runs the checks below on the assembled document | Pass a document with any failed check |
| 6 Run record | `run.ts` | Records the run with `store.recordReportRun`: input digest, log digest and position, engine and rules version, copy version, output digest, or the failed checks | Overwrite an earlier run |
| 7 Renderer (later phase) | separate presentation module | Lays out the report document in the MK brand as HTML and PDF | Add, remove or reword any statement |

Copy (the wording of every template) lives in one versioned table, `report-copy`, separate from the rules, so that MK can approve or change wording (B7) without touching logic. Unapproved copy is marked as such in the document and on every rendered page.

**No generated prose in the first version.** Every sentence comes from a template whose slots are filled only from claims. Whether a language model may ever help phrase the report, and under which controls, is a decision for MK (D6); if it ever does, its output would be held to the same validation as the templates and bound to the same claims.

## Output specification: the report document

Contract name `mk-readiness-management-report`, version **0.1.0 (draft)**. A JSON document; the renderer reads it and nothing else.

### Top level

| Field | Contents |
|---|---|
| `contract` | `{ name, version }` of this document contract |
| `lineage` | `inputContract`, `inputVersion`, `inputDigest`, `logDigest`, `actionCount`, `sessionId`, `asOf`, `engine` (`name`, `version`), `rules` version, `copy` version and whether the copy is approved |
| `status` | `reviewComplete` and `why` (from `method.completeness`), `methodApproval` (from `method.approval`), `scoring: "withheld"` with the fixed statement, `interim: true` while the review is not complete |
| `organisation` | `label`, `fictional`, and the profile facts as recorded (size, turnover, sector and the others), each with who gave it |
| `coverage` | Counts of controls by bucket (reported, fact, open, not covered, out of scope) summing to the number of controls in the input; questions asked and the screen limit; owner answers; corrections; whether follow-up was sent |
| `sections` | The sections below, in order, each a list of statement ids |
| `statements` | Every statement (schema below) |
| `registers` | The full control register, answer history and open-information register (appendices) |
| `validation` | The checks run and their results; a generated document has all passed |

### Statement

| Field | Meaning |
|---|---|
| `id` | Stable: derived from the rule id and the claims it cites, so the same input always gives the same ids |
| `section` | Where it appears |
| `rule` | The rule that produced it, for example `R-GAP-REPORTED` |
| `template` | The copy template, for example `gap.reported.v1` |
| `text` | The sentence, with every slot filled from a cited claim |
| `basis` | `reported`, `evidenced`, `concluded`, `open`, `not-covered`, `scope` or `method` |
| `qualifiers` | What limits it, for example `evidence-insufficient`, `review-not-current`, `answered-after-unknown`, `provenance-not-recorded`, `interim` |
| `claims` | JSON pointers into the input that the statement rests on |
| `subjects` | The controls, scenarios, area and accountable function it concerns |

### Sections

| # | Section | Built from | Rules of wording |
|---|---|---|---|
| 1 | **Status of this report** | `status`, `lineage` | States whether the review is complete and why not; that the method is a proposal not yet approved by MK; that the report carries no score; the date the input was taken; the input digest. Repeated in short on every rendered page while interim. |
| 2 | **What this report covers** | `interview`, `coverage`, `profile` | Who answered and through which channel; questions asked against the limit; counts of controls by bucket, labelled "these counts describe what the review covered, not how ready the organisation is". |
| 3 | **Key messages for management** | Fixed message types (below), each included only when its condition holds | At most seven messages, in the fixed order of their types; each carries its basis and links to the detail. No overall judgement. |
| 4 | **Fraud scenarios** | `scenarios[]`, linked controls | Grouped by tier, then by canonical status. Each scenario: its status wording from the method vocabulary, what was established, the confirming controls and their states, the routes still undecided and the facts and owners they wait on, any reported gap and any current reviewer record. |
| 5 | **Reported practice by area** | `domains[]`, `findings.reportedGaps` | For each area: reported gaps first, worded as reported ("reported partly in place"), each with who reported it and any current evidence or conclusion; then practice reported in place, worded "reported in place; not yet evidenced" unless evidence or a conclusion is current; then recorded facts. |
| 6 | **Evidence and reviewer conclusions** | current `evidence` and `review` records, `findings.reviewerFindings`, `reviewerTasks`, `reReview` | Only current records. A record made against an earlier answer, or against no answer (`forVersion: null`), appears only in the appendix with that stated. Reviewer limitations are quoted as recorded. |
| 7 | **Open information** | `openWork.waiting`, `scenarios[].undecided`, `openWork.ownerPackages`, `followUpPlan` | Grouped by accountable function, with a final group for items not yet assigned to a function; each item with its provenance wording ("the respondent did not know", "not reached in the interview; sent as a follow-up"). Opens with "Nothing is concluded about these practices until they are answered." |
| 8 | **Not covered and out of scope** | controls by state, `openWork.precluded`, `openWork.assumptions` | Counts of controls not asked, by area; prerequisites; controls precluded and the reported absence that precludes them; assumptions to confirm; out of scope with the deciding fact. Opens with "The review reached no view on these." |
| 9 | **Priorities and next steps** | `openWork.actions`, `followUpPlan`, `unresolvedMaterialScenarios`, reviewer tasks | Ordered by the convention below. Each step: what, who (function), why (the claims), basis. |
| A | **Appendix: control register** | every control | All controls in the input, one row each: area, id, key question, state wording, basis, current answer version and its source, current evidence and conclusion. Accounts for every control exactly once. |
| B | **Appendix: answer history** | `history`, `source` | Every earlier answer version with its source; corrections shown as such; a version without recorded provenance shown as "how it was given is not recorded", never as a first answer. Earlier evidence and conclusions with the version they were made against. |
| C | **Appendix: method, lineage and checks** | `method`, `lineage`, `validation` | The vocabulary, the approval statement, the ruleset identity, the input and log digests and the checks passed. |

### Key message types (section 3)

Included only when the condition holds, always in this order. The example wording is draft copy; its counts are the real counts of the fictional 1.2.0 sample session (`sample-report-input-1.1.0-fictional.json` in the delivery package), not invented figures.

| Type | Condition | Example wording, from the fictional sample | Basis |
|---|---|---|---|
| K1 Review status | always | "This is an interim report. The review is not complete: an authorised reviewer has not yet concluded on scope, evidence and findings." | method |
| K2 Reported gaps in tier 1 scenarios | at least one reported gap linked to a tier 1 scenario | "The respondent reported 22 practices linked to tier 1 fraud scenarios as not fully in place, among them board fraud reporting." | reported (with evidence or conclusion qualifiers where current) |
| K3 Material scenarios still undecided | `openWork.unresolvedMaterialScenarios` not empty | "For 53 material fraud scenarios (4 in tier 1, 49 in tier 2), the review cannot yet say whether the controls are in place; the questions that decide them are with eight accountable functions." | open |
| K4 Evidence and conclusions | at least one current evidence record or conclusion | "MK has reviewed evidence for 2 reported practices. For executive accountability for fraud the evidence was sufficient and an MK reviewer confirmed the practice; for board fraud reporting the evidence was insufficient." | evidenced, concluded |
| K5 Contradicted or disputed | a current evidence state `contradicted`, or a current conclusion `not-confirmed` or `disputed` | Does not occur in the sample. Draft: "For {n} reported practices, the evidence MK reviewed did not support what was reported." | evidenced, concluded |
| K6 Largest open queues | waiting items exist | "Most open questions are with Finance (16) and Operations and sales (9). A further 22 questions about whether controls apply have no accountable function yet." | open |
| K7 Coverage | controls not asked exist | "413 controls were not asked in this review. Nothing is concluded about them." | not-covered |

The counts are counts of things in the input, always shown with what they count; no percentage and no comparison between areas is used.

### Priorities convention (section 9)

The order uses only what the method defines, and is published in the report itself:

1. **Kind of step**, in this order: decide material scenarios (obtain the facts and answers that leave the scenarios in `openWork.unresolvedMaterialScenarios` undecided; in the sample these are tiers 1 and 2); evidence reported gaps (tier 1, then 2, then 3); reviewer follow-ups and re-reviews; confirm assumptions; remaining open questions.
2. **Scenario tier**, 1 before 2 before 3. Tiers are part of the method proposal and are not yet approved by MK (B4); the report says so.
3. **Question bank order** within the same kind and tier, so that ties are always broken the same way.

Each step states its kind, the function that acts, and the claims that put it there, for example, from the sample: "Decide: Legal, compliance and ethics (the legal or compliance lead) to answer question D1-L-03; the tier 2 scenario 'Bribery liability without procedures to prevent it' cannot be decided until then." No weight, score or likelihood enters the order.

## Validation checks

A report document is produced only if every check passes. Each has a mutation test that must make it fail.

| Check | Fails when |
|---|---|
| V01 Input gate | The contract or version is not supported, the recomputed digest differs, or the lineage does not match the stored log |
| V02 Traceability | A statement cites no claim, or a cited pointer does not resolve, or a slot value is not the value at a cited pointer |
| V03 Gaps are reported practice | A gap statement cites a control that is not in `findings.reportedGaps` |
| V04 Unknown is not weak | A control in an open, not-covered or scope state appears in a gap statement, a weakness wording or a priority to "address" |
| V05 Conclusions only from current reviews | Conclusion wording appears without a current review record with that conclusion; the word "confirmed" appears outside conclusion templates |
| V06 Evidence only when current | An evidence statement outside appendix B cites a record with `current: false` or `forVersion: null` |
| V07 No scoring | Any field or text carries a score, band, rating, maturity, confidence, percentage, risk level or colour rating; any number appears outside a declared count slot; the no-score statement is missing |
| V08 Status disclosed | The completeness statement, the method approval statement or the interim marking is missing while required |
| V09 Everything accounted for | A control is missing from the register or appears twice; a waiting item is missing from open information; a reported gap is missing from section 5; an unresolved material scenario is missing from priorities |
| V10 Provenance honest | A version with `source: null` is shown as a first answer, or a correction is not shown as one |
| V11 Vocabulary | A state or status wording differs from `method.vocabulary` or from the approved copy table |
| V12 Deterministic | Building twice gives different bytes |

## How it will be tested

- **Golden fictional sessions**, built from the review harness: an early stop at 20 screens; a full interview to the limit; owner follow-up with answers and "I don't know"; corrections; a reviewer pass with every evidence state and conclusion; the 1.2.0 historical record; and the forged reviewer record of database test S6.2. Each produces a document checked field by field.
- **Property tests** over generated fictional logs: every check passes, and the coverage buckets always sum to the number of controls.
- **Mutation tests** for every check: inject a gap for a waiting control, a non-current conclusion, a percentage, the word "score", a dropped waiting item, a null provenance shown as a first answer; each must fail the run and be recorded as a failed run.
- **Lineage**: each test run is recorded and the input rebuilt from the stored prefix gives the recorded digest.
- **Copy review**: every template rendered with fictional values for MK's approval.

## Delivery in phases

| Phase | Delivers | Ends with |
|---|---|---|
| 0 | This proposal | MK's decisions below |
| 1 | Report document contract, input gate, claims ledger, validation checks and their mutation tests; no wording yet | Every check proven to fail on its mutation and pass on the golden sessions |
| 2 | Rules and templates with draft copy marked unapproved | Golden documents for every fictional session; copy pack for MK |
| 3 | Run records through the database store; regeneration from stored logs | Lineage tests on the local and hosted backends |
| 4 | Renderer (HTML and PDF in the MK brand), with rendering tests that every text node comes from the document | Visual review by MK |
| 5 | Only if MK decides so (D6): any assisted phrasing, under the same checks | A separate proposal |

## Decisions for MK

| # | Decision | Proposal |
|---|---|---|
| D1 | Audience and sections | Management, with the nine sections and three appendices above; a board summary later, built from the same document |
| D2 | Key messages | The seven types above, in that order, at most seven |
| D3 | Priorities convention | Kind of step, then scenario tier, then bank order, published in the report |
| D4 | Copy | All templates through MK's copy approval (B7); unapproved copy marked on every page until then |
| D5 | Counts | Counts of things allowed, always with what they count; no percentages anywhere |
| D6 | Generated prose | None in the first version |
| D7 | Interim reports | Allowed before the review is complete, marked "Interim: review not complete" on every page; released only by an MK reviewer |
| D8 | Reviewer identity | Name and role of the authorised reviewer on conclusions, once reviewers sign in (B3) |
| D9 | Storing outputs | Store the document with its run record; regenerate on request from the stored log and compare digests |
| D10 | Commercial products | This engine does not feed the Snapshot or the Comprehensive product; how review customers reach a paid product stays with B5 |

## What the input does not yet carry

The report can be built from contract 1.1.0 as it stands. In the sample, 22 of the 79 waiting items (all of them questions about whether a control applies) carry no accountable function; the report will show them as "not yet assigned to a function", and MK may want the method to assign them. Three additions would improve it and would be additive (1.2.0) if MK wants them: the respondent's role or title (answers are currently attributed to "Respondent"), the date follow-up questions were sent to each function, and the identity of the reviewer's engagement once reviewers sign in (B3). None is proposed for implementation now.

## Open release items this does not touch

B2 (staging isolation), B3 (authenticated access), B11 (hydration error #418) and J-01 (an intermittent unregistered answer) remain open in `RELEASE-DECISION.md`. The report engine depends on B3 for reviewer identity and on B2 before any hosted use; it does not address B11 or J-01.
