import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { getAdminAssessmentDetail } from '@/lib/admin/assessment-review';
import { requireAdmin } from '@/lib/auth/admin-route';

export const dynamic = 'force-dynamic';

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString('en-ZA') : '—';
}

function formatScore(value: unknown) {
  if (value === null || value === undefined) return '—';
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(0) : String(value);
}

export default async function AdminAssessmentDetailPage({ params }: { params: { assessmentRef: string } }) {
  const admin = await requireAdmin(['platform_admin', 'reviewer', 'approver', 'read_only_admin']);
  const detail = await getAdminAssessmentDetail(params.assessmentRef, admin);
  if (!detail) notFound();

  const { assessment, scoreRun, domainResults, answers, exposureAnswers, questionTraces, maturityCapEvents, dataRequests, auditEvents } = detail;

  return (
    <AdminShell admin={admin}>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <PageHeader
            eyebrow="Assessment detail"
            title={assessment.assessment_reference}
            description="Admin-only trace view for respondent details, organisation profile, answer trail and persisted score calculation."
          />
          <Link className="rounded-xl border border-mk-line px-4 py-2 text-sm font-semibold text-mk-ink hover:bg-mk-cream" href="/admin/assessments">Back to list</Link>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card><CardHeader><CardTitle>Status</CardTitle></CardHeader><CardContent><Badge>{assessment.status}</Badge><p className="mt-2 text-xs text-mk-muted">Submitted: {formatDate(assessment.submitted_at)}</p></CardContent></Card>
          <Card><CardHeader><CardTitle>Readiness</CardTitle></CardHeader><CardContent><p className="text-3xl font-semibold text-mk-ink">{formatScore(scoreRun?.overall_score)}</p><p className="text-sm text-mk-muted">{scoreRun?.final_maturity ?? 'Not scored'}</p></CardContent></Card>
          <Card><CardHeader><CardTitle>Exposure</CardTitle></CardHeader><CardContent><p className="text-3xl font-semibold text-mk-ink">{formatScore(scoreRun?.exposure_score)}</p><p className="text-sm text-mk-muted">{scoreRun?.exposure_band ?? '—'}</p></CardContent></Card>
          <Card><CardHeader><CardTitle>Coverage</CardTitle></CardHeader><CardContent><p className="text-3xl font-semibold text-mk-ink">{formatScore(scoreRun?.coverage_pct)}%</p><p className="text-sm text-mk-muted">Critical gaps: {scoreRun?.critical_gap_count ?? '—'}</p></CardContent></Card>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Organisation profile</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm text-mk-muted">
              <p><span className="font-semibold text-mk-ink">Legal name:</span> {assessment.organisations?.legal_name ?? '—'}</p>
              <p><span className="font-semibold text-mk-ink">Trading name:</span> {assessment.organisations?.trading_name ?? '—'}</p>
              <p><span className="font-semibold text-mk-ink">Sector:</span> {assessment.organisations?.sector ?? assessment.organisations?.industry ?? '—'}</p>
              <p><span className="font-semibold text-mk-ink">Province:</span> {assessment.organisations?.province ?? '—'}</p>
              <p><span className="font-semibold text-mk-ink">Employee band:</span> {assessment.organisations?.employee_band ?? '—'}</p>
              <p><span className="font-semibold text-mk-ink">Revenue band:</span> {assessment.organisations?.annual_revenue_band ?? '—'}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Respondent</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm text-mk-muted">
              <p><span className="font-semibold text-mk-ink">Name:</span> {assessment.respondents?.full_name ?? '—'}</p>
              <p><span className="font-semibold text-mk-ink">Email:</span> {assessment.respondents?.email ?? '—'}</p>
              <p><span className="font-semibold text-mk-ink">Role:</span> {assessment.respondents?.role_title ?? '—'}</p>
              <p><span className="font-semibold text-mk-ink">Started:</span> {formatDate(assessment.started_at)}</p>
              <p><span className="font-semibold text-mk-ink">Locked:</span> {formatDate(assessment.locked_at)}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Score trace summary</CardTitle></CardHeader>
          <CardContent>
            {scoreRun ? (
              <div className="grid gap-3 text-sm text-mk-muted md:grid-cols-2">
                <p><span className="font-semibold text-mk-ink">Run:</span> #{scoreRun.run_number} · {scoreRun.run_type} · {scoreRun.status}</p>
                <p><span className="font-semibold text-mk-ink">Calculated/final maturity:</span> {scoreRun.calculated_maturity} / {scoreRun.final_maturity}</p>
                <p><span className="font-semibold text-mk-ink">N/A rate:</span> {formatScore(scoreRun.n_a_rate_pct)}%</p>
                <p><span className="font-semibold text-mk-ink">Major gaps:</span> {scoreRun.major_gap_count}</p>
                <p><span className="font-semibold text-mk-ink">Cap applied:</span> {scoreRun.cap_applied ? 'Yes' : 'No'}</p>
                <p><span className="font-semibold text-mk-ink">Locked at:</span> {formatDate(scoreRun.locked_at)}</p>
              </div>
            ) : <p className="text-sm text-mk-muted">No score run exists yet.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Domain scores</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.18em] text-mk-muted"><tr><th className="py-2">Domain</th><th>Raw</th><th>Weighted</th><th>Coverage</th><th>Critical gaps</th></tr></thead>
                <tbody className="divide-y divide-mk-line">
                  {domainResults.map((domain: any, index: number) => (
                    <tr key={`${domain.domains?.domain_code ?? 'domain'}-${index}`}>
                      <td className="py-3 font-semibold text-mk-ink">{domain.domains?.domain_code} · {domain.domains?.name}</td>
                      <td className="py-3 text-mk-muted">{formatScore(domain.raw_score)}</td>
                      <td className="py-3 text-mk-muted">{formatScore(domain.weighted_contribution)}</td>
                      <td className="py-3 text-mk-muted">{formatScore(domain.coverage_pct)}%</td>
                      <td className="py-3 text-mk-muted">{domain.critical_gap_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Exposure answers</CardTitle></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {exposureAnswers.length ? exposureAnswers.map((answer: any, index: number) => (
              <div key={`${answer.exposure_factors?.factor_code ?? 'exposure'}-${index}`} className="rounded-xl border border-mk-line bg-mk-cream/40 p-4 text-sm">
                <p className="font-semibold text-mk-ink">{answer.exposure_factors?.factor_code} · {answer.exposure_factors?.name}</p>
                <p className="mt-1 text-mk-muted">Points: {formatScore(answer.points_awarded)} / {formatScore(answer.exposure_factors?.max_points)}</p>
              </div>
            )) : <p className="text-sm text-mk-muted">No exposure answers found.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Answer trace</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.18em] text-mk-muted"><tr><th className="py-2">Question</th><th>Answer</th><th>N/A</th><th>Critical</th><th>Hard gate</th></tr></thead>
                <tbody className="divide-y divide-mk-line">
                  {answers.map((answer: any, index: number) => (
                    <tr key={answer.id ?? index}>
                      <td className="py-3"><p className="font-semibold text-mk-ink">{answer.questions?.question_code}</p><p className="mt-1 max-w-3xl text-mk-muted">{answer.questions?.prompt}</p></td>
                      <td className="py-3 text-mk-muted">{answer.is_not_applicable ? 'N/A' : answer.response_value}</td>
                      <td className="py-3 text-mk-muted">{answer.is_not_applicable ? answer.n_a_reason ?? 'Yes' : 'No'}</td>
                      <td className="py-3 text-mk-muted">{answer.questions?.is_critical ? 'Yes' : 'No'}</td>
                      <td className="py-3 text-mk-muted">{answer.questions?.is_hard_gate ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Question-level score trace</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.18em] text-mk-muted"><tr><th className="py-2">Question</th><th>Normalised</th><th>Applicable</th><th>Numerator</th><th>Denominator</th><th>Flags</th></tr></thead>
                <tbody className="divide-y divide-mk-line">
                  {questionTraces.map((trace: any, index: number) => (
                    <tr key={`${trace.questions?.question_code ?? 'trace'}-${index}`}>
                      <td className="py-3 font-semibold text-mk-ink">{trace.questions?.question_code}</td>
                      <td className="py-3 text-mk-muted">{formatScore(trace.normalised_score)}</td>
                      <td className="py-3 text-mk-muted">{trace.applicable ? 'Yes' : 'No'}</td>
                      <td className="py-3 text-mk-muted">{formatScore(trace.numerator_contribution)}</td>
                      <td className="py-3 text-mk-muted">{formatScore(trace.denominator_contribution)}</td>
                      <td className="py-3 text-mk-muted">{trace.is_critical_gap ? 'Critical gap ' : ''}{trace.is_major_gap ? 'Major gap' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 lg:grid-cols-3">
          <Card><CardHeader><CardTitle>Maturity caps</CardTitle></CardHeader><CardContent className="space-y-2 text-sm text-mk-muted">{maturityCapEvents.length ? maturityCapEvents.map((event: any) => <p key={`${event.rule_code}-${event.created_at}`}><span className="font-semibold text-mk-ink">{event.rule_code}</span>: {event.reason}</p>) : 'No maturity cap event recorded.'}</CardContent></Card>
          <Card><CardHeader><CardTitle>Report requests</CardTitle></CardHeader><CardContent className="space-y-2 text-sm text-mk-muted">{dataRequests.length ? dataRequests.map((request: any) => <p key={request.id}><span className="font-semibold text-mk-ink">{request.request_type}</span>: {request.status} · {formatDate(request.created_at)}</p>) : 'No report request recorded.'}</CardContent></Card>
          <Card><CardHeader><CardTitle>Audit events</CardTitle></CardHeader><CardContent className="space-y-2 text-sm text-mk-muted">{auditEvents.length ? auditEvents.map((event: any, index: number) => <p key={`${event.action}-${index}`}><span className="font-semibold text-mk-ink">{event.action}</span> · {formatDate(event.created_at)}</p>) : 'No audit events recorded.'}</CardContent></Card>
        </div>
      </div>
    </AdminShell>
  );
}
