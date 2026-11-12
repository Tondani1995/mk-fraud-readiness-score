/**
 * FICTIONAL INTEGRATION PROTOTYPE. Candidate product-sufficiency rules, for MK's approval. Not connected to any order,
 * entitlement, payment or fulfilment path; nothing here releases a report.
 *
 * MK's direction of 12 November (second direction), item 1: the first candidate rules let an Essential pass with the
 * breadth stage incomplete and tier 2 unanswered, and a Comprehensive pass with an entire diagnostic function package
 * declined. Version 0.2 replaces scheme-level confirmation coverage with conditions for each analytical deliverable the
 * product promises, drawn from the product catalogue:
 *
 *   Essential       E-FINDINGS   detailed analysis across all applicable areas
 *                   E-ACTIONS    management actions and the 30/60/90-day roadmap, with records for each action
 *   Comprehensive   everything in Essential, and
 *                   C-FINDINGS   the full finding and risk registers
 *                   C-BLUEPRINTS a target-state control blueprint for each control the report acts on
 *                   C-GOVERNANCE governance analysis and the leadership decision library
 *                   C-PROGRAMME  the implementation programme, its dependencies and its owners
 *
 * Two kinds of condition are kept apart. Information conditions depend on the organisation's answers: a declined,
 * "I don't know" or waiting answer never counts as given. Method conditions depend on MK's own content (the control
 * library, reviewed dependency semantics) and are reported separately, so that a gap in MK's method is never presented
 * as a gap in what the organisation said. Optional diagnostic questions are not all required: thresholds apply to the
 * questions the method actually put to the organisation, and a question that was never asked is never counted against
 * it. Every threshold is a named candidate parameter (CANDIDATE_THRESHOLDS) for MK to set.
 */
export const SUFFICIENCY_RULE_VERSION = 'information-sufficiency-candidate-0.2';
export const CANDIDATE_THRESHOLDS = {
  essentialTier1Answered: 0.9,
  essentialTier23Answered: 0.8,
  essentialAreaMinimum: 0.5,
  comprehensiveTier1Answered: 0.95,
  comprehensiveAllAnswered: 0.9,
  comprehensiveAreaMinimum: 0.75,
  diagnosticAnswered: 0.8,
  governanceDiagnosticAnswered: 0.8
} as const;
export const GOVERNANCE_FUNCTIONS = ['Executive and governance', 'Risk and investigations'];
export const GOVERNANCE_AREAS = ['D1', 'D2'];

export type StageInfo = { core: { complete: boolean; applicableSoFar: number; answered: number }; breadth: { complete: boolean; applicableSoFar: number; answered: number } };
export type ItemState = 'answered' | 'declined' | 'unknown' | 'waiting';
export type SufficiencyInput = {
  stages: StageInfo;
  /** Every applicable confirmation, once, with its scenario's tier and area. */
  confirmations: { id: string; tier: number; area: string; state: ItemState }[];
  /** Every diagnostic question the method put to a function or the respondent beyond the confirmations. */
  diagnostics: { id: string; area: string; scenario: string | null; fn: string | null; state: ItemState }[];
  /** Scenarios the report acts on (a gap, answers that conflict, a question to clarify, a related practice weaker). */
  openScenarios: { id: string; area: string }[];
  /** Every function package: its items and how each ended. */
  functions: { fn: string; items: number; answered: number; declined: number; unknown: number; waiting: number }[];
  /** The organisation's answer to "who has final oversight", or null if not answered. */
  oversight: string | null;
  /** Controls each product acts on, with whether the control library has content for them. */
  essentialControls: { id: string; inLibrary: boolean }[];
  blueprintControls: { id: string; inLibrary: boolean; fnRole: string }[];
  /** Prerequisite links the programme uses, with whether each rests on reviewed dependency semantics. */
  prerequisites: { from: string; to: string; reviewed: boolean }[];
  outstanding: { id: string; reason: string; role: string | null }[];
  notExpected?: number;
};

export type Condition = { id: string; kind: 'information' | 'method'; text: string; met: boolean; detail: string };
export type Deliverable = { product: 'essential' | 'comprehensive'; id: string; promise: string; conditions: Condition[]; meets: boolean };
export type SufficiencyResult = {
  rule: string; status: 'candidate-rules-not-approved'; thresholds: typeof CANDIDATE_THRESHOLDS;
  stages: { core: 'complete' | 'incomplete'; breadth: 'complete' | 'incomplete' };
  outstanding: { total: number; declined: number; notKnown: number; waiting: number; onConfirmations: number };
  coverage: {
    tier1: Share; tier23: Share; all: Share;
    byArea: (Share & { area: string })[];
  };
  diagnostics: Share & { declined: number; unknown: number; waiting: number; openScenariosWithNoDiagnosticAnswer: string[] };
  functions: (SufficiencyInput['functions'][number] & { declinedInFull: boolean })[];
  deliverables: Deliverable[];
  release: { essential: Verdict; comprehensive: Verdict };
  /** Kept for the reports' wording: scenarios not asked of an organisation of this size, outside every share. */
  notExpectedBySize: number;
};
type Share = { applicable: number; answered: number; share: number };
type Verdict = { meets: boolean; failing: string[]; informationMet: boolean; methodMet: boolean };

const share = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 1000 : 1);
const pct = (x: number) => `${Math.round(x * 100)}%`;
const shareOf = (xs: { state: ItemState }[]): Share => { const a = xs.filter((x) => x.state === 'answered').length; return { applicable: xs.length, answered: a, share: share(a, xs.length) }; };
const cond = (id: string, kind: Condition['kind'], text: string, met: boolean, detail: string): Condition => ({ id, kind, text, met, detail });

export function evaluateInformationSufficiency(input: SufficiencyInput): SufficiencyResult {
  const T = CANDIDATE_THRESHOLDS;
  const tier1 = shareOf(input.confirmations.filter((c) => c.tier === 1));
  const tier23 = shareOf(input.confirmations.filter((c) => c.tier !== 1));
  const all = shareOf(input.confirmations);
  const areas = [...new Set(input.confirmations.map((c) => c.area))];
  const byArea = areas.map((area) => ({ area, ...shareOf(input.confirmations.filter((c) => c.area === area)) }));
  const diag = shareOf(input.diagnostics);
  const diagnostics = {
    ...diag,
    declined: input.diagnostics.filter((d) => d.state === 'declined').length,
    unknown: input.diagnostics.filter((d) => d.state === 'unknown').length,
    waiting: input.diagnostics.filter((d) => d.state === 'waiting').length,
    openScenariosWithNoDiagnosticAnswer: input.openScenarios
      .filter((s) => { const ds = input.diagnostics.filter((d) => d.scenario === s.id); return ds.length > 0 && ds.every((d) => d.state !== 'answered'); })
      .map((s) => s.id)
  };
  const functions = input.functions.map((f) => ({ ...f, declinedInFull: f.items > 0 && f.declined === f.items }));
  const govDiag = shareOf(input.diagnostics.filter((d) => GOVERNANCE_AREAS.includes(d.area)));
  const govConf = input.confirmations.filter((c) => GOVERNANCE_AREAS.includes(c.area));
  const thinAreas = (min: number) => byArea.filter((a) => a.share < min);
  const names = (xs: string[]) => xs.join(', ');

  const deliverables: Deliverable[] = [];
  const add = (product: Deliverable['product'], id: string, promise: string, conditions: Condition[]) => deliverables.push({ product, id, promise, conditions, meets: conditions.every((c) => c.met) });

  add('essential', 'E-FINDINGS', 'Detailed analysis across all applicable areas', [
    cond('EF-1', 'information', 'The core stage is complete: every applicable tier 1 confirmation has been reached.', input.stages.core.complete, `${input.stages.core.answered} of ${input.stages.core.applicableSoFar} reached so far`),
    cond('EF-2', 'information', 'The breadth stage is complete: every applicable confirmation, in every tier, has been reached.', input.stages.breadth.complete, `${input.stages.breadth.answered} of ${input.stages.breadth.applicableSoFar} reached so far`),
    cond('EF-3', 'information', `At least ${pct(T.essentialTier1Answered)} of tier 1 confirmations are answered.`, tier1.share >= T.essentialTier1Answered, `${tier1.answered} of ${tier1.applicable}`),
    cond('EF-4', 'information', `At least ${pct(T.essentialTier23Answered)} of tier 2 and 3 confirmations are answered.`, tier23.share >= T.essentialTier23Answered, `${tier23.answered} of ${tier23.applicable}`),
    cond('EF-5', 'information', `Every applicable area has at least ${pct(T.essentialAreaMinimum)} of its confirmations answered.`, !thinAreas(T.essentialAreaMinimum).length, thinAreas(T.essentialAreaMinimum).length ? `below in ${names(thinAreas(T.essentialAreaMinimum).map((a) => `${a.area} (${a.answered} of ${a.applicable})`))}` : `${areas.length} areas`)
  ]);
  const essentialMissing = input.essentialControls.filter((c) => !c.inLibrary).map((c) => c.id);
  add('essential', 'E-ACTIONS', 'Management actions, a 30/60/90-day roadmap and the records each action needs', [
    cond('EA-1', 'information', 'The organisation has said who has final oversight, so the roadmap can say to whom progress is reported.', !!input.oversight, input.oversight ? 'answered' : 'not answered'),
    cond('EA-2', 'method', 'Every control the Essential recommends has a target practice, records and a success measure in the control library.', !essentialMissing.length, essentialMissing.length ? `${essentialMissing.length} without library content: ${names(essentialMissing.slice(0, 8))}` : `${input.essentialControls.length} controls`)
  ]);
  add('comprehensive', 'C-FINDINGS', 'The full finding register and the fraud risk register', [
    cond('CF-1', 'information', `At least ${pct(T.comprehensiveTier1Answered)} of tier 1 confirmations are answered.`, tier1.share >= T.comprehensiveTier1Answered, `${tier1.answered} of ${tier1.applicable}`),
    cond('CF-2', 'information', `At least ${pct(T.comprehensiveAllAnswered)} of all confirmations are answered.`, all.share >= T.comprehensiveAllAnswered, `${all.answered} of ${all.applicable}`),
    cond('CF-3', 'information', `Every applicable area has at least ${pct(T.comprehensiveAreaMinimum)} of its confirmations answered.`, !thinAreas(T.comprehensiveAreaMinimum).length, thinAreas(T.comprehensiveAreaMinimum).length ? `below in ${names(thinAreas(T.comprehensiveAreaMinimum).map((a) => `${a.area} (${a.answered} of ${a.applicable})`))}` : `${areas.length} areas`)
  ]);
  const blueprintMissing = input.blueprintControls.filter((c) => !c.inLibrary).map((c) => c.id);
  add('comprehensive', 'C-BLUEPRINTS', 'A target-state blueprint for each control the report acts on', [
    cond('CB-1', 'information', `At least ${pct(T.diagnosticAnswered)} of the diagnostic questions put to the organisation are answered (declined, "I don't know" and waiting count as not answered; questions never asked are not counted).`, diagnostics.share >= T.diagnosticAnswered, `${diagnostics.answered} of ${diagnostics.applicable}; ${diagnostics.declined} declined, ${diagnostics.unknown} not known, ${diagnostics.waiting} waiting`),
    cond('CB-2', 'information', 'No scenario the report acts on has every diagnostic question asked about it declined, not known or waiting.', !diagnostics.openScenariosWithNoDiagnosticAnswer.length, diagnostics.openScenariosWithNoDiagnosticAnswer.length ? `${diagnostics.openScenariosWithNoDiagnosticAnswer.length} scenarios: ${names(diagnostics.openScenariosWithNoDiagnosticAnswer.slice(0, 8))}` : `${input.openScenarios.length} scenarios acted on`),
    cond('CB-3', 'method', 'Every blueprint control has library content: target practice, activities, records and a success measure.', !blueprintMissing.length, blueprintMissing.length ? `${blueprintMissing.length} without library content: ${names(blueprintMissing.slice(0, 8))}` : `${input.blueprintControls.length} controls`)
  ]);
  const govDeclined = functions.filter((f) => GOVERNANCE_FUNCTIONS.includes(f.fn) && f.declinedInFull).map((f) => f.fn);
  const govConfMissing = govConf.filter((c) => c.state !== 'answered').map((c) => c.id);
  add('comprehensive', 'C-GOVERNANCE', 'Governance analysis and the leadership decision library', [
    cond('CG-1', 'information', 'The organisation has said who has final oversight.', !!input.oversight, input.oversight ? 'answered' : 'not answered'),
    cond('CG-2', 'information', 'Every governance and fraud risk assessment confirmation is answered.', !govConfMissing.length, govConfMissing.length ? `${govConfMissing.length} not answered: ${names(govConfMissing.slice(0, 8))}` : `${govConf.length} answered`),
    cond('CG-3', 'information', `At least ${pct(T.governanceDiagnosticAnswered)} of governance and risk assessment diagnostic questions asked are answered, and neither governance function declined its package in full.`, govDiag.share >= T.governanceDiagnosticAnswered && !govDeclined.length, `${govDiag.answered} of ${govDiag.applicable} answered${govDeclined.length ? `; declined in full: ${names(govDeclined)}` : ''}`)
  ]);
  const declinedInFull = functions.filter((f) => f.declinedInFull).map((f) => f.fn);
  const waitingWith = functions.filter((f) => f.waiting > 0).map((f) => `${f.fn} (${f.waiting})`);
  const unreviewedPrereq = input.prerequisites.filter((p) => !p.reviewed);
  add('comprehensive', 'C-PROGRAMME', 'The implementation programme, with dependencies, owners and completion tests', [
    cond('CP-1', 'information', 'No function declined its package in full.', !declinedInFull.length, declinedInFull.length ? `declined in full: ${names(declinedInFull)}` : `${functions.length} functions`),
    cond('CP-2', 'information', 'No question put to a function is still waiting for its answer, so the programme assigns work from complete answers.', !waitingWith.length, waitingWith.length ? `waiting with: ${names(waitingWith)}` : 'none waiting'),
    cond('CP-3', 'method', 'Every prerequisite the programme uses rests on reviewed dependency semantics.', !unreviewedPrereq.length, `${input.prerequisites.length} prerequisite links${unreviewedPrereq.length ? `, ${unreviewedPrereq.length} not reviewed` : ''}`)
  ]);

  const verdict = (ds: Deliverable[]): Verdict => {
    const conds = ds.flatMap((d) => d.conditions);
    return { meets: ds.every((d) => d.meets), failing: conds.filter((c) => !c.met).map((c) => c.id), informationMet: conds.filter((c) => c.kind === 'information').every((c) => c.met), methodMet: conds.filter((c) => c.kind === 'method').every((c) => c.met) };
  };
  const ess = deliverables.filter((d) => d.product === 'essential');
  return {
    rule: SUFFICIENCY_RULE_VERSION, status: 'candidate-rules-not-approved', thresholds: T,
    stages: { core: input.stages.core.complete ? 'complete' : 'incomplete', breadth: input.stages.breadth.complete ? 'complete' : 'incomplete' },
    outstanding: {
      total: input.outstanding.length,
      declined: input.outstanding.filter((o) => o.reason === 'declined').length,
      notKnown: input.outstanding.filter((o) => o.reason.startsWith('not-known')).length,
      waiting: input.outstanding.filter((o) => o.reason === 'waiting').length,
      onConfirmations: input.outstanding.filter((o) => o.role === 'confirm').length
    },
    coverage: { tier1, tier23, all, byArea },
    diagnostics, functions, deliverables,
    release: { essential: verdict(ess), comprehensive: verdict(deliverables) },
    notExpectedBySize: input.notExpected ?? 0
  };
}
