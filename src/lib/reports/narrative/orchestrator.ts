import type { NarrativeFactPack } from './fact-pack';
import type { NarrativeStoryPlan } from './story-plan';
import { assertNarrativeValidation, validateNarrativeManuscript, validateNarrativeSpine } from './validation';
import { validateNarrativeEditorial } from './editorial-validation';
import { manuscriptToPlainText, type NarrativeManuscript, type NarrativeWriter } from './manuscript';

export interface NarrativeGenerationDiagnosticsSink {
  onRejectedCandidate(input: {
    stage: 'spine' | 'manuscript' | 'coherence';
    candidate: unknown;
    plainText?: string;
    narrativeValidation: ReturnType<typeof validateNarrativeManuscript>;
    editorialValidation?: ReturnType<typeof validateNarrativeEditorial>;
  }): Promise<void> | void;
}

function exportPlainTextIfPossible(candidate: unknown): string | undefined {
  try {
    return manuscriptToPlainText(candidate as NarrativeManuscript);
  } catch {
    return undefined;
  }
}

export interface NarrativeGenerationArtifacts {
  factPack: NarrativeFactPack;
  storyPlan: NarrativeStoryPlan;
  spine: import('./manuscript').NarrativeSpine;
  manuscript: NarrativeManuscript;
  plainText: string;
  narrativeValidation: ReturnType<typeof validateNarrativeManuscript>;
  editorialValidation: ReturnType<typeof validateNarrativeEditorial>;
}
export async function generateValidatedNarrative(input: { factPack: NarrativeFactPack; storyPlan: NarrativeStoryPlan; writer: NarrativeWriter; diagnostics?: NarrativeGenerationDiagnosticsSink }): Promise<NarrativeGenerationArtifacts> {
  const spine = await input.writer.writeSpine({ factPack: input.factPack, storyPlan: input.storyPlan });
  const spineValidation = validateNarrativeSpine(spine, input.factPack);
  if (!spineValidation.ok) {
    await input.diagnostics?.onRejectedCandidate({
      stage: 'spine',
      candidate: spine,
      narrativeValidation: spineValidation
    });
    assertNarrativeValidation(spineValidation);
  }
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
  const editorial = validateNarrativeEditorial(initial, input.factPack, input.storyPlan);
  if (!firstValidation.ok || !editorial.ok) {
    await input.diagnostics?.onRejectedCandidate({
      stage: 'manuscript',
      candidate: initial,
      plainText: exportPlainTextIfPossible(initial),
      narrativeValidation: firstValidation,
      editorialValidation: editorial
    });
    assertNarrativeValidation(firstValidation);
    if (!editorial.ok) throw new Error(`Narrative editorial validation failed: ${editorial.issues.map((item) => item.code).join(', ')}`);
  }
  const coherent = await input.writer.coherencePass({ manuscript: initial, factPack: input.factPack, storyPlan: input.storyPlan });
  const finalValidation = validateNarrativeManuscript(coherent, input.factPack, input.storyPlan, 'coherence');
  const finalEditorial = validateNarrativeEditorial(coherent, input.factPack, input.storyPlan);
  if (!finalValidation.ok || !finalEditorial.ok) {
    await input.diagnostics?.onRejectedCandidate({
      stage: 'coherence',
      candidate: coherent,
      plainText: exportPlainTextIfPossible(coherent),
      narrativeValidation: finalValidation,
      editorialValidation: finalEditorial
    });
    assertNarrativeValidation(finalValidation);
    if (!finalEditorial.ok) throw new Error(`Final narrative editorial validation failed: ${finalEditorial.issues.map((item) => item.code).join(', ')}`);
  }
  return { factPack: input.factPack, storyPlan: input.storyPlan, spine: coherent.spine, manuscript: coherent, plainText: manuscriptToPlainText(coherent), narrativeValidation: finalValidation, editorialValidation: finalEditorial };
}
