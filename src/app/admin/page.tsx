import Link from 'next/link';
import { AdminShell } from '@/components/admin/AdminShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { getAdminDashboardCounts } from '@/lib/admin/dashboard';
import { requireAdmin } from '@/lib/auth/admin-route';

export default async function AdminHomePage() {
  const admin = await requireAdmin(['platform_admin', 'reviewer', 'approver', 'finance_admin', 'read_only_admin']);
  const counts = await getAdminDashboardCounts();

  return (
    <AdminShell admin={admin}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Phase 8 admin console"
          title="MK control centre"
          description="Inspect assessments, score traces, V1 configuration and audit events. EFT verification and PDF generation remain blocked until their own phases."
        />
        <div className="grid gap-4 md:grid-cols-4">
          {[
            ['Assessments', counts.assessmentCount, 'Draft, submitted and scored assessment records.', '/admin/assessments'],
            ['Report requests', counts.reportRequestCount, 'Detailed report requests received from free snapshots.', '/admin/assessments?status=report_requested'],
            ['Products', counts.productCount, 'Package/pricing configuration foundation.', '/admin/config/products'],
            ['Audit events', counts.auditEventCount, 'Recent sensitive platform and assessment events.', '/admin/audit-log']
          ].map(([title, value, text, href]) => (
            <Card key={title as string}>
              <CardHeader>
                <CardTitle>{title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold text-mk-ink">{value}</p>
                <p className="mt-2 text-sm leading-6 text-mk-muted">{text}</p>
                <Link href={href as string} className="mt-4 inline-flex text-sm font-semibold text-mk-brassDark underline decoration-mk-brass/50 underline-offset-4">Open</Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AdminShell>
  );
}
