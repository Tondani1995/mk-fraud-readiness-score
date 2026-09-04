import path from 'node:path';

import { buildComprehensiveNarrativeFactPack } from '../narrative/fact-pack';
import { buildNarrativeStoryPlan, assertNarrativeStoryPlan, type NarrativeStoryPlan } from '../narrative/story-plan';
import {
  bindBlueprintTextProvenance,
  parseBlueprintMarkdown,
  validateBlueprintTextManuscript,
  type ParsedBlueprintMarkdown
} from '../narrative/blueprint-text';
import { buildReportBlueprint, buildWholeManuscriptContext, type ReportBlueprint } from '../narrative/report-blueprint';
import { sha256Json } from '../narrative/release-gate';
import type { NarrativeFactPack } from '../narrative/fact-pack';
import type { WholeManuscriptTextResult, WholeManuscriptWriter } from '../narrative/manuscript';
import { recoverWholeManuscript, WholeManuscriptRecoveryError } from '../narrative/whole-manuscript-recovery';
import {
  assertComprehensiveRecoveryBudget,
  ComprehensiveProviderCallLedger,
  COMPREHENSIVE_TECHNICAL_MODEL_CHAIN,
  type ComprehensiveProviderCallRecord
} from './recovery-policy';

export interface ComprehensiveManuscriptCoordinatorInput {
  factPack: NarrativeFactPack;
  writer: WholeManuscriptWriter;
  /** Creates a writer for a different model rung while retaining the same call ledger. */
  createWriter?: (model: string, ledger: ComprehensiveProviderCallLedger) => WholeManuscriptWriter;
  modelChain?: readonly string[];
  ledger?: ComprehensiveProviderCallLedger;
  attemptIdentity?: string;
  diagnosticsRootDirectory?: string;
  runCoherence?: boolean;
}

export interface ComprehensiveManuscriptResult {
  narrative: ParsedBlueprintMarkdown;
  storyPlan: NarrativeStoryPlan;
  blueprint: ReportBlueprint;
  manuscript: WholeManuscriptTextResult;
  recovery: WholeManuscriptTextResult['writerMetadata']['recovery'];
  providerCalls: ComprehensiveProviderCallRecord[];
  rejectedCandidateDirectories: string[];
  coherenceUsed: boolean;
  /** The validation the accepted manuscript passed, kept so it can be persisted with it. */
  finalValidation: ReturnType<typeof validateBlueprintTextManuscript>;
  /** Identity of the deterministic inputs this manuscript was written and validated against. */
  generationId: string;
  factPackSha256: string;
  storyPlanSha256: string;
  blueprintSha256: string;
}

function isTechnicalWriterFailure(error: unknown): boolean {
  const record = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const code = String(record.code ?? '').toLowerCase();
  const message = String(record.message ?? (error instanceof Error ? error.message : error ?? '')).toLowerCase();
  if (code === 'narrative_writer_unavailable' || code === 'human_review_required') return false;
  return /timeout|timed out|network|fetch failed|connection|gateway|provider|econn|etimedout|technical|temporarily unavailable/.test(`${code} ${message}`);
}

function modelIndex(model: string, chain: readonly string[]): number {
  const index = chain.indexOf(model);
  return index >= 0 ? index : 0;
}

function generationInput(context: ReturnType<typeof buildWholeManuscriptContext>, factPack: NarrativeFactPack, blueprint: ReportBlueprint) {
  return { context, factPack, blueprint, semanticSafety: false as const };
}

/**
 * The authoritative Comprehensive composition boundary.
 *
 * Deterministic truth is assembled once, the Fact Pack and Story Plan are
 * validated, one Blueprint-bound manuscript is written, and only then may a
 * bounded recovery operation or narrative renderer run. Essential keeps its
 * separate coordinator and semantic-call contract.
 */
export async function composeComprehensiveManuscript(input: ComprehensiveManuscriptCoordinatorInput): Promise<ComprehensiveManuscriptResult> {
  if (input.factPack.productTier !== 'comprehensive') throw new Error('Comprehensive coordinator requires a Comprehensive Fact Pack.');
  const storyPlan = buildNarrativeStoryPlan(input.factPack);
  assertNarrativeStoryPlan(storyPlan, input.factPack);
  const blueprint = buildReportBlueprint(input.factPack, storyPlan);
  const context = buildWholeManuscriptContext(input.factPack, blueprint);
  const ledger = input.ledger ?? new ComprehensiveProviderCallLedger();
  const attemptIdentity = input.attemptIdentity ?? `${input.factPack.assessment.reference}:comprehensive`;
  const diagnosticsRootDirectory = input.diagnosticsRootDirectory
    ?? process.env.COMPREHENSIVE_DIAGNOSTICS_ROOT
    ?? path.join('/tmp', 'mk-comprehensive-recovery');
  const modelChain = input.modelChain ?? COMPREHENSIVE_TECHNICAL_MODEL_CHAIN;
  const primaryIndex = modelIndex(input.writer.model, modelChain);
  const write = (writer: WholeManuscriptWriter) => writer.writeManuscript(generationInput(context, input.factPack, blueprint));

  let initialResult: WholeManuscriptTextResult;
  try {
    initialResult = await write(input.writer);
  } catch (error) {
    // Provider/transport failure is the only initial failure eligible for one
    // technical model fallback. Content and hard-truth failures remain closed.
    if (!input.createWriter || !isTechnicalWriterFailure(error) || primaryIndex >= modelChain.length - 1) throw error;
    const fallbackWriter = input.createWriter(modelChain[primaryIndex + 1]!, ledger);
    const fallback = await write(fallbackWriter);
    initialResult = {
      ...fallback,
      writerMetadata: {
        ...fallback.writerMetadata,
        recovery: {
          ...fallback.writerMetadata.recovery,
          technicalFallbackCount: fallback.writerMetadata.recovery.technicalFallbackCount + 1,
          totalCalls: fallback.writerMetadata.recovery.totalCalls + 1
        }
      }
    };
  }

  let qualityWriterIndex = primaryIndex;
  const makeNextWriter = () => {
    if (!input.createWriter || qualityWriterIndex >= modelChain.length - 1) return undefined;
    qualityWriterIndex += 1;
    return input.createWriter(modelChain[qualityWriterIndex]!, ledger);
  };

  let recovered;
  try {
    recovered = await recoverWholeManuscript({
      writer: input.writer,
      context,
      blueprint,
      factPack: input.factPack,
      initialResult,
      attemptIdentity,
      diagnosticsRootDirectory,
      strictHardTruth: true,
      runCoherence: input.runCoherence ?? false,
      regenerate: () => write(input.writer),
      escalateQuality: async () => {
        const nextWriter = makeNextWriter();
        if (!nextWriter) throw new WholeManuscriptRecoveryError('quality_escalation_unavailable', 'No approved Comprehensive quality-escalation model rung is available.');
        return write(nextWriter);
      }
    });
  } catch (error) {
    if (error instanceof WholeManuscriptRecoveryError) throw error;
    throw new WholeManuscriptRecoveryError('recovery_failed', 'Comprehensive whole-manuscript recovery failed closed.', { cause: error instanceof Error ? error.message : String(error) });
  }

  const generationId = recovered.writerMetadata.generationId
    ?? recovered.writerMetadata.responseId
    ?? attemptIdentity;
  const narrative = bindBlueprintTextProvenance(recovered.parsed, { factPack: input.factPack, blueprint, generationId });
  const finalValidation = validateBlueprintTextManuscript(narrative, blueprint, input.factPack);
  if (!narrative.ok || !finalValidation.ok || finalValidation.quality.status === 'QUALITY_FAILURE') {
    throw new WholeManuscriptRecoveryError('human_review_required', 'Comprehensive manuscript failed the final bound-text validation.', { validation: finalValidation, recovery: recovered.recovery });
  }
  assertComprehensiveRecoveryBudget(recovered.recovery);
  if (ledger.totalCalls > 0 && recovered.recovery.totalCalls !== ledger.totalCalls) {
    throw new WholeManuscriptRecoveryError('recovery_accounting_mismatch', 'Comprehensive provider-call ledger and manuscript accounting disagree.', { ledger: ledger.snapshot(), recovery: recovered.recovery });
  }
  return {
    narrative,
    storyPlan,
    blueprint,
    manuscript: { ...initialResult, markdown: recovered.markdown, writerMetadata: recovered.writerMetadata },
    recovery: recovered.recovery,
    providerCalls: ledger.snapshot(),
    rejectedCandidateDirectories: recovered.rejectedCandidateDirectories,
    coherenceUsed: recovered.coherenceUsed,
    finalValidation,
    generationId,
    factPackSha256: sha256Json(input.factPack),
    storyPlanSha256: sha256Json(storyPlan),
    blueprintSha256: sha256Json(blueprint)
  };
}

/** Provider-free binding helper used by acceptance fixtures and release gates. */
export function bindComprehensiveFixtureManuscript(input: {
  markdown: string;
  factPack: NarrativeFactPack;
  storyPlan: NarrativeStoryPlan;
  blueprint?: ReportBlueprint;
  generationId: string;
}): { narrative: ParsedBlueprintMarkdown; blueprint: ReportBlueprint; validation: ReturnType<typeof validateBlueprintTextManuscript> } {
  const blueprint = input.blueprint ?? buildReportBlueprint(input.factPack, input.storyPlan);
  const parsed = parseBlueprintMarkdown(input.markdown, blueprint);
  const narrative = bindBlueprintTextProvenance(parsed, { factPack: input.factPack, blueprint, generationId: input.generationId });
  return { narrative, blueprint, validation: validateBlueprintTextManuscript(narrative, blueprint, input.factPack) };
}
