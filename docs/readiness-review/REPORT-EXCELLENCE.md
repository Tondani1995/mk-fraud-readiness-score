# MK Premium Report Excellence: summary

**Direction:** MK, 12 November 2026, 19:33.
**Baseline:** continued from `55ea176` on `review/mk-integrated-readiness`.
**Controlling authority:** Reporting Bible v1.1.

**Scope and constraints:**

- Every organisation is fictional, and every calculated figure is a labelled test fixture.
- Nothing in production, the shared preview, the products, prices, customer journeys, historical MFRS reports, orders, payments, entitlements or fulfilment was changed.
- Nothing was pushed, merged or deployed.
- Release blockers B2, B3, B4, B5, B6, B7, B11 and J-01 remain open.

## Answer to the acceptance question

MK would not yet send these reports to a CEO, CFO, Audit Committee or Board with a R7,500 or R35,000 invoice.

They are much closer to that standard than either the previous live reports or the revised prototype. Each one is a manuscript-first MK publication with:

- connected advisory prose;
- organisation-specific diagnosis;
- realistic fraud pathways;
- specific, owned control designs;
- the Bible's structure and page ranges;
- MK's own typeface and palette.

But every report still needs explaining. It carries:

- a calculated result tagged as a test fixture;
- a readiness conclusion not issued;
- an order of work based on candidate factors;
- draft advisory content;
- a manuscript written in-session rather than by the production AI stage, which could not be run here.

The formal review (`QUALITY-SCORECARD-34.md`) scores two dimensions at 9.5 and none at 10. Most of what holds the others below 9.5 is an MK decision or the blocked AI run; the remainder is work listed below.

## The ten items of the direction

| # | Direction | Done | Where |
|---|---|---|---|
| 1 | Re-establish the actual baseline | The Bible, the previous live Essential (V10, August) and Comprehensive (V3, September), the corporate profile and brand assets, and MK's 3 November engine review were inspected. Qualities lost, retained and improved are tabled | `BIBLE-COMPLIANCE-AND-GAP.md` sections 1 and 2 |
| 2 | Restore manuscript-first construction | Fact Pack, Story Plan and writer brief for every report; manuscripts with paragraph provenance and figure slots; validation; plain text; composition; manifest. The production AI run is acceptance test AT-AI-01, **blocked**: no gateway credential here, and the credential check on MK's computer was refused by this session's permission control. The harness is ready | `report-excellence/<org>/`; `excellence-ai-run.mjs`; `ai-run-status.json` |
| 3 | Restore the Essential journey | Six movements: executive summary, profile, themes, seven findings, three pathways, six first responses, a 30/60/90 plan, basis and conclusion. 19 to 21 pages | `report-excellence/<org>/essential.pdf` |
| 4 | Restore the Comprehensive journey | Executive diagnosis, scope, profile, themes, findings, four pathways, five blueprints, operating model with management information, decisions with options, twelve-month programme, scorecard, basis and conclusion. 28 to 33 pages; no appendix; every register and specification in the workbook | `report-excellence/<org>/comprehensive.pdf` and `-workbook.xlsx` |
| 5 | Restore the visual identity | Poppins embedded, the corporate-profile palette, profile-style cover and header; every page reviewed and defects fixed | `VISUAL-AND-BRAND-ACCEPTANCE.md` |
| 6 | Writing and positioning | MK's advisory voice; boundary stated once; no em dash, internal identifier, band, research-stage wording or system language; South African legal context where the method supplies it | Manuscripts; gate G06 |
| 7 | Methodological discipline | Relationship classifications, sufficiency candidate, library 0.1 and the four statements all preserved. Method status is moved out of the prose into a prototype notice that keeps the release requirements visible | `BIBLE-COMPLIANCE-AND-GAP.md` section 3 |
| 8 | The 34-dimension review | Each dimension gives the standard, evidence, scores (live, prototype, improved), deficiencies and corrective action | `QUALITY-SCORECARD-34.md` |
| 9 | Demonstrate improvement | Indicators and side-by-side passages | `REPORT-EXCELLENCE-COMPARISON.md`; `comparison-indicators.json` |
| 10 | Scope | Respected throughout | This document |

## Deliverables

1. **Bible compliance and gap assessment:** `BIBLE-COMPLIANCE-AND-GAP.md`.
2. **The 34-dimension scorecard:** `QUALITY-SCORECARD-34.md`.
3. **Validated manuscripts:** `report-excellence/<org>/{essential,comprehensive}-manuscript.md` (with provenance) and `.txt` (plain text). Their validation reports are `*-validation.json`, and the Fact Packs, Story Plans and writer briefs sit beside them.
4. **Rendered PDFs and workbooks:** `report-excellence/<org>/{essential,comprehensive}.pdf` and `*-workbook.xlsx`, with `*-manifest.json`.
5. **Visual and branding acceptance:** `VISUAL-AND-BRAND-ACCEPTANCE.md`.
6. **Before and after:** `REPORT-EXCELLENCE-COMPARISON.md`.
7. **Tests, blockers and decisions:** below, and `DECISION-REGISTER.md` (E-37 to E-45, D-7 to D-11).

## Tests

| Check | Result |
|---|---|
| Objective gates (`excellence-tests.mjs`, G01 to G12 for eight reports) | 92 of 92 pass |
| AT-AI-01, production AI manuscript run | **BLOCKED** (no credential); reported separately, never counted as a pass |
| Earlier quality, relationship and sufficiency suites (RQ, RS, SA) | Unchanged at 16, 9 and 9 of 9 for the revised prototype |
| Integrity guard, TypeScript, ESLint | See the package evidence |

The gates cover:

- manuscript validation;
- paragraph provenance;
- plain-text coverage of the PDF;
- page ranges;
- no appendix;
- Poppins-only fonts;
- no em dash, identifier, band or research-stage wording;
- the fixture label and prototype notice;
- the Bible's workbook sheets;
- register reconciliation;
- cross-artefact consistency;
- manifests;
- tier differentiation.

Objective gates prove correctness, not excellence (Bible 21). The quality judgement is the scorecard.

## What blocks release

1. **AT-AI-01.** The production AI manuscript stage has not run. To run it, use `node --env-file=.env.local … scripts/revised-reports/excellence-ai-run.mjs` on a machine holding the gateway credential, then rebuild and review. The credential stays in that machine's environment and is never written to a file or the conversation.
2. **MK decisions.** D-1 (readiness conclusion), D-3 (order of work), D-5 and D-8 (advisory content), D-9 (publication system), D-10 (Bible updates) and D-11 (Comprehensive depth standard).
3. **Quality work this workstream can still do.**
   - Deepen the Comprehensive findings and themes (dimensions 8, 29 and 31).
   - Add South African operating context per control archetype (dimension 20).
   - Simplify the decision pages (2 and 21).
   - Vary repeated finding openings (18).
   - Replace the theme map with an interaction diagram (24).
   - Review the workbooks in Excel (26).
   - Add the owner-name consistency check (27).
4. **The existing release blockers.** B2, B3, B4, B5, B6, B7, B11 and J-01.

## How to rebuild

```
export PATH=<node 24>:$PATH
L="--experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs"
node $L scripts/revised-reports/excellence-briefs.mjs          # Fact Packs, Story Plans, writer briefs
node $L scripts/revised-reports/excellence-ai-run.mjs          # AT-AI-01 (exits 2 without a credential)
PUPPETEER_EXECUTABLE_PATH=<chrome> node $L scripts/revised-reports/excellence-build.mjs   # validate, compose, render, workbook, manifest
node $L scripts/revised-reports/excellence-tests.mjs           # objective gates
node scripts/revised-reports/excellence-comparison.mjs         # indicators
```
