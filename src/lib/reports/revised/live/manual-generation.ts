import crypto from 'node:crypto';
import { buildReportReference } from '@/lib/reports/report-reference';
import { COMPREHENSIVE_REPORT_TYPE } from '@/lib/reports/report-entitlement';
import { produceRevisedArtefacts, RevisedGenerationError, type ManuscriptWriter } from './produce';
import type { RevisedOrderContext } from './order';

/**
 * B5: the revised branch of the existing manual generation (generateManualPhase1Report). The attempt has already
 * been claimed and started by the existing path; this branch produces the revised artefacts and then uses the same
 * private bucket, path scheme, stored-object verification and atomic finalisation RPCs as the existing path
 * (complete_manual_report_generation for Essential, finalise_manual_report_with_supporting_register for Comprehensive
 * with its workbook). It reports every storage and finalisation state to the caller through `track`, so the existing
 * failure handler performs the cleanup and the ambiguous-commit reconciliation exactly as it does for MFRS reports.
 */

export type RevisedTrack = Partial<{
  storageBucket: string; storagePath: string; pdfUploaded: boolean; registerUploaded: boolean; registerStoragePath: string;
  pdfChecksum: string; finalisationInvoked: boolean; finalisationCommitted: boolean; failureDiagnostics: Record<string, unknown>;
}>;

export type RevisedGenerationHelpers = {
  verifyPrivateObject: (db: any, bucket: string, path: string, checksum: string, size: number, mime?: string, magic?: string) => Promise<void>;
  assertValidPdf: (bytes: Buffer, technicalReference: string) => void;
  sanitiseReference: (value: string) => string;
  recordDiagnostics: (input: Record<string, unknown>) => Promise<void>;
  makeError: (reason: string, message: string, status: number) => Error;
};

export async function generateRevisedManualReport(input: {
  db: any;
  attemptId: string;
  versionNumber: number;
  technicalReference: string;
  order: RevisedOrderContext;
  stage: (stage: string) => void;
  track: (state: RevisedTrack) => void;
  helpers: RevisedGenerationHelpers;
  writer?: ManuscriptWriter;
}) {
  const { db, order, helpers } = input;
  const reportType = order.reportType;
  const isComprehensive = reportType === COMPREHENSIVE_REPORT_TYPE;
  const reportReference = buildReportReference({ assessmentReference: order.assessmentReference, reportType, versionNumber: input.versionNumber });

  input.stage('preflight_report_identity');
  const { data: identityRows, error: identityError } = await db.from('reports')
    .select('id,version_number,report_reference').eq('assessment_id', order.assessmentId).eq('report_type', reportType);
  if (identityError) throw identityError;
  if ((identityRows ?? []).some((r: any) => r.report_reference === reportReference || Number(r.version_number) === input.versionNumber)) {
    throw helpers.makeError('report_identity_conflict', 'The report version for this assessment is already in use. Refresh the order and start generation again.', 409);
  }
  const { data: template, error: templateError } = await db.from('report_templates')
    .select('id,template_code,version_number').eq('report_type', reportType).eq('status', 'active')
    .order('version_number', { ascending: false }).limit(1).maybeSingle();
  if (templateError || !template) throw helpers.makeError('template_missing', 'No active report template is configured for this product.', 409);

  input.stage('revised_manuscript');
  let artefacts: Awaited<ReturnType<typeof produceRevisedArtefacts>>;
  try {
    artefacts = await produceRevisedArtefacts({ order, reportReference, versionNumber: input.versionNumber, writer: input.writer });
  } catch (error) {
    const diagnostics = error instanceof RevisedGenerationError
      ? { schemaVersion: 'revised-failure-diagnostics-v1', code: error.code, ...error.diagnostics }
      : { schemaVersion: 'revised-failure-diagnostics-v1', code: 'unknown', error: error instanceof Error ? error.message.slice(0, 300) : 'unknown' };
    input.track({ failureDiagnostics: diagnostics });
    // Order-scoped attempts cannot carry diagnostics: the diagnostics RPC accepts assessment-scoped attempts only and
    // the service role may not update the attempt row (least-privilege contract). The safe diagnostics are recorded
    // durably in the review store's report run instead (see recordReviewRun below).
    await helpers.recordDiagnostics({
      requestedProvider: 'vercel-ai-gateway', requestedModel: (diagnostics as any).requestedModel ?? null,
      resolvedProvider: (diagnostics as any).provider ?? null, resolvedModel: (diagnostics as any).model ?? null,
      generationMode: 'ai', aiUsage: { providerCalls: (diagnostics as any).calls ?? (diagnostics as any).providerCalls ?? 0, usage: (diagnostics as any).usage ?? null },
      failureDiagnostics: diagnostics
    });
    await recordReviewRun(db, order, 'failed', null, `${String((diagnostics as any).code)}: ${JSON.stringify(diagnostics).slice(0, 1500)}`, input.attemptId);
    if (error instanceof RevisedGenerationError) {
      const reason = error.code === 'render_failed' ? 'pdf_render_failed' : 'generation_failed';
      throw helpers.makeError(reason, error.message, error.code === 'answers_changed_since_binding' ? 409 : 502);
    }
    throw error;
  }
  await helpers.recordDiagnostics({
    requestedProvider: 'vercel-ai-gateway', requestedModel: artefacts.ai.requestedModel,
    resolvedProvider: artefacts.ai.provider, resolvedModel: artefacts.ai.model, generationMode: 'ai',
    aiUsage: { providerCalls: artefacts.ai.calls, usage: artefacts.ai.usage, latencyMs: artefacts.ai.latencyMs, accountingStatus: 'recorded' }
  });

  input.stage('store_pdf');
  helpers.assertValidPdf(artefacts.pdf, input.technicalReference);
  const checksum = crypto.createHash('sha256').update(artefacts.pdf).digest('hex');
  const storageBucket = 'generated-reports';
  const scope = `${order.organisationId}/${order.orderId}/v${input.versionNumber}`;
  const storagePath = `${scope}/${helpers.sanitiseReference(reportReference)}-${checksum.slice(0, 16)}.pdf`;
  const fileName = `${helpers.sanitiseReference(reportReference)}.pdf`;
  input.track({ storageBucket, storagePath, pdfChecksum: checksum });
  const { error: uploadError } = await db.storage.from(storageBucket).upload(storagePath, artefacts.pdf, {
    contentType: 'application/pdf', upsert: false,
    metadata: { sha256: checksum, reportReference, orderId: order.orderId, assessmentId: order.assessmentId, reportVersion: input.versionNumber, restrictedTest: 'true' }
  });
  if (uploadError) throw helpers.makeError('storage_upload_failed', 'The PDF could not be stored in private report storage.', 500);
  input.track({ pdfUploaded: true });
  await helpers.verifyPrivateObject(db, storageBucket, storagePath, checksum, artefacts.pdf.length, 'application/pdf', '%PDF');

  let register: { storagePath: string; fileName: string; mimeType: string; fileSizeBytes: number; checksumSha256: string } | null = null;
  if (isComprehensive) {
    input.stage('store_supporting_register');
    const wb = artefacts.workbook!;
    const registerPath = `${scope}/${wb.fileName.replace(/[^A-Za-z0-9._-]/g, '_')}`;
    input.track({ registerStoragePath: registerPath });
    const { error: wbError } = await db.storage.from(storageBucket).upload(registerPath, wb.bytes, { contentType: wb.mimeType, upsert: false, metadata: { sha256: wb.sha256 } });
    if (wbError) throw new Error('supporting_register_upload_failed');
    input.track({ registerUploaded: true });
    await helpers.verifyPrivateObject(db, storageBucket, registerPath, wb.sha256, wb.bytes.length);
    register = { storagePath: registerPath, fileName: wb.fileName, mimeType: wb.mimeType, fileSizeBytes: wb.bytes.length, checksumSha256: wb.sha256 };
  }

  input.stage('finalise_generation');
  input.track({ finalisationInvoked: true });
  const common = {
    p_attempt_id: input.attemptId, p_template_id: template.id, p_report_type: reportType, p_storage_bucket: storageBucket,
    p_storage_path: storagePath, p_file_name: fileName, p_mime_type: 'application/pdf', p_file_size_bytes: artefacts.pdf.length, p_checksum: checksum
  };
  const { data: completed, error: completeError } = isComprehensive
    ? await db.rpc('finalise_manual_report_with_supporting_register', {
      ...common,
      p_register_storage_path: register!.storagePath, p_register_file_name: register!.fileName, p_register_mime_type: register!.mimeType,
      p_register_file_size_bytes: register!.fileSizeBytes, p_register_checksum: register!.checksumSha256
    })
    : await db.rpc('complete_manual_report_generation', common);
  if (completeError || !completed?.report) {
    console.error('revised_generation_persistence_error', { technicalReference: input.technicalReference, message: completeError?.message, code: completeError?.code });
    throw helpers.makeError('report_persistence_failed', 'The verified PDF could not be linked to the order.', 500);
  }
  input.track({ finalisationCommitted: true });

  // Report-run lineage in the review store: which bound input produced which report. Recorded after commit, and a
  // failure here never undoes a committed paid report.
  await recordReviewRun(db, order, 'generated', {
    reportId: completed.report.id, reportReference: completed.report.report_reference, reportType, ...artefacts.provenance
  }, null, input.attemptId);

  return {
    attemptId: input.attemptId,
    reportId: completed.report.id as string,
    reportReference: completed.report.report_reference as string,
    versionNumber: Number(completed.report.version_number),
    supersededReportId: completed.superseded_report_id ?? null,
    generationMode: 'ai' as const,
    evidenceChecksum: order.binding.inputDigest,
    message: `Report version ${completed.report.version_number} generated and verified successfully (restricted test).`
  };
}

async function recordReviewRun(db: any, order: RevisedOrderContext, status: 'generated' | 'failed', output: Record<string, unknown> | null, failure: string | null, attemptId: string) {
  try {
    const body = output ? { ...output, attemptId } : null;
    const { error } = await db.rpc('review_record_report_run', {
      p_run: {
        sessionId: order.binding.sessionId, inputContract: 'mk-readiness-report-input', inputVersion: '1.3.0',
        inputDigest: order.binding.inputDigest, logDigest: order.binding.logDigest, actionCount: order.binding.actionCount,
        reportEngine: `revised-live:${order.product}`, reportEngineVersion: 'revised-live-pipeline-0.1', status,
        output: body, outputDigest: body ? crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex') : null,
        failure: failure ? `${failure} (attempt ${attemptId})` : null, createdBy: `order:${order.orderReference}`
      }
    });
    if (error) console.warn('revised_report_run_not_recorded', { message: error.message });
  } catch (error) {
    console.warn('revised_report_run_not_recorded', { message: error instanceof Error ? error.message : 'unknown' });
  }
}
