import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { recordAutomaticFulfilmentExceptionAlert } from '@/lib/notifications/phase1-order-notifications';

export type ImmediateFulfilmentDispatchInput = {
  attemptId: string;
  correlationReference: string;
};

type DispatchEvidenceOutcome = 'started' | 'succeeded' | 'failed';

type DispatchDependencies = {
  fetchImpl?: typeof fetch;
  createClient?: typeof createSupabaseServiceClient;
  env?: NodeJS.ProcessEnv;
  recordExceptionAlert?: typeof recordAutomaticFulfilmentExceptionAlert;
};

const DISPATCH_FAILURE_REQUIRED_ACTION =
  'Immediate automatic fulfilment did not start. Confirm the queued order state and use the authorised recovery procedure. Do not mark payment again.';

function exactDeploymentOrigin(env: NodeJS.ProcessEnv): string {
  const deploymentHost = env.VERCEL_URL?.trim();
  if (
    deploymentHost
    && /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.vercel\.app$/i.test(deploymentHost)
  ) {
    return `https://${deploymentHost}`;
  }
  throw new Error('exact_deployment_url_unavailable');
}

export function immediateFulfilmentDispatchPayload(input: {
  attemptId: string;
  correlationReference: string;
}) {
  return {
    attemptId: input.attemptId,
    correlationReference: input.correlationReference
  };
}

function dispatchErrorCategory(error: unknown): string {
  if (error instanceof Error) {
    if (error.message === 'exact_deployment_url_unavailable') return error.message;
    if (error.message === 'cron_secret_unavailable') return error.message;
    if (error.message === 'dispatch_evidence_start_failed') return error.message;
    if (error.message === 'worker_rejected_dispatch') return error.message;
  }
  return 'worker_dispatch_failed';
}

export async function dispatchImmediateFulfilment(
  input: ImmediateFulfilmentDispatchInput,
  dependencies: DispatchDependencies = {}
): Promise<{ ok: boolean; status: number | null; errorCategory: string | null }> {
  const db = (dependencies.createClient ?? createSupabaseServiceClient)() as any;
  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const env = dependencies.env ?? process.env;
  const recordExceptionAlert =
    dependencies.recordExceptionAlert ?? recordAutomaticFulfilmentExceptionAlert;

  async function record(
    outcome: DispatchEvidenceOutcome,
    httpStatus: number | null,
    errorCategory: string | null
  ) {
    return db.rpc('record_fulfilment_dispatch_result', {
      p_attempt_id: input.attemptId,
      p_correlation_reference: input.correlationReference,
      p_outcome: outcome,
      p_http_status: httpStatus,
      p_error_category: errorCategory
    });
  }

  async function recordFailureAlert(errorCategory: string) {
    let exceptionData: any;
    try {
      const { data, error } = await db.rpc(
        'record_automatic_fulfilment_exception',
        {
          p_attempt_id: input.attemptId,
          p_authorization_id: null,
          p_stage: 'immediate_dispatch',
          p_category: errorCategory,
          p_technical_reference: input.correlationReference,
          p_required_action: DISPATCH_FAILURE_REQUIRED_ACTION
        }
      );
      if (error || !data?.order_id) {
        throw new Error('exception_evidence_persistence_failed');
      }
      exceptionData = data;
    } catch {
      console.error('immediate_fulfilment_dispatch', {
        outcome: 'exception_evidence_failed',
        attemptId: input.attemptId,
        correlationReference: input.correlationReference,
        errorCategory: 'exception_evidence_persistence_failed'
      });
      return;
    }
    try {
      await recordExceptionAlert({
        orderId: exceptionData.order_id,
        reportId: exceptionData.report_id ?? null,
        attemptId: input.attemptId,
        authorizationId: null,
        category: errorCategory,
        stage: 'immediate_dispatch',
        technicalReference: input.correlationReference,
        requiredAction: DISPATCH_FAILURE_REQUIRED_ACTION
      });
    } catch {
      console.error('immediate_fulfilment_dispatch', {
        outcome: 'exception_notification_failed',
        attemptId: input.attemptId,
        correlationReference: input.correlationReference,
        errorCategory: 'exception_notification_failed'
      });
    }
  }

  let responseStatus: number | null = null;
  try {
    const started = await record('started', null, null);
    if (started.error) throw new Error('dispatch_evidence_start_failed');

    const cronSecret = env.CRON_SECRET?.trim();
    if (!cronSecret) throw new Error('cron_secret_unavailable');

    const origin = exactDeploymentOrigin(env);
    const response = await fetchImpl(
      `${origin}/score/api/internal/fulfilment-worker`,
      {
        method: 'POST',
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${cronSecret}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(immediateFulfilmentDispatchPayload(input))
      }
    );
    responseStatus = response.status;
    if (!response.ok) throw new Error('worker_rejected_dispatch');

    const completed = await record('succeeded', response.status, null);
    if (completed.error) {
      console.error('immediate_fulfilment_dispatch', {
        outcome: 'evidence_persistence_failed',
        attemptId: input.attemptId,
        correlationReference: input.correlationReference,
        errorCategory: 'dispatch_success_evidence_failed'
      });
    }
    return { ok: true, status: response.status, errorCategory: null };
  } catch (error) {
    const errorCategory = dispatchErrorCategory(error);
    const failed = await record('failed', responseStatus, errorCategory).catch(
      () => ({ error: true })
    );
    await recordFailureAlert(errorCategory);
    console.error('immediate_fulfilment_dispatch', {
      outcome: 'failed',
      attemptId: input.attemptId,
      correlationReference: input.correlationReference,
      errorCategory,
      evidenceRecorded: !failed.error
    });
    return { ok: false, status: responseStatus, errorCategory };
  }
}
