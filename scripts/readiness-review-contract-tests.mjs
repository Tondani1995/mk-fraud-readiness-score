// Contract tests for the Fraud Readiness review track adapter (src/lib/readiness-review).
// Run: node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/readiness-review-contract-tests.mjs
// They check that the vendored engine and data match the declared contract, that a stored session replays to exactly
// the same state, that every output is derived from the one engine report, that the respondent and owner channels stay
// separate, and that the V13 recheck defects stay fixed when driven through the adapter rather than the engine alone.
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { READINESS_REVIEW_CONTRACT } from '../src/lib/readiness-review/contract.ts';
import { replay, commit, initialActions, ensureOwnerServed, ActionRejected, ReplayError } from '../src/lib/readiness-review/session.ts';
import { reportFor, snapshotView, managementView, reviewerView, respondentView, ownerView, exportView } from '../src/lib/readiness-review/view-model.ts';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIB = path.join(ROOT, 'src/lib/readiness-review');
const results = [];
const T = async (id, name, fn) => {
  try {
    const [ok, detail] = await fn();
    results.push({ id, name, status: ok ? 'pass' : 'fail', detail });
  } catch (error) {
    results.push({ id, name, status: 'fail', detail: `threw: ${error && error.stack ? error.stack.split('\n').slice(0, 3).join(' | ') : error}` });
  }
};
const sha = (file) => createHash('sha256').update(readFileSync(path.join(LIB, file))).digest('hex');

// ------------------------------------------------------------------------------------------------ fixtures
let clock = Date.parse('2026-11-02T08:00:00Z');
const tick = () => new Date((clock += 1000)).toISOString();
const PROFILE = { 'PR-01': '50to250', 'PR-12': '50to250m', 'PR-02': 'private', 'PR-13': 'retail', 'PR-04': 'board', 'PR-03': 'no', 'PR-05': 'no', 'PR-06': 'no', 'PR-07': 'no', 'PR-08': 'yes', 'PR-09': 'no', 'PR-10': 'no', 'PR-11': 'yes' };
function newSession(label = 'Fictional Test Co') {
  const record = { sessionId: randomUUID().replace(/-/g, ''), createdAt: tick(), contractVersion: READINESS_REVIEW_CONTRACT.version, engineSha256: READINESS_REVIEW_CONTRACT.engine.sha256, bankVersion: READINESS_REVIEW_CONTRACT.bank.version, organisationLabel: label, fictional: true, tokens: { respondent: 'r', management: 'm', reviewer: 'v', links: 'l', owners: {} }, actions: [] };
  const live = replay(record);
  const first = initialActions(live, tick(), () => randomUUID());
  live.record = { ...record, actions: first };
  return live;
}
function act(live, action, actor = 'respondent') {
  const out = commit(live, action, actor, tick(), () => randomUUID());
  live.record = { ...live.record, actions: live.record.actions.concat(out) };
  return out;
}
function strong(step) {
  const q = step.q;
  if (q.id.startsWith('PR-')) return PROFILE[q.id] ?? q.options.find((o) => o[0] !== 'unknown')[0];
  if (q.id === '__assumptions__') return ['none'];
  if (q.format === 'practice') return 'full';
  if (q.format === 'anchored') return '4';
  if (q.format === 'multi') return q.subPractices ? Object.keys(q.subPractices) : [q.options[0][0]];
  if (q.format === 'choicePractice') return Object.keys(q.practiceMap).find((k) => q.practiceMap[k] === 'full');
  return (q.options.find((o) => o[0] === 'yes') || q.options[0])[0];
}
function runInterview(live, pick = strong, limit = 200) {
  let n = 0;
  while (live.respondentStep && n++ < limit) {
    const step = live.respondentStep;
    act(live, { type: 'respondent.answer', q: step.q.id, value: pick(step) });
  }
  return n;
}
const keysDeep = (o, out = new Set()) => { if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { out.add(k); keysDeep(v, out); } return out; };

// ------------------------------------------------------------------------------------------------ tests
await T('C-01', 'Vendored engine, bank and coverage map match the declared contract hashes', async () => {
  const got = { engine: sha(READINESS_REVIEW_CONTRACT.engine.file), bank: sha(READINESS_REVIEW_CONTRACT.bank.file), coverage: sha(READINESS_REVIEW_CONTRACT.coverage.file) };
  const ok = got.engine === READINESS_REVIEW_CONTRACT.engine.sha256 && got.bank === READINESS_REVIEW_CONTRACT.bank.sha256 && got.coverage === READINESS_REVIEW_CONTRACT.coverage.sha256;
  return [ok, JSON.stringify(got)];
});

await T('C-02', 'A full interview to the 95-screen limit replays to an identical report and question state', async () => {
  const live = newSession();
  runInterview(live);
  const a = reportFor(live);
  const again = replay(live.record);
  const b = reportFor(again);
  const same = JSON.stringify(a) === JSON.stringify(b);
  return [same && a.status.respondentScreens === 95 && a.status.stopReason === 'ceiling' && again.respondentStep === null, `screens ${a.status.respondentScreens}, stop ${a.status.stopReason}, actions ${live.record.actions.length}, replay identical: ${same}`];
});

await T('C-03', 'The respondent channel never serves owner work; an owner-opened confirmation goes to the owner', async () => {
  const live = newSession();
  let sawOwnerKind = false;
  let n = 0;
  while (live.respondentStep && n++ < 200) {
    const step = live.respondentStep;
    if (step.kind.startsWith('owner')) sawOwnerKind = true;
    act(live, { type: 'respondent.answer', q: step.q.id, value: step.q.id === 'D8-S-02' ? 'unknown' : strong(step) });
  }
  const fn = live.engine.functionOf(live.engine.S.assign['D8-S-02']?.owner ?? '');
  live.record = { ...live.record, actions: live.record.actions.concat(ensureOwnerServed(live, fn, tick(), () => randomUUID())) };
  const ownerStep = live.ownerSteps[fn];
  if (!ownerStep || ownerStep.q.id !== 'D8-S-02') return [false, `owner step ${ownerStep?.q.id}`];
  act(live, { type: 'owner.answer', fn, q: 'D8-S-02', value: 'significant' }, 'owner');
  const next = live.ownerSteps[fn];
  const r = reportFor(live);
  return [!sawOwnerKind && live.respondentStep === null && next?.kind === 'owner-followup' && r.status.respondentScreens === 95 && r.status.interview === 'ended',
    `respondent never saw owner work: ${!sawOwnerKind}; after the owner's scope answer the owner's next question is ${next?.q.id} (${next?.kind}); respondent screens ${r.status.respondentScreens}; interview ${r.status.interview}`];
});

await T('C-04', 'An answer for a question that is not on screen is rejected and stores nothing', async () => {
  const live = newSession();
  const before = live.record.actions.length;
  try { commit(live, { type: 'respondent.answer', q: 'D1-A-01', value: 'named' }, 'respondent', tick(), () => randomUUID()); return [false, 'accepted']; }
  catch (error) { return [error instanceof ActionRejected && error.code === 'stale_question' && live.record.actions.length === before, `${error.code}: ${error.message}`]; }
});

await T('C-05', 'Every output is derived from the same report: export views equal page views, counts equal report fields', async () => {
  const live = newSession();
  runInterview(live, (s) => (s.q.type === 'practice' && s.q.id.endsWith('1') ? (s.q.format === 'anchored' ? '0' : s.q.format === 'practice' ? 'absent' : strong(s)) : strong(s)));
  const r = reportFor(live);
  const exp = exportView(live);
  const snap = snapshotView(live);
  const man = managementView(live);
  const sameSnap = JSON.stringify(exp.views.snapshot) === JSON.stringify(snap);
  const sameMan = JSON.stringify(exp.views.management) === JSON.stringify(man);
  const c = Object.fromEntries(snap.counts.map((x) => [x.key, x.value]));
  const ok = sameSnap && sameMan && JSON.stringify(exp.report) === JSON.stringify(r) && c['reported-gaps'] === r.issues.length && c['waiting'] === r.waiting.length && c['open-scenarios'] === r.unresolvedMaterial.length && snap.reportedGaps.length === r.issues.length;
  return [ok, `gaps ${c['reported-gaps']}/${r.issues.length}, waiting ${c.waiting}/${r.waiting.length}, open ${c['open-scenarios']}/${r.unresolvedMaterial.length}, export views identical: ${sameSnap && sameMan}`];
});

await T('C-06', 'No view or export carries a score, maturity band, confidence or predicted state field', async () => {
  const live = newSession();
  runInterview(live);
  const keys = [...keysDeep({ r: respondentView(live), s: snapshotView(live), m: managementView(live), v: reviewerView(live), e: exportView(live).views })];
  const bad = keys.filter((k) => /score|maturity|confidence|band|predict|estimate|probab|weight/i.test(k));
  return [bad.length === 0, bad.length ? `found ${bad.join(', ')}` : `${keys.length} distinct keys checked`];
});

await T('C-07', 'Mixed payroll and payment routes: several selected modes are recorded as such; ["unknown"] waits for an owner', async () => {
  const live = newSession();
  let n = 0, seenG01 = false, seenS02 = false;
  while (live.respondentStep && n++ < 200) {
    const s = live.respondentStep;
    let v = strong(s);
    if (s.q.id === 'D5-G-01') { v = ['inhouse', 'bureau']; seenG01 = true; }
    if (s.q.id === 'D6-S-02') { v = ['unknown']; seenS02 = true; }
    act(live, { type: 'respondent.answer', q: s.q.id, value: v });
  }
  const e = live.engine;
  const g = e.S.ans['D5-G-01'];
  const row = e.rowFor(e.QI['D6-S-02']);
  return [(!seenG01 || JSON.stringify(g.v) === JSON.stringify(['inhouse', 'bureau'])) && (!seenS02 || (row.state === 'waiting' && !!e.S.assign['D6-S-02'])) && (seenG01 || seenS02),
    `D5-G-01 asked: ${seenG01} (${seenG01 ? JSON.stringify(g.v) : '-'}); D6-S-02 asked: ${seenS02} (${seenS02 ? row.state + ', assigned ' + !!e.S.assign['D6-S-02'] : '-'})`];
});

await T('C-08', 'All checks selected on a multi-select practice is not a reported gap', async () => {
  const live = newSession();
  // Drive to D4-M-13 by answering D4-M-01 in place when asked; otherwise strong answers.
  let n = 0, seen = false;
  while (live.respondentStep && n++ < 200) { const s = live.respondentStep; if (s.q.id === 'D4-M-13') seen = true; act(live, { type: 'respondent.answer', q: s.q.id, value: strong(s) }); }
  const e = live.engine;
  if (!seen) {
    // Not reached in this route: answer it directly as a correction-free owner path is not available, so check the rule on the engine class instead.
    const q = e.QI['D4-M-13'];
    return [e.classOf(q, Object.keys(q.subPractices)) === 'full', 'D4-M-13 not reached in this route; engine class for all checks selected is full'];
  }
  const snap = snapshotView(live);
  return [!snap.reportedGaps.some((g) => g.id === 'D4-M-13') && e.S.ans['D4-M-13'].cls === 'full', `class ${e.S.ans['D4-M-13'].cls}; listed as a gap: ${snap.reportedGaps.some((g) => g.id === 'D4-M-13')}`];
});

await T('C-09', 'V13-01 through the adapter: a confirmed review with a follow-up is a task and an action; a follow-up alone is kept', async () => {
  const live = newSession();
  runInterview(live);
  const e = live.engine;
  const ids = Object.keys(e.S.ans).filter((id) => e.QI[id]?.type === 'practice' && e.S.ans[id].cls === 'full').slice(0, 2);
  act(live, { type: 'reviewer.review', q: ids[0], conclusion: 'confirmed', basis: 'Sample', followUp: 'Obtain the branch sample', limitation: '' }, 'reviewer');
  act(live, { type: 'reviewer.review', q: ids[1], conclusion: null, basis: '', followUp: 'Check the sample size', limitation: 'Only head office records were available' }, 'reviewer');
  const v = reviewerView(live);
  const m = managementView(live);
  const mk = m.whoActsNext.find((g) => g.actor === 'MK reviewer');
  const ok = v.tasks.length === 2 && mk && mk.actions.filter((a) => a.type === 'reviewer').length === 2 && v.controls.find((c) => c.id === ids[1]).reviewRecord.limitation === 'Only head office records were available';
  return [ok, `tasks ${v.tasks.map((t) => t.id + ':' + t.conclusion).join(', ')}; MK reviewer actions ${mk?.actions.length}; limitation kept: ${v.controls.find((c) => c.id === ids[1]).reviewRecord.limitation}`];
});

await T('C-10', 'V13-02 and V13-04 through the adapter: a corrected answer never shows an earlier confirmation as current; history keeps bindings', async () => {
  const live = newSession();
  runInterview(live);
  const e = live.engine;
  const id = Object.keys(e.S.ans).find((x) => e.QI[x]?.format === 'anchored' && e.S.ans[x].via === 'respondent');
  act(live, { type: 'reviewer.evidence', q: id, state: 'reviewed-sufficient', basis: 'First sample' }, 'reviewer');
  act(live, { type: 'reviewer.review', q: id, conclusion: 'confirmed', basis: 'First sample', followUp: 'Old task', limitation: '' }, 'reviewer');
  act(live, { type: 'respondent.correct', q: id, value: '0' });
  act(live, { type: 'reviewer.evidence', q: id, state: 'insufficient', basis: 'Second sample' }, 'reviewer');
  const v = reviewerView(live);
  const c = v.controls.find((x) => x.id === id);
  const m = managementView(live);
  const anyOld = JSON.stringify(m.whoActsNext).includes('Old task');
  const ok = c.reviewRecord.current === false && c.queues.reReview && c.evidenceRecord.current && c.evidenceHistory[0].forVer === 1 && c.evidenceHistory[0].basis === 'First sample' && !anyOld && !v.tasks.some((t) => t.id === id);
  return [ok, `${id}: review current ${c.reviewRecord.current}, re-review ${c.queues.reReview}, evidence history v${c.evidenceHistory[0]?.forVer} "${c.evidenceHistory[0]?.basis}", old task in actions: ${anyOld}`];
});

await T('C-11', 'V13-03 through the adapter: an unknown additional route keeps the tier-1 scenario open in the Snapshot', async () => {
  const live = newSession();
  runInterview(live, (s) => (s.q.id === 'PR-06' ? 'unknown' : strong(s)));
  const snap = snapshotView(live);
  const sc = snap.openScenarios.find((x) => x.id === 'FS-D1-07');
  return [!!sc && sc.status === 'route-incomplete' && sc.decidingFacts.some((f) => f.id === 'PR-06'), sc ? `${sc.id} ${sc.status}; deciding facts ${sc.decidingFacts.map((f) => f.id).join(',')}; established: ${sc.established}` : 'FS-D1-07 not listed as open'];
});

await T('C-12', 'Owner continuation after the limit: owner answers do not use respondent screens and do not reopen the interview', async () => {
  const live = newSession();
  runInterview(live, (s) => (s.q.id.startsWith('D2-') && s.q.type === 'practice' ? 'unknown' : strong(s)));
  const before = reportFor(live).status;
  act(live, { type: 'organisation.sendToOwners' }, 'organisation');
  let answered = 0;
  for (const fn of live.engine.FUNCTIONS) {
    live.record = { ...live.record, actions: live.record.actions.concat(ensureOwnerServed(live, fn, tick(), () => randomUUID())) };
    let k = 0;
    while (live.ownerSteps[fn] && k++ < 60) { const st = live.ownerSteps[fn]; act(live, { type: 'owner.answer', fn, q: st.q.id, value: strong(st) }, 'owner'); answered++; }
  }
  const after = reportFor(live).status;
  const again = replay(live.record);
  const same = JSON.stringify(reportFor(again)) === JSON.stringify(reportFor(live));
  return [answered > 0 && after.respondentScreens === before.respondentScreens && after.interview === 'ended' && after.ownerScreens === answered && same,
    `owner answers ${answered}; respondent screens ${before.respondentScreens} then ${after.respondentScreens}; interview ${after.interview}; owner count ${after.ownerScreens}; replay identical: ${same}`];
});

await T('C-13', 'An owner who does not know ends that question without it being served again', async () => {
  const live = newSession();
  runInterview(live, (s) => (s.q.id === 'D8-S-02' ? 'unknown' : strong(s)));
  const fn = live.engine.functionOf(live.engine.S.assign['D8-S-02'].owner);
  live.record = { ...live.record, actions: live.record.actions.concat(ensureOwnerServed(live, fn, tick(), () => randomUUID())) };
  act(live, { type: 'owner.answer', fn, q: 'D8-S-02', value: 'unknown' }, 'owner');
  const next = live.ownerSteps[fn];
  const status = live.engine.S.assign['D8-S-02'].status;
  return [status === 'owner-unknown' && next?.q.id !== 'D8-S-02', `assignment ${status}; next owner question ${next?.q.id ?? 'none'}`];
});

await T('C-14', 'A session recorded by another engine build is refused rather than reinterpreted', async () => {
  const live = newSession();
  const forged = { ...live.record, engineSha256: '0'.repeat(64) };
  try { replay(forged); return [false, 'replayed']; } catch (error) { return [error instanceof ReplayError, error.message]; }
});

await T('C-15', 'Stop, resume and the Snapshot: an early stop leaves every unasked control unconfirmed and visible', async () => {
  const live = newSession();
  runInterview(live, strong, 20);
  act(live, { type: 'respondent.stop' });
  const r = reportFor(live);
  const snap = snapshotView(live);
  const respondent = respondentView(live);
  act(live, { type: 'respondent.resume' });
  const resumed = live.respondentStep;
  return [r.status.stopReason === 'respondent' && respondent.canResume && snap.openScenarios.length > 0 && !!resumed, `stopped after ${r.status.respondentScreens} screens; open material scenarios ${snap.openScenarios.length}; resumed with ${resumed?.q.id}`];
});

// Service-level checks against a temporary harness directory.
const dir = mkdtempSync(path.join(tmpdir(), 'mk-review-harness-'));
process.env.MK_READINESS_REVIEW_HARNESS = 'fictional-local';
process.env.MK_READINESS_REVIEW_HARNESS_DIR = dir;
const service = await import('../src/lib/readiness-review/service.ts');

await T('C-16', 'Service: retried submission is applied once; a stale sequence is a conflict; a failed save stores nothing and a retry succeeds', async () => {
  const s = await service.createSession('Fictional Retail (Pty) Ltd');
  const t = s.tokens.respondent;
  let v = (await service.viewFor(t)).view;
  const id = randomUUID();
  const step = v.step;
  const answer = { type: 'respondent.answer', q: step.q, value: PROFILE[step.q] };
  let failed = false;
  try { await service.submit(t, { actionId: id, expectedSeq: v.seq, action: answer, simulateFailure: true }); } catch (error) { failed = error instanceof service.SaveFailed; }
  const afterFail = (await service.viewFor(t)).view;
  const first = await service.submit(t, { actionId: id, expectedSeq: afterFail.seq, action: answer });
  const second = await service.submit(t, { actionId: id, expectedSeq: afterFail.seq, action: answer });
  let conflict = false;
  try { await service.submit(t, { actionId: randomUUID(), expectedSeq: afterFail.seq, action: answer }); } catch (error) { conflict = error instanceof service.SaveConflict; }
  v = (await service.viewFor(t)).view;
  const stored = JSON.parse(readFileSync(path.join(dir, 'sessions', `${s.sessionId}.json`), 'utf8'));
  const answers = stored.actions.filter((a) => a.type === 'respondent.answer');
  return [failed && afterFail.seq === 1 && !first.duplicate && second.duplicate && conflict && answers.length === 1 && v.step.q !== step.q,
    `simulated failure stored nothing (seq ${afterFail.seq}); first applied, retry duplicate: ${second.duplicate}; stale sequence conflict: ${conflict}; stored answers ${answers.length}`];
});

await T('C-17', 'Service: links are role-scoped; an owner link cannot answer as the respondent and a reviewer link cannot answer at all', async () => {
  const s = await service.createSession('Fictional Mining (Pty) Ltd');
  const fnToken = Object.values(s.tokens.owners)[0];
  const v = (await service.viewFor(s.tokens.respondent)).view;
  let ownerBlocked = false, reviewerBlocked = false;
  try { await service.submit(fnToken, { actionId: randomUUID(), expectedSeq: v.seq, action: { type: 'respondent.answer', q: v.step.q, value: PROFILE[v.step.q] } }); } catch (error) { ownerBlocked = error.code === 'not_allowed'; }
  try { await service.submit(s.tokens.reviewer, { actionId: randomUUID(), expectedSeq: v.seq, action: { type: 'respondent.answer', q: v.step.q, value: PROFILE[v.step.q] } }); } catch (error) { reviewerBlocked = error.code === 'not_allowed'; }
  return [ownerBlocked && reviewerBlocked, `owner blocked ${ownerBlocked}, reviewer blocked ${reviewerBlocked}`];
});

await T('C-18', 'The public Snapshot preview example is what the engine produces for its fictional answers, and carries no score', async () => {
  const { spawnSync } = await import('node:child_process');
  const run = spawnSync(process.execPath, ['--experimental-strip-types', '--experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs', 'scripts/readiness-review-preview-fixture.mjs', '--check'], { cwd: ROOT, encoding: 'utf8' });
  const fixture = JSON.parse(readFileSync(path.join(LIB, 'fixtures/preview-example.json'), 'utf8'));
  const banned = [...keysDeep(fixture)].filter((k) => /score|maturity|band|confidence|predict/i.test(k));
  const sameEngine = fixture.engineSha256 === READINESS_REVIEW_CONTRACT.engine.sha256;
  return [run.status === 0 && banned.length === 0 && sameEngine, `${(run.stdout || run.stderr).trim().split('\n').pop()}; engine matches contract: ${sameEngine}; scored fields: ${banned.length}`];
});

rmSync(dir, { recursive: true, force: true });
const summary = results.reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {});
results.forEach((r) => console.log(`${r.id.padEnd(6)} ${r.status.padEnd(5)} ${r.name}\n        ${r.detail}`));
console.log(JSON.stringify(summary));
if (process.env.MK_REVIEW_RESULTS) (await import('node:fs')).writeFileSync(process.env.MK_REVIEW_RESULTS, JSON.stringify({ summary, results }, null, 1));
process.exit(summary.fail ? 1 : 0);
