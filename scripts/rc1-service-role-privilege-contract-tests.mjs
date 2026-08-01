import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const databaseUrl = process.env.LOCAL_DB_URL ?? '';
assert(databaseUrl, 'LOCAL_DB_URL is required');
const parsed = new URL(databaseUrl);
assert(
  ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname),
  'privilege-contract tests are loopback-only',
);
const manifest = JSON.parse(fs.readFileSync(
  path.join(root, 'scripts', 'rc1-service-role-privilege-contract.manifest.json'),
  'utf8',
));

function sql(query, { expectFailure = false, includes = '' } = {}) {
  const result = spawnSync(
    process.env.PSQL ?? 'psql',
    [databaseUrl, '-X', '-v', 'ON_ERROR_STOP=1', '-At', '-c', query],
    { encoding: 'utf8', env: { ...process.env, PGAPPNAME: 'rc1-service-role-contract-tests' } },
  );
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (expectFailure) {
    assert.notEqual(result.status, 0, `SQL unexpectedly succeeded:\n${output}`);
    assert(output.includes(includes), `SQL failed for the wrong reason:\n${output}`);
  } else {
    assert.equal(result.status, 0, `SQL failed:\n${output}`);
  }
  return output.trim();
}

assert.equal(manifest.migrationCountAfter, 46);
const migrations = fs.readdirSync(path.join(root, 'supabase', 'migrations'))
  .filter((name) => name.endsWith('.sql'))
  .sort();
assert.equal(migrations.length, 56);
// By name and relative order, not tail position -- later RC1 migrations append to the ledger.
assert.ok(migrations.includes(manifest.newestMigration));
assert.ok(migrations.includes('20260729170000_rc1_authenticated_admin_profile_read.sql'));
assert.ok(
  migrations.indexOf(manifest.newestMigration)
    < migrations.indexOf('20260729170000_rc1_authenticated_admin_profile_read.sql'),
);

const newestApplied = sql(`
  select version from supabase_migrations.schema_migrations order by version desc limit 1
`);
// The newest applied migration tracks the RC1 series head, not migration 47 specifically.
assert.equal(newestApplied, '20260801140000');

const roleState = JSON.parse(sql(`
  select jsonb_build_object(
    'superuser',rolsuper,
    'inherit',rolinherit,
    'bypassrls',rolbypassrls,
    'canlogin',rolcanlogin,
    'schema_usage',has_schema_privilege('service_role','public','USAGE'),
    'schema_create',has_schema_privilege('service_role','public','CREATE')
  )
  from pg_roles where rolname='service_role'
`));
assert.deepEqual(roleState, {
  superuser: false,
  inherit: true,
  bypassrls: true,
  canlogin: false,
  schema_usage: true,
  schema_create: false,
});

for (const table of manifest.tables) {
  const actual = sql(`
    select
      has_table_privilege('service_role','${table.schema}.${table.table}','SELECT')::int::text ||
      has_table_privilege('service_role','${table.schema}.${table.table}','INSERT')::int::text ||
      has_table_privilege('service_role','${table.schema}.${table.table}','UPDATE')::int::text ||
      has_table_privilege('service_role','${table.schema}.${table.table}','DELETE')::int::text
  `);
  const required = new Set(table.required);
  const baseline = table.stagingCurrent;
  const expected = ['S','I','U','D']
    .map((letter, index) => baseline[index] === '1' || required.has(letter) ? '1' : '0')
    .join('');
  assert.equal(actual, expected, `post-46 ACL mismatch for ${table.schema}.${table.table}`);
}

for (const rpc of manifest.serviceRoleRpcs) {
  const row = JSON.parse(sql(`
    select jsonb_build_object(
      'exists',to_regprocedure('${rpc.signature}') is not null,
      'execute',has_function_privilege('service_role','${rpc.signature}','EXECUTE'),
      'security_mode',case when p.prosecdef then 'DEFINER' else 'INVOKER' end,
      'search_path',coalesce((
        select case when replace(setting,'search_path=','')='""' then ''
          else replace(setting,'search_path=','') end
        from unnest(coalesce(p.proconfig,array[]::text[])) setting
        where setting like 'search_path=%'
      ),'DEFAULT')
    )
    from pg_proc p where p.oid=to_regprocedure('${rpc.signature}')
  `));
  assert.equal(row.exists, true, `${rpc.signature} is missing`);
  assert.equal(row.execute, true, `${rpc.signature} lost service_role EXECUTE`);
  assert.equal(row.security_mode, rpc.securityMode, `${rpc.signature} security mode changed`);
  assert.equal(row.search_path, rpc.searchPath, `${rpc.signature} search_path changed`);
}

for (const denial of [
  ['public.methodology_versions', 'INSERT'],
  ['public.admin_profiles', 'UPDATE'],
  ['public.orders', 'DELETE'],
  ['public.products', 'UPDATE'],
  ['public.report_generation_runs', 'INSERT'],
  ['public.report_delivery_authorizations', 'UPDATE'],
]) {
  assert.equal(
    sql(`select has_table_privilege('service_role','${denial[0]}','${denial[1]}')`),
    'f',
    `unapproved privilege present: ${denial.join(' ')}`,
  );
}

for (const pattern of [
  /grant\s+all/i,
  /alter\s+default\s+privileges/i,
  /grant\b[^;]*\bto\s+public\b/i,
  /disable\s+row\s+level\s+security/i,
  /alter\s+role\s+service_role/i,
  /grant\s+create\s+on\s+schema\s+public/i,
]) {
  const migration = fs.readFileSync(
    path.join(root, 'supabase', 'migrations', manifest.newestMigration),
    'utf8',
  );
  assert.doesNotMatch(migration, pattern);
}

console.log(JSON.stringify({
  migrationCount: migrations.length,
  newestApplied,
  tableContracts: manifest.tables.length,
  rpcContracts: manifest.serviceRoleRpcs.length,
  denialChecks: 6,
  roleState,
}, null, 2));
