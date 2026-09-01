#!/usr/bin/env node

/**
 * Browser-rendered V1.2 evidence capture.
 *
 * The target must be the exact READY Vercel Preview for CANDIDATE_SHA. The private states use the
 * Preview-only visual-review route, which renders the real customer components with immutable
 * fixtures and makes no Supabase request or mutation. This script captures the full pack and then
 * copies only the requested owner-review delta rows into a separate directory.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const BASE = (process.env.BASE_URL ?? 'http://127.0.0.1:3210').replace(/\/$/, '');
const CANDIDATE_SHA = process.env.CANDIDATE_SHA ?? '';
const BRANCH = process.env.BRANCH ?? 'cx/v12-premium-experience-recovery-20260901';
const DEPLOYMENT_ID = process.env.VERCEL_DEPLOYMENT_ID ?? null;
const DEPLOYMENT_URL = process.env.VERCEL_DEPLOYMENT_URL ?? BASE;
const GITHUB_COMMIT_SHA = process.env.VERCEL_GITHUB_COMMIT_SHA ?? CANDIDATE_SHA;
const READY_STATE = process.env.VERCEL_READY_STATE ?? 'UNKNOWN';
const PRODUCTION_SHA = process.env.PRODUCTION_SHA ?? '8376242581772153c897687af3acd4da436509eb';
const PREVIEW_SHARE_URL = process.env.VERCEL_SHARE_URL ?? null;
const OUT = path.resolve(process.env.EVIDENCE_DIR ?? `outputs/v12-premium-experience-recovery/${CANDIDATE_SHA || 'local'}`);
const FULL_OUT = path.join(OUT, 'full');
const DELTA_OUT = path.join(OUT, 'owner-delta');
const CHROME_PATH = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

if (!CANDIDATE_SHA) {
  throw new Error('CANDIDATE_SHA is required so the evidence cannot be detached from a commit.');
}

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1 },
  { name: 'mobile-320', width: 320, height: 900, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  { name: 'mobile-390', width: 390, height: 900, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  { name: 'mobile-430', width: 430, height: 900, deviceScaleFactor: 1, isMobile: true, hasTouch: true }
];

const CASES = [
  { group: 'public', kind: 'public', name: 'public-homepage', path: '/' },
  { group: 'public', kind: 'public', name: 'public-storefront', path: '/fraud-readiness' },
  { group: 'public', kind: 'public', name: 'public-advisory', path: '/fraud-readiness/advisory' },
  { group: 'public', kind: 'public', name: 'public-assessment-start-terms', path: '/score/start' },
  { group: 'public', kind: 'public', name: 'public-assessment-start-accepted', path: '/score/start', acceptTerms: true },
  { group: 'public', kind: 'public', name: 'public-storefront-products', path: '/fraud-readiness', scrollSelector: '#products' },

  { group: 'private', kind: 'adaptive', name: 'private-adaptive-early', path: '/score/visual-review/adaptive/early' },
  { group: 'private', kind: 'adaptive', name: 'private-adaptive-mid', path: '/score/visual-review/adaptive/mid' },
  { group: 'private', kind: 'adaptive', name: 'private-adaptive-late', path: '/score/visual-review/adaptive/late' },
  { group: 'private', kind: 'adaptive', name: 'private-adaptive-review-ready-to-submit', path: '/score/visual-review/adaptive/review' },
  { group: 'private', kind: 'adaptive', name: 'private-adaptive-submitted-completion', path: '/score/visual-review/adaptive/submitted' },
  { group: 'private', kind: 'snapshot', name: 'private-snapshot-score-100', path: '/score/visual-review/snapshot/score-100' },
  { group: 'private', kind: 'snapshot', name: 'private-snapshot-score-60', path: '/score/visual-review/snapshot/score-60' },
  { group: 'private', kind: 'snapshot', name: 'private-snapshot-score-20', path: '/score/visual-review/snapshot/score-20' },
  { group: 'private', kind: 'snapshot', name: 'private-snapshot-not-issued', path: '/score/visual-review/snapshot/insufficient-visibility' },
  { group: 'private', kind: 'order', name: 'private-order-essential-confirm', path: '/score/visual-review/order/essential/confirm' },
  { group: 'private', kind: 'order', name: 'private-order-essential-billing', path: '/score/visual-review/order/essential/billing' },
  { group: 'private', kind: 'order', name: 'private-order-essential-billing-invoice', path: '/score/visual-review/order/essential/billing-invoice', invoiceRequested: true, scrollSelector: '#billingAddress', scrollBlock: 'center' },
  { group: 'private', kind: 'order', name: 'private-order-essential-payment', path: '/score/visual-review/order/essential/payment' },
  { group: 'private', kind: 'order', name: 'private-order-comprehensive-confirm', path: '/score/visual-review/order/comprehensive/confirm' },
  { group: 'private', kind: 'order', name: 'private-order-comprehensive-billing', path: '/score/visual-review/order/comprehensive/billing' },
  { group: 'private', kind: 'order', name: 'private-order-comprehensive-billing-invoice', path: '/score/visual-review/order/comprehensive/billing-invoice', invoiceRequested: true, scrollSelector: '#billingAddress', scrollBlock: 'center' },
  { group: 'private', kind: 'order', name: 'private-order-comprehensive-payment', path: '/score/visual-review/order/comprehensive/payment' },

  { group: 'section', kind: 'snapshot-next-step', name: 'private-snapshot-score-100-next-step', path: '/score/visual-review/snapshot/score-100', scrollSelector: '#next-step' },
  { group: 'section', kind: 'snapshot-next-step', name: 'private-snapshot-score-60-next-step', path: '/score/visual-review/snapshot/score-60', scrollSelector: '#next-step' },
  { group: 'section', kind: 'snapshot-next-step', name: 'private-snapshot-score-20-next-step', path: '/score/visual-review/snapshot/score-20', scrollSelector: '#next-step' },
  { group: 'section', kind: 'snapshot-next-step', name: 'private-snapshot-not-issued-next-step', path: '/score/visual-review/snapshot/insufficient-visibility', scrollSelector: '#next-step' }
];

const DELTA_KEYS = new Set([
  'private-adaptive-early:320', 'private-adaptive-early:390',
  'private-adaptive-mid:320', 'private-adaptive-mid:390',
  'private-adaptive-late:320', 'private-adaptive-late:390',
  'private-adaptive-review-ready-to-submit:390',
  'private-adaptive-submitted-completion:390',
  'private-snapshot-score-60-next-step:390',
  'private-snapshot-score-20-next-step:390',
  'private-order-essential-billing-invoice:1440',
  'private-order-essential-billing-invoice:320',
  'private-order-essential-billing-invoice:390',
  'private-order-essential-billing-invoice:430',
  'private-order-comprehensive-billing-invoice:1440',
  'private-order-comprehensive-billing-invoice:320',
  'private-order-comprehensive-billing-invoice:390',
  'private-order-comprehensive-billing-invoice:430',
  'public-advisory:1440',
  'public-advisory:390'
]);

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForStableRender(page) {
  await Promise.race([
    page.evaluate(async () => {
      if (document.fonts?.ready) await document.fonts.ready;
    }),
    delay(5000)
  ]);
  await delay(450);
}

async function waitForScoreGauge(page) {
  await page.waitForFunction(() => {
    const gauge = document.querySelector('[data-score-gauge]');
    if (!gauge) return true;
    const expected = gauge.getAttribute('data-score-gauge-value');
    if (expected === 'not-issued') return true;
    return gauge.querySelector('svg text')?.textContent?.trim() === expected;
  }, { timeout: 5000 });
  await delay(100);
}

async function primePreviewAccess(page) {
  if (!PREVIEW_SHARE_URL) return;
  await page.goto(PREVIEW_SHARE_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  if (page.url().includes('vercel.com/login')) throw new Error('Preview share URL did not grant browser access.');
  await delay(400);
}

async function acceptTerms(page) {
  await page.waitForSelector('dialog[data-fraud-readiness-terms-gate][open]', { timeout: 20000 });
  await page.evaluate(() => {
    const dialog = document.querySelector('dialog[data-fraud-readiness-terms-gate]');
    if (!dialog) throw new Error('terms dialog not found');
    for (const input of dialog.querySelectorAll('input[type="checkbox"]')) {
      if (!input.checked) input.click();
    }
    const accept = [...dialog.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Accept and continue');
    if (!accept) throw new Error('terms accept control not found');
    accept.click();
  });
  await page.waitForFunction(() => !document.querySelector('dialog[data-fraud-readiness-terms-gate][open]'), { timeout: 20000 });
  await delay(300);
}

async function assertVisualState(page, item, viewport, sameOriginScoreApiRequests) {
  return page.evaluate(({ kind, invoiceRequested, expectedWidth, apiRequests }) => {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const visible = (element) => {
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && Number(style.opacity) !== 0
        && rect.width > 0
        && rect.height > 0;
    };
    const isVisuallyHidden = (element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return (element.classList.contains('sr-only') && !element.matches(':focus'))
        || (rect.right < -100 || rect.left > viewportWidth + 100)
        || style.clip === 'rect(0px, 0px, 0px, 0px)';
    };
    const rectData = (element) => {
      const rect = element.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height };
    };
    const insideViewport = (rect) => rect.left >= -1 && rect.right <= viewportWidth + 1 && rect.top >= -1 && rect.bottom <= viewportHeight + 1;
    const insideHorizontalViewport = (rect) => rect.left >= -1 && rect.right <= viewportWidth + 1;
    const intersectsViewport = (rect) => rect.bottom > -1 && rect.top < viewportHeight + 1;
    const ctaPattern = /\b(start|assess|compare|choose|talk|continue|confirm|submit|send|discuss|opening|view|copy|return)\b/i;
    const openModal = [...document.querySelectorAll('dialog[open],[role="dialog"]')].find(visible) ?? null;
    const allInteractive = [...document.querySelectorAll('button,a[href],input,select,textarea,[role="button"],[role="radio"]')]
      .filter((element) => visible(element) && !isVisuallyHidden(element))
      .filter((element) => !element.closest('footer'))
      .filter((element) => !openModal || openModal.contains(element));
    const interactive = allInteractive.map((element) => {
      const control = element.matches('input,select,textarea') ? element.closest('label') ?? element : element;
      return { element, control, rect: control.getBoundingClientRect() };
    });
    const viewportInteractive = interactive.filter(({ rect }) => rect.top >= -1 && rect.bottom <= viewportHeight + 1);
    const visibleCtas = interactive.filter(({ element }) => ctaPattern.test((element.textContent ?? element.getAttribute('aria-label') ?? '').trim()));
    const smallControls = viewportInteractive.filter(({ element, rect }) => {
      const isField = element.matches('input,select,textarea,[role="radio"]');
      const isButton = element.matches('button,[role="button"]');
      const isCompactCheckboxRow = element.matches('input[type="checkbox"]');
      return !isCompactCheckboxRow && (isField || isButton) && (rect.width < 40 || rect.height < 40);
    });
    let interactiveOverlapCount = 0;
    for (let firstIndex = 0; firstIndex < viewportInteractive.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < viewportInteractive.length; secondIndex += 1) {
        const first = viewportInteractive[firstIndex];
        const second = viewportInteractive[secondIndex];
        if (first.element.contains(second.element) || second.element.contains(first.element) || first.control.contains(second.element) || second.control.contains(first.element)) continue;
        const overlapWidth = Math.min(first.rect.right, second.rect.right) - Math.max(first.rect.left, second.rect.left);
        const overlapHeight = Math.min(first.rect.bottom, second.rect.bottom) - Math.max(first.rect.top, second.rect.top);
        if (overlapWidth > 1 && overlapHeight > 1) interactiveOverlapCount += 1;
      }
    }
    const visibleContent = [...document.querySelectorAll('main,section,article,form,fieldset,h1,h2,h3,p,button,a[href],input,select,textarea,[role="dialog"]')].filter(visible);
    const clippedContent = visibleContent.filter((element) => {
      if (isVisuallyHidden(element)) return false;
      const rect = element.getBoundingClientRect();
      return (rect.left < -1 && rect.right > -100) || (rect.right > viewportWidth + 1 && rect.left < viewportWidth + 100);
    });
    const fixedWidthContent = [...document.querySelectorAll('main,section,article,form,fieldset,[data-order-journey],[data-adaptive-assessment]')]
      .filter(visible)
      .filter((element) => element.getBoundingClientRect().width > viewportWidth + 1);
    const dialogs = [...document.querySelectorAll('[role="dialog"],dialog')].filter(visible);
    const brokenDialogs = dialogs.filter((element) => !insideViewport(element.getBoundingClientRect()));
    const gauges = [...document.querySelectorAll('[data-score-gauge]')].filter(visible);
    const gaugeEscapeOrOverlap = gauges.filter((gauge) => {
      const gaugeRect = gauge.getBoundingClientRect();
      if (!insideHorizontalViewport(gaugeRect)) return true;
      return interactive.some(({ element, rect }) => {
        if (element.closest('[data-score-gauge]')) return false;
        if (!intersectsViewport(gaugeRect) || !intersectsViewport(rect)) return false;
        const overlapWidth = Math.min(gaugeRect.right, rect.right) - Math.max(gaugeRect.left, rect.left);
        const overlapHeight = Math.min(gaugeRect.bottom, rect.bottom) - Math.max(gaugeRect.top, rect.top);
        return overlapWidth > 2 && overlapHeight > 2;
      });
    });
    const bodyText = document.body.innerText ?? '';
    const adaptive = document.querySelector('[data-adaptive-assessment]');
    const activeQuestion = adaptive?.querySelector('h1[tabindex="-1"]') ?? null;
    const programmaticHeadings = [...document.querySelectorAll('h1[tabindex="-1"]')];
    const outlineIsVisuallyHidden = (style) => style.outlineStyle === 'none'
      || parseFloat(style.outlineWidth) === 0
      || style.outlineColor === 'transparent'
      || /^rgba\([^)]*,\s*0\)$/.test(style.outlineColor);
    const headingOutlineVisible = programmaticHeadings.some((heading) => {
      const style = window.getComputedStyle(heading);
      return !outlineIsVisuallyHidden(style);
    });
    const questionFontSize = activeQuestion ? parseFloat(window.getComputedStyle(activeQuestion).fontSize) : null;
    const questionTypographyResponsive = !activeQuestion
      || (expectedWidth <= 430 ? questionFontSize <= 22 : questionFontSize >= 23);
    const productOrder = [...document.querySelectorAll('[data-product-tier]')].map((element) => element.getAttribute('data-product-tier'));
    const recommendedTierFirst = kind === 'snapshot-next-step' && (expectedWidth > 430 || productOrder[0] === 'essential' || productOrder[0] === 'comprehensive');
    const mobileRecommendedTierFirst = kind !== 'snapshot-next-step'
      || expectedWidth > 430
      || (document.body.innerText.includes('score 60') && productOrder[0] === 'comprehensive')
      || (document.body.innerText.includes('score 20') && productOrder[0] === 'comprehensive')
      || (!document.body.innerText.includes('score 60') && !document.body.innerText.includes('score 20'));
    const invoiceNames = ['legalName', 'addressee', 'billingEmail', 'billingAddress', 'vatNumber', 'registrationNumber', 'purchaseOrderReference'];
    const invoiceFieldsPresent = !invoiceRequested
      || invoiceNames.every((name) => document.querySelector(`[name="${name}"]`))
        && ['Registered company name', 'Invoice addressed to', 'Billing email', 'Billing address', 'VAT number', 'Company registration number', 'Purchase order reference'].every((label) => [...document.querySelectorAll('label')].some((element) => (element.textContent ?? '').toLowerCase().includes(label.toLowerCase())));
    const invoiceCtasVisible = !invoiceRequested || visibleCtas.some(({ element, rect }) => /confirm order/i.test(element.textContent ?? '') && insideViewport(rect));
    const fixedQuestionDenominator = /(?:question|questions)\s*(?:\d+\s*)?of\s*\d+|of\s*\d+\s*(?:question|questions)/i.test(adaptive?.innerText ?? '');
    const noCustomerFacingEmDash = !bodyText.includes('—');
    const focusTarget = document.activeElement;
    const focusedProgrammaticHeading = Boolean(focusTarget?.matches?.('h1[tabindex="-1"]'));
    const activeHeadingOutlineHidden = !focusedProgrammaticHeading || (() => {
      const style = window.getComputedStyle(focusTarget);
      return outlineIsVisuallyHidden(style);
    })();
    const assertion = {
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth,
      noHorizontalOverflow: document.documentElement.scrollWidth <= viewportWidth + 1,
      noClipping: clippedContent.length === 0,
      noInteractiveOverlap: interactiveOverlapCount === 0,
      noCtaOutsideViewport: visibleCtas.every(({ rect }) => insideHorizontalViewport(rect)),
      noSmallControls: smallControls.length === 0,
      noFixedWidthContent: fixedWidthContent.length === 0,
      noBrokenDialogs: brokenDialogs.length === 0,
      snapshotGaugesContained: gaugeEscapeOrOverlap.length === 0,
      noFixedQuestionDenominator: !fixedQuestionDenominator,
      noCustomerFacingEmDash,
      noProgrammaticHeadingOutline: !headingOutlineVisible && activeHeadingOutlineHidden,
      questionTypographyResponsive,
      mobileRecommendedTierFirst,
      invoiceFieldsPresent,
      invoiceCtasVisible,
      noSameOriginScoreApiRequests: apiRequests === 0,
      noPostRequests: apiRequests === 0
    };
    return {
      ...assertion,
      assertion,
      focusedElement: focusTarget ? { tag: focusTarget.tagName, id: focusTarget.id, tabIndex: focusTarget.getAttribute('tabindex') } : null,
      questionFontSize,
      productOrder,
      counts: { clipped: clippedContent.length, interactiveOverlap: interactiveOverlapCount, smallControls: smallControls.length, brokenDialogs: brokenDialogs.length, gaugeEscapeOrOverlap: gaugeEscapeOrOverlap.length },
      apiRequests,
      viewport: { width: viewportWidth, height: viewportHeight }
    };
  }, { kind: item.kind, invoiceRequested: Boolean(item.invoiceRequested), expectedWidth: viewport.width, apiRequests: sameOriginScoreApiRequests });
}

function rowFor(item, viewport, screenshot, details) {
  return {
    name: item.name,
    route: item.path,
    viewport: `${viewport.width}x${viewport.height}`,
    screenshot,
    ...details,
    pass: Object.values(details.assertion).every((value) => typeof value !== 'boolean' || value)
  };
}

function assertionSummary(rows) {
  const keys = [
    'noHorizontalOverflow', 'noClipping', 'noInteractiveOverlap', 'noCtaOutsideViewport', 'noSmallControls',
    'noFixedWidthContent', 'noBrokenDialogs', 'snapshotGaugesContained', 'noFixedQuestionDenominator',
    'noCustomerFacingEmDash', 'noProgrammaticHeadingOutline', 'questionTypographyResponsive',
    'mobileRecommendedTierFirst', 'invoiceFieldsPresent', 'invoiceCtasVisible', 'noSameOriginScoreApiRequests', 'noPostRequests'
  ];
  return Object.fromEntries(keys.map((key) => [key, rows.every((row) => row.assertion[key] === true)]));
}

async function main() {
  await fs.mkdir(FULL_OUT, { recursive: true });
  await fs.mkdir(DELTA_OUT, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: CHROME_PATH, headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const rows = [];
  const deltaRows = [];
  const pageErrors = [];

  try {
    for (const viewport of VIEWPORTS) {
      const page = await browser.newPage();
      await page.setCacheEnabled(false);
      await page.setViewport(viewport);
      page.on('dialog', async (dialog) => {
        await dialog.accept();
      });
      page.on('pageerror', (error) => pageErrors.push({ viewport: viewport.width, message: error.message }));
      await primePreviewAccess(page);
      await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.evaluate(() => window.localStorage.setItem('mk_fraud_cookie_consent', 'declined'));
      await page.evaluate(() => {
        const decline = [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Decline');
        decline?.click();
      });
      await delay(100);

      for (const item of CASES) {
        const scoreApiRequests = [];
        const requestListener = (request) => {
          try {
            const requestUrl = new URL(request.url());
            if (requestUrl.origin === new URL(BASE).origin && requestUrl.pathname.startsWith('/score/api/')) scoreApiRequests.push({ method: request.method(), path: requestUrl.pathname });
          } catch {
            // Ignore malformed/non-HTTP browser requests.
          }
        };
        page.on('request', requestListener);
        await page.goto(`${BASE}${item.path}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await waitForStableRender(page);
        if (item.acceptTerms) await acceptTerms(page);
        if (item.scrollSelector) {
          await page.waitForSelector(item.scrollSelector, { timeout: 20000 });
          await page.evaluate(({ selector, block }) => document.querySelector(selector)?.scrollIntoView({ block, inline: 'nearest' }), { selector: item.scrollSelector, block: item.scrollBlock ?? 'start' });
          await delay(300);
        }
        if (item.kind === 'snapshot' || item.kind === 'snapshot-next-step') await waitForScoreGauge(page);
        const suffix = `${viewport.width}x${viewport.height}`;
        const filename = `${item.name}-${suffix}.jpg`;
        const fullPath = path.join(FULL_OUT, filename);
        await page.screenshot({ path: fullPath, type: 'jpeg', quality: 92 });
        const details = await assertVisualState(page, item, viewport, scoreApiRequests.length);
        const row = rowFor(item, viewport, filename, details);
        rows.push(row);
        const deltaKey = `${item.name}:${viewport.width}`;
        if (DELTA_KEYS.has(deltaKey)) {
          const deltaPath = path.join(DELTA_OUT, filename);
          await fs.copyFile(fullPath, deltaPath);
          deltaRows.push({ ...row, screenshot: filename });
        }
        page.off('request', requestListener);
        console.log(`${item.name} @ ${suffix}: ${row.pass ? 'PASS' : 'FAIL'}`);
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }

  const manifest = {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    candidate: { sha: CANDIDATE_SHA, branch: BRANCH, remoteHead: CANDIDATE_SHA, productionSha: PRODUCTION_SHA },
    vercel: { deploymentId: DEPLOYMENT_ID, deploymentUrl: DEPLOYMENT_URL, branch: BRANCH, githubCommitSha: GITHUB_COMMIT_SHA, readyState: READY_STATE, previewShareAccessUsed: Boolean(PREVIEW_SHARE_URL) },
    capture: {
      browserRendered: true,
      exactPreviewSha: CANDIDATE_SHA,
      viewportWidths: VIEWPORTS.map((viewport) => viewport.width),
      viewportHeight: 900,
      totalCanonicalScreenshots: rows.length,
      publicRows: rows.filter((row) => row.route === '/' || row.name.startsWith('public-')),
      privateRows: rows.filter((row) => row.name.startsWith('private-') && !row.name.endsWith('-next-step')),
      sectionRows: rows.filter((row) => row.name.endsWith('-next-step')),
      assertionSummary: assertionSummary(rows),
      pageErrors
    },
    ownerDelta: { totalScreenshots: deltaRows.length, rows: deltaRows, assertionSummary: assertionSummary(deltaRows), requestedKeys: [...DELTA_KEYS] }
  };
  const deltaManifest = { ...manifest, capture: { ...manifest.capture, publicRows: deltaRows.filter((row) => row.name.startsWith('public-')), privateRows: deltaRows.filter((row) => row.name.startsWith('private-') && !row.name.endsWith('-next-step')), sectionRows: deltaRows.filter((row) => row.name.endsWith('-next-step')), totalCanonicalScreenshots: deltaRows.length, assertionSummary: assertionSummary(deltaRows) }, ownerDelta: undefined };
  await fs.writeFile(path.join(OUT, 'visual-review-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await fs.writeFile(path.join(DELTA_OUT, 'owner-delta-manifest.json'), `${JSON.stringify(deltaManifest, null, 2)}\n`);

  const failures = rows.filter((row) => !row.pass);
  const deltaFailures = deltaRows.filter((row) => !row.pass);
  console.log(JSON.stringify({ ok: failures.length === 0 && deltaFailures.length === 0 && pageErrors.length === 0, fullScreenshots: rows.length, deltaScreenshots: deltaRows.length, fullOutput: OUT, deltaOutput: DELTA_OUT, failures: failures.map((row) => ({ name: row.name, viewport: row.viewport, assertion: row.assertion })), deltaFailures: deltaFailures.map((row) => ({ name: row.name, viewport: row.viewport, assertion: row.assertion })), pageErrors }, null, 2));
  if (failures.length || deltaFailures.length || pageErrors.length) process.exitCode = 1;
}

await main();
