#!/usr/bin/env node
/**
 * Owner-review screenshots for the Fraud Readiness commercial experience.
 *
 * Captures the homepage, the storefront, the assessment terms document, /score/start before
 * acceptance (the Fraud Readiness Terms gate) and /score/start after acceptance, at a desktop and
 * a mobile width, and fails if any page scrolls horizontally at either width.
 *
 * Run against a built server so the captures show what a customer would actually receive:
 *   npm run build && npm run start -- --port 3210
 *   node scripts/cx-fraud-readiness-screenshots.mjs
 *
 * BASE_URL overrides the target. The analytics-consent choice is recorded as "declined" before
 * capture so the consent banner does not obscure the page under review.
 */
import fs from 'node:fs';
import puppeteer from 'puppeteer-core';

const OUT = process.env.SHOT_DIR ?? 'outputs/cx-fraud-readiness-experience/screenshots';
const BASE = process.env.BASE_URL ?? 'http://localhost:3210';
const CHROME = process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, deviceScaleFactor: 1 },
  { name: 'mobile', width: 390, height: 844, deviceScaleFactor: 1, isMobile: true, hasTouch: true }
];

const SHOTS = [
  // Viewport, not full page: the homepage document is ~17,600px tall, and above roughly 16k
  // pixels Chrome tiles the capture and repaints the fixed navbar into every tile. The change
  // under review here is the hero CTA pair, which is above the fold in any case.
  { slug: 'home', path: '/', fullPage: false },
  { slug: 'fraud-readiness', path: '/fraud-readiness', fullPage: true },
  { slug: 'fraud-readiness-assessment-terms', path: '/fraud-readiness-assessment-terms', fullPage: false },
  { slug: 'fraud-readiness-advisory', path: '/fraud-readiness/advisory', fullPage: true },
  { slug: 'contact', path: '/contact', fullPage: false },
  { slug: 'score-start-terms-modal', path: '/score/start', fullPage: false },
  { slug: 'score-start-terms-modal-essential', path: '/score/start?product=essential', fullPage: false },
  { slug: 'score-start-accepted', path: '/score/start', fullPage: true, accept: true },
  { slug: 'score-start-accepted-essential', path: '/score/start?product=essential', fullPage: true, accept: true }
];

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--hide-scrollbars'] });
fs.mkdirSync(OUT, { recursive: true });

const overflows = [];

for (const viewport of VIEWPORTS) {
  const page = await browser.newPage();
  page.on('pageerror', (error) => console.error('  page error:', error.message));
  await page.setCacheEnabled(false);
  await page.setViewport(viewport);
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.evaluate(() => window.localStorage.setItem('mk_fraud_cookie_consent', 'declined'));

  for (const shot of SHOTS) {
    await page.goto(`${BASE}${shot.path}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await new Promise((resolve) => setTimeout(resolve, 2500));

    if (shot.accept) {
      await page.waitForSelector('dialog[data-fraud-readiness-terms-gate][open]', { timeout: 20000 });
      await page.evaluate(() => {
        const dialog = document.querySelector('dialog[data-fraud-readiness-terms-gate]');
        for (const box of dialog.querySelectorAll('input[type="checkbox"]')) box.click();
        const accept = [...dialog.querySelectorAll('button')].find(
          (button) => button.textContent.trim() === 'Accept and continue'
        );
        if (!accept) throw new Error('accept button not found');
        accept.click();
      });
      await new Promise((resolve) => setTimeout(resolve, 600));
    }

    // Chrome's own full-page capture stitches viewport-sized tiles, so a `position: fixed` navbar
    // is painted once per tile and the finished image shows the header repeating down the page.
    // Growing the viewport to the document height and taking an ordinary screenshot avoids the
    // stitching altogether, which is why fullPage is never passed to page.screenshot here.
    if (shot.fullPage) {
      // Above roughly 16k pixels Chrome still tiles even a grown viewport, so a `position: fixed`
      // navbar is painted once per tile. Pinning it for the capture is what actually stops the
      // header repeating down the long pages.
      await page.addStyleTag({ content: '.fixed { position: absolute !important; }' });
      const documentHeight = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.setViewport({ ...viewport, height: Math.min(documentHeight, 30000) });
      await new Promise((resolve) => setTimeout(resolve, 800));
    }

    const file = `${OUT}/${shot.slug}--${viewport.name}.png`;
    await page.screenshot({ path: file });
    if (shot.fullPage) await page.setViewport(viewport);

    const size = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth
    }));
    const overflowing = size.scrollWidth > size.clientWidth + 1;
    if (overflowing) overflows.push(`${shot.slug} @ ${viewport.name} (${size.scrollWidth} > ${size.clientWidth})`);
    console.log(`${file}  ${size.scrollWidth}/${size.clientWidth}${overflowing ? '  ** HORIZONTAL OVERFLOW **' : ''}`);
  }

  await page.close();
}

await browser.close();

if (overflows.length) {
  console.error(`\nFAIL: ${overflows.length} page(s) scroll horizontally:`);
  for (const entry of overflows) console.error(`  ${entry}`);
  process.exit(1);
}
console.log('\nPASS: no page scrolls horizontally at 1440px or 390px.');
