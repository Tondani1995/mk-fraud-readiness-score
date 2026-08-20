# Storefront Contract Correction

Nine customer-facing claims contradicted the frozen product contract. All removed.

| # | Was | Now | Surface |
|---|---|---|---|
| 1 | "Essential diagnoses. **Comprehensive verifies**, interprets and makes it board-ready." | "Essential diagnoses the position. Comprehensive adds the control, governance, evidence and implementation depth to act on it. **Neither includes independent validation.**" | TierComparison |
| 2 | heading "Choose the level of **assurance** you need" | "Choose the level of **depth** your organisation needs" | TierComparison |
| 3 | Badge "**MK quality review**" | Badge "Automated analysis" | FreeSnapshot |
| 4 | "subject to **MK quality review before release**" | "generated automatically… they do not independently validate evidence, test whether controls operate, or provide an assurance opinion. Independent review is available separately through MK Advisory." | FreeSnapshot |
| 5 | "Reports are **reviewed before release**" | "Reports are generated from the persisted result, not re-scored" | FreeSnapshot |
| 6 | Delivery "Payment → evidence request → **reviewer validation** → deliverable package" | "Payment → automated report generation → secure delivery" | FreeSnapshot |
| 7 | Detail label "**Quality review**" | "What this includes" | FreeSnapshot |
| 8 | "The **named reviewer signs off** the Comprehensive deliverable package." | "Your report is generated automatically from the persisted assessment result." | FreeSnapshot |
| 9 | "**Expert quality review**" in paid-value list | "Supporting evidence register" | commercial-insights |
| 10 | "Leadership decision library with **costed options**" | "…with options, trade-offs and accountable owners" | product-catalogue |

## Blank exposure fallback
`riskImplication()` suppressed on `|| snapshot.resultStatus`, which is truthy for **every**
adaptive assessment (PROVISIONAL/NORMAL as much as INSUFFICIENT_VISIBILITY). The fallback
therefore fired across the whole adaptive path. A second pass also removed
`exposureAssessed === false`, which is false for every adaptive assessment because the
exposure module never runs there.

Now suppressed only on genuine INSUFFICIENT_VISIBILITY; otherwise a high-level implication
is derived from the recorded control position:
- P06 (13 critical gaps): "The assessment records 13 critical-control weaknesses. Critical controls are the ones expected to hold on their own…"
- P08 (0 critical gaps, Structured): "No critical-control weakness is recorded. At this level the material question changes from whether controls exist to whether they still operate consistently, are evidenced, and would hold as the business changes."

## Gate
`v11:storefront-contract-gate` — 5 surfaces, 0 violations.
Negative control **8/8** real defect phrases caught. Positive control **5/5** legitimate
constructions allowed, distinguishing "Comprehensive includes independent validation" from
"…does not include…" and "available through Advisory".
