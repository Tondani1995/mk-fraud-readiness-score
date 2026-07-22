import { aiPlanToNarrative, buildDeterministicNarrative, narrativeToSelectedContent } from './content';
import { buildPremiumReportEvidencePack, evidenceChecksum, scanForPromptInjection } from './evidence';
import { validatePremiumReportNarrative } from './validation';
import { createDurablePremiumReportNarrativeGenerator } from './durable-ai-attempts';
import { validatePremiumReportAiEditorialPlan } from './ai-plan-validation';
import type {
  BuildPremiumReportNarrativeInput,
  NarrativeGenerationResult,
  PreparedPremiumReportNarrative
} from './types';

function fallbackResult(
  input: BuildPremiumReportNarrativeInput,
  reason: string,
  evidenceOverride?: ReturnType<typeof buildPremiumReportEvidencePack>,
  checksumOverride?: string
): PreparedPremiumReportNarrative {
  const evidence = evidenceOverride ?? buildPremiumReportEvidencePack(
    input.assembled,
    input.advisoryModel ?? input.roadmap,
    input.flags.schemaVersion
  );
  const checksum = checksumOverride ?? evidenceChecksum(evidence);
  const narrative = buildDeterministicNarrative(input.assembled, input.deterministicContent);
  const validation = validatePremiumReportNarrative(narrative, evidence);

  if (!validation.ok) {
    const detail = validation.issues.map((item) => `${item.path}:${item.code}`).join(', ');
    throw new Error(`Approved deterministic report content failed Phase 14 validation: ${detail}`);
  }

  return {
    narrative,
    selectedContent: narrativeToSelectedContent(input.assembled, narrative, true),
    mode: 'deterministic_fallback',
    evidence,
    evidenceChecksum: checksum,
    validation,
    fallbackReason: reason
  };
}

/**
 * Builds a candidate AI narrative from a plan that already passed the structural/evidence-ref
 * check (validatePremiumReportAiEditorialPlan) and runs it through the SAME fact-checking
 * validator (validatePremiumReportNarrative) used for deterministic content -- the one that
 * cross-checks every number, maturity band and exposure band against the section's cited
 * evidence and rejects prohibited claims. Only a plan that survives both checks is eligible to
 * actually reach the report; see docs/v1/phase14/ai-narrative-fix.md for why this two-stage
 * check exists instead of trusting the structural check alone.
 */
function buildAndValidateAiNarrative(
  input: BuildPremiumReportNarrativeInput,
  evidence: ReturnType<typeof buildPremiumReportEvidencePack>,
  plan: NarrativeGenerationResult['output']
) {
  const narrative = aiPlanToNarrative(input.assembled, input.deterministicContent, plan);
  const validation = validatePremiumReportNarrative(narrative, evidence);
  return { narrative, validation };
}

type GeneratorHandle = ReturnType<typeof createDurablePremiumReportNarrativeGenerator>;

/**
 * The one-and-only repair attempt (Phase 14 policy: at most one repair per generation, enforced
 * by durable-ai-attempts.ts's attempt-budget check, not by this function). Called whenever either
 * the structural plan check or the full narrative fact-check fails on the first pass. Returns a
 * fully formed PreparedPremiumReportNarrative in every case -- 'ai_repair' if the repaired output
 * is grounded, otherwise a deterministic fallback carrying both validation results for the audit
 * trail (satisfies C1 requirement 3: fallback mode must be recorded accurately).
 */
async function attemptRepair(input: BuildPremiumReportNarrativeInput, params: {
  evidence: ReturnType<typeof buildPremiumReportEvidencePack>;
  checksum: string;
  generator: GeneratorHandle;
  baseGenerationInput: Parameters<GeneratorHandle['repair']>[0];
  generation: NarrativeGenerationResult;
  planValidation: ReturnType<typeof validatePremiumReportAiEditorialPlan>;
  priorValidationIssues: ReturnType<typeof validatePremiumReportNarrative>['issues'];
}): Promise<PreparedPremiumReportNarrative> {
  const { evidence, checksum, generator, baseGenerationInput, generation, planValidation } = params;
  try {
    const repairGeneration = await generator.repair({
      ...baseGenerationInput,
      previousOutput: generation.output,
      validationIssues: params.priorValidationIssues
    });
    const repairPlanValidation = validatePremiumReportAiEditorialPlan(repairGeneration.output, evidence);
    if (!repairPlanValidation.ok) {
      return {
        ...fallbackResult(input, 'ai_repair_plan_validation_failed', evidence, checksum),
        initialValidation: planValidation,
        repairValidation: repairPlanValidation,
        generation,
        repairGeneration
      };
    }

    const repaired = buildAndValidateAiNarrative(input, evidence, repairGeneration.output);
    if (repaired.validation.ok) {
      return {
        narrative: repaired.narrative,
        selectedContent: narrativeToSelectedContent(input.assembled, repaired.narrative, false),
        mode: 'ai_repair',
        evidence,
        evidenceChecksum: checksum,
        validation: repaired.validation,
        initialValidation: planValidation,
        repairValidation: repairPlanValidation,
        generation,
        repairGeneration
      };
    }
    return {
      ...fallbackResult(input, 'ai_repair_narrative_validation_failed', evidence, checksum),
      initialValidation: planValidation,
      repairValidation: repaired.validation,
      generation,
      repairGeneration
    };
  } catch (repairError) {
    const reason = repairError instanceof Error ? repairError.message : 'repair_generation_failed';
    return {
      ...fallbackResult(input, `ai_repair_failed:${reason}`, evidence, checksum),
      initialValidation: planValidation,
      generation
    };
  }
}

export async function preparePremiumReportNarrative(
  input: BuildPremiumReportNarrativeInput
): Promise<PreparedPremiumReportNarrative> {
  if (!input.flags.aiNarrativeEnabled) return fallbackResult(input, 'ai_feature_disabled');
  if (!input.generator) return fallbackResult(input, 'ai_generator_unavailable');
  if (!input.generationIdentity) return fallbackResult(input, 'ai_generation_identity_missing');

  const evidence = buildPremiumReportEvidencePack(
    input.assembled,
    input.advisoryModel ?? input.roadmap,
    input.flags.schemaVersion
  );
  const checksum = evidenceChecksum(evidence);

  // M4 defense-in-depth: organisationName is the one field in the evidence pack that traces back
  // to customer-entered free text. If it looks like a prompt-injection attempt, skip the AI call
  // entirely rather than spend money on input we already do not trust. This does not replace the
  // fact-check below -- it is an additional, cheap, fail-closed layer in front of it.
  const injectionScan = scanForPromptInjection(evidence.organisationName);
  if (injectionScan.suspicious) {
    return fallbackResult(input, `organisation_name_injection_suspected:${injectionScan.matchedPattern}`, evidence, checksum);
  }

  const generator = createDurablePremiumReportNarrativeGenerator({
    generator: input.generator,
    generationIdentity: input.generationIdentity,
    fulfilmentId: input.fulfilmentId,
    workerCapabilityId: input.workerCapabilityId,
    authorizeAction: input.authorizeAiAction
  });

  const baseGenerationInput = {
    evidence,
    evidenceChecksum: checksum,
    deterministicContent: input.deterministicContent,
    roadmap: input.roadmap,
    promptVersion: input.flags.promptVersion,
    schemaVersion: input.flags.schemaVersion
  };

  try {
    const generation = await generator.generate(baseGenerationInput);
    const planValidation = validatePremiumReportAiEditorialPlan(generation.output, evidence);

    if (!planValidation.ok) {
      return attemptRepair(input, {
        evidence,
        checksum,
        generator,
        baseGenerationInput,
        generation,
        planValidation,
        priorValidationIssues: planValidation.issues
      });
    }

    const { narrative, validation } = buildAndValidateAiNarrative(input, evidence, generation.output);
    if (validation.ok) {
      return {
        narrative,
        selectedContent: narrativeToSelectedContent(input.assembled, narrative, false),
        mode: 'ai',
        evidence,
        evidenceChecksum: checksum,
        validation,
        initialValidation: planValidation,
        generation
      };
    }

    return attemptRepair(input, {
      evidence,
      checksum,
      generator,
      baseGenerationInput,
      generation,
      planValidation,
      priorValidationIssues: validation.issues
    });
  } catch (generationError) {
    const reason = generationError instanceof Error ? generationError.message : 'ai_generation_failed';
    return fallbackResult(input, `ai_generation_failed:${reason}`, evidence, checksum);
  }
}
