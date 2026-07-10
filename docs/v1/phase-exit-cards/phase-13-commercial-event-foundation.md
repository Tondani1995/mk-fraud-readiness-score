# Phase 13 Exit Card - Commercial Event Foundation

## Phase Result

Draft implementation pending PR CI.

## Scope Delivered

This PR implements the foundation layer for Phase 13 commercial conversion and lead intelligence. It does not add customer-facing report options, the premium executive summary UI, payment gateways, proof upload, automated payment verification, automated report release, customer instant download, public benchmarks, peer averages, live AI-generated recommendations, respondent accounts, subscriptions or a client portal.

## Database Migration

- `supabase/migrations/0012_phase13_commercial_event_foundation.sql`

Migration summary:

- Adds `assessment_events` for server-side commercial and lifecycle event tracking.
- Adds deterministic event dedupe through `dedupe_key` and repeat counting through `event_count`.
- Adds optional links to organisation, respondent, order, data request and report records.
- Extends `email_events` with notification dedupe metadata for future/safe internal lead notifications.
- Adds a `phase13_commercial_event_foundation` app setting recording that payment gateways, proof upload, automated release, customer download, benchmarks and live AI remain disabled.

## Event Taxonomy

Documented in:

- `docs/v1/phase13/phase13-commercial-event-taxonomy.md`

Supported event types:

- `assessment_started`
- `assessment_submitted`
- `snapshot_viewed`
- `executive_summary_viewed`
- `report_options_opened`
- `report_option_selected`
- `full_report_5000_selected`
- `personalised_report_50000_selected`
- `eft_order_created`
- `payment_marked_received`
- `report_generated`
- `admin_report_downloaded`
- `report_emailed_to_customer`
- `internal_notification_queued`
- `internal_notification_sent`
- `internal_notification_failed`

Only existing backend lifecycle events are wired in this PR. Future customer UI events are defined but not emitted yet.

## Commercial Copy Boundary

- Full MK Fraud Readiness Report - R5,000 including VAT.
- Advanced Personalised Fraud Readiness Report - from R50,000 including VAT.
- R5k report remains manual EFT only and emailed within one business day after EFT payment confirmation.
- R50k personalised report is human-led, not system-generated, and does not create an automatic order or payment obligation in this PR.

## Server-Side Events Wired

- `assessment_started`: accountless assessment creation succeeds.
- `assessment_submitted`: assessment is successfully locked/submitted.
- `snapshot_viewed`: private snapshot token validates and persisted snapshot loads.
- `eft_order_created`: manual EFT order is created or reused.
- `payment_marked_received`: admin marks an order as payment received.
- `report_generated`: admin report generation succeeds and report row exists.
- `admin_report_downloaded`: admin signed download URL is issued.
- `internal_notification_queued` / `internal_notification_failed`: internal notification helper records queue state.

## Internal Notification Boundary

Internal notification helper:

- Uses `MK_INTERNAL_LEADS_EMAIL` or `MK_INTERNAL_NOTIFICATIONS_EMAIL` as the configured recipient.
- Writes queued records to `email_events` using deterministic dedupe keys.
- Returns `skipped_no_recipient` when no recipient is configured.
- Does not send email or invent provider delivery status.

## Checks

Required CI sequence:

```text
npm run phase7:test-snapshot
npm run phase8:test-admin
npm run methodology:copy-test
npm run phase9:test-orders
npm run phase10:test-report
npm run phase11:test-security
npm run phase13:test-events
npm run typecheck
npm run build
```

Local execution note:

- This workspace did not have an authenticated Git checkout for the private repository, so changes were applied through the GitHub connector.
- Full local npm checks were not run from a clean authenticated checkout in this environment.
- The V1 Verification GitHub Actions workflow is the evidence path for the full check sequence.

## Remaining Risks

- Production migration has not been applied as part of this PR.
- Internal notification delivery is intentionally queued-only until an approved provider/sender is added.
- Admin analytics views/drop-off dashboards are not part of this PR.
- Customer-facing report options and executive summary UI are not part of this PR.
- Consent/trust copy changes for the start and report/advisory request stages are intentionally left for the customer-facing Phase 13 UI PR.

## Recommendation

Proceed as a draft PR for CI and review. Do not merge until V1 Verification passes and the migration plan is approved.
