import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

function read(file) {
  return fs.readFileSync(path.join(root, file), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function includes(file, text, message) {
  assert(read(file).includes(text), `${message}: expected ${file} to include ${text}`);
}

function excludes(file, text, message) {
  assert(!read(file).includes(text), `${message}: expected ${file} not to include ${text}`);
}

const files = {
  choice: 'src/components/products/ProductChoice.tsx',
  form: 'src/components/assessment/AdvisoryEnquiryForm.tsx',
  page: 'src/app/score/advisory/[assessmentRef]/page.tsx',
  eventRoute: 'src/app/score/api/assessments/[assessmentRef]/commercial-event/route.ts',
  enquiryRoute: 'src/app/score/api/assessments/[assessmentRef]/personalised-report-request/route.ts',
  events: 'src/lib/analytics/assessment-events.ts',
  notifications: 'src/lib/notifications/internal-notifications.ts',
  optionCodes: 'src/lib/snapshot/commercial-insights.ts',
  adminHelper: 'src/lib/admin/personalised-enquiries.ts',
  adminList: 'src/app/score/admin/enquiries/page.tsx',
  adminDetail: 'src/app/score/admin/enquiries/[requestReference]/page.tsx',
  migration: 'supabase/migrations/20260830170000_mk_advisory_enquiry_path.sql'
};

for (const file of Object.values(files)) assert(fs.existsSync(path.join(root, file)), `${file} must exist`);

includes(files.choice, 'advisory_selected', 'Advisory selection emits its current event');
includes(files.choice, 'SCORE_BASE_PATH}/advisory/', 'Advisory selection stays inside the private Score journey');
includes(files.choice, 'optionCode: \'advisory\'', 'Advisory selection uses the current option code');
const advisoryCardSource = read(files.choice).slice(read(files.choice).indexOf('function AdvisoryCard'));
excludesFrom(advisoryCardSource, 'href="/contact"', 'Advisory card does not fall through to generic Contact');
includes(files.choice, "{isNavigating ? 'Opening…' : 'Talk to MK'}", 'Advisory card provides immediate navigation feedback');

includes(files.page, 'validateSnapshotToken', 'Advisory page validates the private Snapshot token');
includes(files.page, 'loadFreeSnapshotByReference', 'Advisory page loads the existing Snapshot context');
includes(files.page, 'AdvisoryEnquiryForm', 'Advisory page renders the focused enquiry form');
includes(files.form, 'Talk to MK about your result', 'Advisory form has the approved heading');
includes(files.form, 'We already have your Fraud Readiness assessment.', 'Advisory form explains the known result context');
for (const value of [
  'understand_control_weaknesses',
  'design_strengthen_programme',
  'respond_incident_audit_control',
  'prepare_governance_response',
  'review_policies_controls',
  'fraud_governance_oversight',
  'fraud_risk_identification_assessment',
  'operational_fraud_controls',
  'third_party_supplier_procurement_risk',
  'digital_identity_channel_fraud',
  'fraud_monitoring_detection',
  'incident_response_investigations',
  'fraud_culture_awareness',
  'video_meeting',
  'within_two_weeks'
]) includes(files.form, value, `Advisory form preserves approved choice ${value}`);
includes(files.form, 'snapshotToken', 'Advisory submission remains token-bound');
includes(files.form, 'Thanks. MK has your request.', 'Advisory form has the approved success confirmation');
includes(files.form, 'Book a 30-minute conversation', 'Advisory success offers the existing consultation route');

includes(files.eventRoute, "'advisory_selected'", 'Commercial event route accepts Advisory selection');
includes(files.eventRoute, 'COMMERCIAL_OPTION_CODES.advisory', 'Commercial event route records the Advisory option');
excludes(files.eventRoute, "notificationType: 'advisory_selected'", 'Advisory selection does not notify MK before an enquiry exists');
includes(files.enquiryRoute, "ADVISORY_REQUEST_TYPE = 'mk_advisory'", 'Current enquiry uses the MK Advisory request type');
includes(files.enquiryRoute, "eventType: 'advisory_enquiry_submitted'", 'Submitted enquiry records the current event');
includes(files.enquiryRoute, "notificationType: 'advisory_enquiry_submitted'", 'Submitted enquiry queues the current internal notification');
includes(files.enquiryRoute, 'selectActiveAdvisoryRequest', 'Submitted enquiry reuses an active Advisory request');
includes(files.enquiryRoute, 'dataRequestId: result.request.id', 'Event and notification link to the persisted enquiry');
includes(files.enquiryRoute, 'strict: true', 'Advisory submission fails closed when the required internal notification cannot be queued');
includes(files.enquiryRoute, 'payment_obligation: false', 'Advisory records no payment obligation');
includes(files.enquiryRoute, 'order_created: false', 'Advisory records no order');
includes(files.enquiryRoute, 'report_generation: false', 'Advisory records no report generation');
excludes(files.enquiryRoute, 'createOrGetOrderForReportRequest', 'Advisory does not create an order');
excludes(files.enquiryRoute, 'renderHtmlToPdfBuffer', 'Advisory does not render a report');
const notificationBlock = read(files.enquiryRoute).slice(read(files.enquiryRoute).indexOf('const notificationMetadata'), read(files.enquiryRoute).indexOf('await Promise.all'));
excludesFrom(notificationBlock, 'snapshotToken', 'Internal notification metadata never contains the private Snapshot token');

includes(files.events, "'advisory_selected'", 'Assessment event union includes Advisory selection');
includes(files.events, "'advisory_enquiry_submitted'", 'Assessment event union includes Advisory submission');
includes(files.notifications, "'advisory_enquiry_submitted'", 'Notification union includes Advisory submission');
includes(files.optionCodes, "advisory: 'advisory'", 'Commercial option codes include Advisory');
includes(files.optionCodes, 'COMMERCIAL_OPTION_CODES.advisory', 'Advisory is a current commercial option code');

includes(files.adminHelper, "ADVISORY_REQUEST_TYPE = 'mk_advisory'", 'Admin reader knows the current Advisory type');
includes(files.adminHelper, "LEGACY_PERSONALISED_REQUEST_TYPE = 'personalised_report_50000'", 'Admin reader preserves the historical type');
includes(files.adminHelper, "in('request_type', [ADVISORY_REQUEST_TYPE, LEGACY_PERSONALISED_REQUEST_TYPE])", 'Admin reader shows current and historical enquiries');
includes(files.adminHelper, 'enquiryTypeLabel', 'Admin reader labels current and historical paths');
includes(files.adminList, 'MK Advisory enquiries', 'Admin list is labelled for the current path');
includes(files.adminDetail, 'Historical personalised report enquiry', 'Admin detail preserves a historical label');
includes(files.adminDetail, 'MK Advisory enquiry', 'Admin detail labels current enquiries');

includes(files.migration, 'data_requests_active_mk_advisory_uidx', 'Current Advisory requests are unique while active');
includes(files.migration, "request_type = 'mk_advisory'", 'Migration scopes the active uniqueness guard to current Advisory requests');
includes(files.migration, "'advisory_selected'", 'Migration permits Advisory selection events');
includes(files.migration, "'advisory_enquiry_submitted'", 'Migration permits Advisory submission events');
includes(files.migration, 'data_requests_advisory_consent_chk', 'Database requires consent for current Advisory requests');
includes(files.migration, 'Historical personalised_report_50000 rows remain readable', 'Migration preserves historical enquiry rows');
excludes(files.migration, 'insert into public.orders', 'Advisory migration does not create orders');
excludes(files.migration, 'insert into public.reports', 'Advisory migration does not create reports');

console.log('Phase 13 MK Advisory enquiry tests passed. The private result-linked path, controlled choices, current event/notification taxonomy, idempotent persistence, historical visibility and no-fulfilment boundary are covered.');

function excludesFrom(source, text, message) {
  assert(!source.includes(text), `${message}: expected source not to include ${text}`);
}
