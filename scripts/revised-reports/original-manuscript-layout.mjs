// Matched publication evidence on unchanged original-length AI manuscripts (independent review of the corrective pass,
// F6). Each manuscript is the exact text the deployed pipeline produced and retained (a rejected run; the deployed
// successes kept no manuscript). "Before" is the single-pass composition at 4016c0de with the Fact Pack and Story Plan
// that code builds for the bound Kestrel input; "after" is the corrected multi-pass layout with the same manuscript,
// Fact Pack and Story Plan. Both PDFs are audited the same way: pdftotext for text, pdfjs for heading positions.
//   PUPPETEER_EXECUTABLE_PATH=... node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/revised-reports/original-manuscript-layout.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { composeRevisedReportHtml } from '../../src/lib/reports/revised/manuscript/compose.ts';
import { closePublicationBrowser } from '../../src/lib/reports/revised/manuscript/render.ts';
import { layoutPublication, pdfPageTexts, norm, STRANDED_HEADING_CHARS } from '../../src/lib/reports/revised/manuscript/layout.ts';
import { publicationGates } from '../../src/lib/reports/revised/live/produce.ts';

const DIR = 'qa-output/corrective/original-manuscripts';
const AT = path.join(DIR, 'at-4016c0de');
const RUNS = ['8d6f64e3-71ad-408a-b0b2-6ae276d257bf', '896b8e6c-977f-422b-81b2-c809c32e7b8b', 'ff637bbf-fdb6-40a2-a5a8-71208a67b3f1'];
const index = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8'));
const pageTexts = (file) => {
  const n = Number(execFileSync('pdfinfo', [file]).toString().match(/Pages:\s+(\d+)/)[1]);
  return Array.from({ length: n }, (_, i) => norm(execFileSync('pdftotext', ['-f', String(i + 1), '-l', String(i + 1), file, '-']).toString()));
};
async function audit(file, outline, hasContents) {
  const texts = pageTexts(file);
  const heads = (await pdfPageTexts(new Uint8Array(fs.readFileSync(file)))).map((p) => p.heads);
  const find = (h, from) => { const k = norm(h).slice(0, 48); for (let i = Math.max(1, from); i < heads.length; i++) if (heads[i].includes(k)) return i; return -1; };
  const stranded = []; const notFound = [];
  let from = 1;
  for (const s of outline) for (const h of [s.heading, ...s.units]) {
    const i = find(h, from);
    if (i < 0) { notFound.push(h.slice(0, 50)); continue; }
    if (h === s.heading) from = i;
    const t = texts[i].replace(/mk fraud insights|strategy and control blueprint|fraud readiness report|confidential.*?release|\b\d{1,3}\b/g, ' ').replace(/\s+/g, ' ');
    const at = t.indexOf(norm(h).slice(0, 48));
    if (at >= 0 && t.slice(at + norm(h).length).trim().length < STRANDED_HEADING_CHARS && i < texts.length - 1) stranded.push(`p${i + 1} ${h.slice(0, 50)}`);
  }
  const sparse = texts.map((t, i) => ({ p: i + 1, n: t.replace(/mk fraud insights|strategy and control blueprint|fraud readiness report|confidential.*?release|\b\d{1,3}\b/g, ' ').replace(/\s+/g, ' ').trim().length })).filter((x) => x.p > 2 && x.p < texts.length && x.n < 220).map((x) => `p${x.p} (${x.n})`);
  const contentsNumbers = hasContents ? ((texts[1] ?? '') + ' ' + (texts[2] ?? '')).match(/\s\d{1,2}(?=\s|$)/g)?.length ?? 0 : null;
  return { pages: texts.length, stranded, sparse, notFound, contentsNumbers };
}
const rows = [];
for (const id of RUNS) {
  const meta = index.find((x) => x.runId === id);
  const md = fs.readFileSync(path.join(DIR, `${id}.md`), 'utf8');
  const fp = JSON.parse(fs.readFileSync(path.join(AT, `${id}.fp.json`), 'utf8'));
  const plan = JSON.parse(fs.readFileSync(path.join(AT, `${id}.plan.json`), 'utf8'));
  const hasContents = plan.sections.some((s) => s.exhibits.includes('contents'));
  const base = { md, fp, plan, dateLabel: '13 November 2026', prototype: true, restrictedNotice: 'RESTRICTED TEST: original deployed manuscript, recomposed for layout comparison only.' };
  const outline = composeRevisedReportHtml(base).sections;
  const beforePdf = path.join(AT, `${id}.before.pdf`);
  const laid = await layoutPublication(base);
  const afterPdf = path.join(AT, `${id}.after.pdf`);
  fs.writeFileSync(afterPdf, laid.pdf);
  const before = await audit(beforePdf, outline, hasContents);
  const after = await audit(afterPdf, outline, hasContents);
  const gates = publicationGates(laid.layout, hasContents);
  rows.push({ runId: id, product: meta.product, words: md.split(/\s+/).length, rejectedFor: meta.code, before, after, gates: gates.required.map((g) => `${g.id}:${g.pass}`), advisory: gates.advisory, layout: { passes: laid.layout.passes, flowSections: laid.layout.flowSections, flowUnits: laid.layout.flowUnits, breakBefore: laid.layout.breakBefore, compactContents: laid.layout.compactContents } });
  console.log(`${id.slice(0, 8)} ${meta.product}: pages ${before.pages}->${after.pages}; stranded ${before.stranded.length}->${after.stranded.length}; sparse ${before.sparse.length}->${after.sparse.length}; contents numbers ${before.contentsNumbers}->${after.contentsNumbers}; not found ${before.notFound.length}->${after.notFound.length}; gates ${gates.pass ? 'pass' : 'HELD'} (${rows.at(-1).gates.join(' ')})`);
  if (after.stranded.length || after.sparse.length) console.log('   after:', after.stranded.join(' | '), after.sparse.join(' | '));
  if (before.stranded.length || before.sparse.length) console.log('   before:', before.stranded.join(' | '), before.sparse.join(' | '));
}
await closePublicationBrowser();
fs.writeFileSync('qa-output/corrective/original-manuscript-layout.json', JSON.stringify(rows, null, 2));
