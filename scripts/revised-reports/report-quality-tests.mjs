// Reporting-quality correction (MK direction of 12 November 2026): contradiction classification, no unapproved
// ratings, answer-type integrity, traceable recommendations, the R-1, R-2 and R-3 prototype conventions, and the
// integrity of the corrected Essential and Comprehensive outputs. Fictional organisations only.
//   node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/revised-reports/report-quality-tests.mjs
import fs from 'node:fs';
import { buildCorrected, textOf } from './pipeline.mjs';
import { runJourney } from '../lib/build16-driver.mjs';
import { REVISED_RAW_ID } from '../../src/lib/reports/revised/evidence-model.ts';
import { classifyRelation, RELATION_REVIEW } from '../../src/lib/reports/revised/relationships.ts';
import { allBankQuestionIds, bankQuestion, reportedText, standardText, contentGaps } from '../../src/lib/reports/revised/answer-text.ts';
import { evaluateInformationSufficiency } from '../../src/lib/reports/revised/information-sufficiency.ts';

const results = [];
const T = async (id, name, fn) => {
  try { const [ok, detail] = await fn(); results.push({ id, ok, name, detail }); } catch (error) { results.push({ id, ok: false, name, detail: error.stack.split('\n').slice(0, 3).join(' ') }); }
};
const ORGS = ['P3', 'P4', 'P5', 'P6b'];
const built = {};
for (const k of ORGS) built[k] = await buildCorrected(k);
const prev = (k) => JSON.parse(fs.readFileSync(`docs/readiness-review/report-comparison/${k}/artefacts.json`, 'utf8'));

await T('RQ-01', 'The 21 schemes the first prototype flagged as false comfort for the overstated organisation are recalculated: only reviewed contradictions and method-established dependencies stay unresolved', async () => {
  const before = prev('P6b').after.analysis.scenarios.filter((s) => s.kind === 'false-comfort').map((s) => s.id).sort();
  const r = built.P6b.report;
  const kinds = Object.fromEntries(before.map((id) => [id, r.schemes.find((s) => s.id === id)?.kind]));
  const unresolved = before.filter((id) => ['contradiction', 'dependency'].includes(kinds[id]));
  const basisOk = r.schemes.filter((s) => ['contradiction', 'dependency'].includes(s.kind)).every((s) => s.relations.some((x) => ['direct-contradiction', 'necessary-dependency'].includes(x.type) && x.basis !== 'default'));
  const counts = Object.values(kinds).reduce((m, k) => ({ ...m, [k]: (m[k] ?? 0) + 1 }), {});
  const ok = before.length === 21 && counts.contradiction === 2 && counts.dependency === 4 && counts.qualified === 15 && basisOk
    && unresolved.join() === ['FS-D10-05', 'FS-D2-02', 'FS-D2-05', 'FS-D4-05', 'FS-D5-12', 'FS-D8-02'].join();
  return [ok, `${before.length} flagged before; now ${JSON.stringify(counts)}; unresolved ${unresolved.join(', ')}`];
});

await T('RQ-02', 'Five relationship types: missing information and untested practices are decided by the answer, reviewed pairs by the table, method structure by askWhen, and the default never disproves a confirmation', async () => {
  const full = { id: 'D4-V-01', class: 'full', answer: { value: '4' }, outstanding: false };
  const mi = classifyRelation(full, { id: 'D4-R-01', class: null, answer: { value: 'unknown' }, outstanding: true });
  const ut = classifyRelation(full, { id: 'D4-R-01', class: 'noinstance', answer: { value: 'noinstance' }, outstanding: false });
  const rp = classifyRelation(full, { id: 'D4-R-01', class: 'partial', answer: { value: '2' }, outstanding: false });
  const cw = classifyRelation(full, { id: 'D4-P-01', class: 'partial', answer: { value: '3' }, outstanding: false });
  const ms = classifyRelation({ id: 'D1-I-06', class: 'full', answer: { value: 'full' }, outstanding: false }, { id: 'D1-I-01', class: 'partial', answer: { value: 'partial' }, outstanding: false });
  const df = classifyRelation({ id: 'D9-E-01', class: 'full', answer: { value: '4' }, outstanding: false }, { id: 'D9-E-02', class: 'absent', answer: { value: 'absent' }, outstanding: false });
  const reviewedTypes = RELATION_REVIEW.pairs.reduce((m, p) => ({ ...m, [p.type]: (m[p.type] ?? 0) + 1 }), {});
  const ok = mi.type === 'missing-information' && ut.type === 'untested-practice' && rp.type === 'necessary-dependency' && rp.basis === 'reviewed-pair'
    && cw.type === 'complementary-weakness' && cw.basis === 'reviewed-pair' && ms.type === 'necessary-dependency' && ms.basis === 'method-structure'
    && df.type === 'complementary-weakness' && df.basis === 'default' && !/disprove|cannot operate|cannot both/i.test(df.statement)
    && RELATION_REVIEW.pairs.every((p) => p.rationale && (p.type === 'complementary-weakness' || p.statement));
  return [ok, `${mi.type}, ${ut.type}, ${rp.type} (${rp.basis}), ${cw.type} (${cw.basis}), ${ms.type} (${ms.basis}), ${df.type} (${df.basis}); reviewed table ${JSON.stringify(reviewedTypes)}`];
});

await T('RQ-03', 'No priority, likelihood, impact, difficulty or deadline is derived from tier or answer class anywhere in the model or the reports', async () => {
  const offences = [];
  const FORBIDDEN_KEYS = /^(priority|likelihood|impact|targetPeriod|targetTiming|implementationDifficulty|deadline|targetDate|materialityScore|gapClassification|isCriticalControl)$/;
  const walk = (o, path) => { if (Array.isArray(o)) o.forEach((x, i) => walk(x, `${path}[${i}]`)); else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { if (FORBIDDEN_KEYS.test(k)) offences.push(`${path}.${k}`); walk(v, `${path}.${k}`); } };
  for (const k of ORGS) {
    const { analysis: _a, ...r } = built[k].report;
    walk(r, k);
    if (!built[k].report.risks.every((x) => /^Not rated/.test(x.rating))) offences.push(`${k} risk rated`);
    for (const [name, html] of [['essential', built[k].essentialHtml], ['comprehensive', built[k].comprehensiveHtml]]) {
      const t = textOf(html);
      for (const re of [/\b(critical|high|medium|low)\s+(priority|likelihood|impact|risk)\b/i, /first-priority/i, /\bimplementation difficulty\b/i, /\bfalse comfort\b/i, /not supported in practice/i, /within (30|60|90) days/i])
        if (re.test(t)) offences.push(`${k} ${name}: ${t.match(re)[0]}`);
    }
  }
  return [!offences.length, offences.length ? offences.slice(0, 6).join('; ') : 'none in 4 models and 8 reports'];
});

await T('RQ-04', 'Answer-type integrity across the whole method: every practice, anchored, choice-practice and multi-select question gets a standard and reported wording in its own format', async () => {
  const bad = [];
  let n = 0;
  for (const id of allBankQuestionIds()) {
    if (bankQuestion(id).type !== 'practice' && /\b(we|us|our)\b/i.test(bankQuestion(id).options.map((o) => o[1]).join(' '))) {
      for (const [v] of bankQuestion(id).options.filter(([o]) => o !== 'unknown')) if (/\b(we|us|our)\b/i.test(reportedText({ id, format: bankQuestion(id).format, class: null, answer: { value: bankQuestion(id).format === 'multi' ? [v] : v } }).replace(/; not .*/, ''))) bad.push(`${id} first person in ${v}`);
    }
    const q = bankQuestion(id);
    if (q.type !== 'practice') { if (standardText(id) !== null) bad.push(`${id} ${q.type} question given a standard`); continue; }
    n++;
    const std = standardText(id);
    if (!std || /answer to|answer is yes|\?/i.test(std)) bad.push(`${id} standard "${std}"`);
    if (q.format === 'anchored' && std !== (q.levels?.[4]?.trim().replace(/\.?$/, '.') ?? std)) bad.push(`${id} anchored standard is not level 4`);
    if (q.format === 'choicePractice') {
      const full = q.options.filter(([o]) => q.practiceMap?.[o] === 'full');
      if (!full.length) bad.push(`${id} has no in-place option`);
      for (const [v, label] of q.options.filter(([o]) => o !== 'unknown')) {
        const t = reportedText({ id, format: q.format, class: q.practiceMap?.[v] ?? null, answer: { value: v } });
        if (/across everything it should cover/.test(t) && !/across everything/.test(label)) bad.push(`${id} option ${v} reads as a practice answer`);
      }
    }
    if (q.format === 'anchored') for (let lv = 0; lv <= 5; lv++) if (q.levels?.[lv] && reportedText({ id, format: 'anchored', class: null, answer: { value: String(lv) } }) !== q.levels[lv].trim().replace(/\.?$/, '.')) bad.push(`${id} level ${lv}`);
    if (q.format === 'multi') {
      const real = q.options.filter(([o]) => !['unknown', 'none'].includes(o));
      const t = reportedText({ id, format: 'multi', class: 'partial', answer: { value: [real[0][0]] } });
      if (!t.toLowerCase().includes(real[0][1].replace(/\.$/, '').toLowerCase()) || !t.includes('; not ')) bad.push(`${id} multi selection not reported`);
    }
    for (const [, label] of q.options) if (/\b(we|us|our)\b/i.test(label)) for (const [v] of q.options.filter(([, l]) => l === label)) if (/\b(we|us|our)\b/i.test(reportedText({ id, format: q.format, class: q.practiceMap?.[v] ?? null, answer: { value: q.format === 'multi' ? [v] : v } }).split(';')[0])) bad.push(`${id} first person`);
  }
  const stock = standardText('D8-S-04');
  const ok = !bad.length && stock === 'How stock is recorded: in an inventory or ERP system or in spreadsheets or manual records.';
  return [ok, `${n} questions checked; ${bad.length ? bad.slice(0, 5).join('; ') : 'no defects'}; D8-S-04 standard "${stock}"`];
});

await T('RQ-05', 'No report carries a mechanical concatenation of a questionnaire prompt, and every report standard is the method\'s own wording', async () => {
  const offences = [];
  for (const k of ORGS) for (const [name, html] of [['essential', built[k].essentialHtml], ['comprehensive', built[k].comprehensiveHtml]]) {
    const t = textOf(html);
    for (const re of [/the answer (to|is) /i, /passes this test:/i, /\?\s+is yes/i, /How is stock recorded\?/]) if (re.test(t)) offences.push(`${k} ${name}: "${t.match(re)[0]}"`);
  }
  for (const k of ORGS) for (const c of built[k].report.controls) if (c.standard !== standardText(c.id)) offences.push(`${k} ${c.ref} standard not from method`);
  return [!offences.length, offences.length ? offences.slice(0, 6).join('; ') : 'none in 8 reports; every control standard is the method\'s'];
});

await T('RQ-06', 'Every recommendation traces to a response and method content; references resolve; records are the method\'s own; content gaps are declared, not filled', async () => {
  const bad = [];
  for (const k of ORGS) {
    const r = built[k].report;
    const refs = new Set([...r.findings.map((x) => x.ref), ...r.risks.map((x) => x.ref), ...r.controls.map((x) => x.ref), ...r.records.map((x) => x.ref), ...r.actions.map((x) => x.ref), ...r.measures.map((x) => x.ref), ...r.schemes.map((x) => x.ref)]);
    for (const f of r.findings) for (const c of [...f.controlRefs, f.riskRef].filter(Boolean)) if (!refs.has(c)) bad.push(`${k} ${f.ref} -> ${c}`);
    for (const a of r.actions) for (const c of a.controlRefs) if (!refs.has(c)) bad.push(`${k} ${a.ref} -> ${c}`);
    for (const c of r.controls) {
      if (!c.answerLabel && !c.reported) bad.push(`${k} ${c.ref} has no response`);
      for (const p of [...c.prerequisiteRefs, ...c.recordRefs]) if (!refs.has(p)) bad.push(`${k} ${c.ref} -> ${p}`);
      if (c.records && c.records !== (bankQuestion(c.id).evidence?.trim().replace(/\.?$/, '.'))) bad.push(`${k} ${c.ref} record not the method's`);
      if (JSON.stringify(c.contentGaps) !== JSON.stringify(contentGaps(c.id))) bad.push(`${k} ${c.ref} gaps`);
    }
    for (const rec of r.records) if (!rec.controlRefs.length) bad.push(`${k} ${rec.ref} unused`);
  }
  const gapped = ORGS.reduce((n, k) => n + built[k].report.contentGaps.length, 0);
  return [!bad.length, `${bad.length ? bad.slice(0, 5).join('; ') : 'all references resolve'}; ${gapped} controls carry a declared method content gap across the four organisations`];
});

await T('RQ-07', 'R-1: the calculated figure does not lead either cover when unresolved answers are substantial, and is labelled as a test fixture everywhere', async () => {
  const p6 = built.P6b, p3 = built.P3;
  const cover = (html) => html.split('</section>')[0];
  const ok = p6.report.r1.substantial && !/<div class="scorebox">/.test(cover(p6.essentialHtml)) && /not a readiness conclusion while 6 schemes/.test(textOf(cover(p6.essentialHtml)))
    && /not a readiness conclusion while 6 schemes/.test(textOf(cover(p6.comprehensiveHtml)))
    && !p3.report.r1.substantial && /<div class="scorebox">/.test(cover(p3.essentialHtml)) && /Not an approved score or readiness conclusion/.test(textOf(cover(p3.essentialHtml)))
    && ORGS.every((k) => /Calculated figure<br>\(test fixture\)/.test(built[k].essentialHtml) && !/Readiness score<br>out of 100/.test(built[k].essentialHtml));
  return [ok, `P6b unresolved ${p6.report.r1.unresolved}, substantial ${p6.report.r1.substantial}; P3 substantial ${p3.report.r1.substantial}`];
});

await T('RQ-08', 'R-2: a declined question is never an answer; the four statuses are separate; candidate release rules are evaluated, not applied', async () => {
  let n = 0;
  const j = runJourney('P3', { decline: (fn) => (fn === 'Finance' && n++ < 2 ? 'Handled by the group treasury, not by us' : null) });
  const c = await buildCorrected('P3', { live: j.live });
  const declined = c.report.outstanding.filter((o) => o.reason === 'declined');
  const declinedIds = new Set(declined.map((o) => o.id));
  const counted = c.report.schemes.flatMap((s) => s.confirmations.filter((x) => declinedIds.has(x.id) && !x.outstanding));
  const appendixH = textOf(c.comprehensiveHtml).includes('Declined by the function asked');
  const synthetic = evaluateInformationSufficiency({
    stages: { core: { complete: false, applicableSoFar: 2, answered: 1 }, breadth: { complete: false, applicableSoFar: 2, answered: 1 } },
    schemes: [{ id: 'A', tier: 1, area: 'D4', confirmations: [{ id: 'x', outstanding: true, answered: false }] }, { id: 'B', tier: 1, area: 'D4', confirmations: [{ id: 'y', outstanding: false, answered: true }] }],
    outstanding: [{ id: 'x', reason: 'declined', role: 'confirm' }]
  });
  const ok = declined.length === 2 && !counted.length && appendixH && c.report.sufficiency.release.status === 'candidate-rules-not-approved'
    && synthetic.analytical.perScheme.find((s) => s.id === 'A').state === 'not-analysable' && !synthetic.release.essential.meets && synthetic.outstanding.declined === 1
    && ['stages', 'outstanding', 'analytical', 'release'].every((k) => k in c.report.sufficiency);
  return [ok, `declined ${declined.length}, counted as answered ${counted.length}; Appendix H lists them ${appendixH}; P3 Essential candidate rule ${c.report.sufficiency.release.essential.meets}; synthetic declined scheme ${synthetic.analytical.perScheme[0].state}`];
});

await T('RQ-09', 'R-3: every register row is in the Comprehensive appendices and the workbook, and the counts reconcile', async () => {
  const bad = [];
  for (const k of ORGS) {
    const { report: r, comprehensive: comp, sheets, comprehensiveHtml: html } = built[k];
    const want = { A: r.findings.length, B: r.risks.length, C: r.controls.length, D: r.records.length, E: r.actions.length, F: r.measures.length, G: r.relations.length, H: r.outstanding.length, I: r.roles.length };
    for (const a of comp.appendices) if (want[a.letter] !== a.count) bad.push(`${k} appendix ${a.letter} ${a.count} vs ${want[a.letter]}`);
    const sheet = (n) => sheets.find((s) => s.name === n)?.rows.length;
    const pairs = [['Findings', r.findings], ['Risks', r.risks], ['Controls', r.controls], ['Records', r.records], ['Actions', r.actions], ['Measures', r.measures], ['Relationships', r.relations], ['Outstanding', r.outstanding], ['Roles', r.roles], ['Schemes', r.schemes]];
    for (const [n, rows] of pairs) if (sheet(n) !== rows.length) bad.push(`${k} sheet ${n}`);
    for (const ref of [...r.findings, ...r.risks, ...r.controls, ...r.records, ...r.actions, ...r.measures, ...r.outstanding].map((x) => x.ref)) if (!html.includes(`>${ref}<`)) bad.push(`${k} ${ref} not printed`);
    if (sheets.find((s) => s.name === 'Reconciliation').rows.some((x) => x.model !== x.workbook)) bad.push(`${k} reconciliation sheet`);
  }
  return [!bad.length, bad.length ? bad.slice(0, 6).join('; ') : 'all rows printed and in the workbook for 4 organisations'];
});

await T('RQ-10', 'The corrected Essentials pass the existing validator, and neither report exposes a method identifier in its prose', async () => {
  const bad = [];
  for (const k of ORGS) {
    if (!built[k].validation.ok) bad.push(`${k} ${built[k].validation.issues.map((i) => i.code).join(',')}`);
    for (const [name, html] of [['essential', built[k].essentialHtml], ['comprehensive', built[k].comprehensiveHtml]]) { const m = textOf(html).match(REVISED_RAW_ID); if (m) bad.push(`${k} ${name} ${m[0]}`); }
  }
  return [!bad.length, bad.length ? bad.join('; ') : `validator words ${ORGS.map((k) => built[k].validation.customerWordCount).join(', ')}`];
});

await T('RQ-11', 'Prototype and fixture labels on every page or section; records management should maintain are kept apart from MK evidence review', async () => {
  const bad = [];
  for (const k of ORGS) {
    const { essentialHtml: e, comprehensiveHtml: c } = built[k];
    if (!/FICTIONAL PROTOTYPE[^<]*Not a certified paid report/.test(e)) bad.push(`${k} essential banner`);
    const sections = (c.match(/<section /g) ?? []).length;
    const strips = (c.match(/<div class="proto">/g) ?? []).length;
    if (sections !== strips) bad.push(`${k} comprehensive ${strips} strips for ${sections} sections`);
    const t = textOf(c);
    if (!/records management should maintain/i.test(t) || !/separate Advisory service/.test(t) || /evidence (was|has been) (reviewed|examined) by MK/i.test(t)) bad.push(`${k} records boundary`);
    if (!/TEST FIXTURE/.test(t) || !/TEST FIXTURE/.test(textOf(e))) bad.push(`${k} fixture label`);
  }
  return [!bad.length, bad.length ? bad.join('; ') : 'labels present in all 8 reports'];
});

await T('RQ-12', 'Logical consistency: a scheme is never both open and reported covered, unresolved schemes are never counted as covered, and the reports\' counts agree with the model', async () => {
  const bad = [];
  for (const k of ORGS) {
    const r = built[k].report;
    const k1 = r.summary.byKind;
    if (k1.contradiction + k1.dependency !== r.r1.unresolved) bad.push(`${k} unresolved count`);
    if (r.findings.some((f) => f.kind === 'confirmed')) bad.push(`${k} covered scheme has a finding`);
    if (r.risks.some((x) => r.findings.find((f) => f.ref === x.findingRef)?.kind === 'qualified')) bad.push(`${k} risk for a covered scheme`);
    const t = textOf(built[k].essentialHtml);
    if (k1.gap && !t.includes(`${k1.gap} `)) bad.push(`${k} gap count absent`);
    if (/\b0 (was|were) declined|\bIn each of the 1 scheme|\b1 schemes\b/.test(t)) bad.push(`${k} wording`);
  }
  return [!bad.length, bad.length ? bad.join('; ') : 'consistent in 4 organisations'];
});

await T('RQ-13', 'A confirmation the method establishes from a wider answer counts as answered, and one the method does not ask at the organisation\'s size is neither a gap nor missing information', async () => {
  const p3 = built.P3.report, p4 = built.P4.report;
  const reused = p3.schemes.find((s) => s.id === 'FS-D4-07');
  const notExpected = p4.schemes.filter((s) => s.kind === 'not-expected');
  const t4 = textOf(built.P4.comprehensiveHtml);
  const ok = reused?.kind === 'confirmed' && /established by the answer given for/.test(reused.confirmations[0].reported)
    && notExpected.length === 2 && p4.sufficiency.analytical.notExpectedBySize === 2 && p4.sufficiency.analytical.schemes.notAnalysable === 0
    && !p4.outstanding.some((o) => notExpected.some((s) => s.confirmations.some((c) => c.id === o.id))) && /2 the method does not ask of an organisation of this size/.test(t4);
  return [ok, `P3 two-approver scheme ${reused?.kind}; P4 not expected at its size ${notExpected.map((s) => s.name).join('; ')}; not analysable ${p4.sufficiency.analytical.schemes.notAnalysable}`];
});

const pass = results.filter((r) => r.ok).length;
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.id} ${r.name}\n     ${r.detail}`);
console.log(`${pass} of ${results.length} pass`);
fs.mkdirSync('docs/readiness-review/report-correction', { recursive: true });
fs.writeFileSync('docs/readiness-review/report-correction/tests.json', JSON.stringify(results, null, 1) + '\n');
if (pass !== results.length) process.exitCode = 1;
