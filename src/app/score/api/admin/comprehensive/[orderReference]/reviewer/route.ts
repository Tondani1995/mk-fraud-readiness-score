import { NextResponse } from 'next/server';
import { getRc1OperationFreezeResponse } from '@/lib/rc1/operation-freeze';
import { getAdminSession } from '@/lib/auth/admin-route';
import { isAutomatedComprehensiveOrder, AUTOMATED_COMPREHENSIVE_ROUTE_RETIRED } from '@/lib/commercial/legacy-comprehensive-admin-route';
import { assignComprehensiveReviewer } from '@/lib/comprehensive/engagement-service';

// Named-reviewer assignment. Both the assignment and any later reassignment are persisted on the
// engagement and appended to its audit trail with the acting administrator and the timestamp.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, props: { params: Promise<{ orderReference: string }> }) {
  const params = await props.params;
  const frozen = await getRc1OperationFreezeResponse('quality_review');
  if (frozen) return frozen;

  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ ok: false, reason: 'forbidden' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }
  if (await isAutomatedComprehensiveOrder(params.orderReference)) {
    return NextResponse.json({ ok: false, reason: AUTOMATED_COMPREHENSIVE_ROUTE_RETIRED }, { status: 410, headers: { 'Cache-Control': 'no-store' } });
  }

  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const reviewerAdminUserId = String(body.reviewerAdminUserId ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(reviewerAdminUserId)) {
    return NextResponse.json(
      { ok: false, reason: 'reviewer_required', message: 'A reviewer administrator id is required.' },
      { status: 400, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const result = await assignComprehensiveReviewer({
    orderReference: params.orderReference,
    reviewerAdminUserId,
    actor: { id: admin.id, role: admin.role },
    note: typeof body.note === 'string' ? body.note : null
  });

  if (!result.ok) {
    const status = result.reason === 'forbidden'
      ? 403
      : result.reason === 'engagement_not_found'
        ? 404
        : result.reason === 'concurrent_modification'
          ? 409
          : result.reason === 'write_failed'
            ? 500
            : 400;
    return NextResponse.json(
      { ok: false, reason: result.reason, message: result.message },
      { status, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  return NextResponse.json(
    { ok: true, reassigned: result.reassigned, engagement: result.engagement },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  );
}
