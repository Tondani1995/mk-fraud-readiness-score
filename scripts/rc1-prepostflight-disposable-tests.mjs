// Executable disposable-Postgres coverage for the RC1 read-only pre/postflight gates.
// This creates synthetic records only inside a temporary database and never connects to cloud
// services. It deliberately tests runtime SQL outcomes, not just source strings.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';

const root = process.cwd();
const require = createRequire(import.meta.url);
const { default: EmbeddedPostgres } = await import('embedded-postgres');
const { Client } = require('pg');
const psql = process.env.PSQL ?? 'psql';
const port = 58600 + (process.pid % 200);
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rc1-prepostflight-'));
const postgres = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'testpass', port, persistent: false });
const db = new Client({ host: '127.0.0.1', port, user: 'postgres', password: 'testpass', database: 'testdb' });

const pending = [
  '20260722143000_checkpoint_e_phase1_ai_attempt_binding.sql',
  '20260724150000_release_a_backlog_reconciliation.sql',
  '20260724160000_release_b_durable_fulfilment.sql',
  '20260724170000_release_c_email_secure_delivery.sql',
  '20260724180000_release_c_closure_delivery_exceptions.sql',
  '20260725090000_release_c_runtime_secret_admin_provisioning.sql',
  '20260725150000_release_d_operational_alert_lifecycle.sql'
];
const baselineRpc = [
  ['claim_payment_report_generation', 'text,text,text'],
  ['record_payment_transition', 'text,text,text,text,integer,text,text,text,timestamptz,text,text,text,text,text'],
  ['claim_premium_report_delivery', 'uuid'],
  ['invalidate_phase14_authority_on_gate_change', ''],
  ['set_phase14_runtime_secret', 'text,text']
];
const postflightRpc = [
  ['authorize_manual_report_ai_action','uuid,text'], ['claim_manual_report_ai_attempt','jsonb'],
  ['settle_manual_report_ai_attempt','uuid,jsonb'], ['record_manual_report_narrative_provenance','uuid,jsonb'],
  ['record_premium_report_generation_run','uuid,uuid,jsonb'], ['classify_backlog_order','uuid,uuid,text,text,uuid,text,date,text'],
  ['backlog_reconciliation_queue',''], ['claim_next_fulfilment_job','text,integer'],
  ['fail_fulfilment_job','uuid,text,text,text,text'], ['submit_for_quality_review','uuid,text'],
  ['recover_expired_fulfilment_leases',''], ['approve_quality_review','uuid,text'], ['reject_quality_review','uuid,text'],
  ['retry_fulfilment_job','uuid'], ['recover_fulfilment_job','uuid'], ['claim_payment_report_generation','text,text,text'],
  ['record_payment_transition','text,text,text,text,integer,text,text,text,timestamptz,text,text,text,text,text'],
  ['claim_next_delivery','text,integer'], ['mark_delivery_dispatch_started','uuid,uuid'],
  ['finalize_delivery','uuid,uuid,text'], ['fail_delivery','uuid,uuid,text,text,text'], ['retry_delivery','uuid'],
  ['revoke_customer_report_access_token','uuid,text'], ['issue_customer_report_access_token','uuid,uuid,text,integer'],
  ['reissue_customer_report_access_token','uuid,uuid,text,text,integer,boolean'],
  ['apply_email_provider_event_atomic','text,text,text,text,timestamptz,text,jsonb'],
  ['correct_delivery_recipient_and_queue','uuid,text,text'], ['set_phase14_runtime_secret','text,text,text'],
  ['transition_phase14_operational_alert','uuid,text,text']
];

function assert(condition, message) {
  if (!condition) throw new Error(`RC1 PRE/POST TEST FAILED: ${message}`);
}
async function query(sql, params = []) { return (await db.query(sql, params)).rows; }
async function scalar(sql, params = []) { return (await query(sql, params))[0]?.value; }
function sqlFile(name) { return fs.readFileSync(path.join(root, 'scripts', name), 'utf8'); }
function migrationFile(name) { return fs.readFileSync(path.join(root, 'supabase', 'migrations', name), 'utf8'); }

function runGate(file, variables) {
  const args = ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'testdb', '-X', '-v', 'ON_ERROR_STOP=1'];
  for (const [key, value] of Object.entries(variables)) args.push('-v', `${key}=${value}`);
  args.push('-f', path.join(root, 'scripts', file));
  const result = spawnSync(psql, args, { env: { ...process.env, PGPASSWORD: 'testpass' }, encoding: 'utf8' });
  return { code: result.status ?? 1, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}
function passResult(result, label) {
  assert(result.code === 0, `${label} exited ${result.code}: ${result.output}`);
  const stops = result.output.split('\n').filter((line) => /\|STOP$/.test(line));
  assert(stops.length === 0, `${label} emitted STOP: ${stops.join(', ')}`);
  return result.output;
}
function stopResult(result, label, expectedLine) {
  assert(result.code !== 0 || result.output.includes('|STOP'), `${label} did not fail closed`);
  if (expectedLine) assert(result.output.includes(expectedLine), `${label} did not stop at ${expectedLine}`);
}

async function setup() {
  await postgres.initialise();
  await postgres.start();
  await postgres.createDatabase('testdb');
  await db.connect();
  await db.query(`
    create schema if not exists extensions;
    create extension if not exists pgcrypto with schema extensions;
    create extension if not exists citext with schema public;
    create schema if not exists auth;
    create or replace function auth.jwt() returns jsonb language sql stable as $$ select nullif(current_setting('request.jwt.claims', true), '')::jsonb $$;
    create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
    create table if not exists auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, not_after timestamptz);
    create schema if not exists vault;
    create table if not exists vault.decrypted_secrets (id uuid primary key default gen_random_uuid(), name text, decrypted_secret text);
    create schema if not exists storage;
    create table if not exists storage.buckets (id text primary key, name text not null, owner uuid, owner_id text, public boolean default false, avif_autodetection boolean default false, file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now(), updated_at timestamptz default now());
    create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid, metadata jsonb, created_at timestamptz default now(), updated_at timestamptz default now());
    create schema if not exists supabase_migrations;
    create table if not exists supabase_migrations.schema_migrations (version text primary key, name text not null, statements text[] not null);
    do $$ begin
      if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin noinherit; end if;
      if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin noinherit; end if;
      if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin noinherit bypassrls; end if;
    end $$;
    grant anon, authenticated, service_role to postgres;
    alter database testdb set search_path=public,extensions;
  `);
}

async function applyMigration(name) {
  const version = name.slice(0, name.indexOf('_'));
  const migrationName = name.slice(name.indexOf('_') + 1, -4);
  await db.query(migrationFile(name));
  await db.query('insert into supabase_migrations.schema_migrations(version,name,statements) values ($1,$2,$3)', [version, migrationName, [migrationFile(name)]]);
}
async function replayBaseline() {
  const files = fs.readdirSync(path.join(root, 'supabase', 'migrations')).filter((name) => name.endsWith('.sql')).sort();
  const baseline = files.filter((name) => !pending.includes(name));
  assert(baseline.length === 34, `expected 34 baseline migrations, got ${baseline.length}`);
  for (const name of baseline) {
    console.log(`Applying baseline ${name}`);
    await applyMigration(name);
  }
}
async function ensureAdmin() {
  await db.query(`insert into auth.users(id,email) values ('00000000-0000-0000-0000-00000000a001','rc1-synthetic-admin@invalid.test') on conflict do nothing`);
  await db.query(`insert into public.admin_profiles(id,email,full_name,role,status,mfa_required) values ('00000000-0000-0000-0000-00000000a001','rc1-synthetic-admin@invalid.test','Synthetic RC1 Admin','platform_admin','active',false) on conflict (id) do nothing`);
  return '00000000-0000-0000-0000-00000000a001';
}
async function seedOrders(adminId) {
  await db.query(`insert into public.app_settings(setting_key,value_json) values ('email_provider_mode','{"mode":"disabled"}') on conflict (setting_key) do update set value_json=excluded.value_json`);
  const method = await query("select id from public.methodology_versions where status='active' limit 1");
  assert(method.length === 1, 'active methodology seed required');
  let product = (await query('select id from public.products where active limit 1'))[0];
  if (!product) {
    product = { id: '00000000-0000-0000-0000-00000000b001' };
    await db.query("insert into public.products(id,product_code,name,price_cents,currency,requires_payment_verification,delivery_mode,active) values ($1,'rc1-synthetic','RC1 synthetic',1,'ZAR',true,'manual',true)", [product.id]);
  }
  let template = (await query("select id from public.report_templates where status='active' and report_type='essential_self_assessment' limit 1"))[0];
  assert(template, 'active essential report template seed required');
  await db.query("insert into public.organisations(id,legal_name,country) values ('00000000-0000-0000-0000-00000000c001','RC1 Synthetic Organisation','South Africa') on conflict do nothing");
  for (let i = 1; i <= 18; i += 1) {
    const n = String(i).padStart(3, '0');
    const assessment = `00000000-0000-0000-0000-00000000d${n}`;
    const order = `00000000-0000-0000-0000-00000000e${n}`;
    const score = `00000000-0000-0000-0000-00000000f${n}`;
    await db.query("insert into public.assessments(id,assessment_reference,organisation_id,methodology_version_id,status,submitted_at) values ($1,$2,'00000000-0000-0000-0000-00000000c001',$3,'submitted',now()) on conflict do nothing", [assessment, `RC1-SYNTHETIC-${n}`, method[0].id]);
    await db.query("insert into public.score_runs(id,assessment_id,methodology_version_id,run_number,run_type,status,overall_score,calculated_maturity,final_maturity,exposure_score,exposure_band,coverage_pct,input_hash,locked_at) values ($1,$2,$3,1,'test_fixture','completed',50,'Reactive','Reactive',50,'Low',100,'0000000000000000000000000000000000000000000000000000000000000000',now()) on conflict do nothing", [score, assessment, method[0].id]);
    await db.query("insert into public.orders(id,order_reference,assessment_id,product_id,status,amount_cents,currency) values ($1,$2,$3,$4,'payment_received',1,'ZAR') on conflict do nothing", [order, `RC1-SYNTHETIC-ORDER-${n}`, assessment, product.id]);
    if (i <= 15) {
      const report = `00000000-0000-0000-0000-00000000a${n}`;
      const storage = i <= 2 ? 'VERIFIED' : 'NOT_STORED';
      await db.query("insert into public.reports(id,assessment_id,order_id,score_run_id,template_id,report_type,status,report_reference,version_number,storage_status) values ($1,$2,$3,$4,$5,'essential_self_assessment','generated',$6,1,$7) on conflict do nothing", [report, assessment, order, score, template.id, `RC1-SYNTHETIC-REPORT-${n}`, storage]);
    }
  }
  return { adminId };
}
async function jsonRpcFingerprints(list) {
  const result = {};
  for (const [name, args] of list) {
    const rows = await query(`select md5(pg_get_functiondef(p.oid)) as fingerprint from pg_proc p where p.pronamespace='public'::regnamespace and p.proname=$1 and replace(replace(array_to_string(array(select format_type(t, null) from unnest(p.proargtypes) t), ','), 'timestamp with time zone', 'timestamptz'), ' ', '')=$2`, [name, args]);
    assert(rows.length === 1, `fingerprint function exists: ${name}(${args})`);
    result[`${name}(${args})`] = rows[0].fingerprint;
  }
  return JSON.stringify(result);
}
async function baselineCounts() {
  const rows = await query(`select jsonb_build_object(
    'order_events',(select count(*)::text from public.order_events),
    'report_events',(select count(*)::text from public.report_events),
    'email_events',(select count(*)::text from public.email_events),
    'email_provider_events',(select count(*)::text from public.email_provider_events),
    'report_delivery_authorizations',(select count(*)::text from public.report_delivery_authorizations),
    'report_delivery_finalizations',(select count(*)::text from public.report_delivery_finalizations),
    'report_delivery_remediations',(select count(*)::text from public.report_delivery_remediations),
    'phase14_operational_alerts',(select count(*)::text from public.phase14_operational_alerts),
    'manual_report_generation_attempts',(select count(*)::text from public.manual_report_generation_attempts)
  ) as value`);
  return rows[0].value;
}
async function protectedFingerprint() {
  const rows = await query(`with protected as (
    select r.order_id,r.id report_id from public.reports r join public.orders o on o.id=r.order_id
    where o.status='payment_received' and r.report_type='essential_self_assessment' and r.status not in ('superseded','voided') and r.storage_status='VERIFIED'
  ) select encode(extensions.digest(convert_to(coalesce(string_agg(order_id::text||':'||report_id::text,'|' order by order_id,report_id),''),'UTF8'),'sha256'),'hex') as value from protected`);
  return rows[0].value;
}
async function injectDuplicateReport() {
  await db.query(`insert into public.reports(id,assessment_id,order_id,score_run_id,template_id,report_type,status,report_reference,version_number,storage_status)
    select '00000000-0000-0000-0000-00000000a099',assessment_id,order_id,score_run_id,template_id,report_type,'generated','RC1-SYNTHETIC-DUPLICATE',2,'NOT_STORED'
    from public.reports where report_reference='RC1-SYNTHETIC-REPORT-01'`);
}
async function cleanDuplicate() { await db.query("delete from public.reports where report_reference='RC1-SYNTHETIC-DUPLICATE'"); }
async function injectLease(adminId) {
  await db.query(`insert into public.manual_report_generation_attempts(request_id,request_key,order_id,report_version,trigger_source,requested_by,status,technical_reference,lease_owner,lease_expires_at)
    values ('00000000-0000-0000-0000-00000000aa01','RC1-SYNTHETIC-LEASE','00000000-0000-0000-0000-00000000e001',1,'admin_generate',$1,'REPORT_GENERATING','synthetic','synthetic-worker',now()+interval '5 minutes')`, [adminId]);
}
async function cleanLease() { await db.query("delete from public.manual_report_generation_attempts where request_key='RC1-SYNTHETIC-LEASE'"); }
async function runPre(vars) { return runGate('rc1-production-preflight.sql', vars); }
async function runPost(vars) { return runGate('rc1-production-postflight.sql', vars); }
async function expectPreStop(label, mutate, cleanup, line) { await mutate(); try { stopResult(await runPre(preVars), label, line); } finally { await cleanup(); } }
async function expectPostStop(label, mutate, cleanup, line, override = {}) { await mutate(); try { stopResult(await runPost({ ...postVars, ...override }), label, line); } finally { await cleanup(); } }

let preVars;
let postVars;
try {
  await setup();
  await replayBaseline();
  const adminId = await ensureAdmin();
  await seedOrders(adminId);
  const baselineCountsJson = JSON.stringify(await baselineCounts());
  const protectedPair = await protectedFingerprint();
  const baselineRpcJson = await jsonRpcFingerprints(baselineRpc);
  preVars = {
    rc1_approved_rpc_baseline_json: baselineRpcJson,
    rc1_expected_baseline_counts_json: baselineCountsJson,
    rc1_approved_protected_pair_fingerprint: protectedPair
  };
  passResult(await runPre(preVars), 'baseline preflight');

  await expectPreStop('duplicate current report', injectDuplicateReport, cleanDuplicate, 'duplicate_current_reports_result|STOP');
  await expectPreStop('generation lease', () => injectLease(adminId), cleanLease, 'active_generation_result|STOP');
  await expectPreStop('new order event', async () => { await db.query("insert into public.order_events(order_id,event_type,note,metadata_json) values ('00000000-0000-0000-0000-00000000e001','synthetic','synthetic', '{}'::jsonb)"); }, async () => { await db.query("delete from public.order_events where event_type='synthetic'"); }, 'baseline_counts_result|STOP');
  await expectPreStop('new email event', async () => { await db.query("insert into public.email_events(order_id,recipient_email,status,provider_mode) values ('00000000-0000-0000-0000-00000000e001','rc1-synthetic-event@invalid.test','queued','disabled')"); }, async () => { await db.query("delete from public.email_events where recipient_email='rc1-synthetic-event@invalid.test'"); }, 'baseline_counts_result|STOP');

  for (const name of pending) await applyMigration(name);
  const postRpcJson = await jsonRpcFingerprints(postflightRpc);
  postVars = {
    rc1_cutover_started_at: new Date().toISOString(),
    rc1_preflight_newest_version: '20260721150808',
    rc1_preflight_protected_pair_fingerprint: protectedPair,
    rc1_preflight_baseline_counts_json: baselineCountsJson,
    rc1_approved_postflight_rpc_fingerprints_json: postRpcJson
  };
  passResult(await runPost(postVars), 'baseline postflight');

  await expectPostStop('wrong migration name', async () => { await db.query("update supabase_migrations.schema_migrations set name='wrong_name' where version='20260722143000'"); }, async () => { await db.query("update supabase_migrations.schema_migrations set name='checkpoint_e_phase1_ai_attempt_binding' where version='20260722143000'"); }, 'authorised_ledger_pairs_result|STOP');
  await expectPostStop('unlisted migration', async () => { await db.query("insert into supabase_migrations.schema_migrations(version,name,statements) values ('99999999999999','unlisted',array['select 1'])"); }, async () => { await db.query("delete from supabase_migrations.schema_migrations where version='99999999999999'"); }, 'unlisted_post_preflight_result|STOP');
  await expectPostStop('missing backlog index', async () => { await db.query('drop index public.backlog_reconciliation_records_classification_idx'); }, async () => { await db.query('create index backlog_reconciliation_records_classification_idx on public.backlog_reconciliation_records(classification)'); }, 'derived_index_list_result|STOP');
  const recoveryDefinition = (await query("select pg_get_functiondef('public.recover_expired_fulfilment_leases()'::regprocedure) as value"))[0].value;
  await expectPostStop('missing expected RPC', async () => { await db.query('drop function public.recover_expired_fulfilment_leases()'); }, async () => { await db.query(recoveryDefinition); }, 'rpc_combined_result|STOP');
  await expectPostStop('unsafe search_path', async () => { await db.query("alter function public.recover_expired_fulfilment_leases() set search_path = public"); }, async () => { await db.query("alter function public.recover_expired_fulfilment_leases() set search_path = public, pg_temp"); }, 'rpc_combined_result|STOP');
  await expectPostStop('PUBLIC EXECUTE grant', async () => { await db.query("grant execute on function public.recover_expired_fulfilment_leases() to public"); }, async () => { await db.query("revoke execute on function public.recover_expired_fulfilment_leases() from public"); }, 'rpc_combined_result|STOP');
  await expectPostStop('RLS disabled', async () => { await db.query('alter table public.backlog_reconciliation_records disable row level security'); }, async () => { await db.query('alter table public.backlog_reconciliation_records enable row level security'); }, 'rls_policy_result|STOP');
  await expectPostStop('changed protected-order fingerprint', async () => {}, async () => {}, 'protected_pair_fingerprint_result|STOP', { rc1_preflight_protected_pair_fingerprint: '0000000000000000000000000000000000000000000000000000000000000000' });
  await expectPostStop('worker lease', () => injectLease(adminId), cleanLease, 'worker_lease_result|STOP');
  await expectPostStop('new order event', async () => { await db.query("insert into public.order_events(order_id,event_type,note,metadata_json) values ('00000000-0000-0000-0000-00000000e001','synthetic-post','synthetic', '{}'::jsonb)"); }, async () => { await db.query("delete from public.order_events where event_type='synthetic-post'"); }, 'no_change_aggregate_result|STOP');
  await expectPostStop('new email event', async () => { await db.query("insert into public.email_events(order_id,recipient_email,status,provider_mode) values ('00000000-0000-0000-0000-00000000e001','rc1-synthetic-post@invalid.test','queued','disabled')"); }, async () => { await db.query("delete from public.email_events where recipient_email='rc1-synthetic-post@invalid.test'"); }, 'no_change_aggregate_result|STOP');
  await expectPostStop('duplicate current report', injectDuplicateReport, cleanDuplicate, 'duplicate_current_reports_result|STOP');

  console.log('RC1 preflight/postflight disposable tests passed, including all required defect STOP cases.');
} finally {
  await db.end().catch(() => {});
  await postgres.stop().catch(() => {});
  fs.rmSync(dataDir, { recursive: true, force: true });
}
