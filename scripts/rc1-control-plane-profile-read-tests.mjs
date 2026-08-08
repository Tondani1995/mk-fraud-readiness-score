import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const mode = process.argv[2];
assert(
  mode === 'pre' || mode === 'post',
  'usage: node scripts/rc1-control-plane-profile-read-tests.mjs <pre|post>',
);

const root = process.cwd();
const migrationName = '20260729170000_rc1_authenticated_admin_profile_read.sql';
const migrationPath = path.join(root, 'supabase', 'migrations', migrationName);
const migration = fs.readFileSync(migrationPath, 'utf8');
const controlPlane = fs.readFileSync(
  path.join(root, 'src', 'lib', 'rc1', 'control-plane.ts'),
  'utf8',
);
const freezeBootstrap = fs.readFileSync(
  path.join(root, 'supabase', 'migrations', '20260722120000_rc1_operational_freeze_bootstrap.sql'),
  'utf8',
);

const migrationFiles = fs.readdirSync(path.join(root, 'supabase', 'migrations'))
  .filter((name) => name.endsWith('.sql'))
  .sort();
// The AI-budget diagnostics migration is Staging-only and is outside this historical
// authenticated-control-plane replay contract.
const controlPlaneReplayMigrations = migrationFiles.filter(
  (name) => ![
    '20260806090000_pre_g30_ai_budget_diagnostics.sql',
    '20260806143000_pre_g30_structured_output_release_gate.sql'
  ].includes(name),
);
assert.equal(controlPlaneReplayMigrations.length, 93);
// Asserted by name and relative order rather than tail position: the RC1 series appends further
// additive migrations (quality diagnostics, synthetic cleanup), so at(-1)/at(-2) legitimately move
// while the accepted ordering of these two must not.
assert.ok(migrationFiles.includes('20260729113242_rc1_service_role_privilege_contract.sql'));
assert.ok(migrationFiles.includes(migrationName));
assert.ok(
  migrationFiles.indexOf('20260729113242_rc1_service_role_privilege_contract.sql')
    < migrationFiles.indexOf(migrationName),
);

assert.match(
  migration,
  /grant\s+select\s*\(\s*id\s*,\s*role\s*,\s*status\s*\)\s*on\s+public\.admin_profiles\s*to\s+authenticated/i,
);
for (const forbidden of [
  /grant\s+select\s+on\s+(?:table\s+)?public\.admin_profiles/i,
  /grant\s+all/i,
  /alter\s+default\s+privileges/i,
  /disable\s+row\s+level\s+security/i,
  /security\s+definer/i,
  /grant\b[^;]*\bto\s+(?:anon|public)\b/i,
  /grant\s+create\s+on\s+schema/i,
]) {
  assert.doesNotMatch(migration, forbidden);
}
for (const requiredStop of [
  'rc1_authenticated_profile_read_missing_role',
  'rc1_authenticated_profile_read_missing_table',
  'rc1_authenticated_profile_read_wrong_relation_kind',
  'rc1_authenticated_profile_read_wrong_owner',
  'rc1_authenticated_profile_read_rls_disabled',
  'rc1_authenticated_profile_read_column_definition_mismatch',
  'rc1_authenticated_profile_read_select_policy_mismatch',
  'rc1_authenticated_profile_read_platform_policy_mismatch',
  'rc1_authenticated_profile_read_unapproved_column_select_present',
  'rc1_authenticated_profile_read_function_definition_changed',
  'rc1_authenticated_profile_read_rls_policy_changed',
  'rc1_authenticated_profile_read_trigger_changed',
  'rc1_authenticated_profile_read_table_definition_changed',
]) {
  assert(migration.includes(requiredStop), `migration is missing fail-closed stop ${requiredStop}`);
}

assert.match(
  controlPlane,
  /createSupabaseAuthenticatedServerClient\(accessToken\)[\s\S]*?\.from\('admin_profiles'\)[\s\S]*?\.select\('role,status'\)[\s\S]*?\.eq\('id',\s*userData\.user\.id\)/,
);
assert.match(controlPlane, /profile\.status\s*!==\s*'active'/);
assert.match(controlPlane, /operator\.role\s*!==\s*'platform_admin'/);
assert.match(controlPlane, /operator\.aal\s*!==\s*'aal2'/);

for (const functionName of [
  'rc1_activate_freeze',
  'rc1_release_freeze',
  'rc1_provision_certification_runtime_secret',
]) {
  const start = freezeBootstrap.indexOf(`create function public.${functionName}`);
  assert.notEqual(start, -1, `${functionName} is missing`);
  const body = freezeBootstrap.slice(start, freezeBootstrap.indexOf('$$;', start) + 3);
  assert.match(
    body,
    /rc1_require_platform_admin\(true\)/,
    `${functionName} must independently revalidate platform_admin and AAL2`,
  );
}
assert.match(
  freezeBootstrap,
  /from auth\.sessions s[\s\S]*?s\.id = v_session_id[\s\S]*?s\.user_id = v_user_id/,
);

const databaseUrl = process.env.LOCAL_DB_URL ?? '';
assert(databaseUrl, 'LOCAL_DB_URL is required');
const parsed = new URL(databaseUrl);
assert(
  ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname),
  'control-plane profile-read tests are loopback-only',
);

const client = new pg.Client({
  connectionString: databaseUrl,
  application_name: `rc1-control-plane-profile-read-${mode}`,
});
await client.connect();

async function resetRole() {
  await client.query('reset role');
}

async function assumeApiRole(role, userId, aal = 'aal2') {
  assert(['authenticated', 'anon', 'service_role'].includes(role));
  await resetRole();
  await client.query(`set local role ${role}`);
  const claims = userId
    ? {
        sub: userId,
        role,
        aal,
        session_id: '90000000-0000-0000-0000-000000000001',
        exp: Math.floor(Date.now() / 1000) + 3600,
      }
    : { role, aal };
  await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [userId ?? '']);
  await client.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
}

let savepointCounter = 0;
async function expectPrivilegeDenied(action, label) {
  savepointCounter += 1;
  const savepoint = `expected_denial_${savepointCounter}`;
  await client.query(`savepoint ${savepoint}`);
  try {
    await action();
    assert.fail(`${label} unexpectedly succeeded`);
  } catch (error) {
    assert.equal(error.code, '42501', `${label} failed for the wrong reason: ${error.message}`);
  } finally {
    await client.query(`rollback to savepoint ${savepoint}`);
    await client.query(`release savepoint ${savepoint}`);
  }
}

try {
  await client.query('begin');

  const approvedColumns = ['id', 'role', 'status'];
  const deniedColumns = [
    'email',
    'full_name',
    'mfa_required',
    'created_at',
    'updated_at',
    'last_login_at',
  ];

  const privilegeRows = (await client.query(`
    select
      a.attname,
      has_column_privilege(
        'authenticated',
        'public.admin_profiles',
        a.attname,
        'SELECT'
      ) as can_select
    from pg_attribute a
    where a.attrelid = 'public.admin_profiles'::regclass
      and a.attnum > 0
      and not a.attisdropped
    order by a.attnum
  `)).rows;

  assert.equal(
    (await client.query(`
      select has_table_privilege(
        'authenticated',
        'public.admin_profiles',
        'SELECT'
      ) as allowed
    `)).rows[0].allowed,
    false,
    'authenticated must never receive table-wide SELECT',
  );
  assert.equal(
    (await client.query(`
      select has_table_privilege(
        'service_role',
        'public.admin_profiles',
        'SELECT'
      ) as allowed
    `)).rows[0].allowed,
    true,
    'service_role SELECT must remain available',
  );
  assert.equal(
    (await client.query(`
      select has_table_privilege('anon','public.admin_profiles','SELECT') as allowed
    `)).rows[0].allowed,
    false,
    'anon SELECT must remain denied',
  );

  if (mode === 'pre') {
    assert(privilegeRows.every((row) => row.can_select === false));
    await assumeApiRole(
      'authenticated',
      '91000000-0000-0000-0000-000000000001',
      'aal2',
    );
    await expectPrivilegeDenied(
      () => client.query(`select id, role, status from public.admin_profiles limit 1`),
      'pre-migration authenticated control-plane profile read',
    );
    await assumeApiRole('service_role', null);
    await client.query(`select id, role, status from public.admin_profiles limit 1`);
    await assumeApiRole('anon', null);
    await expectPrivilegeDenied(
      () => client.query(`select id, role, status from public.admin_profiles limit 1`),
      'pre-migration anon profile read',
    );
  } else {
    for (const column of approvedColumns) {
      assert.equal(
        privilegeRows.find((row) => row.attname === column)?.can_select,
        true,
        `authenticated SELECT(${column}) is required`,
      );
    }
    for (const column of deniedColumns) {
      assert.equal(
        privilegeRows.find((row) => row.attname === column)?.can_select,
        false,
        `authenticated SELECT(${column}) must remain denied`,
      );
    }

    const identities = {
      platform: '92000000-0000-0000-0000-000000000001',
      reviewer: '92000000-0000-0000-0000-000000000002',
      finance: '92000000-0000-0000-0000-000000000003',
      suspended: '92000000-0000-0000-0000-000000000004',
      noProfile: '92000000-0000-0000-0000-000000000005',
    };
    for (const [name, id] of Object.entries(identities)) {
      await resetRole();
      await client.query(
        `insert into auth.users(id,email) values ($1,$2)`,
        [id, `rc1-${name}@invalid.test`],
      );
    }
    for (const profile of [
      [identities.platform, 'platform_admin', 'active'],
      [identities.reviewer, 'reviewer', 'active'],
      [identities.finance, 'finance_admin', 'active'],
      [identities.suspended, 'platform_admin', 'suspended'],
    ]) {
      await client.query(
        `insert into public.admin_profiles(id,email,full_name,role,status)
         values ($1,$2,$3,$4,$5)`,
        [profile[0], `profile-${profile[0]}@invalid.test`, 'Disposable RC1 identity', profile[1], profile[2]],
      );
    }

    await assumeApiRole('authenticated', identities.reviewer);
    const own = await client.query(
      `select id, role, status from public.admin_profiles where id=$1`,
      [identities.reviewer],
    );
    assert.equal(own.rowCount, 1);
    assert.equal(own.rows[0].role, 'reviewer');
    assert.equal(own.rows[0].status, 'active');
    assert.equal(
      (await client.query(
        `select id, role, status from public.admin_profiles where id=$1`,
        [identities.finance],
      )).rowCount,
      0,
      'non-platform administrator must not read another administrator',
    );

    await assumeApiRole('authenticated', identities.platform);
    const platformRows = await client.query(
      `select id, role, status
       from public.admin_profiles
       where id = any($1::uuid[])
       order by id`,
      [Object.values(identities).filter((id) => id !== identities.noProfile)],
    );
    assert.equal(platformRows.rowCount, 4);

    await assumeApiRole('authenticated', identities.noProfile);
    assert.equal(
      (await client.query(
        `select id, role, status from public.admin_profiles where id=$1`,
        [identities.noProfile],
      )).rowCount,
      0,
      'a user without an admin profile must receive no row',
    );

    await assumeApiRole('authenticated', identities.suspended);
    const suspended = await client.query(
      `select id, role, status from public.admin_profiles where id=$1`,
      [identities.suspended],
    );
    assert.equal(suspended.rowCount, 1);
    assert.equal(suspended.rows[0].status, 'suspended');
    assert.notEqual(
      suspended.rows[0].status,
      'active',
      'suspended profile must fail the control-plane active-status precheck',
    );

    await assumeApiRole('authenticated', identities.platform);
    for (const column of deniedColumns) {
      await expectPrivilegeDenied(
        () => client.query(`select ${column} from public.admin_profiles where id=$1`, [identities.platform]),
        `authenticated SELECT(${column})`,
      );
    }
    await expectPrivilegeDenied(
      () => client.query(`select * from public.admin_profiles where id=$1`, [identities.platform]),
      'authenticated wildcard SELECT',
    );
    await expectPrivilegeDenied(
      () => client.query(
        `insert into public.admin_profiles(id,email,role,status)
         values ('92000000-0000-0000-0000-000000000006','write@invalid.test','reviewer','active')`,
      ),
      'authenticated INSERT',
    );
    await expectPrivilegeDenied(
      () => client.query(
        `update public.admin_profiles set status='suspended' where id=$1`,
        [identities.platform],
      ),
      'authenticated UPDATE',
    );
    await expectPrivilegeDenied(
      () => client.query(`delete from public.admin_profiles where id=$1`, [identities.platform]),
      'authenticated DELETE',
    );

    await assumeApiRole('anon', null);
    await expectPrivilegeDenied(
      () => client.query(`select id, role, status from public.admin_profiles limit 1`),
      'post-migration anon profile read',
    );

    await assumeApiRole('service_role', null);
    const serviceRead = await client.query(
      `select id, email, full_name, role, status, mfa_required,
              created_at, updated_at, last_login_at
       from public.admin_profiles
       where id=$1`,
      [identities.platform],
    );
    assert.equal(serviceRead.rowCount, 1);
  }

  await resetRole();
  const writeMatrix = (await client.query(`
    select jsonb_build_object(
      'insert',has_table_privilege('authenticated','public.admin_profiles','INSERT'),
      'update',has_table_privilege('authenticated','public.admin_profiles','UPDATE'),
      'delete',has_table_privilege('authenticated','public.admin_profiles','DELETE'),
      'anon_select',has_table_privilege('anon','public.admin_profiles','SELECT'),
      'anon_insert',has_table_privilege('anon','public.admin_profiles','INSERT'),
      'anon_update',has_table_privilege('anon','public.admin_profiles','UPDATE'),
      'anon_delete',has_table_privilege('anon','public.admin_profiles','DELETE')
    ) as matrix
  `)).rows[0].matrix;
  assert.deepEqual(writeMatrix, {
    insert: false,
    update: false,
    delete: false,
    anon_select: false,
    anon_insert: false,
    anon_update: false,
    anon_delete: false,
  });
  assert.equal(
    (await client.query(`
      select exists (
        select 1
        from pg_class relation
        cross join lateral aclexplode(
          coalesce(relation.relacl, acldefault('r', relation.relowner))
        ) acl
        where relation.oid = 'public.admin_profiles'::regclass
          and acl.grantee = 0
          and acl.privilege_type in (
            'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
          )
      ) or exists (
        select 1
        from pg_attribute attribute
        join pg_class relation on relation.oid = attribute.attrelid
        cross join lateral aclexplode(
          coalesce(attribute.attacl, acldefault('c', relation.relowner))
        ) acl
        where relation.oid = 'public.admin_profiles'::regclass
          and attribute.attnum > 0
          and not attribute.attisdropped
          and acl.grantee = 0
          and acl.privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'REFERENCES')
      ) as expanded
    `)).rows[0].expanded,
    false,
    'PUBLIC must retain no table or column privilege on admin_profiles',
  );

  await client.query('rollback');
  console.log(JSON.stringify({
    result: 'PASS',
    mode,
    migration: migrationName,
    migrationSha256: crypto.createHash('sha256').update(migration).digest('hex'),
    approvedColumns: mode === 'post' ? approvedColumns : [],
    deniedColumns,
    rlsBehaviourCases: mode === 'post' ? 5 : 0,
    serviceRolePreserved: true,
    anonPreserved: true,
    publicPreserved: true,
    disposableRowsRolledBack: true,
  }, null, 2));
} catch (error) {
  await client.query('rollback').catch(() => {});
  throw error;
} finally {
  await client.end();
}
