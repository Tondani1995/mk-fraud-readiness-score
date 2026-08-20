export const NARRATIVE_ARCHITECTURE_SELECTOR = 'MK_REPORT_NARRATIVE_ARCHITECTURE';
export const WHOLE_MANUSCRIPT_ARCHITECTURE = 'whole-manuscript' as const;
export const BOUNDED_SECTION_ARCHITECTURE = 'bounded-section-v1' as const;

export type NarrativeArchitecture = typeof WHOLE_MANUSCRIPT_ARCHITECTURE | typeof BOUNDED_SECTION_ARCHITECTURE;

export function selectNarrativeArchitecture(environment: NodeJS.ProcessEnv = process.env): NarrativeArchitecture {
  const requested = environment[NARRATIVE_ARCHITECTURE_SELECTOR]?.trim();
  if (requested === BOUNDED_SECTION_ARCHITECTURE) return BOUNDED_SECTION_ARCHITECTURE;
  return WHOLE_MANUSCRIPT_ARCHITECTURE;
}

export function assertBoundedSectionArchitecture(environment: NodeJS.ProcessEnv = process.env): void {
  if (selectNarrativeArchitecture(environment) !== BOUNDED_SECTION_ARCHITECTURE) {
    throw new Error(`Bounded narrative generation requires ${NARRATIVE_ARCHITECTURE_SELECTOR}=${BOUNDED_SECTION_ARCHITECTURE}.`);
  }
}
