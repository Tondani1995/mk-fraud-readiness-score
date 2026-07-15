import { AdminLoginForm } from '@/components/admin/AdminLoginForm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { SectionShell } from '@/components/ui/SectionShell';

export default function AdminLoginPage({ searchParams }: { searchParams?: { error?: string } }) {
  const error = searchParams?.error === 'forbidden' ? 'Your admin role is not allowed to access that page.' : null;

  return (
    <SectionShell className="py-12">
      <PageHeader
        eyebrow="MK admin authentication"
        title="Sign in to the control centre"
        description="Admin access is restricted to active MK users in Supabase Auth with a matching admin profile. Respondents do not sign in or create accounts in V1."
      />
      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle>Admin login</CardTitle>
        </CardHeader>
        <CardContent>
          {error ? <div className="mb-4 rounded-xl border border-mk-danger/30 bg-mk-danger/10 px-4 py-3 text-sm text-mk-danger">{error}</div> : null}
          <AdminLoginForm />
        </CardContent>
      </Card>
    </SectionShell>
  );
}
