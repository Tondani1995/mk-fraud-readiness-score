import { NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import {
  ResendWebhookBodyTooLargeError,
  createProviderWebhookDatabaseAttestation,
  readLimitedWebhookBody,
  validateResendEventCreatedAt,
  verifyResendWebhook,
  webhookPayloadFingerprint
} from '@/lib/reports/email/resend-webhook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const receiptTimeMs = Date.now();
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
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_webhook' }, { status: 400 });
  }

  const providerMessageId = typeof event.data?.email_id === 'string' ? event.data.email_id : null;
  if (!providerEventId) {
    return NextResponse.json({ ok: false, error: 'invalid_webhook' }, { status: 400 });
  }
  const reason = (event.data?.failed as { reason?: string } | undefined)?.reason
    ?? (event.data?.bounce as { message?: string } | undefined)?.message
    ?? null;
  // H4: forward Resend's own send-time tags through to the ingest RPC so it can fall back to
  // delivery_attempt_ref-based correlation for a "lost response" attempt whose provider_message_id
  // was never captured (a plain provider_message_id match can never reach that row -- see the
  // ingest_phase14_provider_webhook comment in migration 0026 for the full reasoning). Validated
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
      eventType: event.type, eventCreatedAt, payloadSha256
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'webhook_attestation_unavailable' }, { status: 503 });
  }
  const { data, error } = await db.rpc('ingest_phase14_provider_webhook', {
    p_provider: 'resend',
    p_provider_event_id: providerEventId,
    p_provider_message_id: providerMessageId,
    p_event_type: event.type,
    p_event_created_at: eventCreatedAt,
    p_payload_sha256: payloadSha256,
    p_payload_json: { type: event.type, created_at: event.created_at ?? null, reason, data: { tags: safeTags } },
    p_attested_at_epoch: attestation.attestedAtEpoch,
    p_nonce: attestation.nonce,
    p_attestation_hmac: attestation.hmac
  });
  if (error) {
    const gateUnsatisfied = /phase14_(security_gate|feature_policy)/.test(error.message ?? '');
    return NextResponse.json(
      { ok: false, error: gateUnsatisfied ? 'security_gate_unsatisfied' : 'processing_failed' },
      { status: gateUnsatisfied ? 503 : 500 }
    );
  }
  return NextResponse.json({ ok: true, result: data });
}
