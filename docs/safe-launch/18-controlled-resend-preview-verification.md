# Controlled Resend Preview Verification — Owner-Executed Runbook

For the MK owner (or whoever holds Vercel/Resend dashboard access), to be run once, by hand,
against the `release-c/email-secure-delivery` Preview deployment. This exists because the
assistant working this closure cycle does not have — and should not improvise around not having —
three specific things: a way to read or write Vercel environment variables, independent
confirmation of which Supabase project the Preview environment is wired to (production must stay
read-only, per this programme's standing rule), and an authenticated admin session against the
live Preview app. All three are things only someone with real dashboard/account access can supply
directly. This document is the precise procedure to run in their place, so the verification still
happens without asking anyone to hand over credentials to an assistant.

**Every step below is Preview-only. Do not touch Production configuration or DNS at any point.**

## 0. Before you start

Confirm which Supabase project the `release-c/email-secure-delivery` Preview environment is
configured to use (Vercel dashboard → Project → Settings → Environment Variables → filter to
Preview → `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`). **If it points at the
production project (`jvjxlphdyzerrhwcgkup`), stop and use a non-production project instead** (e.g.
`mk-assist-staging`) before creating any synthetic test data — this whole programme's standing
rule is that the production database stays read-only, with no exceptions made for testing.

## 1. Confirm configuration (read-only, no values recorded)

In the Vercel dashboard, Project `mk-fraud-platform` → Settings → Environment Variables, filtered
to **Preview**, confirm each of the following exists (name and scope only — never paste actual
values anywhere, including back to the assistant):

`RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `MK_REPORT_EMAIL_FROM`, `MK_REPORT_EMAIL_REPLY_TO`,
`MK_INTERNAL_LEADS_EMAIL` or `MK_INTERNAL_NOTIFICATIONS_EMAIL`,
`PHASE14_PROVIDER_WEBHOOK_DB_HMAC_SECRET`, `NEXT_PUBLIC_APP_URL`.

In the Resend dashboard, confirm: `mkfraud.co.za` shows as a verified sending domain (SPF/DKIM
both green), `hello@mkfraud.co.za` (or whatever `MK_REPORT_EMAIL_FROM` resolves to) is a
permitted sender, and under Webhooks there's an endpoint pointing at
`https://<preview-url>/score/api/webhooks/resend` (or however the Preview alias is configured)
with at least `email.sent`, `email.delivered`, `email.bounced`, and `email.complained` enabled.

## 2. Set Preview to test mode

Still filtered to **Preview only** (never Production), set `MK_EMAIL_PROVIDER_MODE=test`. Save,
then either push any commit to `release-c/email-secure-delivery` (Vercel's GitHub integration
redeploys Preview automatically on every push — this has already been happening for every commit
this whole work cycle) or use the Vercel dashboard's **Redeploy** button on the latest deployment
for this branch. Confirm the redeploy reaches `READY`.

## 3. Trigger the four message types

Use the Preview URL's admin UI (the same `/score/admin/orders/{orderReference}` page this closure
cycle built out) — nothing below requires direct SQL:

1. **Order confirmation + admin new-order alert** — create a synthetic order through the normal
   respondent-facing assessment → report-request flow, using a designated MK test mailbox (never
   a real customer address) as the respondent's email. Both messages fire from the same code path
   (`recordPhase1OrderNotifications`), so one action triggers both message types.
2. **Payment-confirmed** — on that order's admin page, use the manual payment-confirmation action.
3. **Report-ready** — generate the report, then approve quality review. This is the one message
   type with real Resend delivery already wired end-to-end (`approve_quality_review()` →
   worker's delivery phase).

For each, the same order's admin page → **"Order notifications"** card (built this cycle) shows
`notification_type`, `status`, `provider_mode`, and any `error_message` directly — no separate
query needed. Record, per message: notification type, synthetic order reference, intended test
recipient, the `email_events.id` shown in that card, and whatever provider message id/status it
displays.

## 4. Verify provider acceptance vs. delivery are separate facts

Immediately after step 3, the "Order notifications" card should show each message as `sent` (with
a real Resend provider message id, not `null`) — this is **provider acceptance**, not confirmed
delivery. Separately, in the Resend dashboard's Logs/Emails view, confirm the same provider
message ids show a `delivered` event once Resend's own webhook fires back — this is **provider
delivery**. Do not treat the first as proof of the second; they are two different facts recorded
at two different times, exactly as the codebase's own state machine treats them
(`email_events.status` transitions from `sent`/`PROVIDER_ACCEPTED` to `delivered` only after the
webhook round-trip completes). The order's admin page reflects this transition automatically once
the webhook lands — refresh the page rather than assuming the first observation is final.

## 5. Verify the webhook round-trip explicitly

In the Resend dashboard's webhook delivery log, confirm at least one event for the report-ready
send returned a `200` from `/score/api/webhooks/resend`. In the database (or via the admin page,
which reflects this), confirm the corresponding `email_events` row's status updated to
`delivered` and `delivered_at` is set — this proves signature verification succeeded and the
event correlated to the correct row, not just that Resend attempted delivery.

## 6. Verify the secure-link email specifically

Open the report-ready email in the test mailbox and confirm: no PDF attachment, no `supabase.co`
or storage-bucket URL anywhere in the body, a link under the MK domain matching
`/score/report/access/{token}`, and no assessment findings/scores in the subject or body. Click
the link once from the test mailbox and confirm it resolves to the report (this exercises the
60-second signed URL minted fresh on access — the URL you land on after the redirect is
intentionally temporary and will not work if reloaded much later).

## 7. Bounce, defer, and complaint — synthetic events only, never a real bounce

Do not intentionally cause a real bounce or spam complaint against `mkfraud.co.za`'s sending
reputation. Instead, reuse the same signed-synthetic-webhook technique already proven locally this
work cycle (`docs/safe-launch/09-release-evidence.md`, provider webhook re-verification and
closure-cycle entries) but pointed at the live Preview URL instead of a local Next server. A
ready-to-run script for this is at `scripts/release-c-live-webhook-probe.mjs` — run it from a
machine that has the real `RESEND_WEBHOOK_SECRET` and `PHASE14_PROVIDER_WEBHOOK_DB_HMAC_SECRET`
values available as local environment variables (never commit them, never paste them into chat);
see the script's own header comment for exact usage. It exercises permanent bounce, transient
bounce, complaint, replay, and out-of-order delivery against a real `email_events` row you specify
by id (use one of the ids recorded in step 3), without ever contacting a real mailbox.

## 8. Cleanup

1. Set Preview's `MK_EMAIL_PROVIDER_MODE` back to `disabled` and redeploy Preview again (same
   mechanism as step 2) so no further real sends can happen from this branch by accident.
2. Remove any temporary environment values you added only for this test (none should have been
   needed beyond the mode flag, if steps 1 confirmed everything else already existed).
3. Leave the real, permanent Resend credentials in place — do not rotate or delete them.
4. If the Preview environment's database is a shared non-production project (not a disposable
   one), remove the synthetic order/report/email rows created in step 3 once the provider message
   ids and webhook evidence have been recorded elsewhere. If it's a disposable/ephemeral project,
   cleanup may not be necessary — use judgement based on what you confirmed in step 0.
5. Confirm Production's `MK_EMAIL_PROVIDER_MODE` was never touched (it should still read
   `disabled`, unchanged this entire cycle).

## 9. Report back

Once complete, report back (to be recorded in `docs/safe-launch/09-release-evidence.md`) with
separate, distinct outcomes for: credentials present, Resend authentication successful, domain
accepted, each of the 4 message types' provider-request result, provider message ids persisted,
webhook received and verified, delivered event persisted, controlled-mailbox receipt confirmed,
no customer contacted, and Preview mode returned to disabled. Do not collapse "provider accepted
the request" and "the test mailbox received the email" into a single result — they're recorded as
the separate facts they are throughout this codebase's own design.
