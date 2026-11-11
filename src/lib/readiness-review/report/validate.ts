import { canonicalJson } from '../canonical';
import type { ReportInput } from '../report-input';
import {
  COVERAGE_CATEGORIES,
  EXECUTIVE_COUNTS,
  EXECUTIVE_LIMITS,
  EXECUTIVE_SECTIONS,
  INTERIM_MARKING,
  REPORT_DOCUMENT_CONTRACT,
  REQUIRED_WITHHELD,
  SEQUENCE_MEANING,
  STANDARD_KINDS,
  STANDARD_PATHWAY,
  STANDARD_RELEASE_CRITERIA,
  TIER_MEANING,
  coverageCategoryOf,
  executiveStatementIds,
  type ReportDocument,
  type Statement,
  type ValidationResult
} from './document';
import { render, type CopyTable } from './copy';
import type { GateResult } from './input-gate';
import { claimHolds, standardLedger, type Claim, type Ledger } from './ledger';
import { fieldOf, SOURCE_LABEL, SOURCE_NOT_RECORDED, UNKNOWN_STATES } from './shared';

/**
 * The validation checks of the standard (self-reported) report, V01 to V20 (docs/readiness-review/REPORT-ENGINE-DESIGN.md,
 * revision 3). A document is acceptable only if every check passes. Each check reads the document, the input, the full
 * claims ledger and the copy table, and fails closed: anything it cannot establish is a failure.
 *
 * Wording checks look at the template's own words, not at the values quoted into it, because quoted values come from
 * the record. A few sentences need words that are otherwise refused, because they say what MK did NOT do or what the
 * report withholds. Those sentences are pinned here, word for word, rather than exempted by template: a copy table that
 * changes one of them, or adds an assertion beside it, no longer matches and is checked like any other wording.
 */
export const CHECKS: [string, string][] = [
  ['V01', 'Input gate'],
  ['V02', 'Traceability'],
  ['V03', 'Slots from claims'],
  ['V04', 'Indicated gaps are as reported'],
  ['V05', 'Unknown is not weak'],
  ['V06', 'Self-reported records honest'],
  ['V07', 'No conclusions'],
  ['V08', 'No scoring'],
  ['V09', 'Counts conditional'],
  ['V10', 'No implied ranking'],
  ['V11', 'Status and release'],
  ['V12', 'Layers kept apart'],
  ['V13', 'Everything accounted for'],
  ['V14', 'Provenance honest'],
  ['V15', 'Deterministic'],
  ['V16', 'Pathway boundary'],
  ['V17', 'Coverage kept distinct'],
  ['V18', 'Recommended actions grounded'],
  ['V19', 'Executive brief concise'],
  ['V20', 'Judgements withheld']
];

/** Sentences that may use otherwise refused words, because they deny or withhold. Matched exactly, after slot values are removed. */
export const PINNED_SENTENCES = [
  'MK has not reviewed evidence or verified any response; evidence review is not part of this assessment.',
  'Where the report describes a gap, it is a gap indicated by the responses, not a verified control deficiency.',
  'MK has not verified the responses.',
  'The method is not yet approved by MK, and the actions rest on responses MK has not verified.',
  'Withheld: whether the responses are accurate. MK has not reviewed evidence or verified any response; this assessment does not include evidence review.',
  'Not part of this assessment: evidence review, verification of responses and professional conclusions by MK.',
  'A control that was not asked, or whose applicability is not yet known, is not a finding: nothing is concluded about it, favourable or unfavourable.',
  'Withheld: an overall view of the organisation\'s fraud readiness. It needs a professional judgement that MK has not recorded, and the method is not yet approved.',
  'Withheld: any order of priority, materiality or urgency among the gaps indicated. MK has not approved a method for prioritisation, and the responses alone do not establish one.',
  'Withheld: any score, rating or maturity level, while the method is not approved.',
  'Withheld: how, by whom and by when each gap should be addressed, beyond the draft method\'s own description of the practice. That needs judgement about the organisation that MK has not recorded.',
  'because a recorded fact shows they do not apply, they are not expected at the organisation\'s size, or a related practice was reported absent.',
  'a specific recommended action is withheld: the draft method gives no description of this practice in place to restate, and MK has not recorded a recommendation.'
];

/** Sentences that must appear, word for word, in statements of the given rule. */
const REQUIRED_SENTENCES: Record<string, string> = {
  'R-STATUS-BASIS': 'MK has not reviewed evidence or verified any response; evidence review is not part of this assessment.',
  'R-ANALYSIS-RECORDS': 'MK has not seen these records.',
  'R-REGISTER-ISSUES': 'MK has not verified the responses.',
  'R-REGISTER-ACTIONS': 'The method is not yet approved by MK, and the actions rest on responses MK has not verified.',
  'R-COVERAGE-ROUTING': 'A control that was not asked, or whose applicability is not yet known, is not a finding: nothing is concluded about it, favourable or unfavourable.'
};

const WORDS = {
  upgrade: /confirm|verif|validat|proven|establish|assur|audit|evidenc/i,
  weakness: /weak|deficien|fail|lack|not in place|absent|\bgaps?\b|shortfall|exposure/i,
  verification: /\bverif|\bvalidat|\baudit|\bassur|\bevidence\b|\breviewed\b|\breviewers?\b|\bMK (found|concluded|confirmed|assessed|checked|tested)\b|\bindependent/i,
  conclusion: /\bconclu(de|ded|des|sion|sions)\b|\bconfirmed\b|\bdid not confirm\b|\bdisputed?\b|\bfindings?\b/i,
  scoring: /\bscor(e|es|ed|ing)\b|\brating\b|\brated\b|maturity|\bband\b|confidence|risk level|%|per ?cent|\bRAG\b|traffic.?light/i,
  comparison: /\b(more|fewer|less|higher|lower|greater|smaller) than\b|\bcompared\b|\bhighest\b|\blowest\b|\bworst\b|\bbest\b|\bmost\b|\bleast\b/i,
  ranking: /most important|highest risk|greatest (fraud )?exposure|top priority|first priority|most serious|most urgent|\branked (first|highest)\b|\bpriority (one|1)\b|\bcritical\b|\burgent\b|\bprioriti[sz]ed?\b/i,
  judgement: /\boverall\b|\bready\b|\breadiness\b|\badequate(ly)?\b|\binadequate\b|\beffective(ly|ness)?\b|\bineffective\b|\bsufficient(ly)?\b|\binsufficient\b|\bstrong(ly)?\b|\bweak|\bmature\b|\bwell[- ]controlled\b|\bgood\b|\bpoor(ly)?\b|\brobust\b|\bsound\b|\bsatisfactory\b|\bunsatisfactory\b|\bhigh[- ]risk\b|\blow[- ]risk\b|\bmaterial\b|\bsignificant(ly)?\b|\bserious\b|\bjudge(ment)?\b/i,
  evidenceRequest: /\baddress the reported gap\b|\b(obtain|supply|provide|request|collect|gather|submit|produce|share|send)\b[^.]*\b(evidence|records?|documentation|documents|proof)\b/i
};
const BANNED_KEYS = /^(score|scores|band|bands|rating|ratings|maturity|maturityLevel|confidence|riskLevel|risk_level|rag|percent|percentage|weight|weights|rank|ranking|severity|priority)$/i;
const ADVISORY_KEYS = /^(evidenceLevel|attribution|conclusion|conclusions|reviewer|reviewers|reviewerIdentity|identityVerified|reviewComplete|evidence|review|reviewerFollowUps|followUp|limitation)$/;

/** The template's own words: the text with every quoted value taken out. */
export function ownWords(statement: Pick<Statement, 'text' | 'slots'>) {
  let text = statement.text;
  // Longest first, so that a short value inside a longer one (a number inside a digest) cannot break it.
  const quoted = statement.slots.map((s) => (s.value === null ? '' : String(s.value))).filter((v) => v.length).sort((a, b) => b.length - a.length);
  for (const v of quoted) text = text.split(v).join(' ');
  return text;
}

/** The template's own words with the pinned sentences taken out: what every wording check reads. */
export function checkedWords(statement: Pick<Statement, 'text' | 'slots'>) {
  return PINNED_SENTENCES.reduce((text, p) => text.split(p).join(' '), ownWords(statement));
}

export type ValidationContext = { doc: ReportDocument; input: ReportInput; ledger: Ledger; copy: CopyTable; gate: GateResult | null; rebuild: () => ReportDocument };

export function validateDocument(ctx: ValidationContext): { passed: boolean; results: ValidationResult[] } {
  const { doc, input, ledger, copy, gate } = ctx;
  const inp = input as any;
  const fail: Record<string, string[]> = Object.fromEntries(CHECKS.map(([id]) => [id, []]));
  const note = (id: string, message: string) => fail[id].push(message);
  const statements = new Map((doc.statements ?? []).map((s) => [s.id, s]));
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
  const controlById = new Map(inputControls.map((c) => [c.id, c]));
  const areaOrder = new Map(inp.domains.map((d: any, i: number) => [d.id, i]));
  const controlOrder = new Map(inputControls.map((c, i) => [c.id, i]));
  const scenarioOrder = new Map(inp.scenarios.map((s: any, i: number) => [s.id, i]));
  const gapIds = new Set(inp.findings.reportedGaps.map((g: any) => g.id));
  const reg = doc.layers.register;
  const executiveIds = executiveStatementIds(doc);
  const words = (s: Statement) => checkedWords(s);
  const controlOf = (id: string) => claim(id)?.subject.control;

  // V01 input gate -------------------------------------------------------------------------------------------------
  if (!gate) note('V01', 'no input gate result');
  else {
    for (const c of gate.checks) if (!c.passed) note('V01', `gate ${c.id}: ${c.detail}`);
    if (gate.digest !== doc.lineage.inputDigest) note('V01', 'the document lineage does not carry the gated input digest');
  }
  if (doc.contract.name !== REPORT_DOCUMENT_CONTRACT.name || doc.contract.version !== REPORT_DOCUMENT_CONTRACT.version) note('V01', 'document contract not recognised');
  if (doc.lineage.inputContract !== inp.contract?.name || doc.lineage.inputVersion !== inp.contract?.version) note('V01', 'document lineage names another input contract');
  if (doc.lineage.ledgerDigest !== standardLedger(ledger).digest) note('V01', 'document lineage names another claims ledger');

  // V02 traceability -----------------------------------------------------------------------------------------------
  const cited = new Set<string>();
  for (const s of doc.statements) {
    if (!s.claims.length) note('V02', `${s.id} cites no claim`);
    for (const id of [...s.claims, ...s.slots.map((x) => x.claim), ...s.counts.flatMap((c) => [...c.items, ...(c.universe?.items ?? [])])]) cited.add(id);
  }
  const registerItems = [...reg.informationGathering.items, ...reg.reportedIssues.items, ...reg.recommendedActions.items, ...reg.decisions.items];
  for (const item of registerItems) {
    if (!item.claims.length) note('V02', `${item.id} cites no claim`);
    item.claims.forEach((id) => cited.add(id));
    if (!statements.has(item.statement)) note('V02', `${item.id} refers to a statement that does not exist`);
  }
  for (const row of doc.layers.annex.controls) row.claims.forEach((id) => cited.add(id));
  for (const row of doc.layers.annex.answerHistory) cited.add(row.claim);
  for (const row of doc.layers.annex.scenarios) cited.add(row.claim);
  for (const id of cited) {
    if (!claim(id)) note('V02', `unknown claim ${id}`);
    else if (!holdsOnce(id)) note('V02', `claim ${id} does not hold against the input at ${claim(id)!.pointer}`);
  }
  const layerRefs = [
    ...executiveIds,
    ...doc.layers.analysis.areas.flatMap((a) => a.statements),
    ...doc.layers.analysis.scenarios.flatMap((a) => a.statements),
    doc.layers.analysis.coverage.routing,
    ...doc.layers.analysis.coverage.rows.map((r) => r.statement),
    reg.informationGathering.sequenceStatement,
    reg.reportedIssues.statement,
    reg.recommendedActions.statement,
    doc.layers.annex.lineageStatement,
    doc.layers.annex.methodStatement
  ];
  for (const id of layerRefs) if (!statements.has(id)) note('V02', `the layers refer to a statement that does not exist: ${id}`);

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

  // V04 indicated gaps are as reported -----------------------------------------------------------------------------
  for (const s of doc.statements.filter((x) => x.kind === 'indicated-gap')) {
    for (const c of s.counts.filter((x) => ['exposed', 'issues'].includes(x.name))) if (!c.items.every((i) => claim(i)?.type === 'gap')) note('V04', `${s.id}: counts as a gap something that is not a reported gap`);
    for (const cid of s.subjects.controls) if (!gapIds.has(cid)) note('V04', `${s.id}: ${cid} is not a reported gap`);
    if (s.basis !== 'self-reported') note('V04', `${s.id}: an indicated gap rests on ${s.basis}, not on the responses`);
    if (WORDS.upgrade.test(words(s))) note('V04', `${s.id}: an indicated gap worded as verified, evidenced or established`);
  }
  for (const item of [...reg.reportedIssues.items, ...reg.recommendedActions.items]) if (!gapIds.has(item.control)) note('V04', `${item.id}: ${item.control} is not a reported gap`);

  // V05 unknown is not weak ----------------------------------------------------------------------------------------
  const unknown = (cid: string) => UNKNOWN_STATES.includes(controlState.get(cid) ?? '');
  for (const s of doc.statements.filter((x) => x.kind === 'indicated-gap')) {
    const controls = [...s.subjects.controls, ...s.counts.flatMap((c) => c.items).map(controlOf).filter((x): x is string => !!x)];
    for (const cid of controls) if (unknown(cid)) note('V05', `${s.id}: ${cid} (${controlState.get(cid)}) is presented as a gap`);
  }
  for (const item of [...reg.reportedIssues.items, ...reg.recommendedActions.items]) if (unknown(item.control)) note('V05', `${item.id}: an item for ${item.control} (${controlState.get(item.control)})`);
  for (const s of doc.statements.filter((x) => ['unresolved', 'outside-scope', 'coverage'].includes(x.kind))) if (WORDS.weakness.test(words(s))) note('V05', `${s.id}: an unresolved, unknown or out-of-scope matter worded as a weakness`);

  // V06 self-reported records honest -------------------------------------------------------------------------------
  for (const s of doc.statements) {
    const saidItems = s.counts.flatMap((c) => c.items).filter((i) => claim(i)?.type === 'records-said');
    if (saidItems.length && s.kind !== 'records-said') note('V06', `${s.id}: counts what the respondent said about records without saying so`);
    if (s.kind === 'records-said') {
      for (const c of s.counts.filter((x) => x.name === 'said')) if (!c.items.every((i) => claim(i)?.type === 'records-said')) note('V06', `${s.id}: counts as records said to exist something the respondent did not say`);
      if (!s.text.includes(REQUIRED_SENTENCES['R-ANALYSIS-RECORDS'])) note('V06', `${s.id}: does not say that MK has not seen the records`);
    }
  }
  for (const row of doc.layers.annex.controls) {
    const c = claim(`records-said:${row.id}`);
    if ((row.recordsSaid ?? null) !== (c?.outcome ?? null)) note('V06', `annex row ${row.id}: records said to exist shown as ${row.recordsSaid}, recorded as ${c?.outcome ?? null}`);
  }

  // V07 no conclusions ---------------------------------------------------------------------------------------------
  for (const s of doc.statements) {
    if (!(STANDARD_KINDS as readonly string[]).includes(s.kind)) note('V07', `${s.id}: kind ${s.kind} has no place in the standard report`);
    if (WORDS.conclusion.test(words(s))) note('V07', `${s.id}: conclusion wording in the standard report`);
  }

  // V08 no scoring -------------------------------------------------------------------------------------------------
  const walk = (node: unknown, path: string, visit: (key: string, path: string) => void) => {
    if (Array.isArray(node)) node.forEach((v, i) => walk(v, `${path}/${i}`, visit));
    else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) {
      visit(k, `${path}/${k}`);
      walk(v, `${path}/${k}`, visit);
    }
  };
  walk(doc, '', (k, path) => BANNED_KEYS.test(k) && note('V08', `field ${path}`));
  for (const s of doc.statements) if (WORDS.scoring.test(words(s))) note('V08', `${s.id}: scoring wording`);
  if (doc.status.scoring?.status !== 'withheld') note('V08', 'scoring is not withheld while the method is unapproved');

  // V09 counts conditional -----------------------------------------------------------------------------------------
  for (const s of doc.statements) {
    for (const c of s.counts) {
      if (!c.universe) note('V09', `${s.id}: count {${c.name}} has no universe`);
      if (!Number.isInteger(c.value) || c.value < 0) note('V09', `${s.id}: count {${c.name}} is not a count`);
    }
    if (WORDS.comparison.test(words(s))) note('V09', `${s.id}: comparison wording`);
  }
  for (const id of executiveIds) {
    const s = statements.get(id);
    for (const c of s?.counts ?? []) for (const name of [c.name, ...(c.universe ? [c.universe.name] : [])]) if (!(EXECUTIVE_COUNTS as readonly string[]).includes(name)) note('V09', `${id}: the executive brief may not use the count {${name}}`);
  }

  // V10 no implied ranking -----------------------------------------------------------------------------------------
  for (const s of doc.statements) if (WORDS.ranking.test(words(s))) note('V10', `${s.id}: ranking wording`);
  if (statements.get(reg.informationGathering.sequenceStatement)?.template !== 'register.info.sequence') note('V10', 'the information-gathering register does not state that it is a sequence, not a ranking');
  reg.informationGathering.items.forEach((item, i) => {
    if (item.sequenceMeaning !== SEQUENCE_MEANING) note('V10', `${item.id}: sequence meaning missing or changed`);
    if (item.sequence !== i + 1) note('V10', `${item.id}: sequence is not the position in the register`);
  });
  for (const [name, list] of [['reported issues', reg.reportedIssues], ['recommended actions', reg.recommendedActions]] as const) {
    if (list.ranked !== false || list.items.some((i) => i.ranked !== false)) note('V10', `the ${name} are marked as ranked`);
    for (let i = 1; i < list.items.length; i++) {
      const [a, b] = [list.items[i - 1], list.items[i]];
      const [aa, ba] = [areaOrder.get(a.area) as number, areaOrder.get(b.area) as number];
      if (aa > ba || (aa === ba && (controlOrder.get(a.control) as number) > (controlOrder.get(b.control) as number))) note('V10', `the ${name} are not in area and question order at position ${i + 1}`);
    }
  }
  if (statements.get(reg.reportedIssues.statement)?.template !== 'register.issues.intro') note('V10', 'the reported issues are not stated to be unranked');
  const indicatedAreas = doc.layers.executive.indicated.map((id) => statements.get(id)).filter((s) => s?.rule === 'R-IND-AREA').map((s) => areaOrder.get(s!.subjects.area!) as number);
  if (indicatedAreas.some((v, i) => i > 0 && v <= indicatedAreas[i - 1])) note('V10', 'the gaps indicated in the executive brief are not in area order');
  const scenarioSequence = doc.layers.analysis.scenarios.flatMap((a) => a.statements.map((id) => statements.get(id)?.subjects.scenarios[0])).filter((x): x is string => !!x).map((id) => [areaOrder.get(inp.scenarios[scenarioOrder.get(id) as number]?.domain) as number, scenarioOrder.get(id) as number]);
  if (scenarioSequence.some((v, i) => i > 0 && (v[0] < scenarioSequence[i - 1][0] || (v[0] === scenarioSequence[i - 1][0] && v[1] < scenarioSequence[i - 1][1])))) note('V10', 'the scenario analysis is not in area and method order');
  for (const s of doc.statements.filter((x) => x.layer !== 'annex')) if (s.slots.some((x) => x.field === 'tier')) note('V10', `${s.id}: shows a method tier outside the annex`);
  for (const row of doc.layers.annex.scenarios) if (row.tierMeaning !== TIER_MEANING) note('V10', `scenario ${row.id}: tier shown without its meaning`);

  // V11 status and release -----------------------------------------------------------------------------------------
  const st = doc.status;
  if (st.methodApproval !== inp.method?.approval) note('V11', 'method approval differs from the input');
  if (canonicalJson(st.basis) !== canonicalJson({ selfReported: true, evidenceReviewedByMK: false, responsesVerifiedByMK: false })) note('V11', 'the basis of the report is not stated as self-reported and unverified');
  if (st.interview?.status !== inp.interview?.status || (st.interview?.stopReason ?? null) !== (inp.interview?.stopReason ?? null)) note('V11', 'the interview status differs from the input');
  const criteria = st.release?.criteria ?? [];
  const criterionIds = criteria.map((c) => c.id);
  if (canonicalJson(criterionIds) !== canonicalJson([...STANDARD_RELEASE_CRITERIA])) note('V11', `release criteria are not the standard pathway's: ${criterionIds.join(', ')}`);
  const met = (id: string) => criteria.find((c) => c.id === id)?.met;
  if (met('interview-ended') !== (inp.interview?.status === 'ended')) note('V11', 'the interview criterion differs from the input');
  if (met('copy-approved') !== (copy.approved && doc.draft.copyApproved)) note('V11', 'the copy criterion differs from the copy table');
  if (met('real-record') !== false && (doc.draft.fictionalOnly || inp.organisation?.fictional)) note('V11', 'a fictional record is treated as a real one');
  const mustStayInternal = criteria.some((c) => !c.met) || criteria.length === 0;
  if (mustStayInternal && (st.release?.classification !== 'internal-interim' || st.release?.marking !== INTERIM_MARKING)) note('V11', 'a document that must stay internal is not classified and marked as internal interim');
  const statusRules = doc.layers.executive.status.map((id) => statements.get(id)?.rule);
  for (const rule of ['R-STATUS-BASIS', 'R-STATUS-METHOD', ...(mustStayInternal ? ['R-STATUS-MARKING'] : [])]) if (!statusRules.includes(rule)) note('V11', `the executive status lacks ${rule}`);
  const basisStatement = doc.layers.executive.status.map((id) => statements.get(id)).find((s) => s?.rule === 'R-STATUS-BASIS');
  if (basisStatement && !basisStatement.text.includes(REQUIRED_SENTENCES['R-STATUS-BASIS'])) note('V11', 'the basis statement does not say that MK has not reviewed evidence or verified responses');
  if (doc.draft.fictionalOnly !== true || inp.organisation?.fictional !== true) note('V11', 'Phase 2 documents are for fictional records only');

  // V12 layers kept apart ------------------------------------------------------------------------------------------
  const named = new Set<string>();
  for (const id of executiveIds) {
    const s = statements.get(id);
    if (!s) continue;
    if (s.layer !== 'executive') note('V12', `${id}: a ${s.layer} statement in the executive brief`);
    s.subjects.controls.forEach((c) => named.add(c));
  }
  if (named.size > EXECUTIVE_LIMITS.controls) note('V12', `the executive brief names ${named.size} individual controls; it may name ${EXECUTIVE_LIMITS.controls}`);
  const annexIds = doc.layers.annex.controls.map((r) => r.id);
  if (annexIds.length !== inputControls.length || annexIds.some((id, i) => id !== inputControls[i].id)) note('V12', 'the annex does not hold every control exactly once, in order');
  const answerClaims = ledger.claims.filter((c) => c.type === 'answer').map((c) => c.id).sort();
  if (canonicalJson(doc.layers.annex.answerHistory.map((r) => r.claim).sort()) !== canonicalJson(answerClaims)) note('V12', 'the annex answer history does not hold every answer version exactly once');
  const annexScenarios = doc.layers.annex.scenarios.map((r) => r.id);
  if (annexScenarios.length !== inp.scenarios.length || annexScenarios.some((id, i) => id !== inp.scenarios[i].id)) note('V12', 'the annex does not hold every scenario exactly once, in order');

  // V13 everything accounted for -----------------------------------------------------------------------------------
  const requested = new Map<string, number>();
  for (const item of reg.informationGathering.items) requested.set(item.control, (requested.get(item.control) ?? 0) + 1);
  for (const w of inp.openWork.waiting) if (requested.get(w.id) !== 1) note('V13', `waiting item ${w.id} appears ${requested.get(w.id) ?? 0} times in the information-gathering register`);
  const analysisStatements = doc.layers.analysis.areas.flatMap((a) => a.statements).map((id) => statements.get(id)).filter((s): s is Statement => !!s);
  const count = (list: { control: string }[], cid: string) => list.filter((i) => i.control === cid).length;
  for (const g of inp.findings.reportedGaps) {
    if (analysisStatements.filter((s) => s.rule === 'R-ANALYSIS-ISSUE' && s.subjects.controls.includes(g.id)).length !== 1) note('V13', `reported gap ${g.id} is not in the management analysis exactly once`);
    if (count(reg.reportedIssues.items, g.id) !== 1) note('V13', `reported gap ${g.id} is not in the reported issues exactly once`);
    if (count(reg.recommendedActions.items, g.id) !== 1) note('V13', `reported gap ${g.id} has no single recommended action or withheld action`);
  }
  for (const a of reg.recommendedActions.items) {
    const issue = reg.reportedIssues.items.find((i) => i.id === a.issue);
    if (!issue || issue.control !== a.control) note('V13', `${a.id}: not linked to the reported issue for ${a.control}`);
  }
  const scenarioCovered = new Set(doc.layers.analysis.scenarios.flatMap((a) => a.statements).flatMap((id) => statements.get(id)?.subjects.scenarios ?? []));
  for (const s of inp.scenarios) if (!scenarioCovered.has(s.id)) note('V13', `scenario ${s.id} is missing from the scenario analysis`);
  for (const id of doc.layers.analysis.scenarios.flatMap((a) => a.statements)) {
    const s = statements.get(id);
    const sc = s?.subjects.scenarios[0] ? inp.scenarios[scenarioOrder.get(s.subjects.scenarios[0]) as number] : null;
    if (s && sc && !s.template.startsWith(`scenario.${sc.status}`)) note('V13', `${id}: worded as ${s.template}, but scenario ${sc.id} is ${sc.status}`);
  }
  const decisionStatements = new Set(reg.decisions.items.map((d) => d.statement));
  for (const id of doc.layers.executive.decisions) if (!decisionStatements.has(id)) note('V13', `decision ${id} is not in the management decisions register`);

  // V14 provenance honest ------------------------------------------------------------------------------------------
  for (const r of doc.layers.annex.answerHistory) {
    const expected = r.source ? SOURCE_LABEL[r.source] ?? SOURCE_NOT_RECORDED : SOURCE_NOT_RECORDED;
    if (r.sourceLabel !== expected) note('V14', `answer ${r.claim}: shown as "${r.sourceLabel}", recorded as ${r.source ?? 'not recorded'}`);
    const c = claim(r.claim);
    if (c && (c.value.source ?? null) !== r.source) note('V14', `answer ${r.claim}: source differs from the input`);
    if (c && r.current !== c.pointer.endsWith('/answer')) note('V14', `answer ${r.claim}: shown as ${r.current ? 'current' : 'earlier'}`);
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
  for (const s of doc.statements.filter((x) => x.rule === 'R-ANALYSIS-ISSUE' || x.rule === 'R-REGISTER-ISSUE')) {
    const cid = s.subjects.controls[0];
    const current = controlById.get(cid)?.answer;
    const slot = s.slots.find((x) => x.name === 'answer');
    const a = slot ? claim(slot.claim) : undefined;
    if (!a || !a.pointer.endsWith('/answer') || a.subject.control !== cid) note('V14', `${s.id}: the answer quoted is not the current answer for ${cid}`);
    const isCorrection = current?.source === 'respondent-correction';
    if (isCorrection !== s.template.endsWith('.corrected')) note('V14', `${s.id}: ${isCorrection ? 'a correction not shown as one' : 'shown as a correction, but it is not one'}`);
  }
  for (const i of reg.reportedIssues.items) {
    const current = controlById.get(i.control)?.answer;
    if (!current || i.answerVersion !== current.version || i.corrected !== (current.source === 'respondent-correction')) note('V14', `${i.id}: answer version or correction differs from the input`);
  }

  // V15 deterministic ----------------------------------------------------------------------------------------------
  try {
    if (canonicalJson(ctx.rebuild()) !== canonicalJson(doc)) note('V15', 'building again gives a different document');
  } catch (error) {
    note('V15', `building again failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  // V16 pathway boundary -------------------------------------------------------------------------------------------
  if (doc.pathway !== STANDARD_PATHWAY) note('V16', `the document is not the standard pathway (${doc.pathway})`);
  for (const id of cited) if (claim(id)?.pathway === 'advisory') note('V16', `cites the Advisory claim ${id}`);
  walk(doc, '', (k, path) => ADVISORY_KEYS.test(k) && note('V16', `Advisory field ${path}`));
  for (const s of doc.statements) if (WORDS.verification.test(words(s))) note('V16', `${s.id}: evidence-review or verification wording`);
  for (const c of criteria) if (/review|reviewer|evidence|identity|advisory/i.test(c.id)) note('V16', `release depends on an Advisory matter: ${c.id}`);

  // V17 coverage kept distinct -------------------------------------------------------------------------------------
  const exCoverage = doc.layers.executive.coverage.map((id) => statements.get(id)).filter((s): s is Statement => !!s);
  const routing = exCoverage.filter((s) => s.rule === 'R-COVERAGE-ROUTING');
  const stop = inp.interview?.status !== 'ended' ? 'open' : ['ceiling', 'respondent', 'plan'].includes(inp.interview?.stopReason) ? inp.interview.stopReason : 'ended';
  if (routing.length !== 1) note('V17', `the executive brief has ${routing.length} explanations of adaptive routing; it needs one`);
  else {
    if (routing[0].template !== `coverage.routing.${stop}`) note('V17', `the routing explanation is ${routing[0].template}; the interview calls for coverage.routing.${stop}`);
    if (!routing[0].text.includes(REQUIRED_SENTENCES['R-COVERAGE-ROUTING'])) note('V17', 'the routing explanation does not say that an unasked control is not a finding');
  }
  if (doc.layers.analysis.coverage.routing !== routing[0]?.id) note('V17', 'the coverage analysis does not refer to the routing explanation');
  const categoryOf = (cid: string | undefined) => (cid ? coverageCategoryOf(controlState.get(cid) ?? '') : null);
  const seenRows = new Set<string>();
  for (const { category, states } of COVERAGE_CATEGORIES) {
    const expected = inputControls.filter((c) => (states as readonly string[]).includes(c.state)).map((c) => c.id).sort();
    const rule = `R-COVERAGE-${category.toUpperCase()}`;
    const found = exCoverage.filter((s) => s.rule === rule);
    if (expected.length && found.length !== 1) note('V17', `the category ${category} (${expected.length} controls) has ${found.length} statements in the executive brief; it needs one of its own`);
    if (!expected.length && found.length) note('V17', `the empty category ${category} has a statement`);
    for (const s of found) {
      const main = s.counts[0];
      if (!main || canonicalJson(main.items.map(controlOf).sort()) !== canonicalJson(expected)) note('V17', `${s.id}: the count for ${category} is not exactly the controls in that category`);
      if (!s.template.startsWith(`coverage.${category}`)) note('V17', `${s.id}: ${category} worded as ${s.template}`);
    }
    const rows = doc.layers.analysis.coverage.rows.filter((r) => r.category === category);
    if ((expected.length ? 1 : 0) !== rows.length || (rows[0] && canonicalJson([...rows[0].controls].sort()) !== canonicalJson(expected))) note('V17', `the coverage analysis does not hold the category ${category} exactly`);
    for (const r of rows) for (const cid of r.controls) {
      if (seenRows.has(cid)) note('V17', `${cid} is in more than one coverage category`);
      seenRows.add(cid);
    }
  }
  if (seenRows.size !== inputControls.length) note('V17', `the coverage categories hold ${seenRows.size} of ${inputControls.length} controls`);
  for (const s of doc.statements.filter((x) => x.rule.startsWith('R-COVERAGE-') || x.rule.startsWith('R-AREA-COVERAGE-'))) {
    for (const c of s.counts.filter((x) => !['waitingScope', 'unassigned'].includes(x.name))) {
      const cats = new Set(c.items.map((i) => categoryOf(controlOf(i))));
      if (cats.size > 1) note('V17', `${s.id}: the count {${c.name}} merges the categories ${[...cats].join(', ')}`);
    }
  }
  for (const area of doc.layers.analysis.areas) {
    const inArea = inputControls.filter((c) => c.domain.id === area.area).map((c) => c.id).sort();
    const counted = area.statements.map((id) => statements.get(id)).filter((s): s is Statement => !!s && s.rule.startsWith('R-AREA-COVERAGE-')).flatMap((s) => s.counts[0]?.items.map(controlOf) ?? []).sort();
    if (canonicalJson(counted) !== canonicalJson(inArea)) note('V17', `the coverage of area ${area.area} does not account for each of its controls once`);
  }

  // V18 recommended actions grounded -------------------------------------------------------------------------------
  const ACTION_TEMPLATE: Record<string, string> = { 'anchored-level': 'action.anchored', 'practice-option': 'action.practice', 'choice-options': 'action.choice' };
  const ACTION_SLOT: Record<string, [string, string]> = { 'anchored-level': ['inPlace', 'inPlace.description'], 'practice-option': ['inPlaceAnswers', 'inPlace.answers[].label'], 'choice-options': ['inPlaceAnswers', 'inPlace.answers[].label'] };
  for (const a of reg.recommendedActions.items) {
    const s = statements.get(a.statement);
    if (!s) continue;
    const m = claim(`method:${a.control}`);
    const p = m?.value?.inPlace ?? null;
    const quotable = !!p && !!ACTION_TEMPLATE[p.kind] && (p.kind !== 'anchored-level' || !!p.description);
    if (a.ranked !== false || a.status !== 'for management consideration') note('V18', `${a.id}: not unranked and for management consideration`);
    if (!s.claims.includes(`gap:${a.control}`)) note('V18', `${a.id}: does not cite the reported gap`);
    if (a.source === 'draft-method-in-place') {
      if (!quotable) note('V18', `${a.id}: a recommended action where the draft method gives no description to restate`);
      else {
        if (s.template !== ACTION_TEMPLATE[p.kind]) note('V18', `${a.id}: worded as ${s.template}; the method content calls for ${ACTION_TEMPLATE[p.kind]}`);
        const [name, field] = ACTION_SLOT[p.kind];
        const slot = s.slots.find((x) => x.name === name);
        if (!slot || slot.claim !== m!.id || slot.field !== field || slot.value !== fieldOf(m!.value, field)) note('V18', `${a.id}: does not quote the draft method's description of the practice in place`);
      }
      if (s.kind !== 'method-practice' || s.basis !== 'method') note('V18', `${a.id}: a recommended action not marked as resting on the method`);
    } else if (a.source === 'withheld') {
      if (quotable) note('V18', `${a.id}: withheld although the draft method gives a description to restate`);
      if (s.template !== 'action.withheld' || s.kind !== 'withheld') note('V18', `${a.id}: a withheld action not worded as withheld`);
    } else note('V18', `${a.id}: unknown source ${(a as any).source}`);
  }
  const intro = statements.get(reg.recommendedActions.statement);
  if (!intro || intro.template !== 'register.actions.intro' || !intro.text.includes(REQUIRED_SENTENCES['R-REGISTER-ACTIONS'])) note('V18', 'the recommended actions are not introduced with their qualification');
  const issuesIntro = statements.get(reg.reportedIssues.statement);
  if (!issuesIntro || !issuesIntro.text.includes(REQUIRED_SENTENCES['R-REGISTER-ISSUES'])) note('V18', 'the reported issues are not introduced as unverified responses');
  for (const s of doc.statements) if (WORDS.evidenceRequest.test(words(s))) note('V18', `${s.id}: generic remediation or an evidence request`);
  for (const item of reg.reportedIssues.items) if (statements.get(item.statement)?.kind !== 'indicated-gap') note('V18', `${item.id}: a reported issue not worded as a gap indicated by the responses`);

  // V19 executive brief concise ------------------------------------------------------------------------------------
  const sectionOf = new Map<string, string[]>();
  for (const section of EXECUTIVE_SECTIONS) for (const id of doc.layers.executive[section] ?? []) sectionOf.set(id, [...(sectionOf.get(id) ?? []), section]);
  for (const [id, sections] of sectionOf) {
    if (sections.length > 1) note('V19', `${id} appears ${sections.length} times in the executive brief (${sections.join(', ')})`);
    const s = statements.get(id);
    if (s && s.section !== sections[0]) note('V19', `${id}: a ${s.section} statement placed under ${sections[0]}`);
  }
  if (executiveIds.length > EXECUTIVE_LIMITS.statements) note('V19', `the executive brief has ${executiveIds.length} statements; the limit is ${EXECUTIVE_LIMITS.statements}`);
  const texts = new Map<string, number>();
  for (const id of new Set(executiveIds)) {
    const t = statements.get(id)?.text;
    if (t) texts.set(t, (texts.get(t) ?? 0) + 1);
  }
  for (const [t, n] of texts) if (n > 1) note('V19', `the same sentence appears ${n} times in the executive brief: ${t.slice(0, 60)}`);
  const perArea = new Map<string, number>();
  for (const id of doc.layers.executive.indicated) {
    const s = statements.get(id);
    if (s?.rule === 'R-IND-AREA') perArea.set(s.subjects.area!, (perArea.get(s.subjects.area!) ?? 0) + 1);
  }
  for (const [area, n] of perArea) if (n > 1) note('V19', `area ${area} has ${n} statements of gaps indicated in the executive brief`);

  // V20 judgements withheld ----------------------------------------------------------------------------------------
  const withheldRules = doc.layers.executive.withheld.map((id) => statements.get(id)).filter((s): s is Statement => !!s && s.kind === 'withheld').map((s) => s.rule);
  for (const rule of REQUIRED_WITHHELD) if (!withheldRules.includes(rule)) note('V20', `the executive brief does not withhold ${rule}`);
  for (const s of doc.statements) if (WORDS.judgement.test(words(s))) note('V20', `${s.id}: a judgement MK has not recorded`);
  for (const s of doc.statements.filter((x) => x.kind === 'withheld')) if (!(s.section === 'withheld' || s.rule === 'R-REGISTER-ACTION-WITHHELD')) note('V20', `${s.id}: a withheld statement outside the withheld section`);

  const results = CHECKS.map(([id, name]) => ({ id, name, passed: fail[id].length === 0, failures: fail[id].slice(0, 12) }));
  return { passed: results.every((r) => r.passed), results };
}
