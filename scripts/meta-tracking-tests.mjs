import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const url = (rel) => pathToFileURL(path.join(process.cwd(), rel)).href;

process.env.NEXT_PUBLIC_META_PIXEL_ID = '';
const pixelUnconfigured = await import(`${url('src/lib/website/meta/pixel.ts')}?unconfigured`);
process.env.NEXT_PUBLIC_META_PIXEL_ID = '1234567890';
const pixel = await import(`${url('src/lib/website/meta/pixel.ts')}?configured`);

const consent = await import(url('src/lib/website/meta/consent.ts'));
const routes = await import(url('src/lib/website/meta/routes.ts'));
const events = await import(url('src/lib/website/meta/events.ts'));
const eventId = await import(url('src/lib/website/meta/event-id.ts'));
const capi = await import(url('src/lib/server/meta/capi.ts'));

let checks = 0;
function check(label, fn) {
  fn();
  checks += 1;
  console.log(`  ok - ${label}`);
}
async function checkAsync(label, fn) {
  await fn();
  checks += 1;
  console.log(`  ok - ${label}`);
}

/** Minimal browser double: localStorage, fbq recorder, fetch recorder. */
function setBrowser({ marketing = 'accepted', withFbq = true, pathname = '/fraud-readiness' } = {}) {
  const store = new Map();
  if (marketing !== 'unset') store.set('mk_fraud_marketing_consent', marketing);
  const fbqCalls = [];
  const fetchCalls = [];
  global.window = {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
    },
    location: { pathname, hostname: 'www.mkfraud.co.za', href: `https://www.mkfraud.co.za${pathname}` },
    dispatchEvent: () => true,
    fbq: withFbq ? (...args) => fbqCalls.push(args) : undefined,
  };
  global.fetch = (endpoint, init) => {
    fetchCalls.push({ endpoint, body: JSON.parse(init.body) });
    return Promise.resolve({ ok: true });
  };
  return { fbqCalls, fetchCalls, store };
}

console.log('Meta tracking checks');

// --- consent gating -------------------------------------------------------
check('no Meta send before marketing consent is given', () => {
  const { fbqCalls, fetchCalls } = setBrowser({ marketing: 'unset' });
  assert.equal(consent.hasMarketingConsent(), false);
  assert.equal(pixel.isMetaPixelEnabled(), false);
  assert.equal(pixel.trackMetaConversion(events.META_EVENT_LEAD, events.LEAD_PARAMS, { scope: 'A1' }), false);
  assert.equal(fbqCalls.length, 0);
  assert.equal(fetchCalls.length, 0);
});

check('rejected marketing consent sends nothing to Meta', () => {
  const { fbqCalls, fetchCalls } = setBrowser({ marketing: 'declined' });
  assert.equal(pixel.isMetaPixelEnabled(), false);
  assert.equal(pixel.trackMetaConversion(events.META_EVENT_ASSESSMENT_START, events.ASSESSMENT_START_PARAMS, { scope: 'A2' }), false);
  assert.equal(fbqCalls.length + fetchCalls.length, 0);
});

check('analytics consent alone is not advertising consent', () => {
  const store = new Map([['mk_fraud_cookie_consent', 'accepted']]);
  global.window = { localStorage: { getItem: (k) => store.get(k) ?? null, setItem: () => {} } };
  assert.equal(consent.hasMarketingConsent(), false);
});

check('Meta sends after marketing consent is granted', () => {
  const { fbqCalls, fetchCalls } = setBrowser({ marketing: 'accepted' });
  assert.equal(pixel.isMetaPixelEnabled(), true);
  assert.equal(pixel.trackMetaConversion(events.META_EVENT_LEAD, events.LEAD_PARAMS, { scope: 'A3' }), true);
  assert.equal(fbqCalls.length, 1);
  assert.equal(fetchCalls.length, 1);
});

check('missing pixel ID disables Meta entirely even with consent', () => {
  const { fbqCalls, fetchCalls } = setBrowser({ marketing: 'accepted' });
  assert.equal(pixelUnconfigured.isMetaPixelEnabled(), false);
  assert.equal(pixelUnconfigured.trackMetaConversion(events.META_EVENT_LEAD, events.LEAD_PARAMS, { scope: 'A4' }), false);
  assert.equal(fbqCalls.length + fetchCalls.length, 0);
});

// --- route exclusion ------------------------------------------------------
check('public marketing routes are trackable', () => {
  for (const p of ['/', '/fraud-readiness', '/about', '/insights', '/insights/fraud-risk-in-sa', '/contact']) {
    assert.equal(routes.isMetaTrackablePath(p), true, `expected trackable: ${p}`);
  }
});

check('score, admin, snapshot, report and order routes are excluded', () => {
  const excluded = [
    '/score', '/score/start', '/score/adaptive', '/score/admin', '/score/admin/orders',
    '/score/snapshot/MKFRS-2026-000123', '/score/assessment/MKFRS-2026-000123/result',
    '/score/report/request/MKFRS-2026-000123', '/score/order/MKFRS-2026-000123',
    '/score/visual-review', '/score/payment/return', '/login',
    '/admin', '/score/advisory/MKFRS-2026-000123',
  ];
  for (const p of excluded) {
    assert.equal(routes.isMetaTrackablePath(p), false, `expected excluded: ${p}`);
  }
});

check('identifier-bearing paths are rejected even on an allowlisted prefix', () => {
  const ids = [
    '/insights/3f2504e0-4f89-11d3-9a0c-0305e82c3301',
    '/insights/a1b2c3d4e5f6a7b8',
    '/insights/report-000123456',
  ];
  for (const p of ids) assert.equal(routes.isMetaTrackablePath(p), false, `expected excluded: ${p}`);
  assert.equal(routes.looksLikeIdentifier('3f2504e0-4f89-11d3-9a0c-0305e82c3301'), true);
  assert.equal(routes.looksLikeIdentifier('fraud-risk'), false);
});

check('a non-allowlisted source URL collapses to the public landing page', () => {
  const unsafe = routes.safeEventSourceUrl('/score/snapshot/MKFRS-2026-000123', 'https://www.mkfraud.co.za');
  assert.equal(unsafe, 'https://www.mkfraud.co.za/fraud-readiness');
  assert.doesNotMatch(unsafe, /MKFRS|snapshot|000123/i);
});

// --- no identifier leakage ------------------------------------------------
check('conversion on an assessment route sends no path to the relay', () => {
  const { fetchCalls } = setBrowser({ marketing: 'accepted', pathname: '/score/adaptive/MKFRS-2026-000123' });
  pixel.trackMetaConversion(events.META_EVENT_LEAD, events.LEAD_PARAMS, { scope: 'MKFRS-2026-000123' });
  assert.equal(fetchCalls.length, 1);
  const payload = JSON.stringify(fetchCalls[0].body);
  assert.equal(fetchCalls[0].body.sourcePath, undefined);
  assert.doesNotMatch(payload, /MKFRS|000123|snapshot|adaptive/i);
});

check('the correlation scope is never part of the transmitted payload', () => {
  const { fbqCalls, fetchCalls } = setBrowser({ marketing: 'accepted' });
  pixel.trackMetaConversion(events.META_EVENT_LEAD, events.LEAD_PARAMS, { scope: 'MKFRS-2026-000999' });
  const all = JSON.stringify({ fbq: fbqCalls, fetch: fetchCalls.map((c) => c.body) });
  assert.doesNotMatch(all, /MKFRS-2026-000999/);
});

check('event IDs are opaque and not derived from the assessment reference', () => {
  setBrowser({ marketing: 'accepted' });
  const id = eventId.stableEventId(events.META_EVENT_LEAD, 'MKFRS-2026-000123');
  assert.match(id, eventId.OPAQUE_EVENT_ID_RE);
  assert.doesNotMatch(id, /MKFRS|000123/i);
});

// --- parameter allowlist / PII --------------------------------------------
check('parameter allowlist drops answers, scores and identifiers', () => {
  const dirty = {
    content_name: 'fraud_readiness_assessment',
    content_category: 'organisational_assessment',
    email: 'person@example.com',
    score: 74,
    snapshot_id: 'MKFRS-2026-000123',
    organisation: 'Example Ltd',
    answers: ['a', 'b'],
  };
  const clean = events.sanitiseMetaParams(dirty);
  assert.deepEqual(Object.keys(clean).sort(), ['content_category', 'content_name']);
  assert.doesNotMatch(JSON.stringify(clean), /example\.com|74|MKFRS|Example Ltd/);
});

check('unknown parameter values are dropped, not forwarded', () => {
  const clean = events.sanitiseMetaParams({ content_name: 'person@example.com', content_category: 'organisational_assessment' });
  assert.deepEqual(clean, { content_category: 'organisational_assessment' });
});

check('browser event payload carries only allowlisted parameters', () => {
  const { fbqCalls } = setBrowser({ marketing: 'accepted' });
  pixel.trackMetaConversion(events.META_EVENT_LEAD, { ...events.LEAD_PARAMS, email: 'x@y.z', score: 91 }, { scope: 'B1' });
  const [, name, params, opts] = fbqCalls[0];
  assert.equal(name, 'Lead');
  assert.deepEqual(Object.keys(params).sort(), ['content_category', 'content_name']);
  assert.match(opts.eventID, eventId.OPAQUE_EVENT_ID_RE);
});

check('CAPI payload contains no identity fields', () => {
  const payload = capi.buildMetaEventPayload({
    eventName: 'Lead',
    eventId: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
    eventSourceUrl: 'https://www.mkfraud.co.za/fraud-readiness',
    fbp: 'fb.1.123.456', fbc: 'fb.1.123.abc',
    clientUserAgent: 'UA', clientIpAddress: '10.0.0.1',
  }, 1788458826607);
  const userDataKeys = Object.keys(payload.data[0].user_data).sort();
  assert.deepEqual(userDataKeys, ['client_ip_address', 'client_user_agent', 'fbc', 'fbp']);
  for (const forbidden of ['em', 'ph', 'fn', 'ln', 'ct', 'st', 'zp', 'external_id', 'db', 'ge']) {
    assert.equal(forbidden in payload.data[0].user_data, false, `user_data must not contain ${forbidden}`);
  }
  assert.deepEqual(payload.data[0].custom_data, { content_name: 'fraud_readiness_assessment', content_category: 'organisational_assessment' });
  assert.equal(payload.data[0].action_source, 'website');
});

// --- deduplication --------------------------------------------------------
check('browser and server copies of one Lead share event name and event ID', () => {
  const { fbqCalls, fetchCalls } = setBrowser({ marketing: 'accepted' });
  pixel.trackMetaConversion(events.META_EVENT_LEAD, events.LEAD_PARAMS, { scope: 'C1' });
  const browserId = fbqCalls[0][3].eventID;
  assert.equal(fbqCalls[0][1], 'Lead');
  assert.equal(fetchCalls[0].body.eventName, 'Lead');
  assert.equal(fetchCalls[0].body.eventId, browserId);
});

check('a replayed completion reuses the same event ID and does not re-fire', () => {
  const { fbqCalls, fetchCalls } = setBrowser({ marketing: 'accepted' });
  assert.equal(pixel.trackMetaConversion(events.META_EVENT_LEAD, events.LEAD_PARAMS, { scope: 'C2' }), true);
  const firstId = fbqCalls[0][3].eventID;
  // Second attempt for the same completion: suppressed locally.
  assert.equal(pixel.trackMetaConversion(events.META_EVENT_LEAD, events.LEAD_PARAMS, { scope: 'C2' }), false);
  assert.equal(fbqCalls.length, 1);
  assert.equal(fetchCalls.length, 1);
  // And the ID minted for that completion is stable, so any later resend deduplicates.
  assert.equal(eventId.stableEventId(events.META_EVENT_LEAD, 'C2'), firstId);
});

check('start and Lead are distinct logical events', () => {
  setBrowser({ marketing: 'accepted' });
  assert.notEqual(
    eventId.stableEventId(events.META_EVENT_LEAD, 'D1'),
    eventId.stableEventId(events.META_EVENT_ASSESSMENT_START, 'D1')
  );
});

// --- fail-open ------------------------------------------------------------
check('Pixel outage does not throw and still sends the server copy', () => {
  const { fetchCalls } = setBrowser({ marketing: 'accepted', withFbq: false });
  assert.doesNotThrow(() => pixel.trackMetaConversion(events.META_EVENT_LEAD, events.LEAD_PARAMS, { scope: 'E1' }));
  assert.equal(fetchCalls.length, 1);
});

check('a throwing Pixel does not propagate to the caller', () => {
  setBrowser({ marketing: 'accepted' });
  global.window.fbq = () => { throw new Error('synthetic pixel failure'); };
  assert.doesNotThrow(() => pixel.trackMetaConversion(events.META_EVENT_LEAD, events.LEAD_PARAMS, { scope: 'E2' }));
});

check('a CAPI outage does not propagate to the caller', () => {
  setBrowser({ marketing: 'accepted' });
  global.fetch = () => Promise.reject(new Error('synthetic CAPI outage'));
  assert.doesNotThrow(() => pixel.trackMetaConversion(events.META_EVENT_LEAD, events.LEAD_PARAMS, { scope: 'E3' }));
});

check('a synchronously throwing fetch does not propagate to the caller', () => {
  setBrowser({ marketing: 'accepted' });
  global.fetch = () => { throw new Error('synthetic fetch failure'); };
  assert.doesNotThrow(() => pixel.trackMetaConversion(events.META_EVENT_LEAD, events.LEAD_PARAMS, { scope: 'E4' }));
});

check('blocked localStorage yields no consent and no send', () => {
  global.window = {
    localStorage: { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); } },
    location: { pathname: '/fraud-readiness' },
  };
  assert.equal(consent.readMarketingConsent(), 'unset');
  assert.equal(pixel.isMetaPixelEnabled(), false);
});

await checkAsync('unconfigured CAPI credentials skip the send without throwing', async () => {
  delete process.env.META_DATASET_ID;
  delete process.env.META_CAPI_ACCESS_TOKEN;
  assert.equal(capi.isMetaCapiConfigured(), false);
  const result = await capi.sendMetaServerEvent({
    eventName: 'Lead', eventId: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
    eventSourceUrl: 'https://www.mkfraud.co.za/fraud-readiness',
  });
  assert.deepEqual(result, { ok: false, status: 'skipped_not_configured' });
});

await checkAsync('a failing Meta endpoint returns a result instead of throwing', async () => {
  process.env.META_DATASET_ID = 'test-dataset';
  process.env.META_CAPI_ACCESS_TOKEN = 'test-token';
  global.fetch = () => Promise.reject(new Error('synthetic network failure'));
  const result = await capi.sendMetaServerEvent({
    eventName: 'Lead', eventId: '3f2504e0-4f89-11d3-9a0c-0305e82c3301',
    eventSourceUrl: 'https://www.mkfraud.co.za/fraud-readiness',
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'failed');
  delete process.env.META_DATASET_ID;
  delete process.env.META_CAPI_ACCESS_TOKEN;
});

// --- relay input validation ----------------------------------------------
check('only the two declared conversions are relayable', () => {
  assert.equal(events.isMetaServerEvent('Lead'), true);
  assert.equal(events.isMetaServerEvent('fraud_readiness_start'), true);
  for (const bad of ['Purchase', 'CompleteRegistration', 'PageView', 'ViewContent', '', null, 42]) {
    assert.equal(events.isMetaServerEvent(bad), false, `must not relay ${String(bad)}`);
  }
});

check('non-opaque event IDs are rejected by the relay contract', () => {
  for (const bad of ['MKFRS-2026-000123', 'person@example.com', '', 'abc', null]) {
    assert.equal(eventId.isOpaqueEventId(bad), false, `must reject ${String(bad)}`);
  }
  assert.equal(eventId.isOpaqueEventId('3f2504e0-4f89-11d3-9a0c-0305e82c3301'), true);
});

// --- GA4 untouched --------------------------------------------------------
await checkAsync('GA4 consent key, event name and semantics are unchanged', async () => {
  const gtag = await import(url('src/lib/website/gtag.ts'));
  assert.equal(gtag.ANALYTICS_CONSENT_STORAGE_KEY, 'mk_fraud_cookie_consent');
  assert.equal(gtag.GA_CONSENT_EVENT, 'mk-fraud-consent-updated');
  assert.notEqual(gtag.ANALYTICS_CONSENT_STORAGE_KEY, consent.MARKETING_CONSENT_STORAGE_KEY);
});


// --- component contracts --------------------------------------------------
const readSource = async (rel) => (await import('node:fs/promises')).readFile(path.join(process.cwd(), rel), 'utf8');

await checkAsync('the Pixel component is gated on consent AND an allowlisted route', async () => {
  const src = await readSource('src/components/website/MetaPixel.tsx');
  assert.match(src, /const trackable = isMetaTrackablePath\(/);
  assert.match(src, /const active = Boolean\(META_PIXEL_ID\) && consented && trackable;/);
  // No active gate means no script element at all -- not merely a dormant one.
  assert.match(src, /if \(!active\) return null;/);
});

await checkAsync('ViewContent fires only on the acquisition landing page', async () => {
  const src = await readSource('src/components/website/MetaPixel.tsx');
  assert.match(src, /if \(path === META_LANDING_PATH\) \{\s*\n\s*trackMetaEvent\(META_EVENT_VIEW_CONTENT, VIEW_CONTENT_PARAMS/);
  // Returning to the landing page counts again; a re-render of the same path does not.
  assert.match(src, /if \(lastTrackedPath\.current === path\) return;/);
});

await checkAsync('Automatic Advanced Matching is disabled and init receives no user data', async () => {
  const src = await readSource('src/components/website/MetaPixel.tsx');
  assert.match(src, /fbq\('set', 'autoConfig', false, \$\{JSON\.stringify\(META_PIXEL_ID\)\}\);/);
  assert.match(src, /fbq\('init', \$\{JSON\.stringify\(META_PIXEL_ID\)\}\);/);
  // An init with a second argument would be advanced matching; there must not be one.
  assert.doesNotMatch(src, /fbq\('init',[^)]*,\s*\{/);
});

await checkAsync('withdrawing marketing consent stops tracking and clears Meta cookies', async () => {
  const src = await readSource('src/components/website/MetaPixel.tsx');
  assert.match(src, /if \(previous && !granted\) \{/);
  assert.match(src, /clearMetaCookies\(\);/);
  assert.match(src, /for \(const name of \["_fbp", "_fbc"\]\)/);
});

await checkAsync('advertising consent is opt-in and separate from the analytics choice', async () => {
  const src = await readSource('src/components/website/CookieConsent.tsx');
  // Unticked by default: marketing is never granted by inaction.
  assert.match(src, /useState\(false\)/);
  assert.match(src, /record\(true, allowMarketing\)/);
  assert.match(src, /record\(false, false\)/);
  // The GA4 consent key is still written exactly as before.
  assert.match(src, /window\.localStorage\.setItem\(CONSENT_KEY, analyticsAccepted \? "accepted" : "declined"\)/);
});

await checkAsync('the assessment surface never mounts the Pixel', async () => {
  const websiteLayout = await readSource('src/app/(website)/layout.tsx');
  assert.match(websiteLayout, /<MetaPixel \/>/);
  const scoreLayout = await readSource('src/app/score/layout.tsx').catch(() => '');
  assert.doesNotMatch(scoreLayout, /MetaPixel/);
});

await checkAsync('conversions fire only after a successful server response', async () => {
  const startForm = await readSource('src/components/adaptive/AdaptiveStartForm.tsx');
  const startIndex = startForm.indexOf('trackMetaConversion(META_EVENT_ASSESSMENT_START');
  const guardIndex = startForm.indexOf('if (!response.ok || !body.ok)');
  assert.ok(guardIndex > -1 && startIndex > guardIndex, 'start conversion must sit after the failure guard');

  const experience = await readSource('src/components/adaptive/AdaptiveAssessmentExperience.tsx');
  const leadIndex = experience.indexOf('trackMetaConversion(META_EVENT_LEAD');
  const snapshotGuard = experience.indexOf("typeof body.snapshotUrl !== 'string'");
  assert.ok(snapshotGuard > -1 && leadIndex > snapshotGuard, 'Lead must sit after the completion guard');
  // Purchase and CompleteRegistration are deliberately not used for a free assessment.
  assert.doesNotMatch(experience, /Purchase|CompleteRegistration/);
});

console.log(`Meta tracking checks: ${checks} checks passed`);
