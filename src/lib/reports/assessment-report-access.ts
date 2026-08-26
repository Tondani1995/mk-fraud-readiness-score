import crypto from 'node:crypto';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { getPhase1SchemaCapability } from './phase1-schema-capability';
import {
  assertReportAccessEligible,
  ReportAccessEligibilityError,
  resolveCurrentReportId
} from './report-access-eligibility';
import {
  PRIVATE_REPORT_ACCESS_TTL_SECONDS,
  PrivateReportStorageError,
  issuePrivateReportSignedUrl,
  readVerifiedPrivatePdf,
  recordPrivateReportAccessEvidence,
  safeReportFileName
} from './private-report-access';

export class AssessmentReportAccessError extends Error {
  readonly reason: string;
  readonly status: number;
  readonly technicalReference: string;

  constructor(reason: string, message: string, status: number, technicalReference: string) {
    super(message);
    this.name = 'AssessmentReportAccessError';
    this.reason = reason;
    this.status = status;
    this.technicalReference = technicalReference;
  }
}

async function recordFailure(db: any, report: any, input: {
  adminId: string;
  mode: 'preview' | 'download';
  technicalReference: string;
}, reason: string) {
  const error = await recordPrivateReportAccessEvidence({
    db,
    report,
    adminId: input.adminId,
    mode: input.mode,
    success: false,
    reason,
    technicalReference: input.technicalReference
  });
  if (error) {
    console.error('assessment_report_access_audit', {
      technicalReference: input.technicalReference,
      reportId: report.id,
      errorCategory: 'access_audit_failed'
    });
  }
}

async function failWithEvidence(
  db: any,
  report: any,
  input: { adminId: string; mode: 'preview' | 'download'; technicalReference: string },
  reason: string,
  message: string,
  status: number
): Promise<never> {
  await recordFailure(db, report, input, reason);
  throw new AssessmentReportAccessError(reason, message, status, input.technicalReference);
}

/**
 * Assessment-admin adapter for the shared private report access core. It deliberately has no
 * order or payment input and does not create customer tokens, invoke generation, or call an email
 * provider. A legacy order-linked report may still be read when it is bound to this assessment;
 * a direct V1.2 report must use the assessment-scoped storage prefix.
 */
export async function createSecureAssessmentAdminReportAccess(input: {
  assessmentReference: string;
  reportId: string;
  adminId: string;
  mode: 'preview' | 'download';
}) {
  const technicalReference = crypto.randomUUID();
  const accessInput = { ...input, technicalReference };
  const db = createSupabaseServiceClient() as any;
  const capability = await getPhase1SchemaCapability(db);
  if (capability.status !== 'available') {
    throw new AssessmentReportAccessError('phase1_schema_unavailable', capability.message!, 503, technicalReference);
  }

  const { data: assessment, error: assessmentError } = await db
    .from('assessments')
    .select('id,assessment_reference,organisation_id,current_score_run_id,assessment_mode,status,submitted_at,locked_at')
    .eq('assessment_reference', input.assessmentReference)
    .maybeSingle();
  if (assessmentError || !assessment) {
    throw new AssessmentReportAccessError('assessment_not_found', 'The assessment could not be found.', 404, technicalReference);
  }

  const { data: report, error: reportError } = await db
    .from('reports')
    .select('id,assessment_id,organisation_id,order_id,score_run_id,report_type,report_reference,version_number,status,storage_bucket,storage_path,checksum,file_name,mime_type,file_size_bytes,storage_status,orders(assessment_id,order_reference)')
    .eq('id', input.reportId)
    .maybeSingle();
  if (reportError || !report) {
    throw new AssessmentReportAccessError('report_record_missing', 'The report record does not exist.', 404, technicalReference);
  }

  const linkedOrder = Array.isArray(report.orders) ? report.orders[0] : report.orders;
  if (report.assessment_id !== assessment.id
    || (linkedOrder && linkedOrder.assessment_id !== assessment.id)) {
    await failWithEvidence(db, report, accessInput, 'assessment_report_mismatch', 'The report does not belong to the requested assessment.', 409);
  }
  if (report.report_type !== 'essential_self_assessment') {
    await failWithEvidence(db, report, accessInput, 'report_type_ineligible', 'Only the Essential report can be downloaded from this assessment workspace.', 409);
  }
  if (report.organisation_id !== assessment.organisation_id) {
    await failWithEvidence(db, report, accessInput, 'report_organisation_mismatch', 'The report organisation binding is invalid.', 409);
  }
  if (assessment.assessment_mode !== 'adaptive') {
    await failWithEvidence(db, report, accessInput, 'assessment_mode_ineligible', 'Only an adaptive V1.2 assessment can use this report workspace.', 409);
  }
  if (!['scored', 'snapshot_available', 'report_requested', 'under_review', 'closed'].includes(assessment.status)
    || !assessment.submitted_at
    || !assessment.locked_at
    || !assessment.current_score_run_id) {
    await failWithEvidence(db, report, accessInput, 'assessment_not_completed', 'The assessment is not an authoritatively completed and locked result.', 409);
  }
  if (report.score_run_id !== assessment.current_score_run_id) {
    await failWithEvidence(db, report, accessInput, 'report_score_mismatch', 'The report is not bound to the assessment\'s current locked score.', 409);
  }
  if (report.storage_status !== 'VERIFIED'
    || report.storage_bucket !== 'generated-reports'
    || report.mime_type !== 'application/pdf'
    || Number(report.file_size_bytes ?? 0) <= 0) {
    await failWithEvidence(db, report, accessInput, 'report_storage_metadata_invalid', 'The report does not have verified private PDF storage metadata.', 409);
  }

  try {
    const currentReportId = await resolveCurrentReportId(db, assessment.id, report.report_type);
    assertReportAccessEligible({
      report: {
        id: report.id,
        order_id: report.order_id,
        report_type: report.report_type,
        status: report.status,
        version_number: report.version_number,
        storage_bucket: report.storage_bucket,
        storage_path: report.storage_path,
        checksum: report.checksum
      },
      currentReportId,
      expectedOrganisationId: assessment.organisation_id,
      actualOrganisationId: report.organisation_id,
      purpose: 'admin_download'
    });
  } catch (error) {
    const reason = error instanceof ReportAccessEligibilityError ? error.reason : 'report_access_check_failed';
    await failWithEvidence(
      db,
      report,
      accessInput,
      reason,
      error instanceof Error ? error.message : 'The report is not eligible for access.',
      409
    );
  }

  const scopeId = report.order_id ?? assessment.id;
  const expectedPrefix = `${assessment.organisation_id}/${scopeId}/v${report.version_number}/`;
  if (!String(report.storage_path ?? '').startsWith(expectedPrefix)
    || !String(report.storage_path ?? '').endsWith('.pdf')) {
    await failWithEvidence(db, report, accessInput, 'storage_path_mismatch', 'The stored report path does not match the assessment binding.', 409);
  }
  if (!report.order_id) {
    const expectedFileName = safeReportFileName(String(report.report_reference ?? ''));
    const expectedStoragePath = `${expectedPrefix}${expectedFileName.slice(0, -4)}-${String(report.checksum ?? '').slice(0, 16)}.pdf`;
    if (report.file_name !== expectedFileName || report.storage_path !== expectedStoragePath) {
      await failWithEvidence(db, report, accessInput, 'storage_path_mismatch', 'The stored report path does not match the deterministic assessment report binding.', 409);
    }
  }

  let verified;
  try {
    verified = await readVerifiedPrivatePdf(db, report, expectedPrefix);
  } catch (error) {
    const storageError = error instanceof PrivateReportStorageError ? error : null;
    const reason = storageError?.reason ?? 'integrity_failed';
    const nextState = reason === 'stored_file_missing' ? 'MISSING' : 'FAILED';
    const { error: stateError } = await db.from('reports').update({ storage_status: nextState }).eq('id', report.id);
    if (stateError) console.error('assessment_report_storage_state', { technicalReference, reportId: report.id, state: nextState });
    await failWithEvidence(
      db,
      report,
      accessInput,
      reason,
      storageError?.message ?? 'The stored PDF failed its integrity check.',
      reason === 'stored_file_missing' ? 404 : 409
    );
  }

  const verifiedPdf = verified as NonNullable<typeof verified>;
  if (report.storage_status !== 'VERIFIED') {
    const { error: verificationError } = await db.from('reports').update({
      storage_status: 'VERIFIED',
      storage_verified_at: new Date().toISOString(),
      file_size_bytes: verifiedPdf.fileSizeBytes,
      mime_type: 'application/pdf',
      file_name: report.file_name || safeReportFileName(report.report_reference)
    }).eq('id', report.id);
    if (verificationError) {
      await failWithEvidence(db, report, accessInput, 'storage_metadata_update_failed', 'The verified storage result could not be linked to the report record.', 500);
    }
  }

  const signedUrl = await issuePrivateReportSignedUrl(db, report, input.mode);
  if (!signedUrl) {
    await failWithEvidence(db, report, accessInput, 'signed_link_creation_failed', 'A secure report link could not be created.', 500);
  }
  const verifiedUrl = signedUrl as string;
  const auditError = await recordPrivateReportAccessEvidence({
    db,
    report,
    adminId: input.adminId,
    mode: input.mode,
    success: true,
    technicalReference
  });
  if (auditError) {
    throw new AssessmentReportAccessError(
      'signed_link_creation_failed',
      'Secure access was verified but could not be audited, so no link was released.',
      500,
      technicalReference
    );
  }
  console.info('assessment_report_access', {
    technicalReference,
    reportId: report.id,
    assessmentId: assessment.id,
    orderId: report.order_id,
    mode: input.mode,
    status: 'issued',
    expiresInSeconds: PRIVATE_REPORT_ACCESS_TTL_SECONDS
  });
  return {
    url: verifiedUrl,
    expiresInSeconds: PRIVATE_REPORT_ACCESS_TTL_SECONDS,
    reportReference: report.report_reference,
    technicalReference
  };
}
