import { ProtectedAdminPage } from '@/components/admin/ProtectedAdminPage';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';

export default function AdminOrdersPage() {
  return (
    <ProtectedAdminPage allowedRoles={['platform_admin', 'finance_admin', 'read_only_admin']}>
      <div className="space-y-6">
        <PageHeader eyebrow="Protected admin route" title="EFT and order verification" description="Order verification is intentionally reserved for Phase 9. This route is protected now so the later commercial flow has a secure home." />
        <Card><CardHeader><CardTitle>Phase 9 placeholder</CardTitle></CardHeader><CardContent><p className="text-sm leading-6 text-mk-muted">No paid-report order actions are active in Phase 4.</p></CardContent></Card>
      </div>
    </ProtectedAdminPage>
  );
}
