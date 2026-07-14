import { buildDeterministicNarrative, narrativeToSelectedContent } from './content';
import { buildPremiumReportEvidencePack, evidenceChecksum } from './evidence';
import { validatePremiumReportNarrative } from './validation';
import { createDurablePremiumReportNarrativeGenerator } from './durable-ai-attempts';
import { validatePremiumReportAiEditorialPlan } from './ai-plan-validation';
import type {
  BuildPremiumReportNarrativeInput,
  PreparedPremiumReportNarrative
} from './types';

function fallbackResult(
  input: BuildPremiumReportNarrativeInput,
  reason: string
): PreparedPremiumReportNarrative {
  const evidence = buildPremiumReportEvidencePack(
    input.assembled,
    input.roadmap,
    input.flags.schemaVersion
  );
  const checksum = evidenceChecksum(evidence);
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

export async function preparePremiumReportNarrative(
  input: BuildPremiumReportNarrativeInput
): Promise<PreparedPremiumReportNarrative> {
  if (!input.flags.aiNarrativeEnabled) return fallbackResult(input, 'ai_feature_disabled');
  if (!input.generator) return fallbackResult(input, 'ai_generator_unavailable');
  if (!input.generationIdentity) return fallbackResult(input, 'ai_generation_identity_missing');

  const generator = createDurablePremiumReportNarrativeGenerator({
    generator: input.generator,
    generationIdentity: input.generationIdentity,
    fulfilmentId: input.fulfilmentId
  });

  const evidence = buildPremiumReportEvidencePack(
    input.assembled,
    input.roadmap,
    input.flags.schemaVersion
  );
  const checksum = evidenceChecksum(evidence);
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
    if (planValidation.ok) {
      const narrative = buildDeterministicNarrative(input.assembled, input.deterministicContent);
      const validation = validatePremiumReportNarrative(narrative, evidence);
      if (!validation.ok) throw new Error('Deterministic narrative validation failed after the AI evidence plan was accepted.');
      return {
        narrative,
        selectedContent: narrativeToSelectedContent(input.assembled, narrative, true),
        mode: 'ai',
        evidence,
        evidenceChecksum: checksum,
        validation,
        initialValidation: planValidation,
        generation
      };
    }

    try {
      const repairGeneration = await generator.repair({
        ...baseGenerationInput,
        previousOutput: generation.output,
        validationIssues: planValidation.issues
      });
      const repairValidation = validatePremiumReportAiEditorialPlan(repairGeneration.output, evidence);
      if (repairValidation.ok) {
        const narrative = buildDeterministicNarrative(input.assembled, input.deterministicContent);
        const validation = validatePremiumReportNarrative(narrative, evidence);
        if (!validation.ok) throw new Error('Deterministic narrative validation failed after the repaired AI evidence plan was accepted.');
        return {
          narrative,
          selectedContent: narrativeToSelectedContent(input.assembled, narrative, true),
          mode: 'ai_repair',
          evidence,
          evidenceChecksum: checksum,
          validation,
          initialValidation: planValidation,
          repairValidation,
          generation,
          repairGeneration
        };
      }

      return {
        ...fallbackResult(input, 'ai_repair_validation_failed'),
        initialValidation: planValidation,
        repairValidation,
        generation,
        repairGeneration
      };
    } catch (repairError) {
      const reason = repairError instanceof Error ? repairError.message : 'repair_generation_failed';
      return {
        ...fallbackResult(input, `ai_repair_failed:${reason}`),
        initialValidation: planValidation,
        generation
      };
    }
  } catch (generationError) {
    const reason = generationError instanceof Error ? generationError.message : 'ai_generation_failed';
    return fallbackResult(input, `ai_generation_failed:${reason}`);
  }
}
