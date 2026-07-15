import crypto from 'node:crypto';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { assembleReportData, ReportAssemblyError } from './assemble-report-data';
import { ReportEntitlementError, validatePremiumReportGenerationEntitlement } from './report-entitlement';
import { selectContent } from './select-content-blocks';
import { selectRoadmap } from './roadmap';
import { renderReportHtml } from './templates/report-template';
import { renderHtmlToPdfBuffer } from './render-pdf';
import type { ContentBlock } from './types';
import { getPhase1SchemaCapability, PHASE1_SCHEMA_UNAVAILABLE_MESSAGE } from './phase1-schema-capability';

export type ManualGenerationAction = 'admin_generate' | 'admin_retry' | 'admin_regenerate';

export type ManualGenerationInput = {
  orderReference: string;
  requestedBy: string;
  requestKey: string;
  action: ManualGenerationAction;
};

export type ManualGenerationResult = {
  attemptId?: string;
  reportId: string;
  reportReference: string;
  versionNumber: number;
  supersededReportId?: string | null;
  reusedExistingReport?: boolean;
  message: string;
};

export type Phase1GenerationReason =
  | 'forbidden'
  | 'order_not_found'
  | 'order_not_eligible'
  | 'assessment_incomplete'
  | 'generation_already_active'
  | 'report_already_exists'
  | 'template_missing'
  | 'pdf_render_failed'
  | 'pdf_output_invalid'
  | 'storage_upload_failed'
  | 'stored_file_missing'
  | 'storage_integrity_failed'
  | 'report_persistence_failed'
  | 'phase1_schema_unavailable'
  | 'generation_failed';

export class Phase1GenerationError extends Error {
  constructor(
    public readonly reason: Phase1GenerationReason,
    message: string,
    public readonly status = 500,
    public readonly technicalReference?: string
  ) {
    super(message);
    this.name = 'Phase1GenerationError';
  }
}

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error ?? 'Unknown report-generation error');
}

function sanitiseReference(value: string) {
  return value.replace(/[^A-Za-z0-9._-]/g, '_');
}

function mapRpcFailure(error: unknown, technicalReference: string): Phase1GenerationError {
  const message = messageOf(error);
  if (message.includes('phase1_generation_permission_denied') || message.includes('phase1_regeneration_permission_denied')) {
    return new Phase1GenerationError('forbidden', 'You are not authorised to perform this report action.', 403, technicalReference);
  }
  if (message.includes('phase1_order_not_found')) {
    return new Phase1GenerationError('order_not_found', 'The order could not be found.', 404, technicalReference);
  }
  if (message.includes('phase1_order_not_eligible')) {
    return new Phase1GenerationError('order_not_eligible', 'The order is not eligible for manual report generation.', 409, technicalReference);
  }
  if (message.includes('phase1_assessment_incomplete')) {
    return new Phase1GenerationError('assessment_incomplete', 'The assessment is incomplete or does not have a locked completed score.', 409, technicalReference);
  }
  if (/claim_manual_report_generation|manual_report_generation_attempts|function .* does not exist|schema cache/i.test(message)) {
    return new Phase1GenerationError(
      'phase1_schema_unavailable',
      PHASE1_SCHEMA_UNAVAILABLE_MESSAGE,
      503,
      technicalReference
    );
  }
  return new Phase1GenerationError('generation_failed', 'Report generation could not be started. Retry or use the technical reference for support.', 500, technicalReference);
}

function mapPreflightFailure(error: unknown, technicalReference: string): Phase1GenerationError {
  if (error instanceof ReportAssemblyError || error instanceof ReportEntitlementError) {
    if (error.reason === 'order_not_found') {
      return new Phase1GenerationError('order_not_found', error.message, 404, technicalReference);
    }
    if (error.reason === 'assessment_not_scored' || error.reason === 'score_run_not_locked'
      || error.reason === 'score_run_input_hash_invalid' || error.reason === 'score_run_incomplete'
      || error.reason === 'score_run_missing_domain_results' || error.reason === 'score_run_missing_question_traces') {
      return new Phase1GenerationError('assessment_incomplete', error.message, 409, technicalReference);
    }
    return new Phase1GenerationError('order_not_eligible', error.message, 409, technicalReference);
  }
  return new Phase1GenerationError('generation_failed', 'The report eligibility check failed.', 500, technicalReference);
}

async function recordFailure(
  db: any,
  attemptId: string | null,
  category: Phase1GenerationReason,
  safeMessage: string
) {
  if (!attemptId) return;
  const { error } = await db.rpc('fail_manual_report_generation', {
    p_attempt_id: attemptId,
    p_error_category: category,
    p_safe_message: safeMessage
  });
  if (error) {
    console.error('phase1_generation_failure_persistence', {
      attemptId,
      errorCategory: category,
      safeMessage: 'Generation failure state could not be persisted.'
    });
  }
}

async function verifyPrivateObject(db: any, bucket: string, path: string, expectedChecksum: string, expectedSize: number) {
  const { data, error } = await db.storage.from(bucket).download(path);
  if (error || !data) {
    throw new Phase1GenerationError('stored_file_missing', 'The generated PDF could not be read back from private storage.', 500);
  }
  const stored = Buffer.from(await data.arrayBuffer());
  if (stored.length !== expectedSize) {
    throw new Phase1GenerationError('storage_integrity_failed', 'The stored PDF size does not match the generated output.', 500);
  }
  const checksum = crypto.createHash('sha256').update(stored).digest('hex');
  if (checksum !== expectedChecksum) {
    throw new Phase1GenerationError('storage_integrity_failed', 'The stored PDF failed its integrity check.', 500);
  }
}

function assertValidPdf(bytes: Buffer, technicalReference: string) {
  if (bytes.length < 1_000 || bytes.subarray(0, 4).toString('ascii') !== '%PDF') {
    throw new Phase1GenerationError(
      'pdf_output_invalid',
      'Report generation did not produce a valid non-empty PDF.',
      500,
      technicalReference
    );
  }
}

export async function generateManualPhase1Report(input: ManualGenerationInput): Promise<ManualGenerationResult> {
  const technicalReference = crypto.randomUUID();
  const requestKey = input.requestKey.trim().slice(0, 200);
  if (!requestKey) {
    throw new Phase1GenerationError('generation_failed', 'A request key is required for safe report generation.', 400, technicalReference);
  }

  const db = createSupabaseServiceClient() as any;
  const capability = await getPhase1SchemaCapability(db);
  if (capability.status !== 'available') {
    throw new Phase1GenerationError('phase1_schema_unavailable', capability.message!, 503, technicalReference);
  }

  let assembled;
  let reportType;
  try {
    assembled = await assembleReportData(input.orderReference);
    reportType = validatePremiumReportGenerationEntitlement(assembled);
  } catch (error) {
    throw mapPreflightFailure(error, technicalReference);
  }

  const { data: template, error: templateError } = await db
    .from('report_templates')
    .select('id,template_code,version_number')
    .eq('report_type', reportType)
    .eq('status', 'active')
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (templateError || !template) {
    throw new Phase1GenerationError('template_missing', 'No active report template is configured for this product.', 409, technicalReference);
  }

  const { data: claim, error: claimError } = await db.rpc('claim_manual_report_generation', {
    p_order_reference: input.orderReference,
    p_requested_by: input.requestedBy,
    p_request_key: requestKey,
    p_trigger_source: input.action,
    p_technical_reference: technicalReference
  });
  if (claimError || !claim) throw mapRpcFailure(claimError ?? new Error('Empty generation claim response.'), technicalReference);

  if (!claim.claimed) {
    if (claim.reason === 'already_active') {
      throw new Phase1GenerationError(
        'generation_already_active',
        'Report generation is already in progress for this order.',
        409,
        technicalReference
      );
    }
    if (claim.reason === 'report_exists' && claim.report) {
      return {
        reportId: claim.report.id,
        reportReference: claim.report.report_reference,
        versionNumber: Number(claim.report.version_number),
        reusedExistingReport: true,
        message: 'A valid report already exists. Preview, download, deliver, or explicitly create a new version.'
      };
    }
    if (claim.reason === 'idempotent_replay' && claim.attempt?.status === 'REPORT_READY' && claim.attempt.output_report_id) {
      const { data: existingReport } = await db.from('reports')
        .select('id,report_reference,version_number,supersedes_report_id')
        .eq('id', claim.attempt.output_report_id).maybeSingle();
      if (existingReport) {
        return {
          attemptId: claim.attempt.id,
          reportId: existingReport.id,
          reportReference: existingReport.report_reference,
          versionNumber: Number(existingReport.version_number),
          supersededReportId: existingReport.supersedes_report_id,
          reusedExistingReport: true,
          message: 'This report-generation request was already completed successfully.'
        };
      }
    }
    if (claim.reason === 'idempotent_replay' && ['REPORT_QUEUED', 'REPORT_GENERATING'].includes(claim.attempt?.status)) {
      throw new Phase1GenerationError(
        'generation_already_active',
        'Report generation is already in progress for this order.',
        409,
        technicalReference
      );
    }
    throw new Phase1GenerationError('generation_failed', 'The prior report-generation request did not complete. Use Retry Generation.', 409, technicalReference);
  }

  const attemptId = String(claim.attempt.id);
  let storageBucket: string | null = null;
  let storagePath: string | null = null;
  let uploaded = false;
  try {
    const { error: startError } = await db.rpc('start_manual_report_generation', { p_attempt_id: attemptId });
    if (startError) throw mapRpcFailure(startError, technicalReference);

    const { data: blockRows, error: blockError } = await db
      .from('report_content_blocks')
      .select('block_key,block_type,domain_code,maturity_band,severity,title,body,status')
      .eq('status', 'active');
    if (blockError) throw blockError;
    const contentBlocks: ContentBlock[] = (blockRows ?? []).map((block: any) => ({
      blockKey: block.block_key,
      blockType: block.block_type,
      domainCode: block.domain_code,
      maturityBand: block.maturity_band,
      severity: block.severity,
      title: block.title,
      body: block.body,
      status: block.status
    }));
    const content = selectContent(assembled, contentBlocks);
    const roadmap = selectRoadmap(assembled);
    const html = renderReportHtml(assembled, content, roadmap);
    if (process.env.NODE_ENV !== 'production' && process.env.PHASE1_TEST_FORCE_PDF_FAILURE === '1') {
      throw new Phase1GenerationError('pdf_render_failed', 'The local PDF failure double was activated.', 500, technicalReference);
    }
    const pdf = await renderHtmlToPdfBuffer(html).catch((error) => {
      console.error('phase1_manual_generation', { technicalReference, orderReference: input.orderReference, stage: 'render', error: messageOf(error) });
      throw new Phase1GenerationError('pdf_render_failed', 'The PDF renderer failed. Retry generation or inspect the technical reference.', 500, technicalReference);
    });
    assertValidPdf(pdf, technicalReference);

    const checksum = crypto.createHash('sha256').update(pdf).digest('hex');
    const versionNumber = Number(claim.attempt.report_version);
    const reportReference = `RPT-${assembled.assessmentReference}-V${versionNumber}`;
    const fileName = `${sanitiseReference(reportReference)}.pdf`;
    storageBucket = 'generated-reports';
    storagePath = `${assembled.organisationId}/${assembled.orderId}/v${versionNumber}/${sanitiseReference(reportReference)}-${checksum.slice(0, 16)}.pdf`;

    const { error: uploadError } = await db.storage.from(storageBucket).upload(storagePath, pdf, {
      contentType: 'application/pdf',
      upsert: false,
      metadata: { sha256: checksum, reportReference, orderId: assembled.orderId }
    });
    if (uploadError) {
      throw new Phase1GenerationError('storage_upload_failed', 'The PDF could not be stored in private report storage.', 500, technicalReference);
    }
    uploaded = true;
    await verifyPrivateObject(db, storageBucket, storagePath, checksum, pdf.length);

    const { data: completed, error: completeError } = await db.rpc('complete_manual_report_generation', {
      p_attempt_id: attemptId,
      p_template_id: template.id,
      p_report_type: reportType,
      p_storage_bucket: storageBucket,
      p_storage_path: storagePath,
      p_file_name: fileName,
      p_mime_type: 'application/pdf',
      p_file_size_bytes: pdf.length,
      p_checksum: checksum
    });
    if (completeError || !completed?.report) {
      throw new Phase1GenerationError('report_persistence_failed', 'The verified PDF could not be linked to the order.', 500, technicalReference);
    }

    console.info('phase1_manual_generation', {
      requestId: claim.attempt.request_id,
      technicalReference,
      orderId: assembled.orderId,
      attemptId,
      reportId: completed.report.id,
      status: 'REPORT_READY',
      retryCount: claim.attempt.retry_count
    });
    return {
      attemptId,
      reportId: completed.report.id,
      reportReference: completed.report.report_reference,
      versionNumber: Number(completed.report.version_number),
      supersededReportId: completed.superseded_report_id ?? null,
      message: `Report version ${completed.report.version_number} generated and verified successfully.`
    };
  } catch (error) {
    const mapped = error instanceof Phase1GenerationError
      ? new Phase1GenerationError(error.reason, error.message, error.status, error.technicalReference ?? technicalReference)
      : new Phase1GenerationError('generation_failed', 'Report generation failed. Retry or inspect the technical reference.', 500, technicalReference);
    if (uploaded && storageBucket && storagePath) {
      const { error: cleanupError } = await db.storage.from(storageBucket).remove([storagePath]);
      if (cleanupError) {
        console.error('phase1_generation_storage_cleanup', {
          technicalReference,
          attemptId,
          errorCategory: 'storage_cleanup_failed',
          safeMessage: 'An unlinked private object may require operator cleanup.'
        });
      }
    }
    await recordFailure(db, attemptId, mapped.reason, mapped.message);
    console.error('phase1_manual_generation', {
      requestId: claim.attempt.request_id,
      technicalReference,
      orderId: assembled.orderId,
      attemptId,
      status: 'GENERATION_FAILED',
      retryCount: claim.attempt.retry_count,
      errorCategory: mapped.reason,
      safeMessage: mapped.message
    });
    throw mapped;
  }
}
