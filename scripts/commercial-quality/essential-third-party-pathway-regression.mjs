#!/usr/bin/env node
/**
 * Essential pre-AI scenario-count regression, replaying the real failing assessment shape.
 *
 * An anonymised replay of the affected Essential assessment: question identities, response
 * values, weights, criticality and domain scores are retained because they determine
 * materiality; customer, respondent and order identities are deliberately absent.
 *
 * The assessment scores 57.29 / Developing, so the high-readiness sparse-profile contract
 * legitimately does not apply and the Essential Story Plan requires 2 to 3 scenarios. Five
 * THIRD_PARTY_OVERSIGHT controls carried no fraudPathwayFamilies even though the approved
 * SUPPLIER_PAYMENT_DIVERSION pathway already declares THIRD_PARTY_OVERSIGHT as an anchor
 * family, so the only surviving pathway was DETECTION_EVASION and the Story Plan failed
 * closed at one scenario.
 *
 * This test is deterministic and cannot reach a provider, a database or a network.
 */
import assert from 'node:assert/strict';

import { syntheticOrgFixture } from '../../src/lib/reports/evidence-model/__fixtures__/synthetic-org-fixture.ts';
import { buildAdvisoryEvidenceModel } from '../../src/lib/reports/evidence-model/index.ts';
import { buildEssentialProjection } from '../../src/lib/reports/essential-projection.ts';
import { buildEssentialNarrativeFactPack } from '../../src/lib/reports/narrative/fact-pack.ts';
import { buildNarrativeStoryPlan, assertNarrativeStoryPlan } from '../../src/lib/reports/narrative/story-plan.ts';
import { FRAUD_PATHWAY_FAMILIES_BY_QUESTION, PRIMARY_SEMANTIC_FAMILY_BY_QUESTION } from '../../src/lib/reports/evidence-model/semantic-mappings.ts';

const THIRD_PARTY_OVERSIGHT_CONTROLS = ['D7-Q02', 'D7-Q03', 'D7-Q05', 'D7-Q06', 'D7-Q07'];

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
  'D1-Q01': 1.5, 'D1-Q02': 1.25, 'D1-Q03': 1.25, 'D1-Q04': 1.0, 'D1-Q05': 1.0, 'D1-Q06': 1.0, 'D1-Q07': 0.5,
  'D2-Q01': 1.5, 'D2-Q02': 1.5, 'D2-Q03': 1.25, 'D2-Q04': 1.0, 'D2-Q05': 1.25, 'D2-Q06': 1.0, 'D2-Q07': 1.25, 'D2-Q08': 1.0,
  'D3-Q01': 1.5, 'D3-Q02': 1.25, 'D3-Q03': 1.5, 'D3-Q04': 1.0, 'D3-Q05': 1.25, 'D3-Q06': 1.0, 'D3-Q07': 1.0, 'D3-Q08': 0.5, 'D3-Q09': 0.5, 'D3-Q10': 0.5, 'D3-Q11': 0.5,
  'D4-Q01': 1.5, 'D4-Q02': 1.25, 'D4-Q03': 1.5, 'D4-Q04': 1.0, 'D4-Q05': 0.5, 'D4-Q06': 1.25, 'D4-Q07': 1.0, 'D4-Q08': 0.5,
  'D5-Q01': 1.5, 'D5-Q03': 1.25, 'D5-Q04': 1.25, 'D5-Q05': 1.5, 'D5-Q06': 1.0,
  'D6-Q01': 1.5, 'D6-Q02': 1.25, 'D6-Q03': 1.25, 'D6-Q04': 1.0, 'D6-Q05': 1.0,
  'D7-Q01': 1.5, 'D7-Q02': 1.25, 'D7-Q03': 1.25, 'D7-Q04': 1.5, 'D7-Q05': 1.0, 'D7-Q06': 1.0, 'D7-Q07': 1.0,
  'D8-Q01': 1.5, 'D8-Q02': 1.5, 'D8-Q03': 1.25, 'D8-Q04': 1.0, 'D8-Q06': 1.0, 'D8-Q07': 1.0, 'D8-Q08': 1.0, 'D8-Q09': 0.5, 'D8-Q10': 0.5,
  'D9-Q01': 1.25, 'D9-Q02': 1.0, 'D9-Q03': 1.25, 'D9-Q05': 1.0,
  'D10-Q01': 1.5, 'D10-Q02': 1.25, 'D10-Q03': 1.25, 'D10-Q06': 1.25
};
const critical = new Set(['D1-Q01', 'D1-Q04', 'D2-Q01', 'D2-Q02', 'D3-Q01', 'D3-Q03', 'D3-Q04', 'D4-Q01', 'D4-Q03', 'D5-Q01', 'D5-Q05', 'D6-Q01', 'D7-Q01', 'D7-Q04', 'D8-Q01', 'D8-Q02', 'D8-Q04', 'D8-Q08', 'D10-Q01']);
const hardGates = new Set([...critical].filter((code) => code !== 'D6-Q01' && code !== 'D7-Q01'));
const criticalGaps = new Set(['D10-Q01', 'D2-Q01', 'D4-Q01', 'D4-Q03']);
const domainMeta = {
  D1: { name: 'Fraud Leadership and Governance', score: 77.33, weight: 12 },
  D2: { name: 'Fraud Risk Identification', score: 47.69, weight: 12 },
  D3: { name: 'Operational Fraud Controls', score: 58.10, weight: 14 },
  D4: { name: 'Fraud Detection Capability', score: 40.00, weight: 14 },
  D5: { name: 'Fraud Incident Response', score: 76.92, weight: 10 },
  D6: { name: 'Whistleblowing and Reporting Culture', score: 63.33, weight: 6 },
  D7: { name: 'Third-Party and Supply Chain Fraud Risk', score: 44.71, weight: 10 },
  D8: { name: 'Digital and Identity Fraud Risk', score: 56.76, weight: 12 },
  D9: { name: 'Fraud Culture and Awareness', score: 75.56, weight: 5 },
  D10: { name: 'Continuous Improvement and Fraud Risk Monitoring', score: 40.00, weight: 5 }
};

const questionTraces = Object.entries(responses).map(([questionCode, responseValue]) => {
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

const data = {
  ...structuredClone(syntheticOrgFixture),
  organisationName: 'Offline Essential third-party pathway regression fixture',
  assessmentReference: 'OFFLINE-ESSENTIAL-THIRD-PARTY-PATHWAY',
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

function packFor(evidenceModel) {
  const projection = buildEssentialProjection(data, evidenceModel);
  return { projection, pack: buildEssentialNarrativeFactPack(data, evidenceModel, projection) };
}

// ---------------------------------------------------------------------------
// The corrected evidence model.
// ---------------------------------------------------------------------------
const fixedEvidenceModel = buildAdvisoryEvidenceModel(data);
const { projection: fixedProjection, pack: fixedPack } = packFor(fixedEvidenceModel);

// The high-readiness sparse-profile contract legitimately does not cover this assessment:
// the score is below 60 and the maturity is Developing, so the 2 to 3 range applies in full.
assert.equal(fixedPack.highReadinessSparseNarrativeReason, undefined, 'this profile is not high-readiness sparse');
assert.equal(fixedPack.narrativeMode, 'REMEDIATION');
assert.equal(fixedPack.findings.length, 8, 'the finding narrative core is unchanged');

// The five third-party oversight controls now carry the already-approved pathway family.
for (const questionCode of THIRD_PARTY_OVERSIGHT_CONTROLS) {
  assert.equal(PRIMARY_SEMANTIC_FAMILY_BY_QUESTION[questionCode], 'THIRD_PARTY_OVERSIGHT');
  assert.deepEqual(FRAUD_PATHWAY_FAMILIES_BY_QUESTION[questionCode], ['SUPPLIER_PAYMENT_DIVERSION'], `${questionCode} must carry the approved supplier pathway`);
}

// The scenario is evidence-backed: D7-Q05 is a selected material finding of this assessment.
const selectedD7 = fixedProjection.findings.find((finding) => finding.questionCode === 'D7-Q05');
assert.ok(selectedD7, 'D7-Q05 must be a selected material finding');
assert.deepEqual(selectedD7.fraudPathwayFamilies, ['SUPPLIER_PAYMENT_DIVERSION']);

assert.equal(fixedPack.scenarios.length, 2, 'the corrected Fact Pack carries two evidence-backed scenarios');
assert.deepEqual(fixedPack.scenarios.map((scenario) => scenario.scenarioFamily), ['DETECTION_EVASION', 'SUPPLIER_PAYMENT_DIVERSION']);
assert.ok(fixedPack.scenarios.every((scenario) => scenario.linkedFindingRefs.length > 0 && scenario.linkedRiskRefs.length > 0), 'every scenario stays linked to real findings and risks');

const fixedPlan = buildNarrativeStoryPlan(fixedPack);
assert.doesNotThrow(() => assertNarrativeStoryPlan(fixedPlan, fixedPack));
assert.equal(fixedPlan.narrativeBounds.scenarioCount, 2);

// No scenario is fabricated: families with no approved fraud pathway stay unmapped.
for (const questionCode of ['D1-Q01', 'D2-Q01', 'D10-Q01', 'D3-Q06', 'D8-Q06', 'D9-Q01']) {
  assert.equal(FRAUD_PATHWAY_FAMILIES_BY_QUESTION[questionCode], undefined, `${questionCode} must not gain a pathway`);
}
const unmappedSelected = fixedProjection.findings.filter((finding) => finding.fraudPathwayFamilies.length === 0).map((finding) => finding.questionCode);
assert.deepEqual(unmappedSelected.sort(), ['D10-Q01', 'D2-Q01', 'D3-Q06', 'D3-Q07', 'D8-Q06'], 'governance, risk-identification, improvement, access and awareness findings remain without a fraud pathway');

// ---------------------------------------------------------------------------
// The reported Production failure, reconstructed by removing only the corrected mapping.
// ---------------------------------------------------------------------------
const legacyEvidenceModel = {
  ...fixedEvidenceModel,
  materialFindings: fixedEvidenceModel.materialFindings.map((finding) => THIRD_PARTY_OVERSIGHT_CONTROLS.includes(finding.questionCode)
    ? { ...finding, fraudPathwayFamilies: [] }
    : finding)
};
const { pack: legacyPack } = packFor(legacyEvidenceModel);
assert.equal(legacyPack.scenarios.length, 1, 'the reported failure shape carries a single pathway');
assert.deepEqual(legacyPack.scenarios.map((scenario) => scenario.scenarioFamily), ['DETECTION_EVASION']);
assert.equal(legacyPack.highReadinessSparseNarrativeReason, undefined);
assert.throws(
  () => assertNarrativeStoryPlan(buildNarrativeStoryPlan(legacyPack), legacyPack),
  /Essential Story Plan contains an invalid scenario count for the assessed readiness profile/
);

// ---------------------------------------------------------------------------
// The Essential scenario-count contract itself is unchanged and still fails closed.
// ---------------------------------------------------------------------------
// Each case derives its Story Plan from its own Fact Pack so only the scenario-count rule is
// under test, never an artificially inconsistent plan.
const planFor = (pack) => assertNarrativeStoryPlan(buildNarrativeStoryPlan(pack), pack);

const noScenarioPack = { ...fixedPack, scenarios: [], narrativeBounds: { ...fixedPack.narrativeBounds, scenarioCount: 0 } };
assert.throws(
  () => planFor(noScenarioPack),
  /Essential Story Plan contains an invalid scenario count/,
  'zero scenarios must still fail closed for a non-sparse Essential profile'
);

// Sustainment behaviour is untouched. Sustainment carries no customer-facing findings, so the
// scenario rule is isolated by removing them; both Sustainment guards still fail closed.
assert.throws(
  () => planFor({ ...fixedPack, narrativeMode: 'SUSTAINMENT' }),
  /Sustainment Story Plan must contain no customer-facing findings/
);
assert.throws(
  () => planFor({ ...fixedPack, narrativeMode: 'SUSTAINMENT', findings: [] }),
  /Sustainment Story Plan must contain no automated fraud scenarios/
);

// The existing high-readiness sparse contract still permits zero scenarios, unchanged.
assert.doesNotThrow(
  () => planFor({
    ...noScenarioPack,
    highReadinessSparseNarrativeReason: 'Only 3 material findings met the deterministic selection threshold for this high-readiness profile; the narrative remains sparse to preserve the assessed result and does not invent additional weaknesses.'
  }),
  'the existing sparse/high-readiness contract is unchanged'
);

console.log(JSON.stringify({
  status: 'PASS',
  providerCalls: 0,
  aiCalls: 0,
  assessmentProfile: { overallScore: 57.29, finalMaturity: 'Developing', highReadinessSparse: false, permittedScenarioRange: '2-3' },
  reportedFailureScenarioCount: legacyPack.scenarios.length,
  reportedFailureFamilies: legacyPack.scenarios.map((scenario) => scenario.scenarioFamily),
  correctedScenarioCount: fixedPack.scenarios.length,
  correctedFamilies: fixedPack.scenarios.map((scenario) => scenario.scenarioFamily),
  evidenceBackedBy: selectedD7.questionCode,
  findingsWithoutPathway: unmappedSelected
}, null, 2));
