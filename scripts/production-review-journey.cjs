// Live check of the one-person review (owner direction, 15 November 2026): an MK-internal respondent starts with their
// contact details, answers every question by choosing (no save button), changes one answer, and opens the customer
// Snapshot, whose report order form must be pre-filled. No order is placed. Every step goes through page controls.
//
//   node scripts/production-review-journey.cjs <baseUrl> <outDir>
//
// The respondent's private link is written only to <outDir>/.secrets/, which git excludes; it is never printed.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = (process.argv[2] || 'http://localhost:3124').replace(/\/$/, '');
const OUT = process.argv[3] || 'qa-output/production-review';
fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });
fs.mkdirSync(path.join(OUT, '.secrets'), { recursive: true });

const ORG = 'MK Fraud Insights (internal review check)';
const CONTACT = { fullName: 'MK internal review check', email: 'live-check@mkfraud.co.za', roleTitle: 'Internal release check' };
const log = [];
const note = (step, ok, detail) => {
  log.push({ step, ok, detail });
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${step}${detail !== undefined ? ` | ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
};
// Mostly weak answers, with some "I don't know", so the Snapshot has gaps, open questions and a score.
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 1000003, 7);

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));
  const shot = (name) => page.screenshot({ path: path.join(OUT, 'shots', `${name}.png`), fullPage: false }).catch(() => {});
  try {
    await page.goto(`${BASE}/review`, { waitUntil: 'networkidle' });
    await shot('01-start');
    await page.fill('input[name=fullName]', CONTACT.fullName);
    await page.fill('input[name=email]', CONTACT.email);
    await page.fill('#review-org', ORG);
    await page.fill('input[name=roleTitle]', CONTACT.roleTitle);
    await page.check('[data-review-start-form] input[type=checkbox]');
    await Promise.all([page.waitForURL(/\/review\/s\/[A-Za-z0-9_-]+$/, { timeout: 60000 }), page.click('[data-review-start-form] button[type=submit]')]);
    const token = page.url().split('/').pop();
    fs.writeFileSync(path.join(OUT, '.secrets', 'respondent.json'), JSON.stringify({ respondent: token }, null, 1));
    await page.waitForSelector('[data-question-stage]', { timeout: 30000 });
    note('started with contact details and went straight to the first question', true, await page.getAttribute('[data-question-stage]', 'data-question-id'));
    await shot('02-first-question');

    const times = [];
    let answers = 0, unknowns = 0;
    for (let i = 0; i < 400; i++) {
      if (await page.$('[data-review-complete]')) break;
      const stage = await page.waitForSelector('[data-question-stage]', { timeout: 30000 });
      const q = await stage.getAttribute('data-question-id');
      const multi = await page.$('[data-review-multi]');
      const t0 = Date.now();
      if (multi) {
        await page.locator('[data-review-multi] input[type=checkbox]').first().check();
        await page.click('[data-review-multi] button:has-text("Continue")');
      } else {
        const labels = page.locator('[data-question-stage] label:has(input[type=radio])');
        const n = await labels.count();
        const texts = await labels.allTextContents();
        const k = hash(q) % 10;
        let pick = k === 7 ? texts.findIndex((t) => /know/i.test(t)) : -1;
        if (pick < 0) { const known = texts.map((t, j) => [t, j]).filter(([t]) => !/know/i.test(t)); pick = known[Math.min(known.length - 1, k < 6 ? 0 : 1)][1]; }
        if (/know/i.test(texts[pick])) unknowns += 1;
        await labels.nth(Math.min(pick, n - 1)).click();
      }
      await page.waitForFunction((prev) => document.querySelector('[data-review-complete]') || document.querySelector('[data-review-message]') || (document.querySelector('[data-question-stage]')?.getAttribute('data-question-id') !== prev), q, { timeout: 30000 });
      times.push(Date.now() - t0);
      answers += 1;
      const alert = await page.$('[data-review-message]');
      if (alert) { note(`page message at ${q}`, false, (await alert.textContent()).trim().slice(0, 200)); break; }
      if (answers === 10) await shot('03-tenth-question');
    }
    times.sort((a, b) => a - b);
    const median = times[Math.floor(times.length / 2)], p90 = times[Math.floor(times.length * 0.9)], max = times[times.length - 1];
    const done = Boolean(await page.$('[data-review-complete]'));
    note('interview answered by choosing only, one person, start to finish', done, `${answers} answers (${unknowns} "I don't know"); next question after median ${median} ms, 90th ${p90} ms, max ${max} ms`);
    await shot('04-complete');

    // Change one answer through "Change an answer".
    await page.click('[data-review-answers] summary');
    const first = await page.getAttribute('[data-review-change]', 'data-review-change');
    await page.click(`[data-review-change="${first}"]`);
    await page.waitForSelector(`[data-question-stage][data-question-id="${first}"]`, { timeout: 30000 });
    const labels = page.locator('[data-question-stage] label:has(input[type=radio])');
    const checked = await page.locator('[data-question-stage] input[type=radio]:checked').getAttribute('value').catch(() => null);
    const values = await page.locator('[data-question-stage] input[type=radio]').evaluateAll((els) => els.map((e) => e.value));
    const other = values.findIndex((v) => v !== checked && v !== 'unknown');
    await labels.nth(other).click();
    await page.waitForFunction(() => document.querySelector('[data-review-complete]') || document.querySelector('[data-question-stage]'), null, { timeout: 30000 });
    // A change can bring a question into scope; answer anything that follows.
    for (let i = 0; i < 40 && !(await page.$('[data-review-complete]')); i++) {
      const q = await page.getAttribute('[data-question-stage]', 'data-question-id');
      const l = page.locator('[data-question-stage] label:has(input[type=radio])');
      if (await l.count()) await l.first().click(); else { await page.locator('[data-review-multi] input[type=checkbox]').first().check(); await page.click('[data-review-multi] button:has-text("Continue")'); }
      await page.waitForFunction((prev) => document.querySelector('[data-review-complete]') || document.querySelector('[data-question-stage]')?.getAttribute('data-question-id') !== prev, q, { timeout: 30000 });
    }
    note('an earlier answer changed through "Change an answer"', Boolean(await page.$('[data-review-complete]')), first);

    // The customer Snapshot and the pre-filled order form. No order is placed.
    await page.click('a:has-text("View your Snapshot")');
    await page.waitForSelector('[data-review-snapshot]', { timeout: 60000 });
    await shot('05-snapshot');
    const layout = await page.getAttribute('[data-review-snapshot]', 'data-snapshot-layout');
    const text = (await page.textContent('[data-review-snapshot]')).replace(/\s+/g, ' ');
    const handoffWords = ['accountable function', 'Waiting for an owner', 'package', 'management view', 'RESTRICTED TEST', 'fictional'].filter((w) => text.toLowerCase().includes(w.toLowerCase()));
    note('customer Snapshot with no hand-off or test wording', layout === 'live' && handoffWords.length === 0, { layout, found: handoffWords, score: (text.match(/\b\d{1,3}%/) || [null])[0] });
    const prefill = await page.evaluate(() => Object.fromEntries(['contactName', 'contactEmail', 'contactRole', 'organisationLegalName'].map((n) => [n, document.querySelector(`[data-revised-paid-report] input[name=${n}]`)?.value ?? null])));
    note('report order form pre-filled from the start form', prefill.contactName === 'MK internal review check' && prefill.contactEmail === 'live-check@mkfraud.co.za' && prefill.contactRole === 'Internal release check', prefill);
    await page.locator('[data-revised-paid-report]').scrollIntoViewIfNeeded().catch(() => {});
    await shot('06-order-form');
    note('no page errors', errors.length === 0, errors.slice(0, 3));
  } catch (error) {
    note('journey aborted', false, String(error).slice(0, 400));
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, 'journey.json'), JSON.stringify({ at: new Date().toISOString(), log }, null, 1));
  const failed = log.filter((l) => !l.ok);
  console.log(`\n${log.length - failed.length} ok, ${failed.length} failed`);
  process.exit(failed.length ? 1 : 0);
})();
