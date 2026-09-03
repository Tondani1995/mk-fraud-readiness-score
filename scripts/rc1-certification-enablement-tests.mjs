/**
 * RC1 certification-enablement contract.
 *
 * Both RC1 certification flags are inert until an operator grants them, and nothing could grant
 * them through an audited path: update_phase14_feature_policy refuses every key except the two
 * Phase 14 settings, leaving only a direct database edit or service_role -- neither authorised nor
 * audited. This control closes that gap, and these checks pin that it stays narrow.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const { createRc1CertificationEnablementPost } = await import('../src/lib/rc1/control-plane.ts');

const root = process.cwd();
const migration = fs.readFileSync(
  path.join(root, 'supabase', 'migrations', '20260801180000_rc1_certification_enablement_control.sql'), 'utf8');
const routeFile = fs.readFileSync(
  path.join(root, 'src', 'app', 'score', 'api', 'admin', 'rc1-certification-enablement', 'route.ts'), 'utf8');

const operator = { accessToken: 'enablement-access-token', role: 'platform_admin', aal: 'aal2' };
const REASON = 'Temporary staging-only orphan remediation for RC1 final certification zero-baseline preparation.';

function request(body) {
  return new Request('http://127.0.0.1/score/api/admin/rc1-certification-enablement', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function dependencies({ identity = operator, response, error = null } = {}) {
  const calls = [];
  return { calls, value: {
    resolveOperator: async () => identity,
    rpc: async (token, name, args = {}) => { calls.push({ token, name, args }); return { data: response, error }; },
  } };
}

let failures = 0; let total = 0;
async function test(name, fn) {
  total += 1;
  try { await fn(); console.log(`  ok - ${name}`); }
  catch (error) { failures += 1; console.log(`  FAIL - ${name}`); console.log(`    ${String(error?.message ?? error).split('\n').slice(0,5).join('\n    ')}`); }
}

console.log('RC1 -- certification enablement');

await test('N1. only the two RC1 certification keys are reachable', async () => {
  assert.match(migration, /p_setting_key not in \('rc1_synthetic_certification_cleanup', 'rc1_orphan_remediation'\)/);
  assert.match(migration, /rc1_certification_enablement:setting_key_forbidden/);
  for (const settingKey of [
    'phase14_autonomous_report_engine', 'phase14_delivery_policy', 'v2_phase1_manual_fulfilment',
    'phase5_methodology_seed', 'admin_notification_email', '', 'rc1_orphan_remediation ',
  ]) {
    const deps = dependencies();
    const response = await createRc1CertificationEnablementPost(deps.value)(
      request({ settingKey, enabled: true, reason: REASON }));
    if (settingKey === 'rc1_orphan_remediation ') {
      // Trimmed, so this one is the allowed key and must reach the database.
      assert.equal(deps.calls.length, 1);
      continue;
    }
    assert.equal(response.status, 400, `key ${JSON.stringify(settingKey)} was not refused`);
    assert.equal(deps.calls.length, 0, 'a forbidden key must never reach the database');
  }
});

await test('N2. the allow-list is checked before anything else in the database', () => {
  const body = migration.slice(migration.indexOf('as $$'), migration.indexOf('$$;'));
  const keyCheck = body.indexOf('setting_key_forbidden');
  const authority = body.indexOf('rc1_require_platform_admin(true)');
  assert.ok(keyCheck > 0 && authority > 0);
  assert.ok(keyCheck < authority, 'no other setting may be reachable even momentarily');
});

await test('N3. platform_admin is required in the wrapper and AAL2 is enforced by the database', async () => {
  assert.match(migration, /v_actor := public\.rc1_require_platform_admin\(true\)/);
  assert.doesNotMatch(migration, /rc1_require_platform_admin\(false\)/);
  for (const [identity, expected] of [
    [null, 'RC1_CONTROL_SESSION_REQUIRED'],
    [{ ...operator, role: 'finance_admin' }, 'RC1_CONTROL_PLATFORM_ADMIN_REQUIRED'],
  ]) {
    const deps = dependencies({ identity });
    const response = await createRc1CertificationEnablementPost(deps.value)(
      request({ settingKey: 'rc1_orphan_remediation', enabled: true, reason: REASON }));
    assert.equal((await response.json()).error, expected);
    assert.equal(deps.calls.length, 0);
  }
});

await test('N4. the wrapper does not own a global application freeze', async () => {
  assert.doesNotMatch(routeFile, /operation-freeze|MK_RC1_OPERATION_FREEZE_MODE|RC1_OPERATION_FROZEN/);
  assert.match(migration, /rc1_operation_freeze_state/);
  assert.match(migration, /app_settings is on the activation_control freeze surface/);
});

await test('N5. a meaningful reason and explicit state are required', async () => {
  for (const body of [
    { settingKey: 'rc1_orphan_remediation', enabled: true },
    { settingKey: 'rc1_orphan_remediation', enabled: true, reason: 'too short' },
    { settingKey: 'rc1_orphan_remediation', reason: REASON },
    { settingKey: 'rc1_orphan_remediation', enabled: 'yes', reason: REASON },
  ]) {
    const deps = dependencies();
    const response = await createRc1CertificationEnablementPost(deps.value)(request(body));
    assert.equal(response.status, 400, `not refused: ${JSON.stringify(body)}`);
    assert.equal(deps.calls.length, 0);
  }
  assert.match(migration, /rc1_certification_enablement:meaningful_reason_required/);
  assert.match(migration, /rc1_certification_enablement:enabled_required/);
});

await test('N6. granting and withdrawing both work through the same audited path', async () => {
  for (const enabled of [true, false]) {
    const deps = dependencies({ response: { setting_key: 'rc1_orphan_remediation', enabled, scope: 'staging_certification_only' } });
    const response = await createRc1CertificationEnablementPost(deps.value)(
      request({ settingKey: 'rc1_orphan_remediation', enabled, reason: REASON }));
    const payload = await response.json();
    assert.equal(response.status, 200);
    assert.equal(payload.enabled, enabled);
    assert.deepEqual(deps.calls[0].args, {
      p_setting_key: 'rc1_orphan_remediation', p_enabled: enabled, p_reason: REASON });
  }
});

await test('N7. the audit stores fingerprints and state only', () => {
  const table = migration.slice(
    migration.indexOf('create table if not exists public.rc1_certification_enablement_audit'),
    migration.indexOf('alter table public.rc1_certification_enablement_audit'));
  for (const column of ['setting_key', 'enabled', 'reason_fingerprint', 'actor_fingerprint', 'freeze_epoch']) {
    assert.ok(table.includes(column), `audit is missing ${column}`);
  }
  for (const forbidden of ['reason text', 'email', 'recipient', 'user_id', 'session']) {
    assert.equal(table.includes(forbidden), false, `audit must not store ${forbidden}`);
  }
  assert.match(table, /setting_key in \('rc1_synthetic_certification_cleanup', 'rc1_orphan_remediation'\)/);
  assert.match(migration, /alter table public\.rc1_certification_enablement_audit enable row level security/);
  // The stored setting value carries a fingerprint, never the reason text or an identity.
  assert.match(migration, /'authorised_by_fingerprint', v_actor_fingerprint/);
  assert.doesNotMatch(migration, /'reason', v_reason\b/);
});

await test('N8. service_role holds no privilege and only authenticated may execute', () => {
  assert.ok(migration.includes("revoke all on function public.rc1_set_certification_enablement(text,boolean,text)\n  from public, anon, authenticated, service_role"));
  assert.match(migration, /grant execute on function public\.rc1_set_certification_enablement\(text,boolean,text\) to authenticated;/);
  assert.doesNotMatch(migration, /grant[^;]*\bto\b[^;]*(?:anon|service_role|public)\b/i);
  assert.match(migration, /security definer/i);
  assert.match(migration, /set search_path = ''/);
});

await test('N9. the migration enables nothing by itself', () => {
  const executable = migration.split('\n').filter((line) => !line.trimStart().startsWith('--')).join('\n');
  assert.doesNotMatch(executable, /insert into public\.app_settings\s*\(setting_key, value_json\)\s*\n\s*values \('rc1_/,
    'the migration must not grant either flag');
  assert.doesNotMatch(executable, /delete from|drop table|drop function/i);
});

await test('N10. refusals are classified and the route stays thin', async () => {
  const deps = dependencies({ error: { message: 'ERROR: rc1_certification_enablement:setting_key_forbidden\nDETAIL: nomsa@example.test' } });
  const response = await createRc1CertificationEnablementPost(deps.value)(
    request({ settingKey: 'rc1_orphan_remediation', enabled: true, reason: REASON }));
  const payload = await response.json();
  assert.equal(payload.reason, 'rc1_certification_enablement:setting_key_forbidden');
  assert.equal(JSON.stringify(payload).includes('nomsa@example.test'), false);
  assert.match(routeFile, /createRc1CertificationEnablementPost/);
  assert.ok(routeFile.split('\n').filter((line) => line.trim()).length <= 8);
});

console.log('');
console.log(`rc1-certification-enablement: ${total - failures}/${total} checks passed`);
if (failures > 0) process.exit(1);
