# Phase 9 UAT Checklist - Manual EFT Order Flow

Date: 2026-07-08

## Respondent Journey

- [ ] Complete an assessment and reach the free snapshot.
- [ ] Click `Request detailed report` once.
- [ ] Confirm the request succeeds without leaving `/score`.
- [ ] Confirm an order reference is shown.
- [ ] Confirm the amount and product are shown.
- [ ] Confirm EFT details are shown from the order snapshot when active.
- [ ] Confirm the text says: `Please use your order reference as the payment reference.`
- [ ] Confirm the text says MK Fraud Insights confirms EFT payments manually before any detailed report is released.
- [ ] Click `Request detailed report` again or refresh/retry the action.
- [ ] Confirm no duplicate order is created for the same report request.
- [ ] Confirm there is no proof upload, PayFast, card payment, PDF generation, report download or report unlock.

## Admin Journey

- [ ] Log in as a finance or platform admin.
- [ ] Open `/score/admin/orders`.
- [ ] Confirm the order queue loads.
- [ ] Confirm the order queue shows order reference, assessment reference, organisation, customer, product, amount, status, created/updated dates and detail link.
- [ ] Use the status filter and confirm the URL stays under `/score/admin/orders`.
- [ ] Search by order reference or assessment reference.
- [ ] Open the order detail page.
- [ ] Confirm linked assessment summary appears.
- [ ] Confirm linked report request appears.
- [ ] Confirm product and amount appear.
- [ ] Confirm EFT instruction snapshot appears.
- [ ] Confirm the order event timeline appears.
- [ ] Confirm audit trail entries appear where available.
- [ ] Change status to `payment_received`.
- [ ] Confirm an order event is recorded.
- [ ] Confirm an audit log entry is recorded.
- [ ] Confirm payment received does not generate, unlock, release or download a detailed report.

## Data Checks

- [ ] New order is linked to `assessments.id`.
- [ ] New order is linked to the existing detailed report `data_requests.id`.
- [ ] `orders.eft_instructions_snapshot` contains the active EFT setting at creation time.
- [ ] Updating `eft_settings` later does not rewrite the old order snapshot.
- [ ] `order_events` records creation and status updates.
- [ ] `audit_logs` records respondent request and admin status updates.

## No-Go Confirmation

- [ ] No PayFast.
- [ ] No card payment.
- [ ] No automated bank verification.
- [ ] No proof upload.
- [ ] No PDF generation.
- [ ] No report unlock.
- [ ] No AI recommendations.
- [ ] No public benchmarks.
- [ ] No respondent accounts.
- [ ] No subscriptions.
- [ ] No client portal.
- [ ] No implementation phase labels in normal customer-facing UI or admin navigation.
- [ ] No customer-facing methodology codes in respondent or snapshot pages.

## Required Commands

```bash
npm install
npm run phase7:test-snapshot
npm run phase8:test-admin
npm run methodology:copy-test
npm run phase9:test-orders
npm run typecheck
npm run build
```
