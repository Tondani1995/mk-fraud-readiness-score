// Executable disposable-Postgres coverage for the RC1 read-only pre/postflight gates.
// This creates synthetic records only inside a temporary database and never connects to cloud
// services. It deliberately tests runtime SQL outcomes, not just source strings.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
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
const cloudConnectionVariables = [
  'DATABASE_URL', 'DIRECT_URL', 'SUPABASE_DB_URL', 'SUPABASE_DATABASE_URL',
  'SUPABASE_ACCESS_TOKEN', 'SUPABASE_SERVICE_ROLE_KEY'
];

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
function migrationFile(name) { return fs.readFileSync(path.join(root, 'supabase', 'migrations', name), 'utf8'); }

function runGate(file, variables) {
  const args = ['-h', '127.0.0.1', '-p', String(port), '-U', 'postgres', '-d', 'testdb', '-X', '-v', 'ON_ERROR_STOP=1'];
  for (const [key, value] of Object.entries(variables)) args.push('-v', `${key}=${value}`);
  args.push('-f', path.join(root, 'scripts', file));
  const localOnlyEnv = { ...process.env, PGPASSWORD: 'testpass' };
  for (const variable of cloudConnectionVariables) delete localOnlyEnv[variable];
  const result = spawnSync(psql, args, { env: localOnlyEnv, encoding: 'utf8' });
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
  assert(db.connectionParameters.host === '127.0.0.1', 'database host must be IPv4 loopback');
  assert(postgres.options?.databaseDir === undefined || dataDir.startsWith(os.tmpdir()), 'database directory must be disposable and local');
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
      if not exists (select 1 from pg_roles where rolname='supabase_admin') then create role supabase_admin superuser login; end if;
    end $$;
    grant anon, authenticated, service_role to postgres;
    alter database testdb set search_path=public,extensions;
  `);
}

async function applyMigration(name) {
  const version = name.slice(0, name.indexOf('_'));
  const migrationName = name.slice(name.indexOf('_') + 1, -4);
  const sql = migrationFile(name);
  await db.query(sql);
  await db.query('insert into supabase_migrations.schema_migrations(version,name,statements) values ($1,$2,$3)', [version, migrationName, [sql]]);
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
    await db.query("insert into public.orders(id,order_reference,assessment_id,product_id,status,amount_cents,currency,customer_email) values ($1,$2,$3,$4,'payment_received',1,'ZAR',$5) on conflict do nothing", [order, `RC1-SYNTHETIC-ORDER-${n}`, assessment, product.id, `rc1-synthetic-${n}@invalid.test`]);
    if (i <= 15) {
      const report = `00000000-0000-0000-0000-00000000a${n}`;
      const storage = i <= 2 ? 'VERIFIED' : 'NOT_STORED';
      const storageBucket = i <= 2 ? 'generated-reports' : null;
      const storagePath = i <= 2 ? `rc1/synthetic/${n}.pdf` : null;
      const checksum = i <= 2 ? String(i).repeat(64) : null;
      await db.query("insert into public.reports(id,assessment_id,order_id,score_run_id,template_id,report_type,status,report_reference,version_number,storage_status,storage_bucket,storage_path,checksum) values ($1,$2,$3,$4,$5,'essential_self_assessment','generated',$6,1,$7,$8,$9,$10) on conflict do nothing", [report, assessment, order, score, template.id, `RC1-SYNTHETIC-REPORT-${n}`, storage, storageBucket, storagePath, checksum]);
    }
  }
  return { adminId };
}
async function seedHistoricalEmailEvents() {
  await db.query(`
    insert into public.email_events(
      order_id, recipient_email, status, provider_mode, template_key
    )
    select
      '00000000-0000-0000-0000-00000000e001',
      ('rc1-historical-' || lpad(n::text, 3, '0') || '@invalid.test')::citext,
      case when n <= 71 then 'queued' when n <= 73 then 'recorded_disabled' else 'sent' end,
      'disabled',
      'rc1-synthetic-historical'
    from generate_series(1, 75) n
  `);
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
    'manual_report_generation_attempts',(select count(*)::text from public.manual_report_generation_attempts),
    'reports',(select count(*)::text from public.reports),
    'payment_automation_records',(select count(*)::text from public.payment_automation_records),
    'customer_report_access_tokens','0',
    'storage.objects',(select count(*)::text from storage.objects),
    'orders',(select count(*)::text from public.orders)
  ) as value`);
  return rows[0].value;
}
async function emailStatusBaseline() {
  const rows = await query(`
    with status_counts as (
      select coalesce(jsonb_object_agg(status, event_count), '{}'::jsonb) as value
      from (
        select status, count(*) as event_count
        from public.email_events
        group by status
        order by status
      ) counts
    )
    select value,
      encode(extensions.digest(convert_to(value::text, 'UTF8'), 'sha256'), 'hex') as fingerprint
    from status_counts
  `);
  return rows[0];
}
async function protectedStateFingerprint() {
  const rows = await query(`with protected_reports as (
    select r.*,o.customer_email,o.updated_at as order_updated_at
    from public.reports r join public.orders o on o.id=r.order_id
    where o.status='payment_received' and r.report_type='essential_self_assessment'
      and r.status not in ('superseded','voided') and r.storage_status='VERIFIED'
      and r.version_number=(select max(r2.version_number) from public.reports r2
        where r2.order_id=r.order_id and r2.report_type=r.report_type and r2.status not in ('superseded','voided'))
  ), protected as (
    select encode(extensions.digest(convert_to(jsonb_build_object(
      'order_id',r.order_id,'report_id',r.id,'report_type',r.report_type,
      'report_version',r.version_number,'report_status',r.status,'storage_status',r.storage_status,
      'storage_locator_fingerprint',encode(extensions.digest(convert_to(coalesce(r.storage_bucket,'')||':'||coalesce(r.storage_path,''),'UTF8'),'sha256'),'hex'),
      'order_recipient_fingerprint',encode(extensions.digest(convert_to(lower(coalesce(r.customer_email::text,'')),'UTF8'),'sha256'),'hex'),
      'manual_delivery_state_fingerprint',coalesce((select encode(extensions.digest(convert_to(coalesce(string_agg(jsonb_build_object(
        'status',m.status,'recipient_fingerprint',encode(extensions.digest(convert_to(lower(coalesce(m.recipient_email::text,'')),'UTF8'),'sha256'),'hex'),
        'updated_at',m.updated_at)::text,'|' order by m.id),''),'UTF8'),'sha256'),'hex')
        from public.manual_report_delivery_attempts m where m.order_id=r.order_id and m.report_id=r.id),''),
      'delivery_authorization_state_fingerprint',coalesce((select encode(extensions.digest(convert_to(coalesce(string_agg(jsonb_build_object(
        'status',d.status,'recipient_fingerprint',encode(extensions.digest(convert_to(lower(coalesce(d.recipient_email::text,'')),'UTF8'),'sha256'),'hex'),
        'lease_token_present',d.lease_token is not null,'lease_expires_at',d.lease_expires_at,'updated_at',d.updated_at
      )::text,'|' order by d.id),''),'UTF8'),'sha256'),'hex')
        from public.report_delivery_authorizations d where d.order_id=r.order_id and d.report_id=r.id),''),
      'report_updated_at',r.updated_at,'order_updated_at',r.order_updated_at
    )::text,'UTF8'),'sha256'),'hex') row_fingerprint
    from protected_reports r
  ) select encode(extensions.digest(convert_to(coalesce(string_agg(row_fingerprint,'|' order by row_fingerprint),''),'UTF8'),'sha256'),'hex') as value from protected`);
  return rows[0].value;
}
async function injectDuplicateReport() {
  await db.query(`insert into public.reports(id,assessment_id,order_id,score_run_id,template_id,report_type,status,report_reference,version_number,storage_status)
    select '00000000-0000-0000-0000-00000000a099','00000000-0000-0000-0000-00000000d016',r1.order_id,
      '00000000-0000-0000-0000-00000000f016',r1.template_id,r1.report_type,'generated',
      'RC1-SYNTHETIC-DUPLICATE',2,'NOT_STORED'
    from public.reports r1
    where r1.report_reference='RC1-SYNTHETIC-REPORT-001'
  `);
}
async function cleanDuplicate() { await db.query("delete from public.reports where report_reference='RC1-SYNTHETIC-DUPLICATE'"); }
async function injectActiveGeneration(adminId) {
  await db.query(`insert into public.manual_report_generation_attempts(request_id,request_key,order_id,report_version,trigger_source,requested_by,status,technical_reference)
    values ('00000000-0000-0000-0000-00000000aa01','RC1-SYNTHETIC-ACTIVE','00000000-0000-0000-0000-00000000e001',1,'admin_generate',$1,'REPORT_GENERATING','synthetic')`,[adminId]);
}
async function cleanActiveGeneration() { await db.query("delete from public.manual_report_generation_attempts where request_key='RC1-SYNTHETIC-ACTIVE'"); }
async function injectLease(adminId) {
  await db.query(`insert into public.manual_report_generation_attempts(request_id,request_key,order_id,report_version,trigger_source,requested_by,status,technical_reference,lease_owner,lease_expires_at)
    values ('00000000-0000-0000-0000-00000000aa01','RC1-SYNTHETIC-LEASE','00000000-0000-0000-0000-00000000e001',1,'admin_generate',$1,'REPORT_GENERATING','synthetic','synthetic-worker',now()+interval '5 minutes')`, [adminId]);
}
async function cleanLease() { await db.query("delete from public.manual_report_generation_attempts where request_key='RC1-SYNTHETIC-LEASE'"); }
async function runPre(vars) { return runGate('rc1-production-preflight.sql', vars); }
async function runPost(vars) { return runGate('rc1-production-postflight.sql', vars); }
function dryEvaluationEnvironment(overrides = {}) {
  const targetDescriptor = `host=127.0.0.1|port=${port}|database=testdb`;
  return {
    ...process.env,
    PSQL: psql,
    RC1_READ_ONLY_DATABASE_URL: `postgresql://postgres:testpass@127.0.0.1:${port}/testdb?sslmode=disable`,
    RC1_APPROVED_TARGET_FINGERPRINT: crypto.createHash('sha256').update(targetDescriptor).digest('hex'),
    RC1_CONNECTION_MODE: 'read-only',
    RC1_APPROVED_RPC_BASELINE_JSON: preVars.rc1_approved_rpc_baseline_json,
    RC1_EXPECTED_BASELINE_COUNTS_JSON: preVars.rc1_expected_baseline_counts_json,
    RC1_APPROVED_PROTECTED_STATE_FINGERPRINT: preVars.rc1_approved_protected_state_fingerprint,
    RC1_APPROVED_EMAIL_STATUS_COUNTS_JSON: preVars.rc1_approved_email_status_counts_json,
    RC1_APPROVED_EMAIL_STATUS_FINGERPRINT: preVars.rc1_approved_email_status_fingerprint,
    ...overrides,
  };
}
function runDryEvaluation(env) {
  const result = spawnSync(process.execPath, [
    path.join(root, 'scripts', 'rc1-live-boundary-dry-evaluation.mjs'),
  ], { env, encoding: 'utf8' });
  return { code: result.status ?? 1, output: `${result.stdout ?? ''}${result.stderr ?? ''}` };
}
function assertRestrictedDryOutput(result, label) {
  const lines = result.output.trim().split('\n').filter(Boolean);
  assert(lines.length > 0, `${label} must emit a result line`);
  assert(lines.every((line) => /^[a-z0-9_]+\|(PASS|STOP|NOT_DATABASE_VISIBLE)$/.test(line)),
    `${label} emitted non-result output: ${result.output}`);
}
async function expectPreStop(label, mutate, cleanup, line) {
  const before = await protectedStateFingerprint();
  await mutate();
  try {
    stopResult(await runPre(preVars), label, line);
  } finally {
    await cleanup();
  }
  assert((await protectedStateFingerprint()) === before, `${label} cleanup must restore protected state`);
}
async function expectPostStop(label, mutate, cleanup, line, override = {}) { await mutate(); try { stopResult(await runPost({ ...postVars, ...override }), label, line); } finally { await cleanup(); } }

let preVars;
let postVars;
let protectedReportOriginal;
try {
  await setup();
  await replayBaseline();
  const adminId = await ensureAdmin();
  await seedOrders(adminId);
  await seedHistoricalEmailEvents();
  const baselineCountsJson = JSON.stringify(await baselineCounts());
  const emailStatus = await emailStatusBaseline();
  const protectedState = await protectedStateFingerprint();
  [protectedReportOriginal] = await query("select storage_path,updated_at::text as updated_at from public.reports where report_reference='RC1-SYNTHETIC-REPORT-001'");
  const baselineRpcJson = await jsonRpcFingerprints(baselineRpc);
  preVars = {
    rc1_approved_rpc_baseline_json: baselineRpcJson,
    rc1_expected_baseline_counts_json: baselineCountsJson,
    rc1_approved_protected_state_fingerprint: protectedState,
    rc1_approved_email_status_counts_json: JSON.stringify(emailStatus.value),
    rc1_approved_email_status_fingerprint: emailStatus.fingerprint
  };
  assert(JSON.stringify(emailStatus.value) === JSON.stringify({ sent: 2, queued: 71, recorded_disabled: 2 }),
    'historical email fixture must match the controller-approved 71/2/2 status baseline');
  assert(emailStatus.fingerprint === '76d196fb622eba89ec2c556ea8f65b8a183eee086e722fb43e2d94fa774e6fd2',
    'historical email status fingerprint must match the approved manifest');
  passResult(await runPre(preVars), 'baseline preflight');

  await expectPreStop('duplicate current report', injectDuplicateReport, cleanDuplicate, 'duplicate_current_reports_result|STOP');
  await expectPreStop('active generation', () => injectActiveGeneration(adminId), cleanActiveGeneration, 'active_generation_result|STOP');
  await expectPreStop('unexpected early post-migration column', async () => { await db.query('alter table public.manual_report_generation_attempts add column lease_owner text'); }, async () => { await db.query('alter table public.manual_report_generation_attempts drop column lease_owner'); }, 'pre_migration_capability_result|STOP');
  await expectPreStop('database-visible provider mode enabled', async () => { await db.query(`insert into public.app_settings(setting_key,value_json) values ('email_provider_mode','{"mode":"test"}'::jsonb)`); }, async () => { await db.query("delete from public.app_settings where setting_key='email_provider_mode'"); }, 'provider_mode_database_visibility_result|STOP');
  await expectPreStop('protected report updated', async () => { await db.query("update public.reports set storage_path='rc1/synthetic/changed.pdf' where report_reference='RC1-SYNTHETIC-REPORT-001'"); }, async () => {
    await db.query('alter table public.reports disable trigger trg_reports_updated_at');
    await db.query("update public.reports set storage_path=$1,updated_at=$2 where report_reference='RC1-SYNTHETIC-REPORT-001'",[protectedReportOriginal.storage_path,protectedReportOriginal.updated_at]);
    await db.query('alter table public.reports enable trigger trg_reports_updated_at');
  }, 'protected_state_fingerprint_result|STOP');
  await expectPreStop('new order event', async () => { await db.query("insert into public.order_events(order_id,event_type,note,metadata_json) values ('00000000-0000-0000-0000-00000000e001','synthetic','synthetic', '{}'::jsonb)"); }, async () => { await db.query("delete from public.order_events where event_type='synthetic'"); }, 'baseline_counts_result|STOP');
  await expectPreStop('one queued email event added', async () => {
    await db.query("insert into public.email_events(order_id,recipient_email,status,provider_mode) values ('00000000-0000-0000-0000-00000000e001','rc1-added-queued@invalid.test','queued','disabled')");
  }, async () => {
    await db.query("delete from public.email_events where recipient_email='rc1-added-queued@invalid.test'");
  }, 'email_status_baseline_result|STOP');
  await expectPreStop('one sent email event added', async () => {
    await db.query("insert into public.email_events(order_id,recipient_email,status,provider_mode) values ('00000000-0000-0000-0000-00000000e001','rc1-added-sent@invalid.test','sent','disabled')");
  }, async () => {
    await db.query("delete from public.email_events where recipient_email='rc1-added-sent@invalid.test'");
  }, 'email_status_baseline_result|STOP');
  await expectPreStop('email status changed with total count unchanged', async () => {
    await db.query("update public.email_events set status='sent' where recipient_email='rc1-historical-001@invalid.test'");
  }, async () => {
    await db.query("update public.email_events set status='queued' where recipient_email='rc1-historical-001@invalid.test'");
  }, 'email_status_baseline_result|STOP');
  await expectPreStop('one provider event added', async () => {
    await db.query(`
      insert into public.email_provider_events(
        email_event_id, provider, provider_event_id, provider_message_id, event_type,
        payload_fingerprint, payload_size_bytes, supported_event, payload_json
      )
      select id, 'synthetic', 'rc1-provider-event', 'rc1-provider-message', 'email.sent',
        repeat('a', 64), 2, true, '{}'::jsonb
      from public.email_events where recipient_email='rc1-historical-075@invalid.test'
    `);
  }, async () => {
    await db.query("delete from public.email_provider_events where provider_event_id='rc1-provider-event'");
  }, 'provider_database_activity_result|STOP');
  assert(
    (await protectedStateFingerprint()) === protectedState,
    'preflight defect cleanup must restore protected state',
  );

  const dryPass = runDryEvaluation(dryEvaluationEnvironment());
  assertRestrictedDryOutput(dryPass, 'guarded disposable dry evaluation');
  passResult(dryPass, 'guarded disposable dry evaluation');
  const requiredDryVariables = [
    'RC1_READ_ONLY_DATABASE_URL', 'RC1_APPROVED_TARGET_FINGERPRINT', 'RC1_CONNECTION_MODE',
    'RC1_APPROVED_RPC_BASELINE_JSON', 'RC1_EXPECTED_BASELINE_COUNTS_JSON',
    'RC1_APPROVED_PROTECTED_STATE_FINGERPRINT', 'RC1_APPROVED_EMAIL_STATUS_COUNTS_JSON',
    'RC1_APPROVED_EMAIL_STATUS_FINGERPRINT',
  ];
  for (const variable of requiredDryVariables) {
    const env = dryEvaluationEnvironment();
    delete env[variable];
    const result = runDryEvaluation(env);
    assertRestrictedDryOutput(result, `missing ${variable}`);
    stopResult(result, `missing ${variable}`, `missing_${variable.toLowerCase()}|STOP`);
  }
  const modeStop = runDryEvaluation(dryEvaluationEnvironment({ RC1_CONNECTION_MODE: 'read-write' }));
  assertRestrictedDryOutput(modeStop, 'non-read-only connection mode');
  stopResult(modeStop, 'non-read-only connection mode', 'connection_mode_result|STOP');
  const targetStop = runDryEvaluation(dryEvaluationEnvironment({
    RC1_APPROVED_TARGET_FINGERPRINT: '0'.repeat(64),
  }));
  assertRestrictedDryOutput(targetStop, 'unapproved target');
  stopResult(targetStop, 'unapproved target', 'target_fingerprint_result|STOP');

  const cutoverStartedAt = new Date().toISOString();
  for (const name of pending) await applyMigration(name);
  assert(
    (await protectedStateFingerprint()) === protectedState,
    'seven migrations must preserve protected state',
  );
  const postRpcJson = await jsonRpcFingerprints(postflightRpc);
  postVars = {
    rc1_cutover_started_at: cutoverStartedAt,
    rc1_preflight_newest_version: '20260721150808',
    rc1_preflight_protected_state_fingerprint: protectedState,
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
  await expectPostStop('changed protected-state fingerprint', async () => { await db.query("update public.reports set storage_path='rc1/synthetic/postflight-changed.pdf' where report_reference='RC1-SYNTHETIC-REPORT-001'"); }, async () => {
    await db.query('alter table public.reports disable trigger trg_reports_updated_at');
    await db.query("update public.reports set storage_path=$1,updated_at=$2 where report_reference='RC1-SYNTHETIC-REPORT-001'",[protectedReportOriginal.storage_path,protectedReportOriginal.updated_at]);
    await db.query('alter table public.reports enable trigger trg_reports_updated_at');
  }, 'protected_state_fingerprint_result|STOP');
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
