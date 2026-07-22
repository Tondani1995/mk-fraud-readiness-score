import type { AssembledReportData, QuestionTraceRecord } from '../../types';
import { AUTHORITATIVE_QUESTION_MAPPINGS } from '../question-playbooks';
import { officialResponseLabelsFixture } from './official-response-labels';

const DOMAIN_NAMES: Record<string, string> = {
  D1: 'Fraud Leadership and Governance', D2: 'Fraud Risk Identification', D3: 'Operational Fraud Controls',
  D4: 'Fraud Detection Capability', D5: 'Fraud Incident Response', D6: 'Whistleblowing and Reporting Culture',
  D7: 'Third-Party and Supply Chain Fraud Risk', D8: 'Digital and Identity Fraud Risk',
  D9: 'Fraud Culture and Awareness', D10: 'Continuous Improvement and Fraud Risk Monitoring'
};

function trace(questionCode: string, responseValue: number, overrides: Partial<QuestionTraceRecord> = {}): QuestionTraceRecord {
  const mapping = AUTHORITATIVE_QUESTION_MAPPINGS[questionCode];
  if (!mapping) throw new Error('Decision fixture requires an authoritative mapping for ' + questionCode + '.');
  return {
    questionCode,
    domainCode: mapping.domainCode,
    domainName: DOMAIN_NAMES[mapping.domainCode],
    prompt: mapping.prompt,
    responseValue,
    normalisedScore: responseValue * 20,
    applicable: true,
    triggeredRules: [],
    isCritical: mapping.isCritical,
    isHardGate: mapping.isHardGate,
    isCriticalGap: responseValue <= 2 && mapping.isCritical,
    isMajorGap: responseValue <= 2 && !mapping.isCritical,
    ...overrides
  };
}

function buildFixture(
  key: string,
  traces: QuestionTraceRecord[],
  scores: Record<string, number>,
  overallScore: number,
  exposureScore: number,
  exposureBand: AssembledReportData['scoreRun']['exposureBand'],
  maturityCapEvents: AssembledReportData['maturityCapEvents']
): AssembledReportData {
  const criticalMajorGaps = traces.filter((item) => item.isCriticalGap || item.isMajorGap).map(({ normalisedScore: _n, applicable: _a, triggeredRules: _t, ...gap }) => gap);
  return {
    orderId: 'decision-order-' + key,
    orderReference: 'DECISION-ORDER-' + key.toUpperCase(),
    orderAssessmentId: 'decision-assessment-' + key,
    assessmentId: 'decision-assessment-' + key,
    organisationId: 'decision-org-' + key,
    currentScoreRunId: 'decision-run-' + key,
    orderVerifiedAt: null,
    orderVerifiedBy: null,
    organisationName: key === 'clean' ? 'Clean Assurance Organisation' : key === 'moderate' ? 'Moderate Decision Organisation' : 'Weak Decision Organisation',
    respondentName: 'Private Respondent ' + key,
    customerEmail: key + '.private@example.test',
    assessmentReference: 'DECISION-' + key.toUpperCase(),
    reportReference: 'RPT-DECISION-' + key.toUpperCase(),
    generatedAt: '2026-07-22T12:00:00.000Z',
    packageName: 'Essential',
    productCode: 'essential_self_assessment',
    orderStatus: 'verified',
    amountCents: 500000,
    currency: 'ZAR',
    productPriceCents: 500000,
    productCurrency: 'ZAR',
    requiresPaymentVerification: false,
    deliveryMode: 'mk_controlled_pdf',
    productActive: true,
    scoreRun: {
      id: 'decision-run-' + key,
      assessmentId: 'decision-assessment-' + key,
      methodologyVersionId: 'methodology-version-v1.1',
      status: 'completed',
      lockedAt: '2026-07-22T11:00:00.000Z',
      inputHash: 'decision-input-' + key,
      overallScore,
      calculatedMaturity: overallScore >= 80 ? 'Strategic' : overallScore >= 60 ? 'Structured' : overallScore >= 40 ? 'Developing' : 'Reactive',
      finalMaturity: maturityCapEvents.length > 0 ? 'Developing' : overallScore >= 80 ? 'Strategic' : overallScore >= 60 ? 'Structured' : overallScore >= 40 ? 'Developing' : 'Reactive',
      exposureScore,
      exposureBand,
      coveragePct: 100,
      nARatePct: 0,
      criticalGapCount: criticalMajorGaps.filter((item) => item.isCriticalGap).length,
      majorGapCount: criticalMajorGaps.filter((item) => item.isMajorGap).length,
      capApplied: maturityCapEvents.length > 0,
      capReason: maturityCapEvents.length > 0 ? 'Fixture hard-gate cap' : null
    },
    domainResults: Object.entries(DOMAIN_NAMES).map(([domainCode, domainName]) => ({
      domainCode,
      domainName,
      weightPct: 10,
      rawScore: scores[domainCode] ?? overallScore,
      weightedContribution: (scores[domainCode] ?? overallScore) / 10,
      coveragePct: 100,
      criticalGapCount: criticalMajorGaps.filter((item) => item.domainCode === domainCode && item.isCriticalGap).length
    })),
    exposureAnswers: [
      { factorCode: 'EXP-01', name: 'High-risk process footprint', selectedLabel: exposureBand, pointsAwarded: exposureScore >= 60 ? 20 : 5, maxPoints: 25 },
      { factorCode: 'EXP-02', name: 'Third-party dependency', selectedLabel: exposureBand, pointsAwarded: exposureScore >= 60 ? 13 : 4, maxPoints: 15 },
      { factorCode: 'EXP-03', name: 'Digital reliance', selectedLabel: exposureBand, pointsAwarded: exposureScore >= 60 ? 12 : 3, maxPoints: 15 },
      { factorCode: 'EXP-04', name: 'Identity dependency', selectedLabel: exposureBand, pointsAwarded: exposureScore >= 60 ? 8 : 2, maxPoints: 10 },
      { factorCode: 'EXP-07', name: 'Manual exceptions', selectedLabel: exposureBand, pointsAwarded: exposureScore >= 60 ? 8 : 2, maxPoints: 10 },
      { factorCode: 'EXP-08', name: 'Public reporting exposure', selectedLabel: exposureBand, pointsAwarded: exposureScore >= 60 ? 6 : 1, maxPoints: 7 }
    ],
    questionTraces: traces,
    criticalMajorGaps,
    officialResponseLabels: officialResponseLabelsFixture,
    maturityCapEvents,
    recommendationRules: [],
    expectedDomainResultCount: 10,
    actualDomainResultCount: 10,
    expectedQuestionTraceCount: traces.length,
    actualQuestionTraceCount: traces.length
  };
}

export function buildMateriallyWeakDecisionFixture(): AssembledReportData {
  const traces = [
    trace('D1-Q04', 1), trace('D3-Q03', 1), trace('D3-Q04', 1), trace('D4-Q02', 1),
    trace('D5-Q01', 1), trace('D5-Q05', 1), trace('D6-Q01', 2),
    trace('D7-Q01', 1), trace('D7-Q04', 0), trace('D8-Q02', 2), trace('D8-Q04', 1)
  ];
  const cap = (questionCode: string, ruleCode: string) => ({
    ruleCode, capTo: 'Developing' as const, reason: 'Fixture hard-gate cap',
    relatedQuestionCode: questionCode,
    relatedQuestionPrompt: AUTHORITATIVE_QUESTION_MAPPINGS[questionCode].prompt,
    relatedDomainCode: AUTHORITATIVE_QUESTION_MAPPINGS[questionCode].domainCode,
    relatedDomainName: DOMAIN_NAMES[AUTHORITATIVE_QUESTION_MAPPINGS[questionCode].domainCode]
  });
  return buildFixture('weak', traces, { D2: 76, D4: 70, D5: 35, D7: 32, D8: 38, D10: 40 }, 52, 78, 'High', [
    cap('D1-Q04', 'hard_gate_lte_2'),
    cap('D1-Q04', 'governance_separation_cap')
  ]);
}

export function buildModerateDecisionFixture(): AssembledReportData {
  return buildFixture('moderate', [
    trace('D1-Q01', 4), trace('D5-Q01', 2), trace('D7-Q04', 2), trace('D8-Q04', 2), trace('D9-Q01', 4)
  ], { D5: 58, D7: 60, D8: 57 }, 66, 58, 'Moderate', []);
}

export function buildCleanAssuranceFixture(): AssembledReportData {
  return buildFixture('clean', [
    trace('D1-Q01', 5), trace('D1-Q04', 4), trace('D3-Q04', 5),
    trace('D5-Q01', 4), trace('D7-Q01', 5), trace('D8-Q04', 4)
  ], { D1: 91, D3: 94, D5: 90, D7: 93, D8: 92 }, 93, 22, 'Low', []);
}
