import { AdminShell } from '@/components/admin/AdminShell';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { getAdminMethodologyConfig } from '@/lib/admin/assessment-review';
import { requireAdmin } from '@/lib/auth/admin-route';

export default async function AdminContentConfigPage() {
  const admin = await requireAdmin(['platform_admin', 'reviewer', 'approver', 'read_only_admin']);
  const config = await getAdminMethodologyConfig();

  return (
    <AdminShell admin={admin}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Phase 8 content foundation"
          title="Report content blocks"
          description="Review controlled narrative blocks that may later feed the Phase 10 PDF report engine. This page does not generate reports."
        />

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <CardTitle>Reusable content blocks</CardTitle>
              <Badge>{config.contentBlocks.length} blocks</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {config.contentBlocks.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-[0.18em] text-mk-muted"><tr><th className="py-2">Block</th><th>Type</th><th>Domain</th><th>Maturity</th><th>Severity</th><th>Status</th><th>Version</th></tr></thead>
                  <tbody className="divide-y divide-mk-line">
                    {config.contentBlocks.map((block: any) => (
                      <tr key={`${block.block_key}-${block.version_number}`}>
                        <td className="py-3"><p className="font-semibold text-mk-ink">{block.block_key}</p><p className="mt-1 text-mk-muted">{block.title ?? 'Untitled block'}</p></td>
                        <td className="py-3 text-mk-muted">{block.block_type}</td>
                        <td className="py-3 text-mk-muted">{block.domain_code ?? '—'}</td>
                        <td className="py-3 text-mk-muted">{block.maturity_band ?? '—'}</td>
                        <td className="py-3 text-mk-muted">{block.severity ?? '—'}</td>
                        <td className="py-3 text-mk-muted">{block.status}</td>
                        <td className="py-3 text-mk-muted">v{block.version_number}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-sm leading-6 text-mk-muted">No report content blocks exist yet. Phase 10 should add approved, versioned PDF content blocks before report generation is enabled.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Phase boundary</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm leading-6 text-mk-muted">This is a review foundation only. It does not expose AI-generated content, publish client-facing benchmarks or create a PDF report.</p>
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}
