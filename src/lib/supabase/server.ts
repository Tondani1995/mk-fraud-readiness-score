import { createClient } from '@supabase/supabase-js';
import { requireServerEnv } from '@/lib/env/server';

export function createSupabaseServiceClient() {
  const url = requireServerEnv('NEXT_PUBLIC_SUPABASE_URL');
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
