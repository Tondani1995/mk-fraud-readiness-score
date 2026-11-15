// Candidate product-sufficiency rules (information-sufficiency-candidate-0.2): adversarial tests on MK's direction of
// 12 November (second direction), item 1. Each journey is a fictional session run through the real build 1.6 engine,
// with one thing withheld. The rules are candidates: nothing here is connected to fulfilment.
//   node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/revised-reports/sufficiency-adversarial-tests.mjs
import fs from 'node:fs';
import { runJourney, unknownValue, makeClock, newStagedSession, runRespondent, runOwners } from '../lib/build16-driver.mjs';
import { buildStagedReportInput } from '../../src/lib/readiness-review/report-input.ts';
import { buildRevisedReport } from '../../src/lib/reports/revised/evidence-model.ts';
import { evaluateInformationSufficiency, SUFFICIENCY_RULE_VERSION } from '../../src/lib/reports/revised/information-sufficiency.ts';
import coverage from '../../src/lib/readiness-review/data/coverage-map-v1.3.json' with { type: 'json' };

const results = [];
const T = async (id, name, fn) => {
  try { const [ok, detail] = await fn(); results.push({ id, ok, name, detail }); } catch (error) { results.push({ id, ok: false, name, detail: error.stack.split('\n').slice(0, 3).join(' ') }); }
};
const evaluate = (live) => buildRevisedReport(buildStagedReportInput(live));
const verdict = (r) => `Essential ${r.sufficiency.release.essential.meets ? 'meets' : `fails ${r.sufficiency.release.essential.failing.join(',')}`}; Comprehensive ${r.sufficiency.release.comprehensive.meets ? 'meets' : `fails ${r.sufficiency.release.comprehensive.failing.join(',')}`}`;
const fails = (r, product, ids) => ids.every((id) => r.sufficiency.release[product].failing.includes(id));
const TIER1 = new Set(coverage.scenarios.filter((s) => s.tier === 1).flatMap((s) => s.confirm.map((c) => c[1])));

const base = evaluate(runJourney('P3').live);

await T('SA-01', 'Baseline: a complete fictional journey meets every candidate condition for both products', async () => {
  const ok = base.sufficiency.rule === SUFFICIENCY_RULE_VERSION && base.sufficiency.release.essential.meets && base.sufficiency.release.comprehensive.meets;
  return [ok, verdict(base)];
});

await T('SA-02', 'Incomplete breadth: the core stage complete but breadth stopped with tier 2 unanswered fails the Essential (the defect MK reproduced) and the Comprehensive', async () => {
  const r = evaluate(runJourney('P3', { stopAfterCore: true }).live);
  const ok = r.sufficiency.stages.core === 'complete' && r.sufficiency.stages.breadth === 'incomplete'
    && r.sufficiency.coverage.tier23.share < 0.8 && fails(r, 'essential', ['EF-2', 'EF-4']) && !r.sufficiency.release.comprehensive.meets;
  return [ok, `core ${r.sufficiency.stages.core}, breadth ${r.sufficiency.stages.breadth}, tier 2 and 3 answered ${r.sufficiency.coverage.tier23.answered} of ${r.sufficiency.coverage.tier23.applicable}; ${verdict(r)}`];
});

await T('SA-03', 'Declined function package: every confirmation answered but one function declining its whole package fails the Comprehensive (the defect MK reproduced); the Essential, which rests on confirmations, still meets and discloses it', async () => {
  const r = evaluate(runJourney('P3', { decline: (fn) => (fn === 'Procurement' ? 'Not our area' : null) }).live);
  const procurement = r.sufficiency.functions.find((f) => f.fn === 'Procurement');
  const ok = r.sufficiency.coverage.all.share === 1 && procurement?.declinedInFull && fails(r, 'comprehensive', ['CP-1'])
    && r.sufficiency.release.essential.meets && r.outstanding.filter((o) => o.reason === 'declined').length > 0 && r.outstanding.filter((o) => o.reason === 'declined').length <= procurement.declined;
  return [ok, `confirmations answered ${r.sufficiency.coverage.all.answered} of ${r.sufficiency.coverage.all.applicable}; Procurement declined ${procurement?.declined} of ${procurement?.items} (${r.outstanding.filter((o) => o.reason === 'declined').length} of them practices, listed as outstanding); ${verdict(r)}`];
});

await T('SA-04', 'Missing blueprint inputs: a function answering "I don\'t know" to every diagnostic question leaves the scenarios it serves without blueprint inputs, so the Comprehensive fails', async () => {
  const r = evaluate(runJourney('P3', { answer: (fn, step) => (fn === 'HR and payroll' && step.q.type === 'practice' ? unknownValue(step.q) : null) }).live);
  const hr = r.sufficiency.functions.find((f) => f.fn === 'HR and payroll');
  const ok = hr.unknown > 0 && fails(r, 'comprehensive', ['CB-2']) && r.sufficiency.diagnostics.openScenariosWithNoDiagnosticAnswer.length > 0 && r.sufficiency.release.essential.meets;
  return [ok, `HR and payroll not known ${hr.unknown} of ${hr.items}; open scenarios without a diagnostic answer ${r.sufficiency.diagnostics.openScenariosWithNoDiagnosticAnswer.length}; ${verdict(r)}`];
});

await T('SA-05', 'Incomplete governance information: the risk function declining its package fails the governance analysis (CG-3); not knowing who has oversight holds the core stage open and fails both products', async () => {
  const a = evaluate(runJourney('P3', { decline: (fn) => (fn === 'Risk and investigations' ? 'A board matter' : null) }).live);
  const clock = makeClock();
  const live = newStagedSession('Fictional governance unknown', clock);
  runRespondent(live, clock, 'P3', { onStep: (step) => (step.q.id === 'PR-04' ? { type: 'respondent.answer', q: 'PR-04', value: 'unknown' } : null) });
  runOwners(live, clock, 'P3', { decline: (fn, step) => (step.q.id === 'PR-04' ? 'Not for us to say' : null) });
  const b = evaluate(live);
  const ok = fails(a, 'comprehensive', ['CG-3']) && a.sufficiency.release.essential.meets
    && !b.oversightKnown && fails(b, 'essential', ['EA-1']) && fails(b, 'comprehensive', ['CG-1']) && /not identified/.test(b.oversight);
  return [ok, `risk package declined: ${verdict(a)}. Oversight unknown: core ${b.sufficiency.stages.core}; ${verdict(b)}; the report names "${b.oversight}"`];
});

await T('SA-06', 'Outstanding confirmations: a quarter of tier 1 confirmations not known by the respondent and declined by the function fails both products; none is counted as answered', async () => {
  let n = 0;
  const j = runJourney('P3', {
    respond: (step) => (TIER1.has(step.q.id) && n++ % 4 === 0 ? { type: 'respondent.answer', q: step.q.id, value: unknownValue(step.q) } : null),
    decline: (fn, step) => (TIER1.has(step.q.id) ? 'We cannot say' : null)
  });
  const r = evaluate(j.live);
  const ok = r.sufficiency.coverage.tier1.share < 0.9 && fails(r, 'essential', ['EF-3']) && !r.sufficiency.release.comprehensive.meets
    && r.sufficiency.outstanding.onConfirmations > 0 && r.sufficiency.coverage.tier1.answered + r.sufficiency.outstanding.onConfirmations >= r.sufficiency.coverage.tier1.applicable - 1;
  return [ok, `tier 1 answered ${r.sufficiency.coverage.tier1.answered} of ${r.sufficiency.coverage.tier1.applicable}; outstanding on confirmations ${r.sufficiency.outstanding.onConfirmations}; ${verdict(r)}`];
});

await T('SA-07', 'Optional diagnostics are not required: only questions put to the organisation count, so the small firm meets both products although most of the method\'s diagnostic questions were never asked', async () => {
  const r = evaluate(runJourney('P4').live);
  const practices = r.analysis.controls.filter((c) => c.type === 'practice' && ['related', 'followup'].includes(c.role ?? '') && !['outofscope', 'proportion', 'precluded', 'retired'].includes(c.state ?? '')).length;
  const ok = r.sufficiency.release.essential.meets && r.sufficiency.release.comprehensive.meets && r.sufficiency.diagnostics.applicable < practices;
  return [ok, `diagnostic questions asked ${r.sufficiency.diagnostics.applicable} of ${practices} applicable supporting practices; ${verdict(r)}`];
});

await T('SA-08', 'Information and method conditions are kept apart: a control without library content fails a method condition, never an information condition', async () => {
  const input = {
    stages: { core: { complete: true, applicableSoFar: 2, answered: 2 }, breadth: { complete: true, applicableSoFar: 3, answered: 3 } },
    confirmations: [{ id: 'a', tier: 1, area: 'D4', state: 'answered' }, { id: 'b', tier: 2, area: 'D4', state: 'answered' }, { id: 'c', tier: 1, area: 'D1', state: 'answered' }],
    diagnostics: [{ id: 'd', area: 'D4', scenario: 'S', fn: 'Procurement', state: 'answered' }], openScenarios: [{ id: 'S', area: 'D4' }],
    functions: [{ fn: 'Procurement', items: 1, answered: 1, declined: 0, unknown: 0, waiting: 0 }], oversight: 'board',
    essentialControls: [{ id: 'X', inLibrary: false }], blueprintControls: [{ id: 'X', inLibrary: false, fnRole: 'Procurement lead' }], prerequisites: [{ from: 'C01', to: 'C02', reviewed: false }], outstanding: []
  };
  const r = evaluateInformationSufficiency(input);
  const ok = !r.release.essential.meets && r.release.essential.informationMet && !r.release.essential.methodMet
    && r.release.comprehensive.failing.sort().join() === ['CB-3', 'CP-3', 'EA-2'].join() && r.status === 'candidate-rules-not-approved';
  return [ok, `Essential failing ${r.release.essential.failing.join(',')} (information met ${r.release.essential.informationMet}); Comprehensive failing ${r.release.comprehensive.failing.join(',')}`];
});

await T('SA-09', 'Candidate only: the evaluator imports nothing from orders, entitlements, payments, fulfilment or products, and every result says the rules are not approved', async () => {
  const src = fs.readFileSync('src/lib/reports/revised/information-sufficiency.ts', 'utf8');
  const imports = src.match(/^import .*$/gm) ?? [];
  const ok = !imports.length && !/order|entitlement|payment|fulfil|catalogue|checkout/i.test(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')) && base.sufficiency.status === 'candidate-rules-not-approved';
  return [ok, `${imports.length} imports; status ${base.sufficiency.status}`];
});

const pass = results.filter((r) => r.ok).length;
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.id} ${r.name}\n     ${r.detail}`);
console.log(`${pass} of ${results.length} pass`);
fs.mkdirSync('docs/readiness-review/report-revision', { recursive: true });
fs.writeFileSync('docs/readiness-review/report-revision/sufficiency-tests.json', JSON.stringify(results, null, 1) + '\n');
if (pass !== results.length) process.exitCode = 1;
