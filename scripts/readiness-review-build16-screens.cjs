// Stage-progress screenshots of build 1.6 sessions seeded by scripts/readiness-review-build16-seed.mjs.
// node scripts/readiness-review-build16-screens.cjs <baseUrl> <seed.json> <outDir>
// Fictional organisations only. Checks each page for the stage measures and the absence of the 95-screen measure.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const [BASE = 'http://localhost:3216', SEED = 'seed16.json', OUT = 'screens16'] = process.argv.slice(2);
const seed = JSON.parse(fs.readFileSync(SEED, 'utf8'));
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const checks = [];
  const shot = async (name, url, { width = 1440, height = 1000, prepare = null, full = false, element = null, expect = [], refuse = [] } = {}) => {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(BASE + url, { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    if (prepare) await prepare(page);
    await page.waitForTimeout(300);
    if (element) await page.locator(element).first().screenshot({ path: path.join(OUT, `${name}.png`) });
    else await page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full });
    const text = await page.evaluate(() => document.body.innerText);
    const missing = expect.filter((t) => !(t instanceof RegExp ? t.test(text) : text.includes(t)));
    const present = refuse.filter((t) => (t instanceof RegExp ? t.test(text) : text.includes(t)));
    checks.push({ name, url: url.replace(/[A-Za-z0-9_-]{20,}/g, '<token>'), width, ok: !missing.length && !present.length && !errors.length, missing: missing.map(String), present: present.map(String), errors });
    await page.close();
  };
  const r = (t) => `/review/s/${t}`;
  await shot('01-core-stage-desktop', r(seed.core.respondent), { expect: [/Core stage: \d+ of \d+ confirmations so far/, 'All confirmations', 'Nothing is scored'], refuse: [/of 95/, /95-screen/] });
  await shot('02-core-stage-phone', r(seed.core.respondent), { width: 390, height: 844, expect: [/Core stage: \d+ of \d+ confirmations so far/], refuse: [/of 95/] });
  await shot('03-breadth-stage-desktop', r(seed.breadth.respondent), { expect: [/Breadth stage: \d+ of \d+ confirmations so far/, 'Core confirmations', 'Complete'], refuse: [/of 95/] });
  await shot('04-snapshot-status', `${r(seed.packages.respondent)}/snapshot`, { element: '[data-review-status]', expect: ['Outstanding information and function progress', /was declined by Procurement\. Reason: Fictional/, 'Areas delegated'], refuse: [/\b\d{1,3}(\.\d)?\s*(\/\s*100|%)\s*(readiness|score)/i, /readiness score of/i] });
  await shot('05-snapshot-choose-questions', `${r(seed.ready.respondent)}/snapshot`, {
    element: '[data-review-staged-send]',
    prepare: async (page) => { const s = page.locator('[data-review-staged-send] summary'); await s.scrollIntoViewIfNeeded(); await s.click(); },
    expect: ['The core stage is complete', /Send \d+ questions to accountable functions/, 'Choose the questions', 'Recommended questions are selected because their answers would add most'],
    refuse: [/\b\d{1,3}(\.\d)?\s*(\/\s*100|%)\s*(readiness|score)/i, /readiness score of/i]
  });
  await shot('06-owner-package-procurement', r(seed.packages.procurement), { expect: [/questions? (is|are) open for this function/, 'declined', 'This question is not for Procurement', 'Reason: Fictional'], refuse: [/95 interview screens/] });
  await shot('07-owner-decline-form', r(seed.packages.procurement), {
    prepare: async (page) => { await page.getByRole('button', { name: 'This question is not for Procurement' }).click(); await page.locator('#decline-reason').fill('Fictional: stock counts are run by the stores team'); await page.locator('[data-review-decline]').scrollIntoViewIfNeeded(); },
    expect: ['Why does this question not belong to Procurement?', 'Decline this question']
  });
  await shot('08-owner-package-phone', r(seed.packages.finance), { width: 390, height: 844, expect: [/open for this function/] });
  await shot('09-management-outstanding', r(seed.packages.management), { element: '[data-review-status]', expect: ['Outstanding information and function progress', /was declined by Procurement\. Reason: Fictional/, /Areas delegated/] });
  await shot('10-snapshot-waiting-declined', `${r(seed.packages.respondent)}/snapshot`, { expect: [/Declined by Procurement: Fictional/] , prepare: async (page) => { const t = page.getByText(/Declined by Procurement: Fictional/).first(); await t.scrollIntoViewIfNeeded(); } });
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'checks.json'), JSON.stringify(checks, null, 2) + '\n');
  for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'} ${c.name} ${c.width}px${c.ok ? '' : ` missing ${JSON.stringify(c.missing)} present ${JSON.stringify(c.present)} errors ${c.errors.length}`}`);
  if (checks.some((c) => !c.ok)) process.exitCode = 1;
})();
