import { buildDeterministicNarrative, narrativeToSelectedContent } from './content';
import { buildPremiumReportEvidencePack, evidenceChecksum } from './evidence';
import { validatePremiumReportNarrative } from './validation';
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
    const generation = await input.generator.generate(baseGenerationInput);
    const validation = validatePremiumReportNarrative(generation.output, evidence);
    if (validation.ok) {
      return {
        narrative: generation.output,
        selectedContent: narrativeToSelectedContent(input.assembled, generation.output, false),
        mode: 'ai',
        evidence,
        evidenceChecksum: checksum,
        validation,
        initialValidation: validation,
        generation
      };
    }

    try {
      const repairGeneration = await input.generator.repair({
        ...baseGenerationInput,
        previousOutput: generation.output,
        validationIssues: validation.issues
      });
      const repairValidation = validatePremiumReportNarrative(repairGeneration.output, evidence);
      if (repairValidation.ok) {
        return {
          narrative: repairGeneration.output,
          selectedContent: narrativeToSelectedContent(input.assembled, repairGeneration.output, false),
          mode: 'ai_repair',
          evidence,
          evidenceChecksum: checksum,
          validation: repairValidation,
          initialValidation: validation,
          repairValidation,
          generation,
          repairGeneration
        };
      }

      return {
        ...fallbackResult(input, 'ai_repair_validation_failed'),
        initialValidation: validation,
        repairValidation,
        generation,
        repairGeneration
      };
    } catch (repairError) {
      const reason = repairError instanceof Error ? repairError.message : 'repair_generation_failed';
      return {
        ...fallbackResult(input, `ai_repair_failed:${reason}`),
        initialValidation: validation,
        generation
      };
    }
  } catch (generationError) {
    const reason = generationError instanceof Error ? generationError.message : 'ai_generation_failed';
    return fallbackResult(input, `ai_generation_failed:${reason}`);
  }
}
