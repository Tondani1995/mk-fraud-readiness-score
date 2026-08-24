import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

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

const ordinaryRouteFiles = [
  'src/app/score/api/assessments/start/route.ts',
  'src/app/score/api/assessments/resume/route.ts',
  'src/app/score/api/assessments/[assessmentRef]/answers/route.ts',
  'src/app/score/api/assessments/[assessmentRef]/submit/route.ts',
  'src/app/score/api/admin/assessments/[assessmentRef]/score/route.ts',
  'src/app/score/api/assessments/[assessmentRef]/commercial-event/route.ts',
  'src/app/score/api/assessments/[assessmentRef]/report-request/route.ts',
  'src/app/score/api/assessments/[assessmentRef]/personalised-report-request/route.ts',
  'src/app/score/api/assessments/[assessmentRef]/paid-order/route.ts',
  'src/app/score/api/payments/[orderReference]/session/route.ts',
  'src/app/score/admin/orders/[orderReference]/status/route.ts',
  'src/app/score/api/webhooks/stitch/route.ts',
  'src/app/score/api/admin/orders/[orderReference]/generate-report/route.ts',
  'src/app/score/api/admin/backlog-reconciliation/route.ts',
  'src/app/score/api/internal/fulfilment-worker/route.ts',
  'src/app/score/api/internal/phase14-storage-cleanup/route.ts',
  'src/app/score/api/admin/orders/[orderReference]/fulfilment/recover/route.ts',
  'src/app/score/api/admin/orders/[orderReference]/fulfilment/retry/route.ts',
  'src/app/score/api/admin/orders/[orderReference]/fulfilment/approve/route.ts',
  'src/app/score/api/admin/orders/[orderReference]/fulfilment/reject/route.ts',
  'src/app/score/api/admin/orders/[orderReference]/delivery/retry/route.ts',
  'src/app/score/api/admin/orders/[orderReference]/delivery/reissue-token/route.ts',
  'src/app/score/api/admin/orders/[orderReference]/delivery/revoke-token/route.ts',
  'src/app/score/api/admin/orders/[orderReference]/delivery/correct-recipient/route.ts',
  'src/app/score/api/admin/reports/[reportId]/send-email/route.ts',
  'src/app/score/api/webhooks/resend/route.ts',
  'src/app/score/api/admin/operational-alerts/[alertId]/transition/route.ts',
  'src/app/score/api/internal/uat-start-check/route.ts',
  'src/app/score/api/readiness-runtime-check/route.ts',
  'src/app/score/report/access/[token]/route.ts',
];

const retainedRc1Files = [
  'src/lib/rc1/control-plane.ts',
  'src/app/score/api/admin/phase14-activation/ai-route-policy/route.ts',
  'src/app/score/api/admin/phase14-activation/feature-policy/route.ts',
  'src/app/score/api/admin/phase14-activation/gate/route.ts',
  'src/app/score/api/admin/phase14-activation/runtime-secret/route.ts',
  'src/app/score/api/admin/phase14-activation/settings/route.ts',
  'src/app/score/api/admin/comprehensive/[orderReference]/reviewer/route.ts',
  'src/app/score/api/admin/comprehensive/[orderReference]/transition/route.ts',
  'src/app/score/api/assessments/[assessmentRef]/comprehensive-evidence/route.ts',
];

function assertOrdinaryRoutesDoNotUseRc1Freeze() {
  const freezeDependency = /getRc1(?:Operation|Customer)FreezeResponse|MK_RC1_OPERATION_FREEZE_MODE/;
  for (const file of ordinaryRouteFiles) {
    const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
    assert.doesNotMatch(source, freezeDependency, `${file} must not depend on the RC1 freeze`);
  }
  for (const file of retainedRc1Files) {
    const source = fs.readFileSync(path.join(process.cwd(), file), 'utf8');
    assert.match(source, /getRc1OperationFreezeResponse|MK_RC1_OPERATION_FREEZE_MODE/, `${file} retains its isolated RC1 control boundary`);
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
  assertOrdinaryRoutesDoNotUseRc1Freeze();
  await assertReadOnlyDiagnosticsRemainAvailable();
  console.log(`PASS RC1 retirement boundary: ${ordinaryRouteFiles.length} ordinary routes are freeze-independent; ${retainedRc1Files.length} isolated control files retain RC1 checks`);
} finally {
  if (originalMode === undefined) delete process.env.MK_RC1_OPERATION_FREEZE_MODE;
  else process.env.MK_RC1_OPERATION_FREEZE_MODE = originalMode;
  if (originalUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = originalUrl;
  if (originalServiceKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceKey;
}
