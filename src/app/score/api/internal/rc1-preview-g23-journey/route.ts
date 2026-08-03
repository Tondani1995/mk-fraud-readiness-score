import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { isPremiumReportDevelopmentMode } from '@/lib/reports/email/premium-report-development-mode';
import { recordPaymentConfirmedNotification } from '@/lib/notifications/phase1-order-notifications';
import {
  generateManualPhase1Report,
  Phase1GenerationError,
} from '@/lib/reports/phase1-manual-fulfilment';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SYNTHETIC_REFERENCE = 'MKTEST-RC1-20260804-01';
const RECIPIENT = 'admin@mkfraud.co.za';

export async function POST(request: Request) {
  if (!isPremiumReportDevelopmentMode()) {
    return NextResponse.json({ ok: false, error: 'development_mode_required' }, { status: 404 });
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const orderReference = typeof body?.orderReference === 'string' ? body.orderReference.trim() : '';
  const attemptId = typeof body?.attemptId === 'string' ? body.attemptId.trim() : '';
  if (!orderReference || !/^[0-9a-f-]{36}$/i.test(attemptId)) {
    return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 });
  }

  const db = createSupabaseServiceClient() as any;
  const { data: order, error: orderError } = await db
    .from('orders')
    .select('id,order_reference,assessment_id,status,customer_email,customer_name,amount_cents,currency,verified_at')
    .eq('order_reference', orderReference)
    .maybeSingle();
  if (orderError || !order) return NextResponse.json({ ok: false, error: 'order_not_found' }, { status: 404 });

  const { data: assessment } = await db.from('assessments').select('organisation_id').eq('id', order.assessment_id).maybeSingle();
  const { data: organisation } = assessment?.organisation_id
    ? await db.from('organisations').select('synthetic_certification_ref').eq('id', assessment.organisation_id).maybeSingle()
    : { data: null };
  if (organisation?.synthetic_certification_ref !== SYNTHETIC_REFERENCE
      || order.status !== 'payment_received'
      || order.customer_email?.trim().toLowerCase() !== RECIPIENT
      || !order.verified_at) {
    return NextResponse.json({ ok: false, error: 'synthetic_order_ineligible' }, { status: 409 });
  }

  const { count: transitionCount } = await db.from('payment_transition_events')
    .select('id', { count: 'exact', head: true })
    .eq('order_id', order.id)
    .eq('new_state', 'PAID')
    .eq('processing_result', 'applied');
  if (transitionCount !== 1) return NextResponse.json({ ok: false, error: 'payment_transition_contract_failed' }, { status: 409 });

  await recordPaymentConfirmedNotification({
    orderId: order.id,
    orderReference: order.order_reference,
    assessmentId: order.assessment_id,
    amountCents: Number(order.amount_cents),
    currency: String(order.currency ?? 'ZAR'),
    customerName: order.customer_name ?? null,
    customerEmail: RECIPIENT,
    verifiedAtIso: order.verified_at,
  });

  const leaseOwner = `rc1-g23:${crypto.randomUUID()}`;
  const { data: job, error: claimError } = await db.rpc('claim_exact_fulfilment_job', {
    p_attempt_id: attemptId,
    p_lease_owner: leaseOwner,
    p_lease_seconds: 300,
  });
  if (claimError || !job || job.order_id !== order.id) {
    return NextResponse.json({ ok: false, error: 'fulfilment_claim_failed' }, { status: 409 });
  }

  try {
    const generated = await generateManualPhase1Report({
      orderReference: order.order_reference,
      requestedBy: null,
      requestKey: String(job.request_key),
      action: 'payment_confirmation',
    });
    return NextResponse.json({
      ok: true,
      paymentNotification: true,
      attemptId: job.id,
      reportId: generated.reportId,
      reportReference: generated.reportReference,
      versionNumber: generated.versionNumber,
      evidenceChecksum: generated.evidenceChecksum,
    });
  } catch (error) {
    const reason = error instanceof Phase1GenerationError ? error.reason : 'generation_failed';
    return NextResponse.json({ ok: false, error: reason }, { status: 502 });
  }
}
