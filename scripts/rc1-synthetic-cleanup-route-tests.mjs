/**
 * RC1 synthetic-cleanup admin route contract.
 *
 * Section D added rc1_cleanup_synthetic_certification but no way to call it: the RPC is granted to
 * `authenticated` only and revoked from service_role, while the admin JWT is an httpOnly cookie, so
 * nothing in the application could invoke it. This route closes that gap and must stay a thin
 * transport -- every authority decision remains in the database function.
 *
 * Credential-free: the route factory is exercised with injected dependencies, and the
 * no-service-role-bypass and no-self-enablement properties are asserted by static analysis.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const { createRc1SyntheticCleanupPost } = await import('../src/lib/rc1/control-plane.ts');

const root = process.cwd();
const controlPlane = fs.readFileSync(path.join(root, 'src', 'lib', 'rc1', 'control-plane.ts'), 'utf8');
const routeFile = fs.readFileSync(
  path.join(root, 'src', 'app', 'score', 'api', 'admin', 'rc1-synthetic-cleanup', 'route.ts'),
  'utf8',
);
const cleanupMigration = fs.readFileSync(
  path.join(root, 'supabase', 'migrations', '20260730130000_rc1_synthetic_certification_cleanup.sql'),
  'utf8',
);

const REFERENCE = 'MKTEST-RC1-20260730-01';
const REASON = 'Remove the halted RC1 staging certification journey before an authorised clean rerun.';
const operator = { accessToken: 'synthetic-verified-access-token', role: 'platform_admin', aal: 'aal2' };

function request(body) {
  return new Request('http://127.0.0.1/score/api/admin/rc1-synthetic-cleanup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function dependencies({ identity = operator, response, error = null, frozen = false } = {}) {
  const calls = [];
  return {
    calls,
    value: {
      // The freeze check returns a ready-made response; the route only forwards it, so a stub is
      // sufficient here and keeps this suite free of a next/server import.
      freezeResponse: async () => (frozen
        ? { status: 423, json: async () => ({ ok: false, error: 'RC1_OPERATION_FROZEN' }) }
        : null),
      resolveOperator: async () => identity,
      rpc: async (token, name, args = {}) => {
        calls.push({ token, name, args });
        return { data: response, error };
      },
    },
  };
}

const okResponse = {
  reference: REFERENCE,
  already_clean: false,
  deleted: { organisations: 1, assessments: 1, orders: 1, email_events: 3, score_runs: 1 },
};

let failures = 0;
let total = 0;
async function test(name, fn) {
  total += 1;
  try {
    await fn();
    console.log(`  ok - ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`  FAIL - ${name}`);
    console.log(`    ${String(error?.message ?? error).split('\n').slice(0, 5).join('\n    ')}`);
  }
}

console.log('RC1 -- synthetic-cleanup admin route');

// 1
await test('A1. a frozen operation surface refuses the cleanup', async () => {
  const deps = dependencies({ frozen: true });
  const response = await createRc1SyntheticCleanupPost(deps.value)(request({ reference: REFERENCE, reason: REASON }));
  const body = await response.json();
  assert.equal(response.status, 423);
  assert.equal(body.error, 'RC1_OPERATION_FROZEN');
  assert.equal(deps.calls.length, 0, 'a frozen surface must not reach the database');
});

// 2
await test('A2. an unauthenticated caller is denied', async () => {
  const deps = dependencies({ identity: null });
  const response = await createRc1SyntheticCleanupPost(deps.value)(request({ reference: REFERENCE, reason: REASON }));
  const body = await response.json();
  assert.equal(response.status, 401);
  assert.equal(body.error, 'RC1_CONTROL_SESSION_REQUIRED');
  assert.equal(deps.calls.length, 0);
});

// 3
await test('A3. a non-platform-admin is denied', async () => {
  const deps = dependencies({ identity: { ...operator, role: 'finance_admin' } });
  const response = await createRc1SyntheticCleanupPost(deps.value)(request({ reference: REFERENCE, reason: REASON }));
  const body = await response.json();
  assert.equal(response.status, 403);
  assert.equal(body.error, 'RC1_CONTROL_PLATFORM_ADMIN_REQUIRED');
  assert.equal(deps.calls.length, 0);
});

// 4
await test('A4. an AAL1 session is denied', async () => {
  const deps = dependencies({ identity: { ...operator, aal: 'aal1' } });
  const response = await createRc1SyntheticCleanupPost(deps.value)(request({ reference: REFERENCE, reason: REASON }));
  const body = await response.json();
  assert.equal(response.status, 403);
  assert.equal(body.error, 'RC1_CONTROL_AAL2_REQUIRED');
  assert.equal(deps.calls.length, 0);
});

// 5 + 11
await test('A5. any reference outside the MKTEST-RC1- shape is refused before the database', async () => {
  for (const reference of [
    'MKORD-2026-NIM2NUTD', 'MKFRS-2026-2B998B42A0', 'MKTEST-RC1-2026073-01',
    'MKTEST-RC1-20260730-1', 'mktest-rc1-20260730-01', 'MKTEST-RC1-20260730-01x',
    '', null, 42, 'MKTEST-RC1-20260730-01; drop table public.orders',
  ]) {
    const deps = dependencies();
    const response = await createRc1SyntheticCleanupPost(deps.value)(request({ reference, reason: REASON }));
    const body = await response.json();
    assert.equal(response.status, 400, `reference ${JSON.stringify(reference)} was not refused`);
    assert.equal(body.error, 'RC1_CLEANUP_REFERENCE_NOT_SYNTHETIC');
    assert.equal(deps.calls.length, 0, 'a non-synthetic reference must never reach the database');
  }
});

// 6
await test('A6. a missing or too-short reason is refused', async () => {
  for (const reason of [undefined, null, '', '   ', 'too short', 'x'.repeat(501)]) {
    const deps = dependencies();
    const response = await createRc1SyntheticCleanupPost(deps.value)(request({ reference: REFERENCE, reason }));
    const body = await response.json();
    assert.equal(response.status, 400, `reason ${JSON.stringify(reason)} was not refused`);
    assert.equal(body.error, 'RC1_CONTROL_REASON_REQUIRED');
    assert.equal(deps.calls.length, 0);
  }
});

// 7 (environment enablement is a database decision; the route surfaces it as a refusal)
await test('A7. a disabled cleanup environment is surfaced as a refusal, not a success', async () => {
  const deps = dependencies({ error: { message: 'rc1_synthetic_cleanup:not_enabled_in_this_environment' } });
  const response = await createRc1SyntheticCleanupPost(deps.value)(request({ reference: REFERENCE, reason: REASON }));
  const body = await response.json();
  assert.equal(response.status, 409);
  assert.equal(body.error, 'RC1_CLEANUP_REFUSED');
  // The raw database message must not be echoed back to the caller.
  assert.equal(JSON.stringify(body).includes('not_enabled_in_this_environment'), false);
});

// 8
await test('A8. a valid AAL2 platform admin invokes the RPC with the operator JWT', async () => {
  const deps = dependencies({ response: okResponse });
  await createRc1SyntheticCleanupPost(deps.value)(request({ reference: REFERENCE, reason: REASON }));
  assert.equal(deps.calls.length, 1);
  assert.equal(deps.calls[0].name, 'rc1_cleanup_synthetic_certification');
  assert.equal(deps.calls[0].token, operator.accessToken, 'must call through the operator JWT');
  assert.deepEqual(deps.calls[0].args, { p_reference: REFERENCE, p_reason: REASON });
});

// 9
await test('A9. success returns only the reference, already_clean and safe integer counts', async () => {
  const deps = dependencies({ response: okResponse });
  const response = await createRc1SyntheticCleanupPost(deps.value)(request({ reference: REFERENCE, reason: REASON }));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(body).sort(), ['already_clean', 'deleted', 'ok', 'reference']);
  assert.equal(body.reference, REFERENCE);
  assert.equal(body.already_clean, false);
  assert.equal(body.deleted.organisations, 1);
  assert.equal(body.deleted.email_events, 3);
  for (const value of Object.values(body.deleted)) assert.equal(Number.isSafeInteger(value), true);
});

// 10
await test('A10. an exact retry of a completed cleanup is a recorded no-op', async () => {
  const deps = dependencies({ response: { reference: REFERENCE, already_clean: true, deleted: {} } });
  const response = await createRc1SyntheticCleanupPost(deps.value)(request({ reference: REFERENCE, reason: REASON }));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.already_clean, true);
  assert.deepEqual(body.deleted, {});
});

// 12
await test('A12. the route has no service-role path around the RPC authority model', () => {
  assert.doesNotMatch(routeFile, /createSupabaseServiceClient|SUPABASE_SERVICE_ROLE_KEY/);
  const factory = controlPlane.split('export function createRc1SyntheticCleanupPost')[1];
  assert.doesNotMatch(factory, /createSupabaseServiceClient|SUPABASE_SERVICE_ROLE_KEY|service_role/i);
  // The RPC itself is revoked from service_role, so no caller can take that path.
  assert.match(
    cleanupMigration,
    /revoke all on function public\.rc1_cleanup_synthetic_certification\(text,text\)\s*\n\s*from public, anon, authenticated, service_role/i,
  );
  assert.match(
    cleanupMigration,
    /grant execute on function public\.rc1_cleanup_synthetic_certification\(text,text\) to authenticated/i,
  );
  assert.doesNotMatch(
    cleanupMigration,
    /grant execute on function public\.rc1_cleanup_synthetic_certification\(text,text\) to (?:anon|service_role)/i,
  );
});

// 13
await test('A13. the route logs nothing and cannot echo raw database payload', async () => {
  const factory = controlPlane.split('export function createRc1SyntheticCleanupPost')[1];
  assert.doesNotMatch(factory, /console\./, 'the cleanup route must not log');
  for (const forbidden of [/accessToken/, /cookie/i, /jwt/i, /secret/i, /customer/i, /email_address/i]) {
    assert.doesNotMatch(factory, forbidden, `route must not reference ${forbidden}`);
  }
  // A hostile or malformed RPC payload cannot widen the response.
  const deps = dependencies({
    response: {
      reference: REFERENCE,
      already_clean: false,
      deleted: {
        organisations: 1,
        'customer email': 'nomsa@example.test',
        report_html: '<html>secret narrative</html>',
        NotSafeKey: 5,
        negative: -3,
        floaty: 1.5,
      },
      raw_sql: 'delete from public.orders',
      access_token: 'must-never-appear',
    },
  });
  const response = await createRc1SyntheticCleanupPost(deps.value)(request({ reference: REFERENCE, reason: REASON }));
  const body = await response.json();
  const serialised = JSON.stringify(body);
  assert.deepEqual(Object.keys(body).sort(), ['already_clean', 'deleted', 'ok', 'reference']);
  assert.deepEqual(Object.keys(body.deleted), ['organisations'], 'only safe integer counts survive');
  for (const leak of ['nomsa@example.test', 'secret narrative', 'must-never-appear', 'delete from', 'report_html']) {
    assert.equal(serialised.includes(leak), false, `response leaked ${leak}`);
  }
});

// 14
await test('A14. cleanup stays disabled by default, so Production is unaffected by this route', () => {
  assert.match(cleanupMigration, /rc1_synthetic_cleanup:not_enabled_in_this_environment/);
  assert.match(cleanupMigration, /setting_key = 'rc1_synthetic_certification_cleanup'/);
  assert.doesNotMatch(
    cleanupMigration, /insert into public\.app_settings/i,
    'the migration must never enable itself in any environment',
  );
});

await test('A15. a malformed or unexpected RPC response is refused rather than trusted', async () => {
  for (const response of [null, 'ok', [], { reference: 'MKTEST-RC1-20260730-02', already_clean: false }, { reference: REFERENCE }]) {
    const deps = dependencies({ response });
    const result = await createRc1SyntheticCleanupPost(deps.value)(request({ reference: REFERENCE, reason: REASON }));
    assert.ok([409, 502].includes(result.status), `unexpected status ${result.status}`);
  }
});

await test('A16. the route file stays a thin wrapper over the shared factory', () => {
  assert.match(routeFile, /createRc1SyntheticCleanupPost/);
  assert.match(routeFile, /export const runtime = 'nodejs'/);
  assert.match(routeFile, /export const dynamic = 'force-dynamic'/);
  assert.ok(routeFile.split('\n').filter((line) => line.trim()).length <= 8, 'route must stay thin');
});

console.log('');
console.log(`rc1-synthetic-cleanup-route: ${total - failures}/${total} checks passed`);
if (failures > 0) process.exit(1);
