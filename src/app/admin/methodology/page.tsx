import { AdminShell } from '@/components/admin/AdminShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { requireAdmin } from '@/lib/auth/admin-route';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

export default async function AdminMethodologyPage() {
  const admin = await requireAdmin(['platform_admin', 'reviewer', 'approver', 'read_only_admin']);
  const service = createSupabaseServiceClient();
  const { data: methodologyVersions } = await service
    .from('methodology_versions')
    .select('version_code,title,status,effective_from,approved_at')
    .order('created_at', { ascending: false })
    .limit(5);

  return (
    <AdminShell admin={admin}>
      <div className="space-y-6">
        <PageHeader eyebrow="Admin authenticated" title="Methodology configuration" description="Phase 4 reads the active methodology shell only. Full question bank management remains in Phase 8." />
        <Card>
          <CardHeader><CardTitle>Methodology versions</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {methodologyVersions?.length ? methodologyVersions.map((version) => (
              <div key={version.version_code} className="rounded-xl border border-mk-line bg-mk-cream/40 p-4 text-sm">
                <p className="font-semibold text-mk-ink">{version.version_code} · {version.title}</p>
                <p className="mt-1 text-mk-muted">Status: {version.status}</p>
              </div>
            )) : <p className="text-sm leading-6 text-mk-muted">No methodology version exists yet. Run the Phase 4 dev seed before starting assessments.</p>}
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}
