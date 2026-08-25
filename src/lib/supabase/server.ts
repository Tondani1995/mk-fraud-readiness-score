import { createClient } from '@supabase/supabase-js';
import { requireServerEnv } from '@/lib/env/server';

const RETIRED_READINESS_PROJECT_REF = 'jvjxlphdyzerrhwcgkup';
const RECOVERY_STAGING_SUPABASE_URL = 'https://iszihmmbgsfefawqmnwo.supabase.co';

function resolveServiceSupabaseUrl(configuredUrl: string) {
  if (process.env.VERCEL_ENV === 'preview' && configuredUrl.includes(RETIRED_READINESS_PROJECT_REF)) {
    console.warn('readiness_recovery_preview_supabase_rebound', {
      fromProject: RETIRED_READINESS_PROJECT_REF,
      toProject: 'iszihmmbgsfefawqmnwo'
    });
    return RECOVERY_STAGING_SUPABASE_URL;
  }
  return configuredUrl;
}

export function createSupabaseServiceClient() {
  const configuredUrl = requireServerEnv('NEXT_PUBLIC_SUPABASE_URL');
  const url = resolveServiceSupabaseUrl(configuredUrl);
  const serviceRoleKey = requireServerEnv('SUPABASE_SERVICE_ROLE_KEY');

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

export function createSupabaseAnonServerClient() {
  const url = requireServerEnv('NEXT_PUBLIC_SUPABASE_URL');
  const anonKey = requireServerEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

export function createSupabaseAuthenticatedServerClient(accessToken: string) {
  const url = requireServerEnv('NEXT_PUBLIC_SUPABASE_URL');
  const anonKey = requireServerEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  const token = accessToken.trim();
  if (!token) throw new Error('An authenticated Supabase access token is required.');

  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    },
    global: {
      headers: { Authorization: `Bearer ${token}` }
    }
  });
}
