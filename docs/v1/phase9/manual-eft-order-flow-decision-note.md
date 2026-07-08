# Phase 9 - Manual EFT Order Flow Decision Note

Date: 2026-07-08
Branch: `phase9/manual-eft-order-flow`
Migration: `supabase/migrations/0010_phase9_manual_eft_order_flow.sql`

## Scope

Phase 9 adds a controlled manual EFT and order-management workflow around detailed report requests from the free snapshot. It gives MK Fraud Insights an internal order queue and audit trail without introducing automated payment or report fulfilment.

## Why Manual EFT First

Manual EFT is the safest V1 commercial step because MK can validate demand, pricing, customer handling and finance operations before connecting any payment gateway or automated fulfilment. It also keeps the detailed report release process under human control while the PDF/report engine remains out of scope.

## Customer Journey

1. Respondent completes an assessment.
2. The free snapshot renders.
3. Respondent clicks `Request detailed report`.
4. The existing detailed-report request is recorded or reused.
5. A manual EFT order is created or reused for that request.
6. The respondent sees a clean confirmation with order reference, amount and the EFT instruction snapshot.
7. The respondent is told to use the order reference as payment reference.
8. The respondent is told MK confirms EFT payments manually before any detailed report is released.

## Admin Journey

1. Admin opens `Order controls`.
2. Admin reviews the order queue by status or search.
3. Admin opens an order detail page.
4. Admin sees linked assessment, report request, product, amount, customer details and EFT snapshot.
5. Admin updates status manually.
6. Each status update writes an order event and audit log entry.

## Order Statuses

V1 manual statuses are:

- `draft`
- `awaiting_payment`
- `payment_received`
- `cancelled`
- `expired`

Existing historical order enum values remain in the database for compatibility, but the Phase 9 UI only exposes the controlled V1 statuses above.

## Data Model

Phase 9 extends the existing commercial foundation:

- `eft_settings`: active manual EFT configuration.
- `orders`: linked to assessment, data request, product and an immutable EFT instruction snapshot.
- `order_events`: status timeline and admin action history.
- `audit_logs`: admin and respondent-triggered order events.

EFT settings are snapshotted into `orders.eft_instructions_snapshot` at order creation so later banking-detail changes do not rewrite historical order instructions.

## Active EFT Configuration

The migration seeds an active manual EFT setting unless a complete active EFT profile already exists:

- Bank: FNB
- Account holder: MK Fraud Insights
- Account number: 63106109332
- Branch code: 250655
- Currency: ZAR
- Payment reference: use the order reference.
- Contact: hello@mkfraud.co.za

Account type is nullable and can be completed later if MK confirms it.

## Boundaries

Phase 9 does not add:

- PayFast
- card payments
- automated payment verification
- proof upload
- PDF generation
- report unlock
- automated report delivery
- AI recommendations
- public benchmarks
- respondent accounts
- subscriptions
- client portal functionality

Marking an order as `payment_received` only records finance state for later controlled work. It does not generate or release a detailed report.

## Phase 10 Handoff

Phase 10 can consume `payment_received` orders as candidates for a controlled report-generation process. That later phase must add its own approval, generation and release controls. Phase 9 intentionally stops before report generation.

## Testing Evidence Required

Run:

```bash
npm run phase7:test-snapshot
npm run phase8:test-admin
npm run methodology:copy-test
npm run phase9:test-orders
npm run typecheck
npm run build
```

Browser UAT should confirm repeated report-request clicks reuse the order, customer confirmation is clean, EFT details come from the snapshot, admin status changes are audited, and no no-go functionality is exposed.
