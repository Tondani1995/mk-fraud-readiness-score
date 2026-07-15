import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import puppeteer from 'puppeteer-core';

const baseUrl = (process.env.PHASE23_BASE_URL ?? 'http://127.0.0.1:3100').replace(/\/$/, '');
const outputDirectory = process.env.PHASE23_BROWSER_EVIDENCE_DIR ?? 'tmp/phase23-browser-evidence';
const executablePath = process.env.CHROME_EXECUTABLE ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const protectionBypass = process.env.VERCEL_PROTECTION_BYPASS?.trim();
await mkdir(outputDirectory, { recursive: true });

const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
const viewports = [
  { name: 'narrow-320', width: 320, height: 700 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 1000 }
];
const evidence = [];

try {
  for (const viewport of viewports) {
    const page = await browser.newPage();
    await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    if (protectionBypass) await page.setExtraHTTPHeaders({ 'x-vercel-protection-bypass': protectionBypass });
    await page.goto(`${baseUrl}/fraud-readiness-score#start-score`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('[data-native-assessment-start="true"] form');
    const measurement = await page.evaluate(() => {
      const root = document.documentElement;
      const form = document.querySelector('[data-native-assessment-start="true"] form');
      const controls = [...document.querySelectorAll('[data-native-assessment-start="true"] input, [data-native-assessment-start="true"] select, [data-native-assessment-start="true"] button, [data-native-assessment-start="true"] a')];
      return {
        iframeCount: document.querySelectorAll('iframe').length,
        horizontalOverflowPx: Math.max(0, root.scrollWidth - window.innerWidth),
        documentScrollable: root.scrollHeight > window.innerHeight,
        nestedScrollableCount: [...document.querySelectorAll('[data-native-assessment-start="true"] *')].filter((element) => {
          const style = getComputedStyle(element); return /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight + 1;
        }).length,
        formVisible: Boolean(form && form.getBoundingClientRect().width > 0),
        minimumControlHeight: controls.length ? Math.min(...controls.map((element) => Math.round(element.getBoundingClientRect().height))) : 0,
        reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches
      };
    });
    assert.equal(measurement.iframeCount, 0, `${viewport.name}: iframe found`);
    assert.equal(measurement.horizontalOverflowPx, 0, `${viewport.name}: horizontal overflow`);
    assert.equal(measurement.nestedScrollableCount, 0, `${viewport.name}: nested scroll container`);
    assert.equal(measurement.formVisible, true, `${viewport.name}: form hidden`);
    assert.equal(measurement.reducedMotion, true, `${viewport.name}: reduced-motion preference unavailable`);
    evidence.push({ viewport, route: '/fraud-readiness-score#start-score', ...measurement });
    await page.screenshot({ path: join(outputDirectory, `${viewport.name}.png`), fullPage: true });
    await page.close();
  }

  const journey = await browser.newPage();
  await journey.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await journey.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await journey.goto(`${baseUrl}/score/start`, { waitUntil: 'networkidle0' });
  const nonce = Date.now();
  await journey.type('input[name="fullName"]', 'Phase 23 Browser Test');
  await journey.type('input[name="email"]', `phase23-browser-${nonce}@example.test`);
  await journey.type('input[name="organisationName"]', `Phase 23 Browser ${nonce}`);
  await journey.click('input[name="consentPrivacy"]');
  await journey.click('button[type="submit"]');
  await journey.waitForSelector('a[href*="/score/assessment/"]');
  const resumeHref = await journey.$eval('a[href*="/score/assessment/"]', (element) => element.getAttribute('href'));
  assert.ok(resumeHref);
  await journey.goto(new URL(resumeHref, baseUrl).toString(), { waitUntil: 'networkidle0' });
  await journey.waitForSelector('[data-assessment-native="true"]');
  assert.equal(await journey.$$('footer').then((items) => items.length), 0, 'active assessment must hide the marketing footer');

  await journey.setRequestInterception(true);
  let failNextSave = true;
  let answerSaveRequests = 0;
  journey.on('request', async (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/answers')) {
      answerSaveRequests += 1;
      if (failNextSave) {
        failNextSave = false;
        await request.respond({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, errors: ['Controlled offline fixture.'] }) });
        return;
      }
    }
    await request.continue();
  });

  const firstExposure = await journey.$eval('fieldset[id^="exposure-"]', (element) => element.id);
  await journey.click(`#${firstExposure} input[type="radio"]`);
  await journey.waitForSelector('[role="alert"]');
  assert.equal(await journey.$eval(`#${firstExposure} input[type="radio"]`, (input) => input.checked), true, 'failed save must retain the selected value');
  assert.match(await journey.$eval('[role="alert"]', (element) => element.textContent ?? ''), /Controlled offline fixture/);
  await journey.click('[role="alert"] button');
  await journey.waitForFunction(() => !document.querySelector('[role="alert"]') && document.body.textContent?.includes('Saved'));

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const nextExposureId = await journey.$$eval('fieldset[id^="exposure-"]', (items) =>
      items.find((item) => !item.querySelector('input[type="radio"]:checked'))?.id ?? null
    );
    if (!nextExposureId) break;
    await journey.click(`#${nextExposureId} input[type="radio"]`);
    await delay(450);
  }
  await journey.waitForFunction(() => document.body.textContent?.includes('Domain 1 of 10'));

  const domainOneQuestions = await journey.$$eval('fieldset[id^="question-"]', (items) => items.map((item) => item.id));
  assert.ok(domainOneQuestions.length > 1, 'first domain questions did not render');
  for (const id of domainOneQuestions) {
    await journey.click(`#${id} input[type="radio"][value="4"]`);
    await delay(450);
  }
  await journey.waitForFunction(() => document.body.textContent?.includes('Domain 2 of 10'));

  const requestCountBeforeRapidTap = answerSaveRequests;
  const currentQuestion = await journey.$eval('fieldset[id^="question-"]', (element) => element.id);
  await journey.evaluate((id) => {
    const inputs = [...document.querySelectorAll(`#${id} input[type="radio"]`)];
    inputs[0]?.click(); inputs[1]?.click();
  }, currentQuestion);
  await delay(500);
  assert.equal(answerSaveRequests - requestCountBeforeRapidTap, 1, 'rapid taps must produce one save request');

  await journey.select('label.sm\\:hidden select', await journey.$eval('label.sm\\:hidden select option:nth-child(2)', (option) => option.value));
  await journey.waitForSelector('fieldset[id^="question-"] input[type="radio"]:checked');
  const completedQuestion = await journey.$eval('fieldset[id^="question-"]', (element) => element.id);
  await journey.click(`#${completedQuestion} input[type="radio"][value="3"]`);
  await delay(500);
  await journey.reload({ waitUntil: 'networkidle0' });
  await journey.waitForSelector('[data-assessment-native="true"]');
  assert.match(await journey.$eval('[role="progressbar"]', (element) => element.getAttribute('aria-valuenow') ?? ''), /^[1-9]\d*$/);
  assert.equal(await journey.$$('iframe').then((items) => items.length), 0);
  await journey.screenshot({ path: join(outputDirectory, 'mobile-active-resume.png'), fullPage: true });
  evidence.push({ route: new URL(resumeHref, baseUrl).pathname, saveFailurePreventedAdvance: true, retrySucceeded: true, firstDomainAdvanced: true, rapidTapSaveRequests: 1, completedDomainReopened: true, refreshResumed: true });
  await journey.close();

  const compatibility = await browser.newPage();
  const response = await compatibility.goto(`${baseUrl}/score/start?embed=1`, { waitUntil: 'networkidle0' });
  assert.equal(new URL(compatibility.url()).pathname, '/score/start');
  assert.equal(await compatibility.$$('iframe').then((items) => items.length), 0);
  evidence.push({ route: '/score/start?embed=1', finalPath: new URL(compatibility.url()).pathname, status: response?.status() ?? null, iframeCount: 0 });
  await compatibility.close();
} finally {
  await browser.close();
}

await writeFile(join(outputDirectory, 'measurements.json'), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
