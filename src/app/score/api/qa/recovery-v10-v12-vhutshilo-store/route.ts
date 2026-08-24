import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { GET as generateRecoveryPdf } from '../recovery-v10-v12-vhutshilo/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const BUCKET = 'generated-reports';
const STORAGE_PATH = 'recovery-qa/v10-v12/RPT-MKFRS-V12-ESS-VHUTSHILO-V1.pdf';
const EXPECTED_REPORT_REFERENCE = 'RPT-MKFRS-V12-ESS-VHUTSHILO-V1';
const SIGNED_URL_SECONDS = 24 * 60 * 60;

function sha256(bytes: Buffer): string {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

async function signedResult(db: ReturnType<typeof createSupabaseServiceClient>, input: {
  bytes: Buffer;
  providerCalls: number;
  reused: boolean;
}) {
  const checksum = sha256(input.bytes);
  const { data: signed, error: signedError } = await db.storage
    .from(BUCKET)
    .createSignedUrl(STORAGE_PATH, SIGNED_URL_SECONDS);
  if (signedError || !signed?.signedUrl) {
    throw new Error(`recovery_signed_url_failed:${signedError?.message ?? 'missing_signed_url'}`);
  }
  return NextResponse.json({
    ok: true,
    stored: true,
    reused: input.reused,
    providerCalls: input.providerCalls,
    reportReference: EXPECTED_REPORT_REFERENCE,
    bucket: BUCKET,
    storagePath: STORAGE_PATH,
    sizeBytes: input.bytes.length,
    sha256: checksum,
    signedUrl: signed.signedUrl,
    expiresInSeconds: SIGNED_URL_SECONDS,
    productionMutations: 0,
    customerMutations: 0,
    paymentMutations: 0,
    emailDispatches: 0
  }, { headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } });
}

export async function GET(request: Request) {
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'preview') {
    return NextResponse.json({ ok: false, error: 'recovery_store_route_preview_only' }, { status: 404 });
  }

  const confirm = new URL(request.url).searchParams.get('confirm');
  if (confirm !== 'one-shot-v10-v12-vhutshilo-20260824') {
    return NextResponse.json({ ok: false, error: 'explicit_recovery_confirmation_required' }, { status: 400 });
  }

  try {
    const db = createSupabaseServiceClient();

    // Idempotency comes before generation. Once the synthetic acceptance PDF exists, every later
    // request returns the exact stored bytes and cannot spend another provider call.
    const { data: existing, error: existingError } = await db.storage.from(BUCKET).download(STORAGE_PATH);
    if (existing && !existingError) {
      const bytes = Buffer.from(await existing.arrayBuffer());
      if (bytes.subarray(0, 4).toString() !== '%PDF') throw new Error('recovery_existing_object_is_not_pdf');
      return signedResult(db, { bytes, providerCalls: 0, reused: true });
    }

    const internalUrl = new URL(request.url);
    internalUrl.pathname = '/score/api/qa/recovery-v10-v12-vhutshilo';
    internalUrl.search = '?format=pdf';
    const generated = await generateRecoveryPdf(new Request(internalUrl.toString(), { method: 'GET' }));
    if (!generated.ok) {
      const body = await generated.text();
      return NextResponse.json(
        { ok: false, generationStatus: generated.status, error: body.slice(0, 1200), retryAttempted: false },
        { status: generated.status, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } }
      );
    }

    const providerCalls = Number(generated.headers.get('x-mk-provider-calls') ?? '0');
    const score = generated.headers.get('x-mk-score');
    const maturity = generated.headers.get('x-mk-maturity');
    const proof = generated.headers.get('x-mk-recovery-proof');
    if (providerCalls !== 1 || score !== '43.33' || maturity !== 'Developing' || proof !== 'PASS') {
      throw new Error(`recovery_generation_header_mismatch:calls=${providerCalls}:score=${score}:maturity=${maturity}:proof=${proof}`);
    }

    const bytes = Buffer.from(await generated.arrayBuffer());
    if (bytes.length < 100000 || bytes.subarray(0, 4).toString() !== '%PDF') {
      throw new Error(`recovery_generated_pdf_invalid:${bytes.length}`);
    }
    const checksum = sha256(bytes);

    const { error: uploadError } = await db.storage.from(BUCKET).upload(STORAGE_PATH, bytes, {
      contentType: 'application/pdf',
      upsert: false,
      metadata: {
        sha256: checksum,
        reportReference: EXPECTED_REPORT_REFERENCE,
        purpose: 'synthetic-v10-v12-recovery-acceptance',
        providerCalls: '1'
      }
    });
    if (uploadError) throw new Error(`recovery_storage_upload_failed:${uploadError.message}`);

    const { data: stored, error: downloadError } = await db.storage.from(BUCKET).download(STORAGE_PATH);
    if (downloadError || !stored) throw new Error(`recovery_storage_verify_download_failed:${downloadError?.message ?? 'missing_object'}`);
    const storedBytes = Buffer.from(await stored.arrayBuffer());
    const storedChecksum = sha256(storedBytes);
    if (storedChecksum !== checksum || storedBytes.length !== bytes.length) {
      throw new Error(`recovery_storage_verify_mismatch:${checksum}:${storedChecksum}:${bytes.length}:${storedBytes.length}`);
    }

    return signedResult(db, { bytes: storedBytes, providerCalls: 1, reused: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('recovery_v10_v12_vhutshilo_store_failed', { message });
    return NextResponse.json(
      { ok: false, error: message.slice(0, 800), retryAttempted: false },
      { status: 500, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } }
    );
  }
}
