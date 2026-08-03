import { NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { isPremiumReportDevelopmentMode } from '@/lib/reports/email/premium-report-development-mode';
import { reconcilePreviewResendWebhook } from '@/lib/reports/email/resend-webhook-reconciliation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  if (!isPremiumReportDevelopmentMode()) {
    return NextResponse.json({ ok: false, error: 'development_mode_required' }, { status: 404 });
  }

  const db = createSupabaseServiceClient() as any;
  const { data: claimed, error: claimError } = await db.rpc(
    'preview_development_record_resend_webhook_reconciliation',
    { p_deployment_id: process.env.VERCEL_DEPLOYMENT_ID ?? '' },
  );
  if (claimError) {
    console.error('rc1_preview_resend_reconciliation', { outcome: 'claim_failed' });
    return NextResponse.json({ ok: false, error: 'reconciliation_unavailable' }, { status: 503 });
  }
  if (claimed !== true) {
    return NextResponse.json({ ok: true, alreadyReconciled: true });
  }

  try {
    const result = await reconcilePreviewResendWebhook();
    return NextResponse.json({ ok: true, ...result });
  } catch {
    console.error('rc1_preview_resend_reconciliation', { outcome: 'provider_update_failed' });
    return NextResponse.json({ ok: false, error: 'reconciliation_failed' }, { status: 502 });
  }
}
