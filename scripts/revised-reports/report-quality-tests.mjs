// Reporting quality (MK directions of 12 November 2026, first and second): answer relationships, no unapproved ratings
// or ranking, answer-type integrity, traceable library-based recommendations, the four position statements, proposed
// planning stages, and the integrity of the Essential and Comprehensive outputs. Fictional organisations only.
//   node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/revised-reports/report-quality-tests.mjs
import fs from 'node:fs';
import { buildCorrected, textOf } from './pipeline.mjs';
import { runJourney } from '../lib/build16-driver.mjs';
import { REVISED_RAW_ID, methodOrder } from '../../src/lib/reports/revised/evidence-model.ts';
import { controlContent, ENTRIES, ARCHETYPES } from '../../src/lib/reports/revised/control-content/index.ts';
import { allBankQuestionIds, bankQuestion, reportedText, standardText, contentGaps } from '../../src/lib/reports/revised/answer-text.ts';

const results = [];
const T = async (id, name, fn) => {
  try { const [ok, detail] = await fn(); results.push({ id, ok, name, detail }); } catch (error) { results.push({ id, ok: false, name, detail: error.stack.split('\n').slice(0, 3).join(' ') }); }
};
const ORGS = ['P3', 'P4', 'P5', 'P6b'];
const built = {};
for (const k of ORGS) built[k] = await buildCorrected(k);
const prev = (k) => JSON.parse(fs.readFileSync(`docs/readiness-review/report-comparison/${k}/artefacts.json`, 'utf8'));

await T('RQ-01', 'The 21 scenarios the first prototype flagged as false comfort are reassessed under relationship-review-0.2: one direct contradiction, five reviewed questions to clarify, fifteen with a related practice weaker, and no dependency', async () => {
  const before = prev('P6b').after.analysis.scenarios.filter((s) => s.kind === 'false-comfort').map((s) => s.id).sort();
  const r = built.P6b.report;
  const kinds = Object.fromEntries(before.map((id) => [id, r.schemes.find((s) => s.id === id)?.kind]));
  const counts = Object.values(kinds).reduce((m, k) => ({ ...m, [k]: (m[k] ?? 0) + 1 }), {});
  const unresolved = before.filter((id) => ['contradiction', 'dependency'].includes(kinds[id]));
  const clarify = before.filter((id) => kinds[id] === 'clarify');
  const ok = before.length === 21 && counts.contradiction === 1 && !counts.dependency && counts.clarify === 5 && counts.qualified === 15
    && unresolved.join() === 'FS-D2-02' && clarify.join() === ['FS-D10-05', 'FS-D2-05', 'FS-D4-05', 'FS-D5-12', 'FS-D8-02'].join()
    && r.schemes.filter((s) => s.kind === 'clarify').every((s) => s.relations.some((x) => x.type === 'not-established' && x.basis === 'reviewed-pair' && x.question));
  return [ok, `${before.length} flagged before; now ${JSON.stringify(counts)}; unresolved ${unresolved.join(', ')}; to clarify ${clarify.join(', ')}`];
});
await T('RQ-02', 'Every relationship in the four reports rests on the answer or a reviewed pair: none is assumed by default, none comes from routing, and no practice answered "not applicable" appears', async () => {
  const bad = [];
  for (const k of ORGS) {
    const r = built[k].report;
    for (const x of r.relations) {
      if (!['answer', 'reviewed-pair', 'not-reviewed', 'semantics-not-met'].includes(x.basis)) bad.push(`${k} ${x.practice} basis ${x.basis}`);
      if (x.type === 'complementary-weakness' && x.basis !== 'reviewed-pair') bad.push(`${k} ${x.practice} complementary without review`);
      if (['direct-contradiction', 'necessary-dependency'].includes(x.type) && x.basis !== 'reviewed-pair') bad.push(`${k} ${x.practice} unresolved without review`);
      if (r.analysis.byId.get(x.practice)?.class === 'na') bad.push(`${k} ${x.practice} not applicable listed`);
    }
  }
  const basis = ORGS.map((k) => `${k} ${JSON.stringify(built[k].report.summary.relationBasis)}`).join('; ');
  return [!bad.length, bad.length ? bad.slice(0, 5).join('; ') : basis];
});
await T('RQ-03', 'No priority, likelihood, impact, materiality, difficulty or deadline is derived anywhere, and no report uses materiality or ranking language', async () => {
  const offences = [];
  const FORBIDDEN_KEYS = /^(priority|likelihood|impact|targetPeriod|targetTiming|implementationDifficulty|deadline|targetDate|materialityScore|gapClassification|isCriticalControl|r1)$/;
  const walk = (o, path) => { if (Array.isArray(o)) o.forEach((x, i) => walk(x, `${path}[${i}]`)); else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { if (FORBIDDEN_KEYS.test(k)) offences.push(`${path}.${k}`); walk(v, `${path}.${k}`); } };
  for (const k of ORGS) {
    const { analysis: _a, ...r } = built[k].report;
    walk(r, k);
    if (!built[k].report.risks.every((x) => /^Not rated/.test(x.rating))) offences.push(`${k} risk rated`);
    for (const [name, html] of [['essential', built[k].essentialHtml], ['comprehensive', built[k].comprehensiveHtml]]) {
      const t = textOf(html);
      for (const re of [/\b(critical|high|medium|low)\s+(priority|likelihood|impact|risk)\b/i, /first-priority/i, /\bimplementation difficulty\b/i, /\bfalse comfort\b/i, /not supported in practice/i, /within (30|60|90) days/i,
        /material fraud exposure/i, /matter most/i, /priority exposure/i, /priority order/i, /where to act first/i, /weakest first/i, /\bmost material\b/i, /\bhighest[- ]risk scenario/i, /exposure materialise/i])
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

await T('RQ-06', 'Every recommendation traces to a response and to library or method content; references resolve; records come from the library or the method; method content gaps stay declared', async () => {
  const bad = [];
  for (const k of ORGS) {
    const r = built[k].report;
    const refs = new Set([...r.findings.map((x) => x.ref), ...r.risks.map((x) => x.ref), ...r.controls.map((x) => x.ref), ...r.records.map((x) => x.ref), ...r.actions.map((x) => x.ref), ...r.measures.map((x) => x.ref), ...r.schemes.map((x) => x.ref)]);
    for (const f of r.findings) for (const c of [...f.controlRefs, f.riskRef].filter(Boolean)) if (!refs.has(c)) bad.push(`${k} ${f.ref} -> ${c}`);
    for (const a of r.actions) for (const c of a.controlRefs) if (!refs.has(c)) bad.push(`${k} ${a.ref} -> ${c}`);
    for (const c of r.controls) {
      if (!c.answerLabel && !c.reported) bad.push(`${k} ${c.ref} has no response`);
      for (const p of [...c.prerequisiteRefs, ...c.recordRefs]) if (!refs.has(p)) bad.push(`${k} ${c.ref} -> ${p}`);
      if (c.records && c.records !== (bankQuestion(c.id).evidence?.trim().replace(/\.?$/, '.'))) bad.push(`${k} ${c.ref} method record altered`);
      if (c.recordText !== (controlContent(c.id).record ?? c.records)) bad.push(`${k} ${c.ref} record not from the library or method`);
      if (JSON.stringify(c.contentGaps) !== JSON.stringify(contentGaps(c.id))) bad.push(`${k} ${c.ref} gaps`);
    }
    for (const rec of r.records) if (!rec.controlRefs.length) bad.push(`${k} ${rec.ref} unused`);
  }
  const gapped = ORGS.reduce((n, k) => n + built[k].report.contentGaps.length, 0);
  return [!bad.length, `${bad.length ? bad.slice(0, 5).join('; ') : 'all references resolve'}; ${gapped} controls carry a declared method content gap, each filled by the draft library`];
});
await T('RQ-07', 'Score presentation: both reports, for every organisation, state the calculated test result, the unresolved inconsistencies, a provisional interpretation and the approved readiness conclusion separately, with no band and no threshold', async () => {
  const bad = [];
  const LABELS = ['Calculated test result', 'Unresolved inconsistencies', 'Provisional management interpretation', 'Approved readiness conclusion'];
  for (const k of ORGS) {
    const { essentialHtml: e, comprehensiveHtml: c, fixture } = built[k];
    const pages = e.split('</section>');
    const cover = textOf(pages[0]), page2 = textOf(pages[1]);
    const ccover = textOf(c.split('</section>')[0]), s1 = textOf(c.split('</section>')[2]);
    for (const [where, t] of [['essential cover', cover], ['essential page 2', page2], ['comprehensive cover', ccover], ['comprehensive section 1', s1]]) {
      for (const l of LABELS) if (!t.toLowerCase().includes(l.toLowerCase())) bad.push(`${k} ${where} lacks ${l}`);
      if (!t.includes(`${fixture.overall.toFixed(1)} of 100, test fixture`)) bad.push(`${k} ${where} fixture value`);
    }
    for (const [name, html] of [['essential', e], ['comprehensive', c]]) {
      const t = textOf(html);
      const band = t.match(/\b(Reactive|Developing|Structured|Strategic)\b/);
      if (band) bad.push(`${k} ${name} band "${band[0]}"`);
      if (/class="scorebox"|class="stats"|Readiness score<br>out of 100|Fraud readiness at a glance/.test(html)) bad.push(`${k} ${name} score display`);
    }
  }
  return [!bad.length, bad.length ? bad.slice(0, 6).join('; ') : 'four statements on both covers and position pages in 8 reports; no band; no threshold'];
});
await T('RQ-08', 'A declined question is never an answer: it is outstanding, listed in Appendix H, and the candidate rules report on it without being applied', async () => {
  let n = 0;
  const j = runJourney('P3', { decline: (fn) => (fn === 'Finance' && n++ < 2 ? 'Handled by the group treasury, not by us' : null) });
  const c = await buildCorrected('P3', { live: j.live });
  const declined = c.report.outstanding.filter((o) => o.reason === 'declined');
  const declinedIds = new Set(declined.map((o) => o.id));
  const counted = c.report.schemes.flatMap((s) => s.confirmations.filter((x) => declinedIds.has(x.id) && !x.outstanding));
  const appendixH = textOf(c.comprehensiveHtml).includes('Declined by the function asked');
  const ok = declined.length === 2 && !counted.length && appendixH && c.report.sufficiency.status === 'candidate-rules-not-approved' && c.report.sufficiency.outstanding.declined === 2;
  return [ok, `declined ${declined.length}, counted as answered ${counted.length}; Appendix H lists them ${appendixH}; candidate verdicts: Essential ${c.report.sufficiency.release.essential.meets}, Comprehensive ${c.report.sufficiency.release.comprehensive.meets}`];
});
await T('RQ-09', 'R-3: every register row is in the Comprehensive appendices and the workbook, and the counts reconcile', async () => {
  const bad = [];
  for (const k of ORGS) {
    const { report: r, comprehensive: comp, sheets, comprehensiveHtml: html } = built[k];
    const want = { A: r.findings.length, B: r.risks.length, C: r.controls.length, D: r.records.length, E: r.actions.length, F: r.measures.length, G: r.relations.length, H: r.outstanding.length, I: r.roles.length, J: r.sufficiency.coverage.byArea.length };
    for (const a of comp.appendices) if (want[a.letter] !== a.count) bad.push(`${k} appendix ${a.letter} ${a.count} vs ${want[a.letter]}`);
    const sheet = (n) => sheets.find((s) => s.name === n)?.rows.length;
    const pairs = [['Findings', r.findings], ['Risks', r.risks], ['Controls', r.controls], ['Records', r.records], ['Actions', r.actions], ['Measures', r.measures], ['Relationships', r.relations], ['Outstanding', r.outstanding], ['Roles', r.roles], ['Scenarios', r.schemes]];
    for (const [n, rows] of pairs) if (sheet(n) !== rows.length) bad.push(`${k} sheet ${n}`);
    for (const ref of [...r.findings, ...r.risks, ...r.controls, ...r.records, ...r.actions, ...r.measures, ...r.outstanding].map((x) => x.ref)) if (!html.includes(`>${ref}<`)) bad.push(`${k} ${ref} not printed`);
    if (sheets.find((s) => s.name === 'Reconciliation').rows.some((x) => x.model !== x.workbook)) bad.push(`${k} reconciliation sheet`);
  }
  return [!bad.length, bad.length ? bad.slice(0, 6).join('; ') : 'all rows printed and in the workbook for 4 organisations'];
});

await T('RQ-10', 'The corrected Essentials pass the existing validator, and neither report exposes a method identifier or an em dash in its prose', async () => {
  const bad = [];
  for (const k of ORGS) {
    if (!built[k].validation.ok) bad.push(`${k} ${built[k].validation.issues.map((i) => i.code).join(',')}`);
    for (const [name, html] of [['essential', built[k].essentialHtml], ['comprehensive', built[k].comprehensiveHtml]]) { const m = textOf(html).match(REVISED_RAW_ID); if (m) bad.push(`${k} ${name} ${m[0]}`); if (/\u2014/.test(textOf(html))) bad.push(`${k} ${name} em dash`); }
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

await T('RQ-12', 'Logical consistency: a scenario is never both open and reported covered, unresolved and to-clarify scenarios are never counted as covered, and the reports\' counts agree with the model', async () => {
  const bad = [];
  for (const k of ORGS) {
    const r = built[k].report;
    const k1 = r.summary.byKind;
    if (k1.contradiction !== r.position.contradictions || k1.dependency !== r.position.dependencies || k1.clarify !== r.position.clarifications) bad.push(`${k} position counts`);
    if (r.findings.some((f) => f.kind === 'confirmed')) bad.push(`${k} covered scenario has a finding`);
    if (r.risks.some((x) => ['qualified', 'clarify'].includes(r.findings.find((f) => f.ref === x.findingRef)?.kind))) bad.push(`${k} risk for a scenario reported covered`);
    const t = textOf(built[k].essentialHtml);
    if (k1.gap && !t.includes(`${k1.gap} `)) bad.push(`${k} gap count absent`);
    if (/\b0 (was|were) declined|\bIn each of the 1 scheme|\b1 schemes\b|\b1 scenarios\b|\bthe 1 control\b/.test(t + textOf(built[k].comprehensiveHtml))) bad.push(`${k} wording`);
  }
  return [!bad.length, bad.length ? bad.join('; ') : 'consistent in 4 organisations'];
});
await T('RQ-13', 'A confirmation the method establishes from a wider answer counts as answered, and one the method does not ask at the organisation\'s size is neither a gap nor missing information', async () => {
  const p3 = built.P3.report, p4 = built.P4.report;
  const reused = p3.schemes.find((s) => s.id === 'FS-D4-07');
  const notExpected = p4.schemes.filter((s) => s.kind === 'not-expected');
  const t4 = textOf(built.P4.essentialHtml);
  const ok = reused?.kind === 'confirmed' && /established by the answer given for/.test(reused.confirmations[0].reported)
    && notExpected.length === 2 && p4.sufficiency.notExpectedBySize === 2 && p4.sufficiency.release.essential.meets
    && !p4.outstanding.some((o) => notExpected.some((s) => s.confirmations.some((c) => c.id === o.id))) && /does not ask about 2 more at its size/.test(t4);
  return [ok, `P3 two-approver scenario ${reused?.kind}; P4 not expected at its size: ${notExpected.map((s) => s.name).join('; ')}`];
});
await T('RQ-14', 'Control guidance comes from the reusable library: every control in the four reports has a target practice, responsible function, activities, records, a specific success measure, a cycle and a failure response, and no generic measure remains', async () => {
  const bad = [];
  const GENERIC = /this practice applied to every case in scope|records for the period show this practice applied|operating for every case in scope/i;
  const ids = new Set();
  for (const k of ORGS) {
    const r = built[k].report;
    for (const c of r.controls) {
      ids.add(c.id);
      if (c.contentStatus !== 'library') bad.push(`${k} ${c.ref} not in library`);
      if (!c.target || c.activities.length < 3 || !c.recordText || !c.successMeasure || /^Not yet/.test(c.successMeasure) || !c.onFailure || !c.ownerRole || /Not stated/.test(c.operatingCycle)) bad.push(`${k} ${c.ref} incomplete`);
      if (GENERIC.test(c.successMeasure)) bad.push(`${k} ${c.ref} generic measure`);
    }
    const unique = new Set(r.measures.map((m) => m.measure)).size;
    if (unique < r.measures.length * 0.95) bad.push(`${k} measures repeat (${unique} distinct of ${r.measures.length})`);
    for (const html of [built[k].essentialHtml, built[k].comprehensiveHtml]) if (GENERIC.test(textOf(html))) bad.push(`${k} generic measure in a report`);
  }
  for (const e of ENTRIES) {
    const q = bankQuestion(e.id);
    if (!q || q.type !== 'practice') bad.push(`${e.id} not a practice question`);
    if (!ARCHETYPES[e.a]) bad.push(`${e.id} archetype ${e.a}`);
    if ((e.brief ?? e.target).length > 160) bad.push(`${e.id} brief too long`);
    const all = JSON.stringify(controlContent(e.id));
    if (/\u2014/.test(all) || /\b(we|our|us)\b/i.test(all)) bad.push(`${e.id} style`);
  }
  return [!bad.length, `${ids.size} distinct controls across the four reports, ${ENTRIES.length} library entries on ${Object.keys(ARCHETYPES).length} archetypes; ${bad.length ? bad.slice(0, 5).join('; ') : 'complete and specific'}`];
});

await T('RQ-15', 'No silent ranking: no rank numbers or priority columns, scenario references follow the method\'s order, programmes are alphabetical, and each selection states its rule', async () => {
  const bad = [];
  for (const k of ORGS) {
    const { essentialHtml: e, comprehensiveHtml: c, report: r } = built[k];
    if (/<td class="rank">|<th[^>]*>#<\/th>|Priority exposure|Priority order/.test(e)) bad.push(`${k} rank display`);
    const order = r.schemes.map((s) => s.ref);
    const sorted = [...r.schemes].sort(methodOrder).map((s) => s.ref);
    if (order.join() !== sorted.join() || order.some((ref, i) => ref !== `S${String(i + 1).padStart(2, '0')}`)) bad.push(`${k} scenario references not in method order`);
    const roles = [...c.matchAll(/<div class="card"><div style="display:flex;justify-content:space-between;align-items:baseline"><h3>([^<]+)<\/h3><span class="meta">\d+ controls?<\/span>/g)].map((m) => m[1]);
    if (roles.join() !== [...roles].sort((x, y) => x.localeCompare(y)).join()) bad.push(`${k} programmes not alphabetical`);
    if (r.findings.length && !/Inclusion and order are not a ranking/.test(textOf(e))) bad.push(`${k} Essential selection rule`);
    if (!/up to six in all/.test(textOf(c)) || !/neither the order nor the tier is a ranking/.test(textOf(c))) bad.push(`${k} Comprehensive selection rule`);
  }
  return [!bad.length, bad.length ? bad.slice(0, 6).join('; ') : 'no ranking displays in 8 reports; method order and stated rules throughout'];
});

await T('RQ-16', 'The roadmap proposes stages without deadlines or estimates, and uses a prerequisite only where a reviewed dependency supports it', async () => {
  const bad = [];
  for (const k of ORGS) {
    const { essentialModel: m, essentialHtml: e, comprehensiveHtml: c, report: r } = built[k];
    if (!m.roadmap.stages.every((s) => /proposed/.test(s.stage)) || !/not deadlines, contractual dates or estimates/.test(m.roadmap.interpretation)) bad.push(`${k} Essential stages`);
    if ((e.match(/Proposed window · /g) ?? []).length !== 3) bad.push(`${k} Essential windows`);
    if (!/not deadlines, not contractual dates and not estimates/.test(textOf(c))) bad.push(`${k} Comprehensive stages`);
    const nd = r.relations.some((x) => x.type === 'necessary-dependency');
    if (r.phases.some((p) => p.n === 3) !== nd || r.controls.some((x) => x.prerequisiteRefs.length) !== nd) bad.push(`${k} prerequisite without a reviewed dependency`);
    if (r.actions.some((a) => /\b(by|before) \d{1,2} (January|February|March|April|May|June|July|August|September|October|November|December)|\bwithin \d+ (days|weeks|months)\b/i.test(`${a.action} ${a.completionTest}`))) bad.push(`${k} dated action`);
  }
  return [!bad.length, bad.length ? bad.join('; ') : 'proposed stages only; no prerequisite without reviewed semantics in 4 organisations'];
});

const pass = results.filter((r) => r.ok).length;
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.id} ${r.name}\n     ${r.detail}`);
console.log(`${pass} of ${results.length} pass`);
fs.mkdirSync('docs/readiness-review/report-revision', { recursive: true });
fs.writeFileSync('docs/readiness-review/report-revision/tests.json', JSON.stringify(results, null, 1) + '\n');
if (pass !== results.length) process.exitCode = 1;
