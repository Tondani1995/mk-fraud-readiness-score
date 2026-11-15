# Before and after: the first correction and this revision (MK direction of 12 November, second direction, item 8)

The same four fictional organisations, reported by the first correction (commit `afa6915`, artefacts kept in `report-correction/`) and by this revision (`report-revision/`). Every figure below is computed by `scripts/revised-reports/revision-comparison.mjs` from the saved models, HTML and PDF page counts, and is in `report-revision/revision-comparison.json`. The measures follow MK's list: substantive conclusions, valid dependencies, practical recommendations, management decisions and actionability, with score presentation and ranking language added because MK named them.

| Measure | P3 mixed | P4 small firm | P5 much unknown | P6b overstated |
|---|---|---|---|---|
| Answers to settle (unresolved inconsistencies) | 0 → 0 | 0 → 0 | 0 → 0 | 6 → 1 |
| Questions for management to clarify | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 5 |
| Scenarios with a control reported as a gap | 58 → 58 | 10 → 10 | 58 → 58 | 4 → 4 |
| Maturity band shown in the Essential | Developing → none | Structured → none | Developing → none | Strategic → none |
| Large score display on Essential page 2 | yes → no | yes → no | yes → no | yes → no |
| Four position statements on Essential page 2 | no → yes | no → yes | no → yes | no → yes |
| Necessary dependencies | 0 → 0 | 0 → 0 | 0 → 0 | 5 → 0 |
| Controls sequenced as prerequisites | 0 → 0 | 0 → 0 | 0 → 0 | 5 → 0 |
| Prerequisite stage in the programme | no → no | no → no | no → no | yes → no |
| Controls with a specific target practice | 53 → 106 | 10 → 15 | 51 → 103 | 22 → 63 |
| Controls with named records | 47 → 106 | 9 → 15 | 45 → 103 | 15 → 63 |
| Generic success measures | 53 → 0 | 5 → 0 | 52 → 0 | 42 → 0 |
| Mechanical activity lines | 259 → 0 | 39 → 0 | 251 → 0 | 143 → 0 |
| Controls with a failure response | 0 → 106 | 0 → 15 | 0 → 103 | 0 → 63 |
| Decision on order uses explicit factors | no → yes | no → yes | no → yes | no → yes |
| Actions in the register | 126 → 38 | 24 → 16 | 128 → 43 | 88 → 43 |
| Actions that restate one control | 108 → 5 | 17 → 6 | 105 → 5 | 63 → 8 |
| Questions for management in the findings | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 6 |
| Rank numbers in the Essential | 11 → 0 | 11 → 0 | 11 → 0 | 10 → 0 |
| Materiality or ranking phrases | 5 → 0 | 5 → 0 | 5 → 0 | 5 → 0 |
| Essential pages | 8 → 8 | 8 → 8 | 8 → 8 | 8 → 8 |
| Comprehensive pages | 54 → 65 | 24 → 26 | 52 → 64 | 45 → 51 |

## Substantive conclusions

For the overstated organisation the conclusion changes most. The first correction told management that six scenarios had answers that "conflict or rely on a practice reported as weaker" and treated all six as uncovered. On reassessment only one of them is a genuine conflict about the same fact (whether the fraud risk assessment covers AI-enabled schemes); the other five are questions the answers leave open, mostly because a supporting practice is undocumented or informal rather than absent. The cover now reads: "On its own answers, the organisation reports the controls in place for 102 of the 106 fraud scenarios that apply and a control reported as a gap in 4; 1 has answers to settle and 5 raise questions the answers do not settle." The report asks the five questions in writing instead of asserting that five controls cannot operate, which is the logically defensible position on self-reported information.

For all four organisations the cover and page 2 now separate the calculated test result, the unresolved inconsistencies, a provisional interpretation and the approved readiness conclusion (none). The maturity band no longer appears anywhere in either report; the fixture figure is kept, small and labelled, for traceability. The other three organisations' substantive findings are unchanged in number (58, 10 and 58 scenarios with a control reported as a gap), because their answers contain no conflicting pairs; what changed for them is how the position is stated.

## Valid dependencies

The first correction sequenced five controls as prerequisites in the overstated organisation's programme, four of them from a reviewed table that read missing documentation as inability and one from a routing rule. None survives reassessment, so no control is now sequenced before another and the programme has no prerequisite stage. The dependency type remains, with tests, for when a reviewed pair establishes that a confirmed control consumes an input shown not to exist. No relationship in any report now rests on routing or on a default assumption.

## Practical recommendations

Every control the reports act on now has a specific target operating practice, a responsible function, three implementation activities, a named record with what it should show, a success measure stated as the outcome for a period, an operating cycle and a failure response, all from the draft control-content library. The 152 generic success measures of the first correction ("records for the period show this practice applied to every case in scope") and its 692 mechanical activity lines ("agree the design with the...", "keep the records in E..", "review the first full cycle against M..") are gone. Examples are in `CONTROL-CONTENT-LIBRARY.md`.

## Management decisions

The decision agenda keeps its shape, with two changes. The decision on order now asks management to decide "using explicit factors" and names them (the control's position, whether money or goods can leave without it, activity volume, detective cover and controls shared), in place of "decide which open schemes to address first" with no basis. For the overstated organisation, the first decision now covers both settling the one conflict and answering the five questions before the controls concerned are relied on. Oversight is named from the organisation's own answer; the first correction reported "the board or its audit committee" for an organisation that had answered "a board without an audit or risk committee".

## Actionability

The action register is about a third of its former length because controls are now put in place by the role that owns them, in one action per stage and owner, instead of one action restating each blueprint row. The overstated organisation's findings carry six written questions for management. The 30/60/90 roadmap is presented as proposed planning stages, with each window labelled "proposed window" and the page stating that the windows are not deadlines, contractual dates or estimates, and that whether a control works is known only after its first full cycle.

## What is not better

The Comprehensive is longer: 54 to 65 pages for the mixed group, 52 to 64 for the group with much unknown, 45 to 51 for the overstated group and 24 to 26 for the small firm. The management sections stay at about 13 pages; the growth is in Appendix C, which now holds a full blueprint per control laid out as one readable block instead of a dense five-column table. The library is a draft covering only the controls these four organisations reach, so a different organisation would meet controls without library content, which the reports and the candidate sufficiency rules disclose as a method gap. The interpretation remains fixed-rule text, the AI manuscript stage has not been run, and no customer has read either version.
