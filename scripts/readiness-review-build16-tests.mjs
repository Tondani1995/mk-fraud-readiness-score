// Build 1.6 (staged completion) tests for the fictional review harness.
// Run: node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/readiness-review-build16-tests.mjs [--update]
// Every session is fictional. Journeys run through the real session layer (commit, serve, replay) and the service
// (store, tokens, sequence checks) exactly as the pages do. Build 1.6 is inactive for customers and produces no score.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { READINESS_REVIEW_CONTRACT } from '../src/lib/readiness-review/contract.ts';
import { replay, ActionRejected, newSessionRecord, currentRuleset, initialActions } from '../src/lib/readiness-review/session.ts';
import { statusView, ownerView, snapshotView, managementView, respondentView, reportFor } from '../src/lib/readiness-review/view-model.ts';
import { buildStagedReportInput, STAGED_REPORT_INPUT_CONTRACT } from '../src/lib/readiness-review/report-input.ts';
import { toRevisedAssessmentContext } from '../src/lib/readiness-review/revised-adapter.ts';
import { dispatchFixedScoring, RevisedMethodologyInactive } from '../src/lib/scoring/methodology-dispatch.ts';
import { createReviewEngine } from '../src/lib/readiness-review/engine.ts';
import { JOURNEY_PROFILES, makeClock, newStagedSession, act, serveOwner, runRespondent, runOwners, runJourney, respondentAnswer, ownerAnswer } from './lib/build16-driver.mjs';
import { QI as SIM_QI, practiceValue } from './research/scoring-simulation/lib.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIB = path.join(ROOT, 'src/lib/readiness-review');
const GOLDEN = path.join(ROOT, 'scripts/fixtures/readiness-review-build16-golden.json');
const UPDATE = process.argv.includes('--update');
const sha = (file) => createHash('sha256').update(readFileSync(path.join(LIB, file))).digest('hex');
const hash = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
const results = [];
const T = async (id, name, fn) => {
  try {
    const [ok, detail] = await fn();
    results.push({ id, name, status: ok ? 'pass' : 'fail', detail });
  } catch (error) {
    results.push({ id, name, status: 'fail', detail: `threw: ${error && error.stack ? error.stack.split('\n').slice(0, 4).join(' | ') : error}` });
  }
};
const DONE = ['reported', 'reused', 'na', 'waiting'];
const EXCLUDED = ['outofscope', 'proportion', 'precluded', 'retired'];
const SCORE_KEY = /(^|[^a-z])(score|scores|scored|maturity|band|rating|weight|readinessIndex)([^a-z]|$)/i;
function keysDeep(v, out = new Set(), trail = '') {
  if (Array.isArray(v)) v.forEach((x) => keysDeep(x, out, trail));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { out.add(k); keysDeep(x, out, `${trail}.${k}`); }
  return out;
}
/** Every confirmation of every scenario that applies or may apply is answered, reused, not applicable or with a function. */
function unreached(report) {
  return report.scenarios.filter((s) => s.status !== 'outofscope').flatMap((s) => (s.confirmations.length ? s.confirmations.filter((c) => !DONE.includes(c.state) && !EXCLUDED.includes(c.state)).map((c) => `${s.id}:${c.id}:${c.state}`) : s.status === 'waiting' ? [] : [`${s.id}:${s.status}`]));
}
const currentAnswers = (e) => Object.fromEntries(Object.entries(e.S.ans).filter(([, a]) => !a.stale).map(([id, a]) => [id, JSON.stringify(a.v)]));

// ------------------------------------------------------------------------------------------------ contract and binding
await T('B16-01', 'Contract: build 1.6 is pinned by hash, composes the unchanged build 1.5, and is off unless the fictional harness asks for it', async () => {
  const c = READINESS_REVIEW_CONTRACT;
  const ok16 = sha('vendor/review-engine-build-1.6.cjs') === c.stagedBuild.engine.sha256;
  const ok15 = sha('vendor/review-engine-build-1.5.cjs') === c.engine.sha256 && c.stagedBuild.engine.composes.sha256 === c.engine.sha256;
  const { reviewEngineBuild } = await import('../src/lib/readiness-review/harness.ts');
  const saved = { h: process.env.MK_READINESS_REVIEW_HARNESS, b: process.env.MK_READINESS_REVIEW_ENGINE, v: process.env.VERCEL_ENV };
  process.env.MK_READINESS_REVIEW_ENGINE = '1.6';
  delete process.env.MK_READINESS_REVIEW_HARNESS;
  const offWithoutHarness = reviewEngineBuild() === '1.5';
  process.env.MK_READINESS_REVIEW_HARNESS = 'fictional-local';
  const onInHarness = reviewEngineBuild() === '1.6';
  process.env.VERCEL_ENV = 'production';
  const offInProduction = reviewEngineBuild() === '1.5';
  delete process.env.MK_READINESS_REVIEW_ENGINE;
  delete process.env.VERCEL_ENV;
  const defaultIs15 = reviewEngineBuild() === '1.5';
  Object.entries({ MK_READINESS_REVIEW_HARNESS: saved.h, MK_READINESS_REVIEW_ENGINE: saved.b, VERCEL_ENV: saved.v }).forEach(([k, v]) => (v === undefined ? delete process.env[k] : (process.env[k] = v)));
  return [ok16 && ok15 && offWithoutHarness && onInHarness && offInProduction && defaultIs15 && /Not approved by MK/.test(c.stagedBuild.approval),
    `1.6 hash pinned: ${ok16}; 1.5 unchanged: ${ok15}; off without harness ${offWithoutHarness}, on in harness ${onInHarness}, off in production ${offInProduction}, default 1.5 ${defaultIs15}`];
});

await T('B16-02', 'Ruleset binding: a 1.6 session records its build and replays only under it; a 1.5 session keeps the 95-screen engine', async () => {
  const clock = makeClock();
  const live = newStagedSession('Fictional Binding Co', clock);
  const r = live.record.ruleset;
  const recorded = r.engine.build === '1.6' && r.contract.version === '1.4.0' && r.contract.actionSchema === 'mk-readiness-review/actions/2';
  let tamperRefused = false;
  try { replay({ ...live.record, ruleset: { ...r, engine: { ...r.engine, sha256: '0'.repeat(64) } } }); } catch { tamperRefused = true; }
  let swapRefused = false;
  try { replay({ ...live.record, ruleset: currentRuleset('1.5') }); } catch { swapRefused = true; }
  const old = newStagedSession('Fictional Legacy Co', makeClock(), '1.5');
  const oldView = statusView(reportFor(old));
  const legacy = old.engine.build === undefined && oldView.limit === 95 && oldView.stages === null && snapshotView(old).staged === null;
  return [recorded && tamperRefused && legacy && (swapRefused || live.record.actions.length > 0),
    `recorded build ${r.engine.build}, contract ${r.contract.version}, schema ${r.contract.actionSchema}; tampered hash refused ${tamperRefused}; 1.5 session limit ${oldView.limit}, stages ${oldView.stages}`];
});

// ------------------------------------------------------------------------------------------------ journeys
const golden = existsSync(GOLDEN) ? JSON.parse(readFileSync(GOLDEN, 'utf8')) : {};
const fresh = {};
const journeys = {};
for (const pk of Object.keys(JOURNEY_PROFILES)) {
  await T(`B16-J-${pk}`, `Journey ${pk} (${JOURNEY_PROFILES[pk].name}): every applicable confirmation is reached without a screen ceiling; packages are sent and answered; replay is identical; nothing is scored`, async () => {
    const decline = pk === 'P3' ? (fn, step, live) => (fn === 'Procurement' && live.engine.S.assign[step.q.id]?.origin === 'depth' ? 'Fictional: supplier vetting is run by the operations team, not procurement' : null) : null;
    const j = runJourney(pk, { decline });
    journeys[pk] = j;
    const e = j.live.engine;
    const st = j.final.staged;
    const open = unreached(j.final);
    const reached = j.afterInterview.stages.breadth.complete && open.length === 0;
    const replayed = replay(j.live.record).engine.report();
    const sameReplay = hash({ s: replayed.staged, sc: replayed.scenarios, st: replayed.status }) === hash({ s: j.final.staged, sc: j.final.scenarios, st: j.final.status });
    const ownerActions = {};
    j.live.record.actions.filter((a) => a.type === 'owner.answer').forEach((a) => { ownerActions[a.fn] = (ownerActions[a.fn] || 0) + 1; });
    const workloadMatches = st.workload.respondent === e.respondentScreens() && Object.entries(ownerActions).every(([fn, n]) => st.workload[fn] === n);
    const checks = st.consistency.checks;
    const perDomain = new Set(checks.map((c) => c.domain)).size === checks.length;
    const scored = [...keysDeep(st), ...keysDeep(buildStagedReportInput(j.live).staged)].filter((k) => SCORE_KEY.test(k));
    const summary = {
      respondentScreens: e.respondentScreens(), kinds: j.respondent.kinds,
      afterInterview: { core: j.afterInterview.stages.core, breadth: j.afterInterview.stages.breadth },
      sends: j.sends, ownerScreens: j.owners.screens, declined: j.owners.declined.length,
      consistency: { eligible: st.consistency.eligible, selected: st.consistency.selected, answered: st.consistency.answered, untested: st.consistency.untested, counts: st.consistency.counts },
      final: { stage: st.stages.current, breadth: st.stages.breadth, packagesOpen: st.stages.packages.open },
      workload: st.workload, actions: j.live.record.actions.length, digest: hash({ staged: j.final.staged, answers: currentAnswers(e) })
    };
    fresh[pk] = summary;
    const goldenOk = UPDATE || !golden[pk] || JSON.stringify(golden[pk]) === JSON.stringify(summary);
    const beyondCeiling = JOURNEY_PROFILES[pk].profile === 'S' || e.respondentScreens() > 95;
    return [reached && sameReplay && workloadMatches && perDomain && checks.length <= 10 && scored.length === 0 && st.stages.current === 'complete' && beyondCeiling && goldenOk,
      `respondent ${summary.respondentScreens} screens (${Object.entries(summary.kinds).map(([k, v]) => `${k} ${v}`).join(', ')}); breadth after interview ${j.afterInterview.stages.breadth.answered + j.afterInterview.stages.breadth.withFunctions}/${j.afterInterview.stages.breadth.applicableSoFar}, unreached ${open.length}; sends ${j.sends.join('+')}; function screens ${Object.values(j.owners.screens).reduce((a, b) => a + b, 0)}; declined ${summary.declined}; consistency ${st.consistency.selected} of ${st.consistency.eligible} eligible (${JSON.stringify(st.consistency.counts)}); replay identical ${sameReplay}; workload matches ${workloadMatches}; scored keys ${scored.length}; golden ${goldenOk}`];
  });
}

// ------------------------------------------------------------------------------------------------ correction after a completed stage
await T('B16-03', 'A completed stage reopens when a correction brings new questions into scope, keeps every still-valid answer and completes again', async () => {
  const clock = makeClock();
  const live = newStagedSession('Fictional Mixed Co', clock);
  runRespondent(live, clock, 'P3');
  const e = live.engine;
  const before = e.stages();
  // Find a fact answered "no" whose change to "yes" opens more confirmations (tried on a replayed copy, not the session).
  const facts = Object.entries(e.S.ans).filter(([id, a]) => !a.stale && a.via === 'respondent' && e.QI[id] && e.QI[id].type !== 'practice' && JSON.stringify(a.v) === '"no"' && e.QI[id].options.some((o) => o[0] === 'yes')).map(([id]) => id);
  let fact = null;
  for (const id of facts) {
    const copy = replay(live.record);
    const c2 = makeClock('2026-11-11T12:00:00Z');
    act(copy, c2, { type: 'respondent.correct', q: id, value: 'yes' });
    if (copy.engine.stages().breadth.applicableSoFar > before.breadth.applicableSoFar) { fact = id; break; }
  }
  if (!fact) return [false, `no fact correction opened new confirmations (tried ${facts.length})`];
  const answersBefore = currentAnswers(e);
  act(live, clock, { type: 'respondent.correct', q: fact, value: 'yes' });
  const reopened = e.stages();
  const servedNew = !!live.respondentStep && !e.S.ended;
  const kept = Object.entries(answersBefore).filter(([id]) => id !== fact).every(([id, v]) => !e.S.ans[id].stale ? JSON.stringify(e.S.ans[id].v) === v : true);
  const staleCount = Object.keys(answersBefore).filter((id) => e.S.ans[id].stale).length;
  runRespondent(live, clock, 'P3');
  const after = e.stages();
  // Scope reduced again: answers in the scenarios the fact opened become stale (kept in history), and come back for
  // reconfirmation, not silently, when the fact is restored.
  act(live, clock, { type: 'respondent.correct', q: fact, value: 'no' });
  const stale = Object.entries(e.S.ans).filter(([, a]) => a.stale).map(([id]) => id);
  const reduced = e.stages();
  act(live, clock, { type: 'respondent.correct', q: fact, value: 'yes' });
  const reconfirm = live.respondentStep?.kind;
  const r2 = runRespondent(live, clock, 'P3');
  const final = e.stages();
  const restored = stale.every((id) => !e.S.ans[id].stale || e.scope(e.QI[id]).st !== 'applicable');
  return [!before.breadth.open && reopened.current !== 'complete' && !reopened.breadth.complete && servedNew && kept && after.breadth.complete && after.breadth.applicableSoFar > before.breadth.applicableSoFar && stale.length > 0 && reduced.breadth.complete && (reconfirm === 'reconfirm' || (r2.kinds.reconfirm ?? 0) > 0) && final.breadth.complete && restored,
    `${fact} corrected to yes: stage ${before.current} -> ${reopened.current} (${reopened.breadth.open} open), new question served ${servedNew}, valid answers kept ${kept} (${staleCount} stale); completed again with ${after.breadth.applicableSoFar} confirmations (was ${before.breadth.applicableSoFar}); set back to no: ${stale.length} answers kept as stale; restored: first step ${reconfirm}, reconfirmations ${r2.kinds.reconfirm ?? 0}, stage ${final.current}`];
});

await T('B16-04', 'Interruption: stopping and resuming, or rebuilding the session from its stored log part-way, gives the same answers as an uninterrupted interview', async () => {
  const c1 = makeClock();
  const straight = newStagedSession('Fictional Mixed Co', c1);
  runRespondent(straight, c1, 'P3');
  const c2 = makeClock();
  let live = newStagedSession('Fictional Mixed Co', c2);
  runRespondent(live, c2, 'P3', { onStep: (_s, l) => (l.engine.respondentScreens() >= 30 ? 'pause' : null) });
  act(live, c2, { type: 'respondent.stop' });
  const stopped = live.engine.S.ended && live.engine.S.stopReason === 'respondent' && respondentView(live).canResume;
  live = replay(live.record); // a new server process picks the session up from the stored log
  act(live, c2, { type: 'respondent.resume' });
  runRespondent(live, c2, 'P3', { onStep: (_s, l) => (l.engine.respondentScreens() >= 80 ? 'pause' : null) });
  live = replay(live.record);
  runRespondent(live, c2, 'P3');
  const same = JSON.stringify(currentAnswers(straight.engine)) === JSON.stringify(currentAnswers(live.engine));
  return [stopped && same && live.engine.stages().breadth.complete, `stopped and resumable ${stopped}; rebuilt twice from the log; answers identical to the uninterrupted interview ${same} (${Object.keys(currentAnswers(live.engine)).length} answers)`];
});

// ------------------------------------------------------------------------------------------------ consistency
await T('B16-05', 'Consistency checks: each answer is classified as consistent, narrower scope, partial operation, not yet operating, conflicting, untested or missing; nothing is adjusted', async () => {
  const clock = makeClock();
  const live = newStagedSession('Fictional Consistency Co', clock);
  const wanted = ['conflicting', 'narrower-scope', 'partial-operation', 'not-yet-operating', 'no-case-yet', 'missing-information', 'consistent'];
  const used = new Map();
  const valueFor = (q, outcome) => {
    if (outcome === 'missing-information') return q.format === 'multi' ? ['unknown'] : 'unknown';
    if (outcome === 'no-case-yet') return q.options?.some((o) => o[0] === 'noevent') ? 'noevent' : null;
    if (outcome === 'partial-operation') return q.format === 'anchored' ? '2' : null;
    if (outcome === 'narrower-scope') return q.format === 'practice' ? 'partial' : q.format === 'choicePractice' ? (Object.keys(q.practiceMap).find((k) => q.practiceMap[k] === 'partial') ?? null) : null;
    if (outcome === 'not-yet-operating') return q.format === 'practice' ? 'designed' : q.format === 'choicePractice' ? (Object.keys(q.practiceMap).find((k) => q.practiceMap[k] === 'designed') ?? null) : null;
    if (outcome === 'conflicting') return practiceValue(q, 'absent');
    return practiceValue(q, 'full');
  };
  let pendingSeen = null;
  runRespondent(live, clock, 'P1', {
    onStep: (step, l) => {
      if (step.kind !== 'consistency') return null;
      if (!pendingSeen) pendingSeen = l.engine.consistencySummary().checks.find((c) => c.followup === step.q.id)?.outcome;
      for (const o of wanted) { if (used.has(o)) continue; const v = valueFor(step.q, o); if (v !== null) { used.set(o, step.q.id); return { type: 'respondent.answer', q: step.q.id, value: v }; } }
      return null;
    }
  });
  const e = live.engine;
  let summary = e.consistencySummary();
  const mismatched = [...used.entries()].filter(([o, q]) => summary.checks.find((c) => c.followup === q)?.outcome !== o);
  // A confirmation corrected after its check: the check is superseded and its answer is kept as given.
  const target = summary.checks.find((c) => c.outcome === 'consistent');
  const confirmationBefore = target ? JSON.stringify(e.S.ans[target.confirmation].v) : null;
  if (target) act(live, clock, { type: 'respondent.correct', q: target.confirmation, value: practiceValue(e.QI[target.confirmation], 'partial') });
  if (live.respondentStep) runRespondent(live, clock, 'P1');
  summary = e.consistencySummary();
  const superseded = target && summary.checks.find((c) => c.confirmation === target.confirmation)?.outcome === 'superseded';
  const answeredOutcomes = ['consistent', 'narrower-scope', 'partial-operation', 'not-yet-operating', 'conflicting', 'no-case-yet'];
  const tested = summary.checks.filter((c) => answeredOutcomes.includes(c.outcome)).length;
  const honest = summary.answered === tested && summary.untested === summary.eligible - summary.checks.filter((c) => c.outcome !== 'superseded').length && summary.checks.every((c) => e.S.v16.consistency.some((x) => x.followup === c.followup));
  const limitation = /self-reported/.test(summary.limitation) && /not evidence/.test(summary.limitation) && /No score or band is adjusted/.test(summary.limitation);
  // The earlier answer is kept in the confirmation's history: a check never rewrites what was reported.
  const unchanged = !!target && (e.S.ans[target.confirmation].hist ?? []).some((h) => JSON.stringify(h.v) === confirmationBefore);
  const scored = [...keysDeep(summary)].filter((k) => SCORE_KEY.test(k));
  return [mismatched.length === 0 && used.size >= 4 && superseded && honest && limitation && pendingSeen === 'pending' && scored.length === 0 && unchanged,
    `outcomes produced: ${[...used.keys()].join(', ')}; mismatches ${mismatched.length}; superseded after correction ${superseded} (earlier answer kept in history ${unchanged}); before an answer the check reads ${pendingSeen}; population ${summary.eligible}, selected ${summary.selected}, tested ${summary.answered}, untested ${summary.untested}; limitation stated ${limitation}`];
});

// ------------------------------------------------------------------------------------------------ depth selection and packages
await T('B16-06', 'Depth selection: recommended by information gain within limits, chosen ids honoured, never assigned twice, recomputed as answers arrive', async () => {
  const clock = makeClock();
  const live = newStagedSession('Fictional Mixed Co', clock);
  const e = live.engine;
  let earlyRefused = false;
  runRespondent(live, clock, 'P3', { onStep: (_s, l) => (l.engine.respondentScreens() >= 10 ? 'pause' : null) });
  try { act(live, clock, { type: 'organisation.sendToOwners' }, 'organisation'); } catch (error) { earlyRefused = error instanceof ActionRejected; }
  runRespondent(live, clock, 'P3');
  const cands = e.depthCandidates();
  const sel = e.selectDepth();
  const perFn = {}, perScen = {}, perObj = {};
  sel.forEach((c) => { perFn[c.fn] = (perFn[c.fn] || 0) + 1; if (c.kind === 'diagnostic') perScen[c.scenario] = (perScen[c.scenario] || 0) + 1; if (c.kind === 'coverage') perObj[c.objective] = (perObj[c.objective] || 0) + 1; });
  const withinLimits = sel.every((c) => c.gain >= 3) && Object.values(perFn).every((n) => n <= 15) && Object.values(perScen).every((n) => n <= 4) && Object.values(perObj).every((n) => n <= 2);
  const sorted = cands.every((c, i) => i === 0 || cands[i - 1].gain >= c.gain);
  let invalidRefused = false;
  try { act(live, clock, { type: 'organisation.sendToOwners', depth: ['D1-A-01'] }, 'organisation'); } catch (error) { invalidRefused = error instanceof ActionRejected; }
  const chosen = cands.filter((c) => !sel.some((s) => s.id === c.id)).slice(0, 2).map((c) => c.id);
  act(live, clock, { type: 'organisation.sendToOwners', depth: chosen }, 'organisation');
  const chosenAssigned = chosen.every((id) => e.S.assign[id]?.origin === 'depth');
  act(live, clock, { type: 'organisation.sendToOwners', depth: 'none' }, 'organisation');
  const noneAssigned = e.S.v16.sends.at(-1).assigned.length === 0;
  act(live, clock, { type: 'organisation.sendToOwners' }, 'organisation');
  const first = e.S.v16.sends.at(-1).assigned;
  const histories = Object.values(e.S.assign).map((a) => a.hist.length);
  act(live, clock, { type: 'organisation.sendToOwners' }, 'organisation');
  const again = e.S.v16.sends.at(-1).assigned;
  const noDuplicates = again.every((id) => !first.includes(id) && !chosen.includes(id)) && Object.values(e.S.assign).map((a) => a.hist.length).slice(0, histories.length).every((n, i) => n === histories[i]);
  const candidatesBefore = new Set(e.depthCandidates().map((c) => c.id));
  runOwners(live, clock, 'P3');
  const afterAnswers = e.depthCandidates().map((c) => c.id);
  const opened = afterAnswers.filter((id) => !candidatesBefore.has(id));
  return [earlyRefused && withinLimits && sorted && invalidRefused && chosenAssigned && noneAssigned && first.length > 0 && noDuplicates && cands.length > sel.length,
    `refused before the core stage ${earlyRefused}; ${cands.length} candidates, ${sel.length} recommended (gain >= 3, limits held ${withinLimits}); a non-candidate id refused ${invalidRefused}; 2 chosen ids assigned ${chosenAssigned}; "none" assigned nothing ${noneAssigned}; recommended send ${first.length}, repeat send ${again.length} with no duplicates ${noDuplicates}; after the functions answered, ${opened.length} new candidates opened by their answers`];
});

await T('B16-07', 'Declined questions: kept outstanding with the reason, never re-served or reassigned, and listed for the organisation; area questions can be declined too', async () => {
  const clock = makeClock();
  const live = newStagedSession('Fictional Decline Co', clock);
  const e = live.engine;
  runRespondent(live, clock, 'P3', { onStep: (_s, l) => (l.engine.stages().core.complete ? 'pause' : null) });
  act(live, clock, { type: 'respondent.assignArea', domain: 'D4', owner: 'Procurement manager' });
  runRespondent(live, clock, 'P3');
  const fn = 'Procurement';
  // An area question on screen, declined, before any package is sent.
  let step = serveOwner(live, clock, fn);
  const areaQ = step?.kind === 'owner-package' && !e.S.assign[step.q.id] ? step.q.id : null;
  let noReasonRefused = false;
  try { act(live, clock, { type: 'owner.decline', fn, q: step.q.id, reason: '   ' }, 'owner'); } catch (error) { noReasonRefused = error instanceof ActionRejected; }
  act(live, clock, { type: 'owner.decline', fn, q: step.q.id, reason: 'Fictional: this sits with operations' }, 'owner');
  const firstDeclined = step.q.id;
  act(live, clock, { type: 'organisation.sendToOwners' }, 'organisation');
  // A package item declined later.
  const served = [firstDeclined];
  let packageDeclined = null;
  step = live.ownerSteps[fn];
  let guard = 0;
  while (step && guard++ < 300) {
    served.push(step.q.id);
    if (!packageDeclined && e.S.assign[step.q.id]?.origin === 'depth') { packageDeclined = step.q.id; act(live, clock, { type: 'owner.decline', fn, q: step.q.id, reason: 'Fictional: not a procurement control' }, 'owner'); }
    else act(live, clock, { type: 'owner.answer', fn, q: step.q.id, value: ownerAnswer('P3', step.q) }, 'owner');
    step = live.ownerSteps[fn];
  }
  const declinedIds = [firstDeclined, packageDeclined].filter(Boolean);
  const notReServed = declinedIds.every((id) => served.filter((x) => x === id).length === 1);
  let wrongFnRefused = false;
  try { act(live, clock, { type: 'owner.decline', fn: 'Finance', q: packageDeclined ?? firstDeclined, reason: 'Fictional' }, 'owner'); } catch (error) { wrongFnRefused = error instanceof ActionRejected; }
  act(live, clock, { type: 'organisation.sendToOwners' }, 'organisation');
  runOwners(live, clock, 'P3');
  const stillDeclined = declinedIds.every((id) => e.S.assign[id].status === 'declined' && e.S.assign[id].fn === fn && e.S.assign[id].declineReason);
  const respondentNotServed = !live.respondentStep || !declinedIds.includes(live.respondentStep.q.id);
  const view = statusView(reportFor(live)).stages;
  const listed = declinedIds.every((id) => view.outstanding.declinedItems.some((d) => d.q === id && d.fn === fn && d.reason));
  const ov = ownerView(live, fn);
  const shownToFunction = declinedIds.every((id) => ov.items.some((i) => i.id === id && i.status === 'declined' && i.declineReason));
  const legacy = newStagedSession('Fictional Legacy Co', makeClock(), '1.5');
  let legacyRefused = false;
  try { act(legacy, makeClock(), { type: 'owner.decline', fn, q: 'D4-A-01', reason: 'x' }, 'owner'); } catch (error) { legacyRefused = error instanceof ActionRejected; }
  return [!!areaQ && !!packageDeclined && noReasonRefused && notReServed && wrongFnRefused && stillDeclined && respondentNotServed && listed && shownToFunction && legacyRefused && view.current === 'complete',
    `area question ${areaQ} and package question ${packageDeclined} declined; reason required ${noReasonRefused}; never served again ${notReServed}; another function cannot decline it ${wrongFnRefused}; still declined after a further send ${stillDeclined}; listed as outstanding with reasons ${listed}; shown to the function ${shownToFunction}; stage ${view.current} with ${view.outstanding.declined} declined; 1.5 refuses declines ${legacyRefused}`];
});

await T('B16-08', 'Overlapping assignments: an "I don\'t know" in a delegated area, repeated sends and a scope change never produce a question in two packages or a second assignment', async () => {
  const clock = makeClock();
  const live = newStagedSession('Fictional Overlap Co', clock);
  const e = live.engine;
  let unknownQ = null;
  runRespondent(live, clock, 'P3', {
    onStep: (step, l) => {
      if (!unknownQ && step.q.type === 'practice' && l.engine.DOM[step.q.id] === 'D4') { unknownQ = step.q.id; return { type: 'respondent.answer', q: step.q.id, value: step.q.format === 'multi' ? ['unknown'] : 'unknown' }; }
      return l.engine.stages().core.complete && unknownQ ? 'pause' : null;
    }
  });
  const assignedFn = e.S.assign[unknownQ]?.fn;
  const areaOwner = assignedFn === 'Finance' ? 'Procurement manager' : 'Financial controller';
  act(live, clock, { type: 'respondent.assignArea', domain: 'D4', owner: areaOwner });
  runRespondent(live, clock, 'P3');
  act(live, clock, { type: 'organisation.sendToOwners' }, 'organisation');
  act(live, clock, { type: 'organisation.sendToOwners' }, 'organisation');
  const servedBy = {};
  for (const fn of e.FUNCTIONS) {
    let step = serveOwner(live, clock, fn);
    let n = 0;
    while (step && n++ < 300) {
      (servedBy[step.q.id] ??= new Set()).add(fn);
      act(live, clock, { type: 'owner.answer', fn, q: step.q.id, value: ownerAnswer('P3', step.q) }, 'owner');
      step = live.ownerSteps[fn];
    }
  }
  const twice = Object.entries(servedBy).filter(([, s]) => s.size > 1).map(([id]) => id);
  const reassigned = Object.values(e.S.assign).filter((a) => new Set(a.hist.filter((h) => h.status).map(() => a.fn)).size > 1);
  const unknownWentToAssigned = servedBy[unknownQ] && [...servedBy[unknownQ]][0] === assignedFn;
  act(live, clock, { type: 'organisation.sendToOwners' }, 'organisation');
  const repeatAssigned = e.S.v16.sends.at(-1).assigned.filter((id) => servedBy[id]);
  return [!!unknownQ && twice.length === 0 && reassigned.length === 0 && unknownWentToAssigned && repeatAssigned.length === 0,
    `"I don't know" on ${unknownQ} went to ${assignedFn}; area D4 delegated to ${areaOwner}; questions served to two functions: ${twice.length}; reassigned: ${reassigned.length}; a later send re-assigned answered questions: ${repeatAssigned.length}`];
});

await T('B16-09', 'Combined workload per person: breadth and function packages are counted together, from the action log, for stated fictional staffing', async () => {
  const j = journeys.P5 ?? runJourney('P5');
  const w = j.final.staged.workload;
  const total = j.live.record.actions.filter((a) => a.type === 'respondent.answer' || a.type === 'owner.answer').length;
  const assumptionsScreens = j.live.record.actions.filter((a) => a.type === 'respondent.answer' && a.q === '__assumptions__').length;
  const sum = Object.values(w).reduce((a, b) => a + b, 0);
  // Fictional staffing: the financial controller is the respondent and also holds the Finance function.
  const combined = w.respondent + (w.Finance ?? 0);
  const heaviestFunction = Object.entries(w).filter(([k]) => k !== 'respondent').sort((a, b) => b[1] - a[1])[0];
  return [sum === total && combined > w.respondent && assumptionsScreens <= 1,
    `answers in the log ${total} = workload total ${sum}; respondent ${w.respondent}; respondent who also holds Finance ${combined}; heaviest function ${heaviestFunction[0]} ${heaviestFunction[1]}`];
});

// ------------------------------------------------------------------------------------------------ service: concurrency and access
const dir = mkdtempSync(path.join(tmpdir(), 'mk-review-16-'));
process.env.MK_READINESS_REVIEW_HARNESS = 'fictional-local';
process.env.MK_READINESS_REVIEW_HARNESS_DIR = dir;
process.env.MK_READINESS_REVIEW_ENGINE = '1.6';
const service = await import('../src/lib/readiness-review/service.ts');
const ENGINE_QI = createReviewEngine({ now: '2026-11-11T08:00:00Z' }, '1.6').QI;
const simAnswer = (pk, qid) => (qid === '__assumptions__' ? ['none'] : respondentAnswer(pk, ENGINE_QI[qid]));
let n = 0;
const aid = () => `svc-${String(++n).padStart(8, '0')}`;
async function driveRespondent(token, pk, until) {
  for (let i = 0; i < 400; i++) {
    const v = (await service.viewFor(token)).view;
    if (!v.step || (until && until(v))) return v;
    await service.submit(token, { actionId: aid(), expectedSeq: v.seq, action: { type: 'respondent.answer', q: v.step.q, value: simAnswer(pk, v.step.q) } });
  }
  return (await service.viewFor(token)).view;
}
const code = async (fn) => { try { await fn(); return 'ok'; } catch (error) { return error.code ?? error.constructor.name; } };

await T('B16-10', 'Service: concurrent answers and concurrent corrections are serialised; one wins, the other is told the session changed; retries apply once; the stored log replays identically', async () => {
  const s = await service.createSession('Fictional Concurrency (Pty) Ltd');
  const t = s.tokens.respondent;
  let v = await driveRespondent(t, 'P3', (x) => x.history.length >= 25);
  // The respondent's next answer is "I don't know", so a function has an open question.
  await service.submit(t, { actionId: aid(), expectedSeq: v.seq, action: { type: 'respondent.answer', q: v.step.q, value: SIM_QI.get(v.step.q)?.format === 'multi' ? ['unknown'] : 'unknown' } });
  const live = replay(JSON.parse(readFileSync(path.join(dir, 'sessions', `${s.sessionId}.json`), 'utf8')));
  const fn = Object.values(live.engine.S.assign).find((a) => a.status === 'assigned').fn;
  const ft = s.tokens.owners[fn];
  const ov = (await service.viewFor(ft)).view;
  v = (await service.viewFor(t)).view;
  const seq = Math.max(v.seq, ov.seq);
  const both = await Promise.allSettled([
    service.submit(t, { actionId: aid(), expectedSeq: seq, action: { type: 'respondent.answer', q: v.step.q, value: simAnswer('P3', v.step.q) } }),
    service.submit(ft, { actionId: aid(), expectedSeq: seq, action: { type: 'owner.answer', fn, q: ov.step.q, value: ownerAnswer('P3', ENGINE_QI[ov.step.q]) } })
  ]);
  const wins = both.filter((r) => r.status === 'fulfilled').length;
  const conflicts = both.filter((r) => r.status === 'rejected' && r.reason instanceof service.SaveConflict).length;
  // Two corrections of the same answer submitted together.
  v = (await service.viewFor(t)).view;
  const h = v.history.find((x) => x.changeable && SIM_QI.get(x.q)?.type === 'practice');
  const q = SIM_QI.get(h.q);
  const ids = [aid(), aid()];
  const corr = await Promise.allSettled([
    service.submit(t, { actionId: ids[0], expectedSeq: v.seq, action: { type: 'respondent.correct', q: h.q, value: practiceValue(q, 'absent') } }),
    service.submit(t, { actionId: ids[1], expectedSeq: v.seq, action: { type: 'respondent.correct', q: h.q, value: practiceValue(q, 'full') } })
  ]);
  const corrWins = corr.filter((r) => r.status === 'fulfilled').length;
  const corrConflicts = corr.filter((r) => r.status === 'rejected' && r.reason instanceof service.SaveConflict).length;
  const winner = corr[0].status === 'fulfilled' ? practiceValue(q, 'absent') : practiceValue(q, 'full');
  const retry = await service.submit(t, { actionId: corr[0].status === 'fulfilled' ? ids[0] : ids[1], expectedSeq: v.seq, action: { type: 'respondent.correct', q: h.q, value: winner } });
  const stored = JSON.parse(readFileSync(path.join(dir, 'sessions', `${s.sessionId}.json`), 'utf8'));
  const rebuilt = replay(stored);
  const finalValue = JSON.stringify(rebuilt.engine.S.ans[h.q].v) === JSON.stringify(winner);
  const corrections = stored.actions.filter((a) => a.type === 'respondent.correct' && a.q === h.q).length;
  return [wins === 1 && conflicts === 1 && corrWins === 1 && corrConflicts === 1 && retry.duplicate && finalValue && corrections === 1 && rebuilt.record.ruleset.engine.build === '1.6',
    `answer and owner answer together: ${wins} applied, ${conflicts} conflict; two corrections together: ${corrWins} applied, ${corrConflicts} conflict; retry recognised as duplicate ${retry.duplicate}; stored corrections ${corrections}; rebuilt value is the winner ${finalValue}`];
});

await T('B16-11', 'Service: respondent, management, reviewer, links and function links can each do only their own actions; a function link always acts as itself and sees only its own questions', async () => {
  const s = await service.createSession('Fictional Access (Pty) Ltd');
  const t = s.tokens.respondent;
  let v = await driveRespondent(t, 'P5', (x) => x.status.stages?.core.complete);
  const seq = () => service.viewFor(t).then((r) => r.view.seq);
  const live = () => replay(JSON.parse(readFileSync(path.join(dir, 'sessions', `${s.sessionId}.json`), 'utf8')));
  const assigned = Object.values(live().engine.S.assign).find((a) => a.status === 'assigned');
  const fn = assigned.fn;
  const other = live().engine.FUNCTIONS.find((f) => f !== fn);
  const ft = s.tokens.owners[fn];
  const results = {
    respondentOwnerAnswer: await code(async () => service.submit(t, { actionId: aid(), expectedSeq: await seq(), action: { type: 'owner.answer', fn, q: assigned.qid, value: 'full' } })),
    respondentDecline: await code(async () => service.submit(t, { actionId: aid(), expectedSeq: await seq(), action: { type: 'owner.decline', fn, q: assigned.qid, reason: 'x' } })),
    ownerCorrect: await code(async () => service.submit(ft, { actionId: aid(), expectedSeq: await seq(), action: { type: 'respondent.correct', q: 'PR-01', value: 'lt50' } })),
    ownerSend: await code(async () => service.submit(ft, { actionId: aid(), expectedSeq: await seq(), action: { type: 'organisation.sendToOwners' } })),
    ownerDeclinesForOther: await code(async () => service.submit(ft, { actionId: aid(), expectedSeq: await seq(), action: { type: 'owner.decline', fn: other, q: Object.values(live().engine.S.assign).find((a) => a.fn === other && a.status === 'assigned')?.qid ?? 'D1-A-01', reason: 'Fictional' } })),
    managementAnswer: await code(async () => service.submit(s.tokens.management, { actionId: aid(), expectedSeq: await seq(), action: { type: 'respondent.answer', q: 'PR-01', value: 'lt50' } })),
    reviewerSend: await code(async () => service.submit(s.tokens.reviewer, { actionId: aid(), expectedSeq: await seq(), action: { type: 'organisation.sendToOwners' } })),
    linksAnything: await code(async () => service.submit(s.tokens.links, { actionId: aid(), expectedSeq: await seq(), action: { type: 'organisation.sendToOwners' } })),
    unknownToken: await code(async () => service.viewFor('not-a-real-link-000000')),
    ownerSnapshot: await code(async () => service.snapshotFor(ft)),
    ownerExport: await code(async () => service.exportFor(ft)),
    managementSend: await code(async () => service.submit(s.tokens.management, { actionId: aid(), expectedSeq: await seq(), action: { type: 'organisation.sendToOwners' } }))
  };
  const ov = (await service.viewFor(ft)).view;
  const e = live().engine;
  const ownOnly = ov.items.every((i) => e.functionOf(i.suggestedRole) === fn) && (!ov.step || e.S.assign[ov.step.q]?.fn === fn || e.DOM[ov.step.q]);
  const otherUntouched = Object.values(e.S.assign).filter((a) => a.fn === other).every((a) => a.status !== 'declined');
  const expected = { respondentOwnerAnswer: 'not_allowed', respondentDecline: 'not_allowed', ownerCorrect: 'not_allowed', ownerSend: 'not_allowed', ownerDeclinesForOther: 'not_allowed', managementAnswer: 'not_allowed', reviewerSend: 'not_allowed', linksAnything: 'not_allowed', unknownToken: 'TokenNotFound', ownerSnapshot: 'TokenNotFound', ownerExport: 'TokenNotFound', managementSend: 'ok' };
  const wrong = Object.entries(expected).filter(([k, x]) => results[k] !== x);
  return [wrong.length === 0 && ownOnly && otherUntouched, `${Object.entries(results).map(([k, x]) => `${k}: ${x}`).join('; ')}; function link sees only its own questions ${ownOnly}; the other function's questions untouched ${otherUntouched}`];
});

// ------------------------------------------------------------------------------------------------ views, report input and adapter
await T('B16-12', 'Views: stage progress replaces the 95-screen measure for 1.6 only; functions see their own progress; the organisation sees what it can send', async () => {
  const j = journeys.P3 ?? runJourney('P3');
  const report = reportFor(j.live);
  const sv = statusView(report);
  const ov = ownerView(j.live, 'Finance');
  const mv = managementView(j.live);
  const fresh16 = newStagedSession('Fictional View Co', makeClock());
  runRespondent(fresh16, makeClock('2026-11-11T09:00:00Z'), 'P3', { onStep: (_s, l) => (l.engine.stages().core.complete ? 'pause' : null) });
  const snap = snapshotView(fresh16);
  const legacy = newStagedSession('Fictional Legacy Co', makeClock(), '1.5');
  const lv = statusView(reportFor(legacy));
  const ok = sv.limit === null && sv.pctOfLimit === null && sv.stages && sv.stages.core.pct === 100 && sv.stages.breadth.pct === 100 && /reached/.test(sv.stages.currentLabel)
    && ov.canDecline && ov.progress.fn === 'Finance' && 'staged' in mv && snap.staged.canSend && snap.staged.recommended.length > 0 && snap.staged.candidates.length >= snap.staged.recommended.length
    && lv.limit === 95 && lv.stages === null;
  return [ok, `1.6 status: limit ${sv.limit}, core ${sv.stages.core.pct}%, breadth ${sv.stages.breadth.pct}%, "${sv.stages.currentLabel}"; Finance progress ${JSON.stringify(ov.progress)}; after the core stage the organisation can send ${snap.staged.recommended.length} recommended of ${snap.staged.candidates.length} shown; 1.5 status limit ${lv.limit}, stages ${lv.stages}`];
});

await T('B16-13', 'Report input 1.3.0 and the revised adapter: staged facts are carried, scoring stays inactive and the revised family refuses to score', async () => {
  const j = journeys.P5 ?? runJourney('P5');
  const input = buildStagedReportInput(j.live);
  const ctx = toRevisedAssessmentContext(input);
  let refused = false;
  try { dispatchFixedScoring('revised-review', { domains: [], answers: [], exposureAnswers: [] }); } catch (error) { refused = error instanceof RevisedMethodologyInactive; }
  const scoredKeys = [...keysDeep(input)].filter((k) => SCORE_KEY.test(k));
  const ok = input.contract.version === STAGED_REPORT_INPUT_CONTRACT.version && input.interview.respondentScreenLimit === null && input.staged.build === '1.6' && ctx.scoring.status === 'inactive' && refused && scoredKeys.length === 0 && ctx.confirmations.length > 0;
  return [ok, `input ${input.contract.name} ${input.contract.version}; respondent limit ${input.interview.respondentScreenLimit}; packages ${input.staged.packages.length}; adapter ${ctx.adapter?.version ?? ctx.adapter}: ${ctx.confirmations.length} confirmations, scoring ${ctx.scoring.status}; revised family refuses ${refused}; scored keys ${scoredKeys.length}`];
});

// ------------------------------------------------------------------------------------------------ output
if (UPDATE || !existsSync(GOLDEN)) writeFileSync(GOLDEN, JSON.stringify(fresh, null, 2) + '\n');
const failed = results.filter((r) => r.status !== 'pass');
for (const r of results) console.log(`${r.status === 'pass' ? 'PASS' : 'FAIL'} ${r.id} ${r.name}\n     ${r.detail}`);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed${UPDATE ? ' (golden fixtures updated)' : ''}`);
if (failed.length) process.exitCode = 1;
