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

/**
 * Non-production operator access.
 *
 * Staging sits behind Vercel Deployment Protection, which the owner has accepted
 * as sufficient for that environment, so requiring a Supabase admin login and MFA
 * on top of it only blocks fulfilment testing. This returns a synthetic operator
 * session so the normal admin routes are usable there.
 *
 * Deliberately double-guarded and opt-in: it refuses outright when VERCEL_ENV is
 * production, and otherwise does nothing unless MK_NON_PRODUCTION_ADMIN_ACCESS is
 * explicitly set. It is generic to the environment — no user, email, role or
 * order carve-outs — and the real authentication path below is untouched, so
 * production behaviour is unchanged.
 */
async function nonProductionAdminSession(): Promise<AdminSession | null> {
  if (process.env.VERCEL_ENV === 'production') return null;
  if (process.env.NODE_ENV === 'production' && process.env.VERCEL_ENV !== 'preview') return null;
  if (process.env.MK_NON_PRODUCTION_ADMIN_ACCESS !== 'enabled') return null;
  // Bind to a real active admin profile rather than inventing an identity. Every
  // audited write records the acting admin, and a synthetic id fails that
  // foreign key — which is what made payment confirmation return "the order
  // requires review". Selection is deterministic and environment-generic: the
  // lowest id among active profiles, with no email, user or order carve-out.
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
    return { id: data.id, email: data.email, fullName: data.full_name, role: data.role as AdminRole };
  } catch {
    return null;
  }
}

export async function getAdminSession(): Promise<AdminSession | null> {
  const nonProduction = await nonProductionAdminSession();
  if (nonProduction) return nonProduction;

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
