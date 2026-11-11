// Contract tests for the Fraud Readiness review track adapter (src/lib/readiness-review).
// Run: node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/readiness-review-contract-tests.mjs
// They check that the vendored engine and data match the declared contract, that a stored session replays to exactly
// the same state, that every output is derived from the one engine report, that the respondent and owner channels stay
// separate, and that the V13 recheck defects stay fixed when driven through the adapter rather than the engine alone.
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { READINESS_REVIEW_CONTRACT } from '../src/lib/readiness-review/contract.ts';
import { replay, commit, initialActions, ensureOwnerServed, newSessionRecord, currentRuleset, ActionRejected, ReplayError } from '../src/lib/readiness-review/session.ts';
import { reportFor, snapshotView, managementView, reviewerView, respondentView, ownerView, exportView, waitingProvenance } from '../src/lib/readiness-review/view-model.ts';

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
  const record = newSessionRecord({ sessionId: randomUUID().replace(/-/g, ''), createdAt: tick(), organisationLabel: label, tokens: { respondent: 'r', management: 'm', reviewer: 'v', links: 'l', owners: {} } });
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
  const forged = { ...live.record, engineSha256: '0'.repeat(64), ruleset: { ...live.record.ruleset, engine: { ...live.record.ruleset.engine, sha256: '0'.repeat(64) } } };
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

// ------------------------------------------------------------------------------------------------ independent review corrections
// F1. Every waiting item's stated reason must match the action log and the engine's recorded assignment.
function provenanceAudit(live) {
  const report = reportFor(live);
  const snap = snapshotView(live);
  const lastAnswer = new Map();
  const ownerAnswered = new Set();
  const areas = new Set();
  for (const a of live.record.actions) {
    if (['respondent.answer', 'respondent.correct'].includes(a.type)) lastAnswer.set(a.q, { by: 'respondent', value: a.value });
    if (a.type === 'owner.answer') { lastAnswer.set(a.q, { by: 'owner', value: a.value }); ownerAnswered.add(a.q); }
    if (a.type === 'respondent.assignArea') areas.add(a.domain);
  }
  const isUnknown = (v) => v === 'unknown' || (Array.isArray(v) && v.length === 1 && v[0] === 'unknown');
  const wrong = [];
  const byKind = {};
  for (const w of snap.waiting) {
    const k = w.provenance.kind;
    byKind[k] = (byKind[k] ?? 0) + 1;
    const ans = lastAnswer.get(w.id);
    const row = report.waiting.find((r) => r.id === w.id);
    const ok =
      k === 'respondent-unknown' ? ans?.by === 'respondent' && isUnknown(ans.value) :
      k === 'owner-unknown' ? ans?.by === 'owner' && isUnknown(ans.value) :
      k === 'area' ? !ans && areas.has(live.engine.DOM[w.id]) :
      k === 'not-reached' ? !ans && row.assignment?.origin === 'follow-up' :
      k === 'owner-opened' ? !ans && ownerAnswered.has(row.ownerFollowup?.from) :
      k === 'scope-waiting' ? row.state === 'waiting-scope' :
      false;
    if (!ok) wrong.push(`${w.id}:${k}`);
  }
  // Nothing may claim an unknown answer without one in the log.
  const falseUnknown = snap.waiting.filter((w) => /I don.t know/.test(w.via) && !isUnknown(lastAnswer.get(w.id)?.value)).map((w) => w.id);
  const sumOk = snap.waitingBySource.reduce((n, x) => n + x.count, 0) === report.waiting.length && snap.counts.find((c) => c.key === 'waiting').value === report.waiting.length;
  return { wrong, falseUnknown, byKind, sumOk, total: report.waiting.length };
}

await T('C-19', 'Waiting items state why they are waiting, matched to the action log, before and after owner dispatch', async () => {
  const live = newSession();
  let areaSent = false;
  runInterview(live, (step) => {
    const q = step.q;
    if (q.id.startsWith('D2-') && q.type === 'practice') return 'unknown';
    if (q.id.startsWith('D4-') && q.type === 'practice' && !areaSent) {
      areaSent = true;
      return 'unknown';
    }
    return strong(step);
  });
  // The respondent sends the rest of one area after its first unknown, as the interview offers.
  const d4 = live.engine.DOMS.find((d) => d.startsWith('D4'));
  if (d4 && !live.engine.S.domainAssign[d4]) act(live, { type: 'respondent.assignArea', domain: d4, owner: 'Head of procurement' });
  const before = provenanceAudit(live);
  act(live, { type: 'organisation.sendToOwners' }, 'organisation');
  const after = provenanceAudit(live);
  // An owner answer that opens a confirmation, and an owner who does not know.
  const fns = Object.keys(reportFor(live).ownerPackages);
  let ownerUnknown = false;
  for (const fn of fns) {
    for (let i = 0; i < 3; i++) {
      live.record = { ...live.record, actions: live.record.actions.concat(ensureOwnerServed(live, fn, tick(), () => randomUUID())) };
      const st = live.ownerSteps[fn];
      if (!st) break;
      const value = !ownerUnknown && st.q.type === 'practice' && st.q.format !== 'multi' ? 'unknown' : strong(st);
      if (value === 'unknown') ownerUnknown = true;
      act(live, { type: 'owner.answer', fn, q: st.q.id, value }, 'owner');
    }
  }
  const final = provenanceAudit(live);
  const ok = before.wrong.length === 0 && after.wrong.length === 0 && final.wrong.length === 0 && before.falseUnknown.length + after.falseUnknown.length + final.falseUnknown.length === 0 &&
    before.sumOk && after.sumOk && final.sumOk && !before.byKind['not-reached'] && after.byKind['not-reached'] > 0 && (before.byKind.area ?? 0) > 0 && (before.byKind['respondent-unknown'] ?? 0) > 0;
  return [ok, `before dispatch ${JSON.stringify(before.byKind)}; after ${JSON.stringify(after.byKind)}; after owner answers ${JSON.stringify(final.byKind)}; mismatches ${[...before.wrong, ...after.wrong, ...final.wrong].slice(0, 5).join(',') || 'none'}; false unknown claims ${before.falseUnknown.length + after.falseUnknown.length + final.falseUnknown.length}`];
});

// F2. Concurrent creation, restart, and truthful failure in the fictional file store.
await T('C-20', 'Store: concurrent starts all get resolvable links that survive a restart; damaged or failing storage stores nothing and says so', async () => {
  const { FileReviewStore, StoreUnavailable, StoreConflict } = await import('../src/lib/readiness-review/store.ts');
  const created = await Promise.allSettled(Array.from({ length: 24 }, (_, i) => service.createSession(`Concurrent fictional ${i}`)));
  const fulfilled = created.filter((x) => x.status === 'fulfilled').map((x) => x.value);
  const restarted = new FileReviewStore(dir);
  let resolvable = 0;
  for (const s of fulfilled) {
    const roles = [s.tokens.respondent, s.tokens.management, s.tokens.reviewer, s.tokens.links, ...Object.values(s.tokens.owners)];
    const found = await Promise.all(roles.map((t) => restarted.findToken(t)));
    if (found.every((f) => f && f.sessionId === s.sessionId) && (await restarted.load(s.sessionId))) resolvable++;
  }
  const leftovers = readdirSync(dir).concat(readdirSync(path.join(dir, 'sessions'))).filter((f) => f.endsWith('.tmp') || f.endsWith('.lock'));
  // Injected index failure: nothing is created, no session file is left behind, earlier links still resolve.
  const faultDir = mkdtempSync(path.join(tmpdir(), 'mk-review-fault-'));
  const good = new FileReviewStore(faultDir);
  const rec = (id) => newSessionRecord({ sessionId: id, createdAt: tick(), organisationLabel: 'Fictional fault test', tokens: { respondent: 'R' + id, management: 'M' + id, reviewer: 'V' + id, links: 'L' + id, owners: { Finance: 'F' + id } } });
  await good.create(rec('aaaaaaaaaaaaaaaaaaaa'));
  let indexFailure = null;
  try { await new FileReviewStore(faultDir, { failIndexWrite: true }).create(rec('bbbbbbbbbbbbbbbbbbbb')); } catch (e) { indexFailure = e; }
  const orphan = existsSync(path.join(faultDir, 'sessions', 'bbbbbbbbbbbbbbbbbbbb.json'));
  const earlierStill = (await good.findToken('Raaaaaaaaaaaaaaaaaaaa'))?.sessionId === 'aaaaaaaaaaaaaaaaaaaa';
  // A damaged index is reported, never treated as empty or overwritten.
  writeFileSync(path.join(faultDir, 'tokens.json'), '{"damaged":');
  let damagedCreate = null, damagedLookup = null;
  try { await good.create(rec('cccccccccccccccccccc')); } catch (e) { damagedCreate = e; }
  try { await good.findToken('Raaaaaaaaaaaaaaaaaaaa'); } catch (e) { damagedLookup = e; }
  const indexUntouched = readFileSync(path.join(faultDir, 'tokens.json'), 'utf8') === '{"damaged":';
  // Per-session appends: two saves against the same sequence, one wins and one is a conflict.
  writeFileSync(path.join(faultDir, 'tokens.json'), '{}');
  const appendRace = await Promise.allSettled([good.append('aaaaaaaaaaaaaaaaaaaa', 0, [{ id: 'x1', seq: 0, at: tick(), actor: 'respondent', type: 'respondent.stop' }]), good.append('aaaaaaaaaaaaaaaaaaaa', 0, [{ id: 'x2', seq: 0, at: tick(), actor: 'respondent', type: 'respondent.stop' }])]);
  const appendOk = appendRace.filter((x) => x.status === 'fulfilled').length === 1 && appendRace.some((x) => x.status === 'rejected' && x.reason instanceof StoreConflict) && (await good.load('aaaaaaaaaaaaaaaaaaaa')).actions.length === 1;
  rmSync(faultDir, { recursive: true, force: true });
  const ok = fulfilled.length === 24 && resolvable === 24 && leftovers.length === 0 && indexFailure instanceof StoreUnavailable && /Nothing was created/.test(indexFailure.message) && !orphan && earlierStill &&
    damagedCreate instanceof StoreUnavailable && damagedLookup instanceof StoreUnavailable && indexUntouched && appendOk;
  return [ok, `concurrent starts ${fulfilled.length}/24, resolvable after restart ${resolvable}; temp or lock files left ${leftovers.length}; injected index failure: ${indexFailure?.constructor.name} "${indexFailure?.message}", orphan file ${orphan}, earlier links resolve ${earlierStill}; damaged index: create ${damagedCreate?.constructor.name}, lookup ${damagedLookup?.constructor.name}, untouched ${indexUntouched}; append race one winner and one conflict ${appendOk}`];
});

// F4. A record replays only under the complete ruleset it was recorded with.
await T('C-21', 'Records bind the complete ruleset: mismatched bank, coverage, contract or schema is refused; a 1.2.0 record reproduces its original report', async () => {
  const live = newSession();
  runInterview(live, strong, 30);
  const base = live.record;
  const r = currentRuleset();
  const variants = {
    bankHash: { ...base, ruleset: { ...r, bank: { ...r.bank, sha256: '1'.repeat(64) } } },
    bankDigest: { ...base, ruleset: { ...r, bank: { ...r.bank, digest: '2'.repeat(64) } } },
    bankVersion: { ...base, bankVersion: 'different-bank', ruleset: { ...r, bank: { ...r.bank, version: 'different-bank' } } },
    coverage: { ...base, ruleset: { ...r, coverage: { ...r.coverage, sha256: '3'.repeat(64) } } },
    contract: { ...base, contractVersion: '0.0.0', ruleset: { ...r, contract: { ...r.contract, version: '0.0.0' } } },
    newerContract: { ...base, contractVersion: '9.0.0', ruleset: { ...r, contract: { ...r.contract, version: '9.0.0' } } },
    schema: { ...base, ruleset: { ...r, contract: { ...r.contract, actionSchema: 'mk-readiness-review/actions/2' } } },
    engine: { ...base, engineSha256: 'a'.repeat(64), ruleset: { ...r, engine: { ...r.engine, sha256: 'a'.repeat(64) } } },
    summaryDisagrees: { ...base, bankVersion: 'different-bank' },
    legacyUnknownContract: (() => { const x = { ...base, contractVersion: '0.0.0' }; delete x.ruleset; return x; })(),
    legacyOtherBank: (() => { const x = { ...base, contractVersion: '1.2.0', bankVersion: 'different-bank' }; delete x.ruleset; return x; })()
  };
  const accepted = [];
  for (const [name, rec] of Object.entries(variants)) {
    try { replay(rec); accepted.push(name); } catch (e) { if (!(e instanceof ReplayError)) accepted.push(`${name}:${e.constructor.name}`); }
  }
  const fixture = JSON.parse(readFileSync(path.join(ROOT, 'scripts/fixtures/readiness-review-session-1.2.0.json'), 'utf8'));
  const old = replay(fixture.record);
  const json = JSON.stringify(reportFor(old));
  const reproduced = createHash('sha256').update(json).digest('hex') === fixture.expectedReport.sha256;
  const exp = exportView(old);
  const exportHonest = exp.ruleset.reader === 'historical-1.0-1.2' && exp.ruleset.recorded.contract.version === '1.2.0' && exp.bank.digest === null && exp.contract.version === READINESS_REVIEW_CONTRACT.version;
  const current = exportView(live);
  const currentRecorded = current.ruleset.reader === 'recorded' && current.bank.digest === READINESS_REVIEW_CONTRACT.bank.digest && current.coverage.digest === READINESS_REVIEW_CONTRACT.coverage.digest;
  const ok = accepted.length === 0 && reproduced && exportHonest && currentRecorded;
  return [ok, `refused ${Object.keys(variants).length - accepted.length}/${Object.keys(variants).length} altered records${accepted.length ? `; accepted ${accepted.join(',')}` : ''}; 1.2.0 record report sha matches the 1.2.0 build: ${reproduced}; export names the historical reader: ${exportHonest}; new records export their recorded ruleset: ${currentRecorded}`];
});

// F3. Review role credentials never survive a telemetry boundary. Pure functions with a synthetic marker; no network.
await T('C-22', 'Telemetry: a review credential is removed by the analytics sanitiser and its inline twin, monitoring intake, client capture and the Sentry scrubber', async () => {
  const { sanitiseAnalyticsUrl, analyticsPrivacyBootstrapScript } = await import('../src/lib/website/analytics-url.ts');
  const { sanitiseMonitoringRoute, sanitiseClientErrorPayload } = await import('../src/lib/monitoring/privacy.ts');
  const { scrubSentryEvent } = await import('../src/lib/monitoring/sentry.ts');
  const { telemetryPathname } = await import('../src/lib/monitoring/credential-paths.ts');
  const marker = 'SyntheticAuditMarker0123456789';
  const paths = [`/review/s/${marker}`, `/review/s/${marker}/snapshot`, `/review/api/s/${marker}`, `/review/api/s/${marker}/snapshot`, `/review/api/s/${marker}/export`];
  const urls = paths.flatMap((p) => [`https://www.mkfraudinsights.co.za${p}`, `https://www.mkfraudinsights.co.za${p}?utm_source=x#top`]);
  // The inline bootstrap's sanitiser, run as the browser would run it, with a stub gtag that records page context.
  const calls = [];
  const sandbox = { window: { location: { href: urls[1] }, history: {}, addEventListener() {} }, document: { referrer: urls[0] }, gtag: (...a) => calls.push(a), URL, URLSearchParams };
  new Function('window', 'document', 'gtag', 'URL', 'URLSearchParams', analyticsPrivacyBootstrapScript())(sandbox.window, sandbox.document, sandbox.gtag, URL, URLSearchParams);
  const twin = sandbox.window.mkSanitiseAnalyticsUrl;
  const leaks = [];
  for (const u of urls) {
    const ts = sanitiseAnalyticsUrl(u);
    const js = twin(u);
    if (ts.includes(marker)) leaks.push(`analytics ${u}`);
    if (js !== ts) leaks.push(`twin differs ${u}`);
  }
  if (JSON.stringify(calls).includes(marker)) leaks.push('bootstrap page context');
  for (const p of paths) {
    if (sanitiseMonitoringRoute(p).includes(marker)) leaks.push(`monitoring ${p}`);
    if (JSON.stringify(sanitiseClientErrorPayload({ name: 'Error', route: p, errorCategory: 'uncaught_client_exception' })).includes(marker)) leaks.push(`intake ${p}`);
    if (telemetryPathname(p).includes(marker)) leaks.push(`client ${p}`);
    const event = scrubSentryEvent({ message: `Failed to fetch https://x.test${p}`, transaction: p, tags: { route: p }, exception: { values: [{ type: 'TypeError', value: `GET ${p} failed` }] }, contexts: { page: { url: `https://x.test${p}` } }, fingerprint: [p], request: { url: p }, breadcrumbs: [{ data: { url: p } }] });
    if (JSON.stringify(event).includes(marker)) leaks.push(`sentry ${p}`);
  }
  // Suffixes and unrelated paths are preserved, so the route stays diagnosable and public pages are unchanged.
  const kept = sanitiseMonitoringRoute(`/review/s/${marker}/snapshot`) === '/review/s/:token/snapshot' && sanitiseAnalyticsUrl('https://www.mkfraudinsights.co.za/fraud-readiness?utm_source=x') === 'https://www.mkfraudinsights.co.za/fraud-readiness?utm_source=x' &&
    sanitiseAnalyticsUrl(`https://www.mkfraudinsights.co.za/review/s/${marker}/snapshot`) === 'https://www.mkfraudinsights.co.za/review/s/[redacted]/snapshot' && sanitiseMonitoringRoute('/review') === '/review';
  return [leaks.length === 0 && kept, `${urls.length} URLs and ${paths.length} paths through 6 boundaries; marker survived ${leaks.length} times${leaks.length ? `: ${leaks.slice(0, 4).join('; ')}` : ''}; suffixes and public pages preserved: ${kept}`];
});

// Report input: what a report engine consumes, built only from the stored log.
await T('C-23', 'Report input: deterministic from the log, complete over every control, consistent with the engine report, and carrying no score', async () => {
  const { buildReportInput, reportInputDigest, REPORT_INPUT_CONTRACT } = await import('../src/lib/readiness-review/report-input.ts');
  const { canonicalDigest } = await import('../src/lib/readiness-review/canonical.ts');
  const live = newSession();
  let n = 0;
  runInterview(live, (step) => (step.q.id.startsWith('PR-') || step.q.id === '__assumptions__' ? strong(step) : n++ % 7 === 3 ? (step.q.format === 'multi' ? ['unknown'] : 'unknown') : strong(step)), 120);
  act(live, { type: 'organisation.sendToOwners' }, 'organisation');
  const input = buildReportInput(replay(live.record));
  const again = buildReportInput(replay(JSON.parse(JSON.stringify(live.record))));
  const report = reportFor(replay(live.record));
  const controls = input.domains.flatMap((d) => d.controls);
  const rows = report.domains.flatMap((d) => d.rows);
  const countsMatch = input.domains.every((d) => Object.entries(d.counts).every(([st, n]) => d.controls.filter((c) => c.state === st).length === n));
  const waitingMatch = input.openWork.waiting.map((w) => w.id).join() === report.waiting.map((r) => r.id).join() && input.openWork.waiting.every((w) => w.provenance && w.provenance.kind);
  const gapsMatch = input.findings.reportedGaps.map((g) => g.id).join() === report.issues.map((r) => r.id).join();
  const answersOk = controls.filter((c) => c.answer).every((c) => c.history.every((h) => h.version < c.answer.version)) && controls.filter((c) => c.state === 'reported').every((c) => c.answer && c.class);
  const scoreKeys = [...keysDeep(input)].filter((k) => /^(score|scores|band|bands|rating|ratings|confidence|maturity|predicted|prediction|predictions|readinessLevel)$/i.test(k));
  const lineageOk = input.lineage.logDigest === canonicalDigest(live.record.actions) && input.lineage.actionCount === live.record.actions.length && input.lineage.rulesetReader === 'recorded';
  const fixture = JSON.parse(readFileSync(path.join(ROOT, 'scripts/fixtures/readiness-review-session-1.2.0.json'), 'utf8'));
  const historical = buildReportInput(replay(fixture.record));
  const ok = reportInputDigest(input) === reportInputDigest(again) && controls.length === rows.length && countsMatch && waitingMatch && gapsMatch && answersOk && scoreKeys.length === 0 && input.method.scoring.status === 'withheld' &&
    lineageOk && input.contract.name === REPORT_INPUT_CONTRACT.name && historical.lineage.rulesetReader === 'historical-1.0-1.2' && historical.domains.flatMap((d) => d.controls).length === rows.length &&
    historical.findings.reportedGaps.length === fixture.expectedReport.issues && historical.openWork.waiting.length === fixture.expectedReport.waiting;
  return [ok, `${controls.length} controls (${controls.filter((c) => c.answer).length} answered, ${input.openWork.waiting.length} waiting, ${input.findings.reportedGaps.length} gaps); same digest on a second replay ${reportInputDigest(input) === reportInputDigest(again)}; counts ${countsMatch}, waiting ${waitingMatch}, gaps ${gapsMatch}, answers ${answersOk}; score-like keys ${scoreKeys.length}; lineage ${lineageOk}; 1.2.0 record read through the historical reader ${historical.lineage.rulesetReader} with ${historical.findings.reportedGaps.length} gaps and ${historical.openWork.waiting.length} waiting, as its report recorded`];
});

rmSync(dir, { recursive: true, force: true });
const summary = results.reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {});
results.forEach((r) => console.log(`${r.id.padEnd(6)} ${r.status.padEnd(5)} ${r.name}\n        ${r.detail}`));
console.log(JSON.stringify(summary));
if (process.env.MK_REVIEW_RESULTS) (await import('node:fs')).writeFileSync(process.env.MK_REVIEW_RESULTS, JSON.stringify({ summary, results }, null, 1));
process.exit(summary.fail ? 1 : 0);
