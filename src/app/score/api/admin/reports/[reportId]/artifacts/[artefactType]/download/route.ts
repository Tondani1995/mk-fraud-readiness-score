import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/admin-route';
import { ReportAccessError } from '@/lib/reports/phase1-report-access';
import { createSecurePhase1SupportingRegisterAccess } from '@/lib/reports/phase1-artifact-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DOWNLOAD_ROLES = new Set(['platform_admin', 'reviewer', 'approver', 'read_only_admin']);

export async function GET(
  request: Request,
  props: { params: Promise<{ reportId: string; artefactType: string }> }
) {
  const params = await props.params;
  const admin = await getAdminSession();
  if (!DOWNLOAD_ROLES.has(admin.role)) {
    return NextResponse.json({ ok: false, reason: 'permission_denied', message: 'Your role cannot download report files.' }, {
      status: 403,
      headers: { 'Cache-Control': 'private, no-store' }
    });
  }
  if (params.artefactType !== 'supporting_register') {
    return NextResponse.json({ ok: false, reason: 'artefact_not_supported', message: 'This report file is not available through the controlled access path.' }, {
      status: 404,
      headers: { 'Cache-Control': 'private, no-store' }
    });
  }

  const orderReference = new URL(request.url).searchParams.get('order') ?? '';
  try {
    const result = await createSecurePhase1SupportingRegisterAccess({
      reportId: params.reportId,
      orderReference,
      adminId: admin.id,
      mode: 'download'
    });
    if (request.headers.get('accept')?.includes('text/html')) {
      const response = NextResponse.redirect(result.url, { status: 303 });
      response.headers.set('Cache-Control', 'private, no-store');
      return response;
    }
    return NextResponse.json({ ok: true, ...result }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const mapped = error instanceof ReportAccessError
      ? error
      : new ReportAccessError('signed_link_creation_failed', 'Secure workbook access failed.', 500, 'unavailable');
    return NextResponse.json({
      ok: false,
      reason: mapped.reason,
      message: mapped.message,
      technicalReference: mapped.technicalReference
    }, { status: mapped.status, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
