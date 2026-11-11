// Tests for the database review store, through the store functions of supabase/migrations/20261111100000_readiness_review_store.sql.
// node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/readiness-review-database-tests.mjs [--access-denied]
//
// Against a hosted, isolated Supabase project: MK_READINESS_REVIEW_DB_URL, MK_READINESS_REVIEW_DB_SERVICE_KEY and
// MK_READINESS_REVIEW_DB_PROJECT_REF. The configuration refuses the shared preview/production project (B2).
// Against a local embedded Postgres instead: MK_REVIEW_DB_TEST_CLIENT=./scripts/lib/readiness-review-pglite-client.mjs
// with MK_PGLITE_DIR (see that file), and MK_READINESS_REVIEW_DB_URL=http://127.0.0.1:54321, MK_READINESS_REVIEW_DB_PROJECT_REF=local.
//
// Every session created here is fictional and is purged before the script ends. With --access-denied it checks instead
// that the given key (hosted) or the anon and authenticated roles (local) can reach none of the store.
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.MK_READINESS_REVIEW_HARNESS = 'fictional-local';
process.env.MK_READINESS_REVIEW_STORE = 'database';
const HARNESS_DIR = mkdtempSync(path.join(tmpdir(), 'review-db-tests-'));
process.env.MK_READINESS_REVIEW_HARNESS_DIR = HARNESS_DIR;

const { replay, commit, initialActions, newSessionRecord } = await import('../src/lib/readiness-review/session.ts');
const { canonicalJson } = await import('../src/lib/readiness-review/canonical.ts');
const { buildReportInput, reportInputDigest, REPORT_INPUT_CONTRACT } = await import('../src/lib/readiness-review/report-input.ts');
const { FileReviewStore, StoreConflict, StoreOutcomeUnknown, StoreUnavailable } = await import('../src/lib/readiness-review/store.ts');
const { reviewDatabaseConfig, DatabaseConfigRefused } = await import('../src/lib/readiness-review/database-config.ts');
const { DatabaseReviewStore, linkRows } = await import('../src/lib/readiness-review/database-store.ts');
const { createClient } = await import('@supabase/supabase-js');

const results = [];
const T = async (id, name, fn) => {
  const started = Date.now();
  try {
    const [ok, detail] = await fn();
    results.push({ id, name, status: ok ? 'pass' : 'fail', detail, ms: Date.now() - started });
  } catch (error) {
    results.push({ id, name, status: 'fail', detail: `threw: ${error && error.stack ? error.stack.split('\n').slice(0, 3).join(' | ') : error}`, ms: Date.now() - started });
  }
};

const config = reviewDatabaseConfig();
const local = process.env.MK_REVIEW_DB_TEST_CLIENT ? await import(path.resolve(process.env.MK_REVIEW_DB_TEST_CLIENT)) : null;
const makeClient = async (role) => (local ? local.createRpcClient(role ? { role } : undefined) : createClient(config.url, config.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }));
const client = await makeClient();
const store = new DatabaseReviewStore(client);
const created = new Set();
const target = local ? 'local embedded Postgres (PGlite)' : `hosted project ${config.projectRef}`;

// ------------------------------------------------------------------------------------------------ fixtures
let clock = Date.parse('2026-11-11T08:00:00Z');
const tick = () => new Date((clock += 1000)).toISOString();
const token = () => randomBytes(18).toString('base64url');
const PROFILE = { 'PR-01': '50to250', 'PR-12': '50to250m', 'PR-02': 'private', 'PR-13': 'retail', 'PR-04': 'board', 'PR-03': 'no', 'PR-05': 'no', 'PR-06': 'no', 'PR-07': 'no', 'PR-08': 'yes', 'PR-09': 'no', 'PR-10': 'no', 'PR-11': 'yes' };
function newSession(label = 'Fictional Database Test Co') {
  const record = newSessionRecord({ sessionId: randomUUID().replace(/-/g, ''), createdAt: tick(), organisationLabel: label, tokens: { respondent: token(), management: token(), reviewer: token(), links: token(), owners: { Finance: token(), 'HR and payroll': token() } } });
  const live = replay(record);
  live.record = { ...record, actions: initialActions(live, tick(), () => randomUUID()) };
  return live;
}
function act(live, action, actor = 'respondent') {
  const out = commit(live, action, actor, tick(), () => randomUUID());
  live.record = { ...live.record, actions: live.record.actions.concat(out) };
  return out;
}
// A mixed interview: strong answers, some gaps and some "I don't know", so the log carries every kind of record.
function pick(step, n) {
  const q = step.q;
  if (q.id.startsWith('PR-')) return PROFILE[q.id] ?? q.options.find((o) => o[0] !== 'unknown')[0];
  if (q.id === '__assumptions__') return ['none'];
  if (n % 7 === 3) return q.format === 'multi' ? ['unknown'] : 'unknown';
  if (q.format === 'practice') return n % 5 === 0 ? 'partial' : 'full';
  if (q.format === 'anchored') return n % 5 === 0 ? '2' : '4';
  if (q.format === 'multi') return q.subPractices ? Object.keys(q.subPractices).slice(0, 1) : [q.options[0][0]];
  if (q.format === 'choicePractice') return Object.keys(q.practiceMap).find((k) => q.practiceMap[k] === (n % 5 === 0 ? 'partial' : 'full')) ?? Object.keys(q.practiceMap)[0];
  return (q.options.find((o) => o[0] === 'yes') || q.options[0])[0];
}
function interview(live, answers) {
  const batches = [];
  for (let n = 0; n < answers && live.respondentStep; n++) batches.push(act(live, { type: 'respondent.answer', q: live.respondentStep.q.id, value: pick(live.respondentStep, n) }));
  return batches;
}
const digestOf = (record) => reportInputDigest(buildReportInput(replay(record)));
const same = (a, b) => canonicalJson(a) === canonicalJson(b);
async function createTracked(s, record) {
  await s.create(record);
  created.add(record.sessionId);
}

// ------------------------------------------------------------------------------------------------ access mode
if (process.argv.includes('--access-denied')) {
  const calls = [
    ['review_create_session', { p_session: {}, p_ruleset: null, p_ruleset_key: null, p_links: [], p_actions: [] }],
    ['review_append_actions', { p_session_id: 'x', p_expected_length: 0, p_actions: [] }],
    ['review_load_session', { p_session_id: 'x' }],
    ['review_find_link', { p_token_sha256: 'x' }],
    ['review_action_count', { p_session_id: 'x' }],
    ['review_record_report_run', { p_run: {} }],
    ['review_report_runs', { p_session_id: 'x' }],
    ['review_purge_session', { p_session_id: 'x' }]
  ];
  const outcomes = [];
  for (const role of local ? ['anon', 'authenticated'] : ['the given key']) {
    const c = local ? await makeClient(role) : client;
    for (const [fn, args] of calls) {
      const { error } = await c.rpc(fn, args);
      outcomes.push({ role, fn, refused: !!error && error.code === '42501', code: error?.code ?? null });
    }
  }
  let table;
  if (local) {
    const t = await local.tableReadable('anon');
    table = { refused: !t.readable, code: t.code };
  } else {
    // The store's tables are in a schema the Data API does not expose at all.
    const res = await fetch(`${config.url}/rest/v1/sessions?select=*`, { headers: { apikey: config.serviceKey, Authorization: `Bearer ${config.serviceKey}`, 'Accept-Profile': 'readiness_review' } });
    const body = await res.json().catch(() => ({}));
    table = { refused: res.status >= 400 && !Array.isArray(body), status: res.status, code: body.code ?? null };
  }
  const ok = outcomes.every((o) => o.refused) && table.refused;
  console.log(JSON.stringify({ mode: 'access-denied', target, ok, outcomes, table }, null, 1));
  rmSync(HARNESS_DIR, { recursive: true, force: true });
  process.exit(ok ? 0 : 1);
}

// ------------------------------------------------------------------------------------------------ tests
await T('D-01', 'Configuration fails closed: incomplete, foreign, insecure and shared-project settings are refused', async () => {
  const base = { MK_READINESS_REVIEW_DB_URL: 'https://abcdefghijklmnopqrst.supabase.co', MK_READINESS_REVIEW_DB_SERVICE_KEY: 'k', MK_READINESS_REVIEW_DB_PROJECT_REF: 'abcdefghijklmnopqrst' };
  const refused = (env) => { try { reviewDatabaseConfig(env); return false; } catch (e) { return e instanceof DatabaseConfigRefused && e instanceof StoreUnavailable; } };
  const cases = {
    missingKey: refused({ ...base, MK_READINESS_REVIEW_DB_SERVICE_KEY: '' }),
    otherProject: refused({ ...base, MK_READINESS_REVIEW_DB_PROJECT_REF: 'zyxwvutsrqponmlkjihg' }),
    insecure: refused({ ...base, MK_READINESS_REVIEW_DB_URL: 'http://abcdefghijklmnopqrst.supabase.co' }),
    lookalikeHost: refused({ ...base, MK_READINESS_REVIEW_DB_URL: 'https://abcdefghijklmnopqrst.supabase.co.example.com' }),
    sharedProject: refused({ MK_READINESS_REVIEW_DB_URL: 'https://iszihmmbgsfefawqmnwo.supabase.co', MK_READINESS_REVIEW_DB_SERVICE_KEY: 'k', MK_READINESS_REVIEW_DB_PROJECT_REF: 'iszihmmbgsfefawqmnwo' })
  };
  let accepted = false;
  try { accepted = reviewDatabaseConfig(base).projectRef === base.MK_READINESS_REVIEW_DB_PROJECT_REF; } catch { accepted = false; }
  return [Object.values(cases).every(Boolean) && accepted, `refused ${JSON.stringify(cases)}; isolated project accepted ${accepted}`];
});

await T('D-02', 'A stored session reads back unchanged, identical to the file harness, and replays to the same report input', async () => {
  const live = newSession();
  interview(live, 40);
  const record = live.record;
  await createTracked(store, record);
  const fromDb = await store.load(record.sessionId);
  const file = new FileReviewStore(path.join(HARNESS_DIR, 'equivalence'));
  await file.create(record);
  const fromFile = await file.load(record.sessionId);
  const digests = { memory: digestOf(record), database: digestOf(fromDb), file: digestOf(fromFile) };
  const ok = same(fromDb, record) && same(fromFile, fromDb) && digests.memory === digests.database && digests.database === digests.file;
  return [ok, `${record.actions.length} actions; database record equals the original ${same(fromDb, record)} and the file harness ${same(fromFile, fromDb)}; report input digests ${digests.memory.slice(0, 12)} / ${digests.database.slice(0, 12)} / ${digests.file.slice(0, 12)}`];
});

await T('D-03', 'Appends are sequence-checked: each answer appends at the expected length; a stale or repeated save is a conflict', async () => {
  const live = newSession();
  const start = live.record;
  await createTracked(store, start);
  let length = start.actions.length;
  let appended = 0;
  for (let n = 0; n < 30 && live.respondentStep; n++) {
    const out = act(live, { type: 'respondent.answer', q: live.respondentStep.q.id, value: pick(live.respondentStep, n) });
    length = await store.append(start.sessionId, length, out);
    appended += out.length;
  }
  const stored = await store.load(start.sessionId);
  const out = act(live, { type: 'respondent.stop' });
  let stale = null;
  try { await store.append(start.sessionId, length - 1, out); } catch (e) { stale = e; }
  let repeated = null;
  try { await store.append(start.sessionId, length, [{ ...out[0], seq: length, id: stored.actions[3].id }]); } catch (e) { repeated = e; }
  const countAfter = await store.actionCount(start.sessionId);
  const ok = same(stored, { ...start, actions: live.record.actions.slice(0, length) }) && stale instanceof StoreConflict && repeated instanceof StoreConflict && countAfter === length;
  return [ok, `${appended} actions appended in ${30} saves; stored log equals the in-memory log ${same(stored, { ...start, actions: live.record.actions.slice(0, length) })}; stale save ${stale?.constructor.name}; repeated action id ${repeated?.constructor.name}; length unchanged ${countAfter === length}`];
});

await T('D-04', 'A lost response is resolved by reading the log back: stored is reported as stored, not stored as nothing recorded, and unknown only when it cannot be read', async () => {
  const live = newSession();
  await createTracked(store, live.record);
  let length = live.record.actions.length;
  // Lost after the write: the database stored it, the answer never arrived.
  const afterWrite = new DatabaseReviewStore({ rpc: async (fn, args) => { const r = await client.rpc(fn, args); return fn === 'review_append_actions' ? { data: null, error: { code: '', message: 'fetch failed' } } : r; } });
  const a = act(live, { type: 'respondent.answer', q: live.respondentStep.q.id, value: pick(live.respondentStep, 0) });
  const reconciled = await afterWrite.append(live.record.sessionId, length, a);
  length = reconciled;
  // Lost before the write: nothing reached the database.
  const beforeWrite = new DatabaseReviewStore({ rpc: async (fn, args) => (fn === 'review_append_actions' ? { data: null, error: { code: '', message: 'fetch failed' } } : client.rpc(fn, args)) });
  const b = act(live, { type: 'respondent.answer', q: live.respondentStep.q.id, value: pick(live.respondentStep, 1) });
  let notStored = null;
  try { await beforeWrite.append(live.record.sessionId, length, b); } catch (e) { notStored = e; }
  // Nothing answers at all.
  const silent = new DatabaseReviewStore({ rpc: async () => ({ data: null, error: { code: '', message: 'fetch failed' } }) });
  let unknown = null;
  try { await silent.append(live.record.sessionId, length, b); } catch (e) { unknown = e; }
  // A start whose response was lost is confirmed by reading it back.
  const lostCreate = newSession();
  const afterCreate = new DatabaseReviewStore({ rpc: async (fn, args) => { const r = await client.rpc(fn, args); return fn === 'review_create_session' ? { data: null, error: { code: '', message: 'fetch failed' } } : r; } });
  await afterCreate.create(lostCreate.record);
  created.add(lostCreate.record.sessionId);
  const createConfirmed = same(await store.load(lostCreate.record.sessionId), lostCreate.record);
  const count = await store.actionCount(live.record.sessionId);
  const ok = reconciled === live.record.actions.length - b.length && notStored instanceof StoreUnavailable && !(notStored instanceof StoreOutcomeUnknown) && /Nothing was recorded/.test(notStored.message) &&
    unknown instanceof StoreOutcomeUnknown && count === reconciled && createConfirmed;
  return [ok, `lost after write: confirmed stored at length ${reconciled}; lost before write: ${notStored?.constructor.name} "${notStored?.message}"; no answer at all: ${unknown?.constructor.name}; lost start confirmed ${createConfirmed}`];
});

await T('D-05', 'Concurrent starts and saves: 24 simultaneous starts all resolvable; 12 simultaneous saves at one length give one winner and 11 conflicts', async () => {
  const sessions = Array.from({ length: 24 }, (_, i) => newSession(`Fictional Concurrent Co ${i + 1}`));
  const starts = await Promise.allSettled(sessions.map((s) => store.create(s.record).then(() => created.add(s.record.sessionId))));
  let resolvable = 0;
  for (const s of sessions) {
    const t = s.record.tokens;
    const found = await Promise.all([t.respondent, t.management, t.reviewer, t.links, t.owners.Finance].map((x) => store.findToken(x)));
    if (found.every((f) => f && f.sessionId === s.record.sessionId) && found[4].role === 'owner' && found[4].fn === 'Finance') resolvable++;
  }
  const target = sessions[0];
  const length = target.record.actions.length;
  const contenders = Array.from({ length: 12 }, () => commit(replay(target.record), { type: 'respondent.stop' }, 'respondent', tick(), () => randomUUID()));
  const saves = await Promise.allSettled(contenders.map((c) => store.append(target.record.sessionId, length, c)));
  const won = saves.filter((r) => r.status === 'fulfilled').length;
  const conflicts = saves.filter((r) => r.status === 'rejected' && r.reason instanceof StoreConflict).length;
  const count = await store.actionCount(target.record.sessionId);
  const ok = starts.every((r) => r.status === 'fulfilled') && resolvable === 24 && won === 1 && conflicts === 11 && count === length + contenders[0].length;
  return [ok, `starts ${starts.filter((r) => r.status === 'fulfilled').length}/24, all role links resolvable for ${resolvable}; saves: ${won} won, ${conflicts} conflicts; stored length ${count} (expected ${length + contenders[0].length}); ${local ? 'calls serialised on one embedded connection' : 'separate HTTP requests, so separate database connections'}`];
});

await T('D-06', 'Through the service: a session started, answered and exported on the database store; a write by another process is seen at once', async () => {
  // Against a local database the service is handed the same store; against a hosted project it connects on its own.
  if (local) globalThis.__mkReadinessReview = { cache: new Map(), queues: new Map(), store: new DatabaseReviewStore(await makeClient()) };
  const service = await import('../src/lib/readiness-review/service.ts');
  const started = await service.createSession('Fictional Service Co');
  created.add(started.sessionId);
  let answered = 0;
  for (let n = 0; n < 25; n++) {
    const { view } = await service.viewFor(started.tokens.respondent);
    if (!view.step) break;
    const values = view.step.choices.map((c) => c.value).filter((v) => v !== 'unknown');
    const value = view.step.format === 'multi' ? [values[0]] : values[0];
    await service.submit(started.tokens.respondent, { actionId: randomUUID(), expectedSeq: view.seq, action: { type: 'respondent.answer', q: view.step.q, value } });
    answered++;
  }
  const before = await service.exportFor(started.tokens.management);
  // Another server process stops the interview directly in the database.
  const other = new DatabaseReviewStore(await makeClient());
  const stored = await other.load(started.sessionId);
  const stop = commit(replay(stored), { type: 'respondent.stop' }, 'respondent', new Date().toISOString(), () => randomUUID());
  await other.append(started.sessionId, stored.actions.length, stop);
  const after = await service.exportFor(started.tokens.management);
  const seen = after.session.actions === stored.actions.length + stop.length && after.report.status.interview === 'ended' && before.report.status.interview === 'in progress';
  const finalDb = await other.load(started.sessionId);
  const ok = answered === 25 && seen && digestOf(finalDb) === reportInputDigest(buildReportInput(replay(finalDb)));
  return [ok, `${answered} answers through the service; export before ${before.session.actions} actions (${before.report.status.interview}), after another process stopped it ${after.session.actions} (${after.report.status.interview})`];
});

await T('D-07', 'Report lineage: a run records the input digest and log position; the same input is rebuilt from the stored log prefix after the log has grown', async () => {
  const live = newSession();
  interview(live, 35);
  await createTracked(store, live.record);
  const record = await store.load(live.record.sessionId);
  const input = buildReportInput(replay(record));
  const runId = await store.recordReportRun({
    sessionId: record.sessionId,
    inputContract: REPORT_INPUT_CONTRACT.name,
    inputVersion: REPORT_INPUT_CONTRACT.version,
    inputDigest: reportInputDigest(input),
    logDigest: input.lineage.logDigest,
    actionCount: input.lineage.actionCount,
    reportEngine: 'none',
    reportEngineVersion: '0',
    status: 'failed',
    failure: 'Lineage test only: no report engine is connected yet, so no report was produced.',
    createdBy: 'readiness-review-database-tests'
  });
  const more = interview(live, 10).flat();
  await store.append(record.sessionId, record.actions.length, more);
  const grown = await store.load(record.sessionId);
  const runs = await store.reportRuns(record.sessionId);
  const run = runs[0];
  const rebuilt = buildReportInput(replay({ ...grown, actions: grown.actions.slice(0, run.actionCount) }));
  let ahead = null;
  try { await store.recordReportRun({ ...run, sessionId: record.sessionId, status: 'failed', failure: 'x', actionCount: grown.actions.length + 1, createdBy: 'x' }); } catch (e) { ahead = e; }
  const ok = typeof runId === 'string' && runs.length === 1 && run.inputDigest === reportInputDigest(rebuilt) && run.logDigest === rebuilt.lineage.logDigest && grown.actions.length > run.actionCount && ahead instanceof StoreUnavailable;
  return [ok, `run ${runId?.slice(0, 8)} at log position ${run.actionCount}; log grew to ${grown.actions.length}; input rebuilt from the stored prefix matches the recorded digest ${run.inputDigest === reportInputDigest(rebuilt)}; a run ahead of the log refused ${ahead instanceof StoreUnavailable}`];
});

await T('D-08', 'Links are stored by hash only: no role token appears in the lookup table input, and an unknown or malformed token resolves to nothing', async () => {
  const live = newSession();
  const rows = linkRows(live.record);
  const raw = Object.values(live.record.tokens).flatMap((v) => (typeof v === 'string' ? [v] : Object.values(v)));
  const leaked = rows.some((r) => raw.some((t) => JSON.stringify(r).includes(t)));
  const unknown = await store.findToken(token());
  const malformed = await store.findToken('not a token');
  return [!leaked && rows.length === raw.length && unknown === null && malformed === null, `${rows.length} links, raw token in a lookup row ${leaked}; unknown resolves to ${unknown}; malformed resolves to ${malformed}`];
});

// ------------------------------------------------------------------------------------------------ cleanup
let purged = 0;
for (const id of created) if (await store.purge(id)) purged++;
const remaining = (await Promise.all([...created].map((id) => store.load(id)))).filter(Boolean).length;
results.push({ id: 'D-09', name: 'Every session these tests created is purged', status: remaining === 0 ? 'pass' : 'fail', detail: `${purged} of ${created.size} purged; ${remaining} remaining` });
rmSync(HARNESS_DIR, { recursive: true, force: true });

const summary = results.reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {});
results.forEach((r) => console.log(`${r.id.padEnd(6)} ${r.status.padEnd(5)} ${r.name}\n        ${r.detail}`));
console.log(JSON.stringify({ target, ...summary }));
if (process.env.MK_REVIEW_DB_RESULTS) writeFileSync(process.env.MK_REVIEW_DB_RESULTS, JSON.stringify({ target, summary, results }, null, 1));
process.exit(summary.fail ? 1 : 0);
