# Phase 13 PR B Runtime UAT Checklist

Use a current-head preview deployment or an approved local runtime pointed at the approved Supabase environment. Do not use stale deployments.

Verified implementation preview for code-level handoff:

- Head: `06a64b2640ecd94f97ef2240abed4b8752f9847d`
- Preview: `https://mk-fraud-readiness-score-git-phase13-c-dc49fb-tondanis-projects.vercel.app`
- Deployment: `dpl_FDJq6bFFFajTbo2PKAbFB2xggjdM`

## Public Respondent Flow

1. Open `/score/start`.
2. Start a fresh assessment.
3. Confirm the generated resume link stays on the same host under `/score/assessment/[ref]?token=...`.
4. Complete the exposure profile.
5. Complete all 68 questions.
6. Submit the assessment.
7. Confirm the private free snapshot renders under `/score/snapshot/[ref]?token=...`.
8. Confirm the first result section says `Assessment complete` and `Your organisation's fraud readiness position`.
9. Confirm the executive interpretation, priority areas, foundations, free-vs-paid comparison and report options render.
10. Confirm no public benchmarks, peer averages, AI-generated recommendations, phase labels, internal question codes or rule labels are visible.

## R5 Report Path

1. Select `Full MK Fraud Readiness Report`.
2. Confirm the price displays as `R5,000 including VAT`.
3. Confirm no order is created immediately on selection.
4. Confirm the `Confirm your report order` summary appears with product, organisation, assessment reference, price, delivery expectation and MK quality-review statement.
5. Click `Continue to EFT instructions`.
6. Confirm order confirmation appears with:
   - heading `Your report order has been recorded`
   - order reference
   - payment reference equal to the order reference
   - FNB / MK Fraud Insights EFT snapshot details, if active in config
   - `Use the order reference exactly as shown when making payment.`
   - manual EFT confirmation note
7. Repeat the request and confirm the existing order is reused, not duplicated.
8. Confirm no instant download, automatic report release, PayFast, card payment or proof upload appears.

## R50 Personalised Report Path

1. Select `Advanced Personalised Fraud Readiness Report`.
2. Confirm the price displays as `From R50,000 including VAT`.
3. Confirm the form heading says `Tell us what your organisation needs`.
4. Confirm organisation, respondent, email and assessment reference appear as non-editable context.
5. Submit the controlled enquiry form with at least one valid focus area and the required contact consent.
6. Confirm the confirmation heading says `Your request has been received`.
7. Confirm the confirmation copy says MK will review the assessment context and contact the respondent to discuss scope, information requirements, delivery approach and commercial proposal.
8. Confirm an `MKENQ-YYYY-XXXXXXXX` enquiry reference appears.
9. Confirm no order, payment obligation, report row, PDF generation or customer download is created.
10. Repeat the enquiry and confirm the active enquiry is updated/reused rather than duplicated.

## Admin Flow

1. Log into `/score/admin/login`.
2. Open `/score/admin/enquiries`.
3. Confirm the new enquiry appears in the queue.
4. Open `/score/admin/enquiries/[requestReference]`.
5. Confirm the detail page shows assessment, organisation, contact, reason, focus areas, consent and note context.
6. Confirm opening the detail writes a `personalised_enquiry_opened` audit log entry.
7. Confirm admin pages stay under `/score/admin/enquiries`.

## Event Evidence

Confirm persisted `assessment_events` rows and dedupe counts for:

- `executive_summary_viewed`
- `report_options_opened`
- `report_option_selected`
- `full_report_5000_selected`
- `personalised_report_50000_selected`
- existing `eft_order_created` reuse behavior
- internal notification queued/skip behavior according to configured recipient

No event metadata should contain resume tokens, snapshot tokens, free-form notes, passwords, account numbers, signed URLs or confidential operational records.

## Outstanding

This checklist has not been executed yet. Migration application, Supabase advisors, runtime UAT and visual UAT remain outstanding gates before PR #18 can leave draft.
