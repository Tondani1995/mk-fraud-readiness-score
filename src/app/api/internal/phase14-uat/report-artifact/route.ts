import { createSupabaseServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const EXPECTED_BRANCH = 'phase14/autonomous-premium-report-engine';
const EXPECTED_UAT_REF = 'nlukprffbrqmvjcmygyr';
const EXPECTED_REPORT_ID = '73732d8b-dd13-4049-a069-e0106b4b6cef';
const EXPECTED_BUCKET = 'generated-reports';
const EXPECTED_PATH = 'MKFRS-2026-5C01B4F1EE/RPT-MKFRS-2026-5C01B4F1EE-V1.pdf';
const AUTHORISATION_KEY = 'phase14_uat_pdf_review';

function jsonFailure(reason: string, status = 409) {
  return Response.json({ ok: false, reason }, { status });
}

export async function GET() {
  if (process.env.VERCEL_ENV !== 'preview') return jsonFailure('preview_only', 403);
  if (process.env.VERCEL_GIT_COMMIT_REF !== EXPECTED_BRANCH) return jsonFailure('wrong_branch', 403);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  if (!supabaseUrl.includes(`${EXPECTED_UAT_REF}.supabase.co`)) return jsonFailure('wrong_supabase_project', 403);

  const db = createSupabaseServiceClient() as any;
  const { data: settings, error: settingsError } = await db
    .from('app_settings')
    .select('setting_key,value_json')
    .in('setting_key', ['phase14_autonomous_report_engine', AUTHORISATION_KEY]);

  if (settingsError) return jsonFailure('settings_unavailable', 500);

  const phase14 = settings?.find((row: any) => row.setting_key === 'phase14_autonomous_report_engine')?.value_json ?? {};
  const authorisation = settings?.find((row: any) => row.setting_key === AUTHORISATION_KEY)?.value_json ?? {};

  if (phase14.premium_report_auto_fulfilment_enabled !== false) return jsonFailure('fulfilment_must_remain_disabled');
  if (phase14.premium_report_ai_narrative_enabled !== false) return jsonFailure('ai_must_remain_disabled');
  if (phase14.premium_report_auto_email_enabled !== false) return jsonFailure('email_must_remain_disabled');
  if (phase14.r50000_automation_enabled !== false) return jsonFailure('r50000_automation_must_remain_disabled');
  if (phase14.premium_report_test_recipient_override != null) return jsonFailure('test_recipient_must_remain_null');

  if (authorisation.authorised !== true || authorisation.consumed === true) return jsonFailure('review_not_authorised', 403);
  if (authorisation.report_id !== EXPECTED_REPORT_ID) return jsonFailure('wrong_authorised_report', 403);
  if (typeof authorisation.expires_at !== 'string' || Date.parse(authorisation.expires_at) <= Date.now()) {
    return jsonFailure('review_authorisation_expired', 403);
  }

  const { data: report, error: reportError } = await db
    .from('reports')
    .select('id,status,storage_bucket,storage_path,checksum,released_at')
    .eq('id', EXPECTED_REPORT_ID)
    .maybeSingle();

  if (reportError || !report) return jsonFailure('report_not_found', 404);
  if (
    report.status !== 'generated'
    || report.storage_bucket !== EXPECTED_BUCKET
    || report.storage_path !== EXPECTED_PATH
    || report.released_at != null
    || typeof report.checksum !== 'string'
  ) return jsonFailure('report_not_reviewable');

  const { data: file, error: downloadError } = await db.storage
    .from(EXPECTED_BUCKET)
    .download(EXPECTED_PATH);

  if (downloadError || !file) return jsonFailure('artifact_download_failed', 500);
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length < 100_000 || bytes.subarray(0, 4).toString('ascii') !== '%PDF') {
    return jsonFailure('artifact_validation_failed', 500);
  }

  const consumedAt = new Date().toISOString();
  const { error: consumeError } = await db
    .from('app_settings')
    .update({
      value_json: {
        ...authorisation,
        consumed: true,
        consumed_at: consumedAt,
        byte_length: bytes.length,
        checksum: report.checksum
      }
    })
    .eq('setting_key', AUTHORISATION_KEY)
    .contains('value_json', { authorised: true, consumed: false });

  if (consumeError) return jsonFailure('authorisation_consume_failed', 500);

  return new Response(bytes, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="RPT-MKFRS-2026-5C01B4F1EE-V1.pdf"',
      'Content-Length': String(bytes.length),
      'Cache-Control': 'no-store, max-age=0',
      'X-UAT-Report-Checksum': report.checksum
    }
  });
}
