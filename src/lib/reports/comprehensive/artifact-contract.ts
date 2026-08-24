export const COMPREHENSIVE_REQUIRED_ARTIFACTS = [
  'main_report_pdf',
  'supporting_register_xlsx'
] as const;

export type ComprehensiveRequiredArtifact = (typeof COMPREHENSIVE_REQUIRED_ARTIFACTS)[number];

export type ComprehensiveArtifactManifest = {
  kind: ComprehensiveRequiredArtifact;
  orderId: string;
  reportId: string;
  version: number;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  checksumSha256: string;
  storageStatus: 'PENDING' | 'VERIFIED' | 'MISSING' | 'FAILED';
  releaseState: 'verified' | 'released' | 'superseded';
};

const SHA256 = /^[0-9a-f]{64}$/;
const PDF_MIME = 'application/pdf';
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function validateComprehensiveArtifactManifest(manifest: ComprehensiveArtifactManifest[]): { version: number } {
  if (manifest.length !== COMPREHENSIVE_REQUIRED_ARTIFACTS.length) {
    throw new Error('Comprehensive delivery must contain exactly the PDF and supporting register.');
  }
  const byKind = new Map<string, ComprehensiveArtifactManifest>();
  for (const artifact of manifest) {
    if (!COMPREHENSIVE_REQUIRED_ARTIFACTS.includes(artifact.kind)) {
      throw new Error(`Unknown Comprehensive artifact: ${artifact.kind}.`);
    }
    if (byKind.has(artifact.kind)) throw new Error(`Duplicate Comprehensive artifact: ${artifact.kind}.`);
    byKind.set(artifact.kind, artifact);
  }
  for (const required of COMPREHENSIVE_REQUIRED_ARTIFACTS) {
    const artifact = byKind.get(required);
    if (!artifact) throw new Error(`Required Comprehensive artifact missing: ${required}.`);
    if (artifact.storageStatus !== 'VERIFIED' || !['verified', 'released'].includes(artifact.releaseState)) {
      throw new Error(`Required Comprehensive artifact is not verified: ${required}.`);
    }
    if (artifact.sizeBytes <= 0 || !SHA256.test(artifact.checksumSha256)) {
      throw new Error(`Required Comprehensive artifact failed integrity metadata validation: ${required}.`);
    }
    if (artifact.orderId.trim() === '' || artifact.reportId.trim() === '') throw new Error(`Required Comprehensive artifact is not bound: ${required}.`);
    const expectedMime = required === 'main_report_pdf' ? PDF_MIME : XLSX_MIME;
    const expectedExtension = required === 'main_report_pdf' ? /\.pdf$/i : /\.xlsx$/i;
    if (artifact.contentType !== expectedMime || !expectedExtension.test(artifact.fileName)) {
      throw new Error(`Comprehensive artifact type metadata mismatch: ${required}.`);
    }
  }
  const first = manifest[0];
  if (manifest.some((artifact) => artifact.orderId !== first.orderId || artifact.reportId !== first.reportId)) {
    throw new Error('Comprehensive artifacts must share one exact order/report binding.');
  }
  const versions = new Set(manifest.map((artifact) => artifact.version));
  if (versions.size !== 1) throw new Error('Comprehensive artifacts must be released as one exact version set.');
  return { version: first.version };
}

export function assertComprehensiveCustomerDelivery(input: {
  entitlementTier: string;
  requestedTier: string;
  artifact: ComprehensiveArtifactManifest;
  authorizedOrderId: string;
  requestedOrderId: string;
  authorizedReportId: string;
  requestedReportId: string;
}): void {
  if (input.entitlementTier !== 'comprehensive' || input.requestedTier !== 'comprehensive') {
    throw new Error('Comprehensive delivery entitlement mismatch.');
  }
  if (input.authorizedOrderId !== input.requestedOrderId || input.artifact.orderId !== input.authorizedOrderId) {
    throw new Error('Comprehensive delivery order binding mismatch.');
  }
  if (input.authorizedReportId !== input.requestedReportId || input.artifact.reportId !== input.authorizedReportId) {
    throw new Error('Comprehensive delivery report binding mismatch.');
  }
  if (input.artifact.kind !== 'main_report_pdf' && input.artifact.kind !== 'supporting_register_xlsx') {
    throw new Error('Comprehensive delivery artifact type is not customer deliverable.');
  }
  if (input.artifact.storageStatus !== 'VERIFIED' || input.artifact.releaseState !== 'released') {
    throw new Error('Comprehensive artifact is not releasable.');
  }
}
