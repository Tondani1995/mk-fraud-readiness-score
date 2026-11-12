// Drives fictional build 1.6 sessions through the real session layer (commit, serve and replay), exactly as the
// service does, with deterministic clocks, ids and answers. Used by the build 1.6 tests and the journey
// demonstrations. Fictional organisations only; nothing here is a production value.
import { newSessionRecord, replay, commit, initialActions, ensureOwnerServed, ensureRespondentServed } from '../../src/lib/readiness-review/session.ts';
import { COVERAGE, PROFILES, POLICIES, QI as SIM_QI, practiceValue, factValue, withUnknown, draw } from '../research/scoring-simulation/lib.mjs';

export const JOURNEY_PROFILES = {
  P1: { name: 'Strong controls', profile: 'R', practice: POLICIES.strong },
  P2: { name: 'Weak controls', profile: 'R', practice: POLICIES.weak },
  P3: { name: 'Mixed controls', profile: 'R', practice: POLICIES.mixed },
  P4: { name: 'Small owner-managed firm (limited applicability)', profile: 'S', practice: POLICIES.mixed },
  P5: { name: 'Extensive unanswered information (35% "I don\'t know"; two areas delegated)', profile: 'R', practice: withUnknown(POLICIES.mixed, 0.35), truth: POLICIES.mixed, ownerUnknown: 0.1, delegate: [['D4', 'Procurement manager'], ['D9', 'IT manager']] },
  // Research profile carried into the harness: every confirmation reported in place, every supporting practice weak.
  P6b: { name: 'Overstated confirmations (confirmations in place, supporting practices weak)', profile: 'R', practice: (q, seed) => (COVERAGE.questionRole[q.id]?.role === 'confirm' ? POLICIES.strong(q, seed) : POLICIES.weak(q, seed)) }
};
const SEED = 'mk-sim';

export function makeClock(start = '2026-11-11T08:00:00Z') {
  let t = Date.parse(start);
  let n = 0;
  return { tick: () => new Date((t += 1000)).toISOString(), id: () => `fx-${String(++n).padStart(8, '0')}` };
}

export function newStagedSession(label, clock, build = '1.6') {
  const record = newSessionRecord({ build, sessionId: `fictional${label.replace(/[^a-z0-9]/gi, '').toLowerCase()}`.slice(0, 32), createdAt: clock.tick(), organisationLabel: label, tokens: { respondent: 'r', management: 'm', reviewer: 'v', links: 'l', owners: {} } });
  const live = replay(record);
  const first = initialActions(live, clock.tick(), clock.id);
  live.record = { ...record, actions: first };
  return live;
}

export function act(live, clock, action, actor = 'respondent') {
  const out = commit(live, action, actor, clock.tick(), clock.id);
  live.record = { ...live.record, actions: live.record.actions.concat(out) };
  return out;
}

export function serveOwner(live, clock, fn) {
  const out = ensureOwnerServed(live, fn, clock.tick(), clock.id);
  live.record = { ...live.record, actions: live.record.actions.concat(out) };
  return live.ownerSteps[fn];
}

export function serveRespondent(live, clock) {
  const out = ensureRespondentServed(live, clock.tick(), clock.id);
  live.record = { ...live.record, actions: live.record.actions.concat(out) };
  return live.respondentStep;
}

/** The fictional organisation's answer to a question, keyed by question id so any path to it gives the same answer. */
export function respondentAnswer(pk, q) {
  const p = JOURNEY_PROFILES[pk];
  const prof = PROFILES[p.profile];
  if (q.id === '__assumptions__') return ['none'];
  if (q.id.startsWith('PR-')) return prof.answers[q.id] ?? factValue(q, 'open');
  if (q.type !== 'practice') return factValue(q, prof.facts);
  return practiceValue(q, p.practice(SIM_QI.get(q.id), SEED));
}

/** What an accountable function answers: what the organisation actually does (it knows its own area). */
export function ownerAnswer(pk, q) {
  const p = JOURNEY_PROFILES[pk];
  const prof = PROFILES[p.profile];
  if (q.id.startsWith('PR-')) return prof.answers[q.id] ?? factValue(q, 'open');
  if (q.type !== 'practice') return factValue(q, prof.facts);
  if (p.ownerUnknown && draw(`${SEED}|owner`, q.id) < p.ownerUnknown) return practiceValue(q, 'unknown');
  return practiceValue(q, (p.truth || p.practice)(SIM_QI.get(q.id), SEED));
}

/**
 * The respondent's interview to its end. Records a progress point after every answer, so the stage progress the
 * respondent sees can be shown as a timeline. `onStep` may return an action to submit instead of the answer.
 */
export function runRespondent(live, clock, pk, { onStep = null, maxScreens = 3000, timeline = null } = {}) {
  const kinds = {};
  let n = 0;
  serveRespondent(live, clock);
  while (live.respondentStep && n++ < maxScreens) {
    const step = live.respondentStep;
    const custom = onStep ? onStep(step, live) : null;
    if (custom === 'pause') return { kinds, paused: true };
    kinds[step.kind] = (kinds[step.kind] || 0) + 1;
    act(live, clock, custom ?? { type: 'respondent.answer', q: step.q.id, value: respondentAnswer(pk, step.q) });
    if (timeline) {
      const st = live.engine.stages();
      timeline.push({ screen: live.engine.respondentScreens(), stage: st.current, core: `${st.core.answered + st.core.withFunctions}/${st.core.applicableSoFar}`, breadth: `${st.breadth.answered + st.breadth.withFunctions}/${st.breadth.applicableSoFar}` });
    }
  }
  return { kinds, paused: false };
}

/** Every function works through its package until nothing is left for it. */
export function runOwners(live, clock, pk, { decline = null, answer = null, maxPerFunction = 400 } = {}) {
  const e = live.engine;
  const screens = {};
  const declined = [];
  for (const fn of e.FUNCTIONS) {
    let n = 0;
    let step = serveOwner(live, clock, fn);
    while (step && n++ < maxPerFunction) {
      const reason = decline ? decline(fn, step, live) : null;
      if (reason) {
        act(live, clock, { type: 'owner.decline', fn, q: step.q.id, reason }, 'owner');
        declined.push({ fn, q: step.q.id });
      } else {
        const custom = answer ? answer(fn, step, live) : null;
        act(live, clock, { type: 'owner.answer', fn, q: step.q.id, value: custom ?? ownerAnswer(pk, step.q) }, 'owner');
        screens[fn] = (screens[fn] || 0) + 1;
      }
      step = live.ownerSteps[fn];
    }
  }
  return { screens, declined };
}

/** "I don't know" in the question's own format, for adversarial journeys. */
export const unknownValue = (q) => (q.type === 'practice' ? practiceValue(q, 'unknown') : (q.format === 'multi' ? ['unknown'] : 'unknown'));

/**
 * A full journey: core and breadth, delegation, recommended packages sent and answered, sends repeated until none.
 * Optional hooks for adversarial tests (defaults leave every journey unchanged): `respond(step, live)` may return an
 * action for the respondent, `answer(fn, step, live)` a value for a function, `decline(fn, step, live)` a reason to
 * decline, and `stopAfterCore` ends the journey when the core stage is complete, before breadth and before any package.
 */
export function runJourney(pk, { decline = null, answer = null, respond = null, stopAfterCore = false, timeline = null, rounds = 4 } = {}) {
  const clock = makeClock();
  const live = newStagedSession(`Fictional ${JOURNEY_PROFILES[pk].name}`, clock);
  const p = JOURNEY_PROFILES[pk];
  const kinds = {};
  const add = (r) => { for (const [k, v] of Object.entries(r.kinds)) kinds[k] = (kinds[k] || 0) + v; };
  // Areas are delegated once the core stage is complete: the core is the respondent's; breadth can be shared.
  const pauseAtCore = p.delegate || stopAfterCore;
  add(runRespondent(live, clock, pk, { timeline, onStep: pauseAtCore || respond ? (step, l) => (pauseAtCore && l.engine.stages().core.complete ? 'pause' : respond ? respond(step, l) : null) : null }));
  if (stopAfterCore) return { live, clock, respondent: { kinds, screens: live.engine.respondentScreens() }, afterInterview: live.engine.report().staged, sends: [], owners: { screens: {}, declined: [] }, final: live.engine.report() };
  if (p.delegate) {
    for (const [domain, owner] of p.delegate) act(live, clock, { type: 'respondent.assignArea', domain, owner });
    add(runRespondent(live, clock, pk, { timeline, onStep: respond }));
  }
  const respondent = { kinds, screens: live.engine.respondentScreens() };
  const afterInterview = live.engine.report().staged;
  const sends = [];
  const owners = { screens: {}, declined: [] };
  // Areas delegated during breadth are worked first, then packages are sent and answered; each send is recomputed.
  const merge = (r) => { for (const [k, v] of Object.entries(r.screens)) owners.screens[k] = (owners.screens[k] || 0) + v; owners.declined.push(...r.declined); };
  merge(runOwners(live, clock, pk, { decline, answer }));
  for (let i = 0; i < rounds; i++) {
    // Packages can only be sent once the core stage is complete; an adversarial journey may leave it incomplete.
    if (!live.engine.stages().core.complete) break;
    const before = Object.keys(live.engine.S.assign).length;
    act(live, clock, { type: 'organisation.sendToOwners' }, 'organisation');
    const made = Object.keys(live.engine.S.assign).length - before;
    sends.push(live.engine.S.v16.sends.at(-1).assigned.length);
    merge(runOwners(live, clock, pk, { decline, answer }));
    if (!made) break;
  }
  if (live.respondentStep) runRespondent(live, clock, pk, { timeline, onStep: respond });
  return { live, clock, respondent, afterInterview, sends, owners, final: live.engine.report() };
}
