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
import { createSupabaseServiceClient } from '@/lib/supabase/server';

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
    } catch (settleError) {
      // M5: this is the double-fault case -- the durable start() call itself was already
      // ambiguous, and the follow-up attempt to durably record that ambiguity ALSO failed. The
      // outbox row remains stuck in 'acceptance_uncertain' with no durable trace of why the
      // reconciliation attempt failed, which previously left an operator with only the outbox row
      // itself and no diagnostic signal. This must never log the worker attestation, its HMAC
      // signature, or the raw workflow input (durableInput may carry evidence-pack content) --
      // only stable, non-sensitive identifiers and the settle error's message.
      const settleMessage = settleError instanceof Error ? settleError.message : String(settleError ?? 'unknown');
      console.error('phase14_workflow_start_double_fault', {
        fulfilmentId,
        outboxId: claimed.outbox_id,
        capabilityId: input.generationAuthorization.capabilityId,
        startError: message,
        settleError: settleMessage
      });
      try {
        const alertDb = createSupabaseServiceClient() as any;
        await alertDb.rpc('record_phase14_operational_alert', {
          p_alert_key: `workflow-start-double-fault:${claimed.outbox_id}`,
          p_category: 'workflow_start_double_fault',
          p_severity: 'critical',
          p_report_id: null,
          p_email_event_id: null,
          p_detail_json: {
            fulfilment_id: fulfilmentId,
            outbox_id: claimed.outbox_id,
            start_error: message,
            settle_error: settleMessage
          }
        });
      } catch {
        // Best-effort only -- the console.error above is the guaranteed signal; the alert RPC
        // itself must never be allowed to throw a third time out of this catch block.
      }
    }
    return {
      ok: false,
      started: false,
      error: 'phase14_workflow_start_acceptance_uncertain'
    };
  }
}
