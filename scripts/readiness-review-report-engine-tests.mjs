// Phase 2 tests for the report engine: the standard (self-reported) report and the separate Advisory record.
// node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/readiness-review-report-engine-tests.mjs
//
// Fictional records only. Nothing here generates a customer report, stores anything or delivers anything.
// MK_REPORT_RESULTS=<file> writes the results; MK_REPORT_EXAMPLES_DIR=<dir> writes the fictional brief, management report,
// Advisory record and trace for MK review (with MK_PHASE1_DOCUMENT=<Phase 1 draft document JSON>, also the before-and-after
// comparison; with MK_REPORT_DOCUMENT_JSON=<file>, the full standard document); MK_REPORT_UPDATE_GOLDEN=1 rewrites the
// pinned golden digests (only with a deliberate change to the engine, the copy, the ledger or the input contract, recorded
// in the change log).
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.MK_READINESS_REVIEW_HARNESS = 'fictional-local';
const lib = (p) => import(path.join(ROOT, 'src/lib/readiness-review', p));
const { replay, commit, initialActions, ensureOwnerServed, newSessionRecord } = await lib('session.ts');
const { canonicalJson, canonicalDigest } = await lib('canonical.ts');
const { buildReportInput, reportInputDigest } = await lib('report-input.ts');
const { buildLedger, standardLedger, claimHolds, resolvePointer } = await lib('report/ledger.ts');
const { gateInput } = await lib('report/input-gate.ts');
const { buildStandardReport } = await lib('report/standard-report.ts');
const { validateDocument, CHECKS } = await lib('report/validate.ts');
const { STANDARD_COPY, render } = await lib('report/copy.ts');
const { executiveStatementIds, EXECUTIVE_SECTIONS, EXECUTIVE_LIMITS, COVERAGE_CATEGORIES } = await lib('report/document.ts');
const { buildAdvisoryRecord, validateAdvisoryRecord, ADVISORY_COPY, ADVISORY_CHECKS } = await lib('report/advisory-record.ts');

const GOLDEN_FILE = path.join(ROOT, 'scripts/fixtures/readiness-review-report-golden.json');
/** Phase 1 values for the supplied fictional session, recorded in REPORT-ENGINE-PHASE-1.md: the record they rest on must not change. */
const PHASE1 = { inputDigest: '75750947425e0253f1ce50c14ad78eedab3cb1283fb555ef4d46f967ef8e02e8', actionCount: 205 };

const results = [];
const T = async (id, name, fn) => {
  try {
    const [ok, detail] = await fn();
    results.push({ id, name, status: ok ? 'pass' : 'fail', detail });
  } catch (error) {
    results.push({ id, name, status: 'fail', detail: `threw: ${error && error.stack ? error.stack.split('\n').slice(0, 3).join(' | ') : error}` });
  }
};
const clone = (x) => JSON.parse(JSON.stringify(x));
const failedChecks = (v) => v.results.filter((r) => !r.passed).map((r) => r.id);
const storeOf = (...records) => ({ load: async (id) => records.find((r) => r.sessionId === id) ?? null });

async function documentFor(record) {
  const input = buildReportInput(replay(record));
  const ledger = buildLedger(input);
  const gate = await gateInput(input, { store: storeOf(record) });
  const build = () => buildStandardReport(input, buildLedger(input), gate);
  const doc = build();
  const validation = validateDocument({ doc, input, ledger, copy: STANDARD_COPY, gate, rebuild: build });
  const advisory = buildAdvisoryRecord(input, ledger, gate);
  const advisoryValidation = validateAdvisoryRecord(advisory, input, ledger);
  return { record, input, ledger, gate, build, doc, validation, advisory, advisoryValidation };
}

// ------------------------------------------------------------------------------------------------ golden sessions
// Fixed ids, links and clock, so every session is the same byte for byte on every run.
function deterministic(label) {
  let t = Date.parse('2026-11-11T08:00:00.000Z');
  let n = 0;
  const at = () => new Date((t += 1000)).toISOString();
  const newId = () => `${label.toLowerCase().replace(/[^a-z]+/g, '-')}-${String(++n).padStart(6, '0')}`;
  const link = (role) => createHash('sha256').update(`mk-report-golden-${label}-${role}`).digest('base64url').slice(0, 24);
  const record = newSessionRecord({ sessionId: createHash('sha256').update(label).digest('hex').slice(0, 30), createdAt: at(), organisationLabel: label, tokens: { respondent: link('respondent'), management: link('management'), reviewer: link('reviewer'), links: link('links'), owners: {} } });
  const live = replay(record);
  live.record = { ...record, actions: initialActions(live, at(), newId) };
  const act = (action, actor = 'respondent') => {
    live.record = { ...live.record, actions: live.record.actions.concat(commit(live, action, actor, at(), newId)) };
  };
  const serve = (fn) => {
    live.record = { ...live.record, actions: live.record.actions.concat(ensureOwnerServed(live, fn, at(), newId)) };
  };
  return { live, act, serve };
}
const PROFILE = { 'PR-01': '50to250', 'PR-12': '50to250m', 'PR-02': 'private', 'PR-13': 'retail', 'PR-04': 'board', 'PR-03': 'no', 'PR-05': 'no', 'PR-06': 'no', 'PR-07': 'no', 'PR-08': 'yes', 'PR-09': 'no', 'PR-10': 'no', 'PR-11': 'yes' };
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
  if (q.format === 'anchored') return n % 5 === 0 ? '2' : n % 11 === 0 ? '0' : '4';
  if (q.format === 'choicePractice') return Object.keys(q.practiceMap).find((k) => q.practiceMap[k] === (n % 5 === 0 ? 'partial' : n % 11 === 0 ? 'absent' : 'full')) ?? Object.keys(q.practiceMap)[0];
  return strong(q);
}
function interview(s, limit) {
  for (let n = 0; n < limit && s.live.respondentStep; n++) {
    const q = s.live.respondentStep.q;
    const detail = q.format === 'practice' && n % 9 === 4 ? { ev: 'yes' } : q.format === 'anchored' && n % 13 === 6 ? { ev: 'partly' } : undefined;
    s.act({ type: 'respondent.answer', q: q.id, value: pick(q, n), ...(detail ? { detail } : {}) });
  }
}
const practicesAnswered = (e) => Object.keys(e.S.ans).filter((q) => e.QI[q]?.type === 'practice' && e.S.ans[q].via === 'respondent' && e.S.ans[q].cls && e.S.ans[q].v !== 'unknown');

const GOLDEN = {
  earlyStop() {
    const s = deterministic('Fictional Early Stop Co');
    interview(s, 20);
    s.act({ type: 'respondent.stop' });
    return s.live.record;
  },
  fullInterview() {
    const s = deterministic('Fictional Full Interview Co');
    interview(s, 200);
    if (!s.live.engine.S.ended) s.act({ type: 'respondent.stop' });
    s.act({ type: 'organisation.sendToOwners' }, 'organisation');
    for (const fn of s.live.engine.FUNCTIONS) {
      s.serve(fn);
      for (let k = 0; k < 3 && s.live.ownerSteps[fn]; k++) {
        const st = s.live.ownerSteps[fn];
        try { s.act({ type: 'owner.answer', fn, q: st.q.id, value: k === 1 ? (st.q.format === 'multi' ? ['unknown'] : 'unknown') : strong(st.q) }, 'owner'); } catch { break; }
      }
    }
    return s.live.record;
  },
  advisory() {
    // Every evidence state and conclusion, a disputed conclusion, a review with a follow-up and no conclusion
    // (incomplete), and a correction after evidence was reviewed (that evidence becomes stale).
    const s = deterministic('Fictional Advisory Records Co');
    interview(s, 60);
    const e = s.live.engine;
    const practices = practicesAnswered(e);
    ['requested', 'supplied', 'reviewed-sufficient', 'insufficient', 'contradicted', 'unavailable'].forEach((state, i) => s.act({ type: 'reviewer.evidence', q: practices[i], state, basis: `Fictional basis ${state}` }, 'reviewer'));
    ['confirmed', 'partly-confirmed', 'not-confirmed', 'disputed'].forEach((conclusion, i) => s.act({ type: 'reviewer.review', q: practices[6 + i], conclusion, basis: `Fictional review ${conclusion}`, followUp: i === 0 ? 'Fictional follow-up: obtain a sample' : '', limitation: i === 2 ? 'Fictional limitation: one site only' : '' }, 'reviewer'));
    s.act({ type: 'reviewer.review', q: practices[10], conclusion: null, basis: '', followUp: 'Fictional follow-up only', limitation: '' }, 'reviewer');
    s.act({ type: 'reviewer.review', q: practices[11], conclusion: null, basis: '', followUp: 'Fictional follow-up, later superseded', limitation: '' }, 'reviewer');
    const anchored = practices.slice(0, 6).find((q) => e.QI[q].format === 'anchored' && e.S.ans[q].v !== '0') ?? null;
    if (anchored) s.act({ type: 'respondent.correct', q: anchored, value: '0' });
    const reviewedThenCorrected = practices[6 + 3];
    if (reviewedThenCorrected) s.act({ type: 'respondent.correct', q: reviewedThenCorrected, value: e.QI[reviewedThenCorrected].format === 'anchored' ? '1' : 'partial' });
    const incompleteThenCorrected = practices[11];
    if (incompleteThenCorrected) s.act({ type: 'respondent.correct', q: incompleteThenCorrected, value: e.QI[incompleteThenCorrected].format === 'anchored' ? '1' : 'partial' });
    return s.live.record;
  },
  corrections() {
    // Corrections both ways: a practice reported in place corrected to a gap, and a gap corrected to in place.
    const s = deterministic('Fictional Corrections Co');
    interview(s, 45);
    const e = s.live.engine;
    const practices = practicesAnswered(e);
    const full = practices.filter((q) => e.S.ans[q].cls === 'full' && ['practice', 'anchored'].includes(e.QI[q].format)).slice(0, 2);
    const gaps = practices.filter((q) => ['partial', 'absent'].includes(e.S.ans[q].cls) && ['practice', 'anchored'].includes(e.QI[q].format)).slice(0, 1);
    for (const q of full) s.act({ type: 'respondent.correct', q, value: e.QI[q].format === 'anchored' ? '2' : 'partial' });
    for (const q of gaps) s.act({ type: 'respondent.correct', q, value: e.QI[q].format === 'anchored' ? '4' : 'full' });
    return s.live.record;
  },
  routes() {
    // Targeted answers that reach the scenario states the other sessions do not: a scenario with one route settled and a
    // further route whose deciding fact is "don't know" (route-incomplete), and a governance practice reported absent,
    // which precludes the practices that depend on it.
    const s = deterministic('Fictional Routes Co');
    const over = { 'PR-06': 'unknown', 'PR-01': 'lt50', 'PR-12': 'unknown', 'D2-G-01': 'none', 'D4-A-07': '2', 'D4-M-13': ['none'], 'D5-V-13': ['none'] };
    for (let n = 0; n < 95 && s.live.respondentStep; n++) {
      const q = s.live.respondentStep.q;
      s.act({ type: 'respondent.answer', q: q.id, value: over[q.id] ?? strong(q) });
    }
    return s.live.record;
  },
  strong() {
    // Every practice reported in place: no gap is indicated, so the brief says so and recommends nothing.
    const s = deterministic('Fictional All In Place Co');
    for (let n = 0; n < 95 && s.live.respondentStep; n++) s.act({ type: 'respondent.answer', q: s.live.respondentStep.q.id, value: strong(s.live.respondentStep.q) });
    if (!s.live.engine.S.ended) s.act({ type: 'respondent.stop' });
    return s.live.record;
  },
  openInterview() {
    // An interview still in progress: the report may be built, and says so; it cannot be released.
    const s = deterministic('Fictional Open Interview Co');
    interview(s, 30);
    return s.live.record;
  }
};

const fixture = JSON.parse(readFileSync(path.join(ROOT, 'scripts/fixtures/readiness-review-session-1.2.0.json'), 'utf8'));
const sessions = { supplied: fixture.record, ...Object.fromEntries(Object.entries(GOLDEN).map(([k, f]) => [k, f()])) };
const built = {};
for (const [name, record] of Object.entries(sessions)) built[name] = await documentFor(record);
const base = built.supplied;
const byIdOf = (doc) => new Map(doc.statements.map((s) => [s.id, s]));

// ------------------------------------------------------------------------------------------------ tests
await T('R-01', 'Claims ledger: every claim holds against the input, ids are unique and stable, every claim belongs to a pathway, and evidence and reviewer records are Advisory claims', async () => {
  const { input, ledger } = base;
  const again = buildLedger(clone(input));
  const holding = ledger.claims.filter((c) => claimHolds(input, c)).length;
  const counts = ledger.claims.reduce((a, c) => ((a[c.type] = (a[c.type] || 0) + 1), a), {});
  const advisory = ledger.claims.filter((c) => c.pathway === 'advisory');
  const misplaced = ledger.claims.filter((c) => (['evidence', 'review', 'earlier-evidence', 'earlier-review', 'advisory.review-status', 'advisory.evidence-states'].includes(c.type)) !== (c.pathway === 'advisory'));
  const std = standardLedger(ledger);
  const ok = holding === ledger.claims.length && again.digest === ledger.digest && counts.control === 902 && counts['method.content'] === input.domains.flatMap((d) => d.controls).filter((c) => c.method).length && misplaced.length === 0 && std.claims.every((c) => c.pathway === 'standard') && !ledger.claims.some((c) => c.evidenceLevel === 'independently-validated');
  return [ok, `${ledger.claims.length} claims, all holding ${holding === ledger.claims.length}; digest stable ${again.digest === ledger.digest} (${ledger.digest.slice(0, 12)}); ${counts.control} controls, ${counts['method.content']} with the method's own content, ${counts.answer} answer versions, ${counts.gap} gaps; ${advisory.length} Advisory claims (${[...new Set(advisory.map((c) => c.type))].join(', ')}), ${std.claims.length} standard claims; misplaced ${misplaced.length}`];
});

await T('R-02', 'Input gate: accepts 1.2.x rebuilt from its stored log; refuses 1.1.0 and 2.0.0, another contract, scoring not withheld, a non-fictional record, an unexpected digest, a missing session, a changed log and a changed input', async () => {
  const { input, record } = base;
  const mutated = (f) => { const x = clone(input); f(x); return x; };
  const changedLog = { ...record, actions: record.actions.map((a, i) => (i === 3 ? { ...a, at: '2000-01-01T00:00:00.000Z' } : a)) };
  const cases = {
    accepted: (await gateInput(input, { store: storeOf(record), expectedDigest: reportInputDigest(input) })).ok === true,
    otherContract: (await gateInput(mutated((x) => (x.contract.name = 'something-else')))).ok === false,
    version110: (await gateInput(mutated((x) => (x.contract.version = '1.1.0')))).ok === false,
    version200: (await gateInput(mutated((x) => (x.contract.version = '2.0.0')))).ok === false,
    scoringNotWithheld: (await gateInput(mutated((x) => (x.method.scoring.status = 'computed')))).ok === false,
    notFictional: (await gateInput(mutated((x) => (x.organisation.fictional = false)))).ok === false,
    unexpectedDigest: (await gateInput(input, { expectedDigest: '0'.repeat(64) })).ok === false,
    missingSession: (await gateInput(input, { store: storeOf() })).ok === false,
    changedLog: (await gateInput(input, { store: storeOf(changedLog) })).ok === false,
    changedMethodContent: (await gateInput(mutated((x) => (x.domains[0].controls.find((c) => c.method).method.risks = [])), { store: storeOf(record) })).ok === false
  };
  const failed = Object.entries(cases).filter(([, v]) => !v).map(([k]) => k);
  return [failed.length === 0, `${Object.keys(cases).length} cases as expected${failed.length ? ` except ${failed.join(', ')}` : ''}; accepted with lineage "${base.gate.checks.find((c) => c.id === 'lineage').detail}"`];
});

await T('R-03', 'Fictional only and not connected: both builders refuse a record not marked fictional; nothing under src outside the engine imports it; the standard builder does not import the Advisory record', async () => {
  const notFictional = { ...base.input, organisation: { ...base.input.organisation, fictional: false } };
  let refusedStandard = false;
  let refusedAdvisory = false;
  try { buildStandardReport(notFictional, base.ledger, base.gate); } catch { refusedStandard = true; }
  try { buildAdvisoryRecord(notFictional, base.ledger, base.gate); } catch { refusedAdvisory = true; }
  const importers = [];
  const walk = (dir) => { for (const f of readdirSync(dir)) { const p = path.join(dir, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx|mjs|js)$/.test(f) && /readiness-review\/report\/|from '\.\/report\//.test(readFileSync(p, 'utf8')) && !p.includes(path.join('readiness-review', 'report'))) importers.push(path.relative(ROOT, p)); } };
  walk(path.join(ROOT, 'src'));
  const standardSource = readFileSync(path.join(ROOT, 'src/lib/readiness-review/report/standard-report.ts'), 'utf8');
  const separate = !/advisory-record/.test(standardSource);
  return [refusedStandard && refusedAdvisory && importers.length === 0 && separate, `non-fictional record refused by the standard builder ${refusedStandard} and the Advisory builder ${refusedAdvisory}; files under src importing the engine: ${importers.length ? importers.join(', ') : 'none'}; standard builder imports the Advisory record: ${!separate}`];
});

await T('R-04', 'Golden sessions: eight fictional sessions (supplied, early stop, full interview with owner answers, Advisory records, corrections, scenario routes, all in place, open interview) each pass all twenty checks, build identically twice, and match their pinned digests', async () => {
  const golden = Object.fromEntries(Object.entries(built).map(([name, d]) => [name, {
    logDigest: canonicalDigest(d.record.actions), inputDigest: d.gate.digest, standardLedgerDigest: standardLedger(d.ledger).digest, documentDigest: canonicalDigest(d.doc), advisoryDigest: canonicalDigest(d.advisory)
  }]));
  const pinned = { engine: built.supplied.doc.lineage.engine.version, copy: STANDARD_COPY.version, ledger: built.supplied.doc.lineage.ledgerVersion, inputContract: built.supplied.input.contract.version, sessions: golden };
  if (process.env.MK_REPORT_UPDATE_GOLDEN === '1') writeFileSync(GOLDEN_FILE, `${JSON.stringify(pinned, null, 1)}\n`);
  let expected = null;
  try { expected = JSON.parse(readFileSync(GOLDEN_FILE, 'utf8')); } catch { /* missing */ }
  const rows = Object.entries(built).map(([name, d]) => {
    const again = d.build();
    const same = canonicalJson(again) === canonicalJson(d.doc);
    const matches = !!expected && canonicalJson(expected.sessions?.[name]) === canonicalJson(golden[name]);
    return { name, passed: d.validation.passed, failed: failedChecks(d.validation), same, matches, statements: d.doc.statements.length, issues: d.doc.layers.register.reportedIssues.items.length, stop: `${d.input.interview.status}/${d.input.interview.stopReason || '-'}`, detail: d.validation.results.filter((r) => !r.passed).map((r) => `${r.id}: ${r.failures[0]}`) };
  });
  const ok = rows.every((r) => r.passed && r.same && r.matches);
  return [ok, `${rows.map((r) => `${r.name} (${r.stop}): ${r.passed ? '20 of 20 checks' : `failed ${r.failed.join(', ')} (${r.detail.join('; ')})`}, ${r.statements} statements, ${r.issues} issues, rebuilt identically ${r.same}, golden digest ${r.matches ? 'matches' : 'DIFFERS'}`).join('; ')}${expected ? '' : '; no golden file (run once with MK_REPORT_UPDATE_GOLDEN=1)'}`];
});

/** The document without what depends on the log position: the lineage, and statements that quote it. */
function withoutLineage(doc) {
  const d = clone(doc);
  delete d.lineage;
  for (const s of d.statements) if (s.claims.includes('lineage') || s.claims.includes('contract')) { s.text = null; s.slots = s.slots.map((x) => ({ ...x, value: null })); }
  return d;
}

await T('R-05', 'Pathway independence: the standard report is identical without any Advisory claim, and identical (apart from the log position) when every reviewer action is removed from the stored log; release does not depend on reviewer records', async () => {
  const rows = [];
  for (const name of ['supplied', 'advisory']) {
    const d = built[name];
    const ledgerOnly = buildStandardReport(d.input, standardLedger(d.ledger), d.gate);
    const sameWithoutAdvisoryClaims = canonicalJson(ledgerOnly) === canonicalJson(d.doc);
    const reviewerActions = d.record.actions.filter((a) => a.type.startsWith('reviewer.'));
    const stripped = { ...d.record, actions: d.record.actions.filter((a) => !a.type.startsWith('reviewer.')) };
    const without = await documentFor(stripped);
    const sameWithoutReviewerActions = canonicalJson(withoutLineage(without.doc)) === canonicalJson(withoutLineage(d.doc));
    const sameRelease = canonicalJson(without.doc.status.release) === canonicalJson(d.doc.status.release);
    rows.push({ name, reviewerActions: reviewerActions.length, sameWithoutAdvisoryClaims, sameWithoutReviewerActions, sameRelease, passes: without.validation.passed, advisoryEntries: d.advisory.entries.length, strippedEntries: without.advisory.entries.length });
  }
  const ok = rows.every((r) => r.reviewerActions > 0 && r.sameWithoutAdvisoryClaims && r.sameWithoutReviewerActions && r.sameRelease && r.passes && r.strippedEntries === 0);
  return [ok, rows.map((r) => `${r.name}: ${r.reviewerActions} reviewer actions, ${r.advisoryEntries} Advisory entries; same document from the standard claims alone ${r.sameWithoutAdvisoryClaims}; same document with every reviewer action removed ${r.sameWithoutReviewerActions} (passes all checks ${r.passes}, ${r.strippedEntries} Advisory entries left); same release classification and criteria ${r.sameRelease}`).join('; ')];
});

await T('R-06', 'Coverage kept distinct: the supplied session reconciles as 66 reported, 15 facts, 79 waiting, 413 not reached, 193 applicability not known, 69 depending on an unanswered question and 67 excluded, each its own statement; adaptive routing is explained for every stop reason seen', async () => {
  const { doc } = base;
  const byId = byIdOf(doc);
  const rows = Object.fromEntries(doc.layers.analysis.coverage.rows.map((r) => [r.category, r.controls.length]));
  const expected = { reported: 66, fact: 15, waiting: 79, unconfirmed: 413, 'scope-unconfirmed': 193, prerequisite: 69, excluded: 67 };
  const exact = canonicalJson(rows) === canonicalJson(expected) && Object.values(rows).reduce((a, b) => a + b, 0) === 902;
  const own = doc.layers.executive.coverage.map((id) => byId.get(id)).filter((s) => s.rule !== 'R-COVERAGE-ROUTING').length === Object.keys(expected).length;
  const routings = Object.fromEntries(Object.entries(built).map(([name, d]) => [name, byIdOf(d.doc).get(d.doc.layers.analysis.coverage.routing).template]));
  const allStops = new Set(Object.values(routings));
  const ok = exact && own && ['coverage.routing.ceiling', 'coverage.routing.respondent', 'coverage.routing.open'].every((t) => allStops.has(t));
  return [ok, `categories ${Object.entries(rows).map(([k, v]) => `${k} ${v}`).join(', ')} (sum ${Object.values(rows).reduce((a, b) => a + b, 0)}); one executive statement each ${own}; routing: ${Object.entries(routings).map(([k, v]) => `${k} ${v.replace('coverage.routing.', '')}`).join(', ')}`];
});

await T('R-07', 'Reported issues and recommended actions: every gap is a reported issue with one recommended action that quotes the draft method verbatim, or an explicit withheld action; none is generic, ranked or an evidence request', async () => {
  const rows = [];
  for (const [name, d] of Object.entries(built)) {
    const byId = byIdOf(d.doc);
    const items = d.doc.layers.register.recommendedActions.items;
    const quoted = items.filter((a) => a.source === 'draft-method-in-place').every((a) => {
      const s = byId.get(a.statement);
      const m = d.input.domains.flatMap((x) => x.controls).find((c) => c.id === a.control).method;
      return s.slots.some((x) => x.claim === `method:${a.control}` && (x.value === m.inPlace.description || x.value === m.inPlace.answers.map((y) => y.label).join('; ')));
    });
    const texts = items.map((a) => byId.get(a.statement).text).join(' ');
    rows.push({ name, gaps: d.input.findings.reportedGaps.length, issues: d.doc.layers.register.reportedIssues.items.length, actions: items.length, withheld: items.filter((a) => a.source === 'withheld').length, quoted, generic: /address the reported gap/i.test(texts), evidence: /\bevidence\b/i.test(texts), templates: [...new Set(items.map((a) => byId.get(a.statement).template))] });
  }
  const ok = rows.every((r) => r.issues === r.gaps && r.actions === r.gaps && r.quoted && !r.generic && !r.evidence);
  return [ok, rows.map((r) => `${r.name}: ${r.gaps} gaps, ${r.issues} issues, ${r.actions} actions (${r.withheld} withheld; ${r.templates.join(', ') || 'none'}), quoting the method ${r.quoted}`).join('; ')];
});

const SCENARIO_STATES = ['confirmed-reported', 'gap-reported', 'waiting', 'unconfirmed', 'scope-unconfirmed', 'route-unconfirmed', 'route-incomplete', 'precluded', 'outofscope', 'assumed'];
await T('R-08', 'Scenario analysis: every scenario once, in area and method order, worded for its own status; every scenario state the method defines is exercised across the golden sessions, or reported as not reached', async () => {
  const seen = new Map();
  let allOnce = true;
  for (const [name, d] of Object.entries(built)) {
    const byId = byIdOf(d.doc);
    const covered = new Map();
    for (const id of d.doc.layers.analysis.scenarios.flatMap((a) => a.statements)) for (const sc of byId.get(id).subjects.scenarios) covered.set(sc, (covered.get(sc) ?? 0) + 1);
    for (const s of d.input.scenarios) {
      if (!covered.has(s.id)) allOnce = false;
      seen.set(s.status, [...(seen.get(s.status) ?? []), name]);
    }
  }
  const missing = SCENARIO_STATES.filter((s) => !seen.has(s));
  const unexpected = [...seen.keys()].filter((s) => !SCENARIO_STATES.includes(s));
  // "precluded" is defined by the engine but cannot occur with bank 1.3-review: every scenario whose confirming practice
  // can be precluded is gated by an applicability condition on the same fact, which the engine applies first. Shown
  // from the coverage map, and the wording exercised on a synthetic fictional input instead.
  const coverage = JSON.parse(readFileSync(path.join(ROOT, 'src/lib/readiness-review/data/coverage-map-v1.3.json'), 'utf8'));
  const bank = JSON.parse(readFileSync(path.join(ROOT, 'src/lib/readiness-review/data/bank-v1.3.json'), 'utf8'));
  const QI = {}; const MOD = {};
  for (const d of bank.domains) for (const m of d.bank.modules) for (const q of m.questions) { QI[q.id] = q; MOD[q.id] = m; }
  const leaves = (w) => (!w ? [] : w.all ? w.all.flatMap(leaves) : w.any ? w.any.flatMap(leaves) : [w]);
  const absent = (q) => (q.format === 'practice' ? ['absent'] : q.format === 'anchored' ? ['0'] : q.format === 'choicePractice' ? Object.keys(q.practiceMap).filter((k) => q.practiceMap[k] === 'absent') : []);
  const precludable = coverage.scenarios.filter((sc) => sc.routes.some((r) => r.questions.some((y) => [MOD[y]?.enterWhen, QI[y]?.askWhen].flatMap(leaves).some((l) => QI[l.q]?.type === 'practice' && !l.in.some((v) => absent(QI[l.q]).includes(v))))));
  // The practice that would preclude a confirming control is, in every case, also the scenario's own applicability
  // condition or the condition of the route itself, so the scenario is out of scope or the route is not taken first.
  const sameLeaf = (a, b) => a.q === b.q && canonicalJson([...a.in].sort()) === canonicalJson([...b.in].sort());
  const gatedFirst = precludable.every((sc) => sc.routes.every((r) => r.questions.every((y) => [MOD[y]?.enterWhen, QI[y]?.askWhen].flatMap(leaves).filter((l) => QI[l.q]?.type === 'practice' && !l.in.some((v) => absent(QI[l.q]).includes(v))).every((l) => [...leaves(sc.expWhen), ...leaves(r.when)].some((e) => sameLeaf(e, l))))));
  const synthetic = clone(built.supplied.input);
  const target = synthetic.scenarios.find((x) => x.status === 'outofscope');
  target.status = 'precluded';
  target.statusLabel = synthetic.method.vocabulary.scenarioStatuses.precluded;
  const sLedger = buildLedger(synthetic);
  const sGate = await gateInput(synthetic);
  const sDoc = buildStandardReport(synthetic, sLedger, sGate);
  const sValid = validateDocument({ doc: sDoc, input: synthetic, ledger: sLedger, copy: STANDARD_COPY, gate: sGate, rebuild: () => buildStandardReport(synthetic, buildLedger(synthetic), sGate) });
  const worded = sDoc.statements.find((x) => x.template === 'scenario.precluded' && x.subjects.scenarios.includes(target.id));
  const unreachableExplained = missing.length === 1 && missing[0] === 'precluded' && precludable.length > 0 && gatedFirst && !!worded && sValid.passed;
  const ok = allOnce && unexpected.length === 0 && (missing.length === 0 || unreachableExplained);
  return [ok, `every scenario in its analysis ${allOnce}; states exercised: ${SCENARIO_STATES.filter((s) => seen.has(s)).map((s) => `${s} (${[...new Set(seen.get(s))].join(', ')})`).join('; ')}${missing.length ? `; not reachable with this bank: ${missing.join(', ')} (${precludable.length} scenarios could have a precluded confirming practice, each gated first by the same fact ${gatedFirst}); its wording exercised on a synthetic fictional input: "${worded?.text}", all checks ${sValid.passed}` : ''}${unexpected.length ? `; unexpected: ${unexpected.join(', ')}` : ''}`];
});

await T('R-09', 'Corrections: a practice corrected to a gap is a reported issue shown as a correction and quoting the current answer; a gap corrected to in place is no longer an issue; the annex keeps every earlier version as earlier', async () => {
  const d = built.corrections;
  const byId = byIdOf(d.doc);
  const controls = d.input.domains.flatMap((x) => x.controls);
  const corrected = controls.filter((c) => c.answer?.source === 'respondent-correction');
  const toGap = corrected.filter((c) => c.issue);
  const toFull = corrected.filter((c) => !c.issue);
  const issueOk = toGap.every((c) => {
    const item = d.doc.layers.register.reportedIssues.items.find((i) => i.control === c.id);
    return item && item.corrected && item.answerVersion === c.answer.version && byId.get(item.statement).template === 'register.issue.corrected' && byId.get(item.statement).slots.find((x) => x.name === 'answer').claim === `answer:${c.id}:v${c.answer.version}`;
  });
  const goneOk = toFull.every((c) => !d.doc.layers.register.reportedIssues.items.some((i) => i.control === c.id));
  const historyOk = corrected.every((c) => d.doc.layers.annex.answerHistory.filter((r) => r.control === c.id).length === c.history.length + 1 && d.doc.layers.annex.answerHistory.filter((r) => r.control === c.id && r.current).length === 1);
  const ok = toGap.length >= 1 && toFull.length >= 1 && issueOk && goneOk && historyOk && d.validation.passed;
  return [ok, `${corrected.length} corrected controls: ${toGap.length} now gaps (shown as corrections, quoting the current version ${issueOk}), ${toFull.length} now in place (no longer issues ${goneOk}); annex history complete with one current version each ${historyOk}; all checks ${d.validation.passed}`];
});

await T('R-10', 'Advisory record, preserved as a separate capability: every evidence and reviewer record once, attributed, never worded as an MK finding while the identity is unverified; stale evidence, disputed and incomplete reviews shown as recorded', async () => {
  const rows = [];
  for (const name of ['supplied', 'advisory']) {
    const d = built[name];
    const a = d.advisory;
    const earlier = a.entries.filter((e) => !e.current).length;
    const disputed = a.entries.filter((e) => e.record === 'review' && /“Disputed”/.test(e.text)).length;
    const incomplete = a.entries.filter((e) => e.template.endsWith('.none')).length;
    const authority = a.entries.filter((e) => e.authority !== 'unverified-account').length;
    rows.push({ name, passed: d.advisoryValidation.passed, failed: failedChecks(d.advisoryValidation), entries: a.entries.length, earlier, disputed, incomplete, authority, independent: a.standardReportDependency === false && a.pathway === 'advisory' });
  }
  const adv = rows.find((r) => r.name === 'advisory');
  const ok = rows.every((r) => r.passed && r.authority === 0 && r.independent) && adv.earlier >= 1 && adv.disputed >= 1 && adv.incomplete >= 1;
  return [ok, rows.map((r) => `${r.name}: ${r.passed ? `${ADVISORY_CHECKS.length} of ${ADVISORY_CHECKS.length} Advisory checks` : `failed ${r.failed.join(', ')}`}, ${r.entries} entries (${r.earlier} earlier, ${r.disputed} disputed, ${r.incomplete} incomplete reviews), ${r.authority} worded with MK authority, kept apart from the standard report ${r.independent}`).join('; ')];
});

await T('R-11', 'Executive brief: concise and non-duplicative, no individual control named, no control inventory, no score; each statement in one section only', async () => {
  const rows = Object.entries(built).map(([name, d]) => {
    const ids = executiveStatementIds(d.doc);
    const byId = byIdOf(d.doc);
    const named = new Set(ids.flatMap((id) => byId.get(id).subjects.controls)).size;
    const sections = Object.fromEntries(EXECUTIVE_SECTIONS.map((s) => [s, d.doc.layers.executive[s].length]));
    return { name, total: ids.length, unique: new Set(ids).size, named, sections };
  });
  const ok = rows.every((r) => r.total === r.unique && r.total <= EXECUTIVE_LIMITS.statements && r.named === 0);
  return [ok, rows.map((r) => `${r.name}: ${r.total} statements (${Object.entries(r.sections).map(([k, v]) => `${k} ${v}`).join(', ')}), ${r.named} controls named`).join('; ')];
});

await T('R-17', 'Copy coverage: every draft template of the standard report is used by at least one golden session, so no wording goes to MK for approval untested', async () => {
  // Wording the engine needs but no recorded session can reach (each shown why in the detail) is exercised on synthetic
  // fictional inputs: each must build and pass all twenty checks.
  const synthetic = [];
  const variant = async (why, change) => {
    const x = clone(built.supplied.input);
    change(x);
    const ledger = buildLedger(x);
    const gate = await gateInput(x);
    const doc = buildStandardReport(x, ledger, gate);
    const v = validateDocument({ doc, input: x, ledger, copy: STANDARD_COPY, gate, rebuild: () => buildStandardReport(x, buildLedger(x), gate) });
    synthetic.push({ why, passed: v.passed, failed: failedChecks(v), doc });
  };
  const controlsOf = (x) => x.domains.flatMap((d) => d.controls);
  await variant('an interview recorded as ended with no stop reason (the engine always records one)', (x) => { x.interview.stopReason = ''; });
  await variant('an interview that asked everything its plan required (not reached within the screen limit by any golden session)', (x) => { x.interview.stopReason = 'plan'; });
  await variant('waiting items about applicability that all have an accountable function', (x) => { for (const w of x.openWork.waiting) if (!w.function) { w.function = 'Finance'; w.owner = 'cfo'; } });
  await variant('waiting items without an accountable function that are not about applicability', (x) => { for (const c of controlsOf(x)) if (c.state === 'waiting-scope') { c.state = 'waiting'; c.stateLabel = x.method.vocabulary.controlStates.waiting; } for (const w of x.openWork.waiting) if (w.state === 'waiting-scope') w.state = 'waiting'; });
  await variant('a retired question (the engine leaves retired questions out of its report)', (x) => { const c = controlsOf(x).find((y) => y.state === 'unconfirmed'); c.state = 'retired'; c.stateLabel = x.method.vocabulary.controlStates.retired; });
  await variant('a gap on a practice the draft method does not describe in place (as for the multi-select practices D4-M-13 and D5-V-13, which no golden session reached as a gap)', (x) => { controlsOf(x).find((c) => c.id === x.findings.reportedGaps[0].id).method.inPlace = null; });
  await variant('a precluded scenario (not reachable with bank 1.3-review; see R-08)', (x) => { const sc = x.scenarios.find((y) => y.status === 'outofscope'); sc.status = 'precluded'; sc.statusLabel = x.method.vocabulary.scenarioStatuses.precluded; });
  const used = new Set([...Object.values(built), ...synthetic].flatMap((d) => d.doc.statements.map((s) => s.template)));
  const unused = Object.keys(STANDARD_COPY.templates).filter((t) => !used.has(t));
  const advisoryUsed = new Set(Object.values(built).flatMap((d) => d.advisory.entries.map((e) => e.template)));
  const advisoryUnused = Object.keys(ADVISORY_COPY.templates).filter((t) => t !== 'advisory.status' && !advisoryUsed.has(t));
  // Authoritative Advisory wording exists only for a verified MK reviewer identity, which no record has until B3.
  const expectedUnusedAdvisory = advisoryUnused.every((t) => t.includes('.verified.'));
  const syntheticOk = synthetic.every((v) => v.passed);
  return [unused.length === 0 && expectedUnusedAdvisory && syntheticOk, `${Object.keys(STANDARD_COPY.templates).length - unused.length} of ${Object.keys(STANDARD_COPY.templates).length} standard templates used${unused.length ? `; unused: ${unused.join(', ')}` : ''}; ${synthetic.length} synthetic fictional variants (${synthetic.map((v) => `${v.why}: ${v.passed ? 'all checks' : `failed ${v.failed.join(', ')}`}`).join('; ')}); Advisory templates unused: ${advisoryUnused.join(', ') || 'none'} (only the verified-identity wording, which no record can use before B3: ${expectedUnusedAdvisory})`];
});

// ------------------------------------------------------------------------------------------------ mutation tests
const find = (doc, pred) => doc.statements.find(pred);
const values = (s) => Object.fromEntries([...s.slots.map((x) => [x.name, x.value]), ...s.counts.flatMap((c) => [[c.name, c.value], ...(c.universe ? [[c.universe.name, c.universe.value]] : [])])]);
/** Changes a template in a copy table and re-renders every statement that uses it, so that only the wording differs. */
function withTemplate(doc, template, change, from = STANDARD_COPY) {
  const copy = clone(from);
  copy.templates[template] = change(copy.templates[template]);
  for (const s of doc.statements) if (s.template === template) s.text = render(copy.templates[template], values(s));
  return copy;
}
/** Adds a statement to the document, with its template in a copy table, as a careless or hostile change would. */
function inject(m, spec) {
  const copy = clone(m.copy);
  copy.templates[spec.template] = spec.wording;
  const s = { id: spec.id, layer: spec.layer ?? 'executive', section: spec.section, rule: spec.rule ?? 'R-INJECTED', template: spec.template, text: render(spec.wording, Object.fromEntries((spec.slots ?? []).map((x) => [x.name, x.value]))), kind: spec.kind, basis: spec.basis ?? 'self-reported', slots: spec.slots ?? [], counts: [], qualifiers: spec.qualifiers ?? [], claims: spec.claims, subjects: { controls: [], scenarios: [], area: null, function: null, ...(spec.subjects ?? {}) }, ...(spec.extra ?? {}) };
  m.doc.statements.push(s);
  if (spec.layer === undefined || spec.layer === 'executive') m.doc.layers.executive[spec.section].push(s.id);
  return { copy };
}
const ctl = (d) => d.input.domains.flatMap((x) => x.controls);
const gapControl = base.input.findings.reportedGaps[0].id;
const gapKey = ctl(base).find((c) => c.id === gapControl).key;
const waitingControl = base.input.openWork.waiting[0].id;
const unaskedControl = ctl(base).find((c) => c.state === 'unconfirmed').id;
const practiceControl = ctl(base).find((c) => c.state === 'reported' && !c.issue).id;
const evidenceClaim = base.ledger.claims.find((c) => c.type === 'evidence' && c.value.current && c.outcome === 'insufficient');
const reviewClaim = base.ledger.claims.find((c) => c.type === 'review');
const evidenceKey = ctl(base).find((c) => c.id === evidenceClaim.subject.control).key;

const RECORDS_SESSION = Object.keys(built).find((name) => built[name].doc.statements.some((s) => s.rule === 'R-ANALYSIS-RECORDS'));
const MUTATIONS = [
  ['M01', 'V01', 'the gate refused the input', async (m) => ({ gate: await gateInput({ ...m.input, contract: { ...m.input.contract, version: '2.0.0' } }) })],
  ['M02', 'V01', 'the document carries another input digest', (m) => { m.doc.lineage.inputDigest = '0'.repeat(64); }],
  ['M03', 'V02', 'a statement cites a claim that does not exist', (m) => { m.doc.statements[0].claims.push('control:NOT-A-CONTROL'); }],
  ['M04', 'V02', 'the input changed after the ledger was built', (m) => { const x = clone(m.input); ctl({ input: x }).find((c) => c.id === gapControl).answer.label = 'Changed afterwards'; return { input: x }; }],
  ['M05', 'V03', 'a number in a text was changed', (m) => { const s = find(m.doc, (s) => s.rule === 'R-IND-AREA'); s.text = s.text.replace(/indicate that \d+/, 'indicate that 99'); }],
  ['M06', 'V03', 'a slot value is not the claim value', (m) => { const s = find(m.doc, (s) => s.rule === 'R-ANALYSIS-ISSUE'); s.slots[0].value = 'Another control'; s.text = render(STANDARD_COPY.templates[s.template], values(s)); }],
  ['M07', 'V03', 'a template that is not in the copy table', (m) => { m.doc.statements[0].template = 'not.a.template'; }],
  ['M08', 'V03', 'the draft method\'s description changed in a recommended action', (m) => { const s = m.doc.statements.find((x) => x.template === 'action.anchored'); s.slots.find((x) => x.name === 'inPlace').value = 'A description the method does not give.'; s.text = render(STANDARD_COPY.templates[s.template], values(s)); }],
  ['M09', 'V04', 'an indicated gap worded as verified', (m) => ({ copy: withTemplate(m.doc, 'indicated.area', (t) => `${t} This has been confirmed.`) })],
  ['M10', 'V04', 'a reported practice presented as an indicated gap', (m) => { find(m.doc, (s) => s.rule === 'R-ANALYSIS-ISSUE').subjects.controls.push(practiceControl); }],
  ['M11', 'V05', 'a waiting control presented as a gap', (m) => { find(m.doc, (s) => s.rule === 'R-ANALYSIS-ISSUE').subjects.controls = [waitingControl]; }],
  ['M12', 'V05', 'controls not reached worded as a weakness', (m) => ({ copy: withTemplate(m.doc, 'coverage.unconfirmed', (t) => `${t} Each is a weakness.`) })],
  ['M13', 'V05', 'a reported issue for a control never asked', (m) => { m.doc.layers.register.reportedIssues.items[0].control = unaskedControl; }],
  ['M14', 'V06', 'records said to exist without saying MK has not seen them', (m) => ({ copy: withTemplate(m.doc, 'analysis.area.records', (t) => t.replace(' MK has not seen these records.', '')) }), RECORDS_SESSION],
  ['M15', 'V06', 'records said to exist where the respondent said nothing', (m) => { m.doc.layers.annex.controls.find((r) => r.state === 'reported' && !r.recordsSaid).recordsSaid = 'yes'; }],
  ['M16', 'V07', 'an MK conclusion stated in the standard report', (m) => ({ copy: withTemplate(m.doc, 'indicated.scenarios', (t) => `${t} MK concluded that the remaining practices are in place.`) })],
  ['M17', 'V07', 'a statement of the kind conclusion', (m) => { find(m.doc, (s) => s.rule === 'R-IND-SCENARIOS').kind = 'conclusion'; }],
  ['M18', 'V08', 'a score field', (m) => { m.doc.status.score = 3; }],
  ['M19', 'V08', 'percentage wording', (m) => ({ copy: withTemplate(m.doc, 'indicated.area', (t) => `${t} The share is shown per cent.`) })],
  ['M20', 'V08', 'scoring not withheld', (m) => { m.doc.status.scoring.status = 'computed'; }],
  ['M21', 'V09', 'a count without its universe', (m) => { find(m.doc, (s) => s.rule === 'R-COVERAGE-WAITING').counts[0].universe = null; }],
  ['M22', 'V09', 'areas compared', (m) => ({ copy: withTemplate(m.doc, 'indicated.area', (t) => `${t} That is more than in other areas.`) })],
  ['M23', 'V09', 'a count the executive brief may not use', (m) => { for (const s of m.doc.statements.filter((s) => s.rule === 'R-IND-AREA')) s.counts[0].universe.name = 'areaTotal'; return { copy: withTemplate(m.doc, 'indicated.area', (t) => t.replace('{asked}', '{areaTotal}')) }; }],
  ['M24', 'V10', 'ranking wording', (m) => ({ copy: withTemplate(m.doc, 'register.issue', (t) => `${t} Top priority.`) })],
  ['M25', 'V10', 'reported issues marked as ranked', (m) => { m.doc.layers.register.reportedIssues.ranked = true; }],
  ['M26', 'V10', 'recommended actions reordered', (m) => { m.doc.layers.register.recommendedActions.items.reverse(); }],
  ['M27', 'V10', 'the sequence statement removed', (m) => { m.doc.layers.register.informationGathering.sequenceStatement = m.doc.layers.register.reportedIssues.statement; }],
  ['M28', 'V10', 'a sequence presented as a priority', (m) => { m.doc.layers.register.informationGathering.items[0].sequenceMeaning = 'Priority order'; }],
  ['M29', 'V10', 'scenario analysis reordered by tier', (m) => { const tier = new Map(m.input.scenarios.map((s) => [s.id, s.tier])); for (const a of m.doc.layers.analysis.scenarios) a.statements.sort((x, y) => tier.get(find(m.doc, (s) => s.id === x).subjects.scenarios[0]) - tier.get(find(m.doc, (s) => s.id === y).subjects.scenarios[0])); m.doc.layers.analysis.scenarios.reverse(); }],
  ['M30', 'V10', 'a method tier shown in the scenario analysis', (m) => { for (const s of m.doc.statements.filter((x) => x.template === 'scenario.confirmed-reported')) s.slots.push({ name: 'tier', claim: s.slots[0].claim, field: 'tier', value: m.ledger.byId.get(s.slots[0].claim).value.tier }); return { copy: withTemplate(m.doc, 'scenario.confirmed-reported', (t) => `${t} Tier {tier}.`) }; }],
  ['M31', 'V11', 'released while release criteria are unmet', (m) => { m.doc.status.release.classification = 'releasable'; m.doc.status.release.marking = ''; }],
  ['M32', 'V11', 'the basis stated as verified', (m) => { m.doc.status.basis.responsesVerifiedByMK = true; }],
  ['M33', 'V11', 'the basis statement removed from the brief', (m) => { m.doc.layers.executive.status = m.doc.layers.executive.status.filter((id) => find(m.doc, (s) => s.id === id).rule !== 'R-STATUS-BASIS'); }],
  ['M34', 'V11', 'a release criterion that is not the standard pathway\'s', (m) => { m.doc.status.release.criteria.push({ id: 'review-complete', met: false, ref: 'Advisory', note: 'An authorised reviewer has concluded' }); }],
  ['M35', 'V12', 'the executive brief names a control', (m) => { find(m.doc, (s) => s.rule === 'R-IND-AREA').subjects.controls = [gapControl]; }],
  ['M36', 'V12', 'a control missing from the annex', (m) => { m.doc.layers.annex.controls.pop(); }],
  ['M37', 'V12', 'a register statement in the executive brief', (m) => { m.doc.layers.executive.indicated.push(m.doc.layers.register.informationGathering.items[0].statement); }],
  ['M38', 'V12', 'a scenario missing from the annex', (m) => { m.doc.layers.annex.scenarios.splice(3, 1); }],
  ['M39', 'V13', 'an unresolved question dropped', (m) => { const items = m.doc.layers.register.informationGathering.items; items.splice(0, 1); items.forEach((it, i) => (it.sequence = i + 1)); }],
  ['M40', 'V13', 'a reported issue dropped', (m) => { m.doc.layers.register.reportedIssues.items.splice(0, 1); }],
  ['M41', 'V13', 'a recommended action detached from its issue', (m) => { m.doc.layers.register.recommendedActions.items[0].issue = 'issue-999'; }],
  ['M42', 'V13', 'a scenario dropped from the analysis', (m) => { const a = m.doc.layers.analysis.scenarios[0]; a.statements.splice(0, 1); }],
  ['M43', 'V13', 'a scenario worded with another status', (m) => { const s = find(m.doc, (s) => s.rule === 'R-SCENARIO-CONFIRMED-REPORTED'); s.template = 'scenario.outofscope'; s.text = render(STANDARD_COPY.templates[s.template], values(s)); }],
  ['M44', 'V14', 'an answer version shown with provenance it does not have', (m) => { m.doc.layers.annex.answerHistory[0].sourceLabel = 'correction'; }],
  ['M45', 'V14', 'an answer version missing from the history', (m) => { m.doc.layers.annex.answerHistory.splice(0, 1); }],
  ['M46', 'V14', 'a superseded answer quoted as the current one', (m) => { const item = m.doc.layers.register.reportedIssues.items.find((i) => i.corrected); const s = find(m.doc, (s) => s.id === item.statement); const slot = s.slots.find((x) => x.name === 'answer'); const earlier = m.ledger.claims.find((c) => c.type === 'answer' && c.subject.control === item.control && !c.pointer.endsWith('/answer')); slot.claim = earlier.id; slot.value = earlier.value.label; s.claims.push(earlier.id); s.text = render(STANDARD_COPY.templates[s.template], values(s)); }, 'corrections'],
  ['M47', 'V14', 'a correction not shown as one', (m) => { const item = m.doc.layers.register.reportedIssues.items.find((i) => i.corrected); const s = find(m.doc, (s) => s.id === item.statement); s.template = 'register.issue'; s.text = render(STANDARD_COPY.templates[s.template], values(s)); }, 'corrections'],
  ['M48', 'V15', 'building again gives something else', (m) => ({ rebuild: () => ({ ...clone(m.doc), lineage: { ...m.doc.lineage, asOf: new Date().toISOString() } }) })],
  // Reviewer authority (finding 1) and the pathway boundary: no route, template or disclaimer lets an Advisory record in.
  ['M49', 'V16', 'an Advisory evidence finding in the brief, marked as unverified', (m) => inject(m, { id: 'st-injected-evidence', section: 'indicated', template: 'injected.evidence', wording: 'For “{key}”, MK reviewed the evidence supplied and found it insufficient.', kind: 'indicated-gap', slots: [{ name: 'key', claim: `control:${evidenceClaim.subject.control}`, field: 'key', value: evidenceKey }], claims: [evidenceClaim.id], qualifiers: ['reviewer-identity-unverified'] })],
  ['M50', 'V16', 'an Advisory finding beside a status disclaimer that the reviewer identity is unverified', (m) => { inject(m, { id: 'st-injected-disclaimer', section: 'status', template: 'injected.disclaimer', wording: 'Reviewer identity is not verified; findings below are provisional.', kind: 'method', basis: 'method', claims: ['method.approval'] }); return inject({ ...m, copy: { ...m.copy, templates: { ...m.copy.templates, 'injected.disclaimer': 'Reviewer identity is not verified; findings below are provisional.' } } }, { id: 'st-injected-finding', layer: 'analysis', section: `area:${evidenceClaim.subject.area}`, template: 'injected.finding', wording: 'Evidence for “{key}” was found insufficient.', kind: 'indicated-gap', slots: [{ name: 'key', claim: `control:${evidenceClaim.subject.control}`, field: 'key', value: evidenceKey }], claims: [evidenceClaim.id], qualifiers: ['reviewer-identity-unverified'] }); }],
  ['M51', 'V16', 'a reported issue that cites a reviewer record', (m) => { find(m.doc, (s) => s.id === m.doc.layers.register.reportedIssues.items[0].statement).claims.push(reviewClaim.id); }],
  ['M52', 'V16', 'release made to depend on reviewer identity', (m) => { m.doc.status.release.criteria[1] = { id: 'reviewer-identity', met: false, ref: 'B3', note: 'Reviewer identity not verified' }; }],
  ['M53', 'V16', 'the basis statement changed to claim verification', (m) => ({ copy: withTemplate(m.doc, 'status.basis', (t) => t.replace('MK has not reviewed evidence or verified any response;', 'MK has reviewed evidence and verified the responses;')) })],
  ['M54', 'V16', 'an evidence level carried on a statement', (m) => { find(m.doc, (s) => s.rule === 'R-ANALYSIS-ISSUE').evidenceLevel = 'reviewed'; }],
  // Coverage (finding 2)
  ['M55', 'V17', 'three distinct categories merged into "not asked"', (m) => { const ids = ['R-COVERAGE-UNCONFIRMED', 'R-COVERAGE-SCOPE-UNCONFIRMED', 'R-COVERAGE-PREREQUISITE'].map((r) => find(m.doc, (s) => s.rule === r)); const items = ids.flatMap((s) => s.counts[0].items); const merged = ids[0]; merged.counts[0] = { ...merged.counts[0], name: 'unconfirmed', counts: 'controls not asked', items, value: items.length }; const copy = withTemplate(m.doc, 'coverage.unconfirmed', () => 'Not asked: {unconfirmed} of the {total} controls.'); m.doc.layers.executive.coverage = m.doc.layers.executive.coverage.filter((id) => id !== ids[1].id && id !== ids[2].id); merged.text = render(copy.templates['coverage.unconfirmed'], values(merged)); return { copy }; }],
  ['M56', 'V17', 'the explanation of adaptive routing removed', (m) => { m.doc.layers.executive.coverage = m.doc.layers.executive.coverage.filter((id) => find(m.doc, (s) => s.id === id).rule !== 'R-COVERAGE-ROUTING'); }],
  ['M57', 'V17', 'routing explained with another stop reason', (m) => { const s = find(m.doc, (s) => s.rule === 'R-COVERAGE-ROUTING'); s.template = 'coverage.routing.plan'; s.text = render(STANDARD_COPY.templates[s.template], values(s)); }],
  ['M58', 'V17', 'a control moved between categories', (m) => { const a = find(m.doc, (s) => s.rule === 'R-COVERAGE-UNCONFIRMED'); const b = find(m.doc, (s) => s.rule === 'R-COVERAGE-PREREQUISITE'); b.counts[0].items.push(a.counts[0].items.pop()); a.counts[0].value--; b.counts[0].value++; a.text = render(STANDARD_COPY.templates[a.template], values(a)); b.text = render(STANDARD_COPY.templates[b.template], values(b)); }],
  // Remediation integrity (finding 3)
  ['M59', 'V18', 'the generic "Address the reported gap" action', (m) => ({ copy: withTemplate(m.doc, 'action.anchored', () => 'Address the reported gap: {key}. {inPlace}') })],
  ['M60', 'V18', 'an evidence request recommended for every reported practice', (m) => inject(m, { id: 'st-injected-request', section: 'decisions', template: 'injected.request', wording: 'Decide whether to supply records for every practice reported on, so that it can be checked.', kind: 'decision', basis: 'record', claims: ['interview'] })],
  ['M61', 'V18', 'a recommended action that does not quote the method', (m) => { const s = m.doc.statements.find((x) => x.template === 'action.anchored'); s.slots = s.slots.filter((x) => x.name !== 'inPlace'); s.slots.push({ name: 'inPlace', claim: `control:${s.subjects.controls[0]}`, field: 'text', value: m.ledger.byId.get(`control:${s.subjects.controls[0]}`).value.text }); s.text = render(STANDARD_COPY.templates[s.template], values(s)); }],
  ['M62', 'V18', 'an action withheld although the method describes the practice', (m) => { const a = m.doc.layers.register.recommendedActions.items[0]; a.source = 'withheld'; const s = find(m.doc, (s) => s.id === a.statement); s.template = 'action.withheld'; s.kind = 'withheld'; s.slots = s.slots.filter((x) => x.name === 'key'); s.rule = 'R-REGISTER-ACTION-WITHHELD'; s.text = render(STANDARD_COPY.templates[s.template], values(s)); }],
  ['M63', 'V18', 'a recommended action that does not cite its gap', (m) => { const s = find(m.doc, (s) => s.id === m.doc.layers.register.recommendedActions.items[0].statement); s.claims = s.claims.filter((c) => !c.startsWith('gap:')); }],
  ['M64', 'V18', 'recommended actions without their qualification', (m) => ({ copy: withTemplate(m.doc, 'register.actions.intro', () => 'Recommended actions follow.') })],
  // Executive quality (finding 4)
  ['M65', 'V19', 'a statement in two executive sections', (m) => { m.doc.layers.executive.decisions.push(m.doc.layers.executive.indicated[0]); }],
  ['M66', 'V19', 'the same sentence twice in the brief', (m) => { const s = clone(find(m.doc, (x) => x.rule === 'R-IND-AREA')); s.id = 'st-duplicate'; s.rule = 'R-IND-AREA-AGAIN'; m.doc.statements.push(s); m.doc.layers.executive.indicated.push(s.id); }],
  ['M67', 'V19', 'the brief longer than its limit', (m) => { for (let i = 0; i < EXECUTIVE_LIMITS.statements; i++) { const s = clone(find(m.doc, (x) => x.rule === 'R-WITHHELD-UNASKED')); s.id = `st-padding-${i}`; s.rule = `R-WITHHELD-PAD-${i}`; s.text = `${s.text} `.repeat(1 + (i % 2)) + i; m.doc.statements.push(s); m.doc.layers.executive.withheld.push(s.id); } }],
  // Judgements MK has not recorded
  ['M68', 'V20', 'an overall readiness judgement', (m) => ({ copy: withTemplate(m.doc, 'indicated.scenarios', (t) => `${t} Overall, the organisation is reasonably well prepared.`) })],
  ['M69', 'V20', 'a withheld judgement removed', (m) => { m.doc.layers.executive.withheld = m.doc.layers.executive.withheld.filter((id) => find(m.doc, (s) => s.id === id).rule !== 'R-WITHHELD-PRIORITY'); }],
  ['M70', 'V20', 'a withheld statement turned into a judgement', (m) => ({ copy: withTemplate(m.doc, 'withheld.overall', () => 'Overall readiness: adequate for an organisation of this size.') })]
];

const ADVISORY_MUTATIONS = [
  ['N01', 'A02', 'an unverified record worded as an MK finding, with a status disclaimer present', (m) => { const e = m.record.entries.find((x) => x.record === 'evidence'); m.copy.templates['advisory.evidence.unverified.current'] = 'For “{key}”, MK reviewed the evidence supplied and found: “{label}”. Recorded basis: “{basis}”. This is not an MK finding.'; m.copy.templates['advisory.status'] = `${m.copy.templates['advisory.status']} Reviewer identities are not verified.`; m.record.statusStatement = m.copy.templates['advisory.status']; e.text = render(m.copy.templates[e.template], Object.fromEntries(e.slots.map((s) => [s.name, s.value]))); }],
  ['N02', 'A02', 'an unverified record given the verified template', (m) => { const e = m.record.entries.find((x) => x.record === 'evidence'); e.template = 'advisory.evidence.verified.current'; e.text = render(m.copy.templates[e.template], Object.fromEntries(e.slots.map((s) => [s.name, s.value]))); }],
  ['N03', 'A02', 'the statement that it is not an MK finding removed', (m) => { const e = m.record.entries.find((x) => x.record === 'review'); m.copy.templates[e.template] = m.copy.templates[e.template].replace(' This is not an MK finding.', ''); e.text = render(m.copy.templates[e.template], Object.fromEntries(e.slots.map((s) => [s.name, s.value]))); }],
  ['N04', 'A01', 'a reviewer identity shown as verified', (m) => { m.record.entries[0].attribution = { ...m.record.entries[0].attribution, identityVerified: true }; }],
  ['N05', 'A03', 'stale evidence shown as current', (m) => { const e = m.record.entries.find((x) => !x.current); e.current = true; }, 'advisory'],
  ['N06', 'A04', 'a reviewer\'s recorded basis reworded', (m) => { const e = m.record.entries.find((x) => x.slots.some((s) => s.name === 'basis')); e.slots.find((s) => s.name === 'basis').value = 'A basis the reviewer did not record'; e.text = render(m.copy.templates[e.template], Object.fromEntries(e.slots.map((s) => [s.name, s.value]))); }],
  ['N07', 'A05', 'the Advisory record made a dependency of the standard report', (m) => { m.record.standardReportDependency = true; }],
  ['N08', 'A06', 'a reviewer record dropped', (m) => { m.record.entries = m.record.entries.filter((x) => x.record !== 'review'); }]
];

await T('R-12', `Mutation tests, standard report: each of ${MUTATIONS.length} injected faults makes its target check fail, and every one of the twenty checks is targeted at least once`, async () => {
  const rows = [];
  for (const [id, target, what, apply, on = 'supplied'] of MUTATIONS) {
    const d = built[on];
    const m = { doc: clone(d.doc), input: d.input, ledger: d.ledger, copy: STANDARD_COPY, gate: d.gate };
    const over = (await apply(m)) ?? {};
    const ctx = { doc: m.doc, input: over.input ?? m.input, ledger: over.ledger ?? m.ledger, copy: over.copy ?? m.copy, gate: over.gate ?? m.gate, rebuild: over.rebuild ?? (() => m.doc) };
    const v = validateDocument(ctx);
    const failed = failedChecks(v);
    rows.push({ id, target, what, on, caught: failed.includes(target), alsoFailed: failed.filter((f) => f !== target) });
  }
  const missed = rows.filter((r) => !r.caught);
  const targeted = new Set(rows.map((r) => r.target));
  results.mutations = rows;
  return [missed.length === 0 && CHECKS.every(([id]) => targeted.has(id)), `${rows.length - missed.length} of ${rows.length} caught by their target check${missed.length ? `; missed: ${missed.map((r) => `${r.id} (${r.target})`).join(', ')}` : ''}; checks targeted ${targeted.size} of ${CHECKS.length}; caught by the target alone in ${rows.filter((r) => r.caught && !r.alsoFailed.length).length}`];
});

await T('R-13', `Mutation tests, Advisory record: each of ${ADVISORY_MUTATIONS.length} injected faults makes its target check fail, including authoritative wording beside a status disclaimer`, async () => {
  const rows = [];
  for (const [id, target, what, apply, on = 'supplied'] of ADVISORY_MUTATIONS) {
    const d = built[on];
    const m = { record: clone(d.advisory), copy: clone(ADVISORY_COPY) };
    apply(m);
    const v = validateAdvisoryRecord(m.record, d.input, d.ledger, m.copy);
    const failed = failedChecks(v);
    rows.push({ id, target, what, on, caught: failed.includes(target), alsoFailed: failed.filter((f) => f !== target) });
  }
  const missed = rows.filter((r) => !r.caught);
  const targeted = new Set(rows.map((r) => r.target));
  results.advisoryMutations = rows;
  return [missed.length === 0 && ADVISORY_CHECKS.every(([id]) => targeted.has(id)), `${rows.length - missed.length} of ${rows.length} caught by their target check${missed.length ? `; missed: ${missed.map((r) => `${r.id} (${r.target})`).join(', ')}` : ''}; checks targeted ${targeted.size} of ${ADVISORY_CHECKS.length}`];
});

await T('R-14', 'Damaged provenance: a version whose log entry is missing is shown as "not recorded", passes the checks, and fails them if shown as a first answer', async () => {
  const live = replay(fixture.record);
  const cid = base.input.findings.reportedGaps[0].id;
  const rec = live.engine.S.ans[cid];
  live.engine.S.log = live.engine.S.log.filter((l) => !(l.q === cid && l.at === rec.at));
  const input = buildReportInput(live);
  const ledger = buildLedger(input);
  const gate = await gateInput(input);
  const build = () => buildStandardReport(input, buildLedger(input), gate);
  const doc = build();
  const row = doc.layers.annex.answerHistory.find((r) => r.control === cid);
  const v = validateDocument({ doc, input, ledger, copy: STANDARD_COPY, gate, rebuild: build });
  const shownAsFirst = clone(doc);
  shownAsFirst.layers.annex.answerHistory.find((r) => r.control === cid).sourceLabel = 'answer';
  const v2 = validateDocument({ doc: shownAsFirst, input, ledger, copy: STANDARD_COPY, gate, rebuild: () => shownAsFirst });
  const ok = row.source === null && row.sourceLabel === 'how it was given is not recorded' && v.passed && failedChecks(v2).includes('V14');
  return [ok, `${cid} v${row.version}: source ${row.source}, shown as "${row.sourceLabel}"; checks ${v.passed ? 'all pass' : `failed ${failedChecks(v).join(', ')}`}; shown as a first answer instead: ${failedChecks(v2).join(', ')} fails`];
});

await T('R-15', 'The underlying record is unchanged from Phase 1: the same stored log, and the 1.2.0 input without the added method content is byte for byte the 1.1.0 input Phase 1 read', async () => {
  const { input, record } = base;
  const projected = clone(input);
  projected.contract.version = '1.1.0';
  for (const d of projected.domains) for (const c of d.controls) delete c.method;
  const sameInput = canonicalDigest(projected) === PHASE1.inputDigest;
  const sameLog = record.actions.length === PHASE1.actionCount && canonicalDigest(record.actions) === input.lineage.logDigest;
  return [sameInput && sameLog, `stored log: ${record.actions.length} actions, digest ${input.lineage.logDigest.slice(0, 12)}, as Phase 1 ${sameLog}; 1.2.0 input ${base.gate.digest.slice(0, 12)} reduced to 1.1.0 gives ${canonicalDigest(projected).slice(0, 12)}, Phase 1 read ${PHASE1.inputDigest.slice(0, 12)}: identical ${sameInput}`];
});

// ------------------------------------------------------------------------------------------------ the trace
await T('R-16', 'End-to-end trace on the supplied session: a reported answer, through the input and the standard claims, to the executive brief, the analysis, the reported issue and its recommended action, and the annex; the Advisory record for the same control kept apart', async () => {
  const { record, input, ledger, doc, advisory } = base;
  const cid = 'D1-B-01';
  const action = record.actions.find((a) => a.type === 'respondent.answer' && a.q === cid);
  const d = input.domains.findIndex((x) => x.controls.some((c) => c.id === cid));
  const c = input.domains[d].controls.findIndex((x) => x.id === cid);
  const pointer = `/domains/${d}/controls/${c}`;
  const answer = resolvePointer(input, `${pointer}/answer`);
  const claimIds = [`control:${cid}`, `answer:${cid}:v${answer.version}`, `gap:${cid}`, `method:${cid}`];
  const claims = claimIds.map((id) => ledger.byId.get(id));
  const byId = byIdOf(doc);
  const execIds = new Set(executiveStatementIds(doc));
  const exec = doc.statements.filter((s) => execIds.has(s.id) && s.counts.some((k) => k.items.includes(`gap:${cid}`)));
  const analysis = doc.statements.filter((s) => s.layer === 'analysis' && s.subjects.controls.includes(cid));
  const issue = doc.layers.register.reportedIssues.items.find((i) => i.control === cid);
  const recommended = doc.layers.register.recommendedActions.items.find((i) => i.control === cid);
  const annexControl = doc.layers.annex.controls.find((r) => r.id === cid);
  const annexAnswer = doc.layers.annex.answerHistory.find((r) => r.control === cid);
  const advisoryEntries = advisory.entries.filter((e) => e.control === cid);
  const standardCitesAdvisory = doc.statements.some((s) => s.claims.some((x) => ledger.byId.get(x)?.pathway === 'advisory'));
  const ok = !!action && action.value === answer.value && claims.every((x) => x && claimHolds(input, x)) && exec.length >= 1 && analysis.length >= 2 && issue && recommended?.source === 'draft-method-in-place' && annexControl && annexAnswer?.claim === claimIds[1] && advisoryEntries.length >= 1 && !standardCitesAdvisory;
  results.trace = { cid, action, pointer, answer, claims, exec, analysis, issue, recommended, annexControl, annexAnswer, advisoryEntries, byId };
  return [ok, `log action #${action?.seq} (${action?.type}, value ${JSON.stringify(action?.value)}) → input ${pointer}/answer (version ${answer.version}, ${answer.source}) → ${claims.filter(Boolean).length} standard claims, all holding → ${exec.length} executive statements, ${analysis.length} analysis statements, ${issue?.id} and ${recommended?.id} (${recommended?.source}), annex rows for the control and the answer; ${advisoryEntries.length} Advisory entries for the same control, none cited by the standard report`];
});

// ------------------------------------------------------------------------------------------------ examples for MK review
if (process.env.MK_REPORT_EXAMPLES_DIR) {
  const { writeExamples } = await import(path.join(ROOT, 'scripts/lib/readiness-review-report-examples.mjs'));
  writeExamples(process.env.MK_REPORT_EXAMPLES_DIR, { built, results, canonicalDigest });
}

// ------------------------------------------------------------------------------------------------ results
const summary = results.reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {});
results.forEach((r) => console.log(`${r.id.padEnd(5)} ${r.status.padEnd(5)} ${r.name}\n        ${r.detail}`));
for (const list of [results.mutations, results.advisoryMutations]) if (list) list.forEach((m) => console.log(`        ${m.id} ${m.target} ${m.caught ? 'caught' : 'MISSED'}: ${m.what}${m.on !== 'supplied' ? ` [${m.on}]` : ''}${m.alsoFailed.length ? ` (also ${m.alsoFailed.join(', ')})` : ''}`));
console.log(JSON.stringify(summary));
if (process.env.MK_REPORT_RESULTS) writeFileSync(process.env.MK_REPORT_RESULTS, JSON.stringify({ summary, results: results.map(({ id, name, status, detail }) => ({ id, name, status, detail })), mutations: results.mutations ?? [], advisoryMutations: results.advisoryMutations ?? [] }, null, 1));
process.exit(summary.fail ? 1 : 0);
