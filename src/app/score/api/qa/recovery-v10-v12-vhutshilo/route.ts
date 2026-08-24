import { NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import graphJson from '@/lib/adaptive/candidates/adaptive-graph-v1-2-candidate.json';
import { resolveAdaptivePath, type AdaptiveControlResponses, type AdaptiveGraph } from '@/lib/adaptive/engine';
import { calculateAdaptiveReadinessScore } from '@/lib/scoring/adaptive-scoring';
import { buildAdvisoryEvidenceModel } from '@/lib/reports/evidence-model';
import { adaptEssentialEvidenceModel, groundEssentialScenarioStateLanguage } from '@/lib/reports/essential-presentation-adaptation';
import { buildEssentialProjection } from '@/lib/reports/essential-projection';
import { buildEssentialNarrativeFactPack } from '@/lib/reports/narrative/fact-pack';
import { selectContent } from '@/lib/reports/select-content-blocks';
import { adaptAdvisoryRoadmapToLegacyAgenda } from '@/lib/reports/roadmap';
import { composeEssentialManuscript, EssentialManuscriptError } from '@/lib/reports/narrative/essential-manuscript-coordinator';
import { createV11WholeManuscriptWriter } from '@/lib/reports/narrative/whole-manuscript-writer';
import { renderValidatedCommercialPdfWithNavigation } from '@/lib/reports/render-validated-commercial-pdf';
import { renderReportHtml } from '@/lib/reports/templates/report-template';
import { renderHtmlToPdfBuffer } from '@/lib/reports/render-pdf';
import { deriveOperatingContext } from '@/lib/reports/narrative/operating-context';
import type { AssembledReportData, MaturityCapEventRecord, QuestionTraceRecord } from '@/lib/reports/types';
import type { ParsedBlueprintMarkdown } from '@/lib/reports/narrative/blueprint-text';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const graph = graphJson as unknown as AdaptiveGraph;
const GENERATED_AT = '2026-08-24T20:00:00.000Z';
const V12_REPORT_METHODOLOGY_ID = 'c9c40448-8035-4bcc-9804-d5b08a604289';
const EXPECTED = {
  score: 43.33,
  maturity: 'Developing',
  coveragePct: 100,
  applicable: 60,
  excluded: 8,
  redirected: 4,
  unknown: 0,
  criticalGaps: 6,
  majorGaps: 3,
  graphVersion: 'MFRS-V1.2-ADAPTIVE-CANDIDATE-20260821',
  graphFingerprint: '6f1f098a713b1a2f2bf6fc52a1733bf4ffafea8adccedaccc0b721e55bbe45c7',
  methodology: 'MFRS-V1.2-CANDIDATE-OWNER-CORRECTION',
  domains: {
    D1: 42, D2: 39.43, D3: 40.54, D4: 40.59, D5: 43.85,
    D6: 60.83, D7: 47.06, D8: 38.18, D9: 56.67, D10: 40.95
  }
} as const;

const gateways: Readonly<Record<string, string>> = {
  G01: 'manufacturing_production', G02: 'employees_50_249', G03: 'yes', G04: 'external_provider',
  G05: 'dedicated_internal', G06: 'yes', G07: 'yes', G08: 'organisation', G09: 'none',
  G10: 'no', G11: 'no', G12: 'no', G13: 'yes', G14: 'yes', G15: 'no',
  G16: 'two_or_more', G17: 'unknown'
};

function expand(domain: string, values: number[]) {
  return Object.fromEntries(values.map((value, index) => [`${domain}-Q${String(index + 1).padStart(2, '0')}`, value]));
}

const values: Record<string, number> = {
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
const oversight: Record<string, number> = { 'OV-D3-Q03': 2, 'OV-D7-Q01': 3, 'OV-D7-Q04': 3 };
const splitSource: Record<string, string> = {
  'D1-Q07': 'D1-Q04', 'D3-Q08': 'D3-Q04', 'D4-Q08': 'D4-Q05', 'D8-Q09': 'D8-Q04', 'D8-Q10': 'D8-Q08'
};

function methodologyFor(g: AdaptiveGraph) {
  return {
    domains: g.domains.map((domain, domainIndex) => ({
      id: `00000000-0000-4000-8000-${String(domainIndex + 1).padStart(12, '0')}`,
      domainCode: domain.domainCode,
      name: domain.name,
      weightPct: domain.weightPct,
      domainType: 'control',
      isCore: Boolean((domain as { isCore?: boolean }).isCore),
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
const questionByCode = new Map(graph.questions.map((question) => [question.questionCode, question]));
const domainNames = Object.fromEntries(graph.domains.map((domain) => [domain.domainCode, domain.name]));

function valueFor(nodeId: string, replacementFor: string | null, domainCode: string | null): number {
  const oversightValue = oversight[nodeId];
  if (Number.isInteger(oversightValue)) return oversightValue;
  const canonical = replacementFor ?? nodeId;
  if (Number.isInteger(values[canonical])) return values[canonical];
  const source = splitSource[canonical];
  if (source && Number.isInteger(values[source])) return values[source];
  throw new Error(`recovery_truth_unmapped_response:${nodeId}:${replacementFor ?? 'none'}:${domainCode ?? 'none'}`);
}

function buildResponses() {
  const path = resolveAdaptivePath({ graph, gatewayAnswers: gateways });
  const controlResponses: AdaptiveControlResponses = {};
  for (const node of path.activeNodes) {
    if (node.kind === 'gateway') continue;
    controlResponses[node.nodeId] = {
      responseState: 'maturity',
      responseValue: valueFor(node.nodeId, node.replacementFor, node.domainCode)
    };
  }
  return { path, controlResponses };
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

function buildDeterministicChain() {
  if (graph.graphVersion !== EXPECTED.graphVersion) throw new Error(`wrong_graph:${graph.graphVersion}`);
  if (graph.graphFingerprint !== EXPECTED.graphFingerprint) throw new Error(`wrong_fingerprint:${graph.graphFingerprint}`);
  if (graph.methodologyVersion !== EXPECTED.methodology) throw new Error(`wrong_methodology:${graph.methodologyVersion}`);

  const { path, controlResponses } = buildResponses();
  const score = calculateAdaptiveReadinessScore({
    graph,
    methodology,
    gatewayAnswers: gateways,
    controlResponses,
    integritySignals: []
  });

  const actualDomains = Object.fromEntries(score.domainResults.map((domain) => [domain.domainCode, domain.rawScore]));
  if (score.summary.overallScore !== EXPECTED.score
    || score.summary.finalMaturity !== EXPECTED.maturity
    || score.summary.coveragePct !== EXPECTED.coveragePct
    || score.metrics.applicableCount !== EXPECTED.applicable
    || score.metrics.excludedCount !== EXPECTED.excluded
    || score.metrics.redirectedCount !== EXPECTED.redirected
    || score.metrics.unknownCount !== EXPECTED.unknown
    || score.summary.criticalGapCount !== EXPECTED.criticalGaps
    || score.summary.majorGapCount !== EXPECTED.majorGaps
    || JSON.stringify(actualDomains) !== JSON.stringify(EXPECTED.domains)) {
    throw new Error(`frozen_vhutshilo_truth_mismatch:${JSON.stringify({
      score: score.summary.overallScore,
      maturity: score.summary.finalMaturity,
      coveragePct: score.summary.coveragePct,
      applicable: score.metrics.applicableCount,
      excluded: score.metrics.excludedCount,
      redirected: score.metrics.redirectedCount,
      unknown: score.metrics.unknownCount,
      criticalGaps: score.summary.criticalGapCount,
      majorGaps: score.summary.majorGapCount,
      domains: actualDomains
    })}`);
  }

  const context = deriveOperatingContext({ graphVersion: graph.graphVersion, gatewayAnswers: gateways, graph });
  const contextByKey = new Map(context.map((fact) => [fact.key, fact]));
  const contextChecks = [
    ['MULTI_SITE_OR_DISTRIBUTED_OPERATIONS', 'AFFIRMED', 'G13'],
    ['TEMPORARY_SEASONAL_OR_SUBCONTRACTED_WORKFORCE', 'AFFIRMED', 'G14'],
    ['PERSONAL_OR_IDENTITY_DATA', 'NEGATED', 'G11'],
    ['MANUAL_FINANCIAL_OR_STOCK_ADJUSTMENTS', 'NEGATED', 'G12'],
    ['INTERMEDIARY_EXPOSURE', 'NOT_ESTABLISHED', 'G17']
  ] as const;
  for (const [key, certainty, gateway] of contextChecks) {
    const fact = contextByKey.get(key);
    if (!fact || fact.certainty !== certainty || fact.sourceGatewayCode !== gateway) {
      throw new Error(`operating_context_truth_mismatch:${key}:${fact?.certainty ?? 'missing'}:${fact?.sourceGatewayCode ?? 'missing'}`);
    }
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

  const data: AssembledReportData = {
    orderId: '11111111-1111-4111-8111-000000000003',
    orderReference: 'MKORD-V12-QA-VHUTSHILO-V10-FINAL',
    orderAssessmentId: '22222222-2222-4222-8222-000000000003',
    assessmentId: '22222222-2222-4222-8222-000000000003',
    organisationId: '33333333-3333-4333-8333-000000000003',
    currentScoreRunId: '44444444-4444-4444-8444-000000000003',
    orderVerifiedAt: GENERATED_AT,
    orderVerifiedBy: null,
    paymentVerification: { legacyOrderVerification: true } as any,
    organisationName: 'Vhutshilo Foods Manufacturing (Pty) Ltd',
    respondentName: 'Synthetic recovery acceptance respondent',
    customerEmail: 'vhutshilo-v10-recovery@example.test',
    assessmentReference: 'MKFRS-V12-COMP-VHUTSHILO',
    reportReference: 'RPT-MKFRS-V12-ESS-VHUTSHILO-V1',
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
      id: '44444444-4444-4444-8444-000000000003',
      assessmentId: '22222222-2222-4222-8222-000000000003',
      methodologyVersionId: V12_REPORT_METHODOLOGY_ID,
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
    adaptiveGatewayAnswers: gateways
  };

  const advisory = buildAdvisoryEvidenceModel(data);
  const evidenceModel = adaptEssentialEvidenceModel(advisory, data.adaptiveGatewayAnswers, [], graph.graphVersion);
  const projection = buildEssentialProjection(data, evidenceModel);
  const content = selectContent(data, [], projection);
  const roadmap = adaptAdvisoryRoadmapToLegacyAgenda(projection.roadmapActions);
  const factPack = buildEssentialNarrativeFactPack(data, evidenceModel, projection);

  if (projection.findings.length === 0) throw new Error('recovery_projection_empty');
  const sectorText = factPack.organisation.sectorFacts.join(' ');
  if (!/manufactur/i.test(sectorText)) throw new Error('manufacturing_context_missing');
  if (!/more than one site|project location/i.test(sectorText)) throw new Error('multisite_context_missing');
  if (!/temporary, seasonal or subcontracted/i.test(sectorText)) throw new Error('workforce_context_missing');
  if (/records personal or identity information handling\./i.test(sectorText) && !/no personal or identity information/i.test(sectorText)) {
    throw new Error('personal_data_negative_flipped_positive');
  }

  return { data, score, path, evidenceModel, projection, content, roadmap, factPack, context, actualDomains };
}

function groundScenarioNarrative(
  narrative: ParsedBlueprintMarkdown,
  findings: ReturnType<typeof buildAdvisoryEvidenceModel>['materialFindings']
): ParsedBlueprintMarkdown {
  return {
    ...narrative,
    chapters: narrative.chapters.map((chapter) => {
      if (chapter.chapterId !== 'EXPOSURE-COULD-MATERIALISE') return chapter;
      return {
        ...chapter,
        sections: chapter.sections.map((section) => ({
          ...section,
          paragraphs: section.paragraphs.map((block) => ({
            ...block,
            text: groundEssentialScenarioStateLanguage(block.text, findings)
          })),
          subsections: section.subsections.map((subsection) => ({
            ...subsection,
            paragraphs: subsection.paragraphs.map((block) => ({
              ...block,
              text: groundEssentialScenarioStateLanguage(block.text, findings)
            }))
          }))
        }))
      };
    })
  };
}

const RECOVERY_RAW_ID = /\b(?:D\d+-Q\d+|(?:MF|RISK|SC|CI|RA|DEC|DECISION|THEME|FINDING|CONTROL|PROOF|ROADMAP)-[A-Z0-9-]+|[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\b/g;
const RECOVERY_RAW_ID_TEST = /\b(?:D\d+-Q\d+|(?:MF|RISK|SC|CI|RA|DEC|DECISION|THEME|FINDING|CONTROL|PROOF|ROADMAP)-[A-Z0-9-]+|[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)\b/;

function sanitiseRecoveryMachineIdentifiers(markdown: string): { markdown: string; replacements: number } {
  let replacements = 0;
  const cleaned = markdown.replace(RECOVERY_RAW_ID, (token) => {
    replacements += 1;
    if (/^D\d+-Q\d+$/.test(token)) return 'the relevant assessed control';
    if (/^(?:RA|ROADMAP)-/.test(token)) return 'the relevant roadmap action';
    if (/^(?:PROOF|CI)-/.test(token)) return 'the relevant evidence requirement';
    return 'the relevant control';
  });
  if (RECOVERY_RAW_ID_TEST.test(cleaned)) throw new Error('recovery_raw_internal_id_survived_normalisation');
  return { markdown: cleaned, replacements };
}

function stripRetiredRegisterPromise(html: string): string {
  // Remove only the individual paragraph that contains the retired Essential-register promise.
  // Never allow the scrubber to span across sibling paragraphs or headings.
  const scrubbed = html.replace(/<p\b[^>]*>[\s\S]*?<\/p>/gi, (paragraph) =>
    /(?:Essential Supporting Register|supporting-register\.xlsx|supporting register)/i.test(paragraph) ? '' : paragraph
  );
  if (/(?:Essential Supporting Register|supporting-register\.xlsx|\.xlsx\b)/i.test(scrubbed)) {
    throw new Error('retired_essential_register_promise_survived_render');
  }
  return scrubbed;
}

const renderPdfOnlyHtml: typeof renderReportHtml = (...args) => stripRetiredRegisterPromise(renderReportHtml(...args));

export async function GET(request: Request) {
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'preview') {
    return NextResponse.json({ ok: false, error: 'recovery_route_preview_only' }, { status: 404 });
  }

  const format = new URL(request.url).searchParams.get('format') ?? 'meta';
  try {
    const chain = buildDeterministicChain();
    const meta = {
      ok: true,
      proof: 'PASS',
      providerCalls: 0,
      reportEngine: 'CERTIFIED_V10_WHOLE_MANUSCRIPT',
      organisationName: chain.data.organisationName,
      assessmentReference: chain.data.assessmentReference,
      reportReference: chain.data.reportReference,
      score: chain.data.scoreRun.overallScore,
      finalMaturity: chain.data.scoreRun.finalMaturity,
      coveragePct: chain.data.scoreRun.coveragePct,
      applicableControls: chain.score.metrics.applicableCount,
      excludedControls: chain.score.metrics.excludedCount,
      redirectedControls: chain.score.metrics.redirectedCount,
      unknownControls: chain.score.metrics.unknownCount,
      criticalGaps: chain.data.scoreRun.criticalGapCount,
      majorGaps: chain.data.scoreRun.majorGapCount,
      domainScores: chain.actualDomains,
      graphVersion: graph.graphVersion,
      graphFingerprint: graph.graphFingerprint,
      methodology: graph.methodologyVersion,
      activePathCount: chain.path.activePathCount,
      projectedFindings: chain.projection.findings.length,
      operatingContext: chain.context.map((fact) => ({ key: fact.key, value: fact.value, certainty: fact.certainty, gateway: fact.sourceGatewayCode })),
      packageContract: 'PDF_ONLY_NO_XLSX_REGISTER'
    };

    if (format === 'meta') {
      return NextResponse.json(meta, { headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
    }
    if (format !== 'pdf') {
      return NextResponse.json({ ok: false, error: 'unsupported_format' }, { status: 400 });
    }

    const db = createSupabaseServiceClient();
    const manuscriptBucket = 'generated-reports';
    const validatedManuscriptPath = 'recovery-qa/v10-v12/RPT-MKFRS-V12-ESS-VHUTSHILO-V1-manuscript.json';
    const rawManuscriptPath = 'recovery-qa/v10-v12/RPT-MKFRS-V12-ESS-VHUTSHILO-V1-raw-manuscript.json';
    let groundedNarrative: ParsedBlueprintMarkdown;
    let providerCalls = 0;
    let manuscriptReused = false;

    const { data: cachedValidated, error: cachedValidatedError } = await db.storage
      .from(manuscriptBucket)
      .download(validatedManuscriptPath);
    if (cachedValidated && !cachedValidatedError) {
      const cached = JSON.parse(await cachedValidated.text()) as {
        reportReference?: string;
        graphFingerprint?: string;
        score?: number;
        groundedNarrative?: ParsedBlueprintMarkdown;
      };
      if (cached.reportReference !== chain.data.reportReference
        || cached.graphFingerprint !== graph.graphFingerprint
        || cached.score !== chain.data.scoreRun.overallScore
        || !cached.groundedNarrative) {
        throw new Error('cached_recovery_manuscript_truth_mismatch');
      }
      groundedNarrative = cached.groundedNarrative;
      manuscriptReused = true;
    } else {
      const baseWriter = createV11WholeManuscriptWriter(undefined, { providerCallBudget: 1 });
      const writer = new Proxy(baseWriter, {
        get(target, prop, receiver) {
          if (prop === 'writeManuscript') {
            return async (writerInput: Parameters<typeof target.writeManuscript>[0]) => {
              const { data: cachedRaw, error: cachedRawError } = await db.storage
                .from(manuscriptBucket)
                .download(rawManuscriptPath);
              let rawResult: Awaited<ReturnType<typeof target.writeManuscript>>;
              if (cachedRaw && !cachedRawError) {
                rawResult = JSON.parse(await cachedRaw.text()) as Awaited<ReturnType<typeof target.writeManuscript>>;
                manuscriptReused = true;
              } else {
                rawResult = await target.writeManuscript(writerInput);
                providerCalls = Number(rawResult.writerMetadata?.recovery?.totalCalls ?? 1);
                if (providerCalls !== 1) throw new Error(`unexpected_provider_call_count:${providerCalls}`);

                const rawBytes = Buffer.from(JSON.stringify(rawResult), 'utf8');
                const { error: rawUploadError } = await db.storage.from(manuscriptBucket).upload(
                  rawManuscriptPath,
                  rawBytes,
                  { contentType: 'application/json', upsert: false }
                );
                if (rawUploadError) throw new Error(`recovery_raw_manuscript_cache_failed:${rawUploadError.message}`);
                const { data: rawVerified, error: rawVerifyError } = await db.storage
                  .from(manuscriptBucket)
                  .download(rawManuscriptPath);
                if (rawVerifyError || !rawVerified) {
                  throw new Error(`recovery_raw_manuscript_cache_verify_failed:${rawVerifyError?.message ?? 'missing_cache'}`);
                }
                const verifiedRaw = JSON.parse(await rawVerified.text()) as { markdown?: string; blueprint?: unknown };
                if (!verifiedRaw.markdown || !verifiedRaw.blueprint) throw new Error('recovery_raw_manuscript_cache_verify_invalid');
              }

              const sanitised = sanitiseRecoveryMachineIdentifiers(String(rawResult.markdown ?? ''));
              if (sanitised.replacements > 0) {
                console.info('recovery_raw_internal_id_normalisation', { replacements: sanitised.replacements });
              }
              return { ...rawResult, markdown: sanitised.markdown };
            };
          }
          const value = Reflect.get(target, prop, receiver);
          return typeof value === 'function' ? value.bind(target) : value;
        }
      });

      const composed = await composeEssentialManuscript({ factPack: chain.factPack, writer });
      groundedNarrative = groundScenarioNarrative(composed.narrative, chain.evidenceModel.materialFindings);

      const cacheBytes = Buffer.from(JSON.stringify({
        reportReference: chain.data.reportReference,
        graphFingerprint: graph.graphFingerprint,
        score: chain.data.scoreRun.overallScore,
        finalMaturity: chain.data.scoreRun.finalMaturity,
        groundedNarrative,
        writerMetadata: composed.manuscript.writerMetadata
      }), 'utf8');
      const { error: cacheUploadError } = await db.storage.from(manuscriptBucket).upload(
        validatedManuscriptPath,
        cacheBytes,
        { contentType: 'application/json', upsert: false }
      );
      if (cacheUploadError) throw new Error(`recovery_manuscript_cache_failed:${cacheUploadError.message}`);
      const { data: verifiedCache, error: verifiedCacheError } = await db.storage
        .from(manuscriptBucket)
        .download(validatedManuscriptPath);
      if (verifiedCacheError || !verifiedCache) {
        throw new Error(`recovery_manuscript_cache_verify_failed:${verifiedCacheError?.message ?? 'missing_cache'}`);
      }
      const verified = JSON.parse(await verifiedCache.text()) as {
        reportReference?: string;
        graphFingerprint?: string;
        score?: number;
      };
      if (verified.reportReference !== chain.data.reportReference
        || verified.graphFingerprint !== graph.graphFingerprint
        || verified.score !== chain.data.scoreRun.overallScore) {
        throw new Error('recovery_manuscript_cache_verify_truth_mismatch');
      }
    }

    const pdf = await renderValidatedCommercialPdfWithNavigation(
      {
        data: chain.data,
        content: chain.content,
        roadmap: chain.roadmap,
        evidenceModel: chain.evidenceModel,
        narrative: groundedNarrative
      },
      { renderHtml: renderPdfOnlyHtml, renderPdf: renderHtmlToPdfBuffer }
    );

    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${chain.data.reportReference}.pdf"`,
        'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex',
        'X-MK-Recovery-Proof': 'PASS',
        'X-MK-Provider-Calls': String(providerCalls),
        'X-MK-Manuscript-Reused': manuscriptReused ? 'true' : 'false',
        'X-MK-Score': String(chain.data.scoreRun.overallScore),
        'X-MK-Maturity': String(chain.data.scoreRun.finalMaturity),
        'X-MK-Graph': graph.graphVersion
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const diagnostics = error instanceof EssentialManuscriptError ? error.diagnostics : undefined;
    console.error('recovery_v10_v12_vhutshilo_failed', { message, diagnostics });
    return NextResponse.json(
      { ok: false, error: message.slice(0, 600), diagnostics },
      { status: 500, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } }
    );
  }
}
