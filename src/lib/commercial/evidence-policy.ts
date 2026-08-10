/**
 * Client evidence intake policy for Comprehensive engagements.
 *
 * Two rules drive everything here:
 *   1. Nothing executable is ever trusted. The allowlist is explicit and closed - an unknown or
 *      absent content type is rejected rather than sniffed, guessed or defaulted.
 *   2. Evidence is never public. Objects live in a private bucket, are addressed only through paths
 *      derived server-side, and are never returned as a public object URL.
 *
 * RETENTION: the retention/erasure seam is deliberately configuration only. No retention period is
 * asserted here because no retention policy has been approved. `EVIDENCE_RETENTION_POLICY_KEY` and
 * the `retention_policy_key` column exist so an approved policy can be attached later without a
 * schema change; until then evidence carries the 'unset' key and no automatic deletion runs.
 */

export const COMPREHENSIVE_EVIDENCE_BUCKET = 'comprehensive-evidence' as const;

/** 25 MB. Matches the bucket's file_size_limit in the migration; both must move together. */
export const EVIDENCE_MAX_BYTES = 26_214_400;

export const EVIDENCE_ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/csv',
  'text/plain',
  'image/png',
  'image/jpeg'
] as const;

export type EvidenceMimeType = (typeof EVIDENCE_ALLOWED_MIME_TYPES)[number];

/** Policy key placeholder. No approved retention period is encoded anywhere in this lane. */
export const EVIDENCE_RETENTION_POLICY_KEY = 'unset' as const;

export const EVIDENCE_VALIDATION_STATUSES = [
  'not_requested',
  'requested',
  'received',
  'reviewed',
  'supported',
  'not_supported',
  'insufficient',
  'not_applicable'
] as const;

export type EvidenceValidationStatus = (typeof EVIDENCE_VALIDATION_STATUSES)[number];

/**
 * Statuses that represent a reviewer having actually reached a decision about the item. `received`
 * and `requested` are intake facts, not review outcomes, so they do not count.
 */
export const EVIDENCE_DECIDED_STATUSES: readonly EvidenceValidationStatus[] = [
  'reviewed',
  'supported',
  'not_supported',
  'insufficient',
  'not_applicable'
];

export function isEvidenceValidationStatus(value: unknown): value is EvidenceValidationStatus {
  return typeof value === 'string' && (EVIDENCE_VALIDATION_STATUSES as readonly string[]).includes(value);
}

export function isEvidenceDecided(status: EvidenceValidationStatus): boolean {
  return EVIDENCE_DECIDED_STATUSES.includes(status);
}

export type EvidenceRejectionReason =
  | 'filename_required'
  | 'content_type_not_allowed'
  | 'size_missing'
  | 'size_exceeded'
  | 'empty_file';

export type EvidenceAcceptance =
  | { accepted: true; filename: string; contentType: EvidenceMimeType; sizeBytes: number }
  | { accepted: false; reason: EvidenceRejectionReason; message: string };

/**
 * Strips any path component and anything that is not a conservative filename character. The stored
 * object path never uses this value directly - it is metadata only - but a filename that survives
 * into an email or a download header must not be able to carry traversal or markup.
 */
export function sanitiseEvidenceFilename(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const base = value.split(/[\\/]/).pop() ?? '';
  const cleaned = base.replace(/[^A-Za-z0-9._ -]/g, '').replace(/\s+/g, ' ').trim().slice(0, 180);
  if (!cleaned || cleaned === '.' || cleaned === '..') return null;
  return cleaned;
}

export function evaluateEvidenceUpload(input: {
  filename: unknown;
  contentType: unknown;
  sizeBytes: unknown;
}): EvidenceAcceptance {
  const filename = sanitiseEvidenceFilename(input.filename);
  if (!filename) {
    return { accepted: false, reason: 'filename_required', message: 'A valid evidence filename is required.' };
  }

  const contentType = typeof input.contentType === 'string' ? input.contentType.split(';')[0].trim().toLowerCase() : '';
  if (!(EVIDENCE_ALLOWED_MIME_TYPES as readonly string[]).includes(contentType)) {
    return {
      accepted: false,
      reason: 'content_type_not_allowed',
      message: 'Evidence must be a PDF, Word, Excel, PowerPoint, CSV, plain-text, PNG or JPEG file.'
    };
  }

  if (typeof input.sizeBytes !== 'number' || !Number.isSafeInteger(input.sizeBytes)) {
    return { accepted: false, reason: 'size_missing', message: 'A valid evidence file size is required.' };
  }
  if (input.sizeBytes <= 0) {
    return { accepted: false, reason: 'empty_file', message: 'Empty evidence files are not accepted.' };
  }
  if (input.sizeBytes > EVIDENCE_MAX_BYTES) {
    return {
      accepted: false,
      reason: 'size_exceeded',
      message: `Evidence files must be ${Math.floor(EVIDENCE_MAX_BYTES / 1_048_576)} MB or smaller.`
    };
  }

  return { accepted: true, filename, contentType: contentType as EvidenceMimeType, sizeBytes: input.sizeBytes };
}

/**
 * Server-derived storage path. Deterministic in the identifiers, opaque in the filename, and never
 * built from client-supplied path segments.
 */
export function evidenceStoragePath(input: {
  organisationId: string;
  orderReference: string;
  evidenceId: string;
  filename: string;
}): string {
  const safeReference = input.orderReference.replace(/[^A-Za-z0-9-]/g, '');
  const extension = input.filename.includes('.') ? `.${input.filename.split('.').pop()!.toLowerCase().replace(/[^a-z0-9]/g, '')}` : '';
  return `${input.organisationId}/${safeReference}/${input.evidenceId}${extension}`;
}
