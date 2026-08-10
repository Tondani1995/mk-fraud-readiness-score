import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/admin-route';
import {
  canReadComprehensiveEngagement,
  getEngagementByOrderReference
} from '@/lib/comprehensive/engagement-service';
import { canReviewComprehensiveEvidence, listEngagementEvidence } from '@/lib/comprehensive/evidence-service';
import { allowedNextStates } from '@/lib/commercial/comprehensive-lifecycle';
import { listComprehensiveReviewRecords } from '@/lib/comprehensive/review-record-service';

// Reviewer/admin read surface for one Comprehensive engagement. Evidence metadata is included only
// for roles permitted to review it; finance and read-only administrators see the engagement state
// without the evidence list.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, props: { params: Promise<{ orderReference: string }> }) {
  const params = await props.params;
  const admin = await getAdminSession();
  if (!admin || !canReadComprehensiveEngagement(admin.role)) {
    return NextResponse.json({ ok: false, reason: 'forbidden' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  }

  const engagement = await getEngagementByOrderReference(params.orderReference);
  if (!engagement) {
    return NextResponse.json(
      { ok: false, reason: 'engagement_not_found' },
      { status: 404, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const evidence = canReviewComprehensiveEvidence(admin.role)
    ? await listEngagementEvidence({ engagementId: engagement.id, actorRole: admin.role })
    : null;
  const reviewRecords = canReviewComprehensiveEvidence(admin.role)
    ? await listComprehensiveReviewRecords(engagement.id)
    : null;

  return NextResponse.json(
    {
      ok: true,
      engagement,
      allowedNextStates: allowedNextStates(engagement.state),
      evidence: evidence?.ok ? evidence.evidence : null,
      reviewRecords
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  );
}
