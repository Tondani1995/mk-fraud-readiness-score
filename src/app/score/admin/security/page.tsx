import { AdminShell } from '@/components/admin/AdminShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { MfaEnrollment } from '@/components/admin/MfaEnrollment';
import { requireAdmin } from '@/lib/auth/admin-route';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AdminSecurityPage() {
  const admin = await requireAdmin();

  return (
    <AdminShell admin={admin}>
      <PageHeader
        eyebrow="Account security"
        title="Multi-factor authentication"
        description="AAL2 (MFA-verified) sessions are required for the security-gate and Phase 14 activation controls. Enroll an authenticator app here, then step up before using those controls."
      />
      <Card>
        <CardHeader>
          <CardTitle>Authenticator apps</CardTitle>
        </CardHeader>
        <CardContent>
          <MfaEnrollment />
        </CardContent>
      </Card>
    </AdminShell>
  );
}
