import { NextResponse } from 'next/server';
import { createSnapshotTokenForAssessment } from '@/lib/respondent/tokens';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import {
  isUatPreviewBinding,
  matchesUatNonce,
  UAT_ASSESSMENT_REFERENCE,
  UAT_BOUND_RELEASE_SHA,
  UAT_BRANCH,
  UAT_NONCE_SHA256,
  UAT_SUPABASE_PROJECT,
  UAT_SNAPSHOT_ORIGIN
} from '@/lib/uat/snapshot-link-reissue-guard';

/**
 * TEMPORARY — MUST NOT BE PROMOTED.
 *
 * This is a one-shot owner-UAT helper for one already-scored Preview assessment. It is deliberately
 * narrower than an admin feature: Preview, the CX branch, the isolated Supabase project and the
 * exact assessment are all fixed. Production is rejected before any database access.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The deterministic primary key makes the audit-log insert an atomic one-shot claim without a
// schema change. A later request cannot reach createSnapshotTokenForAssessment after this claim.
const UAT_CLAIM_AUDIT_ID = '821d8866-05cd-401a-bfbe-fe6183dbc63a';

const SNAPSHOT_AVAILABLE_STATUSES = new Set([
  'scored',
  'snapshot_available',
  'report_requested',
  'under_review',
  'closed'
]);

function safeResponse(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store' }
  });
}

export async function POST(
  request: Request,
  props: { params: Promise<{ assessmentRef: string }> }
) {
  if (!isUatPreviewBinding({
    vercelEnv: process.env.VERCEL_ENV,
    gitBranch: process.env.VERCEL_GIT_COMMIT_REF,
    publicSupabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    serverSupabaseUrl: process.env.SUPABASE_URL
  })) {
    return safeResponse({ ok: false, reason: 'not_found' }, 404);
  }

  const { assessmentRef } = await props.params;
  if (assessmentRef !== UAT_ASSESSMENT_REFERENCE) {
    return safeResponse({ ok: false, reason: 'not_found' }, 404);
  }

  const body = await request.json().catch(() => null) as { assessmentReference?: unknown; nonce?: unknown } | null;
  if (body?.assessmentReference !== UAT_ASSESSMENT_REFERENCE || typeof body.nonce !== 'string' || !matchesUatNonce(body.nonce)) {
    return safeResponse({ ok: false, reason: 'invalid_nonce' }, 403);
  }

  const db = createSupabaseServiceClient() as any;
  const { data: policy, error: policyError } = await db
    .from('adaptive_activation_policies')
    .select('environment,supabase_project,enabled,activation_sha')
    .eq('policy_key', 'customer_start')
    .maybeSingle();
  if (policyError || !policy
    || policy.environment !== 'preview'
    || policy.supabase_project !== UAT_SUPABASE_PROJECT
    || policy.enabled !== true
    || policy.activation_sha !== UAT_BOUND_RELEASE_SHA) {
    return safeResponse({ ok: false, reason: 'uat_binding_unavailable' }, 409);
  }

  const { data: assessment, error: assessmentError } = await db
    .from('assessments')
    .select('id,assessment_reference,status,current_score_run_id')
    .eq('assessment_reference', UAT_ASSESSMENT_REFERENCE)
    .maybeSingle();
  if (assessmentError || !assessment) {
    return safeResponse({ ok: false, reason: 'assessment_not_found' }, 404);
  }
  if (!SNAPSHOT_AVAILABLE_STATUSES.has(assessment.status)) {
    return safeResponse({ ok: false, reason: 'snapshot_not_available' }, 409);
  }
  if (!assessment.current_score_run_id) {
    return safeResponse({ ok: false, reason: 'score_not_available' }, 409);
  }

  const { error: claimError } = await db.from('audit_logs').insert({
    id: UAT_CLAIM_AUDIT_ID,
    actor_type: 'system',
    assessment_id: assessment.id,
    entity_table: 'snapshot_uat_reissue',
    entity_id: assessment.id,
    action: 'snapshot_uat_reissue_consumed',
    after_json: {
      temporary: true,
      state: 'claimed_before_issuer',
      assessment_reference: UAT_ASSESSMENT_REFERENCE,
      environment: 'preview',
      supabase_project: UAT_SUPABASE_PROJECT,
      bound_release_sha: UAT_BOUND_RELEASE_SHA,
      nonce_sha256: UAT_NONCE_SHA256
    }
  });
  if (claimError) {
    if (claimError.code === '23505') return safeResponse({ ok: false, reason: 'already_consumed' }, 409);
    return safeResponse({ ok: false, reason: 'uat_claim_unavailable' }, 500);
  }

  let token: Awaited<ReturnType<typeof createSnapshotTokenForAssessment>>;
  try {
    token = await createSnapshotTokenForAssessment({
      assessmentId: assessment.id,
      assessmentReference: UAT_ASSESSMENT_REFERENCE,
      revokeExisting: true
    });
  } catch {
    // The claim intentionally remains. This helper is one-shot and fail-closed; no retry can
    // invoke the issuer twice if the issuer or its audit trail fails after the claim.
    return safeResponse({ ok: false, reason: 'uat_issuer_failed' }, 500);
  }

  const snapshotUrl = new URL(`/score/snapshot/${encodeURIComponent(UAT_ASSESSMENT_REFERENCE)}`, UAT_SNAPSHOT_ORIGIN);
  snapshotUrl.searchParams.set('token', token.rawToken);

  return safeResponse({
    ok: true,
    assessmentReference: UAT_ASSESSMENT_REFERENCE,
    snapshotUrl: snapshotUrl.toString(),
    expiresAt: token.expiresAt
  }, 200);
}
