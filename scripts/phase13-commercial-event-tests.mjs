import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function assert(condition, label) {
  if (!condition) throw new Error(label);
}

function assertIncludes(file, needle, label) {
  assert(read(file).includes(needle), `${label}: expected ${file} to include ${needle}`);
}

function assertNotIncludes(file, needle, label) {
  assert(!read(file).includes(needle), `${label}: expected ${file} not to include ${needle}`);
}

function assertSourceOrder(file, firstNeedle, secondNeedle, label) {
  const source = read(file);
  const firstIndex = source.indexOf(firstNeedle);
  const secondIndex = source.indexOf(secondNeedle);
  assert(firstIndex >= 0, `${label}: expected ${file} to include ${firstNeedle}`);
  assert(secondIndex >= 0, `${label}: expected ${file} to include ${secondNeedle}`);
  assert(firstIndex < secondIndex, `${label}: expected ${firstNeedle} before ${secondNeedle} in ${file}`);
}

function countOccurrences(file, needle) {
  return read(file).split(needle).length - 1;
}

const migration = 'supabase/migrations/0012_phase13_commercial_event_foundation.sql';
const cleanupMigration = 'supabase/migrations/0013_phase13_event_index_cleanup.sql';
const taxonomy = 'docs/v1/phase13/phase13-commercial-event-taxonomy.md';
const eventHelper = 'src/lib/analytics/assessment-events.ts';
const notificationHelper = 'src/lib/notifications/internal-notifications.ts';
const commercialEventRoute = 'src/app/api/assessments/[assessmentRef]/commercial-event/route.ts';
const personalisedRoute = 'src/app/api/assessments/[assessmentRef]/personalised-report-request/route.ts';
const reportService = 'src/lib/reports/premium-report-service-core.ts';
const generateRoute = 'src/app/api/admin/orders/[orderReference]/generate-report/route.ts';

const requiredEventTypes = [
  'assessment_started',
  'assessment_submitted',
  'snapshot_viewed',
  'executive_summary_viewed',
  'report_options_opened',
  'report_option_selected',
  'full_report_5000_selected',
  'personalised_report_50000_selected',
  'eft_order_created',
  'payment_marked_received',
  'report_generated',
  'admin_report_downloaded',
  'report_emailed_to_customer',
  'internal_notification_queued',
  'internal_notification_sent',
  'internal_notification_failed'
];

for (const file of [migration, cleanupMigration, taxonomy, eventHelper, notificationHelper, commercialEventRoute, personalisedRoute, reportService, generateRoute]) {
  assert(exists(file), `${file} must exist.`);
}

for (const eventType of requiredEventTypes) {
  assertIncludes(eventHelper, `'${eventType}'`, `Event helper defines ${eventType}`);
  assertIncludes(migration, `'${eventType}'`, `Migration permits ${eventType}`);
  assertIncludes(taxonomy, `\`${eventType}\``, `Taxonomy documents ${eventType}`);
}

assertIncludes(migration, 'create table if not exists public.assessment_events', 'Migration creates assessment_events');
assertIncludes(migration, 'organisation_id uuid references public.organisations(id)', 'Assessment events can link organisation');
assertIncludes(migration, 'respondent_id uuid references public.respondents(id)', 'Assessment events can link respondent');
assertIncludes(migration, 'order_id uuid references public.orders(id)', 'Assessment events can link order');
assertIncludes(migration, 'data_request_id uuid references public.data_requests(id)', 'Assessment events can link data request');
assertIncludes(migration, 'report_id uuid references public.reports(id)', 'Assessment events can link report');
assertIncludes(migration, 'assessment_events_dedupe_key_unique unique (dedupe_key)', 'Assessment events enforce dedupe uniqueness');
assertNotIncludes(migration, 'assessment_events_dedupe_key_uidx on public.assessment_events', 'Base migration must not create a duplicate dedupe index');
assertIncludes(migration, 'assessment_events_respondent_idx', 'Assessment events index respondent_id');
assertIncludes(migration, 'assessment_events_created_at_idx', 'Assessment events index created_at');
assertIncludes(migration, 'revoke all on table public.assessment_events from anon, authenticated', 'Assessment events are server-side only in the Data API boundary');
assertIncludes(cleanupMigration, 'drop index if exists public.assessment_events_dedupe_key_uidx', 'Cleanup migration removes duplicate already-applied dedupe index');

assertIncludes(eventHelper, 'buildAssessmentEventDedupeKey', 'Event helper exposes deterministic dedupe key');
assertIncludes(eventHelper, "segment('option', input.optionCode)", 'Event dedupe separates option_code');
assertIncludes(eventHelper, "segment('order', input.orderId)", 'Event dedupe separates order_id');
assertIncludes(eventHelper, "segment('data_request', input.dataRequestId)", 'Event dedupe separates data_request_id');
assertIncludes(eventHelper, "segment('report', input.reportId)", 'Event dedupe separates report_id');
assertIncludes(eventHelper, 'event_count: nextCount', 'Repeated identical events increment event_count');
assertIncludes(eventHelper, 'last_seen_at: new Date().toISOString()', 'Repeated identical events refresh last_seen_at');
assertIncludes(eventHelper, 'sanitiseEventMetadata', 'Event helper sanitises metadata');
assertIncludes(eventHelper, 'value.slice(0, 500)', 'Event metadata strings are bounded');

assertIncludes(notificationHelper, 'buildInternalNotificationDedupeKey', 'Notification helper exposes deterministic dedupe key');
assertIncludes(notificationHelper, 'MK_INTERNAL_LEADS_EMAIL', 'Notification recipient is environment-configured');
assertIncludes(notificationHelper, 'skipped_no_recipient', 'Notification helper skips cleanly with no recipient');
assertIncludes(notificationHelper, "status: 'queued'", 'Notification helper queues but does not send');
assertIncludes(notificationHelper, 'provider_send_attempted: false', 'Notification helper does not pretend provider sending happened');
assertIncludes(notificationHelper, "status: 'already_queued'", 'Notification helper dedupes repeat queue attempts');
assertIncludes(notificationHelper, "eventType: 'internal_notification_queued'", 'Queued notifications are tracked as events');
assertIncludes(notificationHelper, "'internal_notification_failed'", 'Failed notification queue attempts are tracked as events');
assertIncludes(notificationHelper, "'full_report_5000_selected'", 'R5 selection notification type is supported');
assertIncludes(notificationHelper, "'personalised_report_50000_selected'", 'R50 selection notification type is supported');
assertNotIncludes(notificationHelper, "'report_options_opened'", 'Report options views must not queue internal notifications');
assertNotIncludes(notificationHelper, 'sent_at:', 'Notification helper must not mark queued emails as sent');
assertNotIncludes(notificationHelper, 'provider_message_id:', 'Notification helper must not invent provider message ids');

assertIncludes('src/lib/respondent/start-assessment.ts', "eventType: 'assessment_started'", 'Assessment start is tracked server-side');
assertIncludes('src/lib/respondent/assessment-save.ts', "eventType: 'assessment_submitted'", 'Assessment submission is tracked server-side');
assertIncludes('src/lib/respondent/assessment-save.ts', "notificationType: 'assessment_completed'", 'Assessment completion queues internal lead notification');
assertSourceOrder('src/lib/respondent/assessment-save.ts', 'if (!lockedAssessment)', "eventType: 'assessment_submitted'", 'Submission event must be after stale-submit conflict guard');
assertIncludes('src/app/snapshot/[assessmentRef]/page.tsx', "eventType: 'snapshot_viewed'", 'Snapshot view is tracked server-side');
assertSourceOrder('src/app/snapshot/[assessmentRef]/page.tsx', 'if (!snapshot)', "eventType: 'snapshot_viewed'", 'Snapshot view event must happen only after snapshot is available');
assertIncludes('src/lib/orders/manual-eft-orders.ts', "eventType: 'eft_order_created'", 'EFT order creation/reuse is tracked');
assertIncludes('src/lib/orders/manual-eft-orders.ts', "notificationType: 'eft_order_created'", 'EFT order queues internal lead notification');
assertIncludes('src/lib/orders/manual-eft-orders.ts', "optionCode: 'full_report_5000'", 'EFT order event is linked to R5k option code');
assertIncludes('src/lib/orders/manual-eft-orders.ts', "eventType: 'payment_marked_received'", 'Payment received admin status is tracked');
assertIncludes(generateRoute, 'generatePremiumReport', 'Admin report route delegates to shared generation service');
assertIncludes(reportService, "'admin_terminal_phase14_generation_publication'", 'Successful manual report generation records events inside the atomic terminal transaction');
assertIncludes(reportService, "'terminal_phase14_generation_publication'", 'Successful worker report generation records events inside the atomic terminal transaction');
assertNotIncludes(reportService, "rpc('record_phase14_report_generated'", 'Report generation must not emit events after publication in a split transaction');
assertIncludes('src/app/api/admin/reports/[reportId]/download/route.ts', "rpc('record_phase14_report_download'", 'Successful admin report download is tracked transactionally');

assertIncludes(commercialEventRoute, 'validateSnapshotToken', 'Commercial event route validates snapshot token');
assertIncludes(commercialEventRoute, "'executive_summary_viewed'", 'Commercial event route permits executive summary view event');
assertIncludes(commercialEventRoute, "'report_options_opened'", 'Commercial event route permits report options event');
assertIncludes(commercialEventRoute, "'report_option_selected'", 'Commercial event route permits generic option selected event');
assertIncludes(commercialEventRoute, "'full_report_5000_selected'", 'Commercial event route permits R5 selected event');
assertNotIncludes(commercialEventRoute, "'personalised_report_50000_selected'", 'Commercial event route does not permit R50 specific event before enquiry persistence');
assertNotIncludes(commercialEventRoute, "notificationType: 'report_options_opened'", 'Report-options open must not queue internal notification');
assertIncludes(commercialEventRoute, "notificationType: 'full_report_5000_selected'", 'R5 selection queues deduped internal notification');
assertNotIncludes(commercialEventRoute, "notificationType: 'personalised_report_50000_selected'", 'R50 selection notification is not queued by generic commercial event route');
assertNotIncludes(commercialEventRoute, 'metadata: { rawToken', 'Commercial event metadata must not write raw tokens');
assertNotIncludes(commercialEventRoute, 'snapshotToken:', 'Commercial event route must not write snapshot token into event metadata');

assertIncludes(personalisedRoute, 'validateSnapshotToken', 'Personalised route validates snapshot token');
assertIncludes(personalisedRoute, "request_type: 'personalised_report_50000'", 'Personalised route stores the controlled request type');
assertIncludes(personalisedRoute, "eventType: 'personalised_report_50000_selected'", 'Personalised route tracks specific R50 selection');
assert(countOccurrences(personalisedRoute, "eventType: 'personalised_report_50000_selected'") === 1, 'Personalised route tracks one R50-specific event after persistence');
assertNotIncludes(personalisedRoute, "eventType: 'report_option_selected'", 'Personalised route does not duplicate generic option analytics after persistence');
assertIncludes(personalisedRoute, "notificationType: 'personalised_report_50000_selected'", 'Personalised route queues high-priority internal notification after persistence');
assert(countOccurrences(personalisedRoute, "notificationType: 'personalised_report_50000_selected'") === 1, 'Personalised route queues one R50-specific notification after persistence');
assertIncludes(personalisedRoute, 'dataRequestId: result.request.id', 'Personalised R50 event and notification are linked to data_request_id');
assertIncludes(personalisedRoute, 'request_created: result.created', 'Personalised repeat submissions enrich deduped event metadata with create/update state');
assertIncludes(personalisedRoute, 'payment_obligation: false', 'Personalised route records no payment obligation');
assertIncludes(personalisedRoute, 'order_created: false', 'Personalised route records no order creation');
assertIncludes(personalisedRoute, 'report_generation: false', 'Personalised route records no report generation');
assertIncludes(personalisedRoute, 'validateChoice', 'Personalised route validates controlled choice values');
assertIncludes(personalisedRoute, 'validateFocusAreas', 'Personalised route validates controlled focus areas');
assertIncludes(personalisedRoute, '{ status: 400 }', 'Personalised route rejects invalid controlled values with 400');
assertIncludes(personalisedRoute, 'selectActivePersonalisedRequest(db, input.assessment.id)', 'Personalised route reselects active enquiry on insert race');
assertNotIncludes(personalisedRoute, 'cleanChoice', 'Personalised route must not silently replace invalid values with defaults');
assertNotIncludes(personalisedRoute, 'metadata: { notes', 'Personalised route must not copy notes into event metadata');
assertNotIncludes(personalisedRoute, 'metadata: { areasOfFocus', 'Personalised route must not include form answers in event metadata');
assertNotIncludes(personalisedRoute, 'provider_message_id', 'Personalised route must not pretend notification delivery');

const noGoImplementationSources = [
  eventHelper,
  notificationHelper,
  commercialEventRoute,
  personalisedRoute,
  'src/lib/respondent/start-assessment.ts',
  'src/lib/respondent/assessment-save.ts',
  'src/app/snapshot/[assessmentRef]/page.tsx',
  'src/components/assessment/FreeSnapshot.tsx',
  'src/lib/orders/manual-eft-orders.ts',
  generateRoute,
  'src/app/api/admin/reports/[reportId]/download/route.ts'
].map(read).join('\n');

assert(!/PayFast|Stitch|card payment|subscription|respondent account|client portal|peer average|public benchmark|live AI|instant customer download|automated report release/i.test(noGoImplementationSources), 'Phase 13 customer/commercial surfaces must not introduce prohibited gateway, account, benchmark or report-release features.');
assert(!/sendEmail|resend\.emails\.send|transport\.sendMail|sgMail\.send/i.test(notificationHelper), 'Internal notification helper must not send emails in Phase 13.');
assertNotIncludes(reportService, 'resend.emails.send', 'Phase 14A report service must not send customer email before Phase 14B.');

const packageJson = JSON.parse(read('package.json'));
assert(packageJson.scripts?.['phase13:test-events'] === 'node scripts/phase13-commercial-event-tests.mjs', 'package.json must expose phase13:test-events.');
assert(String(packageJson.dependencies?.next ?? '').startsWith('^14.'), 'Phase 13 must keep Next 14.x.');
assert(String(packageJson.devDependencies?.['eslint-config-next'] ?? '').startsWith('^14.'), 'Phase 13 must keep eslint-config-next 14.x.');
assertIncludes('.github/workflows/phase7-verification.yml', 'npm run phase13:test-events', 'V1 verification workflow runs Phase 13 event tests');

console.log('Phase 13 commercial event tests passed. Event taxonomy, dedupe behavior, token-scoped customer events, R50 post-persistence boundary, shared report-generated tracking and no-email boundary are covered.');
