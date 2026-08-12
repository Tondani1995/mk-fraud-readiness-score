import type { NarrativeFactPack } from './fact-pack';
import type { NarrativeStoryPlan } from './story-plan';
import { assertNarrativeValidation, validateNarrativeManuscript, validateNarrativeSpine } from './validation';
import { validateNarrativeEditorial } from './editorial-validation';
import { manuscriptToPlainText, type NarrativeManuscript, type NarrativeWriter } from './manuscript';

export interface NarrativeGenerationArtifacts {
  factPack: NarrativeFactPack;
  storyPlan: NarrativeStoryPlan;
  spine: import('./manuscript').NarrativeSpine;
  manuscript: NarrativeManuscript;
  plainText: string;
  narrativeValidation: ReturnType<typeof validateNarrativeManuscript>;
  editorialValidation: ReturnType<typeof validateNarrativeEditorial>;
}
export async function generateValidatedNarrative(input: { factPack: NarrativeFactPack; storyPlan: NarrativeStoryPlan; writer: NarrativeWriter }): Promise<NarrativeGenerationArtifacts> {
  const spine = await input.writer.writeSpine({ factPack: input.factPack, storyPlan: input.storyPlan });
  const spineValidation = validateNarrativeSpine(spine, input.factPack);
  assertNarrativeValidation(spineValidation);
  const sections: NarrativeManuscript['sections'] = [];
  let previousTransition: string | undefined;
  for (const movement of input.storyPlan.movements) {
    for (const sectionId of movement.sectionIds) {
      const next = input.storyPlan.movements.find((candidate) => candidate.order === movement.order + 1);
      const section = await input.writer.writeSection({ factPack: input.factPack, storyPlan: input.storyPlan, spine, previousTransition, currentSectionId: sectionId, currentSectionPurpose: movement.objective, nextSectionPurpose: next?.objective ?? input.storyPlan.requiredConclusion, requiredManagementTakeaway: movement.requiredManagementTakeaway, prohibitedClaims: input.storyPlan.prohibitedClaims });
      sections.push(section);
      previousTransition = section.transition?.text;
    }
  }
  const initial: NarrativeManuscript = { schemaVersion: 'mk-reporting-bible-1.1-manuscript-v1', bibleVersion: '1.1', productTier: input.factPack.productTier, organisationName: input.factPack.organisation.name, assessmentReference: input.factPack.assessment.reference, sections, spine, writerMetadata: spine.writerMetadata };
  const firstValidation = validateNarrativeManuscript(initial, input.factPack, input.storyPlan);
  assertNarrativeValidation(firstValidation);
  const editorial = validateNarrativeEditorial(initial, input.factPack, input.storyPlan);
  if (!editorial.ok) throw new Error(`Narrative editorial validation failed: ${editorial.issues.map((item) => item.code).join(', ')}`);
  const coherent = await input.writer.coherencePass({ manuscript: initial, factPack: input.factPack, storyPlan: input.storyPlan });
  const finalValidation = validateNarrativeManuscript(coherent, input.factPack, input.storyPlan, 'coherence');
  assertNarrativeValidation(finalValidation);
  const finalEditorial = validateNarrativeEditorial(coherent, input.factPack, input.storyPlan);
  if (!finalEditorial.ok) throw new Error(`Final narrative editorial validation failed: ${finalEditorial.issues.map((item) => item.code).join(', ')}`);
  return { factPack: input.factPack, storyPlan: input.storyPlan, spine: coherent.spine, manuscript: coherent, plainText: manuscriptToPlainText(coherent), narrativeValidation: finalValidation, editorialValidation: finalEditorial };
}
