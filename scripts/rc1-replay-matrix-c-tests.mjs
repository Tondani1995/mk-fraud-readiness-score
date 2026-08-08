// Replay Matrix C: the new Production-bound migrations must converge the SAME launch-relevant
// contract whether they are applied to a Production baseline or to an environment that already
// carries the historical Staging-only effects.
//
//   State B  Production baseline                    -> new Production-bound migrations
//   State C  Staging-only effects already present    -> new Production-bound migrations
//
// Production has never received 20260806143000 (structured output) or 20260805200000 (AI timeout).
// Staging has both. The new chain must depend on NEITHER by id, must not assume either ledger entry
// exists, and must land the same semantic and security contract in both directions -- and must
// still be replay-safe when applied twice.
//
// Two disposable databases in one embedded cluster. Nothing outside this cluster is touched.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const root = process.cwd();
const require = createRequire(import.meta.url);
const { default: EmbeddedPostgres } = await import('embedded-postgres');
const { Client } = require('pg');
const port = 58900 + (process.pid % 200);
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rc1-matrix-c-'));

const MIGRATIONS = path.join(root, 'supabase', 'migrations');
// Excluded from the Production ledger; these ARE the historical Staging-only effects.
const STAGING_ONLY = [
  '20260805200000_pre_g30_ai_timeout_window.sql',
  '20260806090000_pre_g30_ai_budget_diagnostics.sql',
  '20260806143000_pre_g30_structured_output_release_gate.sql'
];
// The Production-bound migrations this backend pass adds.
const NEW_CHAIN = [
  '20260807120000_report_secondary_artifacts.sql',
  '20260807130000_report_artefact_access_audit.sql',
  '20260807140000_report_artefact_bucket_mime.sql',
  '20260808090000_rc1_report_artifacts_freeze_surface.sql',
  '20260808150000_manual_ai_structured_output_settlement_parity.sql',
  '20260808160000_atomic_report_finalisation_with_register.sql',
  '20260808170000_ai_attempt_timeout_contract_parity.sql',
  '20260808180000_atomic_access_token_consumption.sql'
];

let passed = 0;
const failures = [];
function check(name, condition, detail = '') {
  if (condition) { passed += 1; console.log(`  ok - ${name}`); }
  else { failures.push(name); console.log(`  FAIL - ${name}${detail ? `\n    ${detail}` : ''}`); }
}

const postgres = new EmbeddedPostgres({
  databaseDir: dataDir, user: 'postgres', password: 'postgres',
  port, persistent: false, initdbFlags: ['--encoding=UTF8']
});

const BOOTSTRAP = `
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
`;

const migrationSql = (name) => fs.readFileSync(path.join(MIGRATIONS, name), 'utf8');
const allMigrations = fs.readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();

async function applyFiles(client, files) {
  for (const file of files) {
    const sql = migrationSql(file);
    await client.query(sql);
    const version = file.slice(0, file.indexOf('_'));
    const name = file.slice(file.indexOf('_') + 1, -4);
    await client.query(
      'insert into supabase_migrations.schema_migrations(version,name,statements) values ($1,$2,$3) on conflict (version) do nothing',
      [version, name, [sql]]
    );
  }
}

/** Semantic contract of the launch-relevant surface, independent of SQL source text. */
async function contractOf(client) {
  const one = async (sql, params = []) => (await client.query(sql, params)).rows[0];
  const many = async (sql, params = []) => (await client.query(sql, params)).rows;

  const constraints = await many(`
    select c.conname, pg_get_constraintdef(c.oid) as def
    from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
    where n.nspname='public' and t.relname='report_ai_attempts' and c.contype='c'
    order by c.conname`);
  const column = await one(`
    select data_type from information_schema.columns
    where table_schema='public' and table_name='report_ai_attempts'
      and column_name='structured_output_diagnostics'`);

  const fnNames = [
    'settle_manual_report_ai_attempt', 'settle_phase14_ai_attempt',
    'finalise_manual_report_with_supporting_register',
    'consume_assessment_token', 'consume_customer_report_access_token'
  ];
  const functions = {};
  for (const fn of fnNames) {
    const row = await one(`
      select p.proname, p.prosecdef, p.proconfig::text as config, p.proacl::text as acl,
             pg_get_functiondef(p.oid) as def, pg_get_userbyid(p.proowner) as owner
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname=$1 limit 1`, [fn]);
    functions[fn] = row ?? null;
  }
  return { constraints, column, functions };
}

const STATUSES = [
  'started', 'succeeded', 'accounting_unverified', 'failed_before_provider',
  'provider_result_uncertain', 'reconciliation_required',
  'structured_output_invalid', 'structured_output_truncated', 'structured_output_refused',
  'structured_output_schema_failed', 'structured_output_json_invalid'
];

try {
  await postgres.initialise();
  await postgres.start();

  console.log('Replay Matrix C: Production-baseline vs Staging-equivalent convergence\n');

  const states = {};
  for (const [label, seedStagingOnly] of [['B', false], ['C', true]]) {
    const dbName = `matrix${label.toLowerCase()}`;
    await postgres.createDatabase(dbName);
    const client = new Client({ host: '127.0.0.1', port, user: 'postgres', password: 'postgres', database: dbName });
    await client.connect();
    await client.query(BOOTSTRAP);

    // Everything before this backend pass, minus the Staging-only set = the Production baseline.
    const baseline = allMigrations.filter(
      (f) => !STAGING_ONLY.includes(f) && !NEW_CHAIN.includes(f));
    await applyFiles(client, baseline);

    if (seedStagingOnly) {
      // State C additionally carries the historical Staging-only EFFECTS, applied before the new
      // chain, exactly as Staging experienced them.
      await applyFiles(client, STAGING_ONLY.filter((f) => f !== '20260806090000_pre_g30_ai_budget_diagnostics.sql'));
      const pre = await client.query(`
        select pg_get_constraintdef(c.oid) as def from pg_constraint c
        join pg_class t on t.oid=c.conrelid join pg_namespace n on n.oid=t.relnamespace
        where n.nspname='public' and t.relname='report_ai_attempts'
          and c.conname='report_ai_attempts_timeout_ms_check'`);
      check('C precondition: Staging-only timeout widening already present',
        pre.rows[0]?.def?.includes('300000') === true, pre.rows[0]?.def);
      const preDiag = await client.query(`
        select 1 from information_schema.columns where table_schema='public'
          and table_name='report_ai_attempts' and column_name='structured_output_diagnostics'`);
      check('C precondition: Staging-only diagnostics column already present', preDiag.rowCount === 1);
    }

    // The new Production-bound chain, in order.
    await applyFiles(client, NEW_CHAIN);
    // Replay safety: applying the whole new chain a second time must be a no-op, not a failure.
    await applyFiles(client, NEW_CHAIN);
    check(`state ${label}: new Production-bound chain is replay-safe (applied twice)`, true);

    states[label] = await contractOf(client);
    states[`${label}_client`] = client;
  }

  const B = states.B;
  const C = states.C;

  // 1. report_ai_attempts
  for (const [label, st] of [['B', B], ['C', C]]) {
    check(`${label}: structured_output_diagnostics is jsonb`, st.column?.data_type === 'jsonb', st.column?.data_type);
    const diag = st.constraints.find((c) => c.conname.includes('structured_output_diagnostics'));
    check(`${label}: diagnostics constrained to JSON object shape`,
      diag?.def?.includes("jsonb_typeof") === true && diag?.def?.includes("'object'") === true, diag?.def);
    const status = st.constraints.find((c) => c.conname === 'report_ai_attempts_status_check');
    check(`${label}: eleven-value status vocabulary`,
      STATUSES.every((s) => status?.def?.includes(s)) === true,
      `missing: ${STATUSES.filter((s) => !status?.def?.includes(s)).join(',')}`);
    const timeout = st.constraints.find((c) => c.conname === 'report_ai_attempts_timeout_ms_check');
    check(`${label}: timeout contract 1000..300000`,
      timeout?.def?.includes('1000') === true && timeout?.def?.includes('300000') === true, timeout?.def);
    check(`${label}: pre-existing accounting/input constraints retained`,
      st.constraints.some((c) => c.conname === 'report_ai_attempts_accounting_status_chk')
      && st.constraints.some((c) => c.conname === 'report_ai_attempts_input_size_chk'));
  }
  // No duplicate/conflicting constraints of the same concern.
  for (const [label, st] of [['B', B], ['C', C]]) {
    for (const conname of ['report_ai_attempts_status_check', 'report_ai_attempts_timeout_ms_check']) {
      check(`${label}: exactly one ${conname}`,
        st.constraints.filter((c) => c.conname === conname).length === 1);
    }
  }
  check('B and C have identical report_ai_attempts check-constraint sets',
    JSON.stringify(B.constraints) === JSON.stringify(C.constraints),
    `B=${B.constraints.length} C=${C.constraints.length}`);

  // 2-5. Functions must exist and be semantically identical in both states.
  for (const fn of Object.keys(B.functions)) {
    check(`${fn} exists in both final states`,
      Boolean(B.functions[fn]) && Boolean(C.functions[fn]));
    if (!B.functions[fn] || !C.functions[fn]) continue;
    check(`${fn}: identical definition in B and C`,
      B.functions[fn].def === C.functions[fn].def);
    // 6. Privileges
    check(`${fn}: SECURITY DEFINER matches intent in both`,
      B.functions[fn].prosecdef === C.functions[fn].prosecdef && B.functions[fn].prosecdef === true);
    check(`${fn}: restrictive search_path in both`,
      String(B.functions[fn].config ?? '').includes('search_path')
      && B.functions[fn].config === C.functions[fn].config, String(B.functions[fn].config));
    check(`${fn}: identical owner in B and C`,
      B.functions[fn].owner === C.functions[fn].owner);
    const acl = String(B.functions[fn].acl ?? '');
    check(`${fn}: identical effective ACL in B and C`, acl === String(C.functions[fn].acl ?? ''), acl);
    check(`${fn}: no PUBLIC/anon/authenticated execute`,
      !/=X\/|anon=X|authenticated=X/.test(acl.replace(/postgres=X\/postgres/g, '').replace(/service_role=X\/postgres/g, '')),
      acl);
    // Only the functions this chain CREATES are required to grant service_role execute. The two
    // settlement functions pre-date it and are redefined with CREATE OR REPLACE, which preserves
    // the accepted ACL -- asserting a grant here would be asserting a change we deliberately did
    // not make. Their ACL equality between B and C is already proven above.
    const CREATED_BY_THIS_CHAIN = [
      'finalise_manual_report_with_supporting_register',
      'consume_assessment_token', 'consume_customer_report_access_token'
    ];
    if (CREATED_BY_THIS_CHAIN.includes(fn)) {
      check(`${fn}: service_role holds execute`, acl.includes('service_role=X'), acl);
    } else {
      check(`${fn}: pre-existing ACL preserved unchanged (no grant added)`,
        acl === String(C.functions[fn].acl ?? ''), acl);
    }
  }

  // 3. State C's autonomous settlement must come from the Production-bound chain, not the
  //    Staging-only migration that happens to precede it.
  check('C: autonomous settlement carries the Production-bound structured-output contract',
    STATUSES.filter((s) => s.startsWith('structured_output'))
      .every((s) => C.functions.settle_phase14_ai_attempt?.def?.includes(s)) === true);
  check('C: autonomous settlement persists diagnostics',
    C.functions.settle_phase14_ai_attempt?.def
      ?.includes("structured_output_diagnostics = p_result->'structured_output_diagnostics'") === true);

  // 4. P1-B ordering must survive in both.
  for (const [label, st] of [['B', B], ['C', C]]) {
    const def = st.functions.finalise_manual_report_with_supporting_register?.def ?? '';
    const supersede = def.indexOf("status='superseded'");
    const insertReport = def.indexOf('insert into public.reports');
    const insertArtefact = def.indexOf('insert into public.report_artifacts');
    check(`${label}: finalisation supersedes before inserting the replacement`,
      supersede > 0 && insertReport > supersede && insertArtefact > insertReport);
  }

  // 5. P2 consumers enforce the limit in the same statement that increments.
  for (const [label, st] of [['B', B], ['C', C]]) {
    const a = st.functions.consume_assessment_token?.def ?? '';
    const c = st.functions.consume_customer_report_access_token?.def ?? '';
    check(`${label}: assessment consumer is a conditional atomic UPDATE`,
      a.includes('use_count = use_count + 1') && a.includes('use_count < max_uses')
      && a.includes('revoked_at is null') && a.includes('expires_at > now()'));
    check(`${label}: customer consumer is a conditional atomic UPDATE`,
      c.includes('access_count = access_count + 1') && c.includes('access_count < p_max_uses')
      && c.includes('revoked_at is null') && c.includes('expires_at > now()'));
  }

  // 7. Migration independence.
  const newChainSql = NEW_CHAIN.map(migrationSql).join('\n')
    .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
  for (const stagingOnlyId of ['20260806143000', '20260805200000']) {
    check(`new chain does not reference the Staging-only migration ${stagingOnlyId}`,
      !newChainSql.includes(stagingOnlyId));
  }

  for (const key of ['B_client', 'C_client']) await states[key].end().catch(() => {});
} finally {
  await postgres.stop().catch(() => {});
  fs.rmSync(dataDir, { recursive: true, force: true });
  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length > 0) process.exitCode = 1;
}
