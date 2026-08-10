export const COMPREHENSIVE_REPORT_BUCKET = 'comprehensive-reports' as const;
export const COMPREHENSIVE_PACKAGE_ARTIFACT_TYPES = ['supporting_register', 'board_readout', 'executive_presentation', 'workshop_material'] as const;
export type ComprehensivePackageArtifactType = (typeof COMPREHENSIVE_PACKAGE_ARTIFACT_TYPES)[number];

export type AtomicPackageUpload = {
  objectId: string;
  artefactType: ComprehensivePackageArtifactType;
  fileName: string;
  mimeType: string;
  bytes: Uint8Array;
  checksum: string;
  path: string;
};

export type AtomicPackagePrimary = {
  fileName: string;
  mimeType: 'application/pdf';
  bytes: Uint8Array;
  checksum: string;
  path: string;
};

type PackageDb = {
  storage: { from(bucket: string): { upload(path: string, bytes: Uint8Array, options: { contentType: string; upsert: false }): Promise<{ error?: { message?: string } | null }>; remove(paths: string[]): Promise<{ error?: { message?: string } | null }> } };
  rpc(name: string, args: Record<string, unknown>): Promise<{ data?: { ok?: boolean; report_id?: string; artifact_version?: number; secondary_count?: number } | null; error?: { message?: string } | null }>;
};

export type AtomicPackageInput = {
  db: PackageDb;
  engagementId: string;
  reportId: string;
  artifactVersion: number;
  templateId: string | null;
  primary: AtomicPackagePrimary;
  uploads: AtomicPackageUpload[];
  generatedBy: string;
};

function safeAlertDetail(input: AtomicPackageInput, paths: string[], cleanupError: string) {
  return {
    bucket: COMPREHENSIVE_REPORT_BUCKET,
    engagement_id: input.engagementId,
    report_id: input.reportId,
    artifact_version: input.artifactVersion,
    storage_paths: paths,
    reason: 'comprehensive_package_registration_failed_and_object_cleanup_failed',
    cleanup_error: cleanupError
  };
}

async function cleanupUploadedObjects(input: AtomicPackageInput, paths: string[]) {
  if (!paths.length) return null;
  try {
    const result = await input.db.storage.from(COMPREHENSIVE_REPORT_BUCKET).remove(paths);
    return result.error?.message ?? null;
  } catch (error) {
    return error instanceof Error ? error.message : 'comprehensive_package_object_cleanup_failed';
  }
}

async function raiseCleanupAlert(input: AtomicPackageInput, paths: string[], cleanupError: string) {
  try {
    await input.db.rpc('record_phase14_operational_alert', {
      p_alert_key: `comprehensive_package_orphan:${input.engagementId}:${input.reportId}:v${input.artifactVersion}`,
      p_category: 'comprehensive_package_orphan_object',
      p_report_id: input.reportId,
      p_severity: 'warning',
      p_detail_json: safeAlertDetail(input, paths, cleanupError)
    });
  } catch (error) {
    console.error('comprehensive_package_cleanup_alert_failed', {
      engagementId: input.engagementId,
      reportId: input.reportId,
      artifactVersion: input.artifactVersion,
      message: error instanceof Error ? error.message : 'unknown'
    });
  }
}

/**
 * Uploads all five immutable objects before invoking one atomic package RPC. The DB RPC is the
 * only metadata boundary: if it fails, no report or artifact row is allowed to survive. The
 * cleanup alert contains only safe engagement/report/version/path identifiers.
 */
export async function registerComprehensivePackageAtomically(input: AtomicPackageInput) {
  if (input.uploads.length !== 4 || new Set(input.uploads.map((upload) => upload.artefactType)).size !== 4) {
    throw new Error('comprehensive_package_requires_exactly_four_secondary_artifacts');
  }
  const uploadedPaths: string[] = [];
  try {
    const primaryResult = await input.db.storage.from(COMPREHENSIVE_REPORT_BUCKET).upload(input.primary.path, input.primary.bytes, { contentType: input.primary.mimeType, upsert: false });
    if (primaryResult.error) throw new Error(`comprehensive_generation_storage_upload_failed:${primaryResult.error.message ?? 'unknown'}`);
    uploadedPaths.push(input.primary.path);
    for (const upload of input.uploads) {
      const result = await input.db.storage.from(COMPREHENSIVE_REPORT_BUCKET).upload(upload.path, upload.bytes, { contentType: upload.mimeType, upsert: false });
      if (result.error) throw new Error(`comprehensive_generation_storage_upload_failed:${result.error.message ?? 'unknown'}`);
      uploadedPaths.push(upload.path);
    }
    const { data, error } = await input.db.rpc('complete_comprehensive_package', {
      p_engagement_id: input.engagementId,
      p_report_id: input.reportId,
      p_template_id: input.templateId,
      p_artifact_version: input.artifactVersion,
      p_primary: {
        storage_bucket: COMPREHENSIVE_REPORT_BUCKET,
        storage_path: input.primary.path,
        file_name: input.primary.fileName,
        mime_type: input.primary.mimeType,
        file_size_bytes: input.primary.bytes.byteLength,
        checksum: input.primary.checksum
      },
      p_secondary: input.uploads.map((upload) => ({
        object_id: upload.objectId,
        artefact_type: upload.artefactType,
        storage_bucket: COMPREHENSIVE_REPORT_BUCKET,
        storage_path: upload.path,
        file_name: upload.fileName,
        mime_type: upload.mimeType,
        file_size_bytes: upload.bytes.byteLength,
        checksum: upload.checksum
      })),
      p_generated_by: input.generatedBy
    });
    if (error || !data?.ok || data.secondary_count !== 4) throw new Error(error?.message ?? 'Comprehensive package metadata registration failed.');
    return { reportId: data.report_id ?? input.reportId, artifactVersion: Number(data.artifact_version ?? input.artifactVersion), uploadedPaths };
  } catch (error) {
    const cleanupError = await cleanupUploadedObjects(input, uploadedPaths);
    if (cleanupError) await raiseCleanupAlert(input, uploadedPaths, cleanupError);
    throw error;
  }
}
