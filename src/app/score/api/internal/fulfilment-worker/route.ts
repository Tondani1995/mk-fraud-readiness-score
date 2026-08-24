import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { processOneDelivery } from '@/lib/fulfilment/delivery-worker';
import { recordAutomaticFulfilmentExceptionAlert } from '@/lib/notifications/phase1-order-notifications';
import {
  generateManualPhase1Report,
  Phase1GenerationError
} from '@/lib/reports/phase1-manual-fulfilment';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

// One authenticated worker route, two invocation modes:
// - POST with an exact technical attempt ID is the primary post-payment path.
// - GET retains the accepted global claim behaviour for the once-daily recovery cron.
// Both modes use the same generator, automatic release transaction, delivery claim/dispatch,
// token, provider, finalisation and failure logic. Responses and logs contain technical IDs and
// safe categories only; request Authorization and customer-identifying values are never logged.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_LEASE_SECONDS = 300;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ClaimedJob = {
  id: string;
  order_id: string;
  request_key: string;
  report_version?: number;
  trigger_source?: string;
  retry_count?: number;
  already_complete?: boolean;
  automatic_delivery_authorization_id?: string;
};

function categoriseGenerationError(error: unknown): {
  category: string;
  safeMessage: string;
  technicalReference: string;
} {
  if (error instanceof Phase1GenerationError) {
    return {
      category: error.reason,
      safeMessage: error.message,
      technicalReference: error.technicalReference ?? crypto.randomUUID()
    };
  }
  return {
    category: 'generation_failed',
    safeMessage:
      'Report generation failed. The fulfilment worker will retry automatically.',
    technicalReference: crypto.randomUUID()
  };
}

function isAuthorised(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (
    !cronSecret
    || request.headers.get('authorization') !== `Bearer ${cronSecret}`
  ) {
    return false;
  }
  return true;
}

async function notifyException(data: any) {
  if (!data?.order_id) return;
  await recordAutomaticFulfilmentExceptionAlert({
    orderId: data.order_id,
    reportId: data.report_id ?? null,
    attemptId: data.attempt_id ?? null,
    authorizationId: data.authorization_id ?? null,
    category: data.category ?? 'automatic_fulfilment_exception',
    stage: data.stage ?? 'automatic_fulfilment',
    technicalReference: data.technical_reference ?? crypto.randomUUID(),
    requiredAction:
      data.required_action
      ?? 'Review the order and choose an authorised recovery action.'
  }).catch(() => {
    console.error('fulfilment_worker', {
      outcome: 'exception_notification_failed',
      attemptId: data.attempt_id ?? null,
      authorizationId: data.authorization_id ?? null,
      errorCategory: 'exception_notification_failed'
    });
  });
}

async function recordGenerationException(db: any, input: {
  attemptId: string;
  category: string;
  stage: string;
  technicalReference: string;
  requiredAction: string;
}) {
  const { data, error } = await db.rpc(
    'record_automatic_fulfilment_exception',
    {
      p_attempt_id: input.attemptId,
      p_authorization_id: null,
      p_stage: input.stage,
      p_category: input.category,
      p_technical_reference: input.technicalReference,
      p_required_action: input.requiredAction
    }
  );
  if (error) {
    console.error('fulfilment_worker', {
      outcome: 'exception_evidence_failed',
      attemptId: input.attemptId,
      errorCategory: 'exception_evidence_persistence_failed'
    });
    return;
  }
  await notifyException(data);
}

async function processWorkerInvocation(exactAttemptId?: string) {
  const db = createSupabaseServiceClient() as any;
  const leaseOwner = `fulfilment-worker:${crypto.randomUUID()}`;
  const exact = Boolean(exactAttemptId);

  const claim = exact
    ? db.rpc('claim_exact_fulfilment_job', {
        p_attempt_id: exactAttemptId,
        p_lease_owner: leaseOwner,
        p_lease_seconds: DEFAULT_LEASE_SECONDS
      })
    : db.rpc('claim_next_fulfilment_job', {
        p_lease_owner: leaseOwner,
        p_lease_seconds: DEFAULT_LEASE_SECONDS
      });
  const { data: claimed, error: claimError } = await claim;
  if (claimError) {
    console.error('fulfilment_worker', {
      outcome: 'claim_failed',
      claimMode: exact ? 'exact' : 'scheduled',
      errorCode: claimError.code ?? null
    });
    return NextResponse.json(
      { ok: false, error: 'claim_failed' },
      { status: 500 }
    );
  }
  const job = claimed as ClaimedJob | null;
  if (!job) {
    if (exact) {
      return NextResponse.json({
        ok: true,
        claimed: false,
        claimMode: 'exact'
      });
    }
    const deliveryResult = await processOneDelivery(db);
    return NextResponse.json({
      ok: deliveryResult.outcome !== 'claim_failed',
      ...deliveryResult
    }, {
      status: deliveryResult.outcome === 'claim_failed' ? 500 : 200
    });
  }

  if (
    job.already_complete
    && job.automatic_delivery_authorization_id
  ) {
    const deliveryResult = await processOneDelivery(db, {
      authorizationId: job.automatic_delivery_authorization_id,
      expectedOrderId: job.order_id
    });
    return NextResponse.json({
      ok: deliveryResult.outcome !== 'claim_failed',
      claimed: false,
      attemptId: job.id,
      idempotentReplay: true,
      delivery: deliveryResult
    }, {
      status: deliveryResult.outcome === 'claim_failed' ? 500 : 200
    });
  }

  const { data: order, error: orderError } = await db
    .from('orders')
    .select('order_reference')
    .eq('id', job.order_id)
    .maybeSingle();
  if (orderError || !order) {
    const technicalReference = crypto.randomUUID();
    const { data: failed } = await db.rpc('fail_fulfilment_job', {
      p_attempt_id: job.id,
      p_lease_owner: leaseOwner,
      p_error_category: 'order_not_found',
      p_safe_operational_error:
        'The order for this report could not be found.',
      p_technical_reference: technicalReference
    });
    if (failed?.status === 'MANUAL_REVIEW_REQUIRED') {
      await recordGenerationException(db, {
        attemptId: job.id,
        category: 'order_not_found',
        stage: 'generation_order_lookup',
        technicalReference,
        requiredAction:
          'Reconcile the attempt/order relationship before retrying generation.'
      });
    }
    return NextResponse.json({
      ok: true,
      claimed: true,
      attemptId: job.id,
      outcome: failed?.status ?? 'failed'
    });
  }

  try {
    const generated = await generateManualPhase1Report({
      orderReference: order.order_reference,
      requestedBy: null,
      requestKey: job.request_key,
      action: 'payment_confirmation'
    });
    if (!generated.reportId) {
      throw new Phase1GenerationError(
        'report_persistence_failed',
        'The verified PDF could not be linked to the order.',
        500,
        crypto.randomUUID()
      );
    }

    const { data: release, error: releaseError } = await db.rpc(
      'automatic_release_completed_fulfilment',
      {
        p_attempt_id: job.id,
        p_report_id: generated.reportId,
        p_lease_owner: leaseOwner
      }
    );
    if (releaseError) {
      const technicalReference = crypto.randomUUID();
      await recordGenerationException(db, {
        attemptId: job.id,
        category: 'automatic_release_failed',
        stage: 'automatic_quality_release',
        technicalReference,
        requiredAction:
          'Review release-gate evidence and use the existing human approve or reject control.'
      });
      return NextResponse.json(
        {
          ok: false,
          claimed: true,
          attemptId: job.id,
          outcome: 'automatic_release_failed'
        },
        { status: 500 }
      );
    }
    if (!release?.released) {
      await notifyException(release);
      return NextResponse.json({
        ok: true,
        claimed: true,
        attemptId: job.id,
        outcome: 'manual_review_required',
        errorCategory: release?.category ?? 'release_gate_failed'
      });
    }

    const deliveryResult = await processOneDelivery(db, {
      authorizationId: release.delivery_authorization_id,
      expectedOrderId: release.order_id
    });
    console.info('fulfilment_worker', {
      outcome: 'automatic_release_complete',
      attemptId: job.id,
      reportId: generated.reportId,
      authorizationId: release.delivery_authorization_id,
      deliveryOutcome: deliveryResult.outcome ?? 'not_claimed'
    });
    return NextResponse.json({
      ok: deliveryResult.outcome !== 'claim_failed',
      claimed: true,
      attemptId: job.id,
      reportId: generated.reportId,
      authorizationId: release.delivery_authorization_id,
      outcome: 'automatic_release_complete',
      delivery: deliveryResult
    }, {
      status: deliveryResult.outcome === 'claim_failed' ? 500 : 200
    });
  } catch (error) {
    const mapped = categoriseGenerationError(error);
    console.error('fulfilment_worker', {
      outcome: 'generation_failed',
      attemptId: job.id,
      orderId: job.order_id,
      errorCategory: mapped.category,
      technicalReference: mapped.technicalReference
    });
    const { data: failed, error: failError } = await db.rpc(
      'fail_fulfilment_job',
      {
        p_attempt_id: job.id,
        p_lease_owner: leaseOwner,
        p_error_category: mapped.category,
        p_safe_operational_error: mapped.safeMessage,
        p_technical_reference: mapped.technicalReference
      }
    );
    if (failError) {
      console.error('fulfilment_worker', {
        outcome: 'fail_persistence_failed',
        attemptId: job.id,
        errorCategory: 'generation_failure_persistence_failed'
      });
    }
    if (failed?.status === 'MANUAL_REVIEW_REQUIRED') {
      await recordGenerationException(db, {
        attemptId: job.id,
        category: mapped.category,
        stage: 'report_generation',
        technicalReference: mapped.technicalReference,
        requiredAction:
          'Review the terminal generation exception before any authorised retry.'
      });
    }
    return NextResponse.json({
      ok: true,
      claimed: true,
      attemptId: job.id,
      outcome: failed?.status ?? 'failed',
      errorCategory: mapped.category
    });
  }
}

async function guardWorker(request: Request) {
  if (!isAuthorised(request)) {
    return NextResponse.json(
      { ok: false, error: 'forbidden' },
      { status: 403 }
    );
  }
  return null;
}

export async function GET(request: Request) {
  const blocked = await guardWorker(request);
  if (blocked) return blocked;
  return processWorkerInvocation();
}

export async function POST(request: Request) {
  const blocked = await guardWorker(request);
  if (blocked) return blocked;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: 'invalid_request' },
      { status: 400 }
    );
  }
  const attemptId = (
    body
    && typeof body === 'object'
    && !Array.isArray(body)
    && typeof (body as Record<string, unknown>).attemptId === 'string'
  )
    ? String((body as Record<string, unknown>).attemptId)
    : '';
  const correlationReference = (
    body
    && typeof body === 'object'
    && !Array.isArray(body)
    && typeof (body as Record<string, unknown>).correlationReference === 'string'
  )
    ? String((body as Record<string, unknown>).correlationReference)
    : '';
  if (
    !UUID_PATTERN.test(attemptId)
    || !UUID_PATTERN.test(correlationReference)
    || Object.keys(body as Record<string, unknown>).some(
      (key) => !['attemptId', 'correlationReference'].includes(key)
    )
  ) {
    return NextResponse.json(
      { ok: false, error: 'invalid_request' },
      { status: 400 }
    );
  }
  return processWorkerInvocation(attemptId);
}
