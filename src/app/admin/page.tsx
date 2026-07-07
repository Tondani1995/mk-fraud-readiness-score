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
          eyebrow="Admin authenticated"
          title="MK control centre"
          description="Phase 4 protects admin routes and connects them to Supabase admin profiles. Assessment review, orders and reports remain limited until their later phases."
        />
        <div className="grid gap-4 md:grid-cols-3">
          {[
            ['Assessments', counts.assessmentCount, 'Draft and submitted assessment records.'],
            ['Orders', counts.orderCount, 'Future EFT proof and payment verification records.'],
            ['Reports', counts.reportCount, 'Future generated and released report records.']
          ].map(([title, value, text]) => (
            <Card key={title as string}>
              <CardHeader>
                <CardTitle>{title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-semibold text-mk-ink">{value}</p>
                <p className="mt-2 text-sm leading-6 text-mk-muted">{text}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AdminShell>
  );
}
