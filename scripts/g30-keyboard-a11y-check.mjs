#!/usr/bin/env node

import fs from 'node:fs';
import { createRequire } from 'node:module';
import puppeteer from 'puppeteer-core';

const require = createRequire(import.meta.url);
const baseUrl = process.env.G30_BASE_URL ?? 'http://127.0.0.1:3101';
const chromePath = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const axeSource = fs.readFileSync(require.resolve('axe-core/axe.js'), 'utf8');
const routes = ['/fraud-readiness-score', '/score/adaptive', '/score/start', '/score/snapshot/G30-NO-TOKEN', '/score/payment/return?order_reference=G30-NO-TOKEN'];
const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile-portrait', width: 375, height: 667 },
  { name: 'mobile-landscape', width: 844, height: 390 },
];

const browser = await puppeteer.launch({ headless: true, executablePath: chromePath, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const page = await browser.newPage();
page.setDefaultNavigationTimeout(12000);
await page.setRequestInterception(true);
page.on('request', async (request) => {
  const url = new URL(request.url());
  const sameOrigin = url.origin === new URL(baseUrl).origin;
  if (sameOrigin && url.pathname.includes('/score/api/payments/') && request.method() === 'GET') {
    await request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'pending', orderReference: 'G30-NO-TOKEN' }) });
    return;
  }
  if (request.method() !== 'GET' || !sameOrigin) await request.abort('blockedbyclient');
  else await request.continue();
});

const findings = [];
for (const viewport of viewports) {
  await page.setViewport(viewport);
  await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  for (const route of routes) {
    const response = await page.goto(`${baseUrl}${route}`, { waitUntil: 'domcontentloaded' });
    await new Promise((resolve) => setTimeout(resolve, 200));
    const consentButton = await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Decline')?.textContent ?? null);
    if (consentButton) {
      await page.evaluate(() => [...document.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Decline')?.click());
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    const axeAvailable = route !== '/score/snapshot/G30-NO-TOKEN';
    if (axeAvailable) await page.addScriptTag({ content: axeSource });
    const focused = [];
    await page.evaluate(() => { document.body.tabIndex = -1; document.body.focus(); });
    for (let index = 0; index < 12; index += 1) {
      await page.keyboard.press('Tab');
      focused.push(await page.evaluate(() => ({
        tag: document.activeElement?.tagName ?? null,
        id: document.activeElement?.id ?? null,
        role: document.activeElement?.getAttribute('role') ?? null,
        text: (document.activeElement?.textContent ?? '').trim().slice(0, 80),
        href: document.activeElement instanceof HTMLAnchorElement ? document.activeElement.getAttribute('href') : null,
      })));
    }
    const details = await page.evaluate(async () => {
      const axeResult = typeof window.axe?.run === 'function'
        ? await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] } })
        : null;
      return {
        firstFocusable: document.querySelector('a[href="#main-content"],a[href="#website-main-content"]')?.getAttribute('href') ?? null,
        skipLinkPresent: Boolean(document.querySelector('a[href="#main-content"],a[href="#website-main-content"]')),
        formAutocomplete: [...document.querySelectorAll('input')].map((input) => input.autocomplete).filter(Boolean),
        reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
        bodyScrollWidth: document.body.scrollWidth,
        viewportWidth: window.innerWidth,
        axeViolations: axeResult?.violations ?? [],
      };
    });
    findings.push({ viewport: viewport.name, route, responseStatus: response?.status() ?? null, focused, details });
  }
}
await browser.close();

const axeViolations = findings.flatMap((item) => item.details.axeViolations.map((violation) => ({ route: item.route, viewport: item.viewport, id: violation.id, impact: violation.impact, nodes: violation.nodes.length })));
const skipFailures = findings.filter((item) => !item.details.skipLinkPresent || !['#main-content', '#website-main-content'].includes(item.focused[0]?.href));
const overflowFailures = findings.filter((item) => item.details.bodyScrollWidth > item.details.viewportWidth);
const result = {
  ok: axeViolations.length === 0 && skipFailures.length === 0 && overflowFailures.length === 0,
  suite: 'g30-keyboard-a11y-check',
  baseUrl,
  cases: findings.length,
  keyboard: { skipLinkFirstTabFailures: skipFailures.length, failures: skipFailures.map((item) => ({ viewport: item.viewport, route: item.route, firstFocus: item.focused[0] })), reducedMotionCases: findings.filter((item) => item.details.reducedMotion).length },
  axe: { violations: axeViolations },
  overflow: { failures: overflowFailures.length },
  formAutocomplete: findings.filter((item) => item.route === '/score/start').map((item) => ({ viewport: item.viewport, tokens: item.details.formAutocomplete })),
};
console.log(JSON.stringify(result, null, 2));
if (!result.ok) process.exitCode = 1;
