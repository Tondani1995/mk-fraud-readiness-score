# Phase 13 Commercial Event Taxonomy

Phase 13 turns the MK Fraud Readiness Score from a working assessment tool into a controlled commercial conversion and lead-intelligence product.

This taxonomy is the foundation only. It does not introduce the customer-facing report-options UI, premium executive summary UI, payment gateways, proof upload, automated report release, customer instant download, public benchmarks, peer averages or live AI-generated recommendations.

## Commercial Offers

### Full MK Fraud Readiness Report

- Customer label: **Full MK Fraud Readiness Report — R5,000 including VAT**
- Option code: `full_report_5000`
- Meaning: the standard paid report generated from the assessment/report engine after MK confirms manual EFT payment.
- Fulfilment expectation: emailed within one business day after EFT payment confirmation.
- V1 boundary: no instant customer download and no automated report release.

### Advanced Personalised Fraud Readiness Report

- Customer label: **Advanced Personalised Fraud Readiness Report — from R50,000 including VAT**
- Option code: `personalised_report_50000`
- Meaning: a high-value personalised report prepared by MK Fraud Insights using the assessment output plus expert interpretation, tailored analysis and more nuanced recommendations.
- Fulfilment expectation: usually within 7 business days after scope and payment confirmation.
- V1 boundary: not system-generated, no automatic order, no automatic payment obligation and no automated report release.

Do not display `excluding VAT` anywhere in customer-facing Phase 13 copy. Do not hard-code VAT calculations unless a later pricing configuration explicitly supports them.

## Lead Stage Interpretation

| Lead stage | Event signal | Meaning |
|---|---|---|
| Lead created | `assessment_submitted` | A respondent completed the assessment with contact details. This is already a lead. |
| Warm lead | `report_options_opened` | The respondent has reviewed commercial next steps. |
| Standard commercial report lead | `full_report_5000_selected` | The respondent selected the R5,000 report path. |
| High-value personalised report lead | `personalised_report_50000_selected` | The respondent selected the R50,000+ personalised report path. |
| High-intent payment lead | `eft_order_created` | A manual EFT order exists for the R5,000 report. |
| Customer | `payment_marked_received` | MK manually confirmed payment. |
| Fulfilled customer | `report_emailed_to_customer` | MK fulfilled the paid report by email. |

## Event Rules

All events are written server-side only. Public client code should not write directly to `assessment_events`.

Dedupe key format:

```text
assessment:{assessment_id}:event:{event_type}:option:{option_code_or_none}:order:{order_id_or_none}:data_request:{data_request_id_or_none}:report:{report_id_or_none}
```

Repeated identical events update `last_seen_at` and increment `event_count`; they do not create noisy duplicate rows.

## Event Catalog

| Event type | Trigger | Lead signal | Internal notification | Dedupe rule |
|---|---|---:|---:|---|
| `assessment_started` | Accountless assessment row is created. | No | No | Once per assessment. |
| `assessment_submitted` | Assessment is locked/submitted successfully. | Yes: lead created | Yes | Once per assessment. |
| `snapshot_viewed` | Private snapshot page loads after token validation. | Mild | No | One row per assessment snapshot, repeat count increments. |
| `executive_summary_viewed` | Future premium executive summary section is viewed. | Yes | Later decision | One row per assessment. Not wired in this PR. |
| `report_options_opened` | Future report-options UI is opened. | Yes: warm lead | Yes | One row per assessment. Not wired in this PR. |
| `report_option_selected` | Future generic option selection event. | Yes | Later decision | Separate by `option_code`. Not wired in this PR. |
| `full_report_5000_selected` | Future R5,000 report option is selected. | Yes: standard commercial report lead | Yes | Separate by `option_code = full_report_5000`. Not wired in this PR. |
| `personalised_report_50000_selected` | Future R50,000+ personalised report option is selected. | Yes: high-value personalised report lead | Yes, high priority | Separate by `option_code = personalised_report_50000`. Not wired in this PR. |
| `eft_order_created` | Manual EFT order is created or reused for the R5,000 report flow. | Yes: high-intent payment lead | Yes | Include `order_id` and `data_request_id`. |
| `payment_marked_received` | Admin changes order status to `payment_received`. | Yes: customer | Optional | Include `order_id`. |
| `report_generated` | Admin report generation succeeds. | Operational fulfilment | No | Include `report_id`. |
| `admin_report_downloaded` | Admin signed download URL is successfully issued. | Operational fulfilment | No | Include `report_id`. |
| `report_emailed_to_customer` | Future admin fulfilment marks report emailed. | Yes: fulfilled customer | Optional | Include `report_id` and order/request if available. Not wired in this PR. |
| `internal_notification_queued` | Internal notification helper queues an `email_events` record. | Operational | No | Include the related notification dedupe identity. |
| `internal_notification_sent` | Future email sender successfully sends queued notification. | Operational | No | Include email event/provider id. Not wired in this PR. |
| `internal_notification_failed` | Notification queue or future sender fails. | Operational risk | No | Include failure context only, never secrets. |

## Notification Dedupe

Internal notifications should use deterministic dedupe keys, not free-form message matching.

Recommended notification dedupe format:

```text
internal_notification:{notification_type}:assessment:{assessment_id}:option:{option_code_or_none}:order:{order_id_or_none}:data_request:{data_request_id_or_none}:report:{report_id_or_none}
```

Expected notification behavior:

- `assessment_completed`: queue once when an assessment is submitted.
- `report_options_opened`: queue once when the future options UI is opened.
- `full_report_5000_selected`: queue once when the future R5,000 option is selected.
- `personalised_report_50000_selected`: queue once, high priority, when the future R50,000+ personalised report option is selected.
- `eft_order_created`: queue once when the manual EFT order exists.

If `MK_INTERNAL_LEADS_EMAIL` is not configured, the helper must return `skipped_no_recipient`. It must not pretend an email was sent.

## Privacy Boundary

The structured assessment uses predefined options. It does not ask respondents to upload documents, describe incidents, name employees, name suppliers, provide customer information, share account numbers, disclose passwords or enter confidential operational records.

Event metadata must stay small and safe. Do not store passwords, account numbers, detailed incident narratives, employee names, supplier names, customer data or private free-form operational records in `metadata_json`.

## Phase 13 Foundation Boundary

This first PR wires only safe backend events that already exist:

- assessment started
- assessment submitted
- snapshot viewed
- EFT order created/reused
- payment marked received
- report generated
- admin report downloaded
- internal notification queued/failed where applicable

Later Phase 13 PRs should add:

- premium executive summary UI
- report-options UI
- R5,000 report option selection
- R50,000 personalised report lead request
- admin fulfilment controls for `report_emailed_to_customer`
- real notification sending if a provider is approved
