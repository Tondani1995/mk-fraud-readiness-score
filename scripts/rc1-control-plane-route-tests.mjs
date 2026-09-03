import assert from 'node:assert/strict';

const {
  createRc1CertificationSecretPost,
  createRc1FreezeStatusGet,
  createRc1FreezeActivatePost,
  createRc1FreezeReleasePost,
} = await import('../src/lib/rc1/control-plane.ts');

const secret = 'rc1-synthetic-certification-secret-value-a';
const otherSecret = 'rc1-synthetic-certification-secret-value-b';
const fingerprint = 'a'.repeat(64);
const evidence = 'b'.repeat(64);
const operator = {
  accessToken: 'synthetic-verified-access-token',
  role: 'platform_admin',
};
const frozenStatus = {
  state: 'frozen',
  freeze_epoch: 1,
  activated_at: '2026-07-28T07:00:00.000Z',
  released_at: null,
  activation_reason_fingerprint: 'c'.repeat(64),
  release_evidence_fingerprint: null,
  canary_authorization_active: false,
};
const releasedStatus = {
  ...frozenStatus,
  state: 'released',
  released_at: '2026-07-28T07:10:00.000Z',
  release_evidence_fingerprint: evidence,
};

function request(body) {
  return new Request('http://127.0.0.1/score/api/admin/rc1-control-test', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function dependencies({
  identity = operator,
  response,
  error = null,
} = {}) {
  const calls = [];
  return {
    calls,
    value: {
      resolveOperator: async () => identity,
      rpc: async (_token, name, args = {}) => {
        calls.push({ name, args });
        return { data: response, error };
      },
    },
  };
}

async function payload(response) {
  const value = await response.json();
  assert.equal(
    JSON.stringify(value).includes(secret),
    false,
    'control-plane responses must never expose the submitted secret',
  );
  return value;
}

async function certificationRouteTests() {
  const success = dependencies({
    response: {
      secret_key: 'provider_webhook_db_hmac',
      rotated_at: '2026-07-28T07:05:00.000Z',
      fingerprint,
    },
  });
  const handler = createRc1CertificationSecretPost(success.value);
  const response = await handler(request({
    secretKey: 'provider_webhook_db_hmac',
    secretValue: secret,
    confirmValue: secret,
    reason: 'RC1 synthetic certification provisioning',
    expectedFreezeEpoch: 1,
  }));
  assert.equal(response.status, 200);
  assert.equal(success.calls.length, 1);
  assert.equal(success.calls[0].name, 'rc1_provision_certification_runtime_secret');
  assert.deepEqual(Object.keys(success.calls[0].args).sort(), [
    'p_expected_freeze_epoch',
    'p_reason',
    'p_secret_key',
    'p_secret_value',
  ]);
  assert.equal((await payload(response)).secret.fingerprint, fingerprint);

  for (const [label, changes, expected, expectedError] of [
    ['unauthenticated', { identity: null }, 401, 'RC1_CONTROL_SESSION_REQUIRED'],
    ['reviewer', { identity: { ...operator, role: 'reviewer' } }, 403, 'RC1_CONTROL_PLATFORM_ADMIN_REQUIRED'],
    ['finance_admin', { identity: { ...operator, role: 'finance_admin' } }, 403, 'RC1_CONTROL_PLATFORM_ADMIN_REQUIRED'],
    ['service_role', { identity: { ...operator, role: 'service_role' } }, 403, 'RC1_CONTROL_PLATFORM_ADMIN_REQUIRED'],
  ]) {
    const deps = dependencies(changes);
    const stopped = await createRc1CertificationSecretPost(deps.value)(request({
      secretKey: 'provider_webhook_db_hmac',
      secretValue: secret,
      confirmValue: secret,
      reason: 'RC1 synthetic certification provisioning',
      expectedFreezeEpoch: 1,
    }));
    assert.equal(stopped.status, expected, label);
    assert.equal((await payload(stopped)).error, expectedError, `${label} error`);
    assert.equal(deps.calls.length, 0, `${label} must stop before the RPC`);
  }

  const invalidBodies = [
    { secretKey: 'wrong_key', secretValue: secret, confirmValue: secret, reason: 'Synthetic valid reason', expectedFreezeEpoch: 1 },
    { secretKey: 'provider_webhook_db_hmac', secretValue: secret, confirmValue: otherSecret, reason: 'Synthetic valid reason', expectedFreezeEpoch: 1 },
    { secretKey: 'provider_webhook_db_hmac', secretValue: 'short', confirmValue: 'short', reason: 'Synthetic valid reason', expectedFreezeEpoch: 1 },
    { secretKey: 'provider_webhook_db_hmac', secretValue: secret, confirmValue: secret, reason: '', expectedFreezeEpoch: 1 },
    { secretKey: 'provider_webhook_db_hmac', secretValue: secret, confirmValue: secret, reason: 'Synthetic valid reason', expectedFreezeEpoch: 0 },
  ];
  for (const body of invalidBodies) {
    const deps = dependencies();
    assert.equal(
      (await createRc1CertificationSecretPost(deps.value)(request(body))).status,
      400,
    );
    assert.equal(deps.calls.length, 0);
  }

  for (const responseValue of [
    null,
    { secret_key: 'provider_webhook_db_hmac', rotated_at: 'now', fingerprint, secret_value: secret },
    { secret_key: 'provider_lookup_db_hmac', rotated_at: 'now', fingerprint },
    { secret_key: 'provider_webhook_db_hmac', rotated_at: 'now', fingerprint: '0'.repeat(64) },
  ]) {
    const deps = dependencies({ response: responseValue });
    const stopped = await createRc1CertificationSecretPost(deps.value)(request({
      secretKey: 'provider_webhook_db_hmac',
      secretValue: secret,
      confirmValue: secret,
      reason: 'RC1 synthetic certification provisioning',
      expectedFreezeEpoch: 1,
    }));
    assert.equal(stopped.status, responseValue === null ? 409 : 502);
    await payload(stopped);
  }

  for (const databaseStop of [
    'rc1_certification_secret:freeze_epoch_mismatch',
    'rc1_certification_secret:not_frozen',
    'rc1_certification_secret:values_must_be_distinct',
    'function rc1_provision_certification_runtime_secret does not exist',
  ]) {
    const deps = dependencies({ error: { message: databaseStop } });
    const stopped = await createRc1CertificationSecretPost(deps.value)(request({
      secretKey: 'provider_lookup_db_hmac',
      secretValue: otherSecret,
      confirmValue: otherSecret,
      reason: 'RC1 synthetic certification provisioning',
      expectedFreezeEpoch: 1,
    }));
    assert.equal(stopped.status, 409);
    const stoppedPayload = await payload(stopped);
    assert.equal(JSON.stringify(stoppedPayload).includes(databaseStop), false);
  }
}

async function freezeControlRouteTests() {
  const statusDeps = dependencies({ response: frozenStatus });
  const statusResponse = await createRc1FreezeStatusGet(statusDeps.value)();
  assert.equal(statusResponse.status, 200);
  assert.equal(statusDeps.calls[0].name, 'rc1_freeze_status');

  const activationDeps = dependencies({ response: frozenStatus });
  const activationResponse = await createRc1FreezeActivatePost(activationDeps.value)(
    request({ reason: 'RC1 synthetic freeze activation' }),
  );
  assert.equal(activationResponse.status, 200);
  assert.equal(activationDeps.calls[0].name, 'rc1_activate_freeze');

  const releaseDeps = dependencies({ response: releasedStatus });
  const releaseResponse = await createRc1FreezeReleasePost(releaseDeps.value)(request({
    reason: 'RC1 synthetic final release approval',
    evidenceFingerprint: evidence,
    expectedFreezeEpoch: 1,
  }));
  assert.equal(releaseResponse.status, 200);
  assert.equal(releaseDeps.calls[0].name, 'rc1_release_freeze');

  for (const body of [
    { reason: '', evidenceFingerprint: evidence, expectedFreezeEpoch: 1 },
    { reason: 'RC1 synthetic final release approval', evidenceFingerprint: '0'.repeat(64), expectedFreezeEpoch: 1 },
    { reason: 'RC1 synthetic final release approval', evidenceFingerprint: evidence, expectedFreezeEpoch: 0 },
  ]) {
    const deps = dependencies({ response: releasedStatus });
    assert.equal(
      (await createRc1FreezeReleasePost(deps.value)(request(body))).status,
      400,
    );
    assert.equal(deps.calls.length, 0);
  }

  const canaryResponse = dependencies({
    response: { ...releasedStatus, canary_authorization_active: true },
  });
  assert.equal((await createRc1FreezeStatusGet(canaryResponse.value)()).status, 503);
}

await certificationRouteTests();
await freezeControlRouteTests();
console.log('PASS RC1 control-plane routes: authenticated platform-admin controls and database-authorized release sequence');
