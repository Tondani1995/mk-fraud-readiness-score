// Seeds fictional build 1.6 sessions for the corrected standard-assessment screens: a completed assessment, one with
// declined and unknown information, one paused at the first question of an area (the hand-over offer) and one carrying
// separate Advisory evidence-review records. Same environment as readiness-review-build16-seed.mjs:
//   node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/readiness-review-standard-status-seed.mjs <out.json>
import { writeFileSync } from 'node:fs';
import { respondentAnswer, ownerAnswer } from './lib/build16-driver.mjs';
import { createReviewEngine } from '../src/lib/readiness-review/engine.ts';

if (process.env.MK_READINESS_REVIEW_ENGINE !== '1.6' || process.env.MK_READINESS_REVIEW_HARNESS !== 'fictional-local') throw new Error('Set the fictional harness and engine 1.6.');
const service = await import('../src/lib/readiness-review/service.ts');
const QI = createReviewEngine({ now: '2026-11-11T08:00:00Z' }, '1.6').QI;
let n = 0;
const aid = () => `seed17-${String(++n).padStart(8, '0')}`;
const answer = (pk, qid) => (qid === '__assumptions__' ? ['none'] : respondentAnswer(pk, QI[qid]));
const view = async (t) => (await service.viewFor(t)).view;
async function drive(token, pk, until) {
  for (let i = 0; i < 400; i++) {
    const v = await view(token);
    if (!v.step || (until && until(v))) return v;
    await service.submit(token, { actionId: aid(), expectedSeq: v.seq, action: { type: 'respondent.answer', q: v.step.q, value: answer(pk, v.step.q) } });
  }
  return view(token);
}
async function owner(token, pk, { decline = 0, reason = '' } = {}) {
  for (let i = 0; i < 400; i++) {
    const v = await view(token);
    if (!v.step) return v;
    if (i < decline) { await service.submit(token, { actionId: aid(), expectedSeq: v.seq, action: { type: 'owner.decline', fn: v.fn, q: v.step.q, reason } }); continue; }
    await service.submit(token, { actionId: aid(), expectedSeq: v.seq, action: { type: 'owner.answer', fn: v.fn, q: v.step.q, value: ownerAnswer(pk, QI[v.step.q]) } });
  }
  return view(token);
}
async function sendAndAnswer(s, pk, rounds = 3, declines = {}) {
  for (let r = 0; r < rounds; r++) {
    const v = await view(s.tokens.respondent);
    await service.submit(s.tokens.respondent, { actionId: aid(), expectedSeq: v.seq, action: { type: 'organisation.sendToOwners' } });
    for (const [fn, t] of Object.entries(s.tokens.owners)) await owner(t, pk, r === 0 && declines[fn] ? declines[fn] : {});
  }
}
const out = {};

// 1. Completed: interview completed, packages returned, nothing outstanding.
{
  const s = await service.createSession('Fictional Mixed Retail (Pty) Ltd');
  await drive(s.tokens.respondent, 'P3');
  await sendAndAnswer(s, 'P3');
  out.complete = { respondent: s.tokens.respondent, management: s.tokens.management };
}
// 2. Outstanding: unknown-heavy organisation; Procurement declines two questions; functions answer "I don't know" to some.
{
  const s = await service.createSession('Fictional Distribution Group (Pty) Ltd');
  await drive(s.tokens.respondent, 'P5');
  await sendAndAnswer(s, 'P5', 2, { Procurement: { decline: 2, reason: 'Fictional: stock counts are run by the stores team, not procurement' } });
  out.outstanding = { respondent: s.tokens.respondent, management: s.tokens.management, procurement: s.tokens.owners.Procurement };
}
// 3. Paused at the first question of Third parties and supply chain: the area hand-over offer is on screen.
{
  const s = await service.createSession('Fictional Mixed Retail (Pty) Ltd');
  await drive(s.tokens.respondent, 'P3', (v) => v.areaHandoff?.domain === 'D4');
  out.entry = { respondent: s.tokens.respondent };
}
// 4. Advisory records: a completed assessment on which MK's separate Advisory evidence review recorded two items.
{
  const s = await service.createSession('Fictional Advisory Client (Pty) Ltd');
  const v = await drive(s.tokens.respondent, 'P3');
  const reported = v.history.filter((h) => h.changeable).slice(0, 2).map((h) => h.q);
  let r = await view(s.tokens.reviewer);
  await service.submit(s.tokens.reviewer, { actionId: aid(), expectedSeq: r.seq, action: { type: 'reviewer.evidence', q: reported[0], state: r.evidenceStates?.[1]?.value ?? 'requested', basis: 'Fictional: sample of payment files requested' } });
  r = await view(s.tokens.reviewer);
  await service.submit(s.tokens.reviewer, { actionId: aid(), expectedSeq: r.seq, action: { type: 'reviewer.review', q: reported[1], conclusion: null, basis: '', followUp: 'Fictional: obtain the branch sample', limitation: 'Fictional: head office records only' } });
  out.advisory = { respondent: s.tokens.respondent, management: s.tokens.management };
}
writeFileSync(process.argv[2] ?? 'seed17.json', JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify(Object.keys(out)));
