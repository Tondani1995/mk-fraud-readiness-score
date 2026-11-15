// Answer-relationship model (relationship-review-0.2): semantic and mutation tests on MK's direction of 12 November
// (second direction), item 2. Fictional organisations only.
//   node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/revised-reports/relationship-semantics-tests.mjs
import fs from 'node:fs';
import { classifyRelation, validateRelationReview, RELATION_REVIEW, RELATIONSHIPS, UNRESOLVED } from '../../src/lib/reports/revised/relationships.ts';
import { buildRevisedReport } from '../../src/lib/reports/revised/evidence-model.ts';
import { buildStagedReportInput } from '../../src/lib/readiness-review/report-input.ts';
import { runJourney } from '../lib/build16-driver.mjs';
import coverage from '../../src/lib/readiness-review/data/coverage-map-v1.3.json' with { type: 'json' };
import bank from '../../src/lib/readiness-review/data/bank-v1.3.json' with { type: 'json' };

const results = [];
const T = async (id, name, fn) => {
  try { const [ok, detail] = await fn(); results.push({ id, ok, name, detail }); } catch (error) { results.push({ id, ok: false, name, detail: error.stack.split('\n').slice(0, 3).join(' ') }); }
};
const Q = new Map(bank.domains.flatMap((d) => d.bank.modules.flatMap((m) => m.questions.map((q) => [q.id, q]))));
const full = (id) => ({ id, class: 'full', answer: { value: '4' }, outstanding: false });
const ans = (id, cls, value = cls) => ({ id, class: cls, answer: { value }, outstanding: false });
const INABILITY = /\bcannot (operate|work|function)\b|\bfails?\b|\bdoes not operate\b|\bdisprove/i;

// The method's confirmation-and-practice pairs: for each scenario, each confirmation that is a practice question, against
// each supporting practice the coverage map lists for it.
const role = coverage.questionRole;
const PAIRS = coverage.scenarios.flatMap((s) => {
  // A scenario's confirmations: those its routes name, and any question the coverage map gives the confirming role.
  const conf = new Set([...s.confirm.map((c) => c[1]), ...Object.entries(role).filter(([, r]) => r.scenario === s.id && r.role === 'confirm').map(([id]) => id)].filter((id) => Q.get(id)?.type === 'practice'));
  // Its supporting practices: the follow-up and related questions the coverage map lists for it (826 pairs in all; the
  // report draws 802 of them, attaching a question listed under two scenarios to the one its question role names).
  const sup = [...new Set([...(s.followups ?? []), ...(s.related ?? [])])].filter((id) => Q.get(id)?.type === 'practice' && !conf.has(id));
  return [...conf].flatMap((c) => sup.map((p) => ({ scheme: s.id, c, p })));
});
const reviewed = new Map(RELATION_REVIEW.pairs.map((p) => [`${p.confirmation}>${p.practice}`, p]));

await T('RS-01', '"Not applicable" is outside scope and has no relationship; "no case has arisen" is the only untested practice; an outstanding answer is missing information whatever its class', async () => {
  const na = classifyRelation(full('D4-V-01'), ans('D4-R-01', 'na', 'na'));
  const ni = classifyRelation(full('D4-V-01'), ans('D4-R-01', 'noinstance', 'noinstance'));
  const out = classifyRelation(full('D4-V-01'), { id: 'D4-R-01', class: 'na', answer: { value: 'unknown' }, outstanding: true });
  const ok = na === null && ni?.type === 'untested-practice' && !/not applicable|outside scope/i.test(ni.statement) && out?.type === 'missing-information';
  return [ok, `na -> ${na === null ? 'no relationship' : na.type}; noinstance -> ${ni?.type}; outstanding -> ${out?.type}`];
});

await T('RS-02', 'A routing condition never establishes a dependency: every pair in which one question is asked only when the other is answered a certain way is not established unless it has been reviewed', async () => {
  const refs = (q) => { const w = q?.askWhen; if (!w) return []; return [w.q, ...(w.any ?? []).map((x) => x.q), ...(w.all ?? []).map((x) => x.q)].filter(Boolean); };
  const routed = PAIRS.filter(({ c, p }) => refs(Q.get(c)).includes(p) || refs(Q.get(p)).includes(c));
  const bad = routed.filter(({ c, p }) => !reviewed.has(`${c}>${p}`)).map(({ c, p }) => classifyRelation(full(c), ans(p, 'partial', 'partial'))).filter((r) => r.type !== 'not-established' || r.basis !== 'not-reviewed');
  const src = fs.readFileSync('src/lib/reports/revised/relationships.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  const ok = routed.length > 0 && !bad.length && !/askWhen|precluded|precludes|dependsBecause/.test(src);
  return [ok, `${routed.length} routed pairs in the method; ${bad.length} classified as anything but not established; the classifier reads no routing field`];
});

await T('RS-03', 'Every pair the method can produce is classified, and no unreviewed pair is assumed complementary or necessary: it is not established, asks nothing and concludes nothing', async () => {
  const bad = [];
  let unreviewed = 0;
  for (const { c, p } of PAIRS) {
    for (const cls of ['absent', 'partial', 'designed']) {
      const r = classifyRelation(full(c), ans(p, cls));
      if (!r) { bad.push(`${c}>${p} none`); continue; }
      if (!reviewed.has(`${c}>${p}`)) {
        if (cls === 'partial') unreviewed++;
        if (r.type !== 'not-established' || r.basis !== 'not-reviewed' || r.question || !/draws no conclusion/.test(r.statement)) bad.push(`${c}>${p} ${r.type}/${r.basis}`);
      }
      if (UNRESOLVED.includes(r.type) && r.basis !== 'reviewed-pair') bad.push(`${c}>${p} unresolved without review`);
    }
  }
  return [!bad.length, `${PAIRS.length} pairs in the method, ${PAIRS.length - unreviewed} reviewed, ${unreviewed} not established; ${bad.length ? bad.slice(0, 4).join('; ') : 'no assumed relationship'}`];
});

await T('RS-04', 'A necessary dependency requires reviewed semantics: without them the table is invalid and the pair is not established; with them it holds only for the answers named', async () => {
  const base = { version: 't', status: 't', rule: 't' };
  const noSem = { ...base, pairs: [{ scheme: 'FS-D4-05', confirmation: 'D4-V-01', practice: 'D4-R-01', type: 'necessary-dependency', rationale: 'test' }] };
  const withSem = { ...base, pairs: [{ ...noSem.pairs[0], dependency: { consumes: 'a recorded receipt for every goods invoice', absentWhen: ['absent'] } }] };
  const a = classifyRelation(full('D4-V-01'), ans('D4-R-01', 'absent', '0'), { review: noSem });
  const b = classifyRelation(full('D4-V-01'), ans('D4-R-01', 'absent', '0'), { review: withSem });
  const c = classifyRelation(full('D4-V-01'), ans('D4-R-01', 'partial', '3'), { review: withSem });
  const ok = validateRelationReview(noSem).length === 1 && validateRelationReview(withSem).length === 0
    && a.type === 'not-established' && a.basis === 'semantics-not-met' && b.type === 'necessary-dependency' && b.basis === 'reviewed-pair'
    && c.type === 'not-established' && c.basis === 'semantics-not-met';
  return [ok, `no semantics -> ${a.type} (${a.basis}); semantics and absent -> ${b.type}; semantics and partly in place -> ${c.type} (${c.basis})`];
});

await T('RS-05', 'A direct contradiction holds only for the answers it was reviewed for, and a reviewed wording written for one option is not applied to another', async () => {
  const dc = classifyRelation(full('D2-C-07'), ans('D2-I-09', 'absent', 'absent'));
  const dcPartial = classifyRelation(full('D2-C-07'), ans('D2-I-09', 'partial', 'partial'));
  const stockNone = classifyRelation(full('D8-K-02'), ans('D8-S-04', 'absent', 'none'));
  const stockSheets = classifyRelation(full('D8-K-02'), ans('D8-S-04', 'partial', 'sheets'));
  const ok = dc.type === 'direct-contradiction' && dcPartial.type === 'direct-contradiction' && stockNone.type === 'not-established' && !!stockNone.question
    && stockSheets.type === 'not-established' && stockSheets.basis === 'semantics-not-met' && !stockSheets.question;
  return [ok, `AI pair absent -> ${dc.type}, partly -> ${dcPartial.type}; stock not recorded -> ${stockNone.type} with a question; stock in spreadsheets -> ${stockSheets.type} (${stockSheets.basis})`];
});

await T('RS-06', 'The six pairs reassessed: the AI pair stays a direct contradiction; the investigations pair and the four former dependencies are reviewed questions, none claiming that a control cannot operate', async () => {
  const want = { 'D2-C-07>D2-I-09': 'direct-contradiction', 'D10-I-04>D10-S-02': 'not-established', 'D2-P-01>D2-R-01': 'not-established', 'D4-V-01>D4-R-01': 'not-established', 'D4-V-01>D4-R-03': 'not-established', 'D5-K-01>D5-H-01': 'not-established', 'D8-K-02>D8-S-04': 'not-established' };
  const bad = Object.entries(want).filter(([k, t]) => reviewed.get(k)?.type !== t).map(([k]) => k);
  const questions = Object.keys(want).filter((k) => want[k] === 'not-established').every((k) => reviewed.get(k)?.question?.endsWith('?'));
  const noInability = RELATION_REVIEW.pairs.filter((p) => p.type === 'not-established').every((p) => !INABILITY.test(p.statement ?? ''));
  const types = RELATION_REVIEW.pairs.reduce((m, p) => ({ ...m, [p.type]: (m[p.type] ?? 0) + 1 }), {});
  const ok = !bad.length && questions && noInability && validateRelationReview(RELATION_REVIEW).length === 0 && !types['necessary-dependency'] && RELATION_REVIEW.version === 'relationship-review-0.2';
  return [ok, `${bad.length ? `wrong: ${bad.join(', ')}` : 'all six as reassessed'}; table ${JSON.stringify(types)}; validation problems ${validateRelationReview(RELATION_REVIEW).length}`];
});

await T('RS-07', 'Mutation: removing a reviewed pair from the table turns its scenario neutral, never into a contradiction or a dependency', async () => {
  const j = runJourney('P6b');
  const staged = buildStagedReportInput(j.live);
  const r0 = buildRevisedReport(staged);
  const flagged = r0.schemes.filter((s) => ['contradiction', 'clarify'].includes(s.kind));
  // The mutation: the same review table without the contradiction and the questions.
  const table = { ...RELATION_REVIEW, pairs: RELATION_REVIEW.pairs.filter((p) => !['direct-contradiction', 'not-established'].includes(p.type)) };
  const r1 = flagged.map((s) => s.relations.filter((x) => ['direct-contradiction', 'not-established'].includes(x.type)).map((x) => {
    const p = r0.analysis.byId.get(x.practice);
    return classifyRelation(full(x.confirmation), { id: x.practice, class: p.class, answer: p.answer, outstanding: false }, { review: table });
  }));
  const all = r1.flat();
  const ok = flagged.length === 6 && all.length > 0 && all.every((x) => x.type === 'not-established' && x.basis === 'not-reviewed');
  return [ok, `${flagged.length} scenarios flagged in the overstated organisation; with their pairs unreviewed, ${all.length} relationships become ${[...new Set(all.map((x) => `${x.type}/${x.basis}`))].join(', ')}`];
});

await T('RS-08', 'Mutation: answering a supporting practice "not applicable" removes it from the scenario\'s relationships without making the scenario a gap or unresolved', async () => {
  const j = runJourney('P6b');
  const staged = buildStagedReportInput(j.live);
  const target = 'D2-I-09';
  const c = staged.domains.flatMap((d) => d.controls).find((x) => x.id === target);
  c.class = 'na';
  c.answer = { ...c.answer, value: 'na', label: 'Not applicable' };
  const r = buildRevisedReport(staged);
  const s = r.schemes.find((x) => x.relations.some((y) => y.practice === target) || x.id === 'FS-D2-02');
  const ok = !!s && !s.relations.some((y) => y.practice === target) && !['gap', 'contradiction', 'dependency'].includes(s.kind) && !r.relations.some((y) => y.type === 'untested-practice' && y.practice === target);
  return [ok, `AI scenario after the mutation: ${s?.kind}, ${s?.relations.length} relationships, none for the practice answered not applicable`];
});

await T('RS-09', 'The five relationships are preserved as distinct types, and only two of them count as unresolved inconsistencies', async () => {
  const ok = RELATIONSHIPS.join() === ['direct-contradiction', 'necessary-dependency', 'complementary-weakness', 'untested-practice', 'missing-information'].join() && UNRESOLVED.join() === 'direct-contradiction,necessary-dependency';
  return [ok, `${RELATIONSHIPS.join(', ')}; unresolved: ${UNRESOLVED.join(', ')}; neutral status: not-established`];
});

const pass = results.filter((r) => r.ok).length;
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.id} ${r.name}\n     ${r.detail}`);
console.log(`${pass} of ${results.length} pass`);
fs.mkdirSync('docs/readiness-review/report-revision', { recursive: true });
fs.writeFileSync('docs/readiness-review/report-revision/relationship-tests.json', JSON.stringify({ pairsInMethod: PAIRS.length, results }, null, 1) + '\n');
if (pass !== results.length) process.exitCode = 1;
