import crypto from 'node:crypto';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { assembleReportData } from '@/lib/reports/assemble-report-data';
import { buildAdvisoryEvidenceModel } from '@/lib/reports/evidence-model';
import { renderComprehensiveReportPdf } from '@/lib/reports/comprehensive/manual-generation';
import { prependSyntheticSampleCover, SYNTHETIC_SAMPLE_LABEL, SYNTHETIC_SAMPLE_TITLE } from '@/lib/reports/synthetic-sample-packaging';

export const SYNTHETIC_COMPREHENSIVE_ENGINE_CONTRACT = 'mk-comprehensive-manual-generation-v1';
export const SYNTHETIC_COMPREHENSIVE_ROUTE = 'comprehensive_synthetic_fixture';
export const SYNTHETIC_COMPREHENSIVE_BUCKET = 'generated-reports';

export type SyntheticComprehensiveGenerationResult = {
  recordId: string;
  technicalReference: string;
  reportId: string;
  reportReference: string;
  versionNumber: number;
  assessmentReference: string;
  syntheticCertificationRef: string;
  provider: string;
  model: string;
  providerCalls: number;
  repairs: number;
  checksum: string;
  fileSizeBytes: number;
  storagePath: string;
  reusedExistingReport?: boolean;
};

export class SyntheticComprehensiveGenerationError extends Error {
  readonly reason: string;
  readonly status: number;
  readonly technicalReference: string;

  constructor(reason: string, message: string, status: number, technicalReference: string) {
    super(message);
    this.name = 'SyntheticComprehensiveGenerationError';
    this.reason = reason;
    this.status = status;
    this.technicalReference = technicalReference;
  }
}

function safeRpcReason(error: unknown): string {
  const message = typeof error === 'object' && error !== null && 'message' in error
    ? String((error as { message?: unknown }).message ?? '')
    : '';
  const match = message.match(/[a-z][a-z0-9_]{3,100}/i);
  return match?.[0] ?? 'synthetic_generation_failed';
}

function mapRpcError(error: unknown, technicalReference: string): SyntheticComprehensiveGenerationError {
  const raw = safeRpcReason(error);
  const mapping: Record<string, { status: number; message: string }> = {
    synthetic_generation_assessment_not_found: { status: 404, message: 'The requested synthetic assessment was not found.' },
    synthetic_generation_marker_required: { status: 409, message: 'The assessment is not marked as a controlled synthetic demonstration.' },
    synthetic_generation_monitoring_fixture_forbidden: { status: 409, message: 'Monitoring fixtures cannot be used for certification report generation.' },
    synthetic_generation_assessment_incomplete: { status: 409, message: 'The synthetic assessment is not a completed and locked adaptive result.' },
    synthetic_generation_score_not_locked: { status: 409, message: 'The synthetic assessment has no locked score available for report generation.' },
    synthetic_generation_order_binding_forbidden: { status: 409, message: 'Synthetic report generation cannot be bound to an order.' },
    synthetic_generation_commercial_report_exists: { status: 409, message: 'A commercial Comprehensive report already exists for this assessment.' },
    synthetic_generation_platform_admin_required: { status: 403, message: 'Only a platform administrator may generate synthetic owner-review reports.' },
    synthetic_generation_request_already_failed: { status: 409, message: 'That synthetic generation request already failed; use a new request key after review.' },
    synthetic_generation_record_not_active: { status: 409, message: 'The synthetic generation record is no longer active.' },
    synthetic_generation_template_invalid: { status: 409, message: 'No active Comprehensive report template is available.' },
    synthetic_generation_output_integrity_invalid: { status: 500, message: 'The generated synthetic PDF failed the output integrity contract.' },
    synthetic_generation_storage_binding_invalid: { status: 500, message: 'The generated synthetic PDF failed the storage binding contract.' },
    synthetic_generation_assessment_binding_invalid: { status: 409, message: 'The synthetic report no longer matches its marked assessment.' }
  };
  const mapped = mapping[raw];
  return new SyntheticComprehensiveGenerationError(
    mapped ? raw : 'synthetic_generation_failed',
    mapped?.message ?? 'Synthetic Comprehensive report generation failed. Inspect the technical reference.',
    mapped?.status ?? 500,
    technicalReference
  );
}

function asRecord(value: unknown): Record<string, any> {
  return value !== null && typeof value === 'object' ? value as Record<string, any> : {};
}

async function verifyUploadedPdf(
  db: any,
  path: string,
  expectedChecksum: string,
  expectedSize: number,
  technicalReference: string
) {
  const { data: object, error } = await db.storage.from(SYNTHETIC_COMPREHENSIVE_BUCKET).download(path);
  if (error || !object) throw new SyntheticComprehensiveGenerationError('stored_file_missing', 'The generated synthetic PDF could not be read back from private storage.', 500, technicalReference);
  const bytes = Buffer.from(await object.arrayBuffer());
  const checksum = crypto.createHash('sha256').update(bytes).digest('hex');
  if (!bytes.length || bytes.subarray(0, 4).toString('ascii') !== '%PDF' || checksum !== expectedChecksum || bytes.length !== expectedSize) {
    throw new SyntheticComprehensiveGenerationError('storage_integrity_failed', 'The generated synthetic PDF failed private-storage verification.', 500, technicalReference);
  }
}

async function readSyntheticGenerationState(db: any, recordId: string) {
  return db.from('synthetic_report_generation_records')
    .select('id,status,report_id,provider,model,provider_calls,metadata_json,synthetic_certification_ref')
    .eq('id', recordId)
    .maybeSingle();
}

async function reconcileCommittedSyntheticReport(
  db: any,
  recordId: string,
  assessmentReference: string,
  technicalReference: string
): Promise<SyntheticComprehensiveGenerationResult | null> {
  const { data: state, error: stateError } = await readSyntheticGenerationState(db, recordId);
  if (stateError || !state || state.status !== 'ready' || !state.report_id) return null;
  const { data: report, error: reportError } = await db.from('reports')
    .select('id,report_reference,version_number,assessment_id,synthetic_certification_ref,storage_path,checksum,file_size_bytes,synthetic_demonstration')
    .eq('id', state.report_id)
    .maybeSingle();
  if (reportError || !report || !report.synthetic_demonstration || !report.storage_path || !report.checksum) return null;
  const metadata = asRecord(state.metadata_json);
  console.warn('synthetic_comprehensive_generation_reconciled', {
    outcome: 'committed_after_completion_uncertainty',
    assessmentReference,
    technicalReference,
    recordId,
    reportId: report.id
  });
  return {
    recordId,
    technicalReference,
    reportId: String(report.id),
    reportReference: String(report.report_reference),
    versionNumber: Number(report.version_number),
    assessmentReference,
    syntheticCertificationRef: String(report.synthetic_certification_ref ?? state.synthetic_certification_ref),
    provider: String(state.provider ?? 'unknown'),
    model: String(state.model ?? 'unknown'),
    providerCalls: Number(state.provider_calls ?? 0),
    repairs: Number(metadata.interpretationRepairs ?? 0),
    checksum: String(report.checksum),
    fileSizeBytes: Number(report.file_size_bytes),
    storagePath: String(report.storage_path),
    reusedExistingReport: true
  };
}

/**
 * Generate one non-commercial Comprehensive owner-review fixture.
 *
 * The substantive report is rendered by the same manual Comprehensive engine used by the
 * product path. Only the outer sample cover and the order-free persistence boundary are synthetic
 * proof-run concerns. No order, payment, engagement, invoice, email or customer delivery is used.
 */
export async function generateSyntheticComprehensiveReport(input: {
  assessmentReference: string;
  requestedBy: string;
  requestKey: string;
}): Promise<SyntheticComprehensiveGenerationResult> {
  const technicalReference = crypto.randomUUID();
  const db = createSupabaseServiceClient() as any;
  const claimResult = await db.rpc('claim_synthetic_comprehensive_generation', {
    p_assessment_reference: input.assessmentReference,
    p_requested_by: input.requestedBy,
    p_request_key: input.requestKey,
    p_technical_reference: technicalReference
  });
  if (claimResult.error) throw mapRpcError(claimResult.error, technicalReference);

  const claim = asRecord(claimResult.data);
  const record = asRecord(claim.record);
  if (claim.claimed !== true) {
    if (claim.reason === 'already_active') {
      throw new SyntheticComprehensiveGenerationError('generation_already_active', 'A synthetic Comprehensive generation is already in progress for this request.', 409, technicalReference);
    }
    const existingReportId = typeof record.report_id === 'string' ? record.report_id : '';
    if (existingReportId && ['idempotent_replay', 'report_exists'].includes(String(claim.reason))) {
      const { data: existing, error: existingError } = await db.from('reports')
        .select('id,report_reference,version_number,assessment_id,synthetic_certification_ref,storage_path,checksum,file_size_bytes,synthetic_demonstration')
        .eq('id', existingReportId)
        .maybeSingle();
      if (existingError || !existing || !existing.synthetic_demonstration) {
        throw new SyntheticComprehensiveGenerationError('synthetic_generation_replay_invalid', 'The replayed synthetic report record is unavailable.', 409, technicalReference);
      }
      return {
        recordId: String(record.id),
        technicalReference,
        reportId: String(existing.id),
        reportReference: String(existing.report_reference),
        versionNumber: Number(existing.version_number),
        assessmentReference: input.assessmentReference,
        syntheticCertificationRef: String(existing.synthetic_certification_ref),
        provider: String(record.provider ?? 'unknown'),
        model: String(record.model ?? 'unknown'),
        providerCalls: Number(record.provider_calls ?? 0),
        repairs: Number(record.metadata_json?.interpretationRepairs ?? 0),
        checksum: String(existing.checksum),
        fileSizeBytes: Number(existing.file_size_bytes),
        storagePath: String(existing.storage_path),
        reusedExistingReport: true
      };
    }
    throw new SyntheticComprehensiveGenerationError('synthetic_generation_claim_not_granted', 'The synthetic report request could not be claimed.', 409, technicalReference);
  }

  const recordId = String(record.id);
  const versionNumber = Number(record.report_version);
  const syntheticCertificationRef = String(record.synthetic_certification_ref);
  let storagePath: string | null = null;
  let pdfUploaded = false;
  let completionInvoked = false;
  let completionCommitted = false;
  try {
    const assembled = await assembleReportData({ assessmentReference: input.assessmentReference });
    const advisoryModel = buildAdvisoryEvidenceModel(assembled);
    const rendered = await renderComprehensiveReportPdf({
      assembled,
      evidenceModel: advisoryModel,
      maxRepairsPerSlot: 0
    });
    const pdf = await prependSyntheticSampleCover(rendered.pdf);
    if (!pdf.length || pdf.subarray(0, 4).toString('ascii') !== '%PDF') {
      throw new SyntheticComprehensiveGenerationError('pdf_output_invalid', 'The synthetic Comprehensive PDF did not produce a valid PDF.', 500, technicalReference);
    }
    const checksum = crypto.createHash('sha256').update(pdf).digest('hex');
    const reportReference = `RPT-${input.assessmentReference}-COMP-V${versionNumber}`;
    const fileName = `${reportReference}.pdf`.replace(/[^A-Za-z0-9._-]/g, '_');
    storagePath = `${assembled.organisationId}/${assembled.assessmentId}/synthetic-comprehensive/v${versionNumber}/${fileName.replace(/\.pdf$/, '')}-${checksum.slice(0, 16)}.pdf`;
    const { error: uploadError } = await db.storage.from(SYNTHETIC_COMPREHENSIVE_BUCKET).upload(storagePath, pdf, {
      contentType: 'application/pdf',
      upsert: false,
      metadata: {
        sha256: checksum,
        reportReference,
        assessmentId: assembled.assessmentId,
        reportVersion: String(versionNumber),
        syntheticDemonstration: 'true',
        syntheticCertificationRef,
        engineContract: SYNTHETIC_COMPREHENSIVE_ENGINE_CONTRACT
      }
    });
    if (uploadError) throw new SyntheticComprehensiveGenerationError('storage_upload_failed', 'The synthetic Comprehensive PDF could not be stored in private report storage.', 500, technicalReference);
    pdfUploaded = true;
    await verifyUploadedPdf(db, storagePath, checksum, pdf.length, technicalReference);

    const accounting = rendered.interpretationRun.accounting;
    const model = accounting.model;
    const provider = model.split('/')[0]?.trim() || 'vercel-ai-gateway';
    const metadata = {
      engineContract: SYNTHETIC_COMPREHENSIVE_ENGINE_CONTRACT,
      route: SYNTHETIC_COMPREHENSIVE_ROUTE,
      syntheticDemonstration: true,
      sampleLabel: SYNTHETIC_SAMPLE_LABEL,
      sampleTitle: SYNTHETIC_SAMPLE_TITLE,
      reportType: 'mk_validated',
      interpretationCalls: accounting.calls,
      interpretationRepairs: accounting.repairs,
      inputTokens: accounting.inputTokens,
      outputTokens: accounting.outputTokens,
      totalTokens: accounting.totalTokens,
      providerCostMicros: accounting.costMicros,
      accountingStatus: 'recorded'
    };
    const { data: template, error: templateError } = await db.from('report_templates')
      .select('id')
      .eq('report_type', 'mk_validated')
      .eq('status', 'active')
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (templateError || !template) throw new SyntheticComprehensiveGenerationError('template_missing', 'No active Comprehensive report template is configured.', 409, technicalReference);

    completionInvoked = true;
    const completion = await db.rpc('complete_synthetic_comprehensive_generation', {
      p_record_id: recordId,
      p_template_id: template.id,
      p_storage_bucket: SYNTHETIC_COMPREHENSIVE_BUCKET,
      p_storage_path: storagePath,
      p_file_name: fileName,
      p_mime_type: 'application/pdf',
      p_file_size_bytes: pdf.length,
      p_checksum: checksum,
      p_provider_calls: accounting.calls,
      p_provider: provider,
      p_model: model,
      p_metadata: metadata
    });
    if (completion.error) throw mapRpcError(completion.error, technicalReference);
    const completed = asRecord(completion.data);
    const report = asRecord(completed.report);
    if (!completed.ok || !report.id) throw new SyntheticComprehensiveGenerationError('report_persistence_failed', 'The synthetic Comprehensive report could not be linked to its generation record.', 500, technicalReference);
    completionCommitted = true;
    pdfUploaded = false;
    console.info('synthetic_comprehensive_generation', {
      outcome: 'completed',
      assessmentReference: input.assessmentReference,
      technicalReference,
      recordId,
      reportId: report.id,
      reportReference: report.report_reference,
      provider,
      model,
      providerCalls: accounting.calls,
      repairs: accounting.repairs,
      checksum,
      fileSizeBytes: pdf.length
    });
    return {
      recordId,
      technicalReference,
      reportId: String(report.id),
      reportReference: String(report.report_reference),
      versionNumber: Number(report.version_number),
      assessmentReference: input.assessmentReference,
      syntheticCertificationRef,
      provider,
      model,
      providerCalls: accounting.calls,
      repairs: accounting.repairs,
      checksum,
      fileSizeBytes: pdf.length,
      storagePath
    };
  } catch (error) {
    const mapped = error instanceof SyntheticComprehensiveGenerationError && error.technicalReference
      ? error
      : new SyntheticComprehensiveGenerationError('synthetic_generation_failed', 'Synthetic Comprehensive report generation failed. Inspect the technical reference.', 500, technicalReference);
    let completionOutcome: 'not_invoked' | 'not_committed' | 'committed' | 'uncertain' = completionCommitted
      ? 'committed'
      : completionInvoked ? 'uncertain' : 'not_invoked';
    let generationStatus: string | null = null;
    if (completionInvoked && !completionCommitted) {
      const { data: state, error: stateError } = await readSyntheticGenerationState(db, recordId);
      generationStatus = typeof state?.status === 'string' ? state.status : null;
      if (!stateError && state?.status === 'ready' && state.report_id) completionOutcome = 'committed';
      else if (!stateError && ['generating', 'failed'].includes(String(state?.status))) completionOutcome = 'not_committed';
      else completionOutcome = 'uncertain';
    }

    // A successful SQL finalisation can be hidden by a lost response. Re-read the durable
    // record before deciding whether to delete the object or mark the request failed.
    if (completionOutcome === 'committed') {
      const reconciled = await reconcileCommittedSyntheticReport(db, recordId, input.assessmentReference, technicalReference);
      if (reconciled) return reconciled;
    }

    // The object is deleted only when the finalisation RPC was not called or the durable record
    // proves it did not commit. An ambiguous completion retains the object and active record for
    // operator reconciliation; deleting it would create a report row that points nowhere if the
    // database commit actually succeeded.
    if (completionOutcome === 'not_invoked' || completionOutcome === 'not_committed') {
      if (pdfUploaded && storagePath) {
        const { error: removeError } = await db.storage.from(SYNTHETIC_COMPREHENSIVE_BUCKET).remove([storagePath]);
        if (removeError) console.error('synthetic_comprehensive_storage_cleanup_failed', { technicalReference, recordId });
      }
      if (generationStatus !== 'failed') {
        const failure = await db.rpc('fail_synthetic_comprehensive_generation', {
          p_record_id: recordId,
          p_error_category: mapped.reason,
          p_safe_message: mapped.message,
          p_failure_diagnostics: {
            schemaVersion: 'synthetic-comprehensive-failure-v1',
            stage: mapped.reason,
            dispatchOccurred: mapped.reason !== 'template_missing' && mapped.reason !== 'storage_upload_failed',
            providerCalls: 0,
            accountingStatus: 'recorded'
          }
        });
        if (failure.error) console.error('synthetic_comprehensive_failure_persistence_failed', { technicalReference, recordId });
      }
    } else {
      console.error('synthetic_comprehensive_finalisation_reconciliation_required', {
        technicalReference,
        recordId,
        completionOutcome,
        generationStatus,
        objectRetained: Boolean(pdfUploaded && storagePath)
      });
    }
    throw mapped;
  }
}
