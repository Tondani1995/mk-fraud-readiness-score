import { NextResponse } from 'next/server';
import {
  initiatePremiumReportDevelopmentDelivery,
  PremiumReportAdminInitiationError
} from '@/lib/reports/email/premium-report-preview-development';
import { premiumReportAdminInitiationInputSchema } from '@/lib/reports/email/premium-report-admin-initiation-policy';
import { isPremiumReportDevelopmentMode } from '@/lib/reports/email/premium-report-development-mode';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function noStore() {
  return { 'Cache-Control': 'no-store' };
}

export async function POST(request: Request) {
  if (!isPremiumReportDevelopmentMode()) {
    return NextResponse.json({
      ok: false,
      reason: 'development_mode_required',
      message: 'Preview development delivery mode is not enabled for the staging project.'
    }, { status: 403, headers: noStore() });
  }

  const body = await request.json().catch(() => null);
  const parsed = premiumReportAdminInitiationInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, reason: 'invalid_input', message: 'A strictly validated order selector and report selector are required.' }, { status: 400, headers: noStore() });
  }

  try {
    const result = await initiatePremiumReportDevelopmentDelivery(parsed.data);
    return NextResponse.json({ ok: true, ...result }, { status: result.inProgress ? 202 : 200, headers: noStore() });
  } catch (error) {
    if (error instanceof PremiumReportAdminInitiationError) {
      return NextResponse.json({ ok: false, reason: error.reason, message: error.message }, { status: error.status, headers: noStore() });
    }
    console.error('premium_report_preview_development_delivery', { outcome: 'refused', errorCategory: 'unexpected_initiation_failure' });
    return NextResponse.json({ ok: false, reason: 'delivery_initiation_failed', message: 'The delivery request could not be completed.' }, { status: 500, headers: noStore() });
  }
}
