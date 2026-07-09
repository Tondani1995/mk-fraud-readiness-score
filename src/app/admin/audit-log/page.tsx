import { AdminShell } from '@/components/admin/AdminShell';
import { Badge } from '@/components/ui/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { getAdminAuditLog } from '@/lib/admin/assessment-review';
import { requireAdmin } from '@/lib/auth/admin-route';

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleString('en-ZA') : '—';
}

export default async function AdminAuditLogPage() {
  const admin = await requireAdmin(['platform_admin', 'reviewer', 'approver', 'finance_admin', 'read_only_admin']);
  const events = await getAdminAuditLog();

  return (
    <AdminShell admin={admin}>
      <div className="space-y-6">
        <PageHeader
          eyebrow="Phase 8 audit controls"
          title="Audit log"
          description="Review recent admin, respondent-token and system events. This is a visibility surface; audit records remain append-only."
        />

        <Card>
          <CardHeader>
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <CardTitle>Recent events</CardTitle>
              <Badge>{events.length} shown</Badge>
            </div>
          </CardHeader>
          <CardContent>
            {events.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-[0.18em] text-mk-muted"><tr><th className="py-2">Time</th><th>Actor</th><th>Action</th><th>Entity</th><th>Assessment</th><th>After</th></tr></thead>
                  <tbody className="divide-y divide-mk-line">
                    {events.map((event: any, index: number) => (
                      <tr key={`${event.action}-${event.created_at}-${index}`}>
                        <td className="py-3 text-mk-muted">{formatDate(event.created_at)}</td>
                        <td className="py-3 text-mk-muted">{event.actor_type}</td>
                        <td className="py-3 font-semibold text-mk-ink">{event.action}</td>
                        <td className="py-3 text-mk-muted">{event.entity_table}</td>
                        <td className="py-3 text-mk-muted">{event.assessment_id ?? '—'}</td>
                        <td className="py-3 text-mk-muted"><pre className="max-w-sm whitespace-pre-wrap break-words text-xs">{event.after_json ? JSON.stringify(event.after_json, null, 2) : '—'}</pre></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-sm leading-6 text-mk-muted">No audit events found.</p>}
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}
