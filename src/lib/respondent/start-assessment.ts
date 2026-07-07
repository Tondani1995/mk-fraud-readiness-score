import { createAssessmentReference } from '@/lib/respondent/reference';
import { createResumeTokenPayload } from '@/lib/respondent/tokens';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import type { StartAssessmentInput } from '@/lib/respondent/validation';

export async function startAccountlessAssessment(input: StartAssessmentInput, appBaseUrl: string) {
  const service = createSupabaseServiceClient();
  const created: { organisationId?: string; respondentId?: string; assessmentId?: string; tokenId?: string } = {};

  try {
    const { data: methodology, error: methodologyError } = await service
      .from('methodology_versions')
      .select('id,version_code,status')
      .eq('status', 'active')
      .maybeSingle();

    if (methodologyError) throw methodologyError;
    if (!methodology) {
      throw new Error('No active methodology version found. Run the Phase 4 dev seed or activate the approved methodology before starting assessments.');
    }

    const { data: organisation, error: organisationError } = await service
      .from('organisations')
      .insert({
        legal_name: input.organisationName,
        trading_name: input.tradingName ?? null,
        industry: input.industry ?? null,
        sector: input.sector ?? null,
        country: 'South Africa',
        province: input.province ?? null,
        employee_band: input.employeeBand ?? null,
        annual_revenue_band: input.annualRevenueBand ?? null
      })
      .select('id,legal_name')
      .single();

    if (organisationError) throw organisationError;
    created.organisationId = organisation.id;

    const { data: respondent, error: respondentError } = await service
      .from('respondents')
      .insert({
        organisation_id: organisation.id,
        full_name: input.fullName,
        email: input.email,
        role_title: input.roleTitle ?? null,
        phone: input.phone ?? null,
        consent_privacy: input.consentPrivacy,
        consent_research: input.consentResearch
      })
      .select('id,email,full_name')
      .single();

    if (respondentError) throw respondentError;
    created.respondentId = respondent.id;

    let assessmentReference = createAssessmentReference();
    let assessment;
    let assessmentError;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const result = await service
        .from('assessments')
        .insert({
          assessment_reference: assessmentReference,
          organisation_id: organisation.id,
          primary_respondent_id: respondent.id,
          methodology_version_id: methodology.id,
          status: 'draft'
        })
        .select('id,assessment_reference,status')
        .single();

      assessment = result.data;
      assessmentError = result.error;
      if (!assessmentError) break;
      assessmentReference = createAssessmentReference();
    }

    if (assessmentError || !assessment) throw assessmentError ?? new Error('Assessment could not be created.');
    created.assessmentId = assessment.id;

    const token = createResumeTokenPayload();
    const { data: tokenRow, error: tokenError } = await service
      .from('assessment_tokens')
      .insert({
        assessment_id: assessment.id,
        token_hash: token.tokenHash,
        token_type: 'resume',
        expires_at: token.expiresAt,
        max_uses: 25
      })
      .select('id')
      .single();

    if (tokenError) throw tokenError;
    created.tokenId = tokenRow.id;

    const resumeUrl = new URL(`/assessment/${assessment.assessment_reference}`, appBaseUrl);
    resumeUrl.searchParams.set('token', token.rawToken);

    await Promise.all([
      service.from('audit_logs').insert({
        actor_type: 'system',
        assessment_id: assessment.id,
        entity_table: 'assessments',
        entity_id: assessment.id,
        action: 'accountless_assessment_started',
        after_json: {
          assessment_reference: assessment.assessment_reference,
          organisation_name: organisation.legal_name,
          respondent_email: respondent.email
        }
      }),
      service.from('email_events').insert({
        assessment_id: assessment.id,
        recipient_email: respondent.email,
        template_key: 'resume_link_phase4_placeholder',
        status: 'queued',
        error_message: 'Phase 4 does not send email yet. Resume link is returned by the start endpoint for local testing.'
      })
    ]);

    return {
      assessmentId: assessment.id,
      assessmentReference: assessment.assessment_reference,
      organisationId: organisation.id,
      respondentId: respondent.id,
      respondentEmail: respondent.email,
      resumeUrl: resumeUrl.toString(),
      resumeTokenExpiresAt: token.expiresAt
    };
  } catch (error) {
    if (created.assessmentId) await service.from('assessments').delete().eq('id', created.assessmentId);
    if (created.respondentId) await service.from('respondents').delete().eq('id', created.respondentId);
    if (created.organisationId) await service.from('organisations').delete().eq('id', created.organisationId);
    throw error;
  }
}
