import assert from 'node:assert/strict';
import graphJson from '../../src/lib/adaptive/candidates/adaptive-graph-v1-2-candidate.json' with { type: 'json' };
import { resolveAdaptivePath } from '../../src/lib/adaptive/engine.ts';
import { calculateAdaptiveReadinessScore } from '../../src/lib/scoring/adaptive-scoring.ts';
import { deriveOperatingContext } from '../../src/lib/reports/narrative/operating-context.ts';
import { exposuresFromContext } from '../../src/lib/reports/narrative/operating-exposures.ts';
import { buildAdvisoryEvidenceModel } from '../../src/lib/reports/evidence-model/index.ts';
import { adaptEssentialEvidenceModel } from '../../src/lib/reports/essential-presentation-adaptation.ts';
import { buildEssentialProjection } from '../../src/lib/reports/essential-projection.ts';
import { buildEssentialNarrativeFactPack } from '../../src/lib/reports/narrative/fact-pack.ts';

const graph = graphJson;
const GENERATED_AT = '2026-08-24T18:30:00.000Z';
const V12_METHODOLOGY_ID = '00f2b435-a027-4a06-886b-23998faeaca6';
const gateways = {
  G01: 'manufacturing_production', G02: 'employees_50_249', G03: 'yes', G04: 'external_provider',
  G05: 'dedicated_internal', G06: 'yes', G07: 'yes', G08: 'organisation', G09: 'none',
  G10: 'no', G11: 'no', G12: 'no', G13: 'yes', G14: 'yes', G15: 'no',
  G16: 'two_or_more', G17: 'unknown'
};

function expand(domain, values) {
  return Object.fromEntries(values.map((value, index) => [`${domain}-Q${String(index + 1).padStart(2, '0')}`, value]));
}

const values = {
  ...expand('D1', [3,1,2,3,1,2]),
  ...expand('D2', [3,1,2,3,1,2,2,2]),
  ...expand('D3', [3,1,2,2,2,3,1]),
  ...expand('D4', [3,1,2,3,1,2,2]),
  ...expand('D5', [3,1,2,3,1,2,2]),
  ...expand('D6', [4,2,3,4,2,3]),
  ...expand('D7', [3,3,1,3,2,3,1]),
  ...expand('D8', [2,2,3,1,2,2,2,2]),
  ...expand('D9', [4,2,3,4,2,3]),
  ...expand('D10', [3,1,2,3,1,2]),
  'D3-Q09': 2, 'D3-Q10': 2, 'D3-Q11': 2
};
const oversight = { 'OV-D3-Q03': 2, 'OV-D7-Q01': 3, 'OV-D7-Q04': 3 };
const splitSource = { 'D1-Q07': 'D1-Q04', 'D3-Q08': 'D3-Q04', 'D4-Q08': 'D4-Q05', 'D8-Q09': 'D8-Q04', 'D8-Q10': 'D8-Q08' };

function methodologyFor(g) {
  return {
    domains: g.domains.map((domain, domainIndex) => ({
      id: `00000000-0000-4000-8000-${String(domainIndex + 1).padStart(12, '0')}`,
      domainCode: domain.domainCode,
      name: domain.name,
      weightPct: domain.weightPct,
      domainType: 'control',
      isCore: Boolean(domain.isCore),
      sortOrder: domain.sortOrder ?? domainIndex + 1,
      questions: g.questions.filter((question) => question.domainCode === domain.domainCode).map((question, questionIndex) => ({
        id: `10000000-0000-4000-8000-${String(g.questions.indexOf(question) + 1).padStart(12, '0')}`,
        questionCode: question.questionCode,
        domainCode: question.domainCode,
        domainName: domain.name,
        prompt: question.prompt,
        helpText: null,
        weight: question.weight,
        isCritical: Boolean(question.isCritical),
        isHardGate: Boolean(question.isHardGate),
        nAAllowed: false,
        nARuleKey: null,
        triggerKey: null,
        sortOrder: questionIndex
      }))
    })),
    responseScale: [],
    exposureFactors: []
  };
}

const methodology = methodologyFor(graph);
const questionCodeByMethodologyId = new Map(methodology.domains.flatMap((d) => d.questions).map((q) => [q.id, q.questionCode]));
const domainCodeByMethodologyId = new Map(methodology.domains.map((d) => [d.id, d.domainCode]));
const questionByCode = new Map(graph.questions.map((q) => [q.questionCode, q]));
const domainNames = Object.fromEntries(graph.domains.map((d) => [d.domainCode, d.name]));
const defaulted = [];

function valueFor(nodeId, replacementFor, domainCode) {
  if (Number.isInteger(oversight[nodeId])) return oversight[nodeId];
  const canonical = replacementFor ?? nodeId;
  if (Number.isInteger(values[canonical])) return values[canonical];
  const source = splitSource[canonical];
  if (source && Number.isInteger(values[source])) return values[source];
  defaulted.push({ nodeId, replacementFor, domainCode });
  return 2;
}

const firstPath = resolveAdaptivePath({ graph, gatewayAnswers: gateways });
const controlResponses = {};
for (const node of firstPath.activeNodes) {
  if (node.kind === 'gateway') continue;
  controlResponses[node.nodeId] = { responseState: 'maturity', responseValue: valueFor(node.nodeId, node.replacementFor, node.domainCode) };
}
assert.deepEqual(defaulted, [], 'Every active Vhutshilo response must resolve from explicit, oversight or split-source evidence.');

const score = calculateAdaptiveReadinessScore({ graph, methodology, gatewayAnswers: gateways, controlResponses, integritySignals: [] });
assert.equal(graph.graphVersion, 'MFRS-V1.2-ADAPTIVE-CANDIDATE-20260821');
assert.equal(graph.graphFingerprint, '6f1f098a713b1a2f2bf6fc52a1733bf4ffafea8adccedaccc0b721e55bbe45c7');
assert.equal(graph.methodologyVersion, 'MFRS-V1.2-CANDIDATE-OWNER-CORRECTION');
assert.equal(score.summary.overallScore, 43.33);
assert.equal(score.summary.finalMaturity, 'Developing');
assert.equal(score.summary.coveragePct, 100);
assert.equal(score.metrics.applicableCount, 60);
assert.equal(score.metrics.excludedCount, 8);
assert.equal(score.metrics.redirectedCount, 4);
assert.equal(score.metrics.unknownCount, 0);
assert.equal(score.summary.criticalGapCount, 6);
assert.equal(score.summary.majorGapCount, 3);
assert.deepEqual(Object.fromEntries(score.domainResults.map((d) => [d.domainCode, d.rawScore])), {
  D1: 42, D2: 39.43, D3: 40.54, D4: 40.59, D5: 43.85,
  D6: 60.83, D7: 47.06, D8: 38.18, D9: 56.67, D10: 40.95
});

const context = deriveOperatingContext({ graphVersion: graph.graphVersion, gatewayAnswers: gateways, graph });
const byKey = new Map(context.map((fact) => [fact.key, fact]));
assert.equal(byKey.get('MULTI_SITE_OR_DISTRIBUTED_OPERATIONS')?.certainty, 'AFFIRMED');
assert.equal(byKey.get('MULTI_SITE_OR_DISTRIBUTED_OPERATIONS')?.sourceGatewayCode, 'G13');
assert.equal(byKey.get('TEMPORARY_SEASONAL_OR_SUBCONTRACTED_WORKFORCE')?.certainty, 'AFFIRMED');
assert.equal(byKey.get('TEMPORARY_SEASONAL_OR_SUBCONTRACTED_WORKFORCE')?.sourceGatewayCode, 'G14');
assert.equal(byKey.get('PERSONAL_OR_IDENTITY_DATA')?.certainty, 'NEGATED');
assert.equal(byKey.get('PERSONAL_OR_IDENTITY_DATA')?.sourceGatewayCode, 'G11');
assert.equal(byKey.get('MANUAL_FINANCIAL_OR_STOCK_ADJUSTMENTS')?.certainty, 'NEGATED');
assert.equal(byKey.get('MANUAL_FINANCIAL_OR_STOCK_ADJUSTMENTS')?.sourceGatewayCode, 'G12');
assert.equal(byKey.get('INTERMEDIARY_EXPOSURE')?.certainty, 'NOT_ESTABLISHED');
const exposureIds = new Set(exposuresFromContext(context).map((item) => item.id));
for (const id of ['CASH_HANDLING','PHYSICAL_STOCK_OR_ASSETS','DISTRIBUTED_OPERATIONS','TEMPORARY_OR_SUBCONTRACTED_WORKFORCE','OUTSOURCED_SUPPLIER_MANAGEMENT']) assert.ok(exposureIds.has(id), `missing ${id}`);
for (const id of ['PERSONAL_DATA_HELD','REFUNDS_AND_ADJUSTMENTS','SIGNIFICANT_CASH_HANDLING']) assert.ok(!exposureIds.has(id), `unsupported ${id}`);

function capEvents() {
  return score.maturityCapEvents.map((event) => {
    const relatedQuestionCode = event.relatedQuestionId ? questionCodeByMethodologyId.get(event.relatedQuestionId) ?? null : null;
    const relatedQuestion = relatedQuestionCode ? questionByCode.get(String(relatedQuestionCode)) : null;
    const relatedDomainCode = event.relatedDomainId ? domainCodeByMethodologyId.get(event.relatedDomainId) ?? null : relatedQuestion?.domainCode ?? null;
    return {
      ruleCode: event.ruleCode, capTo: event.capTo, reason: event.reason,
      relatedQuestionCode: relatedQuestionCode ? String(relatedQuestionCode) : null,
      relatedQuestionPrompt: relatedQuestion?.prompt ?? null,
      relatedDomainCode: relatedDomainCode ? String(relatedDomainCode) : null,
      relatedDomainName: relatedDomainCode ? domainNames[String(relatedDomainCode)] ?? null : null
    };
  });
}

const traces = score.metrics.questionTraces.map((trace) => ({
  questionCode: trace.questionCode, domainCode: trace.domainCode, domainName: domainNames[trace.domainCode] ?? trace.domainCode,
  prompt: trace.prompt, responseValue: trace.responseValue, normalisedScore: trace.normalisedScore,
  applicable: trace.applicable, triggeredRules: trace.triggeredRules, isCritical: trace.isCritical,
  isHardGate: trace.isHardGate, isCriticalGap: trace.isCriticalGap, isMajorGap: trace.isMajorGap
}));

const data = {
  orderId: '11111111-1111-4111-8111-000000000003', orderReference: 'MKORD-V12-COMP-VHUTSHILO',
  orderAssessmentId: '22222222-2222-4222-8222-000000000003', assessmentId: '22222222-2222-4222-8222-000000000003',
  organisationId: '33333333-3333-4333-8333-000000000003', currentScoreRunId: '44444444-4444-4444-8444-000000000003',
  orderVerifiedAt: GENERATED_AT, orderVerifiedBy: null, paymentVerification: { legacyOrderVerification: true },
  organisationName: 'Vhutshilo Foods Manufacturing (Pty) Ltd', respondentName: 'Synthetic recovery respondent', customerEmail: 'vhutshilo-recovery@example.test',
  assessmentReference: 'MKFRS-V12-COMP-VHUTSHILO', reportReference: 'RPT-MKFRS-V12-ESS-VHUTSHILO-V1', generatedAt: GENERATED_AT,
  packageName: 'Essential', productCode: 'essential_self_assessment', orderStatus: 'payment_received', amountCents: 750000, currency: 'ZAR',
  productPriceCents: 750000, productCurrency: 'ZAR', requiresPaymentVerification: true, deliveryMode: 'mk_controlled_pdf', productActive: true,
  scoreRun: {
    id: '44444444-4444-4444-8444-000000000003', assessmentId: '22222222-2222-4222-8222-000000000003', methodologyVersionId: V12_METHODOLOGY_ID,
    status: 'completed', lockedAt: GENERATED_AT, inputHash: score.inputHash, overallScore: score.summary.overallScore,
    calculatedMaturity: score.summary.calculatedMaturity, finalMaturity: score.summary.finalMaturity, exposureScore: null, exposureBand: null,
    coveragePct: score.summary.coveragePct, nARatePct: score.summary.nARatePct, criticalGapCount: score.summary.criticalGapCount,
    majorGapCount: score.summary.majorGapCount, capApplied: score.summary.capApplied, capReason: score.summary.capReason,
    adaptiveResultStatus: score.resultStatus, adaptiveMetrics: score.metrics
  },
  domainResults: score.domainResults.map((domain) => ({ domainCode: domain.domainCode, domainName: domain.domainName, weightPct: domain.domainWeightPct, rawScore: domain.rawScore, weightedContribution: domain.weightedContribution, coveragePct: domain.coveragePct, criticalGapCount: domain.criticalGapCount })),
  exposureAnswers: [], questionTraces: traces, criticalMajorGaps: traces.filter((trace) => trace.isCriticalGap || trace.isMajorGap),
  officialResponseLabels: graph.responseScale.map((row, displayOrder) => ({ responseValue: row.responseValue, label: row.label, operationalMeaning: row.operationalMeaning ?? '', normalisedScore: row.normalisedScore, displayOrder })),
  maturityCapEvents: capEvents(), recommendationRules: [], expectedDomainResultCount: 10, actualDomainResultCount: score.domainResults.length,
  expectedQuestionTraceCount: 68, actualQuestionTraceCount: traces.length, adaptiveScope: score.metrics, adaptiveGatewayAnswers: gateways
};

const advisory = buildAdvisoryEvidenceModel(data);
const essentialEvidence = adaptEssentialEvidenceModel(advisory, gateways);
const projection = buildEssentialProjection(data, essentialEvidence);
const factPack = buildEssentialNarrativeFactPack(data, essentialEvidence, projection);
assert.ok(projection.findings.length > 0, 'Essential projection must contain prioritised findings.');
assert.ok(factPack.organisation.sectorFacts.some((line) => /manufactur/i.test(line)), 'Operating environment must reach the narrative fact pack.');
assert.ok(factPack.organisation.sectorFacts.some((line) => /more than one site|project location/i.test(line)), 'Multi-site fact must reach the narrative fact pack.');
assert.ok(factPack.organisation.sectorFacts.some((line) => /temporary, seasonal or subcontracted/i.test(line)), 'Workforce model fact must reach the narrative fact pack.');
assert.ok(!factPack.organisation.sectorFacts.some((line) => /personal or identity information handling\.$/i.test(line) && !/no personal/i.test(line)), 'Negative personal-data answer must not become a positive exposure.');

console.log(JSON.stringify({
  status: 'PASS', engine: 'V10_REPORT_PATH_WITH_V12_TRUTH', providerCalls: 0,
  score: score.summary.overallScore, maturity: score.summary.finalMaturity, coveragePct: score.summary.coveragePct,
  applicable: score.metrics.applicableCount, excluded: score.metrics.excludedCount, redirected: score.metrics.redirectedCount, unknown: score.metrics.unknownCount,
  criticalGaps: score.summary.criticalGapCount, majorGaps: score.summary.majorGapCount,
  graphVersion: graph.graphVersion, graphFingerprint: graph.graphFingerprint, methodology: graph.methodologyVersion,
  projectedFindings: projection.findings.length, sectorFacts: factPack.organisation.sectorFacts
}, null, 2));
