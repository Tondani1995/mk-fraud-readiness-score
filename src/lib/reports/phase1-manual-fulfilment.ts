import crypto from 'node:crypto';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { assembleReportData, ReportAssemblyError } from './assemble-report-data';
import { ReportEntitlementError, validatePremiumReportGenerationEntitlement } from './report-entitlement';
import { selectContent } from './select-content-blocks';
import { adaptAdvisoryRoadmapToLegacyAgenda } from './roadmap';
import { buildAdvisoryEvidenceModel } from './evidence-model';
import { renderValidatedCommercialPdf } from './render-validated-commercial-pdf';
import { ReportCommercialQualityError } from './commercial-quality';
import type { ContentBlock } from './types';
import { getPhase1SchemaCapability, PHASE1_SCHEMA_UNAVAILABLE_MESSAGE } from './phase1-schema-capability';

/**
 * V7 Checkpoint B -- narrow, optional dependency-injection seam (default parameters, not a DI
 * framework or service container). Production callers pass nothing and get the real Supabase
 * client and real report-assembly/entitlement/schema-capability/PDF-render functions, exactly as
 * before. Tests inject a recording fake `db` (and, where useful, fake versions of the other
 * functions) so the real orchestration code below -- claim, start, quality gate, storage upload,
 * verification, completion RPC, failure RPC -- can be exercised end-to-end without production
 * Supabase credentials.
 */
export interface ManualPhase1Dependencies {
  db?: any;
  assembleReportData?: typeof assembleReportData;
  validatePremiumReportGenerationEntitlement?: typeof validatePremiumReportGenerationEntitlement;
  getPhase1SchemaCapability?: typeof getPhase1SchemaCapability;
  renderValidatedCommercialPdf?: typeof renderValidatedCommercialPdf;
}

export type ManualGenerationAction = 'admin_generate' | 'admin_retry' | 'admin_regenerate' | 'payment_confirmation';

export type ManualGenerationInput = {
  orderReference: string;
  requestedBy: string | null;
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
  | 'commercial_quality_failed'
  | 'generation_failed';

export class Phase1GenerationError extends Error {
  readonly reason: Phase1GenerationReason;
  readonly status: number;
  readonly technicalReference?: string;

  // Explicit fields + assignment, not TypeScript parameter-property shorthand -- see the matching
  // note on ReportCommercialQualityError (commercial-quality.ts) for why: this repo's committed
  // credential-free test scripts run real source directly via `node --experimental-strip-types`,
  // which cannot codegen parameter properties. Behaviourally identical to the prior version.
  constructor(
    reason: Phase1GenerationReason,
    message: string,
    status = 500,
    technicalReference?: string
  ) {
    super(message);
    this.name = 'Phase1GenerationError';
    this.reason = reason;
    this.status = status;
    this.technicalReference = technicalReference;
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

export async function generateManualPhase1Report(
  input: ManualGenerationInput,
  dependencies: ManualPhase1Dependencies = {}
): Promise<ManualGenerationResult> {
  const technicalReference = crypto.randomUUID();
  const requestKey = input.requestKey.trim().slice(0, 200);
  if (!requestKey) {
    throw new Phase1GenerationError('generation_failed', 'A request key is required for safe report generation.', 400, technicalReference);
  }

  const db = dependencies.db ?? (createSupabaseServiceClient() as any);
  const doAssembleReportData = dependencies.assembleReportData ?? assembleReportData;
  const doValidateEntitlement = dependencies.validatePremiumReportGenerationEntitlement ?? validatePremiumReportGenerationEntitlement;
  const doGetSchemaCapability = dependencies.getPhase1SchemaCapability ?? getPhase1SchemaCapability;
  const doRenderValidatedCommercialPdf = dependencies.renderValidatedCommercialPdf ?? renderValidatedCommercialPdf;

  const capability = await doGetSchemaCapability(db);
  if (capability.status !== 'available') {
    throw new Phase1GenerationError('phase1_schema_unavailable', capability.message!, 503, technicalReference);
  }

  let assembled;
  let reportType;
  try {
    assembled = await doAssembleReportData(input.orderReference);
    reportType = doValidateEntitlement(assembled);
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

  const claimRequest = input.action === 'payment_confirmation'
    ? db.rpc('claim_payment_report_generation', {
      p_order_reference: input.orderReference,
      p_request_key: requestKey,
      p_technical_reference: technicalReference
    })
    : db.rpc('claim_manual_report_generation', {
      p_order_reference: input.orderReference,
      p_requested_by: input.requestedBy,
      p_request_key: requestKey,
      p_trigger_source: input.action,
      p_technical_reference: technicalReference
    });
  const { data: claim, error: claimError } = await claimRequest;
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
  const versionNumber = Number(claim.attempt.report_version);
  // Use the versioned reference (e.g. "...-V2") everywhere, including the
  // rendered report itself, so the PDF's own footer/title page match the
  // reports.report_reference value stored for this version instead of the
  // bare assessment reference assembleReportData() defaults to.
  assembled.reportReference = `RPT-${assembled.assessmentReference}-V${versionNumber}`;
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
    const roadmap = adaptAdvisoryRoadmapToLegacyAgenda(buildAdvisoryEvidenceModel(assembled).roadmapActions);

    if (process.env.NODE_ENV !== 'production' && process.env.PHASE1_TEST_FORCE_PDF_FAILURE === '1') {
      throw new Phase1GenerationError('pdf_render_failed', 'The local PDF failure double was activated.', 500, technicalReference);
    }

    // V7 Checkpoint B: HTML preparation and PDF rendering now happen behind the single
    // renderValidatedCommercialPdf() seam, which internally runs the fail-closed commercial
    // quality gate (see ../commercial-quality.ts) before any HTML is returned or the PDF renderer
    // is invoked. A ReportCommercialQualityError here is distinguished from an ordinary renderer
    // failure below -- it is mapped to its own reason (commercial_quality_failed, HTTP 422) and
    // logged with only safe structured fields (technical reference, order reference, issue codes,
    // counts), never full report content, HTML, or customer data.
    let pdf: Buffer;
    try {
      pdf = await doRenderValidatedCommercialPdf({ data: assembled, content, roadmap });
    } catch (error) {
      if (error instanceof ReportCommercialQualityError) {
        console.error('commercial_report_quality_failure', {
          technicalReference,
          orderReference: input.orderReference,
          violationCodes: error.violations.map((issue) => issue.code),
          warningCodes: error.warnings.map((issue) => issue.code),
          violationCount: error.violations.length
        });
        throw new Phase1GenerationError('commercial_quality_failed', error.safeMessage, 422, technicalReference);
      }
      if (error instanceof Phase1GenerationError) throw error;
      console.error('phase1_manual_generation', { technicalReference, orderReference: input.orderReference, stage: 'render', error: messageOf(error) });
      throw new Phase1GenerationError('pdf_render_failed', 'The PDF renderer failed. Retry generation or inspect the technical reference.', 500, technicalReference);
    }
    assertValidPdf(pdf, technicalReference);

    const checksum = crypto.createHash('sha256').update(pdf).digest('hex');
    const reportReference = assembled.reportReference;
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
      // Keep the underlying Postgres error out of the user-facing message
      // (report_persistence_failed / "verified PDF could not be linked")
      // but log it so an operator can diagnose the real cause instead of
      // only seeing the generic category (this previously hid a real
      // unique_violation on reports_one_current_assessment_type_uidx for
      // several failed attempts before it was traced down).
      console.error('phase1_manual_generation_persistence_error', {
        technicalReference,
        message: completeError?.message,
        details: completeError?.details,
        hint: completeError?.hint,
        code: completeError?.code
      });
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
      // M9: this is the Phase 1 (manual, synchronous) generation path's cleanup of an
      // orphaned upload after a downstream failure -- distinct from the Phase 14 premium
      // report engine's durable phase14_storage_cleanup_queue (which already persists
      // attempt_count, provider_result_class, deletion_requested/accepted and last_error
      // for both its manual and automatic-worker paths). Phase 1 has no such table, so
      // this logs a structured, symmetric outcome on every attempt (not just failures)
      // with a stable, non-sensitive path reference -- a short hash, not the raw storage
      // path -- so an operator can correlate repeated failures for the same object
      // without the log itself exposing the path. Phase 1's generation flow is
      // synchronous and single-attempt (there is no background retry of this cleanup
      // step), so retryCount is always 0 here; that is accurately reported, not omitted.
      const storagePathReference = crypto.createHash('sha256').update(`${storageBucket}:${storagePath}`).digest('hex').slice(0, 16);
      const { error: cleanupError } = await db.storage.from(storageBucket).remove([storagePath]);
      const cleanupLog = {
        technicalReference,
        attemptId,
        storagePathReference,
        cleanupRequested: true,
        cleanupResult: cleanupError ? 'failed' : 'deleted',
        retryCount: 0,
        errorCategory: cleanupError ? 'storage_cleanup_failed' : null,
        safeMessage: cleanupError ? 'An unlinked private object may require operator cleanup.' : undefined
      };
      if (cleanupError) {
        console.error('phase1_generation_storage_cleanup', cleanupLog);
      } else {
        console.info('phase1_generation_storage_cleanup', cleanupLog);
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
