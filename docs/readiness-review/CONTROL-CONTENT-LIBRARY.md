# Control-content library, draft 0.1 (MK direction of 12 November, second direction, item 5)

Draft bank 1.3 describes 688 of its 821 practice questions only by their in-place answer: no level descriptions, no named records and, for most, no operating cycle (`METHOD-CONTENT-GAPS.md`). The first correction declared those gaps and filled the reports with generic wording such as "records for the period show this practice applied to every case in scope". MK directed a controlled, reusable library instead of 688 unrelated recommendations, starting with the controls the fictional reports act on. This is professional advisory content embedded in automated reports; it is not evidence review or verification, and the records it names are records management should maintain, not evidence MK has examined.

## Design

The library has two layers, in `src/lib/reports/revised/control-content/`.

**Archetypes** (`archetypes.ts`) are fifteen control patterns. Each fixes, once, how a control of that kind is put in place (three implementation activities), what management keeps (the record and what it shows), how success is measured, and what to do when it fails, with slots for the specifics. Approving an archetype approves its structure for every control that uses it.

| Archetype | Pattern | Controls |
|---|---|---|
| Check before the event | A defined check that each item must pass before it proceeds | 30 |
| Monitor for exceptions | Data reviewed on a set cycle for defined patterns, independently, with each exception followed up | 18 |
| Technical protection everywhere it is needed | A security or system setting applied to every item in scope, with coverage checked | 15 |
| A requirement of the fraud risk assessment | The assessment required to cover a specific question or take a specific form | 12 |
| Approval by a second person | Each item approved by someone other than the person who processes it | 11 |
| A people practice applied consistently | A requirement for defined people, applied to all of them, exceptions approved | 9 |
| A procedure ready to use | A written procedure naming who decides and who acts, tested or used | 9 |
| Reconcile and explain differences | Two independent records compared on a set cycle, every difference explained | 8 |
| Verify a change through a known channel | A change to details that direct money, goods or access confirmed through a channel the organisation starts | 6 |
| Separate duties | No one person can carry out every step that would let them commit and conceal the scheme | 6 |
| A maintained list or record | A list that other controls rely on, kept complete and current | 6 |
| An organisation-wide rule | A short written rule applying to everyone, including executives, briefed and tested | 5 |
| Training that reaches everyone it should | Specific people complete specific content at a set point, tracked | 4 |
| Independent physical verification | What the records say exists, checked physically by people independent of custody | 4 |
| Independent review | An area reviewed by someone independent of management, findings tracked to closure | 3 |

**Entries** (`entries.ts`) are one per control: the archetype, the target operating practice written in full, a short form for labels with a hard length limit, and the slot values (the population, operating cycle, record, what the record shows when the control works, where it is enforced). Where an archetype's wording does not fit, an entry supplies its own activities (30 entries), measure (18) or failure response (7), and five entries name a different responsible function from the method's first-named owner. Every entry records its sources: the bank's level 4 wording (58 entries) and named evidence restated as records management keeps (58), MK's existing MFRS question playbooks (30 entries, 17 playbooks, for example D7-Q01 for supplier due diligence and D7-Q04 for supplier payment changes), and otherwise the bank's question restated as an operating practice (88).

The responsible function is the method's owner consolidated to one label per function (`roles.ts`), unless the entry names another.

## Coverage

146 entries cover every control in the Essential findings and Comprehensive blueprints of the four fictional organisations (145 controls appear in the rebuilt reports; one entry covers a control the first correction acted on that this revision no longer does). Where a control has no entry, nothing generic is substituted: the report uses the method's own wording, says the library has no entry yet, and the candidate sufficiency rules report it as a method condition (EA-2, CB-3), never as missing information from the organisation. The adversarial journey in SA-06 shows this happening for controls the four organisations do not reach.

Extending the library to the remaining practice questions is a matter of writing entries against the same fifteen archetypes; most of the 688 fall naturally into them. The archetypes would need to grow only for genuinely new patterns.

## Quality controls

RQ-14 checks that every control in the four reports has a target practice, responsible function, at least three activities, a record, a specific success measure, an operating cycle and a failure response; that no generic measure remains in any model or report; that measures are distinct (at least 95 per cent per organisation); that every entry points to a practice question and a valid archetype; that every short form fits the Essential's 160-character label; and that no entry uses first-person wording or an em dash.

## Content enrichment examples

The same control in the first correction (afa6915) and in this revision. More examples are in `report-revision/revision-comparison.json`.

**Senior review of supplier payments** (overstated organisation; a practice question with no level description)

| | First correction | This revision |
|---|---|---|
| Target practice | Senior review of supplier payments: in place across everything it should cover. | Each month a senior manager who does not process payments reviews the list of supplier payments for unfamiliar suppliers, unusual amounts and changed bank details, and follows up each query. |
| Activities | Agree the design with the finance lead, so that it meets the target standard. Review the first full cycle against M27. | Define the patterns to look for and the report or query that finds them; name who reviews the output monthly and who follows up each exception, independently of the people reviewed; run the review over the last twelve months of data and follow up what it finds. |
| Records | None named | Monthly payment review: the list reviewed, the reviewer, each query raised and its answer. |
| Success measure | Records for the period show this practice applied to every case in scope: senior review of supplier payments. | The review of supplier payments ran monthly throughout the period, and every exception it raised has a recorded answer. |
| If it fails | None | Where an exception proves to be fraud or error, follow the response procedure, correct the control that allowed it and add the pattern to the review. |

**New supplier process** (mixed retail group; an anchored question)

| | First correction | This revision |
|---|---|---|
| Target practice | Every new supplier goes through a defined process, with set checks and an approval, before it can be paid. | Every new supplier passes set checks, including registration, tax number, bank account and directors, and is approved before it can be paid. |
| Activities | Agree the design with the procurement lead, so that it meets the target standard at level 4. Keep the records in E01. Review the first full cycle against M01. | Set out the check in the procedure for new suppliers: what is checked, by whom, and who may approve an exception; set the supplier master file so that no new supplier proceeds until the check is recorded as passed; look back over new suppliers from the last twelve months and follow up any that would not have passed. |
| Records | The onboarding procedure, completed onboarding files for a sample of new suppliers, exception reports (the method's evidence wording, written for a reviewer) | Supplier set-up file: the result and source of each check, who captured the supplier and who approved it. |
| Success measure | Records for the period show that every new supplier goes through a defined process... | Every new supplier in the period has a supplier set-up file showing each check passed and an approval dated before the first payment. |

**Daily reconciliation** (mixed retail group): the target practice is unchanged because the bank's level 4 wording is already specific; the record becomes "Daily cash reconciliation: takings at each cash point compared with sales records, the preparer and reviewer, and each shortage or surplus with its explanation", and the measure becomes "Every daily cash reconciliation due in the period was completed and reviewed, and every difference has a recorded explanation".

## Decisions for MK

Approval of the fifteen archetypes and of the 146 entries as MK's advisory content (D-5 in `DECISION-REGISTER.md`), who in MK owns and versions the library, and whether to extend it to the remaining practice questions before any paid report uses the revised method. Until then it is draft content in a fictional prototype.
