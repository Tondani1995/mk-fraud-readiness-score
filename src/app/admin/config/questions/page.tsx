import { ProtectedAdminPage } from '@/components/admin/ProtectedAdminPage';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { getAdminMethodologyConfig } from '@/lib/admin/assessment-review';

export default async function AdminQuestionConfigPage() {
  const config = await getAdminMethodologyConfig();
  const criticalCount = config.questions.filter((question: any) => question.is_critical).length;
  const hardGateCount = config.questions.filter((question: any) => question.is_hard_gate).length;

  return (
    <ProtectedAdminPage allowedRoles={['platform_admin', 'reviewer', 'approver', 'read_only_admin']}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Phase 8 configuration review"
          title="Question and scoring configuration"
          description="Review the active V1 question bank, domain weights, critical-control flags and exposure inputs without changing the scoring methodology casually."
        />

        <div className="grid gap-4 md:grid-cols-4">
          <Card><CardHeader><CardTitle>Methodology</CardTitle></CardHeader><CardContent><p className="font-semibold text-mk-ink">{config.activeMethodology?.version_code ?? '—'}</p><p className="mt-1 text-sm text-mk-muted">{config.activeMethodology?.status ?? 'No active methodology'}</p></CardContent></Card>
          <Card><CardHeader><CardTitle>Domains</CardTitle></CardHeader><CardContent><p className="text-3xl font-semibold text-mk-ink">{config.domains.length}</p></CardContent></Card>
          <Card><CardHeader><CardTitle>Critical controls</CardTitle></CardHeader><CardContent><p className="text-3xl font-semibold text-mk-ink">{criticalCount}</p></CardContent></Card>
          <Card><CardHeader><CardTitle>Hard gates</CardTitle></CardHeader><CardContent><p className="text-3xl font-semibold text-mk-ink">{hardGateCount}</p></CardContent></Card>
        </div>

        <Card>
          <CardHeader><CardTitle>Domain weights</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.18em] text-mk-muted"><tr><th className="py-2">Domain</th><th>Weight</th><th>Type</th><th>Core</th></tr></thead>
                <tbody className="divide-y divide-mk-line">
                  {config.domains.map((domain: any) => (
                    <tr key={domain.domain_code}>
                      <td className="py-3 font-semibold text-mk-ink">{domain.domain_code} · {domain.name}</td>
                      <td className="py-3 text-mk-muted">{Number(domain.weight_pct).toFixed(1)}%</td>
                      <td className="py-3 text-mk-muted">{domain.domain_type}</td>
                      <td className="py-3 text-mk-muted">{domain.is_core ? 'Yes' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Question bank</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-[0.18em] text-mk-muted"><tr><th className="py-2">Question</th><th>Domain</th><th>Weight</th><th>Flags</th><th>N/A</th></tr></thead>
                <tbody className="divide-y divide-mk-line">
                  {config.questions.map((question: any) => (
                    <tr key={question.question_code}>
                      <td className="py-3"><p className="font-semibold text-mk-ink">{question.question_code}</p><p className="mt-1 max-w-3xl text-mk-muted">{question.prompt}</p></td>
                      <td className="py-3 text-mk-muted">{question.domains?.domain_code}</td>
                      <td className="py-3 text-mk-muted">{Number(question.weight).toFixed(2)}</td>
                      <td className="py-3 text-mk-muted"><span className="flex flex-wrap gap-2">{question.is_critical ? <Badge>critical</Badge> : null}{question.is_hard_gate ? <Badge>hard gate</Badge> : null}{question.active === false ? <Badge>inactive</Badge> : null}</span></td>
                      <td className="py-3 text-mk-muted">{question.n_a_allowed ? question.n_a_rule_key ?? 'Allowed' : 'No'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Exposure factors</CardTitle></CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            {config.exposureFactors.map((factor: any) => (
              <div key={factor.factor_code} className="rounded-xl border border-mk-line bg-mk-cream/40 p-4 text-sm">
                <p className="font-semibold text-mk-ink">{factor.factor_code} · {factor.name}</p>
                <p className="mt-1 text-mk-muted">Max points: {Number(factor.max_points).toFixed(0)} · Input: {factor.input_type}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </ProtectedAdminPage>
  );
}
