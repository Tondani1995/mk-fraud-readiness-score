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

- The first result section leads with `Assessment complete`, not a sales headline.
- The executive interpretation uses controlled maturity, exposure and leadership-priority blocks.
- Priority labels are `Immediate attention`, `Developing`, `Structured` and `Stronger foundation`.
- Domain findings are keyed by D1-D10 domain code internally, not keyword heuristics.
- The free-vs-paid section may mention the paid `30/60/90-day fraud-readiness roadmap`, but does not reveal roadmap content.
- Customer-facing copy does not use phase labels, implementation-negation bullets, public benchmarks, AI-generated recommendations or internal question/rule codes.

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

The personalised report endpoint emits `personalised_report_50000_selected` only after the enquiry is persisted and linked to `data_request_id`. R50 card selection emits only generic `report_option_selected` analytics.

Internal notifications are queued only for selection/high-intent events, not for `report_options_opened`. Missing notification recipients remain a safe skip condition.

## Admin Visibility

New admin pages:

- `/score/admin/enquiries`
- `/score/admin/enquiries/[requestReference]`

Both authenticate admins before service-role reads. The list shows enquiry reference, assessment, organisation, respondent, email, reason, status and updated date. Opening a detail page writes a `personalised_enquiry_opened` audit log entry.

## Runtime Assurance Evidence

Runtime code head tested:

- Head: `4f5c99429087e0c9a6ddf00ae564723d2053592d`
- Deployment: `dpl_Ad9ddGtEBznnpta4rGEjMznRygSY`
- URL: `https://mk-fraud-readiness-score-pbec70el9-tondanis-projects.vercel.app`
- GitHub Actions: V1 Verification run #415 passed.
- Fresh assessment: `MKFRS-2026-4D59A2EA9E`
- R5 order: `MKORD-2026-7LT7KO4P`
- R50 enquiry: `MKENQ-2026-236E17B4`

Passed runtime evidence:

- Start, exposure profile, 68-question completion and submit.
- Private snapshot token protection and refresh safety.
- R5 order summary, EFT order creation, EFT snapshot display and duplicate reuse.
- R50 enquiry creation, confirmation and duplicate reuse.
- Persisted event/dedupe evidence for executive summary, report options, R5, EFT order and R50 events.
- No report rows or report events were created by R5/R50 customer paths.
- Admin enquiry list/detail and logged-out protection.

Evidence docs were updated after runtime UAT. Those updates are documentation-only and do not change runtime behavior.

## Defects Fixed During Assurance

- Preserved preview/deployment host in submit-generated snapshot links.
- Fixed snapshot-page self-link double `/score/score` prefix.
- Prevented duplicate customer email queue rows on repeated R5 request.
- Added email visibility to the admin enquiry list.

## Current Status

`Runtime and visual UAT Pass` for the tested runtime code head. PR #18 remains draft and unmerged until controller approval.
