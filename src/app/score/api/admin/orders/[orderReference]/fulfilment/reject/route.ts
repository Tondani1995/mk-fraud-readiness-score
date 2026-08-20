import { NextResponse } from 'next/server';
import { getRc1OperationFreezeResponse } from '@/lib/rc1/operation-freeze';
import { getAdminSession } from '@/lib/auth/admin-route';
import { FULFILMENT_QUALITY_REVIEW_ROLES, rejectQualityReview } from '@/lib/fulfilment/fulfilment-service';

// Release B quality-review rejection. Same role set as approve/route.ts. Rejecting creates a
// new, linked, queued fulfilment attempt (controlled regeneration) -- see
// reject_quality_review() in supabase/migrations/20260724160000_release_b_durable_fulfilment.sql.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, props: { params: Promise<{ orderReference: string }> }) {
  const params = await props.params;
  const frozen = await getRc1OperationFreezeResponse('quality_review');
  if (frozen) return frozen;

  const admin = await getAdminSession();
  if (!admin || !FULFILMENT_QUALITY_REVIEW_ROLES.includes(admin.role)) {
    return NextResponse.json({ ok: false, reason: 'forbidden', message: 'You are not authorised to review report quality.' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const attemptId = String(body.attemptId ?? '');
  const reason = String(body.reason ?? '');
  if (!attemptId) {
    return NextResponse.json({ ok: false, reason: 'attempt_required', message: 'A fulfilment attempt id is required.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }

  const result = await rejectQualityReview(attemptId, reason);
  if (!result.ok) {
    return NextResponse.json({ ok: false, reason: result.reason, message: result.message }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json({ ok: true, data: result.data, orderReference: params.orderReference }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}
