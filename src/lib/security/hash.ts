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

export function hashIpAddress(ipAddress: string | null | undefined): string | null {
  if (!ipAddress) return null;
  return sha256Hex(ipAddress);
}

export function hashUserAgent(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  return sha256Hex(userAgent);
}
