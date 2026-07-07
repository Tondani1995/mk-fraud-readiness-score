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
  const token = searchParams?.token;
  let validation: Awaited<ReturnType<typeof validateResumeToken>> | { ok: false; reason: 'missing_token' | 'rate_limited' };

  if (!token) {
    validation = { ok: false, reason: 'missing_token' };
  } else {
    const rateLimit = await checkRateLimits([
      { key: getClientIpHashKey(headers(), 'assessment_resume_page'), ...RATE_LIMITS.assessmentResumePerIp() },
      { key: `assessment_resume_page:ref:${params.assessmentRef}`, ...RATE_LIMITS.assessmentResumePerReference() }
    ]);

    validation = !rateLimit.allowed
      ? { ok: false, reason: 'rate_limited' }
      : await validateResumeToken({ assessmentReference: params.assessmentRef, rawToken: token, consume: false });
  }

  if (!validation.ok) {
    return (
      <SectionShell className="py-12">
        <PageHeader
          eyebrow="Accountless draft access"
          title="Draft assessment"
          description="The resume link opens only the matching draft assessment. Submitted or locked assessments cannot be edited through a resume token."
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
              <p className="font-semibold">Draft assessment cannot be opened.</p>
              <p className="mt-2">Reason: {validation.reason}. Use the secure resume link created when the assessment was started.</p>
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
        eyebrow="Phase 5 assessment engine"
        title="Fraud readiness assessment"
        description="Complete the exposure profile and the ten fraud-readiness domains. Answers are autosaved, N/A is controlled, and submission locks the assessment for Phase 6 scoring."
      />

      <AssessmentEngine
        assessmentReference={validation.assessment.assessment_reference}
        token={token ?? ''}
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
