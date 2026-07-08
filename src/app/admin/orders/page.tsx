import { ProtectedAdminPage } from '@/components/admin/ProtectedAdminPage';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';

export default function AdminOrdersPage() {
  return (
    <ProtectedAdminPage allowedRoles={['platform_admin', 'finance_admin', 'read_only_admin']}>
      <div className="space-y-6">
        <PageHeader eyebrow="Protected admin route" title="EFT and order verification" description="Order verification is not active yet. This protected route is reserved for MK's controlled commercial workflow once approved." />
        <Card><CardHeader><CardTitle>Order controls not active</CardTitle></CardHeader><CardContent><p className="text-sm leading-6 text-mk-muted">No paid-report order actions are currently available. Payment verification must remain blocked until the controlled commercial workflow is approved.</p></CardContent></Card>
      </div>
    </ProtectedAdminPage>
  );
}
