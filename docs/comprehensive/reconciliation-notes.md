# Reconciliation notes for Claude

1. Product catalogue, product codes, prices, paid-order entitlement and lifecycle remain outside this lane. The Comprehensive presentation layer accepts product metadata and reviewer input through props/contracts.
2. The future integration seam is `fromAssembledReportData(data, reviewerInput)` in `src/lib/reports/comprehensive/contract.ts`. The API/order lane should supply the assembled deterministic report data and persisted reviewer fields into this adapter.
3. Evidence-review persistence should map to `ReviewerEvidenceReview`, `ReviewerFindingReview`, `ReviewerObservation` and `ManagementDecision`. Do not map reviewer text into assessment answers or score-run fields.
4. The workbook builder is intentionally a new layer. The certified Essential supporting-register builder is not modified.
5. PDF generation is intentionally a separate future wiring step. The lane supplies HTML renderers; paid-order/API code should decide when to render and store them.
6. Product metadata for `TierComparison` is supplied via props. Do not hard-code the authoritative product code, price or entitlement inside the component.
7. Legal/privacy policy remains the source of truth for retention periods. The evidence request pack only asks for minimum necessary business records and includes a privacy boundary note.

