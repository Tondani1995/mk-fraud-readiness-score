import crypto from 'node:crypto';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { hashCustomerReportAccessToken } from '@/lib/security/hash';
import { assertReportAccessEligible, resolveCurrentReportId, ReportAccessEligibilityError } from './report-access-eligibility';

// Release C customer-facing secure report access. Deliberately mirrors
// createSecurePhase1ReportAccess (phase1-report-access.ts) as a pattern -- same order/status/
// currentness/checksum/magic-byte verification, same short signed-URL TTL, same
// three-table audit fan-out, never returns the raw storage path -- but is a new, parallel
// function for the 'customer_download' purpose, since the admin one is admin-session-gated and
// this route has no admin session at all. See docs/safe-launch/15-email-and-secure-delivery-design.md.

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
  constructor(
    public readonly reason: CustomerAccessReason,
    message: string,
    public readonly status: number,
    public readonly technicalReference: string
  ) {
    super(message);
    this.name = 'CustomerReportAccessError';
  }
}

// The URL is created before the final audit RPC and Vercel's redirect completes. A 60-second
// token can expire during a cold start or a slow audited request even though the route has passed
// every access and integrity check. Five minutes remains a short possession-link window while
// leaving enough margin for the signed URL to reach Storage.
const MAX_ACCESS_ATTEMPTS_PER_HOUR = 20;

/**
 * Narrowly scoped: only "this function does not exist in the schema" may trigger the audit
 * fallback. Same rule as the secondary-artefact capability check -- the code decides, never the
 * message -- so a permission denial, a binding rejection or a connection fault propagates and the
 * access attempt fails closed instead of silently downgrading its audit trail.
 */
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
  const eventType = input.success ? 'customer_report_accessed' : 'customer_report_access_failed';
  // Deliberately no raw token, no IP address, no user-agent in the persisted metadata -- only
  // what is needed to operate this system (token id, order/report ids, outcome, reference).
  const metadata = {
    token_id: input.tokenId,
    technical_reference: input.technicalReference,
    success: input.success,
    error_category: input.reason ?? null
  };
  // Artefact-aware audit: the persisted event/audit trail must identify which artefact of the
  // authorised report was requested or served. The accepted six-argument
  // record_customer_report_access() builds its own metadata and cannot carry that discriminator,
  // so this path prefers the additive artefact-aware function.
  const artefactType = input.artefact === 'register' ? 'supporting_register' : 'pdf';
  const auditArtefactType = input.artefact === 'board' ? 'board_readout'
    : input.artefact === 'presentation' ? 'executive_presentation'
      : input.artefact === 'workshop' ? 'workshop_material' : artefactType;
  const binding = {
    p_token_id: input.tokenId,
    p_order_id: input.orderId,
    p_report_id: input.reportId,
    p_success: input.success,
    p_reason: input.reason ?? null,
    p_technical_reference: input.technicalReference
  };
  const auditBinding = { ...binding, p_artefact_type: artefactType } as Record<string, unknown>;
  if (auditArtefactType !== artefactType) auditBinding.p_artefact_type = auditArtefactType;
  let { error: auditError } = await input.db.rpc('record_customer_report_artefact_access', auditBinding);
  // Pre-migration compatibility. 20260807130000 creates the artefact-aware function; until it is
  // applied, the PDF journey must keep working exactly as accepted rather than 500. The accepted
  // six-argument function is deliberately still present, so fall back to it and lose only the
  // artefact discriminator -- which on a pre-migration schema can only ever be the PDF, because
  // report_artifacts does not exist either. Absence is decided by the SQLSTATE / PostgREST code
  // alone: a privilege failure or any other fault still fails closed on the primary call.
  if (auditError && isAuditFunctionAbsent(auditError)) {
    ({ error: auditError } = await input.db.rpc('record_customer_report_access', binding));
  }
  if (auditError) {
    console.error('customer_report_access_audit', { technicalReference: input.technicalReference, errorCategory: 'access_audit_failed' });
    if (input.success) {
      throw new CustomerReportAccessError(
        'signed_link_creation_failed',
        'Access was verified but could not be audited, so no link was released.',
        500,
        input.technicalReference
      );
    }
  }
}

export type CustomerArtefact = 'pdf' | 'register' | 'board' | 'presentation' | 'workshop';

/**
 * min-M8: the artefact selector is applied ONLY after the existing report-level authority has
 * already succeeded. The token still authorises exactly (order_id, report_id); it never addresses
 * an artefact directly, so an artefact belonging to another report is unreachable by construction.
 */
export async function grantCustomerReportAccess(input: { rawToken: string; ipAddress?: string | null; artefact?: CustomerArtefact }) {
  const technicalReference = crypto.randomUUID();
  // One requested artefact per access attempt. Every audit row for this attempt carries it, so the
  // persisted trail always states which artefact of the report the customer asked for -- including
  // on failures raised before the artefact selector is reached.
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

  // Simple rate limit: no more than MAX_ACCESS_ATTEMPTS_PER_HOUR successful+failed attempts
  // recorded against this token in the last hour. Uses the token's own access_count/updated_at
  // as a coarse guard rather than a new table -- sufficient for a possession-link model where
  // the realistic abuse case is a leaked link being hammered, not distributed credential stuffing.
  // The allowance decision is made atomically in the database, immediately before the first Storage
  // read, so two concurrent requests cannot both spend the same remaining access. A JS comparison
  // against a previously selected access_count could grant both.
  const { data: consumed, error: consumeError } = await db.rpc('consume_customer_report_access_token', {
    p_token_hash: tokenHash,
    p_max_uses: MAX_ACCESS_ATTEMPTS_PER_HOUR
  });
  // Two outcomes must be kept apart. An RPC that EXECUTED and denied is a legitimate access
  // decision. An RPC that could not execute reliably -- missing function, PostgREST lookup failure,
  // transport or execution error, malformed result -- is an operational fault, and telling the
  // customer they exhausted their allowance would simply be false. Both fail closed with zero
  // Storage reads and no legacy counter fallback; only the customer-facing outcome differs.
  const DENIALS: Record<string, CustomerAccessReason> = {
    invalid_token: 'invalid_token', revoked_token: 'revoked_token',
    expired_token: 'expired_token', rate_limited: 'rate_limited'
  };
  const authoritativeDenial = !consumeError && consumed && consumed.ok === false
    && typeof consumed.reason === 'string' && consumed.reason in DENIALS
    ? DENIALS[consumed.reason] : null;
  if (consumeError || !consumed || consumed.ok !== true) {
    const reason: CustomerAccessReason = authoritativeDenial ?? 'access_unavailable';
    if (!authoritativeDenial) {
      // Allowance state is unknown, so no claim is made about it. No SQL or function detail leaks.
      console.error('customer_report_access_consumption', {
        technicalReference, errorCategory: 'access_consumption_unavailable',
        rpcErrored: Boolean(consumeError)
      });
    }
    await recordAccess({ db, tokenId: tokenRow.id, orderId: tokenRow.order_id, reportId: tokenRow.report_id, success: false, reason, technicalReference, artefact: requestedArtefact });
    const status = reason === 'rate_limited' ? 429
      : reason === 'access_unavailable' ? 503
      : reason === 'invalid_token' ? 404 : 410;
    const message = reason === 'rate_limited'
      ? 'Too many attempts. Try again later or contact support.'
      : reason === 'access_unavailable'
        ? 'Secure report access is temporarily unavailable. Please try again later or contact support.'
        : 'This link is no longer valid. Contact support for a new one.';
    throw new CustomerReportAccessError(reason, message, status, technicalReference);
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
      const reason: CustomerAccessReason = eligibilityError.reason === 'report_not_current_version'
        ? 'report_not_current_version' : 'report_status_ineligible';
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

  // Report-level authority has now fully passed (token validity, revocation, expiry, rate limit,
  // report/order binding, eligibility, storage metadata, byte-level PDF integrity). Only now may a
  // secondary artefact of THIS report be selected.
  //
  // `bytes` above is the PDF instance that just passed %PDF, MIME, SHA-256 and size validation.
  // Whatever is selected here is the exact buffer the customer receives: the route returns these
  // bytes directly and never signs a URL, because a signed URL is a SECOND Storage read and the
  // instance it serves need not be the instance that was verified. On Staging that gap was real --
  // the verification read returned the genuine object from cache while the signed URL served a
  // freshly tampered one, and the customer got 94,062 tampered bytes behind a passing checksum.
  let servedBytes: Buffer = bytes;
  let servedChecksum: string = checksum;
  let servedMimeType: string = report.mime_type || 'application/pdf';
  let servedFileName: string = report.file_name || `${report.report_reference}.pdf`;
  const secondary = {
    register: { type: 'supporting_register', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', fallback: `${report.report_reference}-supporting-register.xlsx` },
    board: { type: 'board_readout', mimeType: 'application/pdf', fallback: `${report.report_reference}-board-readout.pdf` },
    presentation: { type: 'executive_presentation', mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', fallback: `${report.report_reference}-executive-presentation.pptx` },
    workshop: { type: 'workshop_material', mimeType: 'application/pdf', fallback: `${report.report_reference}-workshop-material.pdf` }
  } as const;
  if (input.artefact !== 'pdf' && report.report_type !== 'mk_validated' && input.artefact !== 'register') {
    await recordAccess({ db, tokenId: tokenRow.id, orderId: tokenRow.order_id, reportId: report.id, success: false, reason: 'report_status_ineligible', technicalReference, artefact: requestedArtefact });
    throw new CustomerReportAccessError('report_status_ineligible', 'This artefact is not available for this order.', 409, technicalReference);
  }
  if (input.artefact === 'register' && report.report_type !== 'mk_validated') {
    const { data: legacyArtefact, error: legacyArtefactError } = await db
      .from('report_artifacts')
      .select('storage_bucket,storage_path,checksum_sha256,file_size_bytes,storage_status,artefact_type,file_name,mime_type')
      .eq('report_id', report.id)
      .eq('artefact_type', 'supporting_register')
      .maybeSingle();
    const artefact = legacyArtefact;
    if (legacyArtefactError || !artefact || artefact.storage_status !== 'VERIFIED'
      || !artefact.storage_bucket || !artefact.storage_path || !artefact.checksum_sha256
      || Number(artefact.file_size_bytes) <= 0) {
      await recordAccess({ db, tokenId: tokenRow.id, orderId: tokenRow.order_id, reportId: report.id, success: false, reason: 'stored_file_missing', technicalReference, artefact: requestedArtefact });
      throw new CustomerReportAccessError('stored_file_missing', 'The supporting register is not available for this report.', 404, technicalReference);
    }
    const { data: legacyObject, error: legacyObjectError } = await db.storage.from(artefact.storage_bucket).download(artefact.storage_path);
    if (legacyObjectError || !legacyObject) {
      await recordAccess({ db, tokenId: tokenRow.id, orderId: tokenRow.order_id, reportId: report.id, success: false, reason: 'stored_file_missing', technicalReference, artefact: requestedArtefact });
      throw new CustomerReportAccessError('stored_file_missing', 'The supporting register file could not be found.', 404, technicalReference);
    }
    const legacyBytes = Buffer.from(await legacyObject.arrayBuffer());
    const registerChecksum = crypto.createHash('sha256').update(legacyBytes).digest('hex');
    if (registerChecksum !== artefact.checksum_sha256 || legacyBytes.length !== Number(artefact.file_size_bytes)) {
      await recordAccess({ db, tokenId: tokenRow.id, orderId: tokenRow.order_id, reportId: report.id, success: false, reason: 'integrity_failed', technicalReference, artefact: requestedArtefact });
      throw new CustomerReportAccessError('integrity_failed', 'The supporting register failed its integrity check.', 409, technicalReference);
    }
    servedBytes = legacyBytes;
    servedChecksum = registerChecksum;
    servedMimeType = artefact.mime_type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    servedFileName = artefact.file_name || `${report.report_reference}-supporting-register.xlsx`;
  }
  if (input.artefact !== 'pdf' && report.report_type === 'mk_validated') {
    if (report.report_type !== 'mk_validated') {
      await recordAccess({ db, tokenId: tokenRow.id, orderId: tokenRow.order_id, reportId: report.id, success: false, reason: 'report_status_ineligible', technicalReference, artefact: requestedArtefact });
      throw new CustomerReportAccessError('report_status_ineligible', 'This artefact is not available for this order.', 409, technicalReference);
    }
    const { data: engagement, error: engagementError } = await db
      .from('comprehensive_engagements')
      .select('id,state,signed_off_artifact_version')
      .eq('order_id', report.order_id)
      .maybeSingle();
    const required = secondary[input.artefact as keyof typeof secondary];
    if (engagementError || !engagement || engagement.state !== 'delivered' || !engagement.signed_off_artifact_version) {
      await recordAccess({ db, tokenId: tokenRow.id, orderId: tokenRow.order_id, reportId: report.id, success: false, reason: 'report_status_ineligible', technicalReference, artefact: requestedArtefact });
      throw new CustomerReportAccessError('report_status_ineligible', 'This artefact is not yet available.', 409, technicalReference);
    }
    const { data: artefact, error: artefactError } = await db
      .from('report_artifacts')
      .select('storage_bucket,storage_path,checksum_sha256,file_size_bytes,storage_status,release_state,artefact_type,file_name,mime_type,artifact_version,engagement_id,report_id')
      .eq('report_id', report.id)
      .eq('engagement_id', engagement.id)
      .eq('artifact_version', engagement.signed_off_artifact_version)
      .eq('artefact_type', required.type)
      .eq('release_state', 'released')
      .eq('storage_status', 'VERIFIED')
      .maybeSingle();
    if (artefactError || !artefact || artefact.report_id !== report.id || artefact.engagement_id !== engagement.id
      || Number(artefact.artifact_version) !== Number(engagement.signed_off_artifact_version)
      || artefact.mime_type !== required.mimeType || !artefact.storage_bucket || !artefact.storage_path
      || !artefact.checksum_sha256 || !/^[0-9a-f]{64}$/.test(artefact.checksum_sha256) || Number(artefact.file_size_bytes) <= 0) {
      await recordAccess({ db, tokenId: tokenRow.id, orderId: tokenRow.order_id, reportId: report.id, success: false, reason: 'storage_path_mismatch', technicalReference, artefact: requestedArtefact });
      throw new CustomerReportAccessError('storage_path_mismatch', 'This artefact has no verified private storage metadata.', 409, technicalReference);
    }
    const { data: secondaryObject, error: secondaryError } = await db.storage.from(artefact.storage_bucket).download(artefact.storage_path);
    if (secondaryError || !secondaryObject) {
      await recordAccess({ db, tokenId: tokenRow.id, orderId: tokenRow.order_id, reportId: report.id, success: false, reason: 'stored_file_missing', technicalReference, artefact: requestedArtefact });
      throw new CustomerReportAccessError('stored_file_missing', 'This artefact file could not be found.', 404, technicalReference);
    }
    const secondaryBytes = Buffer.from(await secondaryObject.arrayBuffer());
    const secondaryChecksum = crypto.createHash('sha256').update(secondaryBytes).digest('hex');
    if (secondaryChecksum !== artefact.checksum_sha256 || secondaryBytes.length !== Number(artefact.file_size_bytes)
      || (secondaryObject.type && secondaryObject.type !== required.mimeType)) {
      await recordAccess({ db, tokenId: tokenRow.id, orderId: tokenRow.order_id, reportId: report.id, success: false, reason: 'integrity_failed', technicalReference, artefact: requestedArtefact });
      throw new CustomerReportAccessError('integrity_failed', 'This artefact failed its integrity check.', 409, technicalReference);
    }
    servedBytes = secondaryBytes;
    servedChecksum = secondaryChecksum;
    servedMimeType = artefact.mime_type;
    servedFileName = artefact.file_name || required.fallback;
  }

  // Audit before release: recordAccess() throws on a failed success-audit, so an unauditable access
  // still yields no bytes. Access accounting stays on the successful-authorised path only.
  // No counter mutation here: the allowance was consumed atomically before the artefact was read.
  // A later Storage or integrity failure therefore consumes an access without delivering bytes,
  // which is correct for an abuse-control counter -- refunding would reintroduce a race.

  await recordAccess({ db, tokenId: tokenRow.id, orderId: tokenRow.order_id, reportId: report.id, success: true, technicalReference, artefact: requestedArtefact });

  // The verified instance itself. No bucket, no path, no signed URL, no second Storage read.
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
