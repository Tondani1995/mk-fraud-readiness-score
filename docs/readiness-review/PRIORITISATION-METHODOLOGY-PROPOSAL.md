# Prioritisation methodology: proposal for MK's decision

## Revision of 12 November (second direction): a decision method based on explicit factors

MK preserved the commercial requirement for meaningful prioritisation and asked for a proposed decision method based on explicit factors rather than question tier. This revision supersedes option B below, which used tier, and is the proposal MK is now asked to decide (P-13 in `DECISION-REGISTER.md`). Nothing in it is applied to a report: the reports state the facts each factor needs where the assessment holds them, ask management to decide the order, and say that neither the order of the report nor the method's tiers is a ranking.

**The factors.** Each is a fact, a candidate classification for MK to approve, or something management supplies; none is a score.

| Factor | What it asks | Source | Status |
|---|---|---|---|
| F1 Information state | Are the answers for this scenario settled, open to a question, or outstanding? | The assessment (answer relationships, outstanding information) | Available |
| F2 Control position | Is the control that stops the scenario absent, set out but not operating, or partly in place? | The assessment (answer class of the confirmation) | Available |
| F3 Loss pathway | Can the scenario move money, pay, cash, stock or customer value out of the organisation? | A classification of the method's scenarios | Candidate list, needs MK approval |
| F4 Exposure presence | Does the activity exist at a scale that matters here? | Scope answers and management knowledge | Not computed by the assessment |
| F5 Detective cover | Would another control detect a loss after the event? | A preventive or detective attribute on each control | Needs a method attribute (the control-content library is the natural place) |
| F6 Breadth of effect | How many other open scenarios does the same control serve? | The assessment (control-to-scenario links) | Available; shown in the finding register |
| F7 Management knowledge | Incidents, losses, volumes and values known to management | Management | Supplied by management |

**The method.** Ordering is lexicographic and produces groups, never ranks or scores. First, scenarios with answers to settle or questions to clarify come first, because nothing should be built on an answer that may be wrong (F1); this is a logical precondition, not a judgement of seriousness. Second, scenarios with a control reported as a gap fall into three attention groups: group A where the control is absent or not yet operating and the scenario has a direct-loss pathway (F2 and F3); group B where only one of those holds; group C where the control is partly in place and the pathway is indirect. Third, within each group management adjusts with F4, F5 and F7, and schedules together the scenarios that one control serves (F6). Tier plays no part.

**What it would do.** Illustrated on the four fictional organisations (`report-revision/prioritisation-illustration.json`, `scripts/research/prioritisation/illustrate.mjs`); not used by any report:

| Organisation | Establish the facts first | Group A | Group B | Group C |
|---|---|---|---|---|
| P3 mixed retail group | 0 | 21 (tiers 1, 2 and 3: 6, 9, 6) | 25 | 12 |
| P4 owner-managed firm | 0 | 3 | 4 | 3 |
| P5 much unknown | 0 (two scenarios are outstanding, not open) | 20 | 26 | 12 |
| P6b overstated confirmations | 6 | 0 | 3 | 1 |

Every group cuts across the tiers, which shows that the method orders by what the answers say about the control and the loss, not by how early the method asks. The groups are only as good as F3, which is the decision MK most needs to make: the candidate direct-loss list is the prototype's own grouping of the method's modules (M-9) and has not been reviewed.

**Decisions for MK.** Approve the factors and the lexicographic method (P-13); approve or replace the direct-loss classification (P-14); decide whether to add a preventive or detective attribute to each control (P-15); and decide whether a paid report shows the attention groups once approved or continues to ask management to decide with the facts provided.

---

*The rest of this document is the proposal of 12 November (first direction), kept for the record. Option B is superseded by the revision above because it ordered by tier.*


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
