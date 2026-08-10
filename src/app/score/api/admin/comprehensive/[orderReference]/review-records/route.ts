import { NextResponse } from 'next/server';
import { getRc1OperationFreezeResponse } from '@/lib/rc1/operation-freeze';
import { getAdminSession } from '@/lib/auth/admin-route';
import { canReviewComprehensiveEvidence } from '@/lib/comprehensive/evidence-service';
import { getEngagementByOrderReference } from '@/lib/comprehensive/engagement-service';
import { listComprehensiveReviewRecords, upsertComprehensiveReviewRecord } from '@/lib/comprehensive/review-record-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function GET(_request: Request, props: { params: Promise<{ orderReference: string }> }) {
  const params = await props.params;
  const admin = await getAdminSession();
  if (!admin || !canReviewComprehensiveEvidence(admin.role)) return json({ ok: false, reason: 'forbidden' }, 403);
  const engagement = await getEngagementByOrderReference(params.orderReference);
  if (!engagement) return json({ ok: false, reason: 'engagement_not_found' }, 404);
  try {
    return json({ ok: true, engagementId: engagement.id, records: await listComprehensiveReviewRecords(engagement.id) });
  } catch (error) {
    return json({ ok: false, reason: 'read_failed', message: error instanceof Error ? error.message : String(error) }, 500);
  }
}

export async function POST(request: Request, props: { params: Promise<{ orderReference: string }> }) {
  const params = await props.params;
  const frozen = await getRc1OperationFreezeResponse('quality_review');
  if (frozen) return frozen;
  const admin = await getAdminSession();
  if (!admin || !canReviewComprehensiveEvidence(admin.role)) return json({ ok: false, reason: 'forbidden' }, 403);
  const engagement = await getEngagementByOrderReference(params.orderReference);
  if (!engagement) return json({ ok: false, reason: 'engagement_not_found' }, 404);
  const body = await request.json().catch(() => ({} as Record<string, unknown>));
  const recordType = body.recordType;
  const allowed = ['finding', 'risk', 'control_design', 'decision', 'management_action'];
  if (!allowed.includes(String(recordType)) || typeof body.subjectKey !== 'string' || typeof body.reviewerConclusion !== 'string') {
    return json({ ok: false, reason: 'invalid_record', message: 'recordType, subjectKey and reviewerConclusion are required.' }, 400);
  }
  const result = await upsertComprehensiveReviewRecord({
    engagementId: engagement.id,
    actor: { id: admin.id, role: admin.role },
    write: {
      recordType: recordType as 'finding' | 'risk' | 'control_design' | 'decision' | 'management_action',
      subjectKey: body.subjectKey,
      reviewerConclusion: body.reviewerConclusion,
      reviewerObservation: typeof body.reviewerObservation === 'string' ? body.reviewerObservation : null,
      evidenceRefs: Array.isArray(body.evidenceRefs) ? body.evidenceRefs.filter((value: unknown): value is string => typeof value === 'string') : [],
      decisionOptions: Array.isArray(body.decisionOptions) ? body.decisionOptions.filter((value: unknown): value is string => typeof value === 'string') : [],
      managementAction: body.managementAction && typeof body.managementAction === 'object' && !Array.isArray(body.managementAction) ? body.managementAction as Record<string, unknown> : {},
      expectedVersion: typeof body.expectedVersion === 'number' ? body.expectedVersion : null
    }
  });
  if (!result.ok) {
    const status = result.reason === 'forbidden' ? 403 : result.reason === 'engagement_not_found' ? 404 : result.reason.includes('concurrent') ? 409 : 400;
    return json(result, status);
  }
  return json(result);
}
