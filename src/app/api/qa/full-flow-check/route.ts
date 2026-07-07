import { NextResponse } from 'next/server';
import { startAccountlessAssessment } from '@/lib/respondent/start-assessment';
import { loadAssessmentMethodology } from '@/lib/respondent/assessment-methodology';
import { saveAssessmentDraft, submitAssessment } from '@/lib/respondent/assessment-save';
import { scoreSubmittedAssessment } from '@/lib/scoring/score-assessment';
import { loadFreeSnapshotByReference } from '@/lib/snapshot/free-snapshot';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get('run') !== 'mk-uat-full') return NextResponse.json({ ok: false }, { status: 404 });

  const service = createSupabaseServiceClient();
  const stamp = Date.now();
  const results: Record<string, unknown> = {};
  const failed: string[] = [];
  const check = (name: string, passed: boolean, detail?: unknown) => {
    results[name] = { passed, detail };
    if (!passed) failed.push(name);
  };

  const started = await startAccountlessAssessment({
    fullName: 'MK Full Flow UAT',
    email: `uat-${stamp}@mkfraud.co.za`,
    roleTitle: 'UAT Reviewer',
    phone: '0000000000',
    organisationName: `MK Full Flow UAT ${stamp}`,
    tradingName: 'MK UAT',
    industry: 'Professional Services',
    sector: 'Fraud Risk Consulting',
    province: 'Gauteng',
    employeeBand: '11-50',
    annualRevenueBand: 'R10m-R50m',
    consentPrivacy: true,
    consentResearch: false
  }, url.origin);

  const token = new URL(started.resumeUrl).searchParams.get('token') ?? '';
  check('start_creates_reference', started.assessmentReference.startsWith('MKFRS-'), started.assessmentReference);
  check('start_creates_resume_token', token.length > 20);

  const { data: assessmentBefore } = await service.from('assessments').select('id,status,methodology_version_id').eq('id', started.assessmentId).single();
  if (!assessmentBefore) return NextResponse.json({ ok: false, failed: ['assessment_row_missing'], results }, { status: 500 });
  check('initial_status_draft', assessmentBefore.status === 'draft', assessmentBefore.status);

  const methodology = await loadAssessmentMethodology(assessmentBefore.methodology_version_id);
  const questions = methodology.domains.flatMap((domain) => domain.questions);
  check('domain_count_10', methodology.domains.length === 10, methodology.domains.length);
  check('question_count_68', questions.length === 68, questions.length);
  check('exposure_count_8', methodology.exposureFactors.length === 8, methodology.exposureFactors.length);

  const answers = questions.map((question) => ({ questionId: question.id, responseValue: 3, isNotApplicable: false, nAReason: null }));
  const exposureAnswers = methodology.exposureFactors.map((factor) => {
    const option = factor.options[0];
    return { exposureFactorId: factor.id, selectedValue: option.value, selectedLabel: option.label, pointsAwarded: option.points };
  });

  const saved = await saveAssessmentDraft({ assessmentReference: started.assessmentReference, token, answers, exposureAnswers });
  if (!saved.ok) return NextResponse.json({ ok: false, failed: ['save_failed'], saveErrors: saved.errors, results }, { status: saved.status });
  check('saved_68_answers', saved.progress.answeredQuestions === 68, saved.progress);
  check('saved_8_exposures', saved.progress.answeredExposureFactors === 8, saved.progress);
  check('progress_100', saved.progress.overallPct === 100, saved.progress.overallPct);

  const submitted = await submitAssessment({ assessmentReference: started.assessmentReference, token });
  if (!submitted.ok) return NextResponse.json({ ok: false, failed: ['submit_failed'], submitErrors: submitted.errors, results }, { status: submitted.status });
  check('submitted_status_returned', submitted.status === 'submitted', submitted.status);

  const scored = await scoreSubmittedAssessment(started.assessmentReference, { runType: 'initial', createdByAdminId: null });
  if (!scored.ok) return NextResponse.json({ ok: false, failed: ['score_failed'], scoreErrors: scored.errors, results }, { status: scored.status });
  check('score_run_created', Boolean(scored.scoreRunId), scored);

  const snapshot = await loadFreeSnapshotByReference(started.assessmentReference, scored.scoreRunId);
  check('snapshot_loads', Boolean(snapshot));
  check('snapshot_has_score', typeof snapshot?.overallScore === 'number', snapshot?.overallScore);
  check('snapshot_has_10_domains', snapshot?.domains.length === 10, snapshot?.domains.length);

  const reportResponse = await fetch(`${url.origin}/api/assessments/${started.assessmentReference}/report-request`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: 'uat' }) });
  const reportBody = await reportResponse.json().catch(() => ({}));
  check('report_request_endpoint', reportResponse.ok && reportBody.ok, reportBody);

  const [assessmentAfter, answerCount, exposureCount, scoreRun, domainCount, traceCount, requestCount, emailCount] = await Promise.all([
    service.from('assessments').select('status,current_score_run_id').eq('id', started.assessmentId).single(),
    service.from('assessment_answers').select('id', { count: 'exact', head: true }).eq('assessment_id', started.assessmentId),
    service.from('exposure_answers').select('id', { count: 'exact', head: true }).eq('assessment_id', started.assessmentId),
    service.from('score_runs').select('id,status,overall_score,final_maturity,exposure_score,exposure_band').eq('id', scored.scoreRunId).single(),
    service.from('score_domain_results').select('id', { count: 'exact', head: true }).eq('score_run_id', scored.scoreRunId),
    service.from('score_question_traces').select('id', { count: 'exact', head: true }).eq('score_run_id', scored.scoreRunId),
    service.from('data_requests').select('id', { count: 'exact', head: true }).eq('assessment_id', started.assessmentId).eq('request_type', 'detailed_report_request'),
    service.from('email_events').select('id', { count: 'exact', head: true }).eq('assessment_id', started.assessmentId)
  ]);

  check('final_status_report_requested', assessmentAfter.data?.status === 'report_requested', assessmentAfter.data?.status);
  check('current_score_run_linked', assessmentAfter.data?.current_score_run_id === scored.scoreRunId, assessmentAfter.data?.current_score_run_id);
  check('db_68_answers', answerCount.count === 68, answerCount.count);
  check('db_8_exposures', exposureCount.count === 8, exposureCount.count);
  check('db_score_run_completed', scoreRun.data?.status === 'completed', scoreRun.data);
  check('db_10_domain_results', domainCount.count === 10, domainCount.count);
  check('db_68_question_traces', traceCount.count === 68, traceCount.count);
  check('db_report_request_recorded', (requestCount.count ?? 0) >= 1, requestCount.count);
  check('db_email_event_queued', (emailCount.count ?? 0) >= 1, emailCount.count);

  return NextResponse.json({
    ok: failed.length === 0,
    checkedAt: new Date().toISOString(),
    assessmentReference: started.assessmentReference,
    failed,
    results,
    summary: {
      assessmentStatus: assessmentAfter.data?.status,
      answerCount: answerCount.count,
      exposureCount: exposureCount.count,
      domainResultCount: domainCount.count,
      questionTraceCount: traceCount.count,
      reportRequestCount: requestCount.count,
      emailEventCount: emailCount.count,
      scoreRun: scoreRun.data,
      snapshot: snapshot ? { overallScore: snapshot.overallScore, finalMaturity: snapshot.finalMaturity, exposureScore: snapshot.exposureScore, exposureBand: snapshot.exposureBand, domains: snapshot.domains.length } : null
    }
  }, { status: failed.length === 0 ? 200 : 500 });
}
