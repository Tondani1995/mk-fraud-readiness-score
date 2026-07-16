import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';

// L5: the Resend webhook route (src/app/score/api/webhooks/resend/route.ts) now checks a global
// volumetric rate-limit budget before doing any request-body work. This is a pure-module test of
// that route file -- it never starts a real server or hits real Supabase (unlike
// scripts/phase14-webhook-route-db-test.mjs, which is a live integration test requiring a running
// Next.js server and local Supabase and is out of scope for this sandbox). It compiles the actual
// route source with the TypeScript compiler and swaps only its true infrastructure boundary
// (Supabase client, rate-limit module, Next's NextResponse, and the Resend webhook helpers) for
// deterministic doubles, so the assertions below exercise the real control flow written in the
// route file, not a re-description of it.

function compileCommonJs(path, requireShim) {
  const output = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', output)(requireShim, module, module.exports);
  return module.exports;
}

function loadRoute({ rateLimitAllowed, readBodyCalled }) {
  return compileCommonJs('src/app/score/api/webhooks/resend/route.ts', (specifier) => {
    if (specifier === 'next/server') {
      return {
        NextResponse: {
          json: (body, init) => ({ status: init?.status ?? 200, ok: true, json: async () => body })
        }
      };
    }
    if (specifier === '@/lib/supabase/server') {
      return { createSupabaseServiceClient: () => ({ rpc: async () => ({ data: null, error: new Error('must not be reached') }) }) };
    }
    if (specifier === '@/lib/security/rate-limit') {
      return {
        checkRateLimits: async (checks) => {
          assert.equal(checks[0]?.key, 'resend_webhook:global', 'the route must check the documented global rate-limit key');
          return { allowed: rateLimitAllowed, key: checks[0]?.key ?? '' };
        },
        RATE_LIMITS: { resendWebhookGlobal: () => ({ maxHits: 600, windowSeconds: 60 }) }
      };
    }
    if (specifier === '@/lib/reports/email/resend-webhook') {
      class ResendWebhookBodyTooLargeError extends Error {}
      return {
        ResendWebhookBodyTooLargeError,
        readLimitedWebhookBody: async () => {
          readBodyCalled.hit = true;
          return '{}';
        },
        validateResendEventCreatedAt: () => new Date().toISOString(),
        verifyResendWebhook: () => ({ type: 'email.delivered', data: { email_id: 'evt' }, created_at: new Date().toISOString() }),
        webhookPayloadFingerprint: () => 'a'.repeat(64),
        createProviderWebhookDatabaseAttestation: () => ({ attestedAtEpoch: 0, nonce: 'n', hmac: 'h' })
      };
    }
    throw new Error(`Unexpected route.ts dependency in test: ${specifier}`);
  });
}

{
  const readBodyCalled = { hit: false };
  const { POST } = loadRoute({ rateLimitAllowed: false, readBodyCalled });
  const response = await POST({ headers: { get: () => null } });
  const body = await response.json();
  assert.equal(response.status, 429, 'a blocked global rate-limit budget must return HTTP 429');
  assert.equal(body.ok, false);
  assert.equal(body.error, 'rate_limited');
  assert.equal(readBodyCalled.hit, false, 'the request body must never be read once the rate limit has already rejected the request');
}

{
  const readBodyCalled = { hit: false };
  const { POST } = loadRoute({ rateLimitAllowed: true, readBodyCalled });
  const response = await POST({ headers: { get: () => null } });
  assert.notEqual(response.status, 429, 'an allowed rate-limit budget must not itself block the request');
  assert.equal(readBodyCalled.hit, true, 'once the rate limit allows the request, normal processing (starting with the body read) must proceed');
}

console.log('phase14_resend_webhook_rate_limit_tests_passed');
