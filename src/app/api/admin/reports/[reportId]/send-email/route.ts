import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/admin-route';
import { deliverPremiumReportEmail } from '@/lib/reports/email/report-delivery';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { reportId: string } }) {
  const admin = await getAdminSession();
  if (!admin || !['platform_admin', 'approver'].includes(admin.role)) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  const contentType = request.headers.get('content-type') ?? '';
  let forceResend = false;
  let recipientOverride: string | null = null;

  if (contentType.includes('application/json')) {
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    forceResend = body.forceResend === true;
    recipientOverride = typeof body.recipientOverride === 'string' ? body.recipientOverride : null;
  } else {
    const form = await request.formData();
    forceResend = form.get('forceResend') === 'true';
    recipientOverride = typeof form.get('recipientOverride') === 'string'
      ? String(form.get('recipientOverride'))
      : null;
  }

  try {
    const result = await deliverPremiumReportEmail({
      reportId: params.reportId,
      forceResend,
      recipientOverride,
      actor: {
        actorType: 'admin',
        userId: admin.id,
        action: forceResend ? 'admin_resend' : 'admin_send'
      }
    });
    return NextResponse.json({ ok: true, result }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Report email could not be sent.';
    return NextResponse.json({ ok: false, error: 'email_send_failed', message }, { status: 500 });
  }
}
