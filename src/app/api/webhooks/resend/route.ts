import { NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { mapResendEventStatus, verifyResendWebhook } from '@/lib/reports/email/resend-webhook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function validTimestamp(value: unknown, fallback: string) {
  if (typeof value !== 'string') return fallback;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
}

export async function POST(request: Request) {
  const payload = await request.text();
  const providerEventId = request.headers.get('svix-id');
  let event;
  try {
    event = verifyResendWebhook({
      payload,
      id: providerEventId,
      timestamp: request.headers.get('svix-timestamp'),
      signature: request.headers.get('svix-signature')
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_webhook' }, { status: 400 });
  }

  if (!mapResendEventStatus(event.type)) return NextResponse.json({ ok: true, ignored: true });
  const providerMessageId = event.data?.email_id;
  if (!providerEventId || typeof providerMessageId !== 'string') {
    return NextResponse.json({ ok: false, error: 'invalid_webhook' }, { status: 400 });
  }
  const now = new Date().toISOString();
  const eventCreatedAt = validTimestamp(event.created_at, now);
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
    p_payload_json: { type: event.type, created_at: event.created_at ?? null, reason }
  });
  if (error) return NextResponse.json({ ok: false, error: 'processing_failed' }, { status: 500 });
  return NextResponse.json({ ok: true, result: data });
}
