/**
 * MK Advisory and website enquiry workflow tests.
 *
 * Credential-free, no database, no network. Persistence is exercised against an in-memory fake
 * Supabase client so the row a real insert would write is asserted exactly — column for column —
 * without needing an environment.
 *
 * The property under test throughout: there are TWO Advisory entry points and ONE Advisory model.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  ADVISORY_REQUEST_TYPE,
  ALLOWED_ADVISORY_CONTACT_METHODS,
  ALLOWED_ADVISORY_FOCUS_AREAS,
  ALLOWED_ADVISORY_REASONS,
  ALLOWED_ADVISORY_TIMEFRAMES,
  ENQUIRY_REFERENCE_PATTERN,
  WEBSITE_CONTACT_REQUEST_TYPE
} from '../src/lib/enquiries/taxonomy.ts';
import {
  honeypotTripped,
  parsePublicAdvisoryEnquiry,
  parseWebsiteContactEnquiry
} from '../src/lib/enquiries/validation.ts';
import {
  makeEnquiryReference,
  persistPublicAdvisoryEnquiry,
  persistWebsiteContactEnquiry,
  queuePublicEnquiryNotification
} from '../src/lib/enquiries/public-enquiry-service.ts';
import { enquiryTypeLabel, enquiryContactName, enquiryOrganisationName } from '../src/lib/enquiries/presentation.ts';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

let checks = 0;
const failures = [];
function check(label, fn) {
  const run = (result) => {
    checks += 1;
    console.log(`  ok - ${label}`);
    return result;
  };
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result.then(run, (error) => {
        failures.push(label);
        console.error(`  FAIL - ${label}: ${error.message}`);
      });
    }
    return run();
  } catch (error) {
    failures.push(label);
    console.error(`  FAIL - ${label}: ${error.message}`);
  }
}

/** Minimal Supabase-shaped fake that records what would have been written. */
function fakeDb() {
  const rows = { data_requests: [], email_events: [], audit_logs: [] };
  const api = {
    rows,
    from(table) {
      return {
        insert(payload) {
          const record = { id: `id-${rows[table].length + 1}`, created_at: '2026-08-31T00:00:00.000Z', ...payload };
          rows[table].push(record);
          return {
            select: () => ({ single: async () => ({ data: record, error: null }) }),
            then: undefined
          };
        },
        select() {
          const chain = {
            eq: () => chain,
            maybeSingle: async () => ({ data: null, error: null })
          };
          return chain;
        }
      };
    }
  };
  return api;
}

const VALID_ADVISORY = {
  contactName: 'Thandi Nkosi',
  email: 'Thandi@Example.co.za',
  companyName: 'Example Holdings',
  contactPhone: '+27 82 000 0000',
  primaryReason: 'design_strengthen_programme',
  areasOfFocus: ['fraud_governance_oversight', 'operational_fraud_controls'],
  preferredContactMethod: 'email',
  preferredConsultationTimeframe: 'within_two_weeks',
  notes: 'We are rebuilding our procurement controls.',
  consentContact: true
};

const VALID_CONTACT = {
  name: 'Sipho Dlamini',
  email: 'sipho@example.co.za',
  company: 'Example Traders',
  phone: '+27 11 000 0000',
  service: 'fraud-health-check',
  message: 'We would like to understand what a health check involves for a mid-size retailer.'
};

console.log('mk advisory + website enquiry workflows');

// --- ONE ADVISORY MODEL --------------------------------------------------------------------------

check('both Advisory paths read the same taxonomy module', () => {
  const snapshotRoute = read('src/app/score/api/assessments/[assessmentRef]/personalised-report-request/route.ts');
  assert.ok(snapshotRoute.includes("from '@/lib/enquiries/taxonomy'"));
  assert.ok(snapshotRoute.includes('ALLOWED_ADVISORY_REASONS'));
  // The route must no longer carry its own copy of the taxonomy.
  assert.ok(!/const ALLOWED_REASONS = new Set\(\[/.test(snapshotRoute));
  const publicForm = read('src/components/website/FraudReadiness/PublicAdvisoryEnquiryForm.tsx');
  assert.ok(publicForm.includes("from '@/lib/enquiries/taxonomy'"));
});

check('both Advisory paths use request_type mk_advisory', () => {
  assert.equal(ADVISORY_REQUEST_TYPE, 'mk_advisory');
  const snapshotRoute = read('src/app/score/api/assessments/[assessmentRef]/personalised-report-request/route.ts');
  assert.ok(snapshotRoute.includes('request_type: ADVISORY_REQUEST_TYPE'));
  const service = read('src/lib/enquiries/public-enquiry-service.ts');
  assert.ok(service.includes('request_type: ADVISORY_REQUEST_TYPE'));
});

check('both Advisory paths mint MKENQ references', () => {
  assert.match(makeEnquiryReference(new Date('2026-08-31T00:00:00Z')), ENQUIRY_REFERENCE_PATTERN);
  assert.ok(makeEnquiryReference(new Date('2026-08-31T00:00:00Z')).startsWith('MKENQ-2026-'));
  const snapshotRoute = read('src/app/score/api/assessments/[assessmentRef]/personalised-report-request/route.ts');
  assert.ok(/MKENQ-\$\{/.test(snapshotRoute) || snapshotRoute.includes('MKENQ-'));
});

// --- RESULT-LINKED ADVISORY JOURNEY PRESERVED ----------------------------------------------------

check('Snapshot "Talk to MK" still routes to /score/advisory/[assessmentRef]', () => {
  const productChoice = read('src/components/products/ProductChoice.tsx');
  assert.ok(productChoice.includes('Talk to MK'));
  assert.ok(productChoice.includes('${SCORE_BASE_PATH}/advisory/${encodeURIComponent(snapshot.assessmentReference)}'));
  assert.ok(!productChoice.includes('/fraud-readiness/advisory'), 'the Snapshot path must not be rerouted to the public intake');
  // A customer holding a Snapshot token must never be handed to the generic contact form: their
  // assessment context is exactly what makes the Advisory conversation worth having.
  assert.ok(!productChoice.includes('"/contact"'), 'the Snapshot selector must not link to /contact');
  assert.ok(productChoice.includes('Talk to MK first'));
  assert.ok(/speakToMkFirst \? \(\s*<button[^]{0,400}onClick=\{chooseAdvisory\}/.test(productChoice),
    '"Talk to MK first" must enter the certified Advisory route');
});

check('the Snapshot Advisory page still requires a Snapshot token and loads context', () => {
  const page = read('src/app/score/advisory/[assessmentRef]/page.tsx');
  assert.ok(page.includes('validateSnapshotToken'));
  assert.ok(page.includes("reason=\"missing_token\"") || page.includes("'missing_token'"));
  assert.ok(page.includes('loadFreeSnapshotByReference'), 'Snapshot context must still be loaded');
  assert.ok(page.includes('AdvisoryEnquiryForm'));
});

check('the assessment-linked Advisory API still persists to data_requests with its assessment', () => {
  const route = read('src/app/score/api/assessments/[assessmentRef]/personalised-report-request/route.ts');
  assert.ok(route.includes("from('data_requests')"));
  assert.ok(route.includes('assessment_id: input.assessment.id'));
  assert.ok(route.includes('validateSnapshotToken'));
  assert.ok(route.includes("enquiry_source: 'snapshot_advisory'"));
  assert.ok(route.includes("eventType: 'advisory_enquiry_submitted'"));
});

// --- PUBLIC ADVISORY -----------------------------------------------------------------------------

check('the storefront Advisory CTA routes to the dedicated intake, never to /contact', () => {
  const presentation = read('src/lib/commercial/storefront-presentation.ts');
  assert.ok(presentation.includes("ctaHref: '/fraud-readiness/advisory'"));
  assert.ok(!presentation.includes('/contact?enquiry=mk-advisory'));
  for (const surface of [
    'src/lib/commercial/storefront-presentation.ts',
    'src/app/(website)/fraud-readiness/page.tsx',
    'src/components/website/FraudReadiness/FraudReadinessOptions.tsx'
  ]) {
    assert.ok(!/href="\/contact/.test(read(surface)), `${surface} must not route a product CTA to /contact`);
  }
  assert.ok(fs.existsSync(path.join(root, 'src/app/(website)/fraud-readiness/advisory/page.tsx')));
});

check('public Advisory requires no Snapshot token', () => {
  const route = read('src/app/score/api/enquiries/advisory/route.ts');
  assert.ok(!route.includes('validateSnapshotToken'), 'a pre-assessment prospect has no token to present');
  assert.ok(!route.includes('snapshotToken'));
  const parsed = parsePublicAdvisoryEnquiry(VALID_ADVISORY);
  assert.equal(parsed.ok, true);
});

check('public Advisory validation enforces the approved allow-lists', () => {
  for (const override of [
    { primaryReason: 'anything' },
    { areasOfFocus: ['not_a_real_area'] },
    { areasOfFocus: [] },
    { preferredContactMethod: 'carrier_pigeon' },
    { preferredConsultationTimeframe: 'someday' },
    { email: 'not-an-email' },
    { contactName: '' },
    { companyName: '' },
    { consentContact: false }
  ]) {
    const result = parsePublicAdvisoryEnquiry({ ...VALID_ADVISORY, ...override });
    assert.equal(result.ok, false, `${JSON.stringify(override)} must be refused`);
  }
});

check('public Advisory validation normalises and bounds what it accepts', () => {
  const result = parsePublicAdvisoryEnquiry({
    ...VALID_ADVISORY,
    contactName: '  Thandi   Nkosi  ',
    email: 'THANDI@EXAMPLE.CO.ZA',
    notes: `<script>alert(1)</script>${'x'.repeat(2000)}`
  });
  assert.equal(result.ok, true);
  assert.equal(result.data.contactName, 'Thandi Nkosi');
  assert.equal(result.data.email, 'thandi@example.co.za');
  assert.ok(!result.data.notes.includes('<'));
  assert.ok(result.data.notes.length <= 800);
});

await check('a public Advisory enquiry persists with null assessment, organisation and respondent', async () => {
  const db = fakeDb();
  const parsed = parsePublicAdvisoryEnquiry(VALID_ADVISORY);
  const enquiry = await persistPublicAdvisoryEnquiry(parsed.data, { db });
  const row = db.rows.data_requests[0];

  assert.equal(db.rows.data_requests.length, 1, 'exactly one enquiry row');
  assert.equal(row.request_type, 'mk_advisory');
  assert.equal(row.assessment_id, null);
  assert.equal(row.organisation_id, null);
  assert.equal(row.respondent_id, null);
  assert.equal(row.enquiry_source, 'public_advisory');
  assert.equal(row.requested_by_email, 'thandi@example.co.za');
  assert.equal(row.contact_name, 'Thandi Nkosi');
  assert.equal(row.company_name, 'Example Holdings');
  assert.equal(row.consent_contact, true);
  assert.equal(row.status, 'received');
  assert.match(row.request_reference, ENQUIRY_REFERENCE_PATTERN);
  assert.match(enquiry.requestReference, ENQUIRY_REFERENCE_PATTERN);
  // Nothing commercial is created.
  assert.equal(row.order_id, undefined);
  assert.equal(db.rows.email_events.length, 0, 'persistence alone must not send anything');
});

check('no fake assessment, organisation or respondent is fabricated for a lead', () => {
  const service = read('src/lib/enquiries/public-enquiry-service.ts');
  for (const table of ["from('assessments')", "from('organisations')", "from('respondents')"]) {
    assert.ok(!service.includes(table), `enquiry persistence must never write ${table}`);
  }
  assert.ok(service.includes('assessment_id: null'));
});

// --- WEBSITE CONTACT -----------------------------------------------------------------------------

check('Web3Forms is gone from the Contact submission path', () => {
  const contact = read('src/app/(website)/contact/page.tsx');
  assert.ok(!contact.includes('NEXT_PUBLIC_WEB3FORMS_ACCESS_KEY'), 'the access key dependency must be gone');
  assert.ok(!/fetch\(\s*["']https:\/\/api\.web3forms\.com/.test(contact), 'no browser POST to web3forms may remain');
  assert.ok(!contact.includes('access_key'));
  assert.ok(contact.includes("fetch(\"/score/api/enquiries/contact\""), 'the form must post to MK');
  // No dual delivery: exactly one submission target.
  const fetchTargets = [...contact.matchAll(/fetch\(\s*["']([^"']+)["']/g)].map((match) => match[1]);
  assert.deepEqual(fetchTargets, ['/score/api/enquiries/contact']);
});

await check('the Contact form is not represented as an Advisory enquiry', async () => {
  const db = fakeDb();
  const parsed = parseWebsiteContactEnquiry(VALID_CONTACT);
  assert.equal(parsed.ok, true);
  await persistWebsiteContactEnquiry(parsed.data, { db });
  const row = db.rows.data_requests[0];
  assert.equal(row.request_type, WEBSITE_CONTACT_REQUEST_TYPE);
  assert.notEqual(row.request_type, ADVISORY_REQUEST_TYPE);
  assert.equal(row.enquiry_source, 'website_contact');
  assert.equal(row.primary_reason, null, 'a general enquiry must not borrow the Advisory taxonomy');
  assert.equal(row.service_interest, 'fraud-health-check');
  assert.equal(row.notes, VALID_CONTACT.message);
  assert.match(row.request_reference, ENQUIRY_REFERENCE_PATTERN);
});

await check('selecting the Advisory service interest still files a website_contact enquiry', async () => {
  const db = fakeDb();
  const parsed = parseWebsiteContactEnquiry({ ...VALID_CONTACT, service: 'mk-advisory' });
  await persistWebsiteContactEnquiry(parsed.data, { db });
  assert.equal(db.rows.data_requests[0].request_type, WEBSITE_CONTACT_REQUEST_TYPE);
  assert.equal(db.rows.data_requests[0].service_interest, 'mk-advisory');
});

check('Contact validation rejects an incomplete or unapproved submission', () => {
  for (const override of [
    { name: '' },
    { email: 'nope' },
    { message: 'short' },
    { service: '' },
    { service: 'something-else' }
  ]) {
    const result = parseWebsiteContactEnquiry({ ...VALID_CONTACT, ...override });
    assert.equal(result.ok, false, `${JSON.stringify(override)} must be refused`);
  }
});

check('a failure to persist cannot produce a success state', () => {
  for (const route of ['src/app/score/api/enquiries/contact/route.ts', 'src/app/score/api/enquiries/advisory/route.ts']) {
    const source = read(route);
    const persistIndex = source.search(/await persist(WebsiteContact|PublicAdvisory)Enquiry/);
    const successIndex = source.indexOf('ok: true,\n      requestReference');
    assert.ok(persistIndex > -1 && successIndex > persistIndex, `${route} must persist before reporting success`);
    assert.ok(source.includes('{ status: 500 }'), `${route} must report a persistence failure as a failure`);
  }
  const contact = read('src/app/(website)/contact/page.tsx');
  assert.ok(contact.includes('if (!response.ok || !body.ok)'));
  assert.ok(/setIsSubmitted\(true\)/.test(contact));
  // setIsSubmitted(true) must not appear before the failure guard returns.
  const guard = contact.indexOf('if (!response.ok || !body.ok)');
  const success = contact.indexOf('setIsSubmitted(true)');
  assert.ok(guard < success, 'success may only be shown after the failure guard');
});

// --- SAFETY --------------------------------------------------------------------------------------

check('the honeypot is effective and silent on both intakes', () => {
  assert.equal(honeypotTripped({ botcheck: 'filled' }), true);
  assert.equal(honeypotTripped({ company_website: 'http://spam' }), true);
  assert.equal(honeypotTripped({ botcheck: '' }), false);
  assert.equal(honeypotTripped({}), false);
  for (const route of ['src/app/score/api/enquiries/contact/route.ts', 'src/app/score/api/enquiries/advisory/route.ts']) {
    const source = read(route);
    const honeypotIndex = source.indexOf('honeypotTripped(body)');
    const persistIndex = source.search(/await persist(WebsiteContact|PublicAdvisory)Enquiry/);
    assert.ok(honeypotIndex > -1 && honeypotIndex < persistIndex, `${route} must check the honeypot before persisting`);
    assert.ok(source.includes('ok: true, requestReference: makeEnquiryReference()'), 'a bot must not learn it was caught');
  }
});

check('both intakes are rate limited per IP and per email', () => {
  for (const route of ['src/app/score/api/enquiries/contact/route.ts', 'src/app/score/api/enquiries/advisory/route.ts']) {
    const source = read(route);
    assert.ok(source.includes('RATE_LIMITS.publicEnquiryPerIp()'));
    assert.ok(source.includes('RATE_LIMITS.publicEnquiryPerEmail()'));
    assert.ok(source.includes('{ status: 429 }'));
  }
  const limits = read('src/lib/security/rate-limit.ts');
  assert.ok(limits.includes('publicEnquiryPerIp'));
  assert.ok(limits.includes('publicEnquiryPerEmail'));
});

check('persistence is service-role only and no anon write path exists', () => {
  const service = read('src/lib/enquiries/public-enquiry-service.ts');
  assert.ok(service.includes('createSupabaseServiceClient'));
  const migration = read('supabase/migrations/20260831201000_public_enquiry_intake.sql');
  assert.ok(migration.includes('revoke all on table public.data_requests from anon, authenticated'));
  assert.ok(migration.includes('enable row level security'));
  // No service-role credential may be referenced from a client component.
  for (const clientFile of [
    'src/components/website/FraudReadiness/PublicAdvisoryEnquiryForm.tsx',
    'src/app/(website)/contact/page.tsx'
  ]) {
    const source = read(clientFile);
    assert.ok(!source.includes('SERVICE_ROLE'), `${clientFile} must never reference a service-role key`);
    assert.ok(!source.includes('createSupabaseServiceClient'));
  }
});

await check('exactly one notification is queued per persisted enquiry, and repeats are idempotent', async () => {
  const db = fakeDb();
  const enquiry = { id: 'dr-1', requestReference: 'MKENQ-2026-ABCDEF01', status: 'received', createdAt: 'now' };
  process.env.MK_INTERNAL_LEADS_EMAIL = 'leads@example.co.za';

  const first = await queuePublicEnquiryNotification(
    { notificationType: 'public_advisory_enquiry_submitted', enquiry, metadata: { a: 1 } },
    { db }
  );
  assert.equal(first.status, 'queued');
  assert.equal(db.rows.email_events.length, 1);
  const event = db.rows.email_events[0];
  assert.equal(event.assessment_id, null);
  assert.equal(event.data_request_id, 'dr-1');
  assert.equal(event.status, 'queued');
  assert.equal(event.dedupe_key, 'internal_notification:public_advisory_enquiry_submitted:enquiry:MKENQ-2026-ABCDEF01');
  assert.equal(event.metadata_json.request_reference, 'MKENQ-2026-ABCDEF01');
  assert.equal(event.metadata_json.order_created, false);
  assert.equal(event.metadata_json.report_generation, false);
  // The dedupe key is the enquiry reference, so a repeat for the same enquiry cannot double-send.
  assert.ok(event.dedupe_key.includes(enquiry.requestReference));
});

await check('a missing internal recipient is reported, not silently dropped', async () => {
  const db = fakeDb();
  const previous = process.env.MK_INTERNAL_LEADS_EMAIL;
  delete process.env.MK_INTERNAL_LEADS_EMAIL;
  const result = await queuePublicEnquiryNotification(
    {
      notificationType: 'website_contact_enquiry_submitted',
      enquiry: { id: 'dr-2', requestReference: 'MKENQ-2026-ABCDEF02', status: 'received', createdAt: 'now' },
      metadata: {}
    },
    { db }
  );
  assert.equal(result.ok, false);
  assert.equal(result.status, 'skipped_no_recipient');
  assert.equal(db.rows.email_events.length, 0);
  if (previous) process.env.MK_INTERNAL_LEADS_EMAIL = previous;
});

check('no enquiry path creates an order, payment or report', () => {
  for (const source of [
    read('src/app/score/api/enquiries/advisory/route.ts'),
    read('src/app/score/api/enquiries/contact/route.ts'),
    read('src/lib/enquiries/public-enquiry-service.ts')
  ]) {
    for (const forbidden of ["from('orders')", "from('reports')", 'createPaidOrder', 'generateReport', 'payfast']) {
      assert.ok(!source.includes(forbidden), `an enquiry path must never touch ${forbidden}`);
    }
  }
});

check('an audit row is written for every public enquiry', () => {
  const service = read('src/lib/enquiries/public-enquiry-service.ts');
  assert.ok(service.includes("from('audit_logs')"));
  assert.ok(service.includes("action: 'public_enquiry_created'"));
  for (const route of ['src/app/score/api/enquiries/advisory/route.ts', 'src/app/score/api/enquiries/contact/route.ts']) {
    assert.ok(read(route).includes('recordPublicEnquiryAudit'));
  }
});

// --- ADMIN QUEUE ---------------------------------------------------------------------------------

check('the admin queue distinguishes the three enquiry paths', () => {
  assert.equal(enquiryTypeLabel('mk_advisory', 'assessment-1'), 'MK Advisory — assessment linked');
  assert.equal(enquiryTypeLabel('mk_advisory', null), 'MK Advisory — public enquiry');
  assert.equal(enquiryTypeLabel('website_contact', null), 'Website contact');
  assert.equal(enquiryTypeLabel('personalised_report_50000', 'assessment-1'), 'Personalised report (historical)');
});

check('the admin queue reads identity from either shape', () => {
  const linked = { respondents: { full_name: 'Linked Person', email: 'linked@example.co.za' }, organisations: { legal_name: 'Linked Ltd' } };
  const publicRow = { respondents: null, organisations: null, contact_name: 'Public Person', company_name: 'Public Ltd', requested_by_email: 'public@example.co.za' };
  assert.equal(enquiryContactName(linked), 'Linked Person');
  assert.equal(enquiryContactName(publicRow), 'Public Person');
  assert.equal(enquiryOrganisationName(linked), 'Linked Ltd');
  assert.equal(enquiryOrganisationName(publicRow), 'Public Ltd');
  assert.equal(enquiryOrganisationName({}), 'Not captured');
});

check('the admin queue queries all enquiry types and the lead columns', () => {
  const lib = read('src/lib/admin/personalised-enquiries.ts');
  assert.ok(lib.includes('ADMIN_ENQUIRY_REQUEST_TYPES'));
  assert.ok(lib.includes('WEBSITE_CONTACT_REQUEST_TYPE'));
  for (const column of ['contact_name', 'company_name', 'contact_phone', 'service_interest', 'enquiry_source']) {
    assert.ok(lib.includes(column), `the admin reader must select ${column}`);
  }
  // Search must reach a public enquiry, which has no respondent row to join through.
  assert.ok(lib.includes('contact_name.ilike'));
  assert.ok(lib.includes('company_name.ilike'));
  const listPage = read('src/app/score/admin/enquiries/page.tsx');
  assert.ok(listPage.includes('enquiryTypeLabel(enquiry.request_type, enquiry.assessment_id)'));
});

// --- MIGRATION -----------------------------------------------------------------------------------

check('the enquiry migration is additive and orders after the terms migration', () => {
  const migration = read('supabase/migrations/20260831201000_public_enquiry_intake.sql');
  for (const column of ['contact_name', 'company_name', 'contact_phone', 'service_interest', 'enquiry_source']) {
    assert.ok(migration.includes(`add column if not exists ${column}`));
  }
  assert.ok(!/\bupdate\s+public\.data_requests\b/i.test(migration), 'no historical row may be rewritten');
  assert.ok(!/\bdelete\s+from\b/i.test(migration));
  assert.ok(!/\bdrop\s+column\b/i.test(migration));
  assert.ok(!/create table/i.test(migration), 'no second enquiry table');

  const all = fs.readdirSync(path.join(root, 'supabase/migrations')).filter((name) => name.endsWith('.sql')).sort();
  assert.equal(all[all.length - 1], '20260831201000_public_enquiry_intake.sql');
  assert.ok(all[all.length - 1].slice(0, 14) > '20260831153650', 'must order after the production ledger head');
  assert.ok(all[all.length - 1].slice(0, 14) > all[all.length - 2].slice(0, 14));
});

check('the migration keeps public Advisory inside the existing Advisory constraints', () => {
  const advisoryMigration = read('supabase/migrations/20260830170000_mk_advisory_enquiry_path.sql');
  // The accepted constraints are scoped by request_type, so they still bind a public enquiry.
  assert.ok(advisoryMigration.includes("request_type <> 'mk_advisory'"));
  assert.ok(advisoryMigration.includes('data_requests_advisory_consent_chk'));
  const migration = read('supabase/migrations/20260831201000_public_enquiry_intake.sql');
  assert.ok(migration.includes('data_requests_public_advisory_identity_chk'));
  assert.ok(migration.includes('data_requests_website_contact_chk'));
});

// --- ADAPTIVE START CONSENT CORRECTION -----------------------------------------------------------

check('the authority representation is not recorded as privacy consent', () => {
  const form = read('src/components/adaptive/AdaptiveStartForm.tsx');
  assert.ok(!/name="consentPrivacy"/.test(form), 'the mislabelled checkbox must be gone');
  assert.ok(!/I confirm I am authorised[^]{0,200}consentPrivacy/.test(form));
  const validation = read('src/lib/respondent/validation.ts');
  assert.ok(validation.includes('consentPrivacy: true'), 'privacy consent is derived from the versioned acknowledgement');
  assert.ok(/clause 1\.2/.test(validation), 'the reason must be recorded where the derivation happens');
  // Terms clause 1.2 still carries the authority representation.
  const termsContent = read('src/lib/legal/fraud-readiness-terms-content.ts');
  assert.ok(termsContent.includes('1.2 Authority to provide information'));
  assert.ok(/authorised by the organisation you name/.test(termsContent));
});

console.log(`\n${checks} checks passed${failures.length ? `, ${failures.length} FAILED` : ''}`);
if (failures.length) process.exit(1);
