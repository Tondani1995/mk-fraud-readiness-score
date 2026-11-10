// Measures the respondent answer transition in the browser, with and without reduced motion.
// node scripts/readiness-review-transition-timing.cjs <baseUrl> <out.json> [questions=24]
// Times are taken inside the page (performance.now) from the click on an answer: when the save request starts and
// ends, when each transition phase commits, when the next prompt is rendered and when the transition is idle again.
// Only single-choice answers that do not open the optional detail panel are timed, so no test wait is included.
// Requires a running build with MK_READINESS_REVIEW_HARNESS=fictional-local. All data is fictional.
const { chromium } = require('playwright');
const fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:3200';
const OUT = process.argv[3] || 'transition-timing.json';
const N = Number(process.argv[4] || 24);

async function createSession() {
  const res = await fetch(BASE + '/review/api/sessions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ organisationLabel: 'Fictional Timing Co', fictionalConfirmed: true })
  });
  if (!res.ok) throw new Error('session ' + res.status);
  return (await res.json()).respondent;
}
async function viewOf(token) {
  return (await (await fetch(`${BASE}/review/api/s/${token}`)).json()).view;
}

const stats = (xs) => {
  const a = xs.filter((x) => typeof x === 'number').sort((x, y) => x - y);
  if (!a.length) return null;
  return { n: a.length, median: Math.round(a[Math.floor(a.length / 2)]), p90: Math.round(a[Math.floor(a.length * 0.9)]), max: Math.round(a.at(-1)) };
};

async function run(browser, reduced) {
  const token = await createSession();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    window.__marks = [];
    const mark = (k, extra) => window.__marks.push({ k, t: performance.now(), ...extra });
    document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('[data-question-stage] label')) mark('click'); }, true);
    new MutationObserver((list) => {
      for (const m of list) {
        if (m.attributeName === 'data-transition-phase') mark('phase', { v: m.target.getAttribute('data-transition-phase') });
      }
    }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-transition-phase'] });
    new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (e.name.includes('/review/api/s/') && e.initiatorType === 'fetch') mark('save', { start: e.startTime, end: e.responseEnd }); })).observe({ type: 'resource', buffered: true });
  });
  await page.goto(`${BASE}/review/s/${token}`, { waitUntil: 'networkidle' });
  const begin = await page.$('[data-review-begin], button:has-text("Begin the interview"), button:has-text("Start the interview")');
  if (begin) await begin.click();
  await page.waitForSelector('[data-question-stage]');

  const rows = [];
  let guard = 0;
  while (rows.length < N && guard++ < N * 3) {
    const v = await viewOf(token);
    if (!v.step) break;
    const step = v.step;
    if (step.format !== 'single') {
      // Not timed: answer through the API and reload so the next timed question starts from a settled page.
      await fetch(`${BASE}/review/api/s/${token}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ actionId: crypto.randomUUID(), expectedSeq: v.seq, action: { type: 'respondent.answer', q: step.q, value: [step.choices.find((c) => !['none', 'unknown'].includes(c.value))?.value ?? step.choices[0].value] } }) });
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForSelector('[data-question-stage]');
      continue;
    }
    const d = step.detailFor ?? {};
    const detail = new Set([...(d.reach ?? []), ...(d.tested ?? []), ...(d.ev ?? [])]);
    const value = step.choices.map((c) => c.value).find((x) => !detail.has(x) && x !== 'unknown') ?? step.choices.map((c) => c.value).find((x) => !detail.has(x));
    if (!value) break;
    await page.waitForFunction(() => document.querySelector('[data-review-interview]')?.getAttribute('data-transition-phase') === 'idle');
    await page.evaluate(() => (window.__marks = []));
    await page.click(`[data-question-stage] label:has(input[type=radio][value="${value}"])`);
    await page.waitForFunction((prev) => {
      const root = document.querySelector('[data-review-interview]');
      const s = document.querySelector('[data-question-stage]');
      return (document.querySelector('[data-review-complete]') || (s && s.getAttribute('data-question-id') !== prev)) && root?.getAttribute('data-transition-phase') === 'idle';
    }, step.q, { timeout: 15000, polling: 'raf' });
    await page.waitForTimeout(30);
    const marks = await page.evaluate(() => window.__marks);
    const click = marks.find((m) => m.k === 'click')?.t;
    const save = marks.find((m) => m.k === 'save' && m.start >= click - 5);
    const at = (v) => marks.find((m) => m.k === 'phase' && m.v === v)?.t;
    const idle = [...marks].reverse().find((m) => m.k === 'phase' && m.v === 'idle')?.t;
    rows.push({
      q: step.q,
      clickToSaveStart: save && save.start - click,
      saveRoundTrip: save && save.end - save.start,
      clickToCollapsing: at('collapsing') && at('collapsing') - click,
      clickToConfirmed: at('confirmed') && at('confirmed') - click,
      // The next prompt is rendered in the same commit that enters the 'entering' phase (or 'idle' under reduced motion).
      clickToNextPrompt: (at('entering') ?? idle) && (at('entering') ?? idle) - click,
      clickToIdle: idle && idle - click,
      phases: marks.filter((m) => m.k === 'phase').map((m) => m.v)
    });
  }
  await ctx.close();
  const keys = ['clickToSaveStart', 'saveRoundTrip', 'clickToCollapsing', 'clickToConfirmed', 'clickToNextPrompt', 'clickToIdle'];
  return { reduced, summary: Object.fromEntries(keys.map((k) => [k, stats(rows.map((r) => r[k]))])), rows };
}

(async () => {
  const browser = await chromium.launch();
  const motion = await run(browser, false);
  const reduced = await run(browser, true);
  await browser.close();
  const out = { base: BASE, viewport: '1440x900', conditions: 'Local production build on localhost, fictional file harness, headless Chromium. Not representative of a deployed network path.', motion, reduced };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log('motion', JSON.stringify(motion.summary));
  console.log('reduced', JSON.stringify(reduced.summary));
  console.log('phase sequences (motion)', JSON.stringify([...new Set(motion.rows.map((r) => r.phases.join('>')))]));
  console.log('phase sequences (reduced)', JSON.stringify([...new Set(reduced.rows.map((r) => r.phases.join('>')))]));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
