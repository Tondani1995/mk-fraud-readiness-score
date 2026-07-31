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
import crypto from 'node:crypto';
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
const storageClosure = fs.readFileSync(
  path.join(root, 'supabase', 'migrations', '20260731170000_rc1_synthetic_storage_cleanup_closure.sql'),
  'utf8',
);

const REFERENCE = 'MKTEST-RC1-20260730-01';
const REASON = 'Remove the halted RC1 staging certification journey before an authorised clean rerun.';
const operator = { accessToken: 'synthetic-verified-access-token', role: 'platform_admin', aal: 'aal2' };

// One Essential PDF, which is what a certification journey produces. The fingerprint is computed
// here the same way the database computes it, so the fixture cannot drift from the contract.
const TARGET = { bucket: 'generated-reports', path: 'rc1/MKTEST-RC1-20260730-01/essential-report.pdf' };
function targetFingerprint(targets) {
  const joined = [...targets]
    .map((target) => `${target.bucket}\n${target.path}`)
    .sort()
    .join('\n');
  return crypto.createHash('sha256').update(joined, 'utf8').digest('hex');
}
const EMPTY_FINGERPRINT = crypto.createHash('sha256').update('', 'utf8').digest('hex');

function resolutionFor(targets) {
  return {
    reference: REFERENCE,
    target_count: targets.length,
    target_fingerprint: targets.length === 0 ? EMPTY_FINGERPRINT : targetFingerprint(targets),
    targets,
  };
}

function request(body) {
  return new Request('http://127.0.0.1/score/api/admin/rc1-synthetic-cleanup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function dependencies({
  identity = operator,
  response,
  error = null,
  frozen = false,
  resolution = resolutionFor([TARGET]),
  resolutionError = null,
  storageOutcome = 'removed',
} = {}) {
  const calls = [];
  const storageCalls = [];
  return {
    calls,
    storageCalls,
    value: {
      // The freeze check returns a ready-made response; the route only forwards it, so a stub is
      // sufficient here and keeps this suite free of a next/server import.
      freezeResponse: async () => (frozen
        ? { status: 423, json: async () => ({ ok: false, error: 'RC1_OPERATION_FROZEN' }) }
        : null),
      resolveOperator: async () => identity,
      rpc: async (token, name, args = {}) => {
        calls.push({ token, name, args });
        if (name === 'rc1_prepare_synthetic_storage_cleanup') {
          return { data: resolution, error: resolutionError };
        }
        return { data: response, error };
      },
      removeStorageTargets: async (targets) => {
        storageCalls.push(targets.map((target) => ({ ...target })));
        return typeof storageOutcome === 'function' ? storageOutcome(targets) : storageOutcome;
      },
    },
  };
}

/** The prepare RPC is always call 0; the cleanup RPC, when reached, is always call 1. */
function rpcNames(deps) {
  return deps.calls.map((call) => call.name);
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
await test('A7. refusals are classified from a closed vocabulary, never raw database text', async () => {
  const cases = [
    ['rc1_synthetic_cleanup:not_enabled_in_this_environment', 'rc1_synthetic_cleanup:not_enabled_in_this_environment'],
    ['rc1_synthetic_cleanup:reference_not_synthetic', 'rc1_synthetic_cleanup:reference_not_synthetic'],
    ['rc1_freeze_control:aal2_required', 'rc1_freeze_control:aal2_required'],
    ['rc1_freeze_control:platform_admin_required', 'rc1_freeze_control:platform_admin_required'],
    ['rc1_operation_frozen:activation_control', 'rc1_operation_frozen'],
  ];
  for (const [message, expected] of cases) {
    const deps = dependencies({ error: { message: `ERROR: ${message}\nCONTEXT: PL/pgSQL function line 12` } });
    const response = await createRc1SyntheticCleanupPost(deps.value)(request({ reference: REFERENCE, reason: REASON }));
    const body = await response.json();
    assert.equal(response.status, 409);
    assert.equal(body.error, 'RC1_CLEANUP_REFUSED');
    assert.equal(body.reason, expected, `expected classified reason ${expected}`);
    // The surrounding raw database text must never be echoed.
    assert.equal(JSON.stringify(body).includes('PL/pgSQL'), false);
    assert.equal(JSON.stringify(body).includes('CONTEXT'), false);
  }
});

await test('A7b. an unknown database message collapses to unclassified and leaks nothing', async () => {
  const deps = dependencies({
    error: { message: 'ERROR: duplicate key value violates unique constraint "orders_pkey" DETAIL: Key (customer_email)=(nomsa@example.test) already exists.' },
  });
  const response = await createRc1SyntheticCleanupPost(deps.value)(request({ reference: REFERENCE, reason: REASON }));
  const body = await response.json();
  assert.equal(body.reason, 'unclassified');
  const serialised = JSON.stringify(body);
  for (const leak of ['nomsa@example.test', 'orders_pkey', 'DETAIL', 'duplicate key']) {
    assert.equal(serialised.includes(leak), false, `refusal leaked ${leak}`);
  }
});

// 8
await test('A8. a valid AAL2 platform admin invokes both RPCs with the operator JWT', async () => {
  const deps = dependencies({ response: okResponse });
  await createRc1SyntheticCleanupPost(deps.value)(request({ reference: REFERENCE, reason: REASON }));
  assert.deepEqual(rpcNames(deps), [
    'rc1_prepare_synthetic_storage_cleanup',
    'rc1_cleanup_synthetic_certification',
  ]);
  for (const call of deps.calls) {
    assert.equal(call.token, operator.accessToken, 'must call through the operator JWT');
  }
  assert.deepEqual(deps.calls[0].args, { p_reference: REFERENCE });
  assert.deepEqual(deps.calls[1].args, {
    p_reference: REFERENCE,
    p_reason: REASON,
    p_expected_target_fingerprint: targetFingerprint([TARGET]),
    p_expected_target_count: 1,
  });
});

// 9
await test('A9. success returns only the reference, already_clean and safe integer counts', async () => {
  const deps = dependencies({ response: okResponse });
  const response = await createRc1SyntheticCleanupPost(deps.value)(request({ reference: REFERENCE, reason: REASON }));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(body).sort(), ['already_clean', 'deleted', 'ok', 'reference', 'storage']);
  assert.equal(body.reference, REFERENCE);
  assert.equal(body.already_clean, false);
  assert.equal(body.deleted.organisations, 1);
  assert.equal(body.deleted.email_events, 3);
  for (const value of Object.values(body.deleted)) assert.equal(Number.isSafeInteger(value), true);
  assert.deepEqual(body.storage, { targets: 1, verified_absent: 1 });
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
  // The service role is used for the Storage API alone, in defaultRemoveStorageTargets. The
  // request handler itself must contain no service-role path at all.
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
  // Scoped to executable code: the comments explain which categories of data must never appear,
  // and that explanation must not be mistaken for a use of them.
  const executable = factory
    .split('\n')
    .filter((line) => !line.trim().startsWith('//') && !line.trim().startsWith('*'))
    .join('\n');
  for (const forbidden of [/accessToken/, /cookie/i, /jwt/i, /secret/i, /customer/i, /email_address/i]) {
    assert.doesNotMatch(executable, forbidden, `route must not reference ${forbidden}`);
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
  assert.deepEqual(Object.keys(body).sort(), ['already_clean', 'deleted', 'ok', 'reference', 'storage']);
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

// ---------------------------------------------------------------------------
// Storage closure
//
// 20260731130000 stopped deleting from storage.objects and started counting instead, which left
// the route deleting the report row while the PDF it named survived in a private bucket. These
// prove the three-step replacement: the database resolves the targets, the Storage API removes
// exactly those, and the database refuses to delete a row until that is proven.
// ---------------------------------------------------------------------------
await test('S1. targets are resolved by the database, never supplied by the browser', async () => {
  const deps = dependencies({ response: okResponse });
  await createRc1SyntheticCleanupPost(deps.value)(request({
    reference: REFERENCE,
    reason: REASON,
    // A hostile caller trying to name its own object.
    bucket: 'generated-reports',
    path: '../../etc/passwd',
    targets: [{ bucket: 'generated-reports', path: 'someone-elses-report.pdf' }],
    storage_bucket: 'avatars',
  }));
  assert.deepEqual(deps.calls[0].args, { p_reference: REFERENCE },
    'only the reference may reach target resolution');
  assert.equal(deps.storageCalls.length, 1);
  assert.deepEqual(deps.storageCalls[0], [TARGET], 'only the resolved target may be removed');
  // The request handler must not read any target-shaped field from the body.
  const factory = controlPlane.split('export function createRc1SyntheticCleanupPost')[1];
  for (const field of ['body.bucket', 'body.path', 'body.targets', 'body.storage_bucket', 'body.storagePath']) {
    assert.equal(factory.includes(field), false, `route must not read ${field}`);
  }
});

await test('S2. a refused resolution performs no Storage call and no database cleanup', async () => {
  const deps = dependencies({
    resolutionError: { message: 'ERROR: rc1_synthetic_cleanup:not_enabled_in_this_environment' },
  });
  const response = await createRc1SyntheticCleanupPost(deps.value)(request({ reference: REFERENCE, reason: REASON }));
  const body = await response.json();
  assert.equal(response.status, 409);
  assert.equal(body.error, 'RC1_CLEANUP_TARGET_RESOLUTION_REFUSED');
  assert.equal(body.reason, 'rc1_synthetic_cleanup:not_enabled_in_this_environment');
  assert.equal(deps.storageCalls.length, 0, 'no Storage call after a resolution failure');
  assert.deepEqual(rpcNames(deps), ['rc1_prepare_synthetic_storage_cleanup']);
});

await test('S3. an unsafe or inconsistent resolution is refused before any Storage call', async () => {
  const unsafe = [
    resolutionFor([{ bucket: 'generated-reports', path: '../../../etc/passwd' }]),
    resolutionFor([{ bucket: 'generated-reports', path: '/absolute/report.pdf' }]),
    resolutionFor([{ bucket: 'generated-reports', path: 'a\\b.pdf' }]),
    resolutionFor([{ bucket: 'generated-reports', path: '' }]),
    resolutionFor([{ bucket: 'generated-reports', path: 'x'.repeat(401) }]),
    resolutionFor([{ bucket: 'Generated-Reports', path: 'report.pdf' }]),
    resolutionFor([{ bucket: '', path: 'report.pdf' }]),
    resolutionFor([{ bucket: 'generated-reports', path: 'rep ort.pdf' }]),
    // Shape and consistency failures.
    { ...resolutionFor([TARGET]), target_count: 2 },
    { ...resolutionFor([TARGET]), target_fingerprint: 'not-a-fingerprint' },
    { ...resolutionFor([TARGET]), reference: 'MKTEST-RC1-20260730-02' },
    { ...resolutionFor([TARGET]), targets: 'generated-reports/report.pdf' },
    resolutionFor([TARGET, TARGET]),
    null,
    'ok',
  ];
  for (const resolution of unsafe) {
    const deps = dependencies({ resolution, response: okResponse });
    const response = await createRc1SyntheticCleanupPost(deps.value)(request({ reference: REFERENCE, reason: REASON }));
    const body = await response.json();
    assert.equal(response.status, 502, `resolution ${JSON.stringify(resolution)?.slice(0, 60)} was not refused`);
    assert.equal(body.error, 'RC1_CLEANUP_UNSAFE_STORAGE_TARGET');
    assert.equal(deps.storageCalls.length, 0, 'no Storage call after an unsafe resolution');
    assert.deepEqual(rpcNames(deps), ['rc1_prepare_synthetic_storage_cleanup']);
  }
});

await test('S4. the route enforces the journey-sized upper bound as well as the database', async () => {
  const many = Array.from({ length: 26 }, (unused, index) => ({
    bucket: 'generated-reports',
    path: `rc1/report-${index}.pdf`,
  }));
  const deps = dependencies({ resolution: resolutionFor(many), response: okResponse });
  const response = await createRc1SyntheticCleanupPost(deps.value)(request({ reference: REFERENCE, reason: REASON }));
  assert.equal(response.status, 502);
  assert.equal(deps.storageCalls.length, 0);
  assert.match(storageClosure, /c_target_limit constant integer := 25/);
  assert.match(storageClosure, /rc1_synthetic_cleanup:storage_target_limit_exceeded/);
});

await test('S5. a Storage removal failure prevents the database cleanup', async () => {
  const deps = dependencies({ storageOutcome: 'removal_failed', response: okResponse });
  const response = await createRc1SyntheticCleanupPost(deps.value)(request({ reference: REFERENCE, reason: REASON }));
  const body = await response.json();
  assert.equal(response.status, 502);
  assert.equal(body.error, 'RC1_CLEANUP_STORAGE_REMOVAL_FAILED');
  assert.deepEqual(rpcNames(deps), ['rc1_prepare_synthetic_storage_cleanup'],
    'the cleanup RPC must not be reached after a Storage failure');
});

await test('S6. an object still present prevents the database cleanup', async () => {
  const deps = dependencies({ storageOutcome: 'still_present', response: okResponse });
  const response = await createRc1SyntheticCleanupPost(deps.value)(request({ reference: REFERENCE, reason: REASON }));
  const body = await response.json();
  assert.equal(response.status, 502);
  assert.equal(body.error, 'RC1_CLEANUP_STORAGE_ABSENCE_UNVERIFIED');
  assert.deepEqual(rpcNames(deps), ['rc1_prepare_synthetic_storage_cleanup']);
});

await test('S7. Storage removal happens only after AAL2 authorisation', async () => {
  for (const identity of [null, { ...operator, role: 'finance_admin' }, { ...operator, aal: 'aal1' }]) {
    const deps = dependencies({ identity, response: okResponse });
    await createRc1SyntheticCleanupPost(deps.value)(request({ reference: REFERENCE, reason: REASON }));
    assert.equal(deps.storageCalls.length, 0, 'Storage must not be touched without AAL2 platform admin');
  }
  const frozen = dependencies({ frozen: true, response: okResponse });
  await createRc1SyntheticCleanupPost(frozen.value)(request({ reference: REFERENCE, reason: REASON }));
  assert.equal(frozen.storageCalls.length, 0, 'a frozen surface must not touch Storage');
  // Ordering in the source: resolution is awaited before the removal helper is ever called.
  const factory = controlPlane.split('export function createRc1SyntheticCleanupPost')[1];
  assert.ok(
    factory.indexOf('rc1_prepare_synthetic_storage_cleanup') < factory.indexOf('removeStorageTargets'),
    'targets must be resolved before anything is removed',
  );
  assert.ok(
    factory.indexOf('removeStorageTargets') < factory.indexOf('rc1_cleanup_synthetic_certification'),
    'objects must be removed before the database rows are deleted',
  );
});

await test('S8. the service role is used for the Storage API only, never to authorise', () => {
  const remover = controlPlane.split('async function defaultRemoveStorageTargets')[1].split('\n}')[0];
  assert.match(remover, /createSupabaseServiceClient/);
  assert.match(remover, /\.storage\s*\n?\s*\.?from\(target\.bucket\)|db\.storage\.from\(target\.bucket\)/);
  // It performs Storage calls and nothing else: no rpc, no table access, no auth.
  for (const forbidden of [/\.rpc\(/, /\.from\('/, /auth\./, /rc1_cleanup_synthetic_certification/, /rc1_prepare_/]) {
    assert.doesNotMatch(remover, forbidden, `the Storage remover must not use ${forbidden}`);
  }
  // And the database refuses it regardless of what the route does.
  assert.match(
    storageClosure,
    /revoke all on function public\.rc1_prepare_synthetic_storage_cleanup\(text\)\s*\n\s*from public, anon, authenticated, service_role/i,
  );
  assert.match(
    storageClosure,
    /revoke all on function public\.rc1_cleanup_synthetic_certification\(text,text,text,integer\)\s*\n\s*from public, anon, authenticated, service_role/i,
  );
  assert.doesNotMatch(storageClosure, /grant execute on function[^;]*to (?:anon|service_role|public)\b/i);
  for (const signature of [
    'public.rc1_prepare_synthetic_storage_cleanup(text) to authenticated',
    'public.rc1_cleanup_synthetic_certification(text,text,text,integer) to authenticated',
  ]) {
    assert.ok(storageClosure.includes(`grant execute on function ${signature}`), `missing grant: ${signature}`);
  }
});

await test('S9. an already-absent object is retryable, re-proving the target from report rows', async () => {
  // The provider reports not-found for both the delete and the absence check; the helper treats
  // that as removed, so a retry after a half-completed cleanup still reaches the database.
  const deps = dependencies({ storageOutcome: 'removed', response: okResponse });
  const response = await createRc1SyntheticCleanupPost(deps.value)(request({ reference: REFERENCE, reason: REASON }));
  assert.equal(response.status, 200);
  assert.deepEqual(rpcNames(deps), [
    'rc1_prepare_synthetic_storage_cleanup',
    'rc1_cleanup_synthetic_certification',
  ]);
  const remover = controlPlane.split('async function defaultRemoveStorageTargets')[1].split('\n}')[0];
  assert.match(remover, /classifySupabaseStorageResult\(error\) !== 'object_not_found'/);
  // Targets are always re-derived: the database recomputes them from the report rows that exist.
  assert.match(storageClosure, /into v_actual_count, v_actual_fingerprint/);
  assert.match(storageClosure, /from public\.reports r\s*\n\s*where r\.id = any\(v_report_ids\)/);
});

await test('S10. a zero-target journey still completes without touching Storage', async () => {
  const deps = dependencies({ resolution: resolutionFor([]), response: { reference: REFERENCE, already_clean: true, deleted: {} } });
  const response = await createRc1SyntheticCleanupPost(deps.value)(request({ reference: REFERENCE, reason: REASON }));
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.already_clean, true);
  assert.deepEqual(body.storage, { targets: 0, verified_absent: 0 });
  assert.deepEqual(deps.storageCalls[0], [], 'no object is named when there are none');
  assert.equal(deps.calls[1].args.p_expected_target_count, 0);
  assert.equal(deps.calls[1].args.p_expected_target_fingerprint, EMPTY_FINGERPRINT);
});

await test('S11. unrelated objects are never named', async () => {
  const deps = dependencies({ response: okResponse });
  await createRc1SyntheticCleanupPost(deps.value)(request({ reference: REFERENCE, reason: REASON }));
  const named = deps.storageCalls.flat();
  assert.equal(named.length, 1);
  assert.deepEqual(named[0], TARGET);
  // Resolution is confined to reports reachable from an organisation carrying the exact reference.
  assert.match(storageClosure, /where o\.synthetic_certification_ref = p_reference/);
  assert.match(storageClosure, /join public\.assessments a on a\.id = r\.assessment_id/);
  assert.match(storageClosure, /where a\.organisation_id = any\(v_org_ids\)/);
  // No whole-bucket operation exists anywhere in the closure or the remover.
  const remover = controlPlane.split('async function defaultRemoveStorageTargets')[1].split('\n}')[0];
  assert.doesNotMatch(remover, /emptyBucket|deleteBucket|\.list\(/);
  assert.match(remover, /remove\(\[target\.path\]\)/, 'removal must always name exactly one path');
});

await test('S12. no bucket, path or fingerprint reaches the response', async () => {
  const deps = dependencies({ response: okResponse });
  const response = await createRc1SyntheticCleanupPost(deps.value)(request({ reference: REFERENCE, reason: REASON }));
  const serialised = JSON.stringify(await response.json());
  for (const leak of [
    TARGET.bucket, TARGET.path, targetFingerprint([TARGET]), 'essential-report', 'target_fingerprint',
  ]) {
    assert.equal(serialised.includes(leak), false, `response leaked ${leak}`);
  }
});

await test('S13. the audit records fingerprints and counts, never raw targets', () => {
  assert.match(storageClosure, /storage_target_count integer/);
  assert.match(storageClosure, /storage_verified_absent_count integer/);
  assert.match(storageClosure, /storage_target_fingerprint text/);
  assert.match(storageClosure, /storage_target_fingerprint ~ '\^\[0-9a-f\]\{64\}\$'/);
  // No column, and no audited value, carries a bucket or a path.
  const auditInserts = storageClosure.split('insert into public.rc1_synthetic_cleanup_audit').slice(1);
  assert.equal(auditInserts.length, 2, 'both the no-op and the full cleanup must write an audit row');
  for (const insert of auditInserts) {
    const values = insert.split(';')[0];
    assert.doesNotMatch(values, /storage_bucket|storage_path|v_targets/);
  }
});

await test('S14. the superseded two-argument entry point refuses', () => {
  const superseded = storageClosure
    .split('create or replace function public.rc1_cleanup_synthetic_certification(\n  p_reference text,\n  p_reason text\n)')[1]
    .split('$$;')[0];
  assert.match(superseded, /rc1_require_platform_admin\(true\)/);
  assert.match(superseded, /raise exception 'rc1_synthetic_cleanup:storage_closure_required'/);
  assert.doesNotMatch(superseded, /delete from/i, 'the superseded signature must delete nothing');
  // And the four-argument form refuses without proof.
  assert.match(storageClosure, /rc1_synthetic_cleanup:storage_proof_required/);
  assert.match(storageClosure, /rc1_synthetic_cleanup:storage_target_mismatch/);
  assert.match(storageClosure, /rc1_synthetic_cleanup:storage_objects_remaining/);
});

console.log('');
console.log(`rc1-synthetic-cleanup-route: ${total - failures}/${total} checks passed`);
if (failures > 0) process.exit(1);
