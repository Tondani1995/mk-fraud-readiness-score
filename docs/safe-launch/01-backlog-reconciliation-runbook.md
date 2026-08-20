# Backlog Reconciliation Runbook (Release A)

**Tool:** `/score/admin/backlog-reconciliation`
**Who can view it:** `platform_admin`, `finance_admin`, `reviewer`, `approver`
**Who can classify:** `platform_admin`, `finance_admin`
**Data shown:** order reference, product, payment state, payment confirmation date, report
state/version, storage state, delivery state, exception age, assigned owner,
classification, resolution note, next action, completion date, and the internal order/report
id. Never customer name, email, or assessment content.

## Why this exists

Every order that reaches `payment_received` needs a defensible, auditable outcome without
hand-editing the database. Before this tool, recording "test order" or "customer never got
their report" meant a direct SQL update with no audit trail. This tool replaces that with
one RPC (`public.classify_backlog_order`) that always writes a paired `audit_logs` row.

## How to use it

1. Open `/score/admin/backlog-reconciliation`. The queue lists every order currently in
   `payment_received` state, oldest payment confirmation first, with its current
   report/storage/delivery state and exception age (days since payment was confirmed).
2. If your role can classify, expand the order and:
   - Pick a **classification** (see table below).
   - Write a **resolution note** of at least 5 characters — mandatory, stored verbatim in
     the audit trail. Refer to the order reference (e.g. `ORD-0001`), never a customer name
     or email.
   - Optionally set an assigned owner (admin user id), a next action, a target completion
     date, and an evidence reference (e.g. a ticket id).
   - Save. The record is upserted — reclassifying the same order updates the row and writes
     a *new* `audit_logs` entry each time, so history survives even though the queue only
     shows current state.
3. **Export CSV** downloads the same non-PII fields, gated by the same role check as the
   queue view.

## Classifications and what happens next

| Classification | Meaning | Next step |
|---|---|---|
| `genuine_customer_order` | Real, paid order progressing normally. | Continue normal fulfilment. |
| `internal_test_order` | Payment confirmed during internal testing. | Confirm nothing was delivered externally; no refund owed. |
| `legacy_superseded` | Replaced by a newer order/report, same customer. | Confirm the newer order is fulfilled; no action here. |
| `cancelled` | Cancelled after payment was confirmed. | Confirm if a refund is owed; classify `refunded` once processed. |
| `refunded` | Payment confirmed and since refunded. | Confirm the refund happened outside this tool; note the reference. |
| `delivered_outside_platform` | Report produced/sent manually, outside the normal flow. | Record how/when in the note; no further action expected. |
| `report_still_owed` | Payment confirmed, report not received. | Priority — assign an owner/date, then generate/deliver via the order flow. |
| `payment_requires_review` | Payment looks irregular (amount, duplicate, reference). | Escalate to finance before treating the order as paid. |
| `unresolved_exception` | Doesn't fit yet, or investigation unfinished. | Default state; keep the note updated as work progresses. |

## What the tool deliberately does not do

- Does not generate, regenerate, or deliver reports — use the existing order detail page
  (`/score/admin/orders/[orderReference]`) for that.
- Does not change `orders.status` or trigger any payment state transition.
- Does not expose or export customer name, email, organisation name, or assessment
  content — those stay on the existing order detail page, for roles already authorised.
- Does not touch Phase 14 (the disabled autonomous report/delivery engine) in any way.

## Audit trail

Every classification (create or update) writes one row to `audit_logs` with
`entity_table = 'backlog_reconciliation_records'`, `action = 'backlog_order_classified'`,
the prior row (`before_json`, `null` on first classification), and the new row
(`after_json`). `backlog_reconciliation_records.classified_by`/`classified_at` reflect only
the latest classification; full history lives in `audit_logs`.
