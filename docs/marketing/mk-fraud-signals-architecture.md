# MK Fraud Signals: architecture and operating runbook

Prepared 27 November 2026 on branch `feature/mk-fraud-signals-newsletter-20261127` (base `5654cbc`, the live production SHA). Nothing here is live. Every surface is off until the owner sets the switches listed under "Enablement".

## 1. Systems and authority

| System | Authoritative for | Never used for |
| --- | --- | --- |
| Attio | Commercial relationship, company, person, opportunity, organisation restrictions (MK, Restricted Organisations; MK, Commercial register exclusion statuses) | Newsletter permission. Attio is read, never written, by this integration. |
| Resend | Operational preference (global unsubscribe, topic opt-out), broadcast distribution, delivery suppression | Consent evidence |
| Supabase (`marketing` schema) | Consent evidence (append-only), integration event history, reconciled subscription state | Commercial data |
| GA4 | Consent-aware acquisition and conversion counts (`newsletter_signup_submitted`, `newsletter_signup_confirmed`, placement only) | Any address or identifier |
| Outlook | Personal commercial correspondence, newsletter replies (Reply-To) | Distribution |

## 2. Flows

1. **Subscribe** (`POST /api/newsletter/subscribe`): unticked consent box must be ticked; honeypot; per-IP, per-address and global daily caps. Records `subscription_requested` with the exact wording, version, SHA-256, source, path, hashed IP and user agent. Issues a single-use token (SHA-256 stored, 72 h TTL). Sends the confirmation email from `signals@send.mkfraud.co.za`, Reply-To `rendani@mkfraud.co.za`. Response is identical for every outcome.
2. **Confirm** (`/mk-fraud-signals/confirm` page, then `POST /api/newsletter/confirm`): token removed from the address bar on load; confirmation only on button press (link scanners cannot confirm). Server peeks the token, screens the address in Attio, then records `confirmed` and the screening decision atomically. `subscribed` only if the decision is `clear` (database CHECK constraint); otherwise `held`.
3. **Provider sync**: create contact with topic opt-in and no segment, then add the segment last. Withdrawals are written first. A Resend unsubscribe or topic opt-out can only be lifted by the first sync after a fresh confirmation that is newer than every recorded withdrawal.
4. **Webhook** (`POST /api/webhooks/resend-events`, the ONE Resend endpoint on the Free plan): Svix signature, 5-minute replay window and body cap checked once; each event is classified and handed to one isolated handler. Marketing events (contacts, topics, suppressions, broadcast and confirmation emails) apply at most once via the svix-id ledger. Transactional email events are forwarded unchanged to the existing Fraud Readiness route only when `MK_RESEND_SHARED_WEBHOOK_TRANSACTIONAL=enabled` and `RESEND_WEBHOOK_SECRET` equals this endpoint's secret; otherwise they are acknowledged and dropped (today's production behaviour).
5. **Reconcile** (`POST /api/internal/marketing-reconcile`, `Authorization: Bearer $CRON_SECRET`): re-screens Attio for everyone reachable, re-reads Resend, pushes withdrawals outward, holds disagreements, returns the audience snapshot. Run every 6 hours and immediately before every broadcast.

## 3. Precedence (fail closed)

suppression (manual > complaint > hard bounce > provider) > withdrawal (global, topic, contact deleted) > hold (restriction, ambiguity, provider conflict, unchecked) > subscribed.

Automated release exists for one case only: a hold caused by Attio being unreachable that later screens clear. Restricted and ambiguous holds are released by an operator (R4).

## 4. Enablement (owner approval required for each)

| Variable | Where | Value |
| --- | --- | --- |
| `MK_MARKETING_MODE` | Vercel (server) | `disabled` (default) / `test` / `live` |
| `NEXT_PUBLIC_MK_NEWSLETTER_ENABLED` | Vercel (build) | `true` shows footer form and pages |
| `MK_MARKETING_RESEND_API_KEY` | Vercel (server, sensitive) | New dedicated key "MK Marketing integration" (full access is the only Resend scope that can manage contacts) |
| `RESEND_EVENTS_WEBHOOK_SECRET` | Vercel (server, sensitive) | `whsec_...` of the single shared Resend endpoint |
| `MK_RESEND_SHARED_WEBHOOK_TRANSACTIONAL` | Vercel (server) | unset (default) / `enabled` once customer transactional email returns; also set `RESEND_WEBHOOK_SECRET` to the same secret |
| `MK_SIGNALS_RESEND_TOPIC_ID` | Vercel | ID of topic "MK Fraud Signals" (default subscription **opt_out**, see 5) |
| `MK_SIGNALS_RESEND_SEGMENT_ID` | Vercel | ID of segment "MK Fraud Signals" |
| `MK_QA_RESEND_SEGMENT_ID` | Vercel | ID of segment "MK Internal QA" |
| `MK_MARKETING_TEST_RECIPIENT_ALLOWLIST` | Vercel | Comma-separated MK-controlled addresses (test mode only) |
| `MK_MARKETING_HASH_PEPPER` | Vercel (server, sensitive) | 32+ random characters, never rotated without re-hashing |
| `MK_PUBLIC_SITE_URL` | Vercel | `https://www.mkfraud.co.za` (preview: the preview URL) |
| `MK_ATTIO_RESTRICTION_READ_TOKEN` | Vercel (server, sensitive) | Attio access token with read-only record and list-entry scopes |
| `MK_ATTIO_RESTRICTED_LIST_ID` | Vercel | `858bdb00-fec0-4707-8d01-9ca966e43c25` |
| `MK_ATTIO_COMMERCIAL_REGISTER_LIST_ID` | Vercel | `cad2b859-469f-448b-9339-42ea4a13e83a` |
| `MK_ATTIO_EXCLUSION_STATUS_ATTRIBUTE` / `MK_ATTIO_EXCLUSION_STATUSES` | Vercel | `relationship_status` / exact status title(s) used for exclusions |
| `MK_NEWSLETTER_DAILY_CONFIRMATION_CAP` | Vercel | default 40 (protects the shared Resend Free 100/day transactional limit) |

## 5. Resend topic: the naming trap

Resend's topic "default subscription" values are counter-intuitive and **cannot be changed after creation**:

- `opt_in` = every contact receives the topic unless they unsubscribe (applies retroactively to all contacts).
- `opt_out` = no contact receives the topic unless explicitly subscribed.

MK requires explicit opt-in, so the topic must be created with default subscription **`opt_out`**, visibility **public**. A broadcast created without `topic_id` ignores topic preferences entirely, so the segment is the second gate: only this integration adds people to the "MK Fraud Signals" segment, and only after confirmed consent and a clear restriction screen.

## 6. Runbook

- **R1 Before every broadcast**: call the reconcile endpoint; check `eligible_locally` against the Resend segment count; any difference is a stop. Set the topic on the broadcast in the dashboard (the ChatGPT connector has no topic field). Send to MK Internal QA first.
- **R2 Consent mismatch**: a held person (`provider_state_conflict`) stays held. Read their consent events and Resend contact; if Resend shows a withdrawal, mark them `unsubscribed`. Never lift a provider withdrawal by hand without a fresh confirmation on the website.
- **R3 Failed sync**: `sync_status = failed` retries up to 8 times through reconciliation; after that it appears in the snapshot and needs a look at `last_sync_error`.
- **R4 Release a restriction hold** (operator only, SQL editor, after the owner clears it in Attio): re-run reconcile; if still held, record the owner's decision as a `released` event and set status in one transaction. Never release because a person asked to be included.
- **R5 Suppressed recipients**: never remove a Resend suppression to deliver a newsletter. Suppressions are team-wide and also block Fraud Readiness transactional mail to that address.
- **R6 Erasure request**: set `email = null`, `status = 'erased'`; consent events (which hold no address) are retained as evidence; delete the Resend contact.

## 7. Rollback

1. Set `MK_MARKETING_MODE=disabled` (server routes refuse at once, no deploy needed beyond env reload) and `NEXT_PUBLIC_MK_NEWSLETTER_ENABLED` unset (next deploy hides every surface).
2. Disable the marketing webhook in Resend. Leave the Fraud Readiness webhooks as they are.
3. The migration is additive (new private schema only). Leave it in place to preserve consent evidence; it has no effect on any existing table or function.
4. Revoke the marketing Resend key and the Attio read token.
