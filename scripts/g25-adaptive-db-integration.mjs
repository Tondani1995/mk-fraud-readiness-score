import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const url = process.env.G25_SUPABASE_URL;
const serviceRoleKey = process.env.G25_SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceRoleKey) {
  console.error('Set G25_SUPABASE_URL and G25_SUPABASE_SERVICE_ROLE_KEY for the Staging integration test.');
  process.exit(2);
}

const db = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
const fixtureReference = process.env.G25_DB_TEST_REF ?? 'MKADAPT-QA-20260804-01';
const { data: assessment, error: assessmentError } = await db.from('assessments')
  .select('id,assessment_reference,graph_version_id,assessment_mode,status')
  .eq('assessment_reference', fixtureReference)
  .single();
if (assessmentError) throw assessmentError;
assert.equal(assessment.assessment_mode, 'adaptive');
assert.equal(assessment.status, 'draft');

const { data: navigation, error: navigationError } = await db.from('assessment_navigation_states')
  .select('save_sequence,current_screen,current_question_id')
  .eq('assessment_id', assessment.id)
  .single();
if (navigationError) throw navigationError;

const beforeEmailCount = await db.from('email_events').select('id', { count: 'exact', head: true });
if (beforeEmailCount.error) throw beforeEmailCount.error;

const gatewayAnswers = [{ question_id: 'G01', response_value: 'professional_services' }];
const controlResponses = [{ question_id: 'D1-Q01', response_state: 'unknown', response_value: null }];
const save = (expectedSaveSequence) => db.rpc('adaptive_save_state', {
  p_assessment_id: assessment.id,
  p_expected_save_sequence: expectedSaveSequence,
  p_current_screen: 'question',
  p_current_question_id: 'D1-Q01',
  p_visited_question_ids: ['G01', 'D1-Q01'],
  p_gateway_answers: gatewayAnswers,
  p_control_responses: controlResponses,
  p_invalidate_question_ids: [],
  p_history: []
});

const first = await save(Number(navigation.save_sequence));
if (first.error) throw first.error;
assert.equal(first.data.ok, true, 'first save must succeed');

const second = await save(first.data.save_sequence);
if (second.error) throw second.error;
assert.equal(second.data.ok, true, 'repeated save must reuse the same attempt rows');

const [concurrentA, concurrentB] = await Promise.all([save(second.data.save_sequence), save(second.data.save_sequence)]);
for (const result of [concurrentA, concurrentB]) if (result.error) throw result.error;
assert.equal([concurrentA.data.conflict, concurrentB.data.conflict].filter(Boolean).length, 1, 'concurrent saves must serialize with one stale conflict');

const { count: gatewayCount, error: gatewayError } = await db.from('adaptive_gateway_answers').select('id', { count: 'exact', head: true }).eq('assessment_id', assessment.id);
if (gatewayError) throw gatewayError;
const { count: controlCount, error: controlError } = await db.from('adaptive_control_responses').select('id', { count: 'exact', head: true }).eq('assessment_id', assessment.id);
if (controlError) throw controlError;
const afterEmailCount = await db.from('email_events').select('id', { count: 'exact', head: true });
if (afterEmailCount.error) throw afterEmailCount.error;
assert.equal(gatewayCount, 1);
assert.equal(controlCount, 1);
assert.equal(afterEmailCount.count, beforeEmailCount.count, 'adaptive save must not create a provider/email event');

console.log(JSON.stringify({
  ok: true,
  fixtureReference,
  firstSave: first.data,
  repeatedSave: second.data,
  concurrentResults: [concurrentA.data, concurrentB.data],
  gatewayCount,
  controlCount,
  emailEventsUnchanged: true,
  applicationAuditInsert: 'none: adaptive route uses RPC-only mutations'
}));
