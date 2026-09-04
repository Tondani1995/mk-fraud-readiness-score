import crypto from 'node:crypto';

export const PRIVATE_REPORT_ACCESS_TTL_SECONDS = 60;

export type PrivateReportAccessMode = 'preview' | 'download';

export type PrivateReportAccessEvidenceInput = {
  db: any;
  report: any;
  adminId: string;
  mode: PrivateReportAccessMode;
  success: boolean;
  reason?: string | null;
  technicalReference: string;
  artefactType?: string | null;
};

export class PrivateReportStorageError extends Error {
  readonly reason: 'stored_file_missing' | 'integrity_failed';

  constructor(reason: 'stored_file_missing' | 'integrity_failed', message: string) {
    super(message);
    this.name = 'PrivateReportStorageError';
    this.reason = reason;
  }
}

export function safeReportFileName(value: string) {
  return `${value.replace(/[^A-Za-z0-9._-]/g, '_')}.pdf`;
}

/**
 * The one shared private-PDF readback primitive. Callers decide the binding prefix, but every
 * caller receives the same download, MIME, magic-byte, size and checksum verification.
 */
export async function readVerifiedPrivatePdf(
  db: any,
  report: any,
  expectedPathPrefix: string
) {
  if (!report.storage_bucket || !report.storage_path || !report.checksum
    || ['MISSING', 'FAILED'].includes(report.storage_status)) {
    throw new PrivateReportStorageError(
      'integrity_failed',
      'The report record does not contain verified private storage metadata.'
    );
  }
  if (!String(report.storage_path).startsWith(expectedPathPrefix)
    || String(report.storage_path).includes('..')
    || !String(report.storage_path).endsWith('.pdf')) {
    throw new PrivateReportStorageError(
      'integrity_failed',
      'The stored path does not match the report binding.'
    );
  }

  const { data: object, error: objectError } = await db.storage
    .from(report.storage_bucket)
    .download(report.storage_path);
  if (objectError || !object) {
    throw new PrivateReportStorageError(
      'stored_file_missing',
      'The report record exists, but the stored PDF is missing.'
    );
  }

  const bytes = Buffer.from(await object.arrayBuffer());
  const checksum = crypto.createHash('sha256').update(bytes).digest('hex');
  if (!bytes.length
    || bytes.subarray(0, 4).toString('ascii') !== '%PDF'
    || (object.type && object.type !== 'application/pdf')
    || checksum !== report.checksum
    || (report.file_size_bytes && bytes.length !== Number(report.file_size_bytes))) {
    throw new PrivateReportStorageError(
      'integrity_failed',
      'The stored PDF failed its integrity check.'
    );
  }

  return { bytes, fileSizeBytes: bytes.length, checksum };
}

export async function issuePrivateReportSignedUrl(
  db: any,
  report: any,
  mode: PrivateReportAccessMode
) {
  const options = mode === 'download'
    ? { download: report.file_name || safeReportFileName(report.report_reference) }
    : undefined;
  const { data: signed, error } = await db.storage
    .from(report.storage_bucket)
    .createSignedUrl(report.storage_path, PRIVATE_REPORT_ACCESS_TTL_SECONDS, options);
  if (error || !signed?.signedUrl) return null;
  return signed.signedUrl as string;
}

/**
 * Shared access evidence. Order events are intentionally conditional: assessment-only reports
 * must never manufacture an order event just to satisfy a legacy audit shape.
 */
export async function recordPrivateReportAccessEvidence(input: PrivateReportAccessEvidenceInput) {
  const eventType = input.mode === 'preview' ? 'report_preview_accessed' : 'report_downloaded';
  const metadata = {
    report_id: input.report.id,
    artefact_type: input.artefactType ?? 'pdf',
    technical_reference: input.technicalReference,
    success: input.success,
    error_category: input.reason ?? null,
    signed_url_ttl_seconds: input.success ? PRIVATE_REPORT_ACCESS_TTL_SECONDS : null
  };
  const writes = [
    input.db.from('report_events').insert({
      report_id: input.report.id,
      event_type: input.success ? eventType : `${input.mode}_failed`,
      actor_user_id: input.adminId,
      note: input.success
        ? `Short-lived ${input.mode} access issued for ${input.artefactType ?? 'PDF'}.`
        : `${input.artefactType ?? 'Report'} ${input.mode} failed: ${input.reason}.`,
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
  ];
  if (input.report.order_id) {
    writes.push(input.db.from('order_events').insert({
      order_id: input.report.order_id,
      event_type: input.success ? eventType : `${input.mode}_failed`,
      actor_admin_user_id: input.adminId,
      note: input.success
        ? `Short-lived ${input.mode} access issued for ${input.artefactType ?? 'PDF'}.`
        : `${input.artefactType ?? 'Report'} ${input.mode} failed: ${input.reason}.`,
      metadata_json: metadata
    }));
  }
  const results = await Promise.all(writes);
  return results.find((result: any) => result.error)?.error ?? null;
}
