import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import type { AssembledReportData } from '@/lib/reports/types';
import { buildAdvisoryEvidenceModel, checkQualityGates } from '@/lib/reports/evidence-model';
import { MFRS_V12_METHODOLOGY_ID } from '@/lib/reports/evidence-model/question-playbooks';
import { buildEssentialProjection } from '@/lib/reports/essential-projection';
import { buildEssentialNarrativeFactPack } from '@/lib/reports/narrative/fact-pack';
import { getMaturityBand } from '@/lib/scoring/maturity-band';
import { assembleComprehensive } from '@/lib/reports/comprehensive/assembly';
import { buildComprehensiveManagementModel } from '@/lib/reports/comprehensive/management-model';
import { buildComprehensiveDeliveryModel, assertComprehensiveBlueprintContract } from '@/lib/reports/comprehensive/contract';
import { adaptComprehensiveEvidenceModel, adaptComprehensiveScenarioFacts } from '@/lib/reports/comprehensive/customer-visible-adaptation';
import { buildInterpretationBrief, buildInterpretationPrompt, COMPREHENSIVE_INTERPRETATION_VERSION } from '@/lib/reports/comprehensive/interpretation';
import { renderComprehensiveReportPackage } from '@/lib/reports/comprehensive/manual-generation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

// This is a deliberately narrow, non-production owner-acceptance seam. It accepts
// only the committed Cedar Ridge fixture, calls the same package builder as
// fulfilment, writes nothing, and is disabled in Production.
const CEDAR_RIDGE_FIXTURE_SHA256 = '00c2bab9128c8079fa1d9ec44f9b5907acd4d5f37508f41f2ef5d022b72a4354';
const CEDAR_RIDGE_ASSESSMENT_REFERENCE = 'MKFRS-CEDAR-RIDGE-FIXTURE';
const CEDAR_RIDGE_ORDER_REFERENCE = 'MKORD-CEDAR-RIDGE-FIXTURE';
const CEDAR_RIDGE_REPORT_REFERENCE = 'RPT-MKFRS-CEDAR-RIDGE-FIXTURE-V2';
const CEDAR_RIDGE_GRAPH_FINGERPRINT = '6f1f098a713b1a2f2bf6fc52a1733bf4ffafea8adccedaccc0b721e55bbe45c7';

function sha256(value: string | Uint8Array): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function noStoreJson(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function acceptanceGateOpen(): boolean {
  return process.env.VERCEL_ENV !== 'production'
    && process.env.MK_NON_PRODUCTION_ADMIN_ACCESS === 'enabled';
}

function isCedarRidgeFixture(value: unknown): value is AssembledReportData {
  if (!value || typeof value !== 'object') return false;
  const assembled = value as Partial<AssembledReportData>;
  return assembled.assessmentReference === CEDAR_RIDGE_ASSESSMENT_REFERENCE
    && assembled.orderReference === CEDAR_RIDGE_ORDER_REFERENCE
    && assembled.reportReference === CEDAR_RIDGE_REPORT_REFERENCE
    && assembled.scoreRun?.methodologyVersionId === MFRS_V12_METHODOLOGY_ID
    && assembled.scoreRun?.adaptiveMetrics?.graphFingerprint === CEDAR_RIDGE_GRAPH_FINGERPRINT
    && assembled.domainResults?.length === 10
    && assembled.questionTraces?.length === 68;
}

export async function POST(request: Request) {
  const technicalReference = crypto.randomUUID();
  if (!acceptanceGateOpen()) return noStoreJson({ ok: false, reason: 'preview_acceptance_gate_closed', technicalReference }, 403);

  const body = await request.json().catch(() => null) as { assessment?: unknown } | null;
  const assembledValue = body?.assessment;
  if (!isCedarRidgeFixture(assembledValue)) return noStoreJson({ ok: false, reason: 'cedar_ridge_fixture_required', technicalReference }, 400);

  const fixtureSha256 = sha256(JSON.stringify(assembledValue));
  if (fixtureSha256 !== CEDAR_RIDGE_FIXTURE_SHA256) return noStoreJson({ ok: false, reason: 'cedar_ridge_fixture_hash_mismatch', technicalReference }, 400);

  const assembled = assembledValue;
  const quality = checkQualityGates(buildAdvisoryEvidenceModel(assembled), assembled);
  if (quality.violations.length) return noStoreJson({ ok: false, reason: 'deterministic_quality_gate_failed', technicalReference }, 422);

  try {
    const evidenceModel = buildAdvisoryEvidenceModel(assembled);
    const customerEvidenceModel = adaptComprehensiveEvidenceModel(evidenceModel);
    const projection = buildEssentialProjection(assembled, customerEvidenceModel);
    const factPack = buildEssentialNarrativeFactPack(assembled, customerEvidenceModel, projection);
    const domains = factPack.domains
      .filter((domain) => typeof domain.score === 'number')
      .map((domain) => ({ name: domain.name, score: domain.score as number, band: getMaturityBand(domain.score as number) }));
    const comprehensiveAssembly = assembleComprehensive(customerEvidenceModel, {
      scenarioFacts: adaptComprehensiveScenarioFacts(factPack.scenarios),
      domains,
      contradictions: customerEvidenceModel.contradictions,
      assembled,
      scenarioUniverse: customerEvidenceModel.scenarios
    });
    const managementModel = buildComprehensiveManagementModel(comprehensiveAssembly);
    const score = assembled.scoreRun.overallScore;
    const maturity = assembled.scoreRun.finalMaturity;
    if (typeof score !== 'number' || !maturity) return noStoreJson({ ok: false, reason: 'completed_score_required', technicalReference }, 422);
    const deliveryModel = buildComprehensiveDeliveryModel({
      assembled,
      evidenceModel: customerEvidenceModel,
      score: {
        overallScore: score,
        calculatedMaturity: assembled.scoreRun.calculatedMaturity,
        finalMaturity: maturity,
        exposureScore: assembled.scoreRun.exposureScore,
        exposureBand: assembled.scoreRun.exposureBand,
        coveragePct: assembled.scoreRun.coveragePct,
        nARatePct: assembled.scoreRun.nARatePct,
        criticalGapCount: assembled.scoreRun.criticalGapCount,
        majorGapCount: assembled.scoreRun.majorGapCount,
        capApplied: assembled.scoreRun.capApplied,
        capReason: assembled.scoreRun.capReason,
        methodologyVersionId: assembled.scoreRun.methodologyVersionId
      },
      organisationName: assembled.organisationName,
      assessmentReference: assembled.assessmentReference,
      generatedAt: assembled.generatedAt
    }, {
      domainDiagnostics: comprehensiveAssembly.domainDiagnostics,
      scenarioSelectionAudit: comprehensiveAssembly.scenarioSelectionAudit,
      scenarioPortfolio: comprehensiveAssembly.scenarioPortfolio
    });
    assertComprehensiveBlueprintContract(deliveryModel);

    const brief = buildInterpretationBrief({
      model: managementModel,
      organisationName: assembled.organisationName,
      score,
      maturity,
      domains,
      assembled,
      evidenceModel: customerEvidenceModel
    });
    const prompt = buildInterpretationPrompt(brief);
    const startedAt = Date.now();
    const result = await renderComprehensiveReportPackage({
      assembled,
      evidenceModel,
      orderReference: CEDAR_RIDGE_ORDER_REFERENCE,
      reportReference: CEDAR_RIDGE_REPORT_REFERENCE,
      versionNumber: 2,
      maxRepairsPerSlot: 0
    });
    const durationMs = Date.now() - startedAt;
    const pdfSha256 = sha256(result.pdf);
    const xlsxSha256 = sha256(result.workbook.bytes);
    return noStoreJson({
      ok: true,
      technicalReference,
      fixtureSha256,
      interpretationVersion: COMPREHENSIVE_INTERPRETATION_VERSION,
      evidencePackSha256: sha256(JSON.stringify(brief.evidencePack)),
      promptSha256: sha256(prompt),
      accounting: result.interpretationRun.accounting,
      durationMs,
      providerResponse: result.interpretationRun.interpretation,
      safety: result.safetyRun,
      deterministic: {
        scenarioSelectionAudit: comprehensiveAssembly.scenarioSelectionAudit,
        scenarioCount: comprehensiveAssembly.scenarioPortfolio.length,
        contradictionCount: comprehensiveAssembly.contradictions.length,
        domainDiagnosticCount: comprehensiveAssembly.domainDiagnostics.length
      },
      finalNarrativeSha256: sha256(JSON.stringify(result.interpretationRun.interpretation)),
      output: {
        pdf: { bytes: result.pdf.byteLength, sha256: pdfSha256, base64: result.pdf.toString('base64') },
        xlsx: { bytes: result.workbook.bytes.byteLength, sha256: xlsxSha256, base64: result.workbook.bytes.toString('base64') },
        workbookSheets: result.workbook.sheetNames,
        workbookRows: result.workbook.rowCounts
      }
    });
  } catch {
    return noStoreJson({ ok: false, reason: 'preview_interpretation_failed', technicalReference }, 500);
  }
}
