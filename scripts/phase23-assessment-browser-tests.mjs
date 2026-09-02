import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import puppeteer from 'puppeteer-core';

const configuredBaseUrl = process.env.PHASE23_BASE_URL?.trim();
const localPort = Number(process.env.PHASE23_PORT ?? 3100);
const accessUrl = process.env.PHASE23_VERCEL_ACCESS_URL?.trim();
const outputDirectory = process.env.PHASE23_BROWSER_EVIDENCE_DIR ?? 'tmp/phase23-browser-evidence';
const syntheticMarker = process.env.PHASE23_SYNTHETIC_MARKER ?? '';
const executablePath = process.env.CHROME_EXECUTABLE
  ?? (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/google-chrome');
const protectionBypass = process.env.VERCEL_PROTECTION_BYPASS?.trim();
await mkdir(outputDirectory, { recursive: true });

let localServer = null;
const startupLog = [];
const localBaseUrl = `http://127.0.0.1:${localPort}`;

async function startLocalServer() {
  const npmCommand = process.env.npm_execpath ? process.execPath : 'npm';
  const npmArgs = process.env.npm_execpath
    ? [process.env.npm_execpath, 'run', 'dev', '--', '--hostname', '127.0.0.1', '--port', String(localPort)]
    : ['run', 'dev', '--', '--hostname', '127.0.0.1', '--port', String(localPort)];
  localServer = spawn(npmCommand, npmArgs, { cwd: process.cwd(), env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
  localServer.stdout.on('data', (chunk) => startupLog.push(String(chunk)));
  localServer.stderr.on('data', (chunk) => startupLog.push(String(chunk)));
  for (let attempt = 0; attempt < 60; attempt += 1) {
    if (localServer.exitCode !== null) break;
    try {
      const response = await fetch(`${localBaseUrl}/score/start`, { redirect: 'manual' });
      if (response.status >= 200 && response.status < 500) return;
    } catch {}
    await delay(1000);
  }
  throw new Error(`G29_ENVIRONMENT_FAILURE local server did not become ready on ${localBaseUrl}`);
}

if (!configuredBaseUrl) await startLocalServer();
const baseUrl = (configuredBaseUrl ?? localBaseUrl).replace(/\/$/, '');
const baseHostname = new URL(baseUrl).hostname;
const isLoopbackBase = ['127.0.0.1', 'localhost', '::1'].includes(baseHostname);

const browser = await puppeteer.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
const viewports = [
  { name: 'narrow-320', width: 320, height: 700 },
  { name: 'mobile-390', width: 390, height: 844 },
  { name: 'mobile-430', width: 430, height: 932 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 1000 }
];
const evidence = [];
const expectedPreviewHost = new URL(baseUrl).hostname;

const previewHeaders = () => ({
  ...(protectionBypass ? { 'x-vercel-protection-bypass': protectionBypass } : {}),
  'x-vercel-set-bypass-cookie': 'true'
});

async function configurePreviewPage(page) {
  await page.setExtraHTTPHeaders(previewHeaders());
  return page;
}

function redirectHost(host) {
  return host === 'vercel.com' || host.endsWith('.vercel.com');
}

function updateCookieJar(jar, response) {
  const setCookies = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie')].filter(Boolean);
  for (const setCookie of setCookies) {
    const pair = setCookie.split(';', 1)[0];
    const separator = pair.indexOf('=');
    if (separator > 0) jar.set(pair.slice(0, separator), pair.slice(separator + 1));
  }
}

function cookieHeader(jar) {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

async function previewPreflight() {
  const target = `${baseUrl}/score/start`;
  if (!configuredBaseUrl || isLoopbackBase) {
    return { ok: true, category: 'application_route_reached', targetPath: '/score/start', finalHost: expectedPreviewHost, status: null, local: true };
  }
  if (!protectionBypass) {
    return { ok: false, category: 'missing_secret', targetPath: '/score/start', expectedHost: expectedPreviewHost };
  }

  const chain = [];
  const cookies = new Map();
  let currentUrl = target;
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    const headers = previewHeaders();
    const cookie = cookieHeader(cookies);
    if (cookie) headers.cookie = cookie;
    const response = await fetch(currentUrl, { redirect: 'manual', headers, signal: AbortSignal.timeout(15000) });
    updateCookieJar(cookies, response);
    const host = new URL(currentUrl).hostname;
    chain.push({ host, status: response.status });
    if (response.status < 300 || response.status >= 400) {
      if (host === expectedPreviewHost && response.status >= 200 && response.status < 300) {
        return { ok: true, category: 'application_route_reached', targetPath: '/score/start', expectedHost: expectedPreviewHost, finalHost: host, status: response.status, chain };
      }
      if (redirectHost(host)) {
        return { ok: false, category: 'rejected_secret', targetPath: '/score/start', expectedHost: expectedPreviewHost, finalHost: host, status: response.status, chain };
      }
      if (host !== expectedPreviewHost) {
        return { ok: false, category: 'unexpected_redirect', targetPath: '/score/start', expectedHost: expectedPreviewHost, finalHost: host, status: response.status, chain };
      }
      return { ok: false, category: 'application_route_not_usable', targetPath: '/score/start', expectedHost: expectedPreviewHost, finalHost: host, status: response.status, chain };
    }
    const location = response.headers.get('location');
    if (!location) {
      return { ok: false, category: 'unexpected_redirect', targetPath: '/score/start', expectedHost: expectedPreviewHost, finalHost: host, status: response.status, chain };
    }
    const nextUrl = new URL(location, currentUrl);
    if (redirectHost(nextUrl.hostname)) {
      return { ok: false, category: 'rejected_secret', targetPath: '/score/start', expectedHost: expectedPreviewHost, finalHost: nextUrl.hostname, status: response.status, chain };
    }
    if (nextUrl.hostname !== expectedPreviewHost) {
      return { ok: false, category: 'unexpected_redirect', targetPath: '/score/start', expectedHost: expectedPreviewHost, finalHost: nextUrl.hostname, status: response.status, chain };
    }
    currentUrl = nextUrl.toString();
  }
  return { ok: false, category: 'unexpected_redirect', targetPath: '/score/start', expectedHost: expectedPreviewHost, chain };
}

async function selectRadio(page, selector, label) {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    await page.click(selector);
    try {
      await page.waitForFunction(
        (target) => Boolean(document.querySelector(target)?.checked),
        { timeout: 2000 },
        selector,
      );
      return;
    } catch {
      await delay(250);
    }
  }
  throw new Error(`${label}: radio did not remain selected after retries`);
}

function assertPreviewPageReached(page, response, route) {
  const finalUrl = page.url();
  const finalHost = new URL(finalUrl).hostname;
  if (finalHost !== expectedPreviewHost) {
    const category = redirectHost(finalHost) && protectionBypass
      ? 'header_not_propagated'
      : redirectHost(finalHost) ? 'rejected_secret' : 'unexpected_redirect';
    throw new Error(`G29_ENVIRONMENT_FAILURE_PREVIEW_${category.toUpperCase()} Preview route ${route} did not reach the application; final host=${finalHost} status=${response?.status() ?? 'unknown'}`);
  }
}

try {
  const preflight = await previewPreflight();
  await writeFile(join(outputDirectory, 'preview-preflight.json'), `${JSON.stringify(preflight, null, 2)}\n`);
  if (!preflight.ok) throw new Error(`G29_ENVIRONMENT_FAILURE_PREVIEW_${preflight.category.toUpperCase()} Preview preflight failed`);
  if (accessUrl) {
    const accessPage = await configurePreviewPage(await browser.newPage());
    const accessResponse = await accessPage.goto(accessUrl, { waitUntil: 'networkidle0' });
    assertPreviewPageReached(accessPage, accessResponse, 'PHASE23_VERCEL_ACCESS_URL');
    await accessPage.close();
  }
  for (const viewport of viewports) {
    const page = await configurePreviewPage(await browser.newPage());
    await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    const startResponse = await page.goto(`${baseUrl}/score/start`, { waitUntil: 'networkidle0' });
    assertPreviewPageReached(page, startResponse, '/score/start');
    await page.waitForSelector('[data-adaptive-assessment-start="true"]');
    const measurement = await page.evaluate(() => {
      const root = document.documentElement;
      const form = document.querySelector('[data-adaptive-assessment-start="true"]');
      const scope = form?.closest('form') ?? form;
      const controls = scope ? [...scope.querySelectorAll('input, select, button, a')] : [];
      return {
        iframeCount: document.querySelectorAll('iframe').length,
        horizontalOverflowPx: Math.max(0, root.scrollWidth - window.innerWidth),
        documentScrollable: root.scrollHeight > window.innerHeight,
        nestedScrollableCount: [...(scope?.querySelectorAll('*') ?? [])].filter((element) => {
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
    evidence.push({ viewport, route: '/score/start', ...measurement });
    await page.screenshot({ path: join(outputDirectory, `${viewport.name}.png`), fullPage: true });
    await page.close();
  }

  const journey = await configurePreviewPage(await browser.newPage());
  await journey.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
  await journey.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  const journeyStartResponse = await journey.goto(`${baseUrl}/score/start`, { waitUntil: 'networkidle0' });
  assertPreviewPageReached(journey, journeyStartResponse, '/score/start');
  const adaptiveStart = Boolean(await journey.$('[data-adaptive-assessment-start="true"]'));
  const termsGate = await journey.$('dialog[data-fraud-readiness-terms-gate="true"]');
  if (termsGate) {
    await journey.waitForSelector('dialog[open][data-fraud-readiness-terms-gate="true"]');
    await journey.click('dialog input[name="acceptTerms"]');
    await journey.click('dialog input[name="acceptPrivacy"]');
    await journey.click('dialog button');
    await journey.waitForFunction(() => document.querySelector('[data-terms-accepted="true"]')?.getAttribute('data-terms-accepted') === 'true');
  }
  const nonce = Date.now();
  const syntheticName = syntheticMarker ? `${syntheticMarker}${nonce}` : `Phase 23 Browser ${nonce}`;
  const syntheticEmail = syntheticMarker ? `${syntheticMarker.toLowerCase()}${nonce}@example.test` : `phase23-browser-${nonce}@example.test`;
  await journey.type('input[name="fullName"]', syntheticName);
  await journey.type('input[name="email"]', syntheticEmail);
  await journey.type('input[name="organisationName"]', syntheticName);
  if (adaptiveStart) {
    assert.equal(await journey.$eval('[data-adaptive-assessment-start="true"]', (form) => form instanceof HTMLFormElement), true);
    await journey.screenshot({ path: join(outputDirectory, 'adaptive-start.png'), fullPage: true });
    evidence.push({ route: '/score/start', syntheticMarker: syntheticMarker || null, adaptiveStart: true, mutation: 'not_started', reason: 'adaptive start contract smoke uses the retained G27/G38-G41 journey for live mutation evidence' });
    await journey.close();
  } else {
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
    await selectRadio(journey, `#${nextExposureId} input[type="radio"]`, nextExposureId);
  }
  await journey.waitForFunction(() => document.body.textContent?.includes('Domain 1 of 10'));

  const domainOneQuestions = await journey.$$eval('fieldset[id^="question-"]', (items) => items.map((item) => item.id));
  assert.ok(domainOneQuestions.length > 1, 'first domain questions did not render');
  for (const id of domainOneQuestions) {
    await selectRadio(journey, `#${id} input[type="radio"][value="4"]`, id);
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
  let completedQuestion = null;
  for (let attempt = 0; attempt < 8 && !completedQuestion; attempt += 1) {
    const candidate = await journey.$eval('fieldset[id^="question-"] input[type="radio"]:not(:checked)', (input) => ({
      fieldsetId: input.closest('fieldset')?.id,
      name: input.getAttribute('name'),
      value: input.getAttribute('value'),
    })).catch(() => null);
    if (!candidate?.fieldsetId || !candidate.name || !candidate.value) {
      await delay(250);
      continue;
    }
    const candidateSelector = `#${candidate.fieldsetId} input[name="${candidate.name}"][value="${candidate.value}"]`;
    try {
      await selectRadio(journey, candidateSelector, candidate.fieldsetId);
      completedQuestion = candidate;
    } catch (error) {
      if (!String(error?.message ?? error).includes('No element found')) throw error;
      await delay(250);
    }
  }
  assert.ok(completedQuestion, 'current question radio must be addressable');
  await journey.reload({ waitUntil: 'networkidle0' });
  await journey.waitForSelector('[data-assessment-native="true"]');
  assert.match(await journey.$eval('[role="progressbar"]', (element) => element.getAttribute('aria-valuenow') ?? ''), /^[1-9]\d*$/);
  assert.equal(await journey.$$('iframe').then((items) => items.length), 0);
  await journey.screenshot({ path: join(outputDirectory, 'mobile-active-resume.png'), fullPage: true });
  evidence.push({ route: new URL(resumeHref, baseUrl).pathname, syntheticMarker: syntheticMarker || null, syntheticName, saveFailurePreventedAdvance: true, retrySucceeded: true, firstDomainAdvanced: true, rapidTapSaveRequests: 1, completedDomainReopened: true, refreshResumed: true });
  await journey.close();
  }

  const compatibility = await configurePreviewPage(await browser.newPage());
  const response = await compatibility.goto(`${baseUrl}/score/start?embed=1`, { waitUntil: 'networkidle0' });
  assertPreviewPageReached(compatibility, response, '/score/start?embed=1');
  assert.equal(new URL(compatibility.url()).pathname, '/score/start');
  assert.equal(await compatibility.$$('iframe').then((items) => items.length), 0);
  evidence.push({ route: '/score/start?embed=1', finalPath: new URL(compatibility.url()).pathname, status: response?.status() ?? null, iframeCount: 0 });
  await compatibility.close();
} finally {
  await browser.close();
  if (localServer) {
    localServer.kill('SIGTERM');
    await writeFile(join(outputDirectory, 'startup.log'), startupLog.join(''));
  }
}

await writeFile(join(outputDirectory, 'measurements.json'), `${JSON.stringify(evidence, null, 2)}\n`);
console.log(JSON.stringify(evidence, null, 2));
