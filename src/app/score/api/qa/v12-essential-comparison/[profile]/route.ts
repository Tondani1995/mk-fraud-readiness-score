import { NextResponse } from 'next/server';
import graphJson from '@/lib/adaptive/candidates/adaptive-graph-v1-2-candidate.json';
import {
  resolveAdaptivePath,
  type AdaptiveControlResponses,
  type AdaptiveGatewayAnswers,
  type AdaptiveGraph
} from '@/lib/adaptive/engine';
import { calculateAdaptiveReadinessScore } from '@/lib/scoring/adaptive-scoring';
import { buildAdvisoryEvidenceModel } from '@/lib/reports/evidence-model';
import { adaptEssentialEvidenceModel } from '@/lib/reports/essential-presentation-adaptation';
import { buildEssentialProjection } from '@/lib/reports/essential-projection';
import { selectContent } from '@/lib/reports/select-content-blocks';
import { adaptAdvisoryRoadmapToLegacyAgenda } from '@/lib/reports/roadmap';
import { buildEssentialNarrativeFactPack } from '@/lib/reports/narrative/fact-pack';
import {
  composeEssentialManuscript,
  EssentialManuscriptError
} from '@/lib/reports/narrative/essential-manuscript-coordinator';
import type { EssentialSemanticReviewer } from '@/lib/reports/narrative/semantic-reviewer';
import { createV11WholeManuscriptWriter } from '@/lib/reports/narrative/whole-manuscript-writer';
import { renderValidatedCommercialPdf } from '@/lib/reports/render-validated-commercial-pdf';
import { EssentialValidationCascadeError } from '@/lib/reports/essential-validation-cascade';
import type {
  AssembledReportData,
  MaturityCapEventRecord,
  QuestionTraceRecord
} from '@/lib/reports/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const graph = graphJson as unknown as AdaptiveGraph;
const MODEL = 'openai/gpt-5-mini';
const GENERATED_AT = '2026-08-23T12:00:00.000Z';
const V12_METHODOLOGY_ID = '00f2b435-a027-4a06-886b-23998faeaca6';
const DIAGNOSTIC_REVISION = 'semantic-audit-v1';
const domainNames = Object.fromEntries(graph.domains.map((domain) => [domain.domainCode, domain.name]));
const questionByCode = new Map(graph.questions.map((question) => [question.questionCode, question]));

function expand(domain: string, values: number[]) {
  return Object.fromEntries(values.map((value, index) => [`${domain}-Q${String(index + 1).padStart(2, '0')}`, value]));
}

const profiles = {
  bokamoso: {
    seed: '000000000001',
    organisationName: 'Bokamoso Skills Institute',
    assessmentReference: 'MKFRS-V12-COMP-BOKAMOSO',
    reportReference: 'RPT-MKFRS-V12-COMP-BOKAMOSO-V1',
    orderReference: 'MKORD-V12-COMP-BOKAMOSO',
    gateways: {
      G01: 'other_mixed', G02: 'employees_50_249', G03: 'yes', G04: 'organisation',
      G05: 'dedicated_internal', G06: 'yes', G07: 'no', G08: 'organisation', G09: 'own',
      G10: 'yes', G11: 'yes', G12: 'yes', G13: 'yes', G14: 'yes', G15: 'no',
      G16: 'one_person', G17: 'unknown'
    },
    values: {
      ...expand('D1', [2,0,1,2,0,1]),
      ...expand('D2', [2,0,1,2,0,1,1,2]),
      ...expand('D3', [3,1,2,3,1,2,2]),
      ...expand('D4', [2,0,1,2,0,1,1]),
      ...expand('D5', [2,0,1,2,0,1,1]),
      ...expand('D6', [2,0,1,2,0,1]),
      ...expand('D7', [3,1,2,3,1,2,2]),
      ...expand('D8', [3,1,2,3,1,2,2,3]),
      ...expand('D9', [3,1,2,3,1,2]),
      ...expand('D10', [2,0,1,2,0,1]),
      'D3-Q09': 2, 'D3-Q10': 2, 'D3-Q11': 2
    },
    oversight: {}
  },
  siyakhula: {
    seed: '000000000002',
    organisationName: 'Siyakhula Community Foundation',
    assessmentReference: 'MKFRS-V12-COMP-SIYAKHULA',
    reportReference: 'RPT-MKFRS-V12-COMP-SIYAKHULA-V1',
    orderReference: 'MKORD-V12-COMP-SIYAKHULA',
    gateways: {
      G01: 'public_nonprofit_member', G02: 'employees_10_49', G03: 'yes', G04: 'external_provider',
      G05: 'dedicated_internal', G06: 'yes', G07: 'yes', G08: 'organisation', G09: 'none',
      G10: 'no', G11: 'yes', G12: 'no', G13: 'yes', G14: 'yes', G15: 'yes',
      G16: 'two_or_more', G17: 'unknown'
    },
    values: {
      ...expand('D1', [4,2,3,4,2,3]),
      ...expand('D2', [3,1,2,3,1,2,2,3]),
      ...expand('D3', [3,1,2,2,2,3,1]),
      ...expand('D4', [2,0,1,2,0,1,1]),
      ...expand('D5', [3,1,2,3,1,2,2]),
      ...expand('D6', [5,3,4,5,3,4]),
      ...expand('D7', [3,3,1,3,2,3,1]),
      ...expand('D8', [2,0,1,2,0,1,1,2]),
      ...expand('D9', [5,3,4,5,3,4]),
      ...expand('D10', [2,0,1,2,0,1]),
      'D3-Q09': 2, 'D3-Q10': 2, 'D3-Q11': 2
    },
    oversight: { 'OV-D3-Q03': 2, 'OV-D7-Q01': 3, 'OV-D7-Q04': 3 }
  },
  vhutshilo: {
    seed: '000000000003',
    organisationName: 'Vhutshilo Foods Manufacturing (Pty) Ltd',
    assessmentReference: 'MKFRS-V12-COMP-VHUTSHILO',
    reportReference: 'RPT-MKFRS-V12-COMP-VHUTSHILO-V1',
    orderReference: 'MKORD-V12-COMP-VHUTSHILO',
    gateways: {
      G01: 'manufacturing_production', G02: 'employees_50_249', G03: 'yes', G04: 'external_provider',
      G05: 'dedicated_internal', G06: 'yes', G07: 'yes', G08: 'organisation', G09: 'none',
      G10: 'no', G11: 'no', G12: 'no', G13: 'yes', G14: 'yes', G15: 'no',
      G16: 'two_or_more', G17: 'unknown'
    },
    values: {
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
    },
    oversight: { 'OV-D3-Q03': 2, 'OV-D7-Q01': 3, 'OV-D7-Q04': 3 }
  }
} as const;

type ProfileKey = keyof typeof profiles;
type Profile = (typeof profiles)[ProfileKey];

const splitSource: Record<string, string> = {
  'D1-Q07': 'D1-Q04',
  'D3-Q08': 'D3-Q04',
  'D4-Q08': 'D4-Q05',
  'D8-Q09': 'D8-Q04',
  'D8-Q10': 'D8-Q08'
};

function methodologyFor(g: AdaptiveGraph) {
  return {
    domains: g.domains.map((domain, domainIndex) => ({
      id: `00000000-0000-4000-8000-${String(domainIndex + 1).padStart(12, '0')}`,
      domainCode: domain.domainCode,
      name: domain.name,
      weightPct: domain.weightPct,
      domainType: 'control',
      isCore: Boolean((domain as any).isCore),
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
  } as any;
}

const methodology = methodologyFor(graph);
const questionCodeByMethodologyId = new Map(
  methodology.domains.flatMap((domain: any) => domain.questions).map((question: any) => [question.id, question.questionCode])
);
const domainCodeByMethodologyId = new Map(methodology.domains.map((domain: any) => [domain.id, domain.domainCode]));

function valueFor(profile: Profile, nodeId: string, replacementFor: string | null, domainCode: string | null): number {
  const oversight = (profile.oversight as Record<string, number>)[nodeId];
  if (Number.isInteger(oversight)) return oversight;
  const canonical = replacementFor ?? nodeId;
  const values = profile.values as Record<string, number>;
  if (Number.isInteger(values[canonical])) return values[canonical];
  const source = splitSource[canonical];
  if (source && Number.isInteger(values[source])) return values[source];
  return domainCode === 'D3' ? 2 : 2;
}

function buildResponses(profile: Profile) {
  const gatewayAnswers = profile.gateways as AdaptiveGatewayAnswers;
  const path = resolveAdaptivePath({ graph, gatewayAnswers });
  const controlResponses: AdaptiveControlResponses = {};
  for (const node of path.activeNodes) {
    if (node.kind === 'gateway') continue;
    controlResponses[node.nodeId] = {
      responseState: 'maturity',
      responseValue: valueFor(profile, node.nodeId, node.replacementFor, node.domainCode)
    };
  }
  return { gatewayAnswers, controlResponses, path };
}

function capEvents(score: ReturnType<typeof calculateAdaptiveReadinessScore>): MaturityCapEventRecord[] {
  return score.maturityCapEvents.map((event) => {
    const relatedQuestionCode = event.relatedQuestionId
      ? questionCodeByMethodologyId.get(event.relatedQuestionId) ?? null
      : null;
    const relatedQuestion = relatedQuestionCode ? questionByCode.get(String(relatedQuestionCode)) : null;
    const relatedDomainCode = event.relatedDomainId
      ? domainCodeByMethodologyId.get(event.relatedDomainId) ?? null
      : relatedQuestion?.domainCode ?? null;
    return {
      ruleCode: event.ruleCode,
      capTo: event.capTo,
      reason: event.reason,
      relatedQuestionCode: relatedQuestionCode ? String(relatedQuestionCode) : null,
      relatedQuestionPrompt: relatedQuestion?.prompt ?? null,
      relatedDomainCode: relatedDomainCode ? String(relatedDomainCode) : null,
      relatedDomainName: relatedDomainCode ? domainNames[String(relatedDomainCode)] ?? null : null
    };
  });
}

function assembledFor(profileKey: ProfileKey) {
  const profile = profiles[profileKey];
  const { gatewayAnswers, controlResponses, path } = buildResponses(profile);
  const score = calculateAdaptiveReadinessScore({
    graph,
    methodology,
    gatewayAnswers,
    controlResponses,
    integritySignals: []
  });
  if (score.summary.overallScore === null || !score.summary.calculatedMaturity || !score.summary.finalMaturity) {
    throw new Error(`${profileKey}: V1.2 score unavailable`);
  }
  const traces: QuestionTraceRecord[] = score.metrics.questionTraces.map((trace) => ({
    questionCode: trace.questionCode,
    domainCode: trace.domainCode,
    domainName: domainNames[trace.domainCode] ?? trace.domainCode,
    prompt: trace.prompt,
    responseValue: trace.responseValue,
    normalisedScore: trace.normalisedScore,
    applicable: trace.applicable,
    triggeredRules: trace.triggeredRules,
    isCritical: trace.isCritical,
    isHardGate: trace.isHardGate,
    isCriticalGap: trace.isCriticalGap,
    isMajorGap: trace.isMajorGap
  }));
  const seed = profile.seed;
  const ids = {
    order: `11111111-1111-4111-8111-${seed}`,
    assessment: `22222222-2222-4222-8222-${seed}`,
    organisation: `33333333-3333-4333-8333-${seed}`,
    score: `44444444-4444-4444-8444-${seed}`
  };
  const data: AssembledReportData = {
    orderId: ids.order,
    orderReference: profile.orderReference,
    orderAssessmentId: ids.assessment,
    assessmentId: ids.assessment,
    organisationId: ids.organisation,
    currentScoreRunId: ids.score,
    orderVerifiedAt: GENERATED_AT,
    orderVerifiedBy: null,
    paymentVerification: { legacyOrderVerification: true } as any,
    organisationName: profile.organisationName,
    respondentName: 'Synthetic comparison respondent',
    customerEmail: `${profileKey}@example.test`,
    assessmentReference: profile.assessmentReference,
    reportReference: profile.reportReference,
    generatedAt: GENERATED_AT,
    packageName: 'Essential',
    productCode: 'essential_self_assessment',
    orderStatus: 'payment_received',
    amountCents: 750000,
    currency: 'ZAR',
    productPriceCents: 750000,
    productCurrency: 'ZAR',
    requiresPaymentVerification: true,
    deliveryMode: 'mk_controlled_pdf',
    productActive: true,
    scoreRun: {
      id: ids.score,
      assessmentId: ids.assessment,
      methodologyVersionId: V12_METHODOLOGY_ID,
      status: 'completed',
      lockedAt: GENERATED_AT,
      inputHash: score.inputHash,
      overallScore: score.summary.overallScore,
      calculatedMaturity: score.summary.calculatedMaturity,
      finalMaturity: score.summary.finalMaturity,
      exposureScore: null,
      exposureBand: null,
      coveragePct: score.summary.coveragePct,
      nARatePct: score.summary.nARatePct,
      criticalGapCount: score.summary.criticalGapCount,
      majorGapCount: score.summary.majorGapCount,
      capApplied: score.summary.capApplied,
      capReason: score.summary.capReason,
      adaptiveResultStatus: score.resultStatus,
      adaptiveMetrics: score.metrics
    },
    domainResults: score.domainResults.map((domain) => ({
      domainCode: domain.domainCode,
      domainName: domain.domainName,
      weightPct: domain.domainWeightPct,
      rawScore: domain.rawScore,
      weightedContribution: domain.weightedContribution,
      coveragePct: domain.coveragePct,
      criticalGapCount: domain.criticalGapCount
    })),
    exposureAnswers: [],
    questionTraces: traces,
    criticalMajorGaps: traces.filter((trace) => trace.isCriticalGap || trace.isMajorGap),
    officialResponseLabels: graph.responseScale.map((row, displayOrder) => ({
      responseValue: row.responseValue,
      label: row.label,
      operationalMeaning: row.operationalMeaning ?? '',
      normalisedScore: row.normalisedScore,
      displayOrder
    })),
    maturityCapEvents: capEvents(score),
    recommendationRules: [],
    expectedDomainResultCount: 10,
    actualDomainResultCount: score.domainResults.length,
    expectedQuestionTraceCount: 68,
    actualQuestionTraceCount: traces.length,
    adaptiveScope: score.metrics,
    adaptiveGatewayAnswers: Object.fromEntries(
      Object.entries(gatewayAnswers).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    )
  };
  return { profile, data, score, path, controlResponses };
}

function metadata(profileKey: ProfileKey) {
  const { profile, data, score, path, controlResponses } = assembledFor(profileKey);
  return {
    diagnosticRevision: DIAGNOSTIC_REVISION,
    profile: profileKey,
    organisationName: profile.organisationName,
    methodology: graph.methodologyVersion,
    graphVersion: graph.graphVersion,
    graphFingerprint: graph.graphFingerprint,
    score: data.scoreRun.overallScore,
    calculatedMaturity: data.scoreRun.calculatedMaturity,
    finalMaturity: data.scoreRun.finalMaturity,
    resultStatus: score.resultStatus,
    coveragePct: data.scoreRun.coveragePct,
    applicableControls: score.metrics.applicableCount,
    excludedControls: score.metrics.excludedCount,
    redirectedControls: score.metrics.redirectedCount,
    unknownControls: score.metrics.unknownCount,
    criticalGaps: data.scoreRun.criticalGapCount,
    majorGaps: data.scoreRun.majorGapCount,
    domainScores: Object.fromEntries(data.domainResults.map((domain) => [domain.domainCode, domain.rawScore])),
    gateways: profile.gateways,
    activeResponseCount: Object.keys(controlResponses).length,
    activePathCount: path.activePathCount
  };
}

type SemanticAuditRow = {
  candidateId: string;
  disposition: string;
  reasonCode: string;
  ruleCode?: string;
  path?: string;
  blueprintPath?: string;
  chapterTitle?: string;
  sectionTitle?: string;
  subsectionTitle?: string;
  span?: string;
};

export async function GET(request: Request, props: { params: Promise<{ profile: string }> }) {
  const { profile: raw } = await props.params;
  if (!(raw in profiles)) return NextResponse.json({ ok: false, error: 'unknown_profile' }, { status: 404 });
  const profileKey = raw as ProfileKey;
  const format = new URL(request.url).searchParams.get('format') ?? 'pdf';
  if (format === 'meta') {
    return NextResponse.json({ ok: true, ...metadata(profileKey) }, { headers: { 'Cache-Control': 'no-store' } });
  }

  let semanticAudit: SemanticAuditRow[] | undefined;
  try {
    const { data } = assembledFor(profileKey);
    const advisoryModel = buildAdvisoryEvidenceModel(data);
    const reportEvidenceModel = adaptEssentialEvidenceModel(advisoryModel, data.adaptiveGatewayAnswers);
    const projection = buildEssentialProjection(data, reportEvidenceModel);
    const content = selectContent(data, [], projection);
    const roadmap = adaptAdvisoryRoadmapToLegacyAgenda(projection.roadmapActions);
    const factPack = buildEssentialNarrativeFactPack(data, reportEvidenceModel, projection);
    const writer = createV11WholeManuscriptWriter(MODEL, { allowTailRecovery: false });
    const semanticReviewer: EssentialSemanticReviewer | undefined = writer.reviewSemanticCandidates
      ? {
          review: async (reviewRequest) => {
            const result = await writer.reviewSemanticCandidates!(reviewRequest);
            semanticAudit = result.decisions
              .filter((decision) => decision.disposition !== 'ALLOW')
              .map((decision) => {
                const candidate = reviewRequest.candidates.find((item) => item.candidateId === decision.candidateId);
                return {
                  candidateId: decision.candidateId,
                  disposition: decision.disposition,
                  reasonCode: decision.reasonCode,
                  ruleCode: candidate?.ruleCode,
                  path: candidate?.path,
                  blueprintPath: candidate?.blueprintPath,
                  chapterTitle: candidate?.chapterTitle,
                  sectionTitle: candidate?.sectionTitle,
                  subsectionTitle: candidate?.subsectionTitle,
                  span: candidate?.paragraph
                };
              });
            return result;
          }
        }
      : undefined;

    const composed = await composeEssentialManuscript({ factPack, writer, semanticReviewer });
    const pdf = await renderValidatedCommercialPdf({
      data,
      content,
      narrative: composed.narrative,
      roadmap,
      evidenceModel: reportEvidenceModel,
      carryForwardAssuranceSpanHashes: composed.acceptedAssuranceSpanHashes,
      carryForwardSemanticDecisions: composed.acceptedSemanticDecisions
    });
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${data.reportReference}.pdf"`,
        'Cache-Control': 'no-store',
        'X-MK-Score': String(data.scoreRun.overallScore),
        'X-MK-Maturity': String(data.scoreRun.finalMaturity),
        'X-MK-Graph': graph.graphVersion
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const validation = error instanceof EssentialValidationCascadeError
      ? error.result.candidates
          .filter((item) => item.finalDisposition === 'HELD_FOR_REVIEW' || item.finalDisposition === 'REJECT')
          .map((item) => ({
            ruleCode: item.ruleCode,
            path: item.path,
            span: item.span,
            spanHash: item.spanHash,
            finalDisposition: item.finalDisposition,
            decisions: item.decisions
          }))
      : undefined;
    const manuscriptDiagnostics = error instanceof EssentialManuscriptError ? error.diagnostics : undefined;
    console.error('v12_essential_comparison_failed', {
      profile: profileKey,
      message,
      validation,
      semanticAudit,
      manuscriptDiagnostics
    });
    return NextResponse.json(
      {
        ok: false,
        profile: profileKey,
        error: message.slice(0, 500),
        validation,
        semanticAudit,
        manuscriptDiagnostics
      },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
}
