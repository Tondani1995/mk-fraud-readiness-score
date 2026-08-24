import crypto from 'node:crypto';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { hashCustomerReportAccessToken } from '@/lib/security/hash';
import { assertReportAccessEligible, resolveCurrentReportId, ReportAccessEligibilityError } from './report-access-eligibility';

export type CustomerAccessReason =
  | 'invalid_token'
  | 'expired_token'
  | 'revoked_token'
  | 'rate_limited'
  | 'report_record_missing'
  | 'report_order_mismatch'
  | 'report_status_ineligible'
  | 'report_not_current_version'
  | 'storage_path_mismatch'
  | 'stored_file_missing'
  | 'integrity_failed'
  | 'signed_link_creation_failed'
  | 'access_unavailable';

export class CustomerReportAccessError extends Error {
  readonly reason: CustomerAccessReason;
  readonly status: number;
  readonly technicalReference: string;

  constructor(reason: CustomerAccessReason, message: string, status: number, technicalReference: string) {
    super(message);
    this.name = 'CustomerReportAccessError';
    this.reason = reason;
    this.status = status;
    this.technicalReference = technicalReference;
  }
}

const MAX_ACCESS_ATTEMPTS_PER_HOUR = 20;
const REGISTER_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function isAuditFunctionAbsent(error: unknown): boolean {
  const code = String((error as { code?: string } | null)?.code ?? '');
  return code === '42883' || code === 'PGRST202';
}

async function recordAccess(input: {
  db: any;
  tokenId: string | null;
  orderId: string | null;
  reportId: string | null;
  success: boolean;
  reason?: CustomerAccessReason;
  technicalReference: string;
  artefact: CustomerArtefact;
}) {
  const binding = {
    p_token_id: input.tokenId,
    p_order_id: input.orderId,
    p_report_id: input.reportId,
    p_success: input.success,
    p_reason: input.reason ?? null,
    p_technical_reference: input.technicalReference
  };
  const artefactType = input.artefact === 'register' ? 'supporting_register' : 'pdf';
  const auditBinding = {
    ...binding,
    p_artefact_type: artefactType
  };
  let { error: auditError } = await input.db.rpc('record_customer_report_artefact_access', auditBinding);
  if (auditError && isAuditFunctionAbsent(auditError)) {
    ({ error: auditError } = await input.db.rpc('record_customer_report_access', binding));
  }
  if (auditError) {
    console.error('customer_report_access_audit', { technicalReference: input.technicalReference, errorCategory: 'access_audit_failed' });
    if (input.success) {
      throw new CustomerReportAccessError(
        'signed_link_creation_failed',
        'Access was verified but could not be audited, so no file was released.',
        500,
        input.technicalReference
      );
    }
  }
}

export type CustomerArtefact = 'pdf' | 'register';

/**
 * The possession token authorises one exact order/report pair. The selector is applied only after
 * that report-level authority, product binding, current-version check and PDF integrity check have
 * passed. Both customer report tiers expose the PDF and the bound supporting register through this
 * same authorised artefact path.
 */
export async function grantCustomerReportAccess(input: { rawToken: string; ipAddress?: string | null; artefact?: CustomerArtefact }) {
  const technicalReference = crypto.randomUUID();
  const requestedArtefact: CustomerArtefact = input.artefact ?? 'pdf';
  const db = createSupabaseServiceClient() as any;
  const tokenHash = hashCustomerReportAccessToken(input.rawToken);

  const { data: tokenRow, error: tokenError } = await db
    .from('customer_report_access_tokens')
    .select('id,order_id,report_id,recipient_email,purpose,expires_at,revoked_at,access_count')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (tokenError || !tokenRow) {
    await recordAccess({ db, tokenId: null, orderId: null, reportId: null, success: false, reason: 'invalid_token', technicalReference, artefact: requestedArtefact });
    throw new CustomerReportAccessError('invalid_token', 'This link is not valid.', 404, technicalReference);
  }
  if (tokenRow.revoked_at) {
    await recordAccess({ db, tokenId: tokenRow.id, orderId: tokenRow.order_id, reportId: tokenRow.report_id, success: false, reason: 'revoked_token', technicalReference, artefact: requestedArtefact });
    throw new CustomerReportAccessError('revoked_token', 'This link has been revoked. Contact support for a new one.', 410, technicalReference);
  }
  if (new Date(tokenRow.expires_at).getTime() <= Date.now()) {
    await recordAccess({ db, tokenId: tokenRow.id, orderId: tokenRow.order_id, reportId: tokenRow.report_id, success: false, reason: 'expired_token', technicalReference, artefact: requestedArtefact });
    throw new CustomerReportAccessError('expired_token', 'This link has expired. Contact support for a new one.', 410, technicalReference);
  }

  const { data: consumed, error: consumeError } = await db.rpc('consume_customer_report_access_token', {
    p_token_hash: tokenHash,
    p_max_uses: MAX_ACCESS_ATTEMPTS_PER_HOUR
  });
  const denials: Record<string, CustomerAccessReason> = {
    invalid_token: 'invalid_token', revoked_token: 'revoked_token', expired_token: 'expired_token', rate_limited: 'rate_limited'
  };
  const authoritativeDenial = !consumeError && consumed && consumed.ok === false
    && typeof consumed.reason === 'string' && consumed.reason in denials
    ? denials[consumed.reason] : null;
  if (consumeError || !consumed || consumed.ok !== true) {
    const reason: CustomerAccessReason = authoritativeDenial ?? 'access_unavailable';
    await recordAccess({ db, tokenId: tokenRow.id, orderId: tokenRow.order_id, reportId: tokenRow.report_id, success: false, reason, technicalReference, artefact: requestedArtefact });
    const status = reason === 'rate_limited' ? 429 : reason === 'access_unavailable' ? 503 : reason === 'invalid_token' ? 404 : 410;
    throw new CustomerReportAccessError(reason, reason === 'rate_limited' ? 'Too many attempts. Try again later or contact support.' : 'This link is no longer valid. Contact support for a new one.', status, technicalReference);
  }

  const { data: report, error: reportError } = await db
    .from('reports')
    .select('id,assessment_id,order_id,report_type,report_reference,version_number,status,storage_bucket,storage_path,checksum,file_name,mime_type,file_size_bytes,storage_status')
    .eq('id', tokenRow.report_id)
    .maybeSingle();
  if (reportError || !report) {
    await recordAccess({ db, tokenId: tokenRow.id, orderId: tokenRow.order_id, reportId: tokenRow.report_id, success: false, reason: 'report_record_missing', technicalReference, artefact: requestedArtefact });
    throw new CustomerReportAccessError('report_record_missing', 'The report record does not exist.', 404, technicalReference);
  }
  if (report.order_id !== tokenRow.order_id) {
    await recordAccess({ db, tokenId: tokenRow.id, orderId: tokenRow.order_id, reportId: report.id, success: false, reason: 'report_order_mismatch', technicalReference, artefact: requestedArtefact });
    throw new CustomerReportAccessError('report_order_mismatch', 'This link does not match the report it was issued for.', 409, technicalReference);
  }

  const { data: orderIdentity, error: orderIdentityError } = await db
    .from('orders')
    .select('id,product_id,products:product_id(product_code)')
    .eq('id', report.order_id)
    .maybeSingle();
  const orderProduct = Array.isArray(orderIdentity?.products) ? orderIdentity.products[0] : orderIdentity?.products;
  const expectedProductCode = report.report_type === 'mk_validated'
    ? 'mk_validated_assessment'
    : report.report_type === 'essential_self_assessment'
      ? 'essential_self_assessment'
      : null;
  if (orderIdentityError || !orderIdentity || !expectedProductCode || orderProduct?.product_code !== expectedProductCode) {
    await recordAccess({ db, tokenId: tokenRow.id, orderId: tokenRow.order_id, reportId: report.id, success: false, reason: 'report_order_mismatch', technicalReference, artefact: requestedArtefact });
    throw new CustomerReportAccessError('report_order_mismatch', 'This link is not valid for the selected product.', 409, technicalReference);
  }

  try {
    const currentReportId = await resolveCurrentReportId(db, report.assessment_id, report.report_type);
    assertReportAccessEligible({
      report: {
        id: report.id, order_id: report.order_id, report_type: report.report_type,
        status: report.status, version_number: report.version_number,
        storage_bucket: report.storage_bucket, storage_path: report.storage_path, checksum: report.checksum
      },
      currentReportId,
      purpose: 'customer_download'
    });
  } catch (eligibilityError) {
    if (eligibilityError instanceof ReportAccessEligibilityError) {
      const reason: CustomerAccessReason = eligibilityError.reason === 'report_not_current_version' ? 'report_not_current_version' : 'report_status_ineligible';
      await recordAccess({ db, tokenId: tokenRow.id, orderId: tokenRow.order_id, reportId: report.id, success: false, reason, technicalReference, artefact: requestedArtefact });
      throw new CustomerReportAccessError(reason, eligibilityError.message, 409, technicalReference);
    }
    throw eligibilityError;
  }

  if (!report.storage_bucket || !report.storage_path || !report.checksum || ['MISSING', 'FAILED'].includes(report.storage_status)) {
    await recordAccess({ db, tokenId: tokenRow.id, orderId: tokenRow.order_id, reportId: report.id, success: false, reason: 'storage_path_mismatch', technicalReference, artefact: requestedArtefact });
    throw new CustomerReportAccessError('storage_path_mismatch', 'This report has no verified private storage metadata.', 409, technicalReference);
  }

  const { data: object, error: objectError } = await db.storage.from(report.storage_bucket).download(report.storage_path);
  if (objectError || !object) {
    await db.from('reports').update({ storage_status: 'MISSING' }).eq('id', report.id);
    await recordAccess({ db, tokenId: tokenRow.id, orderId: tokenRow.order_id, reportId: report.id, success: false, reason: 'stored_file_missing', technicalReference, artefact: requestedArtefact });
    throw new CustomerReportAccessError('stored_file_missing', 'The report file could not be found. Contact support.', 404, technicalReference);
  }
  const bytes = Buffer.from(await object.arrayBuffer());
  const checksum = crypto.createHash('sha256').update(bytes).digest('hex');
  if (!bytes.length || bytes.subarray(0, 4).toString('ascii') !== '%PDF'
    || (object.type && object.type !== 'application/pdf')
    || checksum !== report.checksum || (report.file_size_bytes && bytes.length !== Number(report.file_size_bytes))) {
    await db.from('reports').update({ storage_status: 'FAILED' }).eq('id', report.id);
    await recordAccess({ db, tokenId: tokenRow.id, orderId: tokenRow.order_id, reportId: report.id, success: false, reason: 'integrity_failed', technicalReference, artefact: requestedArtefact });
    throw new CustomerReportAccessError('integrity_failed', 'This report failed its integrity check. Contact support.', 409, technicalReference);
  }

  let servedBytes = bytes;
  let servedChecksum = checksum;
  let servedMimeType = report.mime_type || 'application/pdf';
  let servedFileName = report.file_name || `${report.report_reference}.pdf`;
  if (requestedArtefact === 'register') {
    const { data: artefact, error: artefactError } = await db
      .from('report_artifacts')
      .select('storage_bucket,storage_path,checksum_sha256,file_size_bytes,storage_status,release_state,artefact_type,file_name,mime_type,artifact_version,engagement_id,report_id')
      .eq('report_id', report.id)
      .eq('artefact_type', 'supporting_register')
      .is('engagement_id', null)
      .eq('artifact_version', report.version_number)
      .eq('storage_status', 'VERIFIED')
      .in('release_state', report.report_type === 'mk_validated' ? ['released'] : ['verified', 'released'])
      .maybeSingle();
    const validFilename = report.report_type !== 'mk_validated' || /comprehensive/i.test(String(artefact?.file_name ?? ''));
    if (artefactError || !artefact || artefact.storage_status !== 'VERIFIED' || artefact.release_state !== 'released') {
      await recordAccess({ db, tokenId: tokenRow.id, orderId: tokenRow.order_id, reportId: report.id, success: false, reason: 'stored_file_missing', technicalReference, artefact: requestedArtefact });
      throw new CustomerReportAccessError('stored_file_missing', 'The supporting register is not available for this report.', 404, technicalReference);
    }
    if (artefact.report_id !== report.id || !validFilename
      || artefact.mime_type !== REGISTER_MIME || !artefact.storage_bucket || !artefact.storage_path
      || !artefact.checksum_sha256 || !/^[0-9a-f]{64}$/.test(artefact.checksum_sha256)
      || Number(artefact.file_size_bytes) <= 0 || Number(artefact.artifact_version) !== Number(report.version_number)) {
      await recordAccess({ db, tokenId: tokenRow.id, orderId: tokenRow.order_id, reportId: report.id, success: false, reason: 'storage_path_mismatch', technicalReference, artefact: requestedArtefact });
      throw new CustomerReportAccessError('storage_path_mismatch', 'This supporting register has no verified private storage metadata.', 409, technicalReference);
    }
    const { data: registerObject, error: registerError } = await db.storage.from(artefact.storage_bucket).download(artefact.storage_path);
    if (registerError || !registerObject) {
      await recordAccess({ db, tokenId: tokenRow.id, orderId: tokenRow.order_id, reportId: report.id, success: false, reason: 'stored_file_missing', technicalReference, artefact: requestedArtefact });
      throw new CustomerReportAccessError('stored_file_missing', 'The supporting register file could not be found.', 404, technicalReference);
    }
    const registerBytes = Buffer.from(await registerObject.arrayBuffer());
    const registerChecksum = crypto.createHash('sha256').update(registerBytes).digest('hex');
    if (registerBytes.length < 2 || registerBytes.subarray(0, 2).toString('ascii') !== 'PK'
      || registerChecksum !== artefact.checksum_sha256 || registerBytes.length !== Number(artefact.file_size_bytes)
      || (registerObject.type && registerObject.type !== REGISTER_MIME)) {
      await recordAccess({ db, tokenId: tokenRow.id, orderId: tokenRow.order_id, reportId: report.id, success: false, reason: 'integrity_failed', technicalReference, artefact: requestedArtefact });
      throw new CustomerReportAccessError('integrity_failed', 'The supporting register failed its integrity check.', 409, technicalReference);
    }
    servedBytes = registerBytes;
    servedChecksum = registerChecksum;
    servedMimeType = REGISTER_MIME;
    servedFileName = artefact.file_name || (
      report.report_type === 'mk_validated'
        ? `${report.report_reference}-comprehensive-supporting-register.xlsx`
        : `${report.report_reference}-action-register.xlsx`
    );
  }

  await recordAccess({ db, tokenId: tokenRow.id, orderId: tokenRow.order_id, reportId: report.id, success: true, technicalReference, artefact: requestedArtefact });
  return {
    bytes: servedBytes,
    checksumSha256: servedChecksum,
    fileSizeBytes: servedBytes.length,
    mimeType: servedMimeType,
    fileName: servedFileName,
    reportReference: report.report_reference,
    technicalReference,
    artefact: requestedArtefact
  };
}
