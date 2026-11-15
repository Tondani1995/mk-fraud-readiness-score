// Probes whether the question moves after the transition reports idle (the entry animation duration switches from
// 40ms back to 240ms when the phase leaves 'entering').
// node scripts/readiness-review-settle-probe.cjs <baseUrl> [answers=6]
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:3200';
const N = Number(process.argv[3] || 6);
(async () => {
  const s = await (await fetch(BASE + '/review/api/sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ organisationLabel: 'Fictional Probe Co', fictionalConfirmed: true }) })).json();
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(`${BASE}/review/s/${s.respondent}`, { waitUntil: 'networkidle' });
  await p.click('button:has-text("Begin the interview")');
  await p.waitForSelector('[data-question-stage]');
  await p.waitForTimeout(400);
  const out = [];
  for (let i = 0; i < N; i++) {
    const v = (await (await fetch(`${BASE}/review/api/s/${s.respondent}`)).json()).view.step;
    if (!v || v.format === 'multi') break;
    const d = v.detailFor; const det = new Set([...d.reach, ...d.tested, ...d.ev]);
    const val = v.choices.map((c) => c.value).find((x) => !det.has(x) && x !== 'unknown');
    await p.evaluate(() => {
      window.__trace = [];
      const t0 = performance.now();
      const tick = () => {
        const root = document.querySelector('[data-review-interview]');
        const st = document.querySelector('[data-question-stage]');
        if (st) window.__trace.push({ t: Math.round(performance.now() - t0), q: st.getAttribute('data-question-id'), phase: root.getAttribute('data-transition-phase'), y: Math.round(st.getBoundingClientRect().top * 10) / 10, anims: st.getAnimations().map((a) => `${a.playState}:${Math.round(a.currentTime)}/${a.effect.getTiming().duration}`).join(',') });
        if (performance.now() - t0 < 900) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await p.click(`[data-question-stage] label:has(input[type=radio][value="${val}"])`);
    await p.waitForTimeout(1000);
    const tr = await p.evaluate(() => window.__trace);
    const idleAt = tr.find((x) => x.phase === 'idle' && x.q !== v.q);
    const after = tr.filter((x) => idleAt && x.t >= idleAt.t);
    const ys = after.map((x) => x.y);
    out.push({ q: v.q, idleAt: idleAt?.t, yAtIdle: ys[0], yRange: ys.length ? Math.round((Math.max(...ys) - Math.min(...ys)) * 10) / 10 : null, movedForMs: (() => { const last = [...after].reverse().find((x, i, arr) => i < arr.length - 1 && x.y !== arr[i + 1].y); return last && idleAt ? last.t - idleAt.t : 0; })(), sample: after.slice(0, 6).map((x) => `${x.t}:${x.y}:${x.anims}`) });
  }
  await b.close();
  console.log(JSON.stringify(out, null, 1));
})();
