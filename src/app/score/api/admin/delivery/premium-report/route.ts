import { NextResponse } from 'next/server';
import { getRc1OperationFreezeResponse } from '@/lib/rc1/operation-freeze';
import { getAdminSession } from '@/lib/auth/admin-route';
import { Phase14AuthorizationError } from '@/lib/reports/phase14-security';
import { initiatePremiumReportDelivery, PremiumReportAdminInitiationError } from '@/lib/reports/email/premium-report-admin-initiation';
import { premiumReportAdminInitiationInputSchema } from '@/lib/reports/email/premium-report-admin-initiation-policy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function noStore() {
  return { 'Cache-Control': 'no-store' };
}
export async function POST(request: Request) {
  const frozen = await getRc1OperationFreezeResponse('delivery');
  if (frozen) return frozen;

  const admin = await getAdminSession();
  if (!admin) {
    return NextResponse.json({ ok: false, reason: 'authentication_required', message: 'Authentication is required.' }, { status: 401, headers: noStore() });
  }
  if (admin.role !== 'platform_admin') {
    return NextResponse.json({ ok: false, reason: 'platform_admin_required', message: 'Only a platform administrator may initiate certification delivery.' }, { status: 403, headers: noStore() });
  }

  const body = await request.json().catch(() => null);
  const parsed = premiumReportAdminInitiationInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, reason: 'invalid_input', message: 'A strictly validated order selector and report selector are required.' }, { status: 400, headers: noStore() });
  }

  try {
    const result = await initiatePremiumReportDelivery(parsed.data, admin);
    return NextResponse.json({ ok: true, ...result }, { status: result.inProgress ? 202 : 200, headers: noStore() });
  } catch (error) {
    if (error instanceof Phase14AuthorizationError) {
      const isAal2 = error.reason.includes('aal2');
      return NextResponse.json({
        ok: false,
        reason: isAal2 ? 'aal2_required' : error.reason,
        message: isAal2 ? 'An active AAL2 platform-admin session is required.' : 'The delivery action is not authorised.'
      }, { status: 403, headers: noStore() });
    }
    if (error instanceof PremiumReportAdminInitiationError) {
      return NextResponse.json({ ok: false, reason: error.reason, message: error.message }, { status: error.status, headers: noStore() });
    }
    console.error('premium_report_admin_delivery', { outcome: 'refused', errorCategory: 'unexpected_initiation_failure' });
    return NextResponse.json({ ok: false, reason: 'delivery_initiation_failed', message: 'The delivery request could not be completed.' }, { status: 500, headers: noStore() });
  }
}
