# Phase 14 Funded AI Gateway Runtime UAT

## Result

**Pass for the Phase 14 AI narrative, repair and deterministic-fallback gates on isolated non-production infrastructure.**

The UAT used Vercel AI Gateway credits purchased on 14 July 2026, the isolated Supabase branch `phase14-uat`, assessment `MKFRS-2026-5C01B4F1EE`, score run `8540d731-afe9-444b-8850-c59060381677`, and the paid R5,000 `essential_self_assessment` entitlement only.

No production data was changed. Automatic fulfilment, customer email delivery, the test-recipient override and R50,000 engagement automation remained disabled. No UAT report was released to a customer.

## Live funded provider result

The first live call used `openai/gpt-5.5` through Vercel AI Gateway.

- First-pass token usage: 2,656 input, 2,239 output, 4,895 total.
- First-pass latency: 51,689 ms.
- The provider returned the complete structured narrative schema and grounded its narrative in the deterministic evidence pack.
- The only original validation issue was `overall_maturity_contradiction`.
- The output correctly described the organisation as **Structured overall** and separately described three domains as **Strategic**.
- The original validator treated any maturity-band word in the executive diagnosis as an overall maturity claim and therefore produced a false positive.

The stored live output was replayed through the corrected overall-versus-domain validation logic. The corrected logic detected **Structured** as the only contextual overall maturity, matched the deterministic final result, and passed. No other original validation issue existed.

The initial live run also proved the automatic repair path:

- Repair-call token usage: 4,430 input, 1,960 output, 6,390 total.
- Repair-call latency: 26,195 ms.
- Repair validation passed.
- Report generated: `RPT-MKFRS-2026-5C01B4F1EE-V5`.

## Controlled repair scenario

A controller-injected invalid first pass was used to prove that malformed, unsupported and incomplete content cannot proceed directly to the report.

- Invalid first pass was rejected before provider token use.
- Live repair-call token usage: 6,017 total.
- Repair validation passed.
- Generation mode: `ai_repair`.
- Report generated: `RPT-MKFRS-2026-5C01B4F1EE-V6`.

## Controlled provider-failure scenario

A controller-injected provider failure was used to prove continuity when the AI provider is unavailable.

- Both provider attempts failed by design.
- The report engine used the deterministic narrative fallback.
- Generation mode: `deterministic_fallback`.
- Report generated: `RPT-MKFRS-2026-5C01B4F1EE-V7`.

## Deterministic authority and release boundary

The locked score run remained:

- overall score: `75.90`;
- calculated and final maturity: `Structured`;
- exposure score: `59.50`;
- exposure band: `High`;
- coverage: `100.00%`;
- critical gaps: `1`;
- scoring input hash: `ef9a4b4aeca3496a6525cbfef6ffcc936b849dcb7df1a22e42748f5acd584d18`.

The AI layer did not calculate or modify the readiness score, final maturity, exposure result, domain scores, critical gaps, hard-gate outcome or score input hash. These remained sourced from the locked score run.

All generated PDFs were stored in the private `generated-reports` bucket. Reports reached the internal delivery-ready state, but automatic email delivery remained disabled, no email event or provider message was created, and no customer release timestamp was written.

## Validation defect repaired

`validatePremiumReportNarrative` now distinguishes contextual overall maturity statements from legitimate domain-level maturity references. Regression coverage confirms that:

- “The organisation remains Developing overall, while Operations demonstrates Structured domain maturity” is valid where the evidence supports both statements.
- “The organisation is Strategic overall” is rejected where the deterministic final maturity is Developing.

## Cleanup and isolation proof

After the tests:

- `premium_report_auto_fulfilment_enabled=false`
- `premium_report_ai_narrative_enabled=false`
- `premium_report_auto_email_enabled=false`
- `r50000_automation_enabled=false`
- `premium_report_test_recipient_override=null`
- the one-use UAT authorisation was disabled and expired;
- the unused clean-retest order and fulfilment were cancelled;
- no additional gateway call was made for the clean-pass proof because the actual stored funded first-pass output was revalidated directly;
- no fulfilment remained queued, assembling, generating, validating, rendering or storing;
- temporary UAT routes, the temporary post-build runner, the temporary GitHub workflow and the obsolete preview-auth failure artefact were removed;
- production contained zero matching UAT assessments, orders or reports, and all production Phase 14 flags remained off.

## Remaining Phase 14 gates

The AI narrative gate is closed. PR #21 remains draft and unmerged. Controlled test-recipient report-email delivery and signed webhook delivery, bounce and complaint UAT remain outstanding before Phase 14 can be considered complete.
