import { start } from 'workflow/api';
import {
  premiumReportFulfilmentWorkflow,
  type PremiumReportFulfilmentWorkflowInput
} from '@/workflows/premium-report-fulfilment';
import {
  claimPhase14WorkerCapability,
  executePhase14WorkerStep,
  type Phase14WorkerAuthorization
} from '@/lib/reports/phase14-security';

export type StartPremiumReportWorkflowResult =
  | { ok: true; started: true; runId: string }
  | { ok: true; started: false; runId: string | null; status: string }
  | { ok: false; started: false; error: string };

export async function startPremiumReportWorkflow(
  input: {
    fulfilmentId: string;
    generationAuthorization: Phase14WorkerAuthorization;
    deliveryCapabilityId?: string | null;
  }
): Promise<StartPremiumReportWorkflowResult> {
  const fulfilmentId = input.fulfilmentId;
  const durableInput: PremiumReportFulfilmentWorkflowInput = {
    fulfilmentId,
    generationCapabilityId: input.generationAuthorization.capabilityId,
    deliveryCapabilityId: input.deliveryCapabilityId ?? null
  };
  const lease = await claimPhase14WorkerCapability(
    input.generationAuthorization,
    input.generationAuthorization.operationKey
  );
  const claimed = await executePhase14WorkerStep<Record<string, any>>(
    lease,
    'claim_premium_report_workflow_start',
    { fulfilment_id: fulfilmentId }
  );
  if (!claimed.claimed) {
    return {
      ok: true,
      started: false,
      runId: claimed.run_id ?? null,
      status: String(claimed.status)
    };
  }

  await executePhase14WorkerStep(lease, 'mark_phase14_workflow_start_dispatching', {
    outbox_id: claimed.outbox_id
  });

  try {
    const run = await start(premiumReportFulfilmentWorkflow, [durableInput]);
    const settled = await executePhase14WorkerStep<Record<string, any>>(
      lease,
      'record_premium_report_workflow_start',
      { outbox_id: claimed.outbox_id, run_id: run.runId, error: null }
    );
    if (settled.status !== 'started' || settled.run_id !== run.runId) {
      return {
        ok: false,
        started: false,
        error: 'phase14_workflow_start_run_identity_not_durable'
      };
    }
    return { ok: true, started: true, runId: run.runId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error ?? 'Workflow start response unavailable.');
    try {
      await executePhase14WorkerStep(lease, 'record_premium_report_workflow_start', {
        outbox_id: claimed.outbox_id,
        run_id: null,
        error: message
      });
    } catch {
      // The durable pre-call boundary remains acceptance_uncertain.  Never log
      // the attestation, its signature, or workflow input while reconciling.
    }
    return {
      ok: false,
      started: false,
      error: 'phase14_workflow_start_acceptance_uncertain'
    };
  }
}
