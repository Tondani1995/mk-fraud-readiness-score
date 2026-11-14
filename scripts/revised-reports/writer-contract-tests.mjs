// Writer contract (14 November 2026). The four hosted first drafts all failed: thin paragraphs (2,413 to 2,941 words),
// counts typed in headings, "recorded" overused, and in one case raw decision references and ranking language. These
// tests hold the prompt and brief to the validator they are written for. Exact bound fixtures with the hosted
// organisation names; no model call.
//   node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/revised-reports/writer-contract-tests.mjs
import fs from 'node:fs';
import { loadFixture } from './lib/b5-fixtures.mjs';
import { deterministicManuscript } from './lib/writer-double.mjs';
import { positionStatements } from '../../src/lib/reports/revised/position.ts';
import { buildRevisedFactPack } from '../../src/lib/reports/revised/manuscript/fact-pack.ts';
import { buildRevisedStoryPlan } from '../../src/lib/reports/revised/manuscript/story-plan.ts';
import { renderWriterBrief, sectionBudgets, LENGTH_TARGET } from '../../src/lib/reports/revised/manuscript/writer-brief.ts';
import { validateManuscript } from '../../src/lib/reports/revised/manuscript/manuscript.ts';
import { WRITER_SYSTEM } from '../../src/lib/reports/revised/live/produce.ts';
import { MECHANICAL_TERM_FAMILIES } from '../../src/lib/reports/narrative/mechanical-language.ts';

const results = [];
const T = async (id, name, fn) => { try { const [ok, detail] = await fn(); results.push({ id, ok, name, detail }); } catch (e) { results.push({ id, ok: false, name, detail: String(e?.stack ?? e).split('\n').slice(0, 3).join(' ') }); } };
const ORG = { kestrel: 'Kestrel Freight (Pty) Ltd (fictional)', marula: 'Marula Retail Holdings (Pty) Ltd (fictional)' };
const FX = { kestrel: loadFixture('kestrel'), marula: loadFixture('marula') };
const pack = (name, product) => {
  const x = FX[name];
  const position = positionStatements(x.report, { score: null }).map((p) => p.key === 'calculated' ? { ...p, label: 'Score', value: 'Not issued', text: 'No score is calculated. The revised scoring method has not been approved by MK, so this report issues no score, maturity level or band.' } : p);
  const fp = buildRevisedFactPack({ report: x.report, product, organisationName: ORG[name], assessmentReference: x.f.assessmentReference, generatedAt: '2026-11-14T00:00:00.000Z',
    profile: x.input.profile.map((p) => ({ id: p.id, label: p.label, value: p.value })), position, figure: { overall: null, areas: [], label: 'No score issued: the revised method is not approved by MK.' } });
  return { fp, plan: buildRevisedStoryPlan(fp) };
};
const CASES = [['kestrel', 'essential'], ['kestrel', 'comprehensive'], ['marula', 'essential'], ['marula', 'comprehensive']];

await T('WC-01', 'Every section budget lands the whole manuscript inside the product band, at 50 to 110 words a paragraph', async () => {
  const out = CASES.map(([n, p]) => { const b = sectionBudgets(...Object.values(pack(n, p))); return { c: `${n} ${p}`, total: b.total, wpp: b.wordsPerParagraph, ok: b.total >= LENGTH_TARGET[p].min && b.total <= LENGTH_TARGET[p].max && b.wordsPerParagraph >= 50 && b.wordsPerParagraph <= 110 }; });
  return [out.every((x) => x.ok), out.map((x) => `${x.c} ${x.total} (${x.wpp}/para)`).join('; ')];
});
await T('WC-02', 'The brief gives every planned section a Length line, and every unit section its exact unit-heading count', async () => {
  const out = CASES.map(([n, p]) => {
    const { fp, plan } = pack(n, p);
    const brief = renderWriterBrief(fp, plan);
    const blocks = brief.split(/\n(?=### )/);
    const missing = plan.sections.filter((s) => { const b = blocks.find((x) => x.startsWith(`### ${s.id}:`)) ?? ''; return !/- Length: \d+ paragraphs?, about \d+ words/.test(b) || ((s.units ?? []).length && !b.includes(`- Unit headings: exactly ${s.units.length} `)); });
    return { c: `${n} ${p}`, missing: missing.map((s) => s.id), length: /## Length\n/.test(brief) };
  });
  return [out.every((x) => !x.missing.length && x.length), JSON.stringify(out)];
});
await T('WC-03', 'Rule 13 states each counted word family below the validator allowance; "management should" is left to rule 11 (at most five)', async () => {
  const rule = WRITER_SYSTEM.split('\n').find((l) => l.startsWith('13.')) ?? '';
  const out = MECHANICAL_TERM_FAMILIES.filter((f) => f.family !== 'management should').map((f) => {
    const m = rule.match(new RegExp(`"${f.family}" at most (once|\\d+ times) in the whole manuscript`));
    const n = m ? (m[1] === 'once' ? 1 : Number(m[1].split(' ')[0])) : null;
    return { family: f.family, stated: n, allowance: f.perReportAllowance, ok: n !== null && n < f.perReportAllowance || (n === 1 && f.perReportAllowance <= 1) };
  });
  const r11 = /"management should" at most five times/.test(WRITER_SYSTEM) && MECHANICAL_TERM_FAMILIES.find((f) => f.family === 'management should').perReportAllowance >= 5;
  return [out.every((x) => x.ok) && r11, out.map((x) => `${x.family} ${x.stated}/${x.allowance}`).join('; ')];
});
await T('WC-04', 'The heading examples agree with the validator: the "never" headings are rejected as typed counts, the suggested ones pass', async () => {
  const { fp, plan } = pack('marula', 'essential');
  const md = deterministicManuscript(fp, plan);
  const firstUnitHeading = md.split('\n').find((l) => l.startsWith('## '));
  const withHeading = (h) => validateManuscript(md.replace(firstUnitHeading, `## ${h}`), fp, plan).issues.filter((i) => i.code === 'TYPED-COUNT').length;
  const bad = ['Seven findings require management attention', 'Two management-level patterns shape the position', 'Readiness across ten assessed areas'];
  const good = ['The findings this report develops', 'Patterns across the assessment', 'Readiness across the assessed areas'];
  const b = bad.map(withHeading), g = good.map(withHeading);
  const prose = validateManuscript(md.replace(/^(?!#|<!--|\[\[exhibit)(.+\.)$/m, '$1 Two related questions remain open.'), fp, plan).issues.some((i) => i.code === 'TYPED-COUNT');
  return [b.every((x) => x > 0) && g.every((x) => x === 0) && prose, `bad ${b.join(',')}; good ${g.join(',')}; "two related questions" rejected: ${prose}`];
});
await T('WC-05', 'Rule 9 lists the ranking phrase a hosted draft used ("matter most"), and every phrase it lists is one the validator rejects', async () => {
  const rule = WRITER_SYSTEM.split('\n').find((l) => l.startsWith('9.')) ?? '';
  const phrases = [...rule.matchAll(/"([^"]+)"/g)].map((m) => m[1]).filter((x) => x !== 'the controls this report sets out first');
  const { fp, plan } = pack('marula', 'essential');
  const md = deterministicManuscript(fp, plan);
  const rejected = phrases.filter((ph) => validateManuscript(md.replace(/^(?!#|<!--|\[\[exhibit)(.+\.)$/m, `$1 This is where it ${ph}.`), fp, plan).issues.some((i) => i.code === 'RANKING'));
  return [phrases.includes('matter most') && rejected.length === phrases.length, `${rejected.length} of ${phrases.length} listed phrases rejected by the validator`];
});
await T('WC-06', 'The whole-manuscript self-check does not override the line-repair format; the brief warns against copying "recorded"', async () => {
  const { fp, plan } = pack('kestrel', 'comprehensive');
  const brief = renderWriterBrief(fp, plan);
  const ok = /WHEN YOU WRITE OR REWRITE A WHOLE MANUSCRIPT/.test(WRITER_SYSTEM) && /When the task asks for corrected lines only, return exactly the format that task sets/.test(WRITER_SYSTEM)
    && !/^Return only the manuscript\.$/m.test(WRITER_SYSTEM) && /Do not carry it into the prose/.test(brief) && /Headings never contain a count/.test(brief);
  return [ok, `system prompt ${WRITER_SYSTEM.length} chars`];
});
await T('WC-07', 'The deterministic manuscript still passes the validator on all four cases (contract change only; validation unchanged)', async () => {
  const out = CASES.map(([n, p]) => { const { fp, plan } = pack(n, p); const v = validateManuscript(deterministicManuscript(fp, plan), fp, plan); return `${n} ${p}: ${v.pass ? 'pass' : v.issues.filter((i) => i.blocking).map((i) => i.code).join(',')}`; });
  return [out.every((x) => x.endsWith('pass')), out.join('; ')];
});

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.id} ${r.name}\n     ${r.detail}`);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} of ${results.length} passed`);
fs.mkdirSync('qa-output/corrective', { recursive: true });
fs.writeFileSync('qa-output/corrective/writer-contract.json', JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
