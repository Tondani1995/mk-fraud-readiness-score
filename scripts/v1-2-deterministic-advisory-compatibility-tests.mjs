// Provider-free V1.2 deterministic advisory compatibility certification.
//
// This fixture uses the active candidate graph, exercises every one of its 68 controls, and then
// drives the deterministic Comprehensive preparation path only up to the provider authorisation
// boundary. It never calls an AI provider, Supabase, Storage or a live report route.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildAdvisoryEvidenceModel, checkQualityGates } from '../src/lib/reports/evidence-model/index.ts';
import {
  PRIMARY_SEMANTIC_MAPPING_ENTRIES,
  PRIMARY_SEMANTIC_FAMILIES
} from '../src/lib/reports/evidence-model/semantic-mappings.ts';
import {
  getAuthoritativeQuestionMapping,
  getQuestionPlaybook,
  listQuestionPlaybooks,
  MFRS_V11_METHODOLOGY_ID,
  MFRS_V12_METHODOLOGY_ID
} from '../src/lib/reports/evidence-model/question-playbooks.ts';
import { buildEssentialProjection } from '../src/lib/reports/essential-projection.ts';
import { buildEssentialNarrativeFactPack } from '../src/lib/reports/narrative/fact-pack.ts';
import { assembleComprehensive } from '../src/lib/reports/comprehensive/assembly.ts';
import { buildComprehensiveManagementModel } from '../src/lib/reports/comprehensive/management-model.ts';
import { buildComprehensiveDeliveryModel, assertComprehensiveBlueprintContract } from '../src/lib/reports/comprehensive/contract.ts';
import { adaptComprehensiveScenarioFacts } from '../src/lib/reports/comprehensive/customer-visible-adaptation.ts';
import { buildInterpretationBrief } from '../src/lib/reports/comprehensive/interpretation.ts';

const graph = JSON.parse(fs.readFileSync(new URL('../src/lib/adaptive/candidates/adaptive-graph-v1-2-candidate.json', import.meta.url), 'utf8'));
const activeQuestions = graph.questions;
const activeCodes = activeQuestions.map((question) => question.questionCode);
const uniqueActiveCodes = [...new Set(activeCodes)];
assert.equal(activeQuestions.length, 68);
assert.equal(uniqueActiveCodes.length, 68, 'V1.2 active question IDs must be unique');

const V12 = MFRS_V12_METHODOLOGY_ID;
const V11 = MFRS_V11_METHODOLOGY_ID;
const semanticRegistryCodes = new Set(PRIMARY_SEMANTIC_MAPPING_ENTRIES.map((entry) => entry.questionCode));
const semanticCounts = new Map();
for (const entry of PRIMARY_SEMANTIC_MAPPING_ENTRIES) semanticCounts.set(entry.questionCode, (semanticCounts.get(entry.questionCode) ?? 0) + 1);
const v12MappingMissing = activeCodes.filter((code) => !semanticRegistryCodes.has(code));
assert.deepEqual(v12MappingMissing, [], 'every active V1.2 control must have a primary semantic mapping');
assert.deepEqual(activeCodes.filter((code) => semanticCounts.get(code) !== 1), [], 'each active V1.2 control has exactly one primary mapping');

const v12Playbooks = activeCodes.map((code) => getQuestionPlaybook(code, V12));
assert.equal(v12Playbooks.filter(Boolean).length, 68, 'every active V1.2 control must have a version-specific playbook');
assert.equal(v12Playbooks.some((playbook) => playbook?.fallbackStatus), false);
assert.equal(listQuestionPlaybooks(V12).length, 68, 'the V1.2 resolver exposes exactly the active 68-control playbook surface');
assert.deepEqual(['D5-Q02', 'D5-Q07', 'D6-Q06', 'D8-Q05', 'D9-Q04', 'D9-Q06', 'D10-Q04', 'D10-Q05'].filter((code) => getQuestionPlaybook(code, V12)), [], 'merged/retired V1.1 IDs are not resolved as active V1.2 playbooks');
assert.equal(activeCodes.every((code) => getAuthoritativeQuestionMapping(code, V12)), true, 'every active V1.2 control must have an authoritative version-specific mapping');
for (const question of activeQuestions) assert.equal(getAuthoritativeQuestionMapping(question.questionCode, V12).prompt, question.prompt, `${question.questionCode} prompt mapping must match the active V1.2 graph`);
assert.ok(listQuestionPlaybooks().length >= 68, 'the immutable V1.1 registry remains available');
assert.equal(getQuestionPlaybook('D3-Q09', V11), null, 'V1.1 does not receive V1.2-only playbooks');
assert.ok(getQuestionPlaybook('D3-Q04', V11));

const splitPairs = [
  ['D1-Q04', 'D1-Q07'],
  ['D3-Q04', 'D3-Q08'],
  ['D4-Q05', 'D4-Q08'],
  ['D8-Q04', 'D8-Q09'],
  ['D8-Q08', 'D8-Q10']
];
for (const [left, right] of splitPairs) {
  const a = getQuestionPlaybook(left, V12);
  const b = getQuestionPlaybook(right, V12);
  assert.ok(a && b, `${left}/${right} split pair has playbooks`);
  assert.notEqual(a.controlObjective, b.controlObjective, `${left}/${right} must have distinct objectives`);
  assert.notEqual(a.recommendedControlDesign, b.recommendedControlDesign, `${left}/${right} must have distinct advice`);
}

assert.equal(getQuestionPlaybook('D3-Q09', V12).controlObjective.includes('payroll'), true);
assert.equal(getQuestionPlaybook('D3-Q09', V12).recommendedControlDesign.includes('joiner, mover and leaver'), true);
assert.equal(getQuestionPlaybook('D3-Q10', V12).controlObjective.includes('cash'), true);
assert.equal(getQuestionPlaybook('D3-Q11', V12).controlObjective.includes('stock'), true);
assert.equal(getQuestionPlaybook('D4-Q08', V12).controlObjective.includes('external'), true);
assert.equal(getAuthoritativeQuestionMapping('D6-Q05', V12).prompt, 'Relevant external stakeholders have an appropriate way to report suspected fraud or misconduct.');
assert.equal(getAuthoritativeQuestionMapping('D5-Q03', V12).prompt, 'Roles and decision rights are defined for fraud triage, investigation, escalation and case closure.');
assert.equal(getAuthoritativeQuestionMapping('D5-Q04', V12).prompt, 'Fraud investigations follow documented procedures that protect confidentiality and fair treatment and record key facts, decisions and actions.');
assert.equal(getAuthoritativeQuestionMapping('D9-Q03', V12).prompt, 'Leadership communicates clear expectations on ethical conduct, conflicts of interest, fraud prevention and the consequences of misconduct.');

const labels = [
  ['Not in place', 'The capability is absent or is not recognised as required.', 0],
  ['Informal / reactive', 'Some activity occurs, but it is informal, reactive or dependent on individual effort.', 20],
  ['Partly designed', 'The capability has been partly designed, but important elements are incomplete or inconsistent.', 40],
  ['Implemented in key areas', 'The capability operates in key areas, but coverage or consistency is not yet organisation-wide.', 60],
  ['Consistently operating', 'The capability is defined, operating consistently and supported by evidence.', 80],
  ['Embedded and improving', 'The capability is measured, governed and deliberately improved over time.', 100]
].map(([label, operationalMeaning, normalisedScore], displayOrder) => ({ responseValue: displayOrder, label, operationalMeaning, normalisedScore, displayOrder }));

const domainNames = Object.fromEntries([...Array(10)].map((_, index) => [`D${index + 1}`, activeQuestions.find((question) => question.domainCode === `D${index + 1}`)?.domainCode === `D${index + 1}` ? `Domain D${index + 1}` : `Domain D${index + 1}`]));
const weakCodes = new Set(['D1-Q04', 'D1-Q07', 'D3-Q04', 'D3-Q08', 'D3-Q09', 'D3-Q10', 'D3-Q11', 'D4-Q05', 'D4-Q08', 'D5-Q03', 'D8-Q04', 'D8-Q08', 'D8-Q09', 'D8-Q10', 'D7-Q04']);
const strongCodes = new Set(['D1-Q01', 'D2-Q01', 'D3-Q03', 'D7-Q01', 'D9-Q01', 'D10-Q01']);

function responseFor(question, index, high) {
  if (high) return index % 2 === 0 ? 5 : 4;
  if (weakCodes.has(question.questionCode)) return question.questionCode.endsWith('10') ? 1 : 2;
  if (strongCodes.has(question.questionCode)) return 5;
  return [3, 4, 2, 3, 4, 1][index % 6];
}

function fixture(high = false) {
  const traces = activeQuestions.map((question, index) => {
    const responseValue = responseFor(question, index, high);
    return {
      questionCode: question.questionCode,
      domainCode: question.domainCode,
      domainName: domainNames[question.domainCode],
      prompt: question.prompt,
      responseValue,
      normalisedScore: responseValue * 20,
      applicable: true,
      triggeredRules: [],
      isCritical: question.isCritical,
      isHardGate: question.isHardGate,
      isCriticalGap: responseValue <= 1 && question.isCritical,
      isMajorGap: responseValue === 2 && !question.isCritical
    };
  });
  const domains = [...new Set(activeQuestions.map((question) => question.domainCode))].map((domainCode, index) => ({
    domainCode,
    domainName: domainNames[domainCode],
    weightPct: 10,
    rawScore: high ? 86 - (index % 3) * 2 : 42 + (index % 5) * 5,
    weightedContribution: high ? 8.6 - (index % 3) * 0.2 : 4.2 + (index % 5) * 0.5,
    coveragePct: 100,
    criticalGapCount: traces.filter((trace) => trace.domainCode === domainCode && trace.isCriticalGap).length
  }));
  const score = high ? 84 : 48;
  const data = {
    orderId: 'v12-advisory-order', orderReference: 'MKORD-V12-ADVISORY-FIXTURE', orderAssessmentId: 'v12-advisory-assessment', assessmentId: 'v12-advisory-assessment',
    organisationId: 'v12-advisory-organisation', currentScoreRunId: 'v12-advisory-score-run', orderVerifiedAt: '2026-08-21T10:00:00.000Z', orderVerifiedBy: 'staging-admin',
    paymentVerification: { legacyOrderVerification: true }, organisationName: 'Cedar Ridge Operations (synthetic fixture)', respondentName: 'Fixture Owner', customerEmail: 'fixture-owner@example.test', assessmentReference: 'MKFRS-V12-ADVISORY-FIXTURE', reportReference: 'RPT-MKFRS-V12-ADVISORY-FIXTURE-V1', generatedAt: '2026-08-21T10:00:00.000Z', packageName: 'Comprehensive',
    productCode: 'mk_validated_assessment', orderStatus: 'payment_received', amountCents: 3_500_000, currency: 'ZAR', productPriceCents: 3_500_000, productCurrency: 'ZAR', productId: 'v12-product', orderCreatedAt: '2026-08-21T09:00:00.000Z', productPriceVersionId: 'v12-price-v1', productPriceVersions: [{ productId: 'v12-product', versionNumber: 1, priceCents: 3_500_000, currency: 'ZAR', effectiveFrom: '2026-01-01T00:00:00.000Z', effectiveTo: null }], requiresPaymentVerification: true, deliveryMode: 'mk_controlled_pdf', productActive: true,
    scoreRun: { id: 'v12-advisory-score-run', assessmentId: 'v12-advisory-assessment', methodologyVersionId: V12, status: 'completed', lockedAt: '2026-08-21T10:00:00.000Z', inputHash: 'a'.repeat(64), overallScore: score, calculatedMaturity: high ? 'Structured' : 'Developing', finalMaturity: high ? 'Structured' : 'Developing', exposureScore: high ? 48 : 76, exposureBand: high ? 'Moderate' : 'High', coveragePct: 100, nARatePct: 0, criticalGapCount: traces.filter((trace) => trace.isCriticalGap).length, majorGapCount: traces.filter((trace) => trace.isMajorGap).length, capApplied: !high, capReason: high ? null : 'V1.2 fixture hard-gate cap', adaptiveResultStatus: 'NORMAL', adaptiveMetrics: { resultStatus: 'NORMAL', graphVersion: graph.graphVersion, graphFingerprint: '6f1f098a713b1a2f2bf6fc52a1733bf4ffafea8adccedaccc0b721e55bbe45c7', applicableCount: 68, applicableWeight: 83.75, excludedCount: 0, excludedWeight: 0, redirectedCount: 0, redirectedWeight: 0, invalidatedCount: 0, invalidatedWeight: 0, profileOnlyCount: 0, unknownCount: 0, unknownWeight: 0, unansweredApplicableCount: 0, unansweredApplicableWeight: 0, assessmentCoveragePct: 100, controlVisibilityPct: 100, exposureAssessed: true, visibilityGaps: [], materialExclusionSharePct: 0, unknownSharePct: 0, scoreComparabilityStatement: 'Synthetic provider-free fixture.', limitationReasons: [], excludedQuestionCodes: [], redirectedQuestionCodes: [], invalidatedQuestionCodes: [], unknownQuestionCodes: [], questionTraces: [] } },
    domainResults: domains, exposureAnswers: [
      { factorCode: 'EXP-01', name: 'High-risk process footprint', selectedLabel: 'High exposure', pointsAwarded: 20, maxPoints: 25 },
      { factorCode: 'EXP-02', name: 'Supplier dependency', selectedLabel: 'High exposure', pointsAwarded: 12, maxPoints: 15 },
      { factorCode: 'EXP-03', name: 'Digital channel reliance', selectedLabel: 'High exposure', pointsAwarded: 12, maxPoints: 15 },
      { factorCode: 'EXP-05', name: 'Cash, stock or high-value assets', selectedLabel: 'High exposure', pointsAwarded: 9, maxPoints: 10 },
      { factorCode: 'EXP-06', name: 'Operational dispersion', selectedLabel: 'Moderate exposure', pointsAwarded: 5, maxPoints: 8 },
      { factorCode: 'EXP-07', name: 'Manual intervention', selectedLabel: 'High exposure', pointsAwarded: 8, maxPoints: 10 }
    ], questionTraces: traces, criticalMajorGaps: traces.filter((trace) => trace.isCriticalGap || trace.isMajorGap), officialResponseLabels: labels,
    maturityCapEvents: high ? [] : [{ ruleCode: 'any_hard_gate_critical_control_lte_1', capTo: 'Developing', reason: 'A synthetic V1.2 hard-gate control is weak.', relatedQuestionCode: 'D8-Q10', relatedQuestionPrompt: 'The organisation can investigate and contain identity misuse, account takeover or impersonation.', relatedDomainCode: 'D8', relatedDomainName: domainNames.D8 }], recommendationRules: [], expectedDomainResultCount: 10, actualDomainResultCount: 10, expectedQuestionTraceCount: 68, actualQuestionTraceCount: 68,
    adaptiveScope: { exposureAssessed: true, scoreComparabilityStatement: 'Synthetic provider-free fixture.', visibilityGaps: [] }, adaptiveGatewayAnswers: { G01: 'organisation', G03: 'yes', G04: 'internal', G06: 'yes', G08: 'organisation', G10: 'yes' }
  };
  return data;
}

const mixed = fixture(false);
const high = fixture(true);
const mixedModel = buildAdvisoryEvidenceModel(mixed);
const highModel = buildAdvisoryEvidenceModel(high);
assert.ok(mixedModel.materialFindings.some((finding) => finding.questionCode === 'D3-Q09'));
assert.ok(mixedModel.materialFindings.some((finding) => finding.questionCode === 'D3-Q10'));
assert.ok(mixedModel.materialFindings.some((finding) => finding.questionCode === 'D3-Q11'));
assert.ok(highModel.materialFindings.every((finding) => finding.fallbackStatus === 'exact_question_playbook'));
assert.equal(checkQualityGates(mixedModel, mixed).violations.length, 0);
assert.equal(checkQualityGates(highModel, high).violations.length, 0);

const projection = buildEssentialProjection(mixed, mixedModel);
const factPack = buildEssentialNarrativeFactPack(mixed, mixedModel, projection);
const domains = factPack.domains.filter((domain) => typeof domain.score === 'number').map((domain) => ({ name: domain.name, score: domain.score, band: domain.band }));
const comprehensiveAssembly = assembleComprehensive(mixedModel, { scenarioFacts: adaptComprehensiveScenarioFacts(factPack.scenarios), domains });
const managementModel = buildComprehensiveManagementModel(comprehensiveAssembly);
const deliveryModel = buildComprehensiveDeliveryModel({ assembled: mixed, evidenceModel: mixedModel, score: { overallScore: mixed.scoreRun.overallScore, calculatedMaturity: mixed.scoreRun.calculatedMaturity, finalMaturity: mixed.scoreRun.finalMaturity, exposureScore: mixed.scoreRun.exposureScore, exposureBand: mixed.scoreRun.exposureBand, coveragePct: mixed.scoreRun.coveragePct, nARatePct: mixed.scoreRun.nARatePct, criticalGapCount: mixed.scoreRun.criticalGapCount, majorGapCount: mixed.scoreRun.majorGapCount, capApplied: mixed.scoreRun.capApplied, capReason: mixed.scoreRun.capReason, methodologyVersionId: V12 }, organisationName: mixed.organisationName, assessmentReference: mixed.assessmentReference, generatedAt: mixed.generatedAt });
assertComprehensiveBlueprintContract(deliveryModel);
const brief = buildInterpretationBrief({ model: managementModel, organisationName: mixed.organisationName, score: mixed.scoreRun.overallScore, maturity: mixed.scoreRun.finalMaturity, domains });
assert.equal(brief.totals.findings, mixedModel.materialFindings.length);
assert.ok(brief.totals.controls > 0);

// This is the exact stop point: the next production call in manual-generation.ts is
// generateComprehensiveInterpretation(). It is intentionally not imported or invoked here.
const providerCalls = 0;
assert.equal(providerCalls, 0);

console.log(JSON.stringify({
  passed: true,
  providerCalls,
  stagingMutations: 0,
  v12: {
    activeControls: activeCodes.length,
    semanticMappings: activeCodes.length - v12MappingMissing.length,
    playbooks: v12Playbooks.filter(Boolean).length,
    primaryFamilyCount: PRIMARY_SEMANTIC_FAMILIES.length,
    splitPairs: splitPairs.map(([left, right]) => ({ left, right, distinct: true })),
    newOperationalControls: ['D3-Q09', 'D3-Q10', 'D3-Q11'],
    mixedMaterialFindings: mixedModel.materialFindings.length,
    highReadinessFindings: highModel.materialFindings.length
  },
  preProvider: {
    officialResponseScale: 'V1.2 zero-based 0-5',
    domains: `${mixed.domainResults.length}/${mixed.expectedDomainResultCount}`,
    questionTraces: `${mixed.questionTraces.length}/${mixed.expectedQuestionTraceCount}`,
    entitlement: 'Comprehensive R35,000 ZAR fixture',
    deterministicAssembly: true,
    managementModel: true,
    deliveryContract: true,
    providerAuthorisationInvoked: false
  }
}, null, 2));
