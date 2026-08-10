import crypto, { randomUUID } from 'node:crypto';
import { assembleReportData } from '@/lib/reports/assemble-report-data';
import { renderHtmlToPdfBuffer } from '@/lib/reports/render-pdf';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { buildComprehensiveDeliveryModel, fromAssembledReportData, renderBoardReadoutHtml, renderComprehensiveReportHtml } from '@/lib/reports/comprehensive';
import { buildComprehensiveRegisterWorkbookBytes } from '@/lib/reports/comprehensive/workbook-builder';
import { completeComprehensiveArtifact } from './artifact-service';
import { getEngagementByOrderReference, canReadComprehensiveEngagement } from './engagement-service';
import { loadComprehensiveReviewerInput } from './review-record-service';
import type { AdminRole } from '@/lib/types/domain';

const BUCKET = 'comprehensive-reports';
const PDF_MIME = 'application/pdf';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

type Upload = { objectId: string; artefactType: 'supporting_register' | 'board_readout' | 'workshop_material'; fileName: string; mimeType: string; bytes: Buffer; checksum: string; path: string };

function db() { return createSupabaseServiceClient() as any; }

function checksum(bytes: Uint8Array) { return crypto.createHash('sha256').update(bytes).digest('hex'); }

function safeFileName(value: string, fallback: string) {
  const cleaned = value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);
  return cleaned || fallback;
}

function workshopHtml(model: Awaited<ReturnType<typeof buildComprehensiveDeliveryModel>>) {
  const items = model.reviewerInput.managementDecisions.map((decision) => `<li><strong>${escapeHtml(decision.decision)}</strong> · ${escapeHtml(decision.owner)} · ${escapeHtml(decision.targetDate)}</li>`).join('');
  const agenda = model.reviewerInput.boardDecisions?.join('; ') || 'Confirm evidence boundaries, ownership, decisions and next checkpoints.';
  return `<!doctype html><html lang="en-ZA"><head><meta charset="utf-8"><title>Comprehensive workshop material</title><style>@page{size:A4;margin:16mm}body{font-family:Arial;color:#172232;line-height:1.45}h1{color:#142f4c;font-size:28pt}h2{color:#142f4c;margin-top:18mm}.kicker{color:#c77b35;text-transform:uppercase;letter-spacing:.12em;font-weight:700;font-size:9pt}.card{border-left:4px solid #c77b35;background:#f3f6f8;padding:6mm;margin:5mm 0}li{margin:3mm 0}</style></head><body><div class="kicker">MK Fraud Readiness · Comprehensive</div><h1>Management workshop material</h1><p>Named reviewer: ${escapeHtml(model.reviewerInput.reviewer.name)} · ${escapeHtml(model.reviewerInput.reviewer.reviewDate)}</p><div class="card"><strong>Workshop outcome</strong><p>Translate the evidence review into owned, sequenced decisions with explicit limitations.</p></div><h2>Working agenda</h2><ol>${['Findings challenge','Evidence disagreements','Ownership and accountability','Action prioritisation','Board decisions','Implementation sequencing'].map((item) => `<li>${item}</li>`).join('')}</ol><h2>Decision prompts</h2><p>${escapeHtml(agenda)}</p><h2>Management decisions captured</h2><ul>${items || '<li>No management action has been recorded yet; use the reviewer workspace to capture it.</li>'}</ul><h2>Working rules</h2><ul>${['Challenge the evidence and interpretation, not the person.','Do not change a recorded assessment answer through narrative alone.','Use validated / supported only for the stated scope and evidence examined.','Leave every decision with an owner, date, status and traceable reference.'].map((item) => `<li>${item}</li>`).join('')}</ul></body></html>`;
}

function escapeHtml(value: unknown) { return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;'); }

async function uploadExact(storage: any, upload: Upload | { path: string; bytes: Buffer; mimeType: string }) {
  const { error } = await storage.from(BUCKET).upload(upload.path, upload.bytes, { contentType: upload.mimeType, upsert: false });
  if (error) throw new Error(`comprehensive_generation_storage_upload_failed:${error.message}`);
}

async function removeExact(storage: any, paths: string[]) {
  if (paths.length) await storage.from(BUCKET).remove(paths).catch(() => undefined);
}

export type ComprehensivePresentationUpload = { bytes: Uint8Array; fileName: string; mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' };

export type ComprehensiveGenerationResult =
  | { ok: true; engagementId: string; reportId: string; artifactVersion: number; artifactNames: string[]; presentationUploadRequired: false }
  | { ok: false; reason: 'forbidden' | 'engagement_not_found' | 'review_incomplete' | 'payment_not_verified' | 'presentation_upload_required' | 'generation_failed'; message: string; engagementId?: string; reportId?: string; artifactVersion?: number };

/**
 * Real production boundary: persisted assessment -> persisted reviewer input -> deterministic
 * Comprehensive model -> actual PDF/XLSX/PDF/PDF bytes -> private storage -> immutable metadata.
 * The presentation is deliberately a reviewer-uploaded approved template because this repository
 * has no safe PPTX authoring dependency; closure remains blocked until that exact artefact exists.
 */
export async function generateComprehensivePackage(input: {
  orderReference: string;
  actor: { id: string; role: AdminRole };
  executivePresentation?: ComprehensivePresentationUpload;
}): Promise<ComprehensiveGenerationResult> {
  if (!canReadComprehensiveEngagement(input.actor.role) || !['platform_admin', 'reviewer', 'approver'].includes(input.actor.role)) return { ok: false, reason: 'forbidden', message: 'Only an authorised Comprehensive reviewer or approver may generate the package.' };
  const engagement = await getEngagementByOrderReference(input.orderReference);
  if (!engagement) return { ok: false, reason: 'engagement_not_found', message: 'No Comprehensive engagement exists for that order.' };

  let reviewerInput;
  try {
    reviewerInput = await loadComprehensiveReviewerInput(engagement.id);
  } catch (error) {
    return { ok: false, reason: 'review_incomplete', message: error instanceof Error ? error.message : 'Mandatory human review records are incomplete.' };
  }
  if (!input.executivePresentation) {
    return { ok: false, reason: 'presentation_upload_required', message: 'Generation is fail-closed until the reviewer uploads the approved executive presentation template.', engagementId: engagement.id };
  }

  try {
    const assembled = await assembleReportData(input.orderReference);
    const model = await fromAssembledReportData(assembled, reviewerInput);
    // Explicitly build the bounded projection before rendering so the production path cannot
    // accidentally render an unbounded analytical universe.
    buildComprehensiveDeliveryModel(model.analytical, model.reviewerInput);
    const reportPdf = await renderHtmlToPdfBuffer(renderComprehensiveReportHtml(model));
    const boardPdf = await renderHtmlToPdfBuffer(renderBoardReadoutHtml(model));
    const workshopPdf = await renderHtmlToPdfBuffer(workshopHtml(model));
    const registerXlsx = await buildComprehensiveRegisterWorkbookBytes(model);
    const service = db();
    const { data: existingReports } = await service.from('reports').select('version_number').eq('order_id', engagement.orderId).eq('report_type', 'mk_validated').order('version_number', { ascending: false }).limit(1);
    const artifactVersion = Number(existingReports?.[0]?.version_number ?? 0) + 1;
    const reportId = randomUUID();
    const primaryPath = `${engagement.id}/v${artifactVersion}/${reportId}.pdf`;
    const uploads: Upload[] = [
      { objectId: randomUUID(), artefactType: 'supporting_register', fileName: safeFileName(`${assembled.assessmentReference}-annotated-register.xlsx`, 'annotated-register.xlsx'), mimeType: XLSX_MIME, bytes: registerXlsx, checksum: checksum(registerXlsx), path: `${engagement.id}/v${artifactVersion}/__REGISTER__.xlsx` },
      { objectId: randomUUID(), artefactType: 'board_readout', fileName: safeFileName(`${assembled.assessmentReference}-board-readout.pdf`, 'board-readout.pdf'), mimeType: PDF_MIME, bytes: boardPdf, checksum: checksum(boardPdf), path: `${engagement.id}/v${artifactVersion}/__BOARD__.pdf` },
      { objectId: randomUUID(), artefactType: 'workshop_material', fileName: safeFileName(`${assembled.assessmentReference}-workshop-material.pdf`, 'workshop-material.pdf'), mimeType: PDF_MIME, bytes: workshopPdf, checksum: checksum(workshopPdf), path: `${engagement.id}/v${artifactVersion}/__WORKSHOP__.pdf` }
    ];
    for (const upload of uploads) upload.path = `${engagement.id}/v${artifactVersion}/${upload.objectId}.${upload.mimeType === XLSX_MIME ? 'xlsx' : 'pdf'}`;
    const primary = { storage_bucket: BUCKET, storage_path: primaryPath, file_name: safeFileName(`${assembled.assessmentReference}-comprehensive-report.pdf`, 'comprehensive-report.pdf'), mime_type: PDF_MIME, file_size_bytes: reportPdf.byteLength, checksum: checksum(reportPdf) };
    const paths = [primaryPath, ...uploads.map((upload) => upload.path)];
    try {
      await uploadExact(service.storage, { path: primaryPath, bytes: reportPdf, mimeType: PDF_MIME });
      for (const upload of uploads) await uploadExact(service.storage, upload);
      const { data, error } = await service.rpc('complete_comprehensive_package', {
        p_engagement_id: engagement.id,
        p_report_id: reportId,
        p_template_id: (await service.from('report_templates').select('id').eq('report_type', 'mk_validated').eq('status', 'active').order('version_number', { ascending: false }).limit(1).maybeSingle()).data?.id,
        p_artifact_version: artifactVersion,
        p_primary: primary,
        p_secondary: uploads.map((upload) => ({ object_id: upload.objectId, artefact_type: upload.artefactType, storage_bucket: BUCKET, storage_path: upload.path, file_name: upload.fileName, mime_type: upload.mimeType, file_size_bytes: upload.bytes.byteLength, checksum: upload.checksum })),
        p_generated_by: input.actor.id
      });
      if (error || !data?.ok) throw new Error(error?.message ?? 'Comprehensive package metadata registration failed.');
      await completeComprehensiveArtifact({ engagementId: engagement.id, reportId, artefactType: 'executive_presentation', fileName: safeFileName(input.executivePresentation.fileName, 'executive-presentation.pptx'), mimeType: input.executivePresentation.mimeType, bytes: input.executivePresentation.bytes, artifactVersion });
    } catch (error) {
      await removeExact(service.storage, paths);
      throw error;
    }
    return { ok: true, engagementId: engagement.id, reportId, artifactVersion, artifactNames: [primary.file_name, ...uploads.map((upload) => upload.fileName), safeFileName(input.executivePresentation.fileName, 'executive-presentation.pptx')], presentationUploadRequired: false };
  } catch (error) {
    return { ok: false, reason: 'generation_failed', message: error instanceof Error ? error.message : 'Comprehensive generation failed closed.', engagementId: engagement.id };
  }
}
