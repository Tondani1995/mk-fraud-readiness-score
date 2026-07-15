import Link from 'next/link';
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
      <div className="space-y-8">
        <PageHeader
          eyebrow="MK Fraud Readiness Score"
          title="Internal review control room"
          description="A private MK Fraud workspace for reviewing submitted assessments, checking score evidence, monitoring report interest and preserving the audit trail."
        />
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {[
            ['Assessment reviews', counts.assessmentCount, 'Client readiness assessments available for MK review and scoring evidence checks.', '/score/admin/assessments', 'Review assessments'],
            ['Detailed report interest', counts.reportRequestCount, 'Respondents who requested a detailed report after viewing their free readiness snapshot.', '/score/admin/assessments?status=report_requested', 'View requests'],
            ['Commercial products', counts.productCount, 'Configured MK Fraud Readiness packages and pricing foundations for the V1 product.', '/score/admin/config/products', 'View setup'],
            ['Audit trail', counts.auditEventCount, 'Sensitive respondent, scoring and admin events recorded for governance traceability.', '/score/admin/audit-log', 'Open audit trail']
          ].map(([title, value, text, href, cta]) => (
            <Card key={title as string} className="bg-white/95 shadow-[0_18px_55px_rgba(0,16,48,0.08)]">
              <CardHeader>
                <CardTitle>{title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-4xl font-semibold tracking-tight text-mk-ink">{value}</p>
                <p className="mt-3 min-h-24 text-sm leading-6 text-mk-muted">{text}</p>
                <Link href={href as string} className="mt-5 inline-flex rounded-full border border-mk-line bg-mk-cream px-4 py-2 text-sm font-semibold text-mk-ink transition hover:border-mk-brass hover:bg-white">
                  {cta}
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </AdminShell>
  );
}
