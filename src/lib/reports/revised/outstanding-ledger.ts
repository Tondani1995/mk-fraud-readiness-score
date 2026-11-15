/**
 * Outstanding-information ledger for revised (build 1.6) reports.
 *
 * Independent review of 13 November 2026, finding R-1: the assessment, the Snapshot and the report counted outstanding
 * information in different units, so a customer saw "20 outstanding" on the assessment and 13 rows in the report (Kestrel)
 * or "2 outstanding" and 1 row (Marula), with no explanation. The engine's own measure mixes three units: questions a
 * function holds (declined, or answered "I don't know"), confirmation rows the interview has not reached, and scenario rows
 * whose applicability is not settled. The report register listed control questions only, so context and applicability
 * facts answered "I don't know" disappeared from it.
 *
 * This module changes nothing the engine decides. It reads the bound report input and lists, item by item:
 *   questions     every question asked and not answered (control, context or applicability), with its provenance;
 *   heldBack      questions not yet asked because whether they apply depends on an outstanding answer;
 *   scenarios     scenarios whose position cannot be established yet, and the outstanding answers that hold them;
 * and reconciles those items to the assessment's count, unit by unit, so that every outstanding item is accounted for and
 * no unknown, unasked or unresolved applicability is presented as a control in place or a control missing.
 */
import type { StagedReportInput } from '@/lib/readiness-review/report-input';

type Answer = { value: unknown; by?: string; at?: string; via?: string; source?: string; label?: string } | null;
type Control = {
  id: string; key?: string; text: string; type: string; role?: string | null; state?: string | null; answer?: Answer;
  domain?: { id: string; name: string } | null; scenario?: { id: string; name: string; tier: number } | null;
  waiting?: { owner?: string | null; function?: string | null; provenance?: { kind?: string; label?: string } } | null;
  scope?: { decidedBy?: string | null; decidedByKey?: string | null } | null;
};
type Scenario = { id: string; status: string; tier: number; domain: string; name: string; confirmations: { id: string; state: string }[]; undecided?: { facts: string[]; state: string; questions: string[] }[] };
type Package = { id: string; status: string; function: string; declineReason: string | null };

export const LEDGER_VERSION = 'outstanding-ledger-1.0';
const EXCLUDED = ['outofscope', 'proportion', 'precluded', 'retired'];
const HELD_BY_FUNCTION = ['declined', 'owner-unknown'];
const PACKAGE_SETTLED = ['returned', 'declined', 'owner-unknown'];

export type LedgerItemType = 'control' | 'context' | 'applicability';
export type LedgerReason = 'declined' | 'not-known-by-function' | 'not-known-by-respondent' | 'waiting';
export const ITEM_TYPE_LABEL: Record<LedgerItemType, string> = {
  control: 'Control question', context: 'Context question', applicability: 'Whether a scenario applies'
};
export const LEDGER_REASON_TEXT: Record<LedgerReason, string> = {
  declined: 'Declined by the function it was sent to',
  'not-known-by-function': 'The function answered “I don’t know”',
  'not-known-by-respondent': 'The respondent answered “I don’t know”',
  waiting: 'Waiting for an answer'
};

export type LedgerQuestion = {
  id: string; key: string; question: string; itemType: LedgerItemType; role: string | null; reason: LedgerReason;
  fn: string | null; declineReason: string | null; area: string | null; scenarioId: string | null; scenarioName: string | null;
  provenance: { answeredBy: string | null; at: string | null; via: string | null; packageStatus: string | null };
  /** Questions not yet asked because whether they apply depends on this answer. */
  holdsBack: string[];
};
export type HeldBackQuestion = { id: string; key: string; role: string | null; scenarioId: string | null; decidedBy: string; decidedByKey: string | null };
export type UnestablishedScenario = { id: string; name: string; tier: number; area: string; reason: 'applicability-outstanding' | 'confirmations-not-reached'; dependsOn: string[] };
export type ReconciliationLine = { measure: 'declined' | 'unknownToFunction' | 'withFunctions' | 'notReached'; label: string; count: number; unit: string; ids: string[] };
export type OutstandingLedger = {
  version: string;
  questions: LedgerQuestion[];
  heldBack: HeldBackQuestion[];
  scenarios: UnestablishedScenario[];
  reconciliation: {
    assessment: { notReached: number; withFunctions: number; declined: number; unknownToFunction: number; total: number };
    recomputed: { notReached: number; withFunctions: number; declined: number; unknownToFunction: number; total: number };
    matches: boolean;
    lines: ReconciliationLine[];
    /** Items the assessment count includes that are not themselves questions asked (rows held by an outstanding answer). */
    consequentialRows: { id: string; kind: 'confirmation' | 'scenario'; heldBy: string[] }[];
    /** Questions listed in the ledger that the assessment's measure does not count (for example a respondent's own "I don't know"). */
    notInAssessmentCount: string[];
    statement: string;
  };
};

const isUnknown = (a: Answer) => !!a && (a.value === 'unknown' || (Array.isArray(a.value) && (a.value as unknown[]).includes('unknown')));
const itemTypeOf = (c: Control): LedgerItemType => (c.type === 'applicability' ? 'applicability' : c.type === 'context' ? 'context' : 'control');
const WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const n = (k: number, one: string, many: string) => `${k <= 10 ? WORDS[k] : k} ${k === 1 ? one : many}`;

/**
 * Same rule as the evidence model's `outstandingOf`, applied to every item type: a question waiting for someone, or one
 * answered "I don't know", or declined. A supporting practice in a handed area that nobody is ever asked is not
 * outstanding (it is not established), and a question waiting only on its applicability is held back, not asked.
 */
function outstandingQuestion(c: Control, declined: boolean): boolean {
  if (declined) return true;
  const kind = c.waiting?.provenance?.kind;
  if (c.waiting) return kind !== 'scope-waiting' && (c.role === 'confirm' || kind !== 'area' || !!c.answer);
  return isUnknown(c.answer ?? null);
}

export function buildOutstandingLedger(input: StagedReportInput): OutstandingLedger {
  const controls = (input.domains as { controls: Control[] }[]).flatMap((d) => d.controls);
  const byId = new Map(controls.map((c) => [c.id, c]));
  const scenarios = input.scenarios as Scenario[];
  const staged = input.staged as { packages: Package[]; areaDelegations?: { domain: string }[]; stages?: { breadth?: { open: number } } };
  const packages = new Map(staged.packages.map((p) => [p.id, p]));
  const handedAreas = new Set((staged.areaDelegations ?? []).map((d) => d.domain));

  // ---- Questions asked and not answered (every item type).
  const asked = controls.filter((c) => c.state !== 'outofscope' && outstandingQuestion(c, packages.get(c.id)?.status === 'declined'));
  const heldBack: HeldBackQuestion[] = controls
    .filter((c) => c.state === 'waiting-scope' && !!c.scope?.decidedBy)
    .map((c) => ({ id: c.id, key: c.key ?? c.id, role: c.role ?? null, scenarioId: c.scenario?.id ?? null, decidedBy: c.scope!.decidedBy!, decidedByKey: c.scope?.decidedByKey ?? null }));
  const questions: LedgerQuestion[] = asked.map((c) => {
    const p = packages.get(c.id) ?? null;
    const by = c.answer?.by ?? null;
    const reason: LedgerReason = p?.status === 'declined' ? 'declined'
      : isUnknown(c.answer ?? null) ? (by && by !== 'Respondent' ? 'not-known-by-function' : 'not-known-by-respondent') : 'waiting';
    return {
      id: c.id, key: c.key ?? c.id, question: c.text, itemType: itemTypeOf(c), role: c.role ?? null, reason,
      fn: p?.function ?? c.waiting?.function ?? (by && by !== 'Respondent' ? by : null), declineReason: p?.declineReason ?? null,
      area: c.domain?.id ?? null, scenarioId: c.scenario?.id ?? null, scenarioName: c.scenario?.name ?? null,
      provenance: { answeredBy: by, at: c.answer?.at ?? null, via: c.answer?.via ?? null, packageStatus: p?.status ?? null },
      holdsBack: heldBack.filter((h) => h.decidedBy === c.id).map((h) => h.id)
    };
  });
  const questionIds = new Set(questions.map((q) => q.id));

  // ---- Scenarios whose position cannot be established: no confirmation reported, none outstanding as a question.
  const unestablished: UnestablishedScenario[] = scenarios
    .filter((s) => s.status !== 'outofscope')
    .flatMap((s) => {
      const confs = s.confirmations.filter((c) => !EXCLUDED.includes(c.state));
      if (!s.confirmations.length && s.status === 'waiting') {
        const facts = [...new Set((s.undecided ?? []).flatMap((u) => u.facts))];
        return [{ id: s.id, name: s.name, tier: s.tier, area: s.domain, reason: 'applicability-outstanding' as const, dependsOn: facts }];
      }
      const notReached = confs.filter((c) => !['reported', 'reused', 'na', 'waiting'].includes(c.state));
      if (confs.length && notReached.length === confs.length) {
        const facts = [...new Set(notReached.map((c) => byId.get(c.id)?.scope?.decidedBy).filter((x): x is string => !!x))];
        return [{ id: s.id, name: s.name, tier: s.tier, area: s.domain, reason: facts.length ? 'applicability-outstanding' as const : 'confirmations-not-reached' as const, dependsOn: facts }];
      }
      return [];
    });

  // ---- Recompute the engine's rows (build 1.6 `stages`) so each unit of the assessment's count can be named.
  const rows: { id: string; kind: 'confirmation' | 'scenario'; state: string; handedArea: boolean }[] = [];
  const seen = new Set<string>();
  for (const s of scenarios) {
    if (s.status === 'outofscope') continue;
    if (!s.confirmations.length) { rows.push({ id: s.id, kind: 'scenario', state: s.status === 'waiting' ? 'waiting' : 'scope-unconfirmed', handedArea: handedAreas.has(s.domain) }); continue; }
    for (const c of s.confirmations) {
      if (seen.has(c.id)) continue; seen.add(c.id);
      rows.push({ id: c.id, kind: 'confirmation', state: c.state, handedArea: handedAreas.has(byId.get(c.id)?.domain?.id ?? '') });
    }
  }
  const applicable = rows.filter((r) => !EXCLUDED.includes(r.state));
  const statusOf = (id: string) => packages.get(id)?.status ?? null;
  const notReachedRow = (r: { state: string }) => !['reported', 'reused', 'na', 'waiting'].includes(r.state);
  const handedRows = applicable.filter((r) => (r.state === 'waiting' && !HELD_BY_FUNCTION.includes(statusOf(r.id) ?? '')) || (notReachedRow(r) && r.handedArea));
  const openRows = applicable.filter((r) => notReachedRow(r) && !r.handedArea);
  const pk = [...packages.values()];
  const openPackages = pk.filter((p) => !PACKAGE_SETTLED.includes(p.status));
  const declinedPk = pk.filter((p) => p.status === 'declined');
  const unknownPk = pk.filter((p) => p.status === 'owner-unknown');
  const recomputed = {
    notReached: openRows.length, withFunctions: handedRows.length + openPackages.length, declined: declinedPk.length, unknownToFunction: unknownPk.length,
    total: 0
  };
  recomputed.total = recomputed.notReached + recomputed.withFunctions + recomputed.declined + recomputed.unknownToFunction;
  const assessment = (input.assessmentStatus as { outstanding: OutstandingLedger['reconciliation']['assessment'] }).outstanding;
  const matches = (['notReached', 'withFunctions', 'declined', 'unknownToFunction', 'total'] as const).every((k) => assessment[k] === recomputed[k]);

  const lines: ReconciliationLine[] = [
    { measure: 'declined', label: 'Declined by a function', count: declinedPk.length, unit: 'question', ids: declinedPk.map((p) => p.id) },
    { measure: 'unknownToFunction', label: 'A function answered “I don’t know”', count: unknownPk.length, unit: 'question', ids: unknownPk.map((p) => p.id) },
    { measure: 'withFunctions', label: 'With a function, or waiting on an answer a function holds', count: handedRows.length + openPackages.length, unit: 'question or scenario row', ids: [...handedRows.map((r) => r.id), ...openPackages.map((p) => p.id)] },
    { measure: 'notReached', label: 'Not yet reached', count: openRows.length, unit: 'confirmation row', ids: openRows.map((r) => r.id) }
  ];

  // A counted row that is not itself an outstanding question is held by one (its applicability is outstanding).
  const heldByOf = (id: string, kind: 'confirmation' | 'scenario') => {
    if (kind === 'scenario') return unestablished.find((u) => u.id === id)?.dependsOn ?? [];
    const d = byId.get(id)?.scope?.decidedBy;
    return d ? [d] : [];
  };
  const consequentialRows = [...handedRows, ...openRows]
    .filter((r) => !questionIds.has(r.id))
    .map((r) => ({ id: r.id, kind: r.kind, heldBy: heldByOf(r.id, r.kind) }));
  const counted = new Set([...declinedPk, ...unknownPk, ...openPackages].map((p) => p.id).concat(handedRows.map((r) => r.id), openRows.map((r) => r.id)));
  const notInAssessmentCount = questions.filter((q) => !counted.has(q.id)).map((q) => q.id);

  const byType = (t: LedgerItemType) => questions.filter((q) => q.itemType === t).length;
  const typeParts = [
    byType('control') ? n(byType('control'), 'control question', 'control questions') : null,
    byType('context') ? n(byType('context'), 'context question', 'context questions') : null,
    byType('applicability') ? n(byType('applicability'), 'question about whether a scenario applies', 'questions about whether a scenario applies') : null
  ].filter(Boolean) as string[];
  const confRows = consequentialRows.filter((r) => r.kind === 'confirmation').length;
  const scenRows = consequentialRows.filter((r) => r.kind === 'scenario').length;
  const consequential = [
    confRows ? n(confRows, 'confirmation that cannot be asked', 'confirmations that cannot be asked') : null,
    scenRows ? n(scenRows, 'scenario whose applicability cannot be settled', 'scenarios whose applicability cannot be settled') : null
  ].filter(Boolean) as string[];
  const statement = !questions.length && !consequentialRows.length
    ? 'No information is outstanding.'
    : `The assessment records ${assessment.total} outstanding. ${questions.length === 1 ? 'One question was' : `${cap(n(questions.length, 'question', 'questions'))} were`} asked and not answered`
      + `${typeParts.length ? ` (${typeParts.join(', ')})` : ''}`
      + `${consequential.length ? `; the remaining ${consequentialRows.length <= 10 ? WORDS[consequentialRows.length] : consequentialRows.length} ${consequentialRows.length === 1 ? 'is' : 'are'} ${consequential.join(' and ')} until one of those answers is given` : ''}.`
      + `${notInAssessmentCount.length ? ` ${n(notInAssessmentCount.length, 'question', 'questions')} answered “I don’t know” by the respondent ${notInAssessmentCount.length === 1 ? 'is' : 'are'} listed here as well.` : ''}`;

  return {
    version: LEDGER_VERSION, questions, heldBack, scenarios: unestablished,
    reconciliation: { assessment, recomputed, matches, lines, consequentialRows, notInAssessmentCount, statement }
  };
}
