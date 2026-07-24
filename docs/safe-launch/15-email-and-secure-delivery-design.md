# Release C — Email and Secure Delivery: Minimum-Change Design

Follows `docs/safe-launch/14-release-c-existing-delivery-audit.md` — read that first. This
document only justifies the design in terms of what it reuses/repairs vs. what is genuinely new.

## What is reused unchanged

- `resend-transport.ts` — the real Resend HTTP client. Not rewritten.
- The Resend webhook route + `resend-webhook.ts` — signature verification, replay protection,
  raw-body handling. Not rewritten. Its RPC (`ingest_phase14_provider_webhook`) is reused as-is.
- `email_provider_events` — the webhook-event ledger. Schema unchanged.
- `email_events` — extended (new columns/values only, see below), not replaced.
- `report_delivery_authorizations` / `report_delivery_finalizations` / `report_delivery_remediations`
  — **table schemas reused unchanged**; a deliberate, documented deviation from reusing their
  existing *RPCs* (see "Why new delivery RPCs, not the Phase14 ones" below).
- `report-access-eligibility.ts` — the eligibility gate, including its already-anticipated
  `customer_download` purpose. Not modified; the new customer route calls it exactly as the
  admin route does.
- `phase1-report-access.ts` — reused as a **pattern**, not modified: the new customer-access
  function follows its structure (order binding, checksum/magic-byte re-verification, short TTL,
  three-table audit fan-out, never returns the raw storage path) but is a new, parallel function
  for the customer purpose, since the existing one is admin-session-gated.
- The Release B worker route (`/score/api/internal/fulfilment-worker`) — extended with a second
  claim phase, not replaced with a new worker.
- `src/lib/respondent/tokens.ts`'s hash/TTL pattern — reused as the template for the new customer
  access token, not imported directly (different binding shape), but the same cryptographic
  approach (opaque token, only a hash stored, TTL column, purpose-bound).

## What is repaired

- `manual_report_delivery_attempts` is retired as the live delivery-attempt backing table. Its
  `provider_mode` CHECK structurally forbids a real value (audit Q6/Q7) — it cannot be patched
  into correctness without breaking its own constraint model. `phase1-manual-delivery.ts` is no
  longer the live delivery entry point after this release; `manual_report_delivery_attempts` and
  `phase1-manual-delivery.ts` are left in place (not deleted) for now, per the same
  "retain but do not use, do not delete without confirming it's not part of an approved design"
  discipline used throughout this programme, and flagged as dead-code-to-remove-later in the
  evidence pack.
- `internal-notifications.ts` / `phase1-order-notifications.ts` are repaired to call a real
  transport (in whichever provider mode is configured) instead of only writing a DB row.

## What is genuinely new

1. **Two new migrations** (do not edit any existing one): (a) extends `email_events` with the
   columns needed for the customer message types this release adds, extends
   `report_delivery_authorizations`/`finalizations`/`remediations` grants for the new RPCs below,
   and adds the customer access token table; (b) — if needed after implementation — any follow-up
   fix, kept separate per this programme's "no repairing an already-applied migration" rule.
2. **A new, narrow table**: `customer_report_access_tokens` (see "Token lifecycle" below) — the
   one new database object the audit's Q25 identified as genuinely required.
3. **New Release-C-scoped RPCs** for the delivery claim/lease/finalize cycle (see below) —
   *not* a reuse of `claim_premium_report_delivery`/`authorize_premium_report_delivery`/
   `phase14_delivery_entitlement`.
4. **A customer-facing access route** (`/score/report/access/[token]`, exact path TBD in
   implementation) — genuinely new, since audit Q16/Q17 confirmed no equivalent exists at all.
5. **Message builders** for the 5 required message types — inline TypeScript functions following
   the existing `messageCopy()` pattern (`report-delivery-service-core.ts:83-92`), not a new
   templating library or the unused `email_templates` table (see "Message templates" below).
6. **Admin UI additions** extending the existing order-detail page — delivery/access status,
   retry/reissue/revoke/resend controls.

## Why new delivery RPCs, not the Phase14 ones

`claim_premium_report_delivery`, `authorize_premium_report_delivery`, and
`phase14_delivery_entitlement` (`0017...sql:667-1789` region) are real, well-built, and — because
`phase14_security_gates` is currently `satisfied` (Release A finding, §4a) — would not actually be
blocked by the gate if called via `service_role` today (`phase14_require_security(..., true, true)`
permits a service-role caller). That does **not** make them the right choice to reuse directly:

- `phase14_delivery_entitlement` binds a delivery authorization to `score_run_id` and a
  `report_checksum` computed against the **Phase14 premium-report generation pipeline**
  (`report_fulfilments`/`report_generation_runs`) — a different, dormant generation path from the
  one Release A/B actually built on (`manual_report_generation_attempts` →
  `complete_manual_report_generation`, the live path). Forcing the live path's reports through an
  entitlement function designed for a different pipeline risks either an outright mismatch
  (raising `delivery_authorization_binding_changed` or worse, an unhandled error) or a subtler
  silent incompatibility that would only surface against a real order.
- Building new, Release-C-owned delivery on top of a security gate whose own governance trail
  this programme has already flagged for MK-operator review (thin justification text, Release A
  §4a, deliberately not touched per your instruction) would create a new production dependency on
  something explicitly under question — the opposite of "minimum change, minimum new risk."
- Reusing the well-designed **table schema** (lease/claim/finalize columns, checksum binding
  concept, revocation state) captures essentially all the engineering value of the dormant work
  without inheriting either coupling.

**Decision:** new RPCs — `claim_next_delivery()`, `mark_delivery_dispatch_started()`,
`finalize_delivery()`, `fail_delivery()` — insert into and update
`report_delivery_authorizations` directly (same columns, same lease/claim/finalize shape,
modelled explicitly on Release B's `claim_next_fulfilment_job()`/`fail_fulfilment_job()` for
consistency), gated by `service_role` grants exactly like Release B's worker RPCs, with **no**
call into `phase14_delivery_entitlement`, `phase14_require_security`, or the Phase14 security
gate at all. This keeps Release C's delivery path entirely independent of Phase14's governance
state, which is the safer posture given that state's own documented weakness.

## Closing the `reports.status = 'released'` gap

The audit found `released` is currently set only by dormant Phase14 code, and nothing in the
live path or Release B ever produces it — meaning `customer_download` eligibility would
correctly reject every request today. **Decision:** the new RPC that creates a
`report_delivery_authorizations` row from a `DELIVERY_QUEUED` `manual_report_generation_attempts`
row (`queue_report_delivery()`, new, Release-C-scoped) also sets
`reports.status = 'released', released_at = coalesce(released_at, now())` on the same report, in
the same transaction — mirroring exactly the update shape the dormant Phase14 code already uses
(`0017...sql:1989` etc.), just triggered from the live/Release-B path instead. This is the single
correct place for this transition: "released" should mean "released to the customer," which is
precisely what queuing a delivery represents.

## Provider abstraction and modes

`disabled` / `test` / `live`, per the brief, implemented as a single new
`getEmailProviderMode()` function (mirrors `automation/feature-flags.ts`'s style) reading one new
env var (`MK_EMAIL_PROVIDER_MODE`, name chosen to be unambiguous — `.env.example` already has a
stale, unreferenced `RESEND_API_KEY`/`MK_FROM_EMAIL`/`MK_ADMIN_EMAIL` trio that this release
replaces with the names the code actually uses, per the audit's Q15 finding). `disabled`: no
provider request, `email_events.status` reflects "not attempted," a visible admin warning banner,
release certification fails. `test`: uses Resend's real API in Resend's own test/sandbox mode
where available, or an internal controlled double otherwise — never a real customer address,
always clearly marked `test` in `provider_mode`/`metadata_json`, certification still fails for
production. `live`: real request via `resend-transport.ts` (reused unchanged), real
`provider_message_id` stored, webhook-driven acceptance/delivery distinction (reused unchanged).

## Delivery event state model

Implemented as `email_events.status` values (extending the column's existing free-text usage,
not a new enum type, matching the schema's existing style): `CREATED`, `QUEUED`,
`PROVIDER_REQUEST_STARTED`, `PROVIDER_ACCEPTED`, `PROVIDER_DELIVERED`, `PROVIDER_DEFERRED`,
`BOUNCED`, `COMPLAINED`, `FAILED_RETRYABLE`, `RETRY_SCHEDULED`, `FAILED_TERMINAL`, `CANCELLED`,
`SUPERSEDED`. `PROVIDER_ACCEPTED` is set by `finalize_delivery()` (API 200 from Resend);
`PROVIDER_DELIVERED`/`BOUNCED`/`COMPLAINED`/`PROVIDER_DEFERRED` are set only by the webhook path
(`ingest_phase14_provider_webhook`, reused unchanged), never by the send path itself — this is
the concrete mechanism that keeps "provider accepted" and "provider delivered" distinct, per the
brief's explicit requirement.

## Delivery-worker integration

Extends the existing `/score/api/internal/fulfilment-worker` route (Bearer `CRON_SECRET`, same
auth as Release B) with a second phase per invocation: after attempting one generation-job claim
(Release B, unchanged), it attempts one delivery-job claim (`claim_next_delivery()`, new) if the
generation phase found nothing. One worker, one route, two claim kinds — not a second worker
platform, per the brief's explicit instruction.

## Message deduplication

Mirrors Release B's idempotency approach exactly: each of the 4 customer/admin message types
gets a deterministic `dedupe_key` (already a real column on `email_events`, audit Q1) derived
from `(order_id or report_id, message_type, recipient)`, inserted with `on conflict (dedupe_key)
do nothing` — a retried trigger cannot create a second initial message. Explicit reissue
(`resend_report_ready_email()`, new) bypasses the initial-message dedupe key by design (it is an
audited, authorised new attempt, not a duplicate) but does not regenerate the report or mint a
new report version.

## Provider webhook processing

Unchanged — the existing route and `ingest_phase14_provider_webhook` already do everything the
brief requires (signature verification, replay protection, event-id dedup). The only change is
that the events it ingests will, for the first time, correspond to real sends this release
enables, and `finalize_delivery()`/the webhook path now write to `report_delivery_authorizations`
rows created by the *new* Release-C RPCs rather than the old Phase14 `authorize_premium_report_delivery`
path — the webhook route itself needs no change since it keys off `provider_event_id`/
`email_event_id`, both of which the new RPCs populate identically to the old ones.

## Bounce and complaint handling

Reuses `report_delivery_remediations` unchanged for bounce-retry (mandatory evidence, explicit
authorisation). Complaints remain non-retriable by the same design the dormant code already
encodes (no `remediation_type` value exists for complaints) — reused, not reinvented.

## Token lifecycle (the one new table)

`customer_report_access_tokens`: `id`, `order_id`, `report_id` (the specific version, not just
the order), `recipient_email` (hashed via `citext`, matching existing conventions),
`token_hash` (SHA-256 of the opaque token; the raw token is never stored, mirroring
`src/lib/respondent/tokens.ts`), `purpose` (fixed `'report_ready'` for v1), `issued_at`,
`expires_at` (env-controlled TTL, default 7 days, per the brief), `revoked_at`,
`revoked_reason`, `last_accessed_at`, `access_count`. One partial-unique index enforces one
active (non-revoked, non-expired) token per `(report_id, recipient_email)` — a reissue explicitly
revokes the prior token first, in the same transaction, rather than allowing two active tokens.

## Access validation

The customer route validates, in order: token hash lookup → not revoked → not expired → purpose
match → order/report binding → `assertReportAccessEligible(report, 'customer_download')` (reused
unchanged — this is exactly where the `released`-status requirement is enforced) → checksum +
magic-byte re-verification (reused pattern from `phase1-report-access.ts`) → rate limit (reuses
the existing `rate_limit_hits` table/pattern already used elsewhere in this codebase). On success:
a short-lived (60s, matching the admin pattern) signed storage URL is minted fresh — **the
durable customer token and the temporary storage URL are never the same object**, per the brief.

## Reissue and revocation

Admin-triggered `reissue_report_access_token()` (new RPC): revokes the prior active token,
issues a new one, creates a new audited `email_events` row (the "resend" message), and does
**not** touch `manual_report_generation_attempts` or trigger any regeneration.
`revoke_report_access_token()` (new RPC): sets `revoked_at`/`revoked_reason`, no new token
issued. Both role-gated to the same set as Release B's quality-review roles
(`platform_admin`/`reviewer`/`approver`), audited via the existing `audit_logs` table.

## Admin recovery

Extends the existing order-detail page (not a new dashboard), per the brief: message type,
recipient, provider mode, delivery state, provider message ID, retry count, provider
acceptance/delivery/bounce/complaint, secure-link state/expiry/access status, technical
reference, next permitted action — plus controls for retry delivery, reissue link, resend
report-ready email, revoke link, and moving terminal failures to owned review. All idempotent,
role-gated, audited, matching the Release A/B pattern exactly.

## Privacy protections

No assessment answers or full report content in any email subject/body (the brief's own
requirement — verified in the message builders below). No raw access token in any log — only its
hash is ever persisted, matching `src/lib/respondent/tokens.ts`'s existing discipline. No private
storage path in any customer-facing response, matching `phase1-report-access.ts`'s existing
discipline exactly. No permanent signed URL persisted anywhere — only the 60-second one, minted
fresh per validated access.

## Domain-authentication requirements

SPF/DKIM/DMARC records and the exact sending domain are **not yet known to this document** —
`.env.example`'s stale `MK_FROM_EMAIL` suggests `mkfraud.co.za` (also the hardcoded fallback
sender in `report-delivery-service-core.ts:248`), but this must be confirmed, not assumed, by
whoever controls that domain's DNS. Recorded as a launch gate in the evidence pack, not resolved
in this design.

## Test strategy

Mirrors Release A/B: static source-assertion script (`scripts/release-c-*.mjs`) plus genuine
live-database SQL checks against a full local migration replay (synthetic data only, transaction
rolled back, no residue) covering: token issuance/validation/expiry/revocation/reissue, delivery
claim exclusivity, dedup on retried triggers, `released`-status transition, eligibility rejection
of a superseded report, RLS. Real Resend API calls (even in `test` mode) are **not** exercised in
this cycle's automated tests — see the external-resource decision below.

## External-resource decision

Per the brief's explicit gate (§17) and this programme's cost-discipline rules: **no Resend
account is created or connected this cycle.** `RESEND_API_KEY` already exists as an env var name
in `.env.example`, which could mean either (a) an approved account already exists and this
repository is simply not yet configured to use it, or (b) the name was reserved but never
provisioned. **This is unknown from code alone and must be confirmed by the authorised MK owner
— it is not assumed either way in this implementation.** All code in this release runs correctly
in `disabled` mode (the safe default) without requiring that answer; `live` mode is implemented
and ready to activate the moment the owner confirms which case applies and, if (b), approves
creating the account. No trial account is created to find out.

## Closure cycle addendum

Three gaps found during this release's own end-of-cycle review, resolved additively in
`supabase/migrations/20260724180000_release_c_closure_delivery_exceptions.sql`. Item 1 of that
same closure brief (unifying the admin delivery-state/queue display across
`report_delivery_authorizations` and the legacy `manual_report_delivery_attempts` table) is
covered separately — implemented in a parallel session against this same branch to avoid two
divergent implementations of the same display logic.

**Missing-recipient handling.** The original design's `approve_quality_review()` addition
correctly chose not to fail the whole approval when `orders.customer_email` is null (the report
still deserves to be released), but only recorded that as an `audit_logs` line — invisible unless
an operator thought to look. The fix keeps the same non-blocking design decision but adds a
visible, correctable surface: an `order_events` row (queryable, shown in the admin UI), a flag on
the RPC's own return value driving exactly one deduped internal alert, and a new RPC,
`correct_delivery_recipient_and_queue()`, scoped narrowly to "a released report with no existing
delivery authorization" — it cannot create a second, competing authorization, and it never
regenerates the report. No new table, no placeholder/fake email address ever written (the
approval transaction was never actually blocked by the `email_events.recipient_email not null`
constraint in the first place — it simply skips the insert, which is why this was findable only
by reading the code, not by hitting an error).

**Bounce/complaint owned exceptions and resend suppression.** Reusing
`phase14_operational_alerts` (previously only used for the provider-event-conflict case) rather
than inventing a second alerting mechanism — the alert_key is derived from `(email_event_id,
outcome)`, giving the same replay-safety the conflict case already relied on, for free.
Resend-suppression on `reissue_customer_report_access_token()` is a default-block, explicit-
override design (a boolean parameter, not a separate confirmation table) — deliberately the
lightest-weight mechanism that still requires an audited, reasoned, distinguishable action to
bypass. A transient/soft bounce is classified in the webhook route (Resend's own
`data.bounce.type` field) rather than in the RPC, keeping the RPC's status vocabulary unchanged
and mapping the transient case onto the already-existing `delivery_delayed` status rather than
inventing a new one.

**Status-vocabulary rank fix.** `apply_email_provider_event_atomic()`'s ordering/staleness rank
ladder (added well before this release, in the dormant Phase14 chain) never recognised Release
C's own uppercase status vocabulary, so a row in one of those statuses ranked as 0 (lowest) until
its first webhook event. Live testing (`docs/safe-launch/09-release-evidence.md`) confirmed this
is not an *observable* bug in the current flow — every real incoming event has rank ≥ 30, so a
rank-0 default never actually blocks anything a nonzero rank wouldn't also allow — but it's
fragile: correct only by coincidence of the current vocabulary's specific rank values, not by
design. Fixed by adding the four Release C statuses to the existing rank ladder at the position
matching their real meaning, rather than leaving the coincidence in place or attempting a broader
vocabulary unification that would also touch the still-dormant Phase14 chain's own use of the same
function — out of scope for this release.
