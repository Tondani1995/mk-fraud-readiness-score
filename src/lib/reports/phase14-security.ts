import { getAdminAccessTokenFromCookies } from '@/lib/auth/session-cookies';
import { createSupabaseAuthenticatedServerClient } from '@/lib/supabase/server';

export type Phase14Action =
  | 'report_generation'
  | 'report_regeneration'
  | 'report_download'
  | 'email_delivery'
  | 'email_resend'
  | 'provider_reconciliation'
  | 'ai_narrative_generation';

export class Phase14AuthorizationError extends Error {
  constructor(public readonly reason: string, message = reason) {
    super(message);
    this.name = 'Phase14AuthorizationError';
  }
}

export function createPhase14PrivilegedClient() {
  const accessToken = getAdminAccessTokenFromCookies();
  if (!accessToken) {
    throw new Phase14AuthorizationError('phase14_no_session', 'A current AAL2 administrator session is required.');
  }
  return createSupabaseAuthenticatedServerClient(accessToken) as any;
}

export async function requirePhase14Action(action: Phase14Action) {
  const client = createPhase14PrivilegedClient();
  const { data, error } = await client.rpc('authorize_phase14_action', { p_action: action });
  if (error || !data) {
    const reason = error?.message?.match(/phase14_[a-z0-9_]+/)?.[0] ?? 'phase14_authorization_failed';
    throw new Phase14AuthorizationError(reason, error?.message ?? `Phase 14 action ${action} was not authorised.`);
  }
  return { client, context: data as Record<string, unknown> };
}
