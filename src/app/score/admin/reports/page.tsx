import Link from 'next/link';
import { AdminShell } from '@/components/admin/AdminShell';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { requireAdmin } from '@/lib/auth/admin-route';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function cleanStatus(status: string | null | undefined) {
  return (status ?? 'generated').replace(/_/g, ' ');
}

async function getRecentReports(db: any) {
  const { data, error } = await db
    .from('reports')
    .select('id, report_reference, version_number, status, generated_at, storage_bucket, storage_path, orders(order_reference, organisation_name), assessments(assessment_reference)')
    .order('generated_at', { ascending: false })
    .limit(50);
  if (error) {
    console.error('recent reports query failed', error);
    return [];
  }
  return data ?? [];
}

export default async function AdminReportsPage() {
  const admin = await requireAdmin(['platform_admin', 'reviewer', 'approver', 'read_only_admin']);
  const db = createSupabaseServiceClient() as any;
  const reports = await getRecentReports(db);
  return (
    <AdminShell admin={admin}>
      <div className="space-y-6">
        <PageHeader eyebrow="Report control" title="Generated report versions" description="Review generated report versions and access controlled admin downloads. Report creation happens from eligible paid orders only." />
        <Card><CardHeader><CardTitle>Recent reports</CardTitle></CardHeader><CardContent className="space-y-3">
          {reports.map((report: any) => <div key={report.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-mk-line bg-white p-4 text-sm"><div><div className="flex flex-wrap items-center gap-2"><Badge>{cleanStatus(report.status)}</Badge><span className="font-semibold text-mk-ink">{report.report_reference}</span></div><p className="mt-2 text-mk-muted">Version {report.version_number} · {report.assessments?.assessment_reference ?? 'Assessment not linked'} · {report.orders?.organisation_name ?? 'Organisation not captured'}</p><p className="mt-1 text-mk-muted">Generated {report.generated_at ? new Date(report.generated_at).toLocaleString('en-ZA') : 'date not captured'}</p></div><div className="flex flex-wrap gap-2">{report.orders?.order_reference ? <Button asChild variant="secondary"><Link href={`/score/admin/orders/${report.orders.order_reference}`}>Open order</Link></Button> : null}{report.storage_bucket && report.storage_path ? <Button asChild><a href={`/score/api/admin/reports/${report.id}/download`}>Download</a></Button> : null}</div></div>)}
          {!reports.length ? <p className="text-sm leading-6 text-mk-muted">No generated reports yet. Reports are generated from an eligible order after manual payment confirmation.</p> : null}
        </CardContent></Card>
      </div>
    </AdminShell>
  );
}
