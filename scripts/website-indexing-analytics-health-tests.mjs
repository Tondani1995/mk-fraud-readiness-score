import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

let checks = 0;
async function check(label, fn) {
  await fn();
  checks += 1;
  console.log(`  ok - ${label}`);
}

const sitemap = read('src/app/sitemap.ts');
const robots = read('src/app/robots.ts');
const legacyFraudReadinessLayout = read('src/app/(website)/fraud-readiness-score/layout.tsx');
const analytics = read('src/components/website/GoogleAnalytics.tsx');
const gtagSource = read('src/lib/website/gtag.ts');
const consent = read('src/components/website/CookieConsent.tsx');
const contact = read('src/app/(website)/contact/page.tsx');
const adaptiveStart = read('src/components/adaptive/AdaptiveStartForm.tsx');
const adaptiveExperience = read('src/components/adaptive/AdaptiveAssessmentExperience.tsx');
const productChoice = read('src/components/products/ProductChoice.tsx');
const orderJourney = read('src/components/commercial/OrderJourney.tsx');
const snapshot = read('src/components/assessment/SnapshotResult.tsx');
const snapshotPage = read('src/app/score/snapshot/[assessmentRef]/page.tsx');
const publicAdvisory = read('src/components/website/FraudReadiness/PublicAdvisoryEnquiryForm.tsx');
const snapshotAdvisory = read('src/components/assessment/AdvisoryEnquiryForm.tsx');

function analyticsCallSnippet(source, eventName) {
  const start = [
    source.indexOf(`trackEvent('${eventName}'`),
    source.indexOf(`trackEvent("${eventName}"`)
  ].filter((index) => index >= 0).sort((a, b) => a - b)[0] ?? -1;
  if (start < 0) return '';
  const open = source.indexOf('{', start);
  if (open < 0) return source.slice(start, start + 240);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return source.slice(start, open + 240);
}

console.log('website sitemap + analytics health');

// --- SITEMAP / ROBOTS ---------------------------------------------------------------------------

const requiredPublicRoutes = [
  '/',
  '/fraud-readiness',
  '/fraud-readiness/advisory',
  '/services',
  '/insights',
  '/about',
  '/industries',
  '/contact',
  '/privacy-policy',
  '/terms-of-use',
  '/fraud-readiness-assessment-terms'
];

await check('sitemap contains the approved public route inventory', () => {
  for (const route of requiredPublicRoutes) {
    assert.ok(sitemap.includes(route), `missing sitemap route ${route}`);
  }
  assert.match(sitemap, /absoluteUrl\(`\/insights\/\$\{insight\.slug\.trim\(\)\}`\)/);
  assert.match(sitemap, /loadPublishedInsights\(\)/);
  assert.match(sitemap, /const seenInsightSlugs = new Set<string>\(\)/);
  assert.match(sitemap, /seenInsightSlugs\.has\(slug\)/);
});

await check('sitemap uses the canonical host and excludes private route families', () => {
  assert.match(sitemap, /SITE_URL/);
  assert.match(sitemap, /absoluteUrl\(["'`]\/fraud-readiness["'`]\)/);
  assert.doesNotMatch(sitemap, /absoluteUrl\(["'`]\/fraud-readiness-score["'`]\)/);
  assert.doesNotMatch(sitemap, /absoluteUrl\(["'`]\/score/);
  assert.doesNotMatch(sitemap, /absoluteUrl\(["'`]\/admin/);
  assert.doesNotMatch(sitemap, /absoluteUrl\(["'`]\/api/);
});

await check('legacy Fraud Readiness route is explicitly canonicalised and excluded from indexing', () => {
  assert.match(legacyFraudReadinessLayout, /path:\s*["'`]\/fraud-readiness["'`]/);
  assert.match(legacyFraudReadinessLayout, /index:\s*false/);
  assert.match(legacyFraudReadinessLayout, /follow:\s*true/);
});

await check('static sitemap entries do not fabricate request-time lastModified dates', () => {
  const staticSection = sitemap.split('function dateFromContent')[0];
  assert.doesNotMatch(staticSection, /lastModified/);
  assert.doesNotMatch(staticSection, /new Date\(\)/);
  assert.match(sitemap, /updatedAt \|\| insight\.publishedAt \|\| insight\.createdAt/);
  assert.match(sitemap, /Number\.isNaN\(date\.getTime\(\)\) \? undefined/);
});

await check('robots excludes private application families and points to canonical sitemap', () => {
  for (const route of ['/admin', '/login', '/score', '/api']) {
    assert.ok(robots.includes(`"${route}"`), `robots must disallow ${route}`);
  }
  assert.match(robots, /sitemap:\s*absoluteUrl\("\/sitemap\.xml"\)/);
});

// --- CONSENT / PAGEVIEWS ------------------------------------------------------------------------

await check('analytics is absent before consent and waits for GA readiness after consent', () => {
  assert.match(analytics, /if \(!GA_MEASUREMENT_ID \|\| !analyticsEnabled\) return null/);
  assert.match(analytics, /const \[analyticsReady, setAnalyticsReady\] = useState\(false\)/);
  assert.match(analytics, /window\.addEventListener\(GA_READY_EVENT, syncReady\)/);
  assert.match(analytics, /window\.dispatchEvent\(new Event\(\$\{JSON\.stringify\(GA_READY_EVENT\)\}\)\)/);
  assert.match(analytics, /if \(!analyticsReady\) return/);
  assert.match(analytics, /send_page_view: false/);
  assert.match(consent, /GA_CONSENT_EVENT/);
});

await check('initial accepted pageview is sent once and route transitions are deduplicated', () => {
  assert.match(analytics, /const lastPageviewRef = useRef<string \| null>\(null\)/);
  assert.match(analytics, /if \(lastPageviewRef\.current === url\) return/);
  assert.match(analytics, /if \(pageview\(url\)\) lastPageviewRef\.current = url/);
  assert.doesNotMatch(analytics, /setTimeout|setInterval/);
  assert.match(gtagSource, /export function pageview\(url: string\): boolean/);
  assert.match(gtagSource, /return false/);
  assert.match(gtagSource, /return true/);
});

await check('the GA helper only emits after a ready gtag function exists', async () => {
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID = 'G-HEALTH1234';
  const calls = [];
  const browserWindow = {
    localStorage: {
      getItem: () => 'accepted'
    },
    gtag: (...args) => calls.push(args)
  };
  const previousWindow = global.window;
  global.window = browserWindow;
  const gtag = await import(pathToFileURL(path.join(root, 'src/lib/website/gtag.ts')).href);

  browserWindow.gtag = undefined;
  assert.equal(gtag.pageview('/'), false, 'pageview must wait for gtag');
  assert.equal(gtag.trackEvent('product_selected', { tier: 'essential' }), false, 'event must wait for gtag');

  browserWindow.gtag = (...args) => calls.push(args);
  assert.equal(gtag.pageview('/'), true, 'ready gtag accepts the first pageview');
  assert.equal(gtag.trackEvent('product_selected', { tier: 'essential' }), true, 'ready gtag accepts an event');
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0], ['config', 'G-HEALTH1234', { page_path: '/' }]);
  assert.deepEqual(calls[1], ['event', 'product_selected', { tier: 'essential' }]);

  browserWindow.localStorage.getItem = () => 'declined';
  assert.equal(gtag.pageview('/declined'), false, 'declined consent must block pageviews');
  assert.equal(gtag.trackEvent('product_selected', { tier: 'essential' }), false, 'declined consent must block events');

  global.window = previousWindow;
});

// --- CONVERSION EVENTS --------------------------------------------------------------------------

await check('assessment start and completion events follow successful server responses', () => {
  assert.match(adaptiveStart, /if \(!response\.ok \|\| !body\.ok\)/);
  assert.ok(adaptiveStart.indexOf("trackEvent('fraud_readiness_start'") > adaptiveStart.indexOf('if (!response.ok || !body.ok)'));
  assert.match(adaptiveStart, /trackEvent\('fraud_readiness_start', \{ flow: 'adaptive' \}\)/);

  assert.match(adaptiveExperience, /if \(!response\.ok \|\| !body\.ok\)/);
  assert.ok(adaptiveExperience.indexOf("trackEvent('fraud_readiness_completed'") > adaptiveExperience.indexOf('if (!response.ok || !body.ok)'));
  assert.match(adaptiveExperience, /trackEvent\('fraud_readiness_completed', \{ flow: 'adaptive' \}\)/);
});

await check('commercial event hooks use non-identifying parameters only', () => {
  assert.match(productChoice, /trackEvent\('product_selected', \{ tier \}\)/);
  assert.match(productChoice, /trackEvent\('product_selected', \{ tier: 'advisory' \}\)/);
  assert.match(orderJourney, /trackEvent\('order_recorded', \{[\s\S]{0,240}tier,[\s\S]{0,240}value:[\s\S]{0,240}currency:/);
  assert.match(orderJourney, /trackEvent\('invoice_requested', \{ tier \}\)/);
  assert.match(snapshotAdvisory, /trackEvent\('advisory_enquiry_submitted', \{ source: 'snapshot' \}\)/);
  assert.match(publicAdvisory, /trackEvent\('advisory_enquiry_submitted', \{ source: 'public_advisory' \}\)/);

  for (const source of [productChoice, orderJourney, snapshotAdvisory, publicAdvisory]) {
    assert.doesNotMatch(source, /trackEvent\([^\n]+\{[^\n]*(?:email|phone|organisation|assessmentReference|orderReference|invoiceDetails)/i);
  }
});

await check('Contact generate_lead and website_contact_submitted fire only after persistence succeeds', () => {
  const responseGuard = contact.indexOf('if (!response.ok || !body.ok)');
  const generateLead = contact.indexOf('trackEvent("generate_lead"');
  const contactSubmitted = contact.indexOf('trackEvent("website_contact_submitted"');
  assert.ok(responseGuard >= 0 && responseGuard < generateLead);
  assert.ok(generateLead < contactSubmitted);
  assert.match(contact, /trackEvent\("generate_lead",/);
  assert.match(contact, /trackEvent\("website_contact_submitted", \{\s*service_interest:/);
});

await check('existing Snapshot funnel events remain intact', () => {
  assert.match(snapshot, /eventType="executive_summary_viewed"/);
  assert.match(snapshotPage, /eventType: 'snapshot_viewed'/);
  assert.match(productChoice, /eventType: 'report_options_opened'/);
  assert.match(productChoice, /reportOptionsViewedRef/);
});

const forbiddenAnalyticsKeys = /(?:^|[^a-z])(?:name|email|phone|company|organisation|assessmentreference|orderreference|invoicedetails|token)(?:$|[^a-z])/i;
await check('commercial analytics snippets contain no customer or private identifiers', () => {
  for (const [label, source, eventName] of [
    ['product', productChoice, 'product_selected'],
    ['order', orderJourney, 'order_recorded'],
    ['invoice', orderJourney, 'invoice_requested'],
    ['snapshot advisory', snapshotAdvisory, 'advisory_enquiry_submitted'],
    ['public advisory', publicAdvisory, 'advisory_enquiry_submitted'],
    ['website contact', contact, 'website_contact_submitted']
  ]) {
    const index = source.indexOf(eventName);
    assert.ok(index >= 0, `${label} event is present`);
    const snippet = analyticsCallSnippet(source, eventName);
    assert.doesNotMatch(snippet, forbiddenAnalyticsKeys, `${label} analytics must not carry PII/private identifiers`);
  }
});

console.log(`website sitemap + analytics health: ${checks} checks passed`);
