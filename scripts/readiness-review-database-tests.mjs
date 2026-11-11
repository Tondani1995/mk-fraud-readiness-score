// Integration tests for the database review store, run against one explicitly chosen backend.
//
//   MK_REVIEW_TEST_BACKEND=local   embedded Postgres 17 (PGlite) with the store migration and the Supabase API roles.
//                                  Needs MK_PGLITE_DIR (see scripts/lib/readiness-review-pglite-client.mjs). No network.
//   MK_REVIEW_TEST_BACKEND=hosted  the authorised temporary project only (zuqegvsfhzgcydyivnqv), through the existing
//                                  RPC interface with the server-side secret key. See scripts/lib/readiness-review-test-backends.mjs
//                                  for the settings; run without the secret key to see the exact configuration steps.
//
// node --experimental-strip-types --experimental-loader=./scripts/lib/ts-relative-resolve-loader.mjs scripts/readiness-review-database-tests.mjs [--access-denied]
//
// The same scenarios run against both backends. Each test is pass, fail, blocked (the hosted secret key is not available,
// so it was not executed) or n/a (it does not apply to that backend, with the reason). Exit code: 0 all executed tests
// passed and none is blocked; 1 a test failed; 2 the configuration was refused and nothing ran; 3 tests are blocked.
// --access-denied runs only the denial scenario (3), which needs no secret key for the public role.
//
// Every record is fictional, is screened for personal data before it is sent and again when read back, and is purged
// before the script ends. No key is printed or written to the results.
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
process.env.MK_READINESS_REVIEW_HARNESS = 'fictional-local';
process.env.MK_READINESS_REVIEW_STORE = 'database';
const HARNESS_DIR = mkdtempSync(path.join(tmpdir(), 'review-db-tests-'));
process.env.MK_READINESS_REVIEW_HARNESS_DIR = HARNESS_DIR;
// The service under test keeps its store here; the tests set it explicitly (see useServiceStore).
globalThis.__mkReadinessReview = { cache: new Map(), queues: new Map() };
const serviceGlobals = globalThis.__mkReadinessReview;

const backends = await import('./lib/readiness-review-test-backends.mjs');
const { replay, commit, initialActions, ensureOwnerServed, newSessionRecord, ActionRejected } = await import('../src/lib/readiness-review/session.ts');
const { canonicalJson, canonicalDigest } = await import('../src/lib/readiness-review/canonical.ts');
const { buildReportInput, reportInputDigest, REPORT_INPUT_CONTRACT } = await import('../src/lib/readiness-review/report-input.ts');
const { reportFor } = await import('../src/lib/readiness-review/view-model.ts');
const { CONTROL_STATE_LABEL } = await import('../src/lib/readiness-review/labels.ts');
const { FileReviewStore, StoreConflict, StoreOutcomeUnknown, StoreUnavailable } = await import('../src/lib/readiness-review/store.ts');
const { reviewDatabaseConfig, DatabaseConfigRefused } = await import('../src/lib/readiness-review/database-config.ts');
const { DatabaseReviewStore, linkRows } = await import('../src/lib/readiness-review/database-store.ts');

const accessOnly = process.argv.includes('--access-denied');
const results = [];
const created = new Set();
let screenedSent = 0;

function finish(code, extra = {}) {
  rmSync(HARNESS_DIR, { recursive: true, force: true });
  const summary = results.reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {});
  const verdict = code === 2 ? 'REFUSED' : summary.fail ? 'FAIL' : summary.blocked ? 'BLOCKED' : 'PASS';
  results.forEach((r) => console.log(`${r.id.padEnd(5)} ${r.status.padEnd(7)} ${r.name}\n        ${r.detail}`));
  const out = { backend: backend?.mode ?? process.env.MK_REVIEW_TEST_BACKEND ?? null, target: backend?.target ?? null, verdict, summary, ...extra };
  console.log(JSON.stringify(out));
  if (process.env.MK_REVIEW_DB_RESULTS) writeFileSync(process.env.MK_REVIEW_DB_RESULTS, JSON.stringify({ ...out, preflight: backend?.preflight ?? null, results }, null, 1));
  process.exit(code === 2 ? 2 : summary.fail ? 1 : summary.blocked ? 3 : 0);
}

// ------------------------------------------------------------------------------------------------ backend
let backend = null;
try {
  backend = await backends.openBackend(process.env, { needSecret: false });
} catch (error) {
  if (!(error instanceof backends.BackendRefused)) throw error;
  console.error(`REFUSED: ${error.message}`);
  finish(2, { refused: error.message });
}
const client = backend.serviceClient;
if (backend.serviceBlocked) console.error(`BLOCKED (tests that need the secret key): ${backend.serviceBlocked}\n${backends.hostedConfigurationInstructions()}\n`);

/**
 * Runs one test. needs: 'none' (no database), 'public' (the public role only) or 'service' (the secret key).
 * only: the backend it applies to, with the reason it does not apply elsewhere.
 */
async function T(id, name, fn, { needs = 'service', only = null, why = '' } = {}) {
  if (accessOnly && !id.startsWith('S3') && id !== 'S7.4') return;
  if (only && backend.mode !== only) return results.push({ id, name, status: 'n/a', detail: why });
  if (needs === 'service' && backend.serviceBlocked) return results.push({ id, name, status: 'blocked', detail: `not executed: ${backend.serviceBlocked}` });
  const started = Date.now();
  try {
    const [ok, detail] = await fn();
    results.push({ id, name, status: ok ? 'pass' : 'fail', detail, ms: Date.now() - started });
  } catch (error) {
    results.push({ id, name, status: 'fail', detail: `threw: ${error && error.stack ? error.stack.split('\n').slice(0, 3).join(' | ') : error}`, ms: Date.now() - started });
  }
}

// ------------------------------------------------------------------------------------------------ fictional data only
const PERSONAL_DATA = [
  ['an email address', /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i],
  ['a phone number', /(?:\+27|\b0)[1-8]\d(?:[ -]?\d){7}\b/],
  ['an identity number', /\b\d{13}\b/],
  ['a card or account number', /\b(?:\d[ -]?){11,18}\d\b/]
];
function freeText(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => freeText(v, out));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) if (!['id', 'seq', 'at', 'actor', 'type'].includes(k)) freeText(v, out);
  return out;
}
/** Refuses to send, or flags on reading back, anything that is not a fictional record. */
function fictionalOnly(record, sending = true) {
  if (record.fictional !== true || !/^Fictional /.test(record.organisationLabel)) throw new Error(`Refused: session ${record.sessionId} is not a fictional record`);
  fictionalActions(record.actions, sending);
}
function fictionalActions(actions, sending = true) {
  for (const text of freeText(actions)) for (const [what, re] of PERSONAL_DATA) if (re.test(text)) throw new Error(`Refused: an action carries what looks like ${what}`);
  if (sending) screenedSent += actions.length;
}
/** The store under test, screening every record before it is sent and remembering every session for the purge. */
function screened(inner) {
  return new Proxy(inner, {
    get(target, prop) {
      if (prop === 'create') return async (record) => { fictionalOnly(record); created.add(record.sessionId); return target.create(record); };
      if (prop === 'append') return async (id, length, actions) => { fictionalActions(actions); return target.append(id, length, actions); };
      const value = target[prop];
      return typeof value === 'function' ? value.bind(target) : value;
    }
  });
}
const store = client ? screened(new DatabaseReviewStore(client)) : null;

/** A client whose responses can be lost on purpose: before the call reaches the database, or after it ran. */
function flakyClient(inner) {
  let plan = {};
  let unreachable = false;
  const lost = { data: null, error: { code: '', message: 'fetch failed (simulated lost response)' } };
  return {
    plan(next = {}) { plan = { ...next }; unreachable = false; },
    async rpc(fn, args) {
      if (unreachable) return lost;
      const mode = plan[fn];
      if (mode === 'lose-before' || mode === 'lose-after') {
        delete plan[fn];
        if (mode === 'lose-after') await inner.rpc(fn, args);
        if (plan.thenUnreachable) unreachable = true;
        return lost;
      }
      return inner.rpc(fn, args);
    }
  };
}
/** A client that records the database's raw answer to every call. */
function recordingClient(inner) {
  const calls = [];
  return { calls, async rpc(fn, args) { const r = await inner.rpc(fn, args); calls.push({ fn, code: r.error?.code ?? null, refused: !!r.error }); return r; } };
}

// ------------------------------------------------------------------------------------------------ fixtures
let clock = Date.parse('2026-11-11T08:00:00Z');
const tick = () => new Date((clock += 1000)).toISOString();
const token = () => randomBytes(18).toString('base64url');
const PROFILE = { 'PR-01': '50to250', 'PR-12': '50to250m', 'PR-02': 'private', 'PR-13': 'retail', 'PR-04': 'board', 'PR-03': 'no', 'PR-05': 'no', 'PR-06': 'no', 'PR-07': 'no', 'PR-08': 'yes', 'PR-09': 'no', 'PR-10': 'no', 'PR-11': 'yes' };
function newSession(label = 'Fictional Database Test Co', fixed = null) {
  const record = newSessionRecord(fixed ?? { sessionId: randomUUID().replace(/-/g, ''), createdAt: tick(), organisationLabel: label, tokens: { respondent: token(), management: token(), reviewer: token(), links: token(), owners: { Finance: token(), 'HR and payroll': token() } } });
  const live = replay(record);
  live.record = { ...record, actions: initialActions(live, fixed ? fixed.createdAt : tick(), fixed ? fixed.newId : () => randomUUID()) };
  return live;
}
function act(live, action, actor = 'respondent', at = tick(), newId = () => randomUUID()) {
  const out = commit(live, action, actor, at, newId);
  live.record = { ...live.record, actions: live.record.actions.concat(out) };
  return out;
}
function strongValue(step) {
  const q = step.q;
  if (q.id.startsWith('PR-')) return PROFILE[q.id] ?? q.options.find((o) => o[0] !== 'unknown')[0];
  if (q.id === '__assumptions__') return ['none'];
  if (q.format === 'practice') return 'full';
  if (q.format === 'anchored') return '4';
  if (q.format === 'multi') return q.subPractices ? Object.keys(q.subPractices) : [q.options[0][0]];
  if (q.format === 'choicePractice') return Object.keys(q.practiceMap).find((k) => q.practiceMap[k] === 'full') ?? Object.keys(q.practiceMap)[0];
  return (q.options.find((o) => o[0] === 'yes') || q.options[0])[0];
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
const controlsOf = (input) => input.domains.flatMap((d) => d.controls);
const keysDeep = (o, out = new Set()) => { if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) { out.add(k); keysDeep(v, out); } return out; };
/** Stores a session as the service does: created with its first actions, then each committed batch appended in turn. */
async function storeInBatches(s, record, batches) {
  await s.create({ ...record, actions: batches[0] });
  let length = batches[0].length;
  for (const b of batches.slice(1)) if (b.length) length = await s.append(record.sessionId, length, b);
  return length;
}
function useServiceStore(s) {
  serviceGlobals.store = s;
  serviceGlobals.cache.clear();
  serviceGlobals.queues.clear();
}
let serviceModule;
const service = async () => (serviceModule ??= await import('../src/lib/readiness-review/service.ts'));
function answerFor(view) {
  const values = view.step.choices.map((c) => c.value).filter((v) => v !== 'unknown');
  return { type: 'respondent.answer', q: view.step.q, value: view.step.format === 'multi' ? [values[0]] : values[0] };
}

// ------------------------------------------------------------------------------------------------ harness checks
await T('H.1', 'Store configuration fails closed: incomplete, foreign, insecure and shared-project settings are refused', async () => {
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
}, { needs: 'none' });

await T('H.2', 'Test harness fails closed: no mode, another project, a public key as the secret, a key of another project, an exposed key file; a missing secret blocks', async () => {
  const ref = backends.AUTHORISED_HOSTED_TEST_PROJECT_REF;
  const jwt = (claims) => `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.fictional-signature`;
  const publishable = 'sb_' + 'publishable_' + 'fictionaltestvalue000';
  const secret = 'sb_' + 'secret_' + 'fictionaltestvalue000';
  const ok = { MK_REVIEW_TEST_BACKEND: 'hosted', MK_READINESS_REVIEW_DB_URL: `https://${ref}.supabase.co`, MK_READINESS_REVIEW_DB_PROJECT_REF: ref, MK_REVIEW_TEST_PUBLIC_KEY: publishable, MK_READINESS_REVIEW_DB_SERVICE_KEY: secret };
  const keyFile = path.join(HARNESS_DIR, 'fictional-secret-key');
  writeFileSync(keyFile, secret);
  const outcome = (env, opts) => { try { backends.hostedTestConfig(env, opts); return 'accepted'; } catch (e) { return e instanceof backends.BackendBlocked ? 'blocked' : e instanceof backends.BackendRefused ? 'refused' : `threw ${e}`; } };
  const mode = (env) => { try { backends.testBackendMode(env); return 'accepted'; } catch (e) { return e instanceof backends.BackendRefused ? 'refused' : 'threw'; } };
  const { MK_READINESS_REVIEW_DB_SERVICE_KEY: _drop, ...noSecret } = ok;
  chmodSync(keyFile, 0o644);
  const exposedFile = outcome({ ...noSecret, MK_READINESS_REVIEW_DB_SERVICE_KEY_FILE: keyFile });
  chmodSync(keyFile, 0o600);
  const cases = {
    noMode: mode({}) === 'refused',
    unknownMode: mode({ MK_REVIEW_TEST_BACKEND: 'staging' }) === 'refused',
    missingSecretBlocks: outcome(noSecret) === 'blocked',
    missingSecretAllowedForPublicChecks: outcome(noSecret, { needSecret: false }) === 'accepted',
    missingPublicKey: outcome({ ...ok, MK_REVIEW_TEST_PUBLIC_KEY: '' }) === 'refused',
    anotherProject: outcome({ ...ok, MK_READINESS_REVIEW_DB_PROJECT_REF: 'abcdefghijklmnopqrst', MK_READINESS_REVIEW_DB_URL: 'https://abcdefghijklmnopqrst.supabase.co' }) === 'refused',
    sharedProject: outcome({ ...ok, MK_READINESS_REVIEW_DB_PROJECT_REF: 'iszihmmbgsfefawqmnwo', MK_READINESS_REVIEW_DB_URL: 'https://iszihmmbgsfefawqmnwo.supabase.co' }) === 'refused',
    addressOfAnotherProject: outcome({ ...ok, MK_READINESS_REVIEW_DB_URL: 'https://abcdefghijklmnopqrst.supabase.co' }) === 'refused',
    insecureAddress: outcome({ ...ok, MK_READINESS_REVIEW_DB_URL: `http://${ref}.supabase.co` }) === 'refused',
    publishableAsSecret: outcome({ ...ok, MK_READINESS_REVIEW_DB_SERVICE_KEY: 'sb_' + 'publishable_' + 'othervalue0000' }) === 'refused',
    anonJwtAsSecret: outcome({ ...ok, MK_READINESS_REVIEW_DB_SERVICE_KEY: jwt({ role: 'anon', ref }) }) === 'refused',
    serviceJwtOfAnotherProject: outcome({ ...ok, MK_READINESS_REVIEW_DB_SERVICE_KEY: jwt({ role: 'service_role', ref: 'abcdefghijklmnopqrst' }) }) === 'refused',
    publicKeyOfAnotherProject: outcome({ ...ok, MK_REVIEW_TEST_PUBLIC_KEY: jwt({ role: 'anon', ref: 'abcdefghijklmnopqrst' }) }) === 'refused',
    secretAsPublicKey: outcome({ ...ok, MK_REVIEW_TEST_PUBLIC_KEY: secret }) === 'refused',
    keyTwice: outcome({ ...ok, MK_READINESS_REVIEW_DB_SERVICE_KEY_FILE: keyFile }) === 'refused',
    exposedKeyFile: exposedFile === 'refused',
    privateKeyFileAccepted: outcome({ ...noSecret, MK_READINESS_REVIEW_DB_SERVICE_KEY_FILE: keyFile }) === 'accepted',
    serviceJwtAccepted: outcome({ ...ok, MK_READINESS_REVIEW_DB_SERVICE_KEY: jwt({ role: 'service_role', ref }) }) === 'accepted',
    validAccepted: outcome(ok) === 'accepted'
  };
  const failed = Object.entries(cases).filter(([, v]) => !v).map(([k]) => k);
  return [failed.length === 0, `${Object.keys(cases).length} cases, all as expected${failed.length ? ` except ${failed.join(', ')}` : ''}; the hosted run also checks over the network that the API answers as ${ref}, that the public key is refused and that the secret key can execute the eight store functions`];
}, { needs: 'none' });

// ------------------------------------------------------------------------------------------------ 1. creation, retrieval, appends, corrections
await T('S1.1', 'A fictional session is created and read back unchanged, identical to the file harness, replaying to the same report input', async () => {
  const live = newSession();
  interview(live, 40);
  const record = live.record;
  await store.create(record);
  const fromDb = await store.load(record.sessionId);
  const file = new FileReviewStore(path.join(HARNESS_DIR, 'equivalence'));
  await file.create(record);
  const fromFile = await file.load(record.sessionId);
  const digests = { memory: digestOf(record), database: digestOf(fromDb), file: digestOf(fromFile) };
  const ok = same(fromDb, record) && same(fromFile, fromDb) && digests.memory === digests.database && digests.database === digests.file;
  return [ok, `${record.actions.length} actions; database record equals the original ${same(fromDb, record)} and the file harness ${same(fromFile, fromDb)}; report input digests ${digests.memory.slice(0, 12)} / ${digests.database.slice(0, 12)} / ${digests.file.slice(0, 12)}`];
});

await T('S1.2', 'Ordered appends: each save appends at the expected length; the stored log is numbered without gaps, in time order, with unique ids', async () => {
  const live = newSession();
  const start = live.record;
  await store.create(start);
  let length = start.actions.length;
  let saves = 0;
  for (let n = 0; n < 30 && live.respondentStep; n++) {
    const out = act(live, { type: 'respondent.answer', q: live.respondentStep.q.id, value: pick(live.respondentStep, n) });
    length = await store.append(start.sessionId, length, out);
    saves++;
  }
  const stored = await store.load(start.sessionId);
  const numbered = stored.actions.every((a, i) => a.seq === i);
  const ordered = stored.actions.every((a, i) => i === 0 || a.at >= stored.actions[i - 1].at);
  const unique = new Set(stored.actions.map((a) => a.id)).size === stored.actions.length;
  const ok = same(stored, live.record) && numbered && ordered && unique && (await store.actionCount(start.sessionId)) === stored.actions.length;
  return [ok, `${saves} saves, ${stored.actions.length} actions; equals the in-memory log ${same(stored, live.record)}; numbered 0..${stored.actions.length - 1} without gaps ${numbered}; time order ${ordered}; unique ids ${unique}`];
});

await T('S1.3', 'Correction history: two corrections are stored in order and the report input keeps every earlier version, oldest first', async () => {
  const live = newSession();
  interview(live, 30);
  await store.create(live.record);
  let length = live.record.actions.length;
  const e = live.engine;
  const id = Object.keys(e.S.ans).find((q) => e.QI[q]?.format === 'anchored' && e.S.ans[q].via === 'respondent' && e.S.ans[q].v !== 'unknown');
  const original = e.S.ans[id].v;
  const versions = [original, ...['0', '2', '4'].filter((v) => v !== original).slice(0, 2)];
  for (const value of versions.slice(1)) length = await store.append(live.record.sessionId, length, act(live, { type: 'respondent.correct', q: id, value }));
  const stored = await store.load(live.record.sessionId);
  const input = buildReportInput(replay(stored));
  const c = controlsOf(input).find((x) => x.id === id);
  const corrections = stored.actions.filter((a) => a.type === 'respondent.correct' && a.q === id);
  const ok = same(stored, live.record) && corrections.length === 2 && corrections[0].seq < corrections[1].seq &&
    c.history.map((h) => h.value).join() === versions.slice(0, 2).join() && c.history.map((h) => h.version).join() === '1,2' &&
    c.history.map((h) => h.source).join() === 'respondent-answer,respondent-correction' && c.answer.value === versions[2] && c.answer.version === 3 &&
    c.answer.source === 'respondent-correction' && c.answer.via === 'respondent' && input.interview.corrections === 2 && digestOf(stored) === reportInputDigest(input);
  return [ok, `${id}: answered ${versions[0]}, corrected to ${versions[1]} then ${versions[2]}; stored corrections at #${corrections.map((a) => a.seq).join(', #')}; input history ${c.history.map((h) => `v${h.version}=${h.value} (${h.source})`).join(', ')}; current v${c.answer.version}=${c.answer.value} (${c.answer.source}); corrections counted ${input.interview.corrections}`];
});

await T('S1.4', 'Role links are stored by hash only: no raw link reaches the lookup, and an unknown or malformed link resolves to nothing', async () => {
  const live = newSession();
  const rows = linkRows(live.record);
  const raw = Object.values(live.record.tokens).flatMap((v) => (typeof v === 'string' ? [v] : Object.values(v)));
  const leaked = rows.some((r) => raw.some((t) => JSON.stringify(r).includes(t)));
  await store.create(live.record);
  const found = await Promise.all(raw.map((t) => store.findToken(t)));
  const unknown = await store.findToken(token());
  const malformed = await store.findToken('not a token');
  const ok = !leaked && rows.length === raw.length && found.every((f) => f && f.sessionId === live.record.sessionId) && unknown === null && malformed === null;
  return [ok, `${rows.length} links, raw link in a lookup row ${leaked}; all ${found.filter(Boolean).length} resolve to their session; unknown resolves to ${unknown}; malformed resolves to ${malformed}`];
});

// ------------------------------------------------------------------------------------------------ 2. concurrency, stale saves, retries, ambiguous responses
await T('S2.1', 'Stale and repeated saves are conflicts and change nothing', async () => {
  const live = newSession();
  await store.create(live.record);
  let length = live.record.actions.length;
  for (const b of interview(live, 10)) length = await store.append(live.record.sessionId, length, b);
  const before = await store.load(live.record.sessionId);
  const out = act(live, { type: 'respondent.stop' });
  let stale = null;
  try { await store.append(live.record.sessionId, length - 1, out); } catch (e) { stale = e; }
  let repeated = null;
  try { await store.append(live.record.sessionId, length, [{ ...out[0], seq: length, id: before.actions[3].id }]); } catch (e) { repeated = e; }
  const after = await store.load(live.record.sessionId);
  const ok = stale instanceof StoreConflict && repeated instanceof StoreConflict && same(after, before);
  return [ok, `stale save (expected ${length - 1}, stored ${length}): ${stale?.constructor.name}; repeated action id: ${repeated?.constructor.name}; stored log unchanged ${same(after, before)}`];
});

await T('S2.2', 'A lost response is resolved by reading the log back: stored is reported as stored, not stored as nothing recorded, and unknown only when it cannot be read', async () => {
  const live = newSession();
  await store.create(live.record);
  let length = live.record.actions.length;
  const flaky = flakyClient(client);
  const s = screened(new DatabaseReviewStore(flaky));
  flaky.plan({ review_append_actions: 'lose-after' });
  const a = act(live, { type: 'respondent.answer', q: live.respondentStep.q.id, value: pick(live.respondentStep, 0) });
  const reconciled = await s.append(live.record.sessionId, length, a);
  length = reconciled;
  flaky.plan({ review_append_actions: 'lose-before' });
  const b = act(live, { type: 'respondent.answer', q: live.respondentStep.q.id, value: pick(live.respondentStep, 1) });
  let notStored = null;
  try { await s.append(live.record.sessionId, length, b); } catch (e) { notStored = e; }
  flaky.plan({ review_append_actions: 'lose-before', thenUnreachable: true });
  let unknown = null;
  try { await s.append(live.record.sessionId, length, b); } catch (e) { unknown = e; }
  const lostCreate = newSession();
  flaky.plan({ review_create_session: 'lose-after' });
  await s.create(lostCreate.record);
  const createConfirmed = same(await store.load(lostCreate.record.sessionId), lostCreate.record);
  const count = await store.actionCount(live.record.sessionId);
  const ok = reconciled === live.record.actions.length - b.length && notStored instanceof StoreUnavailable && !(notStored instanceof StoreOutcomeUnknown) && /Nothing was recorded/.test(notStored.message) &&
    unknown instanceof StoreOutcomeUnknown && count === reconciled && createConfirmed;
  return [ok, `lost after write: confirmed stored at length ${reconciled}; lost before write: ${notStored?.constructor.name} "${notStored?.message}"; no answer at all: ${unknown?.constructor.name}; lost start confirmed ${createConfirmed}`];
});

await T('S2.3', 'Concurrent starts and saves: 24 simultaneous starts all resolvable; 12 simultaneous saves at one length give one winner and 11 conflicts', async () => {
  const sessions = Array.from({ length: 24 }, (_, i) => newSession(`Fictional Concurrent Co ${i + 1}`));
  const starts = await Promise.allSettled(sessions.map((s) => store.create(s.record)));
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
  return [ok, `starts ${starts.filter((r) => r.status === 'fulfilled').length}/24, all role links resolvable for ${resolvable}; saves: ${won} won, ${conflicts} conflicts; stored length ${count} (expected ${length + contenders[0].length}); ${backend.mode === 'local' ? 'calls serialised on one embedded connection' : 'separate HTTP requests, so separate database connections'}`];
});

await T('S2.4', 'Through the service: a lost response, an unconfirmed save retried, a save that never arrived retried, and a stale retry; each answer is stored exactly once', async () => {
  const svc = await service();
  const flaky = flakyClient(client);
  useServiceStore(screened(new DatabaseReviewStore(flaky)));
  const started = await svc.createSession('Fictional Retry Co');
  created.add(started.sessionId);
  const r = started.tokens.respondent;
  const next = async () => { const { view } = await svc.viewFor(r); return { actionId: randomUUID(), expectedSeq: view.seq, action: answerFor(view) }; };
  // (a) the answer is stored, its response is lost, the read-back confirms it
  const s1 = await next();
  flaky.plan({ review_append_actions: 'lose-after' });
  const r1 = await svc.submit(r, s1);
  // (b) stored, response lost and the read-back fails too: outcome unknown; the same submission retried is recognised
  const s2 = await next();
  flaky.plan({ review_append_actions: 'lose-after', thenUnreachable: true });
  let e2 = null;
  try { await svc.submit(r, s2); } catch (e) { e2 = e; }
  flaky.plan({});
  const r2 = await svc.submit(r, s2);
  // (c) never reached the database and the read-back fails: outcome unknown; the retry applies it once
  const s3 = await next();
  flaky.plan({ review_append_actions: 'lose-before', thenUnreachable: true });
  let e3 = null;
  try { await svc.submit(r, s3); } catch (e) { e3 = e; }
  flaky.plan({});
  const r3 = await svc.submit(r, s3);
  // (d) a different submission made against an old position is a conflict
  let e4 = null;
  try { await svc.submit(r, { actionId: randomUUID(), expectedSeq: s1.expectedSeq, action: s1.action }); } catch (e) { e4 = e; }
  const stored = await store.load(started.sessionId);
  const counts = [s1, s2, s3].map((s) => stored.actions.filter((a) => a.id === s.actionId).length);
  const ok = r1.duplicate === false && e2 instanceof StoreOutcomeUnknown && r2.duplicate === true && e3 instanceof StoreOutcomeUnknown && r3.duplicate === false && e4 instanceof svc.SaveConflict &&
    counts.every((n) => n === 1) && stored.actions.every((a, i) => a.seq === i);
  return [ok, `(a) lost response: saved ${!r1.duplicate}; (b) unconfirmed: ${e2?.constructor.name}, retry recognised as already stored ${r2.duplicate}; (c) never arrived: ${e3?.constructor.name}, retry applied ${!r3.duplicate}; (d) stale retry: ${e4?.constructor.name}; each answer stored ${counts.join('/')} time(s); log numbered without gaps`];
});

await T('S2.5', 'Through the service on the configured store: a session started, answered and exported; a write by another server process is seen at once', async () => {
  const svc = await service();
  // Hosted: the service connects itself from the environment (DatabaseReviewStore.connect(reviewDatabaseConfig())).
  useServiceStore(backend.serviceConnectsItself ? undefined : screened(new DatabaseReviewStore(client)));
  const started = await svc.createSession('Fictional Service Co');
  created.add(started.sessionId);
  let answered = 0;
  for (let n = 0; n < 25; n++) {
    const { view } = await svc.viewFor(started.tokens.respondent);
    if (!view.step) break;
    await svc.submit(started.tokens.respondent, { actionId: randomUUID(), expectedSeq: view.seq, action: answerFor(view) });
    answered++;
  }
  const before = await svc.exportFor(started.tokens.management);
  const stored = await store.load(started.sessionId);
  const stop = commit(replay(stored), { type: 'respondent.stop' }, 'respondent', new Date().toISOString(), () => randomUUID());
  await store.append(started.sessionId, stored.actions.length, stop);
  const after = await svc.exportFor(started.tokens.management);
  const seen = after.session.actions === stored.actions.length + stop.length && after.report.status.interview === 'ended' && before.report.status.interview === 'in progress';
  const ok = answered === 25 && seen;
  return [ok, `store: ${backend.serviceConnectsItself ? 'connected by the service from its own settings' : 'the local database handed to the service'}; ${answered} answers through the service; export before ${before.session.actions} actions (${before.report.status.interview}), after another process stopped it ${after.session.actions} (${after.report.status.interview})`];
});

// ------------------------------------------------------------------------------------------------ 3. denial of unauthorised roles
/** Every store operation through the store's own calls, made with a role's client; returns the database's raw answers. */
async function attemptAll(roleClient, target) {
  const rec = recordingClient(roleClient);
  const s = new DatabaseReviewStore(rec);
  const attempt = async (f) => { try { await f(); } catch { /* refusals are read from the recording */ } };
  const fresh = newSession('Fictional Denial Test Co');
  fictionalOnly(fresh.record);
  await attempt(() => s.create(fresh.record));
  await attempt(() => s.load(target.sessionId));
  await attempt(() => s.findToken(target.token));
  await attempt(() => s.append(target.sessionId, target.length, target.next));
  await attempt(() => s.actionCount(target.sessionId));
  await attempt(() => s.recordReportRun(target.run));
  await attempt(() => s.reportRuns(target.sessionId));
  await attempt(() => s.purge(target.sessionId));
  const refused = backends.STORE_FUNCTIONS.every((fn) => rec.calls.some((c) => c.fn === fn && c.code === '42501'));
  return { refused, calls: rec.calls, fresh };
}
function targetFor(live) {
  const input = buildReportInput(replay(live.record));
  const next = commit(replay(live.record), { type: 'respondent.stop' }, 'respondent', tick(), () => randomUUID());
  return {
    sessionId: live.record.sessionId,
    token: live.record.tokens.respondent,
    length: live.record.actions.length,
    next,
    run: { sessionId: live.record.sessionId, inputContract: REPORT_INPUT_CONTRACT.name, inputVersion: REPORT_INPUT_CONTRACT.version, inputDigest: reportInputDigest(input), logDigest: input.lineage.logDigest, actionCount: input.lineage.actionCount, reportEngine: 'denial-test', reportEngineVersion: '0', status: 'failed', failure: 'Denial test only.', createdBy: 'readiness-review-database-tests' }
  };
}
const tableRefused = (rows) => rows.every((r) => r.read.refused && r.write.refused && (r.inPublicSchema ? r.inPublicSchema.refused : true));
const tableCodes = (rows) => [...new Set(rows.flatMap((r) => [r.read.code, r.write.code, r.inPublicSchema?.code].filter(Boolean)))].join('/');

await T('S3.1', 'The public role: every store function is refused before it runs, even with a valid fictional record; the private tables have no read or write route', async () => {
  const anon = await backend.anonClient();
  const live = newSession('Fictional Unstored Target Co');
  interview(live, 5);
  const { refused, calls } = await attemptAll(anon.client, targetFor(live));
  const tables = await backend.tableAccess(anon.credential);
  const ok = refused && calls.length === 8 && tableRefused(tables);
  return [ok, `${anon.role}: ${calls.filter((c) => c.code === '42501').length} of 8 functions refused (42501); tables ${tables.length}, read, write${tables[0].inPublicSchema ? ' and public-schema' : ''} routes refused ${tableRefused(tables)} (${tableCodes(tables)})`];
}, { needs: 'public' });

await T('S3.2', 'Public and signed-in roles against a stored session: everything refused, the session unchanged, nothing they sent stored; no table route even with the secret key', async () => {
  const live = newSession('Fictional Denial Target Co');
  interview(live, 10);
  await store.create(live.record);
  const target = targetFor(live);
  await store.recordReportRun({ ...target.run, createdBy: 'readiness-review-database-tests (target)' });
  const before = { record: await store.load(live.record.sessionId), runs: (await store.reportRuns(live.record.sessionId)).length };
  const roles = [await backend.anonClient(), await backend.authenticatedClient()];
  const outcomes = [];
  for (const role of roles) {
    const attempt = await attemptAll(role.client, target);
    const stored = await store.load(attempt.fresh.record.sessionId);
    const linked = await store.findToken(attempt.fresh.record.tokens.respondent);
    const tables = await backend.tableAccess(role.credential);
    outcomes.push({ role: role.role, refused: attempt.refused, created: !!stored || !!linked, tables: tableRefused(tables), codes: tableCodes(tables) });
  }
  const serviceTables = await backend.tableAccess(backend.serviceCredential);
  const after = { record: await store.load(live.record.sessionId), runs: (await store.reportRuns(live.record.sessionId)).length };
  const unchanged = same(after.record, before.record) && after.runs === before.runs;
  const ok = outcomes.length === 2 && outcomes.every((o) => o.refused && !o.created && o.tables) && unchanged && tableRefused(serviceTables);
  return [ok, `${outcomes.map((o) => `${o.role}: 8 functions refused ${o.refused}, its record stored ${o.created}, table routes refused ${o.tables} (${o.codes})`).join('; ')}; target unchanged ${unchanged}; secret key has no table route ${tableRefused(serviceTables)} (${tableCodes(serviceTables)})`];
});

// ------------------------------------------------------------------------------------------------ 4. the complete report input
let rich = null;
function buildRichSession() {
  const live = newSession('Fictional Full Input Co');
  const batches = [live.record.actions.slice()];
  for (let n = 0; n < 200 && live.respondentStep; n++) batches.push(act(live, { type: 'respondent.answer', q: live.respondentStep.q.id, value: pick(live.respondentStep, n) }));
  if (!live.engine.S.ended) batches.push(act(live, { type: 'respondent.stop' }));
  batches.push(act(live, { type: 'organisation.sendToOwners' }, 'organisation'));
  const owners = [];
  for (const fn of live.engine.FUNCTIONS) {
    const served = ensureOwnerServed(live, fn, tick(), () => randomUUID());
    live.record = { ...live.record, actions: live.record.actions.concat(served) };
    batches.push(served);
    for (let k = 0; k < 2 && live.ownerSteps[fn]; k++) {
      const st = live.ownerSteps[fn];
      const value = k === 0 ? strongValue(st) : st.q.format === 'multi' ? ['unknown'] : 'unknown';
      try {
        batches.push(act(live, { type: 'owner.answer', fn, q: st.q.id, value }, 'owner'));
        owners.push({ fn, q: st.q.id, unknown: k === 1 });
      } catch (error) {
        if (!(error instanceof ActionRejected)) throw error;
        break;
      }
    }
  }
  const e = live.engine;
  const reported = Object.keys(e.S.ans).filter((q) => e.QI[q]?.type === 'practice' && e.S.ans[q].via === 'respondent' && e.S.ans[q].cls && e.S.ans[q].v !== 'unknown');
  const full = reported.filter((q) => e.S.ans[q].cls === 'full');
  const issue = reported.filter((q) => ['partial', 'designed', 'absent'].includes(e.S.ans[q].cls));
  const picks = { evidenceOnly: full[0], conclusionOnly: full[1], both: issue[0], followUpOnly: full[2] };
  batches.push(act(live, { type: 'reviewer.evidence', q: picks.evidenceOnly, state: 'reviewed-sufficient', basis: 'Fictional sample of three records reviewed' }, 'reviewer'));
  batches.push(act(live, { type: 'reviewer.review', q: picks.conclusionOnly, conclusion: 'confirmed', basis: 'Fictional walkthrough with the control owner', followUp: '', limitation: '' }, 'reviewer'));
  batches.push(act(live, { type: 'reviewer.evidence', q: picks.both, state: 'insufficient', basis: 'Fictional policy excerpt only' }, 'reviewer'));
  batches.push(act(live, { type: 'reviewer.review', q: picks.both, conclusion: 'partly-confirmed', basis: 'Fictional policy excerpt only', followUp: 'Request a fictional sample', limitation: 'No operating evidence seen' }, 'reviewer'));
  batches.push(act(live, { type: 'reviewer.review', q: picks.followUpOnly, conclusion: null, basis: '', followUp: 'Ask for the fictional reconciliation log', limitation: '' }, 'reviewer'));
  return { live, batches, picks, owners };
}

await T('S4.1', 'The complete report input from a stored session: all 902 controls, with applicability, answers, pending information, reviewed evidence and conclusions kept distinct', async () => {
  const built = buildRichSession();
  const { live, batches, picks } = built;
  await storeInBatches(store, live.record, batches);
  const stored = await store.load(live.record.sessionId);
  const input = buildReportInput(replay(stored));
  rich = { ...built, stored, input };
  const controls = controlsOf(input);
  const rows = reportFor(replay(stored)).domains.flatMap((d) => d.rows);
  const byId = new Map(controls.map((c) => [c.id, c]));
  const states = controls.reduce((a, c) => ((a[c.state] = (a[c.state] || 0) + 1), a), {});
  const known = new Set(['reported', ...Object.keys(CONTROL_STATE_LABEL)]);
  const applicability = controls.filter((c) => ['outofscope', 'proportion', 'precluded', 'assumed'].includes(c.state));
  const answered = controls.filter((c) => c.state === 'reported');
  const pending = controls.filter((c) => c.state === 'waiting' || c.state === 'waiting-scope');
  const unasked = controls.filter((c) => c.state === 'unconfirmed');
  const withEvidence = controls.filter((c) => c.evidence).map((c) => c.id).sort();
  const withReview = controls.filter((c) => c.review).map((c) => c.id).sort();
  const A = byId.get(picks.evidenceOnly), B = byId.get(picks.conclusionOnly), C = byId.get(picks.both), D = byId.get(picks.followUpOnly);
  const checks = {
    sameAsMemory: reportInputDigest(input) === digestOf(live.record),
    all902: controls.length === 902 && rows.length === 902 && new Set(controls.map((c) => c.id)).size === 902,
    knownStates: controls.every((c) => known.has(c.state)),
    countsMatch: input.domains.every((d) => Object.entries(d.counts).every(([st, n]) => d.controls.filter((c) => c.state === st).length === n)),
    applicability: applicability.length > 0 && applicability.every((c) => c.scope && !c.answer && !c.class && !c.issue && !c.evidence && !c.review),
    answers: answered.length > 0 && answered.every((c) => c.answer && c.class && ['respondent', 'owner'].includes(c.answer.via)),
    ownerAnswers: controls.some((c) => c.answer && c.answer.via === 'owner' && c.answer.source === 'owner-answer'),
    everyVersionSourced: controls.flatMap((c) => [...c.history, ...(c.answer ? [c.answer] : [])]).every((v) => ['respondent-answer', 'respondent-correction', 'owner-answer', 'activities-screen'].includes(v.source)),
    pending: pending.length > 0 && pending.every((c) => c.waiting?.provenance?.kind && !c.class && !c.issue && (!c.answer || c.answer.value === 'unknown' || (Array.isArray(c.answer.value) && c.answer.value.includes('unknown')))),
    unasked: unasked.length > 0 && unasked.every((c) => !c.answer && c.history.length === 0 && !c.class && !c.evidence && !c.review),
    evidenceOnly: A.state === 'reported' && A.evidence?.state === 'reviewed-sufficient' && A.evidence.current && A.evidence.forVersion === A.answer.version && A.review === null,
    conclusionOnly: B.state === 'reported' && B.review?.conclusion === 'confirmed' && B.review.current && B.evidence === null,
    both: C.issue && C.evidence?.state === 'insufficient' && C.review?.conclusion === 'partly-confirmed' && C.review.limitation === 'No operating evidence seen',
    followUpOnly: D.review?.conclusion === null && D.review.followUp === 'Ask for the fictional reconciliation log' && D.evidence === null,
    noOtherReviewerRecords: withEvidence.join() === [A.id, C.id].sort().join() && withReview.join() === [B.id, C.id, D.id].sort().join(),
    incomplete: input.method.completeness.complete === false && input.method.scoring.status === 'withheld'
  };
  const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
  const provenance = [...new Set(pending.map((c) => c.waiting.provenance.kind))].sort().join(', ');
  return [failed.length === 0, `${stored.actions.length} actions stored in ${batches.length} saves; ${controls.length} controls: ${Object.entries(states).sort().map(([k, v]) => `${k} ${v}`).join(', ')}; waiting provenance ${provenance}; evidence on ${withEvidence.length}, review records on ${withReview.length}${failed.length ? `; failed: ${failed.join(', ')}` : '; all distinctions held'}`];
});

// ------------------------------------------------------------------------------------------------ 5. determinism, digests, lineage
// A fixed fictional session: fixed id, links, clock and action ids, so its report input digest is the same on every
// run and on every backend. Update the expected value only with a change to the ruleset or the report input contract.
const FIXTURE_ID = 'mkreviewdeterministicfixture01';
const EXPECTED_FIXTURE_INPUT_DIGEST = 'cb2180f5a845f664de0f2f4ac2718d8ae53805500633e054cdfb71895e7618dd';
function fixtureSession() {
  let t = Date.parse('2026-11-11T06:00:00.000Z');
  let n = 0;
  const at = () => new Date((t += 1000)).toISOString();
  const newId = () => `fixture-${String(++n).padStart(6, '0')}`;
  const link = (role) => createHash('sha256').update(`mk-review-fixture-${role}`).digest('base64url').slice(0, 24);
  const live = newSession(null, { sessionId: FIXTURE_ID, createdAt: '2026-11-11T06:00:00.000Z', organisationLabel: 'Fictional Deterministic Co', tokens: { respondent: link('respondent'), management: link('management'), reviewer: link('reviewer'), links: link('links'), owners: { Finance: link('finance') } }, newId });
  const batches = [live.record.actions.slice()];
  for (let k = 0; k < 40 && live.respondentStep; k++) batches.push(act(live, { type: 'respondent.answer', q: live.respondentStep.q.id, value: pick(live.respondentStep, k) }, 'respondent', at(), newId));
  batches.push(act(live, { type: 'respondent.stop' }, 'respondent', at(), newId));
  return { live, batches };
}
let fixtureDigest = null;

await T('S5.1', 'Deterministic input: the same stored log gives the same input byte for byte on every load and replay, and the fixed fixture gives the same digest on every backend', async () => {
  const { live, batches } = fixtureSession();
  const leftover = await store.purge(FIXTURE_ID);
  await storeInBatches(store, live.record, batches);
  const first = await store.load(FIXTURE_ID);
  const second = await store.load(FIXTURE_ID);
  const inputs = [buildReportInput(replay(first)), buildReportInput(replay(second)), buildReportInput(replay(JSON.parse(JSON.stringify(first)))), buildReportInput(replay(live.record))];
  const texts = inputs.map((i) => canonicalJson(i));
  fixtureDigest = reportInputDigest(inputs[0]);
  const identical = texts.every((t) => t === texts[0]);
  const ok = identical && same(first, live.record) && inputs[0].lineage.logDigest === canonicalDigest(first.actions) && fixtureDigest === EXPECTED_FIXTURE_INPUT_DIGEST;
  return [ok, `${first.actions.length} actions; 4 builds identical ${identical} (${Buffer.byteLength(texts[0])} bytes); input digest ${fixtureDigest}, the pinned value ${fixtureDigest === EXPECTED_FIXTURE_INPUT_DIGEST}; log digest ${inputs[0].lineage.logDigest.slice(0, 12)}; leftover fixture purged first ${leftover}`];
});

await T('S5.2', 'Report-run lineage: each run is recorded exactly as given and tied to its log position; the input is rebuilt from the stored prefix after the log grows; invalid runs are refused', async () => {
  const live = newSession('Fictional Lineage Co');
  const batches = [live.record.actions.slice(), ...interview(live, 35)];
  await storeInBatches(store, live.record, batches);
  const record = await store.load(live.record.sessionId);
  const input = buildReportInput(replay(record));
  const base = { sessionId: record.sessionId, inputContract: REPORT_INPUT_CONTRACT.name, inputVersion: REPORT_INPUT_CONTRACT.version, inputDigest: reportInputDigest(input), logDigest: input.lineage.logDigest, actionCount: input.lineage.actionCount, reportEngine: 'lineage-test', reportEngineVersion: '0', createdBy: 'readiness-review-database-tests' };
  const failedRun = { ...base, status: 'failed', failure: 'Lineage test only: no report engine is connected, so no report was produced.' };
  const output = { kind: 'lineage-test-placeholder', note: 'Not a report. Recorded only to test run lineage.' };
  const generatedRun = { ...base, status: 'generated', output, outputDigest: canonicalDigest(output) };
  const failedId = await store.recordReportRun(failedRun);
  const generatedId = await store.recordReportRun(generatedRun);
  const more = interview(live, 10).flat();
  await store.append(record.sessionId, record.actions.length, more);
  const grown = await store.load(record.sessionId);
  const refusals = {};
  for (const [name, run] of Object.entries({
    aheadOfLog: { ...failedRun, actionCount: grown.actions.length + 1 },
    failedWithoutReason: { ...failedRun, failure: undefined },
    generatedWithoutOutput: { ...generatedRun, output: undefined, outputDigest: undefined },
    malformedDigest: { ...failedRun, inputDigest: 'not-a-digest' },
    unknownSession: { ...failedRun, sessionId: `unknown${randomBytes(6).toString('hex')}` }
  })) { try { await store.recordReportRun(run); refusals[name] = false; } catch (e) { refusals[name] = e instanceof StoreUnavailable && !(e instanceof StoreOutcomeUnknown); } }
  const runs = await store.reportRuns(record.sessionId);
  const exact = (id, given) => { const r = runs.find((x) => x.runId === id); return !!r && ['inputContract', 'inputVersion', 'inputDigest', 'logDigest', 'actionCount', 'reportEngine', 'reportEngineVersion', 'status', 'failure', 'outputDigest', 'createdBy'].every((k) => (r[k] ?? null) === (given[k] ?? null)) && !('output' in r); };
  const rebuilt = buildReportInput(replay({ ...grown, actions: grown.actions.slice(0, runs[0].actionCount) }));
  const ok = runs.length === 2 && exact(failedId, failedRun) && exact(generatedId, generatedRun) && reportInputDigest(rebuilt) === base.inputDigest && rebuilt.lineage.logDigest === base.logDigest &&
    grown.actions.length > base.actionCount && Object.values(refusals).every(Boolean);
  return [ok, `runs recorded exactly as given (failed ${exact(failedId, failedRun)}, generated ${exact(generatedId, generatedRun)}), listed without outputs; at log position ${base.actionCount}, log grew to ${grown.actions.length}; input rebuilt from the stored prefix matches the recorded digest ${reportInputDigest(rebuilt) === base.inputDigest}; refused ${JSON.stringify(refusals)}; ${runs.length} runs stored`];
});

// ------------------------------------------------------------------------------------------------ 6. no unsupported conclusions
await T('S6.1', 'No unsupported conclusions: gaps are reported practice only; unasked, unanswered, pending and unreviewed controls are never gaps or conclusions', async () => {
  if (!rich) return [false, 'S4.1 did not produce a stored session'];
  const { input, stored } = rich;
  const controls = controlsOf(input);
  const byId = new Map(controls.map((c) => [c.id, c]));
  const issueClasses = new Set(input.method.vocabulary.issueClasses);
  const gaps = input.findings.reportedGaps;
  const reviewActions = stored.actions.filter((a) => a.type === 'reviewer.review');
  const evidenceActions = stored.actions.filter((a) => a.type === 'reviewer.evidence');
  const notGaps = controls.filter((c) => c.state !== 'reported');
  const conclusions = controls.filter((c) => c.review?.conclusion);
  const checks = {
    gapsAreReportedPractice: gaps.length > 0 && gaps.every((g) => { const c = byId.get(g.id); return c.state === 'reported' && issueClasses.has(c.class) && c.answer && c.answer.value !== 'unknown' && !('conclusion' in g); }),
    nonReportedNeverGaps: notGaps.every((c) => !c.issue && !gaps.some((g) => g.id === c.id)),
    unknownNeverGap: controls.filter((c) => c.answer && (c.answer.value === 'unknown' || (Array.isArray(c.answer.value) && c.answer.value.includes('unknown')))).every((c) => !c.issue && !c.class),
    conclusionsOnlyFromReviews: conclusions.every((c) => reviewActions.some((a) => a.q === c.id && a.conclusion === c.review.conclusion)),
    evidenceOnlyFromReviews: controls.filter((c) => c.evidence).every((c) => evidenceActions.some((a) => a.q === c.id && a.state === c.evidence.state)),
    gapsWithoutReviewUnconcluded: gaps.filter((g) => !reviewActions.some((a) => a.q === g.id)).every((g) => byId.get(g.id).review === null),
    findingsOnlyReviewed: input.findings.reviewerFindings.every((f) => reviewActions.some((a) => a.q === f.id) || evidenceActions.some((a) => a.q === f.id)),
    noConfirmedWording: !input.openWork.actions.some((a) => /confirmed (gap|weakness|failure)/i.test(a.text)),
    reviewIncomplete: input.method.completeness.complete === false,
    noScores: [...keysDeep(input)].every((k) => !/^(score|scores|band|bands|rating|ratings|confidence|maturity|maturityBand|predicted|prediction|predictions|readinessLevel)$/i.test(k))
  };
  const failed = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k);
  return [failed.length === 0, `${gaps.length} reported gaps, all reported practice; ${notGaps.length} controls not reported (unasked, pending, out of scope and others), none a gap; ${conclusions.length} conclusions, each from a recorded review; review complete ${input.method.completeness.complete}${failed.length ? `; failed: ${failed.join(', ')}` : ''}`];
});

await T('S6.2', 'A reviewer record written straight to the store for a control never asked (bypassing the service) is not presented as current, a gap or a finding', async () => {
  const live = newSession('Fictional Forged Record Co');
  interview(live, 20);
  await store.create(live.record);
  const before = buildReportInput(replay(live.record));
  const unasked = controlsOf(before).find((c) => c.state === 'unconfirmed' && c.type === 'practice');
  const n = live.record.actions.length;
  const forged = [
    { type: 'reviewer.evidence', q: unasked.id, state: 'reviewed-sufficient', basis: 'Fictional forged record', id: randomUUID(), seq: n, at: tick(), actor: 'reviewer' },
    { type: 'reviewer.review', q: unasked.id, conclusion: 'confirmed', basis: 'Fictional forged record', followUp: '', limitation: '', id: randomUUID(), seq: n + 1, at: tick(), actor: 'reviewer' }
  ];
  let serviceRefused = null;
  try { commit(replay(live.record), { type: 'reviewer.review', q: unasked.id, conclusion: 'confirmed', basis: 'x', followUp: '', limitation: '' }, 'reviewer', tick(), () => randomUUID()); serviceRefused = false; } catch (e) { serviceRefused = e instanceof ActionRejected; }
  await store.append(live.record.sessionId, n, forged);
  const stored = await store.load(live.record.sessionId);
  const input = buildReportInput(replay(stored));
  const c = controlsOf(input).find((x) => x.id === unasked.id);
  const ok = serviceRefused && stored.actions.length === n + 2 && c.state === 'unconfirmed' && !c.issue && c.evidence?.current === false && c.review?.current === false && c.review.forVersion === null &&
    !input.findings.reportedGaps.some((g) => g.id === c.id) && !input.findings.reviewerFindings.some((f) => f.id === c.id) && !input.findings.reviewerTasks.some((t) => t.id === c.id);
  return [ok, `the service refuses it ${serviceRefused}; the store accepts it from the server key (${stored.actions.length - n} actions); in the input ${c.id} stays ${c.state}, evidence and review current ${c.evidence?.current}/${c.review?.current}, for no answer version; in gaps, findings or tasks: none`];
});

// ------------------------------------------------------------------------------------------------ 7. immutability, purge, errors
await T('S7.1', 'Immutability through the interface: overwriting, gaps, repeated ids, unknown types, recreating, non-fictional records and a changed ruleset are refused; nothing changes', async () => {
  const live = newSession('Fictional Immutability Co');
  await store.create(live.record);
  let length = live.record.actions.length;
  for (const b of interview(live, 8)) length = await store.append(live.record.sessionId, length, b);
  const before = await store.load(live.record.sessionId);
  const stop = act(replay(before), { type: 'respondent.stop' });
  const outcome = async (f) => { try { await f(); return 'accepted'; } catch (e) { return `${e.constructor.name}: ${e.message}`; } };
  const o = {
    overwrite: await outcome(() => store.append(live.record.sessionId, length - 2, [{ ...stop[0], seq: length - 2 }])),
    gap: await outcome(() => store.append(live.record.sessionId, length, [{ ...stop[0], seq: length + 1 }])),
    repeatedId: await outcome(() => store.append(live.record.sessionId, length, [{ ...stop[0], id: before.actions[0].id }])),
    unknownType: await outcome(() => store.append(live.record.sessionId, length, [{ ...stop[0], type: 'respondent.delete' }])),
    unknownSession: await outcome(() => store.append(`unknown${randomBytes(6).toString('hex')}`, 0, stop)),
    recreate: await outcome(() => store.create(before))
  };
  const nonFictional = newSession('Fictional Flag Removed Co');
  created.add(nonFictional.record.sessionId);
  o.nonFictional = await outcome(() => new DatabaseReviewStore(client).create({ ...nonFictional.record, fictional: false }));
  const changed = newSession('Fictional Ruleset Co');
  const { data, error } = await client.rpc('review_create_session', {
    p_session: { sessionId: changed.record.sessionId, createdAt: changed.record.createdAt, contractVersion: changed.record.contractVersion, engineSha256: changed.record.engineSha256, bankVersion: changed.record.bankVersion, organisationLabel: changed.record.organisationLabel, fictional: true, tokens: changed.record.tokens },
    p_ruleset: { ...changed.record.ruleset, engine: { ...changed.record.ruleset.engine, build: 'altered' } },
    p_ruleset_key: canonicalDigest(changed.record.ruleset),
    p_links: linkRows(changed.record),
    p_actions: changed.record.actions
  });
  created.add(changed.record.sessionId);
  o.changedRuleset = error ? `refused ${error.code}` : `accepted ${data}`;
  const after = await store.load(live.record.sessionId);
  const absent = [await store.load(nonFictional.record.sessionId), await store.load(changed.record.sessionId)].every((r) => r === null);
  const ok = /^StoreConflict/.test(o.overwrite) && /^StoreUnavailable: The database refused this save\. Nothing was recorded/.test(o.gap) && /^StoreConflict/.test(o.repeatedId) &&
    /^StoreUnavailable: The database refused this save/.test(o.unknownType) && /^StoreUnavailable: This review is no longer stored\. Nothing was recorded/.test(o.unknownSession) &&
    /^StoreUnavailable: A generated link or reference matched an existing one\. Nothing was created/.test(o.recreate) && /^StoreUnavailable: .*refused the record\. Nothing was created/.test(o.nonFictional) &&
    o.changedRuleset === 'refused RV422' && same(after, before) && absent;
  return [ok, `${Object.entries(o).map(([k, v]) => `${k}: ${v.replace(/^(\w+): (.{0,70}).*$/, '$1 "$2"')}`).join('; ')}; stored session unchanged ${same(after, before)}; refused records absent ${absent}`];
});

await T('S7.2', 'Retention purge is explicit and complete: one session with its links, log and runs is removed, others are untouched, and later calls say so', async () => {
  const keep = newSession('Fictional Retained Co');
  const gone = newSession('Fictional Purged Co');
  interview(gone, 6);
  await store.create(keep.record);
  await store.create(gone.record);
  const input = buildReportInput(replay(gone.record));
  await store.recordReportRun({ sessionId: gone.record.sessionId, inputContract: REPORT_INPUT_CONTRACT.name, inputVersion: REPORT_INPUT_CONTRACT.version, inputDigest: reportInputDigest(input), logDigest: input.lineage.logDigest, actionCount: input.lineage.actionCount, reportEngine: 'purge-test', reportEngineVersion: '0', status: 'failed', failure: 'Purge test only.', createdBy: 'readiness-review-database-tests' });
  const keptBefore = await store.load(keep.record.sessionId);
  const purged = await store.purge(gone.record.sessionId);
  const links = await Promise.all(Object.values(gone.record.tokens).flatMap((v) => (typeof v === 'string' ? [v] : Object.values(v))).map((t) => store.findToken(t)));
  const after = { load: await store.load(gone.record.sessionId), count: await store.actionCount(gone.record.sessionId), runs: await store.reportRuns(gone.record.sessionId) };
  let append = null;
  try { await store.append(gone.record.sessionId, gone.record.actions.length, act(gone, { type: 'respondent.stop' })); } catch (e) { append = e; }
  let run = null;
  try { await store.recordReportRun({ sessionId: gone.record.sessionId, inputContract: 'x', inputVersion: '1', inputDigest: '0'.repeat(64), logDigest: '0'.repeat(64), actionCount: 0, reportEngine: 'x', reportEngineVersion: '0', status: 'failed', failure: 'x', createdBy: 'x' }); } catch (e) { run = e; }
  const again = await store.purge(gone.record.sessionId);
  const kept = same(await store.load(keep.record.sessionId), keptBefore);
  const ok = purged === true && links.every((l) => l === null) && after.load === null && after.count === null && after.runs.length === 0 &&
    append instanceof StoreUnavailable && /no longer stored\. Nothing was recorded/.test(append.message) && run instanceof StoreUnavailable && again === false && kept;
  return [ok, `purged ${purged}; links resolve ${links.filter(Boolean).length} of ${links.length}; load ${after.load}, count ${after.count}, runs ${after.runs.length}; later save: "${append?.message}"; later run: ${run?.constructor.name}; purge again ${again}; other session untouched ${kept}`];
});

await T('S7.3', 'Database-level suite as the owner: sequence, immutability triggers, all-or-nothing creation, fictional only, report runs, access by role, retention', async () => {
  const rows = await backend.ownerSql(readFileSync(path.join(ROOT, 'scripts/readiness-review-database-sql-tests.sql'), 'utf8'));
  const failed = rows.filter((r) => !r.ok);
  return [rows.length === 42 && failed.length === 0, `${rows.length - failed.length} of ${rows.length} checks ok${failed.length ? `; failed: ${failed.map((r) => r.test).join('; ')}` : ''}`];
}, { only: 'local', why: 'Runs as the database owner, which the API does not offer by design. On the hosted project the same SQL file is run as the owner through the Supabase management connection (results recorded separately).' });

// ------------------------------------------------------------------------------------------------ fictional data and cleanup
await T('S7.4', 'Fictional records only: every session this run stored is read back, screened for personal data, purged, and confirmed gone; temporary users removed', async () => {
  let readBack = 0;
  let purged = 0;
  const flagged = [];
  for (const id of created) {
    const record = await store.load(id);
    if (record) {
      readBack++;
      try { fictionalOnly(record, false); } catch (error) { flagged.push(`${id}: ${error.message}`); }
    }
    if (await store.purge(id)) purged++;
  }
  const remaining = (await Promise.all([...created].map((id) => store.load(id)))).filter(Boolean).length;
  const users = await backend.cleanup();
  const ok = flagged.length === 0 && remaining === 0 && readBack === purged && users.removed === users.temporaryUsers;
  return [ok, `${screenedSent} actions screened before sending; ${readBack} stored sessions read back and screened${flagged.length ? `, flagged ${flagged.join('; ')}` : ', all labelled fictional with no personal data'}; ${purged} purged, ${remaining} remaining; temporary users ${users.temporaryUsers}, removed ${users.removed}`];
});

finish(0, { fixtureInputDigest: fixtureDigest });
