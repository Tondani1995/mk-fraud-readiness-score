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
const migrationPath = path.join(root, 'supabase/migrations', migrationName);
const migration = fs.readFileSync(migrationPath, 'utf8');
const vercel = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
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
check(
  vercel.crons.length === 1
    && vercel.crons[0].path === '/score/api/internal/adaptive-stalled-leads'
    && vercel.crons[0].schedule === '0 * * * *',
  'the only cron is the hourly stalled-lead route',
);
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
  `);
  for (const role of ['anon', 'authenticated', 'service_role']) {
    await db.query(`do $$ begin if not exists (select 1 from pg_roles where rolname='${role}') then create role ${role} nologin; end if; end $$;`);
  }
  await db.query('grant usage on schema public to anon, authenticated, service_role');

  let applied = 0;
  for (const name of migrationFiles) {
    try {
      await db.query(fs.readFileSync(path.join(root, 'supabase/migrations', name), 'utf8'));
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
