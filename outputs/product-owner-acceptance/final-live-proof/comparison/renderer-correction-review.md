# Final renderer correction — review

Rendered **provider-free** from the stored interpretations in the authorised live-proof
run.json files. **0 provider calls.**

## Single source of truth
One ordered `sectionPlan` now drives Contents, numbering, headings, visibility **and physical
page order**. Sections are collected against their plan key and flushed in plan order, so
divergence is structurally impossible rather than merely unlikely.

## P06 — physical order equals Contents
1 Where the organisation stands · 2 What is driving the position · 3 Where the material fraud
exposure sits · **4 Fraud scenario portfolio** · 5 The control environment management should
build · 6 Who must own the response · 7 Decisions leadership must make · 8 What should happen,
and in what order · 9 How management will know it is working

Scenario portfolio physically precedes Section 5. 56 pages, **0 layout failures**.

## P08 — physical order equals Contents, Sustainment headings throughout
1 Where the organisation stands · 2 What is driving the position · 3 What management should
confirm · 4 Assurance coverage across the control environment · 5 Deep-dive assurance priorities ·
6 Control resilience tests · 7 Who owns sustainment · 8 Decisions leadership must make · 9 What
should happen over 12 months · 10 How management will know the position remains dependable

Remediation heading leaks: **0 of 5** checked phrases appear.

## Management programme taxonomy
> **P06:** 31 implementation actions, followed by 26 embed-and-evidence checkpoints, and 26
> assure-and-review checkpoints across the 12-month programme. 83 programme objects in total.

> **P08:** 3 confirmation actions, followed by 2 embed-and-evidence checkpoints, and 2
> assure-and-review checkpoints across the 12-month sustainment programme. 7 programme objects in total.

The horizon table now carries a Work type column. Appendix E is **unchanged**.

## Material defect found and NOT fixed

**P08 page 11 is blank.** Layout gate `failCount: 1`, `blank: true`, between Section 5
(deep-dive priorities) and Section 6 (control resilience tests) — both flowing sections.

This is a consequence of interleaving flowing sections with fixed-height management pages, which
did not occur while every register sat at the end of the document. I tried one bounded CSS fix
(`.page + .reg{page-break-before:avoid}`, on the theory of a double page break) and it made **no
measurable difference**, so I reverted it rather than ship an unverified rule. The cause is
content flow at a section boundary, not a double break.

P06 is unaffected: 0 blank pages, 0 layout failures.

**Owner decision required.** This is one blank page in a 22-page R35,000 deliverable.
