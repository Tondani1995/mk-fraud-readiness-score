import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

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
  const leaseOwner = `scheduled-cleanup:${capabilityId}`;
  const { error: claimError } = await db.rpc('claim_phase14_worker_operation', {
    p_capability_id: capabilityId, p_lease_owner: leaseOwner
  });
  if (claimError) return NextResponse.json({ ok: false, error: claimError.message }, { status: 503 });

  const { error: expiryError } = await db.rpc('worker_cleanup_expired_premium_report_claims', {
    p_capability_id: capabilityId, p_older_than: '24 hours'
  });
  if (expiryError) return NextResponse.json({ ok: false, error: expiryError.message }, { status: 500 });
  const { data: leased, error: leaseError } = await db.rpc('claim_phase14_storage_cleanup_jobs', {
    p_capability_id: capabilityId, p_limit: 10
  });
  if (leaseError) return NextResponse.json({ ok: false, error: leaseError.message }, { status: 500 });

  const workLease = leased?.work_lease_token as string;
  const results = [];
  for (const job of leased?.jobs ?? []) {
    let deleted = false;
    let verified = false;
    let error: string | null = null;
    try {
      const bucket = db.storage.from(job.storage_bucket);
      const { data: object, error: readError } = await bucket.download(job.storage_path);
      if (readError || !object) {
        verified = true;
        deleted = true;
      } else {
        const checksum = crypto.createHash('sha256').update(Buffer.from(await object.arrayBuffer())).digest('hex');
        if (checksum !== job.expected_checksum) throw new Error('cleanup_object_checksum_mismatch');
        const { error: removeError } = await bucket.remove([job.storage_path]);
        if (removeError) throw removeError;
        const { data: after, error: afterError } = await bucket.download(job.storage_path);
        verified = Boolean(afterError || !after);
        deleted = verified;
        if (!verified) throw new Error('cleanup_object_still_present');
      }
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught);
    }
    const { error: settleError } = await db.rpc('complete_phase14_storage_cleanup_job', {
      p_capability_id: capabilityId, p_cleanup_id: job.id,
      p_work_lease_token: workLease,
      p_expected_bucket: job.storage_bucket,
      p_expected_path: job.storage_path,
      p_expected_checksum: job.expected_checksum,
      p_deleted: deleted,
      p_deletion_verified: verified, p_error: error
    });
    results.push({ id: job.id, deleted, verified, error: settleError?.message ?? error });
  }
  await db.rpc('renew_phase14_worker_operation', {
    p_capability_id: capabilityId, p_lease_owner: leaseOwner
  });
  return NextResponse.json({ ok: true, processed: results.length, results });
}
