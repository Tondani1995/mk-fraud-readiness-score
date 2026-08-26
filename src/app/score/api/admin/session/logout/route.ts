import { NextResponse } from 'next/server';
import {
  clearAdminSessionCookies,
  getAdminAccessTokenFromCookies
} from '@/lib/auth/session-cookies';
import { createSupabaseAuthenticatedServerClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const accessToken = getAdminAccessTokenFromCookies();
  if (accessToken) {
    try {
      // The application cookie is the authority used by the server routes. Local scope avoids
      // revoking other active administrator sessions; cookie clearing below is unconditional.
      await createSupabaseAuthenticatedServerClient(accessToken).auth.signOut({ scope: 'local' });
    } catch {
      // Logout must still clear the application cookies if Supabase session invalidation is
      // unavailable or the access token has already expired.
    }
  }

  const response = NextResponse.json({ ok: true }, {
    status: 200,
    headers: { 'Cache-Control': 'private, no-store' }
  });
  clearAdminSessionCookies(response);
  return response;
}
