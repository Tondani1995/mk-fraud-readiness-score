import { getAdminAccessTokenFromCookies } from '@/lib/auth/session-cookies';
import {
  createSupabaseAuthenticatedServerClient,
  createSupabaseServiceClient
} from '@/lib/supabase/server';

export type Phase14Action =
  | 'report_generation'
  | 'report_regeneration'
  | 'report_download'
  | 'email_delivery'
  | 'email_resend'
  | 'provider_reconciliation'
  | 'ai_narrative_generation';

export type Phase14WorkerCapabilityType =
  | 'automatic_generation'
  | 'automatic_delivery'
  | 'generation_recovery'
  | 'delivery_reconciliation'
  | 'storage_cleanup';

export type Phase14WorkerAuthorization = {
  capabilityId: string;
  capabilityType: Phase14WorkerCapabilityType;
  operationKey: string;
  issueSecret: string;
  expiresAt: string;
};

export type Phase14WorkerLease = {
  capabilityId: string;
  capabilityType: Phase14WorkerCapabilityType;
  operationKey: string;
  leaseToken: string;
  leaseExpiresAt: string;
};

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

function authorizationFailure(error: any, fallback: string): never {
  const reason = error?.message?.match(/phase14_[a-z0-9_]+/)?.[0] ?? fallback;
  throw new Phase14AuthorizationError(reason, error?.message ?? fallback);
}

export async function authorizePhase14WorkerOperation(input: {
  capabilityType: Phase14WorkerCapabilityType;
  operationKey: string;
  orderId?: string | null;
  assessmentId?: string | null;
  scoreRunId?: string | null;
  fulfilmentId?: string | null;
  reportId?: string | null;
  recipient?: string | null;
  expiresInSeconds?: number;
  reason: string;
}): Promise<Phase14WorkerAuthorization> {
  const client = createPhase14PrivilegedClient();
  const { data, error } = await client.rpc('authorize_phase14_worker_operation', {
    p_capability_type: input.capabilityType,
    p_operation_key: input.operationKey,
    p_order_id: input.orderId ?? null,
    p_assessment_id: input.assessmentId ?? null,
    p_score_run_id: input.scoreRunId ?? null,
    p_fulfilment_id: input.fulfilmentId ?? null,
    p_report_id: input.reportId ?? null,
    p_recipient: input.recipient ?? null,
    p_expires_in_seconds: input.expiresInSeconds ?? 21_600,
    p_reason: input.reason
  });
  if (error || !data) authorizationFailure(error, 'phase14_worker_capability_authorization_failed');
  const row = data as Record<string, unknown>;
  if (!row.capability_id || !row.issue_secret || !row.capability_type || !row.operation_key) {
    throw new Phase14AuthorizationError(
      'phase14_worker_capability_response_invalid',
      'The worker capability response was incomplete.'
    );
  }
  return {
    capabilityId: String(row.capability_id),
    capabilityType: row.capability_type as Phase14WorkerCapabilityType,
    operationKey: String(row.operation_key),
    issueSecret: String(row.issue_secret),
    expiresAt: String(row.expires_at)
  };
}

export async function claimPhase14WorkerCapability(
  authorization: Phase14WorkerAuthorization
): Promise<Phase14WorkerLease> {
  const client = createSupabaseServiceClient() as any;
  const { data, error } = await client.rpc('claim_phase14_worker_capability', {
    p_capability_id: authorization.capabilityId,
    p_issue_secret: authorization.issueSecret
  });
  if (error || !data) authorizationFailure(error, 'phase14_worker_capability_claim_failed');
  const row = data as Record<string, unknown>;
  if (!row.lease_token || row.capability_id !== authorization.capabilityId) {
    throw new Phase14AuthorizationError(
      'phase14_worker_capability_lease_invalid',
      'The worker capability lease response was invalid.'
    );
  }
  return {
    capabilityId: String(row.capability_id),
    capabilityType: row.capability_type as Phase14WorkerCapabilityType,
    operationKey: String(row.operation_key),
    leaseToken: String(row.lease_token),
    leaseExpiresAt: String(row.lease_expires_at)
  };
}

export async function requirePhase14WorkerAction(
  lease: Phase14WorkerLease,
  action: Phase14Action
) {
  const client = createSupabaseServiceClient() as any;
  const { data, error } = await client.rpc('authorize_phase14_worker_action', {
    p_capability_id: lease.capabilityId,
    p_lease_token: lease.leaseToken,
    p_action: action
  });
  if (error || !data) authorizationFailure(error, 'phase14_worker_action_failed');
  return { client, context: data as Record<string, unknown> };
}

export async function completePhase14WorkerCapability(lease: Phase14WorkerLease) {
  const client = createSupabaseServiceClient() as any;
  const { data, error } = await client.rpc('complete_phase14_worker_capability', {
    p_capability_id: lease.capabilityId,
    p_lease_token: lease.leaseToken
  });
  if (error || data !== true) authorizationFailure(error, 'phase14_worker_capability_completion_failed');
}
