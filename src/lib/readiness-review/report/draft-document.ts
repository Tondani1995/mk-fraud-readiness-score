import { sha256Hex } from '../canonical';
import type { ReportInput } from '../report-input';
import {
  INTERIM_MARKING,
  REPORT_DOCUMENT_CONTRACT,
  SEQUENCE_MEANING,
  type AnnexAnswerRow,
  type AnnexControlRow,
  type AnnexEvidenceRow,
  type Attribution,
  type CountSlot,
  type EvidenceLevel,
  type InformationRequest,
  type Kind,
  type Layer,
  type ManagementDecision,
  type RemediationItem,
  type ReportDocument,
  type ReviewerFollowUp,
  type Slot,
  type Statement
} from './document';
import { DRAFT_COPY, render, type CopyTable } from './draft-copy';
import type { Claim, Ledger } from './ledger';
import { evidenceTemplate, fieldOf, kindOfControl, SOURCE_LABEL, SOURCE_NOT_RECORDED } from './shared';

/**
 * DRAFT document builder, Phase 1. Builds a report document from a FICTIONAL report input only, with draft copy, so
 * that MK can review the structure and wording and so that the validation checks can be exercised. It is not connected
 * to any route, store, delivery or commercial product, and it refuses any input not marked fictional.
 */
export const DRAFT_ENGINE = { name: 'mk-readiness-report-engine', version: '0.1.0-phase1-draft' } as const;

const NOT_COVERED = ['unconfirmed', 'scope-unconfirmed', 'prerequisite'];
const EXCLUDED = ['outofscope', 'proportion', 'precluded', 'assumed', 'retired'];
const EXECUTIVE_ITEM_LIMIT = 5;

type Spec = {
  layer: Layer;
  section: string;
  rule: string;
  template: string;
  kind: Kind;
  slots?: [string, string, string | null][];
  counts?: CountSlot[];
  claims?: string[];
  subjects?: Partial<Statement['subjects']>;
  evidenceLevel?: EvidenceLevel;
  attribution?: Attribution;
  qualifiers?: string[];
};

export function countOf(name: string, counts: string, items: string[], universe?: [string, string, string[]]): CountSlot {
  return { name, counts, items, value: items.length, universe: universe ? { name: universe[0], label: universe[1], items: universe[2], value: universe[2].length } : null };
}

export function buildDraftDocument(input: ReportInput, ledger: Ledger, gate: { digest: string }, copy: CopyTable = DRAFT_COPY): ReportDocument {
  if ((input as any).organisation?.fictional !== true) throw new Error('Phase 1 builds fictional examples only; this input is not marked fictional.');
  const statements: Statement[] = [];
  const byId = new Map<string, Statement>();
  const claim = (id: string): Claim => {
    const c = ledger.byId.get(id);
    if (!c) throw new Error(`Unknown claim ${id}`);
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
      ...(spec.evidenceLevel ? { evidenceLevel: spec.evidenceLevel } : {}),
      ...(spec.attribution ? { attribution: spec.attribution } : {}),
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

  // ------------------------------------------------------------------ what the ledger holds
  const controls = ledger.claims.filter((c) => c.type === 'control');
  const order = new Map(controls.map((c, i) => [c.value.id as string, i]));
  const areas = (input as any).domains.map((d: any) => ({ id: d.id as string, name: d.name as string }));
  const areaIndex = new Map<string, number>(areas.map((a: { id: string }, i: number) => [a.id, i] as [string, number]));
  const control = (id: string) => claim(`control:${id}`);
  const areaOf = (id: string) => control(id).value.domain.id as string;
  const reported = controls.filter((c) => c.value.state === 'reported');
  const gaps = ledger.claims.filter((c) => c.type === 'gap').sort((a, b) => (areaIndex.get(areaOf(a.subject.control!))! - areaIndex.get(areaOf(b.subject.control!))!) || order.get(a.subject.control!)! - order.get(b.subject.control!)!);
  const evidence = new Map(ledger.claims.filter((c) => c.type === 'evidence').map((c) => [c.subject.control!, c]));
  const said = new Map(ledger.claims.filter((c) => c.type === 'evidence-said').map((c) => [c.subject.control!, c]));
  const reviews = ledger.claims.filter((c) => c.type === 'review');
  const earlier = ledger.claims.filter((c) => c.type === 'earlier-evidence' || c.type === 'earlier-review');
  const reportedIds = new Set(reported.map((c) => c.value.id as string));
  const currentReviewed = [...evidence.values()].filter((c) => c.value.current && c.evidenceLevel === 'reviewed' && reportedIds.has(c.subject.control!));
  const reviewedControls = new Set(currentReviewed.map((c) => c.subject.control!));
  const withoutEvidence = reported.filter((c) => !reviewedControls.has(c.value.id));
  const waitingItems = ledger.claims.filter((c) => c.type === 'waiting-item');
  const unassigned = waitingItems.filter((c) => !c.value.function);
  const notAsked = controls.filter((c) => NOT_COVERED.includes(c.value.state));
  const excluded = controls.filter((c) => EXCLUDED.includes(c.value.state));
  const undecided = ledger.claims.filter((c) => c.type === 'unresolved-scenario');
  const scenarios = ledger.claims.filter((c) => c.type === 'scenario');
  const plans = ledger.claims.filter((c) => c.type === 'plan');
  const assumptions = ledger.claims.filter((c) => c.type === 'assumption');
  const actions = ledger.claims.filter((c) => c.type === 'action');
  const complete = claim('method.completeness').value.complete === true;
  const reviewerClaims = [...evidence.values(), ...reviews, ...earlier];
  const identityVerified = reviewerClaims.every((c) => c.attribution?.identityVerified === true);
  const unverified = (c?: Claim) => (c?.attribution && !c.attribution.identityVerified ? ['reviewer-identity-unverified'] : []);

  // ------------------------------------------------------------------ layer 1: executive decision brief
  const status: string[] = [];
  if (!complete) status.push(make({ layer: 'executive', section: 'status', rule: 'R-STATUS-INTERIM', template: 'status.interim', kind: 'method', slots: [['why', 'method.completeness', 'why']], qualifiers: ['interim'] }));
  status.push(make({ layer: 'executive', section: 'status', rule: 'R-STATUS-METHOD', template: 'status.method', kind: 'method', slots: [['approval', 'method.approval', null]] }));
  status.push(make({ layer: 'executive', section: 'status', rule: 'R-STATUS-SCORING', template: 'status.scoring', kind: 'method', claims: ['method.scoring'] }));
  if (reviewerClaims.length && !identityVerified) status.push(make({ layer: 'executive', section: 'status', rule: 'R-STATUS-IDENTITY', template: 'status.identity', kind: 'method', claims: ids(reviewerClaims), qualifiers: ['reviewer-identity-unverified'] }));
  status.push(make({ layer: 'executive', section: 'status', rule: 'R-STATUS-ASOF', template: 'status.asof', kind: 'coverage', slots: [['asOf', 'lineage', 'asOf'], ['actionCount', 'lineage', 'actionCount']] }));

  const position: ReportDocument['layers']['executive']['position'] = { reportedExposure: [], reviewedEvidence: [], reviewerConclusions: [], unresolved: [], outsideScope: [] };
  if (!gaps.length) position.reportedExposure.push(make({ layer: 'executive', section: 'position', rule: 'R-POS-EXPOSURE-NONE', template: 'position.exposure.none', kind: 'reported-exposure', claims: ids(reported.length ? reported : controls.slice(0, 1)) }));
  for (const area of areas) {
    const inArea = gaps.filter((g) => areaOf(g.subject.control!) === area.id);
    if (!inArea.length) continue;
    const asked = reported.filter((c) => c.value.domain.id === area.id);
    position.reportedExposure.push(make({
      layer: 'executive', section: 'position', rule: 'R-POS-EXPOSURE-AREA', template: 'position.exposure.area', kind: 'reported-exposure',
      slots: [['area', asked[0].id, 'domain.name']],
      counts: [countOf('exposed', 'practices reported as not fully in place', ids(inArea), ['asked', 'practices reported on in this area', ids(asked)])],
      subjects: { area: area.id }
    }));
  }
  position.reviewedEvidence.push(make({ layer: 'executive', section: 'position', rule: 'R-POS-EVIDENCE', template: 'position.evidence.summary', kind: 'evidence', evidenceLevel: currentReviewed.length ? 'reviewed' : 'none-recorded', counts: [countOf('reviewed', 'practices with evidence reviewed by MK', ids(currentReviewed), ['asked', 'practices reported on', ids(reported)])] }));
  const currentEvidence = [...evidence.values()].filter((c) => c.value.current).sort((a, b) => order.get(a.subject.control!)! - order.get(b.subject.control!)!);
  const evidenceItems = new Map<string, string>();
  for (const e of currentEvidence) {
    const cid = e.subject.control!;
    evidenceItems.set(cid, make({
      layer: currentEvidence.length <= EXECUTIVE_ITEM_LIMIT ? 'executive' : 'analysis', section: 'evidence', rule: 'R-EVIDENCE-ITEM', template: evidenceTemplate('evidence', e.evidenceLevel!, e.outcome ?? null), kind: 'evidence',
      evidenceLevel: e.evidenceLevel, attribution: e.attribution, qualifiers: unverified(e),
      slots: [['key', control(cid).id, 'key']], claims: [e.id], subjects: { controls: [cid], area: areaOf(cid) }
    }));
  }
  const currentConclusions = reviews.filter((r) => r.value.current && r.value.conclusion).sort((a, b) => order.get(a.subject.control!)! - order.get(b.subject.control!)!);
  const conclusionItems = new Map<string, string>();
  for (const r of currentConclusions) {
    const cid = r.subject.control!;
    conclusionItems.set(cid, make({
      layer: currentConclusions.length <= EXECUTIVE_ITEM_LIMIT ? 'executive' : 'analysis', section: 'conclusions', rule: 'R-CONCLUSION-ITEM', template: `conclusion.${r.value.conclusion}`, kind: 'conclusion',
      attribution: r.attribution, qualifiers: unverified(r),
      slots: [['by', r.id, 'by'], ['at', r.id, 'at'], ['key', control(cid).id, 'key'], ['forVersion', r.id, 'forVersion'], ['answer', `answer:${cid}:v${r.value.forVersion}`, 'label'], ['basis', r.id, 'basis']],
      subjects: { controls: [cid], area: areaOf(cid) }
    }));
  }
  const executiveEvidence = [...evidenceItems.values()].filter((id) => byId.get(id)!.layer === 'executive');
  const executiveConclusions = [...conclusionItems.values()].filter((id) => byId.get(id)!.layer === 'executive');
  position.reviewedEvidence.push(...executiveEvidence);
  if (!currentConclusions.length) position.reviewerConclusions.push(make({ layer: 'executive', section: 'conclusions', rule: 'R-CONCLUSION-NONE', template: 'conclusion.none', kind: 'conclusion', claims: ['method.completeness'] }));
  position.reviewerConclusions.push(...executiveConclusions);
  const unresolvedId = make({
    layer: 'executive', section: 'position', rule: 'R-POS-UNRESOLVED', template: 'position.unresolved', kind: 'unresolved',
    counts: [countOf('open', 'controls waiting for an answer', ids(waitingItems), ['total', 'controls in the question bank', ids(controls)]), countOf('unassigned', 'waiting controls with no accountable function', ids(unassigned), ['open', 'controls waiting for an answer', ids(waitingItems)])]
  });
  const undecidedId = make({ layer: 'executive', section: 'position', rule: 'R-POS-UNDECIDED', template: 'position.undecided', kind: 'unresolved', counts: [countOf('undecided', 'material scenarios that cannot yet be decided', ids(undecided), ['scenarios', 'scenarios in the method', ids(scenarios)])] });
  const outsideId = make({
    layer: 'executive', section: 'position', rule: 'R-POS-OUTSIDE', template: 'position.outside', kind: 'outside-scope',
    counts: [countOf('notAsked', 'controls not asked', ids(notAsked), ['total', 'controls in the question bank', ids(controls)]), countOf('excluded', 'controls excluded by a recorded fact or by size', ids(excluded), ['total', 'controls in the question bank', ids(controls)])]
  });
  position.unresolved.push(unresolvedId, undecidedId);
  position.outsideScope.push(outsideId);

  const canConclude = [
    make({ layer: 'executive', section: 'can-conclude', rule: 'R-CONCLUDE-REPORTED', template: 'conclude.reported', kind: 'reported-exposure', counts: [countOf('exposed', 'practices reported as not fully in place', ids(gaps), ['asked', 'practices reported on', ids(reported)])] }),
    ...executiveEvidence.filter((id) => byId.get(id)!.evidenceLevel === 'reviewed'),
    ...executiveConclusions
  ];
  const unestablished = [
    unresolvedId,
    undecidedId,
    make({ layer: 'executive', section: 'unestablished', rule: 'R-UNESTABLISHED-EVIDENCE', template: 'unestablished.evidence', kind: 'evidence', evidenceLevel: 'none-recorded', counts: [countOf('withoutEvidence', 'practices reported on without evidence reviewed by MK', ids(withoutEvidence), ['asked', 'practices reported on', ids(reported)])] }),
    make({ layer: 'executive', section: 'unestablished', rule: 'R-UNESTABLISHED-VALIDATION', template: 'unestablished.validation', kind: 'evidence', claims: ['method.evidence-states'] }),
    outsideId
  ];

  const decisionItems: ManagementDecision[] = [];
  const decide = (decision: ManagementDecision['decision'], spec: Spec) => {
    const statement = make(spec);
    decisionItems.push({ id: `decision-${decisionItems.length + 1}`, decision, owner: 'management', statement, claims: byId.get(statement)!.claims });
  };
  if (unassigned.length) decide('assign-owners', { layer: 'executive', section: 'decisions', rule: 'R-DECISION-ASSIGN', template: 'decision.assign', kind: 'decision', counts: [countOf('unassigned', 'waiting controls with no accountable function', ids(unassigned), ['open', 'controls waiting for an answer', ids(waitingItems)])] });
  if (withoutEvidence.length) decide('evidence-for-reported-practice', { layer: 'executive', section: 'decisions', rule: 'R-DECISION-EVIDENCE', template: 'decision.evidence', kind: 'decision', counts: [countOf('withoutEvidence', 'practices reported on without evidence reviewed by MK', ids(withoutEvidence), ['asked', 'practices reported on', ids(reported)])] });
  if (assumptions.length) decide('confirm-assumptions', { layer: 'executive', section: 'decisions', rule: 'R-DECISION-ASSUMPTIONS', template: 'decision.assumptions', kind: 'decision', claims: ids(assumptions) });
  if (!complete) decide('review-completion', { layer: 'executive', section: 'decisions', rule: 'R-DECISION-COMPLETION', template: 'decision.completion', kind: 'decision', claims: ['method.completeness'] });

  // ------------------------------------------------------------------ layer 2: management analysis by area
  const analysisAreas = areas.map((area: { id: string; name: string }) => {
    const list: string[] = [];
    for (const g of gaps.filter((x) => areaOf(x.subject.control!) === area.id)) {
      const cid = g.subject.control!;
      const ev = evidence.get(cid);
      const current = ev && ev.value.current ? ev : undefined;
      const level: EvidenceLevel = current ? current.evidenceLevel! : said.has(cid) ? 'said-to-exist' : 'none-recorded';
      const answerClaim = ledger.claims.find((c) => c.type === 'answer' && c.pointer === `${control(cid).pointer}/answer`)!;
      list.push(make({
        layer: 'analysis', section: `area:${area.id}`, rule: 'R-ANALYSIS-EXPOSURE', template: evidenceTemplate('analysis.exposure', level, current?.outcome ?? null), kind: 'reported-exposure',
        evidenceLevel: level, ...(current ? { attribution: current.attribution } : {}), qualifiers: unverified(current),
        slots: [['key', control(cid).id, 'key'], ['stateLabel', control(cid).id, 'stateLabel'], ['by', answerClaim.id, 'by']],
        claims: [g.id, ...(current ? [current.id] : []), ...(level === 'said-to-exist' ? [said.get(cid)!.id] : [])],
        subjects: { controls: [cid], area: area.id, scenarios: g.value.scenario ? [g.value.scenario] : [] }
      }));
    }
    for (const [cid, id] of [...evidenceItems, ...conclusionItems]) if (areaOf(cid) === area.id && !list.includes(id)) list.push(id);
    const inArea = controls.filter((c) => c.value.domain.id === area.id);
    const open = waitingItems.filter((w) => areaOf(w.subject.control!) === area.id);
    if (open.length) list.push(make({ layer: 'analysis', section: `area:${area.id}`, rule: 'R-ANALYSIS-UNRESOLVED', template: 'analysis.area.unresolved', kind: 'unresolved', counts: [countOf('open', 'controls in this area waiting for an answer', ids(open), ['areaTotal', 'controls in this area', ids(inArea)])], subjects: { area: area.id } }));
    const na = inArea.filter((c) => NOT_COVERED.includes(c.value.state));
    const ex = inArea.filter((c) => EXCLUDED.includes(c.value.state));
    if (na.length || ex.length) list.push(make({ layer: 'analysis', section: `area:${area.id}`, rule: 'R-ANALYSIS-OUTSIDE', template: 'analysis.area.outside', kind: 'outside-scope', counts: [countOf('notAsked', 'controls in this area not asked', ids(na), ['areaTotal', 'controls in this area', ids(inArea)]), countOf('excluded', 'controls in this area excluded', ids(ex), ['areaTotal', 'controls in this area', ids(inArea)])], subjects: { area: area.id } }));
    return { area: area.id, name: area.name, statements: list };
  });

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
        layer: 'register', section: 'information-gathering', rule: 'R-REGISTER-INFO', template: fn ? 'register.info.item' : 'register.info.item.unassigned', kind: 'unresolved',
        slots: [...(fn ? [['function', w.id, 'function'] as [string, string, string]] : []), ['key', w.id, 'key'], ['provenance', w.id, 'provenance.label']],
        claims: [control(cid).id], subjects: { controls: [cid], area: areaOf(cid), function: fn }
      });
      return { id: `info-${i + 1}`, sequence: i + 1, sequenceMeaning: SEQUENCE_MEANING, function: fn, control: cid, scenarios: plans.filter((p) => (p.value.questions as string[]).includes(cid)).map((p) => p.subject.scenario!), provenance: w.value.provenance.kind, statement, claims: byId.get(statement)!.claims };
    });
  const sequenceStatement = make({ layer: 'register', section: 'information-gathering', rule: 'R-REGISTER-SEQUENCE', template: 'register.info.sequence', kind: 'method', claims: waitingItems.length ? ids(waitingItems) : ['method.approval'] });

  const remediation: (RemediationItem & { sortKey: [number, number] })[] = [];
  for (const g of gaps) {
    const cid = g.subject.control!;
    for (const a of actions.filter((x) => x.value.type === 'address' && x.subject.control === cid)) {
      const statement = make({ layer: 'register', section: 'remediation', rule: 'R-REGISTER-REMEDIATION-METHOD', template: 'register.remediation.method', kind: 'reported-exposure', slots: [['action', a.id, 'text']], claims: [g.id], subjects: { controls: [cid], area: areaOf(cid) } });
      remediation.push({ id: '', source: 'method-action', control: cid, area: areaOf(cid), scenario: g.value.scenario ?? null, function: null, kind: 'reported-exposure', ranked: false, status: 'for management consideration', statement, claims: byId.get(statement)!.claims, sortKey: [areaIndex.get(areaOf(cid)) as number, order.get(cid)!] });
    }
  }
  remediation.sort((a, b) => a.sortKey[0] - b.sortKey[0] || a.sortKey[1] - b.sortKey[1]);
  const remediationItems: RemediationItem[] = remediation.map(({ sortKey: _key, ...item }, i) => ({ ...item, id: `remediation-${i + 1}` }));
  const followUps: ReviewerFollowUp[] = reviews
    .filter((x) => x.value.current && x.value.followUp)
    .sort((a, b) => (areaIndex.get(areaOf(a.subject.control!))! - areaIndex.get(areaOf(b.subject.control!))!) || order.get(a.subject.control!)! - order.get(b.subject.control!)!)
    .map((r, i) => {
      const cid = r.subject.control!;
      const statement = make({ layer: 'register', section: 'reviewer-follow-ups', rule: 'R-REGISTER-FOLLOWUP', template: 'register.followup.item', kind: 'reviewer-follow-up', attribution: r.attribution, qualifiers: unverified(r), slots: [['by', r.id, 'by'], ['at', r.id, 'at'], ['key', control(cid).id, 'key'], ['followUp', r.id, 'followUp']], subjects: { controls: [cid], area: areaOf(cid) } });
      return { id: `follow-up-${i + 1}`, control: cid, area: areaOf(cid), statement, attribution: r.attribution!, claims: byId.get(statement)!.claims };
    });
  const followUpStatement = make({ layer: 'register', section: 'reviewer-follow-ups', rule: 'R-REGISTER-FOLLOWUPS', template: 'register.followups.intro', kind: 'method', claims: reviews.length ? ids(reviews) : ['method.completeness'] });
  const unrankedStatement = make({ layer: 'register', section: 'remediation', rule: 'R-REGISTER-UNRANKED', template: 'register.remediation.unranked', kind: 'method', claims: gaps.length ? ids(gaps) : ['method.approval'] });

  // ------------------------------------------------------------------ layer 4: technical evidence annex
  const answers = ledger.claims.filter((c) => c.type === 'answer');
  const annexControls: AnnexControlRow[] = controls.map((c) => {
    const cid = c.value.id as string;
    const current = answers.find((a) => a.pointer === `${c.pointer}/answer`);
    const ev = evidence.get(cid);
    const level: EvidenceLevel = ev && ev.value.current ? ev.evidenceLevel! : said.has(cid) ? 'said-to-exist' : 'none-recorded';
    const review = reviews.find((r) => r.subject.control === cid);
    return {
      id: cid, area: c.value.domain.id, key: c.value.key, state: c.value.state, stateLabel: c.value.stateLabel, kind: kindOfControl(c.value),
      currentVersion: current?.value.version ?? null, source: current?.value.source ?? null, sourceLabel: current ? SOURCE_LABEL[current.value.source] ?? SOURCE_NOT_RECORDED : null,
      evidenceLevel: level, conclusion: review && review.value.current ? review.value.conclusion ?? null : null,
      claims: [c.id, ...(current ? [current.id] : []), ...(ev ? [ev.id] : []), ...(said.has(cid) ? [said.get(cid)!.id] : []), ...(review ? [review.id] : [])]
    };
  });
  const answerHistory: AnnexAnswerRow[] = answers.map((a) => ({
    control: a.subject.control!, version: a.value.version, value: a.value.value, label: a.value.label, via: a.value.via, source: a.value.source ?? null,
    sourceLabel: a.value.source ? SOURCE_LABEL[a.value.source] ?? SOURCE_NOT_RECORDED : SOURCE_NOT_RECORDED, by: a.value.by ?? null, at: a.value.at, current: a.pointer.endsWith('/answer'), claim: a.id
  }));
  const evidenceRows: AnnexEvidenceRow[] = [...evidence.values(), ...reviews, ...earlier].map((c) => ({
    control: c.subject.control!, record: c.type === 'evidence' || c.type === 'earlier-evidence' ? 'evidence' : 'review',
    state: c.value.state ?? null, conclusion: c.value.conclusion ?? null, evidenceLevel: c.evidenceLevel ?? null, current: !!c.value.current,
    attribution: c.attribution!, basis: c.value.basis ?? null, followUp: c.value.followUp ?? null, limitation: c.value.limitation ?? null, claim: c.id
  }));
  const lineageStatement = make({ layer: 'annex', section: 'lineage', rule: 'R-ANNEX-LINEAGE', template: 'annex.lineage', kind: 'method', slots: [['inputVersion', 'contract', 'version'], ['actionCount', 'lineage', 'actionCount'], ['sessionId', 'lineage', 'sessionId'], ['logDigest', 'lineage', 'logDigest']] });

  const releasable = complete && identityVerified && copy.approved;
  const reasons = [
    ...(complete ? [] : ['the review is not complete']),
    ...(identityVerified ? [] : ['reviewer identity is not verified']),
    ...(copy.approved ? [] : ['the wording is draft and not approved by MK'])
  ];
  return {
    contract: { ...REPORT_DOCUMENT_CONTRACT },
    draft: { copyVersion: copy.version, copyApproved: copy.approved, fictionalOnly: true, note: 'Draft built from a fictional record for MK review. Not a report and not for release.' },
    lineage: {
      inputContract: claim('contract').value.name, inputVersion: claim('contract').value.version, inputDigest: gate.digest,
      logDigest: claim('lineage').value.logDigest, actionCount: claim('lineage').value.actionCount, sessionId: claim('lineage').value.sessionId, asOf: claim('lineage').value.asOf,
      ledgerDigest: ledger.digest, ledgerVersion: ledger.version, engine: { ...DRAFT_ENGINE }
    },
    status: {
      reviewComplete: complete,
      why: claim('method.completeness').value.why,
      methodApproval: claim('method.approval').value,
      scoring: { status: 'withheld', reason: 'Withheld while the review method is not approved by MK (B4). A constraint of this stage, not an MK commercial or methodological policy.' },
      reviewerIdentity: { verified: identityVerified, reason: identityVerified ? 'every reviewer record carries a verified identity' : 'The report input carries no verified reviewer identity; reviewers do not yet sign in (B3).' },
      release: { classification: releasable ? 'releasable' : 'internal-interim', marking: releasable ? '' : INTERIM_MARKING, reasons }
    },
    statements,
    layers: {
      executive: { status, position, canConclude, unestablished, decisions: decisionItems.map((d) => d.statement) },
      analysis: { areas: analysisAreas, scenarios: { note: 'Scenario analysis is not drafted in Phase 1.' } },
      register: {
        informationGathering: { sequenceStatement, items: requests },
        remediation: { unrankedStatement, ranked: false, items: remediationItems },
        reviewerFollowUps: { statement: followUpStatement, items: followUps },
        decisions: { items: decisionItems }
      },
      annex: { controls: annexControls, answerHistory, evidence: evidenceRows, lineageStatement }
    }
  };
}

