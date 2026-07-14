import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));
const normalizeSql = (sql) => sql.replace(/\s+/g, ' ').trim().toLowerCase();

function walk(dir) {
  const absolute = path.join(root, dir);
  if (!fs.existsSync(absolute)) return [];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(rel);
    return /\.(ts|tsx|js|mjs)$/.test(entry.name) ? [rel] : [];
  });
}

function assertServiceRoleOnlyPosture(sql, signature) {
  const compact = normalizeSql(sql);
  const normalizedSignature = normalizeSql(signature);
  for (const role of ['public', 'anon', 'authenticated']) {
    assert(
      compact.includes(`revoke execute on function ${normalizedSignature} from ${role}`),
      `${signature} must revoke EXECUTE from ${role}`
    );
  }
  assert(
    compact.includes(`grant execute on function ${normalizedSignature} to service_role`),
    `${signature} must grant EXECUTE to service_role`
  );
}

function assertAuthenticatedAdminHelperPosture(sql, signature) {
  const compact = normalizeSql(sql);
  const normalizedSignature = normalizeSql(signature);
  for (const role of ['public', 'anon']) {
    assert(
      compact.includes(`revoke execute on function ${normalizedSignature} from ${role}`),
      `${signature} must revoke EXECUTE from ${role}`
    );
  }
  assert(
    !compact.includes(`revoke execute on function ${normalizedSignature} from authenticated`),
    `${signature} must not revoke EXECUTE from authenticated because admin RLS policies invoke it`
  );
  for (const role of ['authenticated', 'service_role']) {
    assert(
      compact.includes(`grant execute on function ${normalizedSignature} to ${role}`),
      `${signature} must grant EXECUTE to ${role}`
    );
  }
}

const migrationPath = 'supabase/migrations/0020_phase14_privileged_function_grants.sql';
assert.equal(exists(migrationPath), true, 'Phase 14 privileged function grant migration must exist');
const migration = read(migrationPath);

for (const forbidden of [
  /create\s+table/i,
  /alter\s+table/i,
  /drop\s+table/i,
  /create\s+policy/i,
  /drop\s+policy/i,
  /create\s+or\s+replace\s+function/i,
  /drop\s+function/i,
  /create\s+trigger/i,
  /drop\s+trigger/i,
  /insert\s+into\s+public\.app_settings/i,
  /update\s+public\.app_settings/i
]) {
  assert.doesNotMatch(migration, forbidden, `0020 must stay grant/comment-only and avoid ${forbidden}`);
}
assert.match(migration, /DO\s+\$phase14_privileged_function_grants\$/i, '0020 must stay as one Supabase CLI replay-safe DO block');

assertServiceRoleOnlyPosture(migration, 'public.check_rate_limit(text, integer, integer)');
assertServiceRoleOnlyPosture(
  migration,
  'public.complete_score_run_atomic(uuid, uuid, public.score_run_type, text, uuid, jsonb, jsonb, jsonb, jsonb)'
);
assertAuthenticatedAdminHelperPosture(migration, 'public.current_admin_role()');
assertAuthenticatedAdminHelperPosture(migration, 'public.is_admin_role(public.admin_role[])');

const allMigrationSql = fs.readdirSync(path.join(root, 'supabase/migrations'))
  .filter((file) => file.endsWith('.sql'))
  .map((file) => read(`supabase/migrations/${file}`))
  .join('\n');
assert.match(allMigrationSql, /alter\s+table\s+public\.assessment_tokens\s+enable\s+row\s+level\s+security/i);
assert.match(allMigrationSql, /alter\s+table\s+public\.rate_limit_hits\s+enable\s+row\s+level\s+security/i);
assert.doesNotMatch(allMigrationSql, /create\s+policy\s+[^;]+\s+on\s+public\.assessment_tokens/i, 'assessment_tokens must remain deny-by-default with no public policy');
assert.doesNotMatch(allMigrationSql, /create\s+policy\s+[^;]+\s+on\s+public\.rate_limit_hits/i, 'rate_limit_hits must remain deny-by-default with no public policy');

const sourceFiles = walk('src');
const sources = Object.fromEntries(sourceFiles.map((file) => [file, read(file)]));
const filesContaining = (needle) => Object.entries(sources).filter(([, content]) => content.includes(needle)).map(([file]) => file);

assert.deepEqual(filesContaining("rpc('complete_score_run_atomic'"), ['src/lib/scoring/score-assessment.ts']);
assert.match(sources['src/lib/scoring/score-assessment.ts'], /createSupabaseServiceClient\(\)/, 'atomic scoring RPC must use the service-role client');
assert.deepEqual(filesContaining("rpc('check_rate_limit'"), ['src/lib/security/rate-limit.ts']);
assert.match(sources['src/lib/security/rate-limit.ts'], /createSupabaseServiceClient\(\)/, 'rate-limit RPC must use the service-role client');
assert.deepEqual(filesContaining("rpc('current_admin_role'"), [], 'current_admin_role must not be directly called as an app RPC');
assert.deepEqual(filesContaining("rpc('is_admin_role'"), [], 'is_admin_role must not be directly called as an app RPC');

const phase14Migration = read('supabase/migrations/0017_phase14_autonomous_report_engine.sql');
for (const flag of [
  'premium_report_auto_fulfilment_enabled',
  'premium_report_ai_narrative_enabled',
  'premium_report_auto_email_enabled',
  'r50000_automation_enabled'
]) {
  assert.match(phase14Migration, new RegExp(`${flag}\\"\\s*:\\s*false`), `${flag} must remain off by default`);
}
assert.match(read('supabase/migrations/0001_phase2_v1_1_schema_rls.sql'), /create\s+extension\s+if\s+not\s+exists\s+citext/i, 'citext remains unchanged for a separate extension-hardening pass');

console.log('Phase 14 database security hardening static checks passed.');
