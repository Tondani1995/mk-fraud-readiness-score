# Before and after: Phase 1 draft brief and Phase 2 standard report (fictional)

Both documents are built from the same fictional session, "Fictional Retail Group". Phase 1 is the draft builder at commit `1640f95` (0.1.0-phase1-draft, copy 0.1.0-draft); Phase 2 is the standard report engine (0.2.0-phase2, copy 0.2.0-draft). Neither copy is approved by MK. Every sentence quoted below is copied from the two validated documents.

## The underlying assessment record did not change

| | Phase 1 | Phase 2 | Same |
|---|---|---|---|
| Session | 923ba9e966a54c4fbd94fa84b593db47 | 923ba9e966a54c4fbd94fa84b593db47 | yes |
| Stored answer log | 205 actions, digest `08f257f216f4afaf…` | 205 actions, digest `08f257f216f4afaf…` | yes |
| Report input | 1.1.0, digest `75750947425e0253…` | 1.2.0, digest `77f4cbd12651d6b6…`; without the method content added in 1.2.0: `75750947425e0253…` | yes, byte for byte, apart from the added method content |
| Practices reported on / gaps / waiting / controls | 66 / 22 / 79 / 902 | 66 / 22 / 79 / 902 | yes |

The only change to the input is additive: the method's own content for each practice (its in-place description and the fraud risks it names), copied from the question bank of the recorded ruleset. What changed is how the report reads the record.

## The executive brief in numbers

| | Phase 1 | Phase 2 |
|---|---|---|
| Statements in the brief | 29 references to 23 statements | 27 statements |
| Statements repeated across sections | 6 | 0 |
| Words | 622 | 672 |
| Individual controls named | 2 | 0 |
| Statements resting on evidence or reviewer records | 7 | 0 |
| Explicitly withheld judgements | 0 | 6 |

Phase 2 is a little longer in words because it adds the basis of the report, the explanation of adaptive routing, the scenario picture and the withheld judgements. It repeats nothing and names no individual control.

## 1 Reviewer authority (finding 1) and the Advisory boundary (12:05 correction)

**Phase 1** built 7 statements of its brief on evidence and reviewer records, including evidence reviews and a reviewer conclusion worded as MK's own finding, and repeated in what management "can reasonably conclude", although no reviewer identity is verified:

> Evidence reviews and conclusions in this report are recorded under a reviewer identity that is not yet verified.
> MK has reviewed evidence for 2 of the 66 practices reported on. For the others, only what was reported is available.
> For “Executive accountable for fraud”, MK reviewed the evidence supplied and found it sufficient.
> For “Board receives fraud reporting”, MK reviewed the evidence supplied and found it insufficient.
> Reviewer conclusion recorded by “MK reviewer (fictional harness)” on 2026-11-10T12:53:08.398Z: confirmed the answer recorded for “Executive accountable for fraud” (answer version 1: “Yes, it is written into a named executive's role”). Recorded basis: “Fictional sample of three months”.
> 64 of the 66 practices reported on have no evidence reviewed by MK; for these, only the respondent's account is available.
> No evidence has been independently validated; the current method does not provide for independent validation.

**Phase 2** keeps evidence review out of the standard report altogether, because it is not part of this assessment. The brief states the basis instead:

> This report rests on the organisation's own responses to the assessment and on the assessment method. MK has not reviewed evidence or verified any response; evidence review is not part of this assessment. Where the report describes a gap, it is a gap indicated by the responses, not a verified control deficiency.

The same records are kept, unchanged in substance, in the separate Advisory record, and worded as what they are:

> For “Executive accountable for fraud”, recorded under a reviewer account whose identity is not verified (MK reviewer (fictional harness), 2026-11-10T12:53:08.384Z), against answer version 1: “Evidence reviewed and sufficient”. Recorded basis: “Fictional sample of three months”. This is not an MK finding.
> For “Executive accountable for fraud”, recorded under a reviewer account whose identity is not verified (MK reviewer (fictional harness), 2026-11-10T12:53:08.398Z), against answer version 1: “Confirmed”. Recorded basis: “Fictional sample of three months”. This is not an MK finding.
> For “Board receives fraud reporting”, recorded under a reviewer account whose identity is not verified (MK reviewer (fictional harness), 2026-11-10T12:53:08.405Z), against answer version 1: “Evidence reviewed and insufficient”. Recorded basis: “Only head office records were supplied”. This is not an MK finding.
> For “Route for allegations against senior people”, a review recorded under a reviewer account whose identity is not verified (MK reviewer (fictional harness), 2026-11-10T12:53:08.414Z) has no conclusion yet: the review is incomplete. This is not an MK finding.

Checks V16 (pathway boundary) and A02 (no authority without a verified identity) refuse the Phase 1 wording whatever disclaimer stands beside it; mutations M49 to M54 and N01 to N03 prove it.

## 2 Assessment coverage (finding 2)

**Phase 1** collapsed three different situations into "not asked":

> 675 of the 902 controls were not asked in this review, and 67 were excluded by a recorded fact or by the organisation's size. Nothing is concluded about them.

**Phase 2** keeps each category apart, with its own meaning, and explains adaptive routing without treating an unasked control as a weakness:

> The assessment is adaptive: each answer decides which questions follow, so not every control is asked. This interview ended when it reached its limit of 95 respondent screens. A control that was not asked, or whose applicability is not yet known, is not a finding: nothing is concluded about it, favourable or unfavourable.
> Practices reported on: 66 of the 902 controls in the method.
> Facts recorded about the organisation: 15 of the 902 controls.
> Waiting for an answer from an accountable function: 79 of the 902 controls. For 22 of these, the open question is whether the practice applies; 22 have no accountable function yet.
> Not reached before the interview ended: 413 of the 902 controls. They were not asked; nothing is known about them.
> Applicability not yet known: 193 of the 902 controls. Whether they apply depends on facts about the organisation's activities that have not been established.
> Depends on a question not yet answered: 69 of the 902 controls. They are asked only once an earlier question is answered.
> Excluded by a recorded scope decision: 67 of the 902 controls, because a recorded fact shows they do not apply, they are not expected at the organisation's size, or a related practice was reported absent.

## 3 Remediation integrity (finding 3)

**Phase 1** gave every reported gap the same generic action (22 items), for example:

> Address the reported gap: Board receives fraud reporting. For management consideration; based on what was reported.
> Address the reported gap: FICA duties in fraud governance. For management consideration; based on what was reported.
> Address the reported gap: Orderer is not payment approver. For management consideration; based on what was reported.

and asked management to decide on evidence for every practice reported on:

> Decide whether to supply evidence for the 64 practices reported on that MK has not reviewed.

**Phase 2** lists each gap as a reported issue for management consideration, and gives it one recommended action that restates the practice as the draft method describes it in place (or says plainly that a specific action is withheld). There is no evidence request. For example:

> “Board receives fraud reporting”: Reported partly in place. Answered by: Respondent. Response: “Some fraud information is reported, but not on a set schedule or in a set format.”
>
> Recommended action, for management consideration: bring “Board receives fraud reporting” to the practice the draft method describes as in place: “A standard report covers fraud risk, incidents and losses for the whole organisation at each scheduled meeting.”

> “FICA duties in fraud governance”: Reported partly in place. Answered by: Executive and governance. Response: “FICA duties are documented, but suspicious transaction reporting is inconsistent.”
>
> Recommended action, for management consideration: bring “FICA duties in fraud governance” to the practice the draft method describes as in place: “The Risk Management and Compliance Programme covers FICA duties across the organisation, and reports to the Financial Intelligence Centre are made and tracked.”

> “Orderer is not payment approver”: Reported partly in place. Answered by: Respondent. Response: “The duties are separated by policy, but exceptions are frequent.”
>
> Recommended action, for management consideration: bring “Orderer is not payment approver” to the practice the draft method describes as in place: “The duties are always separated, or any exception is approved and recorded.”

The register states the qualification once:

> Each recommended action restates the practice as the draft method describes it in place. The method is not yet approved by MK, and the actions rest on responses MK has not verified. They are not ranked, and they do not say how, by whom or by when a practice should be put in place.

## 4 Executive reporting quality (finding 4)

Phase 1 repeated 6 statements across its sections (the unresolved questions, the undecided scenarios and the out-of-scope count appeared both in the position and in what remains unestablished), restated the reported gaps in "can conclude", and named 2 individual controls. Phase 2 places each statement in one section only, names no individual control, keeps the per-control record in the annex, and adds what Phase 1 lacked: the basis of the report, the adaptive routing, the scenario picture and the judgements MK has not recorded.

### Phase 1 executive brief, as built

- Internal interim draft. Not for release. The review is not complete: An interview records reported practice. A review is complete only when an authorised reviewer has concluded on the scope, evidence and findings.
- Method status: Not approved by MK. Scenario tiers, answer mappings, exclusions, owner functions, completion conditions and legal wording are proposals.
- No score, rating or ranking is given while the review method is not approved.
- Evidence reviews and conclusions in this report are recorded under a reviewer identity that is not yet verified.
- This report reflects the review record as at 2026-11-10T12:53:08.414Z, after 205 recorded actions.
- Fraud governance and accountability: 2 of the 10 practices reported on were reported as not fully in place.
- Third parties and supply chain: 9 of the 18 practices reported on were reported as not fully in place.
- People, payroll and insider risk: 5 of the 11 practices reported on were reported as not fully in place.
- Finance, banking and financial reporting: 3 of the 6 practices reported on were reported as not fully in place.
- Digital, cyber-enabled and identity fraud: 3 of the 6 practices reported on were reported as not fully in place.
- MK has reviewed evidence for 2 of the 66 practices reported on. For the others, only what was reported is available.
- For “Executive accountable for fraud”, MK reviewed the evidence supplied and found it sufficient.
- For “Board receives fraud reporting”, MK reviewed the evidence supplied and found it insufficient.
- Reviewer conclusion recorded by “MK reviewer (fictional harness)” on 2026-11-10T12:53:08.398Z: confirmed the answer recorded for “Executive accountable for fraud” (answer version 1: “Yes, it is written into a named executive's role”). Recorded basis: “Fictional sample of three months”.
- 79 of the 902 controls are waiting for an answer from an accountable function; 22 of those 79 have no accountable function yet.
- 53 fraud scenarios that the method treats as material cannot yet be decided, because the questions that decide them are unanswered. The method covers 122 scenarios in all.
- 675 of the 902 controls were not asked in this review, and 67 were excluded by a recorded fact or by the organisation's size. Nothing is concluded about them.
- Management has been told by its own respondent that 22 of the 66 practices reported on are not fully in place. This is what was reported; it has been checked against evidence only where stated.
- For “Executive accountable for fraud”, MK reviewed the evidence supplied and found it sufficient.
- For “Board receives fraud reporting”, MK reviewed the evidence supplied and found it insufficient.
- Reviewer conclusion recorded by “MK reviewer (fictional harness)” on 2026-11-10T12:53:08.398Z: confirmed the answer recorded for “Executive accountable for fraud” (answer version 1: “Yes, it is written into a named executive's role”). Recorded basis: “Fictional sample of three months”.
- 79 of the 902 controls are waiting for an answer from an accountable function; 22 of those 79 have no accountable function yet.
- 53 fraud scenarios that the method treats as material cannot yet be decided, because the questions that decide them are unanswered. The method covers 122 scenarios in all.
- 64 of the 66 practices reported on have no evidence reviewed by MK; for these, only the respondent's account is available.
- No evidence has been independently validated; the current method does not provide for independent validation.
- 675 of the 902 controls were not asked in this review, and 67 were excluded by a recorded fact or by the organisation's size. Nothing is concluded about them.
- Decide who should answer the 22 unresolved questions that have no accountable function yet.
- Decide whether to supply evidence for the 64 practices reported on that MK has not reviewed.
- Decide whether the review should proceed to an authorised reviewer's conclusions on scope, evidence and findings.

### Phase 2 executive brief, as built

**Status and basis of this report**

- Internal interim draft. Not for release.
- This report rests on the organisation's own responses to the assessment and on the assessment method. MK has not reviewed evidence or verified any response; evidence review is not part of this assessment. Where the report describes a gap, it is a gap indicated by the responses, not a verified control deficiency.
- Method status: Not approved by MK. Scenario tiers, answer mappings, exclusions, owner functions, completion conditions and legal wording are proposals.
- Responses as recorded at 2026-11-10T12:53:08.414Z, after 205 recorded actions.

**What the responses indicate**

- Fraud governance and accountability: the responses indicate that 2 of the 10 practices reported on in this area are not fully in place.
- Third parties and supply chain: the responses indicate that 9 of the 18 practices reported on in this area are not fully in place.
- People, payroll and insider risk: the responses indicate that 5 of the 11 practices reported on in this area are not fully in place.
- Finance, banking and financial reporting: the responses indicate that 3 of the 6 practices reported on in this area are not fully in place.
- Digital, cyber-enabled and identity fraud: the responses indicate that 3 of the 6 practices reported on in this area are not fully in place.
- The method describes 122 fraud scenarios. For 15 of them, the responses indicate a gap in the practice the method uses to address the scenario; for 25, that practice was reported in place. 69 cannot yet be decided from the responses, and 13 do not apply or are not expected.

**What the assessment covered, and how**

- The assessment is adaptive: each answer decides which questions follow, so not every control is asked. This interview ended when it reached its limit of 95 respondent screens. A control that was not asked, or whose applicability is not yet known, is not a finding: nothing is concluded about it, favourable or unfavourable.
- Practices reported on: 66 of the 902 controls in the method.
- Facts recorded about the organisation: 15 of the 902 controls.
- Waiting for an answer from an accountable function: 79 of the 902 controls. For 22 of these, the open question is whether the practice applies; 22 have no accountable function yet.
- Not reached before the interview ended: 413 of the 902 controls. They were not asked; nothing is known about them.
- Applicability not yet known: 193 of the 902 controls. Whether they apply depends on facts about the organisation's activities that have not been established.
- Depends on a question not yet answered: 69 of the 902 controls. They are asked only once an earlier question is answered.
- Excluded by a recorded scope decision: 67 of the 902 controls, because a recorded fact shows they do not apply, they are not expected at the organisation's size, or a related practice was reported absent.

**Recommended actions**

- For each of the 22 gaps indicated, the register restates the practice as the draft method describes it in place, as a recommended action for management consideration. The actions are not ranked.

**Judgements withheld**

- Withheld: an overall view of the organisation's fraud readiness. It needs a professional judgement that MK has not recorded, and the method is not yet approved.
- Withheld: any order of priority, materiality or urgency among the gaps indicated. MK has not approved a method for prioritisation, and the responses alone do not establish one.
- Withheld: how, by whom and by when each gap should be addressed, beyond the draft method's own description of the practice. That needs judgement about the organisation that MK has not recorded.
- Withheld: whether the responses are accurate. MK has not reviewed evidence or verified any response; this assessment does not include evidence review.
- Withheld: any score, rating or maturity level, while the method is not approved.
- Withheld: any view on controls that were not asked, whose applicability is not yet known, or that are waiting for an answer.

**Decisions requested of management**

- Decide which of the 22 gaps indicated by the responses to act on, and how. The report does not rank them.
- Decide who should answer the 22 open questions that have no accountable function yet.

## What is still for MK

Every Phase 2 template is draft copy (B7); the method content quoted in the recommended actions is the draft method (B4); the presentation limits are placeholders (D2). See `../REPORT-ENGINE-MK-DECISIONS.md`.
