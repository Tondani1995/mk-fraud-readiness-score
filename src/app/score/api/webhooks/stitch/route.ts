import { NextResponse } from 'next/server';
import { getPaymentAutomationCapability } from '@/lib/payments/payment-capability';
import { processVerifiedPayment } from '@/lib/payments/payment-service';
import { parseStitchPaymentEvent, verifyStitchWebhook } from '@/lib/payments/stitch-adapter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const rawBody = await request.text();
  const secret = process.env.STITCH_WEBHOOK_SECRET ?? '';
  console.info('stitch_webhook', { outcome: 'received', hasDeliveryReference: Boolean(request.headers.get('svix-id')) });
  let delivery;
  try {
    delivery = verifyStitchWebhook({ rawBody, headers: request.headers, secret });
  } catch (error) {
    console.warn('stitch_webhook', { outcome: 'signature_invalid', reason: error instanceof Error ? error.message : 'invalid' });
    return NextResponse.json({ ok: false, error: 'invalid_signature' }, { status: 401 });
  }
  console.info('stitch_webhook', { outcome: 'signature_valid', deliveryId: delivery.id });
  let event;
  try {
    event = parseStitchPaymentEvent(rawBody, delivery.id);
  } catch (error) {
    console.warn('stitch_webhook', { outcome: 'malformed', deliveryId: delivery.id, reason: error instanceof Error ? error.message : 'invalid' });
    return NextResponse.json({ ok: false, error: 'malformed_payload' }, { status: 400 });
  }
  const capability = await getPaymentAutomationCapability();
  if (capability.status !== 'available') {
    return NextResponse.json({ ok: false, error: 'payment_automation_unavailable', message: capability.message }, { status: 503 });
  }
  const result = await processVerifiedPayment({
    source: 'stitch_webhook', actorReference: 'stitch', idempotencyKey: `stitch:${event.eventId}`, event
  });
  if (!result.ok && result.message.includes('matched')) {
    console.warn('stitch_webhook', { outcome: 'unknown_order', deliveryId: delivery.id, technicalReference: result.technicalReference });
    return NextResponse.json({ ok: false, error: 'unknown_order', technicalReference: result.technicalReference }, { status: 404 });
  }
  if (!result.ok) return NextResponse.json({ ok: false, error: 'payment_processing_failed', technicalReference: result.technicalReference }, { status: 500 });
  return NextResponse.json({ ok: true, duplicate: result.duplicate, state: result.state, fulfilment: result.fulfilment });
}
