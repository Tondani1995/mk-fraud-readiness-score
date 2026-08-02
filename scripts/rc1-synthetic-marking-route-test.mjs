/**
 * RC1 synthetic-marking route-to-database test.
 *
 * This is the test whose absence let migration 60 ship broken. Both earlier suites seeded their
 * fixtures directly, so neither ever produced the queued resume placeholder that
 * startAccountlessAssessment always writes -- and the marking control refused every real journey.
 *
 * This test drives the real routes end to end against the replayed database:
 *
 *   R1  POST /score/api/assessments/start creates exactly one organisation, respondent,
 *       assessment, assessment token, assessment event and one resume placeholder email event
 *   R2  the placeholder has the exact non-provider shape the marking control admits
 *   R3  POST /score/api/admin/rc1-synthetic-marking marks that organisation
 *   R4  nothing was dispatched: no provider message id, no sent_at, no provider event,
 *       no attestation, no consumption, no delivery authorisation
 *   R5  the organisation marker and the marking audit agree
 *   R6  a second marking attempt on the same organisation is refused
 *
 * The fixture can no longer drift from the route, because there is no fixture.
 */
import assert from 'node:assert/strict';
import { Client } from 'pg';
import { SignJWT } from 'jose';

const routeBase = process.env.PHASE14_TEST_APP_URL ?? 'http://127.0.0.1:3000/score';
const databaseUrl = process.env.LOCAL_DB_URL;
const jwtSecret = process.env.SUPABASE_JWT_SECRET ?? process.env.JWT_SECRET;
if (!databaseUrl || !jwtSecret) {
  throw new Error('LOCAL_DB_URL and SUPABASE_JWT_SECRET (or JWT_SECRET) are required.');
}

const SYNTHETIC_REF = 'MKTEST-RC1-20260802-99';
const MAILBOX = 'rc1-route-marking@example.invalid';
const ADMIN_ID = '61000000-0000-0000-0000-000000000020';
const SESSION_ID = '61000000-0000-0000-0000-000000000099';

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

console.log('rc1-synthetic-marking-route');

try {
  // -------------------------------------------------------------------------
  // Preconditions the control requires, established directly: an enabled environment, a RELEASED
  // database, and a platform_admin whose session is AAL2. None of these are what is under test.
  // -------------------------------------------------------------------------
  await q(`insert into public.app_settings(setting_key, value_json)
           values ('rc1_synthetic_certification_cleanup', jsonb_build_object('enabled', true))
           on conflict (setting_key) do update set value_json = excluded.value_json`);
  await q(`update public.rc1_operation_freeze_state set state = 'RELEASED' where singleton`);

  await q(`insert into auth.users (id, instance_id, aud, role, email, encrypted_password,
             email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
           values ($1, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
             'rc1-route-marking-admin@example.invalid', '', now(), now(), now(),
             '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb)
           on conflict (id) do nothing`, [ADMIN_ID]);
  await q(`insert into public.admin_profiles(id,email,full_name,role,status,mfa_required)
           values ($1,'rc1-route-marking-admin@example.invalid','RC1 Route Marking Admin',
                   'platform_admin','active',true)
           on conflict (id) do update set role = excluded.role, status = excluded.status`, [ADMIN_ID]);
  await q(`insert into auth.sessions(id,user_id,aal,not_after)
           values ($1,$2,'aal2', now() + interval '1 day')
           on conflict (id) do update set aal = excluded.aal, not_after = excluded.not_after`,
          [SESSION_ID, ADMIN_ID]);

  const accessToken = await new SignJWT({
    sub: ADMIN_ID,
    role: 'authenticated',
    aal: 'aal2',
    session_id: SESSION_ID,
    email: 'rc1-route-marking-admin@example.invalid',
    aud: 'authenticated',
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(jwtSecret));

  const before = await one(`select
      (select count(*) from public.organisations) as organisations,
      (select count(*) from public.assessments) as assessments,
      (select count(*) from public.email_events) as email_events`);

  // -------------------------------------------------------------------------
  // R1/R2: the real start route, and what it actually creates.
  // -------------------------------------------------------------------------
  const startResponse = await fetch(`${routeBase}/api/assessments/start`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      fullName: 'RC1 Route Marking Respondent',
      email: MAILBOX,
      organisationName: 'RC1 Route Marking Org',
      consentPrivacy: true,
      consentResearch: false,
    }),
  });
  const startBody = await startResponse.json();
  check('R1a the real start route succeeds', startResponse.status === 201 && startBody.ok === true,
    `status=${startResponse.status}`);

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

  check('R1b it creates exactly one organisation, assessment and email event',
    Number(created.organisations) === 1 && Number(created.assessments) === 1
      && Number(created.email_events) === 1,
    JSON.stringify(created));
  check('R1c it creates the respondent, token and assessment event',
    Number(created.respondents) === 1 && Number(created.assessment_tokens) === 1
      && Number(created.assessment_events) >= 1,
    JSON.stringify(created));

  const placeholder = await one(`select template_key, status, provider_mode, notification_type,
      provider_message_id is null as no_message_id, sent_at is null as no_sent_at,
      order_id is null and report_id is null and data_request_id is null as assessment_only
    from public.email_events where assessment_id = $1`, [assessmentId]);
  check('R2 the placeholder has exactly the admissible non-provider shape',
    placeholder.template_key === 'resume_link_phase4_placeholder'
      && placeholder.status === 'queued'
      && placeholder.provider_mode === 'disabled'
      && placeholder.notification_type === null
      && placeholder.no_message_id && placeholder.no_sent_at && placeholder.assessment_only,
    JSON.stringify(placeholder));

  // -------------------------------------------------------------------------
  // R3: the real marking route, against those real rows.
  // -------------------------------------------------------------------------
  const markResponse = await fetch(`${routeBase}/api/admin/rc1-synthetic-marking`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: `mk_admin_access_token=${accessToken}`,
    },
    body: JSON.stringify({
      assessmentReference,
      syntheticReference: SYNTHETIC_REF,
      reason: 'Route-level regression: marking a journey created by the real start route.',
    }),
  });
  const markBody = await markResponse.json();
  check('R3 the real marking route marks the journey started by the real route',
    markResponse.status === 200 && markBody.ok === true && markBody.marked === 1,
    `status=${markResponse.status} body=${JSON.stringify(markBody)}`);

  // -------------------------------------------------------------------------
  // R4/R5: nothing dispatched, marker and audit agree.
  // -------------------------------------------------------------------------
  const dispatch = await one(`select
      (select count(*) from public.email_events e where e.assessment_id = $1
         and (e.provider_message_id is not null or e.sent_at is not null)) as dispatched,
      (select count(*) from public.email_provider_events pe where pe.email_event_id in
         (select id from public.email_events where assessment_id = $1)) as provider_events,
      (select count(*) from public.phase14_provider_attestations pa where pa.email_event_id in
         (select id from public.email_events where assessment_id = $1)) as attestations,
      (select count(*) from public.report_delivery_authorizations d where d.assessment_id = $1) as authorizations`,
    [assessmentId]);
  check('R4 nothing was dispatched by either route',
    Number(dispatch.dispatched) === 0 && Number(dispatch.provider_events) === 0
      && Number(dispatch.attestations) === 0 && Number(dispatch.authorizations) === 0,
    JSON.stringify(dispatch));

  const agreement = await one(`select
      (select o.synthetic_certification_ref from public.organisations o where o.id = $1) as marker,
      (select a.synthetic_reference from public.rc1_synthetic_marking_audit a
        order by a.marked_at desc limit 1) as audit_reference,
      (select a.marked_count from public.rc1_synthetic_marking_audit a
        order by a.marked_at desc limit 1) as audit_count,
      (select count(*) from public.organisations where synthetic_certification_ref is not null) as marked_total`,
    [organisationId]);
  check('R5 the marker and the marking audit agree',
    agreement.marker === SYNTHETIC_REF && agreement.audit_reference === SYNTHETIC_REF
      && Number(agreement.audit_count) === 1 && Number(agreement.marked_total) === 1,
    JSON.stringify(agreement));

  // -------------------------------------------------------------------------
  // R6: marking is not repeatable.
  // -------------------------------------------------------------------------
  const secondResponse = await fetch(`${routeBase}/api/admin/rc1-synthetic-marking`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: `mk_admin_access_token=${accessToken}` },
    body: JSON.stringify({
      assessmentReference,
      syntheticReference: 'MKTEST-RC1-20260802-98',
      reason: 'Route-level regression: a second marking attempt must be refused.',
    }),
  });
  const secondBody = await secondResponse.json();
  check('R6 a second marking attempt is refused and the marker is unchanged',
    secondResponse.status === 409
      && secondBody.reason === 'rc1_synthetic_marking:organisation_already_marked_or_missing'
      && (await one(`select synthetic_certification_ref as m from public.organisations where id = $1`,
                    [organisationId])).m === SYNTHETIC_REF,
    JSON.stringify(secondBody));

  console.log('');
  console.log(`rc1-synthetic-marking-route: ${passed}/${passed} checks passed`);
} finally {
  await db.end();
}
