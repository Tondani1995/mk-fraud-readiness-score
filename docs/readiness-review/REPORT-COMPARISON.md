# Essential and Comprehensive: before and after the staged assessment

> **Superseded in part on 12 November 2026.** This records the first prototype as MK reviewed it. Its report content was corrected on MK's direction of 12 November (`REPORT-QUALITY-CORRECTION.md`): the false-comfort rule, the tier-derived ratings and periods and the answer wording below are withdrawn, and R-1 to R-3 are now prototype conventions. The first prototype's reports stay here for comparison; they were built at commit 5fb4dc2.

Fictional integration prototype for MK's direction of 11 November 2026 (18:33), items 5 and 6. Four fictional organisations are reported twice through MK's existing report engines: once from the MFRS V1.2 assessment they would complete today ("before") and once from the staged review assessment ("after"). The acceptance question is whether the final reports are better, so the comparison measures the reports, not the input.

Nothing here is a customer report. No order, payment, entitlement, product, price or fulfilment path is touched, no database or provider is called and no AI manuscript stage runs on either side. Every number on the "after" side is a labelled test fixture.

## 1. How the comparison was built

**The same organisation on both sides.** Each fictional organisation is defined once (`scripts/revised-reports/organisations.mjs`). Its staged answers come from the build 1.6 journey profiles already used for testing; its 68 MFRS V1.2 answers are drawn from the same answer policy through a construct mapping from each MFRS question to the bank area whose controls it asks about, chosen by reading each MFRS prompt. The small firm's MFRS gateways state the same facts as its staged profile (no suppliers, payroll, sales on account, cash or stock). For the overstated organisation, the respondent reports every MFRS headline control as mature, which is exactly the overstatement its staged answers contain; MFRS has no supporting-practice layer that could reveal it.

| Organisation | Journey | What it tests |
|---|---|---|
| Fictional Retail Group (mixed controls) | P3 | Strong governance, risk, finance and detection; weak procurement, payroll, cash and stock, and digital |
| Fictional Owner-Managed Firm | P4 | Small firm, few areas in scope |
| Fictional Retail Group (extensive unanswered information) | P5 | P3 with a third of answers unknown and two areas handed to their functions |
| Fictional Retail Group (overstated confirmations) | P6b | Every headline control reported in place; the practices behind them weak |

**Before.** `buildMfrsBaselineFixture` scores the MFRS answers with the existing adaptive calculator, unchanged, and the result runs through the unchanged evidence model, Essential projection, Fact Pack, story plan, blueprint, thesis, presentation model, validator and renderer, and the unchanged Comprehensive assembly, management model and renderer.

**After.** The staged session's report input 1.3.0 feeds a revised evidence model (`src/lib/reports/revised/evidence-model.ts`) that produces the existing `AdvisoryEvidenceModel`, so every downstream engine reads the same structure it reads today. Three engine capabilities were reworked in new files, because the existing ones discard what the richer assessment adds:

| Reworked capability | Why | Reused unchanged |
|---|---|---|
| Evidence model: the unit of analysis is the fraud scheme, with its confirmations, supporting practices, answers, answering function, the method's level descriptions, records and dependencies | MFRS findings are one headline question each; the existing builder has nothing to say about a scheme whose control is reported in place but unsupported | `AdvisoryEvidenceModel` types, the Essential selection order (`essentialSelectionScore`), semantic families |
| Essential presentation content (`essential-presentation.ts`) | The existing builder writes most customer text from canned content per family ("Weak challenge at identity, transaction and sensitive-change points"). Fed the revised evidence, it kept the generic text and lost the specifics (`after-essential-existing-builder.html` shows this) | Presentation model type, page structure, validator, renderer |
| Comprehensive scenario facts and three missing control programmes (`comprehensive-input.ts`, `comprehensive.ts`) | The existing facts are family pathways; payroll, cash and stock had no programme and rendered as raw codes | Assembly, management model, registers, renderer |

**Numbers.** The review method produces no approved score. The existing exhibits print an overall figure, a band and a figure per area, so the after side uses a test fixture: the research scoring-frame simulation (Option A, midpoint, equal areas, no caps, no false-comfort adjustment). It is labelled on every page by a banner, in the report basis and in the build output. No production scoring rule is used.

## 2. Results

Measures are defined in section 3; the full figures are in `report-comparison/comparison.json`, verbatim excerpts in `report-comparison/report-excerpts.md`, and the reports themselves (HTML and PDF) in `report-comparison/<organisation>/`.

| Measure (before / after) | Mixed retail (P3) | Small firm (P4) | Much unanswered (P5) | Overstated (P6b) |
|---|---|---|---|---|
| Essential passes the existing validator | pass / pass | fail / pass | fail / pass | fail / pass |
| Essential signals naming a specific control, of all signals | 0 of 14 / 18 of 18 | 0 of 15 / 12 of 12 | 0 of 12 / 18 of 18 | 0 of 11 / 21 of 21 |
| Essential schemes or pathways described | 4 / 4 | 2 / 4 | 2 / 4 | 0 / 4 |
| Essential false-comfort statements | 0 / 1 | 0 / 1 | 0 / 1 | 0 / 7 |
| Essential cross-checks stated with their population | no / yes | no / yes | no / yes | no / yes |
| Essential distinct accountable roles | 2 / 10 | 2 / 8 | 3 / 10 | 3 / 7 |
| Essential roadmap actions that only restate their deliverable | 1 of 6 / 0 of 7 | 2 of 4 / 0 of 7 | 3 of 5 / 0 of 7 | 0 of 3 / 0 of 7 |
| Essential outstanding information stated | no / no | no / no | no / yes | no / no |
| Essential analytical sentences identical for an organisation with different answers | 40% / 27% | 64% / 26% | 52% / 21% | 2% / 5% |
| Comprehensive scheme portfolio entries | 3 / 12 | 2 / 11 | 3 / 12 | 0 / 12 |
| Comprehensive findings naming the function that answered | 0 / 15 | 0 / 3 | 0 / 37 | 0 / 15 |
| Comprehensive records management should maintain | 20 / 35 | 9 / 8 | 15 / 35 | 3 / 10 |
| Comprehensive decisions | 6 / 5 | 6 / 4 | 6 / 6 | 2 / 5 |
| Comprehensive analytical sentences identical for an organisation with different answers | 41% / 28% | 86% / 73% | 44% / 28% | 22% / 26% |
| Comprehensive length in words (pages) | 18 553 (47) / 40 799 (72) | 9 125 (27) / 10 282 (27) | 14 915 (40) / 40 614 (72) | 5 131 (22) / 21 935 (45) |
| Headline figure | 70.84 Developing / 55.5 fixture | 77.51 Developing / 78.5 fixture | 70.71 Developing / 55.1 fixture | 88.2 Strategic / 87.8 fixture |

### Findings and depth of interpretation

The before reports describe each organisation through domain scores. Every assessment signal in the four before Essential reports names a domain and its score ("Digital and Identity Fraud Risk 21.08"); none names a control. Every signal in the after reports names the control and what was reported for it ("Three-way match: Not in place; Quantities checked: Not in place; Services confirmed: Not in place"). The first exposure for the mixed retail group changes from "Weak challenge at identity, transaction and sensitive-change points" to the scheme itself, "Invoices are paid for goods or services not received or not agreed", with the method's description of what the organisation does today ("Invoices are paid without being checked against what was approved or received") and of the standard that stops it.

The sharpest difference is the overstated organisation. MFRS scores it 88.2, Strategic, and the before Essential reads "a broadly strong fraud readiness position"; it has no exposure page and fails the existing validator for being too short. The after report opens with "Every first-priority fraud scheme is reported as covered, but 21 controls relied on are not supported in practice", leads its exposures with those schemes, and states the cross-checks with their population: 10 of 67 eligible controls cross-checked, 6 conflicting, 1 partial and 3 narrower, 57 not cross-checked and nothing concluded about them. The fixture figure (87.8) is as misleading as the MFRS one, because MK has ruled out penalties and caps from consistency findings; the report text is now what carries the warning (section 6, decision R-1).

### Recommendations, ownership and roadmap

Before, management outcomes were family-level ("Independent supplier verification before activation", owner "Finance / operations accountable owner") and two of four roadmap actions for the small firm were their own deliverable restated. After, each outcome names the controls to put in place, its scheme, the executive and process owner the method names for that area (for example "Head of procurement or CFO, with the creditors manager or financial controller"), the standard in the method's own words and the records it leaves. Accountable roles per Essential rise from 2 or 3 to 7 to 10. No roadmap action restates its deliverable, and the 30-day window starts with naming owners and, where answers are outstanding, obtaining them.

### Blueprint specificity and connected weaknesses (Comprehensive)

Each control design now starts from what the organisation reported, in the method's words, and lists the controls that stop the scheme with their in-place standard; dependencies record when one gap prevents other controls from operating ("Three-way match is not in place, so match enforced by system and price and quantity tolerance cannot operate"), and the sequencing decision puts those first. The scheme portfolio grows from 0 to 3 family pathways to 11 or 12 named schemes, each with how it starts, why it works here, what the answers show and what interrupts it. Records management should maintain come from the method ("Payment files showing the order, receipt and invoice, exception reports") and grow from 20 to 35 for the retail group.

Average words per control design do not rise, and fall for the overstated organisation (131 to 72): its three MFRS designs were long playbook texts. The after designs are shorter but tied to the organisation's own gaps; length is not the measure of a blueprint.

### Management decisions and traceability

Decisions are fewer or level, and more specific: "Name one accountable executive for each area with first-priority schemes open or unsupported: procurement and third parties (6), people and payroll (5), digital and identity (5)..." against "Approve accountable executive mandates and escalation authority for priority remediation". The overstated organisation gets a reliance decision on its 21 unsupported controls. Every after finding is traceable to the scheme, the answered questions and the person who answered: 15 of 59 retail findings and 37 of 59 for the organisation that handed areas to functions name the function, which no before finding can.

### Outstanding information

The organisation with a third of its answers unknown scores 70.71 on MFRS, within 0.13 of the fully answered P3, and its before report says nothing about what is unknown. The after report counts the 7 answers still outstanding after the function packages (each a function's "I don't know"), makes obtaining them a 30-day priority with an owner and states that until they are answered the schemes they affect are unknown, not covered.

## 3. Measures

| Measure | Definition |
|---|---|
| Signals naming a specific control | Entries in the diagnosis and exposure exhibits whose title is a control rather than a domain name |
| Schemes or pathways described | Distinct exposure and scenario titles in the Essential |
| False-comfort statements | Diagnosis rows and exposure rows stating a control reported in place but not supported |
| Cross-checks stated with their population | The report states how many were cross-checked and how many were not |
| Distinct accountable roles | Distinct roles in Essential priorities and roadmap |
| Analytical sentences identical for an organisation with different answers | Sentences of at least six words that appear, apart from the organisation's name and numbers, in the same report for an organisation with different answers; fixed captions present in every report are excluded, and P3 and P5 are not compared with each other because P5 is P3 with a third of its answers unknown |
| Findings naming the function that answered | Comprehensive findings whose diagnosis names an accountable function |

## 4. What is not better, or not yet

- **Comprehensive length.** The retail Comprehensive grows from 47 to 72 pages because every open scheme reaches the registers (59 findings). The management sections stay bounded; the registers need an editorial rule for what goes to an appendix, which is MK's product decision (section 6, R-3).
- **Process owners.** The retail governance model lists 42 roles because the bank names an owner per module ("Creditors manager", "Payroll manager"). They are more practical than "Finance / operations accountable owner", but a governance model needs them consolidated to the organisation's actual roles.
- **Small firm.** For P4 the records and decisions are level or slightly fewer and the Comprehensive is the same length; its gain is in specificity, not volume.
- **Length of the Essential.** About 1 850 to 2 130 customer words against 900 to 1 150, within the validator's envelope; the extra words are the specific content, and the after pages still fit eight pages.
- **Wording from the method.** Practice questions have no level descriptions, so a practice gap is stated as its short name and answer, and its standard as the method's own test question. One method phrase ("AI-generated") is rejected by the existing validator as engineering language and is kept out of the Essential customer surfaces until MK decides how the validator should treat it.
- **Comprehensive cells inherited from MFRS.** The register still shows "Hard gate: Not recorded", and the governance table attaches one escalation threshold to the board row.
- **Not tested here.** The AI manuscript stage, which writes the paid reports' commentary, has not been run on either side, so neither side is a finished paid report; and the answers are deterministic fictional answers, not people.

## 5. What did not change

No existing report-engine, scoring, score API, product, order, payment, entitlement, storage or delivery file changed: the integrity guard over every protected library, API, font and package file passes. The revised modules are new files under `src/lib/reports/revised/`, used only by the scripts in `scripts/revised-reports/`. The revised scoring family stays registered and refuses to score.

## 6. Decisions that block taking this further

| # | Decision for MK | Why it blocks |
|---|---|---|
| R-1 | How a paid report presents a headline figure when the same report finds controls reported in place but unsupported (the overstated organisation reads 87.8 on the fixture and 88.2 on MFRS) | MK has ruled out penalties and caps from consistency findings; without a presentation rule the figure and the findings point in opposite directions in a paid report |
| R-2 | Whether a paid report can be issued with information outstanding, and how much (the "report eligibility" statement now shown as not determined) | Fulfilment cannot gate or label a report on outstanding information until the rule exists |
| R-3 | The editorial bound on the Comprehensive registers (all open schemes, or first and second priority with the rest in an appendix) | Decides the Comprehensive page count and what the management sections summarise |

The presentation conventions the prototype uses to order and label (scheme tier to the existing selection reasons, risk priority, likelihood and impact labels, the 30, 60 and 90-day windows) are listed in `src/lib/reports/revised/evidence-model.ts` and are presentation choices, not a risk rating; they need MK's sign-off before customer use but do not block further development.

## 7. Reproducing

```
node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/revised-reports/build-comparison.mjs
PUPPETEER_EXECUTABLE_PATH=<chromium> node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/revised-reports/render-pdfs.mjs
node scripts/revised-reports/compare.mjs && node scripts/revised-reports/excerpts.mjs
```
