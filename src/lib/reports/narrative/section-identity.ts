import type { NarrativeClaimBlock, NarrativeManuscriptSection } from './manuscript';

export interface NarrativeSectionContent {
  heading: NarrativeClaimBlock;
  paragraphs: NarrativeClaimBlock[];
  transition: NarrativeClaimBlock | null;
}

/**
 * Applies the deterministic Story Plan identity after provider output has been parsed. Provider
 * values are intentionally ignored; no case normalisation or name inference is performed.
 */
export function applyDeterministicSectionIdentity(content: NarrativeSectionContent, expectedSectionId: string, expectedMovementId: string): NarrativeManuscriptSection {
  return {
    sectionId: expectedSectionId,
    movementId: expectedMovementId,
    heading: content.heading,
    paragraphs: content.paragraphs,
    transition: content.transition ?? undefined
  };
}
