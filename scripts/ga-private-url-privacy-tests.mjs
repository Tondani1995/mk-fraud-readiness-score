/**
 * GA4 private-URL privacy tests.
 *
 * Private Fraud Readiness links carry bearer credentials (`?token=`). These checks prove no such
 * value reaches GA through the page context the app controls — page_location / page_referrer on
 * load and after in-app navigation, explicit page_view events, custom events and URL-valued event
 * parameters — while public pages, UTM attribution, the Contact conversion and Consent Mode stay
 * exactly as they were. (Enhanced Measurement's history-change page_view reads location.href
 * itself; see the limit documented in src/lib/website/analytics-url.ts.)
 *
 * Secret values are generated per run and never printed; assertion messages name the case only.
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const SECRET = `s${crypto.randomBytes(12).toString('hex')}`;
const SITE = 'https://www.mkfraud.co.za';

process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = 'G-PRIVACYTEST';
const urlModule = await import(pathToFileURL(path.join(root, 'src/lib/website/analytics-url.ts')).href);
const gtag = await import(pathToFileURL(path.join(root, 'src/lib/website/gtag.ts')).href);
const { sanitiseAnalyticsUrl, SENSITIVE_ANALYTICS_PARAMETERS, analyticsPrivacyBootstrapScript } = urlModule;

let checks = 0;
function check(label, fn) {
  fn();
  checks += 1;
  console.log(`  ok - ${label}`);
}
const noSecret = (value, label) => assert.ok(!JSON.stringify(value ?? '').includes(SECRET), `${label} must not carry the credential`);

function setBrowser({ href, consent = 'accepted', marketing = 'declined', referrer = '' }) {
  const calls = [];
  global.window = {
    location: { href },
    localStorage: { getItem: (key) => (key === 'mk_fraud_marketing_consent' ? marketing : consent) },
    gtag: (...args) => { calls.push(args); }
  };
  global.document = { title: 'MK Fraud Insights', referrer };
  return calls;
}

console.log('GA private URL privacy checks');

check('1: token=SECRET is absent from a sanitised Snapshot URL', () => {
  const out = sanitiseAnalyticsUrl(`${SITE}/score/snapshot/MKFRS-2026-ABC?token=${SECRET}`);
  noSecret(out, 'sanitised Snapshot URL');
  assert.ok(!/[?&]token=/i.test(out), 'token parameter removed');
  assert.equal(out, `${SITE}/score/snapshot/MKFRS-2026-ABC`);
});

check('2: every identified sensitive parameter is removed, in any letter case, from query and fragment', () => {
  for (const name of SENSITIVE_ANALYTICS_PARAMETERS) {
    for (const variant of [name, name.toUpperCase()]) {
      const query = sanitiseAnalyticsUrl(`${SITE}/score/order/new?${variant}=${SECRET}&utm_source=google`);
      noSecret(query, `query parameter ${name}`);
      assert.ok(query.endsWith('?utm_source=google'), `attribution kept beside ${name}`);
      const fragment = sanitiseAnalyticsUrl(`${SITE}/score/start#${variant}=${SECRET}`);
      noSecret(fragment, `fragment parameter ${name}`);
    }
  }
  const camel = sanitiseAnalyticsUrl(`${SITE}/score/order/MKFRS-2026-ABC?token=${SECRET}&orderReference=MKORD-2026-${SECRET}`);
  noSecret(camel, 'order link');
  const accessPath = sanitiseAnalyticsUrl(`${SITE}/score/report/access/${SECRET}?artefact=pdf`);
  noSecret(accessPath, 'report access path');
  assert.equal(accessPath, `${SITE}/score/report/access/[redacted]?artefact=pdf`);
});

check('3: token is removed while approved UTM attribution is preserved in order', () => {
  const out = sanitiseAnalyticsUrl(`${SITE}/score/snapshot/ABC?token=${SECRET}&utm_source=google&utm_medium=cpc&utm_campaign=test&gclid=abc123`);
  noSecret(out, 'UTM URL');
  assert.equal(out, `${SITE}/score/snapshot/ABC?utm_source=google&utm_medium=cpc&utm_campaign=test&gclid=abc123`);
});

check('4: plain public pages, attribution and in-page anchors are unchanged', () => {
  for (const url of [
    `${SITE}/`,
    `${SITE}/fraud-readiness`,
    `${SITE}/fraud-readiness?utm_source=google&utm_medium=cpc&utm_campaign=fraud_readiness&gclid=x1&gbraid=y2&wbraid=z3`,
    `${SITE}/contact?enquiry=mk-advisory`,
    `${SITE}/services#health-check`,
    `${SITE}/score/start?utm_source=linkedin&fbclid=abc`
  ]) {
    assert.equal(sanitiseAnalyticsUrl(url), new URL(url).toString(), `${url} unchanged`);
  }
  assert.equal(sanitiseAnalyticsUrl('/contact', SITE), `${SITE}/contact`);
  assert.equal(sanitiseAnalyticsUrl(''), undefined);
  assert.equal(sanitiseAnalyticsUrl('not a url'), undefined, 'unparseable input is dropped, never sent raw');
});

check('5: the Contact conversion events are sent with their existing payload', () => {
  const calls = setBrowser({ href: `${SITE}/contact?utm_source=google&utm_medium=cpc` });
  const leadParams = { form_name: 'contact_form', service_interest: 'fraud-health-check', page_location: '/contact' };
  assert.equal(gtag.trackEvent('generate_lead', leadParams), true);
  assert.equal(gtag.trackEvent('website_contact_submitted', { service_interest: 'fraud-health-check' }), true);
  assert.deepEqual(calls, [
    ['event', 'generate_lead', leadParams],
    ['event', 'website_contact_submitted', { service_interest: 'fraud-health-check' }]
  ], 'exactly the existing calls, byte-for-byte');
  const contact = read('src/app/(website)/contact/page.tsx');
  assert.match(contact, /trackEvent\("generate_lead", \{\s*form_name: "contact_form",/);
});

check('6: Calendly attribution is unaffected — the embed URL carries no sensitive parameter and is not rewritten', () => {
  const contact = read('src/app/(website)/contact/page.tsx');
  const embed = contact.match(/const CALENDLY_URL = "([^"]+)"/)[1];
  assert.equal(sanitiseAnalyticsUrl(embed), new URL(embed).toString());
  assert.doesNotMatch(contact, /sanitiseAnalyticsUrl|analytics-url/);
});

check('7: declined analytics consent still sends no event, page view or page context', () => {
  const calls = setBrowser({ href: `${SITE}/score/snapshot/ABC?token=${SECRET}`, consent: 'declined' });
  assert.equal(gtag.pageview(`/score/snapshot/ABC?token=${SECRET}`), false);
  assert.equal(gtag.trackEvent('product_selected', { tier: 'essential' }), false);
  let navigated = 0;
  assert.equal(gtag.trackEventBeforeNavigation('fraud_readiness_completed', { flow: 'adaptive' }, () => { navigated += 1; }), false);
  assert.equal(navigated, 1);
  assert.equal(calls.length, 0);
});

check('8: accepted analytics consent sends only sanitised page_view, page context and events', () => {
  const href = `${SITE}/score/snapshot/ABC?token=${SECRET}&utm_source=google`;
  const calls = setBrowser({ href });
  assert.equal(gtag.pageview(`/score/snapshot/ABC?token=${SECRET}&utm_source=google`), true);
  assert.equal(gtag.trackEvent('product_selected', { tier: 'advisory' }), true);
  gtag.trackEventBeforeNavigation('fraud_readiness_completed', { flow: 'adaptive' }, () => {});
  gtag.trackEvent('cta_click', { link_url: `/score/advisory/ABC?token=${SECRET}`, cta_name: 'talk_to_mk' });
  noSecret(calls, 'every gtag call');
  assert.deepEqual(calls.map(([command, name]) => `${command}:${name}`),
    ['event:page_view', 'event:product_selected', 'event:fraud_readiness_completed', 'event:cta_click'],
    'one call per event, no extra commands');
  const pageView = calls.find(([command, name]) => command === 'event' && name === 'page_view');
  assert.equal(pageView[2].page_location, `${SITE}/score/snapshot/ABC?utm_source=google`);
  const cta = calls.find(([command, name]) => command === 'event' && name === 'cta_click');
  assert.equal(cta[2].link_url, `${SITE}/score/advisory/ABC`, 'URL-valued parameters are sanitised');
  assert.equal(cta[2].cta_name, 'talk_to_mk');
  const completion = calls.find(([command, name]) => command === 'event' && name === 'fraud_readiness_completed');
  assert.equal(completion[2].flow, 'adaptive', 'conversion event name and payload unchanged');
});

check('9: marketing consent behaviour is unchanged (separate, fail-closed)', () => {
  setBrowser({ href: `${SITE}/`, consent: 'accepted', marketing: 'declined' });
  assert.deepEqual(gtag.getStoredConsentState(), {
    analytics_storage: 'granted', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied'
  });
  global.window.localStorage = { getItem: () => { throw new Error('blocked'); } };
  assert.deepEqual(gtag.getStoredConsentState(), {
    analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied'
  });
});

check('10: admin and visual-review routes remain excluded from analytics', () => {
  const runtime = read('src/app/score/ScoreAnalyticsRuntime.tsx');
  assert.match(runtime, /const PRIVATE_SCORE_PATH_PREFIXES = \['\/score\/admin', '\/score\/visual-review'\];/);
  assert.match(runtime, /if \(isPrivateScorePath\(pathname\)\) return null;/);
});

check('11: sanitisation adds nothing to a payload — no new keys, no PII', () => {
  const calls = setBrowser({ href: `${SITE}/score/start` });
  gtag.trackEvent('cta_click', { cta_name: 'assess_your_organisation', placement: 'hero' });
  const event = calls.find(([command]) => command === 'event');
  assert.deepEqual(Object.keys(event[2]), ['cta_name', 'placement']);
  assert.doesNotMatch(JSON.stringify(calls), /@/);
});

// --- INLINE BOOTSTRAP (runs before gtag.js and covers gtag's own hits) ---------------------------

function runBootstrap({ href, referrer = '' }) {
  const calls = [];
  const listeners = {};
  const location = { href };
  const history = {
    pushState(_state, _title, url) { location.href = new URL(url, location.href).toString(); },
    replaceState(_state, _title, url) { location.href = new URL(url, location.href).toString(); }
  };
  const context = {
    URL,
    URLSearchParams,
    window: {
      location,
      history,
      addEventListener: (type, fn) => { listeners[type] = fn; }
    },
    document: { referrer },
    // Normalised to this realm so deepEqual compares values, not vm-context prototypes.
    gtag: (...args) => { calls.push(JSON.parse(JSON.stringify(args))); }
  };
  vm.createContext(context);
  vm.runInContext(analyticsPrivacyBootstrapScript(), context);
  return { calls, location, history: context.window.history, listeners, sanitise: context.window.mkSanitiseAnalyticsUrl };
}

check('12: the bootstrap pins a sanitised page_location / page_referrer before gtag config', () => {
  const { calls } = runBootstrap({
    href: `${SITE}/score/snapshot/ABC?token=${SECRET}&utm_source=google`,
    referrer: `${SITE}/score/adaptive/ABC?token=${SECRET}`
  });
  noSecret(calls, 'bootstrap initial context');
  assert.deepEqual(calls[0], ['set', {
    page_location: `${SITE}/score/snapshot/ABC?utm_source=google`,
    page_referrer: `${SITE}/score/adaptive/ABC`
  }]);
  const analytics = read('src/components/website/GoogleAnalytics.tsx');
  const privacy = analytics.indexOf('${analyticsPrivacyBootstrapScript()}');
  assert.ok(privacy > analytics.indexOf("gtag('consent', 'update'"), 'after the consent restore');
  assert.ok(privacy < analytics.indexOf("gtag('config'"), 'before gtag config');
});

check('13: in-app navigations re-pin a sanitised page context for subsequent hits', () => {
  const { calls, history, listeners, location } = runBootstrap({ href: `${SITE}/score/snapshot/ABC?token=${SECRET}` });
  history.pushState({}, '', `/score/advisory/ABC?token=${SECRET}&utm_source=google`);
  assert.deepEqual(calls.at(-1), ['set', {
    page_location: `${SITE}/score/advisory/ABC?utm_source=google`,
    page_referrer: `${SITE}/score/snapshot/ABC`
  }]);
  history.replaceState({}, '', `/score/order/new?token=${SECRET}&orderReference=MKORD-2026-X`);
  assert.equal(calls.at(-1)[1].page_location, `${SITE}/score/order/new`);
  location.href = `${SITE}/score/snapshot/ABC?token=${SECRET}`;
  listeners.popstate();
  assert.equal(calls.at(-1)[1].page_location, `${SITE}/score/snapshot/ABC`);
  assert.equal(calls.at(-1)[1].page_referrer, `${SITE}/score/order/new`);
  location.href = `${SITE}/score/snapshot/ABC?token=${SECRET}#access_token=${SECRET}`;
  listeners.hashchange();
  assert.equal(calls.at(-1)[1].page_location, `${SITE}/score/snapshot/ABC`);
  noSecret(calls, 'history-change context');
});

check('14: the bootstrap sanitiser and the TypeScript sanitiser agree on every case', () => {
  const { sanitise } = runBootstrap({ href: `${SITE}/` });
  const corpus = [
    `${SITE}/score/snapshot/ABC?token=${SECRET}`,
    `${SITE}/score/snapshot/ABC?TOKEN=${SECRET}&utm_source=google&utm_campaign=test`,
    `${SITE}/score/report/access/${SECRET}`,
    `${SITE}/score/start#access_token=${SECRET}&type=recovery`,
    `${SITE}/services#health-check`,
    `${SITE}/contact?enquiry=mk-advisory`,
    `${SITE}/score/payment/return?order_reference=MKORD-2026-X&status=ok`,
    `${SITE}/fraud-readiness?utm_source=google&gclid=abc`,
    ...SENSITIVE_ANALYTICS_PARAMETERS.map((name) => `${SITE}/score/x?${name}=${SECRET}&keep=1`)
  ];
  for (const url of corpus) assert.equal(sanitise(url), sanitiseAnalyticsUrl(url), 'bootstrap and module disagree');
});

check('15: Consent Mode v2 defaults are untouched by the privacy bootstrap', () => {
  const analytics = read('src/components/website/GoogleAnalytics.tsx');
  assert.match(analytics, /gtag\('consent', 'default', \{\s*analytics_storage: 'denied',\s*ad_storage: 'denied',\s*ad_user_data: 'denied',\s*ad_personalization: 'denied'\s*\}\);/);
  assert.doesNotMatch(analyticsPrivacyBootstrapScript(), /consent/);
  assert.match(analytics, /gtag\('config', \$\{JSON\.stringify\(GA_MEASUREMENT_ID\)\}, \{ send_page_view: false \}\);/);
});

console.log(`\nGA private URL privacy: ${checks} checks passed`);
