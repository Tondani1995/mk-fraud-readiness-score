# Visual and branding acceptance report

MK Premium Report Excellence, 12 November 2026. Reviewed on the rendered PDFs of all eight fictional reports, page by page: 203 pages in total. Each report was reviewed after every layout change, and again in its final state.

## The brand system applied

The reports use a publication system taken from MK's approved corporate profile (`MK-Fraud-Insights-Corporate-Profile-Digital-Updated.pdf`, September 2026, the version in MK's tender submissions), implemented in `src/lib/reports/design/mk-publication.ts` (version `mk-publication-1.0`).

| Element | Corporate profile | Reports |
|---|---|---|
| Typeface | Poppins | Poppins Regular, Medium and SemiBold, embedded from `public/fonts` as data URIs, so the PDF never depends on the fonts of the rendering machine. `pdffonts` on all eight PDFs lists Poppins only (gate G05) |
| Logo | Approved vector mark | The same mark from `brand-assets.ts`; reversed on the navy cover and back cover |
| Navy | `#001030` (measured: the most frequent dark colour in the profile) | Cover and back cover mass, headings, table rules |
| Text | Slate `#334155` | Body text; ink `#1E293B` for emphasis |
| Rules and panels | `#E2E8F0`, `#EDF1F5` | Hairline rules, panel and strip backgrounds |
| Accent | Sage `#A9D4CE`, used sparingly | Sage rules above panels, unit labels in deep sage, stage markers; never a fill behind text |
| Running header | "MK FRAUD INSIGHTS" left, small page number | "MK FRAUD INSIGHTS" left, product right, hairline rule; footer with confidentiality and page number |
| Rhythm | Generous margins, one idea per spread | Answer-first heading, two to four paragraphs, at most one primary exhibit per page (Bible 19.2) |

The gold accent of the earlier report templates is not used: it is absent from the corporate profile, and MK removed gold from its proposal design system in September. The owner direction of 25 October retired the sage values from the website; the corporate profile still uses sage as a restrained accent, and MK's brief asks for the navy and sage identity, so sage is used here as the profile uses it. Decision D-9 asks MK to confirm this.

## Drift found and resolved

| Drift | Where | Resolution |
|---|---|---|
| Inter and Liberation Sans | The revised prototype: the templates name Open Sans or Avenir Next, which the render machine does not have | Poppins embedded; no system font is ever used |
| Open Sans, Avenir Next, Georgia and Arial | Production templates and older renders | Recorded as C-7. The production templates are unchanged, as instructed; adopting the publication system in production is decision D-9 |
| Dense navy tables, gold accent, band colours | Previous live reports | Hairline tables, no band colours, no gold |
| Appendices and register pages | Revised prototype (Appendices A to J, up to 65 pages) | Removed; the registers are in the workbook (Bible 15) |
| Internal identifiers on the page | Revised prototype Comprehensive: up to 188 codes | None (gate G06) |
| Em dashes | Previous live Essential: 38 | None (gate G06) |

## Page-level review: defects found and fixed in this pass

| Defect | Reports | Fix |
|---|---|---|
| A blueprint heading and introduction at the foot of a page, with its specification panel pushed to the next page and a half page left blank | Comprehensive, all | Each blueprint after the first starts its own page, so the heading, prose and panel read as one unit |
| One line of the operating model carried onto an otherwise empty page | P3, P5 and P6b Comprehensive | The operating-model exhibit compacted (wider role column, tighter rows) |
| A section ending with a few lines on a near-empty page before the next section | P5 Essential and P3 and P5 Comprehensive | A page-rhythm pass after the first layout lets such a section follow on instead of starting a new page; the contents page numbers are taken after that pass |
| Panel and stage text at 7.4 to 7.7 pt | All | Raised to 7.9 to 8 pt; tracked uppercase labels kept at profile size |
| Research-stage wording in the position panel and captions | All | Rewritten as a released report would read; method status moved into a separate, visibly distinct prototype notice |
| Two different "in place" counts (96 and 102) on the summary page | P6b and others | The panel now uses the executive summary's counts |
| "Next cycle (whenever a change is requested)" in escalation wording | Blueprint panels and workbook | Escalation and service-level wording now depends on whether a control is a gate, periodic or event-driven |

After these fixes no sparse or overflow page remains in any report, and every report falls within the Bible's default range. Pages and fonts are recorded in each manifest and in `report-excellence/build-summary.json`.

| Organisation | Essential pages | Comprehensive pages |
|---|---|---|
| P3 mixed retail group | 20 | 31 |
| P4 owner-managed firm | 19 | 28 |
| P5 retail group, much unknown | 20 | 31 |
| P6b overstated confirmations | 21 | 33 |

## Page types reviewed

- **Cover:** navy mass, reversed logo, product kicker, title, organisation, reference, date and confidentiality line. The prototype box is visible and must be removed before release.
- **Contents (Essential):** claims rather than labels, with the findings listed beneath their movement.
- **Executive summary or diagnosis:** narrative paragraphs, then the four-statement panel with the fixture tag.
- **Readiness profile:** stacked bars in navy, blue-grey and sage tones, a legend, and test figures in muted grey.
- **Themes, findings and pathways:** each unit has a sage unit label, a claim heading, prose, and a strip or panel.
- **Priorities and stage boards:** the Essential's 30/60/90 board and the Comprehensive's Stabilise, Establish, Embed, Mature board, with outcomes and owners.
- **Comprehensive design pages:** blueprint panels, the operating-model tiers, decision tables with MK's recommended route, and the scorecard.
- **Basis:** the boundary, stated once, and the prototype notice.
- **Conclusion and back cover.**

## Remaining visual items, not release-ready

1. **Decision tables.** The Comprehensive decision tables carry five columns and are the densest pages. A board reader would be better served by options and trade-offs on the page, with effort and benefit in the workbook (scorecard dimensions 2 and 21).
2. **Theme map.** It uses dots by area and carries little the prose does not; an interaction diagram would earn its place (dimension 24).
3. **Mid-page section headings.** Where the rhythm pass lets a section follow on, a major heading can sit mid-page. This is acceptable in MK's profile style, but MK may prefer a minimum reserve.
4. **Prototype markers.** The cover prototype box, the fictional footer and the prototype notice are deliberate and must stay until release.
5. **Production templates.** These are unchanged: the improved composer runs alongside them. Adopting it is a production decision (D-9).
