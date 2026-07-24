import { getAdminAccessTokenFromCookies } from '@/lib/auth/session-cookies';
import { createSupabaseAuthenticatedServerClient, createSupabaseServiceClient } from '@/lib/supabase/server';
import { getNumberEnv } from '@/lib/env/server';
import { sendEmail } from '@/lib/notifications/email-provider';
import { buildReportReadyMessage } from '@/lib/notifications/message-templates';
import type { AdminRole } from '@/lib/types/domain';

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
  return {
    id: String(row.id),
    reportId: String(row.report_id),
    recipientEmail: String(row.recipient_email ?? ''),
    status: String(row.status ?? ''),
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
  if (text.includes('delivery_retry_no_session') || text.includes('access_token_no_session')) {
    return { reason: 'no_session', message: 'Your admin session has expired. Sign in again.' };
  }
  if (text.includes('delivery_retry_role_forbidden')) {
    return { reason: 'forbidden', message: 'You are not authorised to retry report delivery.' };
  }
  if (text.includes('access_token_role_forbidden')) {
    return { reason: 'forbidden', message: 'You are not authorised to manage customer report access links.' };
  }
  if (text.includes('delivery_retry_invalid_state')) {
    return { reason: 'invalid_state', message: 'This delivery is not in a state that can be retried.' };
  }
  if (text.includes('access_token_reason_too_short')) {
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
  return { reason: 'query_failed', message: 'The action could not be completed. Try again.' };
}

export async function getOrderDeliveryState(orderId: string): Promise<{
  authorizations: DeliveryAuthorization[];
  accessTokens: CustomerAccessToken[];
}> {
  const db = createSupabaseServiceClient() as any;
  const [authorizationsResult, tokensResult] = await Promise.all([
    db.from('report_delivery_authorizations')
      .select('id,report_id,recipient_email,status,retry_count,max_attempts,next_attempt_at,provider_message_id,revoked_reason,authorised_at,finalized_at')
      .eq('order_id', orderId).order('authorised_at', { ascending: false }),
    db.from('customer_report_access_tokens')
      .select('id,report_id,recipient_email,issued_at,expires_at,revoked_at,revoked_reason,last_accessed_at,access_count')
      .eq('order_id', orderId).order('issued_at', { ascending: false })
  ]);
  return {
    authorizations: (authorizationsResult.data ?? []).map(mapAuthorization),
    accessTokens: (tokensResult.data ?? []).map(mapToken)
  };
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
    p_ttl_seconds: ttlSeconds
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
