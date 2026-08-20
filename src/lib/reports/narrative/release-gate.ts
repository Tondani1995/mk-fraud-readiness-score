import crypto from 'node:crypto';
import type { NarrativeFactPack } from './fact-pack';
import type { NarrativeManuscript } from './manuscript';
import type { NarrativeStoryPlan } from './story-plan';
import type { NarrativeValidationReport } from './validation';
import type { EditorialValidationReport } from './editorial-validation';

export interface NarrativeManuscriptApproval {
  approved: true;
  approvedBy: string;
  approvedAt: string;
  essentialManuscriptSha256: string;
  comprehensiveManuscriptSha256: string;
}

export interface ValidatedNarrativeRelease {
  factPack: NarrativeFactPack;
  storyPlan: NarrativeStoryPlan;
  manuscript: NarrativeManuscript;
  narrativeValidation: NarrativeValidationReport;
  editorialValidation: EditorialValidationReport;
  approval: NarrativeManuscriptApproval;
}

export const V11_MANUSCRIPT_FIRST_MESSAGE = 'Reporting Bible v1.1 requires a validated, owner-approved plain-text manuscript before any paid report PDF is composed; deterministic narrative fallback is disabled.';

export class NarrativeManuscriptFirstBoundaryError extends Error {
  readonly code = 'V11_MANUSCRIPT_FIRST_REQUIRED';

  constructor() {
    super(V11_MANUSCRIPT_FIRST_MESSAGE);
    this.name = 'NarrativeManuscriptFirstBoundaryError';
  }
}

export function sha256Json(value: unknown): string {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

export function assertNarrativeCompositionReady(input: ValidatedNarrativeRelease): void {
  if (input.approval.approved !== true) throw new Error('Narrative composition requires explicit owner approval of the plain-text manuscript.');
  if (!input.approval.approvedBy.trim() || !input.approval.approvedAt.trim()) throw new Error('Narrative composition approval must identify the owner and approval time.');
  if (!input.narrativeValidation.ok) throw new Error('Narrative composition requires a passing factual/provenance validation report.');
  if (!input.editorialValidation.ok) throw new Error('Narrative composition requires a passing editorial validation report.');
  if (input.factPack.bibleVersion !== '1.1' || input.storyPlan.bibleVersion !== '1.1' || input.manuscript.bibleVersion !== '1.1') throw new Error('Narrative composition requires Reporting Bible 1.1 artefacts.');
  if (input.factPack.productTier !== input.storyPlan.productTier || input.factPack.productTier !== input.manuscript.productTier) throw new Error('Narrative composition artefacts must use one product tier.');
  const manuscriptHash = sha256Json(input.manuscript);
  const expectedHash = input.manuscript.productTier === 'essential' ? input.approval.essentialManuscriptSha256 : input.approval.comprehensiveManuscriptSha256;
  if (expectedHash !== manuscriptHash) throw new Error('Approved manuscript hash does not match the manuscript supplied for composition.');
}
