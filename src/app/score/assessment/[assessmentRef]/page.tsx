import { headers } from 'next/headers';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionShell } from '@/components/ui/SectionShell';
import { AssessmentEngine } from '@/components/assessment/AssessmentEngine';
import { validateResumeToken } from '@/lib/respondent/tokens';
import { calculateAssessmentProgress, loadAssessmentAnswers, loadAssessmentMethodology } from '@/lib/respondent/assessment-methodology';
import { checkRateLimits, getClientIpHashKey, RATE_LIMITS } from '@/lib/security/rate-limit';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { getAssessmentResumeCapability } from '@/lib/assessment-experience/resume-capability';

function publicAssessmentProgress(progress: ReturnType<typeof calculateAssessmentProgress>) {
  return {
    totalQuestions: progress.totalQuestions,
    answeredQuestions: progress.answeredQuestions,
    totalExposureFactors: progress.totalExposureFactors,
    answeredExposureFactors: progress.answeredExposureFactors,
    overallPct: progress.overallPct
  };
}

function publicDomains(methodology: Awaited<ReturnType<typeof loadAssessmentMethodology>>) {
  return methodology.domains.map((domain) => ({
    id: domain.id,
    name: domain.name,
    questions: domain.questions.map((question) => ({
      id: question.id,
      prompt: question.prompt,
      helpText: question.helpText,
      nAAllowed: question.nAAllowed,
      nARuleKey: question.nARuleKey,
      isHardGate: question.isHardGate
    }))
  }));
}

function publicExposureFactors(methodology: Awaited<ReturnType<typeof loadAssessmentMethodology>>) {
  return methodology.exposureFactors.map((factor) => ({
    id: factor.id,
    name: factor.name,
    options: factor.options,
    sortOrder: factor.sortOrder
  }));
}

function publicSavedAnswers(saved: Awaited<ReturnType<typeof loadAssessmentAnswers>>) {
  return saved.answers.map((answer) => ({
    questionId: answer.questionId,
    responseValue: answer.responseValue,
    isNotApplicable: answer.isNotApplicable,
    nAReason: answer.nAReason
  }));
}

function publicSavedExposureAnswers(saved: Awaited<ReturnType<typeof loadAssessmentAnswers>>) {
  return saved.exposureAnswers.map((answer) => ({
    exposureFactorId: answer.exposureFactorId,
    selectedValue: answer.selectedValue,
    selectedLabel: answer.selectedLabel,
    pointsAwarded: answer.pointsAwarded
  }));
}

export default async function AssessmentShellPage({ params, searchParams }: { params: { assessmentRef: string }; searchParams?: { token?: string } }) {
  const accessCode = searchParams?.token;
  let validation: Awaited<ReturnType<typeof validateResumeToken>> | { ok: false; reason: 'missing_token' | 'rate_limited' };

  if (!accessCode) {
    validation = { ok: false, reason: 'missing_token' };
  } else {
    const requestHeaders = await headers();
    const rateLimit = await checkRateLimits([
      { key: getClientIpHashKey(requestHeaders, 'assessment_resume_page'), ...RATE_LIMITS.assessmentResumePerIp() },
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
  const resumeCapability = await getAssessmentResumeCapability();
  let resumeCursor: { activeDomainKey: string | null; activeQuestionId: string | null; savedAt: string | null } | null = null;
  if (resumeCapability.status === 'available') {
    const db = createSupabaseServiceClient() as any;
    const { data: cursor } = await db.from('assessments')
      .select('active_domain_key,active_question_id,last_answer_saved_at')
      .eq('id', validation.assessment.id).maybeSingle();
    if (cursor) resumeCursor = {
      activeDomainKey: cursor.active_domain_key,
      activeQuestionId: cursor.active_question_id,
      savedAt: cursor.last_answer_saved_at
    };
    const { error: resumeEventError } = await db.rpc('save_assessment_resume_state', {
      p_assessment_reference: validation.assessment.assessment_reference,
      p_active_domain_key: resumeCursor?.activeDomainKey ?? null,
      p_active_question_id: resumeCursor?.activeQuestionId ?? null,
      p_completion_percentage: progress.overallPct,
      p_event_type: 'assessment_resumed'
    });
    if (resumeEventError) {
      console.error('assessment_resume_event', { assessmentReference: validation.assessment.assessment_reference, outcome: 'error', code: resumeEventError.code ?? null });
    }
  }
  console.info('assessment_resumed', { assessmentReference: validation.assessment.assessment_reference, resumeMode: resumeCapability.status, progressPct: progress.overallPct });

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
        domains={publicDomains(methodology)}
        responseScale={methodology.responseScale}
        exposureFactors={publicExposureFactors(methodology)}
        savedAnswers={publicSavedAnswers(saved)}
        savedExposureAnswers={publicSavedExposureAnswers(saved)}
        initialProgress={publicAssessmentProgress(progress)}
        initialActiveStep={resumeCursor?.activeDomainKey ?? null}
        initialActiveQuestionId={resumeCursor?.activeQuestionId ?? null}
        initialSavedAt={resumeCursor?.savedAt ?? null}
      />
    </SectionShell>
  );
}
