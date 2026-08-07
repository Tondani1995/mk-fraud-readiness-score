#!/usr/bin/env node
/**
 * G30 device and accessibility browser sweep.
 *
 * Credential-free and strictly read-only. Safety properties, enforced in code below rather than by
 * convention:
 *
 *   1. Every non-GET request to the application origin is ABORTED at the network layer. The sweep
 *      therefore cannot create a Staging assessment, place an order, initiate a payment, invoke the
 *      AI pipeline, send an email or trigger a webhook, even if a page tries to.
 *   2. A denylist additionally aborts read paths that are side-effecting or expensive regardless of
 *      method (report generation, fulfilment worker, storage cleanup, admin routes).
 *   3. The verified-payment status endpoint is served from a local fixture so the seven verified
 *      payment states can be rendered without an order existing.
 *   4. Only routes that need no assessment data are swept by default. The live assessment screens
 *      are swept only when the operator supplies G30_ADAPTIVE_RESUME_URL for an assessment that
 *      already exists -- and even then, rule 1 means the sweep can only read it.
 *
 * It changes no product behaviour and writes nothing except evidence files.
 *
 * Chromium only. Safari and Edge behaviour cannot be produced here and is manual by construction;
 * see docs/g30/device-browser-matrix.md.
 *
 * Usage:
 *   G30_BASE_URL=https://<preview-host> \
 *   CHROME_EXECUTABLE="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
 *   G30_EVIDENCE_DIR=evidence/g30/<run-id>/automated \
 *   node scripts/g30-device-a11y-browser-tests.mjs
 *
 * Optional:
 *   VERCEL_PROTECTION_BYPASS=<token>       protected Preview deployments
 *   G30_ADAPTIVE_RESUME_URL=<resume url>   sweep the live assessment screens, read-only
 *   G30_VIEWPORTS=320,390,1280             restrict the viewport set while iterating
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const baseUrl = (process.env.G30_BASE_URL ?? '').replace(/\/$/, '');
if (!baseUrl) {
  console.error('G30_BASE_URL is required. It must point at the deployment under test.');
  process.exit(2);
}

// Imported after the guard so an operator who forgets G30_BASE_URL gets that message rather than a
// module-resolution error. puppeteer-core is already a production dependency (it backs PDF
// rendering), so this suite adds nothing to the certified dependency set.
const { default: puppeteer } = await import('puppeteer-core');

const executablePath = process.env.CHROME_EXECUTABLE
  ?? (process.platform === 'darwin'
    ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    : '/usr/bin/google-chrome');
const evidenceDir = process.env.G30_EVIDENCE_DIR ?? 'tmp/g30-device-evidence';
const screenshotDir = join(evidenceDir, 'screenshots');
const protectionBypass = process.env.VERCEL_PROTECTION_BYPASS?.trim();
const adaptiveResumeUrl = process.env.G30_ADAPTIVE_RESUME_URL?.trim() || null;
const baselinePath = join(repoRoot, 'scripts', 'g30', 'device-sweep-baseline.json');

await mkdir(screenshotDir, { recursive: true });

// ---------------------------------------------------------------------------
// Viewports. 200%/400% zoom is expressed as the equivalent CSS viewport of a
// 1280x800 window, which is how WCAG 1.4.10 and 1.4.4 are actually measured.
// ---------------------------------------------------------------------------

const allViewports = [
  { name: '320x568', width: 320, height: 568, condition: 'reflow-minimum' },
  { name: '375x667', width: 375, height: 667, condition: 'portrait' },
  { name: '390x844', width: 390, height: 844, condition: 'portrait' },
  { name: '430x932', width: 430, height: 932, condition: 'portrait' },
  { name: '768x1024', width: 768, height: 1024, condition: 'tablet-portrait' },
  { name: '1024x768', width: 1024, height: 768, condition: 'tablet-landscape' },
  { name: '1280x800', width: 1280, height: 800, condition: 'desktop' },
  { name: '1440x900', width: 1440, height: 900, condition: 'desktop-wide' },
  { name: 'zoom200', width: 640, height: 400, condition: 'zoom-200-of-1280x800' },
  { name: 'zoom400', width: 320, height: 200, condition: 'zoom-400-of-1280x800' }
];

const viewportFilter = process.env.G30_VIEWPORTS?.split(',').map((value) => value.trim()).filter(Boolean);
const viewports = viewportFilter
  ? allViewports.filter((viewport) => viewportFilter.some((wanted) => viewport.name.startsWith(wanted)))
  : allViewports;

// ---------------------------------------------------------------------------
// Routes that require no assessment data and create nothing.
// ---------------------------------------------------------------------------

const routes = [
  { id: 'R-landing', path: '/fraud-readiness-score', journeyStep: 'J01', surface: 'S1' },
  { id: 'R-adaptive-start', path: '/score/adaptive', journeyStep: 'J02', surface: 'S2' },
  { id: 'R-legacy-start', path: '/score/start', journeyStep: 'J02', surface: 'S2' },
  { id: 'R-adaptive-no-token', path: '/score/adaptive/G30-FIXTURE-REF', journeyStep: 'J04', surface: 'S3', expectState: 'missing-token' },
  { id: 'R-adaptive-bad-token', path: '/score/adaptive/G30-FIXTURE-REF?token=g30-invalid-token', journeyStep: 'J04', surface: 'S3', expectState: 'invalid-token' },
  { id: 'R-snapshot-no-token', path: '/score/snapshot/G30-FIXTURE-REF', journeyStep: 'J14', surface: 'S7', expectState: 'missing-token' },
  { id: 'R-report-request', path: '/score/report/request/G30-FIXTURE-REF', journeyStep: 'J18', surface: 'S8' },
  { id: 'R-payment-no-ref', path: '/score/payment/return', journeyStep: 'J17', surface: 'S9', expectState: 'missing-reference' },
  { id: 'R-payment-paid', path: '/score/payment/return?order_reference=G30-FIXTURE-ORDER', journeyStep: 'J17', surface: 'S9', paymentState: 'PAID' },
  { id: 'R-payment-pending', path: '/score/payment/return?order_reference=G30-FIXTURE-ORDER', journeyStep: 'J17', surface: 'S9', paymentState: 'PAYMENT_PENDING' },
  { id: 'R-payment-processing', path: '/score/payment/return?order_reference=G30-FIXTURE-ORDER', journeyStep: 'J17', surface: 'S9', paymentState: 'PAYMENT_PROCESSING' },
  { id: 'R-payment-failed', path: '/score/payment/return?order_reference=G30-FIXTURE-ORDER', journeyStep: 'J17', surface: 'S9', paymentState: 'PAYMENT_FAILED' },
  { id: 'R-payment-review', path: '/score/payment/return?order_reference=G30-FIXTURE-ORDER', journeyStep: 'J17', surface: 'S9', paymentState: 'PAYMENT_REVIEW_REQUIRED' },
  { id: 'R-payment-cancelled', path: '/score/payment/return?order_reference=G30-FIXTURE-ORDER', journeyStep: 'J17', surface: 'S9', paymentState: 'CANCELLED' },
  { id: 'R-payment-refunded', path: '/score/payment/return?order_reference=G30-FIXTURE-ORDER', journeyStep: 'J17', surface: 'S9', paymentState: 'REFUNDED' },
  { id: 'R-report-access-error', path: '/score/report/access/g30invalidtoken0000000000', journeyStep: 'J19', surface: 'S10', expectState: 'invalid-token' }
];

if (adaptiveResumeUrl) {
  routes.push({
    id: 'R-adaptive-live',
    path: adaptiveResumeUrl.startsWith('http') ? adaptiveResumeUrl : adaptiveResumeUrl,
    absolute: adaptiveResumeUrl.startsWith('http'),
    journeyStep: 'J05',
    surface: 'S3',
    note: 'operator-supplied existing assessment, swept read-only'
  });
}

// ---------------------------------------------------------------------------
// Request policy.
// ---------------------------------------------------------------------------

/** Paths that must never be requested at all, even by GET. */
const HARD_DENY = [
  /\/score\/api\/admin\//,
  /\/score\/api\/internal\//,
  /\/score\/api\/webhooks\//,
  /\/score\/api\/adaptive\/[^/]+\/submit/,
  /\/generate-report/,
  /\/score\/api\/assessments\/[^/]+\/(report-request|personalised-report-request|commercial-event|submit)/
];

function paymentStatusFixture(state) {
  return {
    ok: true,
    payment: {
      state,
      fulfilment_trigger_result: state === 'PAID' ? 'FULFILMENT_REQUESTED' : 'NOT_REQUESTED'
    }
  };
}

let blockedWrites = 0;
let blockedDeny = 0;

function installRequestPolicy(page, activePaymentState) {
  page.on('request', (request) => {
    const url = request.url();
    const method = request.method();
    const sameOrigin = url.startsWith(baseUrl);

    if (sameOrigin && HARD_DENY.some((pattern) => pattern.test(url))) {
      blockedDeny += 1;
      void request.abort('blockedbyclient');
      return;
    }

    // Rule 1: nothing may mutate. Aborting rather than stubbing means a page that depends on a
    // write fails visibly in the evidence instead of appearing to succeed against a fake response.
    if (sameOrigin && method !== 'GET' && method !== 'HEAD') {
      blockedWrites += 1;
      void request.abort('blockedbyclient');
      return;
    }

    if (activePaymentState && /\/score\/api\/payments\/[^/]+\/status/.test(url)) {
      void request.respond({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(paymentStatusFixture(activePaymentState))
      });
      return;
    }

    void request.continue();
  });
}

// ---------------------------------------------------------------------------
// In-page measurement. Runs in the browser; returns plain JSON.
// ---------------------------------------------------------------------------

const MEASURE = () => {
  const interactiveSelector = 'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';

  function accessibleName(element) {
    const labelled = element.getAttribute('aria-labelledby');
    if (labelled) {
      const parts = labelled.split(/\s+/).map((id) => document.getElementById(id)?.textContent?.trim() ?? '');
      if (parts.join(' ').trim()) return parts.join(' ').trim();
    }
    const ariaLabel = element.getAttribute('aria-label');
    if (ariaLabel) return ariaLabel.trim();
    if (element.id) {
      const explicit = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
      if (explicit?.textContent?.trim()) return explicit.textContent.trim();
    }
    const wrapping = element.closest('label');
    if (wrapping?.textContent?.trim()) return wrapping.textContent.trim();
    const title = element.getAttribute('title');
    if (title) return title.trim();
    return (element.textContent ?? '').trim();
  }

  const root = document.documentElement;
  const interactives = [...document.querySelectorAll(interactiveSelector)]
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    });

  const targets = interactives.map((element) => {
    // For a small native control wrapped in a label, the label is the real target.
    const isSmallNative = /^(INPUT)$/.test(element.tagName)
      && ['checkbox', 'radio'].includes(element.getAttribute('type') ?? '');
    const measured = isSmallNative ? (element.closest('label') ?? element) : element;
    const rect = measured.getBoundingClientRect();
    return {
      tag: element.tagName.toLowerCase(),
      type: element.getAttribute('type'),
      role: element.getAttribute('role'),
      name: accessibleName(element).slice(0, 80),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      measuredVia: isSmallNative ? 'wrapping-label' : 'self'
    };
  });

  const overflowing = [...document.querySelectorAll('*')]
    .filter((element) => element.getBoundingClientRect().right > window.innerWidth + 1)
    .slice(0, 10)
    .map((element) => `${element.tagName.toLowerCase()}${element.className && typeof element.className === 'string' ? `.${element.className.split(/\s+/).slice(0, 3).join('.')}` : ''}`);

  return {
    title: document.title || null,
    htmlLang: root.getAttribute('lang'),
    viewportMeta: document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? null,
    horizontalOverflowPx: Math.max(0, root.scrollWidth - window.innerWidth),
    overflowingElements: overflowing,
    iframeCount: document.querySelectorAll('iframe').length,
    nestedScrollableCount: [...document.querySelectorAll('main *')].filter((element) => {
      const style = getComputedStyle(element);
      return /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1;
    }).length,
    headings: [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
      .map((element) => ({ level: Number(element.tagName[1]), text: (element.textContent ?? '').trim().slice(0, 90) })),
    landmarks: [...document.querySelectorAll('header,nav,main,footer,aside,[role="banner"],[role="navigation"],[role="main"],[role="contentinfo"],[role="dialog"],section[aria-label]')]
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        role: element.getAttribute('role'),
        label: element.getAttribute('aria-label')
      })),
    interactiveCount: interactives.length,
    targets,
    targetsBelow24: targets.filter((target) => target.width < 24 || target.height < 24),
    inputs: [...document.querySelectorAll('input, select, textarea')].map((element) => ({
      name: element.getAttribute('name'),
      type: element.getAttribute('type'),
      autocomplete: element.getAttribute('autocomplete'),
      required: element.hasAttribute('required'),
      hasAccessibleName: accessibleName(element).length > 0,
      ariaInvalid: element.getAttribute('aria-invalid'),
      ariaDescribedby: element.getAttribute('aria-describedby')
    })),
    aria: {
      alerts: document.querySelectorAll('[role="alert"]').length,
      liveRegions: document.querySelectorAll('[aria-live]').length,
      progressbars: [...document.querySelectorAll('[role="progressbar"]')].map((element) => ({
        label: element.getAttribute('aria-label'),
        now: element.getAttribute('aria-valuenow'),
        min: element.getAttribute('aria-valuemin'),
        max: element.getAttribute('aria-valuemax')
      })),
      dialogs: [...document.querySelectorAll('[role="dialog"]')].map((element) => ({
        ariaModal: element.getAttribute('aria-modal'),
        labelledby: element.getAttribute('aria-labelledby')
      })),
      fieldsets: [...document.querySelectorAll('fieldset')].map((element) => ({
        legend: (element.querySelector('legend')?.textContent ?? '').trim().slice(0, 90)
      }))
    },
    skipLink: Boolean([...document.querySelectorAll('a[href^="#"]')]
      .find((element) => /skip/i.test(element.textContent ?? '')))
  };
};

/** Tabs from the top of the document and records where focus lands. */
async function tabTrace(page, maxStops = 25) {
  const stops = [];
  await page.evaluate(() => {
    document.body.setAttribute('tabindex', '-1');
    document.body.focus();
    document.body.removeAttribute('tabindex');
  });
  for (let index = 0; index < maxStops; index += 1) {
    await page.keyboard.press('Tab');
    const stop = await page.evaluate(() => {
      const element = document.activeElement;
      if (!element || element === document.body) return null;
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        tag: element.tagName.toLowerCase(),
        text: (element.getAttribute('aria-label') ?? element.textContent ?? '').trim().slice(0, 60),
        outline: style.outlineStyle === 'none' ? null : `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}`,
        boxShadow: style.boxShadow === 'none' ? null : style.boxShadow.slice(0, 80),
        inViewport: rect.top >= 0 && rect.bottom <= window.innerHeight
      };
    });
    if (!stop) break;
    stops.push(stop);
  }
  return {
    stops,
    stopsWithoutVisibleFocus: stops.filter((stop) => !stop.outline && !stop.boxShadow).length,
    stopsOutsideViewport: stops.filter((stop) => !stop.inViewport).length
  };
}

// ---------------------------------------------------------------------------
// Assertions.
// ---------------------------------------------------------------------------

function assertionsFor(route, viewport, measurement, tabs) {
  const findings = [];
  const add = (id, ok, detail, wcag) => findings.push({ id, ok, detail, wcag });

  add('A-overflow', measurement.horizontalOverflowPx === 0,
    `horizontal overflow ${measurement.horizontalOverflowPx}px${measurement.overflowingElements.length ? ` — ${measurement.overflowingElements.join(', ')}` : ''}`,
    '1.4.10');

  add('A-no-iframe', measurement.iframeCount === 0,
    `${measurement.iframeCount} iframe(s)`, null);

  add('A-no-nested-scroll', measurement.nestedScrollableCount === 0,
    `${measurement.nestedScrollableCount} nested scroll container(s) inside <main>`, null);

  add('A-page-title', Boolean(measurement.title && measurement.title.trim()),
    measurement.title ? `title: ${measurement.title}` : 'no document title', '2.4.2');

  add('A-html-lang', Boolean(measurement.htmlLang),
    measurement.htmlLang ? `lang: ${measurement.htmlLang}` : 'no lang attribute on <html>', '3.1.1');

  add('A-viewport-meta', Boolean(measurement.viewportMeta),
    measurement.viewportMeta ? `viewport: ${measurement.viewportMeta}` : 'no viewport meta; mobile browsers will apply the default ~980px layout viewport',
    '1.4.10');

  add('A-target-size', measurement.targetsBelow24.length === 0,
    measurement.targetsBelow24.length === 0
      ? `${measurement.targets.length} targets all >= 24x24`
      : `${measurement.targetsBelow24.length} target(s) below 24x24: ${measurement.targetsBelow24.map((target) => `${target.tag}${target.name ? `(${target.name.slice(0, 24)})` : ''} ${target.width}x${target.height}`).join('; ')}`,
    '2.5.8');

  add('A-heading-present', measurement.headings.length > 0,
    `${measurement.headings.length} heading(s)`, '1.3.1');

  add('A-h1-exactly-one', measurement.headings.filter((heading) => heading.level === 1).length === 1,
    `${measurement.headings.filter((heading) => heading.level === 1).length} <h1>`, '1.3.1');

  const sectionLandmarks = measurement.landmarks.filter((landmark) => landmark.tag === 'section').length;
  add('A-heading-density', measurement.headings.length >= sectionLandmarks,
    `${measurement.headings.length} heading(s) for ${sectionLandmarks} labelled section(s)`, '2.4.6');

  add('A-skip-link', measurement.skipLink, measurement.skipLink ? 'skip link present' : 'no skip link', '2.4.1');

  add('A-focus-visible', tabs.stopsWithoutVisibleFocus === 0,
    `${tabs.stopsWithoutVisibleFocus}/${tabs.stops.length} tab stop(s) with no outline and no box-shadow`, '2.4.7');

  const namedInputs = measurement.inputs.filter((input) => input.name);
  if (namedInputs.length) {
    const withoutName = namedInputs.filter((input) => !input.hasAccessibleName);
    add('A-input-labels', withoutName.length === 0,
      withoutName.length === 0 ? `${namedInputs.length} input(s) all labelled` : `unlabelled: ${withoutName.map((input) => input.name).join(', ')}`,
      '3.3.2');

    const personal = namedInputs.filter((input) => /name|email|organisation|organization|role|phone/i.test(input.name ?? ''));
    if (personal.length) {
      const withoutAutocomplete = personal.filter((input) => !input.autocomplete);
      add('A-autocomplete', withoutAutocomplete.length === 0,
        withoutAutocomplete.length === 0
          ? `${personal.length} personal-data input(s) declare autocomplete`
          : `no autocomplete on: ${withoutAutocomplete.map((input) => input.name).join(', ')}`,
        '1.3.5');
    }
  }

  for (const bar of measurement.aria.progressbars) {
    add('A-progressbar-value', bar.now !== null && bar.label !== null,
      `progressbar label=${bar.label} valuenow=${bar.now}`, '4.1.2');
  }

  const genericLegends = measurement.aria.fieldsets.filter((fieldset) => /^(select|choose)\b/i.test(fieldset.legend));
  if (measurement.aria.fieldsets.length) {
    add('A-fieldset-legend', genericLegends.length === 0,
      genericLegends.length === 0
        ? `${measurement.aria.fieldsets.length} fieldset legend(s) carry context`
        : `generic legend(s): ${genericLegends.map((fieldset) => JSON.stringify(fieldset.legend)).join(', ')}`,
      '3.3.2');
  }

  return findings.map((finding) => ({ ...finding, routeId: route.id, viewport: viewport.name }));
}

// ---------------------------------------------------------------------------
// Baseline.
// ---------------------------------------------------------------------------

async function loadBaseline() {
  if (!existsSync(baselinePath)) return { knownOpen: [] };
  return JSON.parse(await readFile(baselinePath, 'utf8'));
}

const baseline = await loadBaseline();
const knownOpen = new Set((baseline.knownOpen ?? []).map((entry) => `${entry.routeId}::${entry.assertionId}`));

// ---------------------------------------------------------------------------
// Run.
// ---------------------------------------------------------------------------

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});

const observations = [];
const findings = [];

try {
  for (const route of routes) {
    for (const viewport of viewports) {
      const page = await browser.newPage();
      try {
        await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
        await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
        if (protectionBypass) await page.setExtraHTTPHeaders({ 'x-vercel-protection-bypass': protectionBypass });
        await page.setRequestInterception(true);
        installRequestPolicy(page, route.paymentState ?? null);

        const url = route.absolute ? route.path : `${baseUrl}${route.path}`;
        const response = await page.goto(url, { waitUntil: 'networkidle0', timeout: 45_000 });

        // Payment states need one poll cycle to land.
        if (route.paymentState) await new Promise((resolveDelay) => { setTimeout(resolveDelay, 500); });

        const measurement = await page.evaluate(MEASURE);
        const tabs = await tabTrace(page);

        const shotName = `${route.id}__chromium__${viewport.name}__${viewport.condition}.png`;
        await page.screenshot({ path: join(screenshotDir, shotName), fullPage: true });

        observations.push({
          routeId: route.id,
          journeyStep: route.journeyStep,
          surface: route.surface,
          url,
          viewport: viewport.name,
          condition: viewport.condition,
          httpStatus: response?.status() ?? null,
          screenshot: shotName,
          measurement,
          tabs
        });

        findings.push(...assertionsFor(route, viewport, measurement, tabs));
      } catch (error) {
        observations.push({
          routeId: route.id,
          viewport: viewport.name,
          error: error instanceof Error ? error.message : String(error)
        });
        findings.push({
          routeId: route.id,
          viewport: viewport.name,
          id: 'A-route-loads',
          ok: false,
          detail: `route did not load: ${error instanceof Error ? error.message : String(error)}`,
          wcag: null
        });
      } finally {
        await page.close();
      }
    }
  }
} finally {
  await browser.close();
}

// Collapse per-viewport findings to per-route assertions: a failure at any viewport is a failure.
const byAssertion = new Map();
for (const finding of findings) {
  const key = `${finding.routeId}::${finding.id}`;
  const existing = byAssertion.get(key);
  if (!existing) {
    byAssertion.set(key, { ...finding, failingViewports: finding.ok ? [] : [finding.viewport] });
    continue;
  }
  if (!finding.ok) {
    existing.ok = false;
    existing.detail = finding.detail;
    existing.failingViewports.push(finding.viewport);
  }
}

const classified = [...byAssertion.values()].map((finding) => ({
  ...finding,
  status: finding.ok
    ? 'PASS'
    : knownOpen.has(`${finding.routeId}::${finding.id}`) ? 'KNOWN-OPEN' : 'REGRESSION'
}));

const counts = classified.reduce((accumulator, finding) => {
  accumulator[finding.status] = (accumulator[finding.status] ?? 0) + 1;
  return accumulator;
}, {});

for (const finding of classified.filter((entry) => entry.status !== 'PASS')) {
  console.log(`${finding.status.padEnd(10)}  ${finding.routeId.padEnd(24)} ${finding.id.padEnd(20)} ${finding.wcag ? `[WCAG ${finding.wcag}] ` : ''}${finding.detail}`);
  console.log(`${' '.repeat(12)}failing viewports: ${[...new Set(finding.failingViewports)].join(', ')}`);
}

console.log('');
console.log(`G30 device sweep: ${routes.length} route(s) x ${viewports.length} viewport(s) — `
  + `${counts.PASS ?? 0} pass, ${counts['KNOWN-OPEN'] ?? 0} known-open, ${counts.REGRESSION ?? 0} regression`);
console.log(`safety: ${blockedWrites} mutating request(s) aborted, ${blockedDeny} denylisted request(s) aborted`);

const report = {
  suite: 'g30-device-a11y-browser',
  generatedAtUtc: new Date().toISOString(),
  baseUrl,
  adaptiveLiveSweep: Boolean(adaptiveResumeUrl),
  engine: 'chromium (puppeteer-core) — Safari and Edge are manual, see docs/g30/device-browser-matrix.md',
  safety: { mutatingRequestsAborted: blockedWrites, denylistedRequestsAborted: blockedDeny },
  counts,
  findings: classified,
  observations
};

await writeFile(join(evidenceDir, 'device-a11y-browser.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(`evidence written: ${join(evidenceDir, 'device-a11y-browser.json')}`);

if (counts.REGRESSION) {
  console.error('');
  console.error(`FAILED: ${counts.REGRESSION} assertion(s) failing that are not baselined as known-open.`);
  process.exit(1);
}
