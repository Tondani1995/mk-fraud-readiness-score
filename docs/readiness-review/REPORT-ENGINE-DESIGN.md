# Report engine: architecture and output specification

Status: **revision 3, 11 November 2026.** Revision 2 was accepted by MK as the architectural foundation, and Phase 1 (`REPORT-ENGINE-PHASE-1.md`) was accepted. Revision 3 incorporates MK's Phase 1 review findings and MK's correction of the same day: MK does not review evidence or verify responses in the standard Fraud Readiness assessment or the Comprehensive Report; evidence review, verification and specialist conclusions belong only to the separately scoped and priced Advisory package. Phase 2 (`REPORT-ENGINE-PHASE-2.md`) is built to this revision, for fictional records only. The methodology is not approved; no customer report is generated, nothing is delivered externally, and nothing is connected to the commercial products.

## The product boundary

| | Snapshot | Comprehensive Report | Advisory |
|---|---|---|---|
| What it is | The existing commercial Snapshot | The existing commercial Comprehensive Report | A separately scoped and priced engagement |
| Rests on | The organisation's own responses | The organisation's own responses and the approved method | Evidence the organisation supplies and MK's specialist review |
| MK reviews evidence or verifies responses | No | No | Yes, under the engagement |
| Specialist conclusions by MK | No | No | Yes, attributable to a verified MK reviewer |
| In this engine | Not touched | The **standard report**, the automated self-reported pathway, built here for fictional records only. It is not connected to the existing Comprehensive product, which is unchanged (B5) | The **Advisory record**, the evidence and reviewer functionality already built, preserved as a separate capability. Not part of the standard report and connected to nothing |

The standard report must never depend on evidence submissions, reviewer authentication, reviewer conclusions or completed evidence assessments, for its content, its generation or its release. The Advisory record must never be bundled into the automated product, or offered by it, without a separately approved commercial decision. Neither boundary is a matter of wording alone; both are enforced in code and by tests (below).

## What the standard report must be able to defend

Every sentence must survive the question "how do you know?". The answer is always one of these kinds of knowledge, and the report keeps them apart in its wording, its layout and its data:

| Kind | Meaning | Source in the input | How the report may phrase it |
|---|---|---|---|
| Gap indicated by the responses | Someone in the organisation reported a practice as not fully in place | `findings.reportedGaps`, `control.answer` with `source` and `by` | "“Board receives fraud reporting”: Reported partly in place. Answered by: Respondent." Never a verified control deficiency |
| Reported practice | Someone reported a practice as in place | `control.answer`, `class: full` | "Reported in place" |
| Recorded fact | A fact about the organisation | `state: fact` | The fact |
| Records said to exist | The respondent said a record could be shown | `answer.detail.evidenceAvailable` | "The respondent said a record could be shown … MK has not seen these records." |
| The draft method's own content | What the method says a practice looks like in place, and the fraud risks it names | `control.method` (input 1.2.0) | "the practice the draft method describes as in place: “…”" |
| Unresolved question | Not yet known, and why | `control.waiting.provenance`, `openWork`, `scenarios[].undecided` | "Waiting for an answer from an accountable function" |
| Not yet covered | Not reached, applicability not known, or depending on an unanswered question | `unconfirmed`, `scope-unconfirmed`, `prerequisite` | Each in its own words; never "not asked" for all three, never a weakness |
| Outside the scope | Excluded by a recorded scope decision, or assumed not to apply | `outofscope`, `proportion`, `precluded`, `assumed`, `retired` | "Excluded by a recorded scope decision", "pending the organisation's confirmation" |
| Withheld | A judgement MK has not recorded | none | "Withheld: …" |

Evidence records, reviewer records and the reviewer-based review status are not a kind of knowledge in the standard report. They exist in the input (so nothing recorded is lost), are marked as Advisory claims in the ledger, and are refused by check V16 wherever they appear.

### What the standard report offers management

- **Interpretation, from the responses and the method.** By area, how many of the practices reported on the responses indicate are not fully in place; for each gap, the response quoted and the fraud risks the draft method names for it; by fraud scenario, whether the responses indicate a gap in the practice the method uses to address it, report it in place, or cannot yet decide it.
- **Recommended actions, qualified.** For each gap, one recommended action for management consideration: the practice restated as the draft method describes it in place (an anchored question's in-place level, or the answer the method treats as in place), quoted verbatim. Where the method gives nothing to restate, the action is withheld and the report says so. Actions are unranked and say nothing about how, by whom or by when; they are never an evidence request.
- **Coverage, kept distinct.** Each category of what was and was not covered has its own statement, and the adaptive routing that produced them is explained, with the explicit statement that an unasked control is not a finding.
- **Judgements withheld, explicitly.** An overall view of readiness, any priority, materiality or urgency, how and when to remediate, the accuracy of the responses, any score, and any view on what was not asked: each withheld in so many words, because MK has not recorded the judgement.

## The report: four layers

| Layer | Reader and purpose | Holds | Does not hold |
|---|---|---|---|
| 1 Executive decision brief | Management, two to four pages | Status and basis; what the responses indicate (by area, and by scenario in one statement); coverage and adaptive routing; the recommended actions in one statement; judgements withheld; decisions requested | Individual controls; any statement twice; rankings; scores; evidence or reviewer material |
| 2 Detailed management analysis | Managers who own the areas | By area: each gap with the response and the method's named risks, practice reported in place, records said to exist, coverage by category. By fraud scenario, in the method's order within each area | The full control register; method tiers |
| 3 Action and accountability register | Whoever acts | A information gathering; B reported issues for management consideration; C recommended actions; D management decisions. Each item with its claims and, where it has one, its accountable function | Any ranking; any evidence request |
| 4 Technical annex | Auditors of the report | Every control once (coverage category, kind, current answer, provenance, records said to exist), every answer version, every scenario with its tier and the tier's meaning, lineage, method statement, validation | Interpretation; evidence or reviewer records |

### Layer 1: executive decision brief

1. **Status and basis.** The internal marking while any release criterion is unmet; the basis ("This report rests on the organisation's own responses … MK has not reviewed evidence or verified any response; evidence review is not part of this assessment. Where the report describes a gap, it is a gap indicated by the responses, not a verified control deficiency."); method status; the date of the responses.
2. **What the responses indicate.** One statement per area with gaps (counts of one kind with their universe, in area order); one statement on the fraud scenarios, each counted once by what the responses established for it.
3. **What the assessment covered, and how.** The adaptive routing for this interview's stop reason, then one statement per non-empty coverage category: reported on, established by a wider answer, recorded facts, waiting (with how many concern applicability and how many have no accountable function), not reached, applicability not yet known, depending on an unanswered question, excluded by a recorded scope decision, assumed not to apply, retired.
4. **Recommended actions.** One statement: how many gaps have a recommended action restating the draft method, and how many are withheld.
5. **Judgements withheld.** The six withheld judgements above.
6. **Decisions requested.** Which gaps to act on, and how (the report does not rank them); who should answer questions with no accountable function; confirming the assumptions made about activities. Never a decision about evidence, and never a recommended answer.

Each executive statement sits in one section only, names no individual control, and is distinct from every other. The limits (36 statements, no named controls) are placeholders for D2.

### Layer 2: detailed management analysis

By area, in the method's area order: for each gap, the issue statement (with "in a correction to an earlier answer" where the current answer is a correction) and the fraud risks the draft method names; practice reported in place; records said to exist; and the area's coverage, one statement per category, accounting for every control in the area once.

By fraud scenario, grouped by area and in the method's own order within each, never by tier. Each status has its own wording: reported in place; a gap indicated in the practice the method uses to address it (naming that practice); waiting; not reached; applicability not known; which control applies not known; a further route not yet decided (with what was established); precluded; out of scope; assumed, pending confirmation.

### Layer 3: action and accountability register

| Register | Answers | Built from | Order | Never |
|---|---|---|---|---|
| A Information gathering | What must be found out, from whom | waiting items with provenance, the follow-up plan | By accountable function ("not yet assigned" last), then the method's scenario tier, then question order. **A sequence for gathering information, stated as such; not a ranking of fraud risk or materiality.** | Labels the first item as the most important |
| B Reported issues | Which gaps the responses indicate | `findings.reportedGaps` with the current answer | Area, then question order; unranked, stated as such | Calls a gap verified |
| C Recommended actions | What the draft method describes as in place for each gap | `control.method` | As B, one per issue, linked to it | Generic remediation; an evidence request; priority, timing or method of remediation |
| D Management decisions | What management must decide | structural facts: gaps indicated, unassigned questions, assumptions | Fixed order | Recommends an answer |

### Layer 4: technical annex

Control register; answer history (corrections shown as corrections; a version with no recorded provenance shown as "how it was given is not recorded"); scenario register with tier and `TIER_MEANING`; lineage (input, log and standard-ledger digests, log position, engine, copy and ledger versions); method statement; validation results.

## Architecture

```
stored answer log ─replay─▶ report input 1.2.x ─▶ [1 input gate] ─▶ [2 claims ledger] ─┬─ standard claims ─▶ [3 rules] ─▶ [4 assembly] ─▶ [5 V01–V20] ─▶ standard report
                                                                                     │
                                                                                     └─ Advisory claims ─▶ Advisory record (separate; A01–A06) ─▶ not part of the standard report
```

| Stage | Module (`src/lib/readiness-review/report/`) | Does | Must not |
|---|---|---|---|
| 1 Input gate | `input-gate.ts` | Accepts `mk-readiness-report-input` 1.2.x only; checks the method still withholds scoring; recomputes the digest; with a store, rebuilds the input from the stored log prefix and requires the same digest; fictional records only in this phase | Repair or reinterpret an input |
| 2 Claims ledger | `ledger.ts` (0.2.0) | Turns the input into typed claims with stable ids, pointers and copied values, each tagged `standard` or `advisory` | Add a claim that is not in the input |
| 3 and 4 Rules and assembly | `standard-report.ts` | Removes every Advisory claim first (`standardLedger`), then builds every statement and register item from templates filled only from standard claims, and places them in the four layers | Read anything but the standard claims; rank; write wording of its own |
| 5 Validation | `validate.ts` | The twenty checks below | Pass a document with any failed check |
| Copy | `copy.ts` (0.2.0-draft, unapproved) | Every template, separate from the rules, so MK can approve wording (B7) without touching logic | Contain a number, or evidence and reviewer wording |
| Advisory record | `advisory-record.ts` | The preserved evidence and reviewer capability, with its own copy and checks A01 to A06 | Be imported by the standard engine; be required by it |
| 6 Run record | (Phase 3) | Records every run, generated or failed, with the document digest; a correction is a new run that supersedes | Overwrite an earlier run |
| 7 Renderer | (Phase 4) | Lays out the document in the MK brand | Add, remove or reword anything |

**How the boundary is enforced.** The standard builder never sees an Advisory claim and does not import the Advisory module (R-03). The document contract has no field for evidence levels, attribution, conclusions or reviewer identity, and V16 refuses any such field, any cited Advisory claim, any evidence-review or verification wording, and any release criterion about review, reviewers, evidence or identity. The standard report built from a ledger with every Advisory claim removed is byte-identical to the one built from the full ledger; and with every reviewer action removed from the stored log it is identical apart from the log position, with the same release classification (R-05).

**Deterministic wording.** Every sentence comes from a template whose slots are filled only from claims. Any future analytical commentary enters only through the controlled process of revision 2 (a separate, attributed, reviewed and versioned commentary record, held to the same checks), and only if MK decides so (D9).

**Pinned sentences.** A few sentences must use words that are otherwise refused, because they say what MK did not do or what the report withholds ("MK has not reviewed evidence or verified any response"). They are pinned word for word in `validate.ts`, not exempted by template: a copy table that changes one of them, or adds an assertion beside it, is checked like any other wording. This is what makes the boundary resistant to a template or a status disclaimer (mutations M49 to M54, M64, M70).

## Output specification: the standard report document

Contract `mk-readiness-management-report`, version **0.2.0 (draft)**; the TypeScript types are in `document.ts`.

| Field | Contents |
|---|---|
| `contract`, `pathway` | `{ name, version }`; `standard-self-reported` |
| `draft` | copy version, copy approved, fictional only, note |
| `lineage` | input contract, version and digest; log digest; action count; session; as of; standard-ledger digest and version; engine |
| `status` | `basis` (`selfReported: true`, `evidenceReviewedByMK: false`, `responsesVerifiedByMK: false`); method approval; scoring withheld and why; interview status and stop reason; release classification, marking and criteria |
| `statements` | Every statement: id, layer, section, rule, template, text, kind, basis (`self-reported`, `record`, `method`), slots, counts with universes, qualifiers, claims, subjects |
| `layers.executive` | `status`, `indicated`, `coverage`, `actions`, `withheld`, `decisions`: statement ids |
| `layers.analysis` | `areas`, `scenarios` (by area), `coverage` (`routing`, and one row per category with its controls and statement) |
| `layers.register` | `informationGathering`, `reportedIssues`, `recommendedActions`, `decisions` |
| `layers.annex` | `controls`, `answerHistory`, `scenarios`, `lineageStatement`, `methodStatement` |

### Release criteria of the standard pathway

The document is classified `internal-interim`, and marked, until every criterion is met: the interview has ended; a real (not fictional) record; method approved (B4); copy approved (B7); commercial path (B5); terms and privacy (B6); staging isolation (B2); authenticated access for the organisation (B3). **No criterion concerns evidence review, reviewer records, reviewer identity or review completeness.** In Phase 2 every document is internal interim, because it is fictional and the copy and method are unapproved.

## Validation checks

A document is produced only if every check passes; each check has at least one mutation test that makes it fail.

| Check | Fails when |
|---|---|
| V01 Input gate | Contract or version not supported, scoring not withheld, digest differs, the input differs from one rebuilt from the stored log, or the lineage names another standard ledger |
| V02 Traceability | A statement or item cites no claim or an unknown claim, or a claim does not hold against the input |
| V03 Slots from claims | A number or quoted value is not the value of a cited claim; a template carries a number |
| V04 Indicated gaps as reported | A gap statement cites something that is not a reported gap, rests on anything but the responses, or is worded as verified, evidenced or established |
| V05 Unknown is not weak | A control that is unresolved, not covered or excluded appears as a gap, an issue or an action, or is worded as a weakness |
| V06 Records said to exist honest | What the respondent said about records is counted without saying so, without "MK has not seen these records", or shown in the annex differently from the input |
| V07 No conclusions | A statement of a kind the standard report does not have, or conclusion wording |
| V08 No scoring | A score, band, rating, maturity level, confidence, percentage, risk level, colour rating or priority field or wording |
| V09 Counts conditional | A count without its universe; comparison wording; a count the brief may not use |
| V10 No implied ranking | Ranking wording; a register without its sequence or unranked statement; issues or actions out of area and question order; scenarios out of method order; a tier outside the annex or without its meaning |
| V11 Status and release | The basis not stated as self-reported and unverified; release criteria other than the standard pathway's; internal while a criterion is unmet but not marked; the basis statement missing from the brief |
| V12 Layers kept apart | The brief names an individual control or carries a non-executive statement; the annex does not hold every control, answer version and scenario exactly once |
| V13 Everything accounted for | A waiting item, gap, issue, action, scenario or decision missing or duplicated; an action not linked to its issue; a scenario worded with another status |
| V14 Provenance honest | Provenance shown other than recorded; a correction not shown as one; a superseded answer quoted as current; an answer version missing |
| V15 Deterministic | Building twice gives different bytes |
| V16 Pathway boundary | An Advisory claim cited; an evidence, attribution, conclusion or reviewer field; evidence-review or verification wording outside the pinned sentences; a release criterion about review, reviewers, evidence or identity |
| V17 Coverage kept distinct | A category without its own executive statement, or merged with another; a count spanning categories; the routing explanation missing or for another stop reason; an area's coverage not accounting for each control once |
| V18 Recommended actions grounded | An action not quoting the draft method's in-place description verbatim; withheld although the method gives one, or given although it does not; not citing its gap; generic remediation or an evidence request anywhere; the register without its qualification |
| V19 Executive brief concise | A statement in two sections; the same sentence twice; more statements than the limit; two gap statements for one area |
| V20 Judgements withheld | A required withheld judgement missing; judgement wording (overall, ready, adequate, effective, sufficient, strong, mature, good, material, significant…) outside the pinned sentences |

### Advisory record checks

| Check | Fails when |
|---|---|
| A01 Attribution as recorded | An entry cites something other than an evidence or reviewer record, or its attribution or authority differs from the record |
| A02 No authority without a verified identity | An entry whose reviewer identity is not verified uses authoritative wording ("MK reviewed", "MK found", "MK reviewer"…), a verified template, or omits "This is not an MK finding.", judged entry by entry, so no status disclaimer can excuse it |
| A03 Earlier records shown as earlier | An earlier (stale) record shown as current, or worded as current |
| A04 Reviewer words verbatim | A quoted value differs from the record, or the text is not its template filled from the record |
| A05 Kept apart | The record is not marked as the separate Advisory capability, or is marked as a dependency of the standard report |
| A06 Every record once | An evidence or reviewer record is missing or repeated |

## Delivery in phases

| Phase | Delivers | Status |
|---|---|---|
| 0 | This design | Revision 3 |
| 1 | Document contract, input gate, claims ledger, validation, mutation tests; draft examples | Accepted (`REPORT-ENGINE-PHASE-1.md`); its draft builder is replaced by Phase 2 |
| 2 | Standard rules and templates for all four layers, including scenario analysis; Advisory record kept apart; golden sessions; copy marked unapproved; fictional only | Built (`REPORT-ENGINE-PHASE-2.md`) |
| 3 | Immutable run records with stored documents and supersession | Not started; needs D8 and a migration |
| 4 | Renderer in the MK brand | Not started |
| 5 | Controlled commentary process | Only if MK decides so (D9) |

## Decisions for MK

| # | Decision | Proposal |
|---|---|---|
| D1 | Management-first structure | Four layers as above; the complete control-level trail in the annex only |
| D2 | Executive brief | Six sections, each statement once, no individual control named; limits 36 statements and no named controls are placeholders |
| D3 | Sequencing and prioritisation | Tiers and question order set only the sequence of information gathering, shown with their meaning in the annex only. Issues and actions unranked. No ranking of fraud risk or materiality until MK approves a prioritisation method |
| D4 | Counts | Counts only of one kind of record, each with its universe, never compared or turned into a percentage. Whether to withhold counts from the brief at low coverage, and at which level, is for MK to set |
| D5 | Interim release | Internal only while any standard release criterion is unmet. Release depends on the interview having ended, a real record, approved method and copy, commercial path, terms and privacy, staging isolation and authenticated access; never on evidence or reviewer records |
| D6 | Reviewer identity | An Advisory matter only. Advisory entries are attributable to a verified, signed-in MK reviewer under an engagement (B3); until then no entry is worded as an MK finding |
| D7 | Evidence | Not part of the standard report. The respondent's own statement that a record could be shown may be reported as self-reported, with "MK has not seen these records". Evidence levels and any independent validation are Advisory method decisions |
| D8 | Report records | Every run immutable; a correction is a new run that supersedes; regeneration reproduces the digest. Retention for MK |
| D9 | Wording and commentary | Deterministic templates first, through MK copy approval (B7); later commentary only through the controlled process |
| D10 | Separation and scoring | No connection to the Snapshot or the existing Comprehensive product (B5). No scoring while the method is unapproved (B4): a constraint of this stage, not an MK commercial or methodological policy |
| D11 | Product boundary | The standard report never depends on or offers Advisory; whether, where and how the report may mention that Advisory exists is a commercial and copy decision, and the Phase 2 copy does not mention it |
| D12 | Recommended actions | Whether restating the practice as the method describes it in place is the right form of recommended action once the method is approved, and whether MK wants any further specificity (owners, timing, sequencing), which would need method content or recorded MK judgement |

The full list of methodological and copy decisions still reserved for MK is in `REPORT-ENGINE-MK-DECISIONS.md`.

## Open release items this does not touch

B2 (staging isolation), B3 (authenticated access), B4 (method approval), B5 (commercial path), B6 (terms and privacy), B7 (copy approval), B11 (hydration error #418) and J-01 (an intermittent unregistered answer) remain open in `RELEASE-DECISION.md`.
