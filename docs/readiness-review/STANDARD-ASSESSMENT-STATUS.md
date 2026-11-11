# The standard assessment: completion without reviewer conclusions

MK's direction of 11 November (18:33), item 1. The review Snapshot, the respondent journey and the standard management view described MK evidence review and an authorised reviewer's conclusion as part of completing the assessment. That is outside MK's product boundary, and it is corrected for build 1.5 and build 1.6 sessions alike.

## What the standard surfaces now say

Status is four separate statements, so that none implies another (`assessmentStatusView` in `view-model.ts`, shown by `AssessmentStatus`):

| Statement | Values | Defined by |
|---|---|---|
| Interview | Completed, or In progress | Staged sessions: the respondent has reached every confirmation that applies so far (a later answer or correction can reopen it). Build 1.5: the interview has ended, with any scenarios left unsettled stated |
| Function packages | None needed, Not yet sent, Open, Returned | Sends made, questions still open, answered, declined and answered "I don't know" by the function |
| Information | Nothing outstanding, or *n* outstanding | Confirmations not yet reached, questions with a function, questions declined by a function and questions a function answered "I don't know". None is treated as in place or as missing |
| Report eligibility | Not determined by this assessment | Whether a paid report can be issued, and with how much outstanding, is an MK commercial rule not yet set; the assessment makes no order, report or delivery available |

The assessment is complete when the interview is completed and nothing is outstanding. The same definition is carried into report input 1.3.0 (`method.completeness` and `assessmentStatus`), and the revised evidence model counts exactly the same outstanding items as the interface (SS-09).

The Snapshot count "Evidence still to review" is replaced by "Information outstanding", in the Snapshot and in the public review-track preview; the Snapshot's evidence section and the management view's "Needs evidence" section are removed from the standard surfaces. The respondent's closing screen states what is outstanding instead of "until an MK reviewer has examined evidence", and the review landing page defines completion in the same terms.

## The Advisory capability, kept

The reviewer workspace, its links, its actions and every record are unchanged. Reviewer findings and reviewer actions are no longer listed as standard work or as a step to completion; when a session has Advisory records, the management view shows them in a separate section, "Advisory evidence review (separate service)", which says they are kept in full and are not part of completing the standard assessment. Exports and the reviewer workspace still carry every record.

## Earlier hand-over

On the first question of an area that has not been handed over, a staged session offers to hand the whole area to its function, naming the function and the suggested person, and stating that the area's questions wait for that function and stay outstanding until it answers (`staged-assessment/delegation/DELEGATION-TIMING.md`).

## Tests

`scripts/readiness-review-standard-status-tests.mjs`, 10 of 10:

| Test | Retests |
|---|---|
| SS-01 | No standard surface, in build 1.5 or 1.6, makes evidence review or a reviewer's conclusion a completion condition; the page sources are checked too |
| SS-02 | Standard-assessment completion: a completed journey reads Completed, Returned, Nothing outstanding, Not determined; report input agrees |
| SS-03 | Declines: two declined questions stay outstanding with the function and reason, in the interface, the report input and the evidence model |
| SS-04 | Unanswered information and "I don't know": waiting questions and a function's "I don't know" are outstanding and never counted as in place |
| SS-05 | Stage reopening: a correction that brings questions into scope reopens the interview and the information statement, which settle again when answered |
| SS-06 | Concurrent saves: a function's decline and its answer to the same question submitted together; one applies, the other is told the session changed, nothing is counted twice |
| SS-07 | Multi-function assignments: 130 questions with eight functions and two handed-over areas, none served to two functions or answered twice |
| SS-08 | The hand-over offer appears at area entry in staged sessions only, and the core stage still completes |
| SS-09 | Reports and interface count the same outstanding information for all six journeys |
| SS-10 | Corrections after an early hand-over send new questions to the function, never back to the respondent |

The contract test C-09 now checks that reviewer actions sit in the Advisory section and nowhere in standard work or completion (contract tests 23 of 23).

## Mobile and accessibility

Screens at 1440 and 390px from seeded fictional sessions (`standard-status-screens/`, checks in `checks.json`): the four statements on a completed and on an outstanding Snapshot, the management view, the Advisory section, the hand-over offer and the landing page. Each check refuses reviewer-completion wording, requires the four statements where they apply, and fails a page that scrolls sideways or a panel wider than the viewport.

The first phone capture found the status panel 520px wide at 390px, clipped by its container because the function table set the grid column's width; the column is now bounded and the table scrolls inside it. The automated scan then found that scrolling region unreachable by keyboard (axe `scrollable-region-focusable`, serious, three pages at 390px); it is now a focusable, labelled region. The final run on a fresh production build: 9 of 9 screen checks pass, and the axe scan (WCAG 2.0, 2.1 and 2.2 A and AA rules) of seven pages at both widths (landing, completed and outstanding Snapshots, management view with outstanding information, management view with Advisory records, interview at area entry, a function package) reports 0 violations in 14 scans. It leaves five contrast results undecided: on three pages at 390px axe could not determine the background of 10 or 11 elements because another element partly covers them, and on the interview page at both widths two elements contain only symbols. The phone captures of the status panel and the hand-over offer read clearly, but that is a visual judgement, not a measured contrast ratio (`standard-status-screens/axe.json`).

**Limitations.** The automated scan covers part of what a manual audit and screen-reader testing would find; neither has been done, and no physical phone was used. The screens use deterministic fictional answers. The status wording is engineering copy and needs MK's approval (B7). The function table still needs sideways scrolling at phone width.
