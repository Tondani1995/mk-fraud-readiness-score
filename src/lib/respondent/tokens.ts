import { addHours } from '@/lib/utils/date';
import { getNumberEnv } from '@/lib/env/server';
import { createUrlSafeToken, hashAssessmentToken, hashIpAddress } from '@/lib/security/hash';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

export type ResumeTokenRecord = {
  rawToken: string;
  tokenHash: string;
  expiresAt: string;
};

export function createResumeTokenPayload(now = new Date()): ResumeTokenRecord {
  const ttlHours = getNumberEnv('ASSESSMENT_RESUME_TOKEN_TTL_HOURS', 168);
  const rawToken = createUrlSafeToken(32);
  const tokenHash = hashAssessmentToken(rawToken);
  const expiresAt = addHours(now, ttlHours).toISOString();
  return { rawToken, tokenHash, expiresAt };
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
  if (tokenRow.use_count >= tokenRow.max_uses) return { ok: false as const, reason: 'token_use_limit_reached' };

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
    await service
      .from('assessment_tokens')
      .update({
        use_count: tokenRow.use_count + 1,
        last_used_at: new Date().toISOString(),
        last_used_ip_hash: hashIpAddress(input.ipAddress)
      })
      .eq('id', tokenRow.id);

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
