import { NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { startPremiumReportWorkflow } from '@/lib/reports/automation/workflow-start';

export const dynamic = 'force-dynamic';

const EXPECTED_BRANCH = 'phase14/autonomous-premium-report-engine';
const EXPECTED_UAT_REF = 'nlukprffbrqmvjcmygyr';
const EXPECTED_ORDER_REFERENCE = 'MKORD-2026-B8C7U5WQ';
const EXPECTED_FULFILMENT_ID = '172484f3-9fcf-4710-a657-a46faf87539e';
const AUTHORISATION_KEY = 'phase14_uat_runtime_retry';

function fail(reason: string, status = 409) {
  return NextResponse.json({ ok: false, reason }, { status });
}

export async function GET() {
  if (process.env.VERCEL_ENV !== 'preview') return fail('preview_only', 403);
  if (process.env.VERCEL_GIT_COMMIT_REF !== EXPECTED_BRANCH) return fail('wrong_branch', 403);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  if (!supabaseUrl.includes(`${EXPECTED_UAT_REF}.supabase.co`)) return fail('wrong_supabase_project', 403);

  const db = createSupabaseServiceClient() as any;

  const { data: settings, error: settingsError } = await db
    .from('app_settings')
    .select('setting_key,value_json')
    .in('setting_key', ['phase14_autonomous_report_engine', AUTHORISATION_KEY]);

  if (settingsError) return fail('settings_unavailable', 500);

  const phase14 = settings?.find((row: any) => row.setting_key === 'phase14_autonomous_report_engine')?.value_json ?? {};
  const authorisation = settings?.find((row: any) => row.setting_key === AUTHORISATION_KEY)?.value_json ?? {};

  if (phase14.premium_report_auto_fulfilment_enabled !== true) return fail('auto_fulfilment_not_enabled');
  if (phase14.premium_report_ai_narrative_enabled !== false) return fail('ai_must_remain_disabled');
  if (phase14.premium_report_auto_email_enabled !== false) return fail('email_must_remain_disabled');
  if (phase14.r50000_automation_enabled !== false) return fail('r50000_automation_must_remain_disabled');
  if (phase14.premium_report_test_recipient_override != null) return fail('test_recipient_must_remain_null');

  if (authorisation.authorised !== true || authorisation.consumed === true) return fail('retry_not_authorised', 403);
  if (authorisation.order_reference !== EXPECTED_ORDER_REFERENCE) return fail('wrong_authorised_order', 403);
  if (authorisation.fulfilment_id !== EXPECTED_FULFILMENT_ID) return fail('wrong_authorised_fulfilment', 403);
  if (typeof authorisation.expires_at !== 'string' || Date.parse(authorisation.expires_at) <= Date.now()) {
    return fail('retry_authorisation_expired', 403);
  }

  const { data: order, error: orderError } = await db
    .from('orders')
    .select('id,order_reference,status,amount_cents,currency,verified_at,product_id')
    .eq('order_reference', EXPECTED_ORDER_REFERENCE)
    .maybeSingle();

  if (orderError || !order) return fail('order_not_found', 404);
  if (order.status !== 'payment_received' || order.amount_cents !== 500000 || order.currency !== 'ZAR' || !order.verified_at) {
    return fail('order_not_eligible');
  }

  const { data: product, error: productError } = await db
    .from('products')
    .select('product_code,delivery_mode,requires_payment_verification')
    .eq('id', order.product_id)
    .maybeSingle();

  if (productError || !product) return fail('product_not_found', 404);
  if (
    product.product_code !== 'essential_self_assessment'
    || product.delivery_mode !== 'mk_controlled_pdf'
    || product.requires_payment_verification !== true
  ) return fail('product_not_eligible');

  const { data: fulfilment, error: fulfilmentError } = await db
    .from('report_fulfilments')
    .select('id,order_id,status,report_id,last_error_code,last_error_message')
    .eq('id', EXPECTED_FULFILMENT_ID)
    .maybeSingle();

  if (fulfilmentError || !fulfilment) return fail('fulfilment_not_found', 404);
  if (fulfilment.order_id !== order.id || fulfilment.report_id != null || fulfilment.status !== 'failed') {
    return fail('fulfilment_not_retryable');
  }
  if (fulfilment.last_error_code !== 'generation_failed' || !String(fulfilment.last_error_message ?? '').includes('libnspr4.so')) {
    return fail('unexpected_failure_signature');
  }

  const consumedAt = new Date().toISOString();
  const { error: consumeError } = await db
    .from('app_settings')
    .update({
      value_json: {
        ...authorisation,
        consumed: true,
        consumed_at: consumedAt
      }
    })
    .eq('setting_key', AUTHORISATION_KEY)
    .contains('value_json', { authorised: true, consumed: false });

  if (consumeError) return fail('authorisation_consume_failed', 500);

  const { data: reset, error: resetError } = await db
    .from('report_fulfilments')
    .update({
      status: 'queued',
      current_step: 'runtime_retry_approved',
      workflow_start_status: 'failed',
      workflow_run_id: null,
      workflow_started_at: null,
      workflow_start_error: null,
      last_error_code: null,
      last_error_message: null,
      failed_at: null
    })
    .eq('id', EXPECTED_FULFILMENT_ID)
    .eq('status', 'failed')
    .is('report_id', null)
    .select('id,status,workflow_start_status')
    .maybeSingle();

  if (resetError || !reset) return fail('fulfilment_reset_failed', 500);

  const workflow = await startPremiumReportWorkflow(EXPECTED_FULFILMENT_ID);
  if (!workflow.ok) return fail(`workflow_start_failed:${workflow.error}`, 500);

  return NextResponse.json({
    ok: true,
    environment: 'preview',
    supabaseProjectRef: EXPECTED_UAT_REF,
    orderReference: EXPECTED_ORDER_REFERENCE,
    fulfilmentId: EXPECTED_FULFILMENT_ID,
    workflowStarted: workflow.started,
    workflowRunId: workflow.runId,
    workflowStatus: workflow.started ? 'started' : workflow.status,
    aiEnabled: false,
    emailEnabled: false
  });
}
