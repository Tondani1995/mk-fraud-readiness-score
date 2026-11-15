# Reporting Bible v1.1 compliance and gap assessment

MK Premium Report Excellence, 12 November 2026, continuing from `55ea176` on `review/mk-integrated-readiness`. The controlling authority is `docs/product/MK_Fraud_Readiness_Reporting_Bible_v1.1.md`. Every organisation assessed here is fictional and every calculated figure is a labelled test fixture. Nothing in production, the shared preview, the products, prices, historical MFRS reports, orders, payments, entitlements or fulfilment was changed, and nothing was pushed, merged or deployed.

## 1. The baseline that was re-established

The latest fictional prototype was not used as the baseline. The baseline is made up of four sources, all of which were inspected page by page or line by line.

| Source | What it is | Standard it sets |
|---|---|---|
| Reporting Bible v1.1 | The controlling product document: five-layer architecture, manuscript-first gate, Essential and Comprehensive blueprints, page ranges, appendix policy, workbook sheets, 34 owner-review dimensions | Everything below is measured against it |
| Previous live Essential | `RPT-MKFRS-V12-ESS-VHUTSHILO-V1`, the certified V10 whole-manuscript Essential recovered from production in August 2026 for a fictional QA organisation (25 pages, Open Sans) | The roughly 7 out of 10 standard MK wants to raise |
| Previous live Comprehensive | `RPT-MKFRS-2026-63D3103D95-V3`, the V3 Comprehensive generated on the preview in September for a fictional QA organisation (22 pages, Open Sans; its own certification record says final bounded defects remained) | The manuscript-first Comprehensive design: chapters, management implications, leadership choices, twelve-month path |
| MK corporate profile | `MK-Fraud-Insights-Corporate-Profile-Digital-Updated.pdf` (September 2026, the version used in tender submissions) and the logo and Poppins fonts in the repository | The brand: Poppins, navy `#001030`, slate `#334155`, hairline rules `#E2E8F0`, panel `#EDF1F5`, sage accent `#A9D4CE` used sparingly, running header, generous white space |

The 3 November report-engine review in MK's outputs folder was also read, because it records an earlier inspection of the same specimens and several of its recommendations (typed assertions, conditional scenarios, no unsupported ratings) are reflected in the work below.

## 2. What was lost, retained and improved

| Quality | Previous live reports | Revised prototype (`55ea176`) | Improved reports |
|---|---|---|---|
| Manuscript-first construction (Bible 3, 5) | Retained in both: Fact Pack, Story Plan, AI manuscript, validation, composition | **Lost.** Fixed-rule text assembled straight into HTML; no manuscript, no plain-text export | **Restored.** Fact Pack, Story Plan and writer brief per report; a manuscript with paragraph provenance; validation; plain-text export; composition; manifest |
| Essential reader journey and length (Bible 9, 10) | 25 pages: narrative executive summary, then mostly database cards, proof tables and a two-page appendix | **Lost.** 8 pages: a presentation summary, not a decision-grade diagnosis | **Restored.** Six movements in 19 to 21 pages; no appendix |
| Comprehensive structure and length (Bible 12, 13, 15) | 22 pages, manuscript-led, no appendix | **Lost.** 26 to 65 pages with Appendices A to J holding full registers | **Restored.** Bible sequence in 28 to 33 pages; no appendix; registers in the workbook |
| Workbook sheets (Bible 20) | Essential workbook had seven sheets (no Control Improvements); Comprehensive followed the blueprint sheets | Ten sheets under new names | **Restored.** Exactly the Bible's eight sheets for each product, frozen headers, filters, formula-safe |
| Brand identity | Open Sans and Avenir Next in the templates, Georgia and Arial in older renders; gold accent; dense navy tables | Inter and Liberation Sans (fallback fonts of the render machine) | **Restored.** Poppins embedded in every PDF; the corporate-profile palette, measured from the profile itself; profile-style running header, cover and back cover |
| Executive voice | Fluent but generic in places, maturity language throughout (51 band mentions in the Essential), "normalised score 40/100" and the self-reported disclaimer on every finding, 38 em dashes | Clipped rule text, no narrative | Connected advisory prose in MK's voice; boundary stated once; no em dash, internal identifier or band |
| Analytical honesty | Scores, bands and qualitative likelihood and impact presented as findings; "contradiction" used loosely | **Improved:** reviewed answer relationships, four-position separation, no derived ratings, control-content library | **Retained in full:** the same model, relationships, sufficiency candidate, library and four statements now feed the manuscript |
| Specific control guidance | Playbook text keyed to 68 MFRS questions | Library of 146 entries, shown as dense register tables | Library content in readable blueprint panels for the controls discussed; full 12-field specification for every control in the workbook |
| Fraud scenarios | Present in both live reports, uneven realism | Selected scenarios listed with mechanism text | Ten-part pathway structures written as connected prose, with warning signs, first response and lasting control |
| Leadership decisions | Live Comprehensive: options and a recommended route | Three decisions without options | Three or four genuine decisions with options, effort, benefit, trade-off and MK's recommended route (draft content) |

## 3. Conflicts between the Bible and decisions taken since

These are conflicts, not defects. Each is listed with the treatment used in the fictional reports and the decision MK must take. None has been resolved silently.

| # | Bible requirement | Later MK decision or constraint | Treatment in the improved reports | Decision needed |
|---|---|---|---|---|
| C-1 | Executive summary states the score and maturity (10.1, 13.1); readiness profile is a ten-domain score exhibit (10) | Revised method inactive; no band until a readiness method is approved (28 October, 12 November item 3) | The four statements MK set appear with the executive summary; the calculated result carries a visible "test fixture" tag; the readiness conclusion slot reads "None issued"; the profile shows scenarios by area with test figures | D-1: the readiness method and how the conclusion is stated |
| C-2 | "The findings that matter most", "what management should fix first", materiality in the finding strip (9, 11.2, 11.4) | No materiality or prioritisation language without an approved method (12 November item 4) | Findings selected by a stated rule and presented in the method's order; first responses ordered by explicit factors (settle the facts first, then controls reported as gaps); the strip shows position, core control, owner and first response | D-3: the decision method (P-13 to P-15) |
| C-3 | Approved options for leadership decisions; approved control designs (3.1, 13.6) | Control-content library 0.1, scenario structures 0.1 and decision options 0.1 are drafts | Used and labelled as draft in the prototype notice and workbook | D-5 and new D-8 |
| C-4 | AI manuscript is mandatory; no template fallback (3.3, 5.2) | No gateway credential in this environment; the credential check on MK's computer was refused by the session's permission control | Manuscripts written in-session under the same writer contract and validated by the same checks; the production AI run is acceptance test AT-AI-01, recorded as blocked, with a ready harness | D-7: run AT-AI-01 and approve or reject the in-session manuscripts as the owner-approved fallback |
| C-5 | Comprehensive "approved structure (management sections, appendices, workbook)" (12 November item 7) | Bible 15: no appendix by default; hard maximum 38 pages | The Bible governs, as directed on 12 November (19:33): no appendix; the registers moved to the workbook | None: recorded for the decision register |
| C-6 | Twelve-month blueprint phases Stabilise, Establish, Embed, Mature at fixed windows (13.7) | Proposed stages, not deadlines (12 November item 6) | The four Bible phases are used, labelled "proposed", with the statement that windows are not deadlines, contractual dates or estimates | D-6 (already open) |
| C-7 | The Bible names no typeface; templates use Open Sans or Avenir Next | The brand face is Poppins (owner direction 25 October; corporate profile) | Poppins embedded; the old template fonts are recorded as drift | D-9: adopt the publication system for the production templates |
| C-8 | Essential workbook: eight locked sheets including Control Improvements (20.1) | Production Essential register writes seven sheets | Improved reports use the eight Bible sheets | Production change, for later approval |
| C-9 | Bible 3.1 calls deterministic analysis "truth" | 3 November review: determinism does not make a self-report true | The manuscript calls self-reported positions "reported" throughout; the boundary is stated once per report | Bible wording, for MK |

## 4. Section-by-section compliance

Status: **Met** in the improved reports; **Partly** met with the gap stated; **Blocked** by an MK decision or an external dependency.

| Bible section | Requirement | Status | Evidence or gap |
|---|---|---|---|
| 3.1 Deterministic engine | One analytical truth feeds every output | Met | Revised report model (`evidence-model.ts`) feeds Fact Pack, PDF and workbook; gate G10 reconciles them |
| 3.2 Fact Pack | Bounded source; every number a fact | Met | `fact-pack.ts`; figures enter the manuscript only as `[[REF]]` slots; gate TYPED-FIGURE blocks typed numbers |
| 3.3 AI manuscript | AI writes from the Fact Pack | **Blocked** | AT-AI-01 harness ready; no credential here (C-4) |
| 3.4 Validator | Factual and editorial validation | Met | `manuscript.ts`: unknown references, typed figures and counts, prohibited claims, internal language, mechanical cadence, label headings, missing movements and exhibits |
| 3.5 Composer | Design follows manuscript | Met | `compose.ts`: every PDF paragraph comes from the manuscript (gate G03); exhibits placed by name |
| 4 Intermediate artefacts | Fact Pack, Story Plan, manuscript, plain text, validation, manifest | Met | Saved per report in `report-excellence/<org>/` |
| 5 Manuscript test | Coherent with tables removed | Met for content; owner judgement pending | `*-manuscript.txt` answers the eight questions in prose; reviewed in the scorecard |
| 5.2 No template fallback | Retry, approved fallback or stop | Met in mechanism; approval pending | A failed manuscript is never composed; no template fallback exists; the in-session manuscript is not an approved fallback until MK says so |
| 6 Voice | Calm, precise, advisory; prohibited language | Met | Gate G06 (no IDs, bands, em dashes, banned system language); scorecard dimensions 17 to 19 |
| 7 Headings and transitions | Claim headings; transitions | Met | Validator blocks label headings; each movement opens with a transition |
| 8 Story Plan | Deterministic plan per report | Met | `story-plan.ts`; selection rules recorded in the Fact Pack |
| 9 to 11 Essential | Six movements, 18 to 22 pages, themes, findings, pathways, priorities, 30/60/90, conclusion | Met, except C-1 and C-2 | 19 to 21 pages; three or four themes; seven findings; three pathways; six first responses; proposed 30/60/90; narrative conclusion |
| 10.1 Executive summary | Score and maturity | **Blocked** | C-1 |
| 12 to 13 Comprehensive | Executive diagnosis, scope, profile, themes, findings, pathways, five blueprints, operating model, decisions, twelve months, scorecard, conclusion; 28 to 34 pages | Met, except C-1 to C-3; depth partly | 28 to 33 pages; all movements present. Gap: material findings are not yet materially deeper than the Essential's (scorecard dimensions 8, 29 and 31) |
| 13.4 Blueprint fields | Twelve fields per control | Met | PDF panel for the five discussed; workbook Control Blueprints for every control. Service levels labelled as proposals |
| 13.6 Decisions | Options, trade-offs, recommended route | Partly | Options are draft content (C-3) |
| 14 Tier differentiation | Distinguishable without covers | Partly | Gate G12 passes (distinct movements, no copied paragraphs); depth gap as above |
| 15 Appendix policy | No appendix by default | Met | Gate G04 |
| 16 Method stages 1 to 12 | Twelve stages including AI and owner review | Partly | Stages 5, 6 and 8 (AI) blocked; stage 12 (owner release review) is MK's |
| 19 Design | Senior, restrained; answer-first pages; restrained footers | Met | Visual and brand acceptance report |
| 20 Workbook | Locked sheets, usability | Met | Gates G08 and G09 |
| 21 Integrity gates | Objective gates | Met | 92 of 92 gates (`excellence-tests.json`) |
| 21.1 Manuscript gates | Plain text, provenance, no narrative outside the manuscript | Met | Gates G02 and G03; composer captions and the prototype notice are labels, not narrative |
| 22 Owner release standard | 9.5 on every material dimension | **Not met** | Scorecard: no dimension is released at 9.5 while C-1 to C-4 stand; see `QUALITY-SCORECARD-34.md` |

## 5. Gaps that remain, in the order they block release

1. **The production AI manuscript run (AT-AI-01) has not been exercised.** The reports were composed from manuscripts written in-session under the writer contract. Until AT-AI-01 runs and its manuscripts pass the same validation and owner review, no report can be certified as a paid-report generation.
2. **No approved readiness conclusion (C-1).** The Bible promises a score and maturity. The reports carry the four statements and a labelled fixture, which is honest but is not the promised diagnosis.
3. **No approved decision method (C-2).** The reports order the work by explicit factors and say so; MK has to approve those factors before the order can be presented as MK's recommendation.
4. **Draft advisory content (C-3).** The control library, pathway structures and decision options are MK drafts.
5. **Comprehensive depth.** The Comprehensive adds the design layers the Bible requires, but its material findings and themes are not yet materially deeper than the Essential's. The scorecard sets out the correction.
6. **South African context is thin.** The method's own legal guidance (PRECCA sections 34 and 34A, POPIA section 22) is now drawn into the reports where a finding concerns it, but most findings have no South African operating context beyond that.
7. **Production templates still use Open Sans and Avenir Next**, and the production Essential register still writes seven sheets. Both are production changes for MK to approve (C-7, C-8).
