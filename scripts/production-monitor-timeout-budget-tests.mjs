import assert from 'node:assert/strict';
import {
  createMonitorDatabase, monitorDatabaseError, monitorFetch, isMonitorDependencyFailure,
  MONITOR_DATABASE_ATTEMPT_TIMEOUT_MS, MONITOR_DATABASE_MAX_ATTEMPTS, MONITOR_DATABASE_RETRY_DELAY_MS,
  PRODUCTION_MONITOR_TERMINAL_BUDGET_MS, PRODUCTION_MONITOR_WORK_BUDGET_MS, PRODUCTION_READINESS_BUDGET_MS, STALLED_LEAD_MONITOR_BUDGET_MS
} from '../src/lib/monitoring/database.ts';
import { runProductionMonitor } from '../src/lib/monitoring/production-monitor.ts';
import { evaluateProductionReadiness } from '../src/lib/monitoring/production-readiness.ts';
import { candidatesForEvaluation } from '../src/lib/monitoring/production-monitor.ts';
import { monitorAdaptiveStalledLeads } from '../src/lib/notifications/internal-assessment-notifications.ts';

// No external calls: every transport below is an in-memory double; a stray global fetch fails loudly.
globalThis.fetch = async () => { throw new Error('External calls forbidden in timeout budget tests'); };
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://abcdefghijklmnopqrst.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test-key';
process.env.MK_INTERNAL_NOTIFICATIONS_EMAIL = 'info@mkfraud.co.za';
process.env.VERCEL_GIT_COMMIT_SHA = 'a'.repeat(40);
const pass = (label) => console.log(`ok - ${label}`);
const quiet = async (fn) => { const original = console.error; const warn = console.warn; console.error = () => {}; console.warn = () => {}; try { return await fn(); } finally { console.error = original; console.warn = warn; } };
const elapsed = async (fn) => { const start = performance.now(); const value = await fn(); return { value, ms: performance.now() - start }; };
const noSleep = async () => {};
const fast = { attemptTimeoutMs: 40, retryDelayMs: 5 };
const hangRespectingSignal = (init) => new Promise((_, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal.reason), { once: true }));
const json = (body, status = 200) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// 1. A fetch that never resolves is aborted at the attempt timeout; one that ignores the signal is still bounded.
{
  let signals = [];
  const f = monitorFetch(async (_input, init) => { signals.push(init.signal); return hangRespectingSignal(init); }, noSleep, { ...fast, maxAttempts: 1 });
  const { value, ms } = await quiet(() => elapsed(() => f('https://db.test/rest/v1/orders', { method: 'GET' })));
  assert.equal(value.status, 504);
  assert.equal(value.headers.get('x-mk-monitor-transport'), 'timeout');
  assert.equal(signals.length, 1);
  assert.equal(signals[0].aborted, true);
  assert.ok(ms < 40 + 60, `attempt bounded near its timeout, took ${ms}ms`);
  const ignoring = monitorFetch(async () => new Promise(() => {}), noSleep, { ...fast, maxAttempts: 1 });
  const bounded = await quiet(() => elapsed(() => ignoring('https://db.test/rest/v1/orders')));
  assert.equal(bounded.value.status, 504);
  assert.ok(bounded.ms < 40 + 60, `signal-ignoring fetch still bounded, took ${bounded.ms}ms`);
  // A stalled body is inside the same bound.
  const stalledBody = monitorFetch(async (_input, init) => new Response(new ReadableStream({ start(controller) { init.signal.addEventListener('abort', () => controller.error(init.signal.reason)); } }), { status: 200 }), noSleep, { ...fast, maxAttempts: 1 });
  assert.equal((await quiet(() => stalledBody('https://db.test/rest/v1/orders'))).status, 504);
  pass('never-resolving fetch and stalled body are aborted within the per-attempt timeout');
}

// 1b. A caller-provided signal is composed, not overwritten, and a caller abort is never retried.
{
  let attempts = 0; let seen;
  const f = monitorFetch(async (_input, init) => { attempts += 1; seen = init.signal; return hangRespectingSignal(init); }, noSleep, { attemptTimeoutMs: 5_000, retryDelayMs: 5 });
  const caller = new AbortController();
  setTimeout(() => caller.abort(new DOMException('caller cancelled', 'AbortError')), 20);
  const { value: error, ms } = await elapsed(() => f('https://db.test/rest/v1/orders', { method: 'GET', signal: caller.signal }).then(() => null, (e) => e));
  assert.equal(error?.name, 'AbortError');
  assert.equal(attempts, 1);
  assert.notEqual(seen, caller.signal);
  assert.equal(seen.aborted, true);
  assert.ok(ms < 500, `caller abort honoured promptly, took ${ms}ms`);
  const already = new AbortController(); already.abort();
  await assert.rejects(f('https://db.test/rest/v1/orders', { signal: already.signal }), (e) => e.name === 'AbortError');
  assert.equal(attempts, 1);
  pass('caller AbortSignal is preserved through safe composition and not retried');
}

// 2 + 3. One bounded retry recovers from a gateway 504 or a thrown network error.
{
  let attempts = 0;
  let f = monitorFetch(async () => { attempts += 1; return attempts === 1 ? json({ message: 'Gateway Timeout' }, 504) : json([{ ok: true }]); }, noSleep);
  let response = await quiet(() => f('https://db.test/rest/v1/orders'));
  assert.equal(response.status, 200); assert.deepEqual(await response.json(), [{ ok: true }]); assert.equal(attempts, 2);
  attempts = 0;
  f = monitorFetch(async () => { attempts += 1; if (attempts === 1) throw new TypeError('fetch failed'); return json([]); }, noSleep);
  response = await quiet(() => f('https://db.test/rest/v1/production_monitor_heartbeats', { method: 'POST', body: '{}' }));
  assert.equal(response.status, 200); assert.equal(attempts, 2);
  pass('first 504 or network error followed by success recovers with exactly one retry');
}

// 4. Every attempt failing returns a bounded, classified dependency failure; the budget and circuit stop further work.
{
  let attempts = 0;
  const f = monitorFetch(async (_input, init) => { attempts += 1; return hangRespectingSignal(init); }, (ms) => new Promise((r) => setTimeout(r, ms)), { ...fast, budgetMs: 1_000 });
  const first = await quiet(() => elapsed(() => f('https://db.test/rest/v1/orders')));
  assert.equal(first.value.status, 504); assert.equal(attempts, MONITOR_DATABASE_MAX_ATTEMPTS);
  assert.ok(first.ms < 2 * 40 + 5 + 80, `two attempts bounded, took ${first.ms}ms`);
  await quiet(() => f('https://db.test/rest/v1/reports'));
  await quiet(() => f('https://db.test/rest/v1/assessments'));
  const attemptsBeforeCircuit = attempts;
  const open = await quiet(() => elapsed(() => f('https://db.test/rest/v1/email_events')));
  assert.equal(attempts, attemptsBeforeCircuit); assert.equal(open.value.headers.get('x-mk-monitor-transport'), 'circuit_open'); assert.ok(open.ms < 20);
  let budgetAttempts = 0;
  const budgeted = monitorFetch(async (_input, init) => { budgetAttempts += 1; return hangRespectingSignal(init); }, noSleep, { attemptTimeoutMs: 1_000, budgetMs: 60, circuitFailures: 100 });
  const clipped = await quiet(() => elapsed(() => budgeted('https://db.test/rest/v1/orders')));
  assert.ok(clipped.ms < 60 + 60, `attempt clipped to remaining budget, took ${clipped.ms}ms`);
  const exhausted = await quiet(() => budgeted('https://db.test/rest/v1/orders'));
  assert.equal(exhausted.headers.get('x-mk-monitor-transport'), 'budget_exhausted');
  const body = await exhausted.json();
  assert.equal(monitorDatabaseError(body).reason, 'budget_exhausted');
  assert.equal(isMonitorDependencyFailure(body), true);
  assert.equal(JSON.stringify(body).includes('db.test'), false);
  // Production arithmetic: worst-case database work cannot approach the 60s route limit.
  assert.ok(MONITOR_DATABASE_ATTEMPT_TIMEOUT_MS * MONITOR_DATABASE_MAX_ATTEMPTS + MONITOR_DATABASE_RETRY_DELAY_MS <= PRODUCTION_MONITOR_TERMINAL_BUDGET_MS + MONITOR_DATABASE_ATTEMPT_TIMEOUT_MS);
  assert.ok(PRODUCTION_MONITOR_WORK_BUDGET_MS + PRODUCTION_MONITOR_TERMINAL_BUDGET_MS + 4_000 < 50_000);
  assert.ok(PRODUCTION_READINESS_BUDGET_MS < 30_000 && STALLED_LEAD_MONITOR_BUDGET_MS < 50_000);
  pass('persistent failure is bounded per request, per client budget and by the consecutive-failure circuit');
}

// 5. Non-idempotent writes are never retried, whether the gateway returns 504 or the attempt times out.
{
  let attempts = 0;
  const gateway = monitorFetch(async () => { attempts += 1; return json({ message: 'Gateway Timeout' }, 504); }, noSleep, { ...fast, circuitFailures: 100 });
  for (const [path, method] of [['rpc/record_production_monitor_alert', 'POST'], ['rpc/mark_production_monitor_alert_notified', 'POST'], ['email_events', 'POST'], ['orders', 'PATCH'], ['production_monitor_events', 'POST']]) {
    attempts = 0;
    assert.equal((await quiet(() => gateway(`https://db.test/rest/v1/${path}`, { method, body: '{}' }))).status, 504);
    assert.equal(attempts, 1, `${method} ${path} must not retry`);
  }
  attempts = 0;
  const hanging = monitorFetch(async (_input, init) => { attempts += 1; return hangRespectingSignal(init); }, noSleep, fast);
  await quiet(() => hanging('https://db.test/rest/v1/rpc/record_production_monitor_alert', { method: 'POST', body: '{}' }));
  assert.equal(attempts, 1);
  pass('counter RPCs, customer/email writes and other non-idempotent writes get no automatic retry');
}

// 5b. Real supabase-js client: postgrest-js's own GET retry loop and Next's GET dedupe tee no longer multiply or hang.
{
  let attempts = 0;
  const throwing = createMonitorDatabase({ fetchImpl: async () => { attempts += 1; throw new TypeError('fetch failed'); }, sleep: noSleep, ...fast });
  const { value: result, ms } = await quiet(() => elapsed(() => throwing.from('orders').select('id').limit(1)));
  assert.equal(attempts, 2, `one logical GET made ${attempts} HTTP attempts`);
  assert.equal(monitorDatabaseError(result.error).reason, 'transport_failure');
  assert.ok(ms < 500, `postgrest-js backoff (1s/2s/4s) never engaged, took ${ms}ms`);
  attempts = 0;
  const unavailable = createMonitorDatabase({ fetchImpl: async () => { attempts += 1; return json({ message: 'Service Unavailable' }, 503); }, sleep: noSleep, ...fast });
  await quiet(() => unavailable.from('orders').select('id'));
  assert.equal(attempts, 2);

  // Mirror of next/dist/server/lib/dedupe-fetch.js: GET/HEAD without a signal is tee'd and one branch parked.
  const parked = [];
  let calls = 0;
  const nextDedupeLike = async (input, init = {}) => {
    calls += 1;
    const response = calls === 1 ? json({ message: 'Gateway Timeout' }, 504) : json([{ monitor_name: 'production-incident-monitor' }]);
    if (init.signal || !['GET', 'HEAD'].includes((init.method ?? 'GET').toUpperCase())) return response;
    const [returned, kept] = response.body.tee();
    parked.push(kept);
    return new Response(returned, { status: response.status, headers: response.headers });
  };
  const deduped = createMonitorDatabase({ fetchImpl: nextDedupeLike, sleep: noSleep, ...fast });
  const outcome = await quiet(() => Promise.race([
    deduped.from('production_monitor_heartbeats').select('monitor_name').maybeSingle(),
    new Promise((resolve) => setTimeout(() => resolve('hung'), 1_000))
  ]));
  assert.notEqual(outcome, 'hung', 'GET 504 retry must not hang on a tee branch');
  assert.equal(outcome.data.monitor_name, 'production-incident-monitor');
  assert.equal(parked.length, 0, 'transport always supplies a signal, so Next does not tee monitor reads');
  pass('real client: one retry layer only, and the Next GET dedupe tee cannot strand the retry');
}

function fakePostgrest({ hang = () => false, fail = () => null, alerts = [], heartbeat } = {}) {
  const state = {
    calls: [], rpc: [],
    heartbeat: heartbeat ?? { monitor_name: 'production-incident-monitor', run_count: 1, consecutive_failures: 0, safe_summary_json: {} },
    heartbeatWrites: [], alerts: structuredClone(alerts), notifications: []
  };
  const filtersFor = (url) => [...url.searchParams.entries()].filter(([k]) => !['select', 'limit', 'on_conflict', 'order'].includes(k));
  const matches = (row, filters) => filters.every(([key, raw]) => {
    if (raw.startsWith('eq.')) return String(row[key]) === raw.slice(3);
    if (raw.startsWith('in.(')) return raw.slice(4, -1).split(',').map((v) => v.replace(/"/g, '')).includes(String(row[key]));
    return true;
  });
  state.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const method = (init.method ?? 'GET').toUpperCase();
    const path = url.pathname.replace('/rest/v1/', '');
    state.calls.push(`${method} ${path}`);
    if (hang(method, path)) return hangRespectingSignal(init);
    const failure = fail(method, path);
    if (failure === 'throw') throw new TypeError('fetch failed');
    if (failure) return json({ message: 'Gateway Timeout' }, failure);
    const body = init.body ? JSON.parse(init.body) : null;
    const objectMode = new Headers(init.headers).get('accept')?.includes('vnd.pgrst.object');
    const reply = (rows) => json(objectMode ? rows[0] ?? null : rows);
    if (path === 'production_monitor_heartbeats') {
      if (method === 'POST') { state.heartbeatWrites.push(body); Object.assign(state.heartbeat, body); return json(null, 201); }
      return reply([structuredClone(state.heartbeat)]);
    }
    if (path === 'phase14_operational_alerts') return reply(structuredClone(state.alerts.filter((row) => matches(row, filtersFor(url)))));
    if (path === 'production_monitor_notifications') {
      if (method === 'POST') { if (!state.notifications.some((n) => n.notification_key === body.notification_key)) state.notifications.push({ ...body, created_at: new Date().toISOString(), sent_at: null }); return json(null, 201); }
      const rows = state.notifications.filter((row) => matches(row, filtersFor(url)));
      if (method === 'PATCH') { rows.forEach((row) => Object.assign(row, body)); return json(null, 204); }
      return reply(structuredClone(rows));
    }
    if (path.startsWith('rpc/')) {
      const name = path.slice(4); state.rpc.push({ name, args: body });
      let row = state.alerts.find((r) => r.alert_key === body.p_alert_key);
      if (name === 'record_production_monitor_alert') {
        if (!row) { row = { alert_key: body.p_alert_key, source: 'production_monitor', occurrence_count: 0 }; state.alerts.push(row); }
        if (row.status === 'resolved' || !row.status) Object.assign(row, { first_detected_at: body.p_now, occurrence_count: 0, last_notified_at: null, last_recovery_notified_at: null });
        Object.assign(row, { status: 'open', monitoring_priority: body.p_priority, category: body.p_category, stage: body.p_stage, error_category: body.p_error_category, detail_json: body.p_detail, last_seen_at: body.p_now, occurrence_count: row.occurrence_count + 1 });
        return json(row);
      }
      if (name === 'resolve_production_monitor_alert') { if (!row || row.status === 'resolved') return json(null); row.status = 'resolved'; return json(true); }
      if (name === 'mark_production_monitor_alert_notified') { row[body.p_is_recovery ? 'last_recovery_notified_at' : 'last_notified_at'] = body.p_notified_at; return json(row); }
      return json({ message: 'unexpected rpc' }, 400);
    }
    if (path === 'production_monitor_events' && method === 'POST') return json(null, 201);
    return reply([]);
  };
  return state;
}
const sentEmails = [];
const sendEmail = async (payload) => { assert.equal(payload.audience, 'internal'); sentEmails.push(payload); return { ok: true, mode: 'live', providerMessageId: `id-${sentEmails.length}` }; };
const healthyReadiness = async () => ({ status: 'HEALTHY', checks: [], currentDeploymentSha: 'a'.repeat(40), checkedAt: new Date().toISOString() });
const openP1 = { alert_key: 'fulfilment:paid_order_without_report', status: 'open', source: 'production_monitor', monitoring_priority: 'P1', first_detected_at: '2026-09-12T08:30:01Z', last_notified_at: '2026-09-12T14:30:01Z', last_recovery_notified_at: null, detail_json: { count: 2 } };
const monitorDeps = (fake, budgets = {}) => ({
  db: createMonitorDatabase({ fetchImpl: fake.fetch, ...fast, budgetMs: budgets.work ?? 2_000 }),
  createTerminalDb: () => createMonitorDatabase({ fetchImpl: fake.fetch, ...fast, budgetMs: budgets.terminal ?? 500 }),
  sendEmail
});

// 6. Real transport: a timed-out fulfilment read preserves the open P1 and sends nothing.
{
  sentEmails.length = 0;
  const fake = fakePostgrest({ alerts: [openP1], hang: (method, path) => method === 'GET' && path === 'orders' });
  const { value: result } = await quiet(() => elapsed(() => runProductionMonitor({}, { ...monitorDeps(fake), evaluateReadiness: healthyReadiness })));
  assert.equal(fake.alerts.find((a) => a.alert_key === openP1.alert_key).status, 'open');
  assert.equal(fake.rpc.filter((r) => r.name === 'resolve_production_monitor_alert').length, 0, 'unknown fulfilment input never resolves');
  assert.equal(fake.rpc.filter((r) => r.name === 'record_production_monitor_alert' && r.args.p_alert_key.startsWith('fulfilment:')).length, 0, 'no fake fulfilment counts recorded');
  assert.equal(sentEmails.length, 0, 'no recovery email');
  assert.equal(result.status, 'INCIDENT', 'preserved P1 keeps overall incident status');
  assert.equal(fake.heartbeat.status, 'degraded');
  assert.ok(fake.heartbeat.last_completed_at, 'terminal heartbeat written');
  pass('fulfilment read timeout preserves the existing P1, no zero-count, no recovery email, terminal heartbeat written');
}

// 7. Persistent database outage (hanging, then fast 504s): prompt DEGRADED, no customer P1, terminal heartbeat attempted.
for (const [label, options] of [['hanging', { hang: () => true }], ['gateway 504', { fail: () => 504 }], ['network error', { fail: () => 'throw' }]]) {
  sentEmails.length = 0;
  const fake = fakePostgrest({ alerts: [openP1], ...options });
  const budgets = { work: 300, terminal: 100 };
  const { value: result, ms } = await quiet(() => elapsed(() => runProductionMonitor({ origin: null }, monitorDeps(fake, budgets))));
  assert.ok(ms < budgets.work + budgets.terminal + 250, `${label}: completed in ${ms}ms`);
  assert.equal(result.status, 'DEGRADED');
  assert.equal(result.errorCategory, 'monitor_dependency_unavailable');
  assert.equal(fake.rpc.length, 0, `${label}: no alert records, resolutions or markers`);
  assert.equal(fake.calls.filter((c) => c.startsWith('POST rpc/')).length, 0);
  assert.equal(sentEmails.length, 0, `${label}: no emails`);
  const terminalWrites = fake.calls.filter((c) => c === 'POST production_monitor_heartbeats');
  assert.ok(terminalWrites.length >= 1 && terminalWrites.length <= 4, `${label}: bounded heartbeat attempts (${terminalWrites.length})`);
}
{
  // When the terminal write can land (database recovers at the end), the row leaves `running`.
  let down = true;
  const fake = fakePostgrest({ alerts: [openP1], hang: () => down });
  const deps = monitorDeps(fake, { work: 200, terminal: 300 });
  const original = deps.createTerminalDb;
  deps.createTerminalDb = () => { down = false; return original(); };
  const { value: result } = await quiet(() => elapsed(() => runProductionMonitor({ origin: null }, deps)));
  assert.equal(result.status, 'DEGRADED');
  assert.equal(fake.heartbeat.status, 'degraded');
  assert.equal(fake.heartbeat.safe_summary_json.dependency_failure, true);
  assert.equal(fake.alerts[0].status, 'open');
  pass('persistent outage (hang/504/network) completes within budget as DEGRADED with no false P1, emails or lifecycle churn; terminal heartbeat is not stranded in running');
}

// 8. Hysteresis across outage and recovery cycles, on the real transport.
{
  sentEmails.length = 0;
  let down = true;
  const fake = fakePostgrest({ hang: () => down });
  const cycle = async () => quiet(() => runProductionMonitor({}, { ...monitorDeps(fake, { work: 200, terminal: 200 }), createTerminalDb: () => createMonitorDatabase({ fetchImpl: fake.fetch, ...fast, budgetMs: 300 }), evaluateReadiness: healthyReadiness }));
  // Terminal writes also fail during the outage; the row simply keeps its last durable state.
  await cycle(); await cycle();
  assert.equal(sentEmails.length, 0);
  assert.notEqual(fake.heartbeat.status, 'healthy');
  // Record the two failures the outage could not persist, as the next runs would observe them.
  fake.heartbeat.safe_summary_json = { self_failures: 2, self_successes: 0, self_active: true };
  down = false;
  let result = await cycle();
  assert.equal(fake.alerts.find((a) => a.alert_key === 'monitor-self:infrastructure')?.status, 'open', 'hysteresis holds self-health for one healthy run');
  assert.equal(fake.alerts.filter((a) => a.monitoring_priority === 'P1').length, 0);
  result = await cycle();
  assert.equal(result.status, 'HEALTHY');
  assert.equal(fake.alerts.find((a) => a.alert_key === 'monitor-self:infrastructure').status, 'resolved');
  assert.equal(fake.heartbeat.status, 'healthy');
  assert.equal(sentEmails.filter((e) => /RECOVERED/.test(e.subject)).length, 1);
  assert.equal(sentEmails.length, 2, 'one P3 self-health notice and one recovery');
  result = await cycle();
  assert.equal(sentEmails.length, 2, 'no duplicate emails once healthy');
  pass('next healthy cycles resume evaluation and self-health recovers under the existing two-success hysteresis');
}

// C. Readiness: one unavailable dependency query does not manufacture unrelated application failures.
{
  const graph = { graph_version: 'MFRS-V1.2-ADAPTIVE-CANDIDATE-20260821', graph_fingerprint: '6f1f098a713b1a2f2bf6fc52a1733bf4ffafea8adccedaccc0b721e55bbe45c7', status: 'published' };
  const fake = fakePostgrest({ hang: (method, path) => path === 'methodology_versions' });
  const baseFetch = fake.fetch;
  fake.fetch = async (input, init) => new URL(String(input)).pathname.endsWith('adaptive_graph_versions') ? json([graph]) : baseFetch(input, init);
  const evaluation = await quiet(() => evaluateProductionReadiness({ db: createMonitorDatabase({ fetchImpl: fake.fetch, ...fast, budgetMs: 1_000 }), env: { ...process.env, VERCEL_ENV: 'preview' }, origin: null }));
  const check = (key) => evaluation.checks.find((c) => c.key === key);
  assert.equal(check('methodology_single_active').safeCode, 'monitor_dependency_query_unavailable');
  assert.equal(check('methodology_single_active').status, 'WARN');
  assert.equal(check('database_reachable').status, 'PASS');
  assert.equal(check('adaptive_graph_identity').status, 'PASS');
  assert.equal(candidatesForEvaluation(evaluation).some((c) => c.alertKey === 'production-readiness:methodology_single_active'), false);
  assert.equal(fake.calls.filter((c) => c === 'GET methodology_versions').length, MONITOR_DATABASE_MAX_ATTEMPTS, 'one query, one retry, no wrapper multiplication');
  pass('readiness dependency timeout is classified unavailable, not an application failure, with a single retry layer');
}

// 9. Stalled-lead monitor under database outage terminates promptly without manufacturing or suppressing leads.
for (const [label, hang] of [
  ['settings unavailable', (method, path) => path === 'app_settings'],
  ['assessments unavailable', (method, path) => path === 'assessments'],
  ['navigation unavailable', (method, path) => path === 'assessment_navigation_states']
]) {
  const fake = fakePostgrest({ hang });
  const baseFetch = fake.fetch;
  fake.fetch = async (input, init) => {
    const path = new URL(String(input)).pathname;
    if (!hang('GET', path.replace('/rest/v1/', ''))) {
      if (path.endsWith('app_settings')) return json(new Headers(init?.headers).get('accept')?.includes('object') ? { value_json: { enabled: true } } : [{ value_json: { enabled: true } }]);
      if (path.endsWith('/assessments')) return json([{ id: '11111111-1111-4111-8111-111111111111', assessment_reference: 'MKA-TEST', status: 'draft', assessment_mode: 'adaptive', started_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' }]);
    }
    return baseFetch(input, init);
  };
  const db = createMonitorDatabase({ fetchImpl: fake.fetch, ...fast, budgetMs: 300 });
  const { value: error, ms } = await quiet(() => elapsed(() => monitorAdaptiveStalledLeads({ adminUrlFor: () => 'https://www.mkfraud.co.za/score/admin' }, { db, sendEmail: async () => { throw new Error('no email expected'); } }).then(() => null, (e) => e)));
  assert.ok(error, `${label}: outage must fail the run rather than report zero stalled leads`);
  assert.equal(isMonitorDependencyFailure(error), true, `${label}: classified ${monitorDatabaseError(error).reason}`);
  assert.ok(ms < 300 + 200, `${label}: terminated in ${ms}ms`);
  assert.equal(fake.calls.filter((c) => !c.startsWith('GET ')).length, 0, `${label}: no queue, email, alert or suppression writes`);
}
pass('stalled-lead monitor database outage terminates promptly with no lead writes, emails or suppressions');
