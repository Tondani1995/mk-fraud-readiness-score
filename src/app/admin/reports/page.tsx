import { ProtectedAdminPage } from '@/components/admin/ProtectedAdminPage';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';

export default function AdminReportsPage() {
  return (
    <ProtectedAdminPage allowedRoles={['platform_admin', 'reviewer', 'approver', 'read_only_admin']}>
      <div className="space-y-6">
        <PageHeader eyebrow="Protected admin route" title="Report control" description="Report generation remains blocked until Phase 10. This route is protected now to preserve the release-control model." />
        <Card><CardHeader><CardTitle>Phase 10 placeholder</CardTitle></CardHeader><CardContent><p className="text-sm leading-6 text-mk-muted">No report generation, approval or release actions are active in Phase 4.</p></CardContent></Card>
      </div>
    </ProtectedAdminPage>
  );
}
