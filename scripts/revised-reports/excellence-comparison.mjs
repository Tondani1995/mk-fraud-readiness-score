// Before and after for the report-excellence workstream: the previous live-report design (the certified V10 whole-
// manuscript Essential recovered for Vhutshilo Foods, August, and the V3 Comprehensive preview for Motheo, September,
// both fictional QA organisations), the latest revised prototype (55ea176, report-revision) and the improved reports
// (report-excellence), measured on the rendered PDFs with the same text indicators. Indicators, not a quality score:
// the substantive comparison is in REPORT-EXCELLENCE-COMPARISON.md.
//   node scripts/revised-reports/excellence-comparison.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const X = 'docs/readiness-review/report-excellence';
const pages = (f) => Number(execFileSync('pdfinfo', [f]).toString().match(/Pages:\s+(\d+)/)[1]);
const fonts = (f) => [...new Set(execFileSync('pdffonts', [f]).toString().split('\n').slice(2).map((l) => l.split(/\s+/)[0]).filter(Boolean).map((x) => x.replace(/^[A-Z]{6}\+/, '').replace(/-.*$/, '')))];
const pageText = (f, i) => execFileSync('pdftotext', ['-f', String(i), '-l', String(i), f, '-']).toString();

const MECHANICAL = [/Within [A-Z][^,]{3,60}, the specific control/g, /recorded control condition/gi, /An actor exploits/g, /hard gate/gi, /cap event/gi, /records for the period show this practice applied/gi, /self-reported and not independently verified/gi, /Agree the design with the/g];
const ID = /\b(?:D\d{1,2}-(?:Q\d{2}|[A-Z]-\d{2})|FS-D\d{1,2}-\d{2}|[A-Z]{1,2}\d{2}\b(?= ))/g;
const BAND = /\b(Reactive|Developing|Structured|Strategic)\b/g;

function measure(file) {
  const n = pages(file);
  let prose = 0, structured = 0, appendix = 0, mechanical = 0, ids = 0, bands = 0, emdash = 0, sentences = 0;
  for (let i = 1; i <= n; i++) {
    const t = pageText(file, i);
    const blocks = t.split(/\n\s*\n/).map((b) => b.replace(/\s+/g, ' ').trim()).filter(Boolean);
    const proseWords = blocks.filter((b) => b.split(' ').length >= 30 && /[.]$/.test(b) && (b.match(/[.!?](\s|$)/g) ?? []).length >= 2).reduce((s, b) => s + b.split(' ').length, 0);
    const lines = t.split('\n').map((l) => l.trim()).filter(Boolean);
    const short = lines.filter((l) => l.split(/\s+/).length <= 5).length;
    prose += proseWords;
    sentences += (t.match(/[a-z][.!?](\s|$)/g) ?? []).length;
    if (i > 1 && i < n && lines.length > 12 && short / lines.length > 0.55 && proseWords < 120) structured++;
    if (/^\s*(Appendix|APPENDIX)\b/m.test(t)) appendix++;
    for (const re of MECHANICAL) mechanical += (t.match(re) ?? []).length;
    ids += (t.match(ID) ?? []).length;
    bands += (t.match(BAND) ?? []).length;
    emdash += (t.match(/—/g) ?? []).length;
  }
  return { pages: n, fonts: fonts(file), proseWords: prose, structuredPages: structured, structuredShare: Number((structured / Math.max(1, n - 2)).toFixed(2)), appendixPages: appendix, mechanicalPhrases: mechanical, internalIdentifiers: ids, maturityBandMentions: bands, emDashes: emdash };
}

const docs = {
  'Previous live: Essential (V10 whole manuscript, Vhutshilo, Aug 2026)': path.join(X, 'baseline/live-essential-v10-vhutshilo.pdf'),
  'Previous live: Comprehensive (V3 preview, Motheo, Sep 2026)': path.join(X, 'baseline/live-comprehensive-v3-motheo.pdf')
};
for (const k of ['P3', 'P4', 'P5', 'P6b']) {
  docs[`Revised prototype 55ea176: ${k} Essential`] = `docs/readiness-review/report-revision/${k}/corrected-essential.pdf`;
  docs[`Revised prototype 55ea176: ${k} Comprehensive`] = `docs/readiness-review/report-revision/${k}/corrected-comprehensive.pdf`;
  docs[`Improved: ${k} Essential`] = path.join(X, k, 'essential.pdf');
  docs[`Improved: ${k} Comprehensive`] = path.join(X, k, 'comprehensive.pdf');
}
const out = {};
for (const [label, file] of Object.entries(docs)) { out[label] = measure(file); console.log(label, JSON.stringify(out[label])); }
fs.writeFileSync(path.join(X, 'comparison-indicators.json'), JSON.stringify({ method: 'Text indicators from pdftotext per page. Prose words: blocks of 30 or more words with two or more sentences. Structured page: more than 55% of lines of five words or fewer and under 120 prose words. Mechanical phrases: Bible 5.2 template constructions and the generic measures and activity lines MK rejected. Internal identifiers: question, scenario and register codes. Indicators, not a quality score.', documents: out }, null, 1) + '\n');
