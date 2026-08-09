import { addHours } from '@/lib/utils/date';
import { getNumberEnv } from '@/lib/env/server';
import { createUrlSafeToken, hashAssessmentToken, hashIpAddress } from '@/lib/security/hash';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

export type AssessmentTokenRecord = {
  rawToken: string;
  tokenHash: string;
  expiresAt: string;
};

export type ResumeTokenRecord = AssessmentTokenRecord;
export type SnapshotTokenRecord = AssessmentTokenRecord;

function createAssessmentTokenPayload(ttlEnvName: string, fallbackHours: number, now = new Date()): AssessmentTokenRecord {
  const ttlHours = getNumberEnv(ttlEnvName, fallbackHours);
  const rawToken = createUrlSafeToken(32);
  const tokenHash = hashAssessmentToken(rawToken);
  const expiresAt = addHours(now, ttlHours).toISOString();
  return { rawToken, tokenHash, expiresAt };
}

export function createResumeTokenPayload(now = new Date()): ResumeTokenRecord {
  return createAssessmentTokenPayload('ASSESSMENT_RESUME_TOKEN_TTL_HOURS', 168, now);
}

export function createSnapshotTokenPayload(now = new Date()): SnapshotTokenRecord {
  return createAssessmentTokenPayload('ASSESSMENT_SNAPSHOT_TOKEN_TTL_HOURS', 168, now);
}

export async function createSnapshotTokenForAssessment(input: {
  assessmentId: string;
  assessmentReference: string;
  revokeExisting?: boolean;
  ipAddress?: string | null;
}) {
  const service = createSupabaseServiceClient();
  const token = createSnapshotTokenPayload();
  const now = new Date().toISOString();

  if (input.revokeExisting !== false) {
    const { error: revokeError } = await service
      .from('assessment_tokens')
      .update({ revoked_at: now })
      .eq('assessment_id', input.assessmentId)
      .eq('token_type', 'snapshot')
      .is('revoked_at', null);

    if (revokeError) throw revokeError;
  }

  const { error: insertError } = await service.from('assessment_tokens').insert({
    assessment_id: input.assessmentId,
    token_hash: token.tokenHash,
    token_type: 'snapshot',
    expires_at: token.expiresAt,
    max_uses: getNumberEnv('ASSESSMENT_SNAPSHOT_TOKEN_MAX_USES', 100),
    use_count: 0,
    last_used_ip_hash: hashIpAddress(input.ipAddress)
  });

  if (insertError) throw insertError;

  await service.from('audit_logs').insert({
    actor_type: 'system',
    assessment_id: input.assessmentId,
    entity_table: 'assessment_tokens',
    entity_id: input.assessmentId,
    action: 'snapshot_token_created',
    after_json: {
      assessment_reference: input.assessmentReference,
      expires_at: token.expiresAt,
      prior_snapshot_tokens_revoked: input.revokeExisting !== false
    }
  });

  return token;
}

/**
 * Authoritative atomic consumption of an assessment token.
 *
 * The limit decision lives entirely in the database: check + increment happen in one statement, so
 * two concurrent callers cannot both spend the same remaining use. Nothing here re-derives the
 * allowance in JS, and there is no fallback to the old read-then-write UPDATE -- an unavailable or
 * failing RPC must deny access, never grant it.
 */
async function consumeAssessmentTokenAtomically(
  service: any,
  tokenHash: string,
  tokenType: 'resume' | 'snapshot',
  ipAddress?: string | null
): Promise<{ ok: true; tokenId: string } | { ok: false; reason: string }> {
  const { data, error } = await service.rpc('consume_assessment_token', {
    p_token_hash: tokenHash,
    p_token_type: tokenType,
    p_ip_hash: hashIpAddress(ipAddress)
  });
  // Fail closed: a transport or database failure is never an authorisation.
  if (error || !data) return { ok: false, reason: 'token_consumption_unavailable' };
  if (data.ok !== true) return { ok: false, reason: String(data.reason ?? 'invalid_token') };
  return { ok: true, tokenId: String(data.token_id) };
}

export async function validateResumeToken(input: {
  assessmentReference: string;
  rawToken: string;
  ipAddress?: string | null;
  consume?: boolean;
}) {
  const service = createSupabaseServiceClient();
  const tokenHash = hashAssessmentToken(input.rawToken);

  const { data: tokenRow, error: tokenError } = await service
    .from('assessment_tokens')
    .select('id,assessment_id,token_type,expires_at,max_uses,use_count,revoked_at')
    .eq('token_hash', tokenHash)
    .eq('token_type', 'resume')
    .maybeSingle();

  if (tokenError || !tokenRow) {
    return { ok: false as const, reason: 'invalid_token' };
  }

  if (tokenRow.revoked_at) return { ok: false as const, reason: 'revoked_token' };
  if (new Date(tokenRow.expires_at).getTime() <= Date.now()) return { ok: false as const, reason: 'expired_token' };
  // Non-consuming validation only. For a consuming request the remaining allowance is decided
  // atomically in the database below -- a JS comparison here could independently grant access.
  if (input.consume === false && tokenRow.use_count >= tokenRow.max_uses) return { ok: false as const, reason: 'token_use_limit_reached' };

  const { data: assessment, error: assessmentError } = await service
    .from('assessments')
    .select('id,assessment_reference,organisation_id,primary_respondent_id,methodology_version_id,status,started_at,submitted_at,locked_at')
    .eq('id', tokenRow.assessment_id)
    .eq('assessment_reference', input.assessmentReference)
    .maybeSingle();

  if (assessmentError || !assessment) return { ok: false as const, reason: 'assessment_not_found' };
  if (assessment.status !== 'draft') return { ok: false as const, reason: 'assessment_locked' };
  if (assessment.locked_at || assessment.submitted_at) return { ok: false as const, reason: 'assessment_locked' };

  const [{ data: organisation }, { data: respondent }] = await Promise.all([
    service.from('organisations').select('id,legal_name,trading_name,industry,sector,country,province,employee_band,annual_revenue_band').eq('id', assessment.organisation_id).maybeSingle(),
    assessment.primary_respondent_id
      ? service.from('respondents').select('id,full_name,email,role_title,phone').eq('id', assessment.primary_respondent_id).maybeSingle()
      : Promise.resolve({ data: null })
  ]);

  if (input.consume !== false) {
    // Authoritative: the database decides whether an allowance remains and consumes it in the same
    // statement. Protected data below is returned only if this succeeded.
    const consumed = await consumeAssessmentTokenAtomically(
      service, tokenHash, 'resume', input.ipAddress);
    if (!consumed.ok) return { ok: false as const, reason: consumed.reason };

    await service.from('audit_logs').insert({
      actor_type: 'respondent_token',
      assessment_id: assessment.id,
      entity_table: 'assessment_tokens',
      entity_id: tokenRow.id,
      action: 'resume_token_validated',
      after_json: { assessment_reference: input.assessmentReference }
    });
  }

  return { ok: true as const, assessment, organisation, respondent };
}

export async function validateSnapshotToken(input: {
  assessmentReference: string;
  rawToken: string;
  ipAddress?: string | null;
  consume?: boolean;
}) {
  const service = createSupabaseServiceClient();
  const tokenHash = hashAssessmentToken(input.rawToken);

  const { data: tokenRow, error: tokenError } = await service
    .from('assessment_tokens')
    .select('id,assessment_id,token_type,expires_at,max_uses,use_count,revoked_at')
    .eq('token_hash', tokenHash)
    .eq('token_type', 'snapshot')
    .maybeSingle();

  if (tokenError || !tokenRow) return { ok: false as const, reason: 'invalid_token' };
  if (tokenRow.revoked_at) return { ok: false as const, reason: 'revoked_token' };
  if (new Date(tokenRow.expires_at).getTime() <= Date.now()) return { ok: false as const, reason: 'expired_token' };
  // Non-consuming validation only. For a consuming request the remaining allowance is decided
  // atomically in the database below -- a JS comparison here could independently grant access.
  if (input.consume === false && tokenRow.use_count >= tokenRow.max_uses) return { ok: false as const, reason: 'token_use_limit_reached' };

  const { data: assessment, error: assessmentError } = await service
    .from('assessments')
    .select('id,assessment_reference,organisation_id,primary_respondent_id,methodology_version_id,status,current_score_run_id,started_at,submitted_at,locked_at')
    .eq('id', tokenRow.assessment_id)
    .eq('assessment_reference', input.assessmentReference)
    .maybeSingle();

  if (assessmentError || !assessment) return { ok: false as const, reason: 'assessment_not_found' };
  if (!['scored', 'snapshot_available', 'report_requested', 'under_review', 'closed'].includes(assessment.status)) {
    return { ok: false as const, reason: 'snapshot_not_available' };
  }
  if (!assessment.current_score_run_id) return { ok: false as const, reason: 'score_not_available' };

  const [{ data: organisation }, { data: respondent }] = await Promise.all([
    service.from('organisations').select('id,legal_name,trading_name,industry,sector,country,province,employee_band,annual_revenue_band').eq('id', assessment.organisation_id).maybeSingle(),
    assessment.primary_respondent_id
      ? service.from('respondents').select('id,full_name,email,role_title,phone').eq('id', assessment.primary_respondent_id).maybeSingle()
      : Promise.resolve({ data: null })
  ]);

  if (input.consume !== false) {
    // Authoritative: the database decides whether an allowance remains and consumes it in the same
    // statement. Protected data below is returned only if this succeeded.
    const consumed = await consumeAssessmentTokenAtomically(
      service, tokenHash, 'snapshot', input.ipAddress);
    if (!consumed.ok) return { ok: false as const, reason: consumed.reason };

    await service.from('audit_logs').insert({
      actor_type: 'respondent_token',
      assessment_id: assessment.id,
      entity_table: 'assessment_tokens',
      entity_id: tokenRow.id,
      action: 'snapshot_token_validated',
      after_json: { assessment_reference: input.assessmentReference }
    });
  }

  return { ok: true as const, assessment, organisation, respondent };
}
