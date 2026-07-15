# Payment automation implementation

## State and persistence

Migration 0024 adds `payment_automation_records`, an immutable transition ledger, unmatched-event audit rows and return-session rows. `record_payment_transition` locks the order and payment record, applies an explicit transition graph, persists all verification fields, maps the result to the compatible order status and writes one order timeline event.

The internal states are `PAYMENT_PENDING`, `PAYMENT_PROCESSING`, `PAID`, `PAYMENT_FAILED`, `PAYMENT_REVIEW_REQUIRED`, `REFUNDED` and `CANCELLED`. Exact completed payments become `PAID`; underpayment, overpayment and wrong currency require review; failure, cancellation and refund events use their controlled terminal/recovery states.

## Manual confirmation

The existing finance-authorised status route remains the entry point. When payment capability is available it requires a meaningful note, loads the expected amount/currency, normalises a manual event and calls the same `processVerifiedPayment` service as the webhook. Before migration 0024, the legacy status route remains available. Before Phase 1 migration 0023, the exact message is:

> Payment confirmed. Fulfilment will remain pending until the Phase 1 upgrade is activated.

## Stitch boundary

`stitch-adapter.ts` defines replaceable session and lookup methods. Runtime mode defaults to `disabled`; the only implemented active mode is an in-process double. It makes no live request.

Webhook verification follows Stitch's current Svix boundary: raw bytes, `svix-id`, `svix-timestamp`, `svix-signature`, a five-minute replay tolerance, base64-decoded `whsec_` secret and constant-time HMAC-SHA256 comparison over `id.timestamp.rawBody`. Parsing normalises current payment-completion/cancellation/expiry/failure/refund shapes without persisting the raw body.

## Idempotency and concurrency

- Stable manual request keys and provider event IDs are unique.
- Provider source/event reference has a second partial unique index.
- The database row lock serialises state decisions.
- A unique-violation replay returns the already committed event instead of repeating downstream work.
- The Phase 1 request key is derived from the payment event and is also unique.
- Existing verified reports and active generation attempts are returned as already fulfilled/active.

Thus one valid payment yields at most one payment transition, one order timeline entry and one Phase 1 generation claim.

## Fulfilment

Both payment sources call `triggerPaidOrderFulfilment`. It performs the authoritative Phase 1 three-state capability check before any 0023 object is used. When available, it calls the deterministic Phase 1 manual engine with trigger `payment_confirmation`; when absent it records `PHASE1_UNAVAILABLE`. Delivery remains explicitly disabled and Phase 14 is not involved.

## Customer return and operations

The return route uses a short-lived, hashed, HTTP-only SameSite cookie bound to an order/session. The client polls the server status route and never treats redirect query values as proof. Admin order views show state, amounts, source, references, verification, review reason, fulfilment result, transition history and payment queues.
