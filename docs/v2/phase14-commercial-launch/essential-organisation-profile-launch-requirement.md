# Essential organisation-profile and companion-register launch requirement

Status: **REQUIRED BEFORE UNRESTRICTED COMMERCIAL LAUNCH**

## Purpose

The Essential report must remain grounded in recorded assessment evidence while becoming materially more organisation-specific. The report generator must not infer or invent facts about an organisation's sector, scale, processes, systems, footprint or operating model merely to make narrative sound bespoke.

## Minimum organisation profile

Before a paid Essential assessment can be submitted, the intake journey must capture a small structured profile, separate from the scored control answers. At minimum it must capture: sector / industry; organisation size band; the material value-bearing processes actually present (for example procurement, payments, refunds, claims, stock / held assets, supplier management or service delivery); material systems and channels used for those processes; operating footprint / location model; and the third-party / intermediary operating model. Optional free text may add context but must never override the structured selections without an explicit customer correction.

These fields are context, not readiness scores. They must not change a control score merely because of organisation type. Their purpose is to constrain applicability language, scenario selection and examples so the report does not recommend irrelevant processes or channels. Narrative generation may use only persisted profile facts and assessment evidence; missing profile facts must remain unknown rather than be guessed.

## Customer correction and privacy boundary

The respondent must be able to review and correct the profile before submission. Capture only the minimum business context needed for the advisory report; do not request personal data, named employees, customer records or confidential transaction detail through this profile gateway.

## Essential Supporting Register is part of the product contract

The companion workbook is the **Essential Supporting Register**, with the deterministic filename `<report-reference>-supporting-register.xlsx`. The source already builds the complete register from authoritative L1 data, verifies its stored bytes by SHA-256 and size, and exposes customer-authorised retrieval as the `register` artefact under the parent report's secure access authority.

A read-only production verification on 18 August 2026 found that the `report_artifacts` relation is not present in the current production schema (`42P01 undefined_table`). The current runtime therefore cannot persist and release the supporting register there. This is a **hard launch blocker** because the bounded PDF deliberately defers complete findings, risks, control actions, evidence requirements, roadmap actions and question trace to that companion workbook.

No production migration is authorised by this requirement. Before unrestricted commercial launch, the separately governed migration / release process must enable the accepted secondary-artefact schema and prove end to end that a paid Essential fulfilment produces both: (1) the verified PDF, and (2) the verified Essential Supporting Register, with both downloadable through authorised customer access and both tied to the same current report version. If the register cannot be produced and released, the Essential delivery must fail closed rather than tell the customer that omitted registers were supplied elsewhere.

## Acceptance criteria

Commercial launch is blocked until the structured organisation profile is persisted and available to report generation, no report path invents absent organisation facts, the companion register capability is present in the target production schema, and end-to-end acceptance proves that the PDF and its named supporting register are delivered as one coherent Essential package.
