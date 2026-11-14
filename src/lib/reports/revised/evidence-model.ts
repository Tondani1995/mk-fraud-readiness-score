import coverage from '@/lib/readiness-review/data/coverage-map-v1.3.json' with { type: 'json' };
import bank from '@/lib/readiness-review/data/bank-v1.3.json' with { type: 'json' };
import type { StagedReportInput, ControlRecord } from '@/lib/readiness-review/report-input';
import { CLASS_SHORT, controlName, contentGaps, improvingText, methodOwner, recordsText, reportedText, standardText, type ContentGap } from './answer-text';
import { classifyRelation, relationLabel, UNRESOLVED, type Relation } from './relationships';
import { consolidatedRole, oversightBody, roleMap } from './roles';
import { evaluateInformationSufficiency, type ItemState, type SufficiencyResult } from './information-sufficiency';
import { controlContent, CONTROL_CONTENT_VERSION } from './control-content/index';
import { buildOutstandingLedger, ITEM_TYPE_LABEL, type LedgerItemType, type OutstandingLedger } from './outstanding-ledger';

/**
 * FICTIONAL INTEGRATION PROTOTYPE. Not used by any customer path.
 *
 * The revised report model: everything the Essential and Comprehensive prototypes say, built once from a staged review
 * session (report input 1.3.0), the draft method's own content (bank 1.3, coverage map 1.3) and the draft control-content
 * library. The unit of analysis is the fraud scenario. Nothing is scored, rated, weighted or ranked here.
 *
 * Corrections made on MK's direction of 12 November (second direction):
 *  - Relationships follow relationship-review-0.2: "not applicable" has no relationship; routing is never read as a
 *    dependency; an unreviewed pair is not established; documentation gaps are not proof that a control cannot operate.
 *    A reviewed pair the answers leave open becomes a question for management (scenario kind "clarify").
 *  - Scenarios are listed in the method's own order (area, then scenario), never by kind, tier or count, and the
 *    report references follow that order, so neither a number nor a position implies a ranking.
 *  - The R-1 threshold is withdrawn. The reports state four things separately and consistently: the calculated test
 *    result, the unresolved inconsistencies, a provisional interpretation of the answers and the approved readiness
 *    conclusion (none). The model supplies the facts for the second and third.
 *  - Control guidance comes from the control-content library, not from generic wording.
 *  - Prerequisites come only from reviewed dependency semantics; planning stages are proposals, not deadlines.
 *  - Information sufficiency is evaluated per promised deliverable (information-sufficiency-candidate-0.2).
 */

export const REVISED_REPORT_MODEL_VERSION = 'revised-report-model-prototype-0.4.0';
export const REVISED_METHOD_LABEL = 'Review bank 1.3 (draft, not approved by MK)';

type Cov = {
  scenarios: { id: string; domain: string; name: string; tier: number; how?: string | null; why?: string | null }[];
  crossObjectives: { id: string; name: string; questions: string[] }[];
};
type BankShape = { domains: { id: string; name: string; bank: { risks?: Record<string, string>; modules: { id: string; owner?: string; questions: { id: string; risks?: string[] }[] } [] } }[] };
const COV = coverage as unknown as Cov;
const BANK = bank as unknown as BankShape;
const AREA_NAME = new Map(BANK.domains.map((d) => [d.id, d.name]));
const AREA_ORDER = new Map(BANK.domains.map((d, i) => [d.id, i]));
const AREA_LEAD = new Map(BANK.domains.map((d) => [d.id, consolidatedRole(d.bank.modules[0]?.owner)]));
const SCENARIO = new Map(COV.scenarios.map((s) => [s.id, s]));
const RISK_NAME = new Map(BANK.domains.flatMap((d) => d.bank.modules.flatMap((m) => m.questions.map((q) => [q.id, (q.risks ?? []).map((r) => d.bank.risks?.[r]).filter(Boolean) as string[]] as const))));

/** The domain code used inside the existing engines. Namespaced so MFRS domain weights can never apply to a bank area. */
export const revisedDomainCode = (bankArea: string) => `R${bankArea}`;
/** Short area names for prose: one concept each, so that a list of areas never nests an "and" inside another. */
export const AREA_SHORT: Record<string, string> = { D1: 'governance', D2: 'fraud risk assessment', D3: 'ethics', D4: 'procurement', D5: 'people', D6: 'finance', D7: 'customers', D8: 'assets', D9: 'digital channels', D10: 'detection' };
/** A scenario name is a sentence ("Ghost employees are paid"); this lets it sit inside another sentence. */
export const schemeWhere = (name: string) => `the scenario where ${lc(String(name).replace(/\.$/, ''))}`;
/** Bank IDs, scenario IDs and risk codes must never reach customer prose. */
export const REVISED_RAW_ID = /\b(?:D\d{1,2}-[A-Z]{1,2}-\d{2}|FS-D\d{1,2}-\d{2}|OBJ-[A-Z0-9-]+|PR-\d{2}|R\d{1,2}\b(?=[,.;: ]))/;
/** The method's order: area, then scenario number. */
export const methodOrder = (a: { area: string; id: string }, b: { area: string; id: string }) =>
  (AREA_ORDER.get(a.area) ?? 0) - (AREA_ORDER.get(b.area) ?? 0) || a.id.localeCompare(b.id, 'en', { numeric: true });

const GAP = new Set(['absent', 'partial', 'designed']);
const SEVERITY_WORDING: Record<string, number> = { absent: 0, designed: 1, partial: 2 };
const lc = (s: string) => (s && !/^[A-Z]{2,}|^I\b/.test(s) ? s.charAt(0).toLowerCase() + s.slice(1) : s);
const sentence = (s: string) => { const t = String(s ?? '').trim(); return t ? (/[.!?]$/.test(t) ? t : `${t}.`) : ''; };
const noStop = (s: string) => String(s ?? '').trim().replace(/\.$/, '');
const unique = <T,>(xs: T[]) => [...new Set(xs.filter((x) => x !== null && x !== undefined && (x as unknown) !== ''))];
export const joinList = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const pad = (p: string, n: number) => `${p}${String(n).padStart(2, '0')}`;

/** "2 were declined and 5 were not known": only the reasons that occur, never "0 were declined". */
export function outstandingPhrase(items: { reason: string }[]): string {
  const d = items.filter((o) => o.reason === 'declined').length;
  const n = items.filter((o) => o.reason.startsWith('not-known')).length;
  const w = items.filter((o) => o.reason === 'waiting').length;
  return joinList([d ? `${d} ${d === 1 ? 'was' : 'were'} declined` : '', n ? `${n} ${n === 1 ? 'was' : 'were'} not known` : '', w ? `${w} ${w === 1 ? 'is' : 'are'} waiting` : ''].filter(Boolean));
}
/** Where the gap scenarios sit, as a count: the areas holding them, in the method's order. Never a rating. */
export function concentration(areaCounts: [string, number][], total: number): string {
  const ordered = [...areaCounts].sort((x, y) => (AREA_ORDER.get(x[0]) ?? 0) - (AREA_ORDER.get(y[0]) ?? 0));
  return `${total === 1 ? 'in' : 'across'} ${plural(ordered.length, 'area', 'areas')}`;
}

// ------------------------------------------------------------------------------------------------ analysis

export type ControlView = {
  id: string; key: string; format: string; cls: string | null; level: number | null; role: string; schemeRole: string | null;
  reported: string; stateShort: string; standard: string | null; improving: string | null; records: string | null;
  methodOwner: string | null; ownerRole: string; answeredBy: string; outstanding: boolean; questionText: string;
  answerLabel: string | null; contentGaps: ContentGap[];
};
export type SchemeKind = 'gap' | 'contradiction' | 'dependency' | 'clarify' | 'qualified' | 'confirmed' | 'outstanding' | 'not-expected' | 'none';
export type SchemeView = {
  id: string; ref: string; name: string; tier: number; area: string; areaName: string; how: string | null; why: string | null;
  kind: SchemeKind; confirmations: ControlView[]; confirmationGaps: ControlView[]; supportingGaps: ControlView[];
  relations: Relation[]; outstanding: ControlView[]; answered: number; inPlace: number; answeredBy: string[];
  methodRisks: string[]; crossCheck: { followup: string; outcome: string } | null;
};
export const KIND_LABEL: Record<SchemeKind, string> = {
  contradiction: 'Answers that cannot both be right', dependency: 'Control lacks an input it needs', clarify: 'Question to clarify',
  gap: 'Control reported as a gap', qualified: 'Control in place; related practice weaker', confirmed: 'Controls reported in place',
  outstanding: 'Answers outstanding', 'not-expected': 'Not expected at this size', none: 'Position not yet established'
};
/** Unresolved inconsistencies: the reported control cannot be treated as covering the scenario until they are settled. */
export const INCONSISTENT: SchemeKind[] = ['contradiction', 'dependency'];
/** Scenarios the report acts on. */
export const OPEN_KINDS: SchemeKind[] = ['contradiction', 'dependency', 'clarify', 'gap', 'qualified'];

/**
 * Information that was asked for and not given: a question waiting for a function, a function's or the respondent's
 * "I don't know", or (counted by the caller) a decline. A supporting practice in an area handed to a function that
 * nobody is ever asked is not outstanding: it is not established. This matches the interface's count (SS-09).
 */
function outstandingOf(c: ControlRecord): boolean {
  const kind = (c.waiting?.provenance as { kind?: string } | undefined)?.kind;
  if (c.waiting) return kind !== 'scope-waiting' && (c.role === 'confirm' || kind !== 'area' || !!c.answer);
  return !!c.answer && (c.answer.value === 'unknown' || (Array.isArray(c.answer.value) && (c.answer.value as unknown[]).includes('unknown')));
}
const NOT_APPLICABLE_STATES = ['outofscope', 'proportion', 'precluded', 'retired'];
/** Customer wording where MK's control-content library has no entry yet (independent review E-2). */
export const METHOD_SETS_NO_MEASURE = 'The method sets no separate success measure for this control; the in-place answer is the target.';
export const METHOD_SETS_NO_ESCALATION = 'The method sets no separate escalation for this control; failures go to its accountable executive.';

export type RevisedAnalysis = ReturnType<typeof analyseStagedInput>;

export function analyseStagedInput(input: StagedReportInput) {
  const controls = (input.domains as { controls: ControlRecord[] }[]).flatMap((d) => d.controls);
  const byId = new Map(controls.map((c) => [c.id, c]));
  const packages = input.staged.packages as { id: string; status: string; function: string; declineReason: string | null; scenario?: string | null }[];
  const declined = new Map(packages.filter((p) => p.status === 'declined').map((p) => [p.id, p]));
  const checks = (input.staged.consistency.checks ?? []) as { scenario: string; confirmation: string; followup: string; outcome: string }[];
  const isOutstanding = (c: ControlRecord) => outstandingOf(c) || declined.has(c.id);

  // A control the method establishes from a wider answer (state "reused") has a class but no answer of its own.
  const reusedFrom = (c: ControlRecord) => (c.state === 'reused' && c.class ? (c as ControlRecord & { reused?: { from: string; why: string } }).reused ?? null : null);
  const known = (c: ControlRecord) => (!!c.answer || !!reusedFrom(c)) && !isOutstanding(c) && !!c.class;
  const view = (c: ControlRecord): ControlView => {
    const level = c.format === 'anchored' && c.answer && /^[0-5]$/.test(String(c.answer.value)) ? Number(c.answer.value) : null;
    const src = reusedFrom(c) ? byId.get(reusedFrom(c)!.from) : null;
    const by = (src ?? c).answer?.by && (src ?? c).answer!.by !== 'Respondent' ? (src ?? c).answer!.by as string : 'the respondent';
    const owner = methodOwner(c.id);
    return {
      id: c.id, key: c.key ?? controlName(c.id), format: c.format ?? '', cls: c.class ?? null, level, role: c.role ?? '', schemeRole: c.role ?? null,
      reported: isOutstanding(c) ? `${c.key ?? controlName(c.id)}: outstanding.`
        : reusedFrom(c) ? `${c.key ?? controlName(c.id)}: established by the answer given for ${lc(controlName(reusedFrom(c)!.from))}. ${sentence(reusedFrom(c)!.why)}`
          : reportedText({ id: c.id, format: c.format, class: c.class, answer: c.answer as { value: unknown } | null }),
      stateShort: isOutstanding(c) ? 'Outstanding' : CLASS_SHORT[c.class ?? ''] ?? (c.answer ? 'Answered' : 'Not answered'),
      standard: standardText(c.id), improving: improvingText(c.id), records: recordsText(c.id), methodOwner: owner, ownerRole: controlContent(c.id).fn ?? consolidatedRole(owner),
      answeredBy: by, outstanding: isOutstanding(c), questionText: c.text, answerLabel: (c.answer?.label as string | undefined) ?? null, contentGaps: contentGaps(c.id)
    };
  };

  const schemes: SchemeView[] = (input.scenarios as { id: string; status: string; tier: number; domain: string; name: string; confirmations: { id: string }[] }[])
    .filter((s) => s.status !== 'outofscope')
    .map((s) => {
      const def = SCENARIO.get(s.id);
      const members = controls.filter((c) => c.scenario?.id === s.id && c.type === 'practice' && ['confirm', 'related', 'followup'].includes(c.role ?? ''));
      const confirmIds = new Set(s.confirmations.map((x) => x.id));
      const confirms = members.filter((c) => confirmIds.has(c.id));
      const supporting = members.filter((c) => !confirmIds.has(c.id));
      const confirmationGaps = confirms.filter((c) => known(c) && GAP.has(c.class!));
      const supportingGaps = supporting.filter((c) => known(c) && GAP.has(c.class!));
      const allFull = confirms.length > 0 && confirms.every((c) => known(c) && c.class === 'full');
      // Relationships are drawn for each confirmation reported fully in place, against every supporting practice of the
      // scenario that is weaker, has had no case yet, or is outstanding. A practice answered "not applicable" is outside
      // scope and has no relationship; a practice reported fully in place needs none.
      const relations = confirms.filter((c) => known(c) && c.class === 'full').flatMap((c) => supporting
        .filter((p) => isOutstanding(p) || (known(p) && (GAP.has(p.class!) || p.class === 'noinstance')))
        .map((p) => classifyRelation({ id: c.id, class: c.class, answer: c.answer as { value: unknown }, outstanding: false }, { id: p.id, class: p.class, answer: p.answer as { value: unknown }, outstanding: isOutstanding(p) }))
        .filter((r): r is Relation => !!r));
      const kind: SchemeKind = confirmationGaps.length ? 'gap'
        : allFull && relations.some((r) => r.type === 'direct-contradiction') ? 'contradiction'
          : allFull && relations.some((r) => r.type === 'necessary-dependency') ? 'dependency'
            : allFull && relations.some((r) => r.type === 'not-established' && !!r.question) ? 'clarify'
              : allFull && supportingGaps.length ? 'qualified'
                : allFull ? 'confirmed'
                  : confirms.some(isOutstanding) ? 'outstanding'
                    // The method's proportionality rule does not ask these confirmations of an organisation of this size.
                    : confirms.length && confirms.every((c) => c.state === 'proportion') ? 'not-expected' : 'none';
      const check = checks.find((c) => c.scenario === s.id) ?? null;
      return {
        id: s.id, ref: '', name: def?.name ?? s.name, tier: s.tier, area: s.domain, areaName: AREA_NAME.get(s.domain) ?? s.domain,
        how: def?.how ?? null, why: def?.why ?? null, kind,
        confirmations: confirms.map(view), confirmationGaps: confirmationGaps.map(view), supportingGaps: supportingGaps.map(view), relations,
        outstanding: members.filter(isOutstanding).map(view), answered: members.filter(known).length, inPlace: members.filter((c) => known(c) && c.class === 'full').length,
        answeredBy: unique(members.filter(known).map((c) => (c.answer?.by && c.answer.by !== 'Respondent' ? c.answer.by : 'the respondent'))),
        methodRisks: unique(confirms.flatMap((c) => RISK_NAME.get(c.id) ?? [])),
        crossCheck: check ? { followup: check.followup, outcome: check.outcome } : null
      };
    })
    // The method's order, never the kind: a position in a list must not read as a ranking.
    .sort(methodOrder);
  schemes.forEach((s, i) => { s.ref = pad('S', i + 1); });

  // Every question asked and not answered, whatever its type: a context or applicability fact answered "I don't know" is
  // outstanding information as much as a control question is (independent review R-1). Nothing here is read as a control.
  const outstandingItems = controls.filter((c) => c.state !== 'outofscope' && isOutstanding(c)).map((c) => {
    const d = declined.get(c.id);
    const reason = d ? 'declined' as const : c.answer && c.answer.value === 'unknown' ? (c.answer.by && c.answer.by !== 'Respondent' ? 'not-known-by-function' as const : 'not-known-by-respondent' as const) : 'waiting' as const;
    return { c, view: view(c), reason, fn: d?.function ?? c.waiting?.function ?? (c.answer?.by !== 'Respondent' ? c.answer?.by : null) ?? null, declineReason: d?.declineReason ?? null };
  });
  const consistency = input.staged.consistency as { eligible: number; selected: number; answered: number; untested: number; counts: Record<string, number>; limitation: string; checks: { scenario: string; confirmation: string; followup: string; outcome: string }[] };

  // Item states for the sufficiency evaluator: an answer counts only when it is a real answer.
  const itemState = (c: ControlRecord): ItemState => {
    // A context or applicability fact has an answer but no answer class; it counts as answered all the same.
    if (known(c) || (!!c.answer && !isOutstanding(c))) return 'answered';
    if (declined.has(c.id)) return 'declined';
    const pkg = packages.find((p) => p.id === c.id);
    if (pkg?.status === 'owner-unknown' || (c.answer && c.answer.value === 'unknown')) return 'unknown';
    return 'waiting';
  };
  return { schemes, scenarios: schemes, outstandingItems, consistency, profile: input.profile as { id: string; value: unknown; label: string }[], controls, byId, view, known, isOutstanding, itemState, packages };
}

// ------------------------------------------------------------------------------------------------ registers

export type DecisionFactors = { controlPosition: string; outstandingAnswers: number; controlsShared: number; relatedWeaker: number };
export type Finding = {
  ref: string; schemeRef: string; schemeId: string; kind: SchemeKind; title: string; area: string; areaName: string; tier: number;
  position: string; mechanism: string | null; whyItMatters: string | null; unresolved: string[]; questions: string[]; furtherWeaknesses: string[];
  controlRefs: string[]; riskRef: string | null; answeredBy: string[]; methodRisks: string[]; factors: DecisionFactors;
};
export type RiskEntry = {
  ref: string; findingRef: string; schemeRef: string; title: string; statement: string; cause: string; consequence: string | null;
  currentPosition: string; treatment: string; ownerRole: string; rating: string;
};
export type Purpose = 'resolve-answer' | 'put-in-place' | 'strengthen';
export const PURPOSE_LABEL: Record<Purpose, string> = { 'resolve-answer': 'Resolve the answers', 'put-in-place': 'Put in place', strengthen: 'Strengthen' };
export type ControlBlueprint = {
  ref: string; id: string; key: string; purpose: Purpose; schemeRefs: string[]; schemeNames: string[]; reported: string; stateShort: string;
  /** The method's own wording (traceability). */
  standard: string | null; improving: string | null; records: string | null;
  /** The control-content library (advisory content). */
  target: string | null; contentStatus: 'library' | 'not-in-library'; archetype: string | null; contentSources: string[];
  recordName: string | null; recordText: string | null; recordRefs: string[]; ownerRole: string; methodOwner: string | null;
  answeredBy: string; prerequisiteRefs: string[]; dependentRefs: string[]; operatingCycle: string; activities: string[]; successMeasure: string; onFailure: string | null; contentPending: string[];
  contentGaps: ContentGap[]; questionText: string; answerLabel: string | null; area: string;
};
export type RecordItem = { ref: string; name: string; text: string; controlRefs: string[]; ownerRoles: string[] };
export type Action = { ref: string; phase: number; phaseTitle: string; window: string; action: string; ownerRole: string; deliverable: string; completionTest: string; dependsOn: string[]; controlRefs: string[]; schemeRefs: string[] };
export type Measure = { ref: string; measure: string; cycle: string; controlRefs: string[]; ownerRole: string; programme: string };
export type Decision = { ref: string; decision: string; why: string; recommendedDirection: string; ownerRole: string; when: string; consequenceOfDelay: string; schemeRefs: string[] };
export type RelationRow = Relation & { schemeRef: string; schemeName: string; confirmationName: string; confirmationReported: string; practiceName: string; practiceReported: string; label: string };
export type OutstandingRow = { ref: string; id: string; key: string; itemType: LedgerItemType; itemTypeText: string; holdsBack: number; reason: string; reasonText: string; fn: string | null; declineReason: string | null; role: string | null; schemeRef: string | null; schemeName: string | null; question: string };
export type ConnectedWeakness = { name: string; areas: string[]; gaps: { key: string; area: string; state: string }[]; inPlace: number; asked: number };

/**
 * Proposed implementation stages. Each has a proposed planning window for when the stage could start within a
 * twelve-month programme: a proposal for management's own plan, not a deadline, not a contractual date and not an
 * estimate of how long any control takes to design, put in place or show to be operating.
 */
export const PHASES = [
  { n: 1, title: 'Establish the facts', window: 'Proposed start: month 1', purpose: 'Settle answers that cannot both be right, answer the questions the answers leave open, and obtain outstanding answers, so that nothing is built on an answer that may be wrong.' },
  { n: 2, title: 'Decide and assign', window: 'Proposed start: months 1 to 3', purpose: 'Name who is accountable for each area, decide the order of work using explicit factors, and approve the target designs.' },
  { n: 3, title: 'Put prerequisites in place', window: 'Proposed start: once designs are approved', purpose: 'Controls that another control consumes the output of, where reviewed dependency semantics establish it.' },
  { n: 4, title: 'Put the selected controls in place', window: 'Proposed start: once designs are approved', purpose: 'The controls reported as gaps for the scenarios management has selected.' },
  { n: 5, title: 'Strengthen further defences', window: 'Proposed start: after the first controls are in place', purpose: 'Related practices reported weaker behind a control reported in place or a gap.' },
  { n: 6, title: 'Operate, measure and report', window: 'From the first control in operation, through month 12', purpose: 'Run each control through at least one full operating cycle, check it against its success measure and report status to the oversight body.' }
] as const;

export type RevisedReport = ReturnType<typeof buildRevisedReport>;

const CYCLE_WORDS = /\b(every|each|daily|weekly|monthly|quarterly|annual|annually|each year|before|whenever)\b/i;
const REASON_TEXT: Record<string, string> = { declined: 'Declined by the function asked', 'not-known-by-function': 'Not known by the function asked', 'not-known-by-respondent': 'Not known by the respondent', waiting: 'Waiting for the function asked' };

export function buildRevisedReport(input: StagedReportInput) {
  const a = analyseStagedInput(input);
  const governanceAnswer = a.profile.find((p) => p.id === 'PR-04')?.value;
  const governance = governanceAnswer && governanceAnswer !== 'unknown' ? String(governanceAnswer) : null;
  const oversight = oversightBody(governance);
  const schemes = a.schemes;
  const findingKinds: SchemeKind[] = ['contradiction', 'dependency', 'clarify', 'gap', 'qualified'];
  const riskKinds: SchemeKind[] = ['contradiction', 'dependency', 'gap'];
  const unresolvedOf = (s: SchemeView) => s.relations.filter((r) => UNRESOLVED.includes(r.type));
  const questionsOf = (s: SchemeView) => s.relations.filter((r) => r.type === 'not-established' && r.question);
  const viewOf = (id: string) => a.view(a.byId.get(id)!);

  // ---- Control blueprints: one row per control, whatever number of scenarios it serves.
  const cb = new Map<string, { v: ControlView; purposes: Set<Purpose>; schemes: SchemeView[]; prereqOf: Set<string>; needs: Set<string> }>();
  const touch = (v: ControlView, purpose: Purpose, s: SchemeView) => {
    const e = cb.get(v.id) ?? { v, purposes: new Set<Purpose>(), schemes: [], prereqOf: new Set<string>(), needs: new Set<string>() };
    e.purposes.add(purpose);
    if (!e.schemes.includes(s)) e.schemes.push(s);
    cb.set(v.id, e);
    return e;
  };
  for (const s of schemes) {
    if (s.kind === 'gap') { s.confirmationGaps.forEach((v) => touch(v, 'put-in-place', s)); s.supportingGaps.forEach((v) => touch(v, 'strengthen', s)); }
    if (s.kind === 'contradiction' || s.kind === 'dependency') {
      for (const r of unresolvedOf(s)) {
        if (r.type === 'direct-contradiction') { touch(viewOf(r.confirmation), 'resolve-answer', s); touch(viewOf(r.practice), 'resolve-answer', s); }
        // A necessary dependency always rests on reviewed semantics (relationships.ts): the practice is the input.
        else { const p = touch(viewOf(r.practice), 'put-in-place', s); p.prereqOf.add(r.confirmation); }
      }
      s.supportingGaps.filter((v) => !unresolvedOf(s).some((r) => r.practice === v.id)).forEach((v) => touch(v, 'strengthen', s));
    }
    if (s.kind === 'clarify' || s.kind === 'qualified') s.supportingGaps.forEach((v) => touch(v, 'strengthen', s));
  }
  for (const e of cb.values()) for (const d of e.prereqOf) cb.get(d)?.needs.add(e.v.id);
  const purposeOf = (ps: Set<Purpose>): Purpose => (ps.has('put-in-place') ? 'put-in-place' : ps.has('resolve-answer') ? 'resolve-answer' : 'strengthen');
  // The method's order: area, then the first scenario the control serves, then the control.
  const ordered = [...cb.values()].sort((x, y) => {
    const ox = Math.min(...x.schemes.map((s) => schemes.indexOf(s)));
    const oy = Math.min(...y.schemes.map((s) => schemes.indexOf(s)));
    return ox - oy || x.v.id.localeCompare(y.v.id, 'en', { numeric: true });
  });
  const controlRef = new Map(ordered.map((e, i) => [e.v.id, pad('C', i + 1)]));

  // ---- Records management should maintain: one row per distinct record.
  const recordIndex = new Map<string, RecordItem>();
  const contentOf = new Map(ordered.map((e) => [e.v.id, controlContent(e.v.id)]));
  for (const e of ordered) {
    const lib = contentOf.get(e.v.id)!;
    const text = lib.record ?? e.v.records;
    if (!text) continue;
    const r = recordIndex.get(text) ?? { ref: pad('E', recordIndex.size + 1), name: lib.recordName ?? 'Record named by the method', text, controlRefs: [], ownerRoles: [] };
    r.controlRefs.push(controlRef.get(e.v.id)!);
    r.ownerRoles = unique([...r.ownerRoles, e.v.ownerRole]);
    recordIndex.set(text, r);
  }
  const records = [...recordIndex.values()];

  const controlsReg: ControlBlueprint[] = ordered.map((e) => {
    const v = e.v;
    const lib = contentOf.get(v.id)!;
    const purpose = purposeOf(e.purposes);
    const ref = controlRef.get(v.id)!;
    const prerequisiteRefs = [...e.needs].map((id) => controlRef.get(id)).filter(Boolean) as string[];
    const recordText = lib.record ?? v.records;
    const recordRefs = recordText ? [recordIndex.get(recordText)!.ref] : [];
    const dependentRefs = [...e.prereqOf].map((id) => controlRef.get(id) ?? controlName(id));
    const dc = e.schemes.flatMap((s) => s.relations.filter((r) => r.type === 'direct-contradiction' && (r.confirmation === v.id || r.practice === v.id)));
    const activities = unique([
      ...(purpose === 'resolve-answer' ? ['Establish which of the conflicting answers reflects how the process runs, and correct the record.'] : []),
      ...(prerequisiteRefs.length ? [`Put the input it needs in place first: ${joinList([...e.needs].map((id) => lc(controlName(id))))} (${prerequisiteRefs.join(', ')}).`] : []),
      ...(lib.status === 'library' ? lib.activities : [`Agree the design with the ${lc(v.ownerRole)} against the method's standard.`])
    ]);
    const successMeasure = lib.measure
      ?? (v.format === 'anchored' && v.standard ? `The control operates as the method's target practice describes: ${lc(noStop(v.standard))}.` : METHOD_SETS_NO_MEASURE);
    // Content the library does not yet hold is recorded for MK's approval, never described to the customer as missing.
    const contentPending = lib.status === 'library' ? [] : ['activities', ...(lib.measure ? [] : ['measure']), ...(lib.onFailure ? [] : ['onFailure'])];
    void dc;
    return {
      ref, id: v.id, key: v.key, purpose, schemeRefs: e.schemes.map((s) => s.ref), schemeNames: e.schemes.map((s) => s.name), reported: v.reported, stateShort: v.stateShort,
      standard: v.standard, improving: v.improving, records: v.records,
      target: lib.target ?? v.standard, contentStatus: lib.status, archetype: lib.archetypeName, contentSources: lib.sources,
      recordName: lib.recordName, recordText, recordRefs, ownerRole: v.ownerRole, methodOwner: v.methodOwner, answeredBy: v.answeredBy,
      prerequisiteRefs, dependentRefs,
      operatingCycle: lib.cycle ?? (CYCLE_WORDS.test(`${v.standard ?? ''} ${v.questionText}`) ? 'As the method\'s standard states' : 'Not stated by the method'),
      activities, successMeasure, onFailure: lib.onFailure, contentPending, contentGaps: v.contentGaps, questionText: v.questionText, answerLabel: v.answerLabel, area: a.byId.get(v.id)?.domain?.id ?? ''
    };
  });
  const refOf = (id: string) => controlRef.get(id);

  // ---- Findings and risks, in the method's order.
  const findings: Finding[] = [];
  const risks: RiskEntry[] = [];
  const weakest = (vs: ControlView[]) => [...vs].sort((x, y) => (SEVERITY_WORDING[x.cls ?? ''] ?? 9) - (SEVERITY_WORDING[y.cls ?? ''] ?? 9))[0];
  for (const s of schemes.filter((x) => findingKinds.includes(x.kind))) {
    const fRef = pad('F', findings.length + 1);
    const un = unresolvedOf(s);
    const qs = questionsOf(s);
    const further = s.relations.filter((r) => r.type === 'complementary-weakness').map((r) => r.statement);
    const confText = (v: ControlView) => (v.format === 'anchored' && v.level !== null ? `${v.key}: ${lc(v.reported)}` : v.reported);
    const weaker = (vs: ControlView[]) => `${joinList(vs.slice(0, 5).map((v) => `${lc(v.key)} (${lc(v.stateShort)})`))}${vs.length > 5 ? ` and ${vs.length - 5} more` : ''}`;
    let position: string;
    if (s.kind === 'gap') position = `${s.confirmationGaps.map(confText).join(' ')}${s.supportingGaps.length ? ` Related practices also reported weaker: ${weaker(s.supportingGaps)}.` : ''}`;
    else if (s.kind === 'qualified') position = `${s.confirmations.map(confText).join(' ')} Related practices reported weaker: ${weaker(s.supportingGaps)}.`;
    else if (s.kind === 'clarify') position = qs.map((r) => r.statement).join(' ');
    else position = un.map((r) => r.statement).join(' ');
    const controlRefs = unique([...s.confirmationGaps, ...s.supportingGaps].map((v) => refOf(v.id)).concat(un.flatMap((r) => [refOf(r.practice), r.type === 'direct-contradiction' ? refOf(r.confirmation) : undefined])).filter(Boolean) as string[]);
    // FR, not R: the method's own risk codes are R1 to R12, and a report reference must never read like one.
    const riskRef = riskKinds.includes(s.kind) ? pad('FR', risks.length + 1) : null;
    const gapControls = s.kind === 'gap' ? s.confirmationGaps : [];
    const factors: DecisionFactors = {
      controlPosition: s.kind === 'gap' ? CLASS_SHORT[weakest(gapControls).cls ?? ''] ?? 'Gap' : s.kind === 'qualified' ? 'In place; related practice weaker' : KIND_LABEL[s.kind],
      outstandingAnswers: s.outstanding.length,
      controlsShared: Math.max(0, ...gapControls.map((v) => (cb.get(v.id)?.schemes.length ?? 1) - 1)),
      relatedWeaker: s.supportingGaps.length
    };
    findings.push({
      ref: fRef, schemeRef: s.ref, schemeId: s.id, kind: s.kind, title: s.name, area: s.area, areaName: s.areaName, tier: s.tier, position,
      mechanism: s.how ? sentence(s.how) : null, whyItMatters: s.why ? sentence(s.why) : null, unresolved: un.map((r) => r.statement), questions: qs.map((r) => r.question!), furtherWeaknesses: further,
      controlRefs, riskRef, answeredBy: s.answeredBy, methodRisks: s.methodRisks, factors
    });
    if (riskRef) {
      const cause = s.kind === 'gap'
        ? `${joinList(s.confirmationGaps.map((v) => `${lc(v.key)} is ${lc(v.stateShort)}`))}`
        : s.kind === 'contradiction' ? 'the answers about the control that stops it conflict' : `the control that stops it lacks an input it needs: ${joinList(un.map((r) => lc(controlName(r.practice))))}`;
      const lead = s.confirmationGaps[0] ?? s.confirmations[0];
      risks.push({
        ref: riskRef, findingRef: fRef, schemeRef: s.ref, title: s.name,
        statement: `${s.how ? `${noStop(s.how)}, because ${cause}` : `${s.name}, because ${cause}`}.`,
        cause, consequence: s.why ? sentence(s.why) : null,
        currentPosition: s.kind === 'gap' ? s.confirmationGaps.map((v) => v.reported).join(' ') : un.map((r) => r.statement).join(' '),
        treatment: controlRefs.map((r) => `${r} ${controlsReg.find((c) => c.ref === r)?.key ?? ''}`.trim()).join('; '),
        ownerRole: lead ? lead.ownerRole : AREA_LEAD.get(s.area) ?? 'Senior management',
        rating: 'Not rated. MK has not approved a method for rating likelihood, impact or priority.'
      });
    }
  }

  // ---- Actions, in proposed stages. Order follows what must be known and decided first; no dates are set.
  const actions: Action[] = [];
  const act = (phase: number, x: Omit<Action, 'ref' | 'phase' | 'phaseTitle' | 'window'>) => actions.push({ ref: '', phase, phaseTitle: PHASES[phase - 1].title, window: PHASES[phase - 1].window, ...x });
  const unresolvedSchemes = schemes.filter((s) => INCONSISTENT.includes(s.kind));
  const clarifySchemes = schemes.filter((s) => s.kind === 'clarify');
  for (const s of unresolvedSchemes) {
    const un = unresolvedOf(s);
    const lead = s.confirmations[0];
    act(1, {
      action: s.kind === 'contradiction'
        ? `Establish which answer is right for ${schemeWhere(s.name)}: ${joinList(unique(un.flatMap((r) => [controlName(r.confirmation), controlName(r.practice)])).map(lc))}.`
        : `Confirm how ${lc(controlName(un[0].confirmation))} operates without ${joinList(un.map((r) => lc(controlName(r.practice))))}.`,
      ownerRole: lead.ownerRole, deliverable: 'A corrected answer, or a recorded decision to put the missing practice in place.',
      completionTest: 'The answers for this scenario agree with each other and with how the process runs.', dependsOn: [],
      controlRefs: un.flatMap((r) => [refOf(r.confirmation), refOf(r.practice)]).filter(Boolean) as string[], schemeRefs: [s.ref]
    });
  }
  for (const s of clarifySchemes) {
    const qs = questionsOf(s);
    act(1, {
      action: `Answer the question the answers leave open for ${schemeWhere(s.name)}: ${lc(qs[0].question!)}`,
      ownerRole: s.confirmations[0].ownerRole, deliverable: 'A written answer, added to the assessment record.',
      completionTest: 'The answer shows either how the reported control operates or that a practice needs to be put in place.', dependsOn: [],
      controlRefs: qs.map((r) => refOf(r.practice)).filter(Boolean) as string[], schemeRefs: [s.ref]
    });
  }
  const byFn = new Map<string, typeof a.outstandingItems>();
  for (const o of a.outstandingItems) { const k = o.fn ?? o.view.methodOwner ?? 'Accountable function'; byFn.set(k, [...(byFn.get(k) ?? []), o]); }
  for (const [fn, items] of byFn) {
    const dec = items.filter((o) => o.reason === 'declined').length;
    act(1, {
      action: `Obtain the ${plural(items.length, 'outstanding answer', 'outstanding answers')} held by ${fn}${dec ? `, including ${plural(dec, 'question', 'questions')} it declined` : ''}: ${joinList(items.slice(0, 4).map((o) => lc(o.view.key)))}${items.length > 4 ? ` and ${items.length - 4} more` : ''}.`,
      ownerRole: consolidatedRole(items[0].view.methodOwner), deliverable: 'An answer to each question, or each recorded as an open item with a named owner.',
      completionTest: 'No question is left declined or unanswered without a recorded owner.', dependsOn: [], controlRefs: [], schemeRefs: unique(items.map((o) => schemes.find((s) => s.id === o.c.scenario?.id)?.ref ?? null).filter(Boolean) as string[])
    });
  }
  const openSchemes = schemes.filter((s) => riskKinds.includes(s.kind));
  const areas = unique(openSchemes.map((s) => s.area)).sort((x, y) => (AREA_ORDER.get(x) ?? 0) - (AREA_ORDER.get(y) ?? 0));
  for (const ar of areas) {
    const ss = openSchemes.filter((s) => s.area === ar);
    act(2, {
      action: `Name the executive accountable for ${AREA_SHORT[ar] ?? lc(AREA_NAME.get(ar) ?? ar)}, where ${plural(ss.length, 'scenario is', 'scenarios are')} open or unresolved.`,
      ownerRole: 'Chief executive', deliverable: 'A named accountable executive for the area.', completionTest: 'The area has one named executive who has accepted the role.',
      dependsOn: [], controlRefs: [], schemeRefs: ss.map((s) => s.ref)
    });
  }
  if (openSchemes.length) {
    act(2, {
      action: `Decide which of the ${plural(openSchemes.filter((s) => s.kind === 'gap').length, 'scenario', 'scenarios')} with a control reported as a gap to address in this cycle, and in what order, using the decision factors in the finding register.`,
      ownerRole: 'Chief executive', deliverable: 'A recorded selection and order, with the factors that decided each choice.',
      completionTest: 'Every open scenario is either selected, deferred with a reason, or accepted as a risk at the right level.', dependsOn: [], controlRefs: [], schemeRefs: openSchemes.map((s) => s.ref)
    });
    act(2, {
      action: 'Approve the target design for each selected control, using the target practice, records and measure in the control blueprint register.',
      ownerRole: 'Chief executive', deliverable: 'Approved designs, each with an owner and the records it will keep.', completionTest: 'Each selected control has an approved design and an owner.',
      dependsOn: [], controlRefs: controlsReg.filter((c) => c.purpose === 'put-in-place').map((c) => c.ref), schemeRefs: openSchemes.map((s) => s.ref)
    });
  }
  // Controls are put in place by the role that owns them: one action per stage and owner, naming every control, so the
  // action register does not repeat the blueprint register row by row.
  const stageOf = (c: ControlBlueprint) => (c.dependentRefs.length && c.purpose === 'put-in-place' ? 3 : c.purpose === 'put-in-place' ? 4 : c.purpose === 'strengthen' ? 5 : 0);
  for (const phase of [3, 4, 5]) {
    for (const owner of unique(controlsReg.filter((c) => stageOf(c) === phase).map((c) => c.ownerRole))) {
      const cs = controlsReg.filter((c) => stageOf(c) === phase && c.ownerRole === owner);
      const list = `${joinList(cs.slice(0, 6).map((c) => `${lc(c.key)} (${c.ref})`))}${cs.length > 6 ? ` and ${cs.length - 6} more` : ''}`;
      act(phase, {
        action: `${phase === 5 ? 'Strengthen' : 'Put in place'} ${cs.length === 1 ? 'the control' : `the ${cs.length} controls`} the ${lc(owner)} owns: ${list}${phase === 3 ? `, each an input to another control` : ''}.`,
        ownerRole: owner, deliverable: 'Each control operating to its approved design, with the records named in its blueprint kept from the first case.',
        completionTest: 'Each control has started operating, and its records exist for every case since it started.',
        dependsOn: unique(cs.flatMap((c) => c.prerequisiteRefs)), controlRefs: cs.map((c) => c.ref), schemeRefs: unique(cs.flatMap((c) => c.schemeRefs))
      });
    }
  }
  const programmes = unique(controlsReg.map((c) => c.ownerRole));
  for (const p of programmes) {
    const cs = controlsReg.filter((c) => c.ownerRole === p);
    act(6, {
      action: `Check ${cs.length === 1 ? 'the control' : `each of the ${cs.length} controls`} owned by the ${lc(p)} against its success measure once it has completed its first full operating cycle.`,
      ownerRole: p, deliverable: 'A first-cycle review for each control, with exceptions and their resolution.', completionTest: 'Each control has met its success measure for one full cycle, or has a recorded correction.',
      dependsOn: [], controlRefs: cs.map((c) => c.ref), schemeRefs: unique(cs.flatMap((c) => c.schemeRefs))
    });
  }
  if (actions.length) {
    act(6, {
      action: `Report the status of every open and unresolved scenario to ${lc(oversight)} at each of its meetings until each is closed, deferred with a reason or accepted.`,
      ownerRole: 'Chief executive', deliverable: 'A one-page status: scenario, owner, controls in place, controls outstanding, next step.',
      completionTest: 'The status is received and minuted at each meeting.', dependsOn: [], controlRefs: [], schemeRefs: openSchemes.map((s) => s.ref)
    });
  }
  actions.sort((x, y) => x.phase - y.phase);
  actions.forEach((x, i) => { x.ref = pad('A', i + 1); });
  const actionOfControl = new Map(actions.filter((x) => x.phase >= 3 && x.phase <= 5).flatMap((x) => x.controlRefs.map((c) => [c, x.ref] as const)));
  for (const x of actions) x.dependsOn = unique(x.dependsOn.map((c) => actionOfControl.get(c) ?? c));
  const phasesUsed = PHASES.filter((p) => actions.some((x) => x.phase === p.n));

  // ---- Measures: one per control, from the library.
  const measures: Measure[] = controlsReg.map((c) => ({ ref: c.ref.replace('C', 'M'), measure: c.successMeasure, cycle: c.operatingCycle, controlRefs: [c.ref], ownerRole: c.ownerRole, programme: c.ownerRole }));

  // ---- Decisions for leadership. No deadline is set; "when" states what the decision must precede.
  const decisions: Decision[] = [];
  const dec = (d: Omit<Decision, 'ref'>) => decisions.push({ ref: pad('D', decisions.length + 1), ...d });
  if (unresolvedSchemes.length || clarifySchemes.length) {
    dec({
      decision: `Have the answers that cannot both be right settled, and the questions the answers leave open answered, before the controls concerned are relied on${unresolvedSchemes.length && clarifySchemes.length ? '' : ''}.`,
      why: joinList([unresolvedSchemes.length ? `${plural(unresolvedSchemes.length, 'scenario has', 'scenarios have')} answers that cannot both be right` : '', clarifySchemes.length ? `${plural(clarifySchemes.length, 'scenario raises a question', 'scenarios raise questions')} that the answers do not settle` : ''].filter(Boolean)) + '.',
      recommendedDirection: 'Ask each process owner to establish how the process runs, record the answer, and correct the assessment where it was wrong.',
      ownerRole: 'Chief executive', when: 'Before the controls concerned are relied on or reported as in place.', consequenceOfDelay: 'The organisation may rely on a control whose operation the answers do not establish.', schemeRefs: [...unresolvedSchemes, ...clarifySchemes].map((s) => s.ref)
    });
  }
  if (a.outstandingItems.length) {
    dec({
      decision: `Require an answer, or a recorded open item, for each of the ${a.outstandingItems.length} outstanding questions.`,
      why: `Of these, ${outstandingPhrase(a.outstandingItems)}. Nothing is concluded about them.`,
      recommendedDirection: 'Assign each to a named person, and record any that cannot be answered as an open item.', ownerRole: 'Chief executive',
      when: 'Before the scenarios they affect are ordered.', consequenceOfDelay: 'The scenarios they affect stay unknown rather than covered.', schemeRefs: unique(a.outstandingItems.map((o) => schemes.find((s) => s.id === o.c.scenario?.id)?.ref ?? null).filter(Boolean) as string[])
    });
  }
  if (areas.length) {
    dec({
      decision: `Name one accountable executive for each area with open or unresolved scenarios: ${joinList(areas.map((ar) => `${AREA_SHORT[ar] ?? ar} (${openSchemes.filter((s) => s.area === ar).length})`))}.`,
      why: 'Each scenario needs one person with authority over the process, the system and the people involved.',
      recommendedDirection: `The method suggests: ${joinList(areas.slice(0, 5).map((ar) => `${lc(AREA_LEAD.get(ar) ?? 'senior management')} for ${AREA_SHORT[ar] ?? ar}`))}${areas.length > 5 ? ', and the leads named in the register for the rest' : ''}.`,
      ownerRole: 'Chief executive', when: 'Before design work starts.', consequenceOfDelay: 'Open scenarios have no owner, and the controls that stop them stay unassigned.', schemeRefs: openSchemes.map((s) => s.ref)
    });
    dec({
      decision: 'Decide the order in which the open scenarios are addressed, using explicit factors.',
      why: 'MK has not approved a method for rating fraud risks, so this report does not rank them, and neither its order nor the method\'s tiers is a ranking.',
      recommendedDirection: 'Settle conflicting answers and open questions first. Then weigh, for each scenario, how far its control is reported in place, whether money, pay, cash or stock can leave without it, how much activity passes through the process, whether another control would detect a loss, and how many other scenarios the same control serves. The finding register gives the facts the assessment holds for the first and last of these; management supplies the rest.',
      ownerRole: 'Chief executive', when: 'Before design work starts.', consequenceOfDelay: 'Effort is spread across every scenario at once, or follows the order of this report, which is not a ranking.', schemeRefs: openSchemes.filter((s) => s.kind === 'gap').map((s) => s.ref)
    });
  }
  if (actions.length) {
    dec({
      decision: `Have ${lc(oversight)} receive the status of the open and unresolved scenarios at each of its meetings until each is closed, deferred with a reason or accepted.`,
      why: 'Regular reporting keeps the scenarios visible to the people who can remove blockers.',
      recommendedDirection: 'A one-page status per scenario: owner, controls in place, controls outstanding, next step.', ownerRole: 'Chief executive',
      when: 'From the first meeting after this report.', consequenceOfDelay: 'Progress is not visible until the next assessment.', schemeRefs: openSchemes.map((s) => s.ref)
    });
  }

  // ---- Answer relationships, outstanding information, connected weaknesses, roles and content gaps.
  const relationRows: RelationRow[] = schemes.flatMap((s) => s.relations.map((r) => ({
    ...r, schemeRef: s.ref, schemeName: s.name, confirmationName: controlName(r.confirmation), confirmationReported: viewOf(r.confirmation).reported,
    practiceName: controlName(r.practice), practiceReported: viewOf(r.practice).reported, label: relationLabel(r)
  })));
  const ledger: OutstandingLedger = buildOutstandingLedger(input);
  const outstanding: OutstandingRow[] = a.outstandingItems.map((o, i) => {
    const s = schemes.find((x) => x.id === o.c.scenario?.id);
    const itemType: LedgerItemType = o.c.type === 'applicability' ? 'applicability' : o.c.type === 'context' ? 'context' : 'control';
    return { ref: pad('O', i + 1), id: o.c.id, key: o.view.key, itemType, itemTypeText: ITEM_TYPE_LABEL[itemType], holdsBack: ledger.questions.find((q) => q.id === o.c.id)?.holdsBack.length ?? 0, reason: o.reason, reasonText: REASON_TEXT[o.reason], fn: o.fn, declineReason: o.declineReason, role: o.c.role ?? null, schemeRef: s?.ref ?? null, schemeName: s?.name ?? null, question: o.c.text };
  });
  const answeredById = new Map(a.controls.map((c) => [c.id, c]));
  const connected: ConnectedWeakness[] = COV.crossObjectives.map((o) => {
    const asked = o.questions.map((id) => answeredById.get(id)).filter((c): c is ControlRecord => !!c && !!c.answer && !outstandingOf(c) && !!c.class);
    const gaps = asked.filter((c) => GAP.has(c.class!)).map((c) => ({ key: c.key ?? controlName(c.id), area: c.domain?.id ?? '', state: CLASS_SHORT[c.class!] }));
    return { name: o.name, areas: unique(gaps.map((g) => g.area)), gaps, inPlace: asked.filter((c) => c.class === 'full').length, asked: asked.length };
  }).filter((x) => x.gaps.length >= 2 && x.areas.length >= 2).sort((x, y) => x.name.localeCompare(y.name));
  const roles = roleMap(controlsReg.map((c) => c.methodOwner));
  const gapsRegister = controlsReg.filter((c) => c.contentGaps.length).map((c) => ({ ref: c.ref, id: c.id, key: c.key, gaps: c.contentGaps, library: c.contentStatus }));

  // ---- Information sufficiency (candidate 0.2), per promised deliverable.
  const stages = (input.staged as { stages: { core: { complete: boolean; applicableSoFar: number; answered: number }; breadth: { complete: boolean; applicableSoFar: number; answered: number } } }).stages;
  const applicable = (c: ControlRecord | undefined) => !!c && !NOT_APPLICABLE_STATES.includes(c.state ?? '');
  const seen = new Set<string>();
  const confirmations = schemes.filter((s) => s.kind !== 'not-expected').flatMap((s) => s.confirmations.map((v) => ({ v, s })))
    .filter(({ v }) => { if (seen.has(v.id)) return false; seen.add(v.id); return applicable(a.byId.get(v.id)); })
    .map(({ v, s }) => ({ id: v.id, tier: s.tier, area: s.area, state: a.itemState(a.byId.get(v.id)!) }));
  const packageIds = new Set(a.packages.map((p) => p.id));
  const diagnostics = a.controls
    .filter((c) => c.type === 'practice' && ['related', 'followup'].includes(c.role ?? '') && applicable(c) && (!!c.answer || c.state === 'reused' || packageIds.has(c.id)))
    .map((c) => ({ id: c.id, area: c.domain?.id ?? '', scenario: c.scenario?.id ?? null, fn: a.packages.find((p) => p.id === c.id)?.function ?? null, state: a.itemState(c) }));
  const fnNames = unique(a.packages.map((p) => p.function));
  const functions = fnNames.map((fn) => {
    const items = a.packages.filter((p) => p.function === fn);
    const st = items.map((p) => (a.byId.get(p.id) ? a.itemState(a.byId.get(p.id)!) : p.status === 'declined' ? 'declined' : 'waiting'));
    return { fn, items: items.length, answered: st.filter((x) => x === 'answered').length, declined: st.filter((x) => x === 'declined').length, unknown: st.filter((x) => x === 'unknown').length, waiting: st.filter((x) => x === 'waiting').length };
  });
  const essentialControlIds = unique(schemes.filter((s) => s.kind === 'gap').flatMap((s) => s.confirmationGaps.map((v) => v.id)));
  const sufficiency: SufficiencyResult = evaluateInformationSufficiency({
    stages, confirmations, diagnostics,
    openScenarios: schemes.filter((s) => OPEN_KINDS.includes(s.kind)).map((s) => ({ id: s.id, area: s.area })),
    functions, oversight: governance,
    essentialControls: essentialControlIds.map((id) => ({ id, inLibrary: controlContent(id).status === 'library' })),
    blueprintControls: controlsReg.map((c) => ({ id: c.id, inLibrary: c.contentStatus === 'library', fnRole: c.ownerRole })),
    prerequisites: controlsReg.flatMap((c) => c.dependentRefs.map((d) => ({ from: c.ref, to: d, reviewed: true }))),
    outstanding: a.outstandingItems.map((o) => ({ id: o.c.id, reason: o.reason, role: o.c.role ?? null })),
    notExpected: schemes.filter((s) => s.kind === 'not-expected').length
  });

  // ---- The position: facts for the four separate statements. No threshold decides how a figure is shown.
  const count = (k: SchemeKind) => schemes.filter((s) => s.kind === k).length;
  const compared = relationRows.filter((r) => r.type !== 'missing-information' && r.type !== 'untested-practice').length;
  const position = {
    contradictions: count('contradiction'), dependencies: count('dependency'), clarifications: count('clarify'),
    pairsCompared: compared, pairsNotReviewed: relationRows.filter((r) => r.basis === 'not-reviewed').length,
    crossChecksAsked: (a.consistency.checks ?? []).length, crossCheckEligible: a.consistency.eligible,
    conclusion: 'MK has not approved a readiness method, band or threshold, so no readiness conclusion is drawn from the answers or from the calculated test result.'
  };
  const applicabilityPending = ledger.scenarios.filter((u) => u.reason === 'applicability-outstanding' && schemes.some((x) => x.id === u.id && x.kind === 'none'));
  const summary = {
    // A scenario whose applicability is itself outstanding is not counted as applying (independent review R-1): it is
    // counted separately, with the answer that would settle it, and never read as a control in place or missing.
    applicable: schemes.length - applicabilityPending.length - count('not-expected'), applicabilityPending: applicabilityPending.length, inPicture: schemes.length,
    notReached: count('none') - applicabilityPending.length, notExpected: count('not-expected'), tier1: schemes.filter((s) => s.tier === 1).length,
    byKind: Object.fromEntries((Object.keys(KIND_LABEL) as SchemeKind[]).map((k) => [k, count(k)])) as Record<SchemeKind, number>,
    tier1Gap: schemes.filter((s) => s.tier === 1 && s.kind === 'gap').length,
    relations: Object.fromEntries(['direct-contradiction', 'necessary-dependency', 'complementary-weakness', 'untested-practice', 'missing-information', 'not-established'].map((k) => [k, relationRows.filter((r) => r.type === k).length])),
    relationBasis: Object.fromEntries(['answer', 'reviewed-pair', 'not-reviewed', 'semantics-not-met'].map((k) => [k, relationRows.filter((r) => r.basis === k).length])),
    library: { version: CONTROL_CONTENT_VERSION, controls: controlsReg.length, inLibrary: controlsReg.filter((c) => c.contentStatus === 'library').length }
  };

  return {
    version: REVISED_REPORT_MODEL_VERSION, methodLabel: REVISED_METHOD_LABEL, oversight, oversightKnown: !!governance, schemes, findings, risks, controls: controlsReg, records, actions, phases: phasesUsed, measures, decisions,
    relations: relationRows, outstanding, ledger, connected, roles, contentGaps: gapsRegister, sufficiency, position, summary, consistency: a.consistency, analysis: a
  };
}

/** Kept for callers that need the analysis and the outstanding items (standard-status tests, SS-09). */
export function buildRevisedEvidenceModel(input: StagedReportInput) {
  const report = buildRevisedReport(input);
  return { model: report, analysis: report.analysis };
}
