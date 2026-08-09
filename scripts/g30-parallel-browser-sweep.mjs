#!/usr/bin/env node

import puppeteer from 'puppeteer-core';

const baseUrl = process.env.G30_BASE_URL ?? 'http://127.0.0.1:3100';
const chromePath = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const routes = [
  '/fraud-readiness-score',
  '/score/adaptive',
  '/score/start',
  '/score/snapshot/G30-NO-TOKEN',
  '/score/report/access/G30-NO-TOKEN',
  '/score/payment/return?order_reference=G30-NO-TOKEN',
];
const viewports = [
  { name: 'desktop-1440', width: 1440, height: 900, isMobile: false, hasTouch: false },
  { name: 'desktop-1024', width: 1024, height: 768, isMobile: false, hasTouch: false },
  { name: 'tablet-768', width: 768, height: 1024, isMobile: false, hasTouch: true },
  { name: 'iphone-375', width: 375, height: 667, isMobile: true, hasTouch: true },
  { name: 'iphone-430', width: 430, height: 932, isMobile: true, hasTouch: true },
  { name: 'android-landscape', width: 844, height: 390, isMobile: true, hasTouch: true },
  { name: 'zoom-200-proxy', width: 640, height: 400, isMobile: false, hasTouch: false },
  { name: 'zoom-400-proxy', width: 320, height: 200, isMobile: false, hasTouch: false },
];

const browser = await puppeteer.launch({ headless: true, executablePath: chromePath, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
page.setDefaultNavigationTimeout(12000);
const findings = [];
const consoleErrors = [];
const gatedConsoleErrors = [];
let activeRoute = '';
page.on('console', (message) => {
  if (message.type() !== 'error') return;
  if (activeRoute.startsWith('/score/report/access/') && message.text().includes('423')) gatedConsoleErrors.push(message.text());
  else consoleErrors.push(message.text());
});
page.on('pageerror', (error) => consoleErrors.push(String(error)));
await page.setRequestInterception(true);
page.on('request', async (request) => {
  const url = new URL(request.url());
  const sameOrigin = url.origin === new URL(baseUrl).origin;
  const isPaymentStatus = sameOrigin && url.pathname.includes('/score/api/payments/');
  if (isPaymentStatus && request.method() === 'GET') {
    await request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'pending', orderReference: 'G30-NO-TOKEN' }) });
    return;
  }
  if (request.method() !== 'GET' || !sameOrigin) {
    await request.abort('blockedbyclient');
    return;
  }
  await request.continue();
});

for (const viewport of viewports) {
  await page.goto('about:blank', { waitUntil: 'domcontentloaded', timeout: 3000 }).catch(() => {});
  await page.setViewport(viewport);
  await page.setUserAgent(viewport.isMobile
    ? 'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 Chrome/151 Mobile Safari/537.36'
    : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 Chrome/151 Safari/537.36');
  for (const route of routes) {
    activeRoute = route;
    const url = `${baseUrl}${route}`;
    const started = Date.now();
    let navigationError = null;
    let responseStatus = null;
    try {
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 12000 });
      responseStatus = response?.status() ?? null;
      await new Promise((resolve) => setTimeout(resolve, 250));
    } catch (error) {
      navigationError = String(error);
    }
    const snapshot = navigationError ? null : await page.evaluate(() => {
      const visible = (element) => Boolean(element && element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
      const interactive = [...document.querySelectorAll('a,button,input,select,textarea,[tabindex]')].filter(visible);
      const smallTargets = interactive.filter((element) => { const rect = element.getBoundingClientRect(); return rect.width > 0 && rect.height > 0 && (rect.width < 24 || rect.height < 24); }).length;
      return {
        title: document.title,
        lang: document.documentElement.getAttribute('lang'),
        viewport: document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? null,
        bodyScrollWidth: document.body.scrollWidth,
        viewportWidth: window.innerWidth,
        nestedScrollable: [...document.querySelectorAll('*')].filter((element) => { const style = getComputedStyle(element); return element.scrollHeight > element.clientHeight + 2 && /auto|scroll/.test(style.overflowY); }).length,
        landmarks: [...document.querySelectorAll('main,nav,header,footer,[role="main"],[role="navigation"]')].length,
        headings: document.querySelectorAll('h1,h2,h3,h4,h5,h6').length,
        labelledInputs: [...document.querySelectorAll('input,select,textarea')].filter((element) => element.labels?.length || element.getAttribute('aria-label') || element.getAttribute('aria-labelledby')).length,
        fieldsetLegends: [...document.querySelectorAll('fieldset')].filter((element) => element.querySelector('legend')).length,
        dialogs: document.querySelectorAll('[role="dialog"]').length,
        focused: document.activeElement?.tagName ?? null,
        smallTargets,
      };
    });
    findings.push({ viewport: viewport.name, route, responseStatus, navigationError, elapsedMs: Date.now() - started, snapshot });
  }
}
activeRoute = '';

await browser.close();
const failedNavigations = findings.filter((item) => item.navigationError);
const result = {
  ok: true,
  suite: 'g30-parallel-browser-sweep',
  baseUrl,
  safety: { nonGetRequestsAborted: true, externalRequestsAborted: true, paymentStatusStubbed: true, customerDataCreated: false, frozenCustomerAccessResponsesExpected: true },
  matrix: viewports,
  findings,
  consoleErrors,
  summary: { cases: findings.length, navigationFailures: failedNavigations.length, consoleErrors: consoleErrors.length, expectedFrozenCustomerAccessConsoleErrors: gatedConsoleErrors.length },
};
console.log(JSON.stringify(result, null, 2));
