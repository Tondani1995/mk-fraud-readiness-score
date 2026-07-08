import Link from 'next/link';
import { AdminShell } from '@/components/admin/AdminShell';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { getAdminAssessmentList } from '@/lib/admin/assessment-review';
import { requireAdmin } from '@/lib/auth/admin-route';

const statusOptions = ['all', 'draft', 'submitted', 'scored', 'snapshot_available', 'report_requested', 'under_review', 'closed', 'voided'];

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString('en-ZA') : '—';
}

export default async function AdminAssessmentsPage({ searchParams }: { searchParams?: { status?: string; page?: string } }) {
  const admin = await requireAdmin(['platform_admin', 'reviewer', 'approver', 'read_only_admin']);
  const status = statusOptions.includes(searchParams?.status ?? '') ? searchParams?.status : 'all';
  const page = Number(searchParams?.page ?? '1');
  const { assessments, count, pageSize, scoreRunsById } = await getAdminAssessmentList({ status, page });
  const totalPages = Math.max(1, Math.ceil(count / pageSize));

  return (
    <AdminShell admin={admin}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Assessment review"
          title="Client readiness queue"
          description="Review assessment submissions, confirm the scoring evidence and open the full response trace before MK prepares any detailed client-facing report."
        />

        <Card className="bg-white/95 shadow-[0_18px_55px_rgba(0,16,48,0.08)]">
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <CardTitle>Assessment queue</CardTitle>
              <Badge>{count} records</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <form className="flex flex-wrap items-center gap-3" action="/score/admin/assessments">
              <label className="text-sm font-semibold text-mk-ink" htmlFor="status">Status</label>
              <select id="status" name="status" defaultValue={status} className="rounded-xl border border-mk-line bg-mk-paper px-3 py-2 text-sm text-mk-ink">
                {statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
              <button className="rounded-xl bg-mk-ink px-4 py-2 text-sm font-semibold text-white" type="submit">Filter queue</button>
            </form>

            {assessments.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-[0.18em] text-mk-muted">
                    <tr>
                      <th className="py-2">Reference</th>
                      <th>Status</th>
                      <th>Organisation</th>
                      <th>Respondent</th>
                      <th>Readiness score</th>
                      <th>Submitted</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-mk-line">
                    {assessments.map((assessment: any) => {
                      const scoreRun = assessment.current_score_run_id ? scoreRunsById.get(assessment.current_score_run_id) : null;
                      return (
                        <tr key={assessment.assessment_reference}>
                          <td className="py-3 font-semibold text-mk-ink">
                            <Link className="underline decoration-mk-brass/50 underline-offset-4 hover:text-mk-brassDark" href={`/admin/assessments/${assessment.assessment_reference}`}>
                              {assessment.assessment_reference}
                            </Link>
                          </td>
                          <td className="py-3 text-mk-muted">{assessment.status}</td>
                          <td className="py-3 text-mk-muted">{assessment.organisations?.legal_name ?? '—'}</td>
                          <td className="py-3 text-mk-muted">{assessment.respondents?.full_name ?? assessment.respondents?.email ?? '—'}</td>
                          <td className="py-3 text-mk-muted">{scoreRun ? `${Number(scoreRun.overall_score).toFixed(0)} · ${scoreRun.final_maturity}` : 'Not scored'}</td>
                          <td className="py-3 text-mk-muted">{formatDate(assessment.submitted_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-sm leading-6 text-mk-muted">No assessments match this filter.</p>}

            <div className="flex items-center justify-between border-t border-mk-line pt-4 text-sm text-mk-muted">
              <span>Page {Number.isFinite(page) ? page : 1} of {totalPages}</span>
              <span>Showing up to {pageSize} records per page.</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}
