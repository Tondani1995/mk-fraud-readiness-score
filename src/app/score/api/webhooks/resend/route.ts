import { NextResponse } from 'next/server';
import { getRc1OperationFreezeResponse } from '@/lib/rc1/operation-freeze';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { checkRateLimits, RATE_LIMITS } from '@/lib/security/rate-limit';
import { isPremiumReportDevelopmentMode } from '@/lib/reports/email/premium-report-development-mode';
import {
  ResendWebhookBodyTooLargeError,
  createProviderWebhookDatabaseAttestation,
  isResendWebhookVerificationError,
  isSupportedResendEventType,
  readLimitedWebhookBody,
  validateResendEventCreatedAt,
  verifyResendWebhook,
  webhookPayloadFingerprint
} from '@/lib/reports/email/resend-webhook';

/**
 * Emits a single safe structured line for a rejected or ignored provider callback.
 *
 * Safe by construction: a closed reason vocabulary, the provider's own opaque event id as the
 * correlation key, the signed clock skew, the event type only when it came from a
 * signature-verified payload, and the deployment identity so a rejection can be attributed to an
 * exact build. Never the signing secret, raw signature values, request body, recipient address,
 * customer data or report access tokens.
 */
function logResendWebhookRejection(input: {
  reason: string;
  providerEventId: string | null;
  timestampDeltaSeconds: number | null;
  eventType: string | null;
}) {
  console.error('resend_webhook_rejected', {
    reason: input.reason,
    providerEventId: input.providerEventId ?? null,
    timestampDeltaSeconds: input.timestampDeltaSeconds ?? null,
    eventType: input.eventType ?? null,
    deploymentId: process.env.VERCEL_DEPLOYMENT_ID ?? null,
    commitSha: process.env.VERCEL_GIT_COMMIT_SHA ?? null
  });
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const previewDevelopmentMode = isPremiumReportDevelopmentMode();
  if (!previewDevelopmentMode) {
    const frozen = await getRc1OperationFreezeResponse('resend_webhook', 'provider_webhook');
    if (frozen) return frozen;
  }

  const receiptTimeMs = Date.now();
  // L5: global volumetric ceiling, checked before any request-body work. Deliberately not
  // per-IP -- see RATE_LIMITS.resendWebhookGlobal's comment in src/lib/security/rate-limit.ts
  // for why. This is a defense-in-depth backstop layered underneath (not instead of) the HMAC
  // signature verification, timestamp replay window and body-size cap below, which remain the
  // primary defenses.
  const rateLimit = await checkRateLimits([
    { key: 'resend_webhook:global', ...RATE_LIMITS.resendWebhookGlobal() }
  ]);
  if (!rateLimit.allowed) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 });
  }

  let payload: string;
  try {
    payload = await readLimitedWebhookBody(request);
  } catch (error) {
    if (error instanceof ResendWebhookBodyTooLargeError) {
      return NextResponse.json({ ok: false, error: 'payload_too_large' }, { status: 413 });
    }
    return NextResponse.json({ ok: false, error: 'invalid_webhook' }, { status: 400 });
  }
  const providerEventId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  let event;
  let eventCreatedAt: string;
  try {
    event = verifyResendWebhook({
      payload,
      id: providerEventId,
      timestamp: svixTimestamp,
      signature: request.headers.get('svix-signature'),
      nowMs: receiptTimeMs
    });
    eventCreatedAt = validateResendEventCreatedAt({
      eventCreatedAt: event.created_at,
      verifiedSvixTimestamp: svixTimestamp,
      receiptTimeMs
    });
  } catch (error) {
    // RC1 observability: previously every rejection here was silent, so a genuine run of failing
    // email.delivered callbacks could not be attributed to a secret mismatch, a replay-window
    // rejection or a malformed body without the provider's retry UI. Only closed-vocabulary safe
    // fields are emitted -- never the signing secret, the raw signature, the request body, a
    // recipient address, customer data or a report access token.
    logResendWebhookRejection({
      reason: isResendWebhookVerificationError(error) ? error.reason : 'verification_failed',
      providerEventId,
      timestampDeltaSeconds: isResendWebhookVerificationError(error) ? error.timestampDeltaSeconds : null,
      eventType: null
    });
    return NextResponse.json({ ok: false, error: 'invalid_webhook' }, { status: 400 });
  }

  if (!isSupportedResendEventType(event.type)) {
    // The accepted delivery contract acts only on the types mapResendEventStatus() knows. An
    // unexpected type usually means the provider subscription drifted from the contract, so it is
    // acknowledged rather than retried, and recorded. Ingesting such events created provider-event
    // rows that bound to nothing -- the contamination that corrupted the RC1 callback count.
    logResendWebhookRejection({
      reason: 'unsupported_event_type',
      providerEventId,
      timestampDeltaSeconds: null,
      eventType: event.type
    });
    return NextResponse.json({ ok: true, ignored: 'unsupported_event_type' });
  }

  const providerMessageId = typeof event.data?.email_id === 'string' ? event.data.email_id : null;
  if (!providerEventId) {
    return NextResponse.json({ ok: false, error: 'invalid_webhook' }, { status: 400 });
  }
  const bounceData = event.data?.bounce as { message?: string; type?: string } | undefined;
  const reason = (event.data?.failed as { reason?: string } | undefined)?.reason
    ?? bounceData?.message
    ?? null;
  // Release C closure: a soft/transient bounce should stay retry-eligible (maps to the existing
  // 'delivery_delayed' status), while a permanent (or type-undetermined, treated conservatively
  // as permanent) bounce triggers the resend-suppression path -- see
  // apply_email_provider_event_atomic()'s comment in
  // supabase/migrations/20260724180000_release_c_closure_delivery_exceptions.sql for the full
  // reasoning. This is a synthetic event_type used only for our own RPC call, never sent back to
  // Resend or exposed to the customer; the attestation below is computed over this same value so
  // both sides agree.
  const effectiveEventType = event.type === 'email.bounced' && /^(transient|soft)$/i.test(bounceData?.type ?? '')
    ? 'email.bounced.transient'
    : event.type;
  // H4: forward Resend's own send-time tags through to the ingest RPC so it can fall back to
  // delivery_attempt_ref-based correlation for a "lost response" attempt whose provider_message_id
  // was never captured (a plain provider_message_id match can never reach that row -- see the
  // ingest_phase14_provider_webhook comment in migration 0028 for the full reasoning). Validated
  // and shape-limited defensively before forwarding; the RPC itself independently re-validates the
  // format and requires an exact, unambiguous match against an existing authorization row before
  // it ever acts on this, so a malformed or attacker-shaped tag here can only ever fail closed.
  const rawTags = Array.isArray((event.data as { tags?: unknown } | undefined)?.tags)
    ? (event.data as { tags: unknown[] }).tags
    : [];
  const safeTags = rawTags
    .filter((tag): tag is { name: string; value: string } =>
      !!tag && typeof tag === 'object' && typeof (tag as any).name === 'string' && typeof (tag as any).value === 'string')
    .slice(0, 32)
    .map((tag) => ({ name: tag.name.slice(0, 64), value: tag.value.slice(0, 256) }));
  const db = createSupabaseServiceClient() as any;
  const payloadSha256 = webhookPayloadFingerprint(payload);
  let attestation;
  try {
    attestation = createProviderWebhookDatabaseAttestation({
      provider: 'resend', providerEventId, providerMessageId,
      eventType: effectiveEventType, eventCreatedAt, payloadSha256
    });
  } catch {
    logResendWebhookRejection({
      reason: 'database_attestation_failed',
      providerEventId,
      timestampDeltaSeconds: null,
      eventType: event.type
    });
    return NextResponse.json({ ok: false, error: 'webhook_attestation_unavailable' }, { status: 503 });
  }
  const { data, error } = await db.rpc(
    previewDevelopmentMode
      ? 'preview_development_ingest_phase14_provider_webhook'
      : 'ingest_phase14_provider_webhook',
    {
    p_provider: 'resend',
    p_provider_event_id: providerEventId,
    p_provider_message_id: providerMessageId,
    p_event_type: effectiveEventType,
    p_event_created_at: eventCreatedAt,
    p_payload_sha256: payloadSha256,
    p_payload_json: { type: event.type, created_at: event.created_at ?? null, reason, data: { tags: safeTags } },
    p_attested_at_epoch: attestation.attestedAtEpoch,
    p_nonce: attestation.nonce,
    p_attestation_hmac: attestation.hmac
  });
  if (error) {
    const gateUnsatisfied = /phase14_(security_gate|feature_policy)/.test(error.message ?? '');
    // The RPC's own message can quote database detail, so only the classified reason is emitted.
    logResendWebhookRejection({
      reason: gateUnsatisfied ? 'security_gate_unsatisfied' : 'provider_message_binding_failed',
      providerEventId,
      timestampDeltaSeconds: null,
      eventType: event.type
    });
    return NextResponse.json(
      { ok: false, error: gateUnsatisfied ? 'security_gate_unsatisfied' : 'processing_failed' },
      { status: gateUnsatisfied ? 503 : 500 }
    );
  }
  return NextResponse.json({ ok: true, result: data });
}
