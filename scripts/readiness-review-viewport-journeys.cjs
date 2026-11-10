// Answers questions through the page at every brief viewport and checks the instrument after each transition.
// node scripts/readiness-review-viewport-journeys.cjs <baseUrl> <outDir>
// At each size: the instrument layout (rail, card, context), the next prompt in view below the sticky progress header
// and focused, no sideways scroll, Back to a saved answer, and the "I don't know" handoff offer. Fictional data only.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const [BASE, OUT] = process.argv.slice(2);
fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });
const SIZES = [[1100, 900], [1280, 900], [1440, 900], [1600, 900], [1920, 900], [1100, 768], [1440, 700], [1920, 700], [320, 568], [375, 812], [390, 844], [430, 932]];
const PROFILE = { 'PR-01': '50to250', 'PR-12': '50to250m', 'PR-02': 'private', 'PR-13': 'retail', 'PR-04': 'board', 'PR-03': 'no', 'PR-05': 'no', 'PR-06': 'no', 'PR-07': 'no', 'PR-08': 'yes', 'PR-09': 'no', 'PR-10': 'no', 'PR-11': 'yes' };

async function api(method, url, body) {
  const res = await fetch(BASE + url, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  return res.json();
}

async function state(page) {
  return page.evaluate(() => {
    const box = (sel) => {
      const e = document.querySelector(sel);
      if (!e) return null;
      const b = e.getBoundingClientRect();
      return { top: Math.round(b.top), bottom: Math.round(b.bottom), w: Math.round(b.width), shown: getComputedStyle(e).display !== 'none' && b.width > 0 };
    };
    const h1 = document.querySelector('[data-question-stage] h1');
    return {
      vw: innerWidth,
      vh: innerHeight,
      overflow: document.documentElement.scrollWidth - innerWidth,
      header: box('.instrument-progress'),
      rail: box('[data-review-areas]'),
      card: box('.question-instrument'),
      context: box('[data-review-context]'),
      prompt: box('[data-question-stage] h1'),
      focus: document.activeElement === h1,
      q: document.querySelector('[data-question-stage]')?.getAttribute('data-question-id') ?? null
    };
  });
}

(async () => {
  const browser = await chromium.launch();
  const rows = [];
  const errors = [];
  for (const [w, h] of SIZES) {
    const phone = w < 500;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: phone, hasTouch: phone });
    const page = await ctx.newPage();
    page.on('pageerror', (e) => errors.push(`${w}x${h} ${String(e).slice(0, 160)}`));
    const s = await api('POST', '/review/api/sessions', { organisationLabel: `Fictional Viewport ${w}x${h}`, fictionalConfirmed: true });
    await page.goto(`${BASE}/review/s/${s.respondent}`, { waitUntil: 'networkidle' });
    await page.click('button:has-text("Begin the interview")');
    await page.waitForSelector('[data-question-stage]');
    const checks = [];
    let handoff = false;
    for (let i = 0; i < 18; i++) {
      const v = (await api('GET', `/review/api/s/${s.respondent}`)).view;
      if (!v.step) break;
      const step = v.step;
      const d = step.detailFor ?? {};
      const detail = new Set([...(d.reach ?? []), ...(d.tested ?? []), ...(d.ev ?? [])]);
      const values = step.choices.map((c) => c.value);
      const practice = !step.q.startsWith('PR-') && step.q !== '__assumptions__';
      if (step.format === 'multi') {
        await page.locator('[data-review-multi] input[type=checkbox]').first().check();
        await page.click('[data-review-multi] button:has-text("Save answer")');
      } else {
        // The fourth practice question is answered "I don't know" to bring up the area handoff offer.
        const unknownNow = practice && !handoff && checks.filter((c) => c.practice).length === 3;
        const value = step.q.startsWith('PR-') ? (PROFILE[step.q] && values.includes(PROFILE[step.q]) ? PROFILE[step.q] : values.find((x) => x !== 'unknown')) : unknownNow ? 'unknown' : [...values].reverse().find((x) => !detail.has(x) && x !== 'unknown') ?? values[0];
        await page.click(`[data-question-stage] label:has(input[type=radio][value="${value}"])`);
        if (await page.waitForSelector('[data-review-detail]', { timeout: 400 }).catch(() => null)) await page.click('[data-review-detail] button:has-text("Save answer")');
      }
      await page.waitForFunction((prev) => {
        const root = document.querySelector('[data-review-interview]');
        const st = document.querySelector('[data-question-stage]');
        return document.querySelector('[data-review-complete]') || (st && st.getAttribute('data-question-id') !== prev && root?.getAttribute('data-transition-phase') === 'idle');
      }, step.q, { timeout: 20000 });
      const st = await state(page);
      if (!handoff && (await page.$('[data-review-area-handoff]'))) {
        handoff = true;
        await page.screenshot({ path: path.join(OUT, 'shots', `handoff-${w}x${h}.png`) });
      }
      const headerBottom = st.header ? Math.max(0, st.header.bottom) : 0;
      checks.push({ q: step.q, practice, promptTop: st.prompt?.top, inView: !!st.prompt && st.prompt.top >= headerBottom - 2 && st.prompt.top < st.vh, focus: st.focus, overflow: st.overflow });
      if (checks.length >= 6 && handoff) break;
    }
    const layout = await state(page);
    await page.screenshot({ path: path.join(OUT, 'shots', `question-${w}x${h}.png`) });
    // Back to the previous saved answer: it is shown selected, in view and focused.
    await page.click('button:has-text("← Back")');
    await page.waitForSelector('[data-review-back]');
    const back = await state(page);
    const selected = await page.$$eval('[data-question-stage] input', (els) => els.some((e) => e.checked));
    await page.click('button:has-text("Continue with saved response")').catch(() => {});
    const desktop = w >= 1280;
    const layoutOk = phone ? !layout.rail?.shown && layout.card.w >= w - 64 : w < 768 ? true : layout.rail?.shown && (desktop ? layout.context?.shown : true) && layout.card.w >= 560;
    const ok = layoutOk && checks.every((c) => c.inView && c.focus && c.overflow <= 0) && handoff && selected && back.prompt && back.prompt.top >= 0 && back.prompt.top < back.vh && back.overflow <= 0;
    rows.push({ size: `${w}x${h}`, ok, layoutOk, handoff, backSelected: selected, layout: { rail: layout.rail, card: layout.card, context: layout.context, prompt: layout.prompt }, checks });
    console.log(`${w}x${h}`, ok ? 'pass' : 'FAIL', `rail ${layout.rail?.shown ? layout.rail.w : 'hidden'}, card ${layout.card?.w}, context ${layout.context?.shown ? layout.context.w : 'hidden'}; ${checks.length} answers, prompt tops ${checks.map((c) => c.promptTop).join('/')}; handoff ${handoff}; back selected ${selected}`);
    await ctx.close();
  }
  await browser.close();
  const pass = rows.filter((r) => r.ok).length;
  fs.writeFileSync(path.join(OUT, 'viewport-journeys.json'), JSON.stringify({ base: BASE, pass, of: rows.length, errors, rows }, null, 1));
  console.log(JSON.stringify({ pass, of: rows.length, scriptErrors: errors.length }));
  process.exit(pass === rows.length && !errors.length ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
