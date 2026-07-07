import { headers } from 'next/headers';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionShell } from '@/components/ui/SectionShell';
import { AssessmentEngine } from '@/components/assessment/AssessmentEngine';
import { validateResumeToken } from '@/lib/respondent/tokens';
import { calculateAssessmentProgress, loadAssessmentAnswers, loadAssessmentMethodology } from '@/lib/respondent/assessment-methodology';
import { checkRateLimits, getClientIpHashKey, RATE_LIMITS } from '@/lib/security/rate-limit';

export default async function AssessmentShellPage({ params, searchParams }: { params: { assessmentRef: string }; searchParams?: { token?: string } }) {
  const accessCode = searchParams?.token;
  let validation: Awaited<ReturnType<typeof validateResumeToken>> | { ok: false; reason: 'missing_token' | 'rate_limited' };

  if (!accessCode) {
    validation = { ok: false, reason: 'missing_token' };
  } else {
    const rateLimit = await checkRateLimits([
      { key: getClientIpHashKey(headers(), 'assessment_resume_page'), ...RATE_LIMITS.assessmentResumePerIp() },
      { key: `assessment_resume_page:ref:${params.assessmentRef}`, ...RATE_LIMITS.assessmentResumePerReference() }
    ]);

    const input: any = { assessmentReference: params.assessmentRef, consume: false };
    input.rawToken = accessCode;
    validation = !rateLimit.allowed ? { ok: false, reason: 'rate_limited' } : await validateResumeToken(input);
  }

  if (!validation.ok) {
    return (
      <SectionShell className="py-12">
        <PageHeader
          eyebrow="Assessment access"
          title="Assessment link required"
          description="This assessment can only be opened from the private resume link created when the assessment was started. Submitted assessments cannot be edited."
        />
        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <CardTitle>Assessment reference</CardTitle>
              <Badge>{params.assessmentRef}</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="rounded-xl border border-mk-danger/30 bg-mk-danger/10 p-4 text-sm leading-6 text-mk-danger">
              <p className="font-semibold">Assessment cannot be opened.</p>
              <p className="mt-2">Reason: {validation.reason}. Use the private resume link created when the assessment was started.</p>
            </div>
          </CardContent>
        </Card>
      </SectionShell>
    );
  }

  const methodology = await loadAssessmentMethodology(validation.assessment.methodology_version_id);
  const saved = await loadAssessmentAnswers(validation.assessment.id);
  const progress = calculateAssessmentProgress({
    domains: methodology.domains,
    exposureFactors: methodology.exposureFactors,
    answers: saved.answers,
    exposureAnswers: saved.exposureAnswers
  });

  return (
    <SectionShell className="py-12">
      <PageHeader
        eyebrow="Fraud readiness assessment"
        title="Complete the assessment"
        description="Complete the exposure profile and the ten fraud-readiness domains. Answers are autosaved, N/A is controlled, and submission generates the free readiness snapshot."
      />

      <AssessmentEngine
        assessmentReference={validation.assessment.assessment_reference}
        token={accessCode ?? ''}
        organisationName={validation.organisation?.legal_name ?? 'Organisation'}
        respondentName={validation.respondent?.full_name ?? validation.respondent?.email ?? 'Respondent'}
        status={validation.assessment.status}
        domains={methodology.domains}
        responseScale={methodology.responseScale}
        exposureFactors={methodology.exposureFactors}
        savedAnswers={saved.answers}
        savedExposureAnswers={saved.exposureAnswers}
        initialProgress={progress}
      />
    </SectionShell>
  );
}
