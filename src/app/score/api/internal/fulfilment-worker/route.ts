import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { generateManualPhase1Report, Phase1GenerationError } from '@/lib/reports/phase1-manual-fulfilment';

// Release B durable fulfilment worker (docs/safe-launch/12-durable-fulfilment-design.md,
// "Worker execution model"). Bearer-token authenticated exactly like the existing (currently
// unreachable) internal/phase14-storage-cleanup/route.ts -- same CRON_SECRET pattern, not a
// new auth mechanism. Invoked by the vercel.json cron entry, and equally callable on demand
// (used directly by the Release B live-database integration tests in this work cycle, and
// available as an admin "process queue now" fallback independent of cron timing).
//
// On each call it claims at most one eligible job via claim_next_fulfilment_job() (for
// update skip locked -- see the migration), then runs the EXISTING, unmodified
// generateManualPhase1Report() exactly as the synchronous admin/payment paths already do.
// That function internally calls the existing complete_manual_report_generation() RPC on
// success (verified by reading src/lib/reports/phase1-manual-fulfilment.ts -- it is not
// re-implemented or re-called here). On a successful return, this route calls the new
// submit_for_quality_review() RPC to move the row to AWAITING_QUALITY_REVIEW. On a thrown
// error, it calls the new fail_fulfilment_job() RPC with a categorised, customer-safe
// message -- never a stack trace or raw SQL error text.
//
// No PII in the response body or in any log line here: only order/attempt ids (both
// internal technical references, not customer-identifying), status strings and error
// categories are ever included.

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_LEASE_SECONDS = 300;

type ClaimedJob = {
  id: string;
  order_id: string;
  request_key: string;
  report_version: number;
  trigger_source: string;
  retry_count: number;
};

function categoriseError(error: unknown): { category: string; safeMessage: string; technicalReference: string } {
  if (error instanceof Phase1GenerationError) {
    return {
      category: error.reason,
      safeMessage: error.message,
      technicalReference: error.technicalReference ?? crypto.randomUUID()
    };
  }
  // Never surface the raw error message (may contain internal SQL/driver detail) to the
  // customer-safe field -- only a fixed, generic operational message, matching the split
  // already used by manual_report_generation_attempts.safe_operational_error /
  // technical_reference elsewhere in this codebase.
  return {
    category: 'generation_failed',
    safeMessage: 'Report generation failed. The fulfilment worker will retry automatically.',
    technicalReference: crypto.randomUUID()
  };
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }

  const db = createSupabaseServiceClient() as any;
  const leaseOwner = `fulfilment-worker:${crypto.randomUUID()}`;

  const { data: claimed, error: claimError } = await db.rpc('claim_next_fulfilment_job', {
    p_lease_owner: leaseOwner,
    p_lease_seconds: DEFAULT_LEASE_SECONDS
  });
  if (claimError) {
    console.error('fulfilment_worker', { outcome: 'claim_failed', code: claimError.code ?? null });
    return NextResponse.json({ ok: false, error: 'claim_failed' }, { status: 500 });
  }
  const job = claimed as ClaimedJob | null;
  if (!job) {
    return NextResponse.json({ ok: true, claimed: false });
  }

  const { data: order, error: orderError } = await db
    .from('orders')
    .select('order_reference')
    .eq('id', job.order_id)
    .maybeSingle();
  if (orderError || !order) {
    console.error('fulfilment_worker', { outcome: 'order_lookup_failed', attemptId: job.id });
    await db.rpc('fail_fulfilment_job', {
      p_attempt_id: job.id,
      p_lease_owner: leaseOwner,
      p_error_category: 'order_not_found',
      p_safe_operational_error: 'The order for this report could not be found.',
      p_technical_reference: crypto.randomUUID()
    });
    return NextResponse.json({ ok: true, claimed: true, attemptId: job.id, outcome: 'failed' });
  }

  try {
    // action: 'payment_confirmation' is deliberate for every trigger_source this worker
    // processes (payment_confirmed, quality_rejected_regenerate, or an admin-requeued job) --
    // it is the one existing ManualGenerationAction that requires no human requestedBy actor,
    // and (per the redefined claim_payment_report_generation in this release's migration)
    // recognises a row already lease-owned by this claim as the job to resume rather than a
    // duplicate request. See the migration header comment for the full reasoning.
    await generateManualPhase1Report({
      orderReference: order.order_reference,
      requestedBy: null,
      requestKey: job.request_key,
      action: 'payment_confirmation'
    });

    const { error: submitError } = await db.rpc('submit_for_quality_review', {
      p_attempt_id: job.id,
      p_lease_owner: leaseOwner
    });
    if (submitError) {
      console.error('fulfilment_worker', { outcome: 'submit_for_review_failed', attemptId: job.id, code: submitError.code ?? null });
      return NextResponse.json({ ok: false, claimed: true, attemptId: job.id, outcome: 'submit_failed' }, { status: 500 });
    }

    console.info('fulfilment_worker', { outcome: 'ready_for_review', attemptId: job.id, orderId: job.order_id });
    return NextResponse.json({ ok: true, claimed: true, attemptId: job.id, outcome: 'ready_for_review' });
  } catch (error) {
    const mapped = categoriseError(error);
    console.error('fulfilment_worker', {
      outcome: 'generation_failed',
      attemptId: job.id,
      orderId: job.order_id,
      errorCategory: mapped.category,
      technicalReference: mapped.technicalReference
    });
    const { error: failError } = await db.rpc('fail_fulfilment_job', {
      p_attempt_id: job.id,
      p_lease_owner: leaseOwner,
      p_error_category: mapped.category,
      p_safe_operational_error: mapped.safeMessage,
      p_technical_reference: mapped.technicalReference
    });
    if (failError) {
      console.error('fulfilment_worker', { outcome: 'fail_persistence_failed', attemptId: job.id, code: failError.code ?? null });
    }
    return NextResponse.json({ ok: true, claimed: true, attemptId: job.id, outcome: 'failed', errorCategory: mapped.category });
  }
}
