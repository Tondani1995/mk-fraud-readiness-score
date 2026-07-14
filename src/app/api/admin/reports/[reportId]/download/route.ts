import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/admin-route';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { downloadPremiumReport } from '@/lib/reports/premium-report-download';
import { trackAssessmentEvent } from '@/lib/analytics/assessment-events';

const REPORT_DOWNLOAD_ROLES = new Set(['platform_admin', 'reviewer', 'approver', 'read_only_admin']);

type HandlerContext = { params: { reportId: string } };

export async function GET(request: Request, context: HandlerContext) {
  const admin = await getAdminSession();
  if (!admin || !REPORT_DOWNLOAD_ROLES.has(admin.role)) return NextResponse.json({ ok: false, reason: 'forbidden' }, { status: 403 });

  const { reportId } = context.params;
  const supabase = createSupabaseServiceClient() as any;
  try {
    const { bytes, entitlement } = await downloadPremiumReport(reportId);
    await Promise.all([
      supabase.from('report_events').insert({
        report_id: reportId,
        event_type: 'download_requested',
        actor_user_id: admin.id,
        note: 'Authenticated report bytes streamed after SHA-256 verification.',
        metadata_json: { checksum: entitlement.report_checksum, size_bytes: bytes.length }
      }),
      supabase.from('audit_logs').insert({
        actor_type: 'admin', actor_user_id: admin.id, assessment_id: entitlement.assessment_id,
        entity_table: 'reports', entity_id: reportId, action: 'report_download_streamed',
        after_json: { checksum: entitlement.report_checksum, size_bytes: bytes.length }
      }),
      trackAssessmentEvent({
        eventType: 'admin_report_downloaded',
        assessmentId: entitlement.assessment_id,
        orderId: entitlement.order_id,
        reportId,
        metadata: { actor_admin_id: admin.id, checksum: entitlement.report_checksum, size_bytes: bytes.length }
      })
    ]);
    const filename = `${entitlement.report_reference.replace(/[^A-Za-z0-9._-]/g, '_')}.pdf`;
    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Length': String(bytes.length),
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Report download failed.';
    await supabase.from('audit_logs').insert({
      actor_type: 'admin', actor_user_id: admin.id, entity_table: 'reports', entity_id: reportId,
      action: 'report_download_denied', after_json: { reason: message }
    }).catch(() => null);
    return NextResponse.json({ ok: false, reason: 'download_denied', message }, { status: 409 });
  }
}
