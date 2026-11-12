# Before and after: previous live reports, revised prototype and improved reports

MK Premium Report Excellence, 12 November 2026. The comparison covers three sets of reports:

- **Previous live reports.** These are the August V10 Essential and the September V3 Comprehensive, both for fictional QA organisations. Their organisations differ from the four used here, so the comparison is of design, construction and writing, not of findings.
- **Revised prototype.** This is commit `55ea176`.
- **Improved reports.** These are the four fictional organisations, including the overstated-confirmations profile P6b.

Indicators come from `scripts/revised-reports/excellence-comparison.mjs` (`report-excellence/comparison-indicators.json`). They measure construction, not quality; the quality judgement is in `QUALITY-SCORECARD-34.md`.

## Indicators

| Report | Pages | Typeface | Prose words | Pages mainly fields or tables | Appendix pages | Internal codes | Band mentions | Em dashes |
|---|---|---|---|---|---|---|---|---|
| Live Essential (V10) | 25 | Open Sans | 3,704 | 8 (35%) | 2 | 0 | 51 | 38 |
| Live Comprehensive (V3) | 22 | Open Sans | 3,315 | 2 (10%) | 0 | 0 | 4 | 0 |
| Prototype Essential, P3 / P4 / P5 / P6b | 8 each | Inter, Liberation | 774 to 845 | 3 (50%) | 0 | 0 | 0 | 0 |
| Prototype Comprehensive, P3 / P4 / P5 / P6b | 65 / 26 / 64 / 51 | Inter, Liberation | 2,075 to 9,086 | 11 to 22 (33 to 46%) | 11 each | 29 to 188 | 0 | 0 |
| **Improved Essential, P3 / P4 / P5 / P6b** | **20 / 19 / 20 / 21** | **Poppins** | **2,227 to 4,400** | **3 to 5 (16 to 29%)** | **0** | **0** | **0** | **0** |
| **Improved Comprehensive, P3 / P4 / P5 / P6b** | **31 / 28 / 31 / 33** | **Poppins** | **3,299 to 4,308** | **10 to 11 (32 to 42%)** | **0** | **0** | **0** | **0** |

The Comprehensive's higher share of structured pages comes from its blueprint panels, decision tables, stage board and scorecard, which the Bible requires. Its prose is not yet materially longer than the Essential's; the scorecard treats that as the main open quality gap (dimensions 8, 29 and 31).

## The same moment in each report

### The executive opening

**Live Essential (V10).**

> Vhutshilo Foods Manufacturing's assessed fraud-readiness score is 43.33 out of 100 and the maturity band is Developing. The profile shows established capability in whistleblowing and reporting culture (Domain D6 is a relative strength), while several operational and digital controls sit materially lower in the profile.

The score and band lead. There are domain codes in the prose, and the "connected themes" that follow are listed rather than explained.

**Live Comprehensive (V3).**

> Motheo Preview Certification has a strong recorded fraud-readiness position, with an overall score of 80 out of 100 and Strategic maturity. No material weaknesses were identified from the assessment responses.

This is fluent and manuscript-led, but it reports a uniform 80 in every domain without questioning it. That is the overstated-answers situation P6b now tests.

**Revised prototype (P6b Essential, page 2).** A table headed "What the answers show" with "Pattern / Assessment signals / Why it matters" cells. It is accurate, but an executive has to read a questionnaire table to understand the position.

**Improved (P6b Essential, pages 3 to 4).**

> On its own answers, the group reports the core controls in place for 96 of the 106 fraud scenarios that apply to a retail and wholesale business of its size, and a control reported as a gap in only four. Read at face value, that describes an environment in which almost every route to fraud that the method considers has its principal control in place… The detail beneath those answers is less settled than the headline… In fraud terms, the risk is false comfort.

The position, the reason for doubt, the fraud meaning and the first steps are all in prose, with no score asserted. The four-statement panel then separates calculation, inconsistency, interpretation and conclusion.

### A finding

**Live Essential (V10).** "MATERIAL FINDING 2 · Operational Fraud Controls: The organisation retains assurance over supplier identity… — Partly designed … normalised score 40/100 … This is self-reported and requires the listed operating evidence before it can be treated as verified. This is a maturity-limiting control condition."

This finding has the following problems:

- a database-card layout;
- the question restated as a heading;
- an internal score;
- the boundary disclaimer repeated on the finding;
- method language ("maturity-limiting control condition");
- an em dash.

**Revised prototype (P6b Comprehensive, Appendix A).** A register row with a scenario reference, a kind and decision factors. It is traceable but not advisory.

**Improved (P6b Essential, "Stock counts are reported as independent and blind, but stock is not formally recorded").**

> A count reveals a loss only when it is compared with an expected quantity. Where stock is not kept on a formal record, that expected quantity has to come from somewhere else… The independence of the count may be genuine and still leave theft undetected, because there is nothing for the count to disagree with.

The heading is a claim. The paragraphs give the recorded position, then the interpretation, then the fraud implication and the management instruction. A compact strip follows.

### A control recommendation

**Live Essential (V10).** A strong recommended-control paragraph ("Procurement performs a pre-activation checklist… blocks supplier-record activation until a second reviewer signs"), surrounded by fields that repeat it.

**Revised prototype.** The full twelve-field specification for every control, in register tables across Appendices C to F.

**Improved (P3 Comprehensive, the bank-detail change blueprint).** Two paragraphs explain why the control matters, given that the changed record feeds every later payment, and what the target practice is. A compact panel then gives:

- the accountable executive;
- the process owner;
- the population and frequency;
- the proposed service level;
- the independent check;
- the record kept;
- the effectiveness measure;
- the escalation route;
- the failure response;
- connected controls.

Every other control has the same specification in the workbook's Control Blueprints sheet.

### South African context

The previous live reports and the prototype carry almost none. The improved reports draw on the method's own legal guidance where a finding concerns it:

- PRECCA section 34 for P6b's investigations finding;
- section 34A for its donation checks;
- POPIA section 22 for customer-detail changes in P3 and P5, and for P4's compromise procedure.

The scorecard treats this as still too thin (dimension 20).

## What improved, against the brief

| MK's measure | Previous live | Revised prototype | Improved |
|---|---|---|---|
| Executive usefulness | Score-led; useful summary, then cards | Tables needing interpretation | A narrative diagnosis, the four statements, themes and first responses, without reading a questionnaire |
| Fraud-specific insight | Generic in places | Accurate but terse | Mechanisms explained (recognition-based controls and AI, blind counts, supplier master data, split orders) |
| Management decisions | Comprehensive only, with options | No options | Options, trade-offs and MK's recommended route (draft content) |
| Writing | Fluent, repetitive disclaimers, em dashes | Fixed-rule text | Connected advisory prose; boundary once; no em dash |
| Control specificity | Playbook text | Full but unreadable | Readable blueprints in the PDF; full specifications in the workbook |
| Commercial differentiation | Essential and Comprehensive similar in kind | Comprehensive was Essential plus appendices | Comprehensive adds design layers; its interpretive depth still needs work |
| Layout and brand | Open Sans, dense tables, gold | Fallback fonts, appendices | Corporate-profile system in Poppins; Bible page ranges; no appendix |
| Publication quality | Good in places | Prototype | Page-reviewed, no sparse pages, 92 of 92 objective gates; not release-ready (see the scorecard) |
