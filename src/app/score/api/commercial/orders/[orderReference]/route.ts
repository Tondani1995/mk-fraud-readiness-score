import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/admin-route';
import { getOrderProductState } from '@/lib/commercial/order-service';
import { canReadComprehensiveEngagement } from '@/lib/comprehensive/engagement-service';

// Order/product state read model for the admin surface: which tier was bought, at which price
// version, and - for Comprehensive - where the engagement currently sits.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, props: { params: Promise<{ orderReference: string }> }) {
  const params = await props.params;
  const admin = await getAdminSession();
  if (!admin || !canReadComprehensiveEngagement(admin.role)) {
    return NextResponse.json(
      { ok: false, reason: 'forbidden' },
      { status: 403, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const state = await getOrderProductState(params.orderReference);
  if (!state) {
    return NextResponse.json(
      { ok: false, reason: 'order_not_found' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  return NextResponse.json({ ok: true, order: state }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}
