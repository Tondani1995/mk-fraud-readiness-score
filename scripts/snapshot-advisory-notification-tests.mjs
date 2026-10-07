/**
 * Snapshot Advisory internal-notification dispatch tests.
 *
 * Runs the real assessment-linked Advisory route (personalised-report-request) against an
 * in-memory database and a fake email provider. No network, no Supabase, no live provider.
 *
 * Property under test: a Snapshot Advisory enquiry is persisted, records exactly one durable
 * internal email_events row, and dispatches that row once through the existing MK provider
 * abstraction — and never sends a customer email, a duplicate, or anything commercial.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const ROUTE_PATH = 'src/app/score/api/assessments/[assessmentRef]/personalised-report-request/route.ts';
const MK_RECIPIENT = 'leads@mkfraud.co.za';
const RESPONDENT_EMAIL = 'respondent@example.test';

process.env.MK_INTERNAL_LEADS_EMAIL = MK_RECIPIENT;
delete process.env.MK_EMAIL_RECIPIENT_ALLOWLIST;

let checks = 0;
const failures = [];
async function check(label, fn) {
  try {
    await fn();
    checks += 1;
    console.log(`  ok - ${label}`);
  } catch (error) {
    failures.push(label);
    console.error(`  FAIL - ${label}: ${error.message}`);
  }
}

/** Supabase-shaped in-memory client: enough of the query builder for this route's real calls. */
function memoryDb() {
  const tables = {
    data_requests: [],
    email_events: [],
    audit_logs: [],
    respondents: [{ id: 'respondent-1', email: RESPONDENT_EMAIL, full_name: 'Test Respondent' }]
  };
  const touched = new Set();
  let sequence = 0;
  let clock = Date.parse('2026-10-07T13:00:00.000Z');
  const stamp = () => new Date((clock += 1000)).toISOString();

  function from(table) {
    touched.add(table);
    if (!tables[table]) tables[table] = [];
    const state = { op: 'select', payload: null, filters: [], limit: null, orderBy: null };
    const matches = (row) => state.filters.every((filter) => filter(row));
    const execute = () => {
      const rows = tables[table];
      if (state.op === 'insert') {
        const payloads = Array.isArray(state.payload) ? state.payload : [state.payload];
        if (table === 'email_events' && payloads.some((p) => p.dedupe_key && rows.some((r) => r.dedupe_key === p.dedupe_key))) {
          return { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint email_events_dedupe_key' } };
        }
        const now = stamp();
        const records = payloads.map((p) => ({ id: `${table}-${++sequence}`, created_at: now, updated_at: now, retry_count: 0, ...p }));
        rows.push(...records);
        return { data: records, error: null };
      }
      if (state.op === 'update') {
        const hit = rows.filter(matches);
        for (const row of hit) Object.assign(row, state.payload);
        return { data: hit, error: null };
      }
      let hit = rows.filter(matches);
      if (state.orderBy) {
        const { key, ascending } = state.orderBy;
        hit = [...hit].sort((a, b) => (a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0) * (ascending ? 1 : -1));
      }
      if (state.limit !== null) hit = hit.slice(0, state.limit);
      return { data: hit, error: null };
    };
    const builder = {
      select() { return builder; },
      insert(payload) { state.op = 'insert'; state.payload = payload; return builder; },
      update(payload) { state.op = 'update'; state.payload = payload; return builder; },
      eq(key, value) { state.filters.push((row) => row[key] === value); return builder; },
      is(key, value) { state.filters.push((row) => (row[key] ?? null) === value); return builder; },
      in(key, values) { state.filters.push((row) => values.includes(row[key])); return builder; },
      lt(key, value) { state.filters.push((row) => row[key] < value); return builder; },
      order(key, options = {}) { state.orderBy = { key, ascending: options.ascending !== false }; return builder; },
      limit(count) { state.limit = count; return builder; },
      async maybeSingle() {
        const { data, error } = execute();
        return error ? { data: null, error } : { data: data[0] ?? null, error: null };
      },
      async single() {
        const { data, error } = execute();
        if (error) return { data: null, error };
        return data[0] ? { data: data[0], error: null } : { data: null, error: { message: 'no rows returned' } };
      },
      then(resolve, reject) { return Promise.resolve(execute()).then(resolve, reject); }
    };
    return builder;
  }

  return { tables, touched, from };
}

function freshHarness({ providerMode = 'live', sendEmail } = {}) {
  const sends = [];
  const harness = {
    db: memoryDb(),
    providerMode,
    events: [],
    sends,
    snapshot: { overallScore: 41.44, finalMaturity: 'Developing', criticalGapCount: 2, capApplied: false },
    validateSnapshotToken: async (input) => (input.rawToken === 'valid-snapshot-token'
      ? {
          ok: true,
          assessment: {
            id: 'assessment-1',
            assessment_reference: 'MKFRS-2026-TEST000001',
            organisation_id: 'organisation-1',
            primary_respondent_id: 'respondent-1',
            current_score_run_id: 'score-run-1'
          },
          organisation: { legal_name: 'Example Organisation (Pty) Ltd' }
        }
      : { ok: false }),
    sendEmail: async (input) => {
      sends.push(input);
      if (sendEmail) return sendEmail(input, sends.length);
      return { ok: true, mode: 'live', providerMessageId: `provider-message-${sends.length}` };
    }
  };
  globalThis.__mkSnapshotAdvisoryTest = harness;
  return harness;
}

const { POST } = await import(pathToFileURL(path.join(root, ROUTE_PATH)).href);

function advisoryRequest(overrides = {}) {
  return new Request('https://www.mkfraud.co.za/score/api/assessments/MKFRS-2026-TEST000001/personalised-report-request', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      snapshotToken: 'valid-snapshot-token',
      consentContact: true,
      primaryReason: 'design_strengthen_programme',
      areasOfFocus: ['fraud_governance_oversight'],
      preferredContactMethod: 'email',
      preferredConsultationTimeframe: 'within_two_weeks',
      notes: 'Please call after the board meeting.',
      ...overrides
    })
  });
}

async function submit(overrides) {
  const response = await POST(advisoryRequest(overrides), { params: Promise.resolve({ assessmentRef: 'MKFRS-2026-TEST000001' }) });
  return { status: response.status, body: await response.json() };
}

const advisoryEmailEvents = (harness) => harness.db.tables.email_events.filter((row) => row.notification_type === 'advisory_enquiry_submitted');

console.log('snapshot advisory internal notification dispatch');

await check('1-4, 9: a new Snapshot Advisory enquiry persists once, records one email_event and dispatches it once to MK', async () => {
  const harness = freshHarness({ providerMode: 'live' });
  const result = await submit();
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(harness.db.tables.data_requests.length, 1, 'exactly one data_request');
  assert.equal(harness.db.tables.data_requests[0].enquiry_source, 'snapshot_advisory');
  const events = advisoryEmailEvents(harness);
  assert.equal(events.length, 1, 'exactly one internal email_event');
  assert.equal(harness.sends.length, 1, 'exactly one provider dispatch');
  assert.equal(events[0].status, 'sent');
  assert.equal(events[0].provider_mode, 'external');
  assert.equal(events[0].provider_message_id, 'provider-message-1', 'provider message id recorded');
  assert.ok(events[0].sent_at, 'sent_at recorded');
  const [sent] = harness.sends;
  assert.equal(sent.audience, 'internal');
  assert.equal(sent.to, MK_RECIPIENT, 'only the configured MK recipient is addressed');
  assert.equal(sent.idempotencyKey, events[0].id, 'the email_event id is the provider idempotency key');
  assert.match(sent.subject, /Snapshot Advisory enquiry/);
  assert.match(sent.text, new RegExp(result.body.requestReference));
  assert.ok(harness.sends.every((input) => input.to !== RESPONDENT_EMAIL), 'no customer-facing email');
  assert.ok(harness.events.some((event) => event.eventType === 'internal_notification_sent'), 'dispatch evidence recorded');
});

await check('10: no order, payment or report surface is touched', async () => {
  const harness = freshHarness({ providerMode: 'live' });
  await submit();
  for (const table of harness.db.touched) {
    assert.ok(['data_requests', 'email_events', 'audit_logs', 'respondents'].includes(table), `unexpected table ${table}`);
  }
  const audit = harness.db.tables.audit_logs[0].after_json;
  assert.equal(audit.order_created, false);
  assert.equal(audit.payment_obligation, false);
  assert.equal(audit.report_generation, false);
});

await check('5: provider disabled leaves a durable recorded_disabled row and never calls the provider', async () => {
  const harness = freshHarness({ providerMode: 'disabled' });
  const result = await submit();
  assert.equal(result.status, 200);
  assert.equal(harness.db.tables.data_requests.length, 1);
  const events = advisoryEmailEvents(harness);
  assert.equal(events.length, 1);
  assert.equal(events[0].status, 'recorded_disabled', 'not left as a stale queued row');
  assert.equal(events[0].provider_mode, 'disabled');
  assert.equal(harness.sends.length, 0);
});

await check('6: provider failure keeps the enquiry, records send_failed truthfully and does not fail the request', async () => {
  const harness = freshHarness({
    providerMode: 'live',
    sendEmail: () => ({ ok: false, mode: 'live', error: 'provider unavailable' })
  });
  const result = await submit();
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true, 'the lead is not reported as lost');
  assert.equal(harness.db.tables.data_requests.length, 1);
  const [event] = advisoryEmailEvents(harness);
  assert.equal(event.status, 'send_failed');
  assert.equal(event.provider_message_id, null);
  assert.equal(event.sent_at, null);
  assert.equal(event.error_message, 'The internal MK notification provider request failed.');
});

await check('6b: an unexpected provider exception also keeps the enquiry and the request succeeds', async () => {
  const harness = freshHarness({
    providerMode: 'live',
    sendEmail: () => { throw new Error('socket hang up'); }
  });
  const originalError = console.error;
  console.error = () => {};
  let result;
  try {
    result = await submit();
  } finally {
    console.error = originalError;
  }
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(harness.db.tables.data_requests.length, 1);
  assert.equal(advisoryEmailEvents(harness).length, 1);
});

await check('7: a repeated submission after a successful send creates no second email', async () => {
  const harness = freshHarness({ providerMode: 'live' });
  const first = await submit();
  const second = await submit();
  assert.equal(second.status, 200);
  assert.equal(second.body.requestReference, first.body.requestReference, 'same enquiry reference');
  assert.equal(harness.db.tables.data_requests.length, 1);
  assert.equal(advisoryEmailEvents(harness).length, 1);
  assert.equal(harness.sends.length, 1, 'no duplicate dispatch');
});

await check('7b: a retry after a provider failure re-dispatches the same row under the same idempotency key', async () => {
  const harness = freshHarness({
    providerMode: 'live',
    sendEmail: (_input, attempt) => (attempt === 1
      ? { ok: false, mode: 'live', error: 'provider unavailable' }
      : { ok: true, mode: 'live', providerMessageId: 'provider-message-retry' })
  });
  await submit();
  await submit();
  const events = advisoryEmailEvents(harness);
  assert.equal(events.length, 1);
  assert.equal(harness.sends.length, 2);
  assert.equal(harness.sends[0].idempotencyKey, harness.sends[1].idempotencyKey, 'provider can collapse the two attempts');
  assert.equal(events[0].status, 'sent');
  assert.equal(events[0].provider_message_id, 'provider-message-retry');
  await submit();
  assert.equal(harness.sends.length, 2, 'nothing further once sent');
});

await check('8: updating an existing active Advisory request creates no duplicate lead or send', async () => {
  const harness = freshHarness({ providerMode: 'live' });
  const first = await submit();
  const updated = await submit({ notes: 'Updated: prefer a Tuesday call.', preferredContactMethod: 'phone' });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.requestReference, first.body.requestReference);
  assert.equal(harness.db.tables.data_requests.length, 1, 'still one lead');
  assert.equal(harness.db.tables.data_requests[0].notes, 'Updated: prefer a Tuesday call.');
  assert.equal(advisoryEmailEvents(harness).length, 1);
  assert.equal(harness.sends.length, 1);
  assert.deepEqual(harness.db.tables.audit_logs.map((row) => row.action), ['advisory_enquiry_created', 'advisory_enquiry_updated']);
});

await check('the route requires a valid private Snapshot token and records nothing without one', async () => {
  const harness = freshHarness({ providerMode: 'live' });
  const result = await submit({ snapshotToken: 'wrong-token' });
  assert.equal(result.status, 403);
  assert.equal(harness.db.tables.data_requests.length, 0);
  assert.equal(harness.db.tables.email_events.length, 0);
  assert.equal(harness.sends.length, 0);
});

await check('the route dispatches through the shared notification lifecycle, not a queue-only call or a second email system', () => {
  const route = read(ROUTE_PATH);
  assert.match(route, /notifySnapshotAdvisoryEnquiry\(/);
  assert.doesNotMatch(route, /queueInternalNotification\(/);
  assert.doesNotMatch(route, /sendEmail|resend/i);
  const lifecycle = read('src/lib/notifications/internal-assessment-notifications.ts');
  assert.match(lifecycle, /export async function notifySnapshotAdvisoryEnquiry/);
  assert.match(lifecycle, /dispatchInternalAssessmentNotification\(\{/);
});

await check('11-12: the public Contact and public Advisory notification workflow is untouched', () => {
  for (const file of ['src/app/score/api/enquiries/contact/route.ts', 'src/app/score/api/enquiries/advisory/route.ts']) {
    const route = read(file);
    assert.match(route, /queuePublicEnquiryNotification\(/, `${file} still uses the PR #78 public dispatch`);
    assert.doesNotMatch(route, /notifySnapshotAdvisoryEnquiry/);
  }
  const service = read('src/lib/enquiries/public-enquiry-service.ts');
  assert.doesNotMatch(service, /notifySnapshotAdvisoryEnquiry/);
});

if (failures.length) {
  console.error(`\n${checks} checks passed, ${failures.length} FAILED`);
  process.exit(1);
}
console.log(`\nsnapshot advisory notification dispatch: ${checks} checks passed`);
