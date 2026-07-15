import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/admin-route';
import { downloadPremiumReport } from '@/lib/reports/premium-report-download';
import { requirePhase14Action } from '@/lib/reports/phase14-security';

const REPORT_DOWNLOAD_ROLES = new Set(['platform_admin', 'reviewer', 'approver', 'read_only_admin']);

type HandlerContext = { params: { reportId: string } };

export async function GET(request: Request, context: HandlerContext) {
  const admin = await getAdminSession();
  if (!admin || !REPORT_DOWNLOAD_ROLES.has(admin.role)) return NextResponse.json({ ok: false, reason: 'forbidden' }, { status: 403 });

  const { reportId } = context.params;
  try {
    const { bytes, entitlement, auditClient } = await downloadPremiumReport(reportId);
    const { error: recordError } = await auditClient.rpc('record_phase14_report_download', {
      p_report_id: reportId, p_success: true,
      p_detail: { checksum: entitlement.report_checksum, size_bytes: bytes.length }
    });
    if (recordError) throw recordError;
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
    await requirePhase14Action('report_download').then(({ client }) =>
      client.rpc('record_phase14_report_download', {
        p_report_id: reportId, p_success: false, p_detail: { reason: message }
      })
    ).catch(() => null);
    return NextResponse.json({ ok: false, reason: 'download_denied', message }, { status: 409 });
  }
}
