export const COMPREHENSIVE_REQUIRED_ARTIFACTS = [
  'main_report_pdf',
  'annotated_register_xlsx',
  'board_readout_pdf',
  'executive_presentation',
  'workshop_material'
] as const;

export type ComprehensiveRequiredArtifact = (typeof COMPREHENSIVE_REQUIRED_ARTIFACTS)[number];

export type ComprehensiveArtifactManifest = {
  kind: ComprehensiveRequiredArtifact;
  engagementId: string;
  reportId: string;
  version: number;
  contentType: string;
  sizeBytes: number;
  checksumSha256: string;
  storageStatus: 'PENDING' | 'VERIFIED' | 'MISSING' | 'FAILED';
  releaseState: 'verified' | 'released' | 'superseded';
};

const SHA256 = /^[0-9a-f]{64}$/;

export function validateComprehensiveArtifactManifest(manifest: ComprehensiveArtifactManifest[]): { version: number } {
  const byKind = new Map(manifest.map((artifact) => [artifact.kind, artifact]));
  for (const required of COMPREHENSIVE_REQUIRED_ARTIFACTS) {
    const artifact = byKind.get(required);
    if (!artifact) throw new Error(`Required Comprehensive artifact missing: ${required}.`);
    if (artifact.storageStatus !== 'VERIFIED' || !['verified', 'released'].includes(artifact.releaseState)) {
      throw new Error(`Required Comprehensive artifact is not verified: ${required}.`);
    }
    if (artifact.sizeBytes <= 0 || !SHA256.test(artifact.checksumSha256)) {
      throw new Error(`Required Comprehensive artifact failed integrity metadata validation: ${required}.`);
    }
    if (artifact.engagementId.trim() === '' || artifact.reportId.trim() === '') throw new Error(`Required Comprehensive artifact is not bound: ${required}.`);
  }
  const versions = new Set(manifest.map((artifact) => artifact.version));
  if (versions.size !== 1) throw new Error('Comprehensive artifacts must be released as one exact version set.');
  return { version: manifest[0].version };
}

export function assertComprehensiveCustomerDelivery(input: {
  entitlementTier: string;
  requestedTier: string;
  artifact: ComprehensiveArtifactManifest;
  authorizedReportId: string;
  requestedReportId: string;
}): void {
  if (input.entitlementTier !== 'comprehensive' || input.requestedTier !== 'comprehensive') {
    throw new Error('Comprehensive delivery entitlement mismatch.');
  }
  if (input.authorizedReportId !== input.requestedReportId || input.artifact.reportId !== input.authorizedReportId) {
    throw new Error('Comprehensive delivery report binding mismatch.');
  }
  if (input.artifact.storageStatus !== 'VERIFIED' || input.artifact.releaseState === 'superseded') {
    throw new Error('Comprehensive artifact is not releasable.');
  }
}
