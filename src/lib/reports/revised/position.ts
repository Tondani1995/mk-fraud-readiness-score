import type { RevisedReport } from './evidence-model';

/**
 * FICTIONAL INTEGRATION PROTOTYPE. The four statements both paid reports make about the organisation's position,
 * always separately and always in the same form (MK's direction of 12 November, second direction, item 3):
 *
 *   1. Calculated test result        the research fixture's number, kept for traceability; never a band or a level
 *   2. Unresolved inconsistencies    answers that cannot both be right, or a control lacking an input it needs
 *   3. Provisional interpretation    what the self-reported answers indicate, labelled as provisional
 *   4. Approved readiness conclusion none, because MK has not approved a readiness method
 *
 * No threshold decides how the figure is shown: the same four statements appear for every organisation, so an
 * organisation with conflicting answers and one without are presented in the same way, with different facts.
 */
export type PositionStatement = { key: 'calculated' | 'inconsistencies' | 'interpretation' | 'conclusion'; label: string; value: string; text: string };

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function positionStatements(r: RevisedReport, figure: { score: number | null }): PositionStatement[] {
  const k = r.summary.byKind;
  const p = r.position;
  const inconsistent = p.contradictions + p.dependencies;
  const reportedInPlace = k.confirmed + k.qualified + k.clarify + k.contradiction + k.dependency;
  const settledOpen = k.clarify + k.contradiction + k.dependency;
  const inconsistencyText = inconsistent
    ? `${p.contradictions ? `${plural(p.contradictions, 'scenario has', 'scenarios have')} answers that cannot both be right` : ''}${p.contradictions && p.dependencies ? ', and ' : ''}${p.dependencies ? `${plural(p.dependencies, 'scenario relies', 'scenarios rely')} on a control that lacks an input it needs` : ''}.${p.clarifications ? ` A further ${plural(p.clarifications, 'scenario raises a question', 'scenarios raise questions')} the answers do not settle.` : ''} Until they are settled, the controls concerned are not treated as covering their scenarios.`
    : `None found${p.pairsCompared ? ` in the ${plural(p.pairsCompared, 'pair of answers', 'pairs of answers')} compared` : ''}.${p.clarifications ? ` ${plural(p.clarifications, 'scenario raises a question', 'scenarios raise questions')} the answers do not settle.` : ''} Most related practices were not asked, so this is not a finding that every answer is consistent.`;
  const interpretation = `On its own answers, the organisation reports the controls that stop the scenario in place for ${reportedInPlace} of the ${r.schemes.length} fraud scenarios that apply${settledOpen ? `, of which ${settledOpen} ${settledOpen === 1 ? 'is' : 'are'} unresolved or open to question` : ''}, and a control reported as a gap in ${k.gap}${k.outstanding ? `; ${k.outstanding} cannot be read because answers are outstanding` : ''}. This reads self-reported answers; nothing has been tested.`;
  return [
    { key: 'calculated', label: 'Calculated test result', value: figure.score === null ? 'Not calculated' : `${figure.score.toFixed(1)} of 100, test fixture`,
      text: 'From a research simulation of the draft method, kept for traceability. It is not a score, a maturity band or a readiness level.' },
    { key: 'inconsistencies', label: 'Unresolved inconsistencies', value: inconsistent ? `${inconsistent} to settle${p.clarifications ? `; ${p.clarifications} to clarify` : ''}` : p.clarifications ? `None; ${p.clarifications} to clarify` : 'None found', text: inconsistencyText },
    { key: 'interpretation', label: 'Provisional management interpretation', value: `${k.gap} with a control reported as a gap`, text: interpretation },
    { key: 'conclusion', label: 'Approved readiness conclusion', value: 'None issued', text: p.conclusion }
  ];
}
