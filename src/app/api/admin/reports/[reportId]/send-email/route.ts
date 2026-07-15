import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/admin-route';
import {
  authorizeBouncedReportRedelivery,
  deliverPremiumReportEmail
} from '@/lib/reports/email/report-delivery';
import { Phase14AuthorizationError } from '@/lib/reports/phase14-security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { reportId: string } }) {
  const admin = await getAdminSession();
  if (!admin || !['platform_admin', 'approver'].includes(admin.role)) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  const contentType = request.headers.get('content-type') ?? '';
  const submitted = contentType.includes('application/json')
    ? await request.json().catch(() => ({})) as Record<string, unknown>
    : Object.fromEntries(await request.formData());
  const action = typeof submitted.action === 'string' ? submitted.action : 'send';

  try {
    if (action === 'authorize_bounce_retry') {
      const result = await authorizeBouncedReportRedelivery({
        priorEmailEventId: String(submitted.priorEmailEventId ?? ''),
        verificationId: String(submitted.contactVerificationId ?? ''),
        reason: String(submitted.reason ?? '')
      });
      return NextResponse.json({ ok: true, result }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (!['send', 'send_bounce_retry'].includes(action)) {
      return NextResponse.json({ ok: false, error: 'invalid_delivery_action' }, { status: 400 });
    }
    const remediationId = action === 'send_bounce_retry'
      ? String(submitted.bounceRemediationId ?? '').trim()
      : '';
    if (action === 'send_bounce_retry' && !remediationId) {
      return NextResponse.json({ ok: false, error: 'bounce_remediation_required' }, { status: 400 });
    }
    const result = await deliverPremiumReportEmail({
      reportId: params.reportId,
      bounceRetry: remediationId ? { remediationId } : undefined,
      actor: {
        actorType: 'admin',
        userId: admin.id,
        action: remediationId ? 'admin_resend' : 'admin_send'
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
