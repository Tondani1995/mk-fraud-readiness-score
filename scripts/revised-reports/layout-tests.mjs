// Hosted publication layout (independent review Q7): contents page numbers, near-empty continuation pages and headings
// stranded at the foot of a page. Renders stored fictional manuscripts once (as the hosted pipeline did before) and
// through layoutPublication (as it does now), then checks both with pdftotext, independently of the pdfjs reader the
// layout itself uses. Needs a local Chromium (PUPPETEER_EXECUTABLE_PATH) and poppler (pdftotext, pdfinfo).
//   PUPPETEER_EXECUTABLE_PATH=... node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/revised-reports/layout-tests.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { composeRevisedReportHtml } from '../../src/lib/reports/revised/manuscript/compose.ts';
import { renderPublicationPdf, closePublicationBrowser } from '../../src/lib/reports/revised/manuscript/render.ts';
import { layoutPublication, runningStrings, pdfPageTexts, STRANDED_HEADING_CHARS } from '../../src/lib/reports/revised/manuscript/layout.ts';
import { loadFixture, fixturePack } from './lib/b5-fixtures.mjs';
import { deterministicManuscript } from './lib/writer-double.mjs';
import { scenarioAccount } from '../../src/lib/reports/revised/position.ts';

const OUT = 'qa-output/corrective/layout';
fs.mkdirSync(OUT, { recursive: true });
const norm = (s) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase();
const pagesText = (file) => {
  const n = Number(execFileSync('pdfinfo', [file]).toString().match(/Pages:\s+(\d+)/)[1]);
  return Array.from({ length: n }, (_, i) => norm(execFileSync('pdftotext', ['-f', String(i + 1), '-l', String(i + 1), file, '-']).toString()));
};
// Headings are located with pdfjs by rendered size (as the layout does); every character count and page text comes from
// pdftotext, independently of the layout's own reader.
async function audit(file, html, outline) {
  const running = runningStrings(html);
  const texts = pagesText(file).map((t) => running.reduce((x, r) => x.split(r).join(' '), t).replace(/(^|\s)\d{1,3}(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim());
  const heads = (await pdfPageTexts(new Uint8Array(fs.readFileSync(file)))).map((p) => p.heads);
  const find = (h, from) => { const k = norm(h).slice(0, 48); for (let i = Math.max(1, from); i < heads.length; i++) if (heads[i].includes(k)) return i; return -1; };
  const stranded = [];
  const map = {};
  let from = 1;
  for (const s of outline) {
    const i = find(s.heading, from);
    if (i >= 0) { map[s.id] = i + 1; from = i; }
    let uf = Math.max(1, i);
    for (const h of [s.heading, ...s.units]) {
      const k = h === s.heading ? i : find(h, uf);
      if (k < 0) continue;
      if (h !== s.heading) { uf = k; map[`${s.id}::${h}`] = k + 1; }
      const t = texts[k];
      const after = t.slice(t.indexOf(norm(h).slice(0, 48)) + norm(h).length).trim().length;
      if (t.includes(norm(h).slice(0, 48)) && after < STRANDED_HEADING_CHARS && k < texts.length - 1) stranded.push(`p${k + 1}: ${h.slice(0, 60)}`);
    }
  }
  const sparse = texts.map((t, i) => ({ p: i + 1, n: t.length })).filter((x) => x.p > 2 && x.p < texts.length && x.n < 220).map((x) => `p${x.p} (${x.n} chars)`);
  const hasContents = /class="contents[ "]/.test(html);
  return { pages: texts.length, stranded, sparse, hasContents, map };
}
function verifyMap(file, pageMap, auditMap) {
  return Object.entries(auditMap).filter(([k, v]) => pageMap[k] !== v).map(([k, v]) => `${k.slice(0, 50)}: contents ${pageMap[k]}, found ${v}`);
}

const cases = [];
for (const k of ['P6b', 'P3']) for (const product of ['essential', 'comprehensive']) {
  const dir = `docs/readiness-review/report-excellence/${k}`;
  if (!fs.existsSync(`${dir}/${product}-manuscript.md`)) continue;
  cases.push({ name: `${k}-${product}`, md: fs.readFileSync(`${dir}/${product}-manuscript.md`, 'utf8'), fp: JSON.parse(fs.readFileSync(`${dir}/${product}-fact-pack.json`, 'utf8')), plan: JSON.parse(fs.readFileSync(`${dir}/${product}-story-plan.json`, 'utf8')) });
}
// The two bound B5 fixtures, with a deterministic manuscript (not AI-written; labelled as such in every output).
for (const n of ['kestrel', 'marula']) {
  const x = loadFixture(n);
  for (const product of ['essential', 'comprehensive']) {
    const { fp, plan } = fixturePack(x, product);
    cases.push({ name: `b5-${n}-${product}-deterministic`, md: deterministicManuscript(fp, plan), fp, plan, account: scenarioAccount(x.report).sentence, product, restricted: true });
  }
}
const results = [];
for (const c of cases) {
  const base = { md: c.md, fp: c.fp, plan: c.plan, dateLabel: '13 November 2026', prototype: true, ...(c.restricted ? { restrictedNotice: 'RESTRICTED TEST: deterministic writer double, not an AI manuscript; revised method not approved; no score issued.' } : {}) };
  const single = composeRevisedReportHtml(base);
  const singlePdf = path.join(OUT, `${c.name}.single.pdf`);
  fs.writeFileSync(singlePdf, (await renderPublicationPdf(single.html)).pdf);
  const before = await audit(singlePdf, single.html, single.sections);
  const t0 = Date.now();
  const laid = await layoutPublication(base);
  const ms = Date.now() - t0;
  const laidPdf = path.join(OUT, `${c.name}.layout.pdf`);
  fs.writeFileSync(laidPdf, laid.pdf);
  const after = await audit(laidPdf, laid.html, single.sections);
  const mapErrors = after.hasContents ? verifyMap(laidPdf, laid.layout.pageMap, after.map) : [];
  // Content checks on the B5 cases: product entitlement, no library residue, one scenario account.
  const content = [];
  if (c.restricted) {
    const q = (t) => t.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/-\s+/g, '-').replace(/\s+/g, ' ');
    const all = q(execFileSync('pdftotext', [laidPdf, '-']).toString());
    if (c.product === 'essential' && /work ?book|spreadsheet|supporting register|action register/i.test(all)) content.push('Essential mentions a workbook or register');
    if (/Not yet in the library|library has no entry|Not set in the library/i.test(all)) content.push('library residue');
    if (!all.includes(q(c.account).slice(0, 70))) content.push('account sentence missing');
    if (/arithmetic result|Test figure/i.test(all)) content.push('score caption residue');
  }
  const ok = !content.length && laid.layout.contentsComplete && !mapErrors.length && after.stranded.length <= before.stranded.length && after.sparse.length <= before.sparse.length
    && after.stranded.length === 0;
  results.push({ id: c.name, ok, content, before: { ...before, map: undefined }, after: { ...after, map: undefined }, layout: { ...laid.layout, pageMap: Object.keys(laid.layout.pageMap).length }, mapErrors, ms });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${c.name}: pages ${before.pages}->${after.pages}; stranded ${before.stranded.length}->${after.stranded.length}; sparse ${before.sparse.length}->${after.sparse.length}; contents ${after.hasContents ? 'numbered' : 'n/a'}; map errors ${mapErrors.length}; passes ${laid.layout.passes}; ${ms} ms`);
  if (content.length) console.log('   content', content.join(' | '));
  if (after.stranded.length) console.log('   stranded', after.stranded.join(' | '));
  if (after.sparse.length) console.log('   sparse', after.sparse.join(' | '));
}
await closePublicationBrowser();
fs.writeFileSync(path.join(OUT, 'layout-results.json'), JSON.stringify(results, null, 2));
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} of ${results.length} passed`);
process.exit(failed.length ? 1 : 0);
