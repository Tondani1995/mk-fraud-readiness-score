/**
 * RC1 synthetic-marking route-to-database test.
 *
 * This is the test whose absence let migration 60 ship broken. Both earlier suites seeded their
 * fixtures directly, so neither ever produced the queued resume placeholder that
 * startAccountlessAssessment always writes -- and the marking control refused every real journey.
 *
 * Everything here goes through the real routes against the replayed database:
 *
 *   R0  the disposable database is in the released state the workflow established
 *   R1  POST /score/api/assessments/start returns 201
 *   R2  it creates exactly one organisation, respondent, assessment, token, assessment event and
 *       one email event, and that event is exactly the admissible non-provider resume placeholder
 *   R3  a genuine local platform_admin AAL2 session marks that organisation through the real route
 *   R4  the organisation marker and the marking audit agree
 *   R5  no external dispatch occurred
 *   R6  the marked journey is removed through the real Storage-aware cleanup contract, using the
 *       values captured from one prepare call
 *   R7  the disposable local Auth identity and MFA artefacts are cleaned up
 *   R8  no residual business, delivery, provider or Storage data remains
 *
 * The AAL2 session is genuine: a disposable user is created through the local GoTrue Admin API,
 * signed in through the real login route, and then enrolled and verified through the real MFA
 * routes, which issue a fresh aal2 session and write it back into the same cookies the application
 * reads. Nothing is minted, mocked or bypassed, and the identity exists only in the local replay
 * environment.
 */
import crypto from 'node:crypto';
import { Client } from 'pg';
import { createClient } from '@supabase/supabase-js';

const routeBase = process.env.PHASE14_TEST_APP_URL ?? 'http://127.0.0.1:3000/score';
const databaseUrl = process.env.LOCAL_DB_URL;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!databaseUrl || !supabaseUrl || !serviceKey) {
  throw new Error('LOCAL_DB_URL, NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.');
}

const nonce = Date.now();
const SYNTHETIC_REF = 'MKTEST-RC1-20260802-99';
const ADMIN_EMAIL = `rc1-marking-route-admin-${nonce}@example.test`;
const ADMIN_PASSWORD = `Rc1-Marking-${nonce}-A9!`;

const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
const db = new Client({ connectionString: databaseUrl });
await db.connect();
const q = async (text, values = []) => (await db.query(text, values)).rows;
const one = async (text, values = []) => (await q(text, values))[0];

let passed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) {
    console.log(`  FAIL - ${name}  ${detail}`);
    throw new Error(`${name}: ${detail}`);
  }
  passed += 1;
  console.log(`  ok - ${name}  ${detail}`);
};

// RFC 6238 TOTP over the base32 secret GoTrue returns from enrolment. This computes the same code
// an authenticator app would show; the verification itself is done by GoTrue, not here.
function totp(base32Secret, atSeconds = Math.floor(Date.now() / 1000)) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const character of base32Secret.replace(/=+$/, '').toUpperCase()) {
    const index = alphabet.indexOf(character);
    if (index < 0) continue;
    bits += index.toString(2).padStart(5, '0');
  }
  const bytes = Buffer.from((bits.match(/.{8}/g) ?? []).map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(atSeconds / 30)));
  const digest = crypto.createHmac('sha1', bytes).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24) | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8) | (digest[offset + 3] & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}

const cookieHeader = (response, existing = '') => {
  const pairs = new Map(existing.split('; ').filter(Boolean).map((c) => {
    const i = c.indexOf('=');
    return [c.slice(0, i), c.slice(i + 1)];
  }));
  for (const raw of response.headers.getSetCookie()) {
    const first = raw.split(';', 1)[0];
    const i = first.indexOf('=');
    pairs.set(first.slice(0, i), first.slice(i + 1));
  }
  return [...pairs].map(([k, v]) => `${k}=${v}`).join('; ');
};

console.log('rc1-synthetic-marking-route');

let adminUserId = null;
let factorId = null;

try {
  // -------------------------------------------------------------------------
  // R0
  // -------------------------------------------------------------------------
  await q(`insert into public.app_settings(setting_key, value_json)
           values ('rc1_synthetic_certification_cleanup', jsonb_build_object('enabled', true))
           on conflict (setting_key) do update set value_json = excluded.value_json`);

  // The freeze state is never written here -- rc1_guard_freeze_state_write forbids it, and that
  // refusal is correct product behaviour. The workflow releases the disposable database through
  // the audited control in an earlier step.
  const freeze = await one(`select state from public.rc1_operation_freeze_state where singleton`);
  check('R0 the disposable database is released, as the workflow established',
    freeze?.state === 'RELEASED', `state=${freeze?.state}`);

  // -------------------------------------------------------------------------
  // R1/R2
  // -------------------------------------------------------------------------
  const before = await one(`select
      (select count(*) from public.organisations) as organisations,
      (select count(*) from public.assessments) as assessments,
      (select count(*) from public.email_events) as email_events`);

  const startResponse = await fetch(`${routeBase}/api/assessments/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      fullName: 'RC1 Route Marking Respondent',
      email: `rc1-route-marking-${nonce}@example.test`,
      organisationName: `RC1 Route Marking Org ${nonce}`,
      consentPrivacy: true,
      consentResearch: false,
    }),
  });
  const startBody = await startResponse.json();
  check('R1 the real start route returns 201',
    startResponse.status === 201 && startBody.ok === true, `status=${startResponse.status}`);

  const { assessmentReference, assessmentId, organisationId } = startBody.data;
  const created = await one(`select
      (select count(*) from public.organisations) - $1 as organisations,
      (select count(*) from public.assessments) - $2 as assessments,
      (select count(*) from public.email_events) - $3 as email_events,
      (select count(*) from public.respondents where id in
         (select primary_respondent_id from public.assessments where id = $4)) as respondents,
      (select count(*) from public.assessment_tokens where assessment_id = $4) as assessment_tokens,
      (select count(*) from public.assessment_events where assessment_id = $4) as assessment_events`,
    [before.organisations, before.assessments, before.email_events, assessmentId]);
  check('R2a it creates exactly one of each expected record',
    Number(created.organisations) === 1 && Number(created.assessments) === 1
      && Number(created.email_events) === 1 && Number(created.respondents) === 1
      && Number(created.assessment_tokens) === 1 && Number(created.assessment_events) >= 1,
    JSON.stringify(created));

  const placeholder = await one(`select template_key, status, provider_mode, notification_type,
      provider_message_id is null as no_message_id, sent_at is null as no_sent_at,
      order_id is null and report_id is null and data_request_id is null as assessment_only
    from public.email_events where assessment_id = $1`, [assessmentId]);
  check('R2b the event is exactly the admissible non-provider resume placeholder',
    placeholder.template_key === 'resume_link_phase4_placeholder'
      && placeholder.status === 'queued' && placeholder.provider_mode === 'disabled'
      && placeholder.notification_type === null
      && placeholder.no_message_id && placeholder.no_sent_at && placeholder.assessment_only,
    JSON.stringify(placeholder));

  // -------------------------------------------------------------------------
  // A genuine local AAL2 session, through the real login and MFA routes.
  // -------------------------------------------------------------------------
  const { data: createdUser, error: createUserError } = await service.auth.admin.createUser({
    email: ADMIN_EMAIL, password: ADMIN_PASSWORD, email_confirm: true,
  });
  if (createUserError) throw createUserError;
  adminUserId = createdUser.user.id;
  await q(`insert into public.admin_profiles(id,email,full_name,role,status,mfa_required)
           values ($1,$2,'RC1 Marking Route Admin','platform_admin','active',true)`,
          [adminUserId, ADMIN_EMAIL]);

  const loginResponse = await fetch(`${routeBase}/api/admin/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });
  let cookie = cookieHeader(loginResponse);
  check('R3a the real login route issues a GoTrue session',
    loginResponse.status === 200 && /mk_admin_access_token=/.test(cookie),
    `status=${loginResponse.status}`);

  const enrollResponse = await fetch(`${routeBase}/api/admin/mfa/enroll`, { method: 'POST', headers: { cookie } });
  const enrollBody = await enrollResponse.json();
  factorId = enrollBody.factorId;
  check('R3b the real MFA enrol route returns a factor',
    enrollResponse.status === 200 && enrollBody.ok === true && !!factorId && !!enrollBody.secret,
    // The GoTrue message is surfaced verbatim: enrolment can only fail for a configuration or
    // session reason, and guessing at which would be worse than reading it.
    `status=${enrollResponse.status} error=${JSON.stringify(enrollBody?.error ?? null)}`);

  // GoTrue rejects a code from the wrong window, so try the current step and its neighbours.
  let verifyBody = null;
  for (const drift of [0, -30, 30]) {
    const verifyResponse = await fetch(`${routeBase}/api/admin/mfa/verify`, {
      method: 'POST', headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ factorId, code: totp(enrollBody.secret, Math.floor(Date.now() / 1000) + drift) }),
    });
    verifyBody = await verifyResponse.json();
    if (verifyResponse.status === 200 && verifyBody.ok === true) {
      cookie = cookieHeader(verifyResponse, cookie);
      break;
    }
  }
  check('R3c the real MFA verify route upgrades the session to aal2',
    verifyBody?.ok === true && verifyBody?.aal === 'aal2', JSON.stringify(verifyBody));

  // The session is genuine and AAL2: GoTrue issued it, and auth.sessions records the level.
  const session = await one(`select aal::text as aal from auth.sessions where user_id = $1
                             order by created_at desc limit 1`, [adminUserId]);
  check('R3d GoTrue recorded the session as aal2', session?.aal === 'aal2', JSON.stringify(session));

  const markResponse = await fetch(`${routeBase}/api/admin/rc1-synthetic-marking`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({
      assessmentReference, syntheticReference: SYNTHETIC_REF,
      reason: 'Route-level regression: marking a journey created by the real start route.',
    }),
  });
  const markBody = await markResponse.json();
  check('R3 a genuine platform_admin AAL2 session marks the organisation through the real route',
    markResponse.status === 200 && markBody.ok === true && markBody.marked === 1,
    `status=${markResponse.status} body=${JSON.stringify(markBody)}`);

  // -------------------------------------------------------------------------
  // R4/R5
  // -------------------------------------------------------------------------
  const agreement = await one(`select
      (select o.synthetic_certification_ref from public.organisations o where o.id = $1) as marker,
      (select a.synthetic_reference from public.rc1_synthetic_marking_audit a
        order by a.marked_at desc limit 1) as audit_reference,
      (select a.marked_count from public.rc1_synthetic_marking_audit a
        order by a.marked_at desc limit 1) as audit_count`, [organisationId]);
  check('R4 the organisation marker and the marking audit agree',
    agreement.marker === SYNTHETIC_REF && agreement.audit_reference === SYNTHETIC_REF
      && Number(agreement.audit_count) === 1, JSON.stringify(agreement));

  const dispatch = await one(`select
      (select count(*) from public.email_events e
         where e.provider_message_id is not null or e.sent_at is not null) as dispatched,
      (select count(*) from public.email_provider_events) as provider_events,
      (select count(*) from public.phase14_provider_attestations) as attestations,
      (select count(*) from public.report_delivery_authorizations) as authorizations`);
  check('R5 no external dispatch occurred',
    Number(dispatch.dispatched) === 0 && Number(dispatch.provider_events) === 0
      && Number(dispatch.attestations) === 0 && Number(dispatch.authorizations) === 0,
    JSON.stringify(dispatch));

  // -------------------------------------------------------------------------
  // R6: the real Storage-aware cleanup contract, from one captured prepare.
  // -------------------------------------------------------------------------
  await q(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({
    sub: adminUserId, role: 'authenticated', aal: 'aal2',
    session_id: (await one(`select id from auth.sessions where user_id = $1 order by created_at desc limit 1`,
                           [adminUserId])).id,
    exp: Math.floor(Date.now() / 1000) + 3600,
  })]);
  const prepared = (await one(`select public.rc1_prepare_synthetic_storage_cleanup($1) as p`, [SYNTHETIC_REF])).p;
  const cleaned = (await one(
    `select public.rc1_cleanup_synthetic_certification(
       p_reference => $1, p_reason => $2,
       p_expected_target_fingerprint => $3, p_expected_target_count => $4) as r`,
    [SYNTHETIC_REF, 'Removing the route-created certification journey through the real cleanup contract.',
     prepared.target_fingerprint, prepared.target_count])).r;
  const afterCleanup = await one(`select
      (select count(*) from public.organisations where id = $1) as organisations,
      (select count(*) from public.assessments where id = $2) as assessments,
      (select count(*) from public.email_events where assessment_id = $2) as email_events`,
    [organisationId, assessmentId]);
  check('R6 the marked journey is removed through the real cleanup contract',
    Number(afterCleanup.organisations) === 0 && Number(afterCleanup.assessments) === 0
      && Number(afterCleanup.email_events) === 0,
    `${JSON.stringify(afterCleanup)} result=${JSON.stringify(cleaned)}`);

  // -------------------------------------------------------------------------
  // R7/R8
  // -------------------------------------------------------------------------
  await fetch(`${routeBase}/api/admin/mfa/unenroll`, {
    method: 'POST', headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ factorId }),
  }).catch(() => {});
  await q(`delete from public.admin_profiles where id = $1`, [adminUserId]);
  await service.auth.admin.deleteUser(adminUserId);
  const identity = await one(`select
      (select count(*) from auth.users where id = $1) as users,
      (select count(*) from public.admin_profiles where id = $1) as profiles,
      (select count(*) from auth.sessions where user_id = $1) as sessions,
      (select count(*) from auth.mfa_factors where user_id = $1) as factors`, [adminUserId]);
  check('R7 the disposable local Auth identity and MFA artefacts are cleaned up',
    Number(identity.users) === 0 && Number(identity.profiles) === 0
      && Number(identity.sessions) === 0 && Number(identity.factors) === 0,
    JSON.stringify(identity));
  adminUserId = null;

  const residual = await one(`select
      (select count(*) from public.organisations) as organisations,
      (select count(*) from public.respondents) as respondents,
      (select count(*) from public.assessments) as assessments,
      (select count(*) from public.email_events) as email_events,
      (select count(*) from public.email_provider_events) as provider_events,
      (select count(*) from public.phase14_provider_attestations) as attestations,
      (select count(*) from public.reports) as reports,
      (select count(*) from public.orders) as orders,
      (select count(*) from storage.objects) as storage_objects`);
  check('R8 no residual business, delivery, provider or Storage data remains',
    Object.values(residual).every((v) => Number(v) === 0), JSON.stringify(residual));

  console.log('');
  console.log(`rc1-synthetic-marking-route: ${passed}/${passed} checks passed`);
} finally {
  if (adminUserId) {
    await q(`delete from public.admin_profiles where id = $1`, [adminUserId]).catch(() => {});
    await service.auth.admin.deleteUser(adminUserId).catch(() => {});
  }
  await db.end();
}
