import { NextResponse } from 'next/server';
import { getRc1OperationFreezeResponse } from '@/lib/rc1/operation-freeze';
import { getAdminSession } from '@/lib/auth/admin-route';
import { isAutomatedComprehensiveOrder, AUTOMATED_COMPREHENSIVE_ROUTE_RETIRED } from '@/lib/commercial/legacy-comprehensive-admin-route';
import { getEngagementByOrderReference } from '@/lib/comprehensive/engagement-service';
import { finaliseComprehensiveArtifactSet } from '@/lib/comprehensive/artifact-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, props: { params: Promise<{ orderReference: string }> }) {
  const params = await props.params;
  const frozen = await getRc1OperationFreezeResponse('quality_review');
  if (frozen) return frozen;
  const admin = await getAdminSession();
  if (!admin || !['platform_admin', 'approver'].includes(admin.role)) return NextResponse.json({ ok: false, reason: 'forbidden' }, { status: 403, headers: { 'Cache-Control': 'no-store' } });
  if (await isAutomatedComprehensiveOrder(params.orderReference)) return NextResponse.json({ ok: false, reason: AUTOMATED_COMPREHENSIVE_ROUTE_RETIRED }, { status: 410, headers: { 'Cache-Control': 'no-store' } });
  const engagement = await getEngagementByOrderReference(params.orderReference);
  if (!engagement) return NextResponse.json({ ok: false, reason: 'engagement_not_found' }, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  const body = await request.json().catch(() => ({}));
  const version = Number(body.artifactVersion ?? engagement.signedOffArtifactVersion ?? 0);
  const reportId = String(body.reportId ?? '');
  if (!/^[0-9a-f-]{36}$/i.test(reportId) || !Number.isInteger(version) || version < 1) return NextResponse.json({ ok: false, reason: 'manifest_required', message: 'The exact generated report and signed-off artifact version are required.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  try {
    const result = await finaliseComprehensiveArtifactSet({ engagementId: engagement.id, reportId, artifactVersion: version, actorAdminUserId: admin.id });
    return NextResponse.json({ ok: true, release: result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ ok: false, reason: 'release_failed', message: error instanceof Error ? error.message : 'Release failed closed.' }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
  }
}
