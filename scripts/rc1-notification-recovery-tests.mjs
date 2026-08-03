/**
 * RC1: controlled recovery of email events that were recorded but never dispatched.
 *
 * The dedupe key must keep guaranteeing one row per notification, while an unsent row stays
 * eligible for delivery once the provider is available again. These tests drive the real module
 * against an in-memory Supabase double, so the dedupe/claim logic is exercised exactly as written.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

// Transpile and load the real module in-process, exactly as the existing phase14 email tests do,
// so the dedupe and claim logic under test is the shipped source rather than a restatement of it.
function loadNotifications(dependencies) {
  const output = ts.transpileModule(read('src/lib/notifications/phase1-order-notifications.ts'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', 'crypto', output)((specifier) => {
    if (specifier in dependencies) return dependencies[specifier];
    if (specifier === 'node:crypto') return crypto;
    throw new Error(`Unexpected dependency: ${specifier}`);
  }, module, module.exports, crypto);
  return module.exports;
}

let pass = 0;
const ok = (name) => { pass += 1; console.log(`  ok - ${name}`); };

function makeDb(rows = []) {
  const events = [...rows];
  const orderEvents = [];
  return {
    events, orderEvents,
    from(table) {
      if (table === 'order_events') {
        return { insert: async (r) => { orderEvents.push(r); return { data: r, error: null }; } };
      }
      let filters = {};
      const api = {
        select() { return api; },
        eq(col, val) { filters[col] = { op: 'eq', val }; return api; },
        is(col, val) { filters[col] = { op: 'is', val }; return api; },
        in(col, vals) { filters[col] = { op: 'in', val: vals }; return api; },
        match(row) {
          return Object.entries(filters).every(([c, f]) =>
            f.op === 'eq' ? row[c] === f.val
            : f.op === 'is' ? (row[c] ?? null) === f.val
            : f.val.includes(row[c]));
        },
        async maybeSingle() { const r = events.find((e) => api.match(e)); return { data: r ?? null, error: null }; },
        async single() { const r = events.find((e) => api.match(e)); return { data: r ?? null, error: r ? null : new Error('none') }; },
        insert(row) {
          const r = { id: `evt_${events.length + 1}`, retry_count: 0, sent_at: null, provider_message_id: null, ...row };
          const dup = events.find((e) => e.dedupe_key === r.dedupe_key);
          if (dup) return { select: () => ({ single: async () => ({ data: null, error: new Error('duplicate') }) }) };
          events.push(r);
          return { select: () => ({ single: async () => ({ data: r, error: null }) }) };
        },
        update(patch) {
          const upd = { ...api, select: () => ({ maybeSingle: async () => {
            const r = events.find((e) => api.match(e));
            if (!r) return { data: null, error: null };
            Object.assign(r, patch); return { data: { id: r.id }, error: null };
          } }) };
          upd.eq = (c, v) => { filters[c] = { op: 'eq', val: v }; return upd; };
          upd.is = (c, v) => { filters[c] = { op: 'is', val: v }; return upd; };
          upd.in = (c, v) => { filters[c] = { op: 'in', val: v }; return upd; };
          upd.then = undefined;
          const p = Promise.resolve().then(() => {
            const r = events.find((e) => api.match(e));
            if (r) Object.assign(r, patch);
            return { data: r ?? null, error: null };
          });
          upd.catch = p.catch.bind(p); upd.finally = p.finally.bind(p);
          return upd;
        }
      };
      return api;
    }
  };
}

const CONTEXT = {
  order: { id: 'ord_1', order_reference: 'MKORD-TEST-0001', amount_cents: 500000, currency: 'ZAR',
           product_name: 'Essential Self-Assessment Report', customer_email: 'admin@mkfraud.co.za',
           customer_name: 'Cert', organisation_name: 'MKTST' },
  assessment: { id: 'asm_1', assessment_reference: 'MKFRS-TEST-0001' },
  organisation: { legal_name: 'MKTST' }, respondent: { email: 'admin@mkfraud.co.za' }, dataRequest: null
};
const disabled = async () => ({ ok: true, mode: 'disabled', providerMessageId: null });
const live = async () => ({ ok: true, mode: 'external', providerMessageId: 'prov_1' });
const failing = async () => ({ ok: false, mode: 'external', error: 'provider 500' });

function run(db, sendEmailImpl) {
  const mod = loadNotifications({
    '@/lib/supabase/server': { createSupabaseServiceClient: () => db },
    '@/lib/reports/phase1-schema-capability': {
      getPhase1SchemaCapability: async () => ({ status: 'available' }),
      requirePhase1SchemaCapability: async () => ({ status: 'available' })
    },
    '@/lib/notifications/email-provider': { sendEmail: sendEmailImpl },
    '@/lib/notifications/message-templates': {
      buildOrderConfirmationMessage: () => MSG,
      buildAdminNewOrderAlertMessage: () => MSG,
      buildPaymentConfirmedMessage: () => MSG,
      buildInternalExceptionAlertMessage: () => MSG
    }
  });
  return mod.recordPhase1OrderNotifications(CONTEXT);
}
const MSG = { subject: 'cert', text: 'cert', html: '<p>cert</p>' };

test('T1 provider disabled: event is recorded but not sent', async () => {
  const db = makeDb(); await run(db, disabled);
  const e = db.events.find((x) => x.notification_type === 'customer_order_confirmation');
  assert.equal(e.status, 'recorded_disabled');
  assert.equal(e.sent_at, null);
  assert.equal(e.provider_message_id, null);
  ok('T1 disabled provider records without sending');
});

test('T2 provider enabled later: the same event is delivered', async () => {
  const db = makeDb(); await run(db, disabled);
  const before = db.events.length;
  const id = db.events.find((x) => x.notification_type === 'customer_order_confirmation').id;
  let calls = 0;
  await run(db, async (...a) => { calls += 1; return live(...a); });
  const e = db.events.find((x) => x.id === id);
  assert.equal(db.events.length, before, 'no duplicate row created');
  assert.equal(e.status, 'sent');
  assert.ok(e.sent_at); assert.equal(e.provider_message_id, 'prov_1');
  assert.equal(e.retry_count, 1);
  assert.ok(calls > 0, 'provider was called on recovery');
  ok('T2 recovery sends the existing row, no duplicate');
});

test('T3 repeated recovery: no duplicate provider send', async () => {
  const db = makeDb(); await run(db, disabled);
  let calls = 0;
  const counting = async (...a) => { calls += 1; return live(...a); };
  await run(db, counting);
  const after1 = calls;
  await run(db, counting);
  assert.equal(calls, after1, 'second recovery made no further provider call');
  ok('T3 repeated recovery does not resend');
});

test('T4 already-sent event is never resent', async () => {
  const db = makeDb(); await run(db, live);
  let calls = 0;
  await run(db, async (...a) => { calls += 1; return live(...a); });
  assert.equal(calls, 0, 'no provider call for an already-sent event');
  ok('T4 sent events are terminal');
});

test('T5 concurrent recovery: at most one provider send', async () => {
  const db = makeDb(); await run(db, disabled);
  let calls = 0;
  const counting = async (...a) => { calls += 1; return live(...a); };
  await Promise.all([run(db, counting), run(db, counting), run(db, counting)]);
  assert.ok(calls <= 2, `expected at most one send per notification type, saw ${calls}`);
  const sent = db.events.filter((e) => e.status === 'sent');
  assert.ok(sent.every((e) => e.provider_message_id === 'prov_1'));
  ok('T5 concurrent recovery is serialised by the conditional claim');
});

test('T6 unapproved recipient stays blocked', async () => {
  const db = makeDb(); await run(db, disabled);
  const e = db.events.find((x) => x.notification_type === 'customer_order_confirmation');
  e.recipient_email = null;
  let calls = 0;
  await run(db, async (...a) => { calls += 1; return live(...a); });
  assert.equal(e.sent_at ?? null, null, 'no send without a recipient');
  ok('T6 missing/unapproved recipient blocks recovery');
});

test('T7 provider failure leaves the event safely retryable', async () => {
  const db = makeDb(); await run(db, disabled);
  await run(db, failing);
  const e = db.events.find((x) => x.notification_type === 'customer_order_confirmation');
  assert.equal(e.status, 'send_failed');
  assert.equal(e.sent_at, null); assert.equal(e.provider_message_id, null);
  let calls = 0;
  await run(db, async (...a) => { calls += 1; return live(...a); });
  assert.ok(calls > 0, 'a failed event remains eligible for a later attempt');
  assert.equal(db.events.find((x) => x.id === e.id).status, 'sent');
  ok('T7 provider failure remains retryable and later succeeds');
});

process.on('exit', () => console.log(`\nRC1_NOTIFICATION_RECOVERY_TESTS: ${pass} checks passed`));
