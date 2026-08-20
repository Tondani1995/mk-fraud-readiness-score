import { getAdminAccessTokenFromCookies } from '@/lib/auth/session-cookies';
import { createSupabaseAuthenticatedServerClient } from '@/lib/supabase/server';
import type { AdminRole } from '@/lib/types/domain';

// Release B durable fulfilment: admin-facing quality-review and recovery actions.
// Mirrors the role-check-before-call + privileged-client pattern already used by
// src/lib/backlog-reconciliation/reconciliation-service.ts (Release A) -- the authenticated
// (not service-role) client is used so auth.uid() resolves inside the security definer RPCs
// defined in supabase/migrations/20260724160000_release_b_durable_fulfilment.sql, which
// re-check the actor's role themselves (defence in depth, not only at this layer).

// Roles permitted to approve/reject quality review (matches approve_quality_review()/
// reject_quality_review()'s internal check).
export const FULFILMENT_QUALITY_REVIEW_ROLES: AdminRole[] = ['platform_admin', 'reviewer', 'approver'];

// Roles permitted to retry/recover a fulfilment job (matches retry_fulfilment_job()/
// recover_fulfilment_job()'s internal check -- the same set canManageFinance() already uses).
export const FULFILMENT_RECOVERY_ROLES: AdminRole[] = ['platform_admin', 'finance_admin'];

export type FulfilmentAttempt = {
  id: string;
  orderId: string;
  status: string;
  retryCount: number;
  maxAttempts: number;
  nextAttemptAt: string | null;
  leaseOwner: string | null;
  leaseExpiresAt: string | null;
  errorCategory: string | null;
  safeOperationalError: string | null;
  technicalReference: string | null;
  outputReportId: string | null;
  qualityReviewedBy: string | null;
  qualityReviewedAt: string | null;
  qualityReviewDecision: string | null;
  qualityReviewReason: string | null;
  regeneratedFromAttemptId: string | null;
  deliveryQueuedAt: string | null;
  requestedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
};

export type FulfilmentServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; reason: string };

function privilegedClient() {
  const accessToken = getAdminAccessTokenFromCookies();
  if (!accessToken) return null;
  return createSupabaseAuthenticatedServerClient(accessToken) as any;
}

function mapAttempt(row: Record<string, unknown>): FulfilmentAttempt {
  return {
    id: String(row.id),
    orderId: String(row.order_id),
    status: String(row.status ?? ''),
    retryCount: Number(row.retry_count ?? 0),
    maxAttempts: Number(row.max_attempts ?? 5),
    nextAttemptAt: (row.next_attempt_at as string | null) ?? null,
    leaseOwner: (row.lease_owner as string | null) ?? null,
    leaseExpiresAt: (row.lease_expires_at as string | null) ?? null,
    errorCategory: (row.error_category as string | null) ?? null,
    safeOperationalError: (row.safe_operational_error as string | null) ?? null,
    technicalReference: (row.technical_reference as string | null) ?? null,
    outputReportId: (row.output_report_id as string | null) ?? null,
    qualityReviewedBy: (row.quality_reviewed_by as string | null) ?? null,
    qualityReviewedAt: (row.quality_reviewed_at as string | null) ?? null,
    qualityReviewDecision: (row.quality_review_decision as string | null) ?? null,
    qualityReviewReason: (row.quality_review_reason as string | null) ?? null,
    regeneratedFromAttemptId: (row.regenerated_from_attempt_id as string | null) ?? null,
    deliveryQueuedAt: (row.delivery_queued_at as string | null) ?? null,
    requestedAt: (row.requested_at as string | null) ?? null,
    startedAt: (row.started_at as string | null) ?? null,
    completedAt: (row.completed_at as string | null) ?? null
  };
}

function mapError(error: { message?: string } | null): { message: string; reason: string } {
  const text = String(error?.message ?? '');
  if (text.includes('fulfilment_quality_review_no_session') || text.includes('fulfilment_retry_no_session') || text.includes('fulfilment_recover_no_session')) {
    return { reason: 'no_session', message: 'Your admin session has expired. Sign in again.' };
  }
  if (text.includes('fulfilment_quality_review_role_forbidden')) {
    return { reason: 'forbidden', message: 'You are not authorised to review report quality.' };
  }
  if (text.includes('fulfilment_retry_role_forbidden') || text.includes('fulfilment_recover_role_forbidden')) {
    return { reason: 'forbidden', message: 'You are not authorised to manage fulfilment recovery.' };
  }
  if (text.includes('fulfilment_quality_review_reason_too_short')) {
    return { reason: 'reason_too_short', message: 'A reason of at least 5 characters is required.' };
  }
  if (text.includes('fulfilment_quality_review_invalid_state')) {
    return { reason: 'invalid_state', message: 'This report is not currently awaiting quality review.' };
  }
  if (text.includes('fulfilment_retry_invalid_state')) {
    return { reason: 'invalid_state', message: 'This job is not in a state that can be retried.' };
  }
  if (text.includes('fulfilment_recover_invalid_state')) {
    return { reason: 'invalid_state', message: 'This job is not currently generating, so there is nothing to recover.' };
  }
  return { reason: 'query_failed', message: 'The action could not be completed. Try again.' };
}

export async function approveQualityReview(attemptId: string, reason: string): Promise<FulfilmentServiceResult<FulfilmentAttempt>> {
  const note = reason?.trim() ?? '';
  if (note.length < 5) return { ok: false, reason: 'reason_too_short', message: 'A reason of at least 5 characters is required.' };
  const client = privilegedClient();
  if (!client) return { ok: false, reason: 'no_session', message: 'Your admin session has expired. Sign in again.' };
  const { data, error } = await client.rpc('approve_quality_review', { p_attempt_id: attemptId, p_reason: note });
  if (error || !data) { const mapped = mapError(error); return { ok: false, reason: mapped.reason, message: mapped.message }; }
  const payload = data as Record<string, unknown>;
  if (payload.delivery_exception === 'recipient_required') {
    // Fire-and-forget: an alert failure must never fail the approval itself, which already
    // committed. See recordDeliveryRecipientRequiredAlert() for the dedupe-by-order-id discipline
    // that keeps this from becoming an alert loop.
    const { recordDeliveryRecipientRequiredAlert } = await import('@/lib/notifications/phase1-order-notifications');
    recordDeliveryRecipientRequiredAlert({
      orderId: String(payload.order_id ?? ''),
      reportId: (payload.output_report_id as string | null) ?? null
    }).catch((alertError: unknown) => {
      console.error('delivery_recipient_required_alert_failed', {
        attemptId, message: alertError instanceof Error ? alertError.message : String(alertError)
      });
    });
  }
  return { ok: true, data: mapAttempt(payload) };
}

export async function rejectQualityReview(attemptId: string, reason: string): Promise<FulfilmentServiceResult<{ rejected: FulfilmentAttempt; regenerated: FulfilmentAttempt }>> {
  const note = reason?.trim() ?? '';
  if (note.length < 5) return { ok: false, reason: 'reason_too_short', message: 'A reason of at least 5 characters is required.' };
  const client = privilegedClient();
  if (!client) return { ok: false, reason: 'no_session', message: 'Your admin session has expired. Sign in again.' };
  const { data, error } = await client.rpc('reject_quality_review', { p_attempt_id: attemptId, p_reason: note });
  if (error || !data) { const mapped = mapError(error); return { ok: false, reason: mapped.reason, message: mapped.message }; }
  const payload = data as Record<string, unknown>;
  return {
    ok: true,
    data: {
      rejected: mapAttempt(payload.rejected_attempt as Record<string, unknown>),
      regenerated: mapAttempt(payload.regenerated_attempt as Record<string, unknown>)
    }
  };
}

export async function retryFulfilmentJob(attemptId: string): Promise<FulfilmentServiceResult<FulfilmentAttempt>> {
  const client = privilegedClient();
  if (!client) return { ok: false, reason: 'no_session', message: 'Your admin session has expired. Sign in again.' };
  const { data, error } = await client.rpc('retry_fulfilment_job', { p_attempt_id: attemptId });
  if (error || !data) { const mapped = mapError(error); return { ok: false, reason: mapped.reason, message: mapped.message }; }
  return { ok: true, data: mapAttempt(data as Record<string, unknown>) };
}

export async function recoverFulfilmentJob(attemptId: string): Promise<FulfilmentServiceResult<FulfilmentAttempt>> {
  const client = privilegedClient();
  if (!client) return { ok: false, reason: 'no_session', message: 'Your admin session has expired. Sign in again.' };
  const { data, error } = await client.rpc('recover_fulfilment_job', { p_attempt_id: attemptId });
  if (error || !data) { const mapped = mapError(error); return { ok: false, reason: mapped.reason, message: mapped.message }; }
  return { ok: true, data: mapAttempt(data as Record<string, unknown>) };
}
