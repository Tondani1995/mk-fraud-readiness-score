import type { NarrativeFactPack } from './fact-pack';
import type { ReportBlueprint } from './report-blueprint';
import {
  appendBlueprintTail,
  classifyWholeManuscriptGeneration,
  deriveMissingBlueprintTail,
  parseBlueprintMarkdown,
  type ParsedBlueprintMarkdown,
  type TextFirstValidationReport
} from './blueprint-text';
import { validateBlueprintTextManuscript } from './blueprint-text';
import type { NarrativeRecoveryBudget } from './recovery-policy';

export interface WholeManuscriptReconciliationInput {
  initialMarkdown: string;
  continuationMarkdown?: string;
  blueprint: ReportBlueprint;
  factPack: NarrativeFactPack;
  initialOutputTokens?: number;
  initialMaxOutputTokens?: number;
  initialFinishReason?: string;
  initialProviderFinishReason?: string;
  initialProviderFailed?: boolean;
}

export interface WholeManuscriptReconciliationResult {
  markdown: string;
  parsed: ParsedBlueprintMarkdown;
  validation: TextFirstValidationReport;
  continuationUsed: boolean;
  initialHeadingCount: number;
  finalHeadingCount: number;
  missingHeadings: string[];
  boundary: ReturnType<typeof deriveMissingBlueprintTail>['boundary'] | null;
}

export class WholeManuscriptReconciliationError extends Error {
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'WholeManuscriptReconciliationError';
    this.code = code;
    this.details = details;
  }
}

export function mergeWholeManuscriptRecoveryBudgets(initial: NarrativeRecoveryBudget, continuation: NarrativeRecoveryBudget): NarrativeRecoveryBudget {
  return {
    initialGenerationCount: initial.initialGenerationCount + continuation.initialGenerationCount,
    targetedRepairCount: initial.targetedRepairCount + continuation.targetedRepairCount,
    fullRegenerationCount: initial.fullRegenerationCount + continuation.fullRegenerationCount,
    qualityEscalationCount: initial.qualityEscalationCount + continuation.qualityEscalationCount,
    coherenceCount: initial.coherenceCount + continuation.coherenceCount,
    technicalFallbackCount: initial.technicalFallbackCount + continuation.technicalFallbackCount,
    truncationContinuationCount: initial.truncationContinuationCount + continuation.truncationContinuationCount,
    totalCalls: initial.totalCalls + continuation.totalCalls,
    totalTokens: initial.totalTokens + continuation.totalTokens,
    totalProviderCostMicros: initial.totalProviderCostMicros + continuation.totalProviderCostMicros
  };
}

function headingCount(markdown: string): number {
  return (markdown.match(/^#{1,6}[ \t]+.+$/gm) ?? []).length;
}

function throwValidationFailure(parsed: ParsedBlueprintMarkdown, validation: TextFirstValidationReport): never {
  throw new WholeManuscriptReconciliationError(
    'reconciled_validation_failed',
    'The reconciled whole manuscript failed deterministic Blueprint or text-first validation.',
    { parsed: parsed.errors, hardTruth: validation.hardTruth.issues, repairableSemantic: validation.repairableSemantic.issues }
  );
}

export function reconcileWholeManuscript(input: WholeManuscriptReconciliationInput): WholeManuscriptReconciliationResult {
  const initialParsed = parseBlueprintMarkdown(input.initialMarkdown, input.blueprint);
  const initialValidation = validateBlueprintTextManuscript(initialParsed, input.blueprint, input.factPack);
  if (initialParsed.ok && initialValidation.ok) {
    if (input.continuationMarkdown !== undefined) {
      throw new WholeManuscriptReconciliationError('unexpected_continuation', 'A continuation was supplied after a complete valid initial manuscript.');
    }
    const finalHeadingCount = headingCount(input.initialMarkdown);
    return {
      markdown: initialParsed.markdown,
      parsed: initialParsed,
      validation: initialValidation,
      continuationUsed: false,
      initialHeadingCount: finalHeadingCount,
      finalHeadingCount,
      missingHeadings: [],
      boundary: null
    };
  }

  const tail = deriveMissingBlueprintTail(input.initialMarkdown, input.blueprint);
  const initialStructuralErrors = initialParsed.errors.filter((error) => error.code !== 'heading_count');
  if (!tail.ok || initialStructuralErrors.length > 0) {
    throw new WholeManuscriptReconciliationError(
      'initial_manuscript_malformed',
      'The initial whole-manuscript response is not a valid deterministic Blueprint prefix.',
      { parsed: initialParsed.errors, tail: tail.errors }
    );
  }

  const outcome = classifyWholeManuscriptGeneration({
    finishReason: input.initialFinishReason,
    providerFinishReason: input.initialProviderFinishReason,
    outputTokens: input.initialOutputTokens,
    maxOutputTokens: input.initialMaxOutputTokens,
    missingHeadingCount: tail.missingHeadings.length,
    providerFailed: input.initialProviderFailed
  });
  if (outcome !== 'TECHNICAL_TRUNCATION') {
    throw new WholeManuscriptReconciliationError(
      'initial_manuscript_incomplete',
      'The initial whole-manuscript response is incomplete but is not proven to be technical truncation.',
      { outcome, missingHeadings: tail.missingHeadings, initialHeadingCount: headingCount(input.initialMarkdown) }
    );
  }
  if (input.continuationMarkdown === undefined || !input.continuationMarkdown.trim()) {
    throw new WholeManuscriptReconciliationError(
      'continuation_missing',
      'Technical truncation requires a bounded continuation; no continuation was supplied.',
      { missingHeadings: tail.missingHeadings, boundary: tail.boundary }
    );
  }

  let combined: string;
  try {
    combined = appendBlueprintTail(input.initialMarkdown, input.continuationMarkdown, input.blueprint);
  } catch (error) {
    throw new WholeManuscriptReconciliationError(
      'continuation_invalid',
      error instanceof Error ? error.message : 'The bounded continuation could not be reconciled.',
      { missingHeadings: tail.missingHeadings, boundary: tail.boundary }
    );
  }
  const parsed = parseBlueprintMarkdown(combined, input.blueprint);
  const validation = validateBlueprintTextManuscript(parsed, input.blueprint, input.factPack);
  if (!parsed.ok || !validation.ok) throwValidationFailure(parsed, validation);
  const finalHeadingCount = headingCount(combined);
  if (finalHeadingCount !== headingCount(input.initialMarkdown) + tail.missingHeadings.length) {
    throw new WholeManuscriptReconciliationError('continuation_heading_count', 'The reconciled manuscript does not contain the exact missing Blueprint suffix.', { initialHeadingCount: headingCount(input.initialMarkdown), finalHeadingCount, expectedMissing: tail.missingHeadings.length });
  }
  return {
    markdown: combined,
    parsed,
    validation,
    continuationUsed: true,
    initialHeadingCount: headingCount(input.initialMarkdown),
    finalHeadingCount,
    missingHeadings: tail.missingHeadings,
    boundary: tail.boundary
  };
}
