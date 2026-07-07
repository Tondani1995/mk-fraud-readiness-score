import type { ReactNode } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { requireAdmin } from '@/lib/auth/admin-route';
import type { AdminRole } from '@/lib/types/domain';

export async function ProtectedAdminPage({ children, allowedRoles }: { children: ReactNode; allowedRoles?: AdminRole[] }) {
  const admin = await requireAdmin(allowedRoles);
  return <AdminShell admin={admin}>{children}</AdminShell>;
}
