import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import {
  claimPhase14WorkerCapability,
  executePhase14WorkerStep,
  loadPhase14WorkerAuthorization
} from '@/lib/reports/phase14-security';
import { classifySupabaseStorageResult } from '@/lib/reports/storage-error-classifier';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }
  const capabilityId = process.env.PHASE14_STORAGE_CLEANUP_CAPABILITY_ID?.trim();
  if (!capabilityId) return NextResponse.json({ ok: false, error: 'cleanup_disabled' }, { status: 503 });

  const db = createSupabaseServiceClient() as any;
  const authorization = await loadPhase14WorkerAuthorization(capabilityId);
  const workerLease = await claimPhase14WorkerCapability(
    authorization,
    `scheduled-cleanup:${authorization.operationKey}`
  );
  await executePhase14WorkerStep(workerLease, 'worker_cleanup_expired_premium_report_claims', {
    older_than: '24 hours'
  });
  const leased = await executePhase14WorkerStep<Record<string, any>>(
    workerLease,
    'claim_phase14_storage_cleanup_jobs',
    { limit: 10 }
  );

  const workLease = leased?.work_lease_token as string;
  const results = [];
  for (const job of leased?.jobs ?? []) {
    let deleted = false;
    let verified = false;
    let deletionRequested = false;
    let deleteApiAccepted = false;
    let resultClass: ReturnType<typeof classifySupabaseStorageResult> = 'unknown_provider_error';
    let error: string | null = null;
    try {
      const bucket = db.storage.from(job.storage_bucket);
      const { data: object, error: readError } = await bucket.download(job.storage_path);
      if (readError || !object) {
        resultClass = classifySupabaseStorageResult(readError ?? new Error('storage response contained no object'));
        verified = resultClass === 'object_not_found';
        deleted = verified;
      } else {
        let checksum: string;
        try {
          checksum = crypto.createHash('sha256').update(Buffer.from(await object.arrayBuffer())).digest('hex');
        } catch (checksumError) {
          resultClass = 'checksum_read_failure';
          throw checksumError;
        }
        if (checksum !== job.expected_checksum) throw new Error('cleanup_object_checksum_mismatch');
        deletionRequested = true;
        const { error: removeError } = await bucket.remove([job.storage_path]);
        if (removeError) {
          resultClass = classifySupabaseStorageResult(removeError);
          throw removeError;
        }
        deleteApiAccepted = true;
        const { data: after, error: afterError } = await bucket.download(job.storage_path);
        resultClass = afterError
          ? classifySupabaseStorageResult(afterError)
          : after
            ? 'object_present'
            : 'malformed_response';
        verified = resultClass === 'object_not_found';
        deleted = verified;
        if (!verified) throw new Error('cleanup_object_still_present');
      }
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
      if (resultClass === 'unknown_provider_error') resultClass = classifySupabaseStorageResult(caught);
    }
    try {
      await executePhase14WorkerStep(workerLease, 'complete_phase14_storage_cleanup_job', {
        cleanup_id: job.id,
        work_lease_token: workLease,
        expected_bucket: job.storage_bucket,
        expected_path: job.storage_path,
        expected_checksum: job.expected_checksum,
        deletion_requested: deletionRequested,
        delete_api_accepted: deleteApiAccepted,
        provider_result_class: resultClass,
        error
      });
      results.push({ id: job.id, deleted, verified, resultClass, error });
    } catch (settleError) {
      results.push({
        id: job.id,
        deleted,
        verified,
        resultClass,
        error: settleError instanceof Error ? settleError.message : String(settleError)
      });
    }
  }
  await executePhase14WorkerStep(workerLease, 'renew_phase14_worker_operation', {
    completed_cleanup_cycle: true
  });
  return NextResponse.json({ ok: true, processed: results.length, results });
}
