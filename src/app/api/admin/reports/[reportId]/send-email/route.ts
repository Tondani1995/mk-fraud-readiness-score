import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/admin-route';
import { deliverPremiumReportEmail } from '@/lib/reports/email/report-delivery';
import { Phase14AuthorizationError } from '@/lib/reports/phase14-security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { reportId: string } }) {
  const admin = await getAdminSession();
  if (!admin || !['platform_admin', 'approver'].includes(admin.role)) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  const contentType = request.headers.get('content-type') ?? '';
  let forceResend = false;

  if (contentType.includes('application/json')) {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    forceResend = body.forceResend === true;
  } else {
    const form = await request.formData();
    forceResend = form.get('forceResend') === 'true';
  }

  try {
    const result = await deliverPremiumReportEmail({
      reportId: params.reportId,
      forceResend,
      actor: {
        actorType: 'admin',
        userId: admin.id,
        action: forceResend ? 'admin_resend' : 'admin_send'
      }
    });
    return NextResponse.json({ ok: true, result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Report email could not be sent.';
    const authorizationError = error instanceof Phase14AuthorizationError;
    return NextResponse.json({
      ok: false,
      error: authorizationError ? error.reason : 'email_send_failed',
      message
    }, {
      status: authorizationError ? (error.reason === 'phase14_security_gate_unsatisfied' ? 503 : 403) : 500
    });
  }
}
