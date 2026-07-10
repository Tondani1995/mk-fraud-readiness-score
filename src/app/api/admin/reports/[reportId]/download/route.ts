import { NextResponse } from 'next/server';
import { trackAssessmentEvent } from '@/lib/analytics/assessment-events';
import { getAdminSession } from '@/lib/auth/admin-route';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

const REPORT_DOWNLOAD_ROLES = new Set(['platform_admin', 'reviewer', 'approver', 'read_only_admin']);

type HandlerContext = { params: { reportId: string } };

export async function GET(request: Request, context: HandlerContext) {
  const admin = await getAdminSession();
  if (!admin || !REPORT_DOWNLOAD_ROLES.has(admin.role)) return NextResponse.json({ ok: false, reason: 'forbidden' }, { status: 403 });

  const supabase = createSupabaseServiceClient();
  const { reportId } = context.params;

  const { data: report, error } = await supabase
    .from('reports')
    .select('id, assessment_id, order_id, storage_bucket, storage_path, report_reference, status')
    .eq('id', reportId)
    .maybeSingle();

  if (error || !report) return NextResponse.json({ ok: false, reason: 'report_not_found' }, { status: 404 });
  if (!report.storage_bucket || !report.storage_path) return NextResponse.json({ ok: false, reason: 'report_not_generated' }, { status: 409 });

  const { data: signed, error: signError } = await supabase.storage.from(report.storage_bucket).createSignedUrl(report.storage_path, 300);

  await supabase.from('report_events').insert({
    report_id: report.id,
    event_type: 'download_requested',
    actor_user_id: admin.id,
    note: signError ? `Signed URL creation failed: ${signError.message}` : 'Signed URL issued.',
    metadata_json: { signed_url_ttl_seconds: 300 }
  });

  await supabase.from('audit_logs').insert({
    actor_type: 'admin',
    actor_user_id: admin.id,
    entity_table: 'reports',
    entity_id: report.id,
    action: 'report_download_requested',
    after_json: { success: !signError }
  });

  if (signError || !signed) return NextResponse.json({ ok: false, reason: 'signed_url_failed' }, { status: 500 });

  await trackAssessmentEvent({
    eventType: 'admin_report_downloaded',
    assessmentId: report.assessment_id,
    orderId: report.order_id,
    reportId: report.id,
    metadata: {
      report_reference: report.report_reference,
      signed_url_ttl_seconds: 300
    }
  });

  if (request.headers.get('accept')?.includes('text/html')) return NextResponse.redirect(signed.signedUrl, { status: 303 });
  return NextResponse.json({ ok: true, url: signed.signedUrl, reportReference: report.report_reference });
}
