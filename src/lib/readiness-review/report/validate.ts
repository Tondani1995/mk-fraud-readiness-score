import { canonicalJson } from '../canonical';
import type { ReportInput } from '../report-input';
import {
  EVIDENCE_LEVELS,
  EXECUTIVE_CONTROL_LIMIT,
  EXECUTIVE_COUNTS,
  INTERIM_MARKING,
  REPORT_DOCUMENT_CONTRACT,
  SEQUENCE_MEANING,
  executiveStatementIds,
  type EvidenceLevel,
  type ReportDocument,
  type Statement,
  type ValidationResult
} from './document';
import { render, type CopyTable } from './draft-copy';
import type { GateResult } from './input-gate';
import { claimHolds, type Claim, type Ledger } from './ledger';
import { evidenceTemplate, fieldOf, SOURCE_LABEL, SOURCE_NOT_RECORDED, UNKNOWN_STATES } from './shared';

/**
 * The validation checks (V01 to V15 in docs/readiness-review/REPORT-ENGINE-DESIGN.md). A document is acceptable only if
 * every check passes. Each check reads the document, the input, the claims ledger and the copy table, and fails closed:
 * anything it cannot establish is a failure. Wording checks look at the template's own words, not at the values quoted
 * into it, because quoted values come from the record and are attributed.
 */
export const CHECKS: [string, string][] = [
  ['V01', 'Input gate'],
  ['V02', 'Traceability'],
  ['V03', 'Slots from claims'],
  ['V04', 'Reported exposure is reported'],
  ['V05', 'Unknown is not weak'],
  ['V06', 'Evidence levels honest'],
  ['V07', 'Conclusions attributed'],
  ['V08', 'No scoring'],
  ['V09', 'Counts conditional'],
  ['V10', 'No implied ranking'],
  ['V11', 'Status and release'],
  ['V12', 'Layers kept apart'],
  ['V13', 'Everything accounted for'],
  ['V14', 'Provenance honest'],
  ['V15', 'Deterministic']
];

const WORDS = {
  upgrade: /confirm|verif|validat|proven|establish|assur|audit/i,
  weakness: /weak|deficien|fail|lack|not in place|absent|\bgaps?\b/i,
  independent: /independent(ly)?\s+(validat|verif|audit|assur|confirm|test)/i,
  conclusion: /\b(confirmed|partly confirmed|did not confirm|is disputed)\b/i,
  scoring: /\bscor(e|es|ed|ing)\b|\brating\b|\brated\b|maturity|\bband\b|confidence|risk level|%|per ?cent|\bRAG\b|traffic.?light/i,
  comparison: /\b(more|fewer|less|higher|lower|greater|smaller) than\b|\bcompared\b|\bhighest\b|\blowest\b|\bworst\b|\bbest\b|\bmost\b|\bleast\b/i,
  ranking: /most important|highest risk|greatest (fraud )?exposure|top priority|first priority|most serious|most urgent|\branked (first|highest)\b|\bpriority (one|1)\b|\bcritical\b|\burgent\b/i
};
const BANNED_KEYS = /^(score|scores|band|bands|rating|ratings|maturity|maturityLevel|confidence|riskLevel|risk_level|rag|percent|percentage|weight|weights|rank|ranking|severity)$/i;

/** The template's own words: the text with every quoted value taken out. */
export function ownWords(statement: Statement) {
  let text = statement.text;
  // Longest first, so that a short value inside a longer one (a number inside a digest) cannot break it.
  const quoted = statement.slots.map((s) => (s.value === null ? '' : String(s.value))).filter((v) => v.length).sort((a, b) => b.length - a.length);
  for (const v of quoted) text = text.split(v).join(' ');
  return text;
}

const levelRank = (l: EvidenceLevel) => EVIDENCE_LEVELS.indexOf(l);

export type ValidationContext = { doc: ReportDocument; input: ReportInput; ledger: Ledger; copy: CopyTable; gate: GateResult | null; rebuild: () => ReportDocument };

export function validateDocument(ctx: ValidationContext): { passed: boolean; results: ValidationResult[] } {
  const { doc, input, ledger, copy, gate } = ctx;
  const inp = input as any;
  const fail: Record<string, string[]> = Object.fromEntries(CHECKS.map(([id]) => [id, []]));
  const note = (id: string, message: string) => fail[id].push(message);
  const statements = new Map(doc.statements.map((s) => [s.id, s]));
  const claim = (id: string): Claim | undefined => ledger.byId.get(id);
  const holds = new Map<string, boolean>();
  const holdsOnce = (id: string) => {
    if (!holds.has(id)) {
      const c = claim(id);
      holds.set(id, !!c && claimHolds(input, c));
    }
    return holds.get(id)!;
  };
  const inputControls: any[] = inp.domains.flatMap((d: any) => d.controls);
  const controlState = new Map(inputControls.map((c) => [c.id, c.state as string]));
  const areaOrder = new Map(inp.domains.map((d: any, i: number) => [d.id, i]));
  const controlOrder = new Map(inputControls.map((c, i) => [c.id, i]));
  const executiveIds = executiveStatementIds(doc);

  // V01 input gate -------------------------------------------------------------------------------------------------
  if (!gate) note('V01', 'no input gate result');
  else {
    for (const c of gate.checks) if (!c.passed) note('V01', `gate ${c.id}: ${c.detail}`);
    if (gate.digest !== doc.lineage.inputDigest) note('V01', 'the document lineage does not carry the gated input digest');
  }
  if (doc.contract.name !== REPORT_DOCUMENT_CONTRACT.name || doc.contract.version !== REPORT_DOCUMENT_CONTRACT.version) note('V01', 'document contract not recognised');
  if (doc.lineage.inputContract !== inp.contract?.name || doc.lineage.inputVersion !== inp.contract?.version) note('V01', 'document lineage names another input contract');
  if (doc.lineage.ledgerDigest !== ledger.digest) note('V01', 'document lineage names another claims ledger');

  // V02 traceability -----------------------------------------------------------------------------------------------
  const cited = new Set<string>();
  for (const s of doc.statements) {
    if (!s.claims.length) note('V02', `${s.id} cites no claim`);
    for (const id of [...s.claims, ...s.slots.map((x) => x.claim), ...s.counts.flatMap((c) => [...c.items, ...(c.universe?.items ?? [])])]) cited.add(id);
  }
  const reg = doc.layers.register;
  for (const item of [...reg.informationGathering.items, ...reg.remediation.items, ...reg.reviewerFollowUps.items, ...reg.decisions.items]) {
    if (!item.claims.length) note('V02', `${item.id} cites no claim`);
    item.claims.forEach((id) => cited.add(id));
    if (!statements.has(item.statement)) note('V02', `${item.id} refers to a statement that does not exist`);
  }
  for (const row of doc.layers.annex.controls) row.claims.forEach((id) => cited.add(id));
  for (const row of doc.layers.annex.answerHistory) cited.add(row.claim);
  for (const row of doc.layers.annex.evidence) cited.add(row.claim);
  for (const id of cited) {
    if (!claim(id)) note('V02', `unknown claim ${id}`);
    else if (!holdsOnce(id)) note('V02', `claim ${id} does not hold against the input at ${claim(id)!.pointer}`);
  }
  for (const id of [...executiveIds, ...doc.layers.analysis.areas.flatMap((a) => a.statements), reg.informationGathering.sequenceStatement, reg.remediation.unrankedStatement, reg.reviewerFollowUps.statement, doc.layers.annex.lineageStatement]) {
    if (!statements.has(id)) note('V02', `the layers refer to a statement that does not exist: ${id}`);
  }

  // V03 slots from claims ------------------------------------------------------------------------------------------
  for (const s of doc.statements) {
    const template = copy.templates[s.template];
    if (template === undefined) {
      note('V03', `${s.id}: template ${s.template} is not in copy ${copy.version}`);
      continue;
    }
    if (/\d/.test(template)) note('V03', `${s.id}: template ${s.template} carries a number of its own`);
    const values: Record<string, string | number | null> = {};
    for (const slot of s.slots) {
      const c = claim(slot.claim);
      const actual = c ? fieldOf(c.value, slot.field) ?? null : undefined;
      if (actual !== slot.value) note('V03', `${s.id}: slot {${slot.name}} is not the value of ${slot.claim}${slot.field ? `.${slot.field}` : ''}`);
      values[slot.name] = slot.value;
    }
    for (const c of s.counts) {
      if (c.value !== c.items.length || new Set(c.items).size !== c.items.length) note('V03', `${s.id}: count {${c.name}} is not the number of its items`);
      if (c.universe) {
        if (c.universe.value !== c.universe.items.length) note('V03', `${s.id}: universe {${c.universe.name}} is not the number of its items`);
        // A count and its universe may cite different claims about the same subject (a gap and its control).
        const subjectOf = (i: string) => claim(i)?.subject.control ?? claim(i)?.subject.scenario ?? i;
        const universe = new Set(c.universe.items.map(subjectOf));
        if (!c.items.every((i) => universe.has(subjectOf(i)))) note('V03', `${s.id}: count {${c.name}} counts items outside its universe`);
        values[c.universe.name] = c.universe.value;
      }
      values[c.name] = c.value;
    }
    let rendered: string | null = null;
    try {
      rendered = render(template, values);
    } catch (error) {
      note('V03', `${s.id}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (rendered !== null && rendered !== s.text) note('V03', `${s.id}: the text is not its template filled from its claims`);
    const numbers = new Set(s.counts.flatMap((c) => [String(c.value), ...(c.universe ? [String(c.universe.value)] : [])]));
    for (const n of ownWords(s).match(/\d+/g) ?? []) if (!numbers.has(n)) note('V03', `${s.id}: the number ${n} comes from no count or claim`);
  }

  // V04 reported exposure is reported ------------------------------------------------------------------------------
  for (const s of doc.statements.filter((x) => x.kind === 'reported-exposure')) {
    for (const c of s.counts.filter((x) => x.name === 'exposed')) if (!c.items.every((i) => claim(i)?.type === 'gap')) note('V04', `${s.id}: counts as exposure something that is not a reported gap`);
    for (const cid of s.subjects.controls) if (!claim(`gap:${cid}`)) note('V04', `${s.id}: ${cid} is not a reported gap`);
    if (WORDS.upgrade.test(ownWords(s).replace(/MK reviewed the evidence supplied and found (it sufficient|it insufficient|that it did not support the answer)/g, ''))) note('V04', `${s.id}: reported exposure worded as evidenced or concluded`);
  }
  for (const item of reg.remediation.items.filter((i) => i.source === 'method-action')) if (!claim(`gap:${item.control}`)) note('V04', `${item.id}: a method action for ${item.control}, which is not a reported gap`);

  // V05 unknown is not weak ----------------------------------------------------------------------------------------
  const unknown = (cid: string) => UNKNOWN_STATES.includes(controlState.get(cid) ?? '');
  for (const s of doc.statements.filter((x) => x.kind === 'reported-exposure')) {
    const controls = [...s.subjects.controls, ...s.counts.flatMap((c) => c.items).map((i) => claim(i)?.subject.control).filter((x): x is string => !!x)];
    for (const cid of controls) if (unknown(cid)) note('V05', `${s.id}: ${cid} (${controlState.get(cid)}) is presented as exposure`);
  }
  for (const item of reg.remediation.items) if (unknown(item.control)) note('V05', `${item.id}: a remediation item for ${item.control} (${controlState.get(item.control)})`);
  for (const s of doc.statements.filter((x) => x.kind === 'unresolved' || x.kind === 'outside-scope')) if (WORDS.weakness.test(ownWords(s))) note('V05', `${s.id}: an unresolved or out-of-scope matter worded as a weakness`);

  // V06 evidence levels honest -------------------------------------------------------------------------------------
  for (const c of ledger.claims) if (c.evidenceLevel === 'independently-validated') note('V06', `claim ${c.id} carries independent validation, which the method cannot produce`);
  for (const s of doc.statements) {
    const evidenceClaims = s.claims.map(claim).filter((c): c is Claim => !!c && !!c.evidenceLevel);
    const best = evidenceClaims.reduce((m, c) => Math.max(m, levelRank(c.evidenceLevel!)), levelRank('none-recorded'));
    if (s.evidenceLevel === 'independently-validated') note('V06', `${s.id}: claims independent validation`);
    if (s.evidenceLevel && levelRank(s.evidenceLevel) > best) note('V06', `${s.id}: states evidence level ${s.evidenceLevel}, above what its claims hold`);
    if (s.template !== 'unestablished.validation' && WORDS.independent.test(ownWords(s))) note('V06', `${s.id}: claims independent validation`);
    const prefix = s.template.startsWith('evidence.') ? 'evidence' : s.template.startsWith('analysis.exposure.') ? 'analysis.exposure' : null;
    if (prefix) {
      const ev = evidenceClaims.find((c) => c.type === 'evidence' || c.type === 'evidence-said');
      const expected = ev ? evidenceTemplate(prefix, ev.evidenceLevel!, ev.outcome ?? null) : `${prefix}.none-recorded`;
      if (s.template !== expected) note('V06', `${s.id}: worded as ${s.template} but its evidence record is ${expected}`);
    }
    // A statement that describes evidence may rest only on current evidence outside the annex. (A status statement about
    // reviewer records in general, such as the unverified identity, may cite any of them.)
    const describesEvidence = !!s.evidenceLevel || ['evidence', 'reported-exposure', 'reported-practice', 'conclusion'].includes(s.kind);
    if (s.layer !== 'annex' && describesEvidence) for (const c of evidenceClaims.filter((x) => x.type === 'evidence' || x.type === 'earlier-evidence')) if (!c.value.current) note('V06', `${s.id}: cites evidence that is not current (${c.id}) outside the annex`);
  }
  for (const row of doc.layers.annex.evidence) {
    const c = claim(row.claim);
    if (c && (row.evidenceLevel ?? null) !== (c.evidenceLevel ?? null)) note('V06', `annex evidence row ${row.claim} states another evidence level`);
  }

  // V07 conclusions attributed -------------------------------------------------------------------------------------
  const currentConclusions = ledger.claims.filter((c) => c.type === 'review' && c.value.current && c.value.conclusion);
  for (const s of doc.statements) {
    const reviewClaims = s.claims.map(claim).filter((c): c is Claim => !!c && (c.type === 'review' || c.type === 'earlier-review'));
    if (s.kind === 'conclusion' && s.template !== 'conclusion.none') {
      const r = reviewClaims.find((c) => c.value.current && `conclusion.${c.value.conclusion}` === s.template);
      if (!r) note('V07', `${s.id}: conclusion wording without a current review record with that conclusion`);
      else {
        if (!s.attribution || canonicalJson(s.attribution) !== canonicalJson(r.attribution)) note('V07', `${s.id}: conclusion not attributed as recorded`);
        for (const name of ['by', 'at', 'basis']) if (!s.slots.some((x) => x.name === name && x.claim === r.id)) note('V07', `${s.id}: {${name}} not quoted from the review record`);
      }
    }
    if (s.template === 'conclusion.none' && currentConclusions.length) note('V07', `${s.id}: says no conclusion was recorded, but one was`);
    if (s.kind === 'reviewer-follow-up') {
      const r = reviewClaims.find((c) => s.slots.some((x) => x.name === 'followUp' && x.claim === c.id));
      if (!r || !s.attribution || canonicalJson(s.attribution) !== canonicalJson(r.attribution)) note('V07', `${s.id}: reviewer follow-up not quoted and attributed as recorded`);
    }
    if (s.kind !== 'conclusion' && WORDS.conclusion.test(ownWords(s))) note('V07', `${s.id}: conclusion wording in a statement that is not a reviewer conclusion`);
    if (s.attribution && !s.attribution.identityVerified && !s.qualifiers.includes('reviewer-identity-unverified')) note('V07', `${s.id}: an unverified reviewer identity is not marked`);
  }

  // V08 no scoring -------------------------------------------------------------------------------------------------
  const walk = (node: unknown, path: string) => {
    if (Array.isArray(node)) node.forEach((v, i) => walk(v, `${path}/${i}`));
    else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) {
      if (BANNED_KEYS.test(k)) note('V08', `field ${path}/${k}`);
      walk(v, `${path}/${k}`);
    }
  };
  walk(doc, '');
  for (const s of doc.statements) if (s.template !== 'status.scoring' && WORDS.scoring.test(ownWords(s))) note('V08', `${s.id}: scoring wording`);
  if (doc.status.scoring?.status !== 'withheld') note('V08', 'scoring is not withheld while the method is unapproved');

  // V09 counts conditional -----------------------------------------------------------------------------------------
  for (const s of doc.statements) {
    for (const c of s.counts) {
      if (!c.universe) note('V09', `${s.id}: count {${c.name}} has no universe`);
      if (!Number.isInteger(c.value) || c.value < 0) note('V09', `${s.id}: count {${c.name}} is not a count`);
    }
    if (WORDS.comparison.test(ownWords(s))) note('V09', `${s.id}: comparison wording`);
  }
  for (const id of executiveIds) {
    const s = statements.get(id);
    for (const c of s?.counts ?? []) for (const name of [c.name, ...(c.universe ? [c.universe.name] : [])]) if (!(EXECUTIVE_COUNTS as readonly string[]).includes(name)) note('V09', `${id}: the executive brief may not use the count {${name}}`);
  }

  // V10 no implied ranking -----------------------------------------------------------------------------------------
  for (const s of doc.statements) if (WORDS.ranking.test(ownWords(s))) note('V10', `${s.id}: ranking wording`);
  if (statements.get(reg.informationGathering.sequenceStatement)?.template !== 'register.info.sequence') note('V10', 'the information-gathering register does not state that it is a sequence, not a ranking');
  reg.informationGathering.items.forEach((item, i) => {
    if (item.sequenceMeaning !== SEQUENCE_MEANING) note('V10', `${item.id}: sequence meaning missing or changed`);
    if (item.sequence !== i + 1) note('V10', `${item.id}: sequence is not the position in the register`);
  });
  if (reg.remediation.ranked !== false || reg.remediation.items.some((i) => i.ranked !== false)) note('V10', 'remediation recommendations are marked as ranked');
  if (statements.get(reg.remediation.unrankedStatement)?.template !== 'register.remediation.unranked') note('V10', 'the remediation register does not state that it is unranked');
  const inOrder = (list: { area: string; control: string }[], what: string) => {
    for (let i = 1; i < list.length; i++) {
      const [a, b] = [list[i - 1], list[i]];
      const [aa, ba] = [areaOrder.get(a.area) as number, areaOrder.get(b.area) as number];
      if (aa > ba || (aa === ba && (controlOrder.get(a.control) as number) > (controlOrder.get(b.control) as number))) note('V10', `${what} is not in area and question order at position ${i + 1}`);
    }
  };
  inOrder(reg.remediation.items, 'the remediation register');
  inOrder(reg.reviewerFollowUps.items, 'the reviewer follow-ups');
  if (statements.get(reg.reviewerFollowUps.statement)?.template !== 'register.followups.intro') note('V10', 'reviewer follow-ups are not stated to be unclassified and unranked');
  if (reg.remediation.items.some((i) => (i as any).source !== 'method-action')) note('V10', 'the remediation register holds something other than the method\'s actions for reported gaps');
  const exposureAreas = doc.layers.executive.position.reportedExposure.map((id) => statements.get(id)).filter((s) => s?.rule === 'R-POS-EXPOSURE-AREA').map((s) => areaOrder.get(s!.subjects.area!) as number);
  if (exposureAreas.some((v, i) => i > 0 && v < exposureAreas[i - 1])) note('V10', 'reported exposure in the executive brief is not in area order');

  // V11 status and release -----------------------------------------------------------------------------------------
  const st = doc.status;
  if (st.reviewComplete !== inp.method?.completeness?.complete) note('V11', 'completeness differs from the input');
  if (st.methodApproval !== inp.method?.approval) note('V11', 'method approval differs from the input');
  if (typeof st.reviewerIdentity?.verified !== 'boolean') note('V11', 'reviewer identity status missing');
  const mustStayInternal = !st.reviewComplete || !st.reviewerIdentity?.verified || !doc.draft.copyApproved || doc.draft.fictionalOnly;
  if (mustStayInternal && (st.release?.classification !== 'internal-interim' || st.release?.marking !== INTERIM_MARKING)) note('V11', 'a document that must stay internal is not classified and marked as internal interim');
  const statusRules = doc.layers.executive.status.map((id) => statements.get(id)?.rule);
  for (const rule of ['R-STATUS-METHOD', 'R-STATUS-SCORING', ...(st.reviewComplete ? [] : ['R-STATUS-INTERIM'])]) if (!statusRules.includes(rule)) note('V11', `the executive status lacks ${rule}`);
  if (!st.reviewerIdentity?.verified && doc.layers.annex.evidence.length && !statusRules.includes('R-STATUS-IDENTITY')) note('V11', 'the executive status does not say that reviewer identity is unverified');
  if (doc.draft.fictionalOnly !== true || inp.organisation?.fictional !== true) note('V11', 'Phase 1 documents are for fictional records only');

  // V12 layers kept apart ------------------------------------------------------------------------------------------
  const named = new Set<string>();
  for (const id of executiveIds) {
    const s = statements.get(id);
    if (!s) continue;
    if (s.layer !== 'executive') note('V12', `${id}: a ${s.layer} statement in the executive brief`);
    if (s.subjects.controls.length > EXECUTIVE_CONTROL_LIMIT.perStatement) note('V12', `${id}: names ${s.subjects.controls.length} controls in the executive brief`);
    s.subjects.controls.forEach((c) => named.add(c));
  }
  if (named.size > EXECUTIVE_CONTROL_LIMIT.total) note('V12', `the executive brief names ${named.size} controls`);
  const annexIds = doc.layers.annex.controls.map((r) => r.id);
  if (annexIds.length !== inputControls.length || annexIds.some((id, i) => id !== inputControls[i].id)) note('V12', 'the annex does not hold every control exactly once, in order');
  const answerClaims = ledger.claims.filter((c) => c.type === 'answer').map((c) => c.id).sort();
  if (canonicalJson(doc.layers.annex.answerHistory.map((r) => r.claim).sort()) !== canonicalJson(answerClaims)) note('V12', 'the annex answer history does not hold every answer version exactly once');

  // V13 everything accounted for -----------------------------------------------------------------------------------
  const requested = new Map<string, number>();
  for (const item of reg.informationGathering.items) requested.set(item.control, (requested.get(item.control) ?? 0) + 1);
  for (const w of inp.openWork.waiting) if (requested.get(w.id) !== 1) note('V13', `waiting item ${w.id} appears ${requested.get(w.id) ?? 0} times in the information-gathering register`);
  const analysisStatements = doc.layers.analysis.areas.flatMap((a) => a.statements).map((id) => statements.get(id)).filter((s): s is Statement => !!s);
  const actionsFor = new Set(inp.openWork.actions.filter((a: any) => a.type === 'address').map((a: any) => a.id));
  for (const g of inp.findings.reportedGaps) {
    if (!analysisStatements.some((s) => s.kind === 'reported-exposure' && s.subjects.controls.includes(g.id))) note('V13', `reported gap ${g.id} is missing from the management analysis`);
    if (actionsFor.has(g.id) && !reg.remediation.items.some((i) => i.source === 'method-action' && i.control === g.id)) note('V13', `reported gap ${g.id} is missing from the remediation register`);
  }
  const rows = new Set(doc.layers.annex.evidence.map((r) => r.claim));
  for (const c of ledger.claims.filter((x) => ['evidence', 'review', 'earlier-evidence', 'earlier-review'].includes(x.type))) if (!rows.has(c.id)) note('V13', `reviewer record ${c.id} is missing from the annex`);
  const followed = new Set(reg.reviewerFollowUps.items.map((f) => f.control));
  for (const c of ledger.claims.filter((x) => x.type === 'review' && x.value.current && x.value.followUp)) if (!followed.has(c.subject.control!)) note('V13', `the reviewer follow-up for ${c.subject.control} is missing from the register`);
  const decisionStatements = new Set(reg.decisions.items.map((d) => d.statement));
  for (const id of doc.layers.executive.decisions) if (!decisionStatements.has(id)) note('V13', `decision ${id} is not in the management decisions register`);

  // V14 provenance honest ------------------------------------------------------------------------------------------
  for (const r of doc.layers.annex.answerHistory) {
    const expected = r.source ? SOURCE_LABEL[r.source] ?? SOURCE_NOT_RECORDED : SOURCE_NOT_RECORDED;
    if (r.sourceLabel !== expected) note('V14', `answer ${r.claim}: shown as "${r.sourceLabel}", recorded as ${r.source ?? 'not recorded'}`);
    const c = claim(r.claim);
    if (c && (c.value.source ?? null) !== r.source) note('V14', `answer ${r.claim}: source differs from the input`);
  }
  for (const r of doc.layers.annex.controls) {
    if (r.currentVersion === null) continue;
    const expected = r.source ? SOURCE_LABEL[r.source] ?? SOURCE_NOT_RECORDED : SOURCE_NOT_RECORDED;
    if (r.sourceLabel !== expected) note('V14', `control ${r.id}: current answer shown as "${r.sourceLabel}"`);
  }
  for (const c of inputControls) {
    const versions = c.history.length + (c.answer ? 1 : 0);
    if (doc.layers.annex.answerHistory.filter((r) => r.control === c.id).length !== versions) note('V14', `control ${c.id}: answer history incomplete`);
  }

  // V15 deterministic ----------------------------------------------------------------------------------------------
  try {
    if (canonicalJson(ctx.rebuild()) !== canonicalJson(doc)) note('V15', 'building again gives a different document');
  } catch (error) {
    note('V15', `building again failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  const results = CHECKS.map(([id, name]) => ({ id, name, passed: fail[id].length === 0, failures: fail[id].slice(0, 12) }));
  return { passed: results.every((r) => r.passed), results };
}
