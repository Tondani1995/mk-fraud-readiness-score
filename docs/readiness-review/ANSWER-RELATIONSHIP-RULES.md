# Answer-relationship rules, revision 0.2 (MK direction of 12 November, second direction, item 2)

This revision replaces the rules in `CONTRADICTION-CLASSIFICATION.md` (relationship-review-0.1). Everything here applies to the fictional reporting prototype only; the rules and the reviewed table are candidates for MK's approval and change no score, band or product.

## What the rules do

When an organisation reports a confirmation fully in place, the report compares it with every supporting practice of the same fraud scenario that is reported weaker, has had no case yet, or is outstanding. Each pair receives one of the five relationships MK set, or a neutral status:

| Relationship | When it applies | Effect in the reports |
|---|---|---|
| Direct contradiction | Both answers describe the same fact and cannot both be true as given. Recorded only from a reviewed pair, with the practice answers under which it holds | Unresolved inconsistency: the scenario is not treated as covered until the answers are settled |
| Necessary dependency | The confirmed control consumes an input that the practice's answer shows does not exist. Recorded only from a reviewed pair carrying dependency semantics: what is consumed and the answers under which it is absent | Unresolved inconsistency; the practice becomes a prerequisite in the programme |
| Complementary weakness | Reviewed: the practice is a further defence against the same scenario, and the confirmation stands as reported | The practice is strengthened; the confirmation is not questioned |
| Untested practice | The practice is in scope and the organisation reports that no case has arisen | Neither supports nor weakens the confirmation |
| Missing information | The practice was declined, not known or is still waiting | Outstanding; nothing concluded |
| Not established (neutral status) | The pair has not been reviewed, or review found that the answers leave the relationship open | Not reviewed: nothing concluded and nothing asked. Reviewed: a question for management, and the scenario is shown as "question to clarify" |

## The four corrections MK directed

**"Not applicable" is outside scope.** A practice answered "not applicable" now has no relationship to the confirmation at all. Only "no case has arisen" is an untested practice. Test RS-01 checks the classifier; RS-08 mutates a real answer to "not applicable" and shows that the pair disappears without the scenario becoming a gap.

**Routing is not dependency.** The classifier no longer reads `askWhen`, preclusion or the method's `dependsBecause` text. Those decide when a question is asked: bank 1.3 has 245 questions with a routing condition, and its 132 `dependsBecause` entries explain why a question is relevant (for example, "these apply to outsourced providers, which the organisation uses"), not that one control needs another to operate. Of the method's 826 confirmation-and-practice pairs, 32 are linked by a routing condition, and every one of them is now "not established" unless reviewed (RS-02). The source contains no reference to a routing field.

**Necessary dependency needs reviewed semantics.** A reviewed pair of type necessary dependency must carry `dependency: { consumes, absentWhen }`; without it the table fails validation and the pair is classified "not established" with basis "semantics not met". With it, the dependency holds only when the practice's answer class is in `absentWhen` (RS-04). A direct contradiction must likewise carry a statement and `holdsWhen`; a reviewed wording written for one option of a choice question (`whenValue`) is not applied to another option (RS-05).

**Unreviewed pairs are neutral.** Of the 826 pairs, 56 are reviewed and 770 are "not established": they are neither assumed complementary nor necessary, they ask management nothing, and their wording states that no conclusion is drawn (RS-03 checks all 826 pairs against three weaker answer classes). The report itself draws 802 of the 826, because a question the coverage map lists under two scenarios is attached to the one its question role names.

## The six pairs reassessed

The test MK set was to distinguish incomplete formal documentation from proof that the underlying control cannot operate. Applied to the two direct contradictions and four necessary dependencies of the first correction:

| Scenario | Pair | Before | Now | Why |
|---|---|---|---|---|
| AI-enabled schemes are not considered | AI-enabled fraud covered (level 4: every relevant process) against AI methods tested per process (high-risk processes) | Direct contradiction | **Direct contradiction (kept)** | Both answers describe the same fact, what the assessment covers. High-risk processes are among the relevant processes, so "every relevant process" and "not for high-risk processes" cannot both be true. Holds when the practice is absent, partly in place or set out but not operating |
| An investigation is not independent or fair | Investigators independent against "line management or HR" investigates | Direct contradiction | **Question to clarify** | HR, or a manager from another area, can be independent of the area investigated. The answers conflict only if line managers investigate their own area, which they do not say. Question: does a line manager ever investigate a matter in the area they manage, and if so, how is independence achieved? |
| Risks above tolerance are left without action | Response decided for every risk above tolerance against risks not rated for likelihood and harm | Necessary dependency | **Question to clarify** | Rating is the method's formal mechanism for comparing risks with tolerance. Its absence is a gap in how the assessment is documented; risks above tolerance can still be identified by a tolerance statement or recorded judgement. Question: without ratings, how does management identify which risks are above tolerance? |
| Invoices are paid for goods or services not received or not agreed | Three-way match against receipt recorded before payment (not always) | Necessary dependency | **Question to clarify** | Confirmation of receipt can come from the person who ordered the goods rather than the receiving record. Question: where receipt is not recorded before payment, what confirmation does the invoice check rely on, and who gives it? |
| Same scenario | Three-way match against services confirmed by the person who received them (no) | Necessary dependency | **Question to clarify** | A contract or project manager may confirm delivery instead. Question: for service invoices, who confirms delivery before payment, and is it recorded? |
| An insider in a high-risk role works unchecked | Block leave for everyone in a sensitive role against high-risk roles known informally | Necessary dependency | **Question to clarify** | An informal understanding of which roles are sensitive can be complete; the missing list is incomplete documentation. Question: without a maintained list, how does management confirm that the requirement reaches every sensitive role? |
| Stock is stolen and hidden in the counts | Independent blind counts against stock not formally recorded | Necessary dependency | **Question to clarify** | A count reveals a loss when compared with an expected quantity, which can be derived from purchases and sales. Question: what is each count compared with? Applies only when stock is answered "not formally recorded"; for "spreadsheets or manual records" the reviewed wording does not apply |

The outcome for the overstated organisation (P6b): of the 21 scenarios the first prototype flagged as false comfort, one has answers to settle, five raise a question to clarify and fifteen have a related practice weaker with the control standing as reported. No necessary dependency remains, because none of the reviewed pairs establishes that a confirmed control consumes an input shown not to exist; the dependency type and its tests remain in place for when MK reviews one that does. No "not established" statement in the table claims that a control cannot operate (RS-06).

## Effect on the reports

Unresolved inconsistencies are only direct contradictions and necessary dependencies; a question to clarify is shown separately, as a question for management, never as a finding that the control fails. Because no reviewed dependency remains, no control is sequenced as a prerequisite and the programme has no prerequisite stage; the stage reappears only when a reviewed dependency exists (RQ-16). Every relationship in the four reports rests on the answer or a reviewed pair, none on routing or a default (RQ-02).

## Tests

`scripts/revised-reports/relationship-semantics-tests.mjs`: RS-01 to RS-09, 9 of 9 pass (`report-revision/relationship-tests.json`), including two mutation tests on the fictional overstated organisation. `report-quality-tests.mjs` RQ-01 and RQ-02 recalculate the 21 flagged scenarios and check every relationship basis in the four reports.

## Decisions for MK

Whether to approve the rules and review table 0.2 (D-2 in `DECISION-REGISTER.md`), whether dependency semantics should live in the method itself as a reviewed field on each question rather than in a separate table, and whether to commission review of the 770 unreviewed pairs before customer use. Until then they are not established, which is the correct and conservative state.
