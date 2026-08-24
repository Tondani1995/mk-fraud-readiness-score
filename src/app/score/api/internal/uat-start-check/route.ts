import { NextResponse } from 'next/server';
import { startAccountlessAssessment } from '@/lib/respondent/start-assessment';
import { validateResumeToken } from '@/lib/respondent/tokens';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { getOptionalServerEnv } from '@/lib/env/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const service = createSupabaseServiceClient();
  const appBaseUrl = getOptionalServerEnv('NEXT_PUBLIC_APP_URL', new URL(request.url).origin);
  const stamp = Date.now();

  const [domains, questions, exposureFactors, adminProfiles] = await Promise.all([
    service.from('domains').select('id', { count: 'exact', head: true }),
    service.from('questions').select('id', { count: 'exact', head: true }),
    service.from('exposure_factors').select('id', { count: 'exact', head: true }),
    service.from('admin_profiles').select('id', { count: 'exact', head: true })
  ]);

  const started = await startAccountlessAssessment(
    {
      fullName: 'MK UAT Tester',
      email: `uat+${stamp}@mkfraud.co.za`,
      roleTitle: 'UAT Reviewer',
      phone: '0000000000',
      organisationName: `MK UAT Organisation ${stamp}`,
      tradingName: 'MK UAT',
      industry: 'Professional Services',
      sector: 'Fraud Risk Consulting',
      province: 'Gauteng',
      employeeBand: '11-50',
      annualRevenueBand: 'R10m-R50m',
      consentPrivacy: true,
      consentResearch: false
    },
    appBaseUrl
  );

  const token = new URL(started.resumeUrl).searchParams.get('token') ?? '';
  const resumeCheck = await validateResumeToken({
    assessmentReference: started.assessmentReference,
    rawToken: token,
    consume: false
  });

  const [organisation, respondent, assessment, tokenRows, emailEvents, auditLogs] = await Promise.all([
    service.from('organisations').select('id,legal_name,industry,province').eq('id', started.organisationId).maybeSingle(),
    service.from('respondents').select('id,email,full_name,consent_privacy').eq('id', started.respondentId).maybeSingle(),
    service.from('assessments').select('id,assessment_reference,status,methodology_version_id').eq('id', started.assessmentId).maybeSingle(),
    service.from('assessment_tokens').select('id,token_type,expires_at,revoked_at,max_uses').eq('assessment_id', started.assessmentId),
    service.from('email_events').select('id,template_key,status').eq('assessment_id', started.assessmentId),
    service.from('audit_logs').select('id,action').eq('assessment_id', started.assessmentId)
  ]);

  return NextResponse.json({
    ok: true,
    checkedAt: new Date().toISOString(),
    databaseCounts: {
      domains: domains.count,
      questions: questions.count,
      exposureFactors: exposureFactors.count,
      adminProfiles: adminProfiles.count
    },
    startFlow: {
      assessmentReference: started.assessmentReference,
      assessmentId: started.assessmentId,
      organisationId: started.organisationId,
      respondentId: started.respondentId,
      respondentEmail: started.respondentEmail,
      resumeUrlCreated: Boolean(started.resumeUrl),
      resumeTokenExpiresAt: started.resumeTokenExpiresAt
    },
    databaseWrites: {
      organisation: organisation.data,
      respondent: respondent.data,
      assessment: assessment.data,
      tokenRows: tokenRows.data,
      emailEvents: emailEvents.data,
      auditLogs: auditLogs.data
    },
    resumeTokenValidation: resumeCheck.ok
      ? {
          ok: true,
          assessmentReference: resumeCheck.assessment.assessment_reference,
          organisationName: resumeCheck.organisation?.legal_name,
          respondentEmail: resumeCheck.respondent?.email
        }
      : { ok: false, reason: resumeCheck.reason }
  });
}
