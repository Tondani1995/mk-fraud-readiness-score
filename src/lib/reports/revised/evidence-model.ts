import coverage from '@/lib/readiness-review/data/coverage-map-v1.3.json' with { type: 'json' };
import bank from '@/lib/readiness-review/data/bank-v1.3.json' with { type: 'json' };
import type { StagedReportInput, ControlRecord } from '@/lib/readiness-review/report-input';
import { CLASS_SHORT, controlName, contentGaps, improvingText, methodOwner, recordsText, reportedText, standardText, type ContentGap } from './answer-text';
import { classifyRelation, RELATION_LABEL, UNRESOLVED, type Relation } from './relationships';
import { consolidatedRole, oversightBody, roleMap } from './roles';
import { evaluateInformationSufficiency, type SufficiencyResult } from './information-sufficiency';

/**
 * FICTIONAL INTEGRATION PROTOTYPE. Not used by any customer path.
 *
 * The revised report model: everything the Essential and Comprehensive prototypes say, built once from a staged review
 * session (report input 1.3.0) and the draft method's own content (bank 1.3, coverage map 1.3). The unit of analysis
 * is the fraud scheme. Nothing is scored, rated or weighted here.
 *
 * Corrections made on MK's direction of 12 November:
 *  - A confirmation reported in place is no longer called "false comfort" because a related practice is weaker. Each
 *    pair is classified (relationships.ts); only a direct contradiction or a method-established dependency leaves the
 *    confirmation unresolved, and a complementary weakness is reported without claiming the confirmation is disproved.
 *  - No risk priority, likelihood, impact, implementation difficulty or target period is derived from the scheme's
 *    tier or from an answer class. The tier is reported as what it is, the stage at which the draft method confirms a
 *    scheme. Order is a stated presentation convention (PC-1 below), not a risk ranking.
 *  - Answer and standard wording comes from answer-text.ts for every response format.
 *  - Every control appears once, in one register row, whatever number of schemes it serves; role labels are
 *    consolidated (roles.ts); where the method is not specific enough, the gap is recorded instead of filled.
 *
 * Presentation convention PC-1 (prototype, not approved): schemes are listed with unresolved answers first (answers
 * that conflict, then controls relying on a weaker practice), then schemes with a control reported as a gap, then
 * schemes whose further defences are weaker; within each group tier 1 before tiers 2 and 3, then the method's area
 * order. This orders what must be established before what can be built; it does not say which risk is greatest.
 */

export const REVISED_REPORT_MODEL_VERSION = 'revised-report-model-prototype-0.2.0';
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
/** Short area names for prose, so a list of areas does not nest the commas inside their full names. */
// One concept each, so that a list of areas never nests an "and" inside another.
export const AREA_SHORT: Record<string, string> = { D1: 'governance', D2: 'fraud risk assessment', D3: 'ethics', D4: 'procurement', D5: 'people', D6: 'finance', D7: 'customers', D8: 'assets', D9: 'digital channels', D10: 'detection' };
/** A scheme name is a sentence ("Ghost employees are paid"); this lets it sit inside another sentence. */
export const schemeWhere = (name: string) => `the scheme where ${lc(String(name).replace(/\.$/, ''))}`;
/** Bank IDs, scenario IDs and risk codes must never reach customer prose. */
export const REVISED_RAW_ID = /\b(?:D\d{1,2}-[A-Z]{1,2}-\d{2}|FS-D\d{1,2}-\d{2}|OBJ-[A-Z0-9-]+|PR-\d{2}|R\d{1,2}\b(?=[,.;: ]))/;

const GAP = new Set(['absent', 'partial', 'designed']);
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
/** Where the gap schemes sit: the fewest areas (up to three) holding more than half of them, or "spread across". */
export function concentration(areaCounts: [string, number][], total: number): string {
  let sum = 0;
  for (let k = 0; k < Math.min(3, areaCounts.length); k++) {
    sum += areaCounts[k][1];
    if (sum > total / 2 && areaCounts[0][1] >= 2) return `most of them in ${joinList(areaCounts.slice(0, k + 1).map(([ar]) => AREA_SHORT[ar] ?? ar))}`;
  }
  return `spread across ${areaCounts.length} ${areaCounts.length === 1 ? 'area' : 'areas'}`;
}

// ------------------------------------------------------------------------------------------------ analysis

export type ControlView = {
  id: string; key: string; format: string; cls: string | null; level: number | null; role: string; schemeRole: string | null;
  reported: string; stateShort: string; standard: string | null; improving: string | null; records: string | null;
  methodOwner: string | null; ownerRole: string; answeredBy: string; outstanding: boolean; questionText: string;
  answerLabel: string | null; contentGaps: ContentGap[];
};
export type SchemeKind = 'gap' | 'contradiction' | 'dependency' | 'qualified' | 'confirmed' | 'outstanding' | 'not-expected' | 'none';
export type SchemeView = {
  id: string; ref: string; name: string; tier: number; area: string; areaName: string; how: string | null; why: string | null;
  kind: SchemeKind; confirmations: ControlView[]; confirmationGaps: ControlView[]; supportingGaps: ControlView[];
  relations: Relation[]; outstanding: ControlView[]; answered: number; inPlace: number; answeredBy: string[];
  methodRisks: string[]; crossCheck: { followup: string; outcome: string } | null;
};
export const KIND_LABEL: Record<SchemeKind, string> = {
  contradiction: 'Answers that cannot both be right', dependency: 'Control relies on a weaker practice', gap: 'Control reported as a gap',
  qualified: 'Control in place; further defences weaker', confirmed: 'Controls reported in place', outstanding: 'Answers outstanding',
  'not-expected': 'Not expected at this size', none: 'Not yet reached'
};
const KIND_ORDER: Record<SchemeKind, number> = { contradiction: 0, dependency: 1, gap: 2, qualified: 3, outstanding: 4, confirmed: 5, 'not-expected': 6, none: 7 };

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

export type RevisedAnalysis = ReturnType<typeof analyseStagedInput>;

export function analyseStagedInput(input: StagedReportInput) {
  const controls = (input.domains as { controls: ControlRecord[] }[]).flatMap((d) => d.controls);
  const byId = new Map(controls.map((c) => [c.id, c]));
  const declined = new Map((input.staged.packages as { id: string; status: string; function: string; declineReason: string | null }[]).filter((p) => p.status === 'declined').map((p) => [p.id, p]));
  const precluded = (input.openWork.precluded ?? []) as { by: string; byKey: string; controls: string[] }[];
  const checks = (input.staged.consistency.checks ?? []) as { scenario: string; confirmation: string; followup: string; outcome: string }[];
  const isOutstanding = (c: ControlRecord) => outstandingOf(c) || declined.has(c.id);

  // A control the method establishes from a wider answer (state "reused") has a class but no answer of its own.
  const reusedFrom = (c: ControlRecord) => (c.state === 'reused' && c.class ? (c as ControlRecord & { reused?: { from: string; why: string } }).reused ?? null : null);
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
      standard: standardText(c.id), improving: improvingText(c.id), records: recordsText(c.id), methodOwner: owner, ownerRole: consolidatedRole(owner),
      answeredBy: by, outstanding: isOutstanding(c), questionText: c.text, answerLabel: (c.answer?.label as string | undefined) ?? null, contentGaps: contentGaps(c.id)
    };
  };

  const schemes: SchemeView[] = (input.scenarios as { id: string; status: string; tier: number; domain: string; name: string; confirmations: { id: string }[] }[])
    .filter((s) => s.status !== 'outofscope')
    .map((s) => {
      const def = SCENARIO.get(s.id);
      const members = controls.filter((c) => c.scenario?.id === s.id && c.type === 'practice' && ['confirm', 'related', 'followup'].includes(c.role ?? ''));
      const confirmIds = new Set(s.confirmations.map((x) => x.id));
      const known = (c: ControlRecord) => (!!c.answer || !!reusedFrom(c)) && !isOutstanding(c) && !!c.class;
      const confirms = members.filter((c) => confirmIds.has(c.id));
      const supporting = members.filter((c) => !confirmIds.has(c.id));
      const confirmationGaps = confirms.filter((c) => known(c) && GAP.has(c.class!));
      const supportingGaps = supporting.filter((c) => known(c) && GAP.has(c.class!));
      const allFull = confirms.length > 0 && confirms.every((c) => known(c) && c.class === 'full');
      // Relationships are drawn for each confirmation reported fully in place, against every supporting practice of
      // the scheme that is weaker, untested or outstanding. A practice reported fully in place needs no relationship.
      const relations = confirms.filter((c) => known(c) && c.class === 'full').flatMap((c) => supporting
        .filter((p) => isOutstanding(p) || (known(p) && (GAP.has(p.class!) || p.class === 'noinstance' || p.class === 'na')))
        .map((p) => classifyRelation({ id: c.id, class: c.class, answer: c.answer as { value: unknown }, outstanding: false }, { id: p.id, class: p.class, answer: p.answer as { value: unknown }, outstanding: isOutstanding(p) }, precluded)));
      const kind: SchemeKind = confirmationGaps.length ? 'gap'
        : allFull && relations.some((r) => r.type === 'direct-contradiction') ? 'contradiction'
          : allFull && relations.some((r) => r.type === 'necessary-dependency') ? 'dependency'
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
    .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.tier - b.tier || (AREA_ORDER.get(a.area) ?? 0) - (AREA_ORDER.get(b.area) ?? 0) || a.id.localeCompare(b.id, 'en', { numeric: true }));
  schemes.forEach((s, i) => { s.ref = pad('S', i + 1); });

  const outstandingItems = controls.filter((c) => c.type === 'practice' && c.state !== 'outofscope' && isOutstanding(c)).map((c) => {
    const d = declined.get(c.id);
    const reason = d ? 'declined' as const : c.answer && c.answer.value === 'unknown' ? (c.answer.by && c.answer.by !== 'Respondent' ? 'not-known-by-function' as const : 'not-known-by-respondent' as const) : 'waiting' as const;
    return { c, view: view(c), reason, fn: d?.function ?? c.waiting?.function ?? (c.answer?.by !== 'Respondent' ? c.answer?.by : null) ?? null, declineReason: d?.declineReason ?? null };
  });
  const consistency = input.staged.consistency as { eligible: number; selected: number; answered: number; untested: number; counts: Record<string, number>; limitation: string; checks: { scenario: string; confirmation: string; followup: string; outcome: string }[] };
  return { schemes, scenarios: schemes, outstandingItems, consistency, profile: input.profile as { id: string; value: unknown; label: string }[], controls, byId, precluded, view };
}

// ------------------------------------------------------------------------------------------------ registers

export type Finding = {
  ref: string; schemeRef: string; schemeId: string; kind: SchemeKind; title: string; area: string; areaName: string; tier: number;
  position: string; mechanism: string | null; whyItMatters: string | null; unresolved: string[]; furtherWeaknesses: string[];
  controlRefs: string[]; riskRef: string | null; answeredBy: string[]; methodRisks: string[];
};
export type RiskEntry = {
  ref: string; findingRef: string; schemeRef: string; title: string; statement: string; cause: string; consequence: string | null;
  currentPosition: string; treatment: string; ownerRole: string; rating: string;
};
export type Purpose = 'resolve-answer' | 'put-in-place' | 'strengthen';
export const PURPOSE_LABEL: Record<Purpose, string> = { 'resolve-answer': 'Resolve the answers', 'put-in-place': 'Put in place', strengthen: 'Strengthen' };
export type ControlBlueprint = {
  ref: string; id: string; key: string; purpose: Purpose; schemeRefs: string[]; schemeNames: string[]; reported: string; stateShort: string;
  standard: string | null; improving: string | null; records: string | null; recordRefs: string[]; ownerRole: string; methodOwner: string | null;
  answeredBy: string; prerequisiteRefs: string[]; dependentRefs: string[]; operatingCycle: string; activities: string[]; successMeasure: string;
  contentGaps: ContentGap[]; questionText: string; answerLabel: string | null; area: string;
};
export type RecordItem = { ref: string; text: string; controlRefs: string[]; ownerRoles: string[] };
export type Action = { ref: string; phase: number; phaseTitle: string; action: string; ownerRole: string; deliverable: string; completionTest: string; dependsOn: string[]; controlRefs: string[]; schemeRefs: string[] };
export type Measure = { ref: string; measure: string; controlRefs: string[]; ownerRole: string; programme: string };
export type Decision = { ref: string; decision: string; why: string; recommendedDirection: string; ownerRole: string; when: string; consequenceOfDelay: string; schemeRefs: string[] };
export type RelationRow = Relation & { schemeRef: string; schemeName: string; confirmationName: string; confirmationReported: string; practiceName: string; practiceReported: string; label: string };
export type OutstandingRow = { ref: string; id: string; key: string; reason: string; reasonText: string; fn: string | null; declineReason: string | null; role: string | null; schemeRef: string | null; schemeName: string | null; question: string };
export type ConnectedWeakness = { name: string; areas: string[]; gaps: { key: string; area: string; state: string }[]; inPlace: number; asked: number };

export const PHASES = [
  { n: 1, title: 'Establish the facts', purpose: 'Resolve answers that conflict or rely on a weaker practice, and obtain outstanding answers, so that nothing is built on an answer that may be wrong.' },
  { n: 2, title: 'Decide and assign', purpose: 'Name who is accountable for each area, decide which open schemes to address in this cycle and approve the target designs.' },
  { n: 3, title: 'Put prerequisites in place', purpose: 'Controls that other controls rely on, as the method establishes.' },
  { n: 4, title: 'Put the remaining controls in place', purpose: 'The controls reported as gaps for the schemes management has selected.' },
  { n: 5, title: 'Strengthen further defences', purpose: 'Practices reported weaker behind a control reported in place.' },
  { n: 6, title: 'Operate, measure and report', purpose: 'Run each control through a full cycle, check it against its success measure and report status to the oversight body.' }
] as const;

export type RevisedReport = ReturnType<typeof buildRevisedReport>;

const CYCLE_WORDS = /\b(every|each|daily|weekly|monthly|quarterly|annual|annually|each year|before|whenever)\b/i;
const REASON_TEXT: Record<string, string> = { declined: 'Declined by the function asked', 'not-known-by-function': 'Not known by the function asked', 'not-known-by-respondent': 'Not known by the respondent', waiting: 'Waiting for the function asked' };

export function buildRevisedReport(input: StagedReportInput) {
  const a = analyseStagedInput(input);
  const governance = String(a.profile.find((p) => p.id === 'PR-04')?.value ?? '');
  const oversight = oversightBody(governance);
  const schemes = a.schemes;
  const findingKinds: SchemeKind[] = ['contradiction', 'dependency', 'gap', 'qualified'];
  const riskKinds: SchemeKind[] = ['contradiction', 'dependency', 'gap'];
  const unresolvedOf = (s: SchemeView) => s.relations.filter((r) => UNRESOLVED.includes(r.type));
  const viewOf = (id: string) => a.view(a.byId.get(id)!);

  // ---- Control blueprints: one row per control, whatever number of schemes it serves.
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
        else { const p = touch(viewOf(r.practice), 'put-in-place', s); p.prereqOf.add(r.confirmation); }
      }
      s.supportingGaps.filter((v) => !unresolvedOf(s).some((r) => r.practice === v.id)).forEach((v) => touch(v, 'strengthen', s));
    }
    if (s.kind === 'qualified') s.supportingGaps.forEach((v) => touch(v, 'strengthen', s));
  }
  // Method-established prerequisites among the controls being acted on: a precluded route, or a confirmation the
  // method asks only where the practice exists.
  for (const p of a.precluded) for (const dep of p.controls) if (cb.has(p.by) && cb.has(dep)) { cb.get(p.by)!.prereqOf.add(dep); cb.get(dep)!.needs.add(p.by); }
  for (const e of cb.values()) for (const d of e.prereqOf) cb.get(d)?.needs.add(e.v.id);
  const purposeOf = (ps: Set<Purpose>): Purpose => (ps.has('put-in-place') ? 'put-in-place' : ps.has('resolve-answer') ? 'resolve-answer' : 'strengthen');
  const ordered = [...cb.values()].sort((x, y) => {
    const ox = Math.min(...x.schemes.map((s) => schemes.indexOf(s)));
    const oy = Math.min(...y.schemes.map((s) => schemes.indexOf(s)));
    return ox - oy || x.v.id.localeCompare(y.v.id, 'en', { numeric: true });
  });
  const controlRef = new Map(ordered.map((e, i) => [e.v.id, pad('C', i + 1)]));

  // ---- Records management should maintain: one row per distinct record statement.
  const recordIndex = new Map<string, RecordItem>();
  for (const e of ordered) {
    if (!e.v.records) continue;
    const r = recordIndex.get(e.v.records) ?? { ref: pad('E', recordIndex.size + 1), text: e.v.records, controlRefs: [], ownerRoles: [] };
    r.controlRefs.push(controlRef.get(e.v.id)!);
    r.ownerRoles = unique([...r.ownerRoles, e.v.ownerRole]);
    recordIndex.set(e.v.records, r);
  }
  const records = [...recordIndex.values()];

  const controlsReg: ControlBlueprint[] = ordered.map((e) => {
    const v = e.v;
    const purpose = purposeOf(e.purposes);
    const ref = controlRef.get(v.id)!;
    const prerequisiteRefs = [...e.needs].map((id) => controlRef.get(id)).filter(Boolean) as string[];
    const recordRefs = v.records ? [recordIndex.get(v.records)!.ref] : [];
    const dependentRefs = [...e.prereqOf].map((id) => controlRef.get(id) ?? controlName(id));
    const dc = e.schemes.flatMap((s) => s.relations.filter((r) => r.type === 'direct-contradiction' && (r.confirmation === v.id || r.practice === v.id)));
    // Activities refer to the standard, records and measure by reference: each is stated once, in its own column or
    // register, not repeated in every row that uses it.
    const activities = unique([
      ...(purpose === 'resolve-answer' ? [`Establish which answer is correct. ${dc[0]?.statement ?? ''}`.trim()] : []),
      ...(prerequisiteRefs.length ? [`Put the prerequisite in place first: ${joinList([...e.needs].map((id) => controlName(id)))} (${prerequisiteRefs.join(', ')}).`] : []),
      `Agree the design with the ${lc(v.ownerRole)}, so that it meets the target standard${v.format === 'anchored' ? ' at level 4' : ''}.`,
      ...(recordRefs.length ? [`Keep the records in ${recordRefs.join(', ')}.`] : []),
      `Review the first full cycle against ${ref.replace('C', 'M')}.`
    ]);
    const std = v.standard ? noStop(v.standard) : `${v.key} in place across everything it should cover`;
    const successMeasure = v.format === 'anchored'
      ? `Records for the period show that ${lc(std)}.`
      : v.format === 'choicePractice' || v.format === 'multi'
        ? `The position the method treats as in place holds for the period: ${lc(std)}.`
        : `Records for the period show this practice applied to every case in scope: ${lc(v.key)}.`;
    return {
      ref, id: v.id, key: v.key, purpose, schemeRefs: e.schemes.map((s) => s.ref), schemeNames: e.schemes.map((s) => s.name), reported: v.reported, stateShort: v.stateShort,
      standard: v.standard, improving: v.improving, records: v.records, recordRefs, ownerRole: v.ownerRole, methodOwner: v.methodOwner, answeredBy: v.answeredBy,
      prerequisiteRefs, dependentRefs, operatingCycle: CYCLE_WORDS.test(`${v.standard ?? ''} ${v.questionText}`) ? 'As the standard and question state' : 'Not stated by the method',
      activities, successMeasure, contentGaps: v.contentGaps, questionText: v.questionText, answerLabel: v.answerLabel, area: a.byId.get(v.id)?.domain?.id ?? ''
    };
  });
  const refOf = (id: string) => controlRef.get(id);

  // ---- Findings and risks.
  const findings: Finding[] = [];
  const risks: RiskEntry[] = [];
  for (const s of schemes.filter((x) => findingKinds.includes(x.kind))) {
    const fRef = pad('F', findings.length + 1);
    const un = unresolvedOf(s);
    const further = s.relations.filter((r) => r.type === 'complementary-weakness').map((r) => r.statement);
    const confText = (v: ControlView) => (v.format === 'anchored' && v.level !== null ? `${v.key}: ${lc(v.reported)}` : v.reported);
    let position: string;
    if (s.kind === 'gap') {
      position = `${s.confirmationGaps.map(confText).join(' ')}${s.supportingGaps.length ? ` Supporting practices also reported weaker: ${joinList(s.supportingGaps.slice(0, 5).map((v) => `${lc(v.key)} (${lc(v.stateShort)})`))}${s.supportingGaps.length > 5 ? ` and ${s.supportingGaps.length - 5} more` : ''}.` : ''}`;
    } else if (s.kind === 'qualified') {
      position = `${s.confirmations.map(confText).join(' ')} Further defences reported weaker: ${joinList(s.supportingGaps.slice(0, 5).map((v) => `${lc(v.key)} (${lc(v.stateShort)})`))}${s.supportingGaps.length > 5 ? ` and ${s.supportingGaps.length - 5} more` : ''}.`;
    } else {
      position = un.map((r) => r.statement).join(' ');
    }
    const controlRefs = unique([...s.confirmationGaps, ...s.supportingGaps].map((v) => refOf(v.id)).concat(un.flatMap((r) => [refOf(r.practice), r.type === 'direct-contradiction' ? refOf(r.confirmation) : undefined])).filter(Boolean) as string[]);
    // FR, not R: the method's own risk codes are R1 to R12, and a report reference must never read like one.
    const riskRef = riskKinds.includes(s.kind) ? pad('FR', risks.length + 1) : null;
    findings.push({
      ref: fRef, schemeRef: s.ref, schemeId: s.id, kind: s.kind, title: s.name, area: s.area, areaName: s.areaName, tier: s.tier, position,
      mechanism: s.how ? sentence(s.how) : null, whyItMatters: s.why ? sentence(s.why) : null, unresolved: un.map((r) => r.statement), furtherWeaknesses: further,
      controlRefs, riskRef, answeredBy: s.answeredBy, methodRisks: s.methodRisks
    });
    if (riskRef) {
      const cause = s.kind === 'gap'
        ? `${joinList(s.confirmationGaps.map((v) => `${lc(v.key)} is ${lc(v.stateShort)}`))}`
        : s.kind === 'contradiction' ? 'the answers about the control that stops it conflict' : `the control that stops it relies on ${joinList(un.map((r) => lc(controlName(r.practice))))}, reported weaker`;
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

  // ---- Actions, in the six phases. Order follows what must be known and decided first; no dates are set.
  const actions: Action[] = [];
  const act = (phase: number, x: Omit<Action, 'ref' | 'phase' | 'phaseTitle'>) => actions.push({ ref: '', phase, phaseTitle: PHASES[phase - 1].title, ...x });
  const unresolvedSchemes = schemes.filter((s) => s.kind === 'contradiction' || s.kind === 'dependency');
  for (const s of unresolvedSchemes) {
    const un = unresolvedOf(s);
    const lead = s.confirmations[0];
    act(1, {
      action: s.kind === 'contradiction'
        ? `Establish which answer is right for ${lc(s.name.replace(/\.$/, ''))}: ${joinList(unique(un.flatMap((r) => [controlName(r.confirmation), controlName(r.practice)])).map(lc))}.`
        : `Confirm how ${lc(controlName(un[0].confirmation))} operates while ${joinList(un.map((r) => lc(controlName(r.practice))))} ${un.length > 1 ? 'are' : 'is'} reported weaker.`,
      ownerRole: lead.ownerRole, deliverable: 'A corrected answer, or a recorded decision to put the missing practice in place.',
      completionTest: 'The answers for this scheme agree with each other and with how the process runs.', dependsOn: [],
      controlRefs: un.flatMap((r) => [refOf(r.confirmation), refOf(r.practice)]).filter(Boolean) as string[], schemeRefs: [s.ref]
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
      action: `Name the executive accountable for ${AREA_SHORT[ar] ?? lc(AREA_NAME.get(ar) ?? ar)}, where ${plural(ss.length, 'scheme is', 'schemes are')} open or unresolved.`,
      ownerRole: 'Chief executive', deliverable: 'A named accountable executive for the area.', completionTest: 'The area has one named executive who has accepted the role.',
      dependsOn: [], controlRefs: [], schemeRefs: ss.map((s) => s.ref)
    });
  }
  if (openSchemes.length) {
    act(2, {
      action: `Decide which of the ${plural(openSchemes.filter((s) => s.kind === 'gap').length, 'scheme', 'schemes')} with a control reported as a gap to address in this cycle, and in what order.`,
      ownerRole: 'Chief executive', deliverable: 'A recorded selection and order, with the reason for each choice.',
      completionTest: 'Every open scheme is either selected, deferred with a reason, or accepted as a risk at the right level.', dependsOn: [], controlRefs: [], schemeRefs: openSchemes.map((s) => s.ref)
    });
    act(2, {
      action: 'Approve the target designs for the selected schemes, using the method standards in the control register.',
      ownerRole: 'Chief executive', deliverable: 'Approved designs, each with an owner and the records it will keep.', completionTest: 'Each selected control has an approved design and an owner.',
      dependsOn: [], controlRefs: controlsReg.filter((c) => c.purpose === 'put-in-place').map((c) => c.ref), schemeRefs: openSchemes.map((s) => s.ref)
    });
  }
  for (const c of controlsReg) {
    const phase = c.dependentRefs.length && c.purpose === 'put-in-place' ? 3 : c.purpose === 'put-in-place' ? 4 : c.purpose === 'strengthen' ? 5 : 0;
    if (!phase) continue;
    act(phase, {
      action: `${c.purpose === 'strengthen' ? 'Strengthen' : 'Put in place'}: ${lc(c.key)} (${c.ref})${c.dependentRefs.length ? `, relied on by ${joinList(c.dependentRefs)}` : ''}.`,
      ownerRole: c.ownerRole, deliverable: c.recordRefs.length ? `${c.ref} operating, keeping the records in ${c.recordRefs.join(', ')}.` : `${c.ref} operating, with a record of each case it covers.`,
      completionTest: `${c.ref.replace('C', 'M')} met for one full cycle.`, dependsOn: c.prerequisiteRefs, controlRefs: [c.ref], schemeRefs: c.schemeRefs
    });
  }
  const programmes = unique(controlsReg.map((c) => c.ownerRole));
  for (const p of programmes) {
    const cs = controlsReg.filter((c) => c.ownerRole === p);
    act(6, {
      action: `Run the ${plural(cs.length, 'control', 'controls')} owned by the ${lc(p)} through a full cycle and check each against its success measure.`,
      ownerRole: p, deliverable: 'A first-cycle review for each control, with exceptions and their resolution.', completionTest: 'Each control has met its success measure for one full cycle, or has a recorded correction.',
      dependsOn: [], controlRefs: cs.map((c) => c.ref), schemeRefs: unique(cs.flatMap((c) => c.schemeRefs))
    });
  }
  if (actions.length) {
    act(6, {
      action: `Report the status of every open and unresolved scheme to ${lc(oversight)} at each of its meetings until each is closed, deferred with a reason or accepted.`,
      ownerRole: 'Chief executive', deliverable: 'A one-page status: scheme, owner, controls in place, controls outstanding, next step.',
      completionTest: 'The status is received and minuted at each meeting.', dependsOn: [], controlRefs: [], schemeRefs: openSchemes.map((s) => s.ref)
    });
  }
  actions.sort((x, y) => x.phase - y.phase);
  actions.forEach((x, i) => { x.ref = pad('A', i + 1); });
  const actionOfControl = new Map(actions.filter((x) => x.phase >= 3 && x.phase <= 5).map((x) => [x.controlRefs[0], x.ref]));
  for (const x of actions) x.dependsOn = x.dependsOn.map((c) => actionOfControl.get(c) ?? c);

  // ---- Measures: one per control, in the control's own terms.
  const measures: Measure[] = controlsReg.map((c) => ({ ref: c.ref.replace('C', 'M'), measure: c.successMeasure, controlRefs: [c.ref], ownerRole: c.ownerRole, programme: c.ownerRole }));

  // ---- Decisions for leadership. No deadline is set; "when" states what the decision must precede.
  const decisions: Decision[] = [];
  const dec = (d: Omit<Decision, 'ref'>) => decisions.push({ ref: pad('D', decisions.length + 1), ...d });
  if (unresolvedSchemes.length) {
    dec({
      decision: `Have the ${plural(unresolvedSchemes.length, 'scheme', 'schemes')} whose answers conflict or rely on a weaker practice resolved before any of them is treated as covered.`,
      why: `${plural(unresolvedSchemes.filter((s) => s.kind === 'contradiction').length, 'scheme has', 'schemes have')} answers that cannot both be right, and ${plural(unresolvedSchemes.filter((s) => s.kind === 'dependency').length, 'scheme relies', 'schemes rely')} on a control whose prerequisite is reported weaker.`,
      recommendedDirection: 'Ask each process owner to establish which answer reflects how the process runs, and correct the record.',
      ownerRole: 'Chief executive', when: 'Before the controls concerned are relied on or reported as in place.', consequenceOfDelay: 'The organisation may rely on a control that does not operate as reported.', schemeRefs: unresolvedSchemes.map((s) => s.ref)
    });
  }
  if (a.outstandingItems.length) {
    dec({
      decision: `Require an answer, or a recorded open item, for each of the ${a.outstandingItems.length} outstanding questions.`,
      why: `Of these, ${outstandingPhrase(a.outstandingItems)}. Nothing is concluded about them.`,
      recommendedDirection: 'Assign each to a named person, and record any that cannot be answered as an open item.', ownerRole: 'Chief executive',
      when: 'Before the schemes they affect are prioritised.', consequenceOfDelay: 'The schemes they affect stay unknown rather than covered.', schemeRefs: unique(a.outstandingItems.map((o) => schemes.find((s) => s.id === o.c.scenario?.id)?.ref ?? null).filter(Boolean) as string[])
    });
  }
  if (areas.length) {
    dec({
      decision: `Name one accountable executive for each area with open or unresolved schemes: ${joinList(areas.map((ar) => `${AREA_SHORT[ar] ?? ar} (${openSchemes.filter((s) => s.area === ar).length})`))}.`,
      why: 'Each scheme needs one person with authority over the process, the system and the people involved.',
      recommendedDirection: `The method suggests: ${joinList(areas.slice(0, 5).map((ar) => `${lc(AREA_LEAD.get(ar) ?? 'senior management')} for ${AREA_SHORT[ar] ?? ar}`))}${areas.length > 5 ? ', and the leads named in the register for the rest' : ''}.`,
      ownerRole: 'Chief executive', when: 'Before design work starts.', consequenceOfDelay: 'Open schemes have no owner and the controls that stop them stay unassigned.', schemeRefs: openSchemes.map((s) => s.ref)
    });
    dec({
      decision: 'Decide which open schemes to address first.',
      why: 'The draft method does not yet rank fraud risks by likelihood or impact, so this report does not rank them. The tier shows how early the method confirms a scheme, not how serious it is.',
      recommendedDirection: 'Resolve conflicting answers and prerequisites first, as the method requires; order the rest using management\'s own knowledge of volumes, values and exposure.',
      ownerRole: 'Chief executive', when: 'Before design work starts.', consequenceOfDelay: 'Effort is spread across every scheme at once, or follows the order of this report, which is not a risk ranking.', schemeRefs: openSchemes.filter((s) => s.kind === 'gap').map((s) => s.ref)
    });
  }
  if (actions.length) {
    dec({
      decision: `Have ${lc(oversight)} receive the status of the open and unresolved schemes at each of its meetings until each is closed, deferred with a reason or accepted.`,
      why: 'Regular reporting keeps the schemes visible to the people who can remove blockers.',
      recommendedDirection: 'A one-page status per scheme: owner, controls in place, controls outstanding, next step.', ownerRole: 'Chief executive',
      when: 'From the first meeting after this report.', consequenceOfDelay: 'Progress is not visible until the next assessment.', schemeRefs: openSchemes.map((s) => s.ref)
    });
  }

  // ---- Answer relationships, outstanding information, connected weaknesses, roles and content gaps.
  const relationRows: RelationRow[] = schemes.flatMap((s) => s.relations.map((r) => ({
    ...r, schemeRef: s.ref, schemeName: s.name, confirmationName: controlName(r.confirmation), confirmationReported: viewOf(r.confirmation).reported,
    practiceName: controlName(r.practice), practiceReported: viewOf(r.practice).reported, label: RELATION_LABEL[r.type]
  })));
  const outstanding: OutstandingRow[] = a.outstandingItems.map((o, i) => {
    const s = schemes.find((x) => x.id === o.c.scenario?.id);
    return { ref: pad('O', i + 1), id: o.c.id, key: o.view.key, reason: o.reason, reasonText: REASON_TEXT[o.reason], fn: o.fn, declineReason: o.declineReason, role: o.c.role ?? null, schemeRef: s?.ref ?? null, schemeName: s?.name ?? null, question: o.c.text };
  });
  const answeredById = new Map(a.controls.map((c) => [c.id, c]));
  const connected: ConnectedWeakness[] = COV.crossObjectives.map((o) => {
    const asked = o.questions.map((id) => answeredById.get(id)).filter((c): c is ControlRecord => !!c && !!c.answer && !outstandingOf(c) && !!c.class);
    const gaps = asked.filter((c) => GAP.has(c.class!)).map((c) => ({ key: c.key ?? controlName(c.id), area: c.domain?.id ?? '', state: CLASS_SHORT[c.class!] }));
    return { name: o.name, areas: unique(gaps.map((g) => g.area)), gaps, inPlace: asked.filter((c) => c.class === 'full').length, asked: asked.length };
  }).filter((x) => x.gaps.length >= 2 && x.areas.length >= 2).sort((x, y) => y.gaps.length - x.gaps.length);
  const roles = roleMap(controlsReg.map((c) => c.methodOwner));
  const gapsRegister = controlsReg.filter((c) => c.contentGaps.length).map((c) => ({ ref: c.ref, id: c.id, key: c.key, gaps: c.contentGaps }));

  // ---- Information sufficiency (R-2 candidate rules) and the R-1 cover test.
  const stages = (input.staged as { stages: { core: { complete: boolean; applicableSoFar: number; answered: number }; breadth: { complete: boolean; applicableSoFar: number; answered: number } } }).stages;
  const sufficiency: SufficiencyResult = evaluateInformationSufficiency({
    stages,
    schemes: schemes.filter((s) => s.kind !== 'not-expected').map((s) => ({ id: s.id, tier: s.tier, area: s.area, confirmations: s.confirmations.map((c) => ({ id: c.id, outstanding: c.outstanding, answered: !!c.cls && !c.outstanding })) })),
    notExpected: schemes.filter((s) => s.kind === 'not-expected').length,
    outstanding: a.outstandingItems.map((o) => ({ id: o.c.id, reason: o.reason, role: o.c.role ?? null }))
  });
  const tier1Reported = schemes.filter((s) => s.tier === 1 && ['confirmed', 'qualified', 'contradiction', 'dependency'].includes(s.kind)).length;
  const r1 = {
    rule: 'R-1 prototype convention: the calculated figure does not lead the cover when unresolved self-reported inconsistencies affect at least 3 schemes, or at least 10% of the tier 1 schemes reported covered.',
    unresolved: unresolvedSchemes.length, tier1Reported,
    substantial: unresolvedSchemes.length >= 3 || (tier1Reported > 0 && unresolvedSchemes.filter((s) => s.tier === 1).length / tier1Reported >= 0.1)
  };
  const count = (k: SchemeKind) => schemes.filter((s) => s.kind === k).length;
  const summary = {
    applicable: schemes.length, notExpected: count('not-expected'), tier1: schemes.filter((s) => s.tier === 1).length,
    byKind: Object.fromEntries((Object.keys(KIND_LABEL) as SchemeKind[]).map((k) => [k, count(k)])) as Record<SchemeKind, number>,
    tier1Gap: schemes.filter((s) => s.tier === 1 && s.kind === 'gap').length,
    relations: Object.fromEntries((Object.keys(RELATION_LABEL) as (keyof typeof RELATION_LABEL)[]).map((k) => [k, relationRows.filter((r) => r.type === k).length]))
  };

  return {
    version: REVISED_REPORT_MODEL_VERSION, methodLabel: REVISED_METHOD_LABEL, oversight, schemes, findings, risks, controls: controlsReg, records, actions, measures, decisions,
    relations: relationRows, outstanding, connected, roles, contentGaps: gapsRegister, sufficiency, r1, summary, consistency: a.consistency, analysis: a
  };
}

/** Kept for callers that need the analysis and the outstanding items (standard-status tests, SS-09). */
export function buildRevisedEvidenceModel(input: StagedReportInput) {
  const report = buildRevisedReport(input);
  return { model: report, analysis: report.analysis };
}
