import { getAdminAccessTokenFromCookies } from '@/lib/auth/session-cookies';
import { createSupabaseAuthenticatedServerClient, createSupabaseServiceClient } from '@/lib/supabase/server';
import { getNumberEnv } from '@/lib/env/server';
import { sendEmail } from '@/lib/notifications/email-provider';
import { buildReportReadyMessage } from '@/lib/notifications/message-templates';
import type { AdminRole } from '@/lib/types/domain';
import { classifyDeliveryBucket } from './phase1-operations';

// Release C admin recovery for the real delivery/access-token layer (docs/safe-launch/
// 15-email-and-secure-delivery-design.md, "Admin recovery"). Mirrors
// src/lib/fulfilment/fulfilment-service.ts's role-check-before-call + privileged-(authenticated,
// not service-role)-client pattern exactly, so auth.uid() resolves inside retry_delivery()/
// revoke_customer_report_access_token()/reissue_customer_report_access_token() (all security
// definer, all re-check the actor's role themselves -- defence in depth, not only at this layer).

// Matches retry_delivery()'s internal role check.
export const DELIVERY_RETRY_ROLES: AdminRole[] = ['platform_admin', 'finance_admin'];
// Matches revoke_customer_report_access_token()/reissue_customer_report_access_token()'s
// internal role check (the same set Release B's quality-review roles use).
export const ACCESS_TOKEN_ROLES: AdminRole[] = ['platform_admin', 'reviewer', 'approver'];

export type DeliveryAuthorization = {
  id: string;
  reportId: string;
  recipientEmail: string;
  status: string;
  retryCount: number;
  maxAttempts: number;
  nextAttemptAt: string | null;
  providerMessageId: string | null;
  revokedReason: string | null;
  authorisedAt: string;
  finalizedAt: string | null;
};

export type CustomerAccessToken = {
  id: string;
  reportId: string;
  recipientEmail: string;
  issuedAt: string;
  expiresAt: string;
  revokedAt: string | null;
  revokedReason: string | null;
  lastAccessedAt: string | null;
  accessCount: number;
};

export type DeliveryRecoveryServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; reason: string; message: string };

function privilegedClient() {
  const accessToken = getAdminAccessTokenFromCookies();
  if (!accessToken) return null;
  return createSupabaseAuthenticatedServerClient(accessToken) as any;
}

function mapAuthorization(row: Record<string, unknown>): DeliveryAuthorization {
  // Same override as annotateOrdersWithPhase1State() in phase1-operations.ts (the admin orders
  // list/queue page) -- a bounce/complaint only ever updates the linked email_events row, never
  // report_delivery_authorizations.status itself, so without this the order-detail page's own
  // delivery card would keep showing "finalized" after a bounce while the queue list correctly
  // shows the order needs attention. Kept in lockstep with that function deliberately: list and
  // detail-page delivery truth must agree.
  const emailOutcome = (row.email_events as { status?: string } | null)?.status;
  const status = emailOutcome === 'bounced' || emailOutcome === 'complained' ? emailOutcome : String(row.status ?? '');
  return {
    id: String(row.id),
    reportId: String(row.report_id),
    recipientEmail: String(row.recipient_email ?? ''),
    status,
    retryCount: Number(row.retry_count ?? 0),
    maxAttempts: Number(row.max_attempts ?? 5),
    nextAttemptAt: (row.next_attempt_at as string | null) ?? null,
    providerMessageId: (row.provider_message_id as string | null) ?? null,
    revokedReason: (row.revoked_reason as string | null) ?? null,
    authorisedAt: String(row.authorised_at ?? ''),
    finalizedAt: (row.finalized_at as string | null) ?? null
  };
}

function mapToken(row: Record<string, unknown>): CustomerAccessToken {
  return {
    id: String(row.id),
    reportId: String(row.report_id),
    recipientEmail: String(row.recipient_email ?? ''),
    issuedAt: String(row.issued_at ?? ''),
    expiresAt: String(row.expires_at ?? ''),
    revokedAt: (row.revoked_at as string | null) ?? null,
    revokedReason: (row.revoked_reason as string | null) ?? null,
    lastAccessedAt: (row.last_accessed_at as string | null) ?? null,
    accessCount: Number(row.access_count ?? 0)
  };
}

function mapError(error: { message?: string } | null): { reason: string; message: string } {
  const text = String(error?.message ?? '');
  if (text.includes('delivery_retry_no_session') || text.includes('access_token_no_session') || text.includes('delivery_recipient_correction_no_session')) {
    return { reason: 'no_session', message: 'Your admin session has expired. Sign in again.' };
  }
  if (text.includes('delivery_retry_role_forbidden')) {
    return { reason: 'forbidden', message: 'You are not authorised to retry report delivery.' };
  }
  if (text.includes('access_token_role_forbidden') || text.includes('delivery_recipient_correction_role_forbidden')) {
    return { reason: 'forbidden', message: 'You are not authorised to manage customer report access links.' };
  }
  if (text.includes('delivery_retry_invalid_state')) {
    return { reason: 'invalid_state', message: 'This delivery is not in a state that can be retried.' };
  }
  if (text.includes('access_token_reason_too_short') || text.includes('delivery_recipient_correction_reason_too_short')) {
    return { reason: 'reason_too_short', message: 'A reason of at least 5 characters is required.' };
  }
  if (text.includes('access_token_already_revoked')) {
    return { reason: 'already_revoked', message: 'This access link has already been revoked.' };
  }
  if (text.includes('access_token_ttl_out_of_range')) {
    return { reason: 'ttl_out_of_range', message: 'The access link lifetime is out of the allowed range.' };
  }
  if (text.includes('access_token_report_order_mismatch')) {
    return { reason: 'report_order_mismatch', message: 'This report does not belong to this order.' };
  }
  if (text.includes('access_token_reissue_blocked_prior_bounced')) {
    return { reason: 'blocked_prior_bounced', message: 'This address previously bounced permanently. Confirm the address is correct, then override to resend.' };
  }
  if (text.includes('access_token_reissue_blocked_prior_complained')) {
    return { reason: 'blocked_prior_complained', message: 'This recipient previously marked a report-ready email as spam. An explicit override is required before resending.' };
  }
  if (text.includes('delivery_recipient_correction_invalid_email')) {
    return { reason: 'invalid_email', message: 'Enter a valid email address.' };
  }
  if (text.includes('delivery_recipient_correction_order_not_found')) {
    return { reason: 'order_not_found', message: 'Order not found.' };
  }
  if (text.includes('delivery_recipient_correction_no_pending_delivery')) {
    return { reason: 'no_pending_delivery', message: 'There is no released report waiting on a delivery recipient for this order.' };
  }
  if (text.includes('delivery_recipient_correction_already_queued')) {
    return { reason: 'already_queued', message: 'A delivery has already been queued for this report and recipient.' };
  }
  return { reason: 'query_failed', message: 'The action could not be completed. Try again.' };
}

export type RecipientRequiredException = {
  pendingReportId: string;
  pendingReportReference: string;
};

export async function getOrderDeliveryState(orderId: string): Promise<{
  authorizations: DeliveryAuthorization[];
  accessTokens: CustomerAccessToken[];
  recipientException: RecipientRequiredException | null;
  // The authoritative current Release C customer-delivery status/bucket for this order -- the
  // most recent authorization's already bounce/complaint-resolved status (mapAuthorization
  // above), classified via the exact same classifyDeliveryBucket() the admin orders list uses
  // (phase1-operations.ts). This, not manual_report_delivery_attempts, is what the order-detail
  // page's primary fulfilment summary must display, so it can never show "delivered" here while
  // the summary above it says otherwise.
  currentDeliveryStatus: string;
  currentDeliveryBucket: ReturnType<typeof classifyDeliveryBucket>;
}> {
  const db = createSupabaseServiceClient() as any;
  const [authorizationsResult, tokensResult, latestExceptionEventResult] = await Promise.all([
    db.from('report_delivery_authorizations')
      .select('id,report_id,recipient_email,status,retry_count,max_attempts,next_attempt_at,provider_message_id,revoked_reason,authorised_at,finalized_at,email_events(status)')
      .eq('order_id', orderId).order('authorised_at', { ascending: false }),
    db.from('customer_report_access_tokens')
      .select('id,report_id,recipient_email,issued_at,expires_at,revoked_at,revoked_reason,last_accessed_at,access_count')
      .eq('order_id', orderId).order('issued_at', { ascending: false }),
    // The most recent of the two events determines whether the exception is still open --
    // delivery_recipient_corrected always fires strictly after the delivery_recipient_required
    // it resolves (correct_delivery_recipient_and_queue() only succeeds when a pending report
    // actually exists), so "most recent of either type" is an unambiguous resolved/unresolved
    // signal without needing a separate status column.
    db.from('order_events').select('event_type,created_at')
      .eq('order_id', orderId).in('event_type', ['delivery_recipient_required', 'delivery_recipient_corrected'])
      .order('created_at', { ascending: false }).limit(1)
  ]);

  let recipientException: RecipientRequiredException | null = null;
  if (latestExceptionEventResult.data?.[0]?.event_type === 'delivery_recipient_required') {
    const { data: pendingReport } = await db.from('reports')
      .select('id,report_reference')
      .eq('order_id', orderId).eq('status', 'released')
      .order('version_number', { ascending: false }).limit(1).maybeSingle();
    if (pendingReport) {
      recipientException = { pendingReportId: pendingReport.id, pendingReportReference: pendingReport.report_reference };
    }
  }

  const authorizations = (authorizationsResult.data ?? []).map(mapAuthorization);
  const currentDeliveryStatus = authorizations[0]?.status ?? 'NOT_READY';
  const currentDeliveryBucket = classifyDeliveryBucket(currentDeliveryStatus);

  return {
    authorizations,
    accessTokens: (tokensResult.data ?? []).map(mapToken),
    recipientException,
    currentDeliveryStatus,
    currentDeliveryBucket
  };
}

export async function correctDeliveryRecipientAndQueue(input: {
  orderId: string;
  newRecipientEmail: string;
  reason: string;
}): Promise<DeliveryRecoveryServiceResult<DeliveryAuthorization>> {
  const note = input.reason?.trim() ?? '';
  if (note.length < 5) return { ok: false, reason: 'reason_too_short', message: 'A reason of at least 5 characters is required.' };
  const client = privilegedClient();
  if (!client) return { ok: false, reason: 'no_session', message: 'Your admin session has expired. Sign in again.' };
  const { data, error } = await client.rpc('correct_delivery_recipient_and_queue', {
    p_order_id: input.orderId,
    p_new_recipient_email: input.newRecipientEmail,
    p_reason: note
  });
  if (error || !data) { const mapped = mapError(error); return { ok: false, ...mapped }; }
  return { ok: true, data: mapAuthorization(data as Record<string, unknown>) };
}

export async function retryDelivery(authorizationId: string): Promise<DeliveryRecoveryServiceResult<DeliveryAuthorization>> {
  const client = privilegedClient();
  if (!client) return { ok: false, reason: 'no_session', message: 'Your admin session has expired. Sign in again.' };
  const { data, error } = await client.rpc('retry_delivery', { p_authorization_id: authorizationId });
  if (error || !data) { const mapped = mapError(error); return { ok: false, ...mapped }; }
  return { ok: true, data: mapAuthorization(data as Record<string, unknown>) };
}

export async function revokeAccessToken(tokenId: string, reason: string): Promise<DeliveryRecoveryServiceResult<CustomerAccessToken>> {
  const note = reason?.trim() ?? '';
  if (note.length < 5) return { ok: false, reason: 'reason_too_short', message: 'A reason of at least 5 characters is required.' };
  const client = privilegedClient();
  if (!client) return { ok: false, reason: 'no_session', message: 'Your admin session has expired. Sign in again.' };
  const { data, error } = await client.rpc('revoke_customer_report_access_token', { p_token_id: tokenId, p_reason: note });
  if (error || !data) { const mapped = mapError(error); return { ok: false, ...mapped }; }
  return { ok: true, data: mapToken(data as Record<string, unknown>) };
}

// Mints a fresh access token AND resends the report-ready email with it -- there is no separate
// worker phase for the 'report_ready_reissue' email_events row the RPC creates (it is created
// with status='CREATED' and never picked up by claim_next_delivery(), which only claims
// report_delivery_authorizations rows), so this is the only place that row is ever dispatched.
// Mirrors the worker's own send-then-persist-outcome pattern in
// src/app/score/api/internal/fulfilment-worker/route.ts exactly, just without a lease (this
// path has no concurrent claimant to race against -- it's a single admin-triggered action).
export async function reissueAccessToken(input: {
  orderId: string;
  reportId: string;
  orderReference: string;
  recipientEmail: string;
  customerName: string | null;
  reason: string;
  overrideSuppression?: boolean;
}): Promise<DeliveryRecoveryServiceResult<{ token: CustomerAccessToken; emailSent: boolean; emailError: string | null }>> {
  const note = input.reason?.trim() ?? '';
  if (note.length < 5) return { ok: false, reason: 'reason_too_short', message: 'A reason of at least 5 characters is required.' };
  const client = privilegedClient();
  if (!client) return { ok: false, reason: 'no_session', message: 'Your admin session has expired. Sign in again.' };

  const ttlSeconds = getNumberEnv('CUSTOMER_REPORT_ACCESS_TOKEN_TTL_SECONDS', 7 * 24 * 60 * 60);
  const { data, error } = await client.rpc('reissue_customer_report_access_token', {
    p_order_id: input.orderId,
    p_report_id: input.reportId,
    p_recipient_email: input.recipientEmail,
    p_reason: note,
    p_ttl_seconds: ttlSeconds,
    p_override_suppression: input.overrideSuppression === true
  });
  if (error || !data) { const mapped = mapError(error); return { ok: false, ...mapped }; }

  const result = data as { token: string; token_id: string; expires_at: string; email_event_id: string };
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL?.trim() || 'https://mkfraud.co.za').replace(/\/$/, '');
  const accessUrl = `${appUrl}/score/report/access/${encodeURIComponent(result.token)}`;
  const message = buildReportReadyMessage({
    customerName: input.customerName,
    orderReference: input.orderReference,
    accessUrl,
    expiresAtIso: result.expires_at
  });

  const fromAddress = process.env.MK_REPORT_EMAIL_FROM?.trim() || 'MK Fraud Insights <hello@mkfraud.co.za>';
  const replyTo = process.env.MK_REPORT_EMAIL_REPLY_TO?.trim() || null;
  const sendResult = await sendEmail({
    from: fromAddress,
    to: input.recipientEmail,
    replyTo,
    subject: message.subject,
    html: message.html,
    text: message.text,
    idempotencyKey: result.email_event_id
  });

  const db = createSupabaseServiceClient() as any;
  const sentSuccessfully = sendResult.ok && sendResult.mode !== 'disabled';
  await db.from('email_events').update({
    status: !sendResult.ok ? 'FAILED_TERMINAL' : sendResult.mode === 'disabled' ? 'recorded_disabled' : 'PROVIDER_ACCEPTED',
    provider_message_id: sentSuccessfully ? sendResult.providerMessageId : null,
    sent_at: sentSuccessfully ? new Date().toISOString() : null,
    error_message: sendResult.ok ? null : sendResult.error,
    updated_at: new Date().toISOString()
  }).eq('id', result.email_event_id);

  const { data: tokenRow } = await db.from('customer_report_access_tokens')
    .select('id,report_id,recipient_email,issued_at,expires_at,revoked_at,revoked_reason,last_accessed_at,access_count')
    .eq('id', result.token_id).single();

  return {
    ok: true,
    data: {
      token: tokenRow ? mapToken(tokenRow) : {
        id: result.token_id, reportId: input.reportId, recipientEmail: input.recipientEmail,
        issuedAt: new Date().toISOString(), expiresAt: result.expires_at,
        revokedAt: null, revokedReason: null, lastAccessedAt: null, accessCount: 0
      },
      emailSent: sendResult.ok,
      emailError: sendResult.ok ? null : sendResult.error
    }
  };
}
