import assert from 'node:assert/strict';
import { Client } from 'pg';

const databaseUrl = process.env.STAGING_DATABASE_URL ?? '';
assert(databaseUrl, 'STAGING_DATABASE_URL is required for the Staging database integration test.');
const parsed = new URL(databaseUrl);
assert.match(parsed.hostname, /^[a-z0-9]+\.pooler\.supabase\.com$|^[a-z0-9]+\.supabase\.co$/i, 'This test only accepts the configured Supabase Staging database.');

const reportReference = 'RPT-MKFRS-2026-E043A8DE00-V1';
const recipient = 'admin@mkfraud.co.za';
const client = new Client({ connectionString: databaseUrl, application_name: 'rc1-preview-development-delivery-db-test' });
await client.connect();

async function one(query, values = []) {
  const result = await client.query(query, values);
  assert.equal(result.rows.length, 1, `Expected one row for ${query}`);
  return result.rows[0];
}

const freeze = await one(`select state, freeze_epoch from public.rc1_operation_freeze_state where singleton=true`);
assert.equal(freeze.state, 'FROZEN', `Refusing the integration test unless Staging is FROZEN; current state is ${freeze.state}.`);
const report = await one(`select id from public.reports where report_reference=$1`, [reportReference]);

const results = await Promise.all(Array.from({ length: 8 }, async () => {
  const concurrent = new Client({ connectionString: databaseUrl, application_name: 'rc1-preview-development-delivery-concurrent-test' });
  await concurrent.connect();
  try {
    return (await concurrent.query(
      `select public.preview_development_prepare_premium_report_delivery($1::uuid,$2::text,'resend'::text) as result`,
      [report.id, recipient]
    )).rows[0].result;
  } finally {
    await concurrent.end();
  }
}));

try {
  const eventIds = new Set(results.map((result) => result.email_event_id));
  const authorizationIds = new Set(results.map((result) => result.authorization_id));
  assert.equal(eventIds.size, 1, 'All concurrent calls must reuse one email event.');
  assert.equal(authorizationIds.size, 1, 'All concurrent calls must reuse one authorization.');
  assert.equal(results.filter((result) => result.reused_existing_send === false).length, 1, 'Exactly one call may create the attempt.');

  const eventCount = await one(`select count(*)::int as count from public.email_events where id=$1 and notification_type='premium_report_pdf'`, [results[0].email_event_id]);
  const authorizationCount = await one(`select count(*)::int as count from public.report_delivery_authorizations where id=$1`, [results[0].authorization_id]);
  const providerCount = await one(`select count(*)::int as count from public.email_provider_events where email_event_id=$1`, [results[0].email_event_id]);
  assert.equal(eventCount.count, 1, 'Exactly one premium_report_pdf event must exist.');
  assert.equal(authorizationCount.count, 1, 'Exactly one authorization must exist.');
  assert.equal(providerCount.count, 0, 'Prepare must not contact the provider.');

  const auditCount = await one(`select count(*)::int as count from public.audit_logs where action='premium_report_preview_development_delivery_requested' and entity_id=$1`, [report.id]);
  assert.equal(auditCount.count, 1, 'The request audit must be written inside the SECURITY DEFINER RPC.');
  console.log(JSON.stringify({ ok: true, freezeEpoch: freeze.freeze_epoch, eventId: results[0].email_event_id, authorizationId: results[0].authorization_id, concurrentCalls: results.length, providerEvents: 0, auditRows: auditCount.count }));
} finally {
  await client.query(`begin`);
  try {
    await client.query(`select set_config('phase14.authoritative_transition','preview_development_rpc',true)`);
    await client.query(`delete from public.audit_logs where action='premium_report_preview_development_delivery_requested' and entity_id=$1`, [report.id]);
    await client.query(`delete from public.report_delivery_authorizations where report_id=$1 and recipient_email=$2`, [report.id, recipient]);
    await client.query(`delete from public.email_events where report_id=$1 and recipient_email=$2 and notification_type='premium_report_pdf'`, [report.id, recipient]);
    await client.query(`commit`);
  } catch (error) {
    await client.query(`rollback`);
    throw error;
  }
  await client.end();
}
