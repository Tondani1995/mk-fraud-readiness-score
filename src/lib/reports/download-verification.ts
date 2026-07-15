import crypto from 'node:crypto';

const MAX_REPORT_DOWNLOAD_BYTES = 25 * 1024 * 1024;

export type VerifiedDownloadEntitlement = {
  report_id: string;
  report_reference: string;
  report_checksum: string;
  storage_bucket: string;
  storage_path: string;
  assessment_id: string;
  order_id: string;
};

async function alert(
  db: any,
  reportId: string,
  category: string,
  detail: Record<string, unknown>
) {
  await db.rpc('record_phase14_operational_alert', {
    p_alert_key: `${category}:${reportId}:${String(detail.expectedChecksum ?? 'unknown')}`,
    p_severity: 'critical', p_category: category, p_report_id: reportId,
    p_email_event_id: null, p_detail_json: detail
  }).catch(() => null);
}

export async function readVerifiedReportObject(db: any, entitlement: VerifiedDownloadEntitlement) {
  const { data: object, error } = await db.storage
    .from(entitlement.storage_bucket)
    .download(entitlement.storage_path);
  if (error || !object) {
    await alert(db, entitlement.report_id, 'report_download_object_missing', {
      bucket: entitlement.storage_bucket,
      path: entitlement.storage_path,
      expectedChecksum: entitlement.report_checksum,
      error: error?.message ?? 'object_missing'
    });
    throw new Error('The authorised report object is missing.');
  }
  const bytes = Buffer.from(await object.arrayBuffer());
  if (!bytes.length || bytes.length > MAX_REPORT_DOWNLOAD_BYTES) {
    await alert(db, entitlement.report_id, 'report_download_object_size_invalid', {
      sizeBytes: bytes.length,
      expectedChecksum: entitlement.report_checksum
    });
    throw new Error('The authorised report object has an invalid size.');
  }
  const checksum = crypto.createHash('sha256').update(bytes).digest('hex');
  if (checksum !== entitlement.report_checksum) {
    await alert(db, entitlement.report_id, 'report_download_checksum_mismatch', {
      expectedChecksum: entitlement.report_checksum,
      actualChecksum: checksum,
      sizeBytes: bytes.length
    });
    throw new Error('The authorised report checksum does not match the stored object.');
  }
  return bytes;
}
