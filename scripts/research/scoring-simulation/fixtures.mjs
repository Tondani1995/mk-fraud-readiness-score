// HYPOTHETICAL RESEARCH ONLY. The existing fictional fixtures: the supplied 1.2.0 session and the seven golden sessions
// of the Phase 2 report-engine tests. The generators below are copied verbatim from
// scripts/readiness-review-report-engine-tests.mjs (lines marked) and checked against the pinned log digests in
// scripts/fixtures/readiness-review-report-golden.json, so the simulation reads exactly the records the tests pin.
// Run with the TypeScript loader:
// node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs <script>
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib.mjs';

process.env.MK_READINESS_REVIEW_HARNESS = 'fictional-local';
const lib = (p) => import(path.join(ROOT, 'src/lib/readiness-review', p));
const { replay, commit, initialActions, ensureOwnerServed, newSessionRecord } = await lib('session.ts');
const { canonicalDigest } = await lib('canonical.ts');

// ---- copied from scripts/readiness-review-report-engine-tests.mjs: deterministic() to GOLDEN (unchanged) ----
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

// ---- end of copied section ----

export async function loadFixtures() {
  const fixture = JSON.parse(readFileSync(path.join(ROOT, 'scripts/fixtures/readiness-review-session-1.2.0.json'), 'utf8'));
  const pinned = JSON.parse(readFileSync(path.join(ROOT, 'scripts/fixtures/readiness-review-report-golden.json'), 'utf8'));
  const records = { supplied: fixture.record, ...Object.fromEntries(Object.entries(GOLDEN).map(([k, f]) => [k, f()])) };
  const out = {};
  for (const [name, record] of Object.entries(records)) {
    const logDigest = canonicalDigest(record.actions);
    const expected = pinned.sessions[name]?.logDigest;
    if (logDigest !== expected) throw new Error(`fixture ${name} does not match its pinned log digest`);
    out[name] = { record, engine: replay(record).engine, logDigest, actions: record.actions.length };
  }
  return out;
}
export const FIXTURE_NOTES = {
  supplied: 'Supplied fictional session (1.2.0 fixture): interview ended at the screen limit, reviewer records present',
  earlyStop: 'Golden: respondent stopped after 20 screens',
  fullInterview: 'Golden: interview to its end or limit, then owner answers by function',
  advisory: 'Golden: evidence and reviewer records (Advisory material), with corrections',
  corrections: 'Golden: corrections both ways',
  routes: 'Golden: targeted route answers, a governance practice reported absent',
  strong: 'Golden: every practice reported in place',
  openInterview: 'Golden: interview still in progress after 30 screens'
};
