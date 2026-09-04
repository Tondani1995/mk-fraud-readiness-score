import crypto from 'node:crypto';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { getPhase1SchemaCapability } from './phase1-schema-capability';
import { assertReportAccessEligible, resolveCurrentReportId, ReportAccessEligibilityError } from './report-access-eligibility';
import {
  PRIVATE_REPORT_ACCESS_TTL_SECONDS,
  recordPrivateReportAccessEvidence
} from './private-report-access';
import { ReportAccessError, type ReportAccessMode, type ReportAccessReason } from './phase1-report-access';

export const SUPPORTING_REGISTER_ARTEFACT_TYPE = 'supporting_register';
export const SUPPORTING_REGISTER_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

type SupportingRegister = {
  id: string;
  report_id: string;
  artefact_type: string;
  storage_bucket: string;
  storage_path: string;
  checksum_sha256: string;
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
  storage_status: string;
  release_state?: string | null;
};

async function recordAccess(input: {
  db: any;
  report: any;
  adminId: string;
  mode: ReportAccessMode;
  success: boolean;
  reason?: ReportAccessReason;
  technicalReference: string;
}) {
  const auditError = await recordPrivateReportAccessEvidence({ ...input, artefactType: SUPPORTING_REGISTER_ARTEFACT_TYPE });
  if (auditError) {
    console.error('phase1_supporting_register_access_audit', {
      technicalReference: input.technicalReference,
      reportId: input.report.id,
      orderId: input.report.order_id,
      mode: input.mode,
      success: input.success,
      errorCategory: 'access_audit_failed'
    });
    if (input.success) {
      throw new ReportAccessError(
        'signed_link_creation_failed',
        'Secure workbook access was verified but could not be audited, so no link was released.',
        500,
        input.technicalReference
      );
    }
  }
}

function linkedOrderReference(report: any) {
  return Array.isArray(report.orders) ? report.orders[0]?.order_reference : report.orders?.order_reference;
}

function validSha(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
}

function validSupportingRegister(artifact: any, report: any, expectedPrefix: string): artifact is SupportingRegister {
  const storagePath = String(artifact?.storage_path ?? '');
  return Boolean(artifact?.report_id === report.id
    && artifact?.artefact_type === SUPPORTING_REGISTER_ARTEFACT_TYPE
    && artifact?.storage_status === 'VERIFIED'
    && ['verified', 'released'].includes(String(artifact?.release_state ?? 'verified'))
    && artifact?.storage_bucket
    && storagePath.startsWith(expectedPrefix)
    && !storagePath.includes('..')
    && storagePath.endsWith('.xlsx')
    && artifact?.file_name
    && artifact?.mime_type === SUPPORTING_REGISTER_MIME_TYPE
    && validSha(artifact?.checksum_sha256)
    && Number(artifact?.file_size_bytes) > 0);
}

/**
 * Issues a short-lived, audited admin link for the Comprehensive supporting workbook.
 *
 * The report remains the authority boundary: the report/order binding, report status/currentness
 * and private PDF metadata must pass before this secondary artefact is selected. The workbook is
 * then downloaded from private Storage, checked byte-for-byte, and only the verified object path
 * is signed. The raw storage path is never returned to the browser.
 */
export async function createSecurePhase1SupportingRegisterAccess(input: {
  reportId: string;
  orderReference: string;
  adminId: string;
  mode: ReportAccessMode;
}) {
  const technicalReference = crypto.randomUUID();
  const db = createSupabaseServiceClient() as any;
  const capability = await getPhase1SchemaCapability(db);
  if (capability.status !== 'available') {
    throw new ReportAccessError('phase1_schema_unavailable', capability.message!, 503, technicalReference);
  }

  const { data: report, error: reportError } = await db.from('reports')
    .select('id,assessment_id,organisation_id,order_id,report_type,report_reference,version_number,status,storage_bucket,storage_path,checksum,file_name,mime_type,file_size_bytes,storage_status,orders!inner(order_reference)')
    .eq('id', input.reportId)
    .maybeSingle();
  if (reportError || !report) {
    throw new ReportAccessError('report_record_missing', 'The report record does not exist.', 404, technicalReference);
  }
  if (!input.orderReference || linkedOrderReference(report) !== input.orderReference) {
    await recordAccess({ db, report, adminId: input.adminId, mode: input.mode, success: false, reason: 'report_order_mismatch', technicalReference });
    throw new ReportAccessError('report_order_mismatch', 'The report does not belong to the requested order.', 409, technicalReference);
  }

  try {
    const currentReportId = await resolveCurrentReportId(db, report.assessment_id, report.report_type);
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
      purpose: 'admin_download'
    });
  } catch (eligibilityError) {
    if (eligibilityError instanceof ReportAccessEligibilityError) {
      const reason: ReportAccessReason = eligibilityError.reason === 'report_not_current_version'
        ? 'report_not_current_version' : 'report_status_ineligible';
      await recordAccess({ db, report, adminId: input.adminId, mode: input.mode, success: false, reason, technicalReference });
      throw new ReportAccessError(reason, eligibilityError.message, 409, technicalReference);
    }
    throw eligibilityError;
  }

  const expectedPrefix = `${report.organisation_id}/${report.order_id}/v${report.version_number}/`;
  const { data: artifact, error: artifactError } = await db.from('report_artifacts')
    .select('id,report_id,artefact_type,storage_bucket,storage_path,checksum_sha256,file_name,mime_type,file_size_bytes,storage_status,release_state')
    .eq('report_id', report.id)
    .eq('artefact_type', SUPPORTING_REGISTER_ARTEFACT_TYPE)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (artifactError || !validSupportingRegister(artifact, report, expectedPrefix)) {
    await recordAccess({ db, report, adminId: input.adminId, mode: input.mode, success: false, reason: 'storage_path_mismatch', technicalReference });
    throw new ReportAccessError('storage_path_mismatch', 'The verified supporting workbook is not available for this report.', 409, technicalReference);
  }

  const { data: object, error: objectError } = await db.storage.from(artifact.storage_bucket).download(artifact.storage_path);
  if (objectError || !object) {
    await recordAccess({ db, report, adminId: input.adminId, mode: input.mode, success: false, reason: 'stored_file_missing', technicalReference });
    throw new ReportAccessError('stored_file_missing', 'The supporting workbook file could not be found.', 404, technicalReference);
  }
  const bytes = Buffer.from(await object.arrayBuffer());
  const checksum = crypto.createHash('sha256').update(bytes).digest('hex');
  if (!bytes.length
    || (object.type && object.type !== SUPPORTING_REGISTER_MIME_TYPE)
    || checksum !== artifact.checksum_sha256
    || bytes.length !== Number(artifact.file_size_bytes)) {
    await recordAccess({ db, report, adminId: input.adminId, mode: input.mode, success: false, reason: 'integrity_failed', technicalReference });
    throw new ReportAccessError('integrity_failed', 'The supporting workbook failed its integrity check.', 409, technicalReference);
  }

  const { data: signed, error: signError } = await db.storage
    .from(artifact.storage_bucket)
    .createSignedUrl(artifact.storage_path, PRIVATE_REPORT_ACCESS_TTL_SECONDS, { download: artifact.file_name });
  if (signError || !signed?.signedUrl) {
    await recordAccess({ db, report, adminId: input.adminId, mode: input.mode, success: false, reason: 'signed_link_creation_failed', technicalReference });
    throw new ReportAccessError('signed_link_creation_failed', 'A secure workbook link could not be created.', 500, technicalReference);
  }

  await recordAccess({ db, report, adminId: input.adminId, mode: input.mode, success: true, technicalReference });
  console.info('phase1_supporting_register_access', {
    technicalReference,
    reportId: report.id,
    orderId: report.order_id,
    mode: input.mode,
    status: 'issued',
    expiresInSeconds: PRIVATE_REPORT_ACCESS_TTL_SECONDS,
    checksumSha256: artifact.checksum_sha256
  });
  return {
    url: signed.signedUrl,
    expiresInSeconds: PRIVATE_REPORT_ACCESS_TTL_SECONDS,
    reportReference: report.report_reference,
    artefactType: SUPPORTING_REGISTER_ARTEFACT_TYPE,
    fileName: artifact.file_name,
    checksumSha256: artifact.checksum_sha256,
    technicalReference
  };
}

export const __testables = { validSupportingRegister };
