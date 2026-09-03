import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/admin-route';
import { FULFILMENT_QUALITY_REVIEW_ROLES, approveQualityReview } from '@/lib/fulfilment/fulfilment-service';

// Release B quality-review approval. Follows the same auth/validation pattern as
// src/app/score/api/admin/backlog-reconciliation/route.ts. Role check here is the same set
// approve_quality_review() enforces internally (platform_admin/reviewer/approver) -- this is
// a defence-in-depth check, not the only one; the RPC re-checks regardless.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, props: { params: Promise<{ orderReference: string }> }) {
  const params = await props.params;
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

  const result = await approveQualityReview(attemptId, reason);
  if (!result.ok) {
    return NextResponse.json({ ok: false, reason: result.reason, message: result.message }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
  return NextResponse.json({ ok: true, data: result.data, orderReference: params.orderReference }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
}
