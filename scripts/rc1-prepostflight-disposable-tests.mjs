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
const manifest = JSON.parse(fs.readFileSync(
  path.join(root, 'scripts', 'rc1-production-preflight.manifest.json'),
  'utf8',
));
const freezeTableSemanticSql = fs.readFileSync(
  path.join(root, 'scripts', 'rc1-freeze-table-semantic-hashes.sql'),
  'utf8',
).replace(/\n\\gset\s*$/, ';\n');

const pending = [
  '20260722120000_rc1_operational_freeze_bootstrap.sql',
  '20260722143000_checkpoint_e_phase1_ai_attempt_binding.sql',
  '20260724150000_release_a_backlog_reconciliation.sql',
  '20260724160000_release_b_durable_fulfilment.sql',
  '20260724170000_release_c_email_secure_delivery.sql',
  '20260724180000_release_c_closure_delivery_exceptions.sql',
  '20260725090000_release_c_runtime_secret_admin_provisioning.sql',
  '20260725150000_release_d_operational_alert_lifecycle.sql',
  '20260728120000_rc1_near_real_time_automatic_fulfilment.sql',
  '20260728190000_rc1_staging_postflight_least_privilege.sql',
  '20260728191000_rc1_launch_required_foreign_key_indexes.sql',
  '20260729113242_rc1_service_role_privilege_contract.sql',
  '20260729170000_rc1_authenticated_admin_profile_read.sql',
  '20260730120000_rc1_commercial_quality_diagnostics.sql',
  '20260730130000_rc1_synthetic_certification_cleanup.sql',
  '20260731130000_rc1_synthetic_cleanup_storage_api_fix.sql',
  '20260731150000_rc1_synthetic_cleanup_guard_allowances.sql',
  '20260731170000_rc1_synthetic_storage_cleanup_closure.sql',
  '20260801070000_rc1_synthetic_cleanup_attestation_routes.sql',
  '20260801090000_rc1_synthetic_cleanup_attestation_allowance.sql',
  '20260801120000_rc1_delivery_entitlement_user_metadata.sql',
  '20260801140000_rc1_synthetic_cleanup_authoritative_allowance.sql',
  '20260801160000_rc1_orphan_remediation.sql',
  '20260801180000_rc1_certification_enablement_control.sql',
  '20260801200000_rc1_orphan_remediation_guard_allowance.sql',
  '20260801220000_rc1_synthetic_certification_marking.sql',
  '20260802120000_rc1_synthetic_marking_placeholder_allowance.sql',
  '20260803090000_rc1_certification_closure.sql',
  '20260803160000_rc1_reactive_domain_content_correction.sql',
  '20260803170000_rc1_reactive_domain_title_correction.sql',
  '20260803180000_rc1_park_fulfilment_attempt.sql',
  '20260803190000_rc1_park_fulfilment_attempt_search_path_fix.sql'
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
  ['record_fulfilment_dispatch_result','uuid,uuid,text,integer,text'],
  ['claim_exact_fulfilment_job','uuid,text,integer'],
  ['record_automatic_fulfilment_exception','uuid,uuid,text,text,text,text'],
  ['automatic_release_completed_fulfilment','uuid,uuid,text'],
  ['claim_exact_delivery','uuid,uuid,text,integer'],
  ['mark_delivery_reconciliation_required','uuid,uuid,text,text'],
  ['claim_next_delivery','text,integer'], ['mark_delivery_dispatch_started','uuid,uuid'],
  ['finalize_delivery','uuid,uuid,text'], ['fail_delivery','uuid,uuid,text,text,text'], ['retry_delivery','uuid'],
  ['revoke_customer_report_access_token','uuid,text'], ['issue_customer_report_access_token','uuid,uuid,text,integer'],
  ['reissue_customer_report_access_token','uuid,uuid,text,text,integer,boolean'],
  ['apply_email_provider_event_atomic','text,text,text,text,timestamptz,text,jsonb'],
  ['correct_delivery_recipient_and_queue','uuid,text,text'], ['set_phase14_runtime_secret','text,text,text'],
  ['transition_phase14_operational_alert','uuid,text,text']
];
const freezeFunctions = [
  ['rc1_is_known_operation_surface','text'],
  ['rc1_surface_for_relation','text,text'],
  ['rc1_freeze_status',''],
  ['rc1_require_operation_open','text'],
  ['rc1_require_platform_admin','boolean'],
  ['rc1_guard_freeze_state_write',''],
  ['rc1_activate_freeze','text'],
  ['rc1_release_freeze','text,text,bigint'],
  ['rc1_provision_certification_runtime_secret','text,text,text,bigint'],
  ['rc1_guard_authoritative_mutation',''],
  ['rc1_install_relation_guard','text,text'],
  ['rc1_install_new_relation_guards',''],
];

function assert(condition, message) {
  if (!condition) throw new Error(`RC1 PRE/POST TEST FAILED: ${message}`);
}
function canonicalJson(value) {
  return JSON.stringify(
    Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))),
  );
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
    create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid, metadata jsonb, user_metadata jsonb, created_at timestamptz default now(), updated_at timestamptz default now());
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
  await db.query(`insert into auth.sessions(id,user_id,not_after) values ('00000000-0000-0000-0000-00000000a002','00000000-0000-0000-0000-00000000a001',now()+interval '1 hour') on conflict (id) do update set not_after=excluded.not_after`);
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
  await db.query(`
    insert into public.phase14_operational_alerts(alert_key,severity,category,detail_json)
    values ('rc1-cleanup-global-alert','warning','synthetic_fixture','{"scope":"global"}'::jsonb)
    on conflict (alert_key) do nothing
  `);
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
async function freezeObjectFingerprints() {
  const functions = await jsonRpcFingerprints(freezeFunctions);
  const [tableSemanticRow] = await query(freezeTableSemanticSql);
  const triggerRows = await query(`
    select n.nspname || '.' || c.relname as key,
      md5(pg_get_triggerdef(t.oid,false)) as value
    from pg_trigger t
    join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
    where t.tgname='trg_rc1_operation_freeze' and not t.tgisinternal
    order by 1
  `);
  return {
    functions,
    tables: tableSemanticRow.rc1_actual_freeze_table_semantic_hashes_json,
    triggers: JSON.stringify(Object.fromEntries(triggerRows.map((row) => [row.key, row.value]))),
  };
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
    RC1_EXPECTED_APPLICATION_FREEZE_MODE: 'frozen',
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
async function withTriggerBypass(action) {
  await db.query('set session_replication_role = replica');
  try {
    return await action();
  } finally {
    await db.query('set session_replication_role = origin');
  }
}
async function expectPostStop(label, mutate, cleanup, line, override = {}) {
  await withTriggerBypass(mutate);
  try {
    stopResult(await runPost({ ...postVars, ...override }), label, line);
  } finally {
    await withTriggerBypass(cleanup);
  }
}
async function expectQueryStop(label, action, expectedMessage) {
  let stopped = false;
  try {
    await action();
  } catch (error) {
    stopped = true;
    assert(String(error?.message ?? error).includes(expectedMessage),
      `${label} stopped for the wrong reason: ${String(error?.message ?? error)}`);
  }
  assert(stopped, `${label} did not fail closed`);
}

async function proveHealthySyntheticCertificationCleanup(adminId) {
  const ids = {
    org: '00000000-0000-0000-0000-00000000c101',
    respondent: '00000000-0000-0000-0000-00000000c102',
    assessment: '00000000-0000-0000-0000-00000000d101',
    order: '00000000-0000-0000-0000-00000000e101',
    score: '00000000-0000-0000-0000-00000000f101',
    report: '00000000-0000-0000-0000-00000000a101',
    fulfilment: '00000000-0000-0000-0000-00000000b101',
    generationRun: '00000000-0000-0000-0000-00000000b102',
    claimToken: '00000000-0000-0000-0000-00000000b103',
    manualGeneration: '00000000-0000-0000-0000-00000000b104',
    manualDelivery: '00000000-0000-0000-0000-00000000b105',
    authorization: '00000000-0000-0000-0000-00000000b106',
    finalizationEmail: '00000000-0000-0000-0000-00000000e201',
    remediation: '00000000-0000-0000-0000-00000000b107',
    capability: '00000000-0000-0000-0000-00000000b108',
    queue: '00000000-0000-0000-0000-00000000b109',
    outbox: '00000000-0000-0000-0000-00000000b110',
    contact: '00000000-0000-0000-0000-00000000b111',
    proof: '00000000-0000-0000-0000-00000000b112',
    session: '00000000-0000-0000-0000-00000000b113',
    token: '00000000-0000-0000-0000-00000000b114',
    backlog: '00000000-0000-0000-0000-00000000b115',
    dataRequest: '00000000-0000-0000-0000-00000000b116',
  };
  const emails = ['e201', 'e202', 'e203', 'e204'].map((suffix) => `00000000-0000-0000-0000-00000000${suffix}`);
  const attestations = ['b201', 'b202', 'b203', 'b204'].map((suffix) => `00000000-0000-0000-0000-00000000${suffix}`);
  const questions = await query('select id from public.questions order by id limit 1');
  const domains = await query('select id from public.domains order by id limit 1');
  const exposures = await query('select id from public.exposure_factors order by id limit 1');
  const methodology = await query("select id from public.methodology_versions where status='active' limit 1");
  const template = await query("select id from public.report_templates where status='active' and report_type='essential_self_assessment' limit 1");
  assert(questions.length === 1 && domains.length === 1 && exposures.length === 1 && methodology.length === 1 && template.length === 1,
    'healthy cleanup fixture requires canonical methodology, question, domain, exposure and template seeds');
  const checksum = 'a'.repeat(64);
  const storageTargetCount = 1;
  const storageTargetFingerprint = crypto.createHash('sha256').update('generated-reports\nrc1/healthy.pdf').digest('hex');

  await withTriggerBypass(async () => {
    const fixtureParams = [
      ids.org, ids.respondent, ids.assessment, methodology[0].id, ids.score, checksum,
      questions[0].id, exposures[0].id, domains[0].id, adminId, ids.dataRequest, ids.order,
      ids.proof, ids.session, ids.report, template[0].id, ids.fulfilment, ids.generationRun,
      ids.claimToken, ids.manualGeneration, crypto.randomUUID(), ids.manualDelivery, crypto.randomUUID(),
      ...emails, ids.authorization, ids.remediation, attestations, ids.token, ids.contact, ids.capability,
      ids.queue, ids.outbox, ids.backlog,
    ];
    const sqlLiteral = (value) => {
      if (Array.isArray(value)) return `ARRAY[${value.map((entry) => `'${entry}'::uuid`).join(',')}]`;
      if (value === null || value === undefined) return 'null';
      return `'${String(value).replaceAll("'", "''")}'`;
    };
    const fixtureSql = String.raw`
      insert into public.organisations(id,legal_name,country,synthetic_certification_ref)
      values ($1,'RC1 healthy commercial path','South Africa','MKTEST-RC1-20260803-01');
      insert into public.respondents(id,organisation_id,full_name,email,consent_privacy)
      values ($2,$1,'RC1 Synthetic Respondent','rc1-cleanup-respondent@invalid.test',true);
      insert into public.assessments(id,assessment_reference,organisation_id,primary_respondent_id,methodology_version_id,status,submitted_at,locked_at,completion_percentage)
      values ($3,'RC1-CLEANUP-HEALTHY',$1,$2,$4,'submitted',now(),now(),68);
      insert into public.score_runs(id,assessment_id,methodology_version_id,run_number,run_type,status,overall_score,calculated_maturity,final_maturity,exposure_score,exposure_band,coverage_pct,input_hash,locked_at)
      values ($5,$3,$4,1,'initial','completed',68,'Reactive','Reactive',12,'Low',100,$6,now());
      update public.assessments set current_score_run_id=$5 where id=$3;
      insert into public.assessment_answers(assessment_id,question_id,response_value)
      values ($3,$7,4);
      insert into public.exposure_answers(assessment_id,exposure_factor_id,raw_value_json,points_awarded)
      values ($3,$8,'{"value":1}'::jsonb,1);
      insert into public.score_domain_results(score_run_id,domain_id,raw_score,weighted_contribution,coverage_pct)
      values ($5,$9,68,68,100);
      insert into public.score_question_traces(score_run_id,question_id,response_value,normalised_score,question_weight,applicable)
      values ($5,$7,4,68,1,true);
      insert into public.maturity_cap_events(score_run_id,rule_code,cap_to,reason)
      values ($5,'RC1_SYNTHETIC_CAP','Reactive','synthetic fixture');
      insert into public.assessment_tokens(assessment_id,token_hash,token_type,expires_at)
      values ($3,'rc1-cleanup-token','resume',now()+interval '1 day');
      insert into public.assessment_events(assessment_id,event_type,dedupe_key,metadata_json)
      values ($3,'assessment_submitted','rc1-cleanup-assessment-submitted','{"fixture":true}'::jsonb);
      insert into public.assessment_resume_events(assessment_id,event_type,completion_percentage)
      values ($3,'assessment_completed',68);
      insert into public.audit_logs(actor_type,actor_user_id,assessment_id,entity_table,entity_id,action)
      values ('system',$10,$3,'assessments',$3,'synthetic_fixture');
      insert into public.data_requests(id,assessment_id,organisation_id,request_type,status)
      values ($11,$3,$1,'export','received');
      insert into public.orders(id,order_reference,assessment_id,product_id,status,amount_cents,currency,customer_email,customer_name,organisation_name)
      select $12,'RC1-CLEANUP-ORDER',$3,p.id,'payment_received',100,'ZAR','rc1-cleanup-customer@invalid.test','RC1 Customer','RC1 healthy commercial path'
      from public.products p where p.active limit 1;
      insert into storage.buckets(id,name,public)
      values ('generated-reports','generated-reports',false)
      on conflict (id) do nothing;
      insert into public.payment_proofs(id,order_id,storage_bucket,storage_path,status)
      values ($13,$12,'payment-proofs','tmp/rc1-cleanup-proof.pdf','accepted');
      insert into public.payment_sessions(id,order_id,provider_mode,provider_session_reference,return_token_hash,status,expires_at)
      values ($14,$12,'disabled','rc1-cleanup-session','rc1-cleanup-return','created',now()+interval '1 day');
      insert into public.payment_automation_records(order_id,state,expected_amount_cents,received_amount_cents,currency,confirmation_source,fulfilment_trigger_result)
      values ($12,'PAID',100,100,'ZAR','manual_admin','QUEUED');
      insert into public.payment_transition_events(order_id,order_reference,old_state,new_state,source,amount_cents,currency,verification_result,idempotency_key,technical_reference)
      values ($12,'RC1-CLEANUP-ORDER','PAYMENT_PENDING','PAID','manual_admin',100,'ZAR','verified','rc1-cleanup-transition','rc1-cleanup-transition');
      insert into public.order_events(order_id,event_type,new_status,note)
      values ($12,'payment_received','payment_received','synthetic fixture');
      insert into public.reports(id,assessment_id,order_id,score_run_id,template_id,report_type,status,report_reference,version_number,storage_status,storage_bucket,storage_path,checksum,fulfilment_id)
      values ($15,$3,$12,$5,$16,'essential_self_assessment','generated','RC1-CLEANUP-REPORT',1,'VERIFIED','generated-reports','rc1/healthy.pdf',$6,$17);
      insert into storage.objects(bucket_id,name,metadata)
      values ('generated-reports','rc1/healthy.pdf','{}'::jsonb);
      insert into public.report_events(report_id,event_type,to_status)
      values ($15,'generated','generated');
      insert into public.report_fulfilments(id,order_id,assessment_id,score_run_id,report_id,idempotency_key,trigger_source,status,generation_mode,attempt_count,workflow_start_status)
      values ($17,$12,$3,$5,$15,'rc1-cleanup-fulfilment','payment_confirmation','completed','deterministic_fallback',1,'started');
      insert into public.report_generation_runs(id,fulfilment_id,report_id,attempt_number,generation_mode,prompt_version,schema_version,evidence_checksum,status,completed_at)
      values ($18,$17,$15,1,'deterministic_fallback','rc1','rc1',$6,'used',now());
      insert into public.report_generation_claims(assessment_id,report_type,claim_token,order_id,score_run_id,fulfilment_id,claim_owner,report_id,version_number,report_reference,lease_expires_at,state)
      values ($3,'essential_self_assessment',$19,$12,$5,$17,'rc1-cleanup-worker',$15,1,'RC1-CLEANUP-CLAIM',now()+interval '1 hour','abandoned');
      insert into public.manual_report_generation_attempts(id,request_id,request_key,order_id,report_version,trigger_source,requested_by,status,technical_reference)
      values ($20,$21,'rc1-cleanup-manual-generation',$12,1,'admin_generate',$10,'GENERATION_FAILED','rc1-cleanup-manual');
      insert into public.report_quality_diagnostics(attempt_id,safe_category,violation_code,severity,question_code,domain_code,source)
      values ($20,'commercial_quality','RC1_FIXTURE','warning','D1-Q1','D1','synthetic');
      insert into public.report_ai_attempts(generation_identity,fulfilment_id,attempt_kind,attempt_number,provider_request_key,provider,model,requested_provider,requested_model,evidence_checksum,max_output_tokens,max_estimated_cost_micros,timeout_ms,status)
      values ('rc1-cleanup-ai',$17,'generate',1,'rc1-cleanup-ai-request','disabled','disabled','disabled','disabled',$6,100,1,1000,'failed_before_provider');
      insert into public.manual_report_delivery_attempts(id,request_id,request_key,order_id,report_id,requested_by,status,technical_reference,recipient_email)
      values ($22,$23,'rc1-cleanup-manual-delivery',$12,$15,$10,'DELIVERY_FAILED','rc1-cleanup-delivery','rc1-cleanup-customer@invalid.test');
      insert into public.email_events(id,assessment_id,order_id,report_id,recipient_email,template_key,status,provider_mode)
      values
        ($24,$3,$12,$15,'rc1-cleanup-customer@invalid.test','customer_order_confirmation','sent','disabled'),
        ($25,$3,$12,$15,'rc1-cleanup-admin@invalid.test','admin_new_order_notification','sent','disabled'),
        ($26,$3,$12,$15,'rc1-cleanup-payment@invalid.test','payment_confirmed','sent','disabled'),
        ($27,$3,$12,$15,'rc1-cleanup-report@invalid.test','premium_report_pdf','bounced','disabled');
      insert into public.email_provider_events(email_event_id,provider,provider_event_id,provider_message_id,event_type,payload_json)
      select id,'disabled','rc1-cleanup-provider-'||row_number() over (), 'rc1-cleanup-message-'||row_number() over (), 'email.sent','{}'::jsonb
      from public.email_events where id in ($24,$25,$26,$27);
      insert into public.report_delivery_authorizations(id,report_id,report_checksum,recipient_email,order_id,assessment_id,score_run_id,security_gate_version,authorised_by,authorised_session_id,provider,email_event_id,status)
      values ($28,$15,$6,'rc1-cleanup-report@invalid.test',$12,$3,$5,1,$10,'00000000-0000-0000-0000-00000000a002','disabled',$24,'finalized');
      insert into public.report_delivery_finalizations(authorization_id,email_event_id,report_id,provider,provider_message_id)
      values ($28,$24,$15,'disabled','rc1-cleanup-message');
      insert into public.report_delivery_remediations(id,prior_email_event_id,report_id,recipient_email,remediation_type,reason,evidence_json,authorised_by)
      values ($29,$27,$15,'rc1-cleanup-report@invalid.test','bounce_retry','synthetic fixture','{"fixture":true}'::jsonb,$10);
      insert into public.phase14_provider_attestations(id,attestation_source,provider,provider_event_id,authorization_id,email_event_id,provider_state,payload_sha256,nonce,attested_at)
      select x.id,'webhook','disabled','rc1-cleanup-attestation-'||row_number() over (),$28,e.id,'delivered',$6,x.id,now()
      from unnest(array['00000000-0000-0000-0000-00000000b201'::uuid,'00000000-0000-0000-0000-00000000b202'::uuid,'00000000-0000-0000-0000-00000000b203'::uuid,'00000000-0000-0000-0000-00000000b204'::uuid]) with ordinality x(id,n)
      join unnest(array[$24,$25,$26,$27]::uuid[]) with ordinality e(id,n) on e.n=x.n;
      insert into public.phase14_provider_attestation_consumptions(attestation_id,authorization_id,consumed_by,consumed_session_id)
      select id,$28,$10,'00000000-0000-0000-0000-00000000a002' from public.phase14_provider_attestations where id = any($30::uuid[]);
      insert into public.customer_report_access_tokens(id,order_id,report_id,recipient_email,token_hash,expires_at,issued_by)
      values ($31,$12,$15,'rc1-cleanup-report@invalid.test','rc1-cleanup-access-token',now()+interval '1 day',$10);
      insert into public.customer_contact_verifications(id,order_id,assessment_id,customer_identity,previous_email,corrected_email,verification_method,evidence_reference,verified_at,verified_by_actor,expires_at)
      values ($32,$12,$3,'rc1-cleanup-customer','old@invalid.test','new@invalid.test','support_callback','rc1-cleanup-contact',now(),$10,now()+interval '1 day');
      insert into public.phase14_worker_capabilities(id,capability_type,policy_key,operation_key,issue_secret_hash,order_id,assessment_id,score_run_id,fulfilment_id,report_id,security_gate_version,authorised_by,authorised_session_id,reason,expires_at,status)
      values ($33,'automatic_generation','automatic_fulfilment','rc1-cleanup-capability',$6,$12,$3,$5,$17,$15,1,$10,'00000000-0000-0000-0000-00000000a002','synthetic fixture',now()+interval '1 day','consumed');
      insert into phase14_private.worker_attestation_nonces(nonce,capability_id,action,lease_generation,request_payload_hash,issued_at,expires_at)
      values ('00000000-0000-0000-0000-00000000b117',$33,'cleanup',0,$6,now(),now()+interval '1 day');
      insert into phase14_private.worker_recovery_nonces(nonce,capability_id,old_execution_id,proposed_execution_id,lease_generation,reason,issued_at,expires_at)
      values ('00000000-0000-0000-0000-00000000b118',$33,'old','new',0,'synthetic fixture',now(),now()+interval '1 day');
      insert into public.phase14_storage_cleanup_queue(id,storage_bucket,storage_path,expected_checksum,report_id,owner_admin_user_id,owner_capability_id,cleanup_reason)
      values ($34,'generated-reports','tmp/rc1-cleanup.pdf',$6,$15,$10,$33,'synthetic fixture');
      insert into public.phase14_workflow_start_outbox(id,fulfilment_id,capability_id,operation_key,external_idempotency_key,authority_epoch)
      values ($35,$17,$33,'rc1-cleanup-workflow','rc1-cleanup-workflow-idempotency',1);
      insert into public.backlog_reconciliation_records(id,order_id,report_id,classification,resolution_note,classified_by)
      values ($36,$12,$15,'internal_test_order','Synthetic fixture retained only for cleanup coverage.',$10);
      insert into public.phase14_operational_alerts(alert_key,severity,category,detail_json)
      values ('rc1-cleanup-global-alert','warning','synthetic_fixture','{"scope":"global"}'::jsonb)
      on conflict (alert_key) do nothing;
      insert into public.app_settings(setting_key,value_json)
      values ('rc1_synthetic_certification_cleanup','{"enabled":true}'::jsonb)
      on conflict (setting_key) do update set value_json=excluded.value_json;
    `.replace(/\$(\d+)/g, (_, index) => sqlLiteral(fixtureParams[Number(index) - 1]));
    await db.query(fixtureSql);
  });

  await db.query(`select set_config('request.jwt.claims','{"sub":"${adminId}","role":"authenticated","aal":"aal2","exp":4102444800,"session_id":"00000000-0000-0000-0000-00000000a002"}',false)`);
  let unmarkedRefused = false;
  try {
    await query(
      'select public.rc1_cleanup_synthetic_certification($1,$2,$3,$4)',
      ['MKTEST-RC1-20260803-02', 'Refuse an unmarked certification reference.', crypto.createHash('sha256').update('').digest('hex'), 0],
    );
  } catch (error) {
    unmarkedRefused = String(error.message).includes('unmarked_or_missing');
  }
  assert(unmarkedRefused, 'unmarked synthetic reference must be refused');
  let wrongProofRefused = false;
  try {
    await query(
      'select public.rc1_cleanup_synthetic_certification($1,$2,$3,$4)',
      ['MKTEST-RC1-20260803-01', 'Refuse an incorrect Storage target proof.', crypto.createHash('sha256').update('').digest('hex'), 0],
    );
  } catch (error) {
    wrongProofRefused = String(error.message).includes('storage_target_mismatch');
  }
  assert(wrongProofRefused, 'incorrect Storage target proof must be refused');
  let objectRefused = false;
  try {
    await query(
      'select public.rc1_cleanup_synthetic_certification($1,$2,$3,$4)',
      ['MKTEST-RC1-20260803-01', 'Refuse while the Storage object still exists.', storageTargetFingerprint, storageTargetCount],
    );
  } catch (error) {
    objectRefused = String(error.message).includes('storage_objects_remaining');
  }
  assert(objectRefused, 'Storage object presence must refuse cleanup');
  await withTriggerBypass(() => db.query("delete from storage.objects where bucket_id='generated-reports' and name='rc1/healthy.pdf'"));
  const proofCheck = await query(`
    select count(*)::int as count,
      encode(extensions.digest(convert_to(coalesce(string_agg(storage_bucket || E'\\n' || storage_path, E'\\n' order by storage_bucket, storage_path),''),'UTF8'),'sha256'),'hex') as fingerprint
    from public.reports where id=$1 and storage_bucket is not null and storage_path is not null
  `, [ids.report]);
  assert(proofCheck[0].count === storageTargetCount && proofCheck[0].fingerprint === storageTargetFingerprint,
    `fixture Storage proof must be canonical: ${JSON.stringify(proofCheck[0])}`);
  const result = await query(
    'select public.rc1_cleanup_synthetic_certification($1,$2,$3,$4) as value',
    ['MKTEST-RC1-20260803-01', 'Remove disposable healthy certification journey for RC1 closure.', storageTargetFingerprint, storageTargetCount],
  );
  assert(result[0].value.deleted.organisations === 1, `healthy cleanup must delete one organisation: ${JSON.stringify(result[0].value)}`);
  const remaining = await query(`select jsonb_build_object(
    'organisations',(select count(*) from public.organisations where id=$1),
    'assessments',(select count(*) from public.assessments where id=$2),
    'orders',(select count(*) from public.orders where id=$3),
    'reports',(select count(*) from public.reports where id=$4),
    'score_runs',(select count(*) from public.score_runs where id=$5),
    'external_email_events',(select count(*) from public.email_events where id=any($6::uuid[])),
    'provider_callbacks',(select count(*) from public.email_provider_events where email_event_id=any($6::uuid[])),
    'attestations',(select count(*) from public.phase14_provider_attestations where id=any($7::uuid[])),
    'global_alert',(select count(*) from public.phase14_operational_alerts where alert_key='rc1-cleanup-global-alert'),
    'products',(select count(*) from public.products where active)
  ) as value`, [ids.org, ids.assessment, ids.order, ids.report, ids.score, emails, attestations]);
  const remainingValue = remaining[0].value;
  assert(
    Number(remainingValue.organisations) === 0
      && Number(remainingValue.assessments) === 0
      && Number(remainingValue.orders) === 0
      && Number(remainingValue.reports) === 0
      && Number(remainingValue.score_runs) === 0
      && Number(remainingValue.external_email_events) === 0
      && Number(remainingValue.provider_callbacks) === 0
      && Number(remainingValue.attestations) === 0
      && Number(remainingValue.global_alert) === 1
      && Number(remainingValue.products) > 0,
    `healthy cleanup retained or deleted the wrong rows: ${JSON.stringify(remainingValue)}`,
  );
  const retry = await query(
    'select public.rc1_cleanup_synthetic_certification($1,$2,$3,$4) as value',
    ['MKTEST-RC1-20260803-01', 'Retry already-clean disposable certification journey.', crypto.createHash('sha256').update('').digest('hex'), 0],
  );
  assert(retry[0].value.already_clean === true, 'healthy cleanup retry must be an audited idempotent no-op');
  console.log(`PASS RC1 healthy cleanup fixture: external_email_events=4 provider_callbacks=4 attestations=4 storage_targets=1 retained_global_alert=1 products=${remaining[0].value.products}`);
}

async function proveMalformedStateFailClosed() {
  const constraintSnapshot = await query(`
    select conname, pg_get_constraintdef(oid, true) as definition
    from pg_constraint
    where conrelid = 'public.rc1_operation_freeze_state'::regclass
    order by conname
  `);
  const notNullSnapshot = await query(`
    select attname, attnotnull
    from pg_attribute
    where attrelid = 'public.rc1_operation_freeze_state'::regclass
      and attname in ('state', 'freeze_epoch')
    order by attname
  `);
  const releaseBase = `
    state='RELEASED',
    freeze_epoch=1,
    released_at=now(),
    released_by_fingerprint=repeat('a',64),
    release_reason_fingerprint=repeat('b',64),
    release_evidence_fingerprint=repeat('c',64),
    active_canary_authorization_hash=null,
    active_canary_expires_at=null
  `;
  const rejectedWrites = [
    ['null released_by_fingerprint', 'released_by_fingerprint=null'],
    ['null release_reason_fingerprint', 'release_reason_fingerprint=null'],
    ['null release_evidence_fingerprint', 'release_evidence_fingerprint=null'],
    ['malformed release evidence fingerprint', "release_evidence_fingerprint='malformed'"],
    ['all-zero release evidence fingerprint', "release_evidence_fingerprint=repeat('0',64)"],
    ['inconsistent released_at', 'released_at=null'],
    ['RELEASED active canary', "active_canary_authorization_hash=repeat('d',64), active_canary_expires_at=now()+interval '1 hour'"],
    ['mismatched canary fields', "active_canary_authorization_hash=repeat('d',64), active_canary_expires_at=null"],
    ['invalid state', "state='INVALID'"],
    ['zero epoch', 'freeze_epoch=0'],
    ['null epoch', 'freeze_epoch=null'],
  ];

  await db.query('begin');
  try {
    await db.query('set local session_replication_role = replica');
    for (let i = 0; i < rejectedWrites.length; i += 1) {
      const [label, assignments] = rejectedWrites[i];
      await db.query(`savepoint malformed_constraint_${i}`);
      let rejected = false;
      try {
        await db.query(`update public.rc1_operation_freeze_state set ${releaseBase}`);
        await db.query(`update public.rc1_operation_freeze_state set ${assignments}`);
      } catch {
        rejected = true;
      }
      await db.query(`rollback to savepoint malformed_constraint_${i}`);
      assert(rejected, `table constraints must reject ${label}`);
    }
  } finally {
    await db.query('rollback');
  }

  async function expectFunctionStopAtSavepoint(label, sql, expected) {
    const savepoint = `malformed_function_${Math.random().toString(16).slice(2)}`;
    await db.query(`savepoint ${savepoint}`);
    let stopped = false;
    try {
      await db.query(sql);
    } catch (error) {
      stopped = true;
      assert(
        String(error?.message ?? error).includes(expected),
        `${label} stopped for the wrong reason: ${String(error?.message ?? error)}`,
      );
    }
    await db.query(`rollback to savepoint ${savepoint}`);
    assert(stopped, `${label} must fail closed`);
  }

  await db.query('begin');
  try {
    await db.query('set local session_replication_role = replica');
    await db.query(`
      alter table public.rc1_operation_freeze_state
        drop constraint rc1_operation_freeze_state_release_shape,
        drop constraint rc1_operation_freeze_state_canary_shape,
        drop constraint rc1_operation_freeze_state_state_check,
        drop constraint rc1_operation_freeze_state_freeze_epoch_check,
        alter column state drop not null,
        alter column freeze_epoch drop not null
    `);

    const malformedRows = [
      ['null released_by_fingerprint', 'released_by_fingerprint=null'],
      ['null release_reason_fingerprint', 'release_reason_fingerprint=null'],
      ['null release_evidence_fingerprint', 'release_evidence_fingerprint=null'],
      ['malformed release evidence fingerprint', "release_evidence_fingerprint='malformed'"],
      ['all-zero release evidence fingerprint', "release_evidence_fingerprint=repeat('0',64)"],
      ['inconsistent released_at', 'released_at=null'],
      ['FROZEN inconsistent release fields', "state='FROZEN'"],
      ['mismatched canary hash/expiry', "state='FROZEN', released_at=null, released_by_fingerprint=null, release_reason_fingerprint=null, release_evidence_fingerprint=null, active_canary_authorization_hash=repeat('d',64), active_canary_expires_at=null"],
      ['invalid state', "state='INVALID'"],
      ['missing state', 'state=null'],
      ['zero epoch', 'freeze_epoch=0'],
      ['null epoch', 'freeze_epoch=null'],
    ];
    for (const [label, assignments] of malformedRows) {
      await db.query(`update public.rc1_operation_freeze_state set ${releaseBase}`);
      await db.query(`update public.rc1_operation_freeze_state set ${assignments}`);
      await expectFunctionStopAtSavepoint(
        `${label} status`,
        'select public.rc1_freeze_status()',
        'rc1_operation_frozen:freeze_row_malformed',
      );
      await expectFunctionStopAtSavepoint(
        `${label} operation-open guard`,
        "select public.rc1_require_operation_open('order_create')",
        'rc1_operation_frozen:',
      );
    }

    await db.query('delete from public.rc1_operation_freeze_state');
    await expectFunctionStopAtSavepoint(
      'missing row status',
      'select public.rc1_freeze_status()',
      'rc1_operation_frozen:freeze_row_cardinality',
    );
    await expectFunctionStopAtSavepoint(
      'missing row operation-open guard',
      "select public.rc1_require_operation_open('order_create')",
      'rc1_operation_frozen:',
    );
  } finally {
    await db.query('rollback');
  }

  const restoredConstraints = await query(`
    select conname, pg_get_constraintdef(oid, true) as definition
    from pg_constraint
    where conrelid = 'public.rc1_operation_freeze_state'::regclass
    order by conname
  `);
  const restoredNotNull = await query(`
    select attname, attnotnull
    from pg_attribute
    where attrelid = 'public.rc1_operation_freeze_state'::regclass
      and attname in ('state', 'freeze_epoch')
    order by attname
  `);
  assert(
    JSON.stringify(restoredConstraints) === JSON.stringify(constraintSnapshot),
    'malformed-state tests must restore the exact table constraints',
  );
  assert(
    JSON.stringify(restoredNotNull) === JSON.stringify(notNullSnapshot),
    'malformed-state tests must restore exact NOT NULL enforcement',
  );
  console.log(`PASS malformed RC1 state: ${rejectedWrites.length} constraint cases and 13 defence-in-depth cases`);
}

async function proveBootstrapEnforcement() {
  const [status] = await query('select public.rc1_freeze_status() as value');
  assert(status.value.state === 'frozen', 'bootstrap state must start FROZEN');
  assert(Number(status.value.freeze_epoch) === 1, 'bootstrap freeze epoch must start at 1');
  assert(status.value.canary_authorization_active === false, 'bootstrap must not activate canary authorization');

  await expectQueryStop(
    'unknown operation surface',
    () => db.query("select public.rc1_require_operation_open('not_authorised')"),
    'rc1_operation_frozen:unknown_surface',
  );
  await expectQueryStop(
    'direct state write',
    () => db.query("update public.rc1_operation_freeze_state set updated_at=now()"),
    'rc1_freeze_control:direct_state_write_forbidden',
  );
  await expectQueryStop(
    'direct report/enquiry request write',
    () => db.query("insert into public.data_requests(request_type) values ('detailed_report')"),
    'rc1_operation_frozen:order_create',
  );
  await expectQueryStop(
    'direct legacy delivery write',
    () => db.query("insert into public.manual_report_delivery_attempts(request_key) values ('rc1-frozen-probe')"),
    'rc1_operation_frozen:delivery',
  );

  await db.query('grant update on table public.orders to service_role');
  await db.query('set role service_role');
  try {
    await expectQueryStop(
      'service_role guard invocation',
      () => db.query("select public.rc1_require_operation_open('order_create')"),
      'rc1_operation_frozen:order_create',
    );
    await expectQueryStop(
      'service_role direct business update',
      () => db.query('update public.orders set updated_at=now()'),
      'rc1_operation_frozen:order_create',
    );
  } finally {
    await db.query('reset role');
    await db.query('revoke update on table public.orders from service_role');
  }

  const claims = JSON.stringify({
    role: 'authenticated',
    aal: 'aal1',
    exp: Math.floor(Date.now() / 1000) + 3600,
    session_id: '00000000-0000-0000-0000-00000000a002',
  });
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", ['00000000-0000-0000-0000-00000000a001']);
  await db.query("select set_config('request.jwt.claims',$1,false)", [claims]);
  await expectQueryStop(
    'AAL1 release',
    () => db.query("select public.rc1_release_freeze('Synthetic controller release evidence',repeat('a',64),1)"),
    'rc1_freeze_control:aal2_required',
  );

  await db.query('begin');
  try {
    const aal2Claims = JSON.stringify({ ...JSON.parse(claims), aal: 'aal2' });
    await db.query("select set_config('request.jwt.claims',$1,true)", [aal2Claims]);
    const released = await query("select public.rc1_release_freeze('Synthetic controller release evidence',repeat('a',64),1) as value");
    assert(released[0].value.state === 'released', 'AAL2 exact-epoch release must succeed transactionally');
    const activated = await query("select public.rc1_activate_freeze('Synthetic controller reactivation evidence') as value");
    assert(activated[0].value.state === 'frozen', 'AAL2 activation must restore FROZEN transactionally');
  } finally {
    await db.query('rollback');
  }

  const [afterRollback] = await query('select public.rc1_freeze_status() as value');
  assert(afterRollback.value.state === 'frozen' && Number(afterRollback.value.freeze_epoch) === 1,
    'control-RPC proof must leave the bootstrap state unchanged');
}

async function proveFrozenCertificationControlPlane() {
  const adminId = '00000000-0000-0000-0000-00000000a001';
  const sessionId = '00000000-0000-0000-0000-00000000a002';
  const secretA = 'rc1-synthetic-webhook-certification-secret-a';
  const secretB = 'rc1-synthetic-lookup-certification-secret-b';
  const claimsFor = (aal) => JSON.stringify({
    role: 'authenticated',
    aal,
    exp: Math.floor(Date.now() / 1000) + 3600,
    session_id: sessionId,
  });
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [adminId]);
  await db.query("select set_config('request.jwt.claims',$1,false)", [claimsFor('aal2')]);

  const countsBefore = await baselineCounts();
  const [stateBefore] = await query('select public.rc1_freeze_status() as value');

  await db.query('set role authenticated');
  try {
    await expectQueryStop(
      'ordinary runtime-secret RPC while frozen',
      () => db.query(
        "select public.set_phase14_runtime_secret('provider_webhook_db_hmac',$1,'Synthetic ordinary route attempt')",
        [secretA],
      ),
      'rc1_operation_frozen:activation_control',
    );
    await expectQueryStop(
      'AAL2 certification wrong key',
      () => db.query(
        "select public.rc1_provision_certification_runtime_secret('wrong_key',$1,'Synthetic invalid key attempt',1)",
        [secretA],
      ),
      'rc1_certification_secret:key_not_allowed',
    );
    await expectQueryStop(
      'AAL2 certification wrong epoch',
      () => db.query(
        "select public.rc1_provision_certification_runtime_secret('provider_webhook_db_hmac',$1,'Synthetic wrong epoch attempt',2)",
        [secretA],
      ),
      'rc1_certification_secret:freeze_epoch_mismatch',
    );
    await expectQueryStop(
      'AAL2 certification missing reason',
      () => db.query(
        "select public.rc1_provision_certification_runtime_secret('provider_webhook_db_hmac',$1,'',1)",
        [secretA],
      ),
      'rc1_certification_secret:meaningful_reason_required',
    );

    await db.query("select set_config('request.jwt.claims',$1,false)", [claimsFor('aal1')]);
    await expectQueryStop(
      'AAL1 certification',
      () => db.query(
        "select public.rc1_provision_certification_runtime_secret('provider_webhook_db_hmac',$1,'Synthetic AAL1 attempt reason',1)",
        [secretA],
      ),
      'rc1_freeze_control:aal2_required',
    );
    await db.query("select set_config('request.jwt.claims',$1,false)", [claimsFor('aal2')]);
  } finally {
    await db.query('reset role');
  }

  await db.query("update public.admin_profiles set role='reviewer' where id=$1", [adminId]);
  await db.query('set role authenticated');
  try {
    await expectQueryStop(
      'reviewer certification',
      () => db.query(
        "select public.rc1_provision_certification_runtime_secret('provider_webhook_db_hmac',$1,'Synthetic reviewer attempt reason',1)",
        [secretA],
      ),
      'rc1_freeze_control:platform_admin_required',
    );
  } finally {
    await db.query('reset role');
    await db.query("update public.admin_profiles set role='platform_admin' where id=$1", [adminId]);
  }

  for (const role of ['anon', 'service_role']) {
    await db.query(`set role ${role}`);
    try {
      await expectQueryStop(
        `${role} certification execution`,
        () => db.query(
          "select public.rc1_provision_certification_runtime_secret('provider_webhook_db_hmac',$1,'Synthetic prohibited role attempt',1)",
          [secretA],
        ),
        'permission denied',
      );
    } finally {
      await db.query('reset role');
    }
  }

  await db.query('set role authenticated');
  try {
    const [first] = await query(`
      select public.rc1_provision_certification_runtime_secret(
        'provider_webhook_db_hmac',$1,'Synthetic RC1 webhook certification secret',1
      ) as value
    `, [secretA]);
    assert(
      JSON.stringify(Object.keys(first.value).sort())
        === JSON.stringify(['fingerprint', 'rotated_at', 'secret_key']),
      'certification RPC must return only the safe three-field manifest',
    );
    assert(first.value.secret_key === 'provider_webhook_db_hmac', 'first approved secret must provision');
    assert(JSON.stringify(first.value).includes(secretA) === false, 'secret value must never be returned');

    await expectQueryStop(
      'identical HMAC values',
      () => db.query(`
        select public.rc1_provision_certification_runtime_secret(
          'provider_lookup_db_hmac',$1,'Synthetic duplicate certification secret',1
        )
      `, [secretA]),
      'rc1_certification_secret:values_must_be_distinct',
    );

    const [second] = await query(`
      select public.rc1_provision_certification_runtime_secret(
        'provider_lookup_db_hmac',$1,'Synthetic RC1 lookup certification secret',1
      ) as value
    `, [secretB]);
    assert(second.value.secret_key === 'provider_lookup_db_hmac', 'second distinct secret must provision');
    assert(first.value.fingerprint !== second.value.fingerprint, 'secret fingerprints must be distinct');
  } finally {
    await db.query('reset role');
  }

  await expectQueryStop(
    'direct runtime_secrets DML',
    () => db.query(`
      update phase14_private.runtime_secrets
      set rotated_at=pg_catalog.clock_timestamp()
      where secret_key='provider_webhook_db_hmac'
    `),
    'rc1_operation_frozen:activation_control',
  );
  await db.query("select set_config('rc1.certification_secret_write_marker','client-forged-marker',false)");
  await expectQueryStop(
    'client-forged control marker',
    () => db.query(`
      update phase14_private.runtime_secrets
      set rotated_at=pg_catalog.clock_timestamp()
      where secret_key='provider_webhook_db_hmac'
    `),
    'rc1_operation_frozen:activation_control',
  );
  await expectQueryStop(
    'control marker against another relation',
    () => db.query("update public.orders set updated_at=updated_at where id='00000000-0000-0000-0000-00000000e001'"),
    'rc1_operation_frozen:order_create',
  );
  await db.query("select set_config('rc1.certification_secret_write_marker','',false)");

  const [stateAfter] = await query('select public.rc1_freeze_status() as value');
  assert(
    stateAfter.value.state === 'frozen'
      && Number(stateAfter.value.freeze_epoch) === 1
      && stateAfter.value.canary_authorization_active === false,
    'certification provisioning must leave the freeze state and epoch unchanged',
  );
  assert(
    JSON.stringify(countsBefore) === JSON.stringify(await baselineCounts()),
    'certification provisioning must not change any business aggregate or Storage object',
  );
  const [evidence] = await query(`
    select
      (select count(*) from phase14_private.runtime_secrets
       where secret_key in ('provider_webhook_db_hmac','provider_lookup_db_hmac')) as secret_count,
      (select count(distinct encode(extensions.digest(convert_to(secret_value,'UTF8'),'sha256'),'hex'))
       from phase14_private.runtime_secrets
       where secret_key in ('provider_webhook_db_hmac','provider_lookup_db_hmac')) as fingerprint_count,
      (select count(*) from public.rc1_operation_freeze_audit
       where event_type='CERTIFICATION_SECRET_PROVISIONED' and freeze_epoch=1) as audit_count,
      (select count(*) from public.rc1_certification_secret_write_tokens) as token_count
  `);
  assert(Number(evidence.secret_count) === 2, 'exactly two approved secret names must exist');
  assert(Number(evidence.fingerprint_count) === 2, 'their fingerprints must be non-null and distinct');
  assert(Number(evidence.audit_count) === 2, 'each certification write must create RC1 audit evidence');
  assert(Number(evidence.token_count) === 0, 'one-use write tokens must be consumed');
  passResult(runGate('rc1-production-post-provisioning-evidence.sql', {
    rc1_expected_freeze_epoch: '1',
    rc1_expected_business_counts_json: JSON.stringify(countsBefore),
  }), 'post-provisioning read-only evidence');

  await db.query('begin');
  try {
    await db.query("select set_config('request.jwt.claims',$1,true)", [claimsFor('aal2')]);
    await db.query('set local role authenticated');
    const [released] = await query(
      "select public.rc1_release_freeze('Synthetic two-layer release control',repeat('e',64),1) as value",
    );
    assert(released.value.state === 'released', 'exact-epoch release control must release the database');
    await db.query('reset role');
    await db.query(
      "update public.orders set updated_at=updated_at where id='00000000-0000-0000-0000-00000000e001'",
    );
    await db.query('set local role authenticated');
    const [reactivated] = await query(
      "select public.rc1_activate_freeze('Synthetic two-layer reactivation control') as value",
    );
    assert(reactivated.value.state === 'frozen', 'reactivation control must restore the database freeze');
    await db.query('reset role');
    await expectQueryStop(
      'business mutation after reactivation',
      () => db.query(
        "update public.orders set updated_at=updated_at where id='00000000-0000-0000-0000-00000000e001'",
      ),
      'rc1_operation_frozen:order_create',
    );
  } finally {
    await db.query('rollback');
  }
  assert(
    JSON.stringify((await query('select public.rc1_freeze_status() as value'))[0].value)
      === JSON.stringify(stateBefore.value),
    'transactional release/reactivation proof must restore the original frozen status',
  );
  console.log('PASS frozen certification control plane: AAL2-only, one-use, and no business-state widening');
}

async function proveNearRealTimeAutomaticFulfilment() {
  const adminId = '00000000-0000-0000-0000-00000000a001';
  const claims = JSON.stringify({
    role: 'authenticated',
    aal: 'aal2',
    exp: Math.floor(Date.now() / 1000) + 3600,
    session_id: '00000000-0000-0000-0000-00000000a002',
  });
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [adminId]);
  await db.query("select set_config('request.jwt.claims',$1,false)", [claims]);
  const released = await query(
    "select public.rc1_release_freeze('Synthetic automatic fulfilment verification',repeat('f',64),1) as value",
  );
  assert(released[0].value.state === 'released', 'synthetic automatic-fulfilment tests require an audited local release');

  const [method] = await query("select id from public.methodology_versions where status='active' order by created_at desc limit 1");
  const [product] = await query("select id from public.products where product_code='essential_self_assessment' and active limit 1");
  const [template] = await query("select id from public.report_templates where report_type='essential_self_assessment' and status='active' order by version_number desc limit 1");
  assert(method && product && template, 'automatic-fulfilment synthetic seed dependencies must exist');

  let sequence = 0;
  async function seedPaidAttempt(options = {}) {
    sequence += 1;
    const suffix = String(sequence).padStart(2, '0');
    const organisationId = crypto.randomUUID();
    const assessmentId = crypto.randomUUID();
    const scoreId = crypto.randomUUID();
    const orderId = crypto.randomUUID();
    const orderReference = `RC1-AUTO-${suffix}`;
    const recipient = options.recipient === undefined
      ? `rc1-auto-${suffix}@invalid.test`
      : options.recipient;
    await db.query(
      "insert into public.organisations(id,legal_name,country) values ($1,$2,'South Africa')",
      [organisationId, `RC1 Automatic Synthetic ${suffix}`],
    );
    await db.query(
      "insert into public.assessments(id,assessment_reference,organisation_id,methodology_version_id,status,submitted_at) values ($1,$2,$3,$4,'scored',now())",
      [assessmentId, `RC1-AUTO-ASSESSMENT-${suffix}`, organisationId, method.id],
    );
    await db.query(
      "insert into public.score_runs(id,assessment_id,methodology_version_id,run_number,run_type,status,overall_score,calculated_maturity,final_maturity,exposure_score,exposure_band,coverage_pct,input_hash,locked_at) values ($1,$2,$3,1,'test_fixture','completed',50,'Reactive','Reactive',50,'Low',100,$4,now())",
      [scoreId, assessmentId, method.id, 'a'.repeat(64)],
    );
    await db.query("update public.assessments set current_score_run_id=$1 where id=$2", [scoreId, assessmentId]);
    await db.query(
      "insert into public.orders(id,order_reference,assessment_id,product_id,status,amount_cents,currency,customer_name,customer_email) values ($1,$2,$3,$4,'awaiting_payment',500000,'ZAR','Synthetic Customer',$5)",
      [orderId, orderReference, assessmentId, product.id, recipient],
    );
    const before = await query(
      'select count(*)::int as n from public.manual_report_generation_attempts where order_id=$1',
      [orderId],
    );
    assert(before[0].n === 0, 'order submission alone creates no fulfilment attempt');
    const idempotencyKey = `rc1-auto-payment-${suffix}`;
    const transitionArgs = [
      orderReference, 'PAID', 'manual_admin', adminId, 500000, 'ZAR', null,
      `manual:${idempotencyKey}`, new Date().toISOString(), 'Synthetic payment verified.',
      'authorised_manual_confirmation', idempotencyKey, crypto.randomUUID(), null,
    ];
    const payment = await query(
      'select public.record_payment_transition($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) as value',
      transitionArgs,
    );
    const attemptId = payment[0].value.fulfilment_attempt_id;
    assert(payment[0].value.fulfilment === 'QUEUED' && attemptId, 'manual payment confirmation returns one queued attempt ID');
    const duplicate = await query(
      'select public.record_payment_transition($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) as value',
      transitionArgs,
    );
    const attemptCount = await query(
      'select count(*)::int as n from public.manual_report_generation_attempts where order_id=$1',
      [orderId],
    );
    assert(duplicate[0].value.duplicate === true && duplicate[0].value.fulfilment_attempt_id === null,
      'duplicate payment confirmation returns no dispatchable attempt');
    assert(attemptCount[0].n === 1, 'duplicate payment confirmation creates no second attempt');
    return {
      organisationId, assessmentId, scoreId, orderId, orderReference,
      recipient, attemptId, paymentCreatedAt: new Date(),
    };
  }

  async function attachVerifiedReport(fixture, options = {}) {
    const reportId = crypto.randomUUID();
    const checksum = (options.checksumCharacter ?? 'b').repeat(64);
    const storagePath = `rc1-automatic/${fixture.orderId}/${reportId}.pdf`;
    await db.query("insert into storage.buckets(id,name,public) values ('generated-reports','generated-reports',false) on conflict (id) do nothing");
    await db.query(
      "insert into storage.objects(id,bucket_id,name,metadata) values ($1,'generated-reports',$2,$3)",
      [crypto.randomUUID(), storagePath, { mimetype: 'application/pdf', sha256: checksum }],
    );
    await db.query("select set_config('phase14.authoritative_transition','worker_rpc',false)");
    await db.query(
      `insert into public.reports(
        id,assessment_id,organisation_id,order_id,score_run_id,template_id,report_type,status,
        report_reference,version_number,storage_bucket,storage_path,checksum,file_name,mime_type,
        file_size_bytes,storage_status,storage_verified_at,generated_at
      ) values ($1,$2,$3,$4,$5,$6,'essential_self_assessment','generated',$7,1,
        'generated-reports',$8,$9,$10,'application/pdf',1024,'VERIFIED',now(),now())`,
      [
        reportId, fixture.assessmentId, fixture.organisationId, fixture.orderId,
        fixture.scoreId, template.id, `RPT-${fixture.orderReference}-V1`, storagePath,
        checksum, `${fixture.orderReference}.pdf`,
      ],
    );
    await db.query(
      `update public.manual_report_generation_attempts
       set status='REPORT_READY',output_report_id=$1,completed_at=now(),
           evidence_checksum=$2,final_validation_json=$3,
           lease_owner=$4,lease_expires_at=now()+interval '5 minutes'
       where id=$5`,
      [
        reportId,
        options.includeCommercialEvidence === false ? null : 'c'.repeat(64),
        options.includeCommercialEvidence === false ? null : { valid: true, blockingViolations: [] },
        options.leaseOwner ?? 'synthetic-worker',
        fixture.attemptId,
      ],
    );
    return { reportId, checksum, storagePath };
  }

  const primary = await seedPaidAttempt();
  const unrelated = await seedPaidAttempt();
  const correlation = crypto.randomUUID();
  await db.query(
    "select public.record_fulfilment_dispatch_result($1,$2,'started',null,null)",
    [primary.attemptId, correlation],
  );
  await db.query(
    "select public.record_fulfilment_dispatch_result($1,$2,'succeeded',200,null)",
    [primary.attemptId, correlation],
  );
  const exactClaim = await query(
    "select public.claim_exact_fulfilment_job($1,'synthetic-worker',300) as value",
    [primary.attemptId],
  );
  assert(exactClaim[0].value.id === primary.attemptId, 'immediate worker claims the exact intended attempt');
  const [unrelatedState] = await query(
    'select status,lease_owner from public.manual_report_generation_attempts where id=$1',
    [unrelated.attemptId],
  );
  assert(unrelatedState.status === 'REPORT_QUEUED' && unrelatedState.lease_owner === null,
    'exact immediate claim leaves unrelated queued work untouched');

  const primaryReport = await attachVerifiedReport(primary);
  const release = await query(
    "select public.automatic_release_completed_fulfilment($1,$2,'synthetic-worker') as value",
    [primary.attemptId, primaryReport.reportId],
  );
  assert(release[0].value.released === true, 'verified generation automatically releases the exact report');
  const authorizationId = release[0].value.delivery_authorization_id;
  const releaseCounts = await query(
    `select
      (select count(*)::int from public.reports where id=$1 and status='released') as reports,
      (select count(*)::int from public.report_delivery_authorizations where id=$2) as authorizations,
      (select count(*)::int from public.email_events where id=$3) as email_events`,
    [primaryReport.reportId, authorizationId, release[0].value.email_event_id],
  );
  assert(releaseCounts[0].reports === 1 && releaseCounts[0].authorizations === 1 && releaseCounts[0].email_events === 1,
    'automatic release creates exactly one released report, authorization and email event');
  const replay = await query(
    "select public.automatic_release_completed_fulfilment($1,$2,'synthetic-worker') as value",
    [primary.attemptId, primaryReport.reportId],
  );
  assert(replay[0].value.idempotent_replay === true && replay[0].value.delivery_authorization_id === authorizationId,
    'duplicate automatic release reuses the exact authorization');

  const exactDelivery = await query(
    "select public.claim_exact_delivery($1,$2,'synthetic-delivery',300) as value",
    [authorizationId, primary.orderId],
  );
  assert(exactDelivery[0].value.id === authorizationId, 'same invocation claims the exact released delivery');
  const token = await query(
    'select public.issue_customer_report_access_token($1,$2,$3,604800) as value',
    [primary.orderId, primaryReport.reportId, primary.recipient],
  );
  assert(token[0].value.token_id, 'exact delivery issues one secure access token');
  await db.query('select public.mark_delivery_dispatch_started($1,$2)', [
    authorizationId, exactDelivery[0].value.lease_token,
  ]);
  await db.query("select public.finalize_delivery($1,$2,'synthetic-provider-accepted')", [
    authorizationId, exactDelivery[0].value.lease_token,
  ]);
  const duplicateDelivery = await query(
    "select public.claim_exact_delivery($1,$2,'synthetic-duplicate',300) as value",
    [authorizationId, primary.orderId],
  );
  const duplicateCounts = await query(
    `select
      (select count(*)::int from public.customer_report_access_tokens where report_id=$1) as tokens,
      (select count(*)::int from public.report_delivery_authorizations where report_id=$1) as authorizations,
      (select count(*)::int from public.report_delivery_finalizations where report_id=$1) as finalizations`,
    [primaryReport.reportId],
  );
  assert(duplicateDelivery[0].value === null, 'duplicate delivery invocation cannot reclaim a finalized authorization');
  assert(duplicateCounts[0].tokens === 1 && duplicateCounts[0].authorizations === 1 && duplicateCounts[0].finalizations === 1,
    'duplicate invocation creates no second report token, authorization or finalization');

  const missingRecipient = await seedPaidAttempt({ recipient: null });
  await query("select public.claim_exact_fulfilment_job($1,'missing-recipient-worker',300)", [missingRecipient.attemptId]);
  const missingReport = await attachVerifiedReport(missingRecipient, { leaseOwner: 'missing-recipient-worker' });
  const missingRelease = await query(
    "select public.automatic_release_completed_fulfilment($1,$2,'missing-recipient-worker') as value",
    [missingRecipient.attemptId, missingReport.reportId],
  );
  assert(missingRelease[0].value.released === false && missingRelease[0].value.category === 'recipient_required',
    'missing recipient is held for human exception management');
  const missingSendCount = await query(
    'select count(*)::int as n from public.report_delivery_authorizations where order_id=$1',
    [missingRecipient.orderId],
  );
  assert(missingSendCount[0].n === 0, 'missing recipient creates no customer delivery authorization');

  const commercialFailure = await seedPaidAttempt();
  await query("select public.claim_exact_fulfilment_job($1,'commercial-worker',300)", [commercialFailure.attemptId]);
  const commercialReport = await attachVerifiedReport(commercialFailure, {
    leaseOwner: 'commercial-worker', includeCommercialEvidence: false,
  });
  const commercialRelease = await query(
    "select public.automatic_release_completed_fulfilment($1,$2,'commercial-worker') as value",
    [commercialFailure.attemptId, commercialReport.reportId],
  );
  assert(commercialRelease[0].value.released === false
    && commercialRelease[0].value.category === 'commercial_quality_evidence_missing',
  'commercial-quality failure prevents automatic release and delivery');

  const storageFailure = await seedPaidAttempt();
  await query("select public.claim_exact_fulfilment_job($1,'storage-worker',300)", [storageFailure.attemptId]);
  const storageFailureReport = await attachVerifiedReport(storageFailure, { leaseOwner: 'storage-worker' });
  await db.query("update public.reports set storage_status='FAILED' where id=$1", [storageFailureReport.reportId]);
  const storageRelease = await query(
    "select public.automatic_release_completed_fulfilment($1,$2,'storage-worker') as value",
    [storageFailure.attemptId, storageFailureReport.reportId],
  );
  assert(storageRelease[0].value.released === false
    && storageRelease[0].value.category === 'pdf_storage_verification_required',
  'PDF or Storage verification failure prevents automatic release and delivery');

  const providerFailure = await seedPaidAttempt();
  await query("select public.claim_exact_fulfilment_job($1,'provider-generation-worker',300)", [providerFailure.attemptId]);
  const providerFailureReport = await attachVerifiedReport(providerFailure, { leaseOwner: 'provider-generation-worker' });
  const providerRelease = await query(
    "select public.automatic_release_completed_fulfilment($1,$2,'provider-generation-worker') as value",
    [providerFailure.attemptId, providerFailureReport.reportId],
  );
  const providerAuthorization = await query(
    "select public.claim_exact_delivery($1,$2,'provider-delivery-worker',300) as value",
    [providerRelease[0].value.delivery_authorization_id, providerFailure.orderId],
  );
  const providerFailed = await query(
    "select public.fail_delivery($1,$2,'provider_send_failed','Synthetic provider failure.', $3) as value",
    [
      providerRelease[0].value.delivery_authorization_id,
      providerAuthorization[0].value.lease_token,
      crypto.randomUUID(),
    ],
  );
  assert(providerFailed[0].value.status === 'retry_scheduled',
    'provider failure enters the existing retry state with backoff');

  const dispatchFailure = await seedPaidAttempt();
  const dispatchFailureCorrelation = crypto.randomUUID();
  await db.query(
    "select public.record_fulfilment_dispatch_result($1,$2,'started',null,null)",
    [dispatchFailure.attemptId, dispatchFailureCorrelation],
  );
  await db.query(
    "select public.record_fulfilment_dispatch_result($1,$2,'failed',null,'worker_dispatch_failed')",
    [dispatchFailure.attemptId, dispatchFailureCorrelation],
  );
  const dispatchExceptionArgs = [
    dispatchFailure.attemptId,
    null,
    'immediate_dispatch',
    'worker_dispatch_failed',
    dispatchFailureCorrelation,
    'Immediate automatic fulfilment did not start. Confirm the queued order state and use the authorised recovery procedure. Do not mark payment again.',
  ];
  const firstDispatchAlert = await query(
    'select public.record_automatic_fulfilment_exception($1,$2,$3,$4,$5,$6) as value',
    dispatchExceptionArgs,
  );
  const duplicateDispatchAlert = await query(
    'select public.record_automatic_fulfilment_exception($1,$2,$3,$4,$5,$6) as value',
    dispatchExceptionArgs,
  );
  const dispatchFailureState = await query(
    `select
      (select status::text from public.orders where id=$1) as order_status,
      (select state from public.payment_automation_records where order_id=$1) as payment_state,
      (select status from public.manual_report_generation_attempts where id=$2) as attempt_status,
      (select lease_owner from public.manual_report_generation_attempts where id=$2) as lease_owner,
      (select output_report_id from public.manual_report_generation_attempts where id=$2) as output_report_id,
      (select count(*)::int from public.phase14_operational_alerts
        where detail_json->>'attempt_id'=$2::text
          and detail_json->>'stage'='immediate_dispatch'
          and category='worker_dispatch_failed') as alerts,
      (select count(*)::int from public.email_events where order_id=$1) as email_events,
      (select count(*)::int from public.reports where order_id=$1) as reports,
      (select count(*)::int from public.report_delivery_authorizations where order_id=$1) as authorizations,
      (select count(*)::int from public.customer_report_access_tokens t
        join public.reports r on r.id=t.report_id where r.order_id=$1) as tokens`,
    [dispatchFailure.orderId, dispatchFailure.attemptId],
  );
  assert(
    firstDispatchAlert[0].value.alert_id === duplicateDispatchAlert[0].value.alert_id
      && dispatchFailureState[0].alerts === 1,
    'same attempt, immediate-dispatch stage and category reuse one operational alert',
  );
  assert(
    dispatchFailureState[0].order_status === 'payment_received'
      && dispatchFailureState[0].payment_state === 'PAID'
      && dispatchFailureState[0].attempt_status === 'REPORT_QUEUED'
      && dispatchFailureState[0].lease_owner === null
      && dispatchFailureState[0].output_report_id === null,
    'dispatch failure preserves PAID payment and the durable eligible queued attempt',
  );
  assert(
    dispatchFailureState[0].email_events === 0
      && dispatchFailureState[0].reports === 0
      && dispatchFailureState[0].authorizations === 0
      && dispatchFailureState[0].tokens === 0,
    'dispatch failure creates no customer email, report, delivery authorization or access token',
  );

  const recoveryClaim = await query(
    "select public.claim_next_fulfilment_job('synthetic-daily-recovery',300) as value",
  );
  assert(recoveryClaim[0].value.id === unrelated.attemptId,
    'daily recovery invocation can claim a stranded eligible queued attempt');

  const timing = await query(
    `select
      extract(epoch from (a.immediate_dispatch_started_at-p.created_at)) as payment_to_dispatch_seconds,
      extract(epoch from (r.generated_at-p.created_at)) as payment_to_report_seconds,
      extract(epoch from (d.finalized_at-p.created_at)) as payment_to_provider_seconds,
      extract(epoch from (d.finalized_at-p.created_at)) as payment_to_delivered_seconds
     from public.payment_transition_events p
     join public.manual_report_generation_attempts a on a.id=$1
     join public.reports r on r.id=$2
     join public.report_delivery_authorizations d on d.id=$3
     where p.order_id=$4 and p.new_state='PAID'
     order by p.created_at desc limit 1`,
    [primary.attemptId, primaryReport.reportId, authorizationId, primary.orderId],
  );
  assert(Number(timing[0].payment_to_dispatch_seconds) <= 10, 'synthetic payment-to-dispatch timing meets 10-second certification target');
  assert(Number(timing[0].payment_to_report_seconds) <= 120, 'synthetic payment-to-report timing meets 2-minute certification target');
  assert(Number(timing[0].payment_to_provider_seconds) <= 180, 'synthetic payment-to-provider timing meets 3-minute certification target');
  assert(Number(timing[0].payment_to_delivered_seconds) <= 180, 'synthetic payment-to-delivered timing meets 3-minute certification target');
  const alertTiming = await query(
    `select extract(epoch from (a.created_at-p.created_at)) as seconds
     from public.phase14_operational_alerts a
     join public.payment_transition_events p on p.order_id=$1 and p.new_state='PAID'
     where a.detail_json->>'attempt_id'=$2
     order by a.created_at desc,p.created_at desc limit 1`,
    [missingRecipient.orderId, missingRecipient.attemptId],
  );
  assert(Number(alertTiming[0].seconds) <= 60, 'synthetic exception evidence meets 1-minute alert target');

  const frozenFixture = await seedPaidAttempt();
  await db.query("select public.rc1_activate_freeze('Synthetic automatic fulfilment freeze verification')");
  await expectQueryStop(
    'frozen dispatch evidence race',
    () => db.query(
      "select public.record_fulfilment_dispatch_result($1,$2,'started',null,null)",
      [frozenFixture.attemptId, crypto.randomUUID()],
    ),
    'rc1_operation_frozen:worker',
  );
  await expectQueryStop(
    'frozen dispatch alert race',
    () => db.query(
      "select public.record_automatic_fulfilment_exception($1,null,'immediate_dispatch','worker_dispatch_failed',$2,$3)",
      [
        frozenFixture.attemptId,
        crypto.randomUUID(),
        'Immediate automatic fulfilment did not start. Confirm the queued order state and use the authorised recovery procedure. Do not mark payment again.',
      ],
    ),
    'rc1_operation_frozen:operational_alert',
  );
  await expectQueryStop(
    'frozen exact worker claim',
    () => db.query("select public.claim_exact_fulfilment_job($1,'frozen-worker',300)", [frozenFixture.attemptId]),
    'rc1_operation_frozen:worker',
  );
  await expectQueryStop(
    'frozen scheduled worker claim',
    () => db.query("select public.claim_next_fulfilment_job('frozen-scheduled-worker',300)"),
    'rc1_operation_frozen:generation',
  );
  const frozenRaceState = await query(
    `select
      (select status::text from public.orders where id=$1) as order_status,
      (select state from public.payment_automation_records where order_id=$1) as payment_state,
      (select status from public.manual_report_generation_attempts where id=$2) as attempt_status,
      (select lease_owner from public.manual_report_generation_attempts where id=$2) as lease_owner,
      (select count(*)::int from public.phase14_operational_alerts
        where detail_json->>'attempt_id'=$2::text) as alerts,
      (select count(*)::int from public.email_events where order_id=$1) as email_events,
      (select count(*)::int from public.reports where order_id=$1) as reports,
      (select count(*)::int from public.report_delivery_authorizations where order_id=$1) as authorizations`,
    [frozenFixture.orderId, frozenFixture.attemptId],
  );
  assert(
    frozenRaceState[0].order_status === 'payment_received'
      && frozenRaceState[0].payment_state === 'PAID'
      && frozenRaceState[0].attempt_status === 'REPORT_QUEUED'
      && frozenRaceState[0].lease_owner === null,
    'freeze race preserves PAID payment and the durable queued attempt',
  );
  assert(
    frozenRaceState[0].alerts === 0
      && frozenRaceState[0].email_events === 0
      && frozenRaceState[0].reports === 0
      && frozenRaceState[0].authorizations === 0,
    'freeze race permits no alert, customer email, generation or delivery mutation while frozen',
  );

  console.log('PASS RC1 near-real-time automatic fulfilment: atomic payment queue, exact claims, fail-closed release, one authorization/event/token/finalization, deduplicated immediate-dispatch alerts, exception hold, delayed recovery, freeze-race preservation and synthetic timing targets.');
}

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
    rc1_expected_application_freeze_mode: 'frozen',
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
    'RC1_APPROVED_EMAIL_STATUS_FINGERPRINT', 'RC1_EXPECTED_APPLICATION_FREEZE_MODE',
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
  await applyMigration(pending[0]);
  await proveMalformedStateFailClosed();
  await proveBootstrapEnforcement();
  for (const name of pending.slice(1)) await applyMigration(name);
  assert(
    (await protectedStateFingerprint()) === protectedState,
    'bootstrap plus ten subsequent migrations must preserve protected state',
  );
  const postRpcJson = await jsonRpcFingerprints(postflightRpc);
  const freezeFingerprints = await freezeObjectFingerprints();
  const approvedFreeze = manifest.freeze_bootstrap;
  assert(
    canonicalJson(JSON.parse(freezeFingerprints.functions))
      === canonicalJson(approvedFreeze.function_fingerprints),
    `freeze function fingerprints must match the fixed manifest; actual=${freezeFingerprints.functions}; tables=${freezeFingerprints.tables}`,
  );
  assert(
    canonicalJson(JSON.parse(freezeFingerprints.tables))
      === canonicalJson(approvedFreeze.table_semantic_contract.postflight_postgres_jsonb_sha256),
    `freeze table semantics must match the fixed manifest; actual=${freezeFingerprints.tables}`,
  );
  assert(
    canonicalJson(JSON.parse(freezeFingerprints.triggers))
      === canonicalJson(approvedFreeze.enforcement_trigger_fingerprints),
    'freeze trigger fingerprints must match the fixed manifest',
  );
  postVars = {
    rc1_cutover_started_at: cutoverStartedAt,
    rc1_preflight_newest_version: '20260721150808',
    rc1_preflight_protected_state_fingerprint: protectedState,
    rc1_preflight_baseline_counts_json: baselineCountsJson,
    rc1_approved_postflight_rpc_fingerprints_json: postRpcJson,
    rc1_expected_application_freeze_mode: 'frozen',
    rc1_approved_freeze_function_fingerprints_json: JSON.stringify(approvedFreeze.function_fingerprints),
    rc1_approved_freeze_table_semantic_hashes_json: JSON.stringify(
      approvedFreeze.table_semantic_contract.postflight_postgres_jsonb_sha256,
    ),
    rc1_approved_freeze_trigger_fingerprints_json: JSON.stringify(approvedFreeze.enforcement_trigger_fingerprints)
  };
  passResult(await runPost(postVars), 'baseline postflight');
  await proveHealthySyntheticCertificationCleanup(adminId);

  const [freezeStateOriginal] = await query('select * from public.rc1_operation_freeze_state where singleton');
  const restoreFreezeState = async () => {
    await db.query(`
      insert into public.rc1_operation_freeze_state(
        singleton,state,freeze_epoch,activated_at,activated_by_fingerprint,
        activation_reason_fingerprint,released_at,released_by_fingerprint,
        release_reason_fingerprint,release_evidence_fingerprint,
        active_canary_authorization_hash,active_canary_expires_at,updated_at
      ) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
    `, [
      freezeStateOriginal.singleton, freezeStateOriginal.state, freezeStateOriginal.freeze_epoch,
      freezeStateOriginal.activated_at, freezeStateOriginal.activated_by_fingerprint,
      freezeStateOriginal.activation_reason_fingerprint, freezeStateOriginal.released_at,
      freezeStateOriginal.released_by_fingerprint, freezeStateOriginal.release_reason_fingerprint,
      freezeStateOriginal.release_evidence_fingerprint,
      freezeStateOriginal.active_canary_authorization_hash,
      freezeStateOriginal.active_canary_expires_at, freezeStateOriginal.updated_at,
    ]);
  };
  await expectPostStop(
    'missing freeze row',
    async () => { await db.query('delete from public.rc1_operation_freeze_state'); },
    restoreFreezeState,
    'freeze_state_result|STOP',
  );
  await expectPostStop(
    'freeze state unexpectedly released',
    async () => {
      await db.query(`
        update public.rc1_operation_freeze_state set
          state='RELEASED',
          released_at=now(),
          released_by_fingerprint=repeat('a',64),
          release_reason_fingerprint=repeat('b',64),
          release_evidence_fingerprint=repeat('c',64),
          updated_at=now()
      `);
    },
    async () => {
      await db.query('delete from public.rc1_operation_freeze_state');
      await restoreFreezeState();
    },
    'freeze_state_result|STOP',
  );
  await expectPostStop(
    'unsafe freeze-table grant',
    async () => { await db.query('grant update on public.rc1_operation_freeze_state to service_role'); },
    async () => { await db.query('revoke update on public.rc1_operation_freeze_state from service_role'); },
    'freeze_rls_grant_result|STOP',
  );
  await expectPostStop(
    'changed freeze-table semantics',
    async () => {
      await db.query(
        'alter table public.rc1_operation_freeze_state add column rc1_disposable_semantic_probe text',
      );
    },
    async () => {
      await db.query(
        'alter table public.rc1_operation_freeze_state drop column rc1_disposable_semantic_probe',
      );
    },
    'freeze_table_semantic_result|STOP',
  );
  await expectPostStop(
    'missing enforcement trigger',
    async () => { await db.query('drop trigger trg_rc1_operation_freeze on public.orders'); },
    async () => {
      await db.query('create trigger trg_rc1_operation_freeze before insert or update or delete on public.orders for each row execute function public.rc1_guard_authoritative_mutation()');
    },
    'freeze_trigger_fingerprint_result|STOP',
  );
  await expectPostStop(
    'disabled enforcement trigger',
    async () => { await db.query('alter table public.reports disable trigger trg_rc1_operation_freeze'); },
    async () => { await db.query('alter table public.reports enable trigger trg_rc1_operation_freeze'); },
    'freeze_trigger_fingerprint_result|STOP',
  );
  const requireOpenDefinition = (await query(
    "select pg_get_functiondef('public.rc1_require_operation_open(text)'::regprocedure) as value",
  ))[0].value;
  await expectPostStop(
    'service_role bypass',
    async () => {
      await db.query(`
        create or replace function public.rc1_require_operation_open(surface text)
        returns void language plpgsql stable security definer set search_path=''
        as $$ begin return; end $$
      `);
    },
    async () => { await db.query(requireOpenDefinition); },
    'freeze_function_fingerprint_result|STOP',
  );
  const knownSurfaceDefinition = (await query(
    "select pg_get_functiondef('public.rc1_is_known_operation_surface(text)'::regprocedure) as value",
  ))[0].value;
  await expectPostStop(
    'unknown surface allowed',
    async () => {
      await db.query(`
        create or replace function public.rc1_is_known_operation_surface(p_surface text)
        returns boolean language sql immutable security definer set search_path=''
        as $$ select true $$
      `);
    },
    async () => { await db.query(knownSurfaceDefinition); },
    'freeze_function_fingerprint_result|STOP',
  );
  await expectPostStop(
    'application and database freeze disagreement',
    async () => {},
    async () => {},
    'application_database_freeze_agreement_result|STOP',
    { rc1_expected_application_freeze_mode: 'released' },
  );

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

  await proveFrozenCertificationControlPlane();
  await proveNearRealTimeAutomaticFulfilment();
  console.log('RC1 preflight/postflight disposable tests passed, including all required defect STOP cases.');
} finally {
  await db.end().catch(() => {});
  await postgres.stop().catch(() => {});
  fs.rmSync(dataDir, { recursive: true, force: true });
}
