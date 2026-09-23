import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  ACQUISITION_CONTEXT_STORAGE_KEY,
  ACQUISITION_RETENTION_MS,
  captureAcquisitionContext,
  getCampaignAttribution,
  sanitiseCampaignAttribution,
} from '../src/lib/website/acquisition-context.ts';
import { recordCalendlyCommercialEvent } from '../src/lib/website/calendly-ledger.ts';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

function browserStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    values,
  };
}

const localStorage = browserStorage({
  mk_fraud_cookie_consent: 'accepted',
  mk_fraud_marketing_consent: 'declined',
});
global.window = {
  localStorage,
  location: { search: '' },
};

const start = Date.parse('2026-09-23T10:00:00.000Z');
const captured = captureAcquisitionContext(
  '?utm_source=google&utm_medium=cpc&utm_campaign=service_search&utm_term=fraud%20consultant&gclid=not-permitted',
  start,
);
assert.equal(captured.utm_source, 'google');
assert.equal(captured.utm_campaign, 'service_search');
assert.equal(captured.gclid, undefined, 'click IDs require marketing consent');
assert.equal(Date.parse(captured.expires_at) - start, ACQUISITION_RETENTION_MS);

const afterNavigation = captureAcquisitionContext('', start + 60_000);
assert.equal(afterNavigation.utm_campaign, 'service_search', 'untagged internal navigation preserves attribution');

localStorage.setItem('mk_fraud_marketing_consent', 'accepted');
const paidRefresh = captureAcquisitionContext('?utm_source=google&utm_campaign=second_touch&gclid=abc123', start + 120_000);
assert.equal(paidRefresh.gclid, 'abc123');
assert.deepEqual(getCampaignAttribution(), { utm_source: 'google', utm_campaign: 'second_touch' });

const stored = JSON.parse(localStorage.getItem(ACQUISITION_CONTEXT_STORAGE_KEY));
assert.equal(stored.gclid, 'abc123', 'consented click ID stays browser-local');
assert.deepEqual(
  sanitiseCampaignAttribution({ utm_source: ' google ', gclid: 'must-not-persist', email: 'pii@example.com' }),
  { utm_source: 'google' },
);

const contact = read('src/app/(website)/contact/page.tsx');
assert.match(contact, /trackEvent\("service_enquiry_submitted"/);
assert.ok(!contact.includes('trackEvent("generate_lead"'));
assert.ok(!contact.includes('trackEvent("website_contact_submitted"'));
assert.ok(contact.indexOf('if (body.persisted === true)') < contact.indexOf('trackEvent("service_enquiry_submitted"'));
const contactRoute = read('src/app/score/api/enquiries/contact/route.ts');
assert.ok(contactRoute.includes('persisted: false'));
assert.ok(contactRoute.includes('persisted: true'));
for (const forbidden of ['name:', 'email:', 'phone:', 'company:', 'message:']) {
  const eventBlock = contact.slice(contact.indexOf('trackEvent("service_enquiry_submitted"'), contact.indexOf('setEnquiryReference'));
  assert.ok(!eventBlock.includes(forbidden), `GA4 event must not contain ${forbidden}`);
}

const calendly = read('src/components/website/CalendlyBooking.tsx');
assert.match(calendly, /initInlineWidget/);
for (const key of ['utmSource', 'utmMedium', 'utmCampaign', 'utmTerm', 'utmContent']) assert.ok(calendly.includes(key));
assert.match(calendly, /message\.origin !== CALENDLY_ORIGIN/);
assert.match(calendly, /message\.data\.event !== 'calendly\.event_scheduled'/);
assert.ok(calendly.indexOf("message.data.event !== 'calendly.event_scheduled'") < calendly.indexOf("trackEvent('service_consultation_booked'"));
assert.ok(calendly.includes('claimedBookingsRef'));
assert.ok(calendly.includes('window.sessionStorage'));
assert.ok(!/trackEvent\('service_consultation_booked',[\s\S]*?(email|name|phone|invitee)/.test(calendly));

const bookingRoute = read('src/app/score/api/commercial-events/calendly/route.ts');
const bookingLedger = read('src/lib/website/calendly-ledger.ts');
assert.ok(bookingRoute.includes('recordCalendlyCommercialEvent'));
assert.ok(bookingLedger.includes("from('audit_logs')"));
assert.ok(bookingLedger.includes("action: 'service_consultation_booked'"));
assert.ok(bookingLedger.includes("String(error.code) !== '23505'"));
assert.ok(bookingLedger.includes('sanitiseCampaignAttribution'));
assert.ok(!bookingLedger.includes('gclid'));
assert.ok(!bookingLedger.includes("from('assessment_events')"));

const insertedRows = [];
const recorded = await recordCalendlyCommercialEvent({
  eventUri: 'https://api.calendly.com/scheduled_events/event-123',
  inviteeUri: 'https://api.calendly.com/scheduled_events/event-123/invitees/invitee-456',
  attribution: { utm_source: 'google', gclid: 'must-not-persist', email: 'must-not-persist@example.com' },
}, {
  db: { from: () => ({ insert: async (row) => { insertedRows.push(row); return { error: null }; } }) },
});
assert.equal(recorded, 'recorded');
assert.equal(insertedRows.length, 1);
assert.equal(insertedRows[0].action, 'service_consultation_booked');
assert.deepEqual(insertedRows[0].after_json.attribution, { utm_source: 'google' });
assert.equal(JSON.stringify(insertedRows[0]).includes('must-not-persist'), false);

const duplicate = await recordCalendlyCommercialEvent({
  eventUri: 'https://api.calendly.com/scheduled_events/event-123',
  inviteeUri: null,
  attribution: {},
}, {
  db: { from: () => ({ insert: async () => ({ error: { code: '23505' } }) }) },
});
assert.equal(duplicate, 'already_recorded');

const enquiryService = read('src/lib/enquiries/public-enquiry-service.ts');
assert.ok(enquiryService.includes('attribution: input.attribution ?? {}'));
assert.ok(!enquiryService.includes('attribution_json: input.attribution'));

console.log('Service acquisition measurement checks passed (consent, attribution, success gating, Calendly completion, dedupe, PII boundary).');
