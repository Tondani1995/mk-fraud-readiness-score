import { NextResponse } from 'next/server';
import { getRc1OperationFreezeResponse } from '@/lib/rc1/operation-freeze';
import { getAdminSession } from '@/lib/auth/admin-route';
import { getEngagementByOrderReference } from '@/lib/comprehensive/engagement-service';
import { recordEvidenceValidation } from '@/lib/comprehensive/evidence-service';

/**
 * Records a reviewer's validation decision and observation against one evidence item.
 *
 * The engagement is resolved from the order reference in the path and the evidence item must belong
 * to it, so an evidence id from another order cannot be reviewed through this route. Supplying
 * evidence never implies a control is validated: 'supported' is an explicit reviewer decision, and
 * 'not_supported'/'insufficient' require a written observation.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  props: { params: Promise<{ orderReference: string; evidenceId: string }> }
) {
  const params = await props.params;
  const frozen = await getRc1OperationFreezeResponse('quality_review');
  if (frozen) return frozen;

  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ ok: false, reason: 'forbidden' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }

  const engagement = await getEngagementByOrderReference(params.orderReference);
  if (!engagement) {
    return NextResponse.json(
      { ok: false, reason: 'engagement_not_found' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const body = await request.json().catch(() => ({} as Record<string, unknown>));

  const result = await recordEvidenceValidation({
    engagementId: engagement.id,
    evidenceItemId: params.evidenceId,
    validationStatus: body.validationStatus,
    observation: body.observation,
    actor: { id: admin.id, role: admin.role }
  });

  if (!result.ok) {
    const status = result.reason === 'forbidden'
      ? 403
      : result.reason === 'evidence_not_found'
        ? 404
        : result.reason === 'evidence_engagement_mismatch'
          ? 404
          : result.reason === 'write_failed'
            ? 500
            : 400;
    return NextResponse.json(
      { ok: false, reason: result.reason, message: result.message },
      { status, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  return NextResponse.json(
    { ok: true, evidence: result.evidence },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  );
}
