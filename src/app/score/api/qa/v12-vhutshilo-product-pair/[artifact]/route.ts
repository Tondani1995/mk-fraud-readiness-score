import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { buildVhutshiloV12Assembled, VHUTSHILO_V12_GRAPH, VHUTSHILO_V12_SOURCE_SHA } from '@/lib/qa/v12-vhutshilo-fixture';
import { buildAdvisoryEvidenceModel } from '@/lib/reports/evidence-model';
import { adaptEssentialEvidenceModel } from '@/lib/reports/essential-presentation-adaptation';
import { buildEssentialProjection } from '@/lib/reports/essential-projection';
import { selectContent } from '@/lib/reports/select-content-blocks';
import { adaptAdvisoryRoadmapToLegacyAgenda } from '@/lib/reports/roadmap';
import { buildEssentialNarrativeFactPack } from '@/lib/reports/narrative/fact-pack';
import { composeEssentialManuscript } from '@/lib/reports/narrative/essential-manuscript-coordinator';
import type { EssentialSemanticReviewer } from '@/lib/reports/narrative/semantic-reviewer';
import { createV11WholeManuscriptWriter } from '@/lib/reports/narrative/whole-manuscript-writer';
import { renderValidatedCommercialPdfWithNavigation } from '@/lib/reports/render-validated-commercial-pdf';
import { renderComprehensiveReportPackage } from '@/lib/reports/comprehensive/manual-generation';
import { generateComprehensiveInterpretation } from '@/lib/reports/comprehensive/interpretation';
import { assertEssentialFinalHtml, type EssentialValidationCascadeResult } from '@/lib/reports/essential-validation-cascade';
import { renderHtmlToPdfBuffer } from '@/lib/reports/render-pdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const ESSENTIAL_MODEL = 'openai/gpt-5-mini';
const COMPREHENSIVE_MODEL = 'openai/gpt-5.6-luna';

function sha256(bytes: Uint8Array | Buffer | string): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function tarHeader(name: string, size: number): Buffer {
  const header = Buffer.alloc(512, 0);
  const put = (value: string, offset: number, length: number) => header.write(value.slice(0, length), offset, length, 'ascii');
  put(name, 0, 100);
  put('0000644\0', 100, 8);
  put('0000000\0', 108, 8);
  put('0000000\0', 116, 8);
  put(`${size.toString(8).padStart(11, '0')}\0`, 124, 12);
  put(`${Math.floor(Date.now() / 1000).toString(8).padStart(11, '0')}\0`, 136, 12);
  header.fill(0x20, 148, 156);
  put('0', 156, 1);
  put('ustar\0', 257, 6);
  put('00', 263, 2);
  let sum = 0;
  for (const byte of header) sum += byte;
  put(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8);
  return header;
}

function buildTar(files: Array<{ name: string; bytes: Buffer }>): Buffer {
  const chunks: Buffer[] = [];
  for (const file of files) {
    chunks.push(tarHeader(file.name, file.bytes.length), file.bytes);
    const remainder = file.bytes.length % 512;
    if (remainder) chunks.push(Buffer.alloc(512 - remainder));
  }
  chunks.push(Buffer.alloc(1024));
  return Buffer.concat(chunks);
}

function deterministicMeta() {
  const { data, score, path, controlResponses } = buildVhutshiloV12Assembled();
  return {
    sourceSha: VHUTSHILO_V12_SOURCE_SHA,
    graphVersion: VHUTSHILO_V12_GRAPH,
    organisationName: data.organisationName,
    assessmentReference: data.assessmentReference,
    reportReference: data.reportReference,
    score: data.scoreRun.overallScore,
    calculatedMaturity: data.scoreRun.calculatedMaturity,
    finalMaturity: data.scoreRun.finalMaturity,
    coveragePct: data.scoreRun.coveragePct,
    applicableControls: score.metrics.applicableCount,
    excludedControls: score.metrics.excludedCount,
    redirectedControls: score.metrics.redirectedCount,
    unknownControls: score.metrics.unknownCount,
    activeResponseCount: Object.keys(controlResponses).length,
    activePathCount: path.activePathCount
  };
}

async function renderEssential(): Promise<Buffer> {
  const { data } = buildVhutshiloV12Assembled();
  const advisoryModel = buildAdvisoryEvidenceModel(data);
  const reportEvidenceModel = adaptEssentialEvidenceModel(advisoryModel, data.adaptiveGatewayAnswers);
  const projection = buildEssentialProjection(data, reportEvidenceModel);
  const content = selectContent(data, [], projection);
  const roadmap = adaptAdvisoryRoadmapToLegacyAgenda(projection.roadmapActions);
  const factPack = buildEssentialNarrativeFactPack(data, reportEvidenceModel, projection);
  const writer = createV11WholeManuscriptWriter(ESSENTIAL_MODEL, { allowTailRecovery: false });
  const semanticReviewer: EssentialSemanticReviewer | undefined = writer.reviewSemanticCandidates
    ? { review: (reviewRequest) => writer.reviewSemanticCandidates!(reviewRequest) }
    : undefined;
  const composed = await composeEssentialManuscript({ factPack, writer, semanticReviewer });
  return renderValidatedCommercialPdfWithNavigation({
    data,
    content,
    narrative: composed.narrative,
    roadmap,
    evidenceModel: reportEvidenceModel,
    carryForwardAssuranceSpanHashes: composed.acceptedAssuranceSpanHashes,
    carryForwardSemanticDecisions: composed.acceptedSemanticDecisions
  });
}

async function renderComprehensiveTar(): Promise<Buffer> {
  const { data } = buildVhutshiloV12Assembled();
  const advisoryModel = buildAdvisoryEvidenceModel(data);
  let finalValidation: EssentialValidationCascadeResult | null = null;

  const result = await renderComprehensiveReportPackage({
    assembled: data,
    evidenceModel: advisoryModel,
    maxRepairsPerSlot: 0,
    orderReference: data.orderReference,
    reportReference: data.reportReference,
    versionNumber: 1,
    generateInterpretation: async (brief, options) => {
      const run = await generateComprehensiveInterpretation(brief, {
        ...options,
        model: COMPREHENSIVE_MODEL,
        maxRepairsPerSlot: 0
      });
      if (run.issues.length) {
        throw new Error(`Comprehensive interpretation unresolved issues: ${JSON.stringify(run.issues)}`);
      }
      return run;
    },
    renderPdf: async (html, options) => {
      finalValidation = assertEssentialFinalHtml({ html, data });
      return renderHtmlToPdfBuffer(html, options);
    }
  });

  if (!finalValidation?.publishable) throw new Error('Comprehensive final five-layer validation did not reach publishable acceptance.');

  const meta = {
    ...deterministicMeta(),
    tier: 'Comprehensive',
    model: result.interpretationRun.accounting.model,
    interpretationAccounting: result.interpretationRun.accounting,
    interpretationIssues: result.interpretationRun.issues,
    assemblyVersion: result.source.assemblyVersion,
    managementModelVersion: result.source.managementModelVersion,
    finalValidation: {
      policyVersion: finalValidation.policyVersion,
      publishable: finalValidation.publishable,
      finalHtmlSha256: finalValidation.finalHtmlSha256,
      blockingCodes: finalValidation.blockingCodes,
      heldForReviewCodes: finalValidation.heldForReviewCodes,
      warningCodes: finalValidation.warningCodes,
      candidateCount: finalValidation.candidates.length
    },
    pdf: { bytes: result.pdf.length, sha256: sha256(result.pdf) },
    workbook: {
      fileName: result.workbook.fileName,
      bytes: result.workbook.bytes.length,
      sha256: result.workbook.checksumSha256,
      sheetNames: result.workbook.sheetNames,
      rowCounts: result.workbook.rowCounts
    }
  };

  return buildTar([
    { name: `${data.reportReference}-COMPREHENSIVE.pdf`, bytes: result.pdf },
    { name: result.workbook.fileName, bytes: result.workbook.bytes },
    { name: 'comprehensive-meta.json', bytes: Buffer.from(JSON.stringify(meta, null, 2), 'utf8') }
  ]);
}

export async function GET(_request: Request, props: { params: Promise<{ artifact: string }> }) {
  const { artifact } = await props.params;
  try {
    if (artifact === 'meta') {
      return NextResponse.json({ ok: true, ...deterministicMeta(), essentialModel: ESSENTIAL_MODEL, comprehensiveModel: COMPREHENSIVE_MODEL }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (artifact === 'essential') {
      const pdf = await renderEssential();
      const meta = deterministicMeta();
      return new Response(new Uint8Array(pdf), {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="${meta.reportReference}-ESSENTIAL.pdf"`,
          'Cache-Control': 'no-store',
          'X-MK-Source-SHA': VHUTSHILO_V12_SOURCE_SHA,
          'X-MK-Model': ESSENTIAL_MODEL,
          'X-MK-PDF-SHA256': sha256(pdf),
          'X-MK-Score': String(meta.score),
          'X-MK-Maturity': String(meta.finalMaturity)
        }
      });
    }
    if (artifact === 'comprehensive') {
      const tar = await renderComprehensiveTar();
      return new Response(new Uint8Array(tar), {
        status: 200,
        headers: {
          'Content-Type': 'application/x-tar',
          'Content-Disposition': 'attachment; filename="vhutshilo-comprehensive-package.tar"',
          'Cache-Control': 'no-store',
          'X-MK-Source-SHA': VHUTSHILO_V12_SOURCE_SHA,
          'X-MK-Model': COMPREHENSIVE_MODEL,
          'X-MK-TAR-SHA256': sha256(tar)
        }
      });
    }
    return NextResponse.json({ ok: false, error: 'unknown_artifact' }, { status: 404 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('v12_vhutshilo_product_pair_failed', { artifact, message });
    return NextResponse.json({ ok: false, artifact, error: message.slice(0, 4000) }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
  }
}
