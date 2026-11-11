# Report engine: architecture and output specification

Status: **revision 2, accepted by MK as the architectural foundation on 11 November 2026, with the refinements below.** Phase 1 (the report document contract, input gate, claims ledger, validation framework and mutation tests) is authorised and is described in `REPORT-ENGINE-PHASE-1.md`. Draft templates and fictional examples may be prepared for MK review. The methodology is not approved; no customer report is generated, nothing is delivered externally, and nothing is connected to the commercial products.

The report engine turns one review session into a management report: what the organisation reported about its fraud practice, what evidence MK has recorded and reviewed, what an authorised reviewer has concluded, what is still unknown, and what management needs to decide. It reads only the report input contract (`REPORT-INPUT-CONTRACT.md`, version 1.1.0) and records every run against the stored answer log.

It is a new, separate path. It does not change, feed or reuse the scoring of the existing commercial Snapshot and Comprehensive products, and the legacy scored reports are untouched (B5 remains open).

## What the report must be able to defend

Every sentence must survive the question "how do you know?". The answer is always one of these kinds of knowledge, and the report keeps them apart in its wording, its layout and its data:

| Kind | Meaning | Source in the input | How the report may phrase it |
|---|---|---|---|
| Reported exposure | Someone in the organisation reported a practice as not fully in place | `findings.reportedGaps`, `control.answer` with `source` and `by` | "The respondent reported that board fraud reporting is partly in place." |
| Reported practice | Someone reported a practice as in place | `control.answer`, `class: full` | "Reported in place; not yet supported by reviewed evidence." |
| Evidence | Evidence said to exist, requested, recorded, or reviewed for sufficiency | `control.answer.detail.evidenceAvailable`, `control.evidence` | The evidence level (below) and nothing stronger |
| Authorised reviewer conclusion | A named reviewer's conclusion on an answer version | `control.review` with `current: true` and a conclusion | "An MK reviewer (name, date) confirmed…", quoting the recorded basis and limitation |
| Unresolved question | Not yet known, and why | `control.waiting.provenance`, `openWork`, `scenarios[].undecided` | "Not yet established: waiting for Finance; the respondent did not know." |
| Outside the assessment scope | Not asked, excluded by a recorded fact, or not expected at this size | `state` of `unconfirmed`, `scope-unconfirmed`, `prerequisite`, `outofscope`, `proportion`, `assumed`, `precluded` | "Outside this assessment", "Does not apply because…", "Not covered" |

The report never upgrades a kind. Reported practice is never described as evidenced, recorded evidence is never described as reviewed, reviewed evidence is never described as independently validated, and nothing unresolved or outside the scope is ever described as a weakness.

### Evidence levels

Evidence is described by level, never aggregated and never turned into a measure:

| Level | Meaning | Source | Wording |
|---|---|---|---|
| None recorded | No evidence information | no `evidenceAvailable`, no evidence record | "No evidence has been recorded." |
| Said to exist | The respondent said evidence is available, in full or in part; MK has not seen it | `answer.detail.evidenceAvailable` `yes` or `partly` | "The respondent said evidence is available; MK has not seen it." |
| Requested | MK has asked for evidence | evidence state `requested` | "Evidence has been requested." |
| Recorded | Evidence has been supplied and recorded, not yet reviewed | `supplied` | "Evidence has been supplied; it has not yet been reviewed." |
| Reviewed for sufficiency | An MK reviewer reviewed it and recorded an outcome | `reviewed-sufficient`, `insufficient`, `contradicted`; `unavailable` when the organisation said it cannot be provided | "MK reviewed the evidence and found it sufficient / insufficient / that it did not support the answer." |
| Independently validated | Evidence confirmed by a means independent of the organisation (for example MK's own testing or third-party confirmation) | **No such state exists in the current method.** | Never claimed. Adding it is a method decision (D7, B4). |

A reviewed-for-sufficiency outcome is MK's review of what the organisation supplied. It is not an audit and the report says so.

### Reviewer interpretation stays attributable

The engine never writes interpretation on a reviewer's behalf. A conclusion appears only where a review record holds it; the report shows who made it, when, against which answer version, and quotes the recorded basis, limitation and follow-up verbatim. A conclusion whose reviewer identity is not verified (every conclusion until reviewers sign in, B3) is marked "reviewer identity not verified" and keeps the report internal (D5, D6). Reviewer records made against an earlier answer, or against no answer at all, appear only in the technical annex with that stated.

## The report: four layers

| Layer | Reader and purpose | Holds | Does not hold |
|---|---|---|---|
| 1 Executive decision brief | Management, two to four pages: what can be concluded, what cannot, and what management must decide | The five-part position, what management can reasonably conclude, what remains unestablished, decisions requested | Control-level lists; rankings; scores; anything not traceable |
| 2 Detailed management analysis | Managers who own the areas | By fraud scenario and by area: reported exposure, evidence level, reviewer conclusions, unresolved questions, matters outside the scope | The full control register |
| 3 Action and accountability register | Whoever acts | Three separate registers: information gathering, remediation recommendations, management decisions; each item with its accountable function or "not yet assigned" | Any ranking of fraud risk or materiality |
| 4 Technical evidence annex | MK reviewers, auditors of the report | Every control, every answer version with provenance, every evidence and review record with attribution, scenarios, lineage, validation results, method statement | Interpretation |

The complete control-level audit trail lives in layer 4. Layers 1 and 2 refer to it; they do not reproduce it.

### Layer 1: executive decision brief

1. **Status of this report.** Internal interim draft or releasable (D5); review complete or not, and why; the method is a proposal not yet approved by MK; no score is given while the method is unapproved; reviewer identity verified or not; the date of the input. Repeated in short on every page while the report is internal.
2. **The position in five parts.** Reported exposure; reviewed evidence; authorised reviewer conclusions; unresolved questions; matters outside the assessment scope. Each part is a short statement with conditional counts (D4) and a reference to layer 2. Reported exposure is shown by area, not as a selection of items, so that nothing is singled out as most important.
3. **What management can reasonably conclude.** Only statements whose kind supports them, worded at that kind: what was reported (as reported), what evidence MK reviewed and with what outcome, and what an authorised reviewer concluded (attributed). For example: "Management has been told, by its own respondent, that 22 practices asked about in this review are not fully in place."
4. **What remains unestablished.** Unresolved questions and the scenarios they leave undecided; reported practice without reviewed evidence; the absence of independent validation; what the review did not cover.
5. **Decisions requested of management.** From the management decisions register (layer 3): for example, who should answer questions that have no accountable function, whether to supply evidence for reported practices, whether the review should proceed to reviewer conclusions.

### Layer 2: detailed management analysis

By fraud scenario (grouped by the method's tiers, labelled "tier as proposed by the method; not an approved ranking") and by area (in the method's area order). Each scenario: its status in the method's wording, what was established, the confirming controls with their kind and evidence level, the routes still undecided and the facts and functions they wait on, reported exposure, current reviewer conclusions. Each area: reported exposure and reported practice with evidence level, unresolved questions by function, matters outside the scope with the deciding fact. Controls are named only where they bear on a scenario or area statement.

### Layer 3: action and accountability register

Three registers, kept apart because they answer different questions:

| Register | Answers | Built from | Order | Never |
|---|---|---|---|---|
| A Information gathering | What must be found out, from whom | waiting items with provenance, `followUpPlan`, undecided scenario routes, scope questions | Grouped by accountable function (with "not yet assigned" last); within a function, by the method's scenario tier and then question order. **This is a sequence for gathering information, stated as such on the register; it is not a ranking of fraud risk or materiality.** | Labels the first item as the most important |
| B Remediation recommendations | What has been put forward to address reported exposure | the method's action for each reported gap (`openWork.actions`, type `address`), and reviewer follow-ups quoted with attribution | By area, then question order. **Unranked**, stated as such; each item "for management consideration". | Is ordered by tier; implies urgency or severity |
| C Management decisions | What management must decide for the review to proceed | structural facts: unassigned questions, reported practice without evidence, assumptions to confirm, review not complete | Fixed order of decision kinds | Recommends a decision |

Each item carries its accountable function from the input (or "not yet assigned"), the claims that put it there, and its kind of knowledge. Until MK approves a prioritisation methodology, nothing in the report states or implies that one item represents greater fraud exposure than another.

### Layer 4: technical evidence annex

Control register (every control, once: area, id, key question, state wording, kind, current answer version with source, evidence level, current conclusion); answer history (every version with its source; corrections shown as corrections; a version with no recorded provenance shown as "how it was given is not recorded", never as a first answer); evidence and review register (current and earlier records, with level, attribution, the answer version each was made against, and identity verification status); scenario register; lineage and reproducibility (input and log digests, log position, ruleset, engine, rules and copy versions, the report document digest, the run id); validation results; the method statement and vocabulary.

## Architecture

```
stored answer log ─replay─▶ report input 1.1.x ─▶ [1 input gate] ─▶ [2 claims ledger] ─▶ [3 rules] ─▶ statements and register items
                                                                                                      │
                     [6 immutable run record] ◀── report document ◀── [5 validation] ◀── [4 assembly by layer] ◀┘
                                                         │
                                                         └─▶ [7 renderer, later] ─▶ HTML / PDF
```

| Stage | Module (`src/lib/readiness-review/report/`) | Does | Must not |
|---|---|---|---|
| 1 Input gate | `input-gate.ts` (Phase 1) | Accepts `mk-readiness-report-input` 1.1.x only; checks the method still withholds scoring; recomputes the digest; with a store, rebuilds the input from the stored log prefix and requires the same digest | Repair or reinterpret an input |
| 2 Claims ledger | `ledger.ts` (Phase 1) | Turns the input into typed claims with stable ids, JSON pointers and copied values; assigns each evidence claim its level and each reviewer claim its attribution | Add a claim that is not in the input |
| 3 Rules | `rules/` (Phase 2) | Pure functions from claims to statements and register items | Read anything but the ledger; rank |
| 4 Assembly | (Phase 2) | Places statements into the four layers | Drop or merge statements silently |
| 5 Validation | `validate.ts` (Phase 1) | The checks below | Pass a document with any failed check |
| 6 Run record | (Phase 3) | Records every run, generated or failed, with the document digest; a correction is a new run that supersedes, never an edit | Overwrite an earlier run |
| 7 Renderer | (Phase 4) | Lays out the document in the MK brand | Add, remove or reword anything |

Copy lives in a versioned table separate from the rules, so that MK can approve wording (B7) without touching logic; unapproved copy is marked in the document and on every page.

**Deterministic wording in the first implementation.** Every sentence comes from a template whose slots are filled only from claims. Any future analytical commentary, whether AI-assisted or written by a person, enters only through a controlled process: a separate commentary record with its author, time and the claims it cites; review and approval by an authorised MK reviewer before inclusion; labelled as commentary, distinct from recorded facts; versioned and stored with the run; and held to the same checks (every cited claim resolves; no scoring; no conclusion that is not an attributed reviewer conclusion).

## Output specification: the report document

Contract `mk-readiness-management-report`, version **0.1.0 (draft)**; the TypeScript types are in `src/lib/readiness-review/report/document.ts`.

| Field | Contents |
|---|---|
| `contract` | `{ name, version }` |
| `lineage` | `inputContract`, `inputVersion`, `inputDigest`, `logDigest`, `actionCount`, `sessionId`, `asOf`, `ledgerDigest`, engine, rules and copy versions, `copyApproved` |
| `status` | `reviewComplete` and `why`; `methodApproval`; `scoring` (`withheld`, with the reason that the method is not yet approved); `reviewerIdentity` (`verified`, why not); `release` (`internal-interim` or `releasable`, with the reasons) |
| `statements` | Every statement (below) |
| `layers.executive` | Status, the five-part position, can conclude, unestablished, decisions requested: each a list of statement ids |
| `layers.analysis` | Scenario and area sections: lists of statement ids |
| `layers.register` | `informationGathering`, `remediation`, `decisions` (item schemas below) |
| `layers.annex` | Control register, answer history, evidence and review register, scenario register, lineage, validation, method |
| `validation` | Each check with its result; a generated document has every check passed |

**Statement:** `id` (from the rule and the claims, so stable); `layer` and `section`; `rule`; `template`; `text` (slots filled from claims only); `kind` (reported exposure, reported practice, evidence, conclusion, unresolved, outside scope, method); `evidenceLevel` where it describes evidence; `attribution` (reviewer, time, answer version, identity verified) where it carries a reviewer's record; `counts` (each count with what it counts and its universe, both cited); `qualifiers`; `claims` (ledger claim ids); `subjects` (controls, scenarios, area, function).

**Information request:** function or `unassigned`; questions; the scenarios they would decide; provenance; `sequence` and `sequenceMeaning` ("information-gathering order: tier, then question order; not a ranking of risk"); claims.

**Remediation recommendation:** source (`method-action` or `reviewer-follow-up`); text (the method's action text, or the reviewer's follow-up quoted with attribution); control, area and scenario; accountable function or `unassigned`; kind of knowledge; `ranked: false`; status "for management consideration"; claims.

**Management decision:** kind (assign owners, evidence for reported practice, assumptions to confirm, review completion); the facts that require it; decision owner "management"; claims. It states the decision needed and does not recommend an answer.

## Validation checks

A document is produced only if every check passes; each check has at least one mutation test that must make it fail (Phase 1).

| Check | Fails when |
|---|---|
| V01 Input gate | Contract or version not supported, scoring not withheld, recomputed digest differs, or the input differs from one rebuilt from the stored log prefix |
| V02 Traceability | A statement or register item cites no claim, cites an unknown claim, or a claim's pointer does not resolve to its value in the input |
| V03 Slots from claims | A number or quoted value in a text is not the value of a cited claim |
| V04 Reported exposure is reported | An exposure statement cites a control that is not a reported gap, or is worded as evidenced or concluded |
| V05 Unknown is not weak | A control that is unresolved or outside the scope appears in an exposure statement, a remediation item or weakness wording |
| V06 Evidence levels honest | A statement claims an evidence level above its claims; any text claims independent validation; an evidence statement outside the annex cites a record that is not current |
| V07 Conclusions attributed | Conclusion wording without a current review claim with that conclusion; a conclusion statement without attribution; a reviewer's words not quoted verbatim; an unverified identity not marked |
| V08 No scoring | Any field or text carries a score, band, rating, maturity level, confidence, percentage, risk level or colour rating, or a number outside a declared count |
| V09 Counts conditional | A count without its universe; counts compared across areas; a count in the executive brief that the count rules do not allow |
| V10 No implied ranking | Ranking wording ("most important", "highest risk", "greatest exposure", "top priority", "first priority"); an information register without its sequence statement; a remediation register ordered by tier or marked as ranked |
| V11 Status and release | Completeness, method approval, scoring or identity status missing; an internal-interim document not marked internal, or marked releasable while the review is incomplete or the reviewer identity unverified |
| V12 Layers kept apart | The executive brief names individual controls beyond its limit or carries a control list; the annex does not hold every control exactly once |
| V13 Everything accounted for | A waiting item missing from the information register; a reported gap missing from layer 2 or the remediation register; a current evidence or review record missing from the annex |
| V14 Provenance honest | A version with `source: null` shown as a first answer; a correction not shown as one; an answer version missing from the history |
| V15 Deterministic | Building twice gives different bytes |

## Delivery in phases

| Phase | Delivers | Status |
|---|---|---|
| 0 | This design | Accepted with refinements (this revision) |
| 1 | Report document contract, input gate, claims ledger, validation framework, mutation tests; draft templates and a fictional example for MK review only | Authorised; see `REPORT-ENGINE-PHASE-1.md` |
| 2 | Rules and templates for all four layers, copy marked unapproved | Not started; needs D1 to D4, D7 and D9 |
| 3 | Immutable run records with stored documents and supersession | Not started; needs D8 and a migration |
| 4 | Renderer in the MK brand | Not started |
| 5 | Controlled commentary process | Only if MK decides so (D9) |

## Decisions for MK

| # | Decision | Proposal |
|---|---|---|
| D1 | Management-first structure | Four layers: executive decision brief (two to four pages), detailed management analysis, action and accountability register, technical evidence annex. The complete control-level trail in the annex only. |
| D2 | Executive brief | The five-part position, what management can reasonably conclude, what remains unestablished, and decisions requested; no item singled out; no overall judgement. |
| D3 | Sequencing and prioritisation | Tiers and question order set only the sequence of information gathering, stated as such. Remediation recommendations unranked. No ranking of fraud risk or materiality until MK approves a prioritisation methodology. |
| D4 | Counts | Counts only of one kind of record, each with its universe, never compared across areas, never as a percentage or ratio. Whether counts are also withheld from the executive brief below some level of coverage, and at which level, is for MK to set; the engine invents no threshold. |
| D5 | Interim release | Internal to MK only while the review is incomplete or any reviewer identity is unverified, marked on every page. Release to the organisation needs a complete review, verified reviewer identity (B3), approved copy (B7) and terms (B6). |
| D6 | Reviewer identity | Conclusions attributable to a verified, signed-in reviewer acting under an engagement (B3). Until then every conclusion is marked unverified and the report stays internal. |
| D7 | Evidence levels | Adopt the levels above. The current method has no independent validation; whether to add it is a method decision (B4). |
| D8 | Report records | Every run immutable: append-only run records with the stored document and its digest; a correction is a new run that supersedes, never an edit; regeneration from the stored log must reproduce the digest. Retention period for MK. |
| D9 | Wording and commentary | Deterministic templates in the first implementation, through MK copy approval (B7). Any later AI-assisted or human commentary only through the controlled, attributable, reviewed process above. |
| D10 | Separation and scoring | No connection to the Snapshot or the Comprehensive product (B5). No scoring while the new method is unapproved (B4); this is a constraint of the current stage, not an MK commercial or methodological policy, and an approved method would enter as a separate versioned contract. |

## What the input does not yet carry

The report can be built from contract 1.1.0. In the fictional sample, 22 of the 79 waiting items (all questions about whether a control applies) have no accountable function; the register shows them as "not yet assigned" and they generate a management decision. Additions that would be additive (1.2.0), if MK wants them: the respondent's role, the date follow-up was sent to each function, and the reviewer's verified identity and engagement (needs B3). None is implemented now.

## Open release items this does not touch

B2 (staging isolation), B3 (authenticated access), B4 (method approval), B5 (commercial path), B6 (terms and privacy), B7 (copy approval), B11 (hydration error #418) and J-01 (an intermittent unregistered answer) remain open in `RELEASE-DECISION.md`.
