import Link from 'next/link';
import type { ReactNode } from 'react';
import type { AdminSession } from '@/lib/auth/admin-route';
import { Badge } from '@/components/ui/Badge';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

const adminLinks = [
  { href: '/admin', label: 'Control room' },
  { href: '/admin/assessments', label: 'Assessment reviews' },
  { href: '/admin/config/questions', label: 'Readiness methodology' },
  { href: '/admin/config/products', label: 'Commercial setup' },
  { href: '/admin/config/content', label: 'Report content library' },
  { href: '/admin/audit-log', label: 'Audit trail' },
  { href: '/admin/orders', label: 'Order controls' },
  { href: '/admin/enquiries', label: 'Personalised enquiries' },
  { href: '/admin/reports', label: 'Report controls' },
  { href: '/admin/operational-alerts', label: 'Operational alerts' },
  { href: '/admin/phase14-activation', label: 'Automation activation controls' }
];

function scorePath(path: string) {
  return `/score${path.startsWith('/') ? path : `/${path}`}`;
}

async function getOpenCriticalAlertCount(): Promise<number | null> {
  try {
    const db = createSupabaseServiceClient();
    const { count, error } = await db
      .from('phase14_operational_alerts')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'open')
      .eq('severity', 'critical');
    if (error) return null;
    return count ?? 0;
  } catch {
    return null;
  }
}

export async function AdminShell({ admin, children }: { admin: AdminSession; children: ReactNode }) {
  const criticalAlertCount = await getOpenCriticalAlertCount();
  return (
    <div className="min-h-[calc(100vh-5rem)] border-t border-mk-line bg-gradient-to-br from-mk-cream via-white to-mk-cream">
      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-6 py-8 lg:flex-row">
        <aside className="lg:w-80">
          <div className="overflow-hidden rounded-[1.6rem] border border-mk-line bg-white shadow-[0_24px_70px_rgba(0,16,48,0.10)]">
            <div className="bg-mk-ink px-5 py-5 text-white">
              <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/70">MK Fraud Insights</p>
              <h2 className="mt-3 text-xl font-semibold">Readiness Control Room</h2>
              <p className="mt-2 text-sm leading-6 text-white/70">Internal workspace for assessment review and evidence trace.</p>
            </div>
            <div className="p-5">
              <div className="rounded-2xl border border-mk-line bg-mk-cream p-4 text-sm">
                <p className="font-semibold text-mk-ink">{admin.fullName ?? 'MK Platform Admin'}</p>
                <p className="mt-1 text-xs text-mk-muted">{admin.email}</p>
                <Badge className="mt-3 bg-white">{admin.role.replace(/_/g, ' ')}</Badge>
              </div>
              <nav className="mt-5 grid gap-2">
                {adminLinks.map((link) => (
                  <Link key={link.href} href={scorePath(link.href)} className="flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-semibold text-mk-muted transition hover:bg-mk-cream hover:text-mk-ink">
                    <span>{link.label}</span>
                    {link.href === '/admin/operational-alerts' && Boolean(criticalAlertCount) && (
                      <Badge className="bg-red-100 text-red-800">{criticalAlertCount}</Badge>
                    )}
                  </Link>
                ))}
              </nav>
            </div>
          </div>
        </aside>
        <section className="min-w-0 flex-1">{children}</section>
      </div>
    </div>
  );
}
