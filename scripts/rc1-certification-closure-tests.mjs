import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const migrationName = '20260803090000_rc1_certification_closure.sql';
const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', migrationName), 'utf8');
const assessmentSave = fs.readFileSync(path.join(root, 'src/lib/respondent/assessment-save.ts'), 'utf8');
const submitRoute = fs.readFileSync(path.join(root, 'src/app/score/api/assessments/[assessmentRef]/submit/route.ts'), 'utf8');

function section(source, start, end) {
  const from = source.indexOf(start);
  assert.notEqual(from, -1, `missing ${start}`);
  const to = source.indexOf(end, from);
  assert.notEqual(to, -1, `missing ${end}`);
  return source.slice(from, to);
}

const guardedSubmitUpdate = section(
  assessmentSave,
  ".from('assessments')\n    .update({",
  ".select('id')",
);

assert.match(guardedSubmitUpdate, /status:\s*'submitted'/);
assert.match(guardedSubmitUpdate, /submitted_at:\s*now/);
assert.match(guardedSubmitUpdate, /locked_at:\s*now/);
assert.match(guardedSubmitUpdate, /completion_percentage:\s*progress\.overallPct/);
assert.doesNotMatch(guardedSubmitUpdate, /completion_percentage:\s*100/);
for (const predicate of [".eq('status', 'draft')", ".is('locked_at', null)", ".is('submitted_at', null)"]) {
  assert.ok(assessmentSave.includes(predicate), `guarded submit predicate missing: ${predicate}`);
}
assert.match(assessmentSave, /revoked_at:\s*now/);
assert.match(submitRoute, /createSnapshotTokenForAssessment/);
assert.match(assessmentSave, /calculateAssessmentProgress/);

const requiredRelations = [
  'payment_proofs', 'payment_sessions', 'payment_automation_records', 'payment_transition_events',
  'order_events', 'report_fulfilments', 'report_generation_runs', 'report_generation_claims',
  'report_ai_attempts', 'manual_report_generation_attempts', 'manual_report_delivery_attempts',
  'report_quality_diagnostics', 'reports', 'report_events', 'report_delivery_authorizations',
  'report_delivery_finalizations', 'report_delivery_remediations', 'email_events',
  'email_provider_events', 'phase14_provider_attestations', 'phase14_provider_attestation_consumptions',
  'customer_report_access_tokens', 'phase14_storage_cleanup_queue', 'phase14_worker_capabilities',
  'phase14_workflow_start_outbox', 'customer_contact_verifications', 'score_question_traces',
  'maturity_cap_events', 'score_domain_results', 'score_runs', 'assessment_answers',
  'exposure_answers', 'assessment_tokens', 'assessment_events', 'assessment_resume_events',
  'audit_logs', 'assessments', 'respondents', 'organisations',
];
for (const relation of requiredRelations) assert.match(migration, new RegExp(`delete from (?:public\\.)?${relation}\\b`, 'i'), `missing deletion: ${relation}`);

const order = [
  'phase14_storage_cleanup_queue', 'phase14_workflow_start_outbox',
  'report_delivery_finalizations', 'phase14_provider_attestation_consumptions',
  'phase14_provider_attestations', 'report_delivery_remediations',
  'customer_contact_verifications', 'report_ai_attempts', 'report_generation_runs',
  'report_generation_claims', 'manual_report_generation_attempts',
  'report_delivery_authorizations', 'email_events', 'report_fulfilments',
  'phase14_worker_capabilities', 'reports',
  'score_question_traces', 'score_runs', 'payment_proofs', 'orders', 'assessments', 'organisations',
].map((relation) => [relation, migration.indexOf(`delete from public.${relation}`)]);
for (const [relation, index] of order) assert.ok(index > 0, `missing ordered delete: ${relation}`);
for (let i = 1; i < order.length; i += 1) assert.ok(order[i - 1][1] < order[i][1], `${order[i - 1][0]} must precede ${order[i][0]}`);

assert.match(migration, /security definer\s+set search_path = ''/i);
assert.match(migration, /rc1_require_platform_admin\(true\)/);
assert.match(migration, /rc1_synthetic_cleanup:not_enabled_in_this_environment/);
assert.match(migration, /p_reference !~ '\^MKTEST-RC1-\[0-9\]\{8\}-\[0-9\]\{2\}\$'/);
assert.match(migration, /set_config\('rc1\.synthetic_cleanup_ref', p_reference, true\)/);
assert.match(migration, /storage_target_mismatch/);
assert.match(migration, /storage_objects_remaining/);
assert.match(migration, /rc1_synthetic_cleanup:unrelated_dependency/);
assert.match(migration, /rc1_synthetic_cleanup:unmarked_or_missing/);
assert.match(migration, /'already_clean', true/);
assert.doesNotMatch(migration.split('\n').filter((line) => !line.trimStart().startsWith('--')).join('\n'), /session_replication_role|disable trigger/i);

for (const preserved of ['rc1_operation_freeze_state', 'rc1_synthetic_cleanup_audit', 'rc1_certification_enablement_audit', 'rc1_synthetic_marking_audit', 'phase14_operational_alerts']) {
  assert.doesNotMatch(migration, new RegExp(`delete from (?:public\\.)?${preserved}\\b`, 'i'), `must preserve ${preserved}`);
}
for (const productTable of ['products', 'methodology_versions', 'report_templates', 'phase14_feature_policies']) {
  assert.doesNotMatch(migration, new RegExp(`delete from (?:public\\.)?${productTable}\\b`, 'i'), `must preserve ${productTable}`);
}

console.log('RC1_CERTIFICATION_CLOSURE_CONTRACT_PASS');
