import crypto from 'node:crypto';
import { classifySupabaseStorageResult, type Phase14StorageResultClass } from './storage-error-classifier';

export type StoragePublicationInput = {
  db: any;
  bucket: string;
  temporaryPath: string;
  finalPath: string;
  checksum: string;
  publishReport: () => Promise<any>;
  cleanupJobId: string;
  recordCleanupResult: (input: {
    deletionRequested: boolean;
    deleteApiAccepted: boolean;
    providerResultClass: Phase14StorageResultClass;
    error?: string | null;
  }) => Promise<unknown>;
};

export async function uploadTemporaryReportObject(input: {
  db: any;
  bucket: string;
  path: string;
  bytes: Buffer;
  checksum: string;
  reportReference: string;
  claimToken: string;
}) {
  const { error } = await input.db.storage.from(input.bucket).upload(input.path, input.bytes, {
    contentType: 'application/pdf',
    upsert: false,
    metadata: {
      sha256: input.checksum,
      reportReference: input.reportReference,
      claimToken: input.claimToken
    }
  });
  if (error) throw new Error(`Temporary storage upload failed: ${error.message}`);
}

export async function verifyStoredReportChecksum(
  db: any,
  bucket: string,
  path: string,
  expected: string
) {
  const { data, error } = await db.storage.from(bucket).download(path);
  if (error || !data) {
    throw new Error(`Stored report verification failed: ${error?.message ?? 'object missing'}`);
  }
  const bytes = Buffer.from(await data.arrayBuffer());
  const actual = crypto.createHash('sha256').update(bytes).digest('hex');
  if (actual !== expected) {
    throw new Error(`Stored report checksum mismatch: expected ${expected}, received ${actual}.`);
  }
}

export async function publishCommittedReportObject(input: StoragePublicationInput) {
  const { error: copyError } = await input.db.storage
    .from(input.bucket)
    .copy(input.temporaryPath, input.finalPath);
  if (copyError && !/already exists|duplicate/i.test(copyError.message)) {
    // A prior terminal attempt may have copied and verified the final object
    // before losing its database response.  Recovery may proceed from that
    // immutable object even when the temporary source has already gone.
    try {
      await verifyStoredReportChecksum(input.db, input.bucket, input.finalPath, input.checksum);
    } catch {
      throw new Error(`Final immutable storage publication failed: ${copyError.message}`);
    }
  }

  await verifyStoredReportChecksum(input.db, input.bucket, input.finalPath, input.checksum);
  let cleanupFailed = false;
  let deletionRequested = false;
  let deleteApiAccepted = false;
  let providerResultClass: Phase14StorageResultClass = 'unknown_provider_error';
  try {
    deletionRequested = true;
    const { error: cleanupError } = await input.db.storage
      .from(input.bucket)
      .remove([input.temporaryPath]);
    if (cleanupError) {
      providerResultClass = classifySupabaseStorageResult(cleanupError);
      throw cleanupError;
    }
    deleteApiAccepted = true;
    const { data: afterDelete, error: verificationError } = await input.db.storage
      .from(input.bucket)
      .download(input.temporaryPath);
    providerResultClass = verificationError
      ? classifySupabaseStorageResult(verificationError)
      : afterDelete
        ? 'object_present'
        : 'malformed_response';
    if (providerResultClass !== 'object_not_found') {
      throw new Error('Temporary report object absence was not explicitly verified.');
    }
    await input.recordCleanupResult({
      deletionRequested,
      deleteApiAccepted,
      providerResultClass
    });
  } catch (error) {
    cleanupFailed = true;
    await input.recordCleanupResult({
      deletionRequested,
      deleteApiAccepted,
      providerResultClass,
      error: error instanceof Error ? error.message : String(error)
    });
  }
  const published = await input.publishReport();
  if (!published) throw new Error('Report publication returned no result.');
  return { published, cleanupFailed };
}
