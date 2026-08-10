import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/admin-route';
import {
  canReadComprehensiveEngagement,
  getEngagementByOrderReference
} from '@/lib/comprehensive/engagement-service';
import { canReviewComprehensiveEvidence, listEngagementEvidence } from '@/lib/comprehensive/evidence-service';
import { allowedNextStates } from '@/lib/commercial/comprehensive-lifecycle';
import { listComprehensiveReviewRecords } from '@/lib/comprehensive/review-record-service';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { loadComprehensiveSubjectAuthority } from '@/lib/reports/comprehensive/subject-authority';

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
  let subjectAuthority = null;
  if (canReviewComprehensiveEvidence(admin.role)) {
    try {
      subjectAuthority = await loadComprehensiveSubjectAuthority(engagement.orderReference);
    } catch (error) {
      return NextResponse.json(
        { ok: false, reason: 'subject_authority_unavailable', message: error instanceof Error ? error.message : 'The persisted analytical universe could not be loaded.' },
        { status: 503, headers: { 'Cache-Control': 'no-store' } }
      );
    }
  }
  const db = createSupabaseServiceClient() as any;
  const [{ data: reviewers }, { data: reports }, { data: order }] = await Promise.all([
    db.from('admin_profiles').select('id,full_name,email,role').eq('status', 'active').in('role', ['platform_admin', 'reviewer', 'approver']).order('full_name', { ascending: true }),
    db.from('reports').select('id,report_reference,version_number,status,storage_status,file_name,mime_type,file_size_bytes').eq('order_id', engagement.orderId).eq('report_type', 'mk_validated').order('version_number', { ascending: false }),
    db.from('orders').select('status,amount_cents,currency,verified_at,verified_by').eq('id', engagement.orderId).maybeSingle()
  ]);
  const reportIds = (reports ?? []).map((report: any) => report.id);
  const { data: artifacts } = reportIds.length
    ? await db.from('report_artifacts').select('report_id,artefact_type,file_name,mime_type,file_size_bytes,storage_status,release_state,artifact_version').in('report_id', reportIds).order('artefact_type', { ascending: true })
    : { data: [] };

  return NextResponse.json(
    {
      ok: true,
      engagement,
      allowedNextStates: allowedNextStates(engagement.state),
      evidence: evidence?.ok ? evidence.evidence : null,
      reviewRecords,
      subjectAuthority,
      reviewers: reviewers ?? [],
      reports: reports ?? [],
      artifacts: artifacts ?? [],
      order: order ?? null
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  );
}
