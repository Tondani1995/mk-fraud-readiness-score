# Payment current state and root causes

## Trace completed on 15 July 2026

The confirmed source path before this release was:

assessment submission and deterministic scoring → detailed-report request → `createOrGetOrderForReportRequest` → `orders.status = awaiting_payment` → finance-admin status form → `updateAdminOrderStatus` → `orders.status = payment_received` plus one `order_events` row.

Phase 1 source added a separate, admin-invoked manual generation engine and capability check. The payment status route did not call it. A finance administrator therefore had to record payment and a suitably authorised report operator had to make a second Generate Report request.

## Existing structures and controls

- `orders` stores the expected amount, currency, assessment/product binding, customer snapshot and the coarse manual-EFT status.
- `order_events` and `audit_logs` record order mutations.
- `eft_settings` and the order's instruction snapshot support manual EFT.
- Existing statuses include `draft`, `awaiting_payment`, `payment_received`, `cancelled` and `expired`, in addition to older enum values.
- The admin status route authenticates the session and uses the finance-role boundary.
- Order creation takes amount and currency from the active product. The old status mutation did not accept or verify the amount actually received.
- There was no Stitch session adapter, signature verifier, provider webhook endpoint or provider transaction lookup boundary in the active payment path.

## Confirmed defects and gaps

1. Payment state was represented only by the coarse order status; processing, failure, mismatch review and provider refund states were absent.
2. No payment-specific transition ledger stored old/new state, amount, currency, source, verification result, provider references and an idempotency key together.
3. Browser retries and concurrent confirmations were not protected by a payment-owned database uniqueness boundary.
4. Manual confirmation did not validate the received amount or currency.
5. Payment confirmation and Phase 1 generation were disconnected, requiring a second admin action.
6. There was no controlled paid-but-Phase-1-unavailable state for a database that had not received migration 0023.
7. There was no verified webhook boundary; consequently there was no raw-body signature verification, replay tolerance, malformed payload rejection or unknown-reference audit.
8. There was no server-verified customer return state. A future provider redirect could not safely be treated as payment proof.
9. Payment-specific operational queues and fulfilment-trigger results were absent from the order UI.

## Phase 14 inventory boundary

The repository retains historical Phase 14 source and inert tests, but the active manual EFT path did not call a Phase 14 workflow. Migrations 0017–0022 are prohibited for this release. This implementation does not call Phase 14 RPCs, satisfy gates, enable policies, create AI routes, send email, or invoke a report provider.

Statements above are based on traced source and migrations. No production, staging or UAT database was inspected.
