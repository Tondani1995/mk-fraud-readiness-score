import { NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import {
  ResendWebhookBodyTooLargeError,
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
  const db = createSupabaseServiceClient() as any;
  const { data, error } = await db.rpc('apply_email_provider_event_atomic', {
    p_provider: 'resend',
    p_provider_event_id: providerEventId,
    p_provider_message_id: providerMessageId,
    p_event_type: event.type,
    p_event_created_at: eventCreatedAt,
    p_payload_fingerprint: webhookPayloadFingerprint(payload),
    p_payload_json: { type: event.type, created_at: event.created_at ?? null, reason }
  });
  if (error) {
    const gateUnsatisfied = error.message?.includes('phase14_security_gate_unsatisfied');
    return NextResponse.json(
      { ok: false, error: gateUnsatisfied ? 'security_gate_unsatisfied' : 'processing_failed' },
      { status: gateUnsatisfied ? 503 : 500 }
    );
  }
  return NextResponse.json({ ok: true, result: data });
}
