import { NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { mapResendEventStatus, verifyResendWebhook } from '@/lib/reports/email/resend-webhook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TERMINAL_STATUSES = new Set(['delivered', 'bounced', 'failed', 'suppressed', 'complained']);

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

  const status = mapResendEventStatus(event.type);
  if (!status) return NextResponse.json({ ok: true, ignored: true });

  const providerMessageId = event.data?.email_id as string;
  const db = createSupabaseServiceClient() as any;
  const { data: emailEvent, error: lookupError } = await db
    .from('email_events')
    .select('id,report_id,status,delivered_at,delivery_updated_at,metadata_json')
    .eq('provider_message_id', providerMessageId)
    .maybeSingle();
  if (lookupError) return NextResponse.json({ ok: false, error: 'lookup_failed' }, { status: 500 });
  if (!emailEvent) return NextResponse.json({ ok: true, ignored: true, reason: 'unknown_message' });

  const now = new Date().toISOString();
  const eventCreatedAt = validTimestamp(event.created_at, now);
  const reason = (event.data?.failed as { reason?: string } | undefined)?.reason
    ?? (event.data?.bounce as { message?: string } | undefined)?.message
    ?? null;

  const providerEventInsert = {
    email_event_id: emailEvent.id,
    provider: 'resend',
    provider_event_id: providerEventId,
    provider_message_id: providerMessageId,
    event_type: event.type,
    event_created_at: eventCreatedAt,
    payload_json: {
      type: event.type,
      created_at: event.created_at ?? null,
      reason
    }
  };

  let { data: providerEvent, error: providerInsertError } = await db
    .from('email_provider_events')
    .insert(providerEventInsert)
    .select('id,processed_at')
    .maybeSingle();

  if (providerInsertError || !providerEvent) {
    const { data: existing, error: existingError } = await db
      .from('email_provider_events')
      .select('id,processed_at')
      .eq('provider', 'resend')
      .eq('provider_event_id', providerEventId)
      .maybeSingle();
    if (existingError || !existing) {
      return NextResponse.json({ ok: false, error: 'provider_event_claim_failed' }, { status: 500 });
    }
    if (existing.processed_at) return NextResponse.json({ ok: true, duplicate: true });
    providerEvent = existing;
  }

  const previousUpdatedAt = emailEvent.delivery_updated_at
    ? Date.parse(emailEvent.delivery_updated_at)
    : Number.NEGATIVE_INFINITY;
  const incomingCreatedAt = Date.parse(eventCreatedAt);
  const staleEvent = Number.isFinite(previousUpdatedAt)
    && Number.isFinite(incomingCreatedAt)
    && incomingCreatedAt < previousUpdatedAt;
  const terminalRegression = TERMINAL_STATUSES.has(emailEvent.status)
    && !TERMINAL_STATUSES.has(status);
  const shouldUpdateCurrentState = !staleEvent && !terminalRegression;

  try {
    if (shouldUpdateCurrentState) {
      const negative = ['failed', 'bounced', 'suppressed', 'complained'].includes(status);
      const { error: updateError } = await db
        .from('email_events')
        .update({
          status,
          provider_event_id: providerEventId,
          delivered_at: status === 'delivered' ? eventCreatedAt : emailEvent.delivered_at,
          delivery_updated_at: eventCreatedAt,
          error_message: negative ? reason ?? status : null,
          metadata_json: {
            ...(emailEvent.metadata_json ?? {}),
            last_provider_event_type: event.type,
            last_provider_event_created_at: eventCreatedAt
          }
        })
        .eq('id', emailEvent.id);
      if (updateError) throw updateError;

      if (emailEvent.report_id) {
        const { error: reportEventError } = await db.from('report_events').insert({
          report_id: emailEvent.report_id,
          event_type: `email_${status}`,
          note: `Resend webhook recorded ${event.type}.`,
          metadata_json: {
            email_event_id: emailEvent.id,
            provider_message_id: providerMessageId,
            provider_event_id: providerEventId,
            event_created_at: eventCreatedAt,
            reason
          }
        });
        if (reportEventError) throw reportEventError;
      }
    }

    const { error: processedError } = await db
      .from('email_provider_events')
      .update({ processed_at: now, processing_error: null })
      .eq('id', providerEvent.id);
    if (processedError) throw processedError;

    return NextResponse.json({
      ok: true,
      status,
      stateUpdated: shouldUpdateCurrentState,
      staleEvent,
      terminalRegression
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Webhook processing failed.';
    await db
      .from('email_provider_events')
      .update({ processing_error: message })
      .eq('id', providerEvent.id);
    return NextResponse.json({ ok: false, error: 'processing_failed' }, { status: 500 });
  }
}
