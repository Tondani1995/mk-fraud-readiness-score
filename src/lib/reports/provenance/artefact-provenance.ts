/**
 * Build provenance for a generated customer artefact.
 *
 * V5 of the Vhutshilo Essential report cannot answer the question "which code produced
 * this?". The generation attempt recorded timings, a request key and an output id, and
 * nothing about the build. That is fine until a customer artefact has to be reproduced,
 * defended or withdrawn, at which point it is the only question that matters.
 *
 * This record closes that gap. It is internal metadata: it is persisted alongside the
 * artefact and must never be rendered into the customer-facing report, which states its
 * assessment basis in the methodology section and has no business carrying build detail.
 */

/** Every field the owner requires before an artefact may be certified. */
export interface ArtefactProvenance {
  assessmentId: string;
  assessmentReference: string;
  scoreRunId: string;
  graphVersion: string;
  graphFingerprint: string;
  /** The deterministic input hash recorded on the score run. */
  inputHash: string;
  /** Resolved at generation time. `null` only where the runtime genuinely cannot know it. */
  sourceGitSha: string | null;
  sourceRef: string | null;
  templateId: string | null;
  templateVersion: string | null;
  reportSchemaVersion: string;
  /** Narrative fields stay null for a purely deterministic render. */
  narrativeProvider: string | null;
  narrativeModel: string | null;
  writerVersion: string | null;
  generatedAt: string;
  pdfChecksumSha256: string | null;
  workbookChecksumSha256: string | null;
  /** The commercial acceptance verdict at generation time, once that gate exists. */
  commercialAcceptance: CommercialAcceptanceStamp | null;
}

export interface CommercialAcceptanceStamp {
  /** The lowest material sub-KPI score. The gate passes only at 9.5 or above. */
  minimumSubKpi: number;
  passed: boolean;
  evaluatedAt: string;
  /** Sub-KPIs scoring below threshold, so a failure names itself. */
  failing: readonly string[];
}

/**
 * The build SHA, following the convention already used by the AI route policy.
 *
 * Vercel injects the commit on deployed runtimes; `MK_RELEASE_HEAD_SHA` covers scripted
 * and local generation. Returning null rather than a placeholder is deliberate — an
 * artefact whose provenance is unknown must be distinguishable from one built at a commit
 * that happens to be called "unknown".
 */
export function resolveSourceGitSha(): string | null {
  return process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.MK_RELEASE_HEAD_SHA ?? null;
}

export function resolveSourceRef(): string | null {
  return process.env.VERCEL_GIT_COMMIT_REF ?? process.env.MK_RELEASE_HEAD_REF ?? null;
}

export const REPORT_SCHEMA_VERSION = 'mk-report-schema-2026-08';

export interface ArtefactProvenanceInput {
  assessmentId: string;
  assessmentReference: string;
  scoreRunId: string;
  graphVersion: string;
  graphFingerprint: string;
  inputHash: string;
  templateId?: string | null;
  templateVersion?: string | null;
  narrativeProvider?: string | null;
  narrativeModel?: string | null;
  writerVersion?: string | null;
  generatedAt?: string;
  pdfChecksumSha256?: string | null;
  workbookChecksumSha256?: string | null;
  commercialAcceptance?: CommercialAcceptanceStamp | null;
}

export function buildArtefactProvenance(input: ArtefactProvenanceInput): ArtefactProvenance {
  return {
    assessmentId: input.assessmentId,
    assessmentReference: input.assessmentReference,
    scoreRunId: input.scoreRunId,
    graphVersion: input.graphVersion,
    graphFingerprint: input.graphFingerprint,
    inputHash: input.inputHash,
    sourceGitSha: resolveSourceGitSha(),
    sourceRef: resolveSourceRef(),
    templateId: input.templateId ?? null,
    templateVersion: input.templateVersion ?? null,
    reportSchemaVersion: REPORT_SCHEMA_VERSION,
    narrativeProvider: input.narrativeProvider ?? null,
    narrativeModel: input.narrativeModel ?? null,
    writerVersion: input.writerVersion ?? null,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    pdfChecksumSha256: input.pdfChecksumSha256 ?? null,
    workbookChecksumSha256: input.workbookChecksumSha256 ?? null,
    commercialAcceptance: input.commercialAcceptance ?? null
  };
}

/**
 * The fields that must be present before an artefact may be certified for release.
 *
 * Narrative fields are excluded deliberately: a deterministic render legitimately has no
 * provider. Checksums are excluded because they are computed after the bytes exist.
 */
const CERTIFICATION_REQUIRED = [
  'assessmentId', 'assessmentReference', 'scoreRunId', 'graphVersion',
  'graphFingerprint', 'inputHash', 'sourceGitSha', 'reportSchemaVersion', 'generatedAt'
] as const satisfies readonly (keyof ArtefactProvenance)[];

export function missingCertificationProvenance(provenance: ArtefactProvenance): string[] {
  return CERTIFICATION_REQUIRED.filter((field) => {
    const value = provenance[field];
    return value === null || value === undefined || value === '';
  });
}
