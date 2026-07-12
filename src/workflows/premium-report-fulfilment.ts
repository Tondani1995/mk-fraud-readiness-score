import { FatalError } from 'workflow';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { processPremiumReportFulfilment } from '@/lib/reports/automation/processor';

export async function premiumReportFulfilmentWorkflow(fulfilmentId: string) {
  'use workflow';

  await validateFulfilmentStep(fulfilmentId);
  const report = await generateAndStoreReportStep(fulfilmentId);
  await verifyDeliveryReadyStep(fulfilmentId, report.reportId);

  return report;
}

async function validateFulfilmentStep(fulfilmentId: string) {
  'use step';

  const db = createSupabaseServiceClient() as any;
  const { data, error } = await db
    .from('report_fulfilments')
    .select('id,status,order_id,assessment_id,score_run_id')
    .eq('id', fulfilmentId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new FatalError(`Fulfilment ${fulfilmentId} was not found.`);
  if (data.status === 'cancelled') throw new FatalError(`Fulfilment ${fulfilmentId} is cancelled.`);
  if (!data.order_id || !data.assessment_id || !data.score_run_id) {
    throw new FatalError(`Fulfilment ${fulfilmentId} is missing its persisted source references.`);
  }

  return { fulfilmentId: data.id, status: data.status };
}

async function generateAndStoreReportStep(fulfilmentId: string) {
  'use step';
  return processPremiumReportFulfilment({ fulfilmentId });
}

async function verifyDeliveryReadyStep(fulfilmentId: string, reportId: string) {
  'use step';

  const db = createSupabaseServiceClient() as any;
  const { data: fulfilment, error: fulfilmentError } = await db
    .from('report_fulfilments')
    .select('status,report_id,current_step')
    .eq('id', fulfilmentId)
    .maybeSingle();
  if (fulfilmentError) throw fulfilmentError;
  if (!fulfilment) throw new FatalError(`Fulfilment ${fulfilmentId} disappeared after report generation.`);

  const { data: report, error: reportError } = await db
    .from('reports')
    .select('id,status,storage_bucket,storage_path,checksum')
    .eq('id', reportId)
    .maybeSingle();
  if (reportError) throw reportError;
  if (!report) throw new Error(`Generated report ${reportId} is not yet visible.`);

  if (
    fulfilment.status !== 'ready_for_delivery'
    || fulfilment.report_id !== report.id
    || !report.storage_bucket
    || !report.storage_path
    || !report.checksum
  ) {
    throw new Error(`Fulfilment ${fulfilmentId} has not reached a complete delivery-ready state.`);
  }

  return {
    fulfilmentId,
    reportId: report.id,
    status: fulfilment.status,
    currentStep: fulfilment.current_step
  };
}
