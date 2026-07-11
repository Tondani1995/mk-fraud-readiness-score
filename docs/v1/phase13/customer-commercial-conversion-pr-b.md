# Phase 13 PR B - Customer Commercial Conversion Journey

## Scope

This PR adds the smallest safe customer-facing commercial journey after assessment submission:

1. Persisted free snapshot arrives from the private `/score/snapshot/[assessmentRef]?token=...` route.
2. A deterministic executive interpretation is shown from persisted score inputs.
3. Priority areas and strengths are summarised without exposing full paid-report narrative.
4. Free-vs-paid value is compared at a high level.
5. The respondent can select either `Full MK Fraud Readiness Report` at `R5,000 including VAT` or `Advanced Personalised Fraud Readiness Report` at `From R50,000 including VAT`.
6. The R5 path shows `Confirm your report order` first and creates or reuses the existing manual EFT order only after `Continue to EFT instructions`.
7. The R50 path creates or updates a personalised enquiry data request only. It creates no order, payment obligation, report or report unlock.
8. Admin users can review personalised enquiries under `/score/admin/enquiries`.

## Approved Customer Copy Boundary

- The first result section leads with `Assessment complete`, not `Free readiness snapshot`.
- The executive interpretation uses controlled maturity, exposure and leadership-priority blocks.
- Priority labels are `Immediate attention`, `Developing`, `Structured` and `Stronger foundation`.
- Domain findings are keyed by D1-D10 domain code, not keyword heuristics.
- The free-vs-paid section may mention the paid `30/60/90-day fraud-readiness roadmap`, but does not reveal roadmap content.
- Customer-facing copy does not use Phase labels, implementation-negation bullets, public benchmarks, AI-generated recommendations or internal question/rule codes.

## Deliberate Boundary

This PR does not add PayFast, card payments, Stitch, proof upload, subscriptions, respondent accounts, public benchmarks, peer averages, live AI recommendations, automated report release, customer instant download or report-generation changes.

## Data Sources

The executive summary uses only the persisted free snapshot model:

- overall score
- maturity band
- exposure score and exposure band
- coverage and not-applicable rate
- critical/major gap counts
- persisted domain results

It does not use LLM calls or generated recommendations.

## Event Tracking

The private snapshot page emits token-scoped events through `/score/api/assessments/[assessmentRef]/commercial-event`:

- `executive_summary_viewed`
- `report_options_opened`
- `report_option_selected`
- `full_report_5000_selected`
- `personalised_report_50000_selected`

The personalised report endpoint also emits:

- `report_option_selected`
- `personalised_report_50000_selected`

Internal notifications are queued only for selection/high-intent events, not for `report_options_opened`. Missing notification recipients remain a safe skip condition.

## Admin Visibility

New admin pages:

- `/score/admin/enquiries`
- `/score/admin/enquiries/[requestReference]`

Both authenticate admins before service-role reads. Opening a detail page writes a `personalised_enquiry_opened` audit log entry.

## Evidence

Code-level evidence passed in V1 Verification run #379 on implementation head `06a64b2640ecd94f97ef2240abed4b8752f9847d`. The current evidence-card updates after that head are documentation-only.

READY Vercel preview for that implementation head:

- `https://mk-fraud-readiness-score-git-phase13-c-dc49fb-tondanis-projects.vercel.app`
- Deployment `dpl_FDJq6bFFFajTbo2PKAbFB2xggjdM`

Migration, runtime UAT and visual UAT remain outstanding.
