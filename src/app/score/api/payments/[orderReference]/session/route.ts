import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { getPaymentAutomationCapability } from '@/lib/payments/payment-capability';
import { getStitchPaymentProvider } from '@/lib/payments/stitch-adapter';
import { validateResumeToken } from '@/lib/respondent/tokens';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(request: Request, { params }: { params: { orderReference: string } }) {
  const body = await request.json().catch(() => ({}));
  const token = String(body.token ?? '');
  const capability = await getPaymentAutomationCapability();
  if (capability.status !== 'available') return NextResponse.json({ ok: false, message: capability.message }, { status: 503 });
  const db = createSupabaseServiceClient() as any;
  const { data: order } = await db.from('orders').select('id,assessment_id,order_reference,amount_cents,currency,status')
    .eq('order_reference', params.orderReference).maybeSingle();
  if (!order) return NextResponse.json({ ok: false, error: 'order_not_found' }, { status: 404 });
  if (order.status !== 'awaiting_payment') return NextResponse.json({ ok: false, error: 'order_not_eligible' }, { status: 409 });
  const { data: assessment } = await db.from('assessments').select('assessment_reference').eq('id', order.assessment_id).maybeSingle();
  const access = assessment ? await validateResumeToken({ assessmentReference: assessment.assessment_reference, rawToken: token, consume: false }) : null;
  if (!access?.ok || access.assessment.id !== order.assessment_id) return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  const provider = getStitchPaymentProvider();
  if (provider.mode !== 'double') return NextResponse.json({ ok: false, error: 'provider_disabled' }, { status: 503 });
  const returnUrl = new URL('/score/payment/return', request.url).toString();
  const session = await provider.createSession({ orderReference: order.order_reference, amountCents: order.amount_cents, currency: order.currency, returnUrl });
  const rawReturnToken = crypto.randomBytes(32).toString('base64url');
  const returnTokenHash = crypto.createHash('sha256').update(rawReturnToken).digest('hex');
  const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();
  const { error } = await db.from('payment_sessions').insert({
    order_id: order.id, provider_mode: provider.mode, provider_session_reference: session.reference,
    return_token_hash: returnTokenHash, expires_at: expiresAt
  });
  if (error) return NextResponse.json({ ok: false, error: 'session_persistence_failed' }, { status: 500 });
  console.info('payment_session', { outcome: 'created', orderReference: order.order_reference, providerMode: session.mode, expiresAt });
  const response = NextResponse.json({ ok: true, redirectUrl: session.redirectUrl, mode: session.mode });
  response.cookies.set('mk_payment_return', rawReturnToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/score', expires: new Date(expiresAt) });
  return response;
}
