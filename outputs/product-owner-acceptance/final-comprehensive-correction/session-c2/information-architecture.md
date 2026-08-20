# Report information architecture

## The defect
Contents claimed "Management report, Sections 1–8" and "Analytical registers, Appendices A–F",
while the scenario and assurance content rendered as **Appendix S** and **Appendix P** —
mentioned nowhere on the contents page. The premium content read as bolted on.

## The fix
The section plan is now built for the mode and drives both the contents page and the section
numbering, so the two cannot diverge. Sections render only when their content exists, and the
numbering closes over the gaps.

**Remediation / Mixed — 9 sections**, scenario portfolio integrated at 4.
**Sustainment — 10 sections**, with mode-appropriate headings: *what management should confirm*,
*assurance coverage across the control environment*, *deep-dive assurance priorities*,
*control resilience tests*, *who owns sustainment*, *how management will know the position
remains dependable*.

Remediation build-language ("the control environment management should build") no longer heads
a report about capabilities that are operating.

Appendix S: **absent**. Appendix P: **absent**. Registers A–F: **intact**.

## Gate
`v11:comprehensive-coverage-contents-gate` proves every rendered section appears in Contents
with a matching title, numbering is contiguous, no orphan appendix survives, A–F remain, and
each premium section is consumed where its content exists.
