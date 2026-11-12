# Candidate product-sufficiency rules, version 0.2 (MK direction of 12 November, second direction, item 1)

This replaces the candidate rules A, E and C in `INFORMATION-SUFFICIENCY-AND-RELEASE.md`. The rules are candidates: they are evaluated for every fictional report and shown in the supporting workbook, and they are connected to no order, entitlement, payment, product or fulfilment path. The evaluator is `src/lib/reports/revised/information-sufficiency.ts` (rule version `information-sufficiency-candidate-0.2`); it imports nothing (SA-09).

## The two defects MK reproduced, and why they cannot recur

Version 0.1 judged sufficiency from scenario confirmations alone. An Essential therefore passed with the core stage complete and the breadth stage stopped, and a Comprehensive passed with every confirmation answered while a function declined its entire diagnostic package. Version 0.2 judges each analytical deliverable the product catalogue promises, using the information that deliverable needs. Both journeys are now adversarial tests run through the real build 1.6 engine: the stopped breadth fails the Essential on EF-2 and EF-4 (SA-02), and the declined package fails the Comprehensive on CP-1 and CB-2 while the Essential, which rests on confirmations, still meets and discloses the declined questions (SA-03).

## Conditions by deliverable

Information conditions depend on the organisation's answers; a declined, "I don't know" or waiting answer never counts. Method conditions depend on MK's own content and are reported separately, so that a gap in the method is never presented as a gap in what the organisation said.

| Product | Deliverable (catalogue promise) | Condition | Kind | Candidate threshold |
|---|---|---|---|---|
| Essential | Findings across all applicable areas | EF-1 core stage complete | Information | |
| | | EF-2 breadth stage complete (every applicable confirmation reached) | Information | |
| | | EF-3 tier 1 confirmations answered | Information | 90% |
| | | EF-4 tier 2 and 3 confirmations answered | Information | 80% |
| | | EF-5 every applicable area has its confirmations answered | Information | 50% per area |
| | Management actions, 30/60/90-day roadmap, records for each action | EA-1 who has final oversight is known, so the roadmap can say to whom progress is reported | Information | |
| | | EA-2 every recommended control has a target practice, records and a measure in the control library | Method | |
| Comprehensive (in addition to Essential) | Full finding and risk registers | CF-1 tier 1 confirmations answered | Information | 95% |
| | | CF-2 all confirmations answered | Information | 90% |
| | | CF-3 every area's confirmations answered | Information | 75% per area |
| | Target-state blueprint for each control acted on | CB-1 diagnostic questions put to the organisation answered (questions never asked are not counted) | Information | 80% |
| | | CB-2 no scenario acted on has every diagnostic question asked about it declined, not known or waiting | Information | |
| | | CB-3 every blueprint control has library content | Method | |
| | Governance analysis and leadership decision library | CG-1 who has final oversight is known | Information | |
| | | CG-2 every governance and fraud risk assessment confirmation answered | Information | 100% |
| | | CG-3 governance and risk assessment diagnostic questions answered, and neither governance function declined its package in full | Information | 80% |
| | Implementation programme with dependencies and owners | CP-1 no function declined its package in full | Information | |
| | | CP-2 no question put to a function is still waiting | Information | |
| | | CP-3 every prerequisite used rests on reviewed dependency semantics | Method | |

The rules do not require every optional diagnostic question to be answered. Thresholds apply only to questions the method actually put to the organisation; the small firm meets both products although only 22 of its 186 applicable supporting practices were asked, because the method did not need the rest (SA-07).

## Adversarial results

`scripts/revised-reports/sufficiency-adversarial-tests.mjs`, 9 of 9 pass (`report-revision/sufficiency-tests.json`). Each journey is the mixed retail group (P3) with one thing withheld.

| Test | What is withheld | Essential | Comprehensive |
|---|---|---|---|
| SA-01 | Nothing | Meets | Meets |
| SA-02 | Breadth stopped once the core stage is complete (1 of 62 tier 2 and 3 confirmations answered) | Fails EF-2, EF-4, EF-5 | Fails, adding CF-2, CF-3, CG-2 |
| SA-03 | Procurement declines all 11 of its questions; every confirmation answered | Meets, discloses the declines | Fails CB-2, CP-1 |
| SA-04 | HR and payroll answer "I don't know" to every diagnostic question | Meets | Fails CB-2 (three scenarios without any diagnostic answer) |
| SA-05a | The risk function declines its package | Meets | Fails CG-3, CP-1 |
| SA-05b | Who has final oversight is not known by the respondent or the function | Fails EF-1, EF-2, EA-1 (the engine holds the core stage open) | Fails, adding CG-1 to CG-3 |
| SA-06 | A quarter of tier 1 confirmations not known and then declined (34 of 45 answered) | Fails EF-3 | Fails CF-1, CF-2 and others; the controls brought into view also lack library content (CB-3), reported as a method condition |
| SA-07 | Nothing; small firm with few diagnostic questions asked | Meets | Meets |
| SA-08 | A synthetic control without library content | Fails EA-2 only; information conditions met | Fails EA-2, CB-3, CP-3 |

## The four fictional organisations

| Organisation | Essential | Comprehensive |
|---|---|---|
| P3 mixed retail group | Meets | Meets |
| P4 owner-managed firm | Meets | Meets |
| P5 retail group with much unknown | Meets | Fails CG-2: governance and risk assessment confirmations are outstanding |
| P6b overstated confirmations | Meets | Meets |

The P5 Comprehensive and its supporting workbook are still produced for comparison, labelled as a prototype; in a released product the candidate verdict would hold it back until MK decides how an outstanding governance answer is handled.

## Decisions for MK

Whether these deliverable-based conditions are the right shape (D-4 in `DECISION-REGISTER.md`), the thresholds in `CANDIDATE_THRESHOLDS`, whether an Essential may issue when a function declines a diagnostic package (the candidate says yes, with disclosure, because the Essential's findings rest on confirmations), and what the customer is told when a product's conditions are not met. Nothing here is connected to fulfilment until MK approves it.
