import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const databaseUrl = process.env.LOCAL_DB_URL;
assert(databaseUrl, 'LOCAL_DB_URL is required');
assert(
  /^postgres(?:ql)?:\/\/[^@]+@(127\.0\.0\.1|localhost):/.test(databaseUrl),
  'hardening tests may run only against loopback PostgreSQL',
);

const manifestPath = path.join(
  root,
  'scripts',
  'rc1-staging-postflight-hardening.manifest.json',
);
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const aclMigrationPath = path.join(
  root,
  'supabase',
  'migrations',
  '20260728190000_rc1_staging_postflight_least_privilege.sql',
);
const indexMigrationPath = path.join(
  root,
  'supabase',
  'migrations',
  '20260728191000_rc1_launch_required_foreign_key_indexes.sql',
);
const aclMigration = fs.readFileSync(aclMigrationPath, 'utf8');
const indexMigration = fs.readFileSync(indexMigrationPath, 'utf8');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function runSql(sql, { expectFailure = false, expected = '' } = {}) {
  const result = spawnSync(
    process.env.PSQL ?? 'psql',
    [databaseUrl, '-X', '-v', 'ON_ERROR_STOP=1', '-At', '-c', sql],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        PGAPPNAME: 'rc1-staging-postflight-hardening-tests',
      },
    },
  );
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  if (expectFailure) {
    assert.notEqual(result.status, 0, `expected SQL failure, received success:\n${output}`);
    assert(
      output.includes(expected),
      `SQL failed for the wrong reason; expected ${expected}:\n${output}`,
    );
  } else {
    assert.equal(result.status, 0, `SQL failed:\n${output}`);
  }
  return output.trim();
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

assert.equal(manifest.migration_count_after, 45);
assert.equal(manifest.newest_migration, '20260728191000');
assert.equal(manifest.launch_required_indexes.length, 45);
assert.equal(
  manifest.rpc_semantic_map.pre_correction_sha256,
  'ba42238468cacf4697fb0c95925e3549ffa05d978dd6e304e4098e8d1e9ff1ed',
);
assert.equal(
  manifest.rpc_semantic_map.post_correction_sha256,
  manifest.rpc_semantic_map.pre_correction_sha256,
);

const migrationFiles = fs
  .readdirSync(path.join(root, 'supabase', 'migrations'))
  .filter((name) => name.endsWith('.sql'))
  .sort();
assert.equal(migrationFiles.length, 47, 'canonical migration directory must contain 47 SQL files');
assert.equal(
  migrationFiles.at(-3),
  '20260728191000_rc1_launch_required_foreign_key_indexes.sql',
);
assert.equal(
  migrationFiles.at(-2),
  '20260729113242_rc1_service_role_privilege_contract.sql',
);
assert.equal(
  migrationFiles.at(-1),
  '20260729170000_rc1_authenticated_admin_profile_read.sql',
);
assert.equal(
  sha256(aclMigration),
  manifest.migrations[
    '20260728190000_rc1_staging_postflight_least_privilege.sql'
  ].sha256,
);
assert.equal(
  sha256(indexMigration),
  manifest.migrations[
    '20260728191000_rc1_launch_required_foreign_key_indexes.sql'
  ].sha256,
);
assert.doesNotMatch(
  aclMigration,
  /create\s+(?:or\s+replace\s+)?function\s+public\.(?:authorize_bounced_report_redelivery|invalidate_phase14_authority_on_gate_change|rls_auto_enable)/i,
  'ACL migration must not replace a corrected function',
);

const indexNames = new Set();
const constraintNames = new Set();
for (const item of manifest.launch_required_indexes) {
  assert(!indexNames.has(`${item.schema}.${item.index}`), `duplicate index name ${item.index}`);
  assert(!constraintNames.has(item.constraint), `duplicate constraint ${item.constraint}`);
  indexNames.add(`${item.schema}.${item.index}`);
  constraintNames.add(item.constraint);
  assert(Buffer.byteLength(item.index) <= 63, `index name exceeds PostgreSQL limit: ${item.index}`);
  const tuple = [
    sqlLiteral(item.schema),
    sqlLiteral(item.table),
    sqlLiteral(item.constraint),
    sqlLiteral(item.index),
  ].join(',');
  assert(
    indexMigration.includes(tuple),
    `index migration is missing manifest tuple ${item.constraint}`,
  );
}

const approvedValues = manifest.launch_required_indexes
  .map((item) => `(
    ${sqlLiteral(item.schema)},
    ${sqlLiteral(item.table)},
    ${sqlLiteral(item.constraint)},
    ${sqlLiteral(item.index)},
    array[${item.columns.map(sqlLiteral).join(',')}]::text[]
  )`)
  .join(',\n');

const indexEvidence = JSON.parse(runSql(`
  with approved(schema_name,table_name,constraint_name,index_name,expected_columns) as (
    values ${approvedValues}
  ),
  checked as (
    select
      a.*,
      array(
        select att.attname
        from unnest(con.conkey) with ordinality key(attnum,position)
        join pg_attribute att
          on att.attrelid=con.conrelid and att.attnum=key.attnum
        order by key.position
      ) as constraint_columns,
      array(
        select att.attname
        from generate_series(1,ix.indnkeyatts) position
        join pg_attribute att
          on att.attrelid=ix.indrelid
         and att.attnum=(string_to_array(ix.indkey::text,' ')::smallint[])[position]
        order by position
      ) as index_columns,
      am.amname as method,
      ix.indisunique,
      ix.indisprimary,
      ix.indisvalid,
      ix.indisready,
      ix.indpred is null as no_predicate,
      ix.indexprs is null as no_expressions
    from approved a
    join pg_namespace n on n.nspname=a.schema_name
    join pg_class t on t.relnamespace=n.oid and t.relname=a.table_name
    join pg_constraint con
      on con.conrelid=t.oid and con.conname=a.constraint_name and con.contype='f'
    join pg_class idx
      on idx.relnamespace=n.oid and idx.relname=a.index_name and idx.relkind='i'
    join pg_index ix on ix.indexrelid=idx.oid and ix.indrelid=t.oid
    join pg_am am on am.oid=idx.relam
  )
  select jsonb_agg(to_jsonb(checked) order by schema_name,table_name,constraint_name)
  from checked;
`));

assert.equal(indexEvidence.length, 45, 'exactly 45 approved indexes must exist');
for (const row of indexEvidence) {
  assert.deepEqual(row.constraint_columns, row.expected_columns, `${row.constraint_name} changed`);
  assert.deepEqual(row.index_columns, row.expected_columns, `${row.index_name} does not cover FK prefix`);
  assert.equal(row.method, 'btree');
  assert.equal(row.indisunique, false);
  assert.equal(row.indisprimary, false);
  assert.equal(row.indisvalid, true);
  assert.equal(row.indisready, true);
  assert.equal(row.no_predicate, true);
  assert.equal(row.no_expressions, true);
}

const duplicateDefinitionCount = Number(runSql(`
  with expected(index_oid,table_oid,indkey,indclass,indcollation) as (
    select idx.oid,ix.indrelid,ix.indkey::text,ix.indclass::text,ix.indcollation::text
    from (values ${approvedValues}) a(schema_name,table_name,constraint_name,index_name,expected_columns)
    join pg_namespace n on n.nspname=a.schema_name
    join pg_class idx on idx.relnamespace=n.oid and idx.relname=a.index_name
    join pg_index ix on ix.indexrelid=idx.oid
  )
  select count(*)
  from expected e
  join pg_index other
    on other.indrelid=e.table_oid
   and other.indexrelid<>e.index_oid
   and other.indkey::text=e.indkey
   and other.indclass::text=e.indclass
   and other.indcollation::text=e.indcollation
   and other.indpred is null
   and other.indexprs is null;
`));
assert.equal(duplicateDefinitionCount, 0, 'no redundant index definition may be added');

const advisorDelta = JSON.parse(runSql(`
  with approved(constraint_name) as (
    values ${manifest.launch_required_indexes.map((item) => `(${sqlLiteral(item.constraint)})`).join(',')}
  ),
  unindexed as (
    select con.conname as constraint_name
    from pg_constraint con
    where con.contype='f'
      and con.connamespace in ('public'::regnamespace,'phase14_private'::regnamespace)
      and not exists (
        select 1
        from pg_index ix
        where ix.indrelid=con.conrelid
          and ix.indisvalid
          and ix.indisready
          and (string_to_array(ix.indkey::text,' ')::smallint[])[1:cardinality(con.conkey)]
              = con.conkey
      )
  )
  select jsonb_build_object(
    'remaining_unindexed', (select count(*) from unindexed),
    'approved_remaining', (
      select count(*) from unindexed u join approved a using(constraint_name)
    )
  );
`));
assert.equal(Number(advisorDelta.approved_remaining), 0);
assert.equal(Number(advisorDelta.remaining_unindexed), 46);

const aclRows = JSON.parse(runSql(`
  with targets(signature) as (
    values
      ('public.authorize_bounced_report_redelivery(uuid,uuid,text)'),
      ('public.invalidate_phase14_authority_on_gate_change()')
  )
  select jsonb_agg(jsonb_build_object(
    'signature',signature,
    'public',has_function_privilege('public',signature,'EXECUTE'),
    'anon',has_function_privilege('anon',signature,'EXECUTE'),
    'authenticated',has_function_privilege('authenticated',signature,'EXECUTE'),
    'service_role',has_function_privilege('service_role',signature,'EXECUTE'),
    'owner',has_function_privilege('postgres',signature,'EXECUTE'),
    'public_acl_entry',exists(
      select 1 from aclexplode(p.proacl) acl where acl.grantee=0
    ),
    'anon_acl_entry',exists(
      select 1 from aclexplode(p.proacl) acl where acl.grantee='anon'::regrole
    ),
    'authenticated_acl_entry',exists(
      select 1 from aclexplode(p.proacl) acl where acl.grantee='authenticated'::regrole
    ),
    'service_role_acl_entry',exists(
      select 1 from aclexplode(p.proacl) acl where acl.grantee='service_role'::regrole
    )
  ) order by signature)
  from targets
  join pg_proc p on p.oid=signature::regprocedure;
`));

const bounceAcl = aclRows.find((row) =>
  row.signature.includes('authorize_bounced_report_redelivery'));
assert.deepEqual(
  {
    public: bounceAcl.public,
    anon: bounceAcl.anon,
    authenticated: bounceAcl.authenticated,
    service_role: bounceAcl.service_role,
    owner: bounceAcl.owner,
  },
  { public: false, anon: false, authenticated: true, service_role: false, owner: true },
);
assert.equal(bounceAcl.public_acl_entry, false);
assert.equal(bounceAcl.anon_acl_entry, false);
assert.equal(bounceAcl.authenticated_acl_entry, true);
assert.equal(bounceAcl.service_role_acl_entry, false);

const triggerAcl = aclRows.find((row) =>
  row.signature.includes('invalidate_phase14_authority_on_gate_change'));
assert.deepEqual(
  {
    public: triggerAcl.public,
    anon: triggerAcl.anon,
    authenticated: triggerAcl.authenticated,
    service_role: triggerAcl.service_role,
    owner: triggerAcl.owner,
  },
  { public: false, anon: false, authenticated: false, service_role: false, owner: true },
);

const roleInheritance = JSON.parse(runSql(`
  select jsonb_build_object(
    'anon_is_authenticated_member', pg_has_role('anon','authenticated','MEMBER'),
    'anon_is_service_role_member', pg_has_role('anon','service_role','MEMBER'),
    'authenticated_is_service_role_member',
      pg_has_role('authenticated','service_role','MEMBER')
  );
`));
assert.deepEqual(roleInheritance, {
  anon_is_authenticated_member: false,
  anon_is_service_role_member: false,
  authenticated_is_service_role_member: false,
});

runSql(`
  begin;
  set local role anon;
  do $test$
  begin
    begin
      perform public.authorize_bounced_report_redelivery(
        null::uuid,
        null::uuid,
        null::text
      );
      raise exception 'rc1_acl_test:anon_bounce_unexpectedly_executed';
    exception when insufficient_privilege then
      null;
    end;
    begin
      perform public.invalidate_phase14_authority_on_gate_change();
      raise exception 'rc1_acl_test:anon_trigger_unexpectedly_executed';
    exception when insufficient_privilege then
      null;
    end;
  end;
  $test$;
  rollback;
`);

runSql(`
  begin;
  set local role authenticated;
  do $test$
  begin
    begin
      perform public.authorize_bounced_report_redelivery(
        null::uuid,
        null::uuid,
        null::text
      );
      raise exception 'rc1_acl_test:authenticated_without_context_unexpectedly_passed';
    exception when others then
      if sqlerrm like '%permission denied for function%' then
        raise;
      end if;
    end;
    begin
      perform public.invalidate_phase14_authority_on_gate_change();
      raise exception 'rc1_acl_test:authenticated_trigger_unexpectedly_executed';
    exception when insufficient_privilege then
      null;
    end;
  end;
  $test$;
  rollback;
`);

runSql(`
  begin;
  set local session_replication_role=replica;
  insert into public.admin_profiles(id,email,full_name,role,status,mfa_required)
  values (
    '45000000-0000-4000-8000-000000000001',
    'rc1-hardening-admin@example.invalid',
    'RC1 Hardening Admin',
    'platform_admin',
    'active',
    true
  );
  insert into auth.sessions(id,user_id,aal,not_after)
  values (
    '45000000-0000-4000-8000-000000000002',
    '45000000-0000-4000-8000-000000000001',
    'aal2',
    now()+interval '1 day'
  );
  set local session_replication_role=origin;
  set local role authenticated;
  select set_config(
    'request.jwt.claims',
    '{"sub":"45000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","exp":4102444800,"session_id":"45000000-0000-4000-8000-000000000002"}',
    true
  );
  do $test$
  begin
    begin
      perform public.authorize_bounced_report_redelivery(
        null::uuid,
        null::uuid,
        ''::text
      );
      raise exception 'rc1_acl_test:authorised_admin_empty_reason_unexpectedly_passed';
    exception when others then
      if sqlerrm like '%permission denied for function%' then
        raise;
      end if;
      if sqlerrm not like '%bounce_remediation_reason_required%'
        and sqlerrm not like '%phase14_security_gate_unsatisfied:%' then
        raise;
      end if;
    end;
  end;
  $test$;
  reset role;

  select public.rc1_release_freeze(
    'Disposable local trigger test.',
    repeat('a',64),
    1
  );
  select set_config(
    'request.jwt.claims',
    '{"sub":"45000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","exp":4102444800,"session_id":"45000000-0000-4000-8000-000000000002"}',
    true
  );
  select public.set_phase14_security_gate_version(
    1,
    'Disposable local trigger preparation.'
  );
  select public.set_phase14_feature_policy(
    'automatic_fulfilment',
    true,
    'Disposable local trigger preparation.'
  );
  select public.set_phase14_ai_route_policy('openai',true);
  select public.suspend_phase14_security_gate(
    'Disposable local trigger invalidation.'
  );
  do $test$
  begin
    if exists (
      select 1 from public.phase14_feature_policies where enabled
    ) or exists (
      select 1 from public.phase14_ai_route_policies where enabled
    ) then
      raise exception 'rc1_acl_test:gate_trigger_did_not_disable_policies';
    end if;
    if not exists (
      select 1 from public.audit_logs
      where action='phase14_authority_epoch_changed'
    ) then
      raise exception 'rc1_acl_test:gate_trigger_audit_missing';
    end if;
  end;
  $test$;
  rollback;
`);

const rlsFixture = `
  create or replace function public.rls_auto_enable()
  returns event_trigger
  language plpgsql
  security definer
  set search_path='pg_catalog'
  as $function$
  declare cmd record;
  begin
    for cmd in
      select * from pg_event_trigger_ddl_commands()
      where command_tag in ('CREATE TABLE','CREATE TABLE AS','SELECT INTO')
        and object_type in ('table','partitioned table')
    loop
      if cmd.schema_name='public' then
        execute format('alter table if exists %s enable row level security',cmd.object_identity);
      end if;
    end loop;
  end;
  $function$;
  create event trigger ensure_rls
    on ddl_command_end
    when tag in ('CREATE TABLE','CREATE TABLE AS','SELECT INTO')
    execute function public.rls_auto_enable();
`;

runSql(`
  begin;
  ${rlsFixture}
  ${aclMigration}
  do $test$
  begin
    if has_function_privilege('public','public.rls_auto_enable()','EXECUTE')
      or has_function_privilege('anon','public.rls_auto_enable()','EXECUTE')
      or has_function_privilege('authenticated','public.rls_auto_enable()','EXECUTE')
      or has_function_privilege('service_role','public.rls_auto_enable()','EXECUTE')
      or not has_function_privilege('postgres','public.rls_auto_enable()','EXECUTE') then
      raise exception 'rc1_acl_test:rls_auto_enable_acl_invalid';
    end if;
  end;
  $test$;
  set local role anon;
  do $test$
  begin
    begin
      perform public.rls_auto_enable();
      raise exception 'rc1_acl_test:anon_event_trigger_unexpectedly_executed';
    exception when insufficient_privilege then
      null;
    end;
  end;
  $test$;
  reset role;
  set local role authenticated;
  do $test$
  begin
    begin
      perform public.rls_auto_enable();
      raise exception 'rc1_acl_test:authenticated_event_trigger_unexpectedly_executed';
    exception when insufficient_privilege then
      null;
    end;
  end;
  $test$;
  reset role;
  create table public.rc1_hardening_disposable_rls_probe(id bigint primary key);
  do $test$
  begin
    if not (
      select relrowsecurity
      from pg_class
      where oid='public.rc1_hardening_disposable_rls_probe'::regclass
    ) then
      raise exception 'rc1_acl_test:rls_event_trigger_did_not_enable_rls';
    end if;
  end;
  $test$;
  rollback;
`);

// Safe retry: both migrations must accept their exact successful end state.
runSql(`${aclMigration}\n${indexMigration}`);

// A conflicting definition under an approved name must abort atomically.
runSql(`
  begin;
  drop index public.payment_proofs_order_id_idx;
  create index payment_proofs_order_id_idx
    on public.payment_proofs(reviewed_by);
  ${indexMigration}
  rollback;
`, {
  expectFailure: true,
  expected: 'rc1_launch_fk_indexes:conflicting_named_index',
});
assert.equal(
  runSql(`
    select pg_get_indexdef('public.payment_proofs_order_id_idx'::regclass)
      like '%(order_id)%';
  `),
  't',
  'failed conflict test must roll back without partial completion',
);

const fulfilmentPlan = runSql(`
  set enable_seqscan=off;
  explain (costs off)
  select *
  from public.report_generation_claims
  where fulfilment_id='00000000-0000-0000-0000-000000000000';
`);
assert(
  fulfilmentPlan.includes('report_generation_claims_fulfilment_id_idx'),
  'representative fulfilment plan must be able to use the approved index',
);
const deliveryPlan = runSql(`
  set enable_seqscan=off;
  explain (costs off)
  select *
  from public.report_delivery_authorizations
  where worker_capability_id='00000000-0000-0000-0000-000000000000';
`);
assert(
  deliveryPlan.includes('report_delivery_authorizations_worker_capability_id_idx'),
  'representative delivery plan must be able to use the approved index',
);

console.log('PASS RC1 staging postflight hardening preserved: ACLs, triggers, 45 FK indexes, retry, conflict and advisor delta; canonical history now has additive migrations 46 and 47');
