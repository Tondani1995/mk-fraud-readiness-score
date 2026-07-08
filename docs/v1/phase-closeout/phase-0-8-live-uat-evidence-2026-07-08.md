# Phase 0-8 Live UAT Evidence

Date: 2026-07-08  
Environment: Production  
Application path: `https://www.mkfraud.co.za/score/*`  
UAT reference: `MKFRS-2026-654ABDD80C`

## Result

Live UAT passed for the requested Phase 0-8 public and admin flow after PR #9 fixed the final continuation-link base-path defect.

## Public Respondent Flow

| Check | Result | Evidence |
| --- | --- | --- |
| Open `/score/start` | Passed | Production start page loaded. |
| Start new assessment from UI | Passed | New assessment created from the browser UI. |
| Assessment reference generated | Passed | `MKFRS-2026-654ABDD80C`. |
| Continue to questions | Passed | Button opened `/score/assessment/MKFRS-2026-654ABDD80C?token=...`. |
| Exposure profile completion | Passed | `8 / 8` exposure factors completed. |
| Autosave | Passed | UI showed `saved`. |
| Question completion | Passed | `68 / 68` questions completed. |
| Submit from UI | Passed | Submission completed through the live UI. |
| Free snapshot render | Passed | Snapshot rendered after submit. |
| Snapshot content boundary | Passed | Snapshot stayed within the free content boundary. |
| Detailed report request | Passed | Button returned `Request received` with clean messaging and no route break. |

## Snapshot Values Observed

| Metric | Observed value |
| --- | --- |
| Readiness score | `60/100` |
| Maturity | `Structured` |
| Exposure score | `50/100` |
| Coverage | `100%` |
| Critical gaps | `0` |

The snapshot did not expose benchmarks, full paid-report narrative, remediation plans or AI-generated advisory content.

## Admin Flow

| Check | Result | Evidence |
| --- | --- | --- |
| Admin login | Passed | Login succeeded using saved Chrome credential. |
| `/score/admin/assessments` | Passed | Assessment list loaded. |
| New record visibility | Passed | `MKFRS-2026-654ABDD80C` appeared as `report_requested`. |
| Status filter | Passed | Filter applied successfully. |
| Filter URL base path | Passed | URL stayed under `https://www.mkfraud.co.za/score/admin/assessments?status=report_requested`. |

## Test Method Note

After manual confirmation of autosave, browser-side UI automation was used to select repeated question answers faster. This is accepted for this route and integration smoke because the automation interacted with live browser controls and exercised the same autosave and submit path. It does not replace the separate methodology-copy review or qualitative question-language assessment.

## Gate Decision

The Phase 0-8 route and integration smoke is passed for the tested public and admin flow.

Remaining items that are still deliberately outside this UAT pass:

1. Negative admin access proof using a controlled non-admin Supabase Auth user.
2. Dedicated methodology-copy PR for the 68 questions and 8 exposure factors.
3. Admin detail page visual-density refinement if manual reviewer feedback confirms it is too dense.
4. Any editable product/EFT/report-content configuration workflow.
5. Phase 9 manual EFT/order flow and Phase 10 PDF report generation.

## Next Recommended Gate

Proceed to the methodology-copy PR or Phase 9 planning only after acknowledging the remaining items above. Phase 9 should remain limited to manual EFT/order flow and must not introduce PayFast, card payments, respondent accounts, client portal, AI recommendations, benchmarks or automated report generation.
