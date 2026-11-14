import crypto from 'node:crypto';
import coverage from '../../../readiness-review/data/coverage-map-v1.3.json' with { type: 'json' };
import bankData from '../../../readiness-review/data/bank-v1.3.json' with { type: 'json' };
import type { RevisedReport, ControlBlueprint, Finding } from '../evidence-model';
import { SCENARIO_STRUCTURES, SCENARIO_STRUCTURE_VERSION, type ScenarioStructure } from './scenario-structures';
import { DECISION_OPTIONS, DECISION_OPTIONS_VERSION, decisionTypeOf, type DecisionOptionSet } from './decision-options';
import { controlContent } from '../control-content/index';
import { scenarioAccount } from '../position';
import { scoreConclusion, type RevisedScore } from '../score';
import { METHOD_SETS_NO_ESCALATION } from '../evidence-model';

/**
 * Narrative Fact Pack for the revised assessment (Reporting Bible v1.1, sections 3.2 and 16, stage 3).
 *
 * FICTIONAL PROTOTYPE. The bounded source of truth that the manuscript writer may use, built only from the revised
 * report model (the deterministic analytical truth) and from MK's draft advisory content (control-content library,
 * scenario structures and decision options, each versioned and awaiting MK approval). Every fact carries a stable
 * reference so that each manuscript paragraph can cite what it relies on, and every count is a fact so that the writer
 * never reproduces a number from memory: the manuscript writes `[[REF]]` and the composer injects the value.
 *
 * Selection is by stated rules only. MK has not approved a prioritisation method (decision P-13), so no rule here
 * ranks fraud risk, assigns materiality or uses the method's information-gathering tier as importance.
 */
export const REVISED_FACT_PACK_VERSION = 'revised-fact-pack-0.3';
export type Product = 'essential' | 'comprehensive';

export type Fact = { ref: string; label: string; value: string | number; words?: string; source: string };
export type AreaFact = {
  ref: string; code: string; name: string; apply: number; confirmed: number; qualified: number; unresolved: number; gap: number;
  outstanding: number; notExpected: number;
  /** Scenarios whose position is not yet established (applicability outstanding, or not reached); never counted as applying or in place. */
  pending: number; figure: number | null; pattern: 'held' | 'open' | 'mixed' | 'not-assessed';
};
export type ThemeFact = {
  ref: string; kind: 'answers' | 'structure' | 'cross' | 'area' | 'uncertainty' | 'held' | 'doubt'; title: string; basis: string; areas: string[];
  controls: string[]; schemeRefs: string[]; factRefs: string[];
  /** Scenarios whose core (confirming) control is one of the theme's controls: the strongest link to the theme. */
  confirmSchemeRefs?: string[];
};
export type FindingFact = {
  ref: string; findingRef: string; schemeRef: string; schemeId: string; kind: string; title: string; areaName: string; themeRef: string | null;
  how: string | null; why: string | null; position: string; reported: { key: string; state: string; question: string; answer: string | null; owner: string }[];
  furtherWeaknesses: string[]; questions: string[]; methodRisks: string[]; ownerRole: string; controlRefs: string[]; selectedBecause: string;
};
export type PathwayFact = { ref: string; schemeId: string; schemeRef: string; findingRef: string; themeRef: string | null; title: string; structure: ScenarioStructure };
export type PriorityFact = {
  ref: string; kind: 'settle' | 'control'; title: string; why: string; establish: string; accountable: string; practicalOwner: string;
  stage: string; measure: string; controlRef: string | null; findingRefs: string[];
};
export type BlueprintFact = {
  ref: string; controlRef: string; id: string; name: string; purpose: string; current: string; target: string; objective: string;
  accountable: string; processOwner: string; population: string; frequency: string; record: string; independentCheck: string;
  escalation: string; sla: string; measure: string; onFailure: string; connected: string[]; activities: string[]; archetype: string | null;
  sources: string[]; findingRefs: string[];
};
export type DecisionFact = { ref: string; decisionRef: string; type: string; question: string; why: string; owner: string; when: string; delay: string; options: DecisionOptionSet | null };
export type StageFact = { ref: string; label: string; window: string; purpose: string; outcomes: string[]; owners: string[]; items: { text: string; owner: string; deliverable: string }[] };
export type MeasureFact = { ref: string; measure: string; owner: string; frequency: string; escalation: string; kind: 'control' | 'programme' };
export type LegalFact = { ref: string; area: string; areaName: string; question: string; text: string; source: string };
export type RoleFact = { ref: string; role: string; responsibility: string; basis: string };

export type RevisedFactPack = {
  version: typeof REVISED_FACT_PACK_VERSION; product: Product; bibleVersion: '1.1'; generatedAt: string;
  contentVersions: { controls: string; scenarios: string; decisions: string; relationships: string; sufficiency: string };
  organisation: { name: string; reference: string; industry: string | null; people: string | null; turnover: string | null; type: string | null; oversight: string; oversightKnown: boolean };
  facts: Record<string, Fact>;
  position: { ref: string; label: string; value: string; text: string }[];
  areas: AreaFact[];
  themes: ThemeFact[];
  findings: FindingFact[];
  pathways: PathwayFact[];
  priorities: PriorityFact[];
  blueprints: BlueprintFact[];
  decisions: DecisionFact[];
  roadmap: StageFact[];
  scorecard: MeasureFact[];
  operatingModel: RoleFact[];
  /** South African legal context the method itself attaches to questions in the areas the report discusses (bank help text). */
  legal: LegalFact[];
  outstanding: { key: string; fn: string | null; reason: string; scenario: string | null }[];
  selectionRules: Record<string, string>;
  boundary: string[];
  prohibited: string[];
  pending: { ref: string; requirement: string; status: string }[];
  sha256: string;
};

const XO = (coverage as unknown as { crossObjectives: { id: string; name: string; questions: string[] }[] }).crossObjectives;
/** Cross-cutting objectives the method itself groups as one family: how an instruction or identity is verified. */
const VERIFY_FAMILY = ['OBJ-X-01', 'OBJ-X-03', 'OBJ-X-05', 'OBJ-X-06'];

const WORDS = ['none', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
const words = (n: number) => (n >= 0 && n <= 10 ? WORDS[n] : String(n));
const lc = (s: string) => (/^[A-Z]{2}/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));
const pad = (n: number) => String(n).padStart(2, '0');

export function buildRevisedFactPack(input: {
  report: RevisedReport; product: Product; organisationName: string; assessmentReference: string; generatedAt: string;
  profile: { id: string; label: string; value: unknown }[]; position: { key: string; label: string; value: string; text: string }[];
  figure: { overall: number | null; areas: { area: string; value: number }[]; label: string };
  /** The MK Fraud Readiness score (DR-02). Absent for older and fixture packs, which keep their earlier wording. */
  score?: RevisedScore | null;
}): RevisedFactPack {
  const { report: r, product } = input;
  const facts: Record<string, Fact> = {};
  const fact = (ref: string, label: string, value: string | number, source: string) => {
    facts[ref] = { ref, label, value, ...(typeof value === 'number' ? { words: words(value) } : {}), source };
    return ref;
  };
  const prof = (id: string) => input.profile.find((p) => p.id === id)?.label ?? null;
  const S = new Map(r.schemes.map((s) => [s.ref, s]));
  const C = new Map(r.controls.map((c) => [c.ref, c]));
  const CById = new Map(r.controls.map((c) => [c.id, c]));

  // ---- Assessment-level counts.
  const by = r.summary.byKind as Record<string, number>;
  const acct = scenarioAccount(r);
  if (!acct.balanced) throw new Error('scenario_account_unbalanced');
  fact('N-APPLY', 'Fraud scenarios that apply to the organisation', acct.applicable, 'scenarioAccount.applicable');
  fact('N-APPLY-PENDING', 'Further scenarios whose applicability depends on an outstanding answer (not counted as applying)', acct.applicabilityPending, 'scenarioAccount.applicabilityPending');
  fact('N-NOT-REACHED', 'Scenarios that apply but were not reached in the interview', acct.notReached, 'scenarioAccount.notReached');
  fact('N-REPORTED-IN-PLACE', 'Scenarios with every core control reported in place, including those whose answers raise a question', acct.reportedInPlace, 'scenarioAccount.reportedInPlace');
  fact('N-IN-PLACE-QUESTIONED', 'Of those, scenarios whose answers raise a question or cannot both be right', acct.inPlaceWithQuestion, 'scenarioAccount.inPlaceWithQuestion');
  fact('T-SCENARIO-ACCOUNT', 'The account of every scenario, in the report\'s one convention', acct.sentence, 'scenarioAccount.sentence');
  fact('N-ASSESSMENT-OUTSTANDING', 'Outstanding information as the assessment counts it (questions and the rows they hold back)', r.ledger.reconciliation.assessment.total, 'ledger.reconciliation.assessment.total');
  fact('T-OUTSTANDING-RECONCILIATION', 'How the assessment\'s outstanding count relates to the questions listed', r.ledger.reconciliation.statement, 'ledger.reconciliation.statement');
  fact('N-HELD', 'Scenarios with every core control reported in place', by.confirmed ?? 0, 'summary.byKind.confirmed');
  fact('N-QUALIFIED', 'Scenarios with the core control in place and a related practice reported weaker', by.qualified ?? 0, 'summary.byKind.qualified');
  fact('N-GAP', 'Scenarios with a core control reported as a gap', by.gap ?? 0, 'summary.byKind.gap');
  fact('N-CONTRA', 'Scenarios whose answers cannot both be right', by.contradiction ?? 0, 'summary.byKind.contradiction');
  fact('N-CLARIFY', 'Scenarios whose answers raise a question to clarify', by.clarify ?? 0, 'summary.byKind.clarify');
  fact('N-SETTLE', 'Scenarios with answers to settle or questions to clarify', (by.contradiction ?? 0) + (by.dependency ?? 0) + (by.clarify ?? 0), 'summary.byKind');
  fact('N-OUTSTANDING-SCHEMES', 'Scenarios whose core answers are outstanding', by.outstanding ?? 0, 'summary.byKind.outstanding');
  fact('N-NOT-EXPECTED', 'Scenarios not expected at this size', by['not-expected'] ?? 0, 'summary.byKind.not-expected');
  fact('N-REPORTED-HELD', 'Scenarios with the core control reported in place (with or without a weaker related practice)', (by.confirmed ?? 0) + (by.qualified ?? 0), 'summary.byKind');
  fact('N-OUTSTANDING', 'Questions outstanding', r.outstanding.length, 'outstanding');
  fact('N-OUTSTANDING-FUNCTIONS', 'Functions holding outstanding questions', new Set(r.outstanding.map((o) => o.fn).filter(Boolean)).size, 'outstanding.fn');
  fact('N-PAIRS', 'Answer pairs compared under the reviewed relationship table', r.position.pairsCompared, 'position.pairsCompared');
  fact('N-CONTROLS', 'Controls the full register acts on', r.controls.length, 'controls');
  fact('N-PUT', 'Controls to put in place', r.controls.filter((c) => c.purpose === 'put-in-place').length, 'controls.purpose');
  fact('N-STRENGTHEN', 'Related practices to strengthen', r.controls.filter((c) => c.purpose === 'strengthen').length, 'controls.purpose');
  // The MK Fraud Readiness score and the agreed conclusion (DR-02, points 4, 5 and 7). The conclusion paragraph and the
  // outstanding sentence are complete sentences, inserted by slot so the agreed wording is never paraphrased.
  if (input.score) {
    const sc = input.score;
    const c = scoreConclusion(input.organisationName, sc);
    fact('N-SCORE', 'MK Fraud Readiness score, per cent (0 to 100), on the organisation\'s own answers', sc.percent, 'score.percent');
    fact('N-SCORE-COUNTED', 'Scenarios counted in the score (every core answer known)', sc.counted, 'score.counted');
    fact('N-SCORE-NOT-COUNTED', 'Scenarios that apply but are not yet counted in the score', sc.notCounted, 'score.notCounted');
    fact('T-CONCLUSION-HEADING', 'The conclusion section\'s heading, as MK set it', c.heading, 'scoreConclusion.heading');
    fact('T-CONCLUSION', 'The score conclusion, as MK set it', c.paragraph, 'scoreConclusion.paragraph');
    if (c.outstanding) fact('T-CONCLUSION-OUTSTANDING', 'What is not yet counted in the score, as MK set it', c.outstanding, 'scoreConclusion.outstanding');
  }
  if (input.figure.overall !== null) fact('FIX-SCORE', 'Calculated test result (test fixture, not an approved score)', Number(input.figure.overall.toFixed(1)), 'fixture.overall');

  // ---- Areas: the shape of the environment, in the method's order.
  const areaCodes = [...new Set(r.schemes.map((s) => s.area))];
  const areas: AreaFact[] = areaCodes.map((code) => {
    const xs = r.schemes.filter((s) => s.area === code);
    const n = (k: string[]) => xs.filter((s) => k.includes(s.kind)).length;
    const a: AreaFact = {
      ref: `AREA-${code}`, code, name: xs[0].areaName, apply: xs.filter((s) => s.kind !== 'not-expected' && s.kind !== 'none').length,
      confirmed: n(['confirmed']), qualified: n(['qualified']), unresolved: n(['contradiction', 'dependency', 'clarify']), gap: n(['gap']),
      outstanding: n(['outstanding']), notExpected: n(['not-expected']), pending: n(['none']), figure: input.figure.areas.find((x) => x.area === code)?.value ?? null, pattern: 'mixed'
    };
    a.pattern = a.apply === 0 && a.pending === 0 ? 'not-assessed' : a.gap === 0 && a.unresolved === 0 && a.outstanding === 0 && a.pending === 0 && a.apply > 0 ? 'held' : a.gap >= Math.ceil(a.apply * 0.75) ? 'open' : 'mixed';
    fact(`${a.ref}-APPLY`, `${a.name}: scenarios that apply`, a.apply, `schemes[area=${code}]`);
    fact(`${a.ref}-HELD`, `${a.name}: scenarios with the core controls reported in place`, a.confirmed + a.qualified, `schemes[area=${code}]`);
    fact(`${a.ref}-GAP`, `${a.name}: scenarios with a core control reported as a gap`, a.gap, `schemes[area=${code}]`);
    fact(`${a.ref}-OPEN`, `${a.name}: scenarios with answers to settle or questions to clarify`, a.unresolved, `schemes[area=${code}]`);
    return a;
  }).filter((a) => a.apply > 0 || a.notExpected > 0);
  const held = areas.filter((a) => a.pattern === 'held');
  const open = areas.filter((a) => a.pattern === 'open');
  fact('N-AREAS', 'Areas assessed', areas.filter((a) => a.apply > 0).length, 'areas');
  fact('N-AREAS-HELD', 'Areas with every core control reported in place', held.length, 'areas.pattern');
  fact('N-AREAS-OPEN', 'Areas where most core controls are reported as gaps', open.length, 'areas.pattern');
  fact('L-AREAS-HELD', 'Areas with every core control reported in place', joinList(held.map((a) => lc(a.name))), 'areas.pattern');
  fact('L-AREAS-OPEN', 'Areas where most core controls are reported as gaps', joinList(open.map((a) => lc(a.name))), 'areas.pattern');

  // ---- Themes: management-level patterns the method itself supports.
  const themes: ThemeFact[] = [];
  const settleKinds = ['contradiction', 'dependency', 'clarify'];
  const nSettle = (by.contradiction ?? 0) + (by.dependency ?? 0) + (by.clarify ?? 0);
  if (nSettle + (by.qualified ?? 0) >= 5 && nSettle > 0) {
    themes.push({ ref: 'THEME-ANSWERS', kind: 'answers', title: 'Controls reported in place rest on weaker practices than the answers suggest', basis: 'Scenarios with answers to settle, questions to clarify and related practices reported weaker behind a control reported in place.', areas: [...new Set(r.schemes.filter((s) => [...settleKinds, 'qualified'].includes(s.kind)).map((s) => s.areaName))], controls: [], schemeRefs: r.schemes.filter((s) => [...settleKinds, 'qualified'].includes(s.kind)).map((s) => s.ref), factRefs: ['N-SETTLE', 'N-CONTRA', 'N-CLARIFY', 'N-QUALIFIED'] });
  }
  if (r.outstanding.length >= 5) {
    themes.push({ ref: 'THEME-UNCERTAINTY', kind: 'uncertainty', title: 'Several functions do not hold answers about their own controls', basis: 'Questions put to the accountable functions and answered "not known".', areas: [...new Set(r.outstanding.map((o) => o.schemeName ? (r.schemes.find((s) => s.name === o.schemeName)?.areaName ?? '') : '').filter(Boolean))], controls: r.outstanding.map((o) => o.key), schemeRefs: r.schemes.filter((s) => s.outstanding.length).map((s) => s.ref), factRefs: ['N-OUTSTANDING', 'N-OUTSTANDING-FUNCTIONS'] });
  }
  if (held.length >= 2 && open.length >= 2) {
    themes.push({ ref: 'THEME-STRUCTURE', kind: 'structure', title: 'The fraud framework is in place at the centre but has not reached the operating processes', basis: 'Areas with every core control reported in place set against areas where most core controls are reported as gaps.', areas: open.map((a) => a.name), controls: [], schemeRefs: r.schemes.filter((s) => open.some((a) => a.code === s.area) && s.kind === 'gap').map((s) => s.ref), factRefs: ['N-AREAS-HELD', 'N-AREAS-OPEN', 'L-AREAS-HELD', 'L-AREAS-OPEN', ...open.map((a) => `${a.ref}-GAP`), ...held.map((a) => `${a.ref}-HELD`)] });
  } else {
    const gapTotal = by.gap ?? 0;
    const lead = [...areas].sort((x, y) => y.gap - x.gap)[0];
    if (lead && gapTotal >= 3 && lead.gap >= Math.ceil(gapTotal * 0.6)) {
      themes.push({ ref: 'THEME-AREA', kind: 'area', title: `The open fraud scenarios sit almost entirely in ${lc(lead.name)}`, basis: 'Share of the scenarios with a core control reported as a gap that fall in one area.', areas: [lead.name], controls: [], schemeRefs: r.schemes.filter((s) => s.area === lead.code && s.kind === 'gap').map((s) => s.ref), factRefs: [`${lead.ref}-GAP`, 'N-GAP', `${lead.ref}-APPLY`] });
    }
  }
  if (!themes.some((t) => t.kind === 'structure' || t.kind === 'answers') && held.length >= 3) {
    themes.push({ ref: 'THEME-HELD', kind: 'held', title: 'The core fraud framework is reported in place', basis: 'Areas with every core control reported in place.', areas: held.map((a) => a.name), controls: [], schemeRefs: r.schemes.filter((s) => held.some((a) => a.code === s.area)).map((s) => s.ref), factRefs: ['N-AREAS-HELD', 'L-AREAS-HELD', ...held.map((a) => `${a.ref}-HELD`)] });
  }
  for (const a of areas) {
    const doubt = a.unresolved + a.qualified;
    if (a.unresolved >= 1 && doubt >= 3 && doubt >= Math.ceil(a.apply / 2)) {
      fact(`${a.ref}-DOUBT`, `${a.name}: scenarios with answers to settle, questions to clarify or weaker related practices`, doubt, `schemes[area=${a.code}]`);
      themes.push({ ref: `THEME-DOUBT-${a.code}`, kind: 'doubt', title: `The answers on ${lc(a.name)} do not yet support the position they report`, basis: 'An area where at least half the scenarios have answers to settle, questions to clarify or weaker related practices behind a control reported in place.', areas: [a.name], controls: [], schemeRefs: r.schemes.filter((s) => s.area === a.code && ['contradiction', 'dependency', 'clarify', 'qualified'].includes(s.kind)).map((s) => s.ref), factRefs: [`${a.ref}-DOUBT`, `${a.ref}-APPLY`, `${a.ref}-OPEN`] });
    }
  }
  // Cross-cutting requirements weak in more than one place: the method's own cross-area objectives.
  const answerOf = (qid: string) => {
    for (const s of r.schemes) for (const c of [...s.confirmations, ...s.supportingGaps]) if (c.id === qid) return c;
    const c = CById.get(qid);
    return c ? { id: c.id, key: c.key, cls: c.stateShort === 'In place' ? 'full' : 'weak', stateShort: c.stateShort } as { id: string; key: string; cls: string | null; stateShort: string } : null;
  };
  const crossWeak = XO.map((o) => {
    const asked = o.questions.map((q) => answerOf(q)).filter((x): x is NonNullable<typeof x> => !!x);
    const weak = asked.filter((c) => c.cls !== 'full');
    return { o, weak, asked, areas: [...new Set(weak.map((c) => c.id.split('-')[0]))] };
  }).filter((x) => x.weak.length > 0);
  const qualifies = (xs: typeof crossWeak) => { const ids = new Set(xs.flatMap((x) => x.weak.map((c) => c.id))); const ar = new Set([...ids].map((id) => id.split('-')[0])); return ar.size >= 2 || ids.size >= 3; };
  const verifyAll = crossWeak.filter((x) => VERIFY_FAMILY.includes(x.o.id));
  const verify = qualifies(verifyAll) ? verifyAll : [];
  const groups: { ref: string; title: string; members: typeof crossWeak }[] = [];
  if (verify.length) groups.push({ ref: 'THEME-VERIFY', title: 'Instructions that move money or change identity are accepted on the requester\'s word', members: verify });
  for (const x of crossWeak.filter((x) => !VERIFY_FAMILY.includes(x.o.id) && qualifies([x]))) groups.push({ ref: `THEME-${x.o.id.replace('OBJ-', '')}`, title: x.o.name, members: [x] });
  for (const g of groups) {
    const weak = g.members.flatMap((m) => m.weak);
    const ids = [...new Set(weak.map((c) => c.id))];
    const areaNames = [...new Set(ids.map((id) => areas.find((a) => a.code === id.split('-')[0])?.name).filter((x): x is string => !!x))];
    fact(`${g.ref}-N`, `${g.title}: practices reported weaker`, ids.length, 'coverage.crossObjectives');
    fact(`${g.ref}-AREAS`, `${g.title}: areas`, joinList(areaNames.map(lc)), 'coverage.crossObjectives');
    fact(`${g.ref}-NAREAS`, `${g.title}: number of areas`, areaNames.length, 'coverage.crossObjectives');
    themes.push({ ref: g.ref, kind: 'cross', title: g.title, basis: `The method's cross-area objectives: ${g.members.map((m) => m.o.name).join('; ')}.`, areas: areaNames, controls: [...new Set(weak.map((c) => c.key))], schemeRefs: r.schemes.filter((s) => s.confirmations.some((c) => ids.includes(c.id)) || s.supportingGaps.some((c) => ids.includes(c.id))).map((s) => s.ref), confirmSchemeRefs: r.schemes.filter((s) => s.confirmations.some((c) => ids.includes(c.id) && c.cls !== 'full')).map((s) => s.ref), factRefs: [`${g.ref}-N`, `${g.ref}-AREAS`, `${g.ref}-NAREAS`] });
  }
  const themeOrder = ['answers', 'doubt', 'uncertainty', 'structure', 'held', 'area', 'cross'];
  themes.sort((x, y) => themeOrder.indexOf(x.kind) - themeOrder.indexOf(y.kind) || y.controls.length - x.controls.length || x.title.localeCompare(y.title));
  themes.splice(5);

  // ---- Findings: answers to settle first, then one scenario per theme in turn (stated rule, no ranking).
  const MAX_FINDINGS = 7;
  const findingOf = new Map(r.findings.map((f) => [f.schemeRef, f]));
  const selected: { f: Finding; theme: string | null; because: string }[] = [];
  for (const f of r.findings.filter((f) => settleKinds.includes(f.kind))) {
    if (selected.length < MAX_FINDINGS) selected.push({ f, theme: themes.find((t) => t.schemeRefs.includes(f.schemeRef))?.ref ?? null, because: f.kind === 'clarify' ? 'The answers raise a question that must be answered before the control is relied on.' : 'The answers cannot both be right and must be settled before the control is relied on.' });
  }
  const notGapsAbsent = (f: Finding) => S.get(f.schemeRef)!.confirmations.filter((c) => c.cls !== 'full').length;
  const representedAreas = () => new Set(selected.map((x) => x.f.area));
  const memberOf = (t: ThemeFact, f: Finding) => t.kind === 'held' ? false : t.kind === 'doubt' ? t.schemeRefs.includes(f.schemeRef) && f.kind === 'qualified'
    : t.kind === 'answers' ? f.kind === 'qualified' && t.schemeRefs.includes(f.schemeRef)
    : t.kind === 'uncertainty' ? S.get(f.schemeRef)!.outstanding.length > 0 || t.schemeRefs.includes(f.schemeRef)
    : f.kind === 'gap' && (t.kind === 'cross' ? (t.confirmSchemeRefs?.length ? t.confirmSchemeRefs : t.schemeRefs).includes(f.schemeRef) : t.schemeRefs.includes(f.schemeRef));
  const candidates = (t: ThemeFact) => r.findings
    .filter((f) => memberOf(t, f) && !selected.some((x) => x.f.ref === f.ref))
    .sort((a, b) => (t.kind === 'structure' ? Number(representedAreas().has(a.area)) - Number(representedAreas().has(b.area)) : 0)
      || notGapsAbsent(b) - notGapsAbsent(a) || b.factors.relatedWeaker - a.factors.relatedWeaker || a.schemeRef.localeCompare(b.schemeRef));
  // Most specific theme first: a requirement that spans areas, then one area, then outstanding answers, then the
  // answers theme, then the overall structure, which contributes scenarios from the areas not otherwise represented.
  const specificity = ['cross', 'doubt', 'area', 'uncertainty', 'answers', 'structure', 'held'];
  const bySpecificity = [...themes].sort((x, y) => specificity.indexOf(x.kind) - specificity.indexOf(y.kind) || y.controls.length - x.controls.length);
  let progress = true;
  while (selected.length < MAX_FINDINGS && progress) {
    progress = false;
    for (const t of bySpecificity) {
      if (selected.length >= MAX_FINDINGS) break;
      const next = candidates(t)[0];
      if (next) { selected.push({ f: next, theme: t.ref, because: t.kind === 'structure' ? `It is a scenario in ${lc(next.areaName)}, one of the areas where most core controls are reported as gaps, with ${notGapsAbsent(next) > 1 ? 'more than one core control reported absent' : 'the most related practices also reported weaker'} in that area.` : `It is the scenario in the theme "${t.title}" with ${notGapsAbsent(next) > 1 ? 'more than one core control reported absent' : 'the most related practices also reported weaker'}.` }); progress = true; }
    }
  }
  // Each finding is discussed under its most specific theme.
  const themeFor = (f: Finding) => bySpecificity.find((t) => t.kind !== 'held' && (memberOf(t, f) || (t.kind !== 'structure' && t.schemeRefs.includes(f.schemeRef))))?.ref ?? null;
  for (const x of selected) x.theme = themeFor(x.f) ?? x.theme;
  // Fill from any remaining gap scenario if themes could not supply five.
  for (const f of r.findings.filter((f) => f.kind === 'gap').sort((a, b) => b.factors.relatedWeaker - a.factors.relatedWeaker || a.schemeRef.localeCompare(b.schemeRef))) {
    if (selected.length >= 5) break;
    if (!selected.some((x) => x.f.ref === f.ref)) selected.push({ f, theme: null, because: 'A core control is reported absent.' });
  }
  const findings: FindingFact[] = selected.map(({ f, theme, because }, i) => {
    const s = S.get(f.schemeRef)!;
    const owner = s.confirmations[0]?.ownerRole ?? 'Chief executive';
    return {
      ref: `FINDING-${pad(i + 1)}`, findingRef: f.ref, schemeRef: f.schemeRef, schemeId: f.schemeId, kind: f.kind, title: f.title, areaName: f.areaName, themeRef: theme,
      how: s.how, why: s.why, position: f.position,
      reported: s.confirmations.map((c) => ({ key: c.key, state: c.stateShort, question: c.questionText, answer: c.answerLabel, owner: c.ownerRole })),
      furtherWeaknesses: f.furtherWeaknesses, questions: f.questions, methodRisks: f.methodRisks, ownerRole: owner, controlRefs: f.controlRefs, selectedBecause: because
    };
  });
  fact('N-FINDINGS', 'Findings developed in this report', findings.length, 'selection');
  fact('N-FINDINGS-REGISTER', product === 'essential' ? 'Findings the analysis identified' : 'Findings in the full register (workbook)', r.findings.length, 'findings');

  // ---- Fraud pathways: findings with an approved structure, one per theme where possible.
  const maxPathways = product === 'essential' ? 3 : 4;
  const pathways: PathwayFact[] = [];
  const pathCandidates = [...findings].sort((a, b) => (a.themeRef ? themes.findIndex((t) => t.ref === a.themeRef) : 99) - (b.themeRef ? themes.findIndex((t) => t.ref === b.themeRef) : 99));
  const usedThemes = new Set<string>();
  for (const pass of [0, 1]) for (const f of pathCandidates) {
    if (pathways.length >= maxPathways) break;
    const st = SCENARIO_STRUCTURES[f.schemeId];
    if (!st || pathways.some((p) => p.schemeId === f.schemeId)) continue;
    if (pass === 0 && f.themeRef && usedThemes.has(f.themeRef)) continue;
    if (f.themeRef) usedThemes.add(f.themeRef);
    pathways.push({ ref: `PATHWAY-${pad(pathways.length + 1)}`, schemeId: f.schemeId, schemeRef: f.schemeRef, findingRef: f.ref, themeRef: f.themeRef, title: st.title, structure: st });
  }

  // ---- Priority responses (Essential) and control blueprints (Comprehensive).
  const settle = findings.filter((f) => settleKinds.includes(f.kind));
  const contra = settle.filter((f) => f.kind !== 'clarify');
  const clar = settle.filter((f) => f.kind === 'clarify');
  const priorities: PriorityFact[] = [];
  if (contra.length) priorities.push({ ref: `PRIORITY-${pad(priorities.length + 1)}`, kind: 'settle', title: contra.length === 1 ? `Settle the answers about ${lc(contra[0].title.replace(/ are not considered$/, ''))}` : 'Settle the answers that cannot both be right', why: 'Nothing should be built on an answer that may be wrong.', establish: contra.map((f) => f.position).join(' '), accountable: 'Chief executive', practicalOwner: contra[0].ownerRole, stage: '30 days, proposed', measure: 'The answers agree with each other and with how the process runs, and the corrected answer is recorded.', controlRef: null, findingRefs: contra.map((f) => f.ref) });
  if (clar.length) priorities.push({ ref: `PRIORITY-${pad(priorities.length + 1)}`, kind: 'settle', title: clar.length === 1 ? `Answer the question about ${lc(clar[0].title)}` : `Answer the ${words(clar.length)} questions the answers leave open`, why: 'Each answer decides whether a control reported in place can be relied on.', establish: clar.flatMap((f) => f.questions).join(' '), accountable: 'Chief executive', practicalOwner: joinList([...new Set(clar.map((f) => f.ownerRole))]), stage: '30 days, proposed', measure: 'Each question has a written answer from the process owner, and the assessment is corrected where needed.', controlRef: null, findingRefs: clar.map((f) => f.ref) });
  // Controls: those that close the selected gap findings, then those of other gap scenarios in a theme, then the
  // related practices of the selected findings. Controls behind an unresolved answer wait for the answer.
  const ctlPicks: { c: ControlBlueprint; fs: FindingFact[] }[] = [];
  const add = (c: ControlBlueprint | undefined, f: FindingFact | null) => {
    if (!c) return;
    const existing = ctlPicks.find((x) => x.c.ref === c.ref);
    if (existing) { if (f && !existing.fs.includes(f)) existing.fs.push(f); return; }
    ctlPicks.push({ c, fs: f ? [f] : [] });
  };
  for (const f of findings.filter((f) => f.kind === 'gap')) for (const cr of f.controlRefs) { const c = C.get(cr); if (c?.purpose === 'put-in-place') add(c, f); }
  const otherGaps = r.findings.filter((f) => f.kind === 'gap' && !findings.some((x) => x.findingRef === f.ref))
    .sort((a, b) => Number(!themes.some((t) => t.kind !== 'structure' && t.schemeRefs.includes(b.schemeRef))) - Number(!themes.some((t) => t.kind !== 'structure' && t.schemeRefs.includes(a.schemeRef))) || a.schemeRef.localeCompare(b.schemeRef));
  for (const f of otherGaps) for (const cr of f.controlRefs) { const c = C.get(cr); if (c?.purpose === 'put-in-place' && ctlPicks.length < 6) add(c, null); }
  for (const f of findings.filter((f) => f.kind === 'gap' || f.kind === 'qualified')) for (const cr of f.controlRefs) { const c = C.get(cr); if (c?.purpose === 'strengthen' && ctlPicks.length < 6) add(c, f); }
  const schemeTitle = (c: ControlBlueprint) => c.schemeNames.join('; ');
  for (const { c, fs } of ctlPicks.slice(0, Math.max(0, 6 - priorities.length))) {
    priorities.push({ ref: `PRIORITY-${pad(priorities.length + 1)}`, kind: 'control', title: c.key, why: fs.length ? fs.map((f) => f.title).join('; ') : schemeTitle(c), establish: c.target ?? c.standard ?? c.key, accountable: accountableFor(c.ownerRole), practicalOwner: c.ownerRole, stage: c.purpose === 'put-in-place' ? '60 days, proposed' : '90 days, proposed', measure: c.successMeasure, controlRef: c.ref, findingRefs: fs.map((f) => f.ref) });
  }
  const blueprints: BlueprintFact[] = ctlPicks.slice(0, 5).map(({ c, fs }, i) => {
    const cc = controlContent(c.id);
    return {
      ref: `BLUEPRINT-${pad(i + 1)}`, controlRef: c.ref, id: c.id, name: c.key, purpose: c.purpose, current: c.reported, target: c.target ?? c.standard ?? c.key,
      objective: joinList((fs.length ? fs.map((f) => f.title) : c.schemeNames).map((t) => t.replace(/\.$/, ''))),
      accountable: accountableFor(c.ownerRole), processOwner: c.ownerRole, population: cc.population ? cc.population.charAt(0).toUpperCase() + cc.population.slice(1) : c.key, frequency: cycleText(c.operatingCycle),
      record: c.recordText ?? c.records ?? 'Not named in the library', independentCheck: independentCheckOf(c), escalation: escalationOf(c),
      sla: slaOf(c), measure: c.successMeasure, onFailure: c.onFailure ?? METHOD_SETS_NO_ESCALATION,
      connected: [...new Set(fs.flatMap((f) => f.controlRefs).filter((x) => x !== c.ref).map((x) => C.get(x)?.key).filter((x): x is string => !!x))].slice(0, 4),
      activities: c.activities, archetype: c.archetype, sources: c.contentSources, findingRefs: fs.map((f) => f.ref)
    };
  });

  fact('N-THEMES', 'Themes developed in this report', themes.length, 'selection');
  fact('N-PATHWAYS', 'Fraud pathways developed in this report', pathways.length, 'selection');
  fact('N-PRIORITIES', 'First responses', priorities.length, 'selection');
  fact('N-PRIORITIES-SETTLE', 'First responses that settle answers', priorities.filter((p) => p.kind === 'settle').length, 'selection');
  fact('N-PRIORITIES-CONTROL', 'First responses that are controls', priorities.filter((p) => p.kind === 'control').length, 'selection');
  fact('N-BLUEPRINTS', 'Control blueprints in this report', blueprints.length, 'selection');
  fact('N-DECISIONS', 'Leadership decisions', r.decisions.length, 'decisions');
  fact('N-OPEN-AREAS', 'Areas with an open or unresolved scenario', areas.filter((a) => a.gap + a.unresolved > 0).length, 'areas');
  // ---- Decisions with draft options.
  const decisions: DecisionFact[] = r.decisions.map((d, i) => {
    const type = decisionTypeOf(d.decision);
    return { ref: `DECISION-${pad(i + 1)}`, decisionRef: d.ref, type, question: d.decision, why: d.why, owner: d.ownerRole, when: d.when, delay: d.consequenceOfDelay, options: DECISION_OPTIONS[type] ?? null };
  });

  // ---- Roadmap: proposed stages (Essential 30/60/90; Comprehensive Stabilise, Establish, Embed, Mature).
  const oversight = r.oversight;
  const actionsIn = (ns: number[]) => r.actions.filter((a) => ns.includes(a.phase));
  const prCtl = priorities.filter((p) => p.kind === 'control');
  const roadmap: StageFact[] = product === 'essential'
    ? [
      { ref: 'STAGE-30', label: '30 days, proposed', window: 'Proposed for the first 30 days', purpose: nSettle + r.outstanding.length ? 'Establish the facts, name the owners and decide the order of work.' : 'Name the owners, decide the order of work and approve the designs to be built.', outcomes: [...(nSettle ? ['Every answer to settle or question to clarify has a written answer'] : []), ...(r.outstanding.length ? ['Every outstanding question answered, or an open item with an owner'] : []), 'Each open area has a named accountable executive', 'The order of work is recorded with the factors behind it'], owners: [...new Set(actionsIn([1, 2]).map((a) => a.ownerRole))], items: actionsIn([1, 2]).slice(0, 6).map((a) => ({ text: a.action, owner: a.ownerRole, deliverable: a.deliverable })) },
      { ref: 'STAGE-60', label: '60 days, proposed', window: 'Proposed for days 31 to 60', purpose: 'Approve the design, owner and record for each priority control, and schedule its first operating cycle.', outcomes: prCtl.map((p) => p.title), owners: [...new Set(prCtl.map((p) => p.practicalOwner))], items: prCtl.map((p) => ({ text: p.title, owner: p.practicalOwner, deliverable: 'Approved design and first operating cycle scheduled' })) },
      { ref: 'STAGE-90', label: '90 days, proposed', window: 'Proposed for days 61 to 90', purpose: 'Start operating the priority controls and report status to the oversight body.', outcomes: ['Each priority control has run at least once and kept its record', `Status reported to ${lc(oversight)}`], owners: ['Chief executive', ...new Set(prCtl.map((p) => p.practicalOwner))], items: [...prCtl.map((p) => ({ text: p.measure, owner: p.practicalOwner, deliverable: 'First operating record' })), { text: `Report the status of each open scenario to ${lc(oversight)}.`, owner: 'Chief executive', deliverable: 'One-page status per scenario' }] }
    ]
    : [
      { ref: 'PHASE-STABILISE', label: 'Stabilise', window: '0 to 30 days, proposed', purpose: nSettle + r.outstanding.length ? 'Settle the answers, name the owners and decide the order of work.' : 'Name the owners, decide the order of work and approve the designs.', outcomes: [...(nSettle ? ['Answers settled and questions answered'] : []), ...(r.outstanding.length ? ['Outstanding questions answered or owned'] : []), 'Accountable executives named', 'Order of work recorded with its factors'], owners: [...new Set(actionsIn([1, 2]).map((a) => a.ownerRole))], items: actionsIn([1, 2]).map((a) => ({ text: a.action, owner: a.ownerRole, deliverable: a.deliverable })) },
      { ref: 'PHASE-ESTABLISH', label: 'Establish', window: '31 to 90 days, proposed', purpose: 'Approve the priority control designs, put them in place and run their first operating cycles.', outcomes: blueprints.map((b) => b.name), owners: [...new Set(blueprints.map((b) => b.processOwner))], items: blueprints.map((b) => ({ text: b.name, owner: b.processOwner, deliverable: 'Approved design and first operating record' })) },
      { ref: 'PHASE-EMBED', label: 'Embed', window: 'Months 4 to 6, proposed', purpose: 'Extend to the remaining selected scenarios and strengthen the further defences, with regular reporting.', outcomes: ['Remaining selected controls put in place', 'Related practices strengthened', 'Monthly status reporting running'], owners: [...new Set(actionsIn([4, 5]).map((a) => a.ownerRole))], items: actionsIn([4, 5]).map((a) => ({ text: a.action, owner: a.ownerRole, deliverable: a.deliverable })) },
      { ref: 'PHASE-MATURE', label: 'Mature', window: 'Months 7 to 12, proposed', purpose: 'Measure each control over a full cycle, refresh the scenarios and report to the oversight body.', outcomes: ['Each control measured over a full cycle', 'Scenarios refreshed against the assessment', `Status reported to ${lc(oversight)} at each meeting`], owners: [...new Set(actionsIn([6]).map((a) => a.ownerRole))], items: actionsIn([6]).map((a) => ({ text: a.action, owner: a.ownerRole, deliverable: a.deliverable })) }
    ];
  fact('N-ACTIONS', product === 'essential' ? 'Actions the analysis identified' : 'Actions in the full action register (workbook)', r.actions.length, 'actions');

  // ---- Scorecard.
  const scorecard: MeasureFact[] = [
    ...blueprints.map((b, i) => ({ ref: `MEASURE-${pad(i + 1)}`, measure: b.measure, owner: b.processOwner, frequency: b.frequency, escalation: b.escalation, kind: 'control' as const })),
    ...(nSettle ? [{ ref: 'MEASURE-SETTLE', measure: 'Answers to settle and questions to clarify that have a written answer', owner: 'Chief executive', frequency: 'each month until closed', escalation: 'Any item still open after the first 30 days is reported to the oversight body.', kind: 'programme' as const }] : []),
    ...(r.outstanding.length ? [{ ref: 'MEASURE-OUTSTANDING', measure: 'Outstanding questions answered by the function that holds them', owner: 'Chief executive', frequency: 'each month until closed', escalation: 'A question still unanswered after 30 days is assigned to a named person and reported.', kind: 'programme' as const }] : []),
    { ref: 'MEASURE-OWNERS', measure: 'Open scenarios with a named owner and a recorded decision to address, defer or accept them', owner: 'Chief executive', frequency: 'each month', escalation: 'A scenario without an owner after 60 days is reported to the oversight body.', kind: 'programme' },
    { ref: 'MEASURE-CYCLES', measure: 'Priority controls that have met their success measure for a full operating cycle', owner: 'Fraud risk lead', frequency: 'each quarter', escalation: 'A control that misses its measure twice is reported with its owner\'s correction plan.', kind: 'programme' },
    { ref: 'MEASURE-REPORT', measure: `Status reported to ${lc(oversight)}`, owner: 'Chief executive', frequency: 'each meeting', escalation: 'A missed report is itself reported at the next meeting.', kind: 'programme' }
  ];

  // ---- Operating model, from the answers and the consolidated roles.
  const answered = (qid: string) => { for (const s of r.schemes) for (const c of s.confirmations) if (c.id === qid) return c; return null; };
  const execAcc = answered('D1-A-01');
  const operatingModel: RoleFact[] = [
    { ref: 'ROLE-OVERSIGHT', role: r.oversight, responsibility: 'Receives fraud risk reporting, approves the order of work and holds the executive to account.', basis: r.oversightKnown ? 'The organisation\'s own answer on final oversight.' : 'Not identified in the answers.' },
    { ref: 'ROLE-EXECUTIVE', role: 'Chief executive', responsibility: 'Accountable for fraud risk overall; names the accountable executives and decides the order of work.', basis: execAcc ? `Executive accountability is reported as "${execAcc.answerLabel ?? execAcc.stateShort}".` : 'The method\'s owner for governance.' },
    { ref: 'ROLE-RISK', role: 'Fraud risk lead', responsibility: 'Coordinates the fraud risk assessment, challenges the control owners and consolidates status reporting.', basis: 'The method\'s owner for fraud risk assessment.' },
    { ref: 'ROLE-OWNERS', role: joinList([...new Set(blueprints.map((b) => b.processOwner).concat(priorities.flatMap((p) => p.practicalOwner.split(/, | and (?=[A-Z])/))))].filter((x) => x && !/Chief executive/.test(x)).slice(0, 6)), responsibility: 'Operate the controls in their processes, keep the records and report exceptions.', basis: 'The method\'s owners for the controls this report acts on.' },
    { ref: 'ROLE-DETECT', role: 'Investigations lead', responsibility: 'Receives reports and alerts, investigates independently and records outcomes.', basis: 'The method\'s owner for detection, speak-up and response.' }
  ];

  // ---- Outstanding information.
  const outstanding = r.outstanding.map((o) => ({ key: o.key, fn: o.fn, reason: o.reasonText, scenario: o.schemeName, itemType: o.itemTypeText, holdsBack: o.holdsBack }));
  // South African legal context: the method's own guidance (bank help or question text) that names a statute, chosen
  // by the topic of the findings, pathways and priorities the report discusses. Context only: it states what the law
  // provides, never that the organisation has breached it. Bills and drafts are excluded.
  const TOPICS: { re: RegExp; ids: string[] }[] = [
    { re: /investigat/i, ids: ['D10-O-03'] },
    { re: /donation|sponsorship|bribe|gift|facilitation|public official|decision-maker/i, ids: ['D1-L-03'] },
    { re: /customer detail|personal information|account takeover|identity|security compromise/i, ids: ['D9-P-04'] },
    { re: /speak-up|whistle|report(?:ing)? concerns|disclosure/i, ids: ['D10-S-03'] },
    { re: /vetting|background check|screening/i, ids: ['D5-R-16'] }
  ];
  const discussedText = [...findings.map((f) => `${f.title} ${f.how ?? ''}`), ...pathways.map((p) => p.title), ...priorities.map((p) => `${p.title} ${p.why}`)].join(' \n ');
  type BankShape = { domains: { id: string; name: string; bank: { modules: { questions: { id: string; key?: string; text?: string; help?: string }[] }[] } }[] };
  const bankById = new Map<string, { q: { id: string; key?: string; text?: string; help?: string }; area: string; areaName: string }>();
  for (const d of (bankData as unknown as BankShape).domains) for (const m of d.bank.modules) for (const q of m.questions) bankById.set(q.id, { q, area: d.id, areaName: d.name });
  const LAW = /PRECCA|Prevention and Combating of Corrupt Activities|Protected Disclosures Act|POPIA|Information Regulator|Companies Act/;
  const legal: LegalFact[] = [];
  for (const t of TOPICS) {
    if (!t.re.test(discussedText)) continue;
    for (const id of t.ids) {
      const e = bankById.get(id);
      if (!e || legal.some((l) => l.source.includes(id))) continue;
      const txt = [e.q.text, e.q.help].filter((x): x is string => !!x && LAW.test(x) && !/Bill, 2026|draft/i.test(x)).sort((a, b) => Number(/section \d/i.test(b)) - Number(/section \d/i.test(a)))[0];
      if (txt) legal.push({ ref: `LAW-${String(legal.length + 1).padStart(2, '0')}`, area: e.area, areaName: e.areaName, question: e.q.key ?? id, text: txt, source: `bank-v1.3 ${id} ${txt === e.q.help ? 'help' : 'text'}` });
    }
  }

  const pack: Omit<RevisedFactPack, 'sha256'> = {
    version: REVISED_FACT_PACK_VERSION, product, bibleVersion: '1.1', generatedAt: input.generatedAt,
    contentVersions: { controls: 'control-content-library-0.1', scenarios: SCENARIO_STRUCTURE_VERSION, decisions: DECISION_OPTIONS_VERSION, relationships: 'relationship-review-0.2', sufficiency: r.sufficiency.rule },
    organisation: { name: input.organisationName, reference: input.assessmentReference, industry: prof('PR-13'), people: prof('PR-01'), turnover: prof('PR-12'), type: prof('PR-02'), oversight: r.oversight, oversightKnown: r.oversightKnown },
    facts, position: input.position.map((p, i) => ({ ref: `POSITION-${i + 1}`, label: p.label, value: p.value, text: p.text })),
    areas, themes, findings, pathways, priorities, blueprints, decisions, roadmap, scorecard, operatingModel, legal, outstanding,
    selectionRules: {
      themes: 'A theme is reported where the method supports a pattern: answers to settle together with weaker related practices (five or more), outstanding answers (five or more), areas fully in place set against areas mostly open (two or more of each), one area holding most open scenarios, or one of the method\'s cross-area objectives reported weaker in two or more areas. Up to five, in that order.',
      findings: `Every scenario with answers to settle or a question to clarify, then one scenario from each theme in turn, choosing the one with more core controls reported absent, then more related practices reported weaker, then the method's order; up to ${MAX_FINDINGS}. This is a selection rule, not a ranking: MK has not approved a prioritisation method.`,
      pathways: `Findings with an approved scenario structure, one per theme where possible; up to ${maxPathways}.`,
      priorities: 'Settling answers comes first where there are any; then the controls that close the selected findings, controls to put in place before practices to strengthen, up to six in all.',
      blueprints: 'The controls among the priorities, up to five.'
    },
    boundary: [
      'Every finding rests on the organisation\'s own answers. MK has not examined documents, interviewed staff or tested any control.',
      'Records named are records management should maintain. MK has not reviewed them.',
      'Independent evidence review and validation belong to MK Advisory, which is scoped and priced separately.'
    ],
    prohibited: [
      input.score
        ? 'Any score other than the MK Fraud Readiness score in the Facts table; any maturity band, readiness level, grade or pass mark; any statement that the organisation is ready or protected against fraud'
        : 'Any score, maturity band or readiness level other than the labelled calculated test result',
      'Any statement that a risk is high, critical, the most material or the highest priority',
      'Any claim that a control was tested, verified, validated or confirmed by MK',
      'Any incident, loss, Rand amount, supplier, system or person not in the Fact Pack',
      'Any scenario, finding, control, decision option or owner not in the Fact Pack'
    ],
    pending: [
      ...(input.score ? [] : [{ ref: 'PENDING-CONCLUSION', requirement: 'Approved readiness conclusion (Bible 10.1 and 13.1: score and maturity)', status: 'Withheld until MK approves a readiness method (D-1).' }]),
      { ref: 'PENDING-PRIORITY', requirement: 'Priority of findings and risks (Bible 9 and 11.2: what matters most)', status: 'Stated selection rules only until MK approves a prioritisation method (P-13 to P-15).' },
      { ref: 'PENDING-CONTENT', requirement: 'Approved control, scenario and decision content (Bible 3.1)', status: `Drafts for MK approval: control-content-library-0.1, ${SCENARIO_STRUCTURE_VERSION}, ${DECISION_OPTIONS_VERSION}.` }
    ]
  };
  return { ...pack, sha256: crypto.createHash('sha256').update(JSON.stringify(pack)).digest('hex') };
}

export function accountableFor(role: string): string {
  if (/Chief executive|Chief financial officer/.test(role)) return role;
  if (/Finance|Procurement|HR and payroll|Operations|Commercial|IT/.test(role)) return 'Chief financial officer';
  return 'Chief executive';
}
/** The operating cycle as a frequency a manager can schedule ("within the last two years" is a test, not a cycle). */
export function cycleText(cycle: string): string {
  return cycle.replace(/^within the last (\w+) years$/i, 'at least every $1 years');
}
type CycleKind = 'gate' | 'periodic' | 'event';
function cycleKind(cycle: string): CycleKind {
  const c = cycle.toLowerCase();
  if (/^before\b/.test(c)) return 'gate';
  if (/^(each year|monthly|weekly|daily|each quarter|every two years|at least|within the last)/.test(c)) return 'periodic';
  return 'event';
}
export function populationOf(c: ControlBlueprint): string {
  const t = c.target ?? '';
  const m = t.match(/^(Every|Each|All) ([^,.]+?)(?: (?:is|are|has|have|passes|pass|goes|go|must|with)\b)/i);
  return m ? `${m[1]} ${m[2]}` : `Every case within the scope of "${c.key.toLowerCase()}"`;
}
export function independentCheckOf(c: ControlBlueprint): string {
  const a = c.archetype ?? '';
  if (/second person|Separate duties|Reconcile|Monitor|physical verification|Independent review/i.test(a)) return 'Built into the control: the check is carried out by someone independent of the person whose work it covers.';
  return 'A periodic review by the fraud risk lead, who samples the records and reports exceptions.';
}
export function escalationOf(c: ControlBlueprint): string {
  const to = accountableFor(c.ownerRole).toLowerCase();
  const kind = cycleKind(c.operatingCycle);
  if (kind === 'gate') return `Any item that proceeds without the check, or any exception approved, is reported to the ${to} within the month.`;
  if (kind === 'event') return `Any case handled without the check, or any exception approved, is reported to the ${to} within the month.`;
  return `Any exception not closed by the next review, or any review missed, is reported to the ${to}.`;
}
/** A proposed service level for management to set; never presented as an observed or contractual standard. */
export function slaOf(c: ControlBlueprint): string {
  const cyc = cycleText(c.operatingCycle).toLowerCase();
  const kind = cycleKind(c.operatingCycle);
  if (kind === 'gate') return `Completed ${cyc}; nothing proceeds while the check is open.`;
  if (kind === 'event') return 'Completed each time, before the result is relied on; exceptions answered within the month.';
  return `Completed ${cyc}; exceptions answered before the next review.`;
}
export function joinList(xs: string[]): string {
  const ys = xs.filter(Boolean);
  if (ys.length <= 1) return ys[0] ?? '';
  return `${ys.slice(0, -1).join(', ')} and ${ys[ys.length - 1]}`;
}
