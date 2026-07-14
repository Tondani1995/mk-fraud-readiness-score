import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const EXPECTED_BRANCH = 'phase14/autonomous-premium-report-engine';
const EXPECTED_SUPABASE_REF = 'nlukprffbrqmvjcmygyr';
const SETTING_KEY = 'phase14_autonomous_report_engine';

type Phase14Flags = {
  premium_report_auto_fulfilment_enabled: boolean;
  premium_report_ai_narrative_enabled: boolean;
  premium_report_auto_email_enabled: boolean;
  r50000_automation_enabled: boolean;
  premium_report_test_recipient_override: string | null;
};

function deriveSupabaseProjectRef(url: string | undefined): string | null {
  if (!url) return null;

  try {
    const hostname = new URL(url).hostname;
    const match = hostname.match(/^([a-z0-9]{20})\.supabase\.co$/);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

function isEnabled(value: unknown): boolean {
  return value === true || value === 'true';
}

function toFlags(value: unknown): Phase14Flags {
  const data = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const testRecipientOverride = data.premium_report_test_recipient_override;

  return {
    premium_report_auto_fulfilment_enabled: isEnabled(data.premium_report_auto_fulfilment_enabled),
    premium_report_ai_narrative_enabled: isEnabled(data.premium_report_ai_narrative_enabled),
    premium_report_auto_email_enabled: isEnabled(data.premium_report_auto_email_enabled),
    r50000_automation_enabled: isEnabled(data.r50000_automation_enabled),
    premium_report_test_recipient_override: testRecipientOverride == null || testRecipientOverride === ''
      ? null
      : String(testRecipientOverride)
  };
}

function hasUnexpectedEnabledFlag(flags: Phase14Flags): boolean {
  return flags.premium_report_auto_fulfilment_enabled
    || flags.premium_report_ai_narrative_enabled
    || flags.premium_report_auto_email_enabled
    || flags.r50000_automation_enabled
    || flags.premium_report_test_recipient_override !== null;
}

export async function GET() {
  const environment = process.env.VERCEL_ENV ?? null;
  const branch = process.env.VERCEL_GIT_COMMIT_REF ?? null;

  if (environment !== 'preview' || branch !== EXPECTED_BRANCH) {
    return new Response(null, { status: 404 });
  }

  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA ?? null;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKeyConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const serviceRoleKeyConfigured = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const supabaseProjectRef = deriveSupabaseProjectRef(supabaseUrl);

  const basePayload = {
    environment,
    branch,
    commitSha,
    supabaseProjectRef,
    anonKeyConfigured,
    serviceRoleKeyConfigured
  };

  if (!supabaseUrl || !anonKeyConfigured || !serviceRoleKeyConfigured || supabaseProjectRef !== EXPECTED_SUPABASE_REF) {
    return NextResponse.json({
      ...basePayload,
      databaseProbeSucceeded: false,
      flags: null
    }, { status: 503 });
  }

  const supabase = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  const { data, error } = await supabase
    .from('app_settings')
    .select('value_json')
    .eq('setting_key', SETTING_KEY)
    .maybeSingle();

  const databaseProbeSucceeded = !error && Boolean(data);
  const flags = toFlags(data?.value_json);
  const unhealthy = !databaseProbeSucceeded || hasUnexpectedEnabledFlag(flags);

  return NextResponse.json({
    ...basePayload,
    databaseProbeSucceeded,
    flags
  }, { status: unhealthy ? 503 : 200 });
}
