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

  const { data: claimed, error: claimError } = await db
    .from('report_fulfilments')
    .update({
      workflow_start_status: 'starting',
      workflow_start_error: null
    })
    .eq('id', fulfilmentId)
    .is('workflow_run_id', null)
    .in('workflow_start_status', ['not_started', 'failed'])
    .select('id,workflow_run_id,workflow_start_status')
    .maybeSingle();

  if (claimError) return { ok: false, started: false, error: claimError.message };

  if (!claimed) {
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
    const run = await start(premiumReportFulfilmentWorkflow, [input]);
    const now = new Date().toISOString();
    const { error: updateError } = await db
      .from('report_fulfilments')
      .update({
        workflow_start_status: 'started',
        workflow_run_id: run.runId,
        workflow_started_at: now,
        workflow_start_error: null
      })
      .eq('id', fulfilmentId)
      .eq('workflow_start_status', 'starting');

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
    await db
      .from('report_fulfilments')
      .update({
        workflow_start_status: 'failed',
        workflow_start_error: message,
        last_error_code: 'workflow_start_failed',
        last_error_message: message
      })
      .eq('id', fulfilmentId)
      .eq('workflow_start_status', 'starting');

    return { ok: false, started: false, error: message };
  }
}
