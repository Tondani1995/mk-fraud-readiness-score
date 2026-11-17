# Production observability runbook

This runbook covers the bounded MK Fraud Readiness monitoring foundation. It is read-only with
respect to customer business data except for the signed monitoring journey described below.

## Revised production handover (17 November 2026)

The revised assessment went live on 15 November 2026. Its public canonical is `/fraud-readiness`,
`/score/start` redirects to `/review`, and both prior scored-start APIs return 410.
The current synthetic creation endpoint is signed `POST /review/api/sessions`, returning 201 with
`ok: true` and `synthetic: true`. It creates only a fictional session and returns no role links.

Checkly's existing Customer Journey and Signed Readiness checks were updated at cutover, but the
Customer Journey currently fails because it seeks a button named `Start the review`. The production
button is `Start the assessment`. Fix the existing Playwright locator and run the check; do not create
a duplicate monitor or change customer copy to satisfy an outdated script.

GA4 property 552214282 (`G-LRTK98KGB8`) remains attached to consented public website activity.
Private `/review/s/<token>` pages deliberately disable browser analytics. Do not transmit private
role links, answers, or session identifiers to GA4. The admin monitor presents actual revised
database activity through `public.review_monitor_funnel` separately from historic scored
`assessment_events`. The aggregate RPC is service-role-only and excludes fictional sessions.
Missing RPC/data is *unavailable*, never reported as zero.

The sitemap is `https://www.mkfraud.co.za/sitemap.xml`, and `/review` is noindex/nofollow.
Do not list private review links, admin, order, or download pages in the sitemap.

While the revised release is active, the scored-start SHA pin is retired. The production
readiness check instead verifies the revised mode, database bridge, and AI generation campaign.
A monitor DB HTTP 401 is a credential/environment failure: check the production Supabase
connection using authorised secret-management controls. Never log or paste credentials.

Legacy alarm/funnel metrics based on `assessment_events` remain available for historical diagnosis
and must not be mistaken for revised-customer starts or completions. The current aggregate
records starts, answer activity, paid bindings and orders separately; it does not infer
unobservable Snapshot views or completion counts.

## Historical monitoring contract and operating procedures

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
