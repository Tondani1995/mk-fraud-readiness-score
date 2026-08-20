import { NextResponse } from 'next/server';
import { getRc1OperationFreezeResponse } from '@/lib/rc1/operation-freeze';
import { getAdminSession } from '@/lib/auth/admin-route';
import { transitionComprehensiveEngagement } from '@/lib/comprehensive/engagement-service';

/**
 * Moves a Comprehensive engagement to its next state, including reviewer sign-off
 * (in_review -> review_complete, which requires a sign-off statement) and its withdrawal
 * (review_complete -> in_review, which requires a note).
 *
 * `expectedStateVersion` is the caller's optimistic-concurrency token, read from the engagement it
 * just displayed. Two administrators acting on the same engagement cannot both win.
 */

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

  const body = await request.json().catch(() => ({} as Record<string, unknown>));

  const result = await transitionComprehensiveEngagement({
    orderReference: params.orderReference,
    nextState: body.nextState,
    note: typeof body.note === 'string' ? body.note : null,
    signOffStatement: typeof body.signOffStatement === 'string' ? body.signOffStatement : null,
    expectedStateVersion: typeof body.expectedStateVersion === 'number' ? body.expectedStateVersion : null,
    actor: { id: admin.id, role: admin.role }
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
    { ok: true, engagement: result.engagement },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  );
}
