// Resume rules (14 November 2026): "Create New Version" never resumes; a report supersedes earlier drafts and manuscripts;
// a report dates from its validated manuscript, so a late-recovered link does not supersede a later draft; a checkpoint
// without a readable time is malformed history. Pure functions; no database, model or network.
//   node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/revised-reports/resume-mode-tests.mjs
import fs from 'node:fs';
import { resumeFrom, loadCheckpoints, CheckpointUnavailable } from '../../src/lib/reports/revised/live/checkpoints.ts';

const results = [];
const T = async (id, name, fn) => { try { const [ok, detail] = await fn(); results.push({ id, ok, name, detail }); } catch (e) { results.push({ id, ok: false, name, detail: String(e?.stack ?? e).split('\n').slice(0, 3).join(' ') }); } };
const FP = 'fp-1';
const meta = { provider: 'p', model: 'm', firstPass: { pass: false, blocking: 1, words: 100 } };
const at = (min) => new Date(Date.UTC(2026, 10, 14, 9, min)).toISOString();
const cp = (attemptId, stage, min, extra = {}) => ({ attemptId, stage, factPackDigest: stage === 'linked' ? null : FP, manuscript: stage === 'linked' ? null : `ms-${attemptId}`, reportId: stage === 'linked' ? `r-${attemptId}` : null, resumeMeta: stage === 'linked' ? null : meta, createdAt: at(min), ...extra });
// History is returned newest first, as the review store returns it.
const hist = (...c) => c.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

await T('RM-01', 'Fresh mode never resumes, even with a current draft and a current unlinked manuscript', async () => {
  const h = hist(cp('A', 'drafted', 1), cp('B', 'validated', 2));
  return [resumeFrom(h, FP, 'fresh') === null && resumeFrom(h, FP)?.stage === 'compose', `resume default: ${resumeFrom(h, FP)?.stage}`];
});
await T('RM-02', 'The 14 November case: a draft repaired into a report is superseded', async () => {
  const h = hist(cp('A', 'drafted', 14), cp('B', 'validated', 35), cp('B', 'linked', 35.5));
  return [resumeFrom(h, FP) === null, String(resumeFrom(h, FP)?.fromAttempt ?? 'none')];
});
await T('RM-03', 'A draft written after the latest report is still resumed', async () => {
  const h = hist(cp('A', 'validated', 10), cp('A', 'linked', 11), cp('C', 'drafted', 20));
  const r = resumeFrom(h, FP);
  return [r?.stage === 'repair' && r.fromAttempt === 'C', `${r?.stage} from ${r?.fromAttempt}`];
});
await T('RM-04', 'A late-recovered link dates from its validated manuscript and does not supersede a later draft', async () => {
  const h = hist(cp('A', 'validated', 10), cp('C', 'drafted', 20), cp('A', 'linked', 30));
  const r = resumeFrom(h, FP);
  return [r?.stage === 'repair' && r.fromAttempt === 'C', `${r?.stage} from ${r?.fromAttempt}`];
});
await T('RM-05', 'A manuscript composed into a report by a later attempt is superseded by that report', async () => {
  const h = hist(cp('A', 'validated', 10), cp('B', 'validated', 20), cp('B', 'linked', 21));
  return [resumeFrom(h, FP) === null, String(resumeFrom(h, FP)?.fromAttempt ?? 'none')];
});
await T('RM-06', 'Only the same Fact Pack qualifies (unchanged rule)', async () => {
  const h = hist(cp('A', 'drafted', 10, { factPackDigest: 'other' }));
  return [resumeFrom(h, FP) === null, 'other Fact Pack ignored'];
});
await T('RM-07', 'History with a missing or unreadable time is malformed, never treated as empty', async () => {
  const out = [];
  for (const createdAt of [undefined, 'not a time']) {
    const db = { rpc: async () => ({ data: [cp('A', 'drafted', 1, { createdAt })], error: null }) };
    try { await loadCheckpoints(db, { orderReference: 'o', inputDigest: 'i' }); out.push('accepted'); } catch (e) { out.push(e instanceof CheckpointUnavailable && e.detail.malformed ? 'malformed' : String(e)); }
  }
  const good = await loadCheckpoints({ rpc: async () => ({ data: [cp('A', 'drafted', 1)], error: null }) }, { orderReference: 'o', inputDigest: 'i' });
  return [out.every((x) => x === 'malformed') && good.length === 1, out.join(', ')];
});
await T('RM-08', 'The review store returns Postgres time strings; they parse', async () => {
  const h = hist(cp('A', 'drafted', 14, { createdAt: '2026-11-14 09:14:55.756718+00' }), cp('B', 'validated', 35, { createdAt: '2026-11-14T09:35:35.93526+00:00' }), cp('B', 'linked', 36, { createdAt: '2026-11-14T09:35:49.29753+00:00' }));
  return [h.every((c) => Number.isFinite(Date.parse(c.createdAt))) && resumeFrom(h, FP) === null, 'both formats parse'];
});

for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.id} ${r.name}\n     ${r.detail}`);
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} of ${results.length} passed`);
fs.mkdirSync('qa-output/corrective', { recursive: true });
fs.writeFileSync('qa-output/corrective/resume-mode.json', JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
