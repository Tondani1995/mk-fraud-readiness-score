import { ProtectedAdminPage } from '@/components/admin/ProtectedAdminPage';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';

export default function AdminSettingsPage() {
  return (
    <ProtectedAdminPage allowedRoles={['platform_admin', 'finance_admin', 'read_only_admin']}>
      <div className="space-y-6">
        <PageHeader eyebrow="Platform configuration" title="Platform settings" description="Platform-wide settings are managed from the Products and Configuration pages. This page is reserved for future platform-level controls." />
        <Card><CardHeader><CardTitle>Reserved for future use</CardTitle></CardHeader><CardContent><p className="text-sm leading-6 text-mk-muted">No platform-level settings are configurable from this page yet. EFT details, products and pricing are managed on the Products page.</p></CardContent></Card>
      </div>
    </ProtectedAdminPage>
  );
}
