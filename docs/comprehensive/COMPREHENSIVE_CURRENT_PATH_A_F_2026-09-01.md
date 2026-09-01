# Comprehensive bounded A–F execution record — 2026-09-01

## Status

Bounded engineering and QA remediation is complete for the current A–F path. The provider-backed Phase G Luna/Terra generation and A/B calibration step was not run. The evidence below is therefore a release-readiness handoff, not a commercial acceptance or R35,000 value claim.

## Accepted defect baseline

The baseline includes the demonstrated Comprehensive defects addressed in this path:

- the report must be manuscript-first, with one current Fact Pack and one Report Blueprint governing the whole narrative;
- recovery must be bounded, provenance-aware and fail closed on unsupported hard truths;
- the PDF must be narrative-led, with exhibits as supporting views and the detailed analytical record in the companion workbook;
- sustainment must not invent findings, risks or remediation language where the current Fact Pack has none;
- Comprehensive must use the accepted Essential report as its branding authority.

## Branding authority and release criterion

The Comprehensive renderer uses the production-approved Essential implementation as its reference. The approved vector logo is rendered through `renderCoverLogo` from `src/lib/reports/design/brand-assets.ts`, with the shared `MK_CSS_VARIABLES` and token values from `src/lib/reports/design/tokens.ts`.

The branded path asserts the MK navy `#01123A`, MK green `#1F6B4A`, restrained brass `#C9A227`, approved logo marker and vector data URI, cover report reference, confidentiality treatment, report footer identity, no external assets, and no deprecated approximate colours. Positive sustainment semantics use MK green; amber remains a watch/major-state signal rather than a general brand accent. Branding is a release criterion: a materially wrong logo, identity or product-family treatment blocks release.

## Current path exercised

Both profiles run through the same deterministic chain:

`Fact Pack → Story Plan → Report Blueprint → current coordinator → bounded whole-manuscript validation → narrative presentation model → PDF renderer`

- Motheo: sustainment, score 80, Strategic, 53 facts, no findings/risks/scenarios, 9 chapters, 7 exhibits, 24 pages.
- Bokamoso: remediation, score 30.12, Reactive, 261 facts, 8 findings, 8 risks, 4 scenarios, 9 chapters, 8 exhibits, 36 pages.

The page gate is capped at the Reporting Bible’s 36-page upper bound. The current renderer preserves protected positive sustainment pacing while allowing remediation narrative blocks to flow naturally to avoid unnecessary white space.

## Provider-free recovery evidence

`comprehensive-recovery-behaviour-tests.mjs` proves the current policy without provider calls: clean pass-through, bounded semantic repair, hard-truth fail-closed behavior, repair ceiling 4, full-regeneration ceiling 1, quality escalation 1, coherence escalation 1, technical fallback accounting and total Comprehensive call ceiling 10. No provider-backed generation was attempted.

## Owner-review evidence

The A–F output pack contains one PDF and one companion XLSX workbook for each profile, plus four rendered PNG views per owner-review pack:

- cover page;
- representative narrative page;
- representative exhibit page;
- final/conclusion page.

The workbooks contain the eight required sheets: `Read me`, `Summary`, `Material Findings`, `Risk Register`, `Control Blueprints`, `Implementation Blueprint`, `Management Decisions` and `Question Traceability`. Motheo’s current sustainment register contains no fabricated findings or risks. Bokamoso retains its current remediation detail. Workbook formulas were recalculated/inspected and structural formula error scans passed.

## Operational boundary

All current-path evidence is provider-free and uses no database writes. Preserved Terra evidence remains historical recovery evidence, not current production truth. The next authorized step is the explicitly separate Phase G provider-backed generation/calibration run; it is not implied by this A–F handoff.
