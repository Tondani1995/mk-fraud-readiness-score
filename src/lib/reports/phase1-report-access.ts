import crypto from 'node:crypto';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { getPhase1SchemaCapability } from './phase1-schema-capability';
import { assertReportAccessEligible, resolveCurrentReportId, ReportAccessEligibilityError } from './report-access-eligibility';

export type ReportAccessMode = 'preview' | 'download';
export type ReportAccessArtefact = 'pdf' | 'register';
export type ReportAccessReason =
  | 'permission_denied'
  | 'report_record_missing'
  | 'stored_file_missing'
  | 'signed_link_creation_failed'
  | 'expired_link'
  | 'report_order_mismatch'
  | 'storage_path_mismatch'
  | 'integrity_failed'
  | 'phase1_schema_unavailable'
  // H5: this path (createSecurePhase1ReportAccess) already verified order/storage/checksum, but
  // had no check at all on report.status or on whether this report is the current version for its
  // assessment/report type -- a superseded, voided, or draft report could previously be handed a
  // valid signed download link as long as its storage object happened to still verify. Closed via
  // report-access-eligibility.ts, which is also the single function any future customer-facing
  // download helper must reuse (see that module's header comment).
  | 'report_status_ineligible'
  | 'report_not_current_version';

export class ReportAccessError extends Error {
  constructor(
    public readonly reason: ReportAccessReason,
    message: string,
    public readonly status: number,
    public readonly technicalReference: string
  ) {
    super(message);
    this.name = 'ReportAccessError';
  }
}

const ACCESS_TTL_SECONDS = 60;
const REGISTER_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function safeFileName(value: string, extension = 'pdf') {
  return `${value.replace(/[^A-Za-z0-9._-]/g, '_')}.${extension}`;
}

async function recordAccess(input: {
  db: any;
  report: any;
  adminId: string;
  mode: ReportAccessMode;
  artefact: ReportAccessArtefact;
  success: boolean;
  reason?: ReportAccessReason;
  technicalReference: string;
}) {
  const eventType = input.mode === 'preview' ? 'report_preview_accessed' : 'report_downloaded';
  const metadata = {
    report_id: input.report.id,
    technical_reference: input.technicalReference,
    success: input.success,
    artefact_type: input.artefact === 'register' ? 'supporting_register' : 'pdf',
    error_category: input.reason ?? null,
    signed_url_ttl_seconds: input.success ? ACCESS_TTL_SECONDS : null
  };
  const results = await Promise.all([
    input.db.from('report_events').insert({
      report_id: input.report.id,
      event_type: input.success ? eventType : `${input.mode}_failed`,
      actor_user_id: input.adminId,
      note: input.success ? `Short-lived ${input.mode} access issued.` : `Report ${input.mode} failed: ${input.reason}.`,
      metadata_json: metadata
    }),
    input.db.from('order_events').insert({
      order_id: input.report.order_id,
      event_type: input.success ? eventType : `${input.mode}_failed`,
      actor_admin_user_id: input.adminId,
      note: input.success ? `Short-lived ${input.mode} access issued.` : `Report ${input.mode} failed: ${input.reason}.`,
      metadata_json: metadata
    }),
    input.db.from('audit_logs').insert({
      actor_type: 'admin',
      actor_user_id: input.adminId,
      assessment_id: input.report.assessment_id,
      entity_table: 'reports',
      entity_id: input.report.id,
      action: input.success ? eventType : `${input.mode}_failed`,
      after_json: metadata
    })
  ]);
  const auditError = results.find((result: any) => result.error)?.error;
  if (auditError) {
    console.error('phase1_report_access_audit', {
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
        'Secure access was verified but could not be audited, so no link was released.',
        500,
        input.technicalReference
      );
    }
  }
}

export async function createSecurePhase1ReportAccess(input: {
  reportId: string;
  orderReference: string;
  adminId: string;
  mode: ReportAccessMode;
  artefact?: ReportAccessArtefact;
}) {
  const technicalReference = crypto.randomUUID();
  const requestedArtefact: ReportAccessArtefact = input.artefact ?? 'pdf';
  const db = createSupabaseServiceClient() as any;
  const capability = await getPhase1SchemaCapability(db);
  if (capability.status !== 'available') {
    throw new ReportAccessError('phase1_schema_unavailable', capability.message!, 503, technicalReference);
  }
  const { data: report, error } = await db.from('reports')
    .select('id,assessment_id,order_id,report_type,report_reference,version_number,status,storage_bucket,storage_path,checksum,file_name,mime_type,file_size_bytes,storage_status,orders!inner(order_reference)')
    .eq('id', input.reportId)
    .maybeSingle();
  if (error || !report) {
    throw new ReportAccessError('report_record_missing', 'The report record does not exist.', 404, technicalReference);
  }

  const linkedOrder = Array.isArray(report.orders) ? report.orders[0] : report.orders;
  if (!input.orderReference || linkedOrder?.order_reference !== input.orderReference) {
    await recordAccess({ db, report, adminId: input.adminId, mode: input.mode, artefact: requestedArtefact, success: false, reason: 'report_order_mismatch', technicalReference });
    throw new ReportAccessError('report_order_mismatch', 'The report does not belong to the requested order.', 409, technicalReference);
  }
  // H5: application-layer defense-in-depth -- status eligibility and currentness, mirroring
  // public.phase14_delivery_entitlement's rules exactly (see report-access-eligibility.ts). This
  // path has no separate SQL RPC of its own to fall back on for these two checks, so this is the
  // only enforcement of them; everything else in this function (order binding, storage
  // verification, checksum/magic-byte integrity) remains as the existing, independent enforcement
  // it always was.
  // Deliberately scoped to only status/currentness reasons here -- storage-metadata problems are
  // left to the pre-existing, more precisely-labelled checks immediately below, which already had
  // their own tests and error reasons before this change; duplicating that classification here
  // would only produce a worse-labelled error for an already-handled case.
  const STATUS_OR_CURRENTNESS_REASONS = new Set([
    'report_status_ineligible', 'report_status_forbidden_for_purpose', 'report_not_current_version'
  ]);
  try {
    const currentReportId = await resolveCurrentReportId(db, report.assessment_id, report.report_type);
    assertReportAccessEligible({
      report: {
        id: report.id, order_id: report.order_id, report_type: report.report_type,
        status: report.status, version_number: report.version_number,
        storage_bucket: report.storage_bucket, storage_path: report.storage_path, checksum: report.checksum
      },
      currentReportId,
      purpose: 'admin_download'
    });
  } catch (eligibilityError) {
    if (eligibilityError instanceof ReportAccessEligibilityError && STATUS_OR_CURRENTNESS_REASONS.has(eligibilityError.reason)) {
      const reason: ReportAccessReason = eligibilityError.reason === 'report_not_current_version'
        ? 'report_not_current_version' : 'report_status_ineligible';
      await recordAccess({ db, report, adminId: input.adminId, mode: input.mode, artefact: requestedArtefact, success: false, reason, technicalReference });
      throw new ReportAccessError(reason, eligibilityError.message, 409, technicalReference);
    }
    if (!(eligibilityError instanceof ReportAccessEligibilityError)) throw eligibilityError;
    // Any other eligibility reason (storage metadata, order/organisation mismatch -- neither of
    // which this call site even triggers, since order was already independently verified above
    // and no expectedOrganisationId is passed) falls through to the existing storage/order checks
    // below, which classify and record it with their own established, tested reasons.
  }
  if (!report.storage_bucket || !report.storage_path || !report.checksum || ['MISSING', 'FAILED'].includes(report.storage_status)) {
    await recordAccess({ db, report, adminId: input.adminId, mode: input.mode, artefact: requestedArtefact, success: false, reason: 'storage_path_mismatch', technicalReference });
    throw new ReportAccessError('storage_path_mismatch', 'The report record does not contain verified private storage metadata.', 409, technicalReference);
  }
  const expectedPrefix = `${report.order_id}/`;
  if (!String(report.storage_path).includes(expectedPrefix) || !String(report.storage_path).endsWith('.pdf')) {
    await recordAccess({ db, report, adminId: input.adminId, mode: input.mode, artefact: requestedArtefact, success: false, reason: 'storage_path_mismatch', technicalReference });
    throw new ReportAccessError('storage_path_mismatch', 'The stored path does not match the report record.', 409, technicalReference);
  }

  const { data: object, error: objectError } = await db.storage.from(report.storage_bucket).download(report.storage_path);
  if (objectError || !object) {
    const { error: stateError } = await db.from('reports').update({ storage_status: 'MISSING' }).eq('id', report.id);
    if (stateError) console.error('phase1_report_storage_state', { technicalReference, reportId: report.id, state: 'MISSING', errorCategory: 'state_update_failed' });
    await recordAccess({ db, report, adminId: input.adminId, mode: input.mode, artefact: requestedArtefact, success: false, reason: 'stored_file_missing', technicalReference });
    throw new ReportAccessError('stored_file_missing', 'The report record exists, but the stored PDF is missing.', 404, technicalReference);
  }
  const bytes = Buffer.from(await object.arrayBuffer());
  const checksum = crypto.createHash('sha256').update(bytes).digest('hex');
  if (!bytes.length || bytes.subarray(0, 4).toString('ascii') !== '%PDF'
    || (object.type && object.type !== 'application/pdf')
    || checksum !== report.checksum || (report.file_size_bytes && bytes.length !== Number(report.file_size_bytes))) {
    const { error: stateError } = await db.from('reports').update({ storage_status: 'FAILED' }).eq('id', report.id);
    if (stateError) console.error('phase1_report_storage_state', { technicalReference, reportId: report.id, state: 'FAILED', errorCategory: 'state_update_failed' });
    await recordAccess({ db, report, adminId: input.adminId, mode: input.mode, artefact: requestedArtefact, success: false, reason: 'integrity_failed', technicalReference });
    throw new ReportAccessError('integrity_failed', 'The stored PDF failed its integrity check.', 409, technicalReference);
  }
  if (report.storage_status !== 'VERIFIED') {
    const { error: verificationUpdateError } = await db.from('reports').update({
      storage_status: 'VERIFIED',
      storage_verified_at: new Date().toISOString(),
      file_size_bytes: bytes.length,
      mime_type: 'application/pdf',
      file_name: report.file_name || safeFileName(report.report_reference)
    }).eq('id', report.id);
    if (verificationUpdateError) {
      throw new ReportAccessError('storage_path_mismatch', 'The verified storage result could not be linked to the report record.', 500, technicalReference);
    }
  }

  let servedStorageBucket = report.storage_bucket;
  let servedStoragePath = report.storage_path;
  let servedFileName = report.file_name || safeFileName(report.report_reference);

  if (requestedArtefact === 'register') {
    const { data: artefact, error: artefactError } = await db
      .from('report_artifacts')
      .select('report_id,storage_bucket,storage_path,checksum_sha256,file_size_bytes,storage_status,release_state,artefact_type,file_name,mime_type,artifact_version')
      .eq('report_id', report.id)
      .eq('artefact_type', 'supporting_register')
      .eq('artifact_version', report.version_number)
      .in('storage_status', ['VERIFIED'])
      .in('release_state', ['verified', 'released'])
      .maybeSingle();
    const expectedRegisterPrefix = `/${report.order_id}/v${report.version_number}/`;
    if (artefactError || !artefact || artefact.report_id !== report.id
      || artefact.storage_status !== 'VERIFIED'
      || !['verified', 'released'].includes(String(artefact.release_state))
      || artefact.artefact_type !== 'supporting_register'
      || artefact.mime_type !== REGISTER_MIME
      || !artefact.storage_bucket || !artefact.storage_path
      || !String(artefact.storage_path).includes(expectedRegisterPrefix)
      || !String(artefact.storage_path).endsWith('.xlsx')
      || !artefact.checksum_sha256 || !/^[0-9a-f]{64}$/.test(artefact.checksum_sha256)
      || Number(artefact.file_size_bytes) <= 0
      || Number(artefact.artifact_version) !== Number(report.version_number)) {
      await recordAccess({ db, report, adminId: input.adminId, mode: input.mode, artefact: requestedArtefact, success: false, reason: 'storage_path_mismatch', technicalReference });
      throw new ReportAccessError('storage_path_mismatch', 'The supporting register has no verified private storage metadata.', 409, technicalReference);
    }
    const { data: registerObject, error: registerError } = await db.storage.from(artefact.storage_bucket).download(artefact.storage_path);
    if (registerError || !registerObject) {
      await recordAccess({ db, report, adminId: input.adminId, mode: input.mode, artefact: requestedArtefact, success: false, reason: 'stored_file_missing', technicalReference });
      throw new ReportAccessError('stored_file_missing', 'The supporting register file is missing.', 404, technicalReference);
    }
    const registerBytes = Buffer.from(await registerObject.arrayBuffer());
    const registerChecksum = crypto.createHash('sha256').update(registerBytes).digest('hex');
    if (registerBytes.length < 2 || registerBytes.subarray(0, 2).toString('ascii') !== 'PK'
      || (registerObject.type && registerObject.type !== REGISTER_MIME)
      || registerChecksum !== artefact.checksum_sha256
      || registerBytes.length !== Number(artefact.file_size_bytes)) {
      await recordAccess({ db, report, adminId: input.adminId, mode: input.mode, artefact: requestedArtefact, success: false, reason: 'integrity_failed', technicalReference });
      throw new ReportAccessError('integrity_failed', 'The supporting register failed its integrity check.', 409, technicalReference);
    }
    servedStorageBucket = artefact.storage_bucket;
    servedStoragePath = artefact.storage_path;
    servedFileName = artefact.file_name || `${report.report_reference}-action-register.xlsx`;
  }

  const options = input.mode === 'download'
    ? requestedArtefact === 'pdf'
      ? { download: report.file_name || safeFileName(report.report_reference) }
      : { download: servedFileName }
    : undefined;
  const { data: signed, error: signError } = await db.storage
    .from(servedStorageBucket)
    .createSignedUrl(servedStoragePath, ACCESS_TTL_SECONDS, options);
  if (signError || !signed?.signedUrl) {
    await recordAccess({ db, report, adminId: input.adminId, mode: input.mode, artefact: requestedArtefact, success: false, reason: 'signed_link_creation_failed', technicalReference });
    throw new ReportAccessError('signed_link_creation_failed', 'A secure report link could not be created.', 500, technicalReference);
  }

  await recordAccess({ db, report, adminId: input.adminId, mode: input.mode, artefact: requestedArtefact, success: true, technicalReference });
  console.info('phase1_report_access', {
    technicalReference,
    reportId: report.id,
    orderId: report.order_id,
    mode: input.mode,
    status: 'issued',
    expiresInSeconds: ACCESS_TTL_SECONDS
  });
  return {
    url: signed.signedUrl,
    expiresInSeconds: ACCESS_TTL_SECONDS,
    reportReference: report.report_reference,
    technicalReference,
    artefact: requestedArtefact
  };
}
