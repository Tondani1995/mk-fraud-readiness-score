import Link from 'next/link';
import type { ReactNode } from 'react';
import type { AdminSession } from '@/lib/auth/admin-route';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';

const adminLinks = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/assessments', label: 'Assessments' },
  { href: '/admin/methodology', label: 'Methodology' },
  { href: '/admin/orders', label: 'Orders' },
  { href: '/admin/reports', label: 'Reports' },
  { href: '/admin/settings', label: 'Settings' }
];

export function AdminShell({ admin, children }: { admin: AdminSession; children: ReactNode }) {
  return (
    <div className="border-t border-mk-line bg-mk-paper">
      <div className="mx-auto flex min-h-[70vh] max-w-7xl flex-col gap-8 px-6 py-8 lg:flex-row">
        <aside className="lg:w-72">
          <div className="rounded-2xl border border-mk-line bg-mk-cream/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-mk-brassDark">MK Admin</p>
            <div className="mt-4 rounded-xl border border-mk-line bg-mk-paper p-3 text-sm">
              <p className="font-semibold text-mk-ink">{admin.fullName ?? admin.email}</p>
              <p className="mt-1 text-xs text-mk-muted">{admin.email}</p>
              <Badge className="mt-3">{admin.role}</Badge>
            </div>
            <nav className="mt-4 grid gap-1">
              {adminLinks.map((link) => (
                <Link key={link.href} href={link.href} className="rounded-xl px-3 py-2 text-sm text-mk-muted hover:bg-mk-paper hover:text-mk-ink">
                  {link.label}
                </Link>
              ))}
            </nav>
            <form action="/api/admin/logout" method="post" className="mt-5">
              <Button variant="secondary" className="w-full" type="submit">Sign out</Button>
            </form>
          </div>
        </aside>
        <section className="min-w-0 flex-1">{children}</section>
      </div>
    </div>
  );
}
