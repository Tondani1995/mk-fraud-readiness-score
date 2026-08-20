# Release B — Durable Fulfilment Runbook

For an authorised MK operator (`platform_admin`/`finance_admin` for recovery actions,
`platform_admin`/`reviewer`/`approver` for quality review) working with the durable
payment-to-fulfilment workflow on an order's admin detail page
(`/score/admin/orders/{orderReference}`). No step below requires direct SQL editing.

**Current operational status — read before relying on automatic pickup.** The production cron
trigger is not yet operating at a commercially acceptable frequency: `vercel.json` currently
runs the worker once daily (`0 3 * * *`), a temporary schedule chosen only because this
project's Vercel plan (confirmed Hobby tier) rejects anything more frequent. A newly verified
payment can sit queued for up to ~24 hours before the automatic worker picks it up. Until the
Vercel plan launch gate (`docs/safe-launch/12-durable-fulfilment-design.md`) is satisfied,
**"Process queue now" is not just a convenience — it is the practical way paid orders get
processed promptly**, and operators should expect to use it, not treat automatic cron as
sufficient on its own.

## Identify the workflow for an order

Open the order's admin page. The "Fulfilment status" card shows the current
`manual_report_generation_attempts` row: generation state, latest attempt id, retry count, and
(via the new Fulfilment Review panel beneath it) the durable-fulfilment stage when the order is
past the synchronous admin-generate flow: `AWAITING_QUALITY_REVIEW`, `RETRY_SCHEDULED`,
`MANUAL_REVIEW_REQUIRED`, or `DELIVERY_QUEUED`.

## Inspect payment state

"Payment state" on the same card reflects `orders.status` / `payment_automation_records.state`.
A payment that reached `PAID` always has a corresponding fulfilment job — if you see a paid
order with no attempt row at all, that is the one situation this design treats as a hard
failure (the payment transaction itself would have rolled back rather than leave that gap); it
should not be reachable in practice, but if observed, treat it as a P1 and escalate rather than
manually inserting a row.

## Inspect claim/lease state

While a job is `REPORT_GENERATING`, the Fulfilment Review panel shows whether the worker's
lease is still active (with its expiry time) or has expired. A lease is normally held for 5
minutes per attempt (`DEFAULT_LEASE_SECONDS` in the worker route) — if generation is taking
longer than that, the lease will simply expire and the automatic recovery sweep
(`recover_expired_fulfilment_leases()`) picks it up on the worker's next run without any manual
action.

## Recover an expired/stuck job

If a job has been `REPORT_GENERATING` for well past its lease expiry and you don't want to wait
for the next scheduled worker run, click **Recover Stuck Job**. This calls
`recover_fulfilment_job()`, which requires the row to currently be `REPORT_GENERATING`, moves it
to `RETRY_SCHEDULED` with `next_attempt_at = now()`, and clears the lease so the next worker run
picks it up immediately. Audited as `fulfilment_job_admin_recovered`.

## Retry generation after a failure

A job that has exhausted its automatic retries (`retry_count >= max_attempts`, default 5) moves
to `MANUAL_REVIEW_REQUIRED` and shows a **Retry Generation** button. This calls
`retry_fulfilment_job()`, which requires the row to be `MANUAL_REVIEW_REQUIRED` or
`GENERATION_FAILED`, resets `retry_count` to 0, and requeues it. Calling this on a job in any
other state (e.g. one that's still actively retrying) is rejected with
`fulfilment_retry_invalid_state`, not silently ignored — if you see that error, the job is
already progressing on its own; check its current status instead of retrying again.

## Inspect report verification

Once generation succeeds, the existing (unmodified) checksum/storage verification runs exactly
as it does for the synchronous admin-triggered path — see
`docs/safe-launch/01-backlog-reconciliation-runbook.md`'s sibling admin tooling for the
Preview/Download actions, which independently re-verify the stored PDF on every access. A
verified report reaching `REPORT_READY` is what allows `submit_for_quality_review()` to move it
to `AWAITING_QUALITY_REVIEW` — it cannot skip this precondition.

## Handle terminal failure

`MANUAL_REVIEW_REQUIRED` is not a dead end — it means "a human needs to look at this before it
retries again," not "this order can never be fulfilled." Check the safe operational error
message and technical reference shown on the order page, then either retry (above) or escalate
if the underlying cause needs a code/data fix first.

## Approve or reject quality review

When a job reaches `AWAITING_QUALITY_REVIEW`, the Fulfilment Review panel shows a reason field
and two buttons:
- **Approve for Delivery** — calls `approve_quality_review()` with your typed reason (minimum 5
  characters). Moves the job to `DELIVERY_QUEUED` and records your identity and timestamp. This
  is the durable handoff point Release C's real email delivery will pick up from — no email is
  sent yet in Release B.
- **Reject & Regenerate** — calls `reject_quality_review()` with your reason. Marks this attempt
  `GENERATION_FAILED` with your decision recorded, and automatically creates one new, linked
  (`regenerated_from_attempt_id`), freshly queued attempt for the same order — no separate
  action needed to trigger regeneration.

Both require your admin role to be `platform_admin`, `reviewer`, or `approver` — `finance_admin`
cannot approve or reject (it can, however, retry/recover, per the role split above).

## Stop the worker safely

The worker is invoked by the `vercel.json` cron entry, currently `0 3 * * *` (once daily). This
is a **temporary, development-compatible recovery schedule, not the approved production
schedule** — it exists only because this project's Vercel plan (confirmed Hobby tier) rejects
anything more frequent (a `*/5 * * * *` schedule failed deployment with exactly this error). The
certified production interval is one to two minutes, subject to final performance testing; do
not change to it before the Vercel plan is upgraded, or deployments will fail again. Note also
that Vercel Cron only executes against production deployments — a passing PR preview build
proves the route compiles and deploys, not that cron has ever actually invoked it. See
`docs/safe-launch/12-durable-fulfilment-design.md` ("Vercel plan launch gate", "Worker trigger
model") for the full picture: automatic cron is the intended *normal* path once the plan gate is
satisfied, but until then, the admin "Process queue now" action is the practical way paid orders
get processed promptly — treat it as such, not as an occasional convenience. To stop the worker
without a deploy: remove or comment out the `crons` entry in `vercel.json` and redeploy, or
disable the cron from the Vercel project dashboard. Jobs already `REPORT_QUEUED`/
`RETRY_SCHEDULED` simply wait — nothing is lost, and no in-flight generation is interrupted
mid-render by stopping future cron triggers (an
already-claimed job keeps running to completion within its own request).

## Resume the worker safely

Re-add/re-enable the cron entry and redeploy. On its first run after resuming, the worker
processes exactly one queued job per invocation (by design — see the design doc's "Worker
execution model"); queued/retry-scheduled work accumulated while stopped is processed over
subsequent invocations, oldest first (`claim_next_fulfilment_job()` orders by `requested_at
asc`). No manual reconciliation step is needed — the claim/lease mechanism is what makes this
safe to pause and resume at any time.
