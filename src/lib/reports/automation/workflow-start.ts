import { start } from 'workflow/api';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import {
  premiumReportFulfilmentWorkflow,
  type PremiumReportFulfilmentWorkflowInput
} from '@/workflows/premium-report-fulfilment';

export type StartPremiumReportWorkflowResult =
  | { ok: true; started: true; runId: string }
  | { ok: true; started: false; runId: string | null; status: string }
  | { ok: false; started: false; error: string };

export async function startPremiumReportWorkflow(
  input: PremiumReportFulfilmentWorkflowInput
): Promise<StartPremiumReportWorkflowResult> {
  const db = createSupabaseServiceClient() as any;
  const fulfilmentId = input.fulfilmentId;
  const durableInput: PremiumReportFulfilmentWorkflowInput = {
    fulfilmentId,
    generationCapabilityId: input.generationCapabilityId,
    deliveryCapabilityId: input.deliveryCapabilityId ?? null
  };

  const { error: capabilityError } = await db.rpc('claim_phase14_worker_operation', {
    p_capability_id: input.generationCapabilityId,
    p_lease_owner: `workflow:${input.generationCapabilityId}`
  });
  if (capabilityError) return { ok: false, started: false, error: capabilityError.message };

  const { data: claimed, error: claimError } = await db.rpc('claim_premium_report_workflow_start', {
    p_capability_id: input.generationCapabilityId,
    p_fulfilment_id: fulfilmentId
  });

  if (claimError) return { ok: false, started: false, error: claimError.message };

  if (!claimed?.claimed) {
    const { data: existing, error: existingError } = await db
      .from('report_fulfilments')
      .select('workflow_run_id,workflow_start_status')
      .eq('id', fulfilmentId)
      .maybeSingle();

    if (existingError) return { ok: false, started: false, error: existingError.message };
    if (!existing) return { ok: false, started: false, error: 'Fulfilment was not found.' };

    return {
      ok: true,
      started: false,
      runId: existing.workflow_run_id ?? null,
      status: existing.workflow_start_status
    };
  }

  try {
    const run = await start(premiumReportFulfilmentWorkflow, [durableInput]);
    const { error: updateError } = await db.rpc('record_premium_report_workflow_start', {
      p_capability_id: input.generationCapabilityId,
      p_fulfilment_id: fulfilmentId,
      p_started: true,
      p_workflow_run_id: run.runId,
      p_error: null
    });

    if (updateError) {
      console.error('Premium report workflow started but run metadata could not be persisted.', {
        fulfilmentId,
        runId: run.runId,
        message: updateError.message
      });
    }

    return { ok: true, started: true, runId: run.runId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? 'Workflow could not be started.');
    await db.rpc('record_premium_report_workflow_start', {
      p_capability_id: input.generationCapabilityId,
      p_fulfilment_id: fulfilmentId,
      p_started: false,
      p_workflow_run_id: null,
      p_error: message
    });

    return { ok: false, started: false, error: message };
  }
}
