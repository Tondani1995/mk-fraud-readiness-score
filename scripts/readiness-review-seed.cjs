// Seeds fictional review sessions through the review API, for screenshots and performance runs.
// node scripts/readiness-review-seed.cjs <baseUrl> <out.json>
// Uses the same HTTP actions as the pages. All organisations and answers are fictional.
const fs = require('fs');
const { randomUUID } = require('crypto');
const BASE = process.argv[2] || 'http://localhost:3200';
const OUT = process.argv[3] || 'seed.json';
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 1000003, 7);
const PROFILE = { 'PR-01': '50to250', 'PR-12': '50to250m', 'PR-02': 'private', 'PR-13': 'retail', 'PR-04': 'board', 'PR-03': 'no', 'PR-05': 'no', 'PR-06': 'unknown', 'PR-07': 'no', 'PR-08': 'yes', 'PR-09': 'no', 'PR-10': 'no', 'PR-11': 'yes' };

async function call(method, path, body) {
  const res = await fetch(BASE + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${path} ${res.status} ${json.message}`);
  return json;
}
async function act(token, seq, action) {
  return (await call('POST', `/review/api/s/${token}`, { actionId: randomUUID(), expectedSeq: seq, action })).current.view;
}
function pick(step) {
  const values = step.choices.map((c) => c.value);
  const q = step.q;
  if (q.startsWith('PR-')) return PROFILE[q] && values.includes(PROFILE[q]) ? PROFILE[q] : values.find((v) => v !== 'unknown');
  if (step.format === 'multi') {
    if (q === '__assumptions__') return values.includes('none') ? ['none'] : [values[0]];
    if (q === 'D5-G-01' || q === 'D6-S-02') return values.filter((v) => !['none', 'unknown'].includes(v)).slice(0, 2);
    return [values[0]];
  }
  const k = hash(q) % 7;
  if (k === 3) return 'unknown';
  if (values.includes('4')) return ['4', '2', '0', null, '5', '4', '4'][k];
  if (values.includes('full')) return ['full', 'partial', 'absent', null, 'full', 'full', 'full'][k];
  if (values.includes('yes')) return 'yes';
  return values.find((v) => v !== 'unknown');
}
async function interview(token, limit) {
  let view = (await call('GET', `/review/api/s/${token}`)).view;
  let n = 0;
  while (view.step && n++ < limit) view = await act(token, view.seq, { type: 'respondent.answer', q: view.step.q, value: pick(view.step) });
  return view;
}

(async () => {
  const a = await call('POST', '/review/api/sessions', { organisationLabel: 'Fictional Retail Group', fictionalConfirmed: true });
  const links = (await call('GET', `/review/api/s/${a.links}`)).view;
  const t = { links: a.links, respondent: links.tokens.respondent, management: links.tokens.management, reviewer: links.tokens.reviewer, owners: Object.fromEntries(links.functions.map((f) => [f.fn, f.token])) };
  await interview(t.respondent, 200);
  let mg = (await call('GET', `/review/api/s/${t.management}`)).view;
  await act(t.management, mg.seq, { type: 'organisation.sendToOwners' });
  // One accountable function answers part of its package.
  const fn = 'Executive and governance';
  for (let i = 0; i < 4; i++) {
    const ov = (await call('GET', `/review/api/s/${t.owners[fn]}`)).view;
    if (!ov.step) break;
    const v = ov.step.q === 'PR-06' ? 'yes' : pick(ov.step);
    await act(t.owners[fn], ov.seq, { type: 'owner.answer', fn, q: ov.step.q, value: v === 'unknown' ? ov.step.choices[0].value : v });
  }
  // The reviewer records a confirmed review with a follow-up, an insufficient evidence finding and a standalone follow-up.
  let rv = (await call('GET', `/review/api/s/${t.reviewer}`)).view;
  const ev = rv.controls.filter((c) => c.queues.evidence).map((c) => c.id);
  rv = await act(t.reviewer, rv.seq, { type: 'reviewer.evidence', q: ev[0], state: 'reviewed-sufficient', basis: 'Fictional sample of three months' });
  rv = await act(t.reviewer, rv.seq, { type: 'reviewer.review', q: ev[0], conclusion: 'confirmed', basis: 'Fictional sample of three months', followUp: 'Obtain the branch sample', limitation: '' });
  rv = await act(t.reviewer, rv.seq, { type: 'reviewer.evidence', q: ev[1], state: 'insufficient', basis: 'Only head office records were supplied' });
  rv = await act(t.reviewer, rv.seq, { type: 'reviewer.review', q: ev[2], conclusion: null, basis: '', followUp: 'Check the sample size with the branch', limitation: '' });

  const b = await call('POST', '/review/api/sessions', { organisationLabel: 'Fictional Logistics Co', fictionalConfirmed: true });
  const bl = (await call('GET', `/review/api/s/${b.links}`)).view;
  await interview(bl.tokens.respondent, 14);

  const out = { full: { ...t, reviewed: ev.slice(0, 3), ownerFunction: fn }, midInterview: { links: b.links, respondent: bl.tokens.respondent } };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log('seeded', JSON.stringify({ full: t.links, mid: b.links }));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
