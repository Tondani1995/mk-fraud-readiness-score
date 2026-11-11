// Phase 1 tests for the report engine: the claims ledger, the input gate, the validation checks and their mutation
// tests, robustness across several fictional sessions, and the end-to-end trace on the supplied fictional session.
// node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/readiness-review-report-engine-tests.mjs
//
// Fictional records only. Nothing here generates a customer report, stores anything or delivers anything.
// MK_REPORT_RESULTS=<file> writes the results; MK_REPORT_EXAMPLES_DIR=<dir> writes the trace and the draft example
// for MK review.
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.MK_READINESS_REVIEW_HARNESS = 'fictional-local';
const lib = (p) => import(path.join(ROOT, 'src/lib/readiness-review', p));
const { replay, commit, initialActions, ensureOwnerServed, newSessionRecord } = await lib('session.ts');
const { canonicalJson, canonicalDigest } = await lib('canonical.ts');
const { buildReportInput, reportInputDigest } = await lib('report-input.ts');
const { buildLedger, claimHolds, resolvePointer } = await lib('report/ledger.ts');
const { gateInput } = await lib('report/input-gate.ts');
const { buildDraftDocument } = await lib('report/draft-document.ts');
const { validateDocument, CHECKS } = await lib('report/validate.ts');
const { DRAFT_COPY, render } = await lib('report/draft-copy.ts');
const { executiveStatementIds, EXECUTIVE_CONTROL_LIMIT } = await lib('report/document.ts');

const results = [];
const T = async (id, name, fn) => {
  try {
    const [ok, detail] = await fn();
    results.push({ id, name, status: ok ? 'pass' : 'fail', detail });
  } catch (error) {
    results.push({ id, name, status: 'fail', detail: `threw: ${error && error.stack ? error.stack.split('\n').slice(0, 3).join(' | ') : error}` });
  }
};

// ------------------------------------------------------------------------------------------------ the supplied session
const fixture = JSON.parse(readFileSync(path.join(ROOT, 'scripts/fixtures/readiness-review-session-1.2.0.json'), 'utf8'));
const storeOf = (...records) => ({ load: async (id) => records.find((r) => r.sessionId === id) ?? null });
function prepare(record) {
  const input = buildReportInput(replay(record));
  return { record, input, ledger: buildLedger(input) };
}
async function documentFor(record) {
  const p = prepare(record);
  const gate = await gateInput(p.input, { store: storeOf(record) });
  const build = () => buildDraftDocument(p.input, buildLedger(p.input), gate);
  const doc = build();
  const validation = validateDocument({ doc, input: p.input, ledger: p.ledger, copy: DRAFT_COPY, gate, rebuild: build });
  return { ...p, gate, build, doc, validation };
}
const base = await documentFor(fixture.record);
const failedChecks = (v) => v.results.filter((r) => !r.passed).map((r) => r.id);

// ------------------------------------------------------------------------------------------------ more fictional sessions
let clock = Date.parse('2026-11-11T09:00:00Z');
const tick = () => new Date((clock += 1000)).toISOString();
const PROFILE = { 'PR-01': '50to250', 'PR-12': '50to250m', 'PR-02': 'private', 'PR-13': 'retail', 'PR-04': 'board', 'PR-03': 'no', 'PR-05': 'no', 'PR-06': 'no', 'PR-07': 'no', 'PR-08': 'yes', 'PR-09': 'no', 'PR-10': 'no', 'PR-11': 'yes' };
const tokens = () => ({ respondent: randomUUID(), management: randomUUID(), reviewer: randomUUID(), links: randomUUID(), owners: {} });
function newSession(label) {
  const record = newSessionRecord({ sessionId: randomUUID().replace(/-/g, ''), createdAt: tick(), organisationLabel: label, tokens: tokens() });
  const live = replay(record);
  live.record = { ...record, actions: initialActions(live, tick(), () => randomUUID()) };
  return live;
}
function act(live, action, actor = 'respondent') {
  const out = commit(live, action, actor, tick(), () => randomUUID());
  live.record = { ...live.record, actions: live.record.actions.concat(out) };
}
function strong(q) {
  if (q.id.startsWith('PR-')) return PROFILE[q.id] ?? q.options.find((o) => o[0] !== 'unknown')[0];
  if (q.id === '__assumptions__') return ['none'];
  if (q.format === 'practice') return 'full';
  if (q.format === 'anchored') return '4';
  if (q.format === 'multi') return q.subPractices ? Object.keys(q.subPractices) : [q.options[0][0]];
  if (q.format === 'choicePractice') return Object.keys(q.practiceMap).find((k) => q.practiceMap[k] === 'full') ?? Object.keys(q.practiceMap)[0];
  return (q.options.find((o) => o[0] === 'yes') || q.options[0])[0];
}
function pick(q, n) {
  if (q.id.startsWith('PR-') || q.id === '__assumptions__') return strong(q);
  if (n % 7 === 3) return q.format === 'multi' ? ['unknown'] : 'unknown';
  if (q.format === 'practice') return n % 5 === 0 ? 'partial' : n % 11 === 0 ? 'absent' : 'full';
  if (q.format === 'anchored') return n % 5 === 0 ? '2' : '4';
  if (q.format === 'choicePractice') return Object.keys(q.practiceMap).find((k) => q.practiceMap[k] === (n % 5 === 0 ? 'partial' : 'full')) ?? Object.keys(q.practiceMap)[0];
  return strong(q);
}
function interview(live, limit) {
  for (let n = 0; n < limit && live.respondentStep; n++) {
    const q = live.respondentStep.q;
    const detail = q.format === 'practice' && n % 9 === 4 ? { ev: 'yes' } : undefined;
    act(live, { type: 'respondent.answer', q: q.id, value: pick(q, n), ...(detail ? { detail } : {}) });
  }
}
function earlyStop() {
  const live = newSession('Fictional Early Stop Co');
  interview(live, 20);
  act(live, { type: 'respondent.stop' });
  return live.record;
}
function fullInterview() {
  const live = newSession('Fictional Full Interview Co');
  interview(live, 200);
  if (!live.engine.S.ended) act(live, { type: 'respondent.stop' });
  act(live, { type: 'organisation.sendToOwners' }, 'organisation');
  for (const fn of live.engine.FUNCTIONS) {
    live.record = { ...live.record, actions: live.record.actions.concat(ensureOwnerServed(live, fn, tick(), () => randomUUID())) };
    for (let k = 0; k < 3 && live.ownerSteps[fn]; k++) {
      const st = live.ownerSteps[fn];
      try { act(live, { type: 'owner.answer', fn, q: st.q.id, value: k === 1 ? (st.q.format === 'multi' ? ['unknown'] : 'unknown') : strong(st.q) }, 'owner'); } catch { break; }
    }
  }
  return live.record;
}
function reviewed() {
  const live = newSession('Fictional Reviewed Co');
  interview(live, 60);
  const e = live.engine;
  const practices = Object.keys(e.S.ans).filter((q) => e.QI[q]?.type === 'practice' && e.S.ans[q].via === 'respondent' && e.S.ans[q].cls && e.S.ans[q].v !== 'unknown');
  const states = ['requested', 'supplied', 'reviewed-sufficient', 'insufficient', 'contradicted', 'unavailable'];
  states.forEach((state, i) => act(live, { type: 'reviewer.evidence', q: practices[i], state, basis: `Fictional basis ${state}` }, 'reviewer'));
  ['confirmed', 'partly-confirmed', 'not-confirmed', 'disputed'].forEach((conclusion, i) => act(live, { type: 'reviewer.review', q: practices[6 + i], conclusion, basis: `Fictional review ${conclusion}`, followUp: i === 0 ? 'Fictional follow-up: obtain a sample' : '', limitation: '' }, 'reviewer'));
  act(live, { type: 'reviewer.review', q: practices[10], conclusion: null, basis: '', followUp: 'Fictional follow-up only', limitation: 'Fictional limitation' }, 'reviewer');
  // A correction after evidence was reviewed: that evidence is no longer current.
  const anchored = practices.find((q) => e.QI[q].format === 'anchored' && e.S.ans[q].v !== '0' && practices.indexOf(q) < 6) ?? null;
  if (anchored) act(live, { type: 'respondent.correct', q: anchored, value: '0' });
  return live.record;
}

// ------------------------------------------------------------------------------------------------ tests
await T('R-01', 'Claims ledger: every claim holds against the input, ids are unique and stable, every control and answer version is a claim, no claim carries independent validation', async () => {
  const { input, ledger } = base;
  const again = buildLedger(JSON.parse(JSON.stringify(input)));
  const controls = input.domains.flatMap((d) => d.controls);
  const versions = controls.reduce((n, c) => n + c.history.length + (c.answer ? 1 : 0), 0);
  const holding = ledger.claims.filter((c) => claimHolds(input, c)).length;
  const counts = ledger.claims.reduce((a, c) => ((a[c.type] = (a[c.type] || 0) + 1), a), {});
  const ok = holding === ledger.claims.length && again.digest === ledger.digest && counts.control === 902 && counts.answer === versions && counts.gap === input.findings.reportedGaps.length &&
    counts['waiting-item'] === input.openWork.waiting.length && !ledger.claims.some((c) => c.evidenceLevel === 'independently-validated') && ledger.claims.filter((c) => c.type === 'evidence').every((c) => c.evidenceLevel && c.attribution && c.attribution.identityVerified === false);
  return [ok, `${ledger.claims.length} claims, all holding ${holding === ledger.claims.length}; digest stable ${again.digest === ledger.digest} (${ledger.digest.slice(0, 12)}); ${counts.control} controls, ${counts.answer} answer versions, ${counts.gap} gaps, ${counts['waiting-item']} waiting items, ${counts.evidence ?? 0} evidence and ${counts.review ?? 0} review records, each attributed as unverified`];
});

await T('R-02', 'Input gate: accepts the fictional session rebuilt from its stored log; refuses another contract or version, scoring not withheld, a non-fictional record, an unexpected digest, a missing session, a changed log and a changed input', async () => {
  const { input, record } = base;
  const clone = () => JSON.parse(JSON.stringify(input));
  const mutated = (f) => { const x = clone(); f(x); return x; };
  const changedLog = { ...record, actions: record.actions.map((a, i) => (i === 3 ? { ...a, at: '2000-01-01T00:00:00.000Z' } : a)) };
  const cases = {
    accepted: (await gateInput(input, { store: storeOf(record), expectedDigest: reportInputDigest(input) })).ok === true,
    otherContract: (await gateInput(mutated((x) => (x.contract.name = 'something-else')))).ok === false,
    version100: (await gateInput(mutated((x) => (x.contract.version = '1.0.0')))).ok === false,
    version200: (await gateInput(mutated((x) => (x.contract.version = '2.0.0')))).ok === false,
    scoringNotWithheld: (await gateInput(mutated((x) => (x.method.scoring.status = 'computed')))).ok === false,
    notFictional: (await gateInput(mutated((x) => (x.organisation.fictional = false)))).ok === false,
    unexpectedDigest: (await gateInput(input, { expectedDigest: '0'.repeat(64) })).ok === false,
    missingSession: (await gateInput(input, { store: storeOf() })).ok === false,
    changedLog: (await gateInput(input, { store: storeOf(changedLog) })).ok === false,
    positionBeyondLog: (await gateInput(mutated((x) => (x.lineage.actionCount = record.actions.length + 1)), { store: storeOf(record) })).ok === false,
    changedInput: (await gateInput(mutated((x) => (x.domains[0].controls[0].text = 'Changed')), { store: storeOf(record) })).ok === false
  };
  const failed = Object.entries(cases).filter(([, v]) => !v).map(([k]) => k);
  return [failed.length === 0, `${Object.keys(cases).length} cases as expected${failed.length ? ` except ${failed.join(', ')}` : ''}; accepted with lineage "${base.gate.checks.find((c) => c.id === 'lineage').detail}"`];
});

await T('R-03', 'Fictional only and not connected: the draft builder refuses a record not marked fictional, and no application route, page or service imports the report engine', async () => {
  let refused = false;
  try { buildDraftDocument({ ...base.input, organisation: { ...base.input.organisation, fictional: false } }, base.ledger, base.gate); } catch { refused = true; }
  const importers = [];
  const walk = (dir) => { for (const f of readdirSync(dir)) { const p = path.join(dir, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx|mjs|js)$/.test(f) && /readiness-review\/report\/|from '\.\/report\//.test(readFileSync(p, 'utf8')) && !p.includes(path.join('readiness-review', 'report'))) importers.push(path.relative(ROOT, p)); } };
  walk(path.join(ROOT, 'src'));
  return [refused && importers.length === 0, `non-fictional record refused ${refused}; files under src importing the report engine: ${importers.length ? importers.join(', ') : 'none'}`];
});

await T('R-04', 'The draft document of the supplied fictional session passes all fifteen checks and is byte-identical when built again', async () => {
  const { doc, validation, build } = base;
  const again = build();
  const ok = validation.passed && canonicalJson(again) === canonicalJson(doc);
  return [ok, `${validation.results.filter((r) => r.passed).length} of ${validation.results.length} checks pass${validation.passed ? '' : ` (failed: ${failedChecks(validation).join(', ')})`}; ${doc.statements.length} statements; document digest ${canonicalDigest(doc).slice(0, 12)}, same on a second build ${canonicalJson(again) === canonicalJson(doc)}`];
});

await T('R-05', 'Robustness: draft documents of three other fictional sessions (an early stop, a full interview with owner answers, every evidence state and conclusion with a correction) pass every check', async () => {
  const sessions = { earlyStop: earlyStop(), fullInterview: fullInterview(), reviewed: reviewed() };
  const out = {};
  for (const [name, record] of Object.entries(sessions)) {
    const d = await documentFor(record);
    out[name] = { passed: d.validation.passed, failed: failedChecks(d.validation), statements: d.doc.statements.length, evidence: d.doc.layers.annex.evidence.length, executiveControls: new Set(executiveStatementIds(d.doc).flatMap((id) => d.doc.statements.find((s) => s.id === id).subjects.controls)).size, detail: d.validation.results.filter((r) => !r.passed).map((r) => `${r.id}: ${r.failures[0]}`) };
  }
  const ok = Object.values(out).every((o) => o.passed);
  return [ok, Object.entries(out).map(([k, o]) => `${k}: ${o.passed ? 'all pass' : `failed ${o.failed.join(', ')} (${o.detail.join('; ')})`}, ${o.statements} statements, ${o.evidence} reviewer records, ${o.executiveControls} controls named in the brief`).join('; ')];
});

// ------------------------------------------------------------------------------------------------ mutation tests
const clone = (x) => JSON.parse(JSON.stringify(x));
const find = (doc, pred) => doc.statements.find(pred);
const values = (s) => Object.fromEntries([...s.slots.map((x) => [x.name, x.value]), ...s.counts.flatMap((c) => [[c.name, c.value], ...(c.universe ? [[c.universe.name, c.universe.value]] : [])])]);
/** Changes a template in a copy table and re-renders every statement that uses it, so that only the wording differs. */
function withTemplate(doc, template, change) {
  const copy = clone(DRAFT_COPY);
  copy.templates[template] = change(copy.templates[template]);
  for (const s of doc.statements) if (s.template === template) s.text = render(copy.templates[template], values(s));
  return copy;
}
const gapControl = base.input.findings.reportedGaps[0].id;
const waitingControl = base.input.openWork.waiting[0].id;
const unaskedControl = base.input.domains.flatMap((d) => d.controls).find((c) => c.state === 'unconfirmed').id;
const practiceControl = base.input.domains.flatMap((d) => d.controls).find((c) => c.state === 'reported' && !c.issue).id;
const MUTATIONS = [
  ['M01', 'V01', 'the gate refused the input', async (m) => ({ gate: await gateInput({ ...m.input, contract: { ...m.input.contract, version: '2.0.0' } }) })],
  ['M02', 'V01', 'the document carries another input digest', (m) => { m.doc.lineage.inputDigest = '0'.repeat(64); }],
  ['M03', 'V02', 'a statement cites a claim that does not exist', (m) => { m.doc.statements[0].claims.push('control:NOT-A-CONTROL'); }],
  ['M04', 'V02', 'the input changed after the ledger was built', (m) => { const x = clone(m.input); const c = x.domains.flatMap((d) => d.controls).find((c) => c.id === gapControl); c.answer.label = 'Changed afterwards'; return { input: x }; }],
  ['M05', 'V03', 'a number in a text was changed', (m) => { const s = find(m.doc, (s) => s.rule === 'R-POS-EXPOSURE-AREA'); s.text = s.text.replace(/^([^:]+: )\d+/, '$1' + '99'); }],
  ['M06', 'V03', 'a slot value is not the claim value', (m) => { const s = find(m.doc, (s) => s.rule === 'R-EVIDENCE-ITEM'); s.slots[0].value = 'Another control'; s.text = render(DRAFT_COPY.templates[s.template], values(s)); }],
  ['M07', 'V03', 'a template that is not in the copy table', (m) => { m.doc.statements[0].template = 'not.a.template'; }],
  ['M08', 'V04', 'reported exposure worded as confirmed', (m) => ({ copy: withTemplate(m.doc, 'position.exposure.area', (t) => `${t} This has been verified.`) })],
  ['M09', 'V04', 'a reported practice presented as exposure', (m) => { find(m.doc, (s) => s.rule === 'R-ANALYSIS-EXPOSURE').subjects.controls.push(practiceControl); }],
  ['M10', 'V05', 'a waiting control presented as exposure', (m) => { find(m.doc, (s) => s.rule === 'R-ANALYSIS-EXPOSURE').subjects.controls = [waitingControl]; }],
  ['M11', 'V05', 'unresolved questions worded as a weakness', (m) => ({ copy: withTemplate(m.doc, 'position.unresolved', (t) => `${t} Each is a weakness.`) })],
  ['M12', 'V05', 'a remediation item for a control never asked', (m) => { m.doc.layers.register.remediation.items[0].control = unaskedControl; }],
  ['M13', 'V06', 'an evidence level above what the claims hold', (m) => { find(m.doc, (s) => s.rule === 'R-UNESTABLISHED-EVIDENCE').evidenceLevel = 'reviewed'; }],
  ['M14', 'V06', 'independent validation claimed', (m) => ({ copy: withTemplate(m.doc, 'evidence.reviewed-sufficient', (t) => `${t} It was independently validated.`) })],
  ['M15', 'V06', 'insufficient evidence worded as sufficient', (m) => { const s = find(m.doc, (s) => s.template === 'evidence.insufficient'); s.template = 'evidence.reviewed-sufficient'; s.text = render(DRAFT_COPY.templates[s.template], values(s)); }],
  ['M16', 'V06', 'evidence that is no longer current cited outside the annex', (m) => { const x = clone(m.input); const c = x.domains.flatMap((d) => d.controls).find((c) => c.evidence?.state === 'insufficient'); c.evidence.current = false; return { input: x, ledger: buildLedger(x) }; }],
  ['M17', 'V07', 'a conclusion the reviewer did not record', (m) => { const s = find(m.doc, (s) => s.rule === 'R-CONCLUSION-ITEM'); s.template = 'conclusion.disputed'; s.text = render(DRAFT_COPY.templates[s.template], values(s)); }],
  ['M18', 'V07', 'a conclusion without attribution', (m) => { delete find(m.doc, (s) => s.rule === 'R-CONCLUSION-ITEM').attribution; }],
  ['M19', 'V07', 'an unverified reviewer identity not marked', (m) => { find(m.doc, (s) => s.rule === 'R-CONCLUSION-ITEM').qualifiers = []; }],
  ['M20', 'V07', 'conclusion wording outside a reviewer conclusion', (m) => ({ copy: withTemplate(m.doc, 'position.evidence.summary', (t) => `${t} Most of it is confirmed.`) })],
  ['M21', 'V08', 'a score field', (m) => { m.doc.status.score = 3; }],
  ['M22', 'V08', 'percentage wording', (m) => ({ copy: withTemplate(m.doc, 'position.exposure.area', (t) => `${t} The share is shown per cent.`) })],
  ['M23', 'V08', 'scoring not withheld', (m) => { m.doc.status.scoring.status = 'computed'; }],
  ['M24', 'V09', 'a count without its universe', (m) => { find(m.doc, (s) => s.rule === 'R-POS-UNRESOLVED').counts[1].universe = null; }],
  ['M25', 'V09', 'areas compared', (m) => ({ copy: withTemplate(m.doc, 'position.exposure.area', (t) => `${t} That is more than in other areas.`) })],
  ['M26', 'V09', 'a count the executive brief may not use', (m) => { for (const s of m.doc.statements.filter((s) => s.rule === 'R-POS-EXPOSURE-AREA')) s.counts[0].universe.name = 'areaTotal'; return { copy: withTemplate(m.doc, 'position.exposure.area', (t) => t.replace('{asked}', '{areaTotal}')) }; }],
  ['M27', 'V10', 'ranking wording', (m) => ({ copy: withTemplate(m.doc, 'register.remediation.method', (t) => `${t} Top priority.`) })],
  ['M28', 'V10', 'remediation marked as ranked', (m) => { m.doc.layers.register.remediation.ranked = true; }],
  ['M29', 'V10', 'remediation reordered', (m) => { m.doc.layers.register.remediation.items.reverse(); }],
  ['M30', 'V10', 'the sequence statement removed', (m) => { m.doc.layers.register.informationGathering.sequenceStatement = m.doc.layers.register.remediation.unrankedStatement; }],
  ['M31', 'V10', 'a sequence presented as a priority', (m) => { m.doc.layers.register.informationGathering.items[0].sequenceMeaning = 'Priority order'; }],
  ['M32', 'V11', 'released while the review is incomplete', (m) => { m.doc.status.release = { classification: 'releasable', marking: '', reasons: [] }; }],
  ['M33', 'V11', 'the no-score statement removed', (m) => { m.doc.layers.executive.status = m.doc.layers.executive.status.filter((id) => find(m.doc, (s) => s.id === id).rule !== 'R-STATUS-SCORING'); }],
  ['M34', 'V11', 'the unverified identity statement removed', (m) => { m.doc.layers.executive.status = m.doc.layers.executive.status.filter((id) => find(m.doc, (s) => s.id === id).rule !== 'R-STATUS-IDENTITY'); }],
  ['M35', 'V12', 'the executive brief lists controls', (m) => { find(m.doc, (s) => s.rule === 'R-CONCLUDE-REPORTED').subjects.controls = m.input.findings.reportedGaps.slice(0, 11).map((g) => g.id); }],
  ['M36', 'V12', 'a control missing from the annex', (m) => { m.doc.layers.annex.controls.pop(); }],
  ['M37', 'V12', 'a register statement in the executive brief', (m) => { m.doc.layers.executive.canConclude.push(m.doc.layers.register.informationGathering.items[0].statement); }],
  ['M38', 'V13', 'an unresolved question dropped', (m) => { const items = m.doc.layers.register.informationGathering.items; items.splice(0, 1); items.forEach((it, i) => (it.sequence = i + 1)); }],
  ['M39', 'V13', 'a reported gap dropped from remediation', (m) => { m.doc.layers.register.remediation.items.splice(0, 1); }],
  ['M40', 'V13', 'a reviewer record dropped from the annex', (m) => { m.doc.layers.annex.evidence.splice(0, 1); }],
  ['M41', 'V13', 'a reviewer follow-up dropped', (m) => { m.doc.layers.register.reviewerFollowUps.items = []; }],
  ['M42', 'V14', 'an answer version shown with provenance it does not have', (m) => { m.doc.layers.annex.answerHistory[0].sourceLabel = 'correction'; }],
  ['M43', 'V14', 'an answer version missing from the history', (m) => { m.doc.layers.annex.answerHistory.splice(0, 1); }],
  ['M44', 'V15', 'building again gives something else', (m) => ({ rebuild: () => ({ ...clone(m.doc), lineage: { ...m.doc.lineage, asOf: new Date().toISOString() } }) })]
];

await T('R-06', `Mutation tests: each of ${MUTATIONS.length} injected faults makes its target check fail, and every one of the fifteen checks is targeted at least once`, async () => {
  const rows = [];
  for (const [id, target, what, apply] of MUTATIONS) {
    const m = { doc: clone(base.doc), input: base.input, ledger: base.ledger, copy: DRAFT_COPY, gate: base.gate };
    const over = (await apply(m)) ?? {};
    const ctx = { doc: m.doc, input: over.input ?? m.input, ledger: over.ledger ?? m.ledger, copy: over.copy ?? m.copy, gate: over.gate ?? m.gate, rebuild: over.rebuild ?? (() => m.doc) };
    const v = validateDocument(ctx);
    const failed = failedChecks(v);
    rows.push({ id, target, what, caught: failed.includes(target), alsoFailed: failed.filter((f) => f !== target) });
  }
  const missed = rows.filter((r) => !r.caught);
  const targeted = new Set(rows.map((r) => r.target));
  const allTargeted = CHECKS.every(([id]) => targeted.has(id));
  results.mutations = rows;
  return [missed.length === 0 && allTargeted, `${rows.length - missed.length} of ${rows.length} caught by their target check${missed.length ? `; missed: ${missed.map((r) => `${r.id} (${r.target})`).join(', ')}` : ''}; checks targeted ${targeted.size} of ${CHECKS.length}; caught by the target alone in ${rows.filter((r) => r.caught && !r.alsoFailed.length).length}`];
});

await T('R-07', 'Damaged provenance: a version whose log entry is missing is shown as "not recorded", passes the checks, and fails them if shown as a first answer', async () => {
  const live = replay(fixture.record);
  const cid = base.input.findings.reportedGaps[0].id;
  const rec = live.engine.S.ans[cid];
  live.engine.S.log = live.engine.S.log.filter((l) => !(l.q === cid && l.at === rec.at));
  const input = buildReportInput(live);
  const ledger = buildLedger(input);
  const gate = await gateInput(input);
  const build = () => buildDraftDocument(input, buildLedger(input), gate);
  const doc = build();
  const row = doc.layers.annex.answerHistory.find((r) => r.control === cid);
  const v = validateDocument({ doc, input, ledger, copy: DRAFT_COPY, gate, rebuild: build });
  const shownAsFirst = clone(doc);
  shownAsFirst.layers.annex.answerHistory.find((r) => r.control === cid).sourceLabel = 'answer';
  const v2 = validateDocument({ doc: shownAsFirst, input, ledger, copy: DRAFT_COPY, gate, rebuild: () => shownAsFirst });
  const ok = row.source === null && row.sourceLabel === 'how it was given is not recorded' && v.passed && failedChecks(v2).includes('V14');
  return [ok, `${cid} v${row.version}: source ${row.source}, shown as "${row.sourceLabel}"; checks ${v.passed ? 'all pass' : `failed ${failedChecks(v).join(', ')}`}; shown as a first answer instead: ${failedChecks(v2).join(', ')} fails`];
});

// ------------------------------------------------------------------------------------------------ the trace
await T('R-08', 'End-to-end trace on the supplied fictional session: a reported answer, through the input and the claims ledger, to the executive statements and the supporting evidence reference in the annex', async () => {
  const { record, input, ledger, doc } = base;
  const cid = 'D1-B-01';
  const action = record.actions.find((a) => a.type === 'respondent.answer' && a.q === cid);
  const d = input.domains.findIndex((x) => x.controls.some((c) => c.id === cid));
  const c = input.domains[d].controls.findIndex((x) => x.id === cid);
  const pointer = `/domains/${d}/controls/${c}`;
  const answer = resolvePointer(input, `${pointer}/answer`);
  const claimIds = [`control:${cid}`, `answer:${cid}:v${answer.version}`, `gap:${cid}`, `evidence:${cid}`];
  const claims = claimIds.map((id) => ledger.byId.get(id));
  const action2 = ledger.claims.find((x) => x.type === 'action' && x.value.type === 'address' && x.subject.control === cid);
  // Statements that rest on this answer, its gap or its evidence record; not those that count the control in a universe.
  const direct = claimIds.filter((id) => !id.startsWith('control:'));
  const cites = (s) => s.claims.some((id) => direct.includes(id)) || s.subjects.controls.includes(cid);
  const execIds = new Set(executiveStatementIds(doc));
  const exec = doc.statements.filter((s) => execIds.has(s.id) && cites(s));
  const analysis = doc.statements.filter((s) => s.layer === 'analysis' && s.subjects.controls.includes(cid));
  const remediation = doc.layers.register.remediation.items.find((i) => i.control === cid);
  const annexControl = doc.layers.annex.controls.find((r) => r.id === cid);
  const annexAnswer = doc.layers.annex.answerHistory.find((r) => r.control === cid);
  const annexEvidence = doc.layers.annex.evidence.find((r) => r.control === cid && r.record === 'evidence');
  const ok = !!action && action.value === answer.value && claims.every((x) => x && claimHolds(input, x)) && exec.length >= 2 && analysis.length >= 1 && remediation && annexControl && annexAnswer?.claim === claimIds[1] && annexEvidence?.claim === `evidence:${cid}`;
  results.trace = { cid, action, pointer, answer, claims, action2, exec, analysis, remediation, annexControl, annexAnswer, annexEvidence, statementsById: Object.fromEntries(doc.statements.map((s) => [s.id, s])) };
  return [ok, `log action #${action?.seq} (${action?.type}, value ${JSON.stringify(action?.value)}) → input ${pointer}/answer (version ${answer.version}, ${answer.source}) → ${claims.filter(Boolean).length} claims, all holding → ${exec.length} executive statements, ${analysis.length} analysis statements, remediation item ${remediation?.id}, annex rows for the control, the answer and the evidence record (${annexEvidence?.attribution.by}, ${annexEvidence?.at ?? annexEvidence?.attribution.at})`];
});

// ------------------------------------------------------------------------------------------------ examples for MK review
if (process.env.MK_REPORT_EXAMPLES_DIR && results.trace) {
  const dir = process.env.MK_REPORT_EXAMPLES_DIR;
  mkdirSync(dir, { recursive: true });
  const { doc, input } = base;
  const t = results.trace;
  const byId = t.statementsById;
  const line = (id) => `- ${byId[id].text}  \n  <sub>${byId[id].kind}${byId[id].evidenceLevel ? `, evidence level ${byId[id].evidenceLevel}` : ''}${byId[id].qualifiers.length ? `, ${byId[id].qualifiers.join(', ')}` : ''}; rule ${byId[id].rule}; template ${byId[id].template}; ${byId[id].claims.length} claims</sub>`;
  const e = doc.layers.executive;
  const brief = [
    '# Draft executive decision brief (fictional, for MK review)',
    '',
    `**${doc.status.release.marking}** Built by the Phase 1 draft builder (${doc.lineage.engine.version}) with draft copy ${doc.draft.copyVersion}, which MK has not approved, from the fictional 1.2.0 session "${input.organisation.label}". It is not a report. Every sentence below is a template filled only from cited claims; the small print under each gives its kind, rule, template and the number of claims it rests on. Document digest \`${canonicalDigest(doc)}\`; input digest \`${doc.lineage.inputDigest}\`; claims ledger digest \`${doc.lineage.ledgerDigest}\`.`,
    '',
    '## 1 Status of this report', '', ...e.status.map(line), '',
    '## 2 The position in five parts', '',
    '### Reported exposure', '', ...e.position.reportedExposure.map(line), '',
    '### Reviewed evidence', '', ...e.position.reviewedEvidence.map(line), '',
    doc.status.reviewerIdentity.verified ? '### Authorised reviewer conclusions' : '### Reviewer conclusions (reviewer identity not verified, so not yet attributable to an authorised reviewer)', '', ...e.position.reviewerConclusions.map(line), '',
    '### Unresolved questions', '', ...e.position.unresolved.map(line), '',
    '### Outside the assessment scope', '', ...e.position.outsideScope.map(line), '',
    '## 3 What management can reasonably conclude', '', ...e.canConclude.map(line), '',
    '## 4 What remains unestablished', '', ...e.unestablished.map(line), '',
    '## 5 Decisions requested of management', '', ...e.decisions.map(line), '',
    '## Layer 3 excerpts: action and accountability register', '',
    `**Information gathering** (${doc.layers.register.informationGathering.items.length} items). ${byId[doc.layers.register.informationGathering.sequenceStatement].text} First five:`, '',
    ...doc.layers.register.informationGathering.items.slice(0, 5).map((i) => `${i.sequence}. ${byId[i.statement].text}`), '',
    `**Remediation recommendations** (${doc.layers.register.remediation.items.length} items). ${byId[doc.layers.register.remediation.unrankedStatement].text} First five:`, '',
    ...doc.layers.register.remediation.items.slice(0, 5).map((i) => `- ${byId[i.statement].text}`), '',
    `**Reviewer follow-ups** (${doc.layers.register.reviewerFollowUps.items.length}). ${byId[doc.layers.register.reviewerFollowUps.statement].text}`, '',
    ...doc.layers.register.reviewerFollowUps.items.map((i) => `- ${byId[i.statement].text}`), '',
    `**Management decisions** (${doc.layers.register.decisions.items.length}): as in section 5 above.`, '',
    '## Layer 4: technical evidence annex (summary)', '',
    `${doc.layers.annex.controls.length} controls, ${doc.layers.annex.answerHistory.length} answer versions and ${doc.layers.annex.evidence.length} reviewer records, each row citing its claims. ${byId[doc.layers.annex.lineageStatement].text}`, '',
    '## Validation', '',
    ...base.validation.results.map((r) => `- ${r.id} ${r.name}: ${r.passed ? 'passed' : `failed (${r.failures.join('; ')})`}`), ''
  ].join('\n');
  writeFileSync(path.join(dir, 'fictional-executive-brief-draft.md'), brief);
  const pick = (c) => ({ id: c.id, type: c.type, pointer: c.pointer, value: c.value, ...(c.evidenceLevel ? { evidenceLevel: c.evidenceLevel, outcome: c.outcome } : {}), ...(c.attribution ? { attribution: c.attribution } : {}) });
  const trace = [
    `# End-to-end trace: “${t.annexControl.key}” (${t.cid}), fictional session`,
    '',
    `Fictional session "${input.organisation.label}" (contract 1.2.0 record, read through the historical reader), report input ${input.contract.version}, input digest \`${base.gate.digest}\`. Every step below is produced by \`scripts/readiness-review-report-engine-tests.mjs\` (test R-08) and checked: each claim holds against the input at its pointer, and each statement passes the fifteen checks.`,
    '',
    '## 1 The reported answer, in the stored answer log', '',
    '```json', JSON.stringify(t.action, null, 2), '```', '',
    '## 2 In the report input', '',
    `At \`${t.pointer}/answer\`:`, '', '```json', JSON.stringify(t.answer, null, 2), '```', '',
    '## 3 In the claims ledger', '',
    ...[...t.claims, t.action2].map((c) => ['```json', JSON.stringify(pick(c), null, 2), '```', '']).flat(),
    '## 4 The executive statements that rest on it', '',
    ...t.exec.map((s) => `- **${s.layer} / ${s.section}** (${s.kind}): ${s.text}  \n  rule ${s.rule}, template \`${s.template}\`; cites ${s.claims.includes(`gap:${t.cid}`) || s.claims.includes(`evidence:${t.cid}`) ? `\`${[`gap:${t.cid}`, `evidence:${t.cid}`].filter((x) => s.claims.includes(x)).join('`, `')}\` among ${s.claims.length} claims` : `${s.claims.length} claims`}${s.attribution ? `; attributed to ${s.attribution.by}, identity verified ${s.attribution.identityVerified}` : ''}`),
    '',
    '## 5 In the management analysis and the register', '',
    ...t.analysis.map((s) => `- **analysis / ${s.section}** (${s.kind}, evidence level ${s.evidenceLevel}): ${s.text}`),
    `- **remediation register** ${t.remediation.id} (unranked, ${t.remediation.status}): ${t.statementsById[t.remediation.statement].text}`,
    '',
    '## 6 The supporting evidence reference in the technical annex', '',
    '```json', JSON.stringify({ control: t.annexControl, answerVersion: t.annexAnswer, evidenceRecord: t.annexEvidence }, null, 2), '```', '',
    'What this trace shows: the executive statement says only that the respondent reported the practice as partly in place and that MK found the evidence supplied insufficient. It does not say the practice is weak, it does not rank it, and the reviewer\'s record is quoted with its attribution, marked unverified because reviewers do not yet sign in (B3).', ''
  ].join('\n');
  writeFileSync(path.join(dir, `fictional-trace-${t.cid}.md`), trace);
  writeFileSync(path.join(dir, 'fictional-draft-document.json'), JSON.stringify(doc, null, 1));
}

// ------------------------------------------------------------------------------------------------ results
const summary = results.reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {});
results.forEach((r) => console.log(`${r.id.padEnd(5)} ${r.status.padEnd(5)} ${r.name}\n        ${r.detail}`));
if (results.mutations) results.mutations.forEach((m) => console.log(`        ${m.id} ${m.target} ${m.caught ? 'caught' : 'MISSED'}: ${m.what}${m.alsoFailed.length ? ` (also ${m.alsoFailed.join(', ')})` : ''}`));
console.log(JSON.stringify(summary));
if (process.env.MK_REPORT_RESULTS) writeFileSync(process.env.MK_REPORT_RESULTS, JSON.stringify({ summary, results: results.map(({ id, name, status, detail }) => ({ id, name, status, detail })), mutations: results.mutations ?? [] }, null, 1));
process.exit(summary.fail ? 1 : 0);
