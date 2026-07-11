# Phase 13 PR B Runtime UAT Checklist

Use a current-head preview deployment or an approved local runtime pointed at the approved Supabase environment. Do not use stale deployments.

## Public Respondent Flow

1. Open `/score/start`.
2. Start a fresh assessment.
3. Confirm the generated resume link stays on the same host under `/score/assessment/[ref]?token=...`.
4. Complete the exposure profile.
5. Complete all 68 questions.
6. Submit the assessment.
7. Confirm the private free snapshot renders under `/score/snapshot/[ref]?token=...`.
8. Confirm the executive interpretation, priority areas, strengths, free-vs-paid comparison and report options render.
9. Confirm no public benchmarks, peer averages, AI-generated recommendations, phase labels, internal question codes or rule labels are visible.

## R5,000 Report Path

1. Select `Full MK Fraud Readiness Report - R5,000`.
2. Confirm no order is created immediately on selection.
3. Tick consent for report delivery/follow-up.
4. Click `Continue to EFT instructions`.
5. Confirm order confirmation appears with:
   - order reference
   - payment reference equal to the order reference
   - FNB / MK Fraud Insights EFT snapshot details, if active in config
   - manual EFT confirmation note
6. Repeat the request and confirm the existing order is reused, not duplicated.
7. Confirm no instant download, automatic report release, PayFast, card payment or proof upload appears.

## R50,000 Advisory Path

1. Select `Executive Fraud Readiness Advisory - From R50,000`.
2. Submit the advisory form with consent.
3. Confirm an `MKENQ-YYYY-XXXXXXXX` enquiry reference appears.
4. Confirm no order, payment obligation, report row, PDF generation or customer download is created.
5. Repeat the enquiry and confirm the active enquiry is updated/reused rather than duplicated.

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
