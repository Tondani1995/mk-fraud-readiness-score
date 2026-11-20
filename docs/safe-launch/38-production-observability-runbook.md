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

## Reconciliation (20 November 2026)

This section supersedes the open items above.

**Checkly.** The Customer Journey check's locator now reads `Start the assessment`. The rest of the
script was already current: `/score/start` redirects to `/review`, and the signed
`POST /review/api/sessions` expects 201 with `ok: true` and `synthetic: true`. A test run and a
scheduled run both passed. The check had failed on every run from 15 to 20 November. Its cadence
(every 3 hours), location (Frankfurt), alerting and budget are unchanged, and no monitor was added.

**Monitor 401s are not a credential failure.** About 1 in 100 requests made with the project's secret
key (`sb_secret_…`) is refused by PostgREST with 401 `PGRST303` (token validation), at random across
tables. The same key succeeds on the next request. In the 7 days to 20 November this failed 133
monitor reads and writes and 5 hourly stalled-lead runs. The refusal happens before the query
runs, so the monitor transport (`src/lib/monitoring/database.ts`) retries once on exactly this error,
for any method. Any other 401 is still returned at once. Supabase's edge logs show the code in
`response.headers.proxy_status`.

**Revised funnel, version 2.** `public.review_monitor_funnel_v2` is additive, service-role-only and
aggregate-only, and version 1 is unchanged. It counts revised customer figures:
- sessions started, answers and corrections, interviews completed and Snapshot write-ups (AI or data);
- assessments bound for a report, orders recorded, orders awaiting payment and payments received;
- reports generated, paid orders without a report, and report AI calls that did not succeed.

Fictional and synthetic sessions are excluded. MK's own check sessions (a contact on mkfraud.co.za)
are counted separately. Version 1's `paidOrdersRecorded` counted unpaid orders. Report delivery for
revised reports is manual (DR-13) and leaves no record, so it is shown as *not recorded*, never zero.
The production monitor records the figures on its heartbeat (`revised_funnel_24h`) every cycle, and
`/score/admin/monitoring` shows them. The legacy event funnel is unchanged and shown separately.
Figures from 15 to 20 November, checked directly against the tables:
- **Customers:** 4 sessions, 414 answers, 2 completed interviews, 3 assessments bound, 4 orders
  (3 paid, 1 awaiting payment), 3 reports generated, none paid without a report.
- **MK internal checks:** 6 sessions.

**Fulfilment alerts.**
- `fulfilment:notification_queue_stalled` (P2) was held open by one internal notice recorded on
  22 October with `provider_mode = 'disabled'`. Preview shares this database, so disabled-mode rows
  are no longer counted as stalled sends.
- `fulfilment:paid_order_without_report` (P1) is genuine by the data. Legacy order
  `MKORD-2026-991EE981` (Essential, paid 31 August) has no report and is not marked synthetic. The
  owner decides whether it is owed a report or was a test; the monitor must not be changed to hide it.

**GA4.**
- Measurement ID `G-LRTK98KGB8` is unchanged. Collection was verified on 20 November.
- `order_recorded` (tier, value, currency) and `advisory_enquiry_submitted` (source) are now key
  events, alongside `service_enquiry_submitted`. `fraud_readiness_start` and
  `fraud_readiness_completed` belong to the previous scored assessment and have had no data since
  15 November; they stay marked for history.
- The `/fraud-readiness` start buttons send consent-gated `cta_click` (`cta_name`, `placement` only).
- The URL sanitiser drops `ref` and replaces MK reference path segments (`MKFRS-…`, `MKORD-…`) with
  `[redacted]`.
- Revised starts and completions are counted only in the first-party database; `/review` keeps
  analytics disabled.
- On 19 November one client sent 99,752 `/terms-of-use` page views in about 2½ minutes, with no key
  events. Nothing on the site rewrites that page's address; treat it as automated traffic and
  exclude that day when reading page-view trends.

**Search.**
- `sitemap.xml` returns 200 with 24 public URLs and none under `/review`, role links, report access
  or admin. Search Console last read it on 17 November (Success, 24 discovered), so it was not
  resubmitted.
- `robots.txt` disallows `/admin`, `/login`, `/score` and `/api`.
- `/fraud-readiness` is indexable with a self-canonical. `/review` is `noindex, nofollow`.
  `/fraud-readiness-score` is `noindex` with its canonical on `/fraud-readiness`.
- Coverage: 12 pages indexed; 18 not indexed (redirects, robots, and discovered or crawled but not
  yet indexed). No errors.

**Sentry and Vercel.**
- The production browser bundle reports to Sentry's EU ingest with environment `production`.
  Checking server-side capture and alert routing needs a Sentry sign-in.
- Production functions run in `dub1` beside the database (eu-west-1).
- The monitor heartbeat records the running commit, and was healthy at 05:30 UTC on 20 November.

**Known contract drift.** `scripts/rc1-service-role-privilege-contract-analysis.mjs` already failed
on `main`. Five tables read or written with the service key are not in the manifest
(`production_monitor_heartbeats`, `production_monitor_events`, `production_monitor_drift_checks`,
`production_monitor_notifications`, `synthetic_report_generation_records`), and neither is at least
one revised RPC (`review_commercial_bridge_enabled`). Registering them needs a privilege review with
the production grants. It is a separate task, not part of this reconciliation.

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
