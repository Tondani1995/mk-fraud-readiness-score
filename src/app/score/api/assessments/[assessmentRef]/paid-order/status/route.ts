import { NextResponse } from 'next/server';
import { validateSnapshotToken } from '@/lib/respondent/tokens';
import { getCustomerPaidOrderStatus } from '@/lib/commercial/customer-order-status';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request, props: { params: Promise<{ assessmentRef: string }> }) {
  const params = await props.params;
  const url = new URL(request.url);
  const snapshotToken = url.searchParams.get('token');
  const orderReference = url.searchParams.get('orderReference');
  if (!snapshotToken || !orderReference) return NextResponse.json({ ok: false, reason: 'private_link_required' }, { status: 403 });
  const validation = await validateSnapshotToken({ assessmentReference: params.assessmentRef, rawToken: snapshotToken, consume: false });
  if (!validation.ok) return NextResponse.json({ ok: false, reason: 'private_link_required' }, { status: 403 });
  const order = await getCustomerPaidOrderStatus({ assessmentId: validation.assessment.id, orderReference });
  if (!order) return NextResponse.json({ ok: false, reason: 'order_not_found' }, { status: 404 });
  return NextResponse.json({ ok: true, order }, { headers: { 'Cache-Control': 'no-store' } });
}
