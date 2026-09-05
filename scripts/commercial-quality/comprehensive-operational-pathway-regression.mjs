#!/usr/bin/env node
import assert from 'node:assert/strict';
import { syntheticOrgFixture } from '../../src/lib/reports/evidence-model/__fixtures__/synthetic-org-fixture.ts';
import { buildComprehensiveDeliveryModel, fromAssembledReportData } from '../../src/lib/reports/comprehensive/contract.ts';
import { buildComprehensiveNarrativeFactPack } from '../../src/lib/reports/narrative/fact-pack.ts';
import { assertNarrativeStoryPlan, buildNarrativeStoryPlan } from '../../src/lib/reports/narrative/story-plan.ts';

// An anonymised replay of the affected locked score shape. Question identities, responses and
// domain scores are retained because they determine materiality; customer and order identities are
// deliberately absent. This test is deterministic and cannot reach a provider or database.
const responses = {
  'D1-Q01': 2, 'D1-Q02': 2, 'D1-Q03': 3, 'D1-Q04': 5, 'D1-Q05': 5, 'D1-Q06': 4, 'D1-Q07': 2,
  'D2-Q01': 3, 'D2-Q02': 4, 'D2-Q03': 1, 'D2-Q04': 5, 'D2-Q05': 2, 'D2-Q06': 5, 'D2-Q07': 1, 'D2-Q08': 1,
  'D3-Q01': 2, 'D3-Q02': 3, 'D3-Q03': 2, 'D3-Q04': 3, 'D3-Q05': 1, 'D3-Q06': 2, 'D3-Q07': 3, 'D3-Q08': 4, 'D3-Q09': 3, 'D3-Q10': null, 'D3-Q11': 4,
  'D4-Q01': 3, 'D4-Q02': 1, 'D4-Q03': 3, 'D4-Q04': 5, 'D4-Q05': 4, 'D4-Q06': 3, 'D4-Q07': 5, 'D4-Q08': 2,
  'D5-Q01': 3, 'D5-Q03': 4, 'D5-Q04': 5, 'D5-Q05': 4, 'D5-Q06': 3,
  'D6-Q01': 3, 'D6-Q02': 5, 'D6-Q03': 4, 'D6-Q04': 3, 'D6-Q05': 4,
  'D7-Q01': 3, 'D7-Q02': 4, 'D7-Q03': 3, 'D7-Q04': 4, 'D7-Q05': 3, 'D7-Q06': 4, 'D7-Q07': 3,
  'D8-Q01': 5, 'D8-Q02': 5, 'D8-Q03': 5, 'D8-Q04': 4, 'D8-Q06': 4, 'D8-Q07': 5, 'D8-Q08': 3, 'D8-Q09': 4, 'D8-Q10': 3,
  'D9-Q01': 4, 'D9-Q02': 3, 'D9-Q03': 4, 'D9-Q05': 3,
  'D10-Q01': 4, 'D10-Q02': 3, 'D10-Q03': 4, 'D10-Q06': 0
};

const critical = new Set(['D1-Q01', 'D1-Q04', 'D2-Q01', 'D2-Q02', 'D3-Q01', 'D3-Q03', 'D3-Q04', 'D4-Q01', 'D4-Q03', 'D5-Q01', 'D5-Q05', 'D6-Q01', 'D7-Q01', 'D7-Q04', 'D8-Q01', 'D8-Q02', 'D8-Q04', 'D8-Q08', 'D10-Q01']);
const hardGates = new Set([...critical].filter((code) => code !== 'D6-Q01' && code !== 'D7-Q01'));
const domainNames = Object.fromEntries(syntheticOrgFixture.domainResults.map((domain) => [domain.domainCode, domain.domainName]));
const domainScores = { D1: 64.67, D2: 54.36, D3: 49, D4: 63.53, D5: 76.15, D6: 75.83, D7: 68.82, D8: 88.11, D9: 71.11, D10: 56.19 };
const questionTraces = Object.entries(responses).map(([questionCode, responseValue]) => {
  const domainCode = questionCode.split('-')[0];
  return {
    questionCode, domainCode, domainName: domainNames[domainCode], prompt: `Anonymised ${questionCode} control response.`,
    responseValue, normalisedScore: responseValue === null ? null : responseValue * 20,
    applicable: responseValue !== null, triggeredRules: [], isCritical: critical.has(questionCode),
    isHardGate: hardGates.has(questionCode), isCriticalGap: ['D1-Q01', 'D3-Q01', 'D3-Q03'].includes(questionCode), isMajorGap: false
  };
});

const data = {
  ...structuredClone(syntheticOrgFixture),
  organisationName: 'Offline operational-control regression fixture', assessmentReference: 'OFFLINE-COMPREHENSIVE-REGRESSION',
  scoreRun: {
    id: 'offline-score-run', assessmentId: 'offline-assessment', methodologyVersionId: 'offline-v12', methodologyVersionCode: 'MFRS-V1.2',
    status: 'completed', lockedAt: '2026-09-05T00:00:00.000Z', inputHash: 'offline', overallScore: 66.02,
    calculatedMaturity: 'Structured', finalMaturity: 'Developing', exposureScore: null, exposureBand: null,
    coveragePct: 100, nARatePct: 0, criticalGapCount: 3, majorGapCount: 0, capApplied: true,
    capReason: 'Three or more critical controls scored 0, 1 or 2.'
  },
  domainResults: syntheticOrgFixture.domainResults.map((domain) => ({ ...domain, rawScore: domainScores[domain.domainCode] })),
  questionTraces,
  criticalMajorGaps: questionTraces.filter((trace) => trace.isCriticalGap || trace.isMajorGap),
  exposureAnswers: [], adaptiveScope: { exposureAssessed: false },
  maturityCapEvents: [{ ruleCode: 'any_hard_gate_critical_control_eq_2', capTo: 'Structured', reason: 'Hard-gate control scored 2.', relatedQuestionCode: 'D1-Q01', relatedQuestionPrompt: 'Anonymised control.', relatedDomainCode: 'D1', relatedDomainName: domainNames.D1 }]
};

const fixedModel = await fromAssembledReportData(data);
const findingCodes = fixedModel.materialFindings.map((finding) => finding.questionCode);
assert.deepEqual(findingCodes, ['D1-Q01', 'D3-Q03', 'D3-Q01', 'D10-Q06', 'D2-Q03', 'D3-Q05']);

// Reconstruct the former evidence-model gap to prove this fixture reaches the reported failure.
const legacyEvidenceModel = {
  ...fixedModel.analytical.evidenceModel,
  materialFindings: fixedModel.materialFindings.map((finding) => finding.questionCode === 'D3-Q05'
    ? { ...finding, fraudPathwayFamilies: [] }
    : finding)
};
const legacyModel = buildComprehensiveDeliveryModel({ ...fixedModel.analytical, evidenceModel: legacyEvidenceModel });
const legacyPack = buildComprehensiveNarrativeFactPack(legacyModel);
assert.deepEqual(legacyPack.scenarios.map((scenario) => scenario.scenarioFamily), ['SUPPLIER_PAYMENT_DIVERSION']);
assert.throws(
  () => assertNarrativeStoryPlan(buildNarrativeStoryPlan(legacyPack), legacyPack),
  /Comprehensive Story Plan contains an invalid scenario count/
);

const pack = buildComprehensiveNarrativeFactPack(fixedModel);
const plan = buildNarrativeStoryPlan(pack);
assert.doesNotThrow(() => assertNarrativeStoryPlan(plan, pack));
assert.deepEqual(pack.scenarios.map((scenario) => scenario.scenarioFamily), ['SUPPLIER_PAYMENT_DIVERSION', 'DETECTION_EVASION']);
assert.ok(pack.scenarios.every((scenario) => scenario.linkedFindingRefs.length > 0 && scenario.linkedRiskRefs.length > 0));
assert.equal(pack.scenarios.find((scenario) => scenario.scenarioFamily === 'DETECTION_EVASION')?.linkedFindingIds.includes('MF-D3-Q05'), true);

console.log(JSON.stringify({
  passed: true,
  retainedFindings: findingCodes,
  formerScenarioFamilies: legacyPack.scenarios.map((scenario) => scenario.scenarioFamily),
  correctedScenarioFamilies: pack.scenarios.map((scenario) => scenario.scenarioFamily),
  storyPlanScenarioCount: plan.narrativeBounds.scenarioCount,
  providerCalls: 0
}, null, 2));
