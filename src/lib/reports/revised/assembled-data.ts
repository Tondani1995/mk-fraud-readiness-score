import type { StagedReportInput, ControlRecord } from '@/lib/readiness-review/report-input';
import type { AssembledReportData, QuestionTraceRecord } from '@/lib/reports/types';
import type { AdvisoryEvidenceModel } from '@/lib/reports/evidence-model/types';
import { contentRegistry } from '@/lib/reports/methodology-content';
import { REVISED_METHOD_LABEL, revisedDomainCode } from './evidence-model';

/**
 * FICTIONAL INTEGRATION PROTOTYPE. The `AssembledReportData` shell the existing report engines expect, built from a
 * staged review session. The review method produces no score; the existing Essential exhibits nevertheless print an
 * overall figure, a band and a figure per area. Those values are supplied by the caller as an explicitly labelled
 * TEST FIXTURE and are never calculated here. No order, payment, entitlement or customer record exists.
 */
export type RevisedNumericFixture = {
  label: string;
  overall: number | null;
  maturity: 'Reactive' | 'Developing' | 'Structured' | 'Strategic' | null;
  areas: { area: string; value: number | null }[];
};

export const REVISED_FIXTURE_LABEL = 'TEST FIXTURE: hypothetical research value (scoring-frame simulation, Option A, midpoint, equal areas, no caps). Not an approved score, band or rating.';

const REG = contentRegistry('revised-review');
const LEVEL_LABELS = ['Not in place', 'Informal / reactive', 'Partly designed', 'Implemented in key areas', 'Consistently operating', 'Embedded and improving'];
const LEVEL_MEANING = [
  'Reported as not in place.', 'Reported as informal or reactive.', 'Reported as partly designed.', 'Reported as implemented in key areas.',
  'Reported as consistently operating.', 'Reported as embedded and improving.'
];

export function buildRevisedAssembledData(input: {
  staged: StagedReportInput;
  evidence: AdvisoryEvidenceModel;
  organisationName: string;
  assessmentReference: string;
  generatedAt: string;
  gatewayAnswers: Record<string, string>;
  fixture: RevisedNumericFixture;
}): AssembledReportData {
  const { staged, fixture } = input;
  const domains = staged.domains as { id: string; name: string; controls: ControlRecord[] }[];
  const traces: QuestionTraceRecord[] = domains.flatMap((d) => d.controls
    .filter((c) => c.role === 'confirm' && c.format === 'anchored' && c.answer && /^[0-5]$/.test(String(c.answer.value)))
    .map((c) => {
      const level = Number(c.answer!.value);
      const tier = c.scenario?.tier ?? 3;
      return {
        questionCode: c.id, domainCode: revisedDomainCode(d.id), domainName: d.name, prompt: REG.question(c.id)?.text ?? c.text,
        responseValue: level, isCritical: tier === 1, isHardGate: false, isCriticalGap: tier === 1 && level <= 1, isMajorGap: tier <= 2 && level <= 2,
        normalisedScore: null, applicable: true, triggeredRules: []
      } as QuestionTraceRecord;
    }));
  const valueFor = new Map(fixture.areas.map((x) => [x.area, x.value]));
  const findings = input.evidence.materialFindings;
  return {
    orderId: null, orderReference: null, orderAssessmentId: `fixture-${input.assessmentReference}`, assessmentId: `fixture-${input.assessmentReference}`, organisationId: 'fixture-organisation',
    currentScoreRunId: `fixture-${input.assessmentReference}`, orderVerifiedAt: null, orderVerifiedBy: null, paymentVerification: null as any,
    organisationName: input.organisationName, respondentName: 'Fictional respondent', customerEmail: 'fictional@example.test',
    assessmentReference: input.assessmentReference, reportReference: `RPT-${input.assessmentReference}`, generatedAt: input.generatedAt,
    packageName: 'Fictional integration prototype', productCode: null, orderStatus: null, amountCents: null, currency: null, productPriceCents: null, productCurrency: null,
    requiresPaymentVerification: null, deliveryMode: null, productActive: null,
    scoreRun: {
      id: `fixture-${input.assessmentReference}`, assessmentId: `fixture-${input.assessmentReference}`, methodologyVersionId: REVISED_METHOD_LABEL,
      status: 'test_fixture', lockedAt: null, inputHash: null, overallScore: fixture.overall, calculatedMaturity: fixture.maturity, finalMaturity: fixture.maturity,
      exposureScore: null, exposureBand: null, coveragePct: 100, nARatePct: 0,
      criticalGapCount: findings.filter((f) => f.gapClassification === 'critical').length, majorGapCount: findings.filter((f) => f.gapClassification === 'major').length,
      capApplied: false, capReason: fixture.label, capEffect: 'none'
    },
    // Only areas with applicable confirmations carry a fixture value; an area out of scope is not shown as zero.
    domainResults: domains.filter((d) => typeof valueFor.get(d.id) === 'number').map((d) => ({
      domainCode: revisedDomainCode(d.id), domainName: d.name, weightPct: Math.round(100 / domains.length), rawScore: valueFor.get(d.id) ?? null,
      weightedContribution: null, coveragePct: null, criticalGapCount: findings.filter((f) => f.domainCode === revisedDomainCode(d.id) && f.gapClassification === 'critical').length
    })),
    exposureAnswers: [],
    questionTraces: traces,
    criticalMajorGaps: traces.filter((t) => t.isCriticalGap || t.isMajorGap).map(({ normalisedScore: _n, applicable: _a, triggeredRules: _t, ...g }) => g),
    officialResponseLabels: LEVEL_LABELS.map((label, i) => ({ responseValue: i, label, operationalMeaning: LEVEL_MEANING[i], normalisedScore: i * 20, displayOrder: i + 1 })) as any,
    maturityCapEvents: [], recommendationRules: [],
    expectedDomainResultCount: domains.length, actualDomainResultCount: domains.length, expectedQuestionTraceCount: traces.length, actualQuestionTraceCount: traces.length,
    adaptiveScope: null as any, adaptiveGatewayAnswers: { ...input.gatewayAnswers }
  };
}
