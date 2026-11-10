// Generates the fictional example shown in the public Snapshot preview when the review track is selected.
// The figures are produced by running a fictional organisation through the actual review engine, so the marketing
// preview cannot show a state the service does not produce. Run with --check to verify the committed fixture.
// node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/readiness-review-preview-fixture.mjs [--check]
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { READINESS_REVIEW_CONTRACT } from '../src/lib/readiness-review/contract.ts';
import { replay, commit, initialActions } from '../src/lib/readiness-review/session.ts';
import { snapshotView } from '../src/lib/readiness-review/view-model.ts';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'src/lib/readiness-review/fixtures/preview-example.json');
const PROFILE = { 'PR-01': '50to250', 'PR-12': '50to250m', 'PR-02': 'private', 'PR-13': 'retail', 'PR-04': 'board', 'PR-03': 'no', 'PR-05': 'no', 'PR-06': 'no', 'PR-07': 'no', 'PR-08': 'yes', 'PR-09': 'no', 'PR-10': 'no', 'PR-11': 'yes' };
let t = Date.parse('2026-11-10T08:00:00Z');
const tick = () => new Date((t += 1000)).toISOString();
let n = 0;
const id = () => `preview-${String(++n).padStart(4, '0')}`;
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 1000003, 7);

/** A fixed mix of answers: mostly reported in place, some partial or absent, some "I don't know". */
function mixed(step) {
  const q = step.q;
  if (q.id.startsWith('PR-')) return PROFILE[q.id] ?? q.options.find((o) => o[0] !== 'unknown')[0];
  if (q.id === '__assumptions__') return ['none'];
  const k = hash(q.id) % 6;
  if (q.type !== 'practice') {
    if (q.format === 'multi') return [q.options[0][0]];
    return (q.options.find((o) => o[0] === 'yes') || q.options[0])[0];
  }
  if (k === 3) return q.format === 'multi' ? ['unknown'] : 'unknown';
  if (q.format === 'practice') return ['full', 'partial', 'absent', null, 'full', 'full'][k];
  if (q.format === 'anchored') return ['4', '2', '0', null, '5', '4'][k];
  if (q.format === 'multi') return q.subPractices ? (k === 1 ? [Object.keys(q.subPractices)[0]] : Object.keys(q.subPractices)) : [q.options[0][0]];
  if (q.format === 'choicePractice') {
    const want = ['full', 'partial', 'absent', null, 'full', 'full'][k];
    return Object.keys(q.practiceMap).find((v) => q.practiceMap[v] === want) ?? Object.keys(q.practiceMap)[0];
  }
  return q.options[0][0];
}

const record = { sessionId: 'previewexample0001', createdAt: tick(), contractVersion: READINESS_REVIEW_CONTRACT.version, engineSha256: READINESS_REVIEW_CONTRACT.engine.sha256, bankVersion: READINESS_REVIEW_CONTRACT.bank.version, organisationLabel: 'Fictional Retail Group', fictional: true, tokens: { respondent: 'x', management: 'x', reviewer: 'x', links: 'x', owners: {} }, actions: [] };
const live = replay(record);
live.record = { ...record, actions: initialActions(live, tick(), id) };
let guard = 0;
while (live.respondentStep && guard++ < 200) {
  const step = live.respondentStep;
  const out = commit(live, { type: 'respondent.answer', q: step.q.id, value: mixed(step) }, 'respondent', tick(), id);
  live.record = { ...live.record, actions: live.record.actions.concat(out) };
}
const snap = snapshotView(live);
const count = (key) => snap.counts.find((c) => c.key === key);
const fixture = {
  purpose: 'Fictional example for the public Snapshot preview. Produced by scripts/readiness-review-preview-fixture.mjs through the review engine; not a real organisation.',
  engineSha256: READINESS_REVIEW_CONTRACT.engine.sha256,
  bankVersion: READINESS_REVIEW_CONTRACT.bank.version,
  organisation: record.organisationLabel,
  screensUsed: snap.status.screensUsed,
  stop: snap.status.stopReason,
  counts: Object.fromEntries(snap.counts.map((c) => [c.key, { value: c.value, denominator: c.denominator }])),
  exampleGap: snap.reportedGaps[0] ? { title: snap.reportedGaps[0].title, state: snap.reportedGaps[0].stateLabel } : null,
  exampleWaiting: snap.waiting[0] ? { title: snap.waiting[0].title, fn: snap.waiting[0].ownerFunction } : null,
  exampleOpen: snap.openScenarios[0] ? { name: snap.openScenarios[0].name, why: snap.openScenarios[0].whyOpen } : null
};
const body = JSON.stringify(fixture, null, 2) + '\n';
if (process.argv.includes('--check')) {
  const ok = readFileSync(OUT, 'utf8') === body;
  console.log(ok ? 'preview fixture matches the engine' : 'preview fixture is out of date');
  process.exit(ok ? 0 : 1);
}
writeFileSync(OUT, body);
console.log(body);
