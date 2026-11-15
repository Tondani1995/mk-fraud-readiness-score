// Seeds fictional build 1.6 sessions into a harness directory through the service, at the states the stage-progress
// screenshots show. Run with MK_READINESS_REVIEW_HARNESS=fictional-local, MK_READINESS_REVIEW_HARNESS_DIR=<dir> and
// MK_READINESS_REVIEW_ENGINE=1.6:
//   node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/readiness-review-build16-seed.mjs <out.json>
import { writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { respondentAnswer, ownerAnswer } from './lib/build16-driver.mjs';
import { createReviewEngine } from '../src/lib/readiness-review/engine.ts';
import { replay } from '../src/lib/readiness-review/session.ts';

if (process.env.MK_READINESS_REVIEW_ENGINE !== '1.6' || process.env.MK_READINESS_REVIEW_HARNESS !== 'fictional-local') throw new Error('Set the fictional harness and engine 1.6.');
const service = await import('../src/lib/readiness-review/service.ts');
const QI = createReviewEngine({ now: '2026-11-11T08:00:00Z' }, '1.6').QI;
let n = 0;
const aid = () => `seed16-${String(++n).padStart(8, '0')}`;
const answer = (pk, qid) => (qid === '__assumptions__' ? ['none'] : respondentAnswer(pk, QI[qid]));
async function drive(token, pk, until) {
  for (let i = 0; i < 400; i++) {
    const v = (await service.viewFor(token)).view;
    if (!v.step || (until && until(v))) return v;
    await service.submit(token, { actionId: aid(), expectedSeq: v.seq, action: { type: 'respondent.answer', q: v.step.q, value: answer(pk, v.step.q) } });
  }
  return (await service.viewFor(token)).view;
}
async function owner(token, pk, { limit = 400, declineFirst = null } = {}) {
  for (let i = 0; i < limit; i++) {
    const v = (await service.viewFor(token)).view;
    if (!v.step) return v;
    if (declineFirst && i === 0) { await service.submit(token, { actionId: aid(), expectedSeq: v.seq, action: { type: 'owner.decline', fn: v.fn, q: v.step.q, reason: declineFirst } }); continue; }
    await service.submit(token, { actionId: aid(), expectedSeq: v.seq, action: { type: 'owner.answer', fn: v.fn, q: v.step.q, value: ownerAnswer(pk, QI[v.step.q]) } });
  }
  return (await service.viewFor(token)).view;
}
const send = async (token) => { const v = (await service.viewFor(token)).view; await service.submit(token, { actionId: aid(), expectedSeq: v.seq, action: { type: 'organisation.sendToOwners' } }); };
const out = {};

// 1. Core stage in progress (P3, about 30 answers).
{
  const s = await service.createSession('Fictional Mixed Retail (Pty) Ltd');
  await drive(s.tokens.respondent, 'P3', (v) => v.history.length >= 30);
  out.core = { respondent: s.tokens.respondent };
}
// 2. Breadth stage in progress (P3, about 110 answers): beyond where build 1.5 would have stopped.
{
  const s = await service.createSession('Fictional Mixed Retail (Pty) Ltd');
  await drive(s.tokens.respondent, 'P3', (v) => v.history.length >= 110);
  out.breadth = { respondent: s.tokens.respondent };
}
// 3. Unknown-heavy organisation with two areas delegated: interview complete, packages ready to send.
{
  const s = await service.createSession('Fictional Distribution Group (Pty) Ltd');
  const t = s.tokens.respondent;
  await drive(t, 'P5', (v) => v.status.stages?.core.complete);
  for (const [domain, ownerLabel] of [['D4', 'Procurement manager'], ['D9', 'IT manager']]) {
    const v = (await service.viewFor(t)).view;
    await service.submit(t, { actionId: aid(), expectedSeq: v.seq, action: { type: 'respondent.assignArea', domain, owner: ownerLabel } });
  }
  await drive(t, 'P5');
  out.ready = { respondent: t, management: s.tokens.management };
  // 4. The same organisation after the functions start: IT works through its area, procurement declines one question.
  const s2 = await service.createSession('Fictional Distribution Group (Pty) Ltd');
  const t2 = s2.tokens.respondent;
  await drive(t2, 'P5', (v) => v.status.stages?.core.complete);
  for (const [domain, ownerLabel] of [['D4', 'Procurement manager'], ['D9', 'IT manager']]) {
    const v = (await service.viewFor(t2)).view;
    await service.submit(t2, { actionId: aid(), expectedSeq: v.seq, action: { type: 'respondent.assignArea', domain, owner: ownerLabel } });
  }
  await drive(t2, 'P5');
  await send(t2);
  await owner(s2.tokens.owners['IT and information'], 'P5');
  await owner(s2.tokens.owners['Finance'], 'P5', { limit: 6 });
  await owner(s2.tokens.owners['Procurement'], 'P5', { limit: 4, declineFirst: 'Fictional: this control is run by the stores team, not procurement' });
  out.packages = { respondent: t2, management: s2.tokens.management, procurement: s2.tokens.owners['Procurement'], finance: s2.tokens.owners['Finance'], it: s2.tokens.owners['IT and information'] };
}
writeFileSync(process.argv[2] ?? 'seed16.json', JSON.stringify(out, null, 2) + '\n');
console.log(JSON.stringify(Object.keys(out)));
