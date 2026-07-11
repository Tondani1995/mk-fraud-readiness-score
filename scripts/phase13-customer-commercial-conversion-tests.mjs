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

const files = {
  builder: 'src/lib/snapshot/commercial-insights.ts',
  snapshot: 'src/components/assessment/FreeSnapshot.tsx',
  snapshotPage: 'src/app/snapshot/[assessmentRef]/page.tsx',
  commercialEventRoute: 'src/app/api/assessments/[assessmentRef]/commercial-event/route.ts',
  personalisedRoute: 'src/app/api/assessments/[assessmentRef]/personalised-report-request/route.ts',
  freeSnapshot: 'src/lib/snapshot/free-snapshot.ts',
  migration: 'supabase/migrations/0014_phase13_customer_commercial_conversion.sql',
  adminShell: 'src/components/admin/AdminShell.tsx',
  adminList: 'src/app/admin/enquiries/page.tsx',
  adminDetail: 'src/app/admin/enquiries/[requestReference]/page.tsx',
  adminHelper: 'src/lib/admin/personalised-enquiries.ts',
  startForm: 'src/components/assessment/StartAssessmentForm.tsx',
  workflow: '.github/workflows/phase7-verification.yml',
  packageJson: 'package.json'
};

for (const file of Object.values(files)) assert(exists(file), `${file} must exist.`);

assertIncludes(files.builder, 'buildCommercialSnapshotInsights', 'Deterministic commercial insight builder exists');
assertIncludes(files.builder, 'commercialScoreBand', 'Builder exposes deterministic score band');
assertIncludes(files.builder, 'priorityAreas(snapshot)', 'Builder derives priority areas');
assertIncludes(files.builder, 'strengths(snapshot)', 'Builder derives strengths');
assertIncludes(files.snapshot, 'commercialInsights.freeSnapshotValue', 'Snapshot consumes free-vs-paid value lists');
assertNotIncludes(files.builder, 'Math.random', 'Insight builder must not use randomness');
assertNotIncludes(files.builder, 'Date.now', 'Insight builder must not use current time');
assertNotIncludes(files.builder, 'openai', 'Insight builder must not call AI providers');
assertNotIncludes(files.builder, 'benchmark', 'Insight builder must not expose benchmark content');

assertIncludes(files.snapshotPage, 'buildCommercialSnapshotInsights(snapshot)', 'Snapshot page builds insights server-side');
assertIncludes(files.snapshotPage, 'snapshotUrl = `/score/snapshot/', 'Snapshot URL stays under /score route flow');
assertIncludes(files.snapshotPage, 'encodeURIComponent(token)', 'Snapshot URL preserves private token safely');
assertIncludes(files.snapshotPage, 'commercialInsights={commercialInsights}', 'Snapshot page passes insights into component');

assertIncludes(files.freeSnapshot, 'respondentEmail: string | null', 'Free snapshot can prepopulate respondent contact context');
assertIncludes(files.freeSnapshot, 'respondentEmail: respondent?.email ?? null', 'Free snapshot loads respondent email from server-side relationship');

assertIncludes(files.snapshot, 'Executive interpretation', 'Snapshot has executive summary section');
assertIncludes(files.snapshot, 'Priority areas', 'Snapshot has priority areas section');
assertIncludes(files.snapshot, 'Strengths in context', 'Snapshot has strengths context section');
assertIncludes(files.snapshot, 'Free vs paid value', 'Snapshot compares free and paid value');
assertIncludes(files.snapshot, 'Full MK Fraud Readiness Report', 'Snapshot shows R5k report option');
assertIncludes(files.snapshot, 'R5,000', 'Snapshot shows R5k price');
assertIncludes(files.snapshot, 'Executive Fraud Readiness Advisory', 'Snapshot shows R50k advisory option');
assertIncludes(files.snapshot, 'From R50,000', 'Snapshot shows R50k starting price');
assertIncludes(files.snapshot, 'within one business day after payment confirmation', 'Snapshot uses one-business-day report fulfilment copy');
assertIncludes(files.snapshot, 'Manual EFT details', 'Snapshot still renders EFT details');
assertIncludes(files.snapshot, 'Payment reference', 'Snapshot still renders payment reference');
assertIncludes(files.snapshot, 'CopyButton', 'Snapshot includes copy controls');
assertIncludes(files.snapshot, 'SnapshotEventBeacon', 'Snapshot uses viewport event beacons');
assertIncludes(files.snapshot, 'IntersectionObserver', 'Snapshot view events use IntersectionObserver');
assertIncludes(files.snapshot, "eventType=\"executive_summary_viewed\"", 'Executive summary view event is emitted at section visibility');
assertIncludes(files.snapshot, "eventType=\"report_options_opened\"", 'Report options view event is emitted at section visibility');
assertIncludes(files.snapshot, "report_option_selected", 'Report option selected event is emitted');
assertIncludes(files.snapshot, "full_report_5000_selected", 'R5k selected event is emitted');
assertIncludes(files.snapshot, "setSelectedOption(COMMERCIAL_OPTION_CODES.fullReport)", 'R5k selection is a distinct option step');
assertIncludes(files.snapshot, 'onClick={() => void requestDetailedReport()}', 'R5k EFT continuation calls order creation path only after the option step');
assertIncludes(files.snapshot, 'Continue to EFT instructions', 'R5k path creates order only at EFT step');
assertIncludes(files.snapshot, 'consent to MK using my contact details, assessment responses and assessment results', 'Report/advisory consent copy is present');
assertIncludes(files.snapshot, 'personalised-report-request', 'Snapshot posts advisory enquiry to controlled endpoint');
assertIncludes(files.snapshot, 'No automatic payment obligation', 'R50k option has no automatic payment obligation copy');
assertIncludes(files.snapshot, 'No automatic report generation', 'R50k option has no automatic report generation copy');
assertNotIncludes(files.snapshot, 'benchmarks', 'Snapshot must not mention benchmarks');
assertNotIncludes(files.snapshot, 'Benchmarks', 'Snapshot must not mention Benchmarks');
assertNotIncludes(files.snapshot, 'AI-generated', 'Snapshot must not mention AI-generated content');
assertNotIncludes(files.snapshot, '30/60/90', 'Snapshot must not include remediation-plan scaffold');
assertNotIncludes(files.snapshot, 'Phase 13', 'Snapshot must not expose phase labels');
assert(!/\bEXP-0[1-8]\b|\bD(?:[1-9]|10)-Q\d{2}\b|hard-gate|N\/A rule/i.test(read(files.snapshot)), 'Snapshot must not expose internal methodology codes or rule labels.');

assertIncludes(files.commercialEventRoute, 'validateSnapshotToken', 'Commercial event route validates snapshot token');
assertIncludes(files.commercialEventRoute, 'ALLOWED_EVENT_TYPES', 'Commercial event route allowlists event types');
assertIncludes(files.commercialEventRoute, "'executive_summary_viewed'", 'Commercial event route accepts executive summary view');
assertIncludes(files.commercialEventRoute, "'report_options_opened'", 'Commercial event route accepts report options open');
assertIncludes(files.commercialEventRoute, "'report_option_selected'", 'Commercial event route accepts option selected');
assertIncludes(files.commercialEventRoute, "'full_report_5000_selected'", 'Commercial event route accepts R5k selected');
assertIncludes(files.commercialEventRoute, "notificationType: 'report_options_opened'", 'Report options open queues internal notification');
assertIncludes(files.commercialEventRoute, "notificationType: 'full_report_5000_selected'", 'R5k selected queues internal notification');
assertNotIncludes(files.commercialEventRoute, 'snapshotToken:', 'Commercial event route must not write snapshot token into event metadata');

assertIncludes(files.personalisedRoute, "request_type: 'personalised_report_50000'", 'R50k endpoint persists controlled request type');
assertIncludes(files.personalisedRoute, 'request_reference: makeRequestReference()', 'R50k endpoint generates public enquiry reference');
assertIncludes(files.personalisedRoute, '.in(\'status\', ACTIVE_STATUSES)', 'R50k endpoint reuses active enquiries');
assertIncludes(files.personalisedRoute, "eventType: 'report_option_selected'", 'R50k endpoint tracks generic option selected');
assertIncludes(files.personalisedRoute, "eventType: 'personalised_report_50000_selected'", 'R50k endpoint tracks specific high-value option');
assertIncludes(files.personalisedRoute, "notificationType: 'personalised_report_50000_selected'", 'R50k endpoint queues high-priority notification');
assertIncludes(files.personalisedRoute, 'payment_obligation: false', 'R50k endpoint records no payment obligation');
assertIncludes(files.personalisedRoute, 'order_created: false', 'R50k endpoint records no order creation');
assertIncludes(files.personalisedRoute, 'report_generation: false', 'R50k endpoint records no report generation');
assertNotIncludes(files.personalisedRoute, 'provider_message_id', 'R50k endpoint must not pretend notification delivery');
assertNotIncludes(files.personalisedRoute, 'metadata: { notes', 'R50k event metadata must not include free-form notes');
assertNotIncludes(files.personalisedRoute, 'metadata: { areasOfFocus', 'R50k event metadata must not include form answers');

assertIncludes(files.migration, 'add column if not exists request_reference text', 'Migration adds request reference');
assertIncludes(files.migration, 'add column if not exists primary_reason text', 'Migration adds primary reason');
assertIncludes(files.migration, 'add column if not exists areas_of_focus text[]', 'Migration adds focus area array');
assertIncludes(files.migration, 'add column if not exists preferred_contact_method text', 'Migration adds contact method');
assertIncludes(files.migration, 'add column if not exists preferred_consultation_timeframe text', 'Migration adds timeframe');
assertIncludes(files.migration, 'add column if not exists consent_contact boolean', 'Migration adds contact consent');
assertIncludes(files.migration, 'data_requests_request_reference_uidx', 'Migration adds unique request reference index');
assertIncludes(files.migration, 'data_requests_active_personalised_report_uidx', 'Migration adds active enquiry uniqueness guard');
assertIncludes(files.migration, 'revoke all on table public.data_requests from anon, authenticated', 'Migration keeps Data API exposure closed');
assertIncludes(files.migration, 'manual_eft_only', 'Migration records manual EFT boundary');
assertIncludes(files.migration, 'payment_gateway":false', 'Migration records no payment gateway');
assertIncludes(files.migration, 'automated_report_release":false', 'Migration records no automated release');
assertNotIncludes(files.migration, 'score_runs', 'Migration must not touch score_runs');
assertNotIncludes(files.migration, 'score_domain_results', 'Migration must not touch score_domain_results');
assertNotIncludes(files.migration, 'methodology_versions', 'Migration must not touch methodology versions');
assertNotIncludes(files.migration, 'insert into public.orders', 'Migration must not create orders');
assertNotIncludes(files.migration, 'insert into public.reports', 'Migration must not create reports');

assertIncludes(files.adminShell, 'Personalised enquiries', 'Admin nav includes personalised enquiries');
assertIncludes(files.adminList, 'requireAdmin', 'Admin enquiry list requires admin before read');
assertSourceOrder(files.adminList, 'requireAdmin', 'getAdminPersonalisedEnquiryList', 'Admin list authenticates before service-role read');
assertIncludes(files.adminDetail, 'requireAdmin', 'Admin enquiry detail requires admin before read');
assertSourceOrder(files.adminDetail, 'requireAdmin', 'getAdminPersonalisedEnquiryDetail', 'Admin detail authenticates before service-role read');
assertIncludes(files.adminDetail, 'recordPersonalisedEnquiryOpened', 'Admin detail records audit event when opened');
assertIncludes(files.adminDetail, 'No order, payment obligation or report is created automatically', 'Admin detail preserves R50k boundary');
assertIncludes(files.adminHelper, 'unstable_noStore', 'Admin enquiry reads are no-store');
assertIncludes(files.adminHelper, "action: 'personalised_enquiry_opened'", 'Admin enquiry opened audit action exists');

assertIncludes(files.startForm, 'enough knowledge of the organisation to answer meaningfully', 'Start consent asks for meaningful knowledge, not authority');
assertNotIncludes(files.startForm, 'authorised to submit', 'Start form must not ask respondent to confirm authority');
assertIncludes(files.startForm, 'does not ask you to upload documents', 'Start form explains structured assessment privacy boundary');
assertNotIncludes(files.startForm, 'benchmarking once sufficient data exists', 'Start form must not promise future benchmarking');

const packageJson = JSON.parse(read(files.packageJson));
assert(packageJson.scripts?.['phase13:test-conversion'] === 'node scripts/phase13-customer-commercial-conversion-tests.mjs', 'package.json must expose phase13:test-conversion.');
assert(String(packageJson.dependencies?.next ?? '').startsWith('^14.'), 'Phase 13 conversion must keep Next 14.x.');
assertIncludes(files.workflow, 'npm run phase13:test-conversion', 'V1 workflow runs Phase 13 conversion tests');

const customerSources = [files.snapshot, files.snapshotPage, files.startForm].map(read).join('\n');
assert(!/PayFast|Stitch|card payment|proof upload|Download report|client portal|respondent dashboard|subscription|peer average|public benchmark|live AI|instant customer download|automated report release/i.test(customerSources), 'Customer-facing Phase 13 sources must stay inside no-go boundaries.');

console.log('Phase 13 customer commercial conversion tests passed. Snapshot journey, token-scoped events, R5k manual EFT selection, R50k enquiry flow, admin enquiry visibility, migration boundaries and customer copy are covered.');
