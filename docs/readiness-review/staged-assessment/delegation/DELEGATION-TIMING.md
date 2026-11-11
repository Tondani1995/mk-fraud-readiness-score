# Earlier area delegation: what it changes

MK's direction of 11 November (18:33), item 3. Build 1.6 now offers the respondent, on the first question of any area not already handed over, the option to hand the whole area to its accountable function before answering anything in it. Until now the offer appeared only after an "I don't know" in the area, and the journeys delegated only once the core stage was complete. No screen limit is set.

## What changed

- **The offer** (`respondentView.areaHandoff`, interview panel `[data-review-area-delegate]`): the area, the function and the suggested person the method names for it, with the consequence stated: the area's questions wait for the function and stay outstanding until it answers. Staged sessions only; build 1.5 is unchanged.
- **Stage accounting** (engine build 1.6, `stages()`): a confirmation in a handed-over area counts as with a function whether or not the interview has reached it. Without this, handing an area over early left the respondent's core stage incomplete with nothing left for the respondent to answer.

One assessment, one action log and one task per question are kept: the hand-over is an action in the same log, and a handed-over question is served only to that function.

## Experiment

`scripts/research/delegation/timing.mjs` runs three fictional organisations through the real session layer with the hand-over at four moments, then works the function packages until nothing is left. Output: `timing.json`. Fictional deterministic answers, not people.

| Organisation | Hand-over | Respondent screens | Function screens | Organisation total | Duplicate tasks | Answered by two actors | Outstanding at end | Confirmations answered by functions |
|---|---|---|---|---|---|---|---|---|
| Retail group, much unknown (P5), D4 and D9 | none | 162 | 118 | 280 | 0 | 0 | 7 | 35 |
| | after the core stage | 141 | 130 | 271 | 0 | 0 | 7 | 42 |
| | at area entry | 126 | 141 | 267 | 0 | 0 | 7 | 50 |
| | at the start | 126 | 141 | 267 | 0 | 0 | 7 | 50 |
| Mixed retail group (P3), D4, D5 and D9 | none | 162 | 79 | 241 | 0 | 0 | 0 | 0 |
| | after the core stage | 132 | 111 | 243 | 0 | 0 | 0 | 22 |
| | at area entry | 110 | 133 | 243 | 0 | 0 | 0 | 39 |
| | at the start | 110 | 133 | 243 | 0 | 0 | 0 | 39 |
| Small firm (P4), D9 | none | 96 | 21 | 117 | 0 | 0 | 0 | 0 |
| | after the core stage | 88 | 29 | 117 | 0 | 0 | 0 | 6 |
| | at area entry | 83 | 34 | 117 | 0 | 0 | 0 | 10 |
| | at the start | 83 | 34 | 117 | 0 | 0 | 0 | 10 |

The core stage completes in every variant. The journey driver makes no corrections, so corrections are tested separately: with three areas handed over at entry, each of the three corrections that brought new confirmations into scope sent the new questions to the function and never back to the respondent, with no duplicate task (`readiness-review-standard-status-tests.mjs`, SS-10).

## What it shows

Handing an area over at its first question moves the respondent's work to the function that holds the answer without adding work overall: the respondent answers 5 to 22 fewer questions than with a hand-over after the core stage (126 against 141, 110 against 132, 83 against 88), the organisation's total is the same or lower (267 against 271, 243 against 243, 117 against 117), and more confirmations are answered by the function that runs the control (50 against 42, 39 against 22, 10 against 6). Outstanding information is unchanged, because it depends on what the functions know, not on when they are asked. Handing every area over at the start gives exactly the same result as at area entry: no question of an area is asked before its first question, so handing it over at that moment loses nothing, and a separate start-of-interview list adds nothing.

## Limits

Answers are deterministic and fictional; a real respondent might hand over areas they could answer, or keep ones they cannot. The suggested person is the method's module owner, not the organisation's own role names. Whether the offer should also appear on the activities screen, and whether MK wants a cap on how many areas one respondent can hand over, are product choices; neither is needed for the results above.
