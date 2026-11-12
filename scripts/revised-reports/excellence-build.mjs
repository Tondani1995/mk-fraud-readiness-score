// Stages 7 to 11 of the Bible's method for the four fictional organisations: validate each manuscript, export the
// plain-text manuscript, compose the report in the MK publication system, render the PDF (two passes, so the
// contents page carries page numbers), and write the validation report and generation manifest.
//   PUPPETEER_EXECUTABLE_PATH=... node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs \
//     scripts/revised-reports/excellence-build.mjs [P6b:essential,P3:comprehensive]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { validateManuscript, plainManuscript } from '../../src/lib/reports/revised/manuscript/manuscript.ts';
import { composeRevisedReportHtml, REVISED_COMPOSER_VERSION } from '../../src/lib/reports/revised/manuscript/compose.ts';
import { renderPublicationPdf, closePublicationBrowser } from '../../src/lib/reports/revised/manuscript/render.ts';
import { MK_PUBLICATION_VERSION } from '../../src/lib/reports/design/mk-publication.ts';
import { buildBibleWorkbook, BIBLE_WORKBOOK_VERSION } from '../../src/lib/reports/revised/manuscript/workbook-bible.ts';

const DIR = 'docs/readiness-review/report-excellence';
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const only = process.argv[2] ? process.argv[2].split(',') : null;
const jobs = [];
for (const k of ['P3', 'P4', 'P5', 'P6b']) for (const p of ['essential', 'comprehensive']) if (!only || only.includes(`${k}:${p}`) || only.includes(k)) jobs.push([k, p]);
const source = execFileSync('git', ['rev-parse', 'HEAD']).toString().trim();
const summary = fs.existsSync(path.join(DIR, 'build-summary.json')) ? JSON.parse(fs.readFileSync(path.join(DIR, 'build-summary.json'), 'utf8')) : {};
const norm = (s) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim().toLowerCase();

function pagesText(pdfPath) {
  const n = Number(execFileSync('pdfinfo', [pdfPath]).toString().match(/Pages:\s+(\d+)/)[1]);
  const texts = [];
  for (let i = 1; i <= n; i++) texts.push(norm(execFileSync('pdftotext', ['-f', String(i), '-l', String(i), '-layout', pdfPath, '-']).toString()));
  return texts;
}
function findPage(texts, heading, from = 0) {
  const h = norm(heading).slice(0, 48);
  for (let i = from; i < texts.length; i++) if (texts[i].includes(h)) return i + 1;
  return null;
}

for (const [k, product] of jobs) {
  const dir = path.join(DIR, k);
  const mdPath = path.join(dir, `${product}-manuscript.md`);
  if (!fs.existsSync(mdPath)) { console.log(k, product, 'no manuscript yet'); continue; }
  const md = fs.readFileSync(mdPath, 'utf8');
  const fp = JSON.parse(fs.readFileSync(path.join(dir, `${product}-fact-pack.json`), 'utf8'));
  const plan = JSON.parse(fs.readFileSync(path.join(dir, `${product}-story-plan.json`), 'utf8'));
  const validation = validateManuscript(md, fp, plan);
  fs.writeFileSync(path.join(dir, `${product}-validation.json`), JSON.stringify(validation, null, 1) + '\n');
  fs.writeFileSync(path.join(dir, `${product}-manuscript.txt`), plainManuscript(md, fp, plan));
  if (!validation.pass) { console.log(k, product, 'VALIDATION FAILED: not composed', validation.issues.filter((i) => i.blocking).map((i) => i.code).join(',')); summary[`${k}/${product}`] = { pass: false }; continue; }
  const base = { md, fp, plan, dateLabel: '12 November 2026', prototype: true };
  let { html, sections } = composeRevisedReportHtml(base);
  const tmp = path.join(dir, `${product}.pass1.pdf`);
  fs.writeFileSync(tmp, (await renderPublicationPdf(html)).pdf);
  const texts = pagesText(tmp);
  fs.unlinkSync(tmp);
  const pageMap = {};
  // Skip the cover and the contents pages, which list every heading.
  const firstBody = texts.findIndex((t, i) => i > 0 && !t.includes(norm(sections[0].heading).slice(0, 30)) );
  let from = Math.max(1, sections.length > 1 ? (findPage(texts, sections[1].heading, 2) ?? 2) - 1 : 1);
  void firstBody;
  for (const s of sections) {
    const p = findPage(texts, s.heading, from);
    if (p) { pageMap[s.id] = p; from = p - 1; }
    let uf = Math.max(0, (p ?? 1) - 1);
    for (const u of s.units) { const up = findPage(texts, u, uf); if (up) { pageMap[`${s.id}::${u}`] = up; uf = up - 1; } }
  }
  ({ html } = composeRevisedReportHtml({ ...base, pageMap }));
  const { pdf, sha256 } = await renderPublicationPdf(html);
  fs.writeFileSync(path.join(dir, `${product}.html`), html);
  fs.writeFileSync(path.join(dir, `${product}.pdf`), pdf);
  const pages = Number(execFileSync('pdfinfo', [path.join(dir, `${product}.pdf`)]).toString().match(/Pages:\s+(\d+)/)[1]);
  const finalTexts = pagesText(path.join(dir, `${product}.pdf`));
  const sparse = finalTexts.map((t, i) => ({ page: i + 1, chars: t.replace(/mk fraud insights|confidential.*$/g, '').length })).filter((x) => x.page > 1 && x.page < pages && x.chars < 450);
  const fonts = [...new Set(execFileSync('pdffonts', [path.join(dir, `${product}.pdf`)]).toString().split('\n').slice(2).map((l) => l.split(/\s+/)[0]).filter(Boolean).map((f) => f.replace(/^[A-Z]{6}\+/, '')))];
  const model = JSON.parse(fs.readFileSync(path.join('docs/readiness-review/report-revision', k, 'model.json'), 'utf8')).report;
  const wb = await buildBibleWorkbook(product, model, fp);
  fs.writeFileSync(path.join(dir, `${product}-workbook.xlsx`), wb.bytes);
  const manifest = {
    product, organisation: fp.organisation.name, assessmentReference: fp.organisation.reference, bibleVersion: '1.1', sourceCommit: source,
    writer: { mode: 'in-session bounded writer under the writer contract', productionAiRoute: 'not exercised: no provider credentials in this environment (blocked acceptance test)' },
    versions: { factPack: fp.version, storyPlan: plan.version, validator: validation.validator, composer: REVISED_COMPOSER_VERSION, publication: MK_PUBLICATION_VERSION, workbook: BIBLE_WORKBOOK_VERSION, content: fp.contentVersions },
    hashes: { factPack: fp.sha256, manuscript: sha(md), html: sha(html), pdf: sha256, workbook: wb.sha256 },
    workbookSheets: wb.sheets,
    pages, fonts, generatedLabel: base.dateLabel, prototype: true
  };
  fs.writeFileSync(path.join(dir, `${product}-manifest.json`), JSON.stringify(manifest, null, 1) + '\n');
  summary[`${k}/${product}`] = { pass: true, pages, words: validation.stats.words, fonts, sparsePages: sparse, pdf: sha256.slice(0, 12), workbook: wb.sheets.map((x) => `${x.name} ${x.rows}`) };
  console.log(k, product, 'pages', pages, 'words', validation.stats.words, 'fonts', fonts.join(' '), 'sparse', JSON.stringify(sparse));
}
fs.writeFileSync(path.join(DIR, 'build-summary.json'), JSON.stringify(summary, null, 1) + '\n');
await closePublicationBrowser();
process.exit(0);
