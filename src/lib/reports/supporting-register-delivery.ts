import type { AssembledReportData } from './types';
import type { AdvisoryEvidenceModel } from './evidence-model';
import type { EssentialProjection } from './essential-projection';
import {
  SUPPORTING_REGISTER_ARTEFACT_TYPE,
  buildSupportingRegisterWorkbook
} from './supporting-register-workbook';

/**
 * min-M8 -- supporting-register persistence.
 *
 * L1 -> workbook bytes -> SHA-256 + size -> private upload -> stored-object verification ->
 * complete_report_secondary_artefact(). The PDF remains the existing `reports` row; this creates
 * no second report row and no second customer authority. Retrieval is authorised only through the
 * parent report's existing customer token (see customer-report-access.ts).
 */

export const SUPPORTING_REGISTER_UNAVAILABLE = 'supporting_register_capability_unavailable';

/**
 * Narrowly scoped pre-migration compatibility. `report_artifacts` and
 * complete_report_secondary_artefact() do not exist until the accepted migration is applied, so on
 * a Preview bound to the current Staging schema the optional register capability degrades and every
 * existing assessment/order/PDF/access path is untouched. Only these three exact PostgREST/Postgres
 * signals are treated as "capability absent" -- any other error propagates and fails closed.
 */
function isSecondaryArtefactSchemaAbsent(error: unknown): boolean {
  const candidate = error as { code?: string; message?: string } | null;
  if (!candidate) return false;
  // Absence is decided by the SQLSTATE / PostgREST code alone. Matching on the object name was too
  // broad: `42501 permission denied for table report_artifacts` names the object but is a privilege
  // failure, not absence, and must fail closed. Same for unique violations, connection faults and
  // any generic RPC failure that happens to mention the function.
  const code = String(candidate.code ?? '');
  if (code === '42P01') return true;   // undefined_table
  if (code === 'PGRST202') return true; // function not found in schema cache
  if (code === 'PGRST205') return true; // table not found in schema cache
  if (code) return false;
  // No code at all: accept only an explicit does-not-exist statement naming one of our objects.
  const message = String(candidate.message ?? '').toLowerCase();
  const namesOurObject = message.includes('report_artifacts')
    || message.includes('complete_report_secondary_artefact');
  const statesAbsence = message.includes('does not exist')
    || message.includes('could not find')
    || message.includes('schema cache');
  return namesOurObject && statesAbsence;
}

export interface SupportingRegisterPersistResult {
  status: 'persisted' | 'capability_unavailable';
  checksumSha256?: string;
  fileSizeBytes?: number;
  storagePath?: string;
  rowCounts?: Record<string, number>;
}

export interface StoredSupportingRegister {
  storagePath: string;
  fileName: string;
  mimeType: string;
  fileSizeBytes: number;
  checksumSha256: string;
  rowCounts: Record<string, number>;
}

/**
 * Build the register, publish it privately, and verify the STORED bytes -- without creating any
 * database row.
 *
 * The artefact row is created inside finalise_manual_report_with_supporting_register(), in the same
 * transaction as the report row. That ordering is the point: the previous design completed the
 * report first and persisted the register afterwards, so a register failure left a VERIFIED,
 * current report whose PDF the failure cleanup then deleted. Nothing here is customer-final; if the
 * caller fails before finalisation commits, this object is a safe orphan that may be cleaned.
 *
 * Workbook construction, the eight sheets, complete L1 coverage, formula neutralisation, name/XML
 * safety and actual-byte checksum integrity are unchanged -- this only separates persistence from
 * database binding.
 */
export async function buildAndStoreSupportingRegister(input: {
  db: any;
  data: AssembledReportData;
  model: AdvisoryEvidenceModel;
  projection: EssentialProjection;
  storageBucket: string;
  organisationId: string;
  orderId: string;
  versionNumber: number;
  verifyStoredObject: (
    db: any, bucket: string, path: string, checksum: string, size: number
  ) => Promise<void>;
}): Promise<StoredSupportingRegister> {
  const workbook = await buildSupportingRegisterWorkbook(input.data, input.model, input.projection);
  const storagePath = `${input.organisationId}/${input.orderId}/v${input.versionNumber}/`
    + `${workbook.fileName.replace(/[^A-Za-z0-9._-]/g, '_')}`;

  const { error: uploadError } = await input.db.storage
    .from(input.storageBucket)
    .upload(storagePath, workbook.bytes, {
      contentType: workbook.mimeType,
      upsert: false,
      metadata: { sha256: workbook.checksumSha256 }
    });
  if (uploadError) throw new Error('supporting_register_upload_failed');

  // Same verification the PDF gets: re-download and re-check checksum and size against the stored
  // object, never against the in-memory bytes that produced it.
  await input.verifyStoredObject(
    input.db, input.storageBucket, storagePath, workbook.checksumSha256, workbook.bytes.length
  );

  return {
    storagePath,
    fileName: workbook.fileName,
    mimeType: workbook.mimeType,
    fileSizeBytes: workbook.bytes.length,
    checksumSha256: workbook.checksumSha256,
    rowCounts: workbook.rowCounts
  };
}

export async function generateAndPersistSupportingRegister(input: {
  db: any;
  data: AssembledReportData;
  model: AdvisoryEvidenceModel;
  projection: EssentialProjection;
  reportId: string;
  storageBucket: string;
  organisationId: string;
  orderId: string;
  versionNumber: number;
  verifyStoredObject: (
    db: any, bucket: string, path: string, checksum: string, size: number
  ) => Promise<void>;
}): Promise<SupportingRegisterPersistResult> {
  // Capability probe FIRST. The completion RPC used to be the only place absence was detected, but
  // it runs after the workbook has already been built and uploaded -- so on a schema without
  // report_artifacts (a Preview or a historical-schema replay) the upload was attempted anyway and
  // its failure propagated as a hard error, taking the whole report down with it. Nothing may touch
  // Storage until the artefact schema is known to exist. The probe deliberately uses the same
  // select/eq/maybeSingle shape the customer path already uses against this table, so it exercises
  // only the surface every caller and double already models.
  const { error: probeError } = await input.db
    .from('report_artifacts')
    .select('report_id')
    .eq('report_id', input.reportId)
    .maybeSingle();
  if (probeError && isSecondaryArtefactSchemaAbsent(probeError)) {
    return { status: 'capability_unavailable' };
  }
  if (probeError) throw new Error('supporting_register_persistence_failed');

  const workbook = await buildSupportingRegisterWorkbook(input.data, input.model, input.projection);
  const storagePath = `${input.organisationId}/${input.orderId}/v${input.versionNumber}/`
    + `${workbook.fileName.replace(/[^A-Za-z0-9._-]/g, '_')}`;

  const { error: uploadError } = await input.db.storage
    .from(input.storageBucket)
    .upload(storagePath, workbook.bytes, {
      contentType: workbook.mimeType,
      upsert: false,
      metadata: { sha256: workbook.checksumSha256, reportId: input.reportId }
    });
  if (uploadError) throw new Error('supporting_register_upload_failed');

  // Same verification routine the PDF uses: re-download and re-check checksum and size.
  await input.verifyStoredObject(
    input.db, input.storageBucket, storagePath, workbook.checksumSha256, workbook.bytes.length
  );

  const { error: rpcError } = await input.db.rpc('complete_report_secondary_artefact', {
    p_report_id: input.reportId,
    p_artefact_type: SUPPORTING_REGISTER_ARTEFACT_TYPE,
    p_storage_bucket: input.storageBucket,
    p_storage_path: storagePath,
    p_file_name: workbook.fileName,
    p_mime_type: workbook.mimeType,
    p_file_size_bytes: workbook.bytes.length,
    p_checksum_sha256: workbook.checksumSha256
  });
  if (rpcError) {
    if (isSecondaryArtefactSchemaAbsent(rpcError)) {
      return { status: 'capability_unavailable' };
    }
    throw new Error('supporting_register_persistence_failed');
  }

  return {
    status: 'persisted',
    checksumSha256: workbook.checksumSha256,
    fileSizeBytes: workbook.bytes.length,
    storagePath,
    rowCounts: workbook.rowCounts
  };
}

export const __testables = { isSecondaryArtefactSchemaAbsent };
