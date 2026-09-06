#!/usr/bin/env node
/**
 * Essential THIRD_PARTY_COLLUSION pathway regression, replaying the real affected assessment.
 *
 * Anonymised replay of MKORD-2026-2EF3FB30: question identities, response values, weights,
 * criticality and domain scores are retained because they determine materiality; customer,
 * respondent and order identities are deliberately absent.
 *
 * The assessment scores 57.29 / Developing, so the high-readiness sparse contract does not
 * apply and the Essential Story Plan requires two to three scenarios. Before the approved
 * taxonomy extension only DETECTION_EVASION could instantiate and the Story Plan failed closed
 * at one scenario.
 *
 * The truth requirement under test: a scenario built from one eligible finding must carry only
 * what that finding's own authoritative playbook establishes.
 *
 * Deterministic and provider-free. It cannot reach a provider, a database or a network.
 */
import assert from 'node:assert/strict';

import { syntheticOrgFixture } from '../../src/lib/reports/evidence-model/__fixtures__/synthetic-org-fixture.ts';
import { buildAdvisoryEvidenceModel } from '../../src/lib/reports/evidence-model/index.ts';
import { buildEssentialProjection } from '../../src/lib/reports/essential-projection.ts';
import { buildEssentialNarrativeFactPack } from '../../src/lib/reports/narrative/fact-pack.ts';
import { buildNarrativeStoryPlan, assertNarrativeStoryPlan } from '../../src/lib/reports/narrative/story-plan.ts';
import { buildNarrativeWriterBrief } from '../../src/lib/reports/narrative/writer-brief.ts';
import { runPreAiFactPackGates } from '../../src/lib/reports/narrative/pre-ai-gates.ts';
import { FRAUD_PATHWAY_FAMILIES, FRAUD_PATHWAY_FAMILIES_BY_QUESTION } from '../../src/lib/reports/evidence-model/semantic-mappings.ts';
import { getQuestionPlaybook } from '../../src/lib/reports/evidence-model/question-playbooks.ts';

const METHODOLOGY = { methodologyVersionId: 'offline-v12', methodologyVersionCode: 'MFRS-V1.2-CANDIDATE-OWNER-CORRECTION' };
/** The authoritative customer-facing prompt, so generated prose matches production exactly. */
const promptFor = (questionCode) => getQuestionPlaybook(questionCode, METHODOLOGY)?.prompt ?? getQuestionPlaybook(questionCode, METHODOLOGY)?.controlObjective ?? 'Control response.';

const ELIGIBLE = ['D2-Q05', 'D7-Q02', 'D7-Q03', 'D7-Q05', 'D7-Q06', 'D7-Q07'];

const responses = {
  'D1-Q01': 4, 'D1-Q02': 4, 'D1-Q03': 4, 'D1-Q04': 4, 'D1-Q05': 4, 'D1-Q06': 3, 'D1-Q07': 4,
  'D2-Q01': 2, 'D2-Q02': 3, 'D2-Q03': 2, 'D2-Q04': 2, 'D2-Q05': 2, 'D2-Q06': 2, 'D2-Q07': 3, 'D2-Q08': 3,
  'D3-Q01': 3, 'D3-Q02': 3, 'D3-Q03': 3, 'D3-Q04': 4, 'D3-Q05': 3, 'D3-Q06': 2, 'D3-Q07': 2, 'D3-Q08': 3, 'D3-Q09': 3, 'D3-Q10': 3, 'D3-Q11': 3,
  'D4-Q01': 2, 'D4-Q02': 2, 'D4-Q03': 2, 'D4-Q04': 2, 'D4-Q05': 2, 'D4-Q06': 2, 'D4-Q07': 2, 'D4-Q08': 2,
  'D5-Q01': 4, 'D5-Q03': 4, 'D5-Q04': 4, 'D5-Q05': 4, 'D5-Q06': 3,
  'D6-Q01': 3, 'D6-Q02': 3, 'D6-Q03': 3, 'D6-Q04': 4, 'D6-Q05': 3,
  'D7-Q01': 3, 'D7-Q02': 2, 'D7-Q03': 2, 'D7-Q04': 3, 'D7-Q05': 1, 'D7-Q06': 2, 'D7-Q07': 2,
  'D8-Q01': 3, 'D8-Q02': 3, 'D8-Q03': 3, 'D8-Q04': 4, 'D8-Q06': 2, 'D8-Q07': 2, 'D8-Q08': 3, 'D8-Q09': 3, 'D8-Q10': 2,
  'D9-Q01': 4, 'D9-Q02': 4, 'D9-Q03': 4, 'D9-Q05': 3,
  'D10-Q01': 2, 'D10-Q02': 2, 'D10-Q03': 2, 'D10-Q06': 2
};
const weights = {
  'D1-Q01': 1.5, 'D1-Q02': 1.25, 'D1-Q03': 1.25, 'D1-Q04': 1, 'D1-Q05': 1, 'D1-Q06': 1, 'D1-Q07': 0.5,
  'D2-Q01': 1.5, 'D2-Q02': 1.5, 'D2-Q03': 1.25, 'D2-Q04': 1, 'D2-Q05': 1.25, 'D2-Q06': 1, 'D2-Q07': 1.25, 'D2-Q08': 1,
  'D3-Q01': 1.5, 'D3-Q02': 1.25, 'D3-Q03': 1.5, 'D3-Q04': 1, 'D3-Q05': 1.25, 'D3-Q06': 1, 'D3-Q07': 1, 'D3-Q08': 0.5, 'D3-Q09': 0.5, 'D3-Q10': 0.5, 'D3-Q11': 0.5,
  'D4-Q01': 1.5, 'D4-Q02': 1.25, 'D4-Q03': 1.5, 'D4-Q04': 1, 'D4-Q05': 0.5, 'D4-Q06': 1.25, 'D4-Q07': 1, 'D4-Q08': 0.5,
  'D5-Q01': 1.5, 'D5-Q03': 1.25, 'D5-Q04': 1.25, 'D5-Q05': 1.5, 'D5-Q06': 1,
  'D6-Q01': 1.5, 'D6-Q02': 1.25, 'D6-Q03': 1.25, 'D6-Q04': 1, 'D6-Q05': 1,
  'D7-Q01': 1.5, 'D7-Q02': 1.25, 'D7-Q03': 1.25, 'D7-Q04': 1.5, 'D7-Q05': 1, 'D7-Q06': 1, 'D7-Q07': 1,
  'D8-Q01': 1.5, 'D8-Q02': 1.5, 'D8-Q03': 1.25, 'D8-Q04': 1, 'D8-Q06': 1, 'D8-Q07': 1, 'D8-Q08': 1, 'D8-Q09': 0.5, 'D8-Q10': 0.5,
  'D9-Q01': 1.25, 'D9-Q02': 1, 'D9-Q03': 1.25, 'D9-Q05': 1,
  'D10-Q01': 1.5, 'D10-Q02': 1.25, 'D10-Q03': 1.25, 'D10-Q06': 1.25
};
const critical = new Set(['D1-Q01', 'D1-Q04', 'D2-Q01', 'D2-Q02', 'D3-Q01', 'D3-Q03', 'D3-Q04', 'D4-Q01', 'D4-Q03', 'D5-Q01', 'D5-Q05', 'D6-Q01', 'D7-Q01', 'D7-Q04', 'D8-Q01', 'D8-Q02', 'D8-Q04', 'D8-Q08', 'D10-Q01']);
const hardGates = new Set([...critical].filter((code) => code !== 'D6-Q01' && code !== 'D7-Q01'));
const criticalGaps = new Set(['D10-Q01', 'D2-Q01', 'D4-Q01', 'D4-Q03']);
const domainMeta = {
  D1: { name: 'Fraud Leadership and Governance', score: 77.33, weight: 12 },
  D2: { name: 'Fraud Risk Identification', score: 47.69, weight: 12 },
  D3: { name: 'Operational Fraud Controls', score: 58.10, weight: 14 },
  D4: { name: 'Fraud Detection Capability', score: 40, weight: 14 },
  D5: { name: 'Fraud Incident Response', score: 76.92, weight: 10 },
  D6: { name: 'Whistleblowing and Reporting Culture', score: 63.33, weight: 6 },
  D7: { name: 'Third-Party and Supply Chain Fraud Risk', score: 44.71, weight: 10 },
  D8: { name: 'Digital and Identity Fraud Risk', score: 56.76, weight: 12 },
  D9: { name: 'Fraud Culture and Awareness', score: 75.56, weight: 5 },
  D10: { name: 'Continuous Improvement and Fraud Risk Monitoring', score: 40, weight: 5 }
};

function buildData(overrides = {}) {
  const merged = { ...responses, ...overrides };
  const questionTraces = Object.entries(merged).map(([questionCode, responseValue]) => {
    const domainCode = questionCode.split('-')[0];
    return {
      questionCode, domainCode, domainName: domainMeta[domainCode].name,
      prompt: promptFor(questionCode),
      responseValue, normalisedScore: responseValue * 20, applicable: true, triggeredRules: [],
      weight: weights[questionCode],
      isCritical: critical.has(questionCode), isHardGate: hardGates.has(questionCode),
      isCriticalGap: criticalGaps.has(questionCode), isMajorGap: false
    };
  });
  return {
    ...structuredClone(syntheticOrgFixture),
    organisationName: 'Offline Essential third-party collusion regression fixture',
    assessmentReference: 'OFFLINE-ESSENTIAL-THIRD-PARTY-COLLUSION',
    scoreRun: {
      id: 'offline-score-run', assessmentId: 'offline-assessment', methodologyVersionId: 'offline-v12',
      methodologyVersionCode: 'MFRS-V1.2-CANDIDATE-OWNER-CORRECTION',
      status: 'completed', lockedAt: '2026-09-05T00:00:00.000Z', inputHash: 'offline',
      overallScore: 57.29, calculatedMaturity: 'Developing', finalMaturity: 'Developing',
      exposureScore: null, exposureBand: null, coveragePct: 100, nARatePct: 0,
      criticalGapCount: 4, majorGapCount: 0, capApplied: false,
      capReason: 'One or more hard-gate critical controls scored 2. Three or more critical controls scored 0, 1 or 2. Core domain D2 scored below 60.'
    },
    domainResults: Object.entries(domainMeta).map(([domainCode, meta]) => ({ domainCode, domainName: meta.name, rawScore: meta.score, weightPct: meta.weight })),
    questionTraces,
    criticalMajorGaps: questionTraces.filter((trace) => trace.isCriticalGap || trace.isMajorGap),
    exposureAnswers: [], adaptiveScope: { exposureAssessed: false }, maturityCapEvents: []
  };
}

function packFor(data, evidenceModel) {
  const projection = buildEssentialProjection(data, evidenceModel);
  return { projection, pack: buildEssentialNarrativeFactPack(data, evidenceModel, projection) };
}
/** Reconstructs pre-taxonomy behaviour without touching the shipped registry. */
function withoutNewFamily(model) {
  return { ...model, materialFindings: model.materialFindings.map((finding) => finding.fraudPathwayFamilies.includes('THIRD_PARTY_COLLUSION') ? { ...finding, fraudPathwayFamilies: [] } : finding) };
}

// ---------------------------------------------------------------------------
// Taxonomy and eligibility.
// ---------------------------------------------------------------------------
assert.equal(FRAUD_PATHWAY_FAMILIES.includes('THIRD_PARTY_COLLUSION'), true);
assert.equal(FRAUD_PATHWAY_FAMILIES.length, 9, 'exactly one pathway family is added');
const mapped = Object.entries(FRAUD_PATHWAY_FAMILIES_BY_QUESTION).filter(([, families]) => families.includes('THIRD_PARTY_COLLUSION')).map(([code]) => code).sort();
assert.deepEqual(mapped, [...ELIGIBLE].sort(), 'eligibility is exactly the approved list');
assert.equal(FRAUD_PATHWAY_FAMILIES_BY_QUESTION['D6-Q05'], undefined, 'D6-Q05 is excluded');
assert.deepEqual(FRAUD_PATHWAY_FAMILIES_BY_QUESTION['D7-Q01'], ['SUPPLIER_PAYMENT_DIVERSION'], 'D7-Q01 is unchanged');
assert.deepEqual(FRAUD_PATHWAY_FAMILIES_BY_QUESTION['D7-Q04'], ['SUPPLIER_PAYMENT_DIVERSION'], 'D7-Q04 is unchanged');
for (const code of ['D3-Q04', 'D3-Q07', 'D6-Q01', 'D6-Q02', 'D6-Q03', 'D6-Q04', 'D9-Q06']) {
  assert.equal(FRAUD_PATHWAY_FAMILIES_BY_QUESTION[code], undefined, `${code} must not gain a pathway`);
}

// ---------------------------------------------------------------------------
// The affected order: before and after.
// ---------------------------------------------------------------------------
const data = buildData();
const model = buildAdvisoryEvidenceModel(data);
const { projection, pack } = packFor(data, model);

const { pack: beforePack } = packFor(data, withoutNewFamily(model));
assert.deepEqual(beforePack.scenarios.map((s) => s.scenarioFamily), ['DETECTION_EVASION'], 'before: one pathway');
assert.throws(() => assertNarrativeStoryPlan(buildNarrativeStoryPlan(beforePack), beforePack), /Essential Story Plan contains an invalid scenario count/);

assert.equal(pack.narrativeMode, 'REMEDIATION');
assert.equal(pack.highReadinessSparseNarrativeReason, undefined, 'this profile is not high-readiness sparse');
assert.equal(pack.findings.length, 8, 'the finding narrative core is unchanged');
assert.deepEqual(pack.scenarios.map((s) => s.scenarioFamily), ['DETECTION_EVASION', 'THIRD_PARTY_COLLUSION']);
const plan = buildNarrativeStoryPlan(pack);
assert.doesNotThrow(() => assertNarrativeStoryPlan(plan, pack));
assert.equal(plan.narrativeBounds.scenarioCount, 2);

const collusion = pack.scenarios.find((s) => s.scenarioFamily === 'THIRD_PARTY_COLLUSION');
assert.deepEqual(collusion.linkedFindingIds, ['MF-D7-Q05'], 'linked to the D7-Q05 finding only');
assert.deepEqual(collusion.linkedRiskIds, ['RISK-CONTROL-D7-Q05'], 'linked to its risk');
assert.ok(collusion.linkedFindingRefs.length > 0 && collusion.linkedRiskRefs.length > 0);

// Full generated fact, asserted field by field.
assert.equal(collusion.title, 'Third-party relationship manipulation or collusion escapes timely challenge');
assert.equal(collusion.actorClass, 'A third party acting for or with the organisation, alone or with an insider able to influence the relationship');
assert.equal(collusion.opportunity, 'A weakness in how a third-party relationship is assessed, governed or reviewed can leave manipulation or collusion insufficiently challenged.');
assert.equal(collusion.entryPoint, 'A third-party relationship continues, or changes, without the review the organisation intends to apply to it.');
assert.equal(collusion.mechanism, 'An actor uses the gap left by that weakness to obtain value or advantage through the relationship while it continues to appear routine.');
assert.equal(collusion.consequence, 'Value or advantage can move through a third-party relationship before the arrangement is independently challenged.');
assert.equal(collusion.immediateContainment, 'Pause the affected third-party activity where proportionate, preserve the relevant relationship and decision records, and complete the review required by the linked control before further commitment.');
assert.equal(collusion.longTermResponse, 'Apply the assessment, governance and review disciplines identified by the linked findings consistently across the third-party population, with defined ownership, evidence and escalation.');
// Member-derived, not a hardcoded family assertion.
assert.equal(collusion.currentControlWeakness, `"${promptFor('D7-Q05').replace(/\.$/, '')}" is recorded as "Initial / ad hoc".`, 'the weakness quotes the linked condition and its recorded response');
for (const other of ['D7-Q02', 'D7-Q03', 'D7-Q06', 'D7-Q07', 'D2-Q05']) {
  assert.equal(collusion.currentControlWeakness.includes(promptFor(other).replace(/\.$/, '')), false, `no other member is asserted: ${other}`);
}
// Indicators come only from D7-Q05's own playbook.
for (const indicator of ['A high-risk third party is overdue for periodic review', 'An ownership change is detected without reassessment', 'Pricing drifts away from the agreed basis without challenge']) {
  assert.equal(collusion.warningIndicators.includes(indicator), true, `missing D7-Q05 indicator: ${indicator}`);
}
for (const foreign of ['Award criteria are set or changed after bid opening', 'An unjustified single-source award', 'An employee and supplier interest match is not investigated', 'A declared conflict has no recorded management action', 'Undisclosed sub-contracting by an intermediary']) {
  assert.equal(collusion.warningIndicators.includes(foreign), false, `foreign indicator leaked: ${foreign}`);
}

// The explicit truth requirement: a D7-Q05-only scenario asserts none of these.
// Only the family-level generated language is scanned. Member-derived fields
// (currentControlWeakness, requiredControlResponse, warningIndicators) are authorised by the
// linked finding's own authoritative playbook, which is exactly what the owner permits.
const FAMILY_LEVEL_FIELDS = ['title', 'actorClass', 'opportunity', 'entryPoint', 'mechanism', 'concealment', 'consequence', 'immediateContainment', 'longTermResponse'];
const collusionText = FAMILY_LEVEL_FIELDS.map((field) => collusion[field]).join(' ');
for (const [label, pattern] of [
  ['bank-detail or payment-instruction', /bank[- ]detail|banking detail|payment[- ]instruction/i],
  ['supplier onboarding', /onboard/i],
  ['bid rigging', /bid rig|bid rotation|rotated? (?:winning )?bid|bid opening|single-source/i],
  ['conflict of interest', /conflict of interest|undisclosed interest|declared conflict/i],
  ['fictitious supplier', /fictitious supplier|false supplier|ghost supplier/i],
  ['supplier selection', /supplier selection|select(?:s|ing)? (?:a )?(?:third part|supplier|vendor)|sourcing decision|award/i],
  ['reward decisions', /reward|retain or reward/i],
  ['payment', /\bpayment\b|\bpay(?:able|ment)s?\b|invoice/i],
  ['delegated authority', /delegated authority|delegated collection/i],
  ['selection or approval trail', /approval trail|selection trail/i]
]) {
  assert.equal(pattern.test(collusionText), false, `D7-Q05-only scenario must not claim ${label}: ${collusionText.match(pattern)}`);
}
// It remains conditional, never an allegation that collusion occurred.
assert.equal(/collusion (?:has |had )?occurred|is colluding|colluded/i.test(collusionText), false, 'the scenario must stay conditional');

// No supplier-payment scenario is fabricated: those controls are recorded as adequate.
assert.equal(pack.scenarios.some((s) => s.scenarioFamily === 'SUPPLIER_PAYMENT_DIVERSION'), false);

// ---------------------------------------------------------------------------
// Negative cases.
// ---------------------------------------------------------------------------
// Adequate third-party responses produce no third-party scenario at all.
const strong = buildData({ 'D7-Q02': 4, 'D7-Q03': 4, 'D7-Q05': 4, 'D7-Q06': 4, 'D7-Q07': 4, 'D2-Q05': 4 });
const strongModel = buildAdvisoryEvidenceModel(strong);
const { pack: strongPack } = packFor(strong, strongModel);
assert.equal(strongPack.scenarios.some((s) => s.scenarioFamily === 'THIRD_PARTY_COLLUSION'), false, 'adequate third-party responses must not instantiate the family');

// A weak but non-eligible question cannot instantiate the family.
const d6 = buildData({ 'D7-Q02': 4, 'D7-Q03': 4, 'D7-Q05': 4, 'D7-Q06': 4, 'D7-Q07': 4, 'D2-Q05': 4, 'D6-Q05': 0 });
const d6Model = buildAdvisoryEvidenceModel(d6);
assert.equal(d6Model.materialFindings.some((f) => f.questionCode === 'D6-Q05' && f.fraudPathwayFamilies.length > 0), false, 'D6-Q05 carries no pathway');
const { pack: d6Pack } = packFor(d6, d6Model);
assert.equal(d6Pack.scenarios.some((s) => s.scenarioFamily === 'THIRD_PARTY_COLLUSION'), false, 'D6-Q05 must not instantiate the family');

// Sustainment stays at zero scenarios; the sparse contract is unchanged.
const planFor = (candidate) => assertNarrativeStoryPlan(buildNarrativeStoryPlan(candidate), candidate);
assert.throws(() => planFor({ ...pack, narrativeMode: 'SUSTAINMENT', findings: [] }), /Sustainment Story Plan must contain no automated fraud scenarios/);
const noScenarioPack = { ...pack, scenarios: [], narrativeBounds: { ...pack.narrativeBounds, scenarioCount: 0 } };
assert.throws(() => planFor(noScenarioPack), /Essential Story Plan contains an invalid scenario count/);
assert.doesNotThrow(() => planFor({ ...noScenarioPack, highReadinessSparseNarrativeReason: 'Only 3 material findings met the deterministic selection threshold for this high-readiness profile; the narrative remains sparse to preserve the assessed result and does not invent additional weaknesses.' }));

// ---------------------------------------------------------------------------
// The real semantic pre-AI contract, not just the Story Plan assertion.
// ---------------------------------------------------------------------------
const writerBrief = buildNarrativeWriterBrief(pack, plan);
const gateReport = runPreAiFactPackGates(pack, plan, writerBrief);
// The gate that this correction exists to satisfy.
const pathwayGate = gateReport.results.find((r) => r.gate === 'scenario-pathways');
assert.ok(pathwayGate && pathwayGate.status === 'PASS', 'the scenario-pathways gate must accept THIRD_PARTY_COLLUSION');
assert.ok(gateReport.results.find((r) => r.gate === 'scenario-source-compatibility')?.status === 'PASS', 'scenario families must be supported by linked finding pathway mappings');
assert.ok(gateReport.results.find((r) => r.gate === 'SCENARIO-FIELD-INTEGRITY')?.status === 'PASS', 'scenario fields must distinguish recorded weakness from required response');
assert.ok(gateReport.results.find((r) => r.gate === 'writer-brief-purity')?.status === 'PASS', 'the sanitized writer payload must stay free of internal identifiers');
assert.ok(gateReport.results.find((r) => r.gate === 'story-plan-bounds')?.status === 'PASS', 'Story Plan bounds must match the Fact Pack narrative core');
// ROADMAP-TARGET-PRESERVATION is a pre-existing property of this assessment's finding set: every
// selected finding's playbook targets 60 or 90 days, so the roadmap carries no "30 days" item.
// It fails identically before this candidate and is unrelated to the scenario taxonomy. It is
// pinned here so any future change to it is deliberate, not silent.
const failedGates = gateReport.results.filter((r) => r.status !== 'PASS').map((r) => r.gate);
assert.deepEqual(failedGates, ['ROADMAP-TARGET-PRESERVATION'], `unexpected pre-AI gate failure: ${gateReport.results.filter((r) => r.status !== 'PASS').map((r) => `${r.gate}: ${r.detail}`).join(' | ')}`);

// ---------------------------------------------------------------------------
// Owner-review variants: complete generated fact for each shape.
// ---------------------------------------------------------------------------
const SCENARIO_FIELDS = ['title','actorClass','opportunity','entryPoint','mechanism','currentControlWeakness','requiredControlResponse','concealment','consequence','immediateContainment','longTermResponse','warningIndicators','linkedFindingIds','linkedRiskIds'];
function variant(label, overrides) {
  const vData = buildData(overrides);
  const vModel = buildAdvisoryEvidenceModel(vData);
  const { pack: vPack } = packFor(vData, vModel);
  const scenario = vPack.scenarios.find((x) => x.scenarioFamily === 'THIRD_PARTY_COLLUSION');
  assert.ok(scenario, `${label}: THIRD_PARTY_COLLUSION scenario must be generated`);
  // Every field of the generated fact is populated and asserted present.
  for (const field of SCENARIO_FIELDS) {
    const value = scenario[field];
    assert.ok(Array.isArray(value) ? value.length > 0 : Boolean(String(value ?? '').trim()), `${label}: ${field} is empty`);
  }
  // Shared family-level language is identical across every shape.
  assert.equal(scenario.title, 'Third-party relationship manipulation or collusion escapes timely challenge');
  assert.equal(scenario.opportunity, collusion.opportunity);
  assert.equal(scenario.entryPoint, collusion.entryPoint);
  assert.equal(scenario.mechanism, collusion.mechanism);
  assert.equal(scenario.consequence, collusion.consequence);
  assert.equal(scenario.immediateContainment, collusion.immediateContainment);
  assert.equal(scenario.longTermResponse, collusion.longTermResponse);
  // Member-derived fields name only the actually linked members.
  for (const id of scenario.linkedFindingIds) {
    const code = id.replace('MF-', '');
    assert.ok(scenario.currentControlWeakness.includes(promptFor(code).replace(/\.$/, '')), `${label}: weakness must quote the condition for ${code}`);
  }
  assert.match(scenario.currentControlWeakness, /^("[^"]+" is recorded as "[^"]+"\.\s?)+$/, `${label}: weakness must be quoted condition and quoted recorded response`);
  // Family-level language never carries a concept the linked members do not establish.
  const famText = FAMILY_LEVEL_FIELDS.map((f) => scenario[f]).join(' ');
  for (const pattern of [/bank[- ]detail|payment[- ]instruction/i, /onboard/i, /bid rig|bid opening|single-source/i, /conflict of interest/i, /\bpayment\b|invoice/i, /delegated authority/i, /approval trail/i, /reward/i]) {
    assert.equal(pattern.test(famText), false, `${label}: family-level language must not assert ${pattern}`);
  }
  const vPlan = buildNarrativeStoryPlan(vPack);
  assert.doesNotThrow(() => assertNarrativeStoryPlan(vPlan, vPack), `${label}: Story Plan must pass`);
  const vGate = runPreAiFactPackGates(vPack, vPlan, buildNarrativeWriterBrief(vPack, vPlan));
  assert.equal(vGate.results.find((r) => r.gate === 'scenario-pathways')?.status, 'PASS', `${label}: scenario-pathways must accept the family`);
  const vFailed = vGate.results.filter((r) => r.status !== 'PASS').map((r) => r.gate);
  assert.deepEqual(vFailed, ['ROADMAP-TARGET-PRESERVATION'], `${label}: unexpected pre-AI gate failure: ${vFailed.join(' | ')}`);
  return { label, scenario, scenarioCount: vPack.scenarios.length, families: vPack.scenarios.map((x) => x.scenarioFamily) };
}
const variants = [
  variant('1 - D7-Q05 only (real affected order)', {}),
  variant('2 - D7-Q02 / D7-Q03 procurement and conflict', { 'D7-Q02': 0, 'D7-Q03': 0, 'D7-Q05': 3 }),
  variant('3 - D2-Q05 third-party fraud-risk assessment', { 'D2-Q05': 0, 'D7-Q05': 3 })
];
assert.equal(variants[0].scenario.linkedFindingIds.join(','), 'MF-D7-Q05');

console.log(JSON.stringify({
  status: 'PASS', providerCalls: 0, aiCalls: 0,
  before: { scenarioCount: beforePack.scenarios.length, families: beforePack.scenarios.map((s) => s.scenarioFamily), storyPlan: 'FAILS' },
  after: { scenarioCount: pack.scenarios.length, families: pack.scenarios.map((s) => s.scenarioFamily), storyPlan: 'PASSES' },
  selectedFindings: projection.findings.map((f) => f.questionCode),
  collusionLinkedFindings: collusion.linkedFindingIds,
  collusionLinkedRisks: collusion.linkedRiskIds,
  eligibleQuestions: mapped,
  preAiGateScenarioPathways: pathwayGate.status,
  preAiGateKnownPreExistingFailure: failedGates,
  variants: variants.map((v) => ({ variant: v.label, scenarioCount: v.scenarioCount, families: v.families, scenario: v.scenario }))
}, null, 2));
