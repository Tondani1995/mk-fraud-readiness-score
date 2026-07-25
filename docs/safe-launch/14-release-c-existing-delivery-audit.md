# Release C0 — Existing Communication and Access Audit

**Purpose:** determine what already exists before writing any Release C code. Performed on
branch `release-c/email-secure-delivery`. Method: an Explore-agent pass answering 25 specific
questions with file:line citations, followed by independent spot-verification of the 5 most
consequential claims — all 5 confirmed exactly as claimed.

## Headline finding

**Release C is largely a wiring and one-genuinely-new-component problem, not a build-from-scratch
problem.** A complete, well-engineered Resend integration already exists in this codebase —
a real HTTP transport (`resend-transport.ts`), a fully signature-verified and replay-protected
webhook handler (`src/app/score/api/webhooks/resend/route.ts`), a durable
lease/claim/finalize/revoke delivery-authorization state machine
(`report_delivery_authorizations`/`report_delivery_finalizations`), and a bounce-retry
authorization model (`report_delivery_remediations`) — but every one of these is reachable only
through `startPremiumReportWorkflow()`, which (re-verified directly, matching the Release B0
finding about the same dormant chain) has **zero callers anywhere in `src`**. The live customer
delivery path (`phase1-manual-delivery.ts`) is structurally incapable of a real send — its
backing table's own `provider_mode` CHECK constraint (`manual_report_delivery_attempts`,
`0023_...sql:90`) only permits `'disabled'`/`'double'`, so no code change to that file alone
could ever make it send real email; the constraint itself has to change.

**A second, more subtle finding not visible from table names alone:** the customer-facing
access-eligibility code already anticipates a `'customer_download'` purpose
(`report-access-eligibility.ts:15`), but requires `reports.status = 'released'`
(`report-access-eligibility.ts:62`) — and **`released` is currently set only by the same
dormant Phase14 chain** (three call sites, all inside `0017_phase14_canonical_disabled_foundation.sql`).
Neither the live manual-generation path nor Release B's `approve_quality_review()` (which only
updates `manual_report_generation_attempts.status`, not the underlying `reports` row) ever sets
a report to `released`. **This means a secure customer-access route built directly on top of
`report-access-eligibility.ts` as-is would work correctly (i.e., safely reject) — every single
request — because no live report is ever eligible.** Release C's design must deliberately close
this gap: something has to set `reports.status = 'released'` at the point a report is actually
released to the customer. See the design doc for where.

## Part 1 — Infrastructure map

| Component | Location | Current purpose | Provider mode | Called by | Real external effect? | Idempotent? | Secure? | Reusable? | Decision |
|---|---|---|---|---|---|---|---|---|---|
| `email_events` | `0001...sql:475-487`, extended `0012`,`0023`,`0017` | Generic log of every notification/email event | `provider_mode` CHECK already permits `disabled/double/external` | `internal-notifications.ts`, `phase1-order-notifications.ts` (live, DB-only); `report-delivery-service-core.ts` (Phase14, real path) | No on live path; yes on dormant path | Has `dedupe_key`/`provider_request_key`/`provider_message_id`+`provider` uniques already | N/A | Richest existing schema for this purpose | `extend` |
| `email_provider_events` | `0017...sql:204-227`,`1009-1021` | Durable webhook-event ledger (dedup + replay protection) | N/A | `ingest_phase14_provider_webhook`, called from the Resend webhook route | No (passive ledger) | `unique(provider, provider_event_id)` | RLS, insert-only via security-definer RPC | Yes | `reuse unchanged` |
| `email_templates` | `0001...sql:464-473` | Versioned subject/body templates | N/A | **Nobody** — zero INSERT/SELECT in application code | N/A | N/A | RLS present, table empty/unused | Schema fine, never wired to a renderer | `retain but do not use` |
| `manual_report_delivery_attempts` | `0023...sql:75-107` | Records each admin "send report" click on the live flow | CHECK restricts `provider_mode` to `disabled/double` only — **structurally cannot hold a real value** | `phase1-manual-delivery.ts`, live via `admin/reports/[reportId]/send-email` | No — structurally cannot | Yes (request-key unique) | Admin-only access, but delivery is fake | Overlaps `report_delivery_authorizations` | `replace` |
| `report_delivery_authorizations` | `0017...sql:1022-1058` | Durable authorization: report+checksum+recipient+provider binding, lease/claim/finalize state machine | Free-text `provider` — real values structurally legal | `deliverPremiumReportEmail`, reachable only via the dormant chain | No — dormant | Yes — unique keys, explicit state machine | Strong design (checksum binding, lease tokens, revocation), unverified in production only because unreachable | Best-designed real-delivery model in the repo | `retain as test double` → `extend/reuse` once wired |
| `report_delivery_finalizations` | `0017...sql:1061-1069` | Immutable success record, 1:1 with an authorization | N/A | Same dormant chain | No | Yes | RLS + revoked grants | Sound | `retain as test double` |
| `report_delivery_remediations` | `0017...sql:3112-3129` | Bounce-retry authorization with mandatory evidence; complaints non-retriable by design | N/A | `authorizeBouncedReportRedelivery`, same dormant chain | No | Yes | RLS, revoked from `service_role` too | Only existing bounce/complaint model | `retain as test double` |
| `resend-transport.ts` | `src/lib/reports/email/resend-transport.ts` | Real Resend `POST /emails` + `GET /emails/:id` client, timeouts, `Idempotency-Key` header | Real (`resend`) — the only real Resend call anywhere in the repo | Only from the dormant chain | Yes, once wired | Provider-side idempotency key already sent | Well-engineered, correlation tags scrubbed of secrets | Working client | `reuse unchanged` |
| Resend webhook route | `src/app/score/api/webhooks/resend/route.ts` + `resend-webhook.ts` | Receives/verifies/ingests Resend delivery-status events | Real | Resend (external) | Yes (inbound), meaningful once outbound is real | DB-level `unique(provider, provider_event_id)` | HMAC-SHA256 Svix verification on the exact raw bytes, ±300s + ±7d/±10min replay windows, rate-limited | Fully functional, already hardened | `reuse unchanged` |
| `internal-notifications.ts` | `src/lib/notifications/internal-notifications.ts` | Writes admin/internal notification rows | `status:'queued'`, `provider_send_attempted:false` | Live: assessment/commercial-event routes | No | Dedup via `dedupe_key` | N/A | Overlaps `phase1-order-notifications.ts` | `extend` |
| `phase1-manual-delivery.ts` | `src/lib/reports/phase1-manual-delivery.ts` | Live customer report-delivery entry point | `providerMode()` returns only `disabled`/`double` — **no real branch exists in code at all** | `admin/reports/[reportId]/send-email` (live) | Never, even with correct env vars — no code path to a provider | Yes (request-key) | `'double'` mode can produce `status='DELIVERED'` with `provider_send_attempted:false` — **reads as real success, is not** | Live, in-use, fundamentally fake | `replace` |
| `phase1-report-access.ts` (admin) | `src/lib/reports/phase1-report-access.ts` | Short-lived (60s) signed URLs for **admin** preview/download | N/A | Admin routes (live, admin session required) | Yes (storage URL) | N/A | Strong: order binding, eligibility gate, checksum+magic-byte re-verification, short TTL, full audit trail, never returns raw storage path | The template a customer route should follow | `extend` (build a parallel customer function using the same pattern, don't modify this file) |
| `phase14_operational_alerts` | `0017...sql:1070-1084` | Ops alerting for delivery anomalies | N/A | Only from the dormant chain | No | Yes, RLS + admin-only select | Sound, narrow | `retain as test double` |
| `report-access-eligibility.ts` | `src/lib/reports/report-access-eligibility.ts` | Status/currentness eligibility gate, 3 purposes incl. `customer_download` (already anticipated in a comment) | N/A | `phase1-report-access.ts` (admin), `report-delivery-service-core.ts` (dormant) | N/A | N/A | `customer_download` requires `status='released'` — stricter than admin/email purposes | **The gate to build the customer route on** | `extend` |

## Part 2 — Answers to the 25 audit questions

**1. Customer notification tables?** `email_events` only — base `0001...sql:475-487`, extended
`0012:108-116` (`notification_type`,`dedupe_key`), `0023:121-133` (`request_id`,`provider_mode`
CHECK, `retry_count`), `0017:179-183,348-355,1001-1002` (Phase14 delivery-state columns).
Customer order-confirmation rows: `phase1-order-notifications.ts:50-68`
(`status:'recorded_disabled'`).

**2. Admin notification tables?** Also `email_events`, distinguished only by
`notification_type`/`template_key` (`internal-notifications.ts:4-8`,
`phase1-order-notifications.ts:125-138`). No separate admin-notifications table.
`phase14_operational_alerts` is ops/anomaly alerting, not routine business notification, and
only reachable from the dormant chain.

**3. Report-delivery tables?** Two structurally different tables: `manual_report_delivery_attempts`
(live, `0023:75-107`) and the Phase14 trio `report_delivery_authorizations`/
`report_delivery_finalizations`/`report_delivery_remediations` (`0017:1022-1129`).

**4. Duplicate representation of the same event?** Yes — both model "one delivery attempt of
one report to one recipient via one provider" with incompatible schemas (the live table's
`provider_mode` CHECK structurally forbids a real value; the Phase14 tables were built to carry
one). Not reconcilable by a foreign key today. Real duplication, not just naming overlap.

**5. Any provider adapter making a real external request, reachable live?** No. Full call-chain
traced and re-verified: `resend-transport.ts` → `delivery-dispatch.ts`/`report-delivery-service-core.ts`
→ `premium-report-fulfilment.ts` workflow → `startPremiumReportWorkflow()` in
`automation/workflow-start.ts:18` → **confirmed zero callers anywhere in `src` besides its own
definition** (`grep -rn "startPremiumReportWorkflow" src/` returns exactly one match).

**6. Provider modes today?** Two independent systems: `phase1-manual-delivery.ts:21-23`
(`disabled`/`double`, DB-enforced via CHECK) and `email_events.provider_mode` CHECK
(`disabled/double/external` — `external` is legal but nothing writes it). Phase14 real-send
gating: `automation/feature-flags.ts:8-20,53-99` (`autoEmailEnabled`, `manualDeliveryEnabled`,
both default `false`).

**7. Can disabled/double be misread as sent?** Yes, confirmed twice: `phase1-manual-delivery.ts:123-151`
sets `status='DELIVERED'` with `provider_send_attempted:false` under `'double'` mode;
`phase1-order-notifications.ts:142-158` sets `email_events.status='delivered_double'` with
`sent_at` populated, also without contacting any provider. A naive `status IN ('DELIVERED',...)`
filter would be misled by either.

**8. Provider message IDs stored where?** `email_events.provider_message_id` (base schema),
`report_delivery_authorizations`/`report_delivery_finalizations.provider_message_id`,
`email_provider_events.provider_message_id`. All wired into the dormant chain; never populated
by the live path.

**9. Acceptance vs. delivery distinguished?** Yes, in the dormant model only:
`report_delivery_authorizations.status` distinguishes `dispatching` (API request in flight) from
`finalized` (confirmed, `report_delivery_finalizations` row written) — `delivery-dispatch.ts:75-119`.
The live table has no such distinction at all.

**10-12. Webhook, signature verification, replay protection?** All confirmed present and
functional: `src/app/score/api/webhooks/resend/route.ts` (114 lines, read in full) rate-limits,
reads a size-capped raw body, verifies via HMAC-SHA256 over `${id}.${timestamp}.${payload}`
using the decoded `RESEND_WEBHOOK_SECRET` (`resend-webhook.ts:140-176`), constant-time compared
(`crypto.timingSafeEqual`), against the exact bytes Resend signed (manual streaming, never
`request.json()` first). Replay protection at two layers: a ±300s HMAC timestamp window
(`resend-webhook.ts:154-156`) plus a DB-level `unique(provider, provider_event_id)` constraint
(`0017:216`).

**13. Bounce/complaint handling?** Phase14-only: `report_delivery_remediations` models
bounce-retry with mandatory evidence (`remediation_type` CHECK `= 'bounce_retry'` only,
`0017:3119`); complaints are explicitly non-retriable by omission, per the migration's own
comment. `resend-webhook.ts:178-189` maps `email.bounced`/`email.complained` event types. None
reachable from the live path.

**14. Email-template system?** `email_templates` table exists (`0001:464-473`) but zero
INSERT/SELECT anywhere in application code — schema-only, unpopulated. No React
Email/MJML/templating package in `package.json`. The only working "template" logic is inline
string-building in `report-delivery-service-core.ts:83-92` (`messageCopy()`), itself only
reachable via the dormant chain.

**15. Sender/support addresses configured?** Env var names actually referenced in code:
`RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET`, `MK_REPORT_EMAIL_FROM`, `MK_REPORT_EMAIL_REPLY_TO`,
`MK_INTERNAL_LEADS_EMAIL`, `MK_INTERNAL_NOTIFICATIONS_EMAIL`. **None of these appear in
`.env.example`** — it instead defines `RESEND_API_KEY`, `MK_ADMIN_EMAIL`, `MK_FROM_EMAIL`, of
which the latter two are referenced nowhere in `src` — the checked-in env template is stale
relative to the actual code. Hardcoded fallback sender in code:
`MK Fraud Insights <hello@mkfraud.co.za>` (only used if env vars are unset, on the dormant path).

**16. Existing secure customer-facing access route?** Confirmed still absent — all 39 route
files under `src/app/score/api` enumerated; the only signed-access routes are
`admin/reports/[reportId]/{download,preview}`, both requiring an admin session.

**17. Signed storage URLs ever returned directly to a customer?** No. Exactly one call site of
`createSignedUrl` in the entire repo (`phase1-report-access.ts:212-214`), reachable only from
the two admin routes above.

**18-19. Revocation / reissue of an existing link?** Revocation exists only in the dormant model
(`report_delivery_authorizations.status` includes `'revoked'`, plus `revoked_reason`). The live
admin path's only "revocation" is its 60-second TTL. Reissue is trivial for the admin path
(re-call the function, no regeneration needed) — no customer-facing equivalent exists.

**20-21. Version binding / superseded-report access?** No customer token exists to bind (moot),
but the underlying eligibility logic is already version-aware and already excludes
superseded/voided/draft unconditionally, before any purpose-specific check
(`report-access-eligibility.ts:52,81-85`, `resolveCurrentReportId` at `:110-123` filtering by
`version_number desc` excluding those statuses). Both the admin path and the dormant Phase14
path already call this. There is no gap to close here — the enforcement already exists and is
already reused correctly by the one live caller.

**22-23. Access auditing, storage-path leakage?** Auditing: yes, admin path only, fan-out into
`report_events`+`order_events`+`audit_logs` on every attempt (success or failure) via
`recordAccess()` (`phase1-report-access.ts:44-105`) — and if the audit write itself fails on a
successful access, the function throws rather than releasing the link. No raw storage path
leakage: the function's return value is `{url, expiresInSeconds, reportReference,
technicalReference}` only; the raw path is used server-side and never serialized anywhere.

**24. Customer authentication available?** None. `auth.users` backs admin accounts only
(`admin_profiles.id references auth.users(id)`); `middleware.ts` gates only `/admin/*`.
Customers have stateless, hashed, TTL-bound **assessment** tokens
(`src/lib/respondent/tokens.ts:14-28`) for resuming an in-progress assessment — structurally
unrelated to, and not currently reused by, any report-access mechanism.

**25. Smallest set of new database objects required?** **At most one new narrow table, for the
customer access token itself — everything else is extend-or-repair of infrastructure that
already exists, is already migrated, and in several cases is fully implemented and merely
disconnected.** Sending/tracking: extend `email_events`, reuse `resend-transport.ts` and the
webhook route unchanged. Delivery state machine: repair the wiring to
`report_delivery_authorizations`/`finalizations`; retire `manual_report_delivery_attempts` as
the live backing table since its CHECK constraint structurally forbids a real send. Bounce/
complaint: reuse `report_delivery_remediations` unchanged. Templates: judgment call, not a
schema gap. Customer access: build one new token construct following the exact hash/TTL pattern
already proven in `src/lib/respondent/tokens.ts`, issuing/validating through the *existing*
`resolveCurrentReportId` + `assertReportAccessEligible('customer_download')` +
`createSignedUrl`-style flow — this is the one place a genuinely new database object is
justified.

## Additional finding beyond the 25 questions: the `released` status gap

Independently verified (not part of the agent's original 25 questions, found while confirming
the `customer_download` purpose): `reports.status = 'released'` is set in exactly three places,
all inside `0017_phase14_canonical_disabled_foundation.sql` (lines 1989, 3663, 6314) — i.e. only
by the dormant chain. Neither `complete_manual_report_generation` (live, sets `status='generated'`)
nor Release B's `approve_quality_review()` (only updates
`manual_report_generation_attempts.status`, never touches `reports.status`) ever produces a
`released` report. **A customer-access route built directly on the existing eligibility gate
would correctly and safely reject every request today — not because the gate is broken, but
because nothing live ever satisfies it.** Release C's design must decide, deliberately, where in
the new delivery flow `reports.status` transitions to `released` (see
`15-email-and-secure-delivery-design.md`).

## Audit gate outcome

**No new notification-events table, delivery-attempt table, audit table, or report-access log is
justified — the audit proves the existing structures (`email_events`, `email_provider_events`,
`report_delivery_authorizations`/`finalizations`/`remediations`) already safely support the
required state and are simply disconnected from a live caller.** The one exception, per Q25, is
a narrow customer-access-token construct, which has no existing equivalent to extend (the admin
path's 60-second signed URL is not customer-holdable) and must be new. See the design doc for
the full minimum-change plan, including the `released`-status wiring decision.

## Addendum — closure cycle findings

This audit predates Release C's own end-of-cycle self-review, which found three additional gaps
in the implementation this audit's conclusions led to (not gaps in the audit's own reasoning
above, which held up): missing-recipient handling was log-only rather than visible/correctable,
bounce/complaint outcomes updated `email_events.status` but created no owned admin exception, and
`apply_email_provider_event_atomic()`'s ordering-rank check didn't recognise Release C's own
status vocabulary. All three are additive fixes in
`supabase/migrations/20260724180000_release_c_closure_delivery_exceptions.sql` — see
`15-email-and-secure-delivery-design.md`'s "Closure cycle addendum" for the reasoning behind each,
and `09-release-evidence.md` for live-test evidence. This audit's own gate outcome above — reuse
existing structures, one new table for tokens — was not revisited and still holds; the closure
fixes extend the same RPCs this audit already found, they don't introduce new tables.
