# Production observability runbook

This runbook covers the bounded MK Fraud Readiness monitoring foundation. It is read-only with
respect to customer business data except for the signed monitoring journey described below.

## Normal operating contract

- Checkly remains on the verified Hobby allowance. The currently active external checks are the
  home page, `/score/start`, and `/fraud-readiness`.
- The signed readiness endpoint is `/score/api/internal/production-readiness`. It returns only
  `ok`, an overall status, a timestamp, and check names/statuses. It never returns secrets,
  customer data, assessment content, or configuration values.
- The signed monitor runner is
  `/score/api/internal/production-monitor`. It records the internal heartbeat, first-party
  incident events, the existing operational-alert ledger, and daily drift checks.
- Release binding is relative to the running deployment: in Production, validate
  `VERCEL_GIT_COMMIT_SHA` and compare it directly with the `customer_start` policy's
  `activation_sha`. Do not maintain a static `MK_EXPECTED_PRODUCTION_SHA`; the running release SHA
  is the only Production release truth. Preview may pin `MK_EXPECTED_ADAPTIVE_ACTIVATION_SHA` for a
  bounded branch contract.
- Monitoring assessments must use a run ID beginning with `core-`, `full-desktop-`, or
  `full-mobile-`, carry the signed synthetic header, and set `monitoring_synthetic=true`. These
  records are excluded from customer funnel metrics. Free Snapshot is the only AI-bearing step;
  paid reports, payment, fulfilment, and customer email are out of scope.
- `/score/admin/monitoring` is admin-only and read-only. It is the first-party view for readiness,
  heartbeat, funnel, synthetic, alert, drift, and budget state.

## Incident handling

1. Confirm whether the alert is Checkly, Sentry, or the first-party monitor, then record the safe
   alert key and deployment SHA. Do not copy customer fields, tokens, headers, or raw answers into
   incident notes.
2. Check the public route named by the alert and the signed readiness result. Review Vercel
   runtime logs for the same safe route/category and inspect the admin monitoring view.
3. For adaptive binding failures, stop any release promotion. Verify the READY Vercel deployment
   SHA and the `customer_start` activation SHA before considering a rebinding operation.
4. For database or Snapshot failures, do not change scoring, methodology, pricing, payment, or
   fulfilment to restore availability. Escalate with the safe reference and failure category.
5. Expect one initial incident email, no repeated email inside the four-hour cooldown, and one
   recovery email after the alert resolves. A missing or stale heartbeat is itself an incident.

## Preview certification

Failure injection is permitted only when `VERCEL_ENV=preview` and
`MK_MONITORING_FAILURE_INJECTION=enabled`. Use only the allowlisted query values:

- `adaptive_sha_mismatch`
- `database_failure`
- `public_route_failure`
- `stale_heartbeat`

For each Preview test, prove detection, initial notification, deduplication, recovery, and
recovery notification with a test mailbox. Never enable the injection flag in Production.

## Production cutover gate

Do not apply the cron migration or promote monitoring code until the owner/controller approves the
Preview evidence. On a later cutover, promote the exact accepted SHA, wait for a READY Production
deployment, confirm aliases, rebind `customer_start` to that exact READY SHA using the audited
activation path, read the policy back, run the signed Production smoke, and then verify the next
monitor heartbeat. The existing hourly stalled-lead scheduler remains unchanged until that gate is
passed.

## Budget guard

Keep the incremental monitoring budget below R100/month. Checkly, Sentry, GA4, Search Console,
Vercel, Supabase, and Resend must remain on existing/free allowances. Use actual persisted
`provider_cost_micros` for Snapshot AI cost; do not estimate a provider cost when accounting is
available. Stop and escalate if the projected AI monitoring cost exceeds R20/month or the overall
monitoring projection reaches R80/month.
