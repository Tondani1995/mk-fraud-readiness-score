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

/**
 * The one account of every scenario in the picture, used by the PDF, the workbook and the position statements alike so
 * that they cannot disagree (independent review R-1 and P-5). Every scenario falls in exactly one category, and the
 * categories sum to the scenarios in the picture; `balanced` is false if they do not, and callers fail closed on it.
 *
 * The single headline convention: a scenario is "reported in place" when every core control is reported in place,
 * whether or not a related answer raises a question; those whose answers raise a question are always stated alongside.
 * For the rest, the sentence says only what was established: no conflicting answer under the reviewed relationship
 * rules, on self-reported answers, which is not evidence that the controls operate (independent review of the
 * corrective pass).
 */
export type ScenarioAccount = {
  inPicture: number; applicable: number; applicabilityPending: number;
  reportedInPlace: number; noConflictFound: number; inPlaceWithQuestion: number;
  gap: number; outstanding: number; notReached: number; notExpected: number; balanced: boolean;
  sentence: string;
};
export function scenarioAccount(r: RevisedReport): ScenarioAccount {
  const k = r.summary.byKind;
  const sm = r.summary as typeof r.summary & { applicabilityPending?: number; notReached?: number; inPicture?: number };
  const inPicture = sm.inPicture ?? r.schemes.length;
  const applicabilityPending = sm.applicabilityPending ?? 0;
  const notReached = sm.notReached ?? Math.max(0, k.none - applicabilityPending);
  const inPlaceWithQuestion = k.clarify + k.contradiction + k.dependency;
  const noConflictFound = k.confirmed + k.qualified;
  const reportedInPlace = noConflictFound + inPlaceWithQuestion;
  const applicable = inPicture - applicabilityPending - k['not-expected'];
  const balanced = reportedInPlace + k.gap + k.outstanding + notReached + applicabilityPending + k['not-expected'] === inPicture;
  const parts = [
    `every core control in place for ${reportedInPlace}${inPlaceWithQuestion ? ` (for ${inPlaceWithQuestion} of these the answers raise a question or cannot both be right; for the other ${noConflictFound} the answers compared under the reviewed rules show no conflict${k.qualified ? `, though ${k.qualified} of them have a related practice reported weaker` : ''}, which does not establish that the controls operate)` : ''}`,
    k.gap ? `a core control as a gap in ${k.gap}` : 'no core control as a gap',
    k.outstanding ? `core answers still outstanding in ${k.outstanding}` : '',
    notReached ? `${notReached} not yet reached in the interview` : ''
  ].filter(Boolean);
  const head = `Of the ${plural(applicable, 'fraud scenario that applies', 'fraud scenarios that apply')}, the organisation's answers report ${parts.slice(0, -1).join(', ')}${parts.length > 1 ? ' and ' : ''}${parts[parts.length - 1]}.`;
  const notExpected = k['not-expected'] ? ` The method does not ask about ${k['not-expected']} more at its size.` : '';
  const pending = applicabilityPending ? ` Whether ${plural(applicabilityPending, 'further scenario applies', 'further scenarios apply')} depends on ${applicabilityPending === 1 ? 'an answer that is' : 'answers that are'} outstanding; ${applicabilityPending === 1 ? 'it is' : 'they are'} not counted as applying, and nothing is concluded about ${applicabilityPending === 1 ? 'its' : 'their'} controls.` : '';
  return { inPicture, applicable, applicabilityPending, reportedInPlace, noConflictFound, inPlaceWithQuestion, gap: k.gap, outstanding: k.outstanding, notReached, notExpected: k['not-expected'], balanced, sentence: head + pending + notExpected };
}

export function positionStatements(r: RevisedReport, figure: { score: number | null }): PositionStatement[] {
  const k = r.summary.byKind;
  const p = r.position;
  const inconsistent = p.contradictions + p.dependencies;
  const inconsistencyText = inconsistent
    ? `${p.contradictions ? `${plural(p.contradictions, 'scenario has', 'scenarios have')} answers that cannot both be right` : ''}${p.contradictions && p.dependencies ? ', and ' : ''}${p.dependencies ? `${plural(p.dependencies, 'scenario relies', 'scenarios rely')} on a control that lacks an input it needs` : ''}.${p.clarifications ? ` A further ${plural(p.clarifications, 'scenario raises a question', 'scenarios raise questions')} the answers do not settle.` : ''} Until they are settled, the controls concerned are not treated as covering their scenarios.`
    : `None found${p.pairsCompared ? ` in the ${plural(p.pairsCompared, 'pair of answers', 'pairs of answers')} compared` : ''}.${p.clarifications ? ` ${plural(p.clarifications, 'scenario raises a question', 'scenarios raise questions')} the answers do not settle.` : ''} Most related practices were not asked, so this is not a finding that every answer is consistent.`;
  const interpretation = `${scenarioAccount(r).sentence} This reads self-reported answers; nothing has been tested.`;
  return [
    { key: 'calculated', label: 'Calculated test result', value: figure.score === null ? 'Not calculated' : `${figure.score.toFixed(1)} of 100, test fixture`,
      text: 'From a research simulation of the draft method, kept for traceability. It is not a score, a maturity band or a readiness level.' },
    { key: 'inconsistencies', label: 'Unresolved inconsistencies', value: inconsistent ? `${inconsistent} to settle${p.clarifications ? `; ${p.clarifications} to clarify` : ''}` : p.clarifications ? `None; ${p.clarifications} to clarify` : 'None found', text: inconsistencyText },
    { key: 'interpretation', label: 'Provisional management interpretation', value: `${k.gap} with a control reported as a gap`, text: interpretation },
    { key: 'conclusion', label: 'Approved readiness conclusion', value: 'None issued', text: p.conclusion }
  ];
}
