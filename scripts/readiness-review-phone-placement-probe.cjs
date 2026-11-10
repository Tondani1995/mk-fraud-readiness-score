// Phone placement probe: after every answer transition at 320, 375 and 430px, is the next prompt in view?
// node scripts/readiness-review-phone-placement-probe.cjs <baseUrl> <out.json> [cycles=12]
// Each cycle starts a fictional session and answers 15 questions with the lowest answers, so the respondent scrolls to
// the bottom of long questions and, where it opens, to the Save button of the optional detail panel. Every scroll and
// every script call that can move the page (scrollBy, scrollTo, scrollIntoView, focus) is logged with the transition
// phase, so a movement the browser makes on its own can be told apart from one the page asks for.
// The failure it was written for appeared only with the processor busy; run it beside other work to reproduce that.
// Requires a running build with MK_READINESS_REVIEW_HARNESS=fictional-local. All data is fictional.
const { chromium } = require('playwright');
const fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:3200';
const OUT = process.argv[3] || 'phone-placement-probe.json';
const CYCLES = Number(process.argv[4] || 12);
const api = async (p, body) => (await fetch(BASE + p, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined)).json();

(async () => {
  const browser = await chromium.launch();
  const outOfView = [];
  const placementCalls = {};
  const scriptErrors = [];
  let samples = 0;
  for (let c = 0; c < CYCLES; c++) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      window.__log = [];
      const t0 = performance.now();
      const h = () => document.querySelector('[data-question-stage] h1');
      const note = (k, extra) => window.__log.push({ k, t: Math.round(performance.now() - t0), y: Math.round(scrollY), top: h() ? Math.round(h().getBoundingClientRect().top) : null, q: document.querySelector('[data-question-stage]')?.getAttribute('data-question-id'), ...extra });
      addEventListener('scroll', () => note('scroll', { height: document.documentElement.scrollHeight }), { passive: true });
      document.addEventListener('click', () => note('click'), true);
      new MutationObserver((l) => l.forEach((m) => m.attributeName === 'data-transition-phase' && note('phase', { v: m.target.getAttribute('data-transition-phase') }))).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-transition-phase'] });
      for (const [obj, name] of [[window, 'scrollBy'], [window, 'scrollTo'], [window, 'scroll'], [Element.prototype, 'scrollIntoView'], [Element.prototype, 'scrollTo'], [Element.prototype, 'scrollBy'], [HTMLElement.prototype, 'focus']]) {
        const original = obj[name];
        obj[name] = function (...args) { note(`call:${name}`, { args: JSON.stringify(args).slice(0, 120) }); return original.apply(this, args); };
      }
    });
    const s = await api('/review/api/sessions', { organisationLabel: 'Fictional Placement Co', fictionalConfirmed: true });
    await page.goto(`${BASE}/review/s/${s.respondent}`, { waitUntil: 'networkidle' });
    await page.click('button:has-text("Begin the interview")');
    await page.waitForSelector('[data-question-stage]');
    let w = 0;
    try {
    for (const [width, h] of [[320, 568], [375, 812], [430, 932], [320, 568], [375, 812]]) {
      w = width;
      await page.setViewportSize({ width: w, height: h });
      for (let i = 0; i < 3; i++) {
        const before = await page.evaluate(() => { window.__log = []; return document.querySelector('[data-question-stage]')?.getAttribute('data-question-id'); });
        const step = (await api(`/review/api/s/${s.respondent}`)).view.step;
        if (!step) break;
        if (step.format === 'multi') {
          await page.locator('[data-review-multi] input[type=checkbox]').first().check();
          await page.click('[data-review-multi] button:has-text("Save answer")');
        } else {
          const v = [...step.choices.map((x) => x.value)].reverse().find((x) => x !== 'unknown' && x !== 'na');
          await page.click(`[data-question-stage] label:has(input[type=radio][value="${v}"])`);
          await page.waitForFunction((prev) => document.querySelector('[data-review-detail]') || document.querySelector('[data-review-message]') || document.querySelector('[data-question-stage]')?.getAttribute('data-question-id') !== prev, before, { polling: 'raf', timeout: 60000 });
          if (await page.$('[data-review-detail]')) await page.click('[data-review-detail] button:has-text("Save answer")');
        }
        await page.waitForFunction((prev) => {
          const st = document.querySelector('[data-question-stage]');
          return st && st.getAttribute('data-question-id') !== prev && document.querySelector('[data-review-interview]')?.getAttribute('data-transition-phase') === 'idle';
        }, before, { polling: 'raf', timeout: 60000 });
        const r = await page.evaluate(() => { const h1 = document.querySelector('[data-question-stage] h1'); const b = h1.getBoundingClientRect(); return { top: Math.round(b.top), vh: innerHeight, y: Math.round(scrollY), log: window.__log }; });
        samples++;
        let phase = null;
        for (const e of r.log) {
          if (e.k === 'phase') phase = e.v;
          if (e.k === 'call:scrollBy') placementCalls[phase ?? 'before any phase'] = (placementCalls[phase ?? 'before any phase'] || 0) + 1;
        }
        if (r.top < 0 || r.top >= r.vh) outOfView.push({ cycle: c, width: w, from: before, top: r.top, viewportHeight: r.vh, scrollY: r.y, log: r.log });
      }
    }
    } catch (e) {
      // The rest of this cycle is abandoned; the page state is recorded so a stall can be told from a slow machine.
      const state = await page.evaluate(() => ({ phase: document.querySelector('[data-review-interview]')?.getAttribute('data-transition-phase'), q: document.querySelector('[data-question-stage]')?.getAttribute('data-question-id'), message: document.querySelector('[data-review-message]')?.textContent?.trim().slice(0, 200) ?? null, detailOpen: !!document.querySelector('[data-review-detail]'), log: (window.__log || []).slice(-30) })).catch(() => null);
      scriptErrors.push({ cycle: c, width: w, error: String(e).split('\n')[0].slice(0, 200), state });
    }
    await ctx.close();
  }
  await browser.close();
  // Placement calls are listed by the last transition phase reported before them: those after 'confirmed' (or
  // 'collapsing' under reduced motion) place the new prompt; those after 'entering' are the check as the transition ends.
  const result = { base: BASE, cycles: CYCLES, samples, promptOutOfView: outOfView.length, scriptErrors: scriptErrors.length, placementCallsByPrecedingPhase: placementCalls, outOfView, scriptErrorDetail: scriptErrors };
  fs.writeFileSync(OUT, JSON.stringify(result, null, 1));
  console.log(JSON.stringify({ samples, promptOutOfView: outOfView.length, scriptErrors: scriptErrors.length, placementCallsByPrecedingPhase: placementCalls }));
  process.exitCode = outOfView.length || scriptErrors.length ? 1 : 0;
})();
