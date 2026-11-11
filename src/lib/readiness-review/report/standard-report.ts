import { sha256Hex } from '../canonical';
import type { ReportInput } from '../report-input';
import {
  COVERAGE_CATEGORIES,
  INTERIM_MARKING,
  REPORT_DOCUMENT_CONTRACT,
  SEQUENCE_MEANING,
  STANDARD_PATHWAY,
  TIER_MEANING,
  coverageCategoryOf,
  type AnnexAnswerRow,
  type AnnexControlRow,
  type AnnexScenarioRow,
  type Basis,
  type CountSlot,
  type CoverageCategory,
  type CoverageRow,
  type InformationRequest,
  type Kind,
  type Layer,
  type ManagementDecision,
  type RecommendedAction,
  type ReleaseCriterion,
  type ReportDocument,
  type ReportedIssue,
  type Slot,
  type Statement
} from './document';
import { STANDARD_COPY, render, type CopyTable } from './copy';
import { standardLedger, type Claim, type Ledger } from './ledger';
import { fieldOf, kindOfControl, SOURCE_LABEL, SOURCE_NOT_RECORDED } from './shared';

/**
 * The standard report engine, Phase 2: deterministic rules and templates for the self-reported pathway, all four
 * layers. It reads only the standard claims of the ledger (the organisation's own responses, the engine's routing and
 * the method's content); evidence records, reviewer records and the reviewer-based review status are Advisory claims
 * and are removed before any rule runs, so no rule can cite them and no release criterion can depend on them.
 *
 * Fictional records only: it refuses any input not marked fictional, uses draft copy that MK has not approved, and is
 * imported by no route, page, service or commercial product.
 */
export const STANDARD_ENGINE = { name: 'mk-readiness-report-engine', version: '0.2.0-phase2' } as const;

const UNDECIDED_SCENARIO = ['waiting', 'unconfirmed', 'scope-unconfirmed', 'route-unconfirmed', 'route-incomplete'];
const EXCLUDED_SCENARIO = ['outofscope', 'precluded', 'assumed'];
const COUNT_NAME: Record<CoverageCategory, string> = { reported: 'reported', reused: 'reused', fact: 'fact', waiting: 'waiting', unconfirmed: 'unconfirmed', 'scope-unconfirmed': 'scopeUnconfirmed', prerequisite: 'prerequisite', excluded: 'excluded', assumed: 'assumed', retired: 'retired' };
const COVERAGE_LABEL: Record<CoverageCategory, string> = {
  reported: 'controls reported on as practices',
  reused: 'controls established by a wider answer',
  fact: 'controls recorded as facts',
  waiting: 'controls waiting for an answer',
  unconfirmed: 'controls not reached',
  'scope-unconfirmed': 'controls whose applicability is not yet known',
  prerequisite: 'controls depending on a question not yet answered',
  excluded: 'controls excluded by a recorded scope decision',
  assumed: 'controls assumed not to apply',
  retired: 'retired questions'
};

type Spec = {
  layer: Layer;
  section: string;
  rule: string;
  template: string;
  kind: Kind;
  basis: Basis;
  slots?: [string, string, string | null][];
  counts?: CountSlot[];
  claims?: string[];
  subjects?: Partial<Statement['subjects']>;
  qualifiers?: string[];
};

export function countOf(name: string, counts: string, items: string[], universe?: [string, string, string[]]): CountSlot {
  return { name, counts, items, value: items.length, universe: universe ? { name: universe[0], label: universe[1], items: universe[2], value: universe[2].length } : null };
}

export function buildStandardReport(input: ReportInput, fullLedger: Ledger, gate: { digest: string }, copy: CopyTable = STANDARD_COPY): ReportDocument {
  if ((input as any).organisation?.fictional !== true) throw new Error('Phase 2 builds reports from fictional records only; this input is not marked fictional.');
  // The standard pathway never sees an Advisory claim.
  const ledger = standardLedger(fullLedger);
  const statements: Statement[] = [];
  const byId = new Map<string, Statement>();
  const claim = (id: string): Claim => {
    const c = ledger.byId.get(id);
    if (!c) throw new Error(`Unknown or non-standard claim ${id}`);
    return c;
  };
  const ids = (cs: Claim[]) => cs.map((c) => c.id);

  const make = (spec: Spec) => {
    const slots: Slot[] = (spec.slots ?? []).map(([name, claimId, field]) => ({ name, claim: claimId, field, value: fieldOf(claim(claimId).value, field) ?? null }));
    const counts = spec.counts ?? [];
    const values: Record<string, string | number | null> = {};
    for (const s of slots) values[s.name] = s.value;
    for (const c of counts) {
      values[c.name] = c.value;
      if (c.universe) values[c.universe.name] = c.universe.value;
    }
    const template = copy.templates[spec.template];
    if (template === undefined) throw new Error(`No template ${spec.template}`);
    const claims = [...new Set([...slots.map((s) => s.claim), ...counts.flatMap((c) => [...c.items, ...(c.universe?.items ?? [])]), ...(spec.claims ?? [])])];
    const id = `st-${sha256Hex(`${spec.layer}|${spec.section}|${spec.rule}|${spec.template}|${claims.join(',')}`).slice(0, 16)}`;
    if (byId.has(id)) return id;
    const statement: Statement = {
      id,
      layer: spec.layer,
      section: spec.section,
      rule: spec.rule,
      template: spec.template,
      text: render(template, values),
      kind: spec.kind,
      basis: spec.basis,
      slots,
      counts,
      qualifiers: spec.qualifiers ?? [],
      claims,
      subjects: { controls: spec.subjects?.controls ?? [], scenarios: spec.subjects?.scenarios ?? [], area: spec.subjects?.area ?? null, function: spec.subjects?.function ?? null }
    };
    statements.push(statement);
    byId.set(id, statement);
    return id;
  };

  // ------------------------------------------------------------------ what the standard ledger holds
  const controls = ledger.claims.filter((c) => c.type === 'control');
  const order = new Map(controls.map((c, i) => [c.value.id as string, i]));
  const areas: { id: string; name: string }[] = (input as any).domains.map((d: any) => ({ id: d.id as string, name: d.name as string }));
  const areaIndex = new Map<string, number>(areas.map((a, i) => [a.id, i] as [string, number]));
  const control = (id: string) => claim(`control:${id}`);
  const areaOf = (id: string) => control(id).value.domain.id as string;
  const byAreaAndOrder = (a: string, b: string) => (areaIndex.get(areaOf(a))! - areaIndex.get(areaOf(b))!) || order.get(a)! - order.get(b)!;
  const reported = controls.filter((c) => c.value.state === 'reported');
  const gaps = ledger.claims.filter((c) => c.type === 'gap').sort((a, b) => byAreaAndOrder(a.subject.control!, b.subject.control!));
  const answers = ledger.claims.filter((c) => c.type === 'answer');
  const currentAnswer = new Map(answers.filter((a) => a.pointer.endsWith('/answer')).map((a) => [a.subject.control!, a]));
  const said = new Map(ledger.claims.filter((c) => c.type === 'records-said').map((c) => [c.subject.control!, c]));
  const method = new Map(ledger.claims.filter((c) => c.type === 'method.content').map((c) => [c.subject.control!, c]));
  const waitingItems = ledger.claims.filter((c) => c.type === 'waiting-item');
  const unassigned = waitingItems.filter((c) => !c.value.function);
  const scenarios = ledger.claims.filter((c) => c.type === 'scenario');
  const plans = ledger.claims.filter((c) => c.type === 'plan');
  const assumptions = ledger.claims.filter((c) => c.type === 'assumption');
  const interview = claim('interview').value;
  const category = new Map(controls.map((c) => [c.value.id as string, coverageCategoryOf(c.value.state)]));
  for (const [cid, cat] of category) if (cat === null) throw new Error(`Control ${cid} has a state (${control(cid).value.state}) that no coverage category holds.`);
  const inCategory = (cat: CoverageCategory, list = controls) => list.filter((c) => category.get(c.value.id) === cat);
  const corrected = (cid: string) => currentAnswer.get(cid)?.value.source === 'respondent-correction';
  const inPlaceOf = (cid: string) => {
    const m = method.get(cid);
    const p = m?.value.inPlace;
    if (!m || !p) return null;
    if (p.kind === 'anchored-level') return p.description ? { m, template: 'action.anchored', slots: [['inPlace', m.id, 'inPlace.description']] as [string, string, string][] } : null;
    if (p.kind === 'practice-option') return { m, template: 'action.practice', slots: [['inPlaceAnswers', m.id, 'inPlace.answers[].label'], ['question', `control:${cid}`, 'text']] as [string, string, string][] };
    if (p.kind === 'choice-options') return { m, template: 'action.choice', slots: [['inPlaceAnswers', m.id, 'inPlace.answers[].label']] as [string, string, string][] };
    return null;
  };

  // ------------------------------------------------------------------ release: the standard pathway's own criteria
  const approval = claim('method.approval').value as string;
  const criteria: ReleaseCriterion[] = [
    { id: 'interview-ended', met: interview.status === 'ended', ref: 'interview', note: `The interview is ${interview.status}.` },
    { id: 'real-record', met: false, ref: 'Phase 2 scope', note: 'Phase 2 builds reports from fictional records only.' },
    { id: 'method-approved', met: /^approved\b/i.test(approval), ref: 'B4', note: approval },
    { id: 'copy-approved', met: copy.approved, ref: 'B7', note: `Copy ${copy.version} is ${copy.approved ? 'approved' : 'a draft, not approved by MK'}.` },
    { id: 'commercial-path', met: false, ref: 'B5', note: 'No commercial path for the standard report has been approved.' },
    { id: 'terms-and-privacy', met: false, ref: 'B6', note: 'Terms and privacy wording for the standard report are not approved.' },
    { id: 'staging-isolation', met: false, ref: 'B2', note: 'Staging isolation is open.' },
    { id: 'authenticated-access', met: false, ref: 'B3', note: 'Authenticated access for the organisation is open. Reviewer identity is an Advisory matter and is not a criterion here.' }
  ];
  const releasable = criteria.every((c) => c.met);

  // ------------------------------------------------------------------ layer 1: executive decision brief
  const ex = { status: [] as string[], indicated: [] as string[], coverage: [] as string[], actions: [] as string[], withheld: [] as string[], decisions: [] as string[] };
  if (!releasable) ex.status.push(make({ layer: 'executive', section: 'status', rule: 'R-STATUS-MARKING', template: 'status.marking', kind: 'method', basis: 'record', claims: ['organisation', 'method.approval'], qualifiers: ['interim'] }));
  ex.status.push(make({ layer: 'executive', section: 'status', rule: 'R-STATUS-BASIS', template: 'status.basis', kind: 'method', basis: 'method', claims: ['method.approval', 'interview'] }));
  ex.status.push(make({ layer: 'executive', section: 'status', rule: 'R-STATUS-METHOD', template: 'status.method', kind: 'method', basis: 'method', slots: [['approval', 'method.approval', null]] }));
  ex.status.push(make({ layer: 'executive', section: 'status', rule: 'R-STATUS-ASOF', template: 'status.asof', kind: 'coverage', basis: 'record', slots: [['asOf', 'lineage', 'asOf'], ['actionCount', 'lineage', 'actionCount']] }));

  if (!gaps.length) ex.indicated.push(make({ layer: 'executive', section: 'indicated', rule: 'R-IND-NONE', template: 'indicated.none', kind: 'reported-practice', basis: 'self-reported', claims: reported.length ? ids(reported) : ['interview'] }));
  for (const area of areas) {
    const inArea = gaps.filter((g) => areaOf(g.subject.control!) === area.id);
    if (!inArea.length) continue;
    const asked = reported.filter((c) => c.value.domain.id === area.id);
    ex.indicated.push(make({
      layer: 'executive', section: 'indicated', rule: 'R-IND-AREA', template: 'indicated.area', kind: 'indicated-gap', basis: 'self-reported',
      slots: [['area', asked[0].id, 'domain.name']],
      counts: [countOf('exposed', 'practices the responses indicate are not fully in place', ids(inArea), ['asked', 'practices reported on in this area', ids(asked)])],
      subjects: { area: area.id }
    }));
  }
  // A scenario counts by what the responses established for it, and otherwise by its status, so each is counted once.
  const established = (value: string) => scenarios.filter((s) => s.value.established === value);
  const undetermined = (statuses: string[]) => scenarios.filter((s) => !s.value.established && statuses.includes(s.value.status));
  if (scenarios.length) ex.indicated.push(make({
    layer: 'executive', section: 'indicated', rule: 'R-IND-SCENARIOS', template: 'indicated.scenarios', kind: 'scenario', basis: 'self-reported',
    counts: [
      countOf('gapScenarios', 'scenarios whose confirming practice the responses indicate is not fully in place', ids(established('gap-reported')), ['scenarios', 'fraud scenarios in the method', ids(scenarios)]),
      countOf('practiceScenarios', 'scenarios whose confirming practice was reported in place', ids(established('confirmed-reported')), ['scenarios', 'fraud scenarios in the method', ids(scenarios)]),
      countOf('openScenarios', 'scenarios that cannot yet be decided from the responses', ids(undetermined(UNDECIDED_SCENARIO)), ['scenarios', 'fraud scenarios in the method', ids(scenarios)]),
      countOf('excludedScenarios', 'scenarios that do not apply or are not expected', ids(undetermined(EXCLUDED_SCENARIO)), ['scenarios', 'fraud scenarios in the method', ids(scenarios)])
    ]
  }));

  const stop = interview.status !== 'ended' ? 'open' : ['ceiling', 'respondent', 'plan'].includes(interview.stopReason) ? interview.stopReason : 'ended';
  const routing = make({ layer: 'executive', section: 'coverage', rule: 'R-COVERAGE-ROUTING', template: `coverage.routing.${stop}`, kind: 'coverage', basis: 'record', slots: [['screens', 'interview', 'respondentScreens'], ['limit', 'interview', 'respondentScreenLimit']] });
  ex.coverage.push(routing);
  const coverageRows: CoverageRow[] = [];
  for (const { category: cat, states } of COVERAGE_CATEGORIES) {
    const items = inCategory(cat);
    if (!items.length) continue;
    const name = COUNT_NAME[cat];
    const counts = [countOf(name, COVERAGE_LABEL[cat], ids(items), ['total', 'controls in the method', ids(controls)])];
    let template = `coverage.${cat}`;
    if (cat === 'waiting') {
      const scope = items.filter((c) => c.value.state === 'waiting-scope');
      if (scope.length) counts.push(countOf('waitingScope', 'waiting controls whose open question is applicability', ids(scope), ['waiting', COVERAGE_LABEL.waiting, ids(items)]));
      if (unassigned.length) counts.push(countOf('unassigned', 'waiting controls with no accountable function', ids(unassigned), ['waiting', COVERAGE_LABEL.waiting, ids(items)]));
      template = scope.length && unassigned.length ? 'coverage.waiting.both' : scope.length ? 'coverage.waiting.scope' : unassigned.length ? 'coverage.waiting.unassigned' : 'coverage.waiting';
    }
    const statement = make({ layer: 'executive', section: 'coverage', rule: `R-COVERAGE-${cat.toUpperCase()}`, template, kind: cat === 'reported' || cat === 'reused' ? 'reported-practice' : cat === 'fact' ? 'recorded-fact' : cat === 'waiting' ? 'unresolved' : cat === 'excluded' || cat === 'assumed' || cat === 'retired' ? 'outside-scope' : 'coverage', basis: 'record', counts });
    ex.coverage.push(statement);
    coverageRows.push({ category: cat, states: [...states], controls: items.map((c) => c.value.id), statement });
  }

  const withAction = gaps.filter((g) => inPlaceOf(g.subject.control!));
  const withheldActions = gaps.filter((g) => !inPlaceOf(g.subject.control!));
  if (gaps.length) ex.actions.push(make({
    layer: 'executive', section: 'actions', rule: 'R-ACTIONS-SUMMARY', template: withheldActions.length ? 'actions.summary.withheld' : 'actions.summary', kind: 'method-practice', basis: 'method',
    counts: [countOf('issues', 'gaps indicated by the responses', ids(gaps), ['asked', 'practices reported on', ids(reported)]), ...(withheldActions.length ? [countOf('withAction', 'gaps with a recommended action restating the draft method', ids(withAction), ['issues', 'gaps indicated by the responses', ids(gaps)]), countOf('withheldActions', 'gaps for which a specific action is withheld', ids(withheldActions), ['issues', 'gaps indicated by the responses', ids(gaps)])] : [])],
    claims: [...withAction.map((g) => inPlaceOf(g.subject.control!)!.m.id), 'method.approval']
  }));

  const withheld = (rule: string, template: string, claims: string[]) => ex.withheld.push(make({ layer: 'executive', section: 'withheld', rule, template, kind: 'withheld', basis: 'method', claims }));
  withheld('R-WITHHELD-OVERALL', 'withheld.overall', ['method.approval']);
  withheld('R-WITHHELD-PRIORITY', 'withheld.priority', ['method.approval']);
  withheld('R-WITHHELD-REMEDIATION', 'withheld.remediation', ['method.approval']);
  withheld('R-WITHHELD-VERIFICATION', 'withheld.verification', ['organisation', 'method.approval']);
  withheld('R-WITHHELD-SCORING', 'withheld.scoring', ['method.scoring']);
  withheld('R-WITHHELD-UNASKED', 'withheld.unasked', ['interview']);

  const decisionItems: ManagementDecision[] = [];
  const decide = (decision: ManagementDecision['decision'], spec: Spec) => {
    const statement = make(spec);
    decisionItems.push({ id: `decision-${decisionItems.length + 1}`, decision, owner: 'management', statement, claims: byId.get(statement)!.claims });
    ex.decisions.push(statement);
  };
  if (gaps.length) decide('consider-actions', { layer: 'executive', section: 'decisions', rule: 'R-DECISION-ACTIONS', template: 'decision.actions', kind: 'decision', basis: 'self-reported', counts: [countOf('issues', 'gaps indicated by the responses', ids(gaps), ['asked', 'practices reported on', ids(reported)])] });
  if (unassigned.length) decide('assign-owners', { layer: 'executive', section: 'decisions', rule: 'R-DECISION-ASSIGN', template: 'decision.assign', kind: 'decision', basis: 'record', counts: [countOf('unassigned', 'waiting controls with no accountable function', ids(unassigned), ['waiting', COVERAGE_LABEL.waiting, ids(waitingItems)])] });
  if (assumptions.length) decide('confirm-assumptions', { layer: 'executive', section: 'decisions', rule: 'R-DECISION-ASSUMPTIONS', template: 'decision.assumptions', kind: 'decision', basis: 'record', claims: ids(assumptions) });

  // ------------------------------------------------------------------ layer 2: management analysis by area
  const issueSlots = (cid: string): [string, string, string | null][] => {
    const a = currentAnswer.get(cid)!;
    return [['key', `control:${cid}`, 'key'], ['stateLabel', `control:${cid}`, 'stateLabel'], ['by', a.id, 'by'], ['answer', a.id, 'label']];
  };
  const analysisAreas = areas.map((area) => {
    const list: string[] = [];
    for (const g of gaps.filter((x) => areaOf(x.subject.control!) === area.id)) {
      const cid = g.subject.control!;
      list.push(make({ layer: 'analysis', section: `area:${area.id}`, rule: 'R-ANALYSIS-ISSUE', template: corrected(cid) ? 'analysis.issue.corrected' : 'analysis.issue', kind: 'indicated-gap', basis: 'self-reported', slots: issueSlots(cid), claims: [g.id], subjects: { controls: [cid], area: area.id, scenarios: g.value.scenario ? [g.value.scenario] : [] } }));
      const m = method.get(cid);
      if (m && m.value.risks.length) list.push(make({ layer: 'analysis', section: `area:${area.id}`, rule: 'R-ANALYSIS-RISKS', template: 'analysis.issue.risks', kind: 'method-practice', basis: 'method', slots: [['key', `control:${cid}`, 'key'], ['risks', m.id, 'risks[].name']], claims: [g.id], subjects: { controls: [cid], area: area.id } }));
    }
    const inArea = controls.filter((c) => c.value.domain.id === area.id);
    const asked = reported.filter((c) => c.value.domain.id === area.id);
    if (asked.length) {
      list.push(make({ layer: 'analysis', section: `area:${area.id}`, rule: 'R-ANALYSIS-PRACTICE', template: 'analysis.area.practice', kind: 'reported-practice', basis: 'self-reported', counts: [countOf('practiced', 'practices reported in place in this area', ids(asked.filter((c) => c.value.class === 'full')), ['areaAsked', 'practices reported on in this area', ids(asked)])], subjects: { area: area.id } }));
      const saidInArea = asked.filter((c) => said.has(c.value.id)).map((c) => said.get(c.value.id)!);
      if (saidInArea.length) list.push(make({ layer: 'analysis', section: `area:${area.id}`, rule: 'R-ANALYSIS-RECORDS', template: 'analysis.area.records', kind: 'records-said', basis: 'self-reported', counts: [countOf('said', 'practices reported on for which the respondent said a record could be shown', ids(saidInArea), ['areaAsked', 'practices reported on in this area', ids(asked)])], subjects: { area: area.id } }));
    }
    for (const { category: cat } of COVERAGE_CATEGORIES) {
      const items = inCategory(cat, inArea);
      if (!items.length) continue;
      list.push(make({ layer: 'analysis', section: `area:${area.id}`, rule: `R-AREA-COVERAGE-${cat.toUpperCase()}`, template: `area.coverage.${cat}`, kind: 'coverage', basis: 'record', counts: [countOf('count', `${COVERAGE_LABEL[cat]} in this area`, ids(items), ['areaTotal', 'controls in this area', ids(inArea)])], subjects: { area: area.id } }));
    }
    return { area: area.id, name: area.name, statements: list };
  });

  // ------------------------------------------------------------------ layer 2: scenario analysis, in the method's order within each area
  const scenarioAreas = areas.map((area) => {
    const list: string[] = [];
    for (const s of scenarios.filter((x) => x.value.domain === area.id)) {
      const status = s.value.status as string;
      const base = { layer: 'analysis' as Layer, section: `scenario:${area.id}`, rule: `R-SCENARIO-${status.toUpperCase()}`, subjects: { scenarios: [s.value.id], area: area.id } };
      const gapControls = (s.value.confirmations as { id: string }[]).map((c) => c.id).filter((id) => ledger.byId.has(`gap:${id}`));
      if (status === 'gap-reported' || (status === 'route-incomplete' && s.value.established === 'gap-reported' && gapControls.length)) {
        const template = status === 'gap-reported' ? 'scenario.gap-reported' : 'scenario.route-incomplete.gap';
        const extra: [string, string, string | null][] = status === 'gap-reported' ? [] : [['statusLabel', s.id, 'statusLabel']];
        if (!gapControls.length) throw new Error(`Scenario ${s.value.id} is recorded as a reported gap, but none of its confirming controls is a reported gap.`);
        for (const cid of gapControls) list.push(make({ ...base, template, kind: 'indicated-gap', basis: 'self-reported', slots: [['name', s.id, 'name'], ['key', `control:${cid}`, 'key'], ['stateLabel', `control:${cid}`, 'stateLabel'], ...extra], claims: [`gap:${cid}`], subjects: { ...base.subjects, controls: [cid] } }));
        continue;
      }
      if (copy.templates[`scenario.${status}`] === undefined) throw new Error(`No wording for the scenario status ${status}`);
      const reportedInPlace = status === 'confirmed-reported' || (status === 'route-incomplete' && s.value.established === 'confirmed-reported');
      const kind: Kind = reportedInPlace ? 'reported-practice' : UNDECIDED_SCENARIO.includes(status) ? 'unresolved' : 'outside-scope';
      list.push(make({ ...base, template: `scenario.${status}`, kind, basis: reportedInPlace ? 'self-reported' : 'record', slots: [['name', s.id, 'name'], ['statusLabel', s.id, 'statusLabel']] }));
    }
    return { area: area.id, name: area.name, statements: list };
  }).filter((a) => a.statements.length);

  // ------------------------------------------------------------------ layer 3: registers
  const tierOf = (cid: string) => {
    const tiers = plans.filter((p) => (p.value.questions as string[]).includes(cid)).map((p) => p.value.tier as number);
    return tiers.length ? Math.min(...tiers) : (control(cid).value.scenario?.tier ?? 9);
  };
  const requests = waitingItems
    .map((w) => ({ w, cid: w.subject.control!, fn: (w.value.function as string | null) ?? null }))
    .sort((a, b) => (a.fn === null ? 1 : 0) - (b.fn === null ? 1 : 0) || (a.fn ?? '').localeCompare(b.fn ?? '', 'en') || tierOf(a.cid) - tierOf(b.cid) || order.get(a.cid)! - order.get(b.cid)!)
    .map(({ w, cid, fn }, i): InformationRequest => {
      const statement = make({
        layer: 'register', section: 'information-gathering', rule: 'R-REGISTER-INFO', template: fn ? 'register.info.item' : 'register.info.item.unassigned', kind: 'unresolved', basis: 'record',
        slots: [...(fn ? [['function', w.id, 'function'] as [string, string, string]] : []), ['key', w.id, 'key'], ['provenance', w.id, 'provenance.label']],
        claims: [control(cid).id], subjects: { controls: [cid], area: areaOf(cid), function: fn }
      });
      return { id: `info-${i + 1}`, sequence: i + 1, sequenceMeaning: SEQUENCE_MEANING, function: fn, control: cid, scenarios: plans.filter((p) => (p.value.questions as string[]).includes(cid)).map((p) => p.subject.scenario!), provenance: w.value.provenance.kind, statement, claims: byId.get(statement)!.claims };
    });
  const sequenceStatement = make({ layer: 'register', section: 'information-gathering', rule: 'R-REGISTER-SEQUENCE', template: 'register.info.sequence', kind: 'method', basis: 'method', claims: waitingItems.length ? ids(waitingItems) : ['method.approval'] });

  const issues: ReportedIssue[] = gaps.map((g, i) => {
    const cid = g.subject.control!;
    const statement = make({ layer: 'register', section: 'reported-issues', rule: 'R-REGISTER-ISSUE', template: corrected(cid) ? 'register.issue.corrected' : 'register.issue', kind: 'indicated-gap', basis: 'self-reported', slots: issueSlots(cid), claims: [g.id], subjects: { controls: [cid], area: areaOf(cid), scenarios: g.value.scenario ? [g.value.scenario] : [] } });
    return { id: `issue-${i + 1}`, control: cid, area: areaOf(cid), scenarios: g.value.scenario ? [g.value.scenario] : [], answerVersion: currentAnswer.get(cid)!.value.version, corrected: corrected(cid), ranked: false, status: 'for management consideration', statement, claims: byId.get(statement)!.claims };
  });
  const issuesStatement = make({ layer: 'register', section: 'reported-issues', rule: 'R-REGISTER-ISSUES', template: 'register.issues.intro', kind: 'method', basis: 'method', claims: gaps.length ? ids(gaps) : ['interview'] });

  const actions: RecommendedAction[] = issues.map((item, i) => {
    const cid = item.control;
    const p = inPlaceOf(cid);
    const statement = p
      ? make({ layer: 'register', section: 'recommended-actions', rule: 'R-REGISTER-ACTION', template: p.template, kind: 'method-practice', basis: 'method', slots: [['key', `control:${cid}`, 'key'], ...p.slots], claims: [`gap:${cid}`, 'method.approval'], subjects: { controls: [cid], area: item.area } })
      : make({ layer: 'register', section: 'recommended-actions', rule: 'R-REGISTER-ACTION-WITHHELD', template: 'action.withheld', kind: 'withheld', basis: 'method', slots: [['key', `control:${cid}`, 'key']], claims: [`gap:${cid}`, ...(method.has(cid) ? [method.get(cid)!.id] : [])], subjects: { controls: [cid], area: item.area } });
    return { id: `action-${i + 1}`, issue: item.id, control: cid, area: item.area, source: p ? 'draft-method-in-place' : 'withheld', ranked: false, status: 'for management consideration', statement, claims: byId.get(statement)!.claims };
  });
  const actionsStatement = make({ layer: 'register', section: 'recommended-actions', rule: 'R-REGISTER-ACTIONS', template: 'register.actions.intro', kind: 'method', basis: 'method', claims: ['method.approval', ...ids(gaps)] });

  // ------------------------------------------------------------------ layer 4: technical annex (standard records only)
  const annexControls: AnnexControlRow[] = controls.map((c) => {
    const cid = c.value.id as string;
    const current = currentAnswer.get(cid);
    return {
      id: cid, area: c.value.domain.id, key: c.value.key, state: c.value.state, stateLabel: c.value.stateLabel, coverage: category.get(cid)!, kind: kindOfControl(c.value),
      currentVersion: current?.value.version ?? null, source: current?.value.source ?? null, sourceLabel: current ? SOURCE_LABEL[current.value.source] ?? SOURCE_NOT_RECORDED : null,
      recordsSaid: said.get(cid)?.outcome ?? null,
      claims: [c.id, ...(current ? [current.id] : []), ...(said.has(cid) ? [said.get(cid)!.id] : []), ...(method.has(cid) ? [method.get(cid)!.id] : [])]
    };
  });
  const answerHistory: AnnexAnswerRow[] = answers.map((a) => ({
    control: a.subject.control!, version: a.value.version, value: a.value.value, label: a.value.label, via: a.value.via, source: a.value.source ?? null,
    sourceLabel: a.value.source ? SOURCE_LABEL[a.value.source] ?? SOURCE_NOT_RECORDED : SOURCE_NOT_RECORDED, by: a.value.by ?? null, at: a.value.at, current: a.pointer.endsWith('/answer'), claim: a.id
  }));
  const annexScenarios: AnnexScenarioRow[] = scenarios.map((s) => ({
    id: s.value.id, area: s.value.domain, name: s.value.name, tier: s.value.tier, tierMeaning: TIER_MEANING, status: s.value.status, statusLabel: s.value.statusLabel,
    confirming: (s.value.confirmations as { id: string }[]).map((c) => c.id), deciding: [...new Set((s.value.undecided as { questions: string[] }[]).flatMap((u) => u.questions))], claim: s.id
  }));
  const lineageStatement = make({ layer: 'annex', section: 'lineage', rule: 'R-ANNEX-LINEAGE', template: 'annex.lineage', kind: 'method', basis: 'record', slots: [['inputVersion', 'contract', 'version'], ['actionCount', 'lineage', 'actionCount'], ['sessionId', 'lineage', 'sessionId'], ['logDigest', 'lineage', 'logDigest']] });
  const methodStatement = make({ layer: 'annex', section: 'method', rule: 'R-ANNEX-METHOD', template: 'annex.method', kind: 'method', basis: 'method', slots: [['approval', 'method.approval', null]] });

  return {
    contract: { ...REPORT_DOCUMENT_CONTRACT },
    pathway: STANDARD_PATHWAY,
    draft: { copyVersion: copy.version, copyApproved: copy.approved, fictionalOnly: true, note: 'Built from a fictional record with draft copy for MK review. Not a customer report and not for release.' },
    lineage: {
      inputContract: claim('contract').value.name, inputVersion: claim('contract').value.version, inputDigest: gate.digest,
      logDigest: claim('lineage').value.logDigest, actionCount: claim('lineage').value.actionCount, sessionId: claim('lineage').value.sessionId, asOf: claim('lineage').value.asOf,
      ledgerDigest: ledger.digest, ledgerVersion: ledger.version, engine: { ...STANDARD_ENGINE }
    },
    status: {
      basis: { selfReported: true, evidenceReviewedByMK: false, responsesVerifiedByMK: false },
      methodApproval: approval,
      scoring: { status: 'withheld', reason: 'Withheld while the review method is not approved by MK (B4). A constraint of this stage, not an MK commercial or methodological policy.' },
      interview: { status: interview.status, stopReason: interview.stopReason ?? null },
      release: { classification: releasable ? 'releasable' : 'internal-interim', marking: releasable ? '' : INTERIM_MARKING, criteria }
    },
    statements,
    layers: {
      executive: ex,
      analysis: { areas: analysisAreas, scenarios: scenarioAreas, coverage: { routing, rows: coverageRows } },
      register: {
        informationGathering: { sequenceStatement, items: requests },
        reportedIssues: { statement: issuesStatement, ranked: false, items: issues },
        recommendedActions: { statement: actionsStatement, ranked: false, items: actions },
        decisions: { items: decisionItems }
      },
      annex: { controls: annexControls, answerHistory, scenarios: annexScenarios, lineageStatement, methodStatement }
    }
  };
}
