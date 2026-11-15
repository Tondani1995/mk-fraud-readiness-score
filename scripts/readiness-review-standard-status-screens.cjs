// Screens of the corrected standard assessment (MK direction, 11 November 18:33), from sessions seeded by
// scripts/readiness-review-standard-status-seed.mjs, at 1440 and 390px. Each check refuses reviewer-based completion
// wording and requires the four separate status statements where they apply. Fictional organisations only.
// node scripts/readiness-review-standard-status-screens.cjs <baseUrl> <seed.json> <outDir>
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const [BASE = 'http://localhost:3217', SEED = 'seed17.json', OUT = 'screens17'] = process.argv.slice(2);
const seed = JSON.parse(fs.readFileSync(SEED, 'utf8'));
fs.mkdirSync(OUT, { recursive: true });
const REVIEWER_COMPLETION = [/Is the review complete/, /authorised (MK )?reviewer/i, /until an MK reviewer/i, /Evidence still to review/, /What a completed review would need/];
// Facet labels are styled in capitals, which innerText reports, so they are matched without regard to case.
const FOUR = [/Interview/i, /Function packages/i, /Information/i, /Report eligibility/i, 'Not determined by this assessment'];

(async () => {
  const browser = await chromium.launch();
  const checks = [];
  const shot = async (name, url, { width = 1440, height = 1000, element = null, prepare = null, expect = [], refuse = REVIEWER_COMPLETION } = {}) => {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(BASE + url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    if (prepare) await prepare(page);
    await page.waitForTimeout(300);
    let elementWider = false;
    if (element) {
      const el = page.locator(element).first();
      await el.scrollIntoViewIfNeeded();
      // A panel wider than the viewport is clipped by its container even when the page itself does not scroll sideways.
      const box = await el.boundingBox();
      elementWider = !!box && box.x + box.width > width + 1;
      await el.screenshot({ path: path.join(OUT, `${name}.png`) });
    } else await page.screenshot({ path: path.join(OUT, `${name}.png`) });
    const text = await page.evaluate(() => document.body.innerText);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    const missing = expect.filter((t) => !(t instanceof RegExp ? t.test(text) : text.includes(t)));
    const present = refuse.filter((t) => (t instanceof RegExp ? t.test(text) : text.includes(t)));
    checks.push({ name, url: url.replace(/[A-Za-z0-9_-]{20,}/g, '<token>'), width, ok: !missing.length && !present.length && !errors.length && !overflow && !elementWider, missing: missing.map(String), present: present.map(String), errors, horizontalOverflow: overflow, elementWiderThanViewport: elementWider });
    await page.close();
  };
  const r = (t) => `/review/s/${t}`;
  await shot('01-snapshot-status-complete', `${r(seed.complete.respondent)}/snapshot`, { element: '[data-review-status]', expect: [...FOUR, 'Completed', 'Returned', 'Nothing outstanding'] });
  await shot('02-snapshot-status-outstanding', `${r(seed.outstanding.respondent)}/snapshot`, { element: '[data-review-status]', expect: [...FOUR, /\d+ outstanding/, /declined by a function/, /stay outstanding until someone answers/] });
  await shot('03-snapshot-status-phone', `${r(seed.outstanding.respondent)}/snapshot`, { width: 390, height: 844, element: '[data-review-assessment-status]', expect: FOUR });
  await shot('04-management-status', r(seed.outstanding.management), { element: '[data-review-status]', expect: [...FOUR, /outstanding/] });
  await shot('05-management-advisory-separate', r(seed.advisory.management), { element: '[data-m="advisory"]', expect: ['Advisory evidence review (separate service)', 'not part of completing the standard assessment'] });
  await shot('06-management-phone', r(seed.advisory.management), { width: 390, height: 844, element: '[data-review-assessment-status]', expect: FOUR });
  await shot('07-interview-area-handover', r(seed.entry.respondent), { element: '[data-review-area-delegate]', expect: [/Third parties and supply chain is usually answered by Procurement/, /Hand Third parties and supply chain to Procurement/, 'stay outstanding until they answer'] });
  await shot('08-interview-area-handover-phone', r(seed.entry.respondent), { width: 390, height: 844, element: '[data-review-area-delegate]', expect: [/Hand Third parties and supply chain to Procurement/] });
  await shot('09-review-landing', '/review', { expect: ['The assessment is complete when the interview is completed and its outstanding information is answered', 'Evidence review is not part of the assessment'] });
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'checks.json'), JSON.stringify(checks, null, 2) + '\n');
  for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'} ${c.name} ${c.width}px${c.ok ? '' : ` missing ${JSON.stringify(c.missing)} present ${JSON.stringify(c.present)} errors ${c.errors.length} overflow ${c.horizontalOverflow} element wider ${c.elementWiderThanViewport}`}`);
  if (checks.some((c) => !c.ok)) process.exitCode = 1;
})();
