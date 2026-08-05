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
  | 'signed_link_creation_failed';

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
const ACCESS_TTL_SECONDS = 300;
const MAX_ACCESS_ATTEMPTS_PER_HOUR = 20;

async function recordAccess(input: {
  db: any;
  tokenId: string | null;
  orderId: string | null;
  reportId: string | null;
  success: boolean;
  reason?: CustomerAccessReason;
  technicalReference: string;
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
  const { error: auditError } = await input.db.rpc('record_customer_report_access', {
    p_token_id: input.tokenId,
    p_order_id: input.orderId,
    p_report_id: input.reportId,
    p_success: input.success,
    p_reason: input.reason ?? null,
    p_technical_reference: input.technicalReference
  });
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

export async function grantCustomerReportAccess(input: { rawToken: string; ipAddress?: string | null }) {
  const technicalReference = crypto.randomUUID();
  const db = createSupabaseServiceClient() as any;
  const tokenHash = hashCustomerReportAccessToken(input.rawToken);

  const { data: tokenRow, error: tokenError } = await db
    .from('customer_report_access_tokens')
    .select('id,order_id,report_id,recipient_email,purpose,expires_at,revoked_at,access_count')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (tokenError || !tokenRow) {
    await recordAccess({ db, tokenId: null, orderId: null, reportId: null, success: false, reason: 'invalid_token', technicalReference });
    throw new CustomerReportAccessError('invalid_token', 'This link is not valid.', 404, technicalReference);
  }
  if (tokenRow.revoked_at) {
    await recordAccess({ db, tokenId: tokenRow.id, orderId: tokenRow.order_id, reportId: tokenRow.report_id, success: false, reason: 'revoked_token', technicalReference });
    throw new CustomerReportAccessError('revoked_token', 'This link has been revoked. Contact support for a new one.', 410, technicalReference);
  }
  if (new Date(tokenRow.expires_at).getTime() <= Date.now()) {
    await recordAccess({ db, tokenId: tokenRow.id, orderId: tokenRow.order_id, reportId: tokenRow.report_id, success: false, reason: 'expired_token', technicalReference });
    throw new CustomerReportAccessError('expired_token', 'This link has expired. Contact support for a new one.', 410, technicalReference);
  }

  // Simple rate limit: no more than MAX_ACCESS_ATTEMPTS_PER_HOUR successful+failed attempts
  // recorded against this token in the last hour. Uses the token's own access_count/updated_at
  // as a coarse guard rather than a new table -- sufficient for a possession-link model where
  // the realistic abuse case is a leaked link being hammered, not distributed credential stuffing.
  if (tokenRow.access_count >= MAX_ACCESS_ATTEMPTS_PER_HOUR) {
    await recordAccess({ db, tokenId: tokenRow.id, orderId: tokenRow.order_id, reportId: tokenRow.report_id, success: false, reason: 'rate_limited', technicalReference });
    throw new CustomerReportAccessError('rate_limited', 'Too many attempts. Try again later or contact support.', 429, technicalReference);
  }

  const { data: report, error: reportError } = await db
    .from('reports')
    .select('id,assessment_id,order_id,report_type,report_reference,version_number,status,storage_bucket,storage_path,checksum,file_name,mime_type,file_size_bytes,storage_status')
    .eq('id', tokenRow.report_id)
    .maybeSingle();
  if (reportError || !report) {
    await recordAccess({ db, tokenId: tokenRow.id, orderId: tokenRow.order_id, reportId: tokenRow.report_id, success: false, reason: 'report_record_missing', technicalReference });
    throw new CustomerReportAccessError('report_record_missing', 'The report record does not exist.', 404, technicalReference);
  }
  if (report.order_id !== tokenRow.order_id) {
    await recordAccess({ db, tokenId: tokenRow.id, orderId: tokenRow.order_id, reportId: report.id, success: false, reason: 'report_order_mismatch', technicalReference });
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
      await recordAccess({ db, tokenId: tokenRow.id, orderId: tokenRow.order_id, reportId: report.id, success: false, reason, technicalReference });
      throw new CustomerReportAccessError(reason, eligibilityError.message, 409, technicalReference);
    }
    throw eligibilityError;
  }

  if (!report.storage_bucket || !report.storage_path || !report.checksum || ['MISSING', 'FAILED'].includes(report.storage_status)) {
    await recordAccess({ db, tokenId: tokenRow.id, orderId: tokenRow.order_id, reportId: report.id, success: false, reason: 'storage_path_mismatch', technicalReference });
    throw new CustomerReportAccessError('storage_path_mismatch', 'This report has no verified private storage metadata.', 409, technicalReference);
  }

  const { data: object, error: objectError } = await db.storage.from(report.storage_bucket).download(report.storage_path);
  if (objectError || !object) {
    await db.from('reports').update({ storage_status: 'MISSING' }).eq('id', report.id);
    await recordAccess({ db, tokenId: tokenRow.id, orderId: tokenRow.order_id, reportId: report.id, success: false, reason: 'stored_file_missing', technicalReference });
    throw new CustomerReportAccessError('stored_file_missing', 'The report file could not be found. Contact support.', 404, technicalReference);
  }
  const bytes = Buffer.from(await object.arrayBuffer());
  const checksum = crypto.createHash('sha256').update(bytes).digest('hex');
  if (!bytes.length || bytes.subarray(0, 4).toString('ascii') !== '%PDF'
    || (object.type && object.type !== 'application/pdf')
    || checksum !== report.checksum || (report.file_size_bytes && bytes.length !== Number(report.file_size_bytes))) {
    await db.from('reports').update({ storage_status: 'FAILED' }).eq('id', report.id);
    await recordAccess({ db, tokenId: tokenRow.id, orderId: tokenRow.order_id, reportId: report.id, success: false, reason: 'integrity_failed', technicalReference });
    throw new CustomerReportAccessError('integrity_failed', 'This report failed its integrity check. Contact support.', 409, technicalReference);
  }

  const { data: signed, error: signError } = await db.storage
    .from(report.storage_bucket)
    // Keep the signed object URL canonical. Supabase Storage accepts the boolean
    // download option, but the filename form is not portable across Storage API
    // versions and can make an otherwise valid signed URL return HTTP 400. The
    // customer route remains possession-token and integrity gated; no object is
    // served through the service-role client.
    .createSignedUrl(report.storage_path, ACCESS_TTL_SECONDS);
  if (signError || !signed?.signedUrl) {
    await recordAccess({ db, tokenId: tokenRow.id, orderId: tokenRow.order_id, reportId: report.id, success: false, reason: 'signed_link_creation_failed', technicalReference });
    throw new CustomerReportAccessError('signed_link_creation_failed', 'A secure link could not be created. Contact support.', 500, technicalReference);
  }

  await db.from('customer_report_access_tokens').update({
    last_accessed_at: new Date().toISOString(),
    access_count: tokenRow.access_count + 1
  }).eq('id', tokenRow.id);

  await recordAccess({ db, tokenId: tokenRow.id, orderId: tokenRow.order_id, reportId: report.id, success: true, technicalReference });

  return { url: signed.signedUrl, expiresInSeconds: ACCESS_TTL_SECONDS, reportReference: report.report_reference, technicalReference };
}
