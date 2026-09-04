import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { requireAuthenticatedAdmin } from '@/lib/auth/admin-route';
import {
  assertReportAccessEligible,
  ReportAccessEligibilityError,
  resolveCurrentReportId
} from '@/lib/reports/report-access-eligibility';
import {
  issuePrivateReportSignedUrl,
  readVerifiedPrivatePdf,
  recordPrivateReportAccessEvidence,
  PrivateReportStorageError
} from '@/lib/reports/private-report-access';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ reportId: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const technicalReference = crypto.randomUUID();
  let admin;
  try {
    admin = await requireAuthenticatedAdmin(['platform_admin']);
  } catch {
    return NextResponse.json({ ok: false, reason: 'forbidden', technicalReference }, { status: 403, headers: { 'Cache-Control': 'private, no-store' } });
  }
  const { reportId } = await context.params;
  const db = createSupabaseServiceClient() as any;
  const { data: report, error: reportError } = await db.from('reports')
    .select('id,assessment_id,organisation_id,order_id,score_run_id,report_type,report_reference,version_number,status,synthetic_demonstration,synthetic_certification_ref,storage_bucket,storage_path,checksum,file_name,mime_type,file_size_bytes,storage_status')
    .eq('id', reportId)
    .maybeSingle();
  if (reportError || !report || !report.synthetic_demonstration || report.order_id
    || report.storage_status !== 'VERIFIED'
    || !['mk_validated', 'essential_self_assessment'].includes(report.report_type)) {
    return NextResponse.json({ ok: false, reason: 'synthetic_report_not_found', technicalReference }, { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
  }
  const { data: assessment, error: assessmentError } = await db.from('assessments')
    .select('id,organisation_id,current_score_run_id,synthetic_demonstration,synthetic_certification_ref')
    .eq('id', report.assessment_id)
    .maybeSingle();
  const accessInput = { db, report, adminId: admin.id, mode: 'download' as const, technicalReference };
  const fail = async (reason: string, status: number) => {
    await recordPrivateReportAccessEvidence({ ...accessInput, success: false, reason });
    return NextResponse.json({ ok: false, reason, technicalReference }, { status, headers: { 'Cache-Control': 'private, no-store' } });
  };
  if (assessmentError || !assessment || !assessment.synthetic_demonstration
    || assessment.synthetic_certification_ref !== report.synthetic_certification_ref
    || assessment.organisation_id !== report.organisation_id
    || assessment.current_score_run_id !== report.score_run_id) {
    return fail('synthetic_report_assessment_mismatch', 409);
  }
  try {
    const currentReportId = await resolveCurrentReportId(db, assessment.id, report.report_type);
    assertReportAccessEligible({
      report,
      currentReportId,
      expectedOrganisationId: assessment.organisation_id,
      actualOrganisationId: report.organisation_id,
      purpose: 'admin_download'
    });
    const expectedPrefix = report.report_type === 'mk_validated'
      ? `${assessment.organisation_id}/${assessment.id}/synthetic-comprehensive/v${report.version_number}/`
      : `${assessment.organisation_id}/${assessment.id}/v${report.version_number}/`;
    await readVerifiedPrivatePdf(db, report, expectedPrefix);
    const signedUrl = await issuePrivateReportSignedUrl(db, report, 'download');
    if (!signedUrl) return fail('signed_link_creation_failed', 500);
    const auditError = await recordPrivateReportAccessEvidence({ ...accessInput, success: true });
    if (auditError) return fail('access_audit_failed', 500);
    return NextResponse.redirect(signedUrl, { status: 307, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const reason = error instanceof ReportAccessEligibilityError
      ? error.reason
      : error instanceof PrivateReportStorageError ? error.reason : 'synthetic_report_access_failed';
    return fail(reason, reason === 'stored_file_missing' ? 404 : 409);
  }
}
