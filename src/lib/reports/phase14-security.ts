import { getAdminAccessTokenFromCookies } from '@/lib/auth/session-cookies';
import {
  createSupabaseAuthenticatedServerClient,
  createSupabaseServiceClient
} from '@/lib/supabase/server';
import { createWorkerAttestation } from './worker-attestation';

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
  expiresAt: string;
  authorityEpoch: number;
  expectedStep: string;
  orderId: string | null;
  assessmentId: string | null;
  scoreRunId: string | null;
  fulfilmentId: string | null;
  reportId: string | null;
  recipient: string | null;
};

export type Phase14WorkerLease = {
  capabilityId: string;
  capabilityType: Phase14WorkerCapabilityType;
  operationKey: string;
  executionId: string;
  leaseGeneration: number;
  leaseExpiresAt: string;
  authorityEpoch: number;
  expectedStep: string;
  orderId: string | null;
  assessmentId: string | null;
  scoreRunId: string | null;
  fulfilmentId: string | null;
  reportId: string | null;
  recipient: string | null;
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
  if (!row.capability_id || !row.capability_type || !row.operation_key) {
    throw new Phase14AuthorizationError(
      'phase14_worker_capability_response_invalid',
      'The worker capability response was incomplete.'
    );
  }
  const { data: durable, error: durableError } = await client
    .from('phase14_worker_capabilities')
    .select('authority_epoch,expected_step')
    .eq('id', String(row.capability_id))
    .single();
  if (durableError || !durable) authorizationFailure(durableError, 'phase14_worker_capability_response_invalid');
  return {
    capabilityId: String(row.capability_id),
    capabilityType: row.capability_type as Phase14WorkerCapabilityType,
    operationKey: String(row.operation_key),
    expiresAt: String(row.expires_at),
    authorityEpoch: Number(durable.authority_epoch),
    expectedStep: String(durable.expected_step),
    orderId: input.orderId ?? null,
    assessmentId: input.assessmentId ?? null,
    scoreRunId: input.scoreRunId ?? null,
    fulfilmentId: input.fulfilmentId ?? null,
    reportId: input.reportId ?? null,
    recipient: input.recipient?.trim().toLowerCase() ?? null
  };
}

export async function claimPhase14WorkerCapability(
  authorization: Phase14WorkerAuthorization,
  executionId = authorization.operationKey
): Promise<Phase14WorkerLease> {
  const client = createSupabaseServiceClient() as any;
  const provisional: Phase14WorkerLease = {
    capabilityId: authorization.capabilityId,
    capabilityType: authorization.capabilityType,
    operationKey: authorization.operationKey,
    executionId,
    leaseGeneration: 0,
    leaseExpiresAt: authorization.expiresAt,
    authorityEpoch: authorization.authorityEpoch,
    expectedStep: 'claim',
    orderId: authorization.orderId,
    assessmentId: authorization.assessmentId,
    scoreRunId: authorization.scoreRunId,
    fulfilmentId: authorization.fulfilmentId,
    reportId: authorization.reportId,
    recipient: authorization.recipient
  };
  const signed = createWorkerAttestation({
    lease: provisional,
    action: 'claim_phase14_worker_operation',
    payload: {}
  });
  const { data, error } = await client.rpc('execute_phase14_worker_step', {
    p_attestation: signed.attestation,
    p_signature: signed.signature,
    p_request_payload: signed.requestPayload
  });
  if (error || !data) authorizationFailure(error, 'phase14_worker_capability_claim_failed');
  const row = data as Record<string, any>;
  if (row.capability_id !== authorization.capabilityId || !row.result?.execution_id) {
    throw new Phase14AuthorizationError(
      'phase14_worker_capability_lease_invalid',
      'The worker capability lease response was invalid.'
    );
  }
  return {
    capabilityId: String(row.capability_id),
    capabilityType: row.capability_type as Phase14WorkerCapabilityType,
    operationKey: String(row.operation_key),
    executionId: String(row.result.execution_id),
    leaseGeneration: Number(row.lease_generation),
    leaseExpiresAt: String(row.lease_expires_at),
    authorityEpoch: Number(row.authority_epoch),
    expectedStep: String(row.expected_step),
    orderId: authorization.orderId,
    assessmentId: authorization.assessmentId,
    scoreRunId: authorization.scoreRunId,
    fulfilmentId: authorization.fulfilmentId,
    reportId: authorization.reportId,
    recipient: authorization.recipient
  };
}

export async function loadPhase14WorkerAuthorization(
  capabilityId: string
): Promise<Phase14WorkerAuthorization> {
  const client = createSupabaseServiceClient() as any;
  const { data, error } = await client.rpc('get_phase14_worker_attestation_context', {
    p_capability_id: capabilityId
  });
  if (error || !data) authorizationFailure(error, 'phase14_worker_capability_context_unavailable');
  const row = data as Record<string, any>;
  return {
    capabilityId: String(row.capability_id),
    capabilityType: row.capability_type as Phase14WorkerCapabilityType,
    operationKey: String(row.operation_key),
    expiresAt: String(row.expires_at),
    authorityEpoch: Number(row.authority_epoch),
    expectedStep: String(row.expected_step),
    orderId: row.order_id ?? null,
    assessmentId: row.assessment_id ?? null,
    scoreRunId: row.score_run_id ?? null,
    fulfilmentId: row.fulfilment_id ?? null,
    reportId: row.report_id ?? null,
    recipient: row.recipient ?? null
  };
}

export async function loadPhase14WorkerLease(capabilityId: string): Promise<Phase14WorkerLease> {
  const client = createSupabaseServiceClient() as any;
  const { data, error } = await client.rpc('get_phase14_worker_attestation_context', {
    p_capability_id: capabilityId
  });
  if (error || !data) authorizationFailure(error, 'phase14_worker_capability_context_unavailable');
  const row = data as Record<string, any>;
  if (!row.lease_expires_at || row.expected_step === 'claim') {
    throw new Phase14AuthorizationError('phase14_worker_capability_not_leased');
  }
  return {
    capabilityId: String(row.capability_id),
    capabilityType: row.capability_type as Phase14WorkerCapabilityType,
    operationKey: String(row.operation_key),
    executionId: String(row.execution_id),
    leaseGeneration: Number(row.lease_generation),
    leaseExpiresAt: String(row.lease_expires_at),
    authorityEpoch: Number(row.authority_epoch),
    expectedStep: String(row.expected_step),
    orderId: row.order_id ?? null,
    assessmentId: row.assessment_id ?? null,
    scoreRunId: row.score_run_id ?? null,
    fulfilmentId: row.fulfilment_id ?? null,
    reportId: row.report_id ?? null,
    recipient: row.recipient ?? null
  };
}

export async function executePhase14WorkerStep<T = unknown>(
  lease: Phase14WorkerLease,
  action: string,
  payload: Record<string, unknown>,
  options?: { terminalGeneration?: boolean; reportId?: string | null; recipient?: string | null }
): Promise<T> {
  const client = createSupabaseServiceClient() as any;
  const signed = createWorkerAttestation({
    lease,
    action,
    payload,
    reportId: options?.reportId,
    recipient: options?.recipient
  });
  const rpcName = options?.terminalGeneration
    ? 'terminal_phase14_generation_publication'
    : 'execute_phase14_worker_step';
  const { data, error } = await client.rpc(rpcName, {
    p_attestation: signed.attestation,
    p_signature: signed.signature,
    p_request_payload: signed.requestPayload
  });
  if (error || !data) authorizationFailure(error, `phase14_worker_${action}_failed`);
  const row = data as Record<string, any>;
  if (options?.terminalGeneration) {
    lease.leaseGeneration = Number(row.lease_generation);
    lease.expectedStep = String(row.expected_step);
    lease.leaseExpiresAt = '';
    return row as T;
  }
  lease.leaseGeneration = Number(row.lease_generation);
  lease.expectedStep = String(row.expected_step);
  lease.leaseExpiresAt = String(row.lease_expires_at ?? lease.leaseExpiresAt);
  return row.result as T;
}

export async function requirePhase14WorkerAction(
  lease: Phase14WorkerLease,
  action: Phase14Action
) {
  const client = createSupabaseServiceClient() as any;
  const context = action === 'ai_narrative_generation'
    ? await executePhase14WorkerStep<Record<string, unknown>>(lease, 'authorize_phase14_worker_action', {
        action
      })
    : { capability_id: lease.capabilityId, action };
  return { client, context };
}

export async function completePhase14WorkerCapability(lease: Phase14WorkerLease) {
  if (lease.expectedStep !== 'consumed') {
    throw new Phase14AuthorizationError(
      'phase14_worker_capability_not_terminal',
      'The worker capability can only complete as part of its terminal business transition.'
    );
  }
}
