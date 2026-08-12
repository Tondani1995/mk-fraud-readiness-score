import crypto, { randomUUID } from 'node:crypto';
import { assembleReportData } from '@/lib/reports/assemble-report-data';
import { renderHtmlToPdfBuffer } from '@/lib/reports/render-pdf';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { buildComprehensiveDeliveryModel, fromAssembledReportData, renderBoardReadoutHtml, renderComprehensiveReportHtml, renderWorkshopMaterialHtml } from '@/lib/reports/comprehensive';
import { buildComprehensiveRegisterWorkbookBytes } from '@/lib/reports/comprehensive/workbook-builder';
import { registerComprehensivePackageAtomically, type AtomicPackageUpload } from './package-registration';
import { getEngagementByOrderReference, canReadComprehensiveEngagement } from './engagement-service';
import type { AdminRole } from '@/lib/types/domain';
import { assertNarrativeCompositionReady, type ValidatedNarrativeRelease } from '@/lib/reports/narrative/release-gate';

const PDF_MIME = 'application/pdf';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function db() { return createSupabaseServiceClient() as any; }

function checksum(bytes: Uint8Array) { return crypto.createHash('sha256').update(bytes).digest('hex'); }

function safeFileName(value: string, fallback: string) {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);
  return cleaned || fallback;
}


export type ComprehensivePresentationUpload = { bytes: Uint8Array; fileName: string; mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' };

export type ComprehensiveGenerationResult =
  | { ok: true; engagementId: string; reportId: string; artifactVersion: number; artifactNames: string[]; presentationUploadRequired: false }
  | { ok: false; reason: 'forbidden' | 'engagement_not_found' | 'review_incomplete' | 'payment_not_verified' | 'presentation_upload_required' | 'manuscript_approval_required' | 'generation_failed'; message: string; engagementId?: string; reportId?: string; artifactVersion?: number };

/**
 * Real production boundary: persisted assessment -> deterministic analytical universe ->
 * Comprehensive model -> actual PDF/XLSX/PDF/PDF bytes -> private storage -> immutable metadata.
 * The presentation is deliberately a reviewer-uploaded approved template because this repository
 * has no safe PPTX authoring dependency; closure remains blocked until that exact artefact exists.
 */
export async function generateComprehensivePackage(input: {
  orderReference: string;
  actor: { id: string; role: AdminRole };
  executivePresentation?: ComprehensivePresentationUpload;
  narrativeRelease?: ValidatedNarrativeRelease;
}): Promise<ComprehensiveGenerationResult> {
  if (!canReadComprehensiveEngagement(input.actor.role) || !['platform_admin', 'reviewer', 'approver'].includes(input.actor.role)) return { ok: false, reason: 'forbidden', message: 'Only an authorised Comprehensive reviewer or approver may generate the package.' };
  const engagement = await getEngagementByOrderReference(input.orderReference);
  if (!engagement) return { ok: false, reason: 'engagement_not_found', message: 'No Comprehensive engagement exists for that order.' };

  if (!input.executivePresentation) {
    return { ok: false, reason: 'presentation_upload_required', message: 'Generation requires the approved executive presentation template.', engagementId: engagement.id };
  }
  if (!input.narrativeRelease) {
    return { ok: false, reason: 'manuscript_approval_required', message: 'Reporting Bible v1.1 requires a passing, owner-approved plain-text manuscript before any customer PDF is composed.', engagementId: engagement.id };
  }
  try {
    assertNarrativeCompositionReady(input.narrativeRelease);
  } catch (error) {
    return { ok: false, reason: 'manuscript_approval_required', message: error instanceof Error ? error.message : 'Validated manuscript release is not ready for composition.', engagementId: engagement.id };
  }

  try {
    const assembled = await assembleReportData(input.orderReference);
    const model = await fromAssembledReportData(assembled);
    // Explicitly build the bounded projection before rendering so the production path cannot
    // accidentally render an unbounded analytical universe.
    buildComprehensiveDeliveryModel(model.analytical);
    const reportPdf = await renderHtmlToPdfBuffer(renderComprehensiveReportHtml(model));
    const boardPdf = await renderHtmlToPdfBuffer(renderBoardReadoutHtml(model));
    const workshopPdf = await renderHtmlToPdfBuffer(renderWorkshopMaterialHtml(model));
    const registerXlsx = await buildComprehensiveRegisterWorkbookBytes(model);
    const service = db();
    const { data: existingReports } = await service.from('reports').select('version_number').eq('order_id', engagement.orderId).eq('report_type', 'mk_validated').order('version_number', { ascending: false }).limit(1);
    const artifactVersion = Number(existingReports?.[0]?.version_number ?? 0) + 1;
    const reportId = randomUUID();
    const primaryPath = `${engagement.id}/v${artifactVersion}/${reportId}.pdf`;
    const uploads: AtomicPackageUpload[] = [
      { objectId: randomUUID(), artefactType: 'supporting_register', fileName: safeFileName(`${assembled.assessmentReference}-annotated-register.xlsx`, 'annotated-register.xlsx'), mimeType: XLSX_MIME, bytes: registerXlsx, checksum: checksum(registerXlsx), path: `${engagement.id}/v${artifactVersion}/__REGISTER__.xlsx` },
      { objectId: randomUUID(), artefactType: 'board_readout', fileName: safeFileName(`${assembled.assessmentReference}-board-readout.pdf`, 'board-readout.pdf'), mimeType: PDF_MIME, bytes: boardPdf, checksum: checksum(boardPdf), path: `${engagement.id}/v${artifactVersion}/__BOARD__.pdf` },
      { objectId: randomUUID(), artefactType: 'executive_presentation', fileName: safeFileName(input.executivePresentation.fileName, 'executive-presentation.pptx'), mimeType: input.executivePresentation.mimeType, bytes: Buffer.from(input.executivePresentation.bytes), checksum: checksum(input.executivePresentation.bytes), path: `${engagement.id}/v${artifactVersion}/__PRESENTATION__.pptx` },
      { objectId: randomUUID(), artefactType: 'workshop_material', fileName: safeFileName(`${assembled.assessmentReference}-workshop-material.pdf`, 'workshop-material.pdf'), mimeType: PDF_MIME, bytes: workshopPdf, checksum: checksum(workshopPdf), path: `${engagement.id}/v${artifactVersion}/__WORKSHOP__.pdf` }
    ];
    for (const upload of uploads) {
      const extension = upload.artefactType === 'supporting_register' ? 'xlsx' : upload.artefactType === 'executive_presentation' ? 'pptx' : 'pdf';
      upload.path = `${engagement.id}/v${artifactVersion}/${upload.objectId}.${extension}`;
    }
    const primaryFileName = safeFileName(`${assembled.assessmentReference}-comprehensive-report.pdf`, 'comprehensive-report.pdf');
    const templateId = (await service.from('report_templates').select('id').eq('report_type', 'mk_validated').eq('status', 'active').order('version_number', { ascending: false }).limit(1).maybeSingle()).data?.id ?? null;
    await registerComprehensivePackageAtomically({
      db: service,
      engagementId: engagement.id,
      reportId,
      artifactVersion,
      templateId,
      primary: { fileName: primaryFileName, mimeType: PDF_MIME, bytes: reportPdf, checksum: checksum(reportPdf), path: primaryPath },
      uploads,
      generatedBy: input.actor.id
    });
    return { ok: true, engagementId: engagement.id, reportId, artifactVersion, artifactNames: [primaryFileName, ...uploads.map((upload) => upload.fileName)], presentationUploadRequired: false };
  } catch (error) {
    return { ok: false, reason: 'generation_failed', message: error instanceof Error ? error.message : 'Comprehensive generation failed closed.', engagementId: engagement.id };
  }
}
