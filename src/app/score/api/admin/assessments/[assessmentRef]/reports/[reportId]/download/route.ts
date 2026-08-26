import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/admin-route';
import {
  AssessmentReportAccessError,
  createSecureAssessmentAdminReportAccess
} from '@/lib/reports/assessment-report-access';

export const dynamic = 'force-dynamic';

const DOWNLOAD_ROLES = new Set(['platform_admin', 'reviewer', 'approver', 'read_only_admin']);

export async function GET(
  request: Request,
  props: { params: Promise<{ assessmentRef: string; reportId: string }> }
) {
  const params = await props.params;
  // The controlled Staging/Preview console is intentionally deployment-link accessible per the
  // current owner decision. The shared private-storage/checksum path remains unchanged.
  const admin = await getAdminSession();
  if (!DOWNLOAD_ROLES.has(admin.role)) {
    return NextResponse.json({ ok: false, reason: 'permission_denied', message: 'Your role cannot download reports.' }, {
      status: 403,
      headers: { 'Cache-Control': 'private, no-store' }
    });
  }

  try {
    const result = await createSecureAssessmentAdminReportAccess({
      assessmentReference: params.assessmentRef,
      reportId: params.reportId,
      adminId: admin.id,
      mode: 'download'
    });
    if (request.headers.get('accept')?.includes('text/html')) {
      const response = NextResponse.redirect(result.url, { status: 303 });
      response.headers.set('Cache-Control', 'private, no-store');
      return response;
    }
    return NextResponse.json({ ok: true, ...result }, {
      headers: { 'Cache-Control': 'private, no-store' }
    });
  } catch (error) {
    const mapped = error instanceof AssessmentReportAccessError
      ? error
      : new AssessmentReportAccessError('signed_link_creation_failed', 'Secure report access failed.', 500, 'unavailable');
    return NextResponse.json({
      ok: false,
      reason: mapped.reason,
      message: mapped.message,
      technicalReference: mapped.technicalReference
    }, { status: mapped.status, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
