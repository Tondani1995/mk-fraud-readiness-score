import assert from 'node:assert/strict';

const originalMode = process.env.MK_RC1_OPERATION_FREEZE_MODE;
const originalUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const {
  isRc1OperationFrozen,
  RC1_OPERATION_SURFACES,
} = await import('../src/lib/rc1/operation-freeze.ts');

function releasedStatus(overrides = {}) {
  return {
    state: 'released',
    freeze_epoch: 7,
    release_evidence_fingerprint: 'a'.repeat(64),
    canary_authorization_active: false,
    ...overrides,
  };
}

async function assertCoreFailClosedRules() {
  let calls = 0;
  assert.equal(await isRc1OperationFrozen({
    mode: 'frozen',
    statusResolver: async () => {
      calls += 1;
      return releasedStatus();
    },
  }), true);
  assert.equal(calls, 0, 'frozen mode must not call the database status resolver');

  for (const mode of [undefined, '', 'invalid', 'FROZE', 'RELEASED', 'released ', 'true']) {
    assert.equal(await isRc1OperationFrozen({
      mode,
      statusResolver: async () => releasedStatus(),
    }), true, `mode ${String(mode)} must fail closed`);
  }

  assert.equal(await isRc1OperationFrozen({
    mode: 'released',
    statusResolver: async () => releasedStatus(),
  }), false);
  assert.equal(await isRc1OperationFrozen({
    mode: 'released',
    statusResolver: async () => releasedStatus({ state: 'frozen' }),
  }), true);
  assert.equal(await isRc1OperationFrozen({
    mode: 'released',
    statusResolver: async () => releasedStatus({ state: 'unknown' }),
  }), true);
  assert.equal(await isRc1OperationFrozen({
    mode: 'released',
    statusResolver: async () => releasedStatus({ freeze_epoch: 0 }),
  }), true);
  assert.equal(await isRc1OperationFrozen({
    mode: 'released',
    statusResolver: async () => releasedStatus({ release_evidence_fingerprint: null }),
  }), true);
  assert.equal(await isRc1OperationFrozen({
    mode: 'released',
    statusResolver: async () => releasedStatus({ release_evidence_fingerprint: '0'.repeat(64) }),
  }), true);
  assert.equal(await isRc1OperationFrozen({
    mode: 'released',
    statusResolver: async () => releasedStatus({ canary_authorization_active: true }),
  }), true);
  assert.equal(await isRc1OperationFrozen({
    mode: 'released',
    statusResolver: async () => {
      throw new Error('synthetic database error');
    },
  }), true);
  assert.equal(await isRc1OperationFrozen({
    mode: 'released',
    timeoutMs: 5,
    statusResolver: () => new Promise(() => {}),
  }), true);
}

const routeProbes = [
  ['../src/app/score/api/assessments/start/route.ts', 'POST', 423],
  ['../src/app/score/api/assessments/resume/route.ts', 'POST', 423],
  ['../src/app/score/api/assessments/[assessmentRef]/answers/route.ts', 'POST', 423],
  ['../src/app/score/api/assessments/[assessmentRef]/submit/route.ts', 'POST', 423],
  ['../src/app/score/api/admin/assessments/[assessmentRef]/score/route.ts', 'POST', 423],
  ['../src/app/score/api/assessments/[assessmentRef]/commercial-event/route.ts', 'POST', 423],
  ['../src/app/score/api/assessments/[assessmentRef]/report-request/route.ts', 'POST', 423],
  ['../src/app/score/api/assessments/[assessmentRef]/personalised-report-request/route.ts', 'POST', 423],
  ['../src/app/score/api/payments/[orderReference]/session/route.ts', 'POST', 423],
  ['../src/app/score/admin/orders/[orderReference]/status/route.ts', 'POST', 423],
  ['../src/app/score/api/webhooks/stitch/route.ts', 'POST', 503],
  ['../src/app/score/api/admin/orders/[orderReference]/generate-report/route.ts', 'POST', 423],
  ['../src/app/score/api/admin/backlog-reconciliation/route.ts', 'POST', 423],
  ['../src/app/score/api/internal/fulfilment-worker/route.ts', 'GET', 423],
  ['../src/app/score/api/internal/phase14-storage-cleanup/route.ts', 'GET', 423],
  ['../src/app/score/api/admin/orders/[orderReference]/fulfilment/recover/route.ts', 'POST', 423],
  ['../src/app/score/api/admin/orders/[orderReference]/fulfilment/retry/route.ts', 'POST', 423],
  ['../src/app/score/api/admin/orders/[orderReference]/fulfilment/approve/route.ts', 'POST', 423],
  ['../src/app/score/api/admin/orders/[orderReference]/fulfilment/reject/route.ts', 'POST', 423],
  ['../src/app/score/api/admin/orders/[orderReference]/delivery/retry/route.ts', 'POST', 423],
  ['../src/app/score/api/admin/orders/[orderReference]/delivery/reissue-token/route.ts', 'POST', 423],
  ['../src/app/score/api/admin/orders/[orderReference]/delivery/revoke-token/route.ts', 'POST', 423],
  ['../src/app/score/api/admin/orders/[orderReference]/delivery/correct-recipient/route.ts', 'POST', 423],
  ['../src/app/score/api/admin/reports/[reportId]/send-email/route.ts', 'POST', 423],
  ['../src/app/score/api/webhooks/resend/route.ts', 'POST', 503],
  ['../src/app/score/api/admin/operational-alerts/[alertId]/transition/route.ts', 'POST', 423],
  ['../src/app/score/api/admin/phase14-activation/ai-route-policy/route.ts', 'POST', 423],
  ['../src/app/score/api/admin/phase14-activation/feature-policy/route.ts', 'POST', 423],
  ['../src/app/score/api/admin/phase14-activation/gate/route.ts', 'POST', 423],
  ['../src/app/score/api/admin/phase14-activation/runtime-secret/route.ts', 'POST', 423],
  ['../src/app/score/api/admin/phase14-activation/settings/route.ts', 'POST', 423],
  ['../src/app/score/api/internal/uat-start-check/route.ts', 'GET', 423],
  ['../src/app/score/api/readiness-runtime-check/route.ts', 'GET', 423],
  ['../src/app/score/report/access/[token]/route.ts', 'GET', 423],
];

async function assertActualRoutesStopBeforeDependencies() {
  process.env.MK_RC1_OPERATION_FREEZE_MODE = 'frozen';
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;

  for (const [specifier, method, expectedStatus] of routeProbes) {
    const route = await import(specifier);
    assert.equal(typeof route[method], 'function', `${specifier} must export ${method}`);
    const response = await route[method](
      new Request('http://127.0.0.1/score/rc1-frozen-probe', {
        method,
        headers: { 'content-type': 'application/json' },
        body: method === 'GET' ? undefined : '{}',
      }),
      {
        params: {
          assessmentRef: 'synthetic',
          orderReference: 'synthetic',
          reportId: 'synthetic',
          alertId: 'synthetic',
          token: 'synthetic',
        },
      }
    );
    assert.equal(response.status, expectedStatus, `${specifier} must fail frozen`);
    const payload = await response.json();
    assert.equal(payload.error, 'RC1_OPERATION_FROZEN');
    assert.equal(
      JSON.stringify(payload).match(
        /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|@/i
      ),
      null,
      `${specifier} must not expose customer identifiers`
    );
    if (expectedStatus === 503) {
      assert.equal(response.headers.get('retry-after'), '60');
    }
    if (
      specifier.includes('/internal/fulfilment-worker/')
      || specifier.includes('/internal/phase14-storage-cleanup/')
    ) {
      assert.equal(payload.claimed, false);
    }
  }
}

async function assertReadOnlyDiagnosticsRemainAvailable() {
  const health = await import('../src/app/score/api/health/route.ts');
  const buildInfo = await import('../src/app/score/api/system/build-info/route.ts');
  const healthResponse = health.GET();
  const buildResponse = buildInfo.GET();
  assert.equal(healthResponse.status, 200);
  assert.equal(buildResponse.status, 200);
  assert.equal((await healthResponse.json()).ok, true);
  assert.equal(typeof (await buildResponse.json()).releaseChannel, 'string');
}

try {
  assert.equal(RC1_OPERATION_SURFACES.length, 18);
  await assertCoreFailClosedRules();
  await assertActualRoutesStopBeforeDependencies();
  await assertReadOnlyDiagnosticsRemainAvailable();
  console.log(`PASS RC1 application freeze: ${routeProbes.length} actual mutation routes`);
} finally {
  if (originalMode === undefined) delete process.env.MK_RC1_OPERATION_FREEZE_MODE;
  else process.env.MK_RC1_OPERATION_FREEZE_MODE = originalMode;
  if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  if (originalServiceKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceKey;
}
