// Layout sweep, homepage companion check and page performance for a running build.
// node scripts/readiness-review-layout-sweep.cjs <baseUrl> <outDir> <label> <pagesJson> [--companion] [--perf]
// pagesJson maps a page name to a path. Records status, sideways overflow, page height, fonts in use and script errors
// at desktop, short-desktop and phone widths; screenshots each viewport; full pages at 1440 and 390.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const [BASE, OUT, LABEL, pagesJson] = process.argv.slice(2);
const PAGES = JSON.parse(pagesJson);
const flags = new Set(process.argv.slice(6));
const sizeFlag = process.argv.slice(6).find((a) => a.startsWith('--sizes='));
const SIZES = sizeFlag
  ? sizeFlag.slice(8).split(',').map((x) => x.split('x').map(Number))
  : [[1100, 900], [1280, 900], [1440, 900], [1600, 900], [1920, 900], [1100, 768], [1440, 700], [320, 568], [375, 812], [390, 844], [430, 932]];
fs.mkdirSync(path.join(OUT, 'shots'), { recursive: true });

async function settle(p) {
  const decline = await p.$('button:has-text("Decline"), button:has-text("Reject"), button:has-text("Necessary only")');
  if (decline) await decline.click().catch(() => {});
  await p.waitForTimeout(350);
}

(async () => {
  const browser = await chromium.launch();
  const rows = [];
  for (const [w, h] of SIZES) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 500, hasTouch: w < 500 });
    const p = await ctx.newPage();
    const errors = [];
    p.on('pageerror', (e) => errors.push(String(e).slice(0, 160)));
    for (const [name, url] of Object.entries(PAGES)) {
      errors.length = 0;
      const resp = await p.goto(BASE + url, { waitUntil: 'networkidle' }).catch(() => null);
      await settle(p);
      const dims = await p.evaluate(() => ({
        height: document.documentElement.scrollHeight,
        overflow: document.documentElement.scrollWidth - innerWidth,
        fonts: [...new Set([...document.querySelectorAll('body *')].slice(0, 600).map((e) => getComputedStyle(e).fontFamily.split(',')[0].replace(/"/g, '').trim().toLowerCase()))],
        h1: document.querySelector('h1')?.textContent?.trim().slice(0, 90) ?? null
      }));
      await p.screenshot({ path: path.join(OUT, 'shots', `${LABEL}-${name}-${w}x${h}.png`) });
      if ((w === 1440 && h === 900) || w === 390) await p.screenshot({ path: path.join(OUT, 'shots', `${LABEL}-${name}-${w}-full.png`), fullPage: true });
      rows.push({ label: LABEL, name, url, width: w, height: h, status: resp && resp.status(), ...dims, errors: [...errors] });
    }
    await ctx.close();
  }
  const out = { base: BASE, label: LABEL, rows };

  if (flags.has('--companion')) {
    // The homepage narrative: at each width and height, scroll to each stage heading and record where the companion is.
    const comp = [];
    for (const [w, h] of [[1100, 900], [1280, 900], [1440, 900], [1600, 900], [1920, 900], [1100, 800], [1440, 800], [1440, 700], [1920, 700]]) {
      const ctx = await browser.newContext({ viewport: { width: w, height: h } });
      const p = await ctx.newPage();
      await p.goto(BASE + '/', { waitUntil: 'networkidle' });
      await settle(p);
      const n = await p.$$eval('[data-story-heading]', (els) => els.length);
      const stages = [];
      for (let i = 0; i < n; i++) {
        await p.evaluate((i) => {
          const el = document.querySelectorAll('[data-story-heading]')[i];
          window.scrollTo({ top: el.getBoundingClientRect().top + scrollY - innerHeight * 0.35, behavior: 'instant' });
        }, i);
        await p.waitForTimeout(250);
        stages.push(await p.evaluate(() => {
          const fig = document.querySelector('figure[aria-label="Illustration of MK\'s approach to fraud risk"]');
          if (!fig) return { figure: false };
          const r = fig.getBoundingClientRect();
          return { figure: true, top: Math.round(r.top), bottom: Math.round(r.bottom), visible: r.bottom > 0 && r.top < innerHeight, active: fig.getAttribute('data-story-active'), display: getComputedStyle(fig).display };
        }));
      }
      comp.push({ width: w, height: h, stages });
      await ctx.close();
    }
    out.companion = comp;
  }

  if (flags.has('--perf')) {
    const perf = [];
    for (const [name, url] of Object.entries(PAGES)) {
      const runs = [];
      for (let i = 0; i < 3; i++) {
        const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const p = await ctx.newPage();
        await p.addInitScript(() => {
          window.__lcp = 0;
          window.__cls = 0;
          new PerformanceObserver((l) => l.getEntries().forEach((e) => (window.__lcp = e.startTime))).observe({ type: 'largest-contentful-paint', buffered: true });
          new PerformanceObserver((l) => l.getEntries().forEach((e) => { if (!e.hadRecentInput) window.__cls += e.value; })).observe({ type: 'layout-shift', buffered: true });
        });
        await p.goto(BASE + url, { waitUntil: 'load' });
        await p.waitForTimeout(1200);
        runs.push(await p.evaluate(() => {
          const n = performance.getEntriesByType('navigation')[0];
          const bytes = performance.getEntriesByType('resource').reduce((s, r) => s + (r.transferSize || 0), n.transferSize || 0);
          return { ttfb: Math.round(n.responseStart - n.requestStart), dcl: Math.round(n.domContentLoadedEventEnd), load: Math.round(n.loadEventEnd), lcp: Math.round(window.__lcp), cls: Number(window.__cls.toFixed(3)), kb: Math.round(bytes / 1024) };
        }));
        await ctx.close();
      }
      const med = (k) => runs.map((r) => r[k]).sort((a, b) => a - b)[1];
      perf.push({ name, url, runs, median: { ttfb: med('ttfb'), dcl: med('dcl'), load: med('load'), lcp: med('lcp'), cls: med('cls'), kb: med('kb') } });
    }
    out.perf = perf;
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT, `${LABEL}-sweep.json`), JSON.stringify(out, null, 1));
  const bad = rows.filter((r) => r.status !== 200 || r.overflow > 0 || r.errors.length);
  console.log(`${LABEL}: ${rows.length} page loads; ${bad.length} with a non-200 status, sideways overflow or a script error`);
  bad.slice(0, 12).forEach((r) => console.log('  ', r.name, `${r.width}x${r.height}`, r.status, 'overflow', r.overflow, r.errors[0] ?? ''));
  if (out.companion) console.log('companion', JSON.stringify(out.companion.map((c) => [`${c.width}x${c.height}`, c.stages.map((s) => (s.figure ? `${s.active}:${s.visible ? 'in' : 'out'}@${s.top}` : 'none'))])));
  if (out.perf) console.log('perf', JSON.stringify(out.perf.map((p) => [p.name, p.median])));
})();
