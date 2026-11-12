# Prioritisation methodology: proposal for MK's decision

MK's direction of 12 November 2026, item 2: do not turn information-gathering tiers into fraud-risk priority, likelihood or impact, and do not assume urgency, difficulty or deadlines from tier or answer class; provide a separate, decision-ready proposal. This document is that proposal. Nothing in it is applied to a report.

## The decision sought

How a paid report should say what management should address first, and with what label. MK is asked to choose one of the options below (P-8), and, if it chooses option B, to approve its criteria (P-9 to P-11).

## Where the prototype stands now

The corrected prototype removes every rating the first prototype derived: risk priority (Critical, High, Medium, Low from the scheme tier), likelihood (from the answer class), impact (from the tier), implementation difficulty (from the number of gaps), target periods of 30, 60 or 90 days (from tier and answer class) and decision deadlines. In the four fictional organisations that removed 790 derived values (`report-correction/CLAIMS-REGISTER.md`). Risks now read "Not rated", and the reports say why.

What the reports still do is order the work by what must be known and decided before controls are built (option A below). The scheme tier is reported for what it is, the stage at which the draft method confirms a scheme, and every place a tier appears says that it is not a rating.

## Why tier and answer class cannot carry a rating on their own

The tier decides how early and how deeply the method asks about a scheme. A tier 1 scheme is confirmed in the core stage for every organisation it applies to, which reflects how commonly the scheme applies and how foundational its controls are, not how likely it is to occur in a particular organisation or how much it would cost. The answer class says how far a control is reported in place. A control reported as not in place makes a scheme easier to commit, but the assessment does not record the volume or value of the activity the control protects, the organisation's loss history, or the compensating controls the method does not ask about, so it cannot support a likelihood or an impact rating by itself.

## What the assessment does record that a method could use

| Information | Recorded today | Use for prioritisation |
|---|---|---|
| Whether a scheme applies (scope facts, profile) | Yes | Which schemes are in the report at all |
| How far each control is reported in place | Yes | Control position, never alone a likelihood |
| Answers that conflict or rely on a weaker practice | Yes (corrected classification) | Establish the facts first |
| Controls other controls rely on (method structure, reviewed pairs) | Yes | Sequence prerequisites first |
| Requirements spanning several areas (cross-objectives) | Yes | Connected weaknesses |
| Whether the scheme moves money, pay, cash or stock out | Not as a field; derivable from the scheme by an MK-approved list | A proxy for direct loss |
| Volumes and values (payment runs, payroll size, cash takings, supplier count) | Partly, as size bands in the profile | Exposure, if MK adds bands per area |
| Loss and incident history | No | Likelihood evidence |

## Options

**A. Sequence without ranking (what the prototype does now).** Answers to resolve first, then the controls other controls rely on, then the open schemes in an order management decides, with the report stating that MK has not approved a ranking. It makes no claim the assessment cannot support. Its cost is that the Essential cannot single out which open scheme matters most; it tells management that this is its decision and why.

**B. Rule-based priority groups approved by MK.** Three groups, each defined by a published rule that uses only recorded information: group 1, answers to resolve, prerequisites, and tier 1 schemes on an MK-approved "direct loss" list (money, pay, cash or stock leaving the organisation) whose confirmations are all reported not in place; group 2, other tier 1 schemes with a gap; group 3, tier 2 and 3 schemes with a gap. The label would be "MK priority group", with the rule printed beside it, never "risk rating". It gives the Essential a defensible "address first" without new questions; it still rests on judgement in the direct-loss list, which MK would own.

**C. Exposure-weighted priority.** Option B, refined by exposure bands the assessment would collect per area (for example annual supplier payments, payroll headcount, cash takings, stock value, each in four or five bands) and by incident history. It approaches a genuine risk ranking, but needs new questions, calibration by MK and evidence that respondents answer the bands reliably; it should not be designed until B has been used.

**D. Management-rated impact.** Ask the respondent to rate the impact of each area. Not recommended: it adds a self-assessed judgement to a self-assessed control position, and the result would look like a rating while resting on neither evidence nor method.

## What each option would do to the fictional organisations

From `report-correction/prioritisation-and-sufficiency.json` (`scripts/research/prioritisation/illustrate.mjs`). The direct-loss list used for B is the prototype's own module-to-pathway grouping (supplier payment diversion, payroll manipulation, cash and stock custody, identity impersonation), which is itself unapproved.

| Organisation | Schemes with a gap | Option A: resolve first / prerequisite controls / management's order | Option B: group 1 / 2 / 3 |
|---|---|---|---|
| Mixed retail group | 58 (22 tier 1) | 0 / 0 / 58 | 5 / 17 / 36 |
| Owner-managed firm | 10 (4 tier 1) | 0 / 0 / 10 | 2 / 2 / 6 |
| Retail group, much unknown | 58 (22 tier 1) | 0 / 0 / 58 | 5 / 17 / 36 |
| Overstated retail group | 4 (none tier 1) | 6 / 5 / 4 | 6 / 0 / 4 |

Option B narrows the mixed retail group's 58 open schemes to five to address first, which is the difference a management reader would notice. For the overstated group both options lead with the six schemes whose answers must be resolved.

## Recommendation

Keep option A in the prototype until MK decides. For the first paid version, adopt option B with MK's own direct-loss list and the group label printed with its rule, because it uses only what the assessment records and makes the "address first" answer specific without claiming a likelihood or impact. Consider option C after B has been used with real respondents. Do not adopt D.

## Decisions for MK

| Ref | Decision | Recommendation |
|---|---|---|
| P-8 | Which option the paid reports use | B for the first paid version; A until then |
| P-9 | The direct-loss list: which schemes count as money, pay, cash or stock leaving the organisation | MK to approve a list by scheme, starting from the prototype's grouping |
| P-10 | Whether the priority group orders the 90-day roadmap and the Comprehensive programme | Yes, after answers to resolve and prerequisites, which always come first |
| P-11 | Wording: "MK priority group" with its rule, never "risk rating", "likelihood" or "impact" | Approve |
| P-12 | Whether to design exposure bands and incident history questions (option C) | Not before B has been used |

Implementing B is a small change to the revised report model and its tests; it changes no score, band or weighting and touches no commercial path.
