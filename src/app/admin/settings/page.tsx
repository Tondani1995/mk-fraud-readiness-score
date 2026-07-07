import { ProtectedAdminPage } from '@/components/admin/ProtectedAdminPage';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';

export default function AdminSettingsPage() {
  return (
    <ProtectedAdminPage allowedRoles={['platform_admin', 'finance_admin', 'read_only_admin']}>
      <div className="space-y-6">
        <PageHeader eyebrow="Protected admin route" title="Platform settings" description="Settings are protected in Phase 4. Editing EFT details, products and templates remains reserved for later phases." />
        <Card><CardHeader><CardTitle>Phase 8/9 placeholder</CardTitle></CardHeader><CardContent><p className="text-sm leading-6 text-mk-muted">No platform setting changes are active in Phase 4.</p></CardContent></Card>
      </div>
    </ProtectedAdminPage>
  );
}
