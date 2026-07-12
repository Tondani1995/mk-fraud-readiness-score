import { NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function unavailable() {
  return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
}

export async function GET(request: Request) {
  if (process.env.VERCEL_ENV !== 'preview') return unavailable();

  const orderReference = new URL(request.url).searchParams.get('orderReference')?.trim() ?? '';
  if (!/^MKORD-\d{4}-[A-Z0-9]+$/.test(orderReference)) {
    return NextResponse.json({ ok: false, error: 'invalid_order_reference' }, { status: 400 });
  }

  const db = createSupabaseServiceClient() as any;
  const { data: order, error: orderError } = await db
    .from('orders')
    .select('id,assessment_id,status')
    .eq('order_reference', orderReference)
    .maybeSingle();

  if (orderError) {
    return NextResponse.json({ ok: false, error: 'order_lookup_failed', message: orderError.message }, { status: 500 });
  }
  if (!order) {
    return NextResponse.json({ ok: false, error: 'order_not_found' }, { status: 404 });
  }

  const { data: fulfilments, error: fulfilmentError } = await db
    .from('report_fulfilments')
    .select('id,status,current_step,generation_mode,attempt_count,workflow_start_status,workflow_run_id,report_id,last_error_code,last_error_message,created_at,updated_at,completed_at,failed_at')
    .eq('order_id', order.id)
    .order('created_at', { ascending: false });

  if (fulfilmentError) {
    return NextResponse.json({ ok: false, error: 'fulfilment_lookup_failed', message: fulfilmentError.message }, { status: 500 });
  }

  const fulfilmentIds = (fulfilments ?? []).map((item: any) => item.id);
  const { data: generationRuns, error: generationError } = fulfilmentIds.length
    ? await db
      .from('report_generation_runs')
      .select('id,fulfilment_id,report_id,attempt_number,generation_mode,provider,model,prompt_version,schema_version,evidence_checksum,status,validation_result_json,validation_errors_json,input_token_count,output_token_count,total_token_count,latency_ms,error_code,error_message,created_at,completed_at')
      .in('fulfilment_id', fulfilmentIds)
      .order('created_at', { ascending: true })
    : { data: [], error: null };

  if (generationError) {
    return NextResponse.json({ ok: false, error: 'generation_lookup_failed', message: generationError.message }, { status: 500 });
  }

  const { data: reports, error: reportError } = await db
    .from('reports')
    .select('id,report_reference,status,version_number,storage_bucket,storage_path,checksum,fulfilment_id,generation_run_id,created_at,released_at')
    .eq('order_id', order.id)
    .order('created_at', { ascending: true });

  if (reportError) {
    return NextResponse.json({ ok: false, error: 'report_lookup_failed', message: reportError.message }, { status: 500 });
  }

  const reportEvidence = [];
  for (const report of reports ?? []) {
    let objectExists = false;
    let pdfMagic = false;
    let objectBytes = 0;
    let objectError: string | null = null;

    if (report.storage_bucket && report.storage_path) {
      const { data: object, error: objectDownloadError } = await db.storage
        .from(report.storage_bucket)
        .download(report.storage_path);
      if (objectDownloadError || !object) {
        objectError = objectDownloadError?.message ?? 'No object returned.';
      } else {
        const buffer = Buffer.from(await object.arrayBuffer());
        objectExists = buffer.length > 0;
        objectBytes = buffer.length;
        pdfMagic = buffer.subarray(0, 4).toString('ascii') === '%PDF';
      }
    }

    reportEvidence.push({
      ...report,
      objectExists,
      objectBytes,
      pdfMagic,
      objectError
    });
  }

  const { data: emailEvents, error: emailError } = await db
    .from('email_events')
    .select('id,report_id,status,notification_type,attempt_number,provider_message_id,sent_at,delivered_at,error_message,created_at')
    .eq('order_id', order.id)
    .eq('notification_type', 'premium_report_pdf')
    .order('created_at', { ascending: true });

  if (emailError) {
    return NextResponse.json({ ok: false, error: 'email_lookup_failed', message: emailError.message }, { status: 500 });
  }

  const activeFulfilments = (fulfilments ?? []).filter((item: any) =>
    ['queued', 'assembling', 'generating', 'validating', 'rendering', 'storing', 'ready_for_delivery'].includes(item.status)
  );

  return NextResponse.json({
    ok: true,
    orderReference,
    orderStatus: order.status,
    summary: {
      fulfilmentCount: fulfilments?.length ?? 0,
      activeFulfilmentCount: activeFulfilments.length,
      workflowRunCount: new Set((fulfilments ?? []).map((item: any) => item.workflow_run_id).filter(Boolean)).size,
      generationRunCount: generationRuns?.length ?? 0,
      reportCount: reports?.length ?? 0,
      storageObjectCount: reportEvidence.filter((item) => item.objectExists).length,
      validPdfCount: reportEvidence.filter((item) => item.pdfMagic).length,
      premiumEmailEventCount: emailEvents?.length ?? 0
    },
    fulfilments: fulfilments ?? [],
    generationRuns: generationRuns ?? [],
    reports: reportEvidence,
    emailEvents: emailEvents ?? []
  }, {
    headers: { 'Cache-Control': 'no-store' }
  });
}
