// The MK Fraud Readiness score and the agreed conclusion (owner decision DR-02, 14 November 2026). Exact bound fixtures,
// synthetic accounts for the exclusion rules, the real validator, composer and workbook; no model call.
//   node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/revised-reports/score-tests.mjs
import fs from 'node:fs';
import { loadFixture, fixturePack } from './lib/b5-fixtures.mjs';
import { deterministicManuscript } from './lib/writer-double.mjs';
import { revisedScore, scoreConclusion, scoredPosition, SCORE_CREDIT } from '../../src/lib/reports/revised/score.ts';
import { validateManuscript } from '../../src/lib/reports/revised/manuscript/manuscript.ts';
import { composeRevisedReportHtml } from '../../src/lib/reports/revised/manuscript/compose.ts';
import { bibleWorkbookSheets } from '../../src/lib/reports/revised/manuscript/workbook-bible.ts';
import { applyLineRepair, REVISED_OPERATOR_GUIDANCE } from '../../src/lib/reports/revised/live/produce.ts';
import { revisedGenerationNote } from '../../src/lib/reports/revised/live/manual-generation.ts';
import { RESTRICTED_TEST_LABEL, RESTRICTED_TEST_REPORT_LABEL } from '../../src/lib/readiness-review/commercial-environment.ts';

const results = [];
const T = async (id, name, fn) => { try { const [ok, detail] = await fn(); results.push({ id, ok, name, detail }); } catch (e) { results.push({ id, ok: false, name, detail: String(e?.stack ?? e).split('\n').slice(0, 3).join(' ') }); } };
const plain = (html) => html.replace(/<[^>]+>/g, ' ').replace(/[‘’]/g, "'").replace(/&#x27;|&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ');
const K = loadFixture('kestrel');
const M = loadFixture('marula');
const KORG = K.f.record.organisationLabel;

/** A synthetic report: only what revisedScore and the scenario account read. */
const synthetic = (byKind, { applicabilityPending = 0, notReached = 0, outstandingQuestions = 0 } = {}) => {
  const kinds = { confirmed: 0, qualified: 0, clarify: 0, contradiction: 0, dependency: 0, gap: 0, outstanding: 0, 'not-expected': 0, none: 0, ...byKind };
  kinds.none = (kinds.none ?? 0) + applicabilityPending + notReached;
  const inPicture = Object.values(kinds).reduce((n, v) => n + v, 0);
  return { schemes: Array.from({ length: inPicture }), outstanding: Array.from({ length: outstandingQuestions }), position: {}, summary: { byKind: kinds, applicabilityPending, notReached, inPicture } };
};

await T('SC-01', 'Kestrel scores 4% (2 of 57 counted scenarios in place; 12 not yet counted) and Marula 94% (84.25 of 90)', async () => {
  const k = revisedScore(K.report), m = revisedScore(M.report);
  const ok = k.percent === 4 && k.counted === 57 && k.notCounted === 12 && k.applicable === 69 && k.outstandingQuestions === 16 && k.credit === 2
    && m.percent === 94 && m.counted === 90 && m.notCounted === 0 && m.credit === 84.25 && m.byKind.qualified === 15 && m.byKind.contradiction + m.byKind.clarify + m.byKind.dependency === 4;
  return [ok, `Kestrel ${k.percent}% (${k.credit}/${k.counted}, ${k.notCounted} not counted); Marula ${m.percent}% (${m.credit}/${m.counted})`];
});
await T('SC-02', 'Credit is exactly DR-02: in place 1, weaker related practice 0.75, contradicted (raise a question or cannot both be right) 0.5, gap 0', async () => {
  const ok = SCORE_CREDIT.confirmed === 1 && SCORE_CREDIT.qualified === 0.75 && SCORE_CREDIT.contradiction === 0.5 && SCORE_CREDIT.dependency === 0.5 && SCORE_CREDIT.clarify === 0.5 && SCORE_CREDIT.gap === 0;
  const s = revisedScore(synthetic({ confirmed: 1, qualified: 1, contradiction: 1, gap: 1 }));
  return [ok && s.percent === 56 && s.exact === 56.25, `(1 + 0.75 + 0.5 + 0) / 4 = ${s.exact}% -> ${s.percent}%`];
});
await T('SC-03', 'Not counted: outstanding core answers, scenarios not reached, applicability pending and not expected at the size', async () => {
  const s = revisedScore(synthetic({ confirmed: 3, gap: 1, outstanding: 5, 'not-expected': 7 }, { applicabilityPending: 2, notReached: 4, outstandingQuestions: 9 }));
  return [s.counted === 4 && s.percent === 75 && s.notCounted === 9 && s.applicable === 4 + 5 + 4, `counted ${s.counted}, applicable ${s.applicable}, not counted ${s.notCounted}, ${s.percent}%`];
});
await T('SC-04', 'No countable scenario: no score, and the pipeline refuses before any AI call (409, do not retry)', async () => {
  const s = revisedScore(synthetic({ outstanding: 3 }, { outstandingQuestions: 3 }));
  return [s === null && /no score can be stated/.test(REVISED_OPERATOR_GUIDANCE.score_not_computable) && /No AI call was made/.test(REVISED_OPERATOR_GUIDANCE.score_not_computable), String(s)];
});
await T('SC-05', 'The conclusion is the agreed wording exactly; the outstanding sentence appears only when scenarios are held back', async () => {
  const k = scoreConclusion(KORG, revisedScore(K.report));
  const agreed = `On its own answers, ${KORG} scores 4% under the MK Fraud Readiness method, across the 69 fraud scenarios that apply to it. The score shows how far the core controls the organisation reports in place cover those scenarios. It is not a finding that the organisation is protected against fraud, and it does not confirm that any control operates as described, because nothing in this assessment was tested. The responses this report sets out first are where the score can move most directly.`;
  const m = scoreConclusion('Marula', revisedScore(M.report));
  const one = scoreConclusion('X', revisedScore(synthetic({ confirmed: 1, outstanding: 1 }, { outstandingQuestions: 1 })));
  const reached = scoreConclusion('X', revisedScore(synthetic({ confirmed: 1 }, { notReached: 2 })));
  const ok = k.heading === `Where ${KORG} stands and what to address next` && k.paragraph === agreed
    && k.outstanding === '16 questions were not answered, so 12 scenarios are not yet counted; the score may change once they are settled.'
    && m.outstanding === null && one.outstanding === '1 question was not answered, so 1 scenario is not yet counted; the score may change once they are settled.'
    && reached.outstanding === '2 scenarios were not reached in the interview, so they are not yet counted; the score may change once they are answered.';
  return [ok, k.outstanding];
});
await T('SC-06', 'The composed report: agreed conclusion heading in the section and on the contents page; conclusion opens with the agreed paragraph; panel shows the score and "No readiness label"', async () => {
  const { fp, plan } = fixturePack(K, 'essential');
  const html = composeRevisedReportHtml({ md: deterministicManuscript(fp, plan), fp, plan, dateLabel: '14 November 2026', prototype: true, restrictedNotice: RESTRICTED_TEST_REPORT_LABEL }).html;
  const t = plain(html);
  const heading = `Where ${KORG} stands and what to address next`;
  const conclusion = t.slice(t.lastIndexOf(heading));
  const ok = (t.match(new RegExp(heading.replace(/[()]/g, '\\$&'), 'g')) ?? []).length >= 2
    && conclusion.includes(fp.facts['T-CONCLUSION'].value.slice(0, 120)) && conclusion.includes('16 questions were not answered, so 12 scenarios are not yet counted')
    && /Score 4%/.test(t) && /No readiness label/.test(t) && /no readiness label is issued/.test(t)
    && !/no score is issued|Not issued|no readiness score is issued/i.test(t);
  return [ok, conclusion.slice(0, 160)];
});
await T('SC-07', 'Validator: a conclusion without the agreed wording is blocked at its first paragraph and the line repair fixes it; the outstanding sentence is required when it exists', async () => {
  const { fp, plan } = fixturePack(K, 'essential');
  const md = deterministicManuscript(fp, plan);
  const pass = validateManuscript(md, fp, plan);
  const without = md.replace('[[T-CONCLUSION]] [[T-CONCLUSION-OUTSTANDING]]\n<!-- refs: T-CONCLUSION, T-CONCLUSION-OUTSTANDING, N-SCORE -->\n', '');
  const v = validateManuscript(without, fp, plan);
  const issues = v.issues.filter((i) => i.code === 'CONCLUSION-MISSING');
  const line = issues[0]?.line;
  const row = without.split('\n')[line - 1];
  const fixed = applyLineRepair(without, [line], JSON.stringify([{ line, text: `[[T-CONCLUSION]] [[T-CONCLUSION-OUTSTANDING]] ${row}` }]));
  const after = validateManuscript(fixed, fp, plan);
  const noOutstanding = validateManuscript(md.replace('[[T-CONCLUSION]] [[T-CONCLUSION-OUTSTANDING]]', '[[T-CONCLUSION]]'), fp, plan).issues.filter((i) => i.code === 'CONCLUSION-MISSING');
  const ok = pass.pass && issues.length === 2 && issues.every((i) => i.blocking && /CONCLUSION$/.test(i.section)) && !row.startsWith('#') && after.pass && noOutstanding.length === 1;
  return [ok, `with: ${pass.pass}; without: ${issues.length} issue(s) at line ${line}; after line repair: ${after.pass}; outstanding missing: ${noOutstanding.length}`];
});
await T('SC-08', 'Validator: calling the organisation ready, or readiness achieved, is blocked; ordinary uses of "ready" are not', async () => {
  const { fp, plan } = fixturePack(M, 'essential');
  const md = deterministicManuscript(fp, plan);
  const withLine = (sentence) => validateManuscript(md.replace(/^(?!#|<!--|\[\[)(.+\.)$/m, `$1 ${sentence}`), fp, plan).issues.filter((i) => i.code === 'READY').length;
  const bad = ['The organisation is ready to withstand fraud.', 'The organisation is now fully ready.', 'Fraud readiness has been achieved.', "The company's controls mean the company is fraud-ready."];
  const good = ['The finance team is ready to act on the first stage.', 'Readiness depends on the responses set out first.', 'The organisation is preparing its records.'];
  const b = bad.map(withLine), g = good.map(withLine);
  return [b.slice(0, 3).every((x) => x > 0) && g.every((x) => x === 0), `bad ${b.join(',')}; good ${g.join(',')}`];
});
await T('SC-09', 'Older unscored packs keep their wording: no conclusion requirement, and the panel still says the score is not issued', async () => {
  const { fp, plan } = fixturePack(K, 'essential', { scored: false });
  const md = deterministicManuscript(fp, plan);
  const v = validateManuscript(md, fp, plan);
  const t = plain(composeRevisedReportHtml({ md, fp, plan, dateLabel: '14 November 2026', prototype: true }).html);
  return [v.pass && !v.issues.some((i) => i.code === 'CONCLUSION-MISSING') && /Not issued/.test(t) && !fp.facts['N-SCORE'] && fp.pending.some((p) => p.ref === 'PENDING-CONCLUSION'), `validator ${v.pass}`];
});
await T('SC-10', 'Workbook Read me carries the score and the readiness-conclusion statement; no workbook row says no score is issued', async () => {
  const { fp } = fixturePack(M, 'comprehensive');
  const sheets = bibleWorkbookSheets('comprehensive', M.report, fp, { notice: 'RESTRICTED TEST.' });
  const readMe = sheets.find((s) => s.name === 'Read me').rows;
  const score = readMe.find((r) => r.field === 'Score');
  const concl = readMe.find((r) => r.field === 'Readiness conclusion');
  return [score?.value === '94%' && concl?.value === 'No readiness label' && !JSON.stringify(readMe).match(/no score is issued|Not issued/i), `${score?.field}: ${score?.value}; ${concl?.field}: ${concl?.value}`];
});
await T('SC-11', 'Operator note states the score and that no readiness label is issued; the Snapshot label is unchanged and the report label drops "no readiness score"', async () => {
  const note = revisedGenerationNote({ models: { writer: 'w', repair: 'r' }, calls: 1, repairUsed: false, resumedFrom: null }, { binding: { engineBuild: '1.6', outstandingTotal: 20 } }, 4);
  const ok = /MK Fraud Readiness score 4%, no readiness label/.test(note) && !/no score issued/.test(note)
    && /no readiness score is issued/.test(RESTRICTED_TEST_LABEL) && !/score/i.test(RESTRICTED_TEST_REPORT_LABEL) && /Not for customer release/.test(RESTRICTED_TEST_REPORT_LABEL);
  return [ok, note.slice(note.indexOf('method'), note.indexOf('method') + 120)];
});
await T('SC-12', 'Scored position statements: the score replaces the fixture result; inconsistencies and interpretation are unchanged', async () => {
  const s = revisedScore(K.report);
  const base = [{ key: 'calculated', label: 'x', value: 'x', text: 'x' }, { key: 'inconsistencies', label: 'i', value: 'i', text: 'i' }, { key: 'interpretation', label: 'p', value: 'p', text: 'p' }, { key: 'conclusion', label: 'c', value: 'c', text: 'c' }];
  const out = scoredPosition(base, s);
  return [out[0].value === '4%' && out[0].label === 'Score' && /12 further scenarios are not yet counted/.test(out[0].text) && out[1] === base[1] && out[2] === base[2] && out[3].value === 'No readiness label', out[0].text.slice(0, 120)];
});

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.id} ${r.name}\n     ${r.detail}`);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} of ${results.length} passed`);
fs.mkdirSync('qa-output/corrective', { recursive: true });
fs.writeFileSync('qa-output/corrective/score.json', JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
