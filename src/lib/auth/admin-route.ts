import {
  createSupabaseAnonServerClient,
  createSupabaseServiceClient
} from '@/lib/supabase/server';
import { getAdminAccessTokenFromCookies } from '@/lib/auth/session-cookies';
import type { AdminRole } from '@/lib/types/domain';

export type AdminSession = {
  id: string;
  email: string;
  fullName: string | null;
  role: AdminRole;
};

const RUNTIME_READ_ONLY_ADMIN: AdminSession = {
  id: 'runtime-read-only',
  email: 'readiness-console@mkfraud.co.za',
  fullName: 'MK Readiness Console',
  role: 'read_only_admin'
};

const ADMIN_ROLE_PRIORITY: AdminRole[] = [
  'platform_admin',
  'approver',
  'reviewer',
  'finance_admin',
  'read_only_admin'
];

/**
 * The readiness admin console currently has no application-level login wall.
 *
 * When the configured Supabase environment contains an active persisted admin profile we bind
 * the console to that real actor, preferring roles that can perform report operations. This keeps
 * audit/FK-backed writes tied to a real administrator without cookies or session state.
 *
 * Read-only console rendering must not 500 merely because a preview environment has not yet been
 * provisioned with an admin profile (or its service binding is temporarily unavailable), so the
 * UI falls back to a deliberately read-only runtime identity. Mutation routes still enforce their
 * own permitted roles and therefore cannot treat this fallback identity as an authorised writer.
 */
export async function getAdminSession(): Promise<AdminSession> {
  try {
    const service = createSupabaseServiceClient();
    const { data, error } = await service
      .from('admin_profiles')
      .select('id,email,full_name,role')
      .eq('status', 'active')
      .in('role', ADMIN_ROLE_PRIORITY);

    if (error) {
      console.warn('readiness_admin_runtime_binding_failed', { reason: error.message });
      return RUNTIME_READ_ONLY_ADMIN;
    }

    const profiles = (data ?? []) as Array<{
      id: string;
      email: string;
      full_name: string | null;
      role: AdminRole;
    }>;
    const selected = ADMIN_ROLE_PRIORITY
      .map((role) => profiles.find((profile) => profile.role === role))
      .find(Boolean);

    if (!selected) {
      console.warn('readiness_admin_runtime_binding_missing_profile');
      return RUNTIME_READ_ONLY_ADMIN;
    }

    return {
      id: selected.id,
      email: selected.email,
      fullName: selected.full_name,
      role: selected.role
    };
  } catch (error) {
    console.warn('readiness_admin_runtime_binding_unavailable', {
      reason: error instanceof Error ? error.message : 'unknown'
    });
    return RUNTIME_READ_ONLY_ADMIN;
  }
}

export async function requireAdmin(allowedRoles?: AdminRole[]): Promise<AdminSession> {
  const admin = await getAdminSession();

  if (allowedRoles && !allowedRoles.includes(admin.role)) {
    throw new Error('The active readiness-console role is not allowed to access this route.');
  }

  return admin;
}

/**
 * Strict authentication for newly introduced mutation/download surfaces.
 *
 * The accepted legacy console adapter can still bind to the deployment-protected runtime
 * identity, but a direct assessment report must be attributable to an actual Supabase Auth
 * session. Resolve the user with the anon client, then bind that user to an active persisted
 * admin profile through the service client. No fallback identity is permitted here.
 */
export async function getAuthenticatedAdminSession(): Promise<AdminSession | null> {
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
      .in('role', ADMIN_ROLE_PRIORITY)
      .maybeSingle();

    if (profileError || !profile) return null;
    return {
      id: profile.id,
      email: profile.email,
      fullName: profile.full_name,
      role: profile.role as AdminRole
    };
  } catch (error) {
    console.warn('readiness_admin_authenticated_binding_failed', {
      reason: error instanceof Error ? error.message : 'unknown'
    });
    return null;
  }
}

export async function requireAuthenticatedAdmin(allowedRoles?: AdminRole[]): Promise<AdminSession> {
  const admin = await getAuthenticatedAdminSession();
  if (!admin) throw new Error('A current authenticated administrator session is required.');
  if (allowedRoles && !allowedRoles.includes(admin.role)) {
    throw new Error('The authenticated administrator role is not allowed to access this route.');
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
