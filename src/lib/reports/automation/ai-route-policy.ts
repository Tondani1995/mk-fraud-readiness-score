import { createSupabaseServiceClient } from '@/lib/supabase/server';

export interface AiRouteAuthorizationDecision {
  allowed: boolean;
  reason?: string;
  [key: string]: unknown;
}

function currentSupabaseProject(): string {
  const configured = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? '';
  return configured.match(/^https?:\/\/([a-z0-9]+)\.supabase\.co/i)?.[1]?.toLowerCase() ?? '';
}

function currentPullRequest(): string {
  return (process.env.MK_RELEASE_PR_NUMBER
    ?? process.env.GITHUB_PR_NUMBER
    ?? process.env.VERCEL_GIT_COMMIT_REF?.match(/(?:pull|pr)[/-]?(\d+)/i)?.[1]
    ?? '').trim();
}

function currentHeadSha(): string {
  return (process.env.MK_RELEASE_HEAD_SHA
    ?? process.env.VERCEL_GIT_COMMIT_SHA
    ?? process.env.GITHUB_SHA
    ?? '').trim().toLowerCase();
}

export async function authorizePremiumReportAiRoute(input: {
  provider: string;
  model: string;
  db?: any;
}): Promise<AiRouteAuthorizationDecision> {
  const db = input.db ?? createSupabaseServiceClient() as any;
  const { data, error } = await db.rpc('authorize_phase14_ai_route', {
    p_provider: input.provider,
    p_model: input.model,
    p_environment: process.env.VERCEL_ENV ?? '',
    p_supabase_project: currentSupabaseProject(),
    p_pr_number: currentPullRequest(),
    p_head_sha: currentHeadSha()
  });
  if (error || !data || typeof data !== 'object') {
    console.error('premium_report_ai_route_authorization_unavailable', {
      error: error?.message ?? 'missing_decision'
    });
    return { allowed: false, reason: 'ai_route_authorization_unavailable' };
  }
  const decision = data as AiRouteAuthorizationDecision;
  return decision.allowed === true
    ? decision
    : { allowed: false, reason: typeof decision.reason === 'string' ? decision.reason : 'ai_route_denied' };
}
