// Release C operational-gap closure: runtime-secret admin provisioning tests.
//
// Root cause this closes: PHASE14_PROVIDER_WEBHOOK_DB_HMAC_SECRET / PHASE14_PROVIDER_LOOKUP_DB_HMAC_SECRET
// were never provisioned in Vercel, and the paired Supabase secrets (provider_webhook_db_hmac /
// provider_lookup_db_hmac) were never written via set_phase14_runtime_secret -- so
// phase14_private.verify_hmac() always raised phase14_attestation_secret_unprovisioned and no
// Resend webhook could ever be verified, even though Resend itself accepted and delivered the mail.
//
// Two parts, matching this repo's established convention (see e.g.
// release-c-order-detail-delivery-truth-tests.mjs):
//  1. Static source assertions -- the new API route validates confirmation/length/reason and never
//     logs or returns the secret; the new admin UI never renders the secret value, has a reveal
//     toggle, clears on success, and never touches localStorage/sessionStorage.
//  2. Live checks against a disposable local Postgres with every real migration applied verbatim
//     (including this cycle's 20260725090000 migration), simulating unauthenticated / non-admin /
//     AAL1 / admin+AAL2 sessions via request.jwt.claims the same way
//     scripts/phase14-aal2-security-gate-tests.sql does, then proving the webhook route genuinely
//     cannot create an attestation before provisioning and genuinely can afterwards, including
//     idempotent replay.

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function ok(condition, label) { if (!condition) throw new Error(`FAIL: ${label}`); console.log(`  ok - ${label}`); }
function includes(file, needle, label) { ok(read(file).includes(needle), `${label} (expected ${file} to include ${JSON.stringify(needle)})`); }
function notIncludes(file, needle, label) { ok(!read(file).includes(needle), `${label} (expected ${file} NOT to include ${JSON.stringify(needle)})`); }

console.log('--- 1. Static: API route validation, no secret logging/return; UI never renders the secret ---');

const migrationFile = 'supabase/migrations/20260725090000_release_c_runtime_secret_admin_provisioning.sql';
includes(migrationFile, "p_reason text default null", 'the extended RPC keeps p_reason optional (backward compatible with the existing 2-arg raw-SQL caller)');
includes(migrationFile, "phase14_require_actor(", 'the extended RPC still enforces the actor/role/AAL2 check');
includes(migrationFile, "'phase14_runtime_secret_key_invalid'", 'the extended RPC still validates the secret-key allow-list');
includes(migrationFile, "'phase14_runtime_secret_too_short'", 'the extended RPC still validates the 32-character minimum');
includes(migrationFile, "'fingerprint',encode(extensions.digest", 'the extended RPC still returns only a fingerprint, never the secret value');
notIncludes(migrationFile, "return jsonb_build_object('secret_key',p_secret_key,'rotated_at',now(),'secret_value'", 'the extended RPC return object never includes secret_value');

const routeFile = 'src/app/score/api/admin/phase14-activation/runtime-secret/route.ts';
includes(routeFile, "requireAdmin(['platform_admin'])", 'the route requires platform_admin');
includes(routeFile, "decodeAalClaimForDisplayOnly(accessToken) !== 'aal2'", 'the route pre-checks AAL2 before calling the RPC');
includes(routeFile, 'secretValue.length < MIN_SECRET_LENGTH', 'the route validates minimum length before calling the RPC');
includes(routeFile, 'secretValue !== confirmValue', 'the route validates confirmation match before calling the RPC');
includes(routeFile, "if (!reason)", 'the route requires a reason before calling the RPC');
includes(routeFile, 'p_reason: reason', 'the route passes the reason through to the RPC for audit');
notIncludes(routeFile, 'console.log', 'the route never logs anything (so it cannot log the secret)');
notIncludes(routeFile, 'console.error', 'the route never logs errors either (so no error path can leak the secret)');
notIncludes(routeFile, 'secretValue }', 'the route never echoes the raw request body (which would include secretValue) back in a response');
includes(routeFile, 'ok: true, secret: data', 'a successful response returns only the RPC\'s own return value (secret_key/rotated_at/fingerprint), not the request body');

const uiFile = 'src/components/admin/Phase14ActivationControls.tsx';
includes(uiFile, "type={reveal ? 'text' : 'password'}", 'the secret-value input is a password field with an explicit reveal toggle');
includes(uiFile, "setReveal((v) => !v)", 'the reveal toggle is user-controlled, not defaulted on');
includes(uiFile, 'setSecretValue(\'\')', 'the secret value is cleared from React state immediately on a successful submission');
includes(uiFile, 'setConfirmValue(\'\')', 'the confirmation value is cleared from React state immediately on a successful submission');
notIncludes(uiFile, 'localStorage', 'the runtime-secret control never touches localStorage');
notIncludes(uiFile, 'sessionStorage', 'the runtime-secret control never touches sessionStorage');
notIncludes(uiFile, 'result.secret_value', 'the result panel never renders a secret_value field (the RPC never returns one, and the UI does not invent one)');
includes(uiFile, 'result.fingerprint', 'the result panel renders only the fingerprint');
includes(uiFile, 'result.secret_key', 'the result panel renders the secret key');
includes(uiFile, 'result.rotated_at', 'the result panel renders the rotation timestamp');
includes(uiFile, 'crypto.getRandomValues(bytes)', 'the client-side generator uses a CSPRNG (Web Crypto), not Math.random');
includes(uiFile, 'RUNTIME_SECRET_GENERATED_BYTES = 48', 'the generator produces at least 48 random bytes');

const pageFile = 'src/app/score/admin/phase14-activation/page.tsx';
includes(pageFile, "requireAdmin(['platform_admin'])", 'the admin page itself is gated to platform_admin (the new section inherits this)');
includes(pageFile, 'PHASE14_PROVIDER_WEBHOOK_DB_HMAC_SECRET', 'the page names the exact paired Vercel variable for the webhook secret');
includes(pageFile, 'PHASE14_PROVIDER_LOOKUP_DB_HMAC_SECRET', 'the page names the exact paired Vercel variable for the lookup secret');

// Pure re-implementation of the route's validation order, since route.ts imports Next.js-coupled
// modules that do not resolve outside a Next request context -- same rationale as every other
// live-check script in this repo that mirrors application logic instead of importing it directly.
function validateRuntimeSecretRequest({ secretKey, secretValue, confirmValue, reason }) {
  const VALID_SECRET_KEYS = new Set(['provider_webhook_db_hmac', 'provider_lookup_db_hmac']);
  if (!secretKey || !VALID_SECRET_KEYS.has(secretKey)) return { ok: false, error: 'invalid_secret_key' };
  if (!reason || !reason.trim()) return { ok: false, error: 'reason_required' };
  if ((secretValue ?? '').length < 32) return { ok: false, error: 'too_short' };
  if (secretValue !== confirmValue) return { ok: false, error: 'confirm_mismatch' };
  return { ok: true };
}
{
  const validSecret = crypto.randomBytes(48).toString('base64url');
  ok(validateRuntimeSecretRequest({ secretKey: 'provider_webhook_db_hmac', secretValue: validSecret, confirmValue: validSecret, reason: 'test' }).ok === true, 'validation passes for a valid request');
  ok(validateRuntimeSecretRequest({ secretKey: 'bogus', secretValue: validSecret, confirmValue: validSecret, reason: 'test' }).error === 'invalid_secret_key', 'validation rejects an unsupported secret key');
  ok(validateRuntimeSecretRequest({ secretKey: 'provider_webhook_db_hmac', secretValue: validSecret, confirmValue: validSecret, reason: '' }).error === 'reason_required', 'validation rejects a missing reason');
  ok(validateRuntimeSecretRequest({ secretKey: 'provider_webhook_db_hmac', secretValue: 'short', confirmValue: 'short', reason: 'test' }).error === 'too_short', 'validation rejects a value shorter than 32 characters');
  ok(validateRuntimeSecretRequest({ secretKey: 'provider_webhook_db_hmac', secretValue: validSecret, confirmValue: validSecret + 'x', reason: 'test' }).error === 'confirm_mismatch', 'validation rejects a confirmation mismatch');
}

console.log('--- 2. Live Postgres replay: RPC authorization, audit trail, and end-to-end webhook proof ---');

const { default: EmbeddedPostgres } = await import('embedded-postgres');
const pg = await import('pg');

const port = 57800 + (process.pid % 300);
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'release-c-runtime-secret-pg-'));
const postgres = new EmbeddedPostgres({ databaseDir: dataDir, user: 'postgres', password: 'testpass', port, persistent: false });
const clients = [];
function client() {
  const c = new pg.default.Client({ host: '127.0.0.1', port, user: 'postgres', password: 'testpass', database: 'testdb' });
  clients.push(c);
  return c;
}

console.log('Booting disposable local Postgres...');
await postgres.initialise();
await postgres.start();
await postgres.createDatabase('testdb');
const db = client();
await db.connect();

async function asClaims(claimsJson) {
  // auth.jwt() reads the 'request.jwt.claims' GUC as a whole JSON blob; auth.uid() reads the
  // separate 'request.jwt.claim.sub' GUC -- this mirrors real PostgREST, which sets one GUC per
  // top-level claim key in addition to the full claims blob. Both must be set for a simulated
  // session to resolve correctly. is_local=false (session-level, not transaction-local) is
  // required here: each db.query() call is its own auto-committed implicit transaction over this
  // single persistent connection, so a transaction-local (is_local=true) setting from one query
  // would vanish before the next query runs it.
  await db.query(`select set_config('request.jwt.claims', $1, false)`, [claimsJson ? JSON.stringify(claimsJson) : '']);
  await db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [claimsJson?.sub ? String(claimsJson.sub) : '']);
}
async function asUnauthenticated() {
  await asClaims(null);
}
async function expectException(fn, matchSubstring, label) {
  try {
    await fn();
    throw new Error(`NO_EXPECTED_EXCEPTION: ${label}`);
  } catch (error) {
    const message = String(error?.message ?? error);
    if (!message.includes(matchSubstring)) throw new Error(`FAIL: ${label} -- expected error containing "${matchSubstring}", got: ${message}`);
    ok(true, label);
  }
}

try {
  await db.query(`
    create schema if not exists extensions;
    create extension if not exists pgcrypto with schema extensions;
    create extension if not exists citext with schema public;
    create schema if not exists auth;
    create or replace function auth.jwt() returns jsonb language sql stable as $$
      select nullif(current_setting('request.jwt.claims', true), '')::jsonb
    $$;
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
    create table if not exists auth.sessions (id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, not_after timestamptz);
    create schema if not exists vault;
    create table if not exists vault.decrypted_secrets (id uuid primary key default gen_random_uuid(), name text, decrypted_secret text);
    create schema if not exists storage;
    create table if not exists storage.buckets (id text primary key, name text not null, owner uuid, owner_id text, public boolean default false, avif_autodetection boolean default false, file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now(), updated_at timestamptz default now());
    create table if not exists storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid, metadata jsonb, created_at timestamptz default now(), updated_at timestamptz default now());
    do $$
    begin
      if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin noinherit; end if;
      if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin noinherit; end if;
      if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin noinherit bypassrls; end if;
      if not exists (select 1 from pg_roles where rolname='supabase_admin') then create role supabase_admin superuser login; end if;
    end
    $$;
    grant anon, authenticated, service_role to postgres;
    alter database testdb set search_path=public,extensions;
  `);

  const migrationFiles = fs.readdirSync(path.join(root, 'supabase/migrations')).filter((n) => n.endsWith('.sql')).sort();
  console.log(`Applying ${migrationFiles.length} real migration files verbatim, in order (including this cycle's new migration)...`);
  ok(migrationFiles.includes('20260725090000_release_c_runtime_secret_admin_provisioning.sql'), 'the new migration file is present in the replay set');
  for (const name of migrationFiles) {
    await db.query(fs.readFileSync(path.join(root, 'supabase/migrations', name), 'utf8'));
  }
  console.log('All migrations applied.');

  // --- Fixtures: three admin profiles covering the role/AAL matrix ---
  const platformAdminId = (await db.query(`insert into auth.users(email) values ('secret-admin@truth.local') returning id`)).rows[0].id;
  await db.query(`insert into public.admin_profiles(id, email, role, status, mfa_required) values ($1, 'secret-admin@truth.local', 'platform_admin', 'active', true)`, [platformAdminId]);
  const platformAdminSessionId = (await db.query(`insert into auth.sessions(user_id, not_after) values ($1, now() + interval '1 day') returning id`, [platformAdminId])).rows[0].id;
  const financeAdminId = (await db.query(`insert into auth.users(email) values ('secret-finance@truth.local') returning id`)).rows[0].id;
  await db.query(`insert into public.admin_profiles(id, email, role, status, mfa_required) values ($1, 'secret-finance@truth.local', 'finance_admin', 'active', true)`, [financeAdminId]);
  const financeAdminSessionId = (await db.query(`insert into auth.sessions(user_id, not_after) values ($1, now() + interval '1 day') returning id`, [financeAdminId])).rows[0].id;

  // phase14_require_actor's authoritative (later-in-file) definition additionally requires the
  // claims' session_id to resolve to a live row in auth.sessions -- session validity itself
  // (not_after) is checked from that row; the aal level is still read purely from the claims JSON,
  // not from the session row, which is why one session row per user can be reused across the
  // AAL1/AAL2 scenarios below.
  function claimsFor(userId, sessionId, aal) {
    return { sub: userId, role: 'authenticated', aal, exp: 4102444800, session_id: sessionId };
  }

  console.log('Scenario 1: unauthenticated access fails');
  await asUnauthenticated();
  await expectException(
    () => db.query(`select public.set_phase14_runtime_secret($1,$2,$3)`, ['provider_webhook_db_hmac', crypto.randomBytes(48).toString('base64url'), 'test']),
    'phase14_no_session',
    'unauthenticated call is rejected with phase14_no_session'
  );

  console.log('Scenario 2: non-platform-admin access fails');
  await asClaims(claimsFor(financeAdminId, financeAdminSessionId, 'aal2'));
  await expectException(
    () => db.query(`select public.set_phase14_runtime_secret($1,$2,$3)`, ['provider_webhook_db_hmac', crypto.randomBytes(48).toString('base64url'), 'test']),
    'phase14_role_forbidden',
    'finance_admin (not platform_admin) is rejected with phase14_role_forbidden'
  );

  console.log('Scenario 3: AAL1 access fails');
  await asClaims(claimsFor(platformAdminId, platformAdminSessionId, 'aal1'));
  await expectException(
    () => db.query(`select public.set_phase14_runtime_secret($1,$2,$3)`, ['provider_webhook_db_hmac', crypto.randomBytes(48).toString('base64url'), 'test']),
    'phase14_aal2_required',
    'an AAL1 platform_admin session is rejected with phase14_aal2_required'
  );

  console.log('Scenario 4: unsupported secret name fails');
  await asClaims(claimsFor(platformAdminId, platformAdminSessionId, 'aal2'));
  await expectException(
    () => db.query(`select public.set_phase14_runtime_secret($1,$2,$3)`, ['not_a_real_key', crypto.randomBytes(48).toString('base64url'), 'test']),
    'phase14_runtime_secret_key_invalid',
    'an unsupported secret key is rejected with phase14_runtime_secret_key_invalid'
  );

  console.log('Scenario 5: values shorter than 32 characters fail');
  await expectException(
    () => db.query(`select public.set_phase14_runtime_secret($1,$2,$3)`, ['provider_webhook_db_hmac', 'too-short-value', 'test']),
    'phase14_runtime_secret_too_short',
    'a secret value under 32 characters is rejected with phase14_runtime_secret_too_short'
  );

  // The remaining cases intentionally exercise successful mutations in this isolated fixture
  // database. Release only its RC1 guard through the real AAL2 control RPC.
  await db.query(
    `select public.rc1_release_freeze(
       'Release C disposable fixture setup',
       '12fcdf887db5ec3936df3a3879fc2eb86a53db78cc19f862c49aca16d6b457ac',
       1
     )`
  );

  // --- Fixtures for the end-to-end webhook proof, set up before Scenario 6 provisions the secret
  // so the "fails closed while unprovisioned" check below is genuinely testing an unprovisioned
  // secret, not one already written by a later scenario.
  const gateRow = (await db.query(`select required_version from public.phase14_security_gates where gate_key='phase14-premium-report'`)).rows[0];
  await db.query(
    `update public.phase14_security_gates
     set satisfied_version = required_version, status = 'satisfied',
         satisfied_by = $1, satisfied_at = now(), reason = 'isolated runtime-secret test', updated_at = now()
     where gate_key = 'phase14-premium-report'`,
    [platformAdminId]
  );
  await db.query(
    `update public.phase14_feature_policies
     set enabled = true, updated_by = $1,
         approved_gate_version = $2, approved_authority_epoch = (select authority_epoch from public.phase14_security_gates where gate_key='phase14-premium-report'),
         approved_at = now(), reason = 'isolated runtime-secret test', updated_at = now()
     where policy_key = 'provider_webhook_ingestion'`,
    [platformAdminId, gateRow.required_version]
  );

  // Mirrors phase14_private.canonical_attestation_field / ingest_phase14_provider_webhook's
  // canonical construction exactly, as redefined by migration 0028 (length-prefixed fields with a
  // 'v1|webhook|' version/namespace tag -- not a plain '|'-joined string, which 0028 replaced
  // specifically because a '|' inside a field value could shift apparent field boundaries).
  function canonicalAttestationField(value) {
    const v = value ?? '';
    return `${Buffer.byteLength(v, 'utf8')}:${v}`;
  }
  function computeWebhookHmac({ provider, providerEventId, providerMessageId, eventType, eventCreatedAt, payloadSha256, attestedAtEpoch, nonce, secret }) {
    const canonical = 'v1|webhook|' +
      canonicalAttestationField(provider.toLowerCase()) +
      canonicalAttestationField(providerEventId) +
      canonicalAttestationField(providerMessageId ?? '') +
      canonicalAttestationField(eventType) +
      canonicalAttestationField(eventCreatedAt) +
      canonicalAttestationField(payloadSha256) +
      canonicalAttestationField(String(attestedAtEpoch)) +
      canonicalAttestationField(nonce);
    return crypto.createHmac('sha256', secret).update(canonical, 'utf8').digest('hex');
  }

  const orgId = (await db.query(`insert into public.organisations(legal_name) values ('Runtime Secret Test Org') returning id`)).rows[0].id;
  const methodology = (await db.query(`select id from public.methodology_versions order by created_at asc limit 1`)).rows[0];
  const product = (await db.query(`select id, price_cents, currency from public.products where product_code = 'essential_self_assessment'`)).rows[0];
  const assessmentId = (await db.query(
    `insert into public.assessments(assessment_reference, organisation_id, methodology_version_id, status, submitted_at)
     values ('RTS-ASMT-1', $1, $2, 'scored', now()) returning id`, [orgId, methodology.id]
  )).rows[0].id;
  const orderId = (await db.query(
    `insert into public.orders(order_reference, assessment_id, product_id, status, amount_cents, currency, customer_email, customer_name, organisation_name)
     values ('RTS-ORDER-1', $1, $2, 'payment_received', $3, $4, 'customer@truth.local', 'RTS Customer', 'Runtime Secret Test Org') returning id`,
    [assessmentId, product.id, product.price_cents, product.currency]
  )).rows[0].id;
  const emailEventId = (await db.query(
    `insert into public.email_events(order_id, assessment_id, recipient_email, status, provider, provider_message_id, notification_type)
     values ($1, $2, 'customer@truth.local', 'sent', 'resend', 'rts-provider-message-1', 'report_ready') returning id`,
    [orderId, assessmentId]
  )).rows[0].id;

  const payload = { type: 'email.delivered', created_at: new Date().toISOString() };
  const payloadSha256 = crypto.createHash('sha256').update(JSON.stringify(payload), 'utf8').digest('hex');
  const attestedAtEpoch = Math.floor(Date.now() / 1000);
  const nonce = crypto.randomUUID();
  const eventCreatedAtIso = new Date().toISOString();

  console.log('Scenario 5b: the webhook route cannot create an attestation before its secret is provisioned');
  await asClaims({ role: 'service_role', exp: 4102444800 });
  const wrongSignature = computeWebhookHmac({
    provider: 'resend', providerEventId: 'rts-webhook-event-1', providerMessageId: 'rts-provider-message-1',
    eventType: 'email.delivered', eventCreatedAt: eventCreatedAtIso, payloadSha256, attestedAtEpoch, nonce,
    secret: 'this-value-does-not-matter-because-nothing-is-provisioned-yet'
  });
  await expectException(
    () => db.query(
      `select public.ingest_phase14_provider_webhook($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      ['resend', 'rts-webhook-event-1', 'rts-provider-message-1', 'email.delivered', eventCreatedAtIso, payloadSha256, JSON.stringify(payload), attestedAtEpoch, nonce, wrongSignature]
    ),
    'phase14_attestation_secret_unprovisioned',
    'ingest_phase14_provider_webhook fails closed with phase14_attestation_secret_unprovisioned when provider_webhook_db_hmac has never been provisioned'
  );

  console.log('Scenario 6: successful rotation returns no secret, records an audited reason, and its own fingerprint matches an independent computation');
  // Switch back to the platform_admin/AAL2 session -- the previous scenario ran as service_role.
  await asClaims(claimsFor(platformAdminId, platformAdminSessionId, 'aal2'));
  const webhookSecretValue = crypto.randomBytes(48).toString('base64url');
  const provisionReason = 'Release C controlled Preview verification -- test provisioning';
  const rotateResult = await db.query(
    `select public.set_phase14_runtime_secret($1,$2,$3) as result`,
    ['provider_webhook_db_hmac', webhookSecretValue, provisionReason]
  );
  const rotated = rotateResult.rows[0].result;
  assert.equal(rotated.secret_key, 'provider_webhook_db_hmac');
  assert.ok(rotated.rotated_at, 'rotated_at is present');
  assert.equal(Object.prototype.hasOwnProperty.call(rotated, 'secret_value'), false, 'the return value never includes secret_value');
  const expectedFingerprint = crypto.createHash('sha256').update(webhookSecretValue, 'utf8').digest('hex');
  assert.equal(rotated.fingerprint, expectedFingerprint, 'the returned fingerprint is exactly sha256(secret_value), computed independently in Node');
  ok(true, 'successful rotation returns only secret_key/rotated_at/fingerprint, and the fingerprint is independently verifiable');

  console.log('Scenario 7: the audit entry is created and records the reason');
  const auditRow = (await db.query(
    `select actor_type, actor_user_id, entity_table, action, after_json
     from public.audit_logs
     where action = 'phase14_runtime_secret_rotated'
     order by created_at desc limit 1`
  )).rows[0];
  assert.equal(auditRow.actor_type, 'admin');
  assert.equal(auditRow.actor_user_id, platformAdminId);
  assert.equal(auditRow.entity_table, 'phase14_private.runtime_secrets');
  assert.equal(auditRow.after_json.secret_key, 'provider_webhook_db_hmac');
  assert.equal(auditRow.after_json.reason, provisionReason);
  ok(true, 'the audit_logs entry records the actor, the target, and the audited reason -- never the secret value');
  assert.equal(JSON.stringify(auditRow.after_json).includes(webhookSecretValue), false, 'the audit entry never contains the raw secret value');

  console.log('Scenario 8: backward compatibility -- the existing 2-argument positional caller still resolves');
  const legacySecretValue = crypto.randomBytes(48).toString('base64url');
  const legacyResult = await db.query(
    `select public.set_phase14_runtime_secret('provider_lookup_db_hmac', $1) as result`,
    [legacySecretValue]
  );
  assert.equal(legacyResult.rows[0].result.secret_key, 'provider_lookup_db_hmac');
  ok(true, "the pre-existing raw-SQL 2-arg call site (scripts/phase14-delivery-reconciliation-tests.mjs's pattern) still works after this migration's signature change");
  const legacyAudit = (await db.query(
    `select after_json from public.audit_logs where action = 'phase14_runtime_secret_rotated' and after_json->>'secret_key' = 'provider_lookup_db_hmac' order by created_at desc limit 1`
  )).rows[0];
  assert.equal(Object.prototype.hasOwnProperty.call(legacyAudit.after_json, 'reason'), false, 'omitting the reason (2-arg call) omits the reason key entirely rather than storing null/empty');

  console.log('Scenario 9: after provisioning, a correctly-signed webhook is accepted and creates exactly one attestation; a byte-identical replay does not create a second');
  await asClaims({ role: 'service_role', exp: 4102444800 });
  // Reuses webhookSecretValue provisioned in Scenario 6 -- the exact value now in
  // phase14_private.runtime_secrets for provider_webhook_db_hmac.
  const correctSignature = computeWebhookHmac({
    provider: 'resend', providerEventId: 'rts-webhook-event-1', providerMessageId: 'rts-provider-message-1',
    eventType: 'email.delivered', eventCreatedAt: eventCreatedAtIso, payloadSha256, attestedAtEpoch, nonce,
    secret: webhookSecretValue
  });
  const firstIngest = await db.query(
    `select public.ingest_phase14_provider_webhook($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as result`,
    ['resend', 'rts-webhook-event-1', 'rts-provider-message-1', 'email.delivered', eventCreatedAtIso, payloadSha256, JSON.stringify(payload), attestedAtEpoch, nonce, correctSignature]
  );
  const firstAttestationId = firstIngest.rows[0].result.attestation_id;
  assert.ok(firstAttestationId, 'a correctly-signed webhook (using the now-provisioned secret) is accepted and returns an attestation_id');
  const attestationCountAfterFirst = (await db.query(
    `select count(*)::int as n from public.phase14_provider_attestations where attestation_source='webhook' and provider_event_id='rts-webhook-event-1'`
  )).rows[0].n;
  assert.equal(attestationCountAfterFirst, 1, 'exactly one attestation row exists after the first, correctly-signed webhook call');

  const secondIngest = await db.query(
    `select public.ingest_phase14_provider_webhook($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) as result`,
    ['resend', 'rts-webhook-event-1', 'rts-provider-message-1', 'email.delivered', eventCreatedAtIso, payloadSha256, JSON.stringify(payload), attestedAtEpoch, nonce, correctSignature]
  );
  assert.equal(secondIngest.rows[0].result.attestation_id, firstAttestationId, 'a byte-identical replay returns the same attestation_id rather than raising or creating a new one');
  const attestationCountAfterReplay = (await db.query(
    `select count(*)::int as n from public.phase14_provider_attestations where attestation_source='webhook' and provider_event_id='rts-webhook-event-1'`
  )).rows[0].n;
  assert.equal(attestationCountAfterReplay, 1, 'the duplicate replay did not create a second attestation row -- idempotent');

  const emailEventAfter = (await db.query(`select status from public.email_events where id = $1`, [emailEventId])).rows[0];
  assert.equal(emailEventAfter.status, 'delivered', "the verified webhook's event_type (email.delivered) was applied to the correlated email_events row");
  ok(true, 'the correlated email_events row reflects the verified provider state, proving the full webhook -> attestation -> apply_email_provider_event_atomic chain works end-to-end once the secret is provisioned');

  console.log('\nAll runtime-secret provisioning checks passed.');
} finally {
  await db.end().catch(() => {});
  await postgres.stop().catch(() => {});
  fs.rmSync(dataDir, { recursive: true, force: true });
}
