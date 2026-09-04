/**
 * Joint launch Comprehensive lifecycle, evidence-intake and security tests.
 * Credential-free: no database, no network, no storage provider.
 *
 * Covers the COMPREHENSIVE and SECURITY requirements: payment is required before an engagement can
 * progress, valid lifecycle transitions succeed and invalid ones fail, reviewer assignment and
 * sign-off are audited with the acting administrator, evidence is private and cannot be read
 * across orders, and the MIME/size guard is closed rather than permissive.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import {
  COMPREHENSIVE_ENGAGEMENT_STATES,
  COMPREHENSIVE_INITIAL_STATE,
  COMPREHENSIVE_TERMINAL_STATES,
  allowedNextStates,
  evaluateTransition,
  isComprehensiveEngagementState,
  transitionRequiresNote
} from '../src/lib/commercial/comprehensive-lifecycle.ts';
import {
  COMPREHENSIVE_EVIDENCE_BUCKET,
  EVIDENCE_ALLOWED_MIME_TYPES,
  EVIDENCE_DECIDED_STATUSES,
  EVIDENCE_MAX_BYTES,
  EVIDENCE_RETENTION_POLICY_KEY,
  EVIDENCE_VALIDATION_STATUSES,
  evaluateEvidenceUpload,
  evidenceStoragePath,
  isEvidenceDecided,
  sanitiseEvidenceFilename
} from '../src/lib/commercial/evidence-policy.ts';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

let checks = 0;
function check(label, fn) {
  fn();
  checks += 1;
  console.log(`  ok - ${label}`);
}

const READY = { paymentVerified: true, reviewerAssigned: true, unreviewedEvidenceCount: 0, note: 'note' };

console.log('joint-launch comprehensive lifecycle, evidence and security');

// --- LIFECYCLE ------------------------------------------------------------------------------------

check('the engagement state model is separate from payment and report status', () => {
  assert.equal(COMPREHENSIVE_INITIAL_STATE, 'awaiting_payment');
  for (const required of [
    'awaiting_payment', 'payment_received', 'evidence_requested',
    'evidence_received', 'in_review', 'review_complete', 'delivered'
  ]) {
    assert.ok(COMPREHENSIVE_ENGAGEMENT_STATES.includes(required), `missing state ${required}`);
  }
  // The engagement column is its own concern; the order keeps its own payment status.
  const migration = read('supabase/migrations/20260810121000_joint_launch_comprehensive_lifecycle.sql');
  assert.match(migration, /state public\.comprehensive_engagement_state not null default 'awaiting_payment'/);
  assert.doesNotMatch(migration, /alter table public\.orders/);
});

check('payment is required before a Comprehensive engagement can progress', () => {
  const rejected = evaluateTransition('awaiting_payment', 'payment_received', { ...READY, paymentVerified: false });
  assert.equal(rejected.allowed, false);
  assert.equal(rejected.reason, 'payment_not_verified');
  assert.equal(evaluateTransition('awaiting_payment', 'payment_received', READY).allowed, true);
});

check('the happy path traverses every required state', () => {
  const path = [
    'awaiting_payment', 'payment_received', 'evidence_requested',
    'evidence_received', 'in_review', 'review_complete', 'delivered'
  ];
  for (let index = 0; index < path.length - 1; index += 1) {
    const evaluation = evaluateTransition(path[index], path[index + 1], READY);
    assert.equal(evaluation.allowed, true, `${path[index]} -> ${path[index + 1]} must be allowed`);
  }
});

check('invalid and skipping transitions fail', () => {
  for (const [from, to] of [
    ['awaiting_payment', 'in_review'],
    ['awaiting_payment', 'delivered'],
    ['payment_received', 'review_complete'],
    ['evidence_requested', 'delivered'],
    ['evidence_received', 'review_complete'],
    ['in_review', 'delivered']
  ]) {
    const evaluation = evaluateTransition(from, to, READY);
    assert.equal(evaluation.allowed, false, `${from} -> ${to} must be rejected`);
    assert.equal(evaluation.reason, 'invalid_transition');
  }
});

check('backwards transitions are rejected except the two explicit, note-requiring returns', () => {
  for (const [from, to] of [
    ['payment_received', 'awaiting_payment'],
    ['evidence_received', 'payment_received'],
    ['in_review', 'evidence_received'],
    ['delivered', 'review_complete'],
    ['review_complete', 'evidence_received']
  ]) {
    assert.equal(evaluateTransition(from, to, READY).allowed, false, `${from} -> ${to} must be rejected`);
  }
  // The two permitted returns, both requiring a note.
  assert.equal(evaluateTransition('in_review', 'evidence_requested', READY).allowed, true);
  assert.equal(evaluateTransition('review_complete', 'in_review', READY).allowed, true);
  assert.equal(transitionRequiresNote('in_review', 'evidence_requested'), true);
  assert.equal(transitionRequiresNote('review_complete', 'in_review'), true);
  assert.equal(
    evaluateTransition('in_review', 'evidence_requested', { ...READY, note: '   ' }).reason,
    'note_required'
  );
});

check('terminal states cannot transition further', () => {
  for (const terminal of COMPREHENSIVE_TERMINAL_STATES) {
    assert.deepEqual(allowedNextStates(terminal), []);
    const evaluation = evaluateTransition(terminal, 'in_review', READY);
    assert.equal(evaluation.allowed, false);
    assert.equal(evaluation.reason, 'terminal_state');
  }
});

check('cancellation is reachable from every non-terminal state and always requires a note', () => {
  for (const state of COMPREHENSIVE_ENGAGEMENT_STATES) {
    if (COMPREHENSIVE_TERMINAL_STATES.includes(state)) continue;
    assert.ok(allowedNextStates(state).includes('cancelled'), `${state} must be cancellable`);
    assert.equal(transitionRequiresNote(state, 'cancelled'), true);
    assert.equal(evaluateTransition(state, 'cancelled', { ...READY, note: null }).reason, 'note_required');
  }
});

check('review cannot enter or complete without a named reviewer', () => {
  const unassigned = { ...READY, reviewerAssigned: false };
  assert.equal(evaluateTransition('evidence_received', 'in_review', unassigned).reason, 'reviewer_not_assigned');
  assert.equal(evaluateTransition('in_review', 'review_complete', unassigned).reason, 'reviewer_not_assigned');
});

check('review cannot complete while evidence still has no reviewer decision', () => {
  const evaluation = evaluateTransition('in_review', 'review_complete', { ...READY, unreviewedEvidenceCount: 2 });
  assert.equal(evaluation.allowed, false);
  assert.equal(evaluation.reason, 'evidence_not_reviewed');
  assert.match(evaluation.message, /2 evidence item/);
});

check('unknown states are rejected rather than coerced', () => {
  assert.equal(isComprehensiveEngagementState('in_review'), true);
  for (const value of ['done', '', null, undefined, 7, {}]) {
    assert.equal(isComprehensiveEngagementState(value), false);
    assert.equal(evaluateTransition('in_review', value, READY).reason, 'unknown_state');
  }
});

check('the database enforces the same transition graph as the TypeScript guard', () => {
  const migration = read('supabase/migrations/20260810121000_joint_launch_comprehensive_lifecycle.sql');
  assert.match(migration, /comprehensive_engagement_transition_allowed/);
  assert.match(migration, /comprehensive_engagement_invalid_transition/);
  assert.match(migration, /trg_comprehensive_engagement_state_guard/);
  // Every SQL branch must match the TypeScript allow-list exactly.
  for (const state of COMPREHENSIVE_ENGAGEMENT_STATES) {
    const next = allowedNextStates(state);
    if (!next.length) continue;
    const branch = new RegExp(`when '${state}'\\s+then to_state in \\(([^)]*)\\)`);
    const found = migration.match(branch);
    assert.ok(found, `SQL transition graph is missing a branch for ${state}`);
    const sqlTargets = found[1].split(',').map((item) => item.trim().replace(/'/g, '')).sort();
    assert.deepEqual(sqlTargets, [...next].sort(), `SQL and TypeScript disagree about ${state}`);
  }
});

check('reviewer assignment, sign-off and every state change are audited with the acting actor', () => {
  const service = read('src/lib/comprehensive/engagement-service.ts');
  assert.match(service, /event_type: reassigned \? 'reviewer_reassigned' : 'reviewer_assigned'/);
  assert.match(service, /actor_admin_user_id: input\.actor\.id/);
  assert.match(service, /event_type: 'review_signed_off'/);
  assert.match(service, /event_type: 'sign_off_withdrawn'/);
  assert.match(service, /patch\.signed_off_by = input\.actor\.id/);
  assert.match(service, /sign_off_statement_required/);

  const migration = read('supabase/migrations/20260810121000_joint_launch_comprehensive_lifecycle.sql');
  // Sign-off and reviewer notes cannot be silently rewritten.
  assert.match(migration, /comprehensive_engagement_sign_off_immutable/);
  assert.match(migration, /comprehensive_engagement_sign_off_statement_immutable/);
  assert.match(migration, /comprehensive_engagement_reviewer_cannot_be_unassigned/);
  // The audit trail is append-only.
  assert.match(migration, /comprehensive_engagement_events_are_append_only/);
  assert.match(migration, /before update or delete on public\.comprehensive_engagement_events/);
  // review_complete / delivered are impossible without a named signer.
  assert.match(migration, /state not in \('review_complete', 'delivered'\) or signed_off_by is not null/);
});

check('concurrent administrators cannot both win a transition', () => {
  const service = read('src/lib/comprehensive/engagement-service.ts');
  assert.match(service, /\.eq\('state', engagement\.state\)\s*\n\s*\.eq\('state_version', engagement\.stateVersion\)/);
  assert.match(service, /concurrent_modification/);
  const migration = read('supabase/migrations/20260810121000_joint_launch_comprehensive_lifecycle.sql');
  assert.match(migration, /new\.state_version := old\.state_version \+ 1;/);
  // state_version must not drift on unrelated updates, or the guard would reject valid writes.
  assert.match(migration, /new\.state_version := old\.state_version;/);
});

check('payment verification reuses the existing contract rather than a weaker second rule', () => {
  const service = read('src/lib/comprehensive/engagement-service.ts');
  assert.match(service, /evaluatePaymentVerificationEvidence/);
  assert.match(service, /isValidPaymentSourceEvent/);
  assert.match(service, /\.eq\('new_state', 'PAID'\)/);
  assert.match(service, /\.eq\('processing_result', 'applied'\)/);
});

check('one live Comprehensive engagement per assessment', () => {
  const migration = read('supabase/migrations/20260810121000_joint_launch_comprehensive_lifecycle.sql');
  assert.match(migration, /create unique index if not exists comprehensive_engagements_one_live_per_assessment_uidx/);
  assert.match(migration, /where state <> 'cancelled'/);
  assert.match(migration, /order_id uuid not null unique references public\.orders\(id\)/);
});

// --- EVIDENCE POLICY --------------------------------------------------------------------------------

check('the evidence MIME allowlist is closed and contains nothing executable', () => {
  for (const forbidden of [
    'application/x-msdownload', 'application/x-sh', 'application/javascript', 'text/html',
    'application/octet-stream', 'application/zip', 'image/svg+xml', 'application/x-executable'
  ]) {
    assert.equal(
      EVIDENCE_ALLOWED_MIME_TYPES.includes(forbidden),
      false,
      `${forbidden} must never be an accepted evidence type`
    );
    assert.equal(
      evaluateEvidenceUpload({ filename: 'evidence.bin', contentType: forbidden, sizeBytes: 10 }).accepted,
      false
    );
  }
  for (const allowed of EVIDENCE_ALLOWED_MIME_TYPES) {
    assert.equal(evaluateEvidenceUpload({ filename: 'evidence.pdf', contentType: allowed, sizeBytes: 10 }).accepted, true);
  }
});

check('an absent, empty or unrecognised content type is rejected, never sniffed or defaulted', () => {
  for (const contentType of [undefined, null, '', 'not/a-type', 42, {}]) {
    const result = evaluateEvidenceUpload({ filename: 'evidence.pdf', contentType, sizeBytes: 10 });
    assert.equal(result.accepted, false);
    assert.equal(result.reason, 'content_type_not_allowed');
  }
  // Parameters after the media type are tolerated; the media type itself still has to match.
  assert.equal(
    evaluateEvidenceUpload({ filename: 'e.csv', contentType: 'text/csv; charset=utf-8', sizeBytes: 10 }).accepted,
    true
  );
});

check('the size guard rejects empty, missing, non-integer and oversized uploads', () => {
  assert.equal(EVIDENCE_MAX_BYTES, 26214400);
  const base = { filename: 'evidence.pdf', contentType: 'application/pdf' };
  assert.equal(evaluateEvidenceUpload({ ...base, sizeBytes: 0 }).reason, 'empty_file');
  assert.equal(evaluateEvidenceUpload({ ...base, sizeBytes: -1 }).reason, 'empty_file');
  assert.equal(evaluateEvidenceUpload({ ...base, sizeBytes: undefined }).reason, 'size_missing');
  assert.equal(evaluateEvidenceUpload({ ...base, sizeBytes: '100' }).reason, 'size_missing');
  assert.equal(evaluateEvidenceUpload({ ...base, sizeBytes: 1.5 }).reason, 'size_missing');
  assert.equal(evaluateEvidenceUpload({ ...base, sizeBytes: EVIDENCE_MAX_BYTES }).accepted, true);
  assert.equal(evaluateEvidenceUpload({ ...base, sizeBytes: EVIDENCE_MAX_BYTES + 1 }).reason, 'size_exceeded');
});

check('filenames cannot carry traversal, path separators or markup', () => {
  assert.equal(sanitiseEvidenceFilename('../../etc/passwd'), 'passwd');
  assert.equal(sanitiseEvidenceFilename('..\\..\\windows\\system32\\cmd.exe'), 'cmd.exe');
  // The path split runs first, so markup containing a slash is truncated to its last segment and
  // then stripped of every character outside the conservative allowlist.
  assert.equal(sanitiseEvidenceFilename('<script>alert(1)</script>.pdf'), 'script.pdf');
  assert.equal(sanitiseEvidenceFilename('<img src=x onerror=alert(1)>.png'), 'img srcx onerroralert1.png');
  assert.equal(sanitiseEvidenceFilename('..'), null);
  assert.equal(sanitiseEvidenceFilename(''), null);
  assert.equal(sanitiseEvidenceFilename(null), null);
  assert.equal(sanitiseEvidenceFilename('/'), null);
  assert.equal(sanitiseEvidenceFilename('policy register 2026.xlsx'), 'policy register 2026.xlsx');
});

check('the storage path is server-derived and cannot be steered by the client', () => {
  const storagePath = evidenceStoragePath({
    organisationId: '11111111-1111-4111-8111-111111111111',
    orderReference: 'MKORD-2026-ABC123',
    evidenceId: '22222222-2222-4222-8222-222222222222',
    filename: '../evil.pdf'
  });
  assert.equal(storagePath, '11111111-1111-4111-8111-111111111111/MKORD-2026-ABC123/22222222-2222-4222-8222-222222222222.pdf');
  assert.equal(storagePath.includes('..'), false);
  // The database rejects any path outside that exact shape.
  const migration = read('supabase/migrations/20260810122000_joint_launch_comprehensive_evidence.sql');
  assert.match(migration, /comprehensive_evidence_items_storage_path_shape_chk/);
});

check('the evidence validation taxonomy distinguishes intake facts from reviewer decisions', () => {
  for (const status of [
    'not_requested', 'requested', 'received', 'reviewed',
    'supported', 'not_supported', 'insufficient', 'not_applicable'
  ]) {
    assert.ok(EVIDENCE_VALIDATION_STATUSES.includes(status), `missing status ${status}`);
  }
  // Supplying evidence is not a decision, so it never counts as reviewed.
  assert.equal(isEvidenceDecided('received'), false);
  assert.equal(isEvidenceDecided('requested'), false);
  assert.equal(isEvidenceDecided('not_requested'), false);
  for (const decided of EVIDENCE_DECIDED_STATUSES) assert.equal(isEvidenceDecided(decided), true);
  assert.equal(EVIDENCE_DECIDED_STATUSES.includes('supported'), true);
  assert.equal(EVIDENCE_DECIDED_STATUSES.includes('not_supported'), true);
});

check('supplying evidence does not by itself validate a control', () => {
  const service = read('src/lib/comprehensive/evidence-service.ts');
  // A negative or inconclusive finding must carry a reason.
  assert.match(service, /observation_required/);
  assert.match(service, /validationStatus === 'not_supported' \|\| validationStatus === 'insufficient'/);
  // A decision always names the reviewer who made it.
  assert.match(service, /reviewed_by: decided \? input\.actor\.id : null/);
  const migration = read('supabase/migrations/20260810122000_joint_launch_comprehensive_evidence.sql');
  assert.match(migration, /comprehensive_evidence_items_decision_actor_chk/);
  const route = read('src/app/score/api/assessments/[assessmentRef]/comprehensive-evidence/route.ts');
  assert.match(route, /does not by itself validate a control/);
});

// --- SECURITY --------------------------------------------------------------------------------------

check('the evidence bucket is private and no public object is ever produced', () => {
  assert.equal(COMPREHENSIVE_EVIDENCE_BUCKET, 'comprehensive-evidence');
  const migration = read('supabase/migrations/20260810122000_joint_launch_comprehensive_evidence.sql');
  assert.match(migration, /'comprehensive-evidence',\s*\n\s*'comprehensive-evidence',\s*\n\s*false,/);
  assert.match(migration, /public = false/);
  assert.match(migration, /joint_launch_evidence_bucket_not_private/);
  assert.match(migration, /comprehensive_evidence_items_private_bucket_chk/);

  // No code path mints a public or signed URL for evidence. The admin reviewer route is retired;
  // evidence remains covered by the customer intake route and service layer.
  for (const file of [
    'src/lib/comprehensive/evidence-service.ts',
    'src/app/score/api/assessments/[assessmentRef]/comprehensive-evidence/route.ts'
  ]) {
    const source = read(file);
    assert.doesNotMatch(source, /getPublicUrl/, `${file} must not produce a public evidence URL`);
    assert.doesNotMatch(source, /createSignedUrl/, `${file} must not mint a signed evidence URL`);
  }
});

check('anon and authenticated cannot list or read evidence', () => {
  const migration = read('supabase/migrations/20260810122000_joint_launch_comprehensive_evidence.sql');
  assert.match(migration, /alter table public\.comprehensive_evidence_items enable row level security/);
  assert.match(migration, /revoke all on table public\.comprehensive_evidence_items from anon, authenticated/);
  assert.match(migration, /revoke all on table public\.comprehensive_evidence_events from anon, authenticated/);
  // Every policy is admin-role scoped; none grants a broad or PUBLIC role.
  const policies = migration.match(/create policy [\s\S]*?;/g) ?? [];
  assert.ok(policies.length > 0, 'evidence policies must exist');
  for (const policy of policies) {
    assert.match(policy, /public\.current_admin_role\(\) in \('platform_admin', 'reviewer', 'approver'\)/);
    assert.doesNotMatch(policy, /\bto\s+(public|anon|authenticated)\b/);
    assert.doesNotMatch(policy, /using \(true\)/);
  }
  assert.doesNotMatch(migration, /grant[^\n]*to (anon|authenticated|public)/i);
});

check('evidence reads are denied to unauthorised roles', () => {
  const service = read('src/lib/comprehensive/evidence-service.ts');
  assert.match(service, /EVIDENCE_REVIEW_ROLES: readonly AdminRole\[\] = \['platform_admin', 'reviewer', 'approver'\]/);
  assert.match(service, /if \(!canReviewComprehensiveEvidence\(input\.actorRole\)\) \{[\s\S]*?reason: 'forbidden'/);
  // finance_admin and read_only_admin are deliberately absent from evidence review.
  assert.doesNotMatch(service, /EVIDENCE_REVIEW_ROLES[^\n]*finance_admin/);
  assert.doesNotMatch(service, /EVIDENCE_REVIEW_ROLES[^\n]*read_only_admin/);
});

check('evidence cannot be read or reviewed across orders', () => {
  const service = read('src/lib/comprehensive/evidence-service.ts');
  assert.match(service, /evidence_engagement_mismatch/);
  assert.match(service, /existing\.engagement_id !== input\.engagementId/);
  assert.match(service, /\.eq\('engagement_id', input\.engagementId\)/);

  assert.equal(fs.existsSync(path.join(root, 'src/app/score/api/admin/comprehensive/[orderReference]/evidence/[evidenceId]/route.ts')), false, 'the retired admin reviewer evidence route is not active');

  // The database independently rejects a mismatched order/assessment binding.
  const migration = read('supabase/migrations/20260810122000_joint_launch_comprehensive_evidence.sql');
  assert.match(migration, /comprehensive_evidence_binding_mismatch/);
  assert.match(migration, /trg_comprehensive_evidence_binding_guard/);
});

check('evidence belongs to the engagement resolved from the token-validated assessment', () => {
  const service = read('src/lib/comprehensive/evidence-service.ts');
  assert.match(service, /\.eq\('assessment_id', input\.assessment\.id\)/);
  assert.match(service, /\.neq\('state', 'cancelled'\)/);
  const route = read('src/app/score/api/assessments/[assessmentRef]/comprehensive-evidence/route.ts');
  assert.match(route, /validateSnapshotToken/);
  assert.match(route, /assessment: validation\.assessment/);
  // No client-supplied engagement or order identifier reaches the service.
  assert.doesNotMatch(route, /engagementId:/);
  assert.doesNotMatch(route, /orderId:/);
});

check('intake facts about a stored evidence object are immutable', () => {
  const migration = read('supabase/migrations/20260810122000_joint_launch_comprehensive_evidence.sql');
  assert.match(migration, /comprehensive_evidence_intake_facts_immutable/);
  assert.match(migration, /comprehensive_evidence_events_are_append_only/);
});

check('no retention period is asserted; only the configuration seam exists', () => {
  assert.equal(EVIDENCE_RETENTION_POLICY_KEY, 'unset');
  const migration = read('supabase/migrations/20260810122000_joint_launch_comprehensive_evidence.sql');
  assert.match(migration, /retention_policy_key text not null default 'unset'/);
  assert.match(migration, /No retention period has been\n-- approved/);
  assert.match(migration, /retention_review_due_at timestamptz/);
  assert.match(migration, /erasure_requested_at timestamptz/);
  // Nothing deletes evidence on a schedule.
  assert.doesNotMatch(migration, /delete from public\.comprehensive_evidence_items/);
});

check('no Supabase service credential can reach the client', () => {
  for (const file of [
    'src/lib/comprehensive/evidence-service.ts',
    'src/lib/comprehensive/engagement-service.ts',
    'src/lib/commercial/order-service.ts'
  ]) {
    const source = read(file);
    assert.doesNotMatch(source, /^\s*['"]use client['"]/m, `${file} must remain a server module`);
    assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY/, `${file} must not name the service key`);
  }
});

check('the retired Comprehensive reviewer workspace and admin APIs are not active', () => {
  for (const file of [
    'src/app/score/admin/comprehensive/[orderReference]/page.tsx',
    'src/app/score/api/admin/comprehensive/[orderReference]/route.ts',
    'src/app/score/api/admin/comprehensive/[orderReference]/generate/route.ts',
    'src/app/score/api/admin/comprehensive/[orderReference]/finalise/route.ts',
    'src/app/score/api/admin/comprehensive/[orderReference]/review-records/route.ts',
    'src/app/score/api/admin/comprehensive/[orderReference]/reviewer/route.ts',
    'src/app/score/api/admin/comprehensive/[orderReference]/transition/route.ts',
    'src/app/score/api/admin/comprehensive/[orderReference]/evidence/[evidenceId]/route.ts',
    'src/components/comprehensive/ComprehensiveReviewWorkspace.tsx'
  ]) assert.equal(fs.existsSync(path.join(root, file)), false, `${file} must be retired from the active application`);
  const paidOrder = read('src/app/score/api/assessments/[assessmentRef]/paid-order/route.ts');
  assert.doesNotMatch(paidOrder, /getRc1OperationFreezeResponse|MK_RC1_OPERATION_FREEZE_MODE|RC1_OPERATION_FROZEN/);
  for (const required of [
    'validateSnapshotToken', 'isSelfServicePaidTier', 'parseInvoiceRequest',
    'createPaidOrderForAssessment'
  ]) assert.match(paidOrder, new RegExp(required), `paid-order must retain ${required}`);
  const evidence = read('src/app/score/api/assessments/[assessmentRef]/comprehensive-evidence/route.ts');
  assert.doesNotMatch(evidence, /getRc1OperationFreezeResponse|MK_RC1_OPERATION_FREEZE_MODE|RC1_OPERATION_FROZEN/);
  assert.match(evidence, /validateSnapshotToken/);
  assert.match(evidence, /EVIDENCE_MAX_BYTES/);
  assert.match(evidence, /submitComprehensiveEvidence/);
});

check('payment state changes stay a finance concern and delivery stays an approver concern', () => {
  const service = read('src/lib/comprehensive/engagement-service.ts');
  assert.match(service, /payment_received: \['platform_admin', 'finance_admin'\]/);
  assert.match(service, /delivered: \['platform_admin', 'approver'\]/);
  assert.match(service, /awaiting_payment: \[\]/);
  assert.match(service, /REVIEWER_ELIGIBLE_ROLES: readonly AdminRole\[\] = \['platform_admin', 'reviewer', 'approver'\]/);
  assert.match(service, /reviewer_not_eligible/);
});

check('Comprehensive uses the same Vercel AI Gateway runtime credential boundary as Essential', () => {
  const comprehensive = read('src/lib/reports/comprehensive/interpretation.ts');
  const essential = read('src/lib/reports/narrative/whole-manuscript-writer.ts');
  for (const source of [comprehensive, essential]) {
    assert.match(source, /process\.env\.VERCEL_OIDC_TOKEN/);
    assert.match(source, /process\.env\.VERCEL === '1'/);
    assert.match(source, /Boolean\(process\.env\.VERCEL_ENV\)/);
  }
  assert.match(comprehensive, /!hasGatewayCredential && !runningOnVercel/);
});

console.log(`\njoint-launch comprehensive: ${checks} checks passed.`);
