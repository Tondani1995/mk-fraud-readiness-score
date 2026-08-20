# Final PDF presentation closure

Rendered **provider-free** from the stored final-live-proof interpretations. **0 provider calls.**
No analytical object, register, scenario, assurance row or AI manuscript was changed.

## Root cause — one rule, both defects

Breaks were declared on **both edges**: `.page{page-break-after:always}` and
`.reg{page-break-before:always}`. Where the two met, the browser broke twice and emitted an
empty sheet; and because a `.page` never declared a break *before* itself, a fixed-height
management page starting mid-sheet was pushed down, stranding whatever preceded it.

Harmless while every flowing register sat at the end of the document. Both symptoms appeared
once management sections and flowing sections began to interleave.

**Fix:** declare breaks on the leading edge only. `.page` now breaks *before* itself, matching
`.reg`, and the first section suppresses it so the document does not open on a blank sheet.
Adjacent sections of any combination now break exactly once.

The earlier `.page + .reg{page-break-before:avoid}` hypothesis was wrong and had been reverted;
this is a different rule with a different cause.

## Defect 1 — Aurelia blank page: FIXED
P08 page 11 was blank between Sections 7 and 8. Now **0 blank pages**, 22 pages, layout
failures **0**. Sections 1–10 remain sequential; appendices unchanged.

## Defect 2 — Nimbus orphan continuation page: FIXED
Section 4 previously shared a page with the start of Section 5, whose synthesis then stranded a
fragment on a near-empty page 7.

Now: page 5 Section 3 · page 6 Section 4 complete · **page 7 Section 5 opens cleanly** ("The
control programmes") · page 8 Section 5 continues ("Programme detail"). No page exists to hold a
paragraph tail. Typography unchanged; page count unchanged at 56 because the fix redistributed
breaks rather than compressing content.

Only page 1 falls under 400 characters in either document — the cover, by design.

## Defect 3 — programme taxonomy wording: FIXED
Deterministic cross-reference now reads **"Every programme item, with its dependency and
completion criterion, is in Appendix E."** The previous "Every action…" is gone from both.

Headlines preserved exactly:
- P06 — *31 implementation actions, followed by 26 embed-and-evidence checkpoints, and 26 assure-and-review checkpoints across the 12-month programme. 83 programme objects in total.*
- P08 — *3 confirmation actions, followed by 2 embed-and-evidence checkpoints, and 2 assure-and-review checkpoints across the 12-month sustainment programme. 7 programme objects in total.*

The remaining "26 actions" phrasing sits inside the **AI implementation synthesis**, which this
session was instructed not to modify.
