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
  enquiryTaxonomy: 'src/lib/enquiries/taxonomy.ts',
  presentation: 'src/lib/enquiries/presentation.ts',
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
// The request type is defined once, in the taxonomy both Advisory entry points read, and used by
// the assessment-linked endpoint through that import. Checking both halves keeps the guarantee
// end-to-end now that the constant is shared rather than declared inline.
includes(files.enquiryTaxonomy, "ADVISORY_REQUEST_TYPE = 'mk_advisory'", 'Advisory request type is defined once as mk_advisory');
includes(files.enquiryRoute, "from '@/lib/enquiries/taxonomy'", 'Current enquiry reads the shared Advisory taxonomy');
includes(files.enquiryRoute, 'request_type: ADVISORY_REQUEST_TYPE', 'Current enquiry persists the MK Advisory request type');
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

// The admin reader now imports the shared constant instead of declaring its own copy; the value
// itself is asserted at its single definition above.
includes(files.adminHelper, "from '@/lib/enquiries/taxonomy'", 'Admin reader reads the shared Advisory taxonomy');
includes(files.adminHelper, 'ADVISORY_REQUEST_TYPE', 'Admin reader knows the current Advisory type');
includes(files.enquiryTaxonomy, "LEGACY_PERSONALISED_REQUEST_TYPE = 'personalised_report_50000'", 'Historical enquiry type is preserved at its single definition');
includes(files.adminHelper, 'LEGACY_PERSONALISED_REQUEST_TYPE', 'Admin reader preserves the historical type');
// The queue now also answers public Advisory and website contact enquiries, so it filters on the
// full set. The guarantee this assertion protects -- that current Advisory and historical
// personalised enquiries both remain visible -- is checked on the set itself.
includes(files.adminHelper, "in('request_type', ADMIN_ENQUIRY_REQUEST_TYPES", 'Admin reader queries the full enquiry set');
includes(files.adminHelper, 'ADVISORY_REQUEST_TYPE,\n  WEBSITE_CONTACT_REQUEST_TYPE,\n  LEGACY_PERSONALISED_REQUEST_TYPE', 'Admin reader shows current, public and historical enquiries');
includes(files.adminHelper, 'enquiryTypeLabel', 'Admin reader labels current and historical paths');
// The list serves more than Advisory now, so its heading is no longer Advisory-specific. What
// must remain true is that the Advisory paths are still labelled distinctly in the queue.
includes(files.presentation, "'MK Advisory — assessment linked'", 'Queue labels assessment-linked Advisory');
includes(files.presentation, "'MK Advisory — public enquiry'", 'Queue labels public Advisory distinctly');
includes(files.adminList, 'enquiryTypeLabel(enquiry.request_type, enquiry.assessment_id)', 'Admin list renders the enquiry path label');
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
