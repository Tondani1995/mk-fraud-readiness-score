import { redirect } from 'next/navigation';
import { createSupabaseAnonServerClient, createSupabaseServiceClient } from '@/lib/supabase/server';
import { getAdminAccessTokenFromCookies } from '@/lib/auth/session-cookies';
import type { AdminRole } from '@/lib/types/domain';

export type AdminSession = {
  id: string;
  email: string;
  fullName: string | null;
  role: AdminRole;
};

export async function getAdminSession(): Promise<AdminSession | null> {
  const accessToken = getAdminAccessTokenFromCookies();
  if (!accessToken) return null;

  try {
    const anon = createSupabaseAnonServerClient();
    const { data: userData, error: userError } = await anon.auth.getUser(accessToken);
    if (userError || !userData.user) return null;

    const service = createSupabaseServiceClient();
    const { data: profile, error: profileError } = await service
      .from('admin_profiles')
      .select('id,email,full_name,role,status')
      .eq('id', userData.user.id)
      .eq('status', 'active')
      .maybeSingle();

    if (profileError || !profile) return null;

    return {
      id: profile.id,
      email: profile.email,
      fullName: profile.full_name,
      role: profile.role as AdminRole
    };
  } catch {
    return null;
  }
}

export async function requireAdmin(allowedRoles?: AdminRole[]): Promise<AdminSession> {
  const admin = await getAdminSession();
  if (!admin) redirect('/admin/login');

  if (allowedRoles && !allowedRoles.includes(admin.role)) {
    redirect('/admin/login?error=forbidden');
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
