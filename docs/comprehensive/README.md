# Comprehensive deliverable lane

This lane is presentation and delivery only. It consumes the existing deterministic analytical universe and adds reviewer-supplied evidence, interpretation, management and board fields without recalculating or rewriting the assessment.

## Current bounded A–F path — 2026-09-01

The active remediation path is now the manuscript-first Comprehensive chain:

`Fact Pack → Story Plan → Report Blueprint → whole-manuscript generation/recovery → provenance validation → narrative-led PDF → companion workbook`

The provider-free A–F evidence lane exercises the current path for Motheo (sustainment) and Bokamoso (a bounded structural-composition fixture using remediation data). It includes bounded recovery behavior, current-path PDF rendering, structural brand regression and comparison screenshots. Bokamoso is not live commercial narrative evidence and is not an R35,000-value acceptance claim. Phase G provider-backed Luna/Terra generation was intentionally not run.

Comprehensive branding is governed by the accepted Essential production implementation. The current renderer imports the shared MK design tokens and uses the approved vector logo through `renderCoverLogo`; it does not create a separate Comprehensive mark or use renderer/browser assets. The required comparison evidence is four views per profile: cover, narrative, exhibit and conclusion. The Bokamoso views are structural-fixture evidence only.

The reproducible local gates are:

```bash
npm run v11:comprehensive-current-architecture
npm run v11:comprehensive-recovery-behaviour
npm run v11:comprehensive-brand-regression
npm run v11:comprehensive-current-path
```

See [`COMPREHENSIVE_CURRENT_PATH_A_F_2026-09-01.md`](./COMPREHENSIVE_CURRENT_PATH_A_F_2026-09-01.md) for the execution record and release boundary.

## Contract

`src/lib/reports/comprehensive/contract.ts` exposes:

- `fromAssembledReportData(data, reviewerInput)` for the future paid-order/API adapter;
- `buildComprehensiveDeliveryModel(analytical, reviewerInput)` for pure rendering and fixture use;
- `buildEvidenceRequestPack(...)` for a client-readable evidence request pack;
- `assertNoFalseValidation(...)` as a fail-fast guard against unsupported validation claims.

Evidence status is explicit:

`NOT_REQUESTED` · `REQUESTED` · `RECEIVED` · `EVIDENCE_REVIEWED` · `VALIDATED_SUPPORTED` · `NOT_SUPPORTED` · `NOT_VALIDATED_INSUFFICIENT` · `NOT_APPLICABLE`.

The backend reconciliation adapter preserves the distinctions between requested, received, reviewed, supported, not supported, insufficient and not applicable. `REVIEWER_JUDGEMENT` is a separate human interpretation dimension. Finding-level validation additionally requires an explicit reviewer finding conclusion and reviewed evidence references.

The main report is a bounded Comprehensive L2 projection: up to 20 findings, 12 risks, 8 scenarios, 20 control actions and 24 dependency-closed roadmap actions. The annotated register retains the full L1 universe.

Reviewer text is additive. It is never used to mutate deterministic responses, scores, maturity or the underlying analytical universe.

## Deliverables

- `renderComprehensiveReportHtml()` produces a distinct reviewer-led report with bounded decision views and full traceability references.
- `renderBoardReadoutHtml()` produces a standalone seven-page readout.
- `buildComprehensiveRegisterSheets()` produces the full annotated register sheet model for the XLSX builder.
- `buildExecutivePresentationModel()` produces a ten-slide executive content model and a six-part workshop agenda.
- `TierComparison` is a generic, prop-driven and keyboard-safe presentation component. It contains no authoritative product codes or prices.

## Local verification

```bash
node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/comprehensive-deliverables-tests.mjs
CODEX_NODE_MODULES=/Users/tondani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules \
  node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/comprehensive-register-builder.mjs
CODEX_NODE_MODULES=/Users/tondani/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules \
  node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/comprehensive-render-fixtures.mjs
```

The builders use synthetic fixtures only. They do not invoke an AI/provider call.
