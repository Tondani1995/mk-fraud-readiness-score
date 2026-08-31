/**
 * Focused certification for the audited V1.2 stalled-lead control setter.
 *
 * This suite replays the committed migration chain in disposable Postgres, then exercises the
 * real SECURITY DEFINER function through the service_role grant. It never connects to Supabase,
 * Vercel or any other live environment.
 */

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const migrationName = '20260831173230_v12_adaptive_stalled_lead_controls_setter.sql';
const schedulerMigrationName = '20260831181553_v12_stalled_lead_supabase_scheduler.sql';
const migrationPath = path.join(root, 'supabase/migrations', migrationName);
const migration = fs.readFileSync(migrationPath, 'utf8');
const schedulerMigration = fs.readFileSync(
  path.join(root, 'supabase/migrations', schedulerMigrationName),
  'utf8',
);
const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
const stalledRoute = fs.readFileSync(
  path.join(root, 'src/app/score/api/internal/adaptive-stalled-leads/route.ts'),
  'utf8',
);
const notificationSource = fs.readFileSync(
  path.join(root, 'src/lib/notifications/internal-assessment-notifications.ts'),
  'utf8',
);

function check(condition, label) {
  assert.ok(condition, label);
  console.log(`  ok - ${label}`);
}

check(/security definer/i.test(migration), 'setter is SECURITY DEFINER');
check(/set search_path\s*=\s*''/i.test(migration), 'setter pins an empty search_path');
check(migration.includes("v12_adaptive_stalled_lead_controls"), 'setter fixes the setting key internally');
check(!/p_setting_key/i.test(migration), 'setter exposes no caller-supplied setting key');
check(/p_enabled\s+boolean/i.test(migration), 'setter accepts the required enabled argument');
check(/p_inactivity_hours\s+integer/i.test(migration), 'setter uses an integer inactivity-hours argument');
check(/p_inactivity_hours\s*<\s*1/i.test(migration) && /p_inactivity_hours\s*>\s*168/i.test(migration), 'setter enforces the 1..168 hour range');
check(/meaningful_reason_required/i.test(migration), 'setter rejects a blank or non-meaningful reason');
check(/for update/i.test(migration), 'setter locks the current row before validation/update');
check(/unexpected_current_shape/i.test(migration), 'setter fails closed on a missing/invalid current shape');
check(/insert into public\.audit_logs/i.test(migration), 'setter records the control change in audit_logs');
check(/v12_stalled_lead_controls_changed/i.test(migration), 'setter uses the required audit action');
check(/revoke all on function public\.set_v12_adaptive_stalled_lead_controls/i.test(migration), 'setter execution is explicitly revoked before the grant');
check(/grant execute on function public\.set_v12_adaptive_stalled_lead_controls[\s\S]*to service_role/i.test(migration), 'setter is service_role-only');
check(!Array.isArray(vercel.crons) || vercel.crons.length === 0, 'Vercel has no stalled-lead cron');
check(
  schedulerMigration.includes('create extension if not exists pg_cron')
    && schedulerMigration.includes('create extension if not exists pg_net'),
  'scheduler migration enables the Supabase pg_cron and pg_net extensions',
);
check(schedulerMigration.includes("cron.schedule(\n    'v12-stalled-lead-monitor'"), 'scheduler migration creates the fixed job name');
check(schedulerMigration.includes("'0 * * * *'"), 'scheduler migration uses the hourly schedule');
check(schedulerMigration.includes("name = 'v12_stalled_lead_cron_secret'"), 'scheduler resolves the bearer from the fixed Vault secret name');
check(schedulerMigration.includes('select net.http_get('), 'scheduler invokes the existing pg_net HTTP function');
check(/revoke all on schema cron/i.test(schedulerMigration) && /revoke all on schema net/i.test(schedulerMigration), 'scheduler keeps Cron and pg_net schemas private');
check(/revoke all on function %s from public, anon, authenticated/i.test(schedulerMigration), 'scheduler revokes managed-extension function execution from public roles');
check(!schedulerMigration.includes('scheduler-test-secret-never-in-command'), 'scheduler migration contains no plaintext test secret');
check(stalledRoute.includes('process.env.MK_STALLED_LEAD_CRON_SECRET'), 'stalled-lead route uses the dedicated secret');
check(!stalledRoute.includes('process.env.CRON_SECRET'), 'stalled-lead route does not use the shared CRON_SECRET');
check(
  notificationSource.includes('return `assessment_stalled:${assessmentId}:last_activity:${lastActivityAt}`'),
  'existing stalled-lead episode identity remains threshold-independent',
);
check(
  !notificationSource.includes('assessment_stalled:${assessmentId}:threshold:'),
  'threshold changes do not re-enter the episode key',
);

let EmbeddedPostgres;
let pg;
try {
  ({ default: EmbeddedPostgres } = await import('embedded-postgres'));
  pg = await import('pg');
} catch {
  console.log('SKIPPED: embedded-postgres/pg not installed.');
  process.exit(0);
}

const migrationFiles = fs.readdirSync(path.join(root, 'supabase/migrations'))
  .filter((name) => name.endsWith('.sql'))
  .sort();
assert.ok(migrationFiles.includes(migrationName), 'setter migration is in the committed migration inventory');

const port = 57000 + ((process.pid + 173) % 300);
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'v12-stalled-lead-controls-pg-'));
const postgres = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'postgres',
  password: 'testpass',
  port,
  persistent: false,
});
const db = new pg.default.Client({
  host: '127.0.0.1',
  port,
  user: 'postgres',
  password: 'testpass',
  database: 'testdb',
});

async function inServiceRole(fn) {
  await db.query('begin');
  try {
    await db.query('set local role service_role');
    const result = await fn();
    await db.query('commit');
    return result;
  } catch (error) {
    await db.query('rollback');
    throw error;
  }
}

async function setter(enabled, hours, reason) {
  return inServiceRole(() => db.query(
    `select public.set_v12_adaptive_stalled_lead_controls($1::boolean, $2::integer, $3::text) as result`,
    [enabled, hours, reason],
  ));
}

async function expectFailure(label, operation, pattern) {
  await assert.rejects(operation, (error) => {
    if (pattern) assert.match(String(error?.message ?? error), pattern, `${label}: wrong failure`);
    return true;
  }, label);
  console.log(`  ok - ${label}`);
}

function loadMonitorModule() {
  const source = fs.readFileSync(
    path.join(root, 'src/lib/notifications/internal-assessment-notifications.ts'),
    'utf8',
  );
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} };
  const stubs = {
    '@/lib/supabase/server': { createSupabaseServiceClient() { throw new Error('test db must be injected'); } },
    '@/lib/analytics/assessment-events': { trackAssessmentEvent: async () => {} },
    '@/lib/notifications/internal-notifications': {
      queueInternalNotification: async () => ({ ok: true, emailEventId: 'unused' }),
    },
    '@/lib/notifications/email-provider': {
      getEmailProviderMode: () => 'disabled',
      sendEmail: async () => ({ ok: false }),
    },
    '@/lib/notifications/message-templates': {
      buildAssessmentCompletedInternalMessage: () => ({ subject: 'unused', text: 'unused', html: 'unused' }),
      buildAssessmentStalledLeadMessage: () => ({ subject: 'unused', text: 'unused', html: 'unused' }),
    },
    '@/lib/notifications/phase1-order-notifications': {
      isRecipientPermitted: () => true,
      providerIdempotencyKeyFor: () => 'unused',
      recipientAllowlist: () => [],
    },
  };
  const resolveImport = (specifier) => {
    if (stubs[specifier]) return stubs[specifier];
    throw new Error(`unexpected runtime dependency in monitor parser test: ${specifier}`);
  };
  new Function('require', 'module', 'exports', output)(resolveImport, module, module.exports);
  return module.exports;
}

function loadStalledRoute() {
  const output = ts.transpileModule(stalledRoute, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} };
  const monitorCalls = [];
  const stubs = {
    'next/server': {
      NextResponse: {
        json(body, init = {}) {
          return { body, status: init.status ?? 200 };
        },
      },
    },
    '@/lib/notifications/internal-assessment-notifications': {
      monitorAdaptiveStalledLeads: async (options) => {
        monitorCalls.push(options);
        return { ok: true, notified: 0 };
      },
    },
  };
  const resolveImport = (specifier) => {
    if (stubs[specifier]) return stubs[specifier];
    throw new Error(`unexpected runtime dependency in stalled-route auth test: ${specifier}`);
  };
  new Function('require', 'module', 'exports', output)(resolveImport, module, module.exports);
  return { route: module.exports, monitorCalls };
}

console.log('Booting disposable Postgres for the stalled-lead control setter replay...');
await postgres.initialise();
await postgres.start();
await postgres.createDatabase('testdb');
await db.connect();

let failure = null;
try {
  await db.query(`
    create schema if not exists extensions;
    create extension if not exists pgcrypto with schema extensions;
    create extension if not exists citext with schema public;
    create schema if not exists auth;
    create schema if not exists storage;
    create schema if not exists vault;
    create schema if not exists cron;
    create schema if not exists net;
    create schema if not exists supabase_migrations;
    create or replace function auth.jwt() returns jsonb language sql stable as $$
      select nullif(current_setting('request.jwt.claims', true), '')::jsonb
    $$;
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
    create table if not exists auth.sessions (
      id uuid primary key default gen_random_uuid(),
      user_id uuid not null references auth.users(id) on delete cascade,
      not_after timestamptz
    );
    create table if not exists storage.buckets (
      id text primary key,
      name text not null,
      public boolean not null default false,
      file_size_limit bigint,
      allowed_mime_types text[],
      created_at timestamptz not null default now()
    );
    create table if not exists storage.objects (
      id uuid primary key default gen_random_uuid(),
      bucket_id text references storage.buckets(id),
      name text,
      owner uuid,
      metadata jsonb
    );
    alter table storage.objects enable row level security;
    create table if not exists vault.decrypted_secrets (
      id uuid primary key default gen_random_uuid(),
      name text not null,
      description text,
      decrypted_secret text not null,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now()
    );
    create table if not exists cron.job (
      jobid bigint generated always as identity primary key,
      jobname text not null unique,
      schedule text not null,
      command text not null,
      active boolean not null default true
    );
    create or replace function cron.schedule(p_job_name text, p_schedule text, p_command text)
    returns bigint
    language plpgsql
    as $$
    declare
      v_job_id bigint;
    begin
      insert into cron.job(jobname, schedule, command)
      values (p_job_name, p_schedule, p_command)
      returning jobid into v_job_id;
      return v_job_id;
    end;
    $$;
    create or replace function net.http_get(
      url text,
      params jsonb default null,
      headers jsonb default null,
      timeout_milliseconds integer default 1000
    ) returns bigint
    language sql
    as $$ select 1::bigint $$;
    insert into vault.decrypted_secrets(name, decrypted_secret)
    values ('v12_stalled_lead_cron_secret', 'scheduler-test-secret-never-in-command-256-bit');
  `);
  for (const role of ['anon', 'authenticated', 'service_role']) {
    await db.query(`do $$ begin if not exists (select 1 from pg_roles where rolname='${role}') then create role ${role} nologin; end if; end $$;`);
  }
  await db.query('grant usage on schema public to anon, authenticated, service_role');

  let applied = 0;
  for (const name of migrationFiles) {
    try {
      let sql = fs.readFileSync(path.join(root, 'supabase/migrations', name), 'utf8');
      if (name === schedulerMigrationName) {
        // Embedded Postgres does not ship Supabase's managed extensions. The production migration
        // still installs them normally; this replay replaces only those install statements with
        // the disposable cron/net stubs created above.
        sql = sql
          .replace(/create extension if not exists pg_cron with schema pg_catalog;\s*/i, '')
          .replace(/create extension if not exists pg_net;\s*/i, '');
      }
      await db.query(sql);
      applied += 1;
    } catch (error) {
      throw new Error(`migration ${name} failed to replay: ${error.message}`);
    }

    if (name === '20260821090000_adaptive_v1_2_staging_activation.sql') {
      const graph = fs.readFileSync(
        path.join(root, 'docs/adaptive-assessment/adaptive-graph-v1-2-candidate.json'),
        'utf8',
      );
      await db.query(`select public.publish_adaptive_graph_version('MFRS-V1.1-ADAPTIVE-DRAFT-20260804')`);
      await db.query(`select public.register_adaptive_staging_candidate($1::jsonb)`, [graph]);
      const historicalScale = await db.query(`
        select string_agg(display_order::text, ',' order by response_value) as display_orders
        from public.response_scale
        where methodology_version_id = (
          select methodology_version_id from public.adaptive_graph_versions
          where graph_version = 'MFRS-V1.2-ADAPTIVE-CANDIDATE-20260821'
        )
      `);
      check(historicalScale.rows[0].display_orders === '0,1,2,3,4,5', 'historical V1.2 seam remains 0..5 before correction');
    }

    if (name === schedulerMigrationName) {
      const schedulerJob = await db.query(`
        select jobname, schedule, command, active
        from cron.job
        where jobname = 'v12-stalled-lead-monitor'
      `);
      assert.equal(schedulerJob.rows.length, 1, 'exactly one stalled-lead scheduler job exists');
      assert.equal(schedulerJob.rows[0].schedule, '0 * * * *');
      assert.equal(schedulerJob.rows[0].active, true);
      assert.match(schedulerJob.rows[0].command, /v12_stalled_lead_cron_secret/);
      assert.match(schedulerJob.rows[0].command, /decrypted_secret/);
      assert.doesNotMatch(schedulerJob.rows[0].command, /scheduler-test-secret-never-in-command-256-bit/);
      const schedulerAuthority = await db.query(`
        select
          has_schema_privilege('anon', 'cron', 'USAGE') as anon_cron_usage,
          has_schema_privilege('authenticated', 'cron', 'USAGE') as authenticated_cron_usage,
          has_schema_privilege('anon', 'net', 'USAGE') as anon_net_usage,
          has_schema_privilege('authenticated', 'net', 'USAGE') as authenticated_net_usage,
          has_function_privilege('anon', 'cron.schedule(text,text,text)', 'EXECUTE') as anon_schedule_execute,
          has_function_privilege('authenticated', 'cron.schedule(text,text,text)', 'EXECUTE') as authenticated_schedule_execute
      `);
      assert.deepEqual(schedulerAuthority.rows[0], {
        anon_cron_usage: false,
        authenticated_cron_usage: false,
        anon_net_usage: false,
        authenticated_net_usage: false,
        anon_schedule_execute: false,
        authenticated_schedule_execute: false,
      });
      check(true, 'Supabase scheduler stores the Vault lookup, not a plaintext bearer secret');
      check(true, 'anon/authenticated cannot use Cron or pg_net scheduling authorities');
    }
  }
  check(applied === migrationFiles.length, `all ${applied} migrations replayed cleanly`);

  const signature = 'public.set_v12_adaptive_stalled_lead_controls(boolean,integer,text)';
  const functionContract = await db.query(`
    select
      p.prosecdef as security_definer,
      p.proconfig,
      has_function_privilege('service_role', $1, 'EXECUTE') as service_execute,
      has_function_privilege('anon', $1, 'EXECUTE') as anon_execute,
      has_function_privilege('authenticated', $1, 'EXECUTE') as authenticated_execute
    from pg_proc p
    where p.oid = to_regprocedure($1)
  `, [signature]);
  assert.equal(functionContract.rows.length, 1, 'setter function exists after replay');
  assert.equal(functionContract.rows[0].security_definer, true);
  assert.equal(functionContract.rows[0].service_execute, true);
  assert.equal(functionContract.rows[0].anon_execute, false);
  assert.equal(functionContract.rows[0].authenticated_execute, false);
  assert.ok((functionContract.rows[0].proconfig ?? []).some((entry) => entry === 'search_path=""' || entry === 'search_path='));
  console.log('  ok - setter has SECURITY DEFINER, empty search_path, service_role-only execution');

  const { route, monitorCalls } = loadStalledRoute();
  const previousDedicated = process.env.MK_STALLED_LEAD_CRON_SECRET;
  const previousShared = process.env.CRON_SECRET;
  try {
    process.env.MK_STALLED_LEAD_CRON_SECRET = 'dedicated-test-secret';
    process.env.CRON_SECRET = 'shared-test-secret';
    for (const [label, authorization, expectedStatus] of [
      ['missing dedicated secret', undefined, 403],
      ['wrong dedicated secret', 'Bearer wrong-test-secret', 403],
      ['shared secret is rejected', 'Bearer shared-test-secret', 403],
      ['dedicated secret is accepted', 'Bearer dedicated-test-secret', 200],
    ]) {
      if (label === 'missing dedicated secret') delete process.env.MK_STALLED_LEAD_CRON_SECRET;
      else process.env.MK_STALLED_LEAD_CRON_SECRET = 'dedicated-test-secret';
      const headers = new Headers();
      if (authorization) headers.set('authorization', authorization);
      const response = await route.GET({
        headers,
        url: 'https://preview.invalid/score/api/internal/adaptive-stalled-leads',
      });
      assert.equal(response.status, expectedStatus, label);
    }
    assert.equal(monitorCalls.length, 1, 'only the correct dedicated secret reaches the monitor');
    check(true, 'stalled-lead route rejects missing/wrong/shared credentials and accepts the dedicated secret');
  } finally {
    if (previousDedicated === undefined) delete process.env.MK_STALLED_LEAD_CRON_SECRET;
    else process.env.MK_STALLED_LEAD_CRON_SECRET = previousDedicated;
    if (previousShared === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = previousShared;
  }

  await db.query(`
    insert into public.app_settings(setting_key, value_json)
    values
      ('v12_setter_unrelated_fixture', '{"untouched":true,"marker":"setter-test"}'::jsonb)
  `);
  const controlBefore = await db.query(
    `select value_json from public.app_settings where setting_key='v12_adaptive_stalled_lead_controls'`,
  );
  assert.deepEqual(controlBefore.rows[0].value_json.source, 'v12_forward_contract');
  assert.equal(controlBefore.rows[0].value_json.inactivity_hours, 24);
  const unrelatedBefore = await db.query(
    `select value_json from public.app_settings where setting_key='v12_setter_unrelated_fixture'`,
  );
  const emailCountBefore = (await db.query(`select count(*)::int as n from public.email_events`)).rows[0].n;
  const auditBefore = (await db.query(
    `select count(*)::int as n from public.audit_logs where action='v12_stalled_lead_controls_changed'`,
  )).rows[0].n;

  const first = await setter(
    true,
    2,
    'Owner-approved V1.2 stalled-lead monitoring activation at two-hour inactivity threshold.',
  );
  assert.deepEqual(first.rows[0].result.value_json, {
    source: 'v12_forward_contract',
    enabled: true,
    inactivity_hours: 2,
  });
  check(true, 'enabled=true with inactivity_hours=2 succeeds');
  const currentAfterEnable = await db.query(
    `select value_json from public.app_settings where setting_key='v12_adaptive_stalled_lead_controls'`,
  );
  assert.deepEqual(currentAfterEnable.rows[0].value_json, {
    source: 'v12_forward_contract', enabled: true, inactivity_hours: 2,
  });
  check(true, 'stored value is exactly the v12_forward_contract source/enabled/hours shape');

  const auditAfterEnable = await db.query(`
    select before_json, after_json
    from public.audit_logs
    where action='v12_stalled_lead_controls_changed'
    order by created_at desc, id desc
    limit 1
  `);
  assert.equal(auditAfterEnable.rows.length, 1);
  assert.equal(auditAfterEnable.rows[0].before_json.enabled, controlBefore.rows[0].value_json.enabled);
  assert.equal(auditAfterEnable.rows[0].before_json.inactivity_hours, 24);
  assert.equal(auditAfterEnable.rows[0].after_json.enabled, true);
  assert.equal(auditAfterEnable.rows[0].after_json.inactivity_hours, 2);
  assert.equal(
    auditAfterEnable.rows[0].after_json.reason,
    'Owner-approved V1.2 stalled-lead monitoring activation at two-hour inactivity threshold.',
  );
  check(true, 'audit row records previous/new enabled and hours plus the reason');

  const monitor = loadMonitorModule();
  const monitorDb = {
    from(table) {
      const builder = {
        select() { return builder; },
        eq() { return builder; },
        limit() { return builder; },
        maybeSingle() {
          assert.equal(table, 'app_settings');
          return Promise.resolve({
            data: { value_json: { source: 'v12_forward_contract', enabled: true, inactivity_hours: 2 } },
            error: null,
          });
        },
        then(resolve, reject) {
          if (table === 'assessments') return Promise.resolve({ data: [], error: null }).then(resolve, reject);
          return Promise.reject(new Error(`unexpected awaited query for ${table}`)).then(resolve, reject);
        },
      };
      return builder;
    },
  };
  const parsed = await monitor.monitorAdaptiveStalledLeads(
    { adminUrlFor: () => 'https://admin.invalid/unused' },
    { db: monitorDb, now: () => new Date('2026-08-31T12:00:00.000Z') },
  );
  assert.equal(parsed.inactivityHours, 2);
  assert.equal(parsed.notified, 0);
  check(true, 'runtime monitor parser reads inactivity_hours=2 without sending a notification');

  const second = await setter(
    false,
    24,
    'Owner-approved V1.2 stalled-lead monitoring remains disabled at the normal 24-hour threshold.',
  );
  assert.equal(second.rows[0].result.value_json.enabled, false);
  assert.equal(second.rows[0].result.value_json.inactivity_hours, 24);
  check(true, 'enabled=false succeeds and restores the normal 24-hour value');

  for (const hours of [0, -1, 169]) {
    await expectFailure(
      `inactivity_hours=${hours} fails closed`,
      () => setter(true, hours, 'Owner-approved test reason.'),
      /inactivity_hours_out_of_range/,
    );
  }
  await expectFailure(
    'null enabled fails closed',
    () => setter(null, 2, 'Owner-approved test reason.'),
    /enabled_required/,
  );
  await expectFailure(
    'blank reason fails closed',
    () => setter(true, 2, '   '),
    /meaningful_reason_required/,
  );
  await expectFailure(
    'short reason fails closed',
    () => setter(true, 2, 'short'),
    /meaningful_reason_required/,
  );
  await expectFailure(
    'non-integer hours cannot reach the integer setter signature',
    () => inServiceRole(() => db.query(
      `select public.set_v12_adaptive_stalled_lead_controls(true, cast('2.5' as integer), 'Owner-approved test reason.')`,
    )),
    /invalid input syntax for type integer/,
  );

  await db.query(`
    delete from public.app_settings
     where setting_key='v12_adaptive_stalled_lead_controls'
  `);
  await expectFailure(
    'missing current setting row fails closed',
    () => setter(true, 2, 'Owner-approved test reason.'),
    /setting_missing/,
  );
  await db.query(`
    insert into public.app_settings(setting_key, value_json)
    values ('v12_adaptive_stalled_lead_controls', '{"source":"v12_forward_contract","enabled":false,"inactivity_hours":24}'::jsonb)
  `);
  check(true, 'missing-row fixture restored after fail-closed test');

  await db.query(`
    update public.app_settings
       set value_json='{"source":"wrong_source","enabled":false,"inactivity_hours":24}'::jsonb,
           updated_at=now()
     where setting_key='v12_adaptive_stalled_lead_controls'
  `);
  await expectFailure(
    'wrong source fails closed',
    () => setter(true, 2, 'Owner-approved test reason.'),
    /unexpected_current_shape/,
  );
  await db.query(`
    update public.app_settings
       set value_json='{"enabled":false,"inactivity_hours":24}'::jsonb,
           updated_at=now()
     where setting_key='v12_adaptive_stalled_lead_controls'
  `);
  await expectFailure(
    'missing source fails closed',
    () => setter(true, 2, 'Owner-approved test reason.'),
    /unexpected_current_shape/,
  );
  await db.query(`
    update public.app_settings
       set value_json='{"source":"v12_forward_contract","enabled":false,"inactivity_hours":24}'::jsonb,
           updated_at=now()
     where setting_key='v12_adaptive_stalled_lead_controls'
  `);
  check(true, 'source-shape fixture restored after fail-closed tests');

  const unrelatedAfter = await db.query(
    `select value_json from public.app_settings where setting_key='v12_setter_unrelated_fixture'`,
  );
  assert.deepEqual(unrelatedAfter.rows[0].value_json, unrelatedBefore.rows[0].value_json);
  check(true, 'unrelated app_settings row is unchanged');

  const directDml = [
    ['UPDATE', `update public.app_settings set updated_at=now() where false`],
    ['INSERT', `insert into public.app_settings(setting_key,value_json) values ('v12_direct_dml_fixture','{}'::jsonb)`],
    ['DELETE', `delete from public.app_settings where false`],
  ];
  for (const [verb, query] of directDml) {
    await expectFailure(
      `service_role direct ${verb} on app_settings remains unavailable`,
      () => inServiceRole(() => db.query(query)),
      /permission denied/,
    );
  }
  check(true, 'direct app_settings INSERT/UPDATE/DELETE remain revoked');

  const tableDmlPrivileges = await db.query(`
    select rolname,
      has_table_privilege(rolname, 'public.app_settings', 'INSERT') as can_insert,
      has_table_privilege(rolname, 'public.app_settings', 'UPDATE') as can_update,
      has_table_privilege(rolname, 'public.app_settings', 'DELETE') as can_delete
    from pg_roles
    where rolname in ('anon', 'authenticated', 'service_role')
    order by rolname
  `);
  assert.deepEqual(
    tableDmlPrivileges.rows.map(({ rolname, can_insert, can_update, can_delete }) => ({
      rolname,
      can_insert,
      can_update,
      can_delete,
    })),
    [
      { rolname: 'anon', can_insert: false, can_update: false, can_delete: false },
      { rolname: 'authenticated', can_insert: false, can_update: false, can_delete: false },
      { rolname: 'service_role', can_insert: false, can_update: false, can_delete: false },
    ],
  );
  check(true, 'anon/authenticated/service_role retain no direct app_settings write privilege');

  const emailCountAfter = (await db.query(`select count(*)::int as n from public.email_events`)).rows[0].n;
  assert.equal(emailCountAfter, emailCountBefore);
  check(true, 'changing the monitor setting alone creates no email notification');
  const auditAfter = (await db.query(
    `select count(*)::int as n from public.audit_logs where action='v12_stalled_lead_controls_changed'`,
  )).rows[0].n;
  assert.equal(auditAfter, auditBefore + 2);
  check(true, 'exactly one audit row was written per successful setter call');

  const finalScale = await db.query(`
    select string_agg(display_order::text, ',' order by response_value) as display_orders
    from public.response_scale
    where methodology_version_id = (
      select methodology_version_id from public.adaptive_graph_versions
      where graph_version = 'MFRS-V1.2-ADAPTIVE-CANDIDATE-20260821'
    )
  `);
  assert.equal(finalScale.rows[0].display_orders, '1,2,3,4,5,6');
  check(true, 'full replay leaves the forward V1.2 response scale at 1..6');

  const checksum = crypto.createHash('sha256').update(migration).digest('hex');
  console.log(JSON.stringify({
    migrationName,
    migrationChecksum: checksum,
    migrationCount: applied,
    setterSignature: signature,
    serviceRoleOnly: true,
    finalControl: { source: 'v12_forward_contract', enabled: false, inactivity_hours: 24 },
    auditRowsCreated: auditAfter - auditBefore,
    emailEventDelta: emailCountAfter - emailCountBefore,
  }, null, 2));
} catch (error) {
  failure = error;
} finally {
  await db.end().catch(() => {});
  await postgres.stop().catch(() => {});
  fs.rmSync(dataDir, { recursive: true, force: true });
}

if (failure) {
  console.error('V1.2 stalled-lead control setter tests FAILED');
  console.error(failure);
  process.exit(1);
}

console.log('V1.2 stalled-lead control setter tests: PASS');
