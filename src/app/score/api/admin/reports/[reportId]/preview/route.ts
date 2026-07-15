import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/admin-route';
import { createSecurePhase1ReportAccess, ReportAccessError } from '@/lib/reports/phase1-report-access';

export const dynamic = 'force-dynamic';
const REPORT_PREVIEW_ROLES = new Set(['platform_admin', 'reviewer', 'approver', 'read_only_admin']);

export async function GET(request: Request, { params }: { params: { reportId: string } }) {
  const admin = await getAdminSession();
  if (!admin) return NextResponse.json({ ok: false, reason: 'permission_denied', message: 'Authentication is required.' }, { status: 401 });
  if (!REPORT_PREVIEW_ROLES.has(admin.role)) {
    return NextResponse.json({ ok: false, reason: 'permission_denied', message: 'Your role cannot preview reports.' }, { status: 403 });
  }
  const orderReference = new URL(request.url).searchParams.get('order') ?? '';
  try {
    const result = await createSecurePhase1ReportAccess({
      reportId: params.reportId,
      orderReference,
      adminId: admin.id,
      mode: 'preview'
    });
    if (request.headers.get('accept')?.includes('text/html')) return NextResponse.redirect(result.url, { status: 303 });
    return NextResponse.json({ ok: true, ...result }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const mapped = error instanceof ReportAccessError
      ? error
      : new ReportAccessError('signed_link_creation_failed', 'Secure report access failed.', 500, 'unavailable');
    return NextResponse.json({
      ok: false,
      reason: mapped.reason,
      message: mapped.message,
      technicalReference: mapped.technicalReference
    }, { status: mapped.status, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
