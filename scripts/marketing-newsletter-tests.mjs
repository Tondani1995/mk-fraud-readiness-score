// MK Fraud Signals newsletter: acceptance tests for consent, suppression, restriction and webhook
// controls. Pure rules run everywhere. Database rules run against the real migration in an
// embedded Postgres (PGlite) when MK_PGLITE_DIR points at a folder with @electric-sql/pglite
// installed (see scripts/lib/readiness-review-pglite-client.mjs for the same convention).
//
//   node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/marketing-newsletter-tests.mjs
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { CONSENT_WORDING, CONSENT_WORDING_VERSION, consentWordingSha256, sanitiseSourcePath } from '../src/lib/marketing/consent.ts';
import { CONSENT_WORDING_DISPLAY } from '../src/lib/marketing/consent-wording.ts';
import { normaliseNewsletterEmail, isPersonalMailboxDomain } from '../src/lib/marketing/email-address.ts';
import {
  applyProviderEffect,
  decideDistributionEligibility,
  mapResendMarketingEvent,
  planResendContactSync
} from '../src/lib/marketing/subscription-state.ts';
import { screenSubscriberAgainstAttio, resetRestrictionCacheForTests } from '../src/lib/marketing/attio-restrictions.ts';
import { applyResendSyncPlan, readRemoteContact, MarketingRecipientNotAllowedError } from '../src/lib/marketing/resend-marketing.ts';
import { verifyResendWebhook } from '../src/lib/reports/email/resend-webhook.ts';

const results = [];
async function test(id, name, fn) {
  try {
    await fn();
    results.push({ id, name, status: 'PASS' });
  } catch (error) {
    results.push({ id, name, status: 'FAIL', error: error?.stack ?? String(error) });
  }
}

// ---------------------------------------------------------------- consent contract
const PINNED_WORDING_SHA = 'pin-on-first-run';
await test('T05', 'consent wording is versioned, hashed and identical on screen and in evidence', () => {
  assert.equal(CONSENT_WORDING, CONSENT_WORDING_DISPLAY.before + CONSENT_WORDING_DISPLAY.link + CONSENT_WORDING_DISPLAY.after);
  assert.match(CONSENT_WORDING_VERSION, /^mk-fraud-signals-consent-v\d+-\d{4}-\d{2}-\d{2}$/);
  const sha = consentWordingSha256();
  assert.match(sha, /^[0-9a-f]{64}$/);
  const pinFile = path.join(process.cwd(), 'scripts', 'marketing-consent-wording.pin.json');
  const pins = fs.existsSync(pinFile) ? JSON.parse(fs.readFileSync(pinFile, 'utf8')) : {};
  if (pins[CONSENT_WORDING_VERSION]) {
    assert.equal(pins[CONSENT_WORDING_VERSION], sha, 'consent wording changed without a new CONSENT_WORDING_VERSION');
  } else if (PINNED_WORDING_SHA === 'pin-on-first-run') {
    pins[CONSENT_WORDING_VERSION] = sha;
    fs.writeFileSync(pinFile, JSON.stringify(pins, null, 2) + '\n');
  }
  for (const required of ['MK Fraud Signals', 'weekly', 'unsubscribe at any time', 'Privacy Policy', 'Resend']) {
    assert.ok(CONSENT_WORDING.includes(required), `consent wording must state: ${required}`);
  }
});

await test('T04', 'voluntary subscription: form is unbundled and consent box starts unticked', () => {
  const form = fs.readFileSync('src/components/website/newsletter/NewsletterSignup.tsx', 'utf8');
  assert.match(form, /useState\(false\)/, 'consent must default to false');
  assert.doesNotMatch(form, /defaultChecked|checked=\{true\}/);
  const route = fs.readFileSync('src/app/api/newsletter/subscribe/route.ts', 'utf8');
  assert.match(route, /body\.consent !== true/);
  // The newsletter is never wired into assessment, enquiry or order flows.
  const offenders = [];
  for (const dir of ['src/app/score', 'src/app/review', 'src/lib/enquiries', 'src/components/readiness-review']) {
    if (!fs.existsSync(dir)) continue;
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(tsx?|mjs)$/.test(e.name) && /newsletter\/subscribe|NewsletterSignup/.test(fs.readFileSync(p, 'utf8'))) offenders.push(p);
    });
    walk(dir);
  }
  assert.deepEqual(offenders, []);
  // Every visible surface is off unless the owner enables it.
  assert.match(fs.readFileSync('src/lib/marketing/newsletter-flag.ts', 'utf8'), /NEXT_PUBLIC_MK_NEWSLETTER_ENABLED === 'true'/);
  for (const page of ['src/app/(website)/mk-fraud-signals/page.tsx', 'src/app/(website)/mk-fraud-signals/confirm/page.tsx']) {
    assert.match(fs.readFileSync(page, 'utf8'), /if \(!NEWSLETTER_ENABLED\) notFound\(\);/);
  }
  assert.match(fs.readFileSync('src/components/website/Footer.tsx', 'utf8'), /\{NEWSLETTER_ENABLED \? \(/);
  assert.match(fs.readFileSync('src/lib/marketing/resend-marketing.ts', 'utf8'), /return raw === 'test' \|\| raw === 'live' \? raw : 'disabled';/);
});

await test('T04b', 'address and source-path normalisation never stores private paths', () => {
  assert.equal(normaliseNewsletterEmail('  Person@Example.CO.ZA '), 'person@example.co.za');
  assert.equal(normaliseNewsletterEmail('not-an-email'), null);
  assert.equal(normaliseNewsletterEmail('a@b'), null);
  assert.equal(sanitiseSourcePath('/insights/some-article?utm_source=x#top'), '/insights/some-article');
  assert.equal(sanitiseSourcePath('/score/result/abc?token=secret'), null);
  assert.equal(sanitiseSourcePath('//evil.example/path'), null);
  assert.equal(isPersonalMailboxDomain('gmail.com'), true);
  assert.equal(isPersonalMailboxDomain('mkfraud.co.za'), false);
});

// ---------------------------------------------------------------- pure state rules
const subscribed = {
  status: 'subscribed', holdReason: null, suppressionReason: null,
  consentConfirmedAt: '2026-11-27T10:00:00.000Z', unsubscribedAt: null, suppressedAt: null,
  restrictionDecision: 'clear', resendContactId: 'c1', lastSyncedAt: '2026-11-27T10:05:00.000Z'
};
const remoteOk = { exists: true, contactId: 'c1', unsubscribed: false, topicSubscription: 'opt_in', inSignalsSegment: true, suppressed: false };

await test('T18', 'broadcast audience: eligibility requires every condition positively true', () => {
  assert.equal(decideDistributionEligibility(subscribed, remoteOk).eligible, true);
  assert.equal(decideDistributionEligibility(subscribed, null).eligible, false, 'unknown provider state fails closed');
  assert.equal(decideDistributionEligibility({ ...subscribed, restrictionDecision: 'unchecked' }, remoteOk).eligible, false);
  assert.equal(decideDistributionEligibility(subscribed, { ...remoteOk, topicSubscription: null }).eligible, false, 'segment membership alone is not eligibility');
  assert.equal(decideDistributionEligibility(subscribed, { ...remoteOk, unsubscribed: null }).eligible, false);
  assert.equal(decideDistributionEligibility(subscribed, { ...remoteOk, contactId: 'other' }).eligible, false);
});

await test('T12', 'unknown consent prevention: no confirmed consent, no sync and no eligibility', () => {
  const noConsent = { ...subscribed, consentConfirmedAt: null };
  assert.equal(decideDistributionEligibility(noConsent, remoteOk).eligible, false);
  assert.equal(planResendContactSync(noConsent, { ...remoteOk, exists: false, contactId: null }).action, 'hold');
  assert.equal(planResendContactSync({ ...subscribed, status: 'pending_confirmation' }, remoteOk).action, 'none');
});

await test('T08', 'global unsubscribe in Resend can never be overwritten by stale local state', () => {
  const stale = planResendContactSync(subscribed, { ...remoteOk, unsubscribed: true });
  assert.equal(stale.action, 'hold');
  // Missed webhook: no withdrawal recorded locally, but a sync succeeded after the consent.
  assert.equal(planResendContactSync({ ...subscribed, unsubscribedAt: null }, { ...remoteOk, unsubscribed: true }).action, 'hold');
  const effect = mapResendMarketingEvent({ type: 'contact.updated', data: { email: 'P@x.com', unsubscribed: true } }, 'topic-1');
  assert.deepEqual(effect, { kind: 'global_unsubscribe', email: 'p@x.com' });
  const next = applyProviderEffect(subscribed, effect, '2026-11-28T09:00:00.000Z');
  assert.equal(next.status, 'unsubscribed');
});

await test('T09', 'topic-specific unsubscribe is honoured and blocks distribution', () => {
  const effect = mapResendMarketingEvent({ type: 'contact.topics.updated', data: { email: 'p@x.com', topics: [{ id: 'topic-1', subscription: 'opt_out' }] } }, 'topic-1');
  assert.equal(effect.kind, 'topic_opt_out');
  assert.equal(applyProviderEffect(subscribed, effect, '2026-11-28T09:00:00.000Z').status, 'unsubscribed');
  assert.equal(planResendContactSync(subscribed, { ...remoteOk, topicSubscription: 'opt_out' }).action, 'hold');
  const other = mapResendMarketingEvent({ type: 'contact.topics.updated', data: { email: 'p@x.com', topics: [{ id: 'other', subscription: 'opt_out' }] } }, 'topic-1');
  assert.equal(other.kind, 'ignored');
});

await test('T10', 'resubscription requires fresh confirmed consent newer than the withdrawal', () => {
  const withdrawn = { ...subscribed, status: 'subscribed', unsubscribedAt: '2026-11-28T09:00:00.000Z', consentConfirmedAt: '2026-11-27T10:00:00.000Z' };
  assert.equal(planResendContactSync(withdrawn, { ...remoteOk, unsubscribed: true }).action, 'hold');
  const fresh = { ...withdrawn, consentConfirmedAt: '2026-11-29T10:00:00.000Z' };
  const plan = planResendContactSync(fresh, { ...remoteOk, unsubscribed: true, topicSubscription: 'opt_out', inSignalsSegment: false });
  assert.equal(plan.action, 'apply');
  assert.equal(plan.setUnsubscribed, false);
  // Re-ticking the topic on Resend's preference page is not MK-evidenced consent.
  const reoptin = mapResendMarketingEvent({ type: 'contact.topics.updated', data: { email: 'p@x.com', topics: [{ id: 'topic-1', subscription: 'opt_in' }] } }, 'topic-1');
  const held = applyProviderEffect({ ...subscribed, status: 'unsubscribed', unsubscribedAt: '2026-11-28T09:00:00.000Z' }, reoptin, '2026-11-29T09:00:00.000Z');
  assert.equal(held.status, 'held');
  assert.equal(held.holdReason, 'provider_resubscribe_without_fresh_consent');
});

await test('T13', 'hard bounce and complaint suppress; soft bounce and transactional events do not', () => {
  const hard = mapResendMarketingEvent({ type: 'email.bounced', data: { broadcast_id: 'b', to: ['p@x.com'], bounce: { type: 'Permanent' } } }, 't');
  assert.equal(hard.kind, 'hard_bounce');
  const soft = mapResendMarketingEvent({ type: 'email.bounced', data: { broadcast_id: 'b', to: ['p@x.com'], bounce: { type: 'Transient' } } }, 't');
  assert.equal(soft.kind, 'ignored');
  const complaint = mapResendMarketingEvent({ type: 'email.complained', data: { broadcast_id: 'b', to: ['p@x.com'] } }, 't');
  const suppressed = applyProviderEffect(subscribed, complaint, '2026-11-28T09:00:00.000Z');
  assert.equal(suppressed.status, 'suppressed');
  assert.equal(suppressed.suppressionReason, 'complaint');
  assert.equal(applyProviderEffect(suppressed, hard, '2026-11-29T09:00:00.000Z').suppressionReason, 'complaint', 'reason never downgrades');
  const transactional = mapResendMarketingEvent({ type: 'email.bounced', data: { to: ['p@x.com'], bounce: { type: 'Permanent' } } }, 't');
  assert.equal(transactional.kind, 'ignored', 'Fraud Readiness transactional events are not marketing events');
  // Suppressed people are pushed out of the segment and never re-added.
  const plan = planResendContactSync(suppressed, remoteOk);
  assert.equal(plan.action, 'apply');
  assert.equal(plan.removeFromSignalsSegment, true);
  assert.equal(plan.addToSignalsSegment, false);
});

// ---------------------------------------------------------------- webhook signature
const webhookSecret = 'whsec_' + Buffer.from('mk-test-marketing-secret-0123456789').toString('base64');
function sign(id, ts, body, secret = webhookSecret) {
  const key = Buffer.from(secret.slice(6), 'base64');
  return 'v1,' + crypto.createHmac('sha256', key).update(`${id}.${ts}.${body}`).digest('base64');
}
await test('T14', 'invalid webhook signature, stale timestamp and missing headers are rejected', () => {
  const body = JSON.stringify({ type: 'contact.updated', created_at: new Date().toISOString(), data: { email: 'p@x.com', unsubscribed: true } });
  const ts = String(Math.floor(Date.now() / 1000));
  assert.doesNotThrow(() => verifyResendWebhook({ payload: body, id: 'msg_1', timestamp: ts, signature: sign('msg_1', ts, body), secret: webhookSecret }));
  assert.throws(() => verifyResendWebhook({ payload: body, id: 'msg_1', timestamp: ts, signature: sign('msg_1', ts, body, 'whsec_' + Buffer.from('other').toString('base64')), secret: webhookSecret }), /invalid/i);
  assert.throws(() => verifyResendWebhook({ payload: body + ' ', id: 'msg_1', timestamp: ts, signature: sign('msg_1', ts, body), secret: webhookSecret }), /invalid/i);
  const old = String(Math.floor(Date.now() / 1000) - 3600);
  assert.throws(() => verifyResendWebhook({ payload: body, id: 'msg_1', timestamp: old, signature: sign('msg_1', old, body), secret: webhookSecret }), /replay window/);
  assert.throws(() => verifyResendWebhook({ payload: body, id: null, timestamp: ts, signature: 'v1,x', secret: webhookSecret }), /missing/i);
  const route = fs.readFileSync('src/lib/marketing/runtime.ts', 'utf8');
  assert.match(route, /Never fall back to the transactional RESEND_WEBHOOK_SECRET/);
});

// ---------------------------------------------------------------- Attio restriction screen (HTTP mocked)
function attioFetch({ restricted = [], excluded = [], people = [], companies = [], fail = false }) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    if (fail) return new Response('{}', { status: 503 });
    if (url.includes('/lists/RESTRICTED/entries/query')) return Response.json({ data: restricted.map((id) => ({ parent_record_id: id })) });
    if (url.includes('/lists/REGISTER/entries/query')) return Response.json({ data: excluded.map((id) => ({ parent_record_id: id })) });
    if (url.includes('/objects/people/records/query')) return Response.json({ data: people });
    if (url.includes('/objects/companies/records/query')) return Response.json({ data: companies });
    return new Response('{}', { status: 404 });
  };
  return { fetchImpl, calls };
}
const attioConfig = (fetchImpl) => ({ token: 't', restrictedListId: 'RESTRICTED', commercialRegisterListId: 'REGISTER', exclusionStatusAttribute: 'relationship_status', exclusionStatuses: ['Excluded'], fetchImpl });
const person = (id, companyIds) => ({ id: { record_id: id }, values: { company: companyIds.map((c) => ({ target_record_id: c })) } });
const company = (id) => ({ id: { record_id: id } });

await test('T11', 'restricted organisation prevention across both registers, aliases and related people', async () => {
  resetRestrictionCacheForTests();
  let mock = attioFetch({ restricted: ['co-restricted'], companies: [company('co-restricted')] });
  assert.equal((await screenSubscriberAgainstAttio('analyst@restricted-alias.co.za', attioConfig(mock.fetchImpl))).decision, 'restricted', 'domain alias stored on the restricted company');
  resetRestrictionCacheForTests();
  mock = attioFetch({ excluded: ['co-excluded'], people: [person('p1', ['co-excluded'])] });
  assert.equal((await screenSubscriberAgainstAttio('someone@gmail.com', attioConfig(mock.fetchImpl))).decision, 'restricted', 'personal mailbox linked to an excluded company in the commercial register');
  const registerCall = mock.calls.find((c) => c.url.includes('/lists/REGISTER/'));
  assert.deepEqual(registerCall.body.filter, { $or: [{ relationship_status: { status: { $eq: 'Excluded' } } }] });
  resetRestrictionCacheForTests();
  mock = attioFetch({ restricted: ['p9'], people: [person('p9', [])] });
  assert.equal((await screenSubscriberAgainstAttio('named@person.co.za', attioConfig(mock.fetchImpl))).decision, 'restricted', 'restricted person record');
});

await test('T11b', 'ambiguous associations and Attio outages fail closed', async () => {
  resetRestrictionCacheForTests();
  let mock = attioFetch({ people: [person('p1', []), person('p2', [])] });
  assert.equal((await screenSubscriberAgainstAttio('dup@co.za', attioConfig(mock.fetchImpl))).decision, 'ambiguous');
  resetRestrictionCacheForTests();
  mock = attioFetch({ companies: [company('a'), company('b')] });
  assert.equal((await screenSubscriberAgainstAttio('x@shared.co.za', attioConfig(mock.fetchImpl))).decision, 'ambiguous');
  resetRestrictionCacheForTests();
  mock = attioFetch({ fail: true });
  assert.equal((await screenSubscriberAgainstAttio('x@any.co.za', attioConfig(mock.fetchImpl))).decision, 'unchecked');
  assert.equal((await screenSubscriberAgainstAttio('x@any.co.za', null)).decision, 'unchecked', 'missing configuration is never "clear"');
  resetRestrictionCacheForTests();
  mock = attioFetch({});
  assert.equal((await screenSubscriberAgainstAttio('new@unknown.co.za', attioConfig(mock.fetchImpl))).decision, 'clear');
  assert.ok(mock.calls.every((c) => c.url.includes('/query')), 'the screen only reads');
});

// ---------------------------------------------------------------- Resend adapter (HTTP mocked)
function resendMock(initial = {}) {
  const state = { contact: initial.contact ?? null, topics: initial.topics ?? [], segments: initial.segments ?? [], suppressed: initial.suppressed ?? false };
  const calls = [];
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ method: init.method, path: u.pathname, body });
    const p = u.pathname;
    if (p.startsWith('/suppressions/')) return state.suppressed ? Response.json({ id: 's' }) : new Response('{}', { status: 404 });
    if (init.method === 'GET' && /^\/contacts\/[^/]+$/.test(p)) return state.contact ? Response.json(state.contact) : new Response('{}', { status: 404 });
    if (init.method === 'GET' && p.endsWith('/topics')) return Response.json({ data: state.topics });
    if (init.method === 'GET' && p.endsWith('/segments')) return Response.json({ data: state.segments.map((id) => ({ id })) });
    if (init.method === 'POST' && p === '/contacts') { state.contact = { id: 'new-c', unsubscribed: body.unsubscribed }; state.topics = body.topics; return Response.json({ id: 'new-c' }); }
    if (init.method === 'PATCH' && p.endsWith('/topics')) { state.topics = body.topics; return Response.json({}); }
    if (init.method === 'PATCH') { Object.assign(state.contact, body); return Response.json({}); }
    if (init.method === 'POST' && p.includes('/segments/')) { state.segments.push(p.split('/').pop()); return Response.json({}); }
    if (init.method === 'DELETE' && p.includes('/segments/')) { state.segments = state.segments.filter((s) => s !== p.split('/').pop()); return Response.json({}); }
    if (init.method === 'POST' && p === '/emails') return Response.json({ id: 'email-1' });
    return new Response('{}', { status: 500 });
  };
  return { state, calls, fetchImpl };
}
const resendConfig = (fetchImpl, mode = 'test') => ({ apiKey: 'k', mode, topicId: 'topic-1', segmentId: 'seg-qa', fromAddress: 'f', replyTo: 'r', testAllowlist: new Set(['qa@mkfraud.co.za']), fetchImpl });

await test('T17', 'test mode refuses every non-allowlisted recipient before any request', async () => {
  const mock = resendMock();
  await assert.rejects(readRemoteContact(resendConfig(mock.fetchImpl), 'real.person@company.co.za'), MarketingRecipientNotAllowedError);
  assert.equal(mock.calls.length, 0);
});

await test('T07', 'existing subscriber update never re-subscribes and adds the segment last', async () => {
  const mock = resendMock({ contact: { id: 'c1', unsubscribed: true }, topics: [{ id: 'topic-1', subscription: 'opt_out' }] });
  const config = resendConfig(mock.fetchImpl);
  const remote = await readRemoteContact(config, 'qa@mkfraud.co.za');
  assert.equal(planResendContactSync(subscribed, remote).action, 'hold', 'no newer consent: Resend withdrawal wins');
  const fresh = { ...subscribed, unsubscribedAt: '2026-11-01T00:00:00.000Z', consentConfirmedAt: '2026-11-27T10:00:00.000Z', lastSyncedAt: '2026-10-15T00:00:00.000Z' };
  const plan = planResendContactSync(fresh, remote);
  await applyResendSyncPlan(config, 'qa@mkfraud.co.za', plan, remote.contactId);
  const writes = mock.calls.filter((c) => c.method !== 'GET');
  assert.equal(writes.at(-1).path, '/contacts/c1/segments/seg-qa', 'segment membership is the last write');
  assert.equal(mock.state.contact.unsubscribed, false);
});

await test('T06', 'duplicate submission creates one contact; a concurrent create is never overwritten', async () => {
  const mock = resendMock();
  const config = resendConfig(mock.fetchImpl);
  const plan = planResendContactSync(subscribed, await readRemoteContact(config, 'qa@mkfraud.co.za'));
  assert.equal(plan.createContact, true);
  await applyResendSyncPlan(config, 'qa@mkfraud.co.za', plan, null);
  const again = planResendContactSync({ ...subscribed, resendContactId: 'new-c' }, await readRemoteContact(config, 'qa@mkfraud.co.za'));
  assert.equal(again.action, 'none');
  assert.equal(mock.calls.filter((c) => c.method === 'POST' && c.path === '/contacts').length, 1);
  const conflict = async () => new Response('{}', { status: 409 });
  await assert.rejects(applyResendSyncPlan(resendConfig(conflict), 'qa@mkfraud.co.za', plan, null), /replan_required/);
});

// ---------------------------------------------------------------- shared endpoint routing and lift detection
const { classifyResendEvent } = await import('../src/lib/marketing/resend-event-routing.ts');
const { planLiftsProviderWithdrawal } = await import('../src/lib/marketing/subscription-state.ts');

await test('W1', 'one shared endpoint: every event routes to exactly one isolated handler', () => {
  assert.equal(classifyResendEvent({ type: 'email.delivered', data: { email_id: 'e', to: ['x@y.z'] } }), 'transactional', 'Fraud Readiness mail stays transactional');
  assert.equal(classifyResendEvent({ type: 'email.bounced', data: { broadcast_id: 'b', to: ['x@y.z'] } }), 'marketing');
  assert.equal(classifyResendEvent({ type: 'email.delivered', data: { tags: { mk_stream: 'newsletter_confirmation' } } }), 'marketing', 'confirmation mail never reaches report delivery');
  assert.equal(classifyResendEvent({ type: 'email.delivered', data: { tags: [{ name: 'mk_stream', value: 'newsletter_confirmation' }] } }), 'marketing');
  for (const type of ['contact.updated', 'contact.deleted', 'contact.topics.updated', 'suppression.added', 'topic.updated']) {
    assert.equal(classifyResendEvent({ type, data: {} }), 'marketing', type);
  }
  for (const type of ['domain.updated', 'inbox.created', '', 'mystery']) assert.equal(classifyResendEvent({ type, data: {} }), 'ignore');
  const route = fs.readFileSync('src/app/api/webhooks/resend-events/route.ts', 'utf8');
  assert.match(route, /MK_RESEND_SHARED_WEBHOOK_TRANSACTIONAL\?\.trim\(\) !== 'enabled' \|\| !sharedSecretMatches/, 'transactional forwarding is opt-in and secret-matched');
  assert.ok(!fs.existsSync('src/app/api/webhooks/resend-marketing/route.ts'), 'no second marketing endpoint');
});

await test('W2', 'a plan that re-subscribes a withdrawn contact is always detected', () => {
  const base = { action: 'apply', createContact: false, setUnsubscribed: null, topic: null, addToSignalsSegment: false, removeFromSignalsSegment: false };
  assert.equal(planLiftsProviderWithdrawal({ ...base, setUnsubscribed: false }, { ...remoteOk, unsubscribed: true }), true);
  assert.equal(planLiftsProviderWithdrawal({ ...base, topic: 'opt_in' }, { ...remoteOk, topicSubscription: 'opt_out' }), true);
  assert.equal(planLiftsProviderWithdrawal({ ...base, topic: 'opt_in' }, { ...remoteOk, topicSubscription: null }), false, 'first enrolment is not a lift');
  assert.equal(planLiftsProviderWithdrawal({ ...base, setUnsubscribed: true }, remoteOk), false);
});

await test('S1', 'stale CRM data cannot drive sending: the integration never reads Attio newsletter mirror fields', () => {
  for (const file of fs.readdirSync('src/lib/marketing')) {
    const src = fs.readFileSync(path.join('src/lib/marketing', file), 'utf8');
    assert.doesNotMatch(src, /mk_newsletter_(subscription|consent|eligibility)|mk_resend_contact_id|mk_marketing_(sync|suppression|engagement)|mk_last_marketing/i, file);
    assert.doesNotMatch(src, /method:\s*'(PATCH|PUT|DELETE)'[\s\S]{0,80}api\.attio\.com/, `${file} never writes Attio`);
  }
});

// ---------------------------------------------------------------- database rules against the real migration
const pgliteDir = process.env.MK_PGLITE_DIR;
if (!pgliteDir) {
  results.push({ id: 'DB', name: 'database rules (PGlite)', status: 'SKIPPED', error: 'MK_PGLITE_DIR not set' });
} else {
  const { PGlite } = await import(pathToFileURL(path.join(pgliteDir, 'node_modules/@electric-sql/pglite/dist/index.js')).href);
  const db = new PGlite();
  await db.exec('create role anon nologin; create role authenticated nologin; create role service_role nologin;');
  await db.exec(fs.readFileSync('supabase/migrations/20261127120000_mk_fraud_signals_marketing_consent.sql', 'utf8'));
  const SIG = {
    marketing_request_subscription: { p_email: 'text', p_email_hash: 'text', p_permission: 'text', p_wording_version: 'text', p_wording_sha256: 'text', p_wording_text: 'text', p_source: 'text', p_source_path: 'text', p_ip_hash: 'text', p_user_agent_hash: 'text', p_token_hash: 'text', p_token_ttl_seconds: 'integer', p_cooldown_seconds: 'integer', p_evidence: 'jsonb' },
    marketing_peek_confirmation_token: { p_token_hash: 'text' },
    marketing_confirm_subscription: { p_token_hash: 'text', p_ip_hash: 'text', p_user_agent_hash: 'text', p_restriction_decision: 'text', p_restriction_evidence: 'jsonb' },
    marketing_apply_provider_effect: { p_provider_event_id: 'text', p_event_type: 'text', p_payload_sha256: 'text', p_email_hash: 'text', p_effect: 'text', p_occurred_at: 'timestamptz', p_detail: 'jsonb' },
    marketing_claim_provider_lift: { p_subscriber_id: 'uuid', p_expected_version: 'bigint' },
    marketing_record_sync_outcome: { p_subscriber_id: 'uuid', p_expected_version: 'bigint', p_outcome: 'text', p_resend_contact_id: 'text', p_error: 'text', p_hold_reason: 'text', p_restriction_decision: 'text', p_restriction_evidence: 'jsonb' },
    marketing_reconciliation_batch: { p_limit: 'integer' },
    marketing_audience_snapshot: {}
  };
  const client = (role = 'service_role') => ({
    async rpc(fn, args = {}) {
      const sig = SIG[fn];
      const names = Object.keys(sig);
      const values = names.map((n) => (args[n] === undefined || args[n] === null ? null : sig[n] === 'jsonb' ? JSON.stringify(args[n]) : args[n]));
      try {
        await db.exec(`set role ${role}`);
        const r = await db.query(`select public.${fn}(${names.map((n, i) => `${n} => $${i + 1}::${sig[n]}`).join(', ')}) as result`, values);
        return { data: r.rows[0].result, error: null };
      } catch (error) {
        return { data: null, error: { code: error.code, message: error.message } };
      } finally {
        await db.exec('reset role');
      }
    }
  });
  const { marketingStore } = await import('../src/lib/marketing/marketing-store.ts');
  const { requestNewsletterSubscription, confirmNewsletterSubscription, reconcileNewsletterBatch, hashConfirmationToken } = await import('../src/lib/marketing/newsletter-service.ts');
  const { newsletterEmailHash } = await import('../src/lib/marketing/email-address.ts');
  const store = marketingStore(client());
  const pepper = 'p'.repeat(40);
  let tokenCounter = 0;
  const sentEmails = [];
  const mock = resendMock();
  const baseDeps = (overrides = {}) => ({
    store, pepper, siteUrl: 'https://preview.example',
    resend: resendConfig(mock.fetchImpl),
    attio: null,
    screen: async () => ({ decision: 'clear', evidence: { detail: 'test_clear' } }),
    sendConfirmation: async (_c, input) => { sentEmails.push(input); return 'email-x'; },
    tokenBytes: () => `tok_${String(++tokenCounter).padStart(44, '0')}`,
    ...overrides
  });
  const tokenFromLastEmail = () => new URL(sentEmails.at(-1).confirmUrl).searchParams.get('token');
  const subRow = async (email) => (await db.query('select * from marketing.newsletter_subscribers where email_hash = $1', [newsletterEmailHash(email, pepper)])).rows[0];
  const input = (email) => ({ email, source: 'footer', sourcePath: '/insights', ip: '198.51.100.7', userAgent: 'UA', attribution: { utm_source: 'mk_fraud_signals' } });

  await test('DB-1', 'anon and authenticated cannot execute any marketing function or read any table', async () => {
    for (const role of ['anon', 'authenticated']) {
      const r = await client(role).rpc('marketing_audience_snapshot', {});
      assert.ok(r.error, `${role} must be denied`);
      await db.exec(`set role ${role}`);
      await assert.rejects(db.query('select * from marketing.newsletter_subscribers'));
      await db.exec('reset role');
    }
  });

  await test('T05-DB', 'consent evidence: wording, version, hash, source, time and hashed IP are recorded; events are append-only', async () => {
    await requestNewsletterSubscription(baseDeps(), input('qa@mkfraud.co.za'));
    const row = await subRow('qa@mkfraud.co.za');
    assert.equal(row.status, 'pending_confirmation');
    const ev = (await db.query("select * from marketing.newsletter_consent_events where subscriber_id = $1 and event_type = 'subscription_requested'", [row.id])).rows[0];
    assert.equal(ev.wording_text, CONSENT_WORDING);
    assert.equal(ev.wording_sha256, consentWordingSha256());
    assert.equal(ev.wording_version, CONSENT_WORDING_VERSION);
    assert.equal(ev.source, 'footer');
    assert.ok(ev.ip_hash && !String(ev.ip_hash).includes('198.51'));
    await assert.rejects(db.query('update marketing.newsletter_consent_events set source = $1 where id = $2', ['x', ev.id]), /append-only/);
    await assert.rejects(db.query('delete from marketing.newsletter_consent_events where id = $1', [ev.id]), /append-only/);
  });

  await test('T05b-DB', 'confirmation is single-use, scanner-safe (peek consumes nothing) and only the newest token works', async () => {
    const token = tokenFromLastEmail();
    assert.equal((await store.peekConfirmationToken(hashConfirmationToken(token))).state, 'valid');
    assert.equal((await store.peekConfirmationToken(hashConfirmationToken(token))).state, 'valid', 'a peek does not consume');
    const result = await confirmNewsletterSubscription(baseDeps(), { rawToken: token, ip: '1.2.3.4', userAgent: 'UA' });
    assert.equal(result.outcome, 'confirmed');
    const again = await confirmNewsletterSubscription(baseDeps(), { rawToken: token, ip: '1.2.3.4', userAgent: 'UA' });
    assert.equal(again.outcome, 'already_used');
    const row = await subRow('qa@mkfraud.co.za');
    assert.equal(row.status, 'subscribed');
    assert.ok(row.consent_confirmed_at);
    assert.equal(row.sync_status, 'synced', 'immediate provider sync succeeded');
    assert.ok(mock.state.segments.includes('seg-qa'));
  });

  await test('T06-DB', 'duplicate submission by a subscribed person sends nothing and changes nothing', async () => {
    const before = sentEmails.length;
    const r = await requestNewsletterSubscription(baseDeps(), input('qa@mkfraud.co.za'));
    assert.equal(r.action, 'already_subscribed');
    assert.equal(sentEmails.length, before);
    assert.equal((await subRow('qa@mkfraud.co.za')).status, 'subscribed');
  });

  await test('T15', 'duplicate webhook events are applied once', async () => {
    const hash = newsletterEmailHash('qa@mkfraud.co.za', pepper);
    const args = { p_provider_event_id: 'msg_dup_1', p_event_type: 'email.clicked', p_payload_sha256: 'x', p_email_hash: hash, p_effect: 'engagement_clicked', p_occurred_at: new Date().toISOString(), p_detail: {} };
    assert.equal((await store.applyProviderEffect(args)).outcome, 'engagement_recorded');
    assert.equal((await store.applyProviderEffect(args)).outcome, 'duplicate');
  });

  await test('T08-DB', 'global unsubscribe is sticky; a stale sync cannot overwrite it (version guard)', async () => {
    const row = await subRow('qa@mkfraud.co.za');
    const hash = newsletterEmailHash('qa@mkfraud.co.za', pepper);
    const r = await store.applyProviderEffect({ p_provider_event_id: 'msg_unsub_1', p_event_type: 'contact.updated', p_payload_sha256: 'y', p_email_hash: hash, p_effect: 'global_unsubscribe', p_occurred_at: new Date().toISOString(), p_detail: {} });
    assert.equal(r.outcome, 'withdrawn');
    const stale = await store.recordSyncOutcome({ p_subscriber_id: row.id, p_expected_version: Number(row.state_version), p_outcome: 'synced', p_resend_contact_id: 'c', p_error: null, p_hold_reason: null, p_restriction_decision: 'clear', p_restriction_evidence: null });
    assert.equal(stale.outcome, 'stale_version');
    assert.equal((await subRow('qa@mkfraud.co.za')).status, 'unsubscribed');
    // The reconciler then pushes the withdrawal outward to Resend.
    mock.state.contact.unsubscribed = false;
    await reconcileNewsletterBatch(baseDeps(), 10);
    assert.equal(mock.state.contact.unsubscribed, true);
    assert.ok(!mock.state.segments.includes('seg-qa'));
  });

  await test('T10-DB', 'resubscription needs a fresh confirmation; an old withdrawal does not undo it', async () => {
    await requestNewsletterSubscription(baseDeps(), input('qa@mkfraud.co.za'));
    assert.equal((await subRow('qa@mkfraud.co.za')).status, 'unsubscribed', 'a request alone changes nothing');
    const ev = (await db.query("select count(*)::int n from marketing.newsletter_consent_events e join marketing.newsletter_subscribers s on s.id = e.subscriber_id where s.email = 'qa@mkfraud.co.za' and e.event_type = 'resubscription_requested'")).rows[0];
    assert.equal(ev.n, 1);
    await new Promise((r) => setTimeout(r, 15));
    const result = await confirmNewsletterSubscription(baseDeps(), { rawToken: tokenFromLastEmail(), ip: null, userAgent: null });
    assert.equal(result.outcome, 'confirmed');
    assert.equal(mock.state.contact.unsubscribed, false, 'fresh newer consent lifts the provider withdrawal');
    const hash = newsletterEmailHash('qa@mkfraud.co.za', pepper);
    const late = await store.applyProviderEffect({ p_provider_event_id: 'msg_old_unsub', p_event_type: 'contact.updated', p_payload_sha256: 'z', p_email_hash: hash, p_effect: 'global_unsubscribe', p_occurred_at: '2026-01-01T00:00:00Z', p_detail: {} });
    assert.equal(late.outcome, 'ignored_superseded_by_newer_consent');
  });

  await test('T11-DB', 'a restricted subscriber is recorded as held, never subscribed or synced', async () => {
    await requestNewsletterSubscription(baseDeps(), input('qa2@mkfraud.co.za'));
    const restricted = baseDeps({ screen: async () => ({ decision: 'restricted', evidence: { detail: 'restricted_match' } }) });
    const result = await confirmNewsletterSubscription(restricted, { rawToken: tokenFromLastEmail(), ip: null, userAgent: null });
    assert.equal(result.outcome, 'held');
    const row = await subRow('qa2@mkfraud.co.za');
    assert.equal(row.status, 'held');
    assert.equal(row.hold_reason, 'restricted_organisation');
    await assert.rejects(db.query("update marketing.newsletter_subscribers set status = 'subscribed', hold_reason = null where id = $1", [row.id]), /subscribed_requires_consent/, 'schema forbids subscribed without a clear restriction decision');
  });

  await test('T12-DB', 'unknown consent: pending people are never reconciled into Resend', async () => {
    await requestNewsletterSubscription(baseDeps(), input('pending@mkfraud.co.za'));
    const batch = await store.reconciliationBatch(100);
    assert.ok(!batch.some((r) => r.email === 'pending@mkfraud.co.za'));
  });

  await test('T13-DB', 'complaint suppresses permanently; later requests send no email', async () => {
    const hash = newsletterEmailHash('qa@mkfraud.co.za', pepper);
    await store.applyProviderEffect({ p_provider_event_id: 'msg_complaint', p_event_type: 'email.complained', p_payload_sha256: 'c', p_email_hash: hash, p_effect: 'complaint', p_occurred_at: new Date().toISOString(), p_detail: {} });
    assert.equal((await subRow('qa@mkfraud.co.za')).status, 'suppressed');
    const before = sentEmails.length;
    assert.equal((await requestNewsletterSubscription(baseDeps(), input('qa@mkfraud.co.za'))).action, 'suppressed_no_email');
    assert.equal(sentEmails.length, before);
    await store.applyProviderEffect({ p_provider_event_id: 'msg_unsub_after', p_event_type: 'contact.updated', p_payload_sha256: 'd', p_email_hash: hash, p_effect: 'global_unsubscribe', p_occurred_at: new Date().toISOString(), p_detail: {} });
    assert.equal((await subRow('qa@mkfraud.co.za')).suppression_reason, 'complaint');
  });

  await test('T16', 'integration failure recovery: provider outage leaves pending/failed, the reconciler completes later', async () => {
    const down = async () => new Response('{}', { status: 503 });
    await requestNewsletterSubscription(baseDeps(), input('retry@mkfraud.co.za'));
    const outage = baseDeps({ resend: { ...resendConfig(down), testAllowlist: new Set(['retry@mkfraud.co.za']) } });
    const result = await confirmNewsletterSubscription(outage, { rawToken: tokenFromLastEmail(), ip: null, userAgent: null });
    assert.equal(result.outcome, 'confirmed');
    let row = await subRow('retry@mkfraud.co.za');
    assert.equal(row.status, 'subscribed');
    assert.equal(row.sync_status, 'failed');
    assert.equal(row.sync_attempts, 1);
    const healthy = resendMock();
    await reconcileNewsletterBatch(baseDeps({ resend: { ...resendConfig(healthy.fetchImpl), testAllowlist: new Set(['retry@mkfraud.co.za']) } }), 50);
    row = await subRow('retry@mkfraud.co.za');
    assert.equal(row.sync_status, 'synced');
    assert.ok(healthy.state.segments.includes('seg-qa'));
  });

  await test('T16b', 'Attio outage at confirmation holds; the reconciler releases it automatically once screened clear', async () => {
    await requestNewsletterSubscription(baseDeps(), input('attio-down@mkfraud.co.za'));
    const outage = baseDeps({ screen: async () => ({ decision: 'unchecked', evidence: { detail: 'attio_503' } }) });
    await confirmNewsletterSubscription(outage, { rawToken: tokenFromLastEmail(), ip: null, userAgent: null });
    assert.equal((await subRow('attio-down@mkfraud.co.za')).hold_reason, 'restriction_check_unavailable');
    const healthy = resendMock();
    const deps = baseDeps({ resend: { ...resendConfig(healthy.fetchImpl), testAllowlist: new Set(['attio-down@mkfraud.co.za']) } });
    await reconcileNewsletterBatch(deps, 50);
    assert.equal((await subRow('attio-down@mkfraud.co.za')).status, 'subscribed');
    await reconcileNewsletterBatch(deps, 50);
    assert.equal((await subRow('attio-down@mkfraud.co.za')).sync_status, 'synced');
    // ...but a restricted hold is never auto-released.
    await reconcileNewsletterBatch(deps, 50);
    assert.equal((await subRow('qa2@mkfraud.co.za')).status, 'held');
  });

  await test('T11c-DB', 'a restriction added later in Attio holds an existing subscriber and removes them from the segment', async () => {
    const healthy = resendMock();
    const deps = baseDeps({ resend: { ...resendConfig(healthy.fetchImpl), testAllowlist: new Set(['attio-down@mkfraud.co.za']) } });
    await db.query("update marketing.newsletter_subscribers set last_synced_at = now() - interval '2 days' where email = 'attio-down@mkfraud.co.za'");
    healthy.state.contact = { id: 'c9', unsubscribed: false };
    healthy.state.topics = [{ id: 'topic-1', subscription: 'opt_in' }];
    healthy.state.segments = ['seg-qa'];
    await reconcileNewsletterBatch({ ...deps, screen: async () => ({ decision: 'restricted', evidence: { detail: 'new_restriction' } }) }, 50);
    const row = await subRow('attio-down@mkfraud.co.za');
    assert.equal(row.status, 'held');
    assert.equal(row.hold_reason, 'restricted_organisation');
    assert.ok(!healthy.state.segments.includes('seg-qa'));
  });

  await test('C1', 'concurrency: parallel subscribe requests send one confirmation; parallel confirms consent once', async () => {
    const before = sentEmails.length;
    const [a, b] = await Promise.all([
      requestNewsletterSubscription(baseDeps(), input('race@mkfraud.co.za')),
      requestNewsletterSubscription(baseDeps(), input('race@mkfraud.co.za'))
    ]);
    assert.deepEqual([a.action, b.action].sort(), ['cooldown_no_email', 'send_confirmation']);
    assert.equal(sentEmails.length, before + 1);
    const token = tokenFromLastEmail();
    const outcomes = await Promise.all([
      confirmNewsletterSubscription(baseDeps(), { rawToken: token, ip: null, userAgent: null }),
      confirmNewsletterSubscription(baseDeps(), { rawToken: token, ip: null, userAgent: null })
    ]);
    const confirmedEvents = (await db.query("select count(*)::int n from marketing.newsletter_consent_events e join marketing.newsletter_subscribers s on s.id = e.subscriber_id where s.email = 'race@mkfraud.co.za' and e.event_type = 'confirmed'")).rows[0].n;
    assert.equal(confirmedEvents, 1);
    assert.ok(outcomes.some((o) => o.outcome === 'confirmed'));
  });

  await test('C2', 'out-of-order events: an older withdrawal after a newer suppression keeps suppression; a late provider re-opt-in never re-subscribes', async () => {
    const hash = newsletterEmailHash('race@mkfraud.co.za', pepper);
    const now = Date.now();
    await store.applyProviderEffect({ p_provider_event_id: 'ooo_sup', p_event_type: 'suppression.added', p_payload_sha256: 'a', p_email_hash: hash, p_effect: 'provider_suppression', p_occurred_at: new Date(now).toISOString(), p_detail: {} });
    const late = await store.applyProviderEffect({ p_provider_event_id: 'ooo_unsub', p_event_type: 'contact.updated', p_payload_sha256: 'b', p_email_hash: hash, p_effect: 'global_unsubscribe', p_occurred_at: new Date(now - 60_000).toISOString(), p_detail: {} });
    assert.equal(late.outcome, 'ignored_terminal_state');
    const reopt = await store.applyProviderEffect({ p_provider_event_id: 'ooo_reopt', p_event_type: 'contact.topics.updated', p_payload_sha256: 'c', p_email_hash: hash, p_effect: 'topic_opt_in_from_provider', p_occurred_at: new Date(now + 1000).toISOString(), p_detail: {} });
    assert.equal(reopt.outcome, 'no_change');
    assert.equal((await subRow('race@mkfraud.co.za')).status, 'suppressed');
  });

  await test('C3', 'missed webhook after a lift: the one permitted lift per consent cannot be claimed twice', async () => {
    // Fresh subscriber whose Resend contact pre-exists as unsubscribed (an old withdrawal).
    await requestNewsletterSubscription(baseDeps(), input('lift@mkfraud.co.za'));
    const provider = resendMock({ contact: { id: 'cl', unsubscribed: true }, topics: [{ id: 'topic-1', subscription: 'opt_out' }] });
    const deps = baseDeps({ resend: { ...resendConfig(provider.fetchImpl), testAllowlist: new Set(['lift@mkfraud.co.za']) } });
    // First sync after confirmation lifts it, but the outcome write fails (simulated outage).
    const failingStore = { ...store, recordSyncOutcome: async () => { throw new Error('supabase_down'); } };
    await assert.rejects(confirmNewsletterSubscription({ ...deps, store: failingStore }, { rawToken: tokenFromLastEmail(), ip: null, userAgent: null }));
    assert.equal(provider.state.contact.unsubscribed, false, 'the lift reached Resend');
    // The person unsubscribes again in Resend; the webhook is missed.
    provider.state.contact.unsubscribed = true;
    provider.state.topics = [{ id: 'topic-1', subscription: 'opt_out' }];
    await reconcileNewsletterBatch(deps, 100);
    assert.equal(provider.state.contact.unsubscribed, true, 'never re-subscribed by a retry');
    const row = await subRow('lift@mkfraud.co.za');
    assert.equal(row.status, 'held');
    assert.equal(row.hold_reason, 'provider_state_conflict');
  });

  await test('C4', 'delayed withdrawal event after a fresh confirmation applies when it happened later, is ignored when it happened earlier', async () => {
    await requestNewsletterSubscription(baseDeps(), input('delay@mkfraud.co.za'));
    await confirmNewsletterSubscription(baseDeps(), { rawToken: tokenFromLastEmail(), ip: null, userAgent: null });
    const hash = newsletterEmailHash('delay@mkfraud.co.za', pepper);
    const early = await store.applyProviderEffect({ p_provider_event_id: 'delay_early', p_event_type: 'contact.updated', p_payload_sha256: 'd', p_email_hash: hash, p_effect: 'global_unsubscribe', p_occurred_at: new Date(Date.now() - 86_400_000).toISOString(), p_detail: {} });
    assert.equal(early.outcome, 'ignored_superseded_by_newer_consent');
    const later = await store.applyProviderEffect({ p_provider_event_id: 'delay_later', p_event_type: 'contact.updated', p_payload_sha256: 'e', p_email_hash: hash, p_effect: 'global_unsubscribe', p_occurred_at: new Date(Date.now() + 1000).toISOString(), p_detail: {} });
    assert.equal(later.outcome, 'withdrawn');
  });

  await test('W3', 'shared endpoint marketing handler: duplicate deliveries apply once', async () => {
    const { applyMarketingWebhookEvent } = await import('../src/lib/marketing/marketing-webhook.ts');
    const args = { store, pepper, signalsTopicId: 'topic-1', providerEventId: 'msg_shared_1', payload: '{}', event: { type: 'email.complained', data: { broadcast_id: 'b', to: ['delay@mkfraud.co.za'] } }, occurredAt: new Date().toISOString() };
    assert.equal((await applyMarketingWebhookEvent(args)).outcome, 'suppressed');
    assert.equal((await applyMarketingWebhookEvent(args)).outcome, 'duplicate');
  });

  await test('T18-DB', 'audience snapshot reports counts only, no addresses', async () => {
    const snap = await store.audienceSnapshot();
    assert.ok(snap.by_status);
    assert.doesNotMatch(JSON.stringify(snap), /@/);
  });
}

// ---------------------------------------------------------------- report
const failed = results.filter((r) => r.status === 'FAIL');
for (const r of results) console.log(`${r.status.padEnd(7)} ${r.id.padEnd(8)} ${r.name}${r.status === 'FAIL' ? '\n' + r.error : r.status === 'SKIPPED' ? ` (${r.error})` : ''}`);
console.log(`\n${results.filter((r) => r.status === 'PASS').length} passed, ${failed.length} failed, ${results.filter((r) => r.status === 'SKIPPED').length} skipped`);
if (process.env.MK_MARKETING_TEST_RESULTS) fs.writeFileSync(process.env.MK_MARKETING_TEST_RESULTS, JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
