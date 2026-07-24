# Release C — Email and Secure Delivery Runbook

For an authorised MK operator (`platform_admin`/`finance_admin` for delivery retry,
`platform_admin`/`reviewer`/`approver` for access-token revoke/reissue) working with real
transactional email and secure customer report access on an order's admin detail page
(`/score/admin/orders/{orderReference}`). No step below requires direct SQL editing.

**Current operational status — read before assuming any customer email is actually sent.**
`MK_EMAIL_PROVIDER_MODE` defaults to `disabled`. In this mode every notification (order
confirmation, admin new-order alert, payment confirmed, report ready, and any admin-triggered
reissue) is still recorded as an `email_events` row with a full audit trail, but **no real email
ever leaves this system**. Whether `RESEND_API_KEY` in `.env.example` corresponds to a real,
funded account is unknown and not assumed either way — this is an explicit decision gate for the
MK owner, not a code change, before `test` or `live` mode is ever set in an actual deployment. If
you are looking at an order and wondering why a customer says they never received an email, check
`MK_EMAIL_PROVIDER_MODE` first, before assuming a delivery failure.

**Known gap — the admin queue/dashboard's delivery-state buckets (`Ready but Not Delivered`,
`Delivery Pending`, `Delivered`, `Delivery Failed`) currently read only the older
`manual_report_delivery_attempts` table, not the real delivery mechanism this release adds
(`report_delivery_authorizations`).** Once real (`test`/`live` mode) delivery is turned on, an
order can show real delivery success (see the order-detail page's own "Real delivery & customer
access" card, below) while still appearing stuck in the queue view. Until this is fixed, treat
the order-detail page's own delivery card as the source of truth for an individual order, not the
queue-level counts.

## Identify delivery and access-token state for an order

Open the order's admin page and scroll to the **"Real delivery & customer access"** card. It
shows two independent lists, most recent first:

- **Delivery attempts** — one row per `report_delivery_authorizations` record: status
  (`queued`/`claimed`/`dispatching`/`finalized`/`revoked`/`reconciliation_required`/
  `retry_scheduled`/`failed_terminal`), retry count out of the max, the provider message id once
  accepted, and the next scheduled retry time if one is pending.
- **Customer report access links** — one row per `customer_report_access_tokens` record:
  recipient, issued/expiry timestamps, access count, and whether it's currently active, revoked,
  or expired. Only one link can be active per report+recipient at a time — issuing or reissuing a
  new one always revokes the prior active one first, in the same transaction.

## Retry a failed delivery

A delivery that has exhausted its retries (`failed_terminal`) or needs manual reconciliation
(`reconciliation_required`) shows a **Retry Delivery** button. This calls `retry_delivery()`,
which requires the row to currently be in one of those two states, resets `retry_count` to 0, and
requeues it for the delivery worker's next run. Calling this on a row in any other state (e.g.
one that's still actively retrying) is rejected with `delivery_retry_invalid_state`, not silently
ignored — if you see that error, the delivery is already progressing on its own; check its
current status instead of retrying again. Requires `platform_admin` or `finance_admin`.

Retrying only requeues the job — it does not itself trigger the worker. The same worker-trigger
caveat from Release B applies here: while the production cron schedule remains the temporary
once-daily Hobby-tier schedule (`docs/safe-launch/12-durable-fulfilment-design.md`, "Vercel plan
launch gate"), a requeued delivery can sit for up to ~24 hours before the automatic worker picks
it up, unless it's processed sooner via the same "Process queue now" path Release B's fulfilment
worker already uses (the delivery claim is a second phase of that same route, not a separate
worker).

## Revoke a customer's access link

If a customer's report link needs to be invalidated (wrong recipient, security concern, customer
request), find the active token in the "Customer report access links" list and click **Revoke
Link**. You'll be asked for a reason (minimum 5 characters — this calls
`revoke_customer_report_access_token()`, which enforces that minimum itself). Revoking an
already-revoked link is rejected, not a silent no-op — if you see that error, someone already
revoked it; check the reason already recorded before revoking again. No new link is issued by
this action. Requires `platform_admin`, `reviewer`, or `approver`.

## Reissue a link and resend the report-ready email

Use **Reissue & Resend** (in the same card) when a customer's link expired, was revoked in error,
or the original report-ready email never arrived. Enter a reason (minimum 5 characters) and
submit. This:

1. Calls `reissue_customer_report_access_token()`, which revokes any existing active link for
   this report+recipient and issues a fresh one in the same transaction.
2. Immediately resends the report-ready email with the new link, using the same message template
   and provider path as the original send (respecting the current `MK_EMAIL_PROVIDER_MODE` — in
   `disabled` mode this records the attempt but sends nothing real, exactly like every other
   notification).

This does **not** regenerate the report or create a new report version — it only re-delivers
access to the existing one. If the resend itself fails (e.g. a real provider outage while in
`test`/`live` mode), the panel shows a warning naming the failure, but the new link is still
issued and valid — the customer can use it directly if you need to share it another way while the
resend problem is investigated. Requires `platform_admin`, `reviewer`, or `approver`.

## Every action here is audited

Every retry, revoke, and reissue writes an `audit_logs` row (`delivery_retried`,
`access_token_revoked`, `access_token_reissued`) recording your identity, the reason you typed,
and the before/after state — the same discipline as every other admin recovery action in this
programme. Nothing here is a fire-and-forget button.

## Handling bounces and complaints

Bounce-retry (`report_delivery_remediations`) is reused unchanged from the dormant Phase14 chain
and was not exercised by any live test in this release. Complaints remain non-retriable by design
(no `remediation_type` value exists for a complaint) — do not attempt to work around this by
reissuing a link after a complaint; treat it as a hard stop and escalate.

## Turning on real sending (test or live mode)

Do not set `MK_EMAIL_PROVIDER_MODE` to `test` or `live` in any deployed environment without the
MK owner's explicit go-ahead on the external-provider decision gate above — this is a standing
instruction from every prior release cycle in this programme (no new paid/metered external
resource without approval each time, not a one-time approval). When that approval is given: `test`
mode still calls the real Resend API, so only ever use it with a designated MK test mailbox as the
recipient — the code has no way to enforce that restriction itself, it is an operator discipline.
