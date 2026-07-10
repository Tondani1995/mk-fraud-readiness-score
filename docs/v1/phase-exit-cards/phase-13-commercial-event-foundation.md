# Phase 13 Exit Card - Commercial Event Foundation

## Phase Result

Conditional Pass - migration and core runtime event paths are proven on current PR runtime, but internal notification queue/failure runtime evidence remains outstanding because the tested preview did not emit internal notification records without a configured internal recipient.

PR #17 must remain draft until the controller decides whether to configure `MK_INTERNAL_LEADS_EMAIL` / `MK_INTERNAL_NOTIFICATIONS_EMAIL` for a final notification UAT run or accept that notification delivery remains queue-only/future-provider work.

## Scope Delivered

This PR implements the foundation layer for Phase 13 commercial conversion and lead intelligence. It does not add customer-facing report options, the premium executive summary UI, payment gateways, proof upload, automated payment verification, automated report release, customer instant download, public benchmarks, peer averages, live AI-generated recommendations, respondent accounts, subscriptions or a client portal.

## Deployment Tested

Runtime UAT was run against the exact PR #17 preview deployment:

- PR: #17 - Phase 13 commercial event foundation
- Branch: `phase13/commercial-event-foundation`
- Runtime-tested commit: `b8b6fd3a3e5cb9e3139d978c415fb747c8c2c2f5`
- Vercel deployment: `dpl_8LUEQDoMaYLDP4i5Zn1rqFe3CkXr`
- Preview host: `mk-fraud-readiness-score-974bktvac-tondanis-projects.vercel.app`
- Deployment state: READY

This file was updated after runtime UAT to record evidence only.

## Database Migration

Applied to production Supabase project `jvjxlphdyzerrhwcgkup` during controlled runtime assurance:

- `supabase/migrations/0012_phase13_commercial_event_foundation.sql`
- `supabase/migrations/0013_phase13_event_index_cleanup.sql`

Migration evidence:

- `assessment_events` exists with nullable optional links to organisation, respondent, order, data request and report records.
- `assessment_events.dedupe_key` is unique and drives repeat counting through `event_count`.
- Indexes verified for assessment, organisation, respondent, order, data request, report, event type, option code, `created_at` and `last_seen_at`.
- RLS is enabled on `assessment_events`.
- `anon` and `authenticated` table grants are revoked for `assessment_events`; service-role/admin paths remain server-side.
- Migration is additive and does not mutate methodology, scoring, reports, orders or prior assessment outcomes.
- Cleanup migration removed the duplicate dedupe index and added the missing respondent FK index identified by advisors.

## Advisor Results

Supabase advisors were run after the production migration and cleanup migration.

Security advisor:

- No Phase 13 `assessment_events` security finding remained.
- Existing baseline findings remain outside this PR: `assessment_tokens` and `rate_limit_hits` RLS-without-policy info notices, `set_updated_at` mutable search path, `citext` in public, admin helper security-definer execute warnings, and leaked password protection disabled.

Performance advisor:

- Phase 13-introduced findings were resolved: missing `assessment_events.respondent_id` FK index and duplicate dedupe index.
- Remaining performance findings are existing project-wide index/policy lint items outside this migration scope.

## Event Taxonomy

Documented in:

- `docs/v1/phase13/phase13-commercial-event-taxonomy.md`

Supported event types:

- `assessment_started`
- `assessment_submitted`
- `snapshot_viewed`
- `executive_summary_viewed`
- `report_options_opened`
- `report_option_selected`
- `full_report_5000_selected`
- `personalised_report_50000_selected`
- `eft_order_created`
- `payment_marked_received`
- `report_generated`
- `admin_report_downloaded`
- `report_emailed_to_customer`
- `internal_notification_queued`
- `internal_notification_sent`
- `internal_notification_failed`

Only existing backend lifecycle events are wired in this PR. Future customer UI events are defined but not emitted yet.

## Runtime UAT Evidence

Fresh UAT journey:

- Organisation: `MK Phase13 Runtime UAT 20260710221644`
- Assessment: `MKFRS-2026-815B964C74`
- Order: `MKORD-2026-4U84FNMQ`
- Report: `RPT-MKFRS-2026-815B964C74-V1`

Runtime path completed:

- Created fresh assessment through the protected PR preview using the normal start API.
- Saved exposure profile plus one answer; autosave returned progress without error.
- Saved all 68 answers; progress reached 100%.
- Submitted assessment; scoring/snapshot path completed.
- Opened private snapshot on the exact PR preview host; snapshot rendered with expected MK Fraud Readiness content.
- Requested detailed report; order `MKORD-2026-4U84FNMQ` created in `awaiting_payment`.
- Repeated detailed-report request; same order was reused and no duplicate order was created.
- Admin opened order detail and marked payment received with a UAT note.
- Payment received did not auto-generate a report; report generation remained a separate admin action.
- Admin generated report version; report row and storage path were created.
- Admin requested report download; signed URL was issued and `admin_report_downloaded` was tracked.

Persisted `assessment_events` evidence:

- `assessment_started`: `event_count = 1`; organisation and respondent linked; metadata contains assessment reference/source/methodology version only.
- `assessment_submitted`: `event_count = 1`; organisation and respondent linked; metadata contains assessment reference and progress only.
- `snapshot_viewed`: `event_count = 1`; no token or secret metadata stored.
- `eft_order_created`: `event_count = 2`; repeated report request incremented count and reused the same order/data-request link.
- `payment_marked_received`: `event_count = 1`; order and data-request linked; no report link at payment stage.
- `report_generated`: `event_count = 1`; order and report linked.
- `admin_report_downloaded`: `event_count = 1`; order and report linked; metadata records report reference and signed URL TTL only, not the signed URL.

Report/audit evidence:

- Report row: `f7fcfd7a-3fdd-4b49-a599-8e35ad774bb4`
- Storage bucket/path: `generated-reports/MKFRS-2026-815B964C74/RPT-MKFRS-2026-815B964C74-V1.pdf`
- `report_events`: `generated` and `download_requested` rows were written.
- `download_requested` metadata records `signed_url_ttl_seconds = 300`.

## Dedupe and Metadata Checks

Confirmed:

- Repeated identical `eft_order_created` event did not create a second event row; `event_count` incremented to 2.
- Separate legitimate events were not collapsed into the same event row.
- Optional foreign-key fields remain nullable where expected.
- Event metadata did not include resume tokens, snapshot tokens, signed URLs, passwords or raw assessment secrets.
- Notification queue records, when present, are designed as queue records only and do not imply successful delivery.
- Existing assessment, order, report generation and admin download journeys still worked on the PR preview.

## Internal Notification Boundary

Internal notification helper:

- Uses `MK_INTERNAL_LEADS_EMAIL` or `MK_INTERNAL_NOTIFICATIONS_EMAIL` as the configured recipient.
- Writes queued records to `email_events` using deterministic dedupe keys.
- Returns `skipped_no_recipient` when no recipient is configured.
- Does not send email or invent provider delivery status.

Runtime finding:

- In the tested preview, no `internal_notification_queued` or `internal_notification_failed` event was observed for the UAT assessment.
- The `email_events` rows for the UAT assessment were only the existing respondent/customer placeholder queues: `resume_link_phase4_placeholder` and two `detailed_report_request_received` rows.
- This indicates the internal notification runtime path is not fully evidenced in the tested environment, most likely because no internal recipient env var is configured for the preview.

## Checks

GitHub Actions V1 Verification run #309 passed on PR #17 head `b8b6fd3a3e5cb9e3139d978c415fb747c8c2c2f5`.

Passed steps:

```text
Install dependencies
npm run phase7:test-snapshot
npm run phase8:test-admin
npm run methodology:copy-test
npm run phase9:test-orders
npm run phase10:test-report
npm run phase11:test-security
npm run phase13:test-events
npm run typecheck
npm run build
```

Local execution note:

- This workspace did not have an authenticated Git checkout for the private repository, so changes were applied through the GitHub connector.
- Full local npm checks were not run from a clean authenticated checkout in this environment.
- GitHub Actions is the code-level evidence path for the full check sequence.

## Remaining Risks

- Internal notification queue/failure runtime evidence is outstanding on the tested preview.
- Production/preview internal notification recipient configuration must be confirmed before claiming `internal_notification_queued` runtime pass.
- There is no approved sender/provider in this PR; notification delivery remains intentionally queued-only.
- Admin analytics views/drop-off dashboards are not part of this PR.
- Customer-facing report options and executive summary UI are not part of this PR.
- Consent/trust copy changes for the start and report/advisory request stages are intentionally left for the customer-facing Phase 13 UI PR.
- Existing Supabase advisor baseline findings remain outside this PR.

## Recommendation

Keep PR #17 as draft. Do not merge or mark ready until the unresolved internal-notification runtime condition is accepted by the controller or retested with approved preview/production notification configuration.