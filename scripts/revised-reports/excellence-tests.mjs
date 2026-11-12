// Objective gates for the report-excellence outputs (Reporting Bible v1.1 sections 5, 9.1, 12.2, 15, 19.5, 20, 21 and
// 21.1), run on the saved artefacts of the four fictional organisations. Objective gates prove correctness; they do not
// prove commercial excellence (Bible 21), which the 34-dimension owner review assesses separately.
//   node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/revised-reports/excellence-tests.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { unzipSync, strFromU8 } from 'fflate';
import { validateManuscript, parseManuscript } from '../../src/lib/reports/revised/manuscript/manuscript.ts';
import { ESSENTIAL_SHEETS, COMPREHENSIVE_SHEETS } from '../../src/lib/reports/revised/manuscript/workbook-bible.ts';

const DIR = 'docs/readiness-review/report-excellence';
const ORGS = ['P3', 'P4', 'P5', 'P6b'];
const results = [];
const check = (id, name, fn) => { try { const detail = fn(); results.push({ id, name, pass: true, detail: detail ?? null }); console.log(`  ok   ${id} ${name}`); } catch (e) { results.push({ id, name, pass: false, detail: e.message }); console.log(`  FAIL ${id} ${name}\n       ${e.message}`); } };
const assert = (c, m) => { if (!c) throw new Error(m); };
const norm = (s) => s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/­/g, '').replace(/-\s*\n\s*/g, '-').replace(/\s+/g, ' ').trim().toLowerCase();
const pdfText = (f) => execFileSync('pdftotext', ['-layout', f, '-']).toString();
const pages = (f) => Number(execFileSync('pdfinfo', [f]).toString().match(/Pages:\s+(\d+)/)[1]);
const fonts = (f) => [...new Set(execFileSync('pdffonts', [f]).toString().split('\n').slice(2).map((l) => l.split(/\s+/)[0]).filter(Boolean).map((x) => x.replace(/^[A-Z]{6}\+/, '')))];
const load = (k, p) => {
  const d = path.join(DIR, k);
  return { md: fs.readFileSync(path.join(d, `${p}-manuscript.md`), 'utf8'), txt: fs.readFileSync(path.join(d, `${p}-manuscript.txt`), 'utf8'), fp: JSON.parse(fs.readFileSync(path.join(d, `${p}-fact-pack.json`), 'utf8')), plan: JSON.parse(fs.readFileSync(path.join(d, `${p}-story-plan.json`), 'utf8')), pdf: path.join(d, `${p}.pdf`), xlsx: path.join(d, `${p}-workbook.xlsx`), manifest: JSON.parse(fs.readFileSync(path.join(d, `${p}-manifest.json`), 'utf8')) };
};
const model = (k) => JSON.parse(fs.readFileSync(path.join('docs/readiness-review/report-revision', k, 'model.json'), 'utf8')).report;
const xlsx = (f) => {
  const z = unzipSync(new Uint8Array(fs.readFileSync(f)));
  const wb = strFromU8(z['xl/workbook.xml']);
  const names = [...wb.matchAll(/<sheet [^>]*name="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, '&'));
  const shared = z['xl/sharedStrings.xml'] ? [...strFromU8(z['xl/sharedStrings.xml']).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => m[1].replace(/<[^>]+>/g, '')) : [];
  const sheets = names.map((n, i) => { const x = strFromU8(z[`xl/worksheets/sheet${i + 1}.xml`]); return { name: n, rows: (x.match(/<row /g) ?? []).length, frozen: /<pane [^>]*state="frozen"/.test(x), filter: /<autoFilter /.test(x), xml: x }; });
  return { names, sheets, shared };
};
const ID_LEAK = /\b(?:D\d{1,2}-[A-Z]-\d{2}|FS-D\d{1,2}-\d{2}|OBJ-X-\d{2}|BLUEPRINT-\d|PRIORITY-\d|FINDING-\d|PATHWAY-\d|THEME-[A-Z]|STAGE-\d|DECISION-\d)\b|\[\[|\]\]|<!--/;
const BAND = /\b(Reactive|Developing|Structured|Strategic)\b/;
const RESEARCH = /research simulation|draft method|draft advisory|awaiting approval|has not (yet )?approved/i;
const BANNED = /\b(the model identified|the engine selected|generated interpretation|evidence-linked|evidence-based|hard gate|cap event|aggregate maturity|the named record|self-reported and not independently verified)\b/i;

for (const k of ORGS) {
  console.log(k);
  const m = model(k);
  for (const p of ['essential', 'comprehensive']) {
    const a = load(k, p);
    const tag = `${k}/${p}`;
    const text = pdfText(a.pdf);
    const n = pages(a.pdf);
    check(`G01 ${tag}`, 'manuscript passes factual and editorial validation', () => { const v = validateManuscript(a.md, a.fp, a.plan); assert(v.pass, v.issues.filter((i) => i.blocking).map((i) => `${i.code} ${i.detail ?? ''}`).join('; ')); return { words: v.stats.words, paragraphs: v.stats.paragraphs, refsPerParagraph: v.stats.refsPerParagraph, mechanical: v.stats.mechanical }; });
    check(`G02 ${tag}`, 'every narrative paragraph carries provenance references', () => { const parsed = parseManuscript(a.md); const bare = parsed.sections.flatMap((s) => s.blocks.filter((b) => b.type === 'p' && !b.refs.length).map((b) => `${s.id}:${b.line}`)); assert(!bare.length, `paragraphs without refs: ${bare.join(', ')}`); });
    check(`G03 ${tag}`, 'plain-text manuscript exists and every manuscript paragraph appears in the PDF', () => {
      assert(a.txt.trim().length > 2000, 'plain-text manuscript missing or short');
      const pdf = norm(text);
      const paras = a.txt.split(/\n\s*\n/).map((x) => x.trim()).filter((x) => x.length > 80 && !/^#/.test(x));
      const missing = paras.filter((x) => !pdf.includes(norm(x).slice(0, 70)));
      assert(!missing.length, `${missing.length} manuscript paragraphs not found in the PDF, e.g. "${missing[0]?.slice(0, 80)}"`);
      return { paragraphs: paras.length };
    });
    check(`G04 ${tag}`, 'page count within the Bible range, no appendix', () => {
      const [lo, hi] = p === 'essential' ? [16, 24] : [26, 36];
      assert(n >= lo && n <= hi, `${n} pages outside ${lo} to ${hi}`);
      assert(!/\bappendix\b/i.test(text), 'appendix present');
      return { pages: n, defaultRange: p === 'essential' ? '18-22' : '28-34' };
    });
    check(`G05 ${tag}`, 'Poppins is the only typeface, embedded', () => { const f = fonts(a.pdf); assert(f.length && f.every((x) => /^Poppins-/.test(x)), `fonts: ${f.join(', ')}`); return f; });
    check(`G06 ${tag}`, 'no em dash, internal identifier, maturity band or research-stage wording in the PDF', () => {
      assert(!/—/.test(text) && !/—/.test(a.md), 'em dash present');
      const leak = text.match(ID_LEAK); assert(!leak, `internal identifier: ${leak?.[0]}`);
      const band = text.match(BAND); assert(!band, `band word: ${band?.[0]}`);
      const research = (a.txt.match(RESEARCH) ?? text.match(RESEARCH)); assert(!research, `research-stage wording: ${research?.[0]}`);
      const banned = text.match(BANNED); assert(!banned, `prohibited language: ${banned?.[0]}`);
    });
    check(`G07 ${tag}`, 'test fixture labelled, prototype notice and fictional footer present', () => {
      assert(/test fixture/i.test(text), 'fixture label missing');
      assert(/prototype notice/i.test(text), 'prototype notice missing');
      assert((text.match(/Fictional prototype for MK review/g) ?? []).length >= n - 3, 'fictional footer missing on body pages');
    });
    check(`G08 ${tag}`, 'workbook has the Bible sheets, frozen headers, filters and no formula cells', () => {
      const w = xlsx(a.xlsx);
      const want = p === 'essential' ? ESSENTIAL_SHEETS : COMPREHENSIVE_SHEETS;
      assert(JSON.stringify(w.names) === JSON.stringify([...want]), `sheets ${w.names.join(', ')}`);
      for (const s of w.sheets) { assert(s.frozen, `${s.name} not frozen`); if (!['Read me', 'Summary'].includes(s.name)) assert(s.filter, `${s.name} has no filter`); }
      const formula = w.sheets.find((s) => /<f>/.test(s.xml)); assert(!formula, `formula in ${formula?.name}`);
      const risky = w.shared.filter((x) => /^[=+\-@]/.test(x)); assert(!risky.length, `formula-like text: ${risky[0]}`);
      return w.sheets.map((s) => `${s.name} ${s.rows - 1}`);
    });
    check(`G09 ${tag}`, 'registers reconcile: workbook rows equal the analytical model', () => {
      const w = xlsx(a.xlsx);
      const rows = Object.fromEntries(w.sheets.map((s) => [s.name, s.rows - 1]));
      const f = p === 'essential' ? 'Findings' : 'Material Findings', r = p === 'essential' ? 'Risks' : 'Risk Register', c = p === 'essential' ? 'Control Improvements' : 'Control Blueprints';
      assert(rows[f] === m.findings.length, `${f} ${rows[f]} vs model ${m.findings.length}`);
      assert(rows[r] === m.risks.length, `${r} ${rows[r]} vs model ${m.risks.length}`);
      assert(rows[c] === m.controls.length, `${c} ${rows[c]} vs model ${m.controls.length}`);
      if (p === 'essential') { assert(rows['Control Actions'] === m.actions.length, 'actions'); assert(rows['Proof of Progress'] === m.records.length, 'records'); }
      const trace = m.schemes.reduce((s, x) => s + x.confirmations.length + (x.supportingGaps ?? []).length, 0);
      const t = p === 'essential' ? 'Question Trace' : 'Question Traceability';
      assert(rows[t] === trace, `${t} ${rows[t]} vs ${trace}`);
    });
    check(`G10 ${tag}`, 'cross-artefact consistency: fact pack counts, PDF position statements and workbook agree', () => {
      const w = xlsx(a.xlsx);
      const applies = a.fp.facts['N-APPLY'];
      assert(applies && Number(applies.value) === m.schemes.length, `N-APPLY ${applies?.value} vs ${m.schemes.length}`);
      const pdf = norm(text);
      for (const ps of a.fp.position) { const v = norm(ps.value.replace(/,\s*test fixture$/i, '')); assert(pdf.includes(v), `position "${ps.value}" not in PDF`); assert(w.shared.some((x) => norm(x).includes(v)), `position "${ps.value}" not in workbook`); }
      const discussed = w.shared.filter((x) => x === 'Discussed in the report').length;
      assert(discussed >= 1, 'workbook does not flag the discussed findings');
      return { scenarios: m.schemes.length, findingsDiscussed: a.fp.findings.length };
    });
    check(`G11 ${tag}`, 'manifest records Bible version, source commit, versions and hashes', () => {
      const x = a.manifest; assert(x.bibleVersion === '1.1' && /^[0-9a-f]{40}$/.test(x.sourceCommit) && x.hashes.pdf && x.hashes.manuscript && x.hashes.factPack && x.hashes.workbook, 'manifest incomplete');
      assert(/blocked acceptance test/i.test(x.writer.productionAiRoute), 'AI route status not recorded');
    });
  }
  check(`G12 ${k}`, 'tier differentiation: Comprehensive adds blueprints, operating model, decisions, programme and scorecard; Essential does not', () => {
    const e = norm(pdfText(load(k, 'essential').pdf)), c = norm(pdfText(load(k, 'comprehensive').pdf));
    for (const s of ['target fraud-control environment', 'target fraud-risk operating model', 'leadership decision', 'twelve-month', 'management fraud-readiness scorecard']) { assert(c.includes(s), `Comprehensive lacks ${s}`); assert(!e.includes(s), `Essential contains ${s}`); }
    const ess = load(k, 'essential').txt, comp = load(k, 'comprehensive').txt;
    const ep = new Set(ess.split(/\n\s*\n/).map((x) => norm(x)).filter((x) => x.length > 120));
    const dup = comp.split(/\n\s*\n/).map((x) => norm(x)).filter((x) => ep.has(x));
    assert(!dup.length, `${dup.length} paragraphs copied verbatim from the Essential`);
  });
}
const status = fs.existsSync(path.join(DIR, 'ai-run-status.json')) ? JSON.parse(fs.readFileSync(path.join(DIR, 'ai-run-status.json'), 'utf8')) : null;
results.push({ id: 'AT-AI-01', name: 'production AI manuscript run', pass: status?.status === 'PASS', blocked: status?.status === 'BLOCKED', detail: status?.reason ?? status?.status ?? 'not run' });
console.log(`  ${status?.status ?? 'NOT RUN'} AT-AI-01 production AI manuscript run (acceptance test, reported separately)`);
const passed = results.filter((r) => r.pass).length, gates = results.filter((r) => r.id !== 'AT-AI-01');
fs.writeFileSync(path.join(DIR, 'excellence-tests.json'), JSON.stringify({ gates: gates.length, passed: gates.filter((r) => r.pass).length, acceptance: results.find((r) => r.id === 'AT-AI-01'), results }, null, 1) + '\n');
console.log(`${gates.filter((r) => r.pass).length} of ${gates.length} objective gates pass; AT-AI-01 ${status?.status ?? 'not run'}`);
process.exit(gates.every((r) => r.pass) ? 0 : 1);
