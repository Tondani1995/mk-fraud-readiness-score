# Phase 13 PR B - Customer Commercial Conversion Journey

## Scope

This PR adds the smallest safe customer-facing commercial journey after assessment submission:

1. Persisted free snapshot arrives from the private `/score/snapshot/[assessmentRef]?token=...` route.
2. A deterministic executive interpretation is shown from persisted score inputs.
3. Priority areas and strengths are summarised without exposing paid-report narrative.
4. Free-vs-paid value is compared at a high level.
5. The respondent can select either the R5,000 Full MK Fraud Readiness Report or the from-R50,000 Executive Fraud Readiness Advisory.
6. The R5,000 path creates or reuses the existing manual EFT order only after the respondent continues to EFT instructions.
7. The R50,000 path creates or updates a personalised enquiry data request only. It creates no order, payment obligation, report or report unlock.
8. Admin users can review personalised enquiries under `/score/admin/enquiries`.

## Deliberate Boundary

This PR does not add PayFast, card payments, proof upload, subscriptions, respondent accounts, public benchmarks, peer averages, live AI recommendations, automated report release, customer instant download or report-generation changes.

## Data Sources

The executive summary uses only the persisted free snapshot model:

- overall score
- maturity band
- exposure score and exposure band
- coverage and not-applicable rate
- critical/major gap counts
- persisted domain results

It does not use the Phase 10 paid-report content library, report-content blocks, LLM calls or generated recommendations.

## Event Tracking

The private snapshot page now emits token-scoped events through `/score/api/assessments/[assessmentRef]/commercial-event`:

- `executive_summary_viewed`
- `report_options_opened`
- `report_option_selected`
- `full_report_5000_selected`

The personalised report endpoint emits:

- `report_option_selected`
- `personalised_report_50000_selected`

Internal notifications are queued through the existing helper and deterministic dedupe keys. Missing notification recipients remain a safe queue/skip condition.

## Admin Visibility

New admin pages:

- `/score/admin/enquiries`
- `/score/admin/enquiries/[requestReference]`

Both authenticate admins before service-role reads. Opening a detail page writes a `personalised_enquiry_opened` audit log entry.
