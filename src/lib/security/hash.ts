import { createHash, createHmac, randomBytes } from 'crypto';
import { requireServerEnv } from '@/lib/env/server';

export function createUrlSafeToken(byteLength = 32): string {
  return randomBytes(byteLength).toString('base64url');
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

export function hmacSha256Hex(input: string, secret: string): string {
  return createHmac('sha256', secret).update(input).digest('hex');
}

export function hashAssessmentToken(rawToken: string): string {
  const pepper = requireServerEnv('ASSESSMENT_TOKEN_PEPPER');
  return hmacSha256Hex(rawToken, pepper);
}

// Release C: customer report-access tokens are hashed with plain SHA-256 (no pepper), matching
// exactly what issue_customer_report_access_token()/reissue_customer_report_access_token()
// compute in SQL (encode(digest(convert_to(token,'UTF8'),'sha256'),'hex')) -- token issuance
// happens in SQL (so generation and storage are atomic), so this side MUST hash identically or
// every validation would silently fail. The token itself carries 256 bits of entropy
// (32 random bytes), which is why no pepper is needed here unlike the shorter-lived assessment
// tokens above -- see supabase/migrations/20260724170000_release_c_email_secure_delivery.sql.
export function hashCustomerReportAccessToken(rawToken: string): string {
  return sha256Hex(rawToken);
}

export function hashIpAddress(ipAddress: string | null | undefined): string | null {
  if (!ipAddress) return null;
  return sha256Hex(ipAddress);
}

export function hashUserAgent(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  return sha256Hex(userAgent);
}
