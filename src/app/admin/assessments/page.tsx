import { AdminShell } from '@/components/admin/AdminShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { requireAdmin } from '@/lib/auth/admin-route';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

export default async function AdminAssessmentsPage() {
  const admin = await requireAdmin(['platform_admin', 'reviewer', 'approver', 'read_only_admin']);
  const service = createSupabaseServiceClient();
  const { data: assessments } = await service
    .from('assessments')
    .select('assessment_reference,status,started_at,organisations(legal_name),respondents(full_name,email)')
    .order('created_at', { ascending: false })
    .limit(10);

  return (
    <AdminShell admin={admin}>
      <div className="space-y-6">
        <PageHeader eyebrow="Admin authenticated" title="Assessment review" description="Phase 4 shows assessment ownership records only. Answer review begins after Phase 5." />
        <Card>
          <CardHeader><CardTitle>Latest assessment references</CardTitle></CardHeader>
          <CardContent>
            {assessments?.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-[0.18em] text-mk-muted"><tr><th className="py-2">Reference</th><th>Status</th><th>Organisation</th><th>Respondent</th><th>Started</th></tr></thead>
                  <tbody className="divide-y divide-mk-line">
                    {assessments.map((assessment: any) => (
                      <tr key={assessment.assessment_reference}>
                        <td className="py-3 font-semibold text-mk-ink">{assessment.assessment_reference}</td>
                        <td className="py-3 text-mk-muted">{assessment.status}</td>
                        <td className="py-3 text-mk-muted">{assessment.organisations?.legal_name ?? '—'}</td>
                        <td className="py-3 text-mk-muted">{assessment.respondents?.full_name ?? assessment.respondents?.email ?? '—'}</td>
                        <td className="py-3 text-mk-muted">{assessment.started_at ? new Date(assessment.started_at).toLocaleString('en-ZA') : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-sm leading-6 text-mk-muted">No assessments have been started yet.</p>}
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}
