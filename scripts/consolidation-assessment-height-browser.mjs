import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const baseUrl = (process.env.CONSOLIDATION_BASE_URL ?? 'http://127.0.0.1:3100').replace(/\/$/, '');
const outputDirectory = process.env.HEIGHT_EVIDENCE_DIR ?? 'tmp/assessment-height-evidence';
const executablePath = process.env.CHROME_EXECUTABLE ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

await mkdir(outputDirectory, { recursive: true });

const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox']
});

const viewports = [
  { name: 'desktop', width: 1440, height: 1000 },
  { name: 'mobile', width: 390, height: 844 }
];

const results = [];

try {
  for (const viewport of viewports) {
    const page = await browser.newPage();
    await page.setViewport({ width: viewport.width, height: viewport.height, deviceScaleFactor: 1 });
    await page.setRequestInterception(true);

    page.on('request', async (request) => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/score/api/assessments/start') {
        await request.respond({
          status: 422,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: false,
            errors: ['Browser evidence fixture: validation stopped before record creation.']
          })
        });
        return;
      }

      await request.continue();
    });

    await page.goto(`${baseUrl}/fraud-readiness-score#start-score`, { waitUntil: 'networkidle0' });
    const iframeHandle = await page.waitForSelector('iframe[title="MK Fraud Readiness Score"]');
    assert(iframeHandle, 'Assessment iframe did not render.');
    const frame = await iframeHandle.contentFrame();
    assert(frame, 'Assessment iframe content was not available.');
    await frame.waitForSelector('form');
    await waitForHeightParity(page);

    results.push(await measure(page, viewport, 'initial-form'));

    await frame.evaluate(() => {
      const form = document.querySelector('form');
      if (!form) throw new Error('Assessment form unavailable for validation fixture.');
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await frame.waitForFunction(() => document.body.textContent?.includes('Browser evidence fixture'), { timeout: 10_000 });
    await waitForHeightParity(page);

    results.push(await measure(page, viewport, 'validation-error'));

    await frame.evaluate(() => {
      const form = document.querySelector('form');
      if (!form) throw new Error('Assessment form unavailable for taller-state fixture.');
      const tallerState = document.createElement('div');
      tallerState.dataset.heightEvidenceFixture = 'taller-state';
      tallerState.style.height = '720px';
      tallerState.style.display = 'grid';
      tallerState.style.placeItems = 'center';
      tallerState.style.border = '1px dashed #64748b';
      tallerState.style.borderRadius = '12px';
      tallerState.textContent = 'Local-only taller assessment-state fixture';
      form.append(tallerState);
    });
    await waitForHeightParity(page);

    const tallerResult = await measure(page, viewport, 'taller-state');
    results.push(tallerResult);
    await page.screenshot({
      path: join(outputDirectory, `${viewport.name}-taller-state.png`),
      fullPage: true
    });

    await page.close();
  }
} finally {
  await browser.close();
}

for (const result of results) {
  assert.equal(result.internalVerticalScrollbar, false, `${result.viewport}/${result.state} has an internal scrollbar.`);
  assert.equal(result.clipped, false, `${result.viewport}/${result.state} is clipped.`);
  assert(Math.abs(result.heightDifferencePx) <= 2, `${result.viewport}/${result.state} height differs by more than 2px.`);
}

await writeFile(join(outputDirectory, 'measurements.json'), `${JSON.stringify(results, null, 2)}\n`);
console.log(JSON.stringify(results, null, 2));

async function waitForHeightParity(page) {
  await page.waitForFunction(() => {
    const iframe = document.querySelector('iframe[title="MK Fraud Readiness Score"]');
    if (!(iframe instanceof HTMLIFrameElement) || !iframe.contentDocument) return false;
    const documentElement = iframe.contentDocument.documentElement;
    const body = iframe.contentDocument.body;
    const contentHeight = Math.max(
      documentElement.scrollHeight,
      body.scrollHeight,
      documentElement.offsetHeight,
      body.offsetHeight
    );
    return Math.abs(iframe.getBoundingClientRect().height - contentHeight) <= 2;
  }, { timeout: 10_000, polling: 100 });
}

async function measure(page, viewport, state) {
  return page.evaluate(({ viewport, state }) => {
    const iframe = document.querySelector('iframe[title="MK Fraud Readiness Score"]');
    const footer = document.querySelector('footer');
    if (!(iframe instanceof HTMLIFrameElement) || !iframe.contentDocument || !footer) {
      throw new Error('Assessment frame or footer unavailable during measurement.');
    }

    const iframeRect = iframe.getBoundingClientRect();
    const documentElement = iframe.contentDocument.documentElement;
    const body = iframe.contentDocument.body;
    const card = iframe.contentDocument.querySelector('form')?.closest('section') ?? body;
    const cardRect = card.getBoundingClientRect();
    const contentScrollHeight = Math.max(
      documentElement.scrollHeight,
      body.scrollHeight,
      documentElement.offsetHeight,
      body.offsetHeight
    );
    const iframeRenderedHeight = iframeRect.height;
    const iframeViewportHeight = iframe.contentWindow?.innerHeight ?? iframe.clientHeight;

    return {
      viewport: viewport.name,
      viewportWidthPx: viewport.width,
      viewportHeightPx: viewport.height,
      state,
      iframeRenderedHeightPx: Math.round(iframeRenderedHeight),
      embeddedContentScrollHeightPx: contentScrollHeight,
      heightDifferencePx: Math.round((iframeRenderedHeight - contentScrollHeight) * 100) / 100,
      cardBottomToFooterStartPx: Math.round((footer.getBoundingClientRect().top - (iframeRect.top + cardRect.bottom)) * 100) / 100,
      internalVerticalScrollbar: contentScrollHeight > iframeViewportHeight + 2,
      clipped: cardRect.bottom > iframeRenderedHeight + 2,
      outerPageScrollable: document.documentElement.scrollHeight > window.innerHeight
    };
  }, { viewport, state });
}
