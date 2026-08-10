import { randomUUID } from 'node:crypto';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

const REPORT_BUCKET = 'comprehensive-reports' as const;

const MIME_EXTENSION: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx'
};

export type ComprehensiveArtifactUpload = {
  engagementId: string;
  reportId: string;
  artefactType: 'supporting_register' | 'board_readout' | 'executive_presentation' | 'workshop_material';
  fileName: string;
  mimeType: keyof typeof MIME_EXTENSION;
  bytes: Uint8Array;
  artifactVersion?: number;
};

function service() {
  return createSupabaseServiceClient() as any;
}

/**
 * Uploads one reviewer-approved artifact to the private bucket, then commits only its immutable
 * metadata through the security-definer RPC. No public URL, signed URL, storage credential or raw
 * storage path is returned to the caller. A failed metadata commit compensates the exact object.
 */
export async function completeComprehensiveArtifact(input: ComprehensiveArtifactUpload) {
  const extension = MIME_EXTENSION[input.mimeType];
  if (!extension) throw new Error('Unsupported Comprehensive artifact MIME type.');
  if (!input.bytes.length) throw new Error('Comprehensive artifact bytes are empty.');
  const version = input.artifactVersion ?? 1;
  const path = `${input.engagementId}/v${version}/${randomUUID()}.${extension}`;
  const db = service();
  const checksum = await sha256(input.bytes);
  const { error: uploadError } = await db.storage.from(REPORT_BUCKET).upload(path, input.bytes, {
    contentType: input.mimeType,
    upsert: false
  });
  if (uploadError) throw new Error(`Comprehensive artifact upload failed: ${uploadError.message}`);
  try {
    const { data, error } = await db.rpc('complete_comprehensive_artifact', {
      p_engagement_id: input.engagementId,
      p_report_id: input.reportId,
      p_artefact_type: input.artefactType,
      p_storage_bucket: REPORT_BUCKET,
      p_storage_path: path,
      p_file_name: input.fileName,
      p_mime_type: input.mimeType,
      p_file_size_bytes: input.bytes.byteLength,
      p_checksum_sha256: checksum,
      p_artifact_version: version
    });
    if (error || !data?.ok) throw new Error(error?.message ?? 'Comprehensive artifact metadata commit failed.');
    return { artifactId: data.artifact_id as string, artifactVersion: Number(data.artifact_version), storageStatus: 'VERIFIED' as const };
  } catch (error) {
    const { error: cleanupError } = await db.storage.from(REPORT_BUCKET).remove([path]);
    if (cleanupError) console.error('comprehensive_artifact_cleanup_failed', { engagementId: input.engagementId, artifactType: input.artefactType });
    throw error;
  }
}

export async function finaliseComprehensiveArtifactSet(input: { engagementId: string; reportId: string; artifactVersion?: number; actorAdminUserId: string }) {
  const { data, error } = await service().rpc('finalise_comprehensive_artifact_set', {
    p_engagement_id: input.engagementId,
    p_report_id: input.reportId,
    p_artifact_version: input.artifactVersion ?? 1,
    p_actor_admin_user_id: input.actorAdminUserId
  });
  if (error || !data?.ok) throw new Error(error?.message ?? 'Comprehensive artifact set finalisation failed.');
  return { engagementId: data.engagement_id as string, reportId: data.report_id as string, artifactVersion: Number(data.artifact_version) };
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const crypto = await import('node:crypto');
  return crypto.createHash('sha256').update(bytes).digest('hex');
}
