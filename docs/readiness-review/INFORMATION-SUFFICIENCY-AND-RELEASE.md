# Information sufficiency and paid-report release: candidate rules for MK's approval

> **Superseded on 12 November (second direction)** by `PRODUCT-SUFFICIENCY-CANDIDATE.md` (candidate rules 0.2, per deliverable). Rules A, E and C below let an Essential pass with breadth incomplete and a Comprehensive pass with a function package declined; both cases are now adversarial tests that fail. Kept as the record of the first correction.

MK's direction of 12 November 2026, item 4 (R-2): define candidate information-sufficiency and paid-report-release rules, keeping completed assessment stages, outstanding information, analytical sufficiency and commercial fulfilment separate, and never letting a declined question become a completed answer. The rules are implemented as a pure evaluator for testing (`src/lib/reports/revised/information-sufficiency.ts`). They are connected to no order, entitlement, payment or fulfilment path, and nothing releases a report.

## Four separate statements

| Statement | What decides it | Who owns the rule |
|---|---|---|
| Stages | Whether the respondent's core stage and the breadth stage are complete, as the session records them | The method (already in build 1.6) |
| Outstanding information | Every question asked and not answered: declined, "I don't know" or still waiting, counted by reason | The method (already in build 1.6 and the interface) |
| Analytical sufficiency | Whether the answers given are enough to analyse each applicable scheme (rule A) | MK, candidate below |
| Commercial release | Whether a paid report may be issued, and with what disclosure (rules E and C) | MK, candidate below |

None implies another. A completed core stage can still leave answers outstanding; nothing outstanding can still leave schemes unanalysed because the interview has not reached them; and a report that is analytically sufficient is still not released unless MK's commercial rule says so.

## Candidate rules

**Rule A, analysable scheme.** A scheme is analysable when every one of its confirmations has a real answer. A declined question, a question answered "I don't know" and a question still waiting are not answers. A scheme with some but not all confirmations answered is partly analysable, and the report names the missing controls and concludes nothing about them. A scheme whose confirmations the method does not ask of an organisation of this size (the proportionality rule) is outside the count and reported as such.

**Rule E, Essential release.** The core stage is complete; at least 90% of applicable tier 1 schemes are analysable; no area in scope has every tier 1 confirmation unanswered; and every outstanding question is disclosed in the report, by control, reason and function.

**Rule C, Comprehensive release.** Rule E, and the breadth stage is complete with at least 85% of applicable schemes analysable.

Declines are never counted as answers under any rule. They count against the thresholds when they fall on a confirmation, and they are always disclosed.

## What the rules do to the fictional cases

From `report-correction/prioritisation-and-sufficiency.json`. The four completed journeys all meet both candidate rules, including the organisation with seven questions not known and the mixed organisation with two questions declined by Finance (both declines fell on supporting practices, not confirmations). An interview stopped after 60 screens shows the rules separating the statements: nothing is outstanding, because nothing unreached has been asked, yet 73 of 109 schemes cannot be analysed and both rules fail.

| Case | Core / breadth stage | Outstanding | Schemes analysable | Tier 1 analysable | Essential rule E | Comprehensive rule C |
|---|---|---|---|---|---|---|
| Fictional Retail Group (mixed controls) | complete / complete | 0 | 106 of 106 | 43 of 43 | Meets | Meets |
| Fictional Owner-Managed Firm | complete / complete | 0 | 47 of 47 (2 not expected at this size) | 21 of 21 | Meets | Meets |
| Fictional Retail Group (extensive unanswered information) | complete / complete | 7 (0 declined, 7 not known, 0 waiting) | 104 of 106 | 43 of 43 | Meets | Meets |
| Fictional Retail Group (overstated confirmations) | complete / complete | 0 | 106 of 106 | 43 of 43 | Meets | Meets |
| Fictional Retail Group (mixed controls) (two questions declined by Finance) | complete / complete | 2 (2 declined, 0 not known, 0 waiting) | 106 of 106 | 43 of 43 | Meets | Meets |
| Fictional Retail Group (mixed controls) (interview stopped after 60 screens) | incomplete / incomplete | 0 | 36 of 109 | 34 of 44 | Does not meet | Does not meet |

The part-way interview fails rule E for three reasons: The core stage is not complete; Fewer than 90% of applicable tier 1 schemes can be analysed (34 of 44); No tier 1 confirmation is answered in 2 areas.

## Choices for MK

| Ref | Decision | Candidate | Alternatives |
|---|---|---|---|
| R2-a | Rule A as the definition of an analysable scheme | Every confirmation answered; declines, "I don't know" and waiting are not answers | Count a scheme analysable when its tier 1 confirmations are answered, ignoring tier 2 and 3 |
| R2-b | Essential threshold | 90% of applicable tier 1 schemes analysable, and no area with every tier 1 confirmation unanswered | 100% (no Essential with any tier 1 gap in information); 75% with stronger disclosure |
| R2-c | Comprehensive threshold | Rule E, breadth complete, 85% of all applicable schemes analysable | Same as Essential, with the shortfall disclosed |
| R2-d | Declines on confirmations | Count against the threshold and always disclose | Disclose only, never block |
| R2-e | Who may release a report that fails a rule | No one in the automated product; the organisation completes the missing answers | MK Advisory may release with a written limitation |

The evaluator's thresholds are constants in one file; whichever values MK approves can be tested against the same fictional cases before any commercial use.
