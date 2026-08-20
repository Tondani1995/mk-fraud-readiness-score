import { AdminShell } from '@/components/admin/AdminShell';
import { requireAdmin } from '@/lib/auth/admin-route';
import { ComprehensiveReviewWorkspace } from '@/components/comprehensive/ComprehensiveReviewWorkspace';

export const dynamic = 'force-dynamic';

export default async function ComprehensiveReviewPage(props: { params: Promise<{ orderReference: string }> }) {
  const params = await props.params;
  const admin = await requireAdmin(['platform_admin', 'reviewer', 'approver', 'read_only_admin']);
  return <AdminShell admin={admin}><ComprehensiveReviewWorkspace orderReference={params.orderReference} /></AdminShell>;
}
