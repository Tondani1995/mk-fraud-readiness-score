export const PREMIUM_REPORT_DEVELOPMENT_PROJECT_REF = 'penhenkzfrtmcxklodtu';
export const PREMIUM_REPORT_DEVELOPMENT_RECIPIENT = 'admin@mkfraud.co.za';

function projectRefFromUrl(value: string | undefined) {
  const match = value?.trim().match(/^https:\/\/([a-z0-9]+)\.supabase\.co(?:\/|$)/i);
  return match?.[1]?.toLowerCase() ?? null;
}

export function configuredSupabaseProjectRef(env: NodeJS.ProcessEnv = process.env) {
  return projectRefFromUrl(env.NEXT_PUBLIC_SUPABASE_URL)
    ?? projectRefFromUrl(env.SUPABASE_URL)
    ?? env.SUPABASE_PROJECT_REF?.trim().toLowerCase()
    ?? null;
}

export function isPremiumReportDevelopmentMode(env: NodeJS.ProcessEnv = process.env) {
  if (env.VERCEL_ENV?.trim().toLowerCase() !== 'preview') return false;
  if (env.MK_DEVELOPMENT_MODE?.trim().toLowerCase() !== 'enabled') return false;
  if (configuredSupabaseProjectRef(env) !== PREMIUM_REPORT_DEVELOPMENT_PROJECT_REF) return false;
  if (env.MK_EMAIL_PROVIDER_MODE?.trim().toLowerCase() !== 'test') return false;
  const allowlist = (env.MK_EMAIL_RECIPIENT_ALLOWLIST ?? '')
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.includes(PREMIUM_REPORT_DEVELOPMENT_RECIPIENT);
}

export function assertPremiumReportDevelopmentMode(env: NodeJS.ProcessEnv = process.env) {
  if (!isPremiumReportDevelopmentMode(env)) {
    throw new Error('Preview development delivery mode is not enabled for the staging project.');
  }
}
