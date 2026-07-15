import { FatalError } from 'workflow';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { processPremiumReportFulfilment } from '@/lib/reports/automation/processor';
import { getPremiumReportAutomationFlags } from '@/lib/reports/automation/feature-flags';
import { deliverPremiumReportEmail } from '@/lib/reports/email/report-delivery';
import {
  claimPhase14WorkerCapability,
  type Phase14WorkerLease
} from '@/lib/reports/phase14-security';

export type PremiumReportFulfilmentWorkflowInput = {
  fulfilmentId: string;
  generationCapabilityId: string;
  deliveryCapabilityId?: string | null;
};

export async function premiumReportFulfilmentWorkflow(input: PremiumReportFulfilmentWorkflowInput) {
  'use workflow';

  await validateFulfilmentStep(input);
  const generationLease = await claimWorkerCapabilityStep(input.generationCapabilityId);
  const report = await generateAndStoreReportStep(input.fulfilmentId, generationLease);
  await verifyDeliveryReadyStep(input.fulfilmentId, report.reportId);
  const delivery = await deliverReportEmailIfEnabledStep(
    report.reportId,
    input.deliveryCapabilityId ?? null
  );

  return { ...report, delivery };
}

async function validateFulfilmentStep(input: PremiumReportFulfilmentWorkflowInput) {
  'use step';

  const db = createSupabaseServiceClient() as any;
  const { data, error } = await db
    .from('report_fulfilments')
    .select('id,status,order_id,assessment_id,score_run_id,generation_capability_id,delivery_capability_id')
    .eq('id', input.fulfilmentId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new FatalError(`Fulfilment ${input.fulfilmentId} was not found.`);
  if (data.status === 'cancelled') throw new FatalError(`Fulfilment ${input.fulfilmentId} is cancelled.`);
  if (!data.order_id || !data.assessment_id || !data.score_run_id) {
    throw new FatalError(`Fulfilment ${input.fulfilmentId} is missing its persisted source references.`);
  }
  if (data.generation_capability_id !== input.generationCapabilityId) {
    throw new FatalError(`Fulfilment ${input.fulfilmentId} is not bound to the supplied generation capability.`);
  }
  if (
    input.deliveryCapabilityId
    && data.delivery_capability_id !== input.deliveryCapabilityId
  ) {
    throw new FatalError(`Fulfilment ${input.fulfilmentId} is not bound to the supplied delivery capability.`);
  }

  return { fulfilmentId: data.id, status: data.status };
}

async function claimWorkerCapabilityStep(capabilityId: string) {
  'use step';
  return claimPhase14WorkerCapability({
    capabilityId,
    capabilityType: 'automatic_generation',
    operationKey: capabilityId,
    expiresAt: ''
  });
}

async function generateAndStoreReportStep(fulfilmentId: string, workerLease: Phase14WorkerLease) {
  'use step';
  return processPremiumReportFulfilment({ fulfilmentId, workerLease });
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

async function deliverReportEmailIfEnabledStep(
  reportId: string,
  capabilityId: string | null
) {
  'use step';

  const flags = await getPremiumReportAutomationFlags();
  if (!flags.autoEmailEnabled) {
    return { status: 'skipped', reason: 'premium_report_auto_email_disabled' } as const;
  }
  if (!capabilityId) {
    throw new FatalError('Automatic email is enabled but no human-issued delivery capability was supplied.');
  }

  const workerLease = await claimPhase14WorkerCapability({
    capabilityId,
    capabilityType: 'automatic_delivery',
    operationKey: capabilityId,
    expiresAt: ''
  });
  const result = await deliverPremiumReportEmail({
    reportId,
    workerLease,
    actor: { actorType: 'system', action: 'automatic_email' }
  });
  return result;
}
