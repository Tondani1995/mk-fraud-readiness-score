import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { getAdminSession } from '@/lib/auth/admin-route';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { assembleReportData, ReportAssemblyError } from '@/lib/reports/assemble-report-data';
import { selectContent } from '@/lib/reports/select-content-blocks';
import { selectRoadmap } from '@/lib/reports/roadmap';
import { renderReportHtml } from '@/lib/reports/templates/report-template';
import { renderHtmlToPdfBuffer } from '@/lib/reports/render-pdf';

const REPORT_GENERATION_ROLES = new Set(['platform_admin', 'reviewer', 'approver']);

const REPORT_TYPE_BY_PRODUCT_CODE: Record<string, string> = {
  essential_self_assessment: 'essential_self_assessment',
  mk_validated_assessment: 'mk_validated'
};

type HandlerContext = { params: { orderReference: string } };

function wantsHtml(request: Request) {
  return request.headers.get('accept')?.includes('text/html') ?? false;
}

function jsonOrRedirect(request: Request, orderReference: string, payload: Record<string, unknown>, status = 200) {
  if (wantsHtml(request)) {
    const url = new URL(`/score/admin/orders/${orderReference}`, request.url);
    url.searchParams.set(payload.ok ? 'report_generated' : 'report_error', String(payload.ok ? '1' : payload.reason ?? 'generation_failed'));
    return NextResponse.redirect(url, { status: 303 });
  }
  return NextResponse.json(payload, { status });
}

export async function POST(request: Request, context: HandlerContext) {
  const admin = await getAdminSession();
  const { orderReference } = context.params;

  if (!admin || !REPORT_GENERATION_ROLES.has(admin.role)) {
    return jsonOrRedirect(request, orderReference, { ok: false, reason: 'forbidden' }, 403);
  }

  const supabase = createSupabaseServiceClient();

  let assembled;
  try {
    assembled = await assembleReportData(orderReference);
  } catch (err) {
    if (err instanceof ReportAssemblyError) {
      await logReportAttempt(supabase, null, 'generation_rejected', admin.id, `${err.reason}: ${err.message}`);
      return jsonOrRedirect(request, orderReference, { ok: false, reason: err.reason, message: err.message }, err.reason === 'order_not_found' ? 404 : 409);
    }
    console.error('Unexpected error assembling report data:', err);
    return jsonOrRedirect(request, orderReference, { ok: false, reason: 'internal_error' }, 500);
  }

  const reportType = assembled.productCode ? REPORT_TYPE_BY_PRODUCT_CODE[assembled.productCode] : null;
  if (!reportType) {
    await logReportAttempt(supabase, null, 'generation_rejected', admin.id, `Unrecognised or missing product code: ${assembled.productCode ?? 'not captured'}`);
    return jsonOrRedirect(request, orderReference, { ok: false, reason: 'unrecognised_product' }, 409);
  }

  const { data: template, error: templateError } = await supabase
    .from('report_templates')
    .select('id, template_code, version_number')
    .eq('report_type', reportType)
    .eq('status', 'active')
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (templateError || !template) {
    await logReportAttempt(supabase, null, 'generation_failed', admin.id, `No active report template is configured for ${reportType}.`);
    return jsonOrRedirect(request, orderReference, { ok: false, reason: 'template_missing' }, 409);
  }

  const { data: blockRows } = await supabase
    .from('report_content_blocks')
    .select('block_key, block_type, domain_code, maturity_band, severity, title, body, status')
    .eq('status', 'active');

  const contentBlocks = (blockRows ?? []).map((block: any) => ({
    blockKey: block.block_key,
    blockType: block.block_type,
    domainCode: block.domain_code,
    maturityBand: block.maturity_band,
    severity: block.severity,
    title: block.title,
    body: block.body,
    status: block.status
  }));

  const content = selectContent(assembled, contentBlocks);
  const roadmap = selectRoadmap(assembled);
  const html = renderReportHtml(assembled, content, roadmap);
  const pdfBuffer = await renderHtmlToPdfBuffer(html);
  const checksum = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

  const { data: existingReport } = await supabase
    .from('reports')
    .select('id, version_number')
    .eq('assessment_id', assembled.scoreRun.assessmentId)
    .eq('report_type', reportType)
    .neq('status', 'superseded')
    .neq('status', 'voided')
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = existingReport ? Number(existingReport.version_number) + 1 : 1;
  const reportReference = `RPT-${assembled.assessmentReference}-V${nextVersion}`;
  const storageBucket = process.env.SUPABASE_BUCKET_REPORTS ?? 'generated-reports';
  const storagePath = `${assembled.assessmentReference}/${reportReference}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from(storageBucket)
    .upload(storagePath, pdfBuffer, { contentType: 'application/pdf', upsert: false });

  if (uploadError) {
    await logReportAttempt(supabase, null, 'generation_failed', admin.id, `Storage upload failed: ${uploadError.message}`);
    return jsonOrRedirect(request, orderReference, { ok: false, reason: 'storage_upload_failed', message: uploadError.message }, 500);
  }

  const { data: newReport, error: insertError } = await supabase
    .from('reports')
    .insert({
      assessment_id: assembled.scoreRun.assessmentId,
      order_id: assembled.orderId,
      score_run_id: assembled.scoreRun.id,
      template_id: template.id,
      report_type: reportType,
      status: 'generated',
      report_reference: reportReference,
      version_number: nextVersion,
      storage_bucket: storageBucket,
      storage_path: storagePath,
      checksum,
      generated_by: admin.id,
      generated_at: new Date().toISOString(),
      supersedes_report_id: existingReport?.id ?? null
    })
    .select('id')
    .single();

  if (insertError || !newReport) {
    await supabase.storage.from(storageBucket).remove([storagePath]);
    await logReportAttempt(supabase, null, 'generation_failed', admin.id, `reports insert failed: ${insertError?.message}`);
    return jsonOrRedirect(request, orderReference, { ok: false, reason: 'reports_insert_failed' }, 500);
  }

  if (existingReport) await supabase.from('reports').update({ status: 'superseded' }).eq('id', existingReport.id);
  await logReportAttempt(supabase, newReport.id, existingReport ? 'regenerated' : 'generated', admin.id, `Version ${nextVersion} created.`);

  return jsonOrRedirect(request, orderReference, {
    ok: true,
    reportId: newReport.id,
    reportReference,
    versionNumber: nextVersion,
    supersededReportId: existingReport?.id ?? null
  });
}

async function logReportAttempt(supabase: any, reportId: string | null, eventType: string, actorUserId: string, note: string) {
  if (reportId) {
    await supabase.from('report_events').insert({ report_id: reportId, event_type: eventType, actor_user_id: actorUserId, note, metadata_json: { phase: 'phase10_pdf_report_engine' } });
  }
  await supabase.from('audit_logs').insert({
    actor_type: 'admin',
    actor_user_id: actorUserId,
    entity_table: 'reports',
    entity_id: reportId,
    action: `report_${eventType}`,
    after_json: { note, report_generation: true }
  });
}
