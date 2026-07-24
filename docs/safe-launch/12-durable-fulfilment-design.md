# Release B — Durable Fulfilment: Recommended Minimum-Change Design

Follows directly from `docs/safe-launch/11-release-b-existing-infrastructure-audit.md`. Read that
first — this document only justifies the design in terms of what it reuses/repairs vs. what is
genuinely new.

## What is reused unchanged

- `record_payment_transition` RPC (`0024...sql`) — the payment state-machine transition itself.
  Not rewritten; Release B adds one new statement to its body (see below).
- `complete_manual_report_generation` RPC (`20260721150808...sql`) — the atomic
  generate→verify→supersede commit. Called by the worker exactly as the synchronous admin path
  calls it today. **No renderer changes, no V7 quality-gate changes.**
- `generateManualPhase1Report()` / `render-pdf.ts` / `verifyPrivateObject()` — the actual PDF
  generation, storage upload, and checksum-verification logic. The worker imports and calls these
  functions directly; it does not reimplement rendering.
- `manual_report_generation_attempts` — extended (new columns, new allowed status values), not
  replaced.
- The `CRON_SECRET` Bearer-token auth pattern from `internal/phase14-storage-cleanup/route.ts`.
- The `phase14_storage_cleanup_queue` claim/backoff SQL pattern (`for update skip locked`,
  exponential backoff formula) — copied as the model for the new claim RPC, not the table itself.
- Admin role/capability helpers (`canManageFinance`, `requireAdmin`, `current_admin_role()`).

## What is repaired

- **Admin generate/retry UI** (`FulfilmentActions.tsx`, `generate-report/route.ts`): changes from
  "submit and block on one long fetch" to "submit, then poll a status endpoint." The underlying
  idempotency key and role-check logic do not change.
- **The Q6 atomicity gap**: today, `record_payment_transition` commits, and
  `claim_payment_report_generation` is called moments later as a separate round-trip. Release B
  closes this by having `record_payment_transition` itself insert the queued fulfilment row (see
  "Payment transaction boundary" below), so a committed payment and a queued job are guaranteed
  to exist together or not at all.

## What is genuinely new

1. One migration adding: lease/heartbeat/backoff columns to `manual_report_generation_attempts`;
   new allowed `status` values (additive only — the 5 existing values are untouched); quality-review
   columns; a `regenerated_from_attempt_id` self-reference for controlled regeneration; five new
   `security definer` RPCs (claim, heartbeat/complete-stage reuse of the existing RPC, fail,
   recover-expired-leases, submit/approve/reject quality review, admin retry/recover).
2. One new internal worker route (`/score/api/internal/fulfilment-worker`), Bearer-token
   authenticated like the existing storage-cleanup route, that claims one job, runs the existing
   generation function, and reports success/failure back through the new RPCs.
3. One new admin quality-review surface (extends the existing order-detail admin page rather than
   a new dashboard) exposing preview/approve/reject.
4. A `vercel.json` cron entry pointing at the worker route.

## Why this does not need an external paid queue

`manual_report_generation_attempts` already has everything a simple durable queue needs except
lease/heartbeat and scheduled retry — both of which have a proven, already-shipped reference
implementation in this same codebase (`phase14_storage_cleanup_queue`'s `for update skip locked`
claim + exponential-backoff pattern) to copy. Order volume for this product (18 real paid orders
to date, low-tens-per-week realistic near-term rate) does not approach a scale where Postgres
row-level locking and a polling worker become a bottleneck. An external queue (SQS, Redis, etc.)
would add a new paid dependency, a new failure domain, and a new credential surface to secure, to
solve a concurrency problem this table can already solve with one migration.

## State machine

Mapped onto `manual_report_generation_attempts.status`, extending (not replacing) the 5 existing
values. `PAYMENT_VERIFIED` is not a new attempt-row state — it is the pre-existing
`orders.status = 'payment_received'`, upstream of this table.

| Target state (brief) | Implementation | New or existing? |
|---|---|---|
| `PAYMENT_VERIFIED` | `orders.status = 'payment_received'` (via `record_payment_transition`) | existing |
| `FULFILMENT_QUEUED` | `manual_report_generation_attempts.status = 'REPORT_QUEUED'` | existing value, new meaning (now also payment-triggered, not only admin-triggered) |
| `GENERATING` | `status = 'REPORT_GENERATING'` | existing |
| `REPORT_VERIFIED` | `status = 'REPORT_READY'` (already only reached after checksum verification in `complete_manual_report_generation`) | existing |
| `AWAITING_QUALITY_REVIEW` | `status = 'AWAITING_QUALITY_REVIEW'` (new) | **new** |
| `DELIVERY_QUEUED` | `status = 'DELIVERY_QUEUED'` (new) — the durable handoff point Release C picks up from; Release B does not send real email | **new** |
| `RETRY_SCHEDULED` | `status = 'RETRY_SCHEDULED'` (new), with `next_attempt_at` set via exponential backoff | **new** |
| `MANUAL_REVIEW_REQUIRED` | `status = 'MANUAL_REVIEW_REQUIRED'` (new) — bounded-retry exhaustion, needs a human, distinct from the existing `GENERATION_FAILED` | **new** |
| `FAILED_TERMINAL` | `status = 'GENERATION_FAILED'` (existing) reused for the hard-terminal case (e.g. permanently invalid input) | existing |

Why `AWAITING_QUALITY_REVIEW` is mandatory, not optional: the audit (§15/16) found explicit
customer-facing copy ("subject to MK quality review before release," "reviewed by MK before
release") shown before payment, with **no** existing database enforcement — only a procedural
role-gate on the send-email action. Release B formalises the existing human-in-the-loop step into
a DB-recorded state rather than removing or bypassing it, per the brief's explicit instruction.

## Payment transaction boundary

`record_payment_transition` (`0024...sql`) is extended with one additional statement in its
existing transaction body: after the order/payment state transition succeeds and before the
function returns, it inserts one row into `manual_report_generation_attempts` with
`status = 'REPORT_QUEUED'`, `trigger_source = 'payment_confirmed'`, and a `request_key` derived
deterministically from the order id and payment idempotency key (so a retried/duplicate payment
confirmation cannot create a second queued job — protected by the existing `request_key unique`
constraint plus an `on conflict do nothing`). This makes "payment committed" and "job queued"
atomic: if the insert fails for a reason other than the expected conflict, the whole function
raises and the payment transition rolls back with it, per the requirement that a job-creation
failure must not leave the payment looking successfully queued.

## Durable workflow boundary

The boundary between "synchronous admin request" and "durable worker" is exactly the same
function call it is today (`generateManualPhase1Report()`), just invoked from a different caller.
Today: `payment-service.ts` awaits it inline. After Release B: the worker route claims a job and
awaits it inline **within the worker's own request**, not the customer/admin-facing payment
request. The payment-confirmation HTTP response returns as soon as `record_payment_transition`
returns — it does not wait for the queued row to be claimed or processed.

## Worker execution model

An authenticated internal route (`Authorization: Bearer $CRON_SECRET`, same pattern as the
existing storage-cleanup route), invoked by a Vercel Cron entry. On each invocation it:
1. Calls the new `claim_next_fulfilment_job()` RPC (`for update skip locked`, mirroring
   `claim_phase14_storage_cleanup_jobs`), which atomically picks one eligible row
   (`status in ('REPORT_QUEUED','RETRY_SCHEDULED')` and `next_attempt_at is null or <= now()`),
   sets `lease_owner`/`lease_expires_at`/`heartbeat_at`, and moves it to `REPORT_GENERATING`.
2. If nothing is claimed, returns immediately (idle poll).
3. If a job is claimed, calls the existing `generateManualPhase1Report()` exactly as the
   synchronous path does, then calls the existing `complete_manual_report_generation` RPC on
   success (which sets `REPORT_READY`), followed by the new `submit_for_quality_review()` RPC
   (moves to `AWAITING_QUALITY_REVIEW`).
4. On failure, calls the new `fail_fulfilment_job()` RPC, which decides `RETRY_SCHEDULED` (with
   backoff, `retry_count < max_attempts`) vs `MANUAL_REVIEW_REQUIRED` (bounded-retry exhaustion),
   records `error_category`/`safe_operational_error`/`technical_reference`, and releases the
   lease.

## Worker trigger model

Three distinct trigger tiers, not interchangeable, not to be conflated in any status report:

1. **Production normal path.** A sub-daily Vercel Cron entry on an approved commercial Vercel
   plan invokes the authenticated worker route automatically at the certified pickup interval.
   This is the only tier that is acceptable as the *principal* mechanism for a paid customer's
   report to begin generating. **Not yet available** — see "Vercel plan launch gate" below.
2. **Operational recovery.** An authorised admin clicks "Process queue now" (or equivalent) to
   invoke the worker route on demand for a specific stuck situation. This exists today and works
   (used directly by this cycle's live SQL/integration testing), but it is a human-triggered
   exception-handling action, not a substitute for tier 1. It must never be described as the
   intended normal fulfilment path for paid orders.
3. **Reconciliation fallback.** A scheduled recovery sweep (`recover_expired_fulfilment_leases()`,
   already implemented and live-tested this cycle) identifies queued or stuck work that tier 1
   did not process in time, and requeues it. This is a safety net for missed/failed automatic
   pickups, not a delivery-speed mechanism in its own right.

## Cron schedule status — three separate claims, not one

These are three different questions with three different, independently-verified answers. Do
not collapse them into a single "it works" statement anywhere this design is referenced.

**Deployment compatibility (verified this cycle).** `vercel.json`'s cron entry currently reads
`0 3 * * *` (once daily). This is the only schedule shape the project's current Vercel plan
(confirmed Hobby tier, by a real deployment failure on `*/5 * * * *`: *"Hobby accounts are
limited to daily cron jobs"*) accepts without rejecting the deployment. **This schedule is a
temporary, development-compatible recovery schedule chosen only to keep PR #42 deployable — it
is explicitly not the approved production schedule.** The certified production interval is
every one to two minutes, subject to final performance testing (see "Measuring worker runtime"
below) — do not switch to that schedule before the Vercel plan is upgraded, since it would
immediately fail deployment again on the current plan.

**Operational readiness (not met on the current plan).** A once-daily worker is not acceptable
as the principal trigger for a paid report journey: a newly verified payment could sit queued
for up to ~24 hours before automatic processing begins. This is unrelated to whether the code
is correct — the durable fulfilment mechanism itself (claim, lease, retry, recovery) is fully
implemented and live-tested; only the *frequency* at which production would invoke it is
inadequate on Hobby.

**Preview limitations (a scope boundary on today's evidence, not a pass).** Vercel Cron Jobs
execute only against **production** deployments, never preview deployments. PR #42's preview
build succeeding proves the application deploys and the route compiles/exists — it does **not**
prove the cron actually invokes the worker on any schedule, daily or otherwise. That remains
genuinely untested and is recorded as `NOT VERIFIED`, not folded into the deployment-success
result.

## Vercel plan launch gate

**New formal launch gate, not yet satisfied:** the production MK Vercel project must be on a
plan approved for commercial operation, capable of running the fulfilment worker at the
certified sub-daily interval (one to two minutes, pending performance testing). The current
Hobby plan blocks unrestricted production launch on this basis alone, independent of any code
readiness. This is an **operating-cost decision**, not a Release B development resource:
- not upgraded this cycle, and not to be upgraded without explicit authorisation;
- requires the authorised MK owner to approve the recurring cost;
- must happen immediately before the integrated release-candidate production-certification
  cycle, not during ordinary Release B/C/D development;
- tracked here and in the release evidence pack (`09-release-evidence.md`), not silently assumed.

## Idempotency strategy

- Payment→job creation: `request_key` derived from `(order_id, payment idempotency key)`,
  `unique` constraint, `on conflict do nothing` — duplicate payment confirmations cannot create a
  second job.
- Worker claim: `for update skip locked` inside a single RPC transaction — two workers can never
  claim the same row.
- Generation completion: unchanged from today — `reports_one_current_assessment_type_uidx`
  already prevents two "current" reports for the same order/type.
- Admin-triggered actions (retry, recover, approve, reject): each takes an explicit
  `p_attempt_id` and is a no-op (returns the current state, does not re-mutate) if the row is
  already past the state the action targets — so a double-click or a retried admin request cannot
  double-apply.

## Retry strategy

Exponential backoff mirroring `phase14_storage_cleanup_queue`'s existing, already-audited
formula: `next_attempt_at = now() + make_interval(secs => least(3600, 30 * (2 ^
least(retry_count, 7))::integer))`. Default `max_attempts = 5` (configurable per row, not
hardcoded, so an admin override is possible without a code change). After `max_attempts` is
reached, the job moves to `MANUAL_REVIEW_REQUIRED`, not silently to `FAILED_TERMINAL` — a human
must decide.

## Failure states

`RETRY_SCHEDULED` (transient, will retry automatically), `MANUAL_REVIEW_REQUIRED` (bounded
retries exhausted, needs a human decision), `GENERATION_FAILED`/`FAILED_TERMINAL` (used for the
existing hard-terminal admin-triggered case — Release B does not repurpose this for the new
automatic path's exhaustion, to avoid confusing the two).

## Admin recovery

Extends the existing order-detail admin page (not a new dashboard), per the brief. New actions,
all as `security definer` RPCs, all audited via `audit_logs`, all admin-role-gated
(`platform_admin`/`finance_admin` for recovery, `platform_admin`/`reviewer`/`approver` for
quality review):
- `retry_fulfilment_job` — moves `MANUAL_REVIEW_REQUIRED`/`GENERATION_FAILED` back to
  `REPORT_QUEUED`, resets `retry_count`.
- `recover_expired_fulfilment_lease` — force-expires a specific stuck `REPORT_GENERATING` row
  (admin-triggered version of the same logic the automatic `recover_expired_fulfilment_leases()`
  sweep performs) and requeues it.
- `approve_quality_review` / `reject_quality_review` — see state machine above; reject creates a
  new linked attempt row (`regenerated_from_attempt_id`) rather than mutating history.

No recovery action requires direct SQL editing.

## Audit events

Every new RPC writes to the existing `audit_logs` table (`entity_table =
'manual_report_generation_attempts'`, action names: `fulfilment_job_claimed`,
`fulfilment_job_failed`, `fulfilment_lease_recovered`, `fulfilment_job_retried`,
`quality_review_submitted`, `quality_review_approved`, `quality_review_rejected`) — the same
table and pattern Release A's `classify_backlog_order()` already uses, not a new audit
mechanism.

## Security controls

- Worker route: Bearer-token (`CRON_SECRET`), same pattern as the existing (currently unreachable)
  storage-cleanup route.
- All new RPCs are `security definer`, revoke-all-then-explicit-grant, matching the Phase 14
  governance pattern audited in §4b of `00-current-state.md`.
- Admin-facing RPCs re-check role inside the function body (defence in depth), not only at the
  route layer.
- Customer-safe error messages (`safe_operational_error`) are stored separately from
  `technical_reference`, matching the existing column split already in
  `manual_report_generation_attempts` — no new customer-facing error-message design needed.

## Expected Vercel execution path

`payment confirmation (admin browser) → POST /score/admin/orders/[ref]/status → record_payment_transition (extended) → HTTP response returns immediately`, fully decoupled from:
`Vercel Cron (production-only, sub-daily once the plan gate is satisfied) → GET /score/api/internal/fulfilment-worker (Bearer CRON_SECRET) → claim_next_fulfilment_job() → generateManualPhase1Report() → complete_manual_report_generation() → submit_for_quality_review() → (admin) approve/reject → DELIVERY_QUEUED`.

## Measuring worker runtime (integrated release-candidate cycle, not this cycle)

Not performed in Release B — recorded here as a required, scoped follow-up for the integrated
release-candidate cycle, before any production function-limit or cron-interval decision is
finalised. The RC cycle must measure real worker execution time for: a normal report, a
materially weak report, a regeneration, a quality-gate failure, and a storage failure — each
broken down into total invocation duration, PDF rendering duration, storage duration,
verification duration, memory use where available, and timeout outcome. Do not assume that
upgrading the cron frequency alone solves function-runtime limits — if report generation cannot
reliably complete within the selected production function's duration limit, that boundary must
be redesigned before production, not worked around. Do not add a paid background/queue service
pre-emptively to avoid this measurement — see "Why this does not need an external paid queue"
above; that reasoning does not change based on runtime numbers not yet collected.

## Why no other scheduler or orchestration platform is added here

Explicitly out of scope for Release B, and not implicitly reopened by the cron-plan finding
above: an external cron provider, Redis, Upstash, QStash, a new queue service, Vercel Queues,
Vercel Workflow (the existing dormant DevKit integration, per the Release B0 audit) as a new
primary orchestrator, another hosted worker, or a second Vercel project. The Hobby-plan cron
limitation is a *scheduling frequency* problem, not evidence that the Postgres-backed claim/
lease/retry design itself is insufficient — that design already supplies durable database
state, atomic payment-and-job creation, exclusive claims, leases, retries, expired-lease
recovery, a manual-review state, admin recovery, quality review, and the delivery-queue
handoff. Adding a second orchestration system to work around a plan-tier limit would duplicate
that already-working design and introduce a new dependency, credential set, cost surface, and
recovery model for no corresponding benefit. The correct fix for the frequency problem is the
Vercel plan launch gate above, not a new system.
