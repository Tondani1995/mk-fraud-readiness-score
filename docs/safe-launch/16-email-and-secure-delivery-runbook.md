# Release C — Email and Secure Delivery Runbook

For an authorised MK operator (`platform_admin`/`finance_admin` for delivery retry,
`platform_admin`/`reviewer`/`approver` for access-token revoke/reissue and recipient correction)
working with real
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
  accepted, and the next scheduled retry time if one is pending. A `finalized` row means the
  provider *accepted* the send — if a bounce or complaint arrives afterward, the displayed status
  changes to `bounced`/`complained` instead (this overrides the raw authorization status; the same
  override is applied identically on the admin orders list/queue page, so the two always agree).
- **Customer report access links** — one row per `customer_report_access_tokens` record:
  recipient, issued/expiry timestamps, access count, and whether it's currently active, revoked,
  or expired. Only one link can be active per report+recipient at a time — issuing or reissuing a
  new one always revokes the prior active one first, in the same transaction.

**Why these are two separate states, not one.** A `report_delivery_authorizations` row tracks
whether the *email itself* reached the provider/inbox — `queued` through `finalized`, then
whatever the provider's own webhook reports back (`delivered`, `bounced`, `complained`, ...). A
`customer_report_access_tokens` row tracks whether the *link inside that email* has actually been
used — `access_count`/`last_accessed_at`. A customer can receive the email but never click the
link (email delivered, token never accessed), or — if you manually shared a link outside the
normal send — access the report without a corresponding delivery record at all. Treat "delivered"
and "accessed" as two different, independently meaningful facts, not stages of the same status.

**Identifying the current attempt for a report.** The list is ordered most-recent-first, so the
top row is always the current attempt. If a report has multiple rows (retries, or a reissue after
a bounce/complaint), older rows are history, not something to act on — only the top row's status
determines what action (if any) is available to you.

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

## Correct a missing or invalid recipient

`approve_quality_review()` releases the report either way, but only creates the delivery
authorization (and the `email_events` row) when `orders.customer_email` is set. A legacy or
malformed order with no address on file is never silently dropped — the report-detail page shows
a red **"Delivery blocked: no customer email on file"** banner directly above the delivery/access
card (this is the same condition previously visible only in `audit_logs` as
`delivery_not_queued_missing_recipient_email` and in `order_events` as
`delivery_recipient_required` — the banner is the operator-facing surface for it). MK is also
alerted internally the first time this happens for a given order (deduplicated — approving the
same order a second time does not send a second alert).

To resolve it: enter the corrected email address and a reason (minimum 5 characters) in the
banner's form and click **Correct Recipient & Queue Delivery**. This calls
`correct_delivery_recipient_and_queue()`, which:

1. Updates `orders.customer_email` to the address you enter (audited, with the previous value
   recorded).
2. Creates the delivery authorization and `email_events` row for the *already-released* report —
   the report is **not** regenerated and does not get a new version.
3. Records a `delivery_recipient_corrected` `order_events` entry, which is what makes the banner
   disappear on next load.

If you try to correct a recipient for an order that doesn't actually have a pending (queued-but-
unqueued) delivery — for example, if it was already corrected — the action is rejected with a
clear error rather than silently doing nothing or creating a second, competing delivery
authorization for the same report.

## Domain authentication is a prerequisite for real sending

`docs/safe-launch/17-domain-authentication.md` covers this in full — no SPF/DKIM/DMARC record has
been configured for any MK domain as of this cycle. Do not set `MK_EMAIL_PROVIDER_MODE=live`
before that document's status changes from `NOT CONFIGURED`.

## Handling a permanent bounce

When the provider reports a permanent bounce, the delivery attempt's status becomes `bounced`, an
`order_events` entry (`delivery_bounced`) appears in the order's activity timeline, and an owned
exception is recorded in `phase14_operational_alerts` (severity `warning`, category
`delivery_permanent_bounce`) — the same table already used for provider-event conflicts, so MK's
existing alert-monitoring surface covers this without a new mechanism. **Reissue & Resend is
blocked by default** against a bounced address — clicking it returns an explanation and an
**"Override and Resend Anyway"** button. Only use the override once you've confirmed the address
is actually correct (e.g. after contacting the customer); the override still requires its own
reason and is fully audited (`access_token_reissued` with `override_suppression: true` recorded).
A **transient/soft bounce** (the provider's own distinction, not MK's) is treated differently —
status becomes `delivery_delayed`, no owned exception is created, and Reissue & Resend is not
blocked at all, since a soft bounce is expected to be resolved by the provider's own retry.

## Handling a complaint

A spam/complaint report from the provider moves the delivery attempt to `complained`, creates a
`delivery_complaint` `order_events` entry, and a **critical**-severity
`phase14_operational_alerts` row. Reissue & Resend is blocked by default, identically to a
permanent bounce, with the same explicit-override escape hatch. Treat a complaint more
conservatively than a bounce: complaints are how a recipient explicitly told their mail provider
they didn't want this email — only override after genuine confirmation from the customer that they
still want the report and the send was legitimate, not as a routine retry step. Complaints are
recorded even on a duplicate/repeated notification from the provider for the exact same complaint
event — replaying the identical event never creates a second alert or a second order_events entry.

## Distinguishing legacy from Release C delivery

Older orders (fulfilled before this release) may show delivery history in
`manual_report_delivery_attempts` instead of, or in addition to, `report_delivery_authorizations`.
The "Real delivery & customer access" card on the order-detail page only ever shows
`report_delivery_authorizations`/`customer_report_access_tokens` rows — the real delivery
mechanism this release adds. If an order shows no rows there but does have delivery history
elsewhere on the page (the older "Delivery history" section, sourced from
`manual_report_delivery_attempts`), that delivery predates this release and was handled by the
prior (disabled/`double`-provider-mode-only) mechanism, not a real send.

## Recovering without direct SQL

Every action in this runbook — retry, revoke, reissue (with or without override), and recipient
correction — is available as an admin UI control on the order-detail page, backed by an
authenticated, role-gated, audited RPC. None of them require a database console. If you ever find
yourself reaching for `psql`/the Supabase SQL editor to fix a delivery or access-token state,
that's a signal either that the situation isn't one of the cases above (escalate) or that a gap
exists in this tooling worth reporting, not a normal recovery path.

## Turning on real sending (test or live mode)

Do not set `MK_EMAIL_PROVIDER_MODE` to `test` or `live` in any deployed environment without the
MK owner's explicit go-ahead on the external-provider decision gate above — this is a standing
instruction from every prior release cycle in this programme (no new paid/metered external
resource without approval each time, not a one-time approval). When that approval is given: `test`
mode still calls the real Resend API, so only ever use it with a designated MK test mailbox as the
recipient — the code has no way to enforce that restriction itself, it is an operator discipline.

For the first controlled verification against a real Preview deployment, follow
`docs/safe-launch/18-controlled-resend-preview-verification.md` exactly — it's an owner-executed
procedure (Vercel/Resend dashboard access and a Preview admin session are all things only someone
with real account access can supply; an assistant working this codebase deliberately does not
attempt to improvise around not having them).
