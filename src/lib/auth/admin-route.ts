import { redirect } from 'next/navigation';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import type { AdminRole } from '@/lib/types/domain';

export type AdminSession = {
  id: string;
  email: string;
  fullName: string | null;
  role: AdminRole;
};

/**
 * Recovery-branch operator access.
 *
 * This branch is used only for owner acceptance behind Vercel Deployment Protection.
 * The Supabase login/session gate is intentionally removed so the owner can exercise
 * the real admin workflow directly. Audited writes still bind to a real active
 * platform_admin profile, preserving database foreign-key and audit integrity.
 * Production is untouched unless this branch is explicitly merged and deployed.
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  try {
    const service = createSupabaseServiceClient();
    const { data } = await service
      .from('admin_profiles')
      .select('id,email,full_name,role')
      .eq('status', 'active')
      .eq('role', 'platform_admin')
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!data) return null;

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
  if (!admin) redirect('/score/admin/login');

  if (allowedRoles && !allowedRoles.includes(admin.role)) {
    redirect('/score/admin/login?error=forbidden');
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
