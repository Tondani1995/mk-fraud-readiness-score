import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';

import { buildAdvisoryEvidenceModel } from '../src/lib/reports/evidence-model/index.ts';
import { buildPremiumReportEvidencePack, evidenceChecksum, validatePremiumReportEvidencePack } from '../src/lib/reports/automation/evidence.ts';
import { buildPremiumReportNarrativeBrief, assertPremiumReportNarrativeBrief } from '../src/lib/reports/automation/narrative-brief.ts';
import { buildPremiumReportGenerationPrompt, buildPremiumReportRepairPrompt, PREMIUM_REPORT_AI_SYSTEM_INSTRUCTIONS } from '../src/lib/reports/automation/prompt.ts';
import { buildPremiumReportRepairScope } from '../src/lib/reports/automation/repair-scope.ts';
import { PREMIUM_REPORT_PROMPT_VERSION, PREMIUM_REPORT_SCHEMA_VERSION } from '../src/lib/reports/automation/types.ts';
import {
  evaluatePremiumReportAiBudget,
  measurePremiumReportAiBudget,
  PREMIUM_REPORT_AI_MAX_ATTEMPTS,
  PREMIUM_REPORT_AI_MAX_COMBINED_ESTIMATED_COST_MICROS,
  PREMIUM_REPORT_AI_MAX_ESTIMATED_COST_MICROS,
  PREMIUM_REPORT_AI_MAX_ESTIMATED_INPUT_TOKENS,
  PREMIUM_REPORT_AI_MAX_INPUT_BYTES,
  PREMIUM_REPORT_AI_MAX_TOTAL_TOKENS
} from '../src/lib/reports/automation/durable-ai-attempts.ts';

const ASSESSMENT_REFERENCE = 'MKFRS-2026-C35A2D462B';
const ORDER_REFERENCE = 'MKORD-2026-HB0OT81P';
const REPORT_REFERENCE = `RPT-${ASSESSMENT_REFERENCE}-V1`;
const GRAPH_FINGERPRINT = 'fa4505253f7e85a76f37e87e0836db76c553a786a4030fe29298153fc3b8f7ab';
const SCORE_RUN_ID = 'dc68c3e5-95e4-4856-957b-5ef900f56948';

const RESPONSE_BY_DOMAIN = {
  D1: [null, 0, 1, 2, 2, 3],
  D2: [0, 1, 2, 3, 4, null, 0, 1],
  D3: [1, 2, 3, 4, null, 0, 1],
  D4: [2, 3, 4, null, 0, 1, 2],
  D5: [3, 4, null, 0, 1, 2, 4],
  D6: [null, 0, 1, 2, 3, 4],
  D7: [0, 0, 1, 0, 1, 2, 3],
  D8: [4, null, 0, 0, 1, 2, 3, 4],
  D9: [null, 0, 1, 0, 1, 2],
  D10: [3, 4, null, 0, 1, 3]
};

const UNKNOWN_CODES = new Set([
  'D1-Q01', 'D2-Q06', 'D3-Q05', 'D4-Q04', 'D5-Q03',
  'D6-Q01', 'D8-Q02', 'D9-Q01', 'D10-Q03'
]);
const CRITICAL_GAP_CODES = new Set(['D1-Q04', 'D2-Q01', 'D2-Q02', 'D3-Q01', 'D4-Q01', 'D5-Q05', 'D7-Q01', 'D7-Q04', 'D8-Q04']);
const MAJOR_GAP_CODES = new Set(['D2-Q01', 'D2-Q02', 'D3-Q01', 'D5-Q05', 'D7-Q04', 'D8-Q04']);

const DOMAIN_RESULTS = [
  ['D1', 'Fraud Leadership and Governance', 12, 30.83, 3.6996, 1],
  ['D2', 'Fraud Risk Identification', 12, 29.71, 3.5652, 2],
  ['D3', 'Operational Fraud Controls', 14, 40, 5.6, 1],
  ['D4', 'Fraud Detection Capability', 14, 42.67, 5.9738, 1],
  ['D5', 'Fraud Incident Response', 10, 45.33, 4.533, 1],
  ['D6', 'Whistleblowing and Reporting Culture', 6, 37.27, 2.2362, 0],
  ['D7', 'Third-Party and Supply Chain Fraud Risk', 10, 17.06, 1.706, 2],
  ['D8', 'Digital and Identity Fraud Risk', 12, 40.56, 4.8672, 1],
  ['D9', 'Fraud Culture and Awareness', 5, 17.27, 0.8635, 0],
  ['D10', 'Continuous Improvement and Fraud Risk Monitoring', 5, 46.4, 2.32, 0]
];

const officialResponseLabels = [
  [0, 'Not in place', 'The control, process or capability does not exist or is not recognised as required.'],
  [1, 'Initial / ad hoc', 'Some activity may occur informally or reactively, but it is not defined, owned or reliable.'],
  [2, 'Partially designed', 'Some elements exist, but implementation is incomplete, inconsistent or not evidenced.'],
  [3, 'Implemented', 'The capability is established in important areas, but may not operate consistently across the organisation.'],
  [4, 'Consistently operating', 'The capability is formally implemented, evidenced and regularly operating.'],
  [5, 'Embedded and improved', 'The capability is monitored, measured, governed and continuously improved.']
].map(([responseValue, label, operationalMeaning], displayOrder) => ({ responseValue, label, operationalMeaning, normalisedScore: responseValue * 20, displayOrder: displayOrder + 1 }));

function visibilityGap(question) {
  return {
    id: `VIS-${question.questionCode}`,
    questionCode: question.questionCode,
    domainCode: question.domainCode,
    prompt: question.prompt,
    statement: 'The control position could not be confirmed from the response.',
    whyVisibilityMatters: `Independent evidence is needed to confirm whether the control objective is operating: ${question.controlObjective}`,
    evidenceNeeded: `Evidence mapped to ${question.evidenceReference}, including the complete in-scope population and operating records.`,
    likelyEvidenceOwner: 'Control owner / process owner to be confirmed during evidence review.',
    recommendedVerificationAction: 'Obtain and independently verify the control evidence before relying on the result.',
    priority: 'Medium',
    targetTiming: '60 days'
  };
}

function makeJourney4Data(graph) {
  const questions = graph.questions.filter((question) => question.questionCode);
  const traces = questions.map((question) => {
    const domainValues = RESPONSE_BY_DOMAIN[question.domainCode];
    const index = questions.filter((candidate) => candidate.domainCode === question.domainCode).findIndex((candidate) => candidate.questionCode === question.questionCode);
    const responseValue = domainValues[index];
    return {
      questionCode: question.questionCode,
      domainCode: question.domainCode,
      domainName: graph.domains.find((domain) => domain.domainCode === question.domainCode).name,
      prompt: question.prompt,
      responseValue,
      normalisedScore: responseValue === null ? null : responseValue * 20,
      applicable: true,
      triggeredRules: UNKNOWN_CODES.has(question.questionCode) ? ['unknown_response_excluded_from_score_denominator'] : [],
      isCritical: question.isCritical,
      isHardGate: question.isHardGate,
      isCriticalGap: CRITICAL_GAP_CODES.has(question.questionCode),
      isMajorGap: MAJOR_GAP_CODES.has(question.questionCode)
    };
  });
  const visibilityGaps = traces.filter((trace) => UNKNOWN_CODES.has(trace.questionCode)).map((trace) => visibilityGap({
    questionCode: trace.questionCode,
    domainCode: trace.domainCode,
    prompt: trace.prompt,
    controlObjective: questions.find((question) => question.questionCode === trace.questionCode).controlObjective,
    evidenceReference: questions.find((question) => question.questionCode === trace.questionCode).evidenceReference
  }));
  const scoreRun = {
    id: SCORE_RUN_ID,
    assessmentId: '73bfd83f-6afb-4c0f-946c-75bd271952ac',
    methodologyVersionId: 'df96e242-9625-4b2a-bc62-615ae402483a',
    status: 'completed',
    lockedAt: null,
    inputHash: null,
    overallScore: 35.36,
    calculatedMaturity: 'Reactive',
    finalMaturity: 'Reactive',
    exposureScore: null,
    exposureBand: null,
    coveragePct: 100,
    nARatePct: 13.73,
    criticalGapCount: 9,
    majorGapCount: 6,
    capApplied: false,
    capReason: 'Persisted Journey 4 maturity-cap evidence.',
    adaptiveResultStatus: 'NORMAL',
    adaptiveMetrics: { graphVersion: graph.graphVersion, graphFingerprint: GRAPH_FINGERPRINT, resultStatus: 'NORMAL', unknownCount: 9, unknownWeight: 11.5, excludedCount: 0, excludedWeight: 0, applicableCount: 68, applicableWeight: 83.75, redirectedCount: 0, redirectedWeight: 0, invalidatedCount: 0, invalidatedWeight: 0, profileOnlyCount: 14, unknownSharePct: 13.73, controlVisibilityPct: 86.27, exposureAssessed: false, visibilityGaps, assessmentCoveragePct: 100, unansweredApplicableCount: 0, unansweredApplicableWeight: 0, materialExclusionSharePct: 0, scoreComparabilityStatement: 'Comparable with other assessments using the same approved methodology where the assessed scope is materially similar.', limitationReasons: [], excludedQuestionCodes: [], redirectedQuestionCodes: [], invalidatedQuestionCodes: [], unknownQuestionCodes: [...UNKNOWN_CODES], questionTraces: [] }
  };
  return {
    orderId: 'order-journey4', orderReference: ORDER_REFERENCE, orderAssessmentId: scoreRun.assessmentId,
    assessmentId: scoreRun.assessmentId, organisationId: '3320412c-54b7-43fd-b1b7-57002ab1a6a1', currentScoreRunId: SCORE_RUN_ID,
    orderVerifiedAt: '2026-08-06T10:00:00.000Z', orderVerifiedBy: null, paymentVerification: {},
    organisationName: `Journey4Org_${'q'.repeat(31)}`, respondentName: `Journey4Responder_${'r'.repeat(8)}`, customerEmail: 'admin@mkfraud.co.za', assessmentReference: ASSESSMENT_REFERENCE,
    reportReference: REPORT_REFERENCE, generatedAt: '2026-08-06T10:35:13.825Z', packageName: 'X'.repeat(32), productCode: 'essential_self_assessment',
    orderStatus: 'payment_received', amountCents: 500000, currency: 'ZAR', productPriceCents: 500000, productCurrency: 'ZAR', requiresPaymentVerification: true,
    deliveryMode: 'premium_report', productActive: true, scoreRun, domainResults: DOMAIN_RESULTS.map(([domainCode, domainName, weightPct, rawScore, weightedContribution, criticalGapCount]) => ({ domainCode, domainName, weightPct, rawScore, weightedContribution, coveragePct: 100, criticalGapCount })),
    exposureAnswers: [], questionTraces: traces, criticalMajorGaps: traces.filter((trace) => trace.isCriticalGap || trace.isMajorGap), officialResponseLabels,
    maturityCapEvents: [
      { ruleCode: 'any_core_domain_below_40', capTo: 'Developing', reason: 'Persisted domain cap.', relatedQuestionCode: null, relatedQuestionPrompt: null, relatedDomainCode: 'D1', relatedDomainName: 'Fraud Leadership and Governance' },
      { ruleCode: 'any_core_domain_below_60', capTo: 'Structured', reason: 'Persisted domain cap.', relatedQuestionCode: null, relatedQuestionPrompt: null, relatedDomainCode: 'D1', relatedDomainName: 'Fraud Leadership and Governance' },
      { ruleCode: 'any_hard_gate_critical_control_eq_2', capTo: 'Structured', reason: 'Persisted question cap.', relatedQuestionCode: 'D1-Q04', relatedQuestionPrompt: traces.find((trace) => trace.questionCode === 'D1-Q04').prompt, relatedDomainCode: null, relatedDomainName: null },
      { ruleCode: 'any_hard_gate_critical_control_lte_1', capTo: 'Developing', reason: 'Persisted question cap.', relatedQuestionCode: 'D2-Q01', relatedQuestionPrompt: traces.find((trace) => trace.questionCode === 'D2-Q01').prompt, relatedDomainCode: null, relatedDomainName: null },
      { ruleCode: 'three_or_more_critical_controls_lte_2', capTo: 'Developing', reason: 'Persisted aggregate cap.', relatedQuestionCode: null, relatedQuestionPrompt: null, relatedDomainCode: null, relatedDomainName: null }
    ], recommendationRules: [], expectedDomainResultCount: 10, actualDomainResultCount: 10, expectedQuestionTraceCount: 68, actualQuestionTraceCount: 68,
    adaptiveScope: scoreRun.adaptiveMetrics
  };
}

function metrics(text) {
  const bytes = Buffer.byteLength(text, 'utf8');
  return { bytes, estimatedInputTokens: Math.ceil(bytes / 4), sha256: crypto.createHash('sha256').update(text).digest('hex') };
}

const graph = JSON.parse(await readFile(new URL('../docs/adaptive-assessment/adaptive-graph-v1-draft.json', import.meta.url), 'utf8'));
const budgetMigration = await readFile(new URL('../supabase/migrations/20260806090000_pre_g30_ai_budget_diagnostics.sql', import.meta.url), 'utf8');
assert.match(budgetMigration, /pre_dispatch_total_tokens/);
assert.match(budgetMigration, /pre_dispatch_estimated_cost_micros/);
assert.match(budgetMigration, /pre_dispatch_budget_reason/);
assert.match(budgetMigration, /report_generation_runs/);
assert.match(budgetMigration, /record_premium_report_generation_run/);
assert.match(budgetMigration, /claim_phase14_ai_attempt/);
assert.match(budgetMigration, /claim_manual_report_ai_attempt/);
assert.match(budgetMigration, /pre_dispatch_estimated_cost_exceeded/);
assert.equal(graph.graphFingerprint, GRAPH_FINGERPRINT);
const data = makeJourney4Data(graph);
const advisoryModel = buildAdvisoryEvidenceModel(data);
const evidence = buildPremiumReportEvidencePack(data, advisoryModel, PREMIUM_REPORT_SCHEMA_VERSION);
assert.deepEqual(validatePremiumReportEvidencePack(evidence, ['admin@mkfraud.co.za', data.respondentName]), [], 'protected evidence pack must pass privacy and linkage checks');
const brief = assertPremiumReportNarrativeBrief(evidence, buildPremiumReportNarrativeBrief(evidence));
const input = { evidence, evidenceChecksum: evidenceChecksum(evidence), narrativeBrief: brief, promptVersion: PREMIUM_REPORT_PROMPT_VERSION, schemaVersion: PREMIUM_REPORT_SCHEMA_VERSION };
const generationPrompt = buildPremiumReportGenerationPrompt(input);
const previousOutput = { executiveEvidenceRefs: brief.executive.requiredEvidenceRefs, executiveBody: 'x', falseComfortEvidenceRefs: brief.falseComfort.requiredEvidenceRefs, falseComfortBody: 'x', leadershipEvidenceRefs: brief.leadership.requiredEvidenceRefs, leadershipBody: 'x', domainEvidence: Object.entries(brief.domains).map(([domainCode, section]) => ({ domainCode, evidenceRefs: section.requiredEvidenceRefs, body: 'x' })), gapEvidence: Object.entries(brief.gaps).map(([questionCode, section]) => ({ questionCode, evidenceRefs: section.requiredEvidenceRefs, body: 'x' })) };
const repairScope = buildPremiumReportRepairScope({ narrativeBrief: brief, previousOutput, validationIssues: [{ code: 'test', path: 'executiveBody', message: 'test', blocking: true }] });
const repairPrompt = buildPremiumReportRepairPrompt({ ...input, previousOutput, repairScope, validationIssues: [{ code: 'test', path: 'executiveBody', message: 'test', blocking: true }] });
const generationBudget = measurePremiumReportAiBudget('generate', input);
const repairBudget = measurePremiumReportAiBudget('repair', { ...input, previousOutput, repairScope, validationIssues: [{ code: 'test', path: 'executiveBody', message: 'test', blocking: true }] });

assert.equal(PREMIUM_REPORT_AI_MAX_ESTIMATED_INPUT_TOKENS + 5000, PREMIUM_REPORT_AI_MAX_TOTAL_TOKENS);
assert.equal(PREMIUM_REPORT_AI_MAX_ATTEMPTS * PREMIUM_REPORT_AI_MAX_ESTIMATED_COST_MICROS, PREMIUM_REPORT_AI_MAX_COMBINED_ESTIMATED_COST_MICROS);
assert.ok(PREMIUM_REPORT_AI_MAX_ESTIMATED_COST_MICROS <= 500_000);
assert.equal(generationBudget.reason, null);
assert.equal(repairBudget.reason, null);
assert.equal(generationBudget.estimatedTotalTokens, generationBudget.estimatedInputTokens + generationBudget.maxOutputTokens);
assert.equal(repairBudget.estimatedTotalTokens, repairBudget.estimatedInputTokens + repairBudget.maxOutputTokens);
assert.ok(generationBudget.inputSizeBytes <= PREMIUM_REPORT_AI_MAX_INPUT_BYTES);
assert.ok(generationBudget.estimatedInputTokens <= PREMIUM_REPORT_AI_MAX_ESTIMATED_INPUT_TOKENS);
assert.ok(generationBudget.estimatedCostMicros * 1.2 <= PREMIUM_REPORT_AI_MAX_ESTIMATED_COST_MICROS,
  'the corrected Journey 4 prompt must have at least 20% estimated-cost headroom');
assert.ok(generationBudget.estimatedCostMicros + repairBudget.estimatedCostMicros <= PREMIUM_REPORT_AI_MAX_COMBINED_ESTIMATED_COST_MICROS);

// Exercise the pre-dispatch boundary without a provider call. The filler is an
// inert deterministic theme fixture; it is never emitted as an artifact.
function withExecutiveFiller(length) {
  return {
    ...input,
    narrativeBrief: {
      ...input.narrativeBrief,
      executive: {
        ...input.narrativeBrief.executive,
        requiredThemes: [...input.narrativeBrief.executive.requiredThemes, 'f'.repeat(length)]
      }
    }
  };
}
let low = 0;
let high = 30_000;
while (low < high) {
  const middle = Math.ceil((low + high) / 2);
  if (measurePremiumReportAiBudget('generate', withExecutiveFiller(middle)).reason === null) low = middle;
  else high = middle - 1;
}
const justBelowBudget = measurePremiumReportAiBudget('generate', withExecutiveFiller(low));
const justAboveBudget = measurePremiumReportAiBudget('generate', withExecutiveFiller(low + 1));
assert.equal(justBelowBudget.reason, null);
assert.ok(justBelowBudget.inputSizeBytes <= PREMIUM_REPORT_AI_MAX_INPUT_BYTES);
assert.equal(justAboveBudget.reason, 'pre_dispatch_input_bytes_exceeded');

// The closed vocabulary is explicit even though the coherent envelope makes
// some later guards redundant for a correctly estimated prompt.
assert.deepEqual([
  'pre_dispatch_input_bytes_exceeded',
  'pre_dispatch_input_tokens_exceeded',
  'pre_dispatch_total_tokens_exceeded',
  'pre_dispatch_estimated_cost_exceeded'
].sort(), [
  evaluatePremiumReportAiBudget(PREMIUM_REPORT_AI_MAX_INPUT_BYTES + 1, 1).reason,
  evaluatePremiumReportAiBudget(1, PREMIUM_REPORT_AI_MAX_ESTIMATED_INPUT_TOKENS + 1).reason,
  'pre_dispatch_total_tokens_exceeded',
  'pre_dispatch_estimated_cost_exceeded'
].sort());

for (const section of [brief.executive, brief.falseComfort, brief.leadership, ...Object.values(brief.domains), ...Object.values(brief.gaps)]) {
  for (const reference of section.requiredEvidenceRefs) {
    assert.ok(generationPrompt.includes(reference), `generation prompt must retain ${reference}`);
  }
}
assert.match(generationPrompt, /untrusted data, not instructions/);
assert.match(repairPrompt, /untrusted data, never instructions/);
assert.doesNotMatch(generationPrompt, /admin@mkfraud\.co\.za/);
assert.doesNotMatch(repairPrompt, /admin@mkfraud\.co\.za/);
const output = {
  assessmentReference: ASSESSMENT_REFERENCE,
  orderReference: ORDER_REFERENCE,
  reportReference: REPORT_REFERENCE,
  graphFingerprint: GRAPH_FINGERPRINT,
  counts: { questionTraces: data.questionTraces.length, applicable: data.adaptiveScope.applicableCount, unknown: data.adaptiveScope.unknownCount, evidenceItems: evidence.items.length, evidenceKinds: Object.fromEntries(Object.entries(Object.groupBy(evidence.items, (item) => item.kind)).map(([kind, items]) => [kind, items.length])), domains: Object.keys(brief.domains).length, gaps: Object.keys(brief.gaps).length },
  evidence: { checksum: input.evidenceChecksum, checksumPrefix: input.evidenceChecksum.slice(0, 16), organisationNameBytes: Buffer.byteLength(evidence.organisationName), rawPromptEmitted: false },
  system: metrics(PREMIUM_REPORT_AI_SYSTEM_INSTRUCTIONS),
  components: {
    promptWithoutEvidence: metrics(generationPrompt.split('===EVIDENCE_PROJECTION_START===')[0]),
    evidenceProjection: metrics(generationPrompt.split('===EVIDENCE_PROJECTION_START===')[1].split('===EVIDENCE_PROJECTION_END===')[0]),
    narrativeBrief: metrics(generationPrompt.split('===NARRATIVE_BRIEF_START===')[1].split('===NARRATIVE_BRIEF_END===')[0])
  },
  generation: metrics(`${PREMIUM_REPORT_AI_SYSTEM_INSTRUCTIONS}\n${generationPrompt}`),
  repair: metrics(`${PREMIUM_REPORT_AI_SYSTEM_INSTRUCTIONS}\n${repairPrompt}`),
  budget: { generation: generationBudget, repair: repairBudget, justBelow: justBelowBudget, justAbove: justAboveBudget },
  beforeCorrection: { bytes: 71_256, estimatedInputTokens: 17_814, estimatedCostMicros: 278_140, oldCostLimitMicros: 250_000, wouldFailOldLimit: true },
  repairScopeSections: repairScope.failedSectionIds,
  providerCalls: 0
};
console.log(JSON.stringify(output));
