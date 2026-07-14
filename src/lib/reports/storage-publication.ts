import crypto from 'node:crypto';

export type StoragePublicationInput = {
  db: any;
  privilegedDb: any;
  bucket: string;
  temporaryPath: string;
  finalPath: string;
  checksum: string;
  claimToken: string;
  reportId: string;
  onCleanupFailure?: (error: unknown) => Promise<void> | void;
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
    throw new Error(`Final immutable storage publication failed: ${copyError.message}`);
  }

  await verifyStoredReportChecksum(input.db, input.bucket, input.finalPath, input.checksum);
  const { data: published, error: publishError } = await input.privilegedDb.rpc(
    'publish_premium_report_generation',
    { p_claim_token: input.claimToken, p_report_id: input.reportId }
  );
  if (publishError || !published) {
    throw publishError ?? new Error('Report publication returned no result.');
  }

  let cleanupFailed = false;
  try {
    const { error: cleanupError } = await input.db.storage
      .from(input.bucket)
      .remove([input.temporaryPath]);
    if (cleanupError) throw cleanupError;
  } catch (error) {
    cleanupFailed = true;
    await input.onCleanupFailure?.(error);
  }
  return { published, cleanupFailed };
}
