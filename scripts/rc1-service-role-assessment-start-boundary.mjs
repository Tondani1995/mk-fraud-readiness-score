import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import pg from 'pg';
import { startAccountlessAssessment } from '../src/lib/respondent/start-assessment.ts';

const expected = process.argv[2];
assert(['pre', 'post'].includes(expected), 'usage: node ... pre|post');
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const databaseUrl = process.env.LOCAL_DB_URL ?? '';

function assertLoopbackUrl(value, label) {
  const parsed = new URL(value);
  assert(
    ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname),
    `${label} must be loopback-only`,
  );
}

assert(supabaseUrl && serviceRoleKey && databaseUrl, 'local Supabase and database variables are required');
assertLoopbackUrl(supabaseUrl, 'NEXT_PUBLIC_SUPABASE_URL');
assertLoopbackUrl(databaseUrl, 'LOCAL_DB_URL');

const service = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const nonce = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const syntheticInput = {
  fullName: 'RC1 Privilege Contract Synthetic',
  email: `rc1-privilege-${nonce}@example.test`,
  roleTitle: 'Synthetic verifier',
  phone: null,
  organisationName: `RC1 Privilege Contract ${nonce}`,
  tradingName: null,
  industry: 'Testing',
  sector: null,
  province: 'Gauteng',
  employeeBand: '11-50',
  annualRevenueBand: 'R10m-R50m',
  consentPrivacy: true,
  consentResearch: false,
};

if (expected === 'pre') {
  await assert.rejects(
    startAccountlessAssessment(syntheticInput, 'http://127.0.0.1:3100'),
    (error) => {
      const text = String(error?.message ?? error);
      return /permission denied.*methodology_versions|methodology_versions.*permission denied/i.test(text);
    },
    'pre-46 assessment start must fail at methodology_versions SELECT',
  );
  const admin = await service.from('admin_profiles').select('id').limit(1);
  assert(admin.error, 'pre-46 admin profile lookup must be denied');
  assert.match(String(admin.error.message), /permission denied/i);
  console.log(JSON.stringify({
    expected,
    assessmentStart: 'denied_at_methodology_versions',
    adminSessionResolution: 'denied_at_admin_profiles',
  }));
  process.exit(0);
}

const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();
const originalFreeze = (await client.query(
  'select * from public.rc1_operation_freeze_state where singleton=true',
)).rows[0];
assert.equal(originalFreeze.state, 'FROZEN', 'post-46 boundary must start frozen');

try {
  await client.query('begin');
  await client.query("select set_config('rc1.freeze_control_transition','release',true)");
  await client.query(`
    update public.rc1_operation_freeze_state
    set state='RELEASED',
        released_at=clock_timestamp(),
        released_by_fingerprint=repeat('1',64),
        release_reason_fingerprint=repeat('2',64),
        release_evidence_fingerprint=repeat('3',64),
        active_canary_authorization_hash=null,
        active_canary_expires_at=null,
        updated_at=clock_timestamp()
    where singleton=true
  `);
  await client.query('commit');
} catch (error) {
  await client.query('rollback');
  throw error;
}

try {
  const started = await startAccountlessAssessment(
    syntheticInput,
    'http://127.0.0.1:3100',
  );
  assert(started.assessmentId && started.organisationId && started.respondentId);

  const admin = await service.from('admin_profiles').select('id').limit(1);
  assert.ifError(admin.error);

  const methodology = await service
    .from('methodology_versions')
    .select('id')
    .eq('status', 'active')
    .maybeSingle();
  assert.ifError(methodology.error);
  assert(methodology.data?.id);

  const compensationOrganisation = await service
    .from('organisations')
    .insert({ legal_name: `RC1 Compensation ${nonce}`, country: 'South Africa' })
    .select('id')
    .single();
  assert.ifError(compensationOrganisation.error);
  const compensationRespondent = await service
    .from('respondents')
    .insert({
      organisation_id: compensationOrganisation.data.id,
      full_name: 'RC1 Compensation Synthetic',
      email: `rc1-compensation-${nonce}@example.test`,
      consent_privacy: true,
      consent_research: false,
    })
    .select('id')
    .single();
  assert.ifError(compensationRespondent.error);
  const compensationAssessment = await service
    .from('assessments')
    .insert({
      assessment_reference: `RC1-COMP-${nonce}`.slice(0, 64),
      organisation_id: compensationOrganisation.data.id,
      primary_respondent_id: compensationRespondent.data.id,
      methodology_version_id: methodology.data.id,
      status: 'draft',
    })
    .select('id')
    .single();
  assert.ifError(compensationAssessment.error);
  assert.ifError((
    await service.from('assessments').delete().eq('id', compensationAssessment.data.id)
  ).error);
  assert.ifError((
    await service.from('respondents').delete().eq('id', compensationRespondent.data.id)
  ).error);
  assert.ifError((
    await service.from('organisations').delete().eq('id', compensationOrganisation.data.id)
  ).error);

  await client.query('begin');
  for (const table of [
    'assessment_events',
    'email_events',
    'audit_logs',
    'assessment_tokens',
  ]) {
    await client.query(`delete from public.${table} where assessment_id=$1`, [started.assessmentId]);
  }
  await client.query('delete from public.assessments where id=$1', [started.assessmentId]);
  await client.query('delete from public.respondents where id=$1', [started.respondentId]);
  await client.query('delete from public.organisations where id=$1', [started.organisationId]);
  await client.query('commit');

  console.log(JSON.stringify({
    expected,
    assessmentStart: 'succeeded',
    adminSessionResolution: 'succeeded',
    compensatingDeletes: 'succeeded',
    syntheticRowsCleaned: true,
  }));
} finally {
  try {
    await client.query('rollback');
  } catch {
    // No active transaction is expected after a successful run.
  }
  await client.query('begin');
  await client.query("select set_config('rc1.freeze_control_transition','activate',true)");
  await client.query(`
    update public.rc1_operation_freeze_state
    set state=$1,
        freeze_epoch=$2,
        activated_at=$3,
        activated_by_fingerprint=$4,
        activation_reason_fingerprint=$5,
        released_at=$6,
        released_by_fingerprint=$7,
        release_reason_fingerprint=$8,
        release_evidence_fingerprint=$9,
        active_canary_authorization_hash=$10,
        active_canary_expires_at=$11,
        updated_at=$12
    where singleton=true
  `, [
    originalFreeze.state,
    originalFreeze.freeze_epoch,
    originalFreeze.activated_at,
    originalFreeze.activated_by_fingerprint,
    originalFreeze.activation_reason_fingerprint,
    originalFreeze.released_at,
    originalFreeze.released_by_fingerprint,
    originalFreeze.release_reason_fingerprint,
    originalFreeze.release_evidence_fingerprint,
    originalFreeze.active_canary_authorization_hash,
    originalFreeze.active_canary_expires_at,
    originalFreeze.updated_at,
  ]);
  await client.query('commit');
  await client.end();
}
