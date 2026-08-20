import { AdminShell } from '@/components/admin/AdminShell';
import { requireAdmin } from '@/lib/auth/admin-route';
import { ComprehensiveOperationsWorkspace } from '@/components/comprehensive/ComprehensiveOperationsWorkspace';

export const dynamic = 'force-dynamic';

export default async function ComprehensiveOperationsPage(props: { params: Promise<{ orderReference: string }> }) {
  const params = await props.params;
  const admin = await requireAdmin(['platform_admin', 'finance_admin', 'reviewer', 'approver', 'read_only_admin']);
  return <AdminShell admin={admin}><ComprehensiveOperationsWorkspace orderReference={params.orderReference} /></AdminShell>;
}
