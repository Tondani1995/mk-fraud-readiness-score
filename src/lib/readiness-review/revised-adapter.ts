import type { ControlRecord, ReportInput, StagedReportInput } from './report-input';

/**
 * Revised-methodology input adapter (inactive for customer scoring).
 *
 * Turns a review report input (1.2.0 or the staged 1.3.0) into a methodology-neutral context that a revised calculator
 * and the existing report engines could read: the scenario-confirmation population with each control's category,
 * class and level, the scenario picture, outstanding information by accountable function, and, for staged sessions,
 * the stages and the recorded consistency outcomes. It computes no score, band, weight, cap or adjustment, and nothing
 * outside the fictional harness and its tests imports it. Every value comes from the input; nothing is inferred.
 */
export const REVISED_ADAPTER_VERSION = '0.1.0';

const LEVEL_CLASS: Record<string, string> = { '0': 'absent', '1': 'partial', '2': 'partial', '3': 'partial', '4': 'full', '5': 'full' };
const CATEGORY: Record<string, string> = {
  reported: 'known', reused: 'known', na: 'not-applicable', waiting: 'unknown-or-with-function', unconfirmed: 'not-reached',
  'scope-unconfirmed': 'applicability-not-known', prerequisite: 'applicability-not-known', 'waiting-scope': 'applicability-not-known', assumed: 'applicability-not-known',
  outofscope: 'excluded', proportion: 'excluded', precluded: 'excluded', retired: 'excluded'
};

export type RevisedConfirmation = {
  id: string; domain: string; scenario: string; tier: number; format: string | null; category: string;
  level: number | null; class: string | null; answerSource: string | null; waitingFunction: string | null;
};

export function toRevisedAssessmentContext(input: ReportInput | StagedReportInput) {
  const controls: ControlRecord[] = (input.domains as { controls: ControlRecord[] }[]).flatMap((d) => d.controls);
  const confirmations: RevisedConfirmation[] = controls.filter((c: ControlRecord) => c.role === 'confirm' && c.type === 'practice' && c.scenario).map((c: ControlRecord) => {
    const v = c.answer ? String(c.answer.value) : null;
    const level = c.format === 'anchored' && v !== null && /^[0-5]$/.test(v) && c.state === 'reported' ? Number(v) : null;
    const cls = c.state === 'reported' || c.state === 'reused' ? (level !== null ? LEVEL_CLASS[String(level)] : c.class) : null;
    return { id: c.id, domain: c.domain.id, scenario: c.scenario!.id, tier: c.scenario!.tier, format: c.format, category: c.state === 'reported' && c.class === 'noinstance' ? 'no-case-yet' : CATEGORY[c.state] ?? 'unclassified', level, class: cls ?? null, answerSource: c.answer?.source ?? null, waitingFunction: c.waiting?.function ?? null };
  });
  const byFunction: Record<string, string[]> = {};
  for (const w of input.openWork.waiting) { const fn = w.function ?? 'Not assigned'; (byFunction[fn] ??= []).push(w.id); }
  const staged = 'staged' in input ? input.staged : null;
  return {
    adapter: REVISED_ADAPTER_VERSION,
    inputContract: input.contract.version,
    lineage: { sessionId: input.lineage.sessionId, logDigest: input.lineage.logDigest, engineBuild: input.lineage.ruleset.engine.build },
    scoring: { status: 'inactive' as const, reason: 'No revised scoring method is approved. This context carries no score, band, weight, cap or adjustment.' },
    confirmations,
    population: confirmations.reduce((a, c) => ((a[c.category] = (a[c.category] ?? 0) + 1), a), {} as Record<string, number>),
    scenarios: (input.scenarios as { id: string; tier: number; domain: string; status: string; established: string | null }[]).map((s) => ({ id: s.id, tier: s.tier, domain: s.domain, status: s.status, established: s.established })),
    outstandingByFunction: byFunction,
    stages: staged ? staged.stages : null,
    consistency: staged ? { eligible: staged.consistency.eligible, selected: staged.consistency.selected, answered: staged.consistency.answered, untested: staged.consistency.untested, outcomes: staged.consistency.checks.map((c: any) => ({ confirmation: c.confirmation, followup: c.followup, outcome: c.outcome })), applied: false } : null
  };
}
export type RevisedAssessmentContext = ReturnType<typeof toRevisedAssessmentContext>;
