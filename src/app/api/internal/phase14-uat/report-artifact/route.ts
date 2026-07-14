import { createHash } from 'node:crypto';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const EXPECTED_BRANCH = 'phase14/autonomous-premium-report-engine';
const EXPECTED_UAT_REF = 'nlukprffbrqmvjcmygyr';
const EXPECTED_REPORT_ID = '73732d8b-dd13-4049-a069-e0106b4b6cef';
const EXPECTED_BUCKET = 'generated-reports';
const EXPECTED_PATH = 'MKFRS-2026-5C01B4F1EE/RPT-MKFRS-2026-5C01B4F1EE-V1.pdf';
const EXPECTED_CHECKSUM = 'c3408eba0cee20013bc08fb3a9f609f57144ba7d813d5ab5190f76ce3548530d';
const AUTHORISATION_KEY = 'phase14_uat_pdf_review';
const CHUNK_SIZE = 40_000;

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store, max-age=0' }
  });
}

function fail(reason: string, status = 409) {
  return jsonResponse({ ok: false, reason }, status);
}

export async function GET(request: Request) {
  if (process.env.VERCEL_ENV !== 'preview') return fail('preview_only', 403);
  if (process.env.VERCEL_GIT_COMMIT_REF !== EXPECTED_BRANCH) return fail('wrong_branch', 403);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  if (!supabaseUrl.includes(`${EXPECTED_UAT_REF}.supabase.co`)) return fail('wrong_supabase_project', 403);

  const chunkParam = new URL(request.url).searchParams.get('chunk');
  const chunkIndex = Number.parseInt(chunkParam ?? '', 10);
  if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex > 20) return fail('invalid_chunk', 400);

  const db = createSupabaseServiceClient() as any;
  const cacheBuster = new Date(Date.now() + 60_000).toISOString();
  const { data: settings, error: settingsError } = await db
    .from('app_settings')
    .select('setting_key,value_json,updated_at')
    .in('setting_key', ['phase14_autonomous_report_engine', AUTHORISATION_KEY])
    .lt('updated_at', cacheBuster);

  if (settingsError) return fail('settings_unavailable', 500);

  const phase14 = settings?.find((row: any) => row.setting_key === 'phase14_autonomous_report_engine')?.value_json ?? {};
  const authorisation = settings?.find((row: any) => row.setting_key === AUTHORISATION_KEY)?.value_json ?? {};

  if (phase14.premium_report_auto_fulfilment_enabled !== false) return fail('fulfilment_must_remain_disabled');
  if (phase14.premium_report_ai_narrative_enabled !== false) return fail('ai_must_remain_disabled');
  if (phase14.premium_report_auto_email_enabled !== false) return fail('email_must_remain_disabled');
  if (phase14.r50000_automation_enabled !== false) return fail('r50000_automation_must_remain_disabled');
  if (phase14.premium_report_test_recipient_override != null) return fail('test_recipient_must_remain_null');

  const readCount = Number(authorisation.read_count ?? 0);
  const maxReads = Number(authorisation.max_reads ?? 12);
  if (authorisation.authorised !== true || authorisation.consumed === true) return fail('review_not_authorised', 403);
  if (authorisation.report_id !== EXPECTED_REPORT_ID) return fail('wrong_authorised_report', 403);
  if (!Number.isInteger(readCount) || !Number.isInteger(maxReads) || readCount < 0 || readCount >= maxReads) {
    return fail('review_read_limit_reached', 403);
  }
  if (typeof authorisation.expires_at !== 'string' || Date.parse(authorisation.expires_at) <= Date.now()) {
    return fail('review_authorisation_expired', 403);
  }

  const { data: report, error: reportError } = await db
    .from('reports')
    .select('id,status,storage_bucket,storage_path,checksum,released_at,updated_at')
    .eq('id', EXPECTED_REPORT_ID)
    .lt('updated_at', cacheBuster)
    .maybeSingle();

  if (reportError || !report) return fail('report_not_found', 404);
  if (
    report.status !== 'generated'
    || report.storage_bucket !== EXPECTED_BUCKET
    || report.storage_path !== EXPECTED_PATH
    || report.released_at != null
    || report.checksum !== EXPECTED_CHECKSUM
  ) return fail('report_not_reviewable');

  const { data: file, error: downloadError } = await db.storage
    .from(EXPECTED_BUCKET)
    .download(EXPECTED_PATH);

  if (downloadError || !file) return fail('artifact_download_failed', 500);
  const bytes = Buffer.from(await file.arrayBuffer());
  const checksum = createHash('sha256').update(bytes).digest('hex');
  if (
    bytes.length < 100_000
    || bytes.subarray(0, 4).toString('ascii') !== '%PDF'
    || checksum !== EXPECTED_CHECKSUM
  ) return fail('artifact_validation_failed', 500);

  const totalChunks = Math.ceil(bytes.length / CHUNK_SIZE);
  if (chunkIndex >= totalChunks) return fail('chunk_out_of_range', 416);

  const start = chunkIndex * CHUNK_SIZE;
  const end = Math.min(start + CHUNK_SIZE, bytes.length);
  const selected = bytes.subarray(start, end);
  const requestedChunks = Array.isArray(authorisation.requested_chunks)
    ? authorisation.requested_chunks.filter((value: unknown) => Number.isInteger(value))
    : [];
  const nextRequestedChunks = Array.from(new Set([...requestedChunks, chunkIndex])).sort((a, b) => a - b);
  const nextReadCount = readCount + 1;
  const consumed = nextRequestedChunks.length === totalChunks;

  const { error: updateError } = await db
    .from('app_settings')
    .update({
      value_json: {
        ...authorisation,
        read_count: nextReadCount,
        max_reads: maxReads,
        requested_chunks: nextRequestedChunks,
        consumed,
        consumed_at: consumed ? new Date().toISOString() : null,
        byte_length: bytes.length,
        checksum
      }
    })
    .eq('setting_key', AUTHORISATION_KEY)
    .contains('value_json', { authorised: true, consumed: false, read_count: readCount });

  if (updateError) return fail('authorisation_update_failed', 500);

  return jsonResponse({
    ok: true,
    reportId: EXPECTED_REPORT_ID,
    chunkIndex,
    chunkSize: selected.length,
    configuredChunkSize: CHUNK_SIZE,
    totalChunks,
    totalBytes: bytes.length,
    checksum,
    dataBase64: selected.toString('base64')
  });
}
