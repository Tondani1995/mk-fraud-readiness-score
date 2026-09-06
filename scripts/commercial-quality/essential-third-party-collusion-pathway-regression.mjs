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
import { FRAUD_PATHWAY_FAMILIES, FRAUD_PATHWAY_FAMILIES_BY_QUESTION } from '../../src/lib/reports/evidence-model/semantic-mappings.ts';

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
      prompt: `Anonymised ${questionCode} control response.`,
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
assert.equal(collusion.opportunity, 'Third-party relationships, and the decisions that select, retain or reward them, are not yet subject to sufficiently independent and current review.');
assert.equal(collusion.entryPoint, 'A third-party relationship, or a decision affecting one, proceeds without timely independent challenge.');
assert.equal(collusion.mechanism, 'An actor uses influence over a third-party relationship, or authority delegated through it, to move value or obtain advantage while the arrangement continues to appear routine.');
assert.equal(collusion.consequence, 'Value or advantage can move through a third-party relationship before the arrangement is independently challenged.');
assert.equal(collusion.immediateContainment, 'Pause further commitment, payment or delegated authority on the affected third-party relationship, independently confirm its current ownership, control and pricing basis, and preserve the selection and approval trail.');
assert.equal(collusion.longTermResponse, 'Implement risk-tiered third-party assessment, periodic re-review of high-risk relationships and independent oversight of the decisions that select, retain or reward a third party.');
// Member-derived, not a hardcoded family assertion.
assert.match(collusion.currentControlWeakness, /D7-Q05/, 'the weakness is derived from the linked finding');
assert.equal(/D7-Q02|D7-Q03|D7-Q06|D7-Q07|D2-Q05/.test(collusion.currentControlWeakness), false, 'no other member is asserted');
// Indicators come only from D7-Q05's own playbook.
for (const indicator of ['A high-risk third party is overdue for periodic review', 'An ownership change is detected without reassessment', 'Pricing drifts away from the agreed basis without challenge']) {
  assert.equal(collusion.warningIndicators.includes(indicator), true, `missing D7-Q05 indicator: ${indicator}`);
}
for (const foreign of ['Award criteria are set or changed after bid opening', 'An unjustified single-source award', 'An employee and supplier interest match is not investigated', 'A declared conflict has no recorded management action', 'Undisclosed sub-contracting by an intermediary']) {
  assert.equal(collusion.warningIndicators.includes(foreign), false, `foreign indicator leaked: ${foreign}`);
}

// The explicit truth requirement: a D7-Q05-only scenario asserts none of these.
const collusionText = Object.values(collusion).flatMap((v) => Array.isArray(v) ? v : [v]).filter((v) => typeof v === 'string').join(' ');
for (const [label, pattern] of [
  ['bank-detail change', /bank[- ]detail|bank detail|banking detail/i],
  ['payment-instruction verification', /payment[- ]instruction/i],
  ['supplier onboarding', /onboard/i],
  ['bid rigging', /bid rig|bid rotation|rotated? (?:winning )?bid|bid opening/i],
  ['conflict of interest', /conflict of interest|undisclosed interest|declared conflict/i],
  ['fictitious supplier', /fictitious supplier|false supplier|ghost supplier/i]
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

console.log(JSON.stringify({
  status: 'PASS', providerCalls: 0, aiCalls: 0,
  before: { scenarioCount: beforePack.scenarios.length, families: beforePack.scenarios.map((s) => s.scenarioFamily), storyPlan: 'FAILS' },
  after: { scenarioCount: pack.scenarios.length, families: pack.scenarios.map((s) => s.scenarioFamily), storyPlan: 'PASSES' },
  selectedFindings: projection.findings.map((f) => f.questionCode),
  collusionLinkedFindings: collusion.linkedFindingIds,
  collusionLinkedRisks: collusion.linkedRiskIds,
  eligibleQuestions: mapped
}, null, 2));
