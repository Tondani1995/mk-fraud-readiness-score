import { ProtectedAdminPage } from '@/components/admin/ProtectedAdminPage';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';

export default function AdminReportsPage() {
  return (
    <ProtectedAdminPage allowedRoles={['platform_admin', 'reviewer', 'approver', 'read_only_admin']}>
      <div className="space-y-6">
        <PageHeader eyebrow="Protected admin route" title="Report control" description="Report generation and release are not active yet. This protected route is reserved for MK's controlled report workflow once approved." />
        <Card><CardHeader><CardTitle>Report controls not active</CardTitle></CardHeader><CardContent><p className="text-sm leading-6 text-mk-muted">No report generation, approval or release actions are currently available. Reports must remain blocked until the report-control workflow is approved.</p></CardContent></Card>
      </div>
    </ProtectedAdminPage>
  );
}
