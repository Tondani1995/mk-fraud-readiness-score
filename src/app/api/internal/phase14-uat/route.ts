import { NextResponse } from 'next/server';
import { queuePremiumReportFulfilment } from '@/lib/reports/automation/fulfilment';
import { startPremiumReportWorkflow } from '@/lib/reports/automation/workflow-start';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function unavailable() {
  return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
}

export async function GET(request: Request) {
  if (process.env.VERCEL_ENV !== 'preview') return unavailable();

  const orderReference = new URL(request.url).searchParams.get('orderReference')?.trim() ?? '';
  if (!/^MKORD-\d{4}-[A-Z0-9]+$/.test(orderReference)) {
    return NextResponse.json({ ok: false, error: 'invalid_order_reference' }, { status: 400 });
  }

  const firstQueue = await queuePremiumReportFulfilment({
    orderReference,
    triggerSource: 'admin_generate'
  });
  if (!firstQueue.ok) {
    return NextResponse.json({ ok: false, stage: 'first_queue', ...firstQueue }, { status: 409 });
  }

  const secondQueue = await queuePremiumReportFulfilment({
    orderReference,
    triggerSource: 'admin_generate'
  });
  if (!secondQueue.ok) {
    return NextResponse.json({ ok: false, stage: 'second_queue', ...secondQueue }, { status: 409 });
  }

  const fulfilmentId = firstQueue.fulfilment.id as string;
  const firstStart = await startPremiumReportWorkflow(fulfilmentId);
  const secondStart = await startPremiumReportWorkflow(fulfilmentId);

  return NextResponse.json({
    ok: firstStart.ok && secondStart.ok,
    orderReference,
    fulfilmentId,
    firstQueueCreated: firstQueue.created,
    secondQueueCreated: secondQueue.created,
    sameFulfilment: firstQueue.fulfilment.id === secondQueue.fulfilment.id,
    firstStart,
    secondStart
  }, {
    status: firstStart.ok && secondStart.ok ? 200 : 500,
    headers: { 'Cache-Control': 'no-store' }
  });
}
