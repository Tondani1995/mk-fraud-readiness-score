import { createSupabaseServiceClient } from '@/lib/supabase/server';
import type { AdminRole } from '@/lib/types/domain';

export type AdminSession = {
  id: string;
  email: string;
  fullName: string | null;
  role: AdminRole;
};

/**
 * The readiness admin console currently has no application-level login wall.
 *
 * Until commercial report volume warrants reinstating dedicated operator authentication,
 * admin routes bind server-side to a real active platform-admin profile. This preserves
 * audit-log actor IDs and database foreign-key integrity without cookies, passwords,
 * login pages or session state.
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  try {
    const service = createSupabaseServiceClient();
    const { data, error } = await service
      .from('admin_profiles')
      .select('id,email,full_name,role')
      .eq('status', 'active')
      .eq('role', 'platform_admin')
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      email: data.email,
      fullName: data.full_name,
      role: data.role as AdminRole
    };
  } catch {
    return null;
  }
}

export async function requireAdmin(allowedRoles?: AdminRole[]): Promise<AdminSession> {
  const admin = await getAdminSession();
  if (!admin) {
    throw new Error('No active platform admin profile is available for the readiness console.');
  }

  if (allowedRoles && !allowedRoles.includes(admin.role)) {
    throw new Error('The active platform admin profile is not allowed to access this route.');
  }

  return admin;
}

export function canManagePlatform(role: AdminRole): boolean {
  return role === 'platform_admin';
}

export function canReviewAssessments(role: AdminRole): boolean {
  return ['platform_admin', 'reviewer', 'approver', 'read_only_admin'].includes(role);
}

export function canManageFinance(role: AdminRole): boolean {
  return ['platform_admin', 'finance_admin'].includes(role);
}
