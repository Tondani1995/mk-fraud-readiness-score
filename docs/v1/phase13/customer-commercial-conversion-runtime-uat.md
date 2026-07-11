# Phase 13 PR B Runtime UAT Checklist

## Status

Runtime UAT completed on the exact PR #18 patched head.

- Result: `Runtime and visual UAT Pass`
- PR: #18
- Branch: `phase13/customer-commercial-conversion`
- Tested head: `4f5c99429087e0c9a6ddf00ae564723d2053592d`
- Vercel deployment: `dpl_Ad9ddGtEBznnpta4rGEjMznRygSY`
- Deployment URL: `https://mk-fraud-readiness-score-pbec70el9-tondanis-projects.vercel.app`
- Deployment state: `READY`
- Vercel metadata commit: `4f5c99429087e0c9a6ddf00ae564723d2053592d`
- GitHub Actions: V1 Verification run #415 passed.
- Production Supabase project: `jvjxlphdyzerrhwcgkup`

## Fresh Respondent Journey

- Organisation: `MK Commercial PRB Runtime UAT 20260711215125`
- Respondent email: `commercial-prb-20260711215125@example.com`
- Assessment reference: `MKFRS-2026-4D59A2EA9E`
- Start flow created a tokenised continuation link on the same deployment host.
- Exposure profile completed: `8/8` exposure areas captured.
- All questions completed: `68/68` questions.
- Autosave displayed while completing the assessment.
- Assessment submitted from the UI.
- Free snapshot rendered after submission.
- Private snapshot without token redirected to the private-link-required state.
- Tokenised private snapshot loaded and refreshed safely.
- Snapshot self-link remained on `/score/snapshot/MKFRS-2026-4D59A2EA9E` on the exact deployment host.

Snapshot values shown to the respondent:

- Overall score: `80/100`
- Final maturity: `Strategic`
- Coverage: `100%`
- Exposure band: `High`
- Critical controls: `0`
- Trust indicators: `68 controlled questions`, `10 fraud-readiness domains`, `Exposure profile included`, `Deterministic scoring`

Customer-facing boundary scan found no phase labels, implementation `V1` labels, `EXP-*` codes, `D*-Q*` codes, hard-gate/N/A-rule wording, AI-generated claims, public benchmark/peer-average wording, PayFast, card-payment, proof-upload, automatic-verification or instant-download language.

## R5,000 Report Path

- Product selected: `Full MK Fraud Readiness Report`
- Order summary displayed before order creation.
- Summary displayed organisation, assessment reference, `R5,000 including VAT`, one-business-day delivery wording and MK quality-review wording.
- EFT confirmation created/reused order: `MKORD-2026-7LT7KO4P`
- Payment reference matched the order reference.
- Customer saw the active EFT snapshot:
  - Bank: `FNB`
  - Account holder: `MK Fraud Insights`
  - Account number: `63106109332`
  - Branch code: `250655`
  - Currency: `ZAR`
  - Contact: `hello@mkfraud.co.za`
  - Manual confirmation note shown.
- Repeating the R5 request reused `MKORD-2026-7LT7KO4P` and did not create a duplicate order.
- After the duplicate-email fix, repeated request produced only one customer `detailed_report_request_received` queue row for the final clean assessment.
- No report row or report event was created.
- No PayFast, card payment, proof upload, automatic payment verification, report unlock or customer download appeared.

## R50,000 Personalised Report Path

- Product selected: `Advanced Personalised Fraud Readiness Report`
- Card selection emitted only generic `report_option_selected` before persistence.
- Form heading displayed `Tell us what your organisation needs`.
- Organisation, respondent, email and assessment reference displayed as non-editable context.
- Submitted a valid controlled enquiry with contact consent and a non-sensitive UAT note.
- Enquiry reference: `MKENQ-2026-236E17B4`
- Confirmation displayed `Your request has been received` and approved follow-up copy.
- Repeating the enquiry reused/enriched `MKENQ-2026-236E17B4` rather than creating a duplicate.
- R50 path created no order, payment obligation, report row, PDF or customer download.

## Persisted Event Evidence

Production DB evidence for `MKFRS-2026-4D59A2EA9E`:

- `executive_summary_viewed`: count `1`, no option, safe metadata only.
- `report_options_opened`: count `2`, no option, safe metadata only.
- `report_option_selected` / `full_report_5000`: count `2`, no order/data-request link, safe metadata only.
- `full_report_5000_selected`: count `2`, no order/data-request link, safe metadata only.
- `eft_order_created`: count `2`, linked order `MKORD-2026-7LT7KO4P`, safe metadata only.
- `report_option_selected` / `personalised_report_50000`: count `1`, no data-request link before persistence.
- `personalised_report_50000_selected`: count `2`, linked enquiry `MKENQ-2026-236E17B4` after persistence.

Metadata reviewed did not include snapshot tokens, resume tokens, free-text enquiry notes, raw questionnaire answers, bank-account details, signed URLs, passwords or confidential operational records. EFT bank details were present only in `orders.eft_instructions_snapshot`, as required for the order confirmation record.

## Notification Evidence

- `report_options_opened` created no customer/internal notification queue row.
- R5 order path created one customer queue row: `template_key = detailed_report_request_received`, `status = queued`, `provider_message_id = null`, `sent_at = null`.
- Repeated R5 request did not create a second customer queue row after the fix.
- No provider delivery status was invented.
- No internal notification delivery provider was configured/observed in runtime; internal notification helper remains queue/skip-only by design and is covered by Phase 13 event tests.

## Admin Runtime Evidence

Patched admin deployment: `https://mk-fraud-readiness-score-pbec70el9-tondanis-projects.vercel.app`

- `/score/admin/enquiries` required admin login.
- Corrected list showed enquiry reference, assessment, organisation, respondent, email, primary reason, status and updated date for `MKENQ-2026-236E17B4`.
- Detail page showed assessment reference, organisation/respondent context, email, focus areas, note, consent and timestamps.
- Detail boundary copy confirmed no order, payment obligation, PDF, report unlock, customer download or automatic report generation.
- Opening the detail wrote `personalised_enquiry_opened` audit events for `MKENQ-2026-236E17B4` with `order_created: false` and `report_generation: false`.
- Logged-out access to `/score/admin/enquiries` redirected to `/score/admin/login`.

## Defects Found and Fixed During Runtime Assurance

1. Snapshot-page self-link double-prefixed `/score/score/snapshot/...` after refresh.
   - Fixed by building a request-origin public snapshot URL in `src/app/snapshot/[assessmentRef]/page.tsx`.
2. Repeated R5 request reused the order but queued duplicate customer email rows.
   - Fixed by inserting `detailed_report_request_received` only for the first detailed-report request.
3. Admin enquiry list showed respondent name but not email.
   - Fixed by displaying respondent email under the contact name in `/score/admin/enquiries`.

## Screenshot References

Screenshots captured locally under:

`/Users/tondani/Documents/Codex/2026-07-07/what/tmp/phase13-pr18-uat-da440`

Key final screenshots:

- `31-clean-results-first-viewport-1440.png`
- `32-clean-private-snapshot-refresh-1440.png`
- `33-clean-executive-priority-1440.png`
- `34-clean-value-comparison-1440.png`
- `35-clean-report-options-1440.png`
- `36-clean-r5-order-summary-1440.png`
- `37-clean-r5-eft-confirmation-1440.png`
- `38-clean-r50-enquiry-form-1440.png`
- `39-clean-r50-success-1440.png`
- `50-patched-admin-enquiry-list-1440.png`
- `51-patched-admin-enquiry-detail-1440.png`
- `52-logged-out-admin-enquiries-blocked-1440.png`

## Remaining Risks

- Internal notification delivery is still queue/skip-only; no provider delivery is implemented in this PR.
- Supabase advisors still report project-wide residual findings. They are recorded in the exit card and were not all introduced by PR B.
- PR #18 remains draft and unmerged until controller approval.
