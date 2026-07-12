import { NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { mapResendEventStatus, verifyResendWebhook } from '@/lib/reports/email/resend-webhook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const payload = await request.text();
  const eventId = request.headers.get('svix-id');

  let event;
  try {
    event = verifyResendWebhook({
      payload,
      id: eventId,
      timestamp: request.headers.get('svix-timestamp'),
      signature: request.headers.get('svix-signature')
    });
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_webhook' }, { status: 400 });
  }

  const status = mapResendEventStatus(event.type);
  if (!status) return NextResponse.json({ ok: true, ignored: true });

  const db = createSupabaseServiceClient() as any;
  if (eventId) {
    const { data: duplicate } = await db
      .from('email_events')
      .select('id')
      .eq('provider_event_id', eventId)
      .maybeSingle();
    if (duplicate) return NextResponse.json({ ok: true, duplicate: true });
  }

  const providerMessageId = event.data?.email_id as string;
  const { data: emailEvent, error: lookupError } = await db
    .from('email_events')
    .select('id,report_id,metadata_json')
    .eq('provider_message_id', providerMessageId)
    .maybeSingle();
  if (lookupError) return NextResponse.json({ ok: false, error: 'lookup_failed' }, { status: 500 });
  if (!emailEvent) return NextResponse.json({ ok: true, ignored: true, reason: 'unknown_message' });

  const now = new Date().toISOString();
  const reason = (event.data?.failed as { reason?: string } | undefined)?.reason
    ?? (event.data?.bounce as { message?: string } | undefined)?.message
    ?? null;

  const { error: updateError } = await db
    .from('email_events')
    .update({
      status,
      provider_event_id: eventId,
      delivered_at: status === 'delivered' ? now : null,
      delivery_updated_at: now,
      error_message: ['failed', 'bounced', 'suppressed', 'complained'].includes(status) ? reason ?? status : null,
      metadata_json: {
        ...(emailEvent.metadata_json ?? {}),
        last_provider_event_type: event.type,
        last_provider_event_created_at: event.created_at ?? null
      }
    })
    .eq('id', emailEvent.id);

  if (updateError) {
    if (/duplicate|unique/i.test(updateError.message)) {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    return NextResponse.json({ ok: false, error: 'update_failed' }, { status: 500 });
  }

  if (emailEvent.report_id) {
    await db.from('report_events').insert({
      report_id: emailEvent.report_id,
      event_type: `email_${status}`,
      note: `Resend webhook recorded ${event.type}.`,
      metadata_json: {
        email_event_id: emailEvent.id,
        provider_message_id: providerMessageId,
        provider_event_id: eventId,
        reason
      }
    });
  }

  return NextResponse.json({ ok: true, status });
}
