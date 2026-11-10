// Automated accessibility scan (axe-core, WCAG 2.0/2.1/2.2 A and AA rules) of a running build at 1440 and 390px.
// node scripts/readiness-review-axe-scan.cjs <baseUrl> <out.json> <pagesJson>
// Automated rules find only part of what a manual audit and screen-reader testing would find; both remain outstanding.
const { chromium } = require('playwright');
const fs = require('fs');

const [BASE, OUT, pagesJson] = process.argv.slice(2);
const PAGES = JSON.parse(pagesJson);
const AXE = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

(async () => {
  const browser = await chromium.launch();
  const rows = [];
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: w < 500, hasTouch: w < 500 });
    const page = await ctx.newPage();
    for (const [name, url] of Object.entries(PAGES)) {
      await page.goto(BASE + url, { waitUntil: 'networkidle' });
      const decline = await page.$('button:has-text("Decline"), button:has-text("Reject"), button:has-text("Necessary only")');
      if (decline) await decline.click().catch(() => {});
      await page.waitForTimeout(300);
      await page.addScriptTag({ content: AXE });
      const result = await page.evaluate(async () => {
        const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] }, resultTypes: ['violations'] });
        return r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, targets: v.nodes.slice(0, 3).map((n) => n.target.join(' ')) }));
      });
      rows.push({ name, url, width: w, violations: result });
    }
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(OUT, JSON.stringify({ base: BASE, axe: require('axe-core/package.json').version, rows }, null, 1));
  const total = rows.reduce((s, r) => s + r.violations.length, 0);
  console.log(`${rows.length} page scans; ${total} rule violations`);
  rows.filter((r) => r.violations.length).forEach((r) => console.log('  ', r.name, r.width, r.violations.map((v) => `${v.id}(${v.impact},${v.nodes})`).join(' ')));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
