import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BOOTSTRAP_SECRET_ENV = 'PHASE14_EMAIL_HMAC_BOOTSTRAP_SECRET';
const MIN_BOOTSTRAP_SECRET_LENGTH = 48;
const MIN_HMAC_SECRET_LENGTH = 48;
const FINGERPRINT = /^[0-9a-f]{64}$/;

type BootstrapBody = {
  webhookSecret?: unknown;
  lookupSecret?: unknown;
};

type BootstrapResult = {
  provisioned_at?: unknown;
  fingerprints?: unknown;
};

function json(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function isProductionRuntime(): boolean {
  return process.env.VERCEL_ENV === 'production';
}

function readBearer(request: Request): string | null {
  const header = request.headers.get('authorization') ?? '';
  const match = /^Bearer\s+(\S+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

function constantTimeEqual(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left, 'utf8');
  const rightBytes = Buffer.from(right, 'utf8');
  return leftBytes.length === rightBytes.length
    && leftBytes.length > 0
    && crypto.timingSafeEqual(leftBytes, rightBytes);
}

function validSecret(value: unknown, minimumLength: number): value is string {
  return typeof value === 'string'
    && value.length >= minimumLength
    && value.trim() === value
    && !/\s/.test(value);
}

function validBody(value: unknown): value is BootstrapBody {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const body = value as BootstrapBody;
  const keys = Object.keys(body).sort();
  return keys.length === 2
    && keys[0] === 'lookupSecret'
    && keys[1] === 'webhookSecret'
    && validSecret(body.webhookSecret, MIN_HMAC_SECRET_LENGTH)
    && validSecret(body.lookupSecret, MIN_HMAC_SECRET_LENGTH)
    && body.webhookSecret !== body.lookupSecret;
}

function safeRpcFailure(error: unknown): { code: string; status: number } {
  const message = String((error as { message?: unknown })?.message ?? '').toLowerCase();
  if (message.includes('already_complete')) {
    return { code: 'phase14_email_hmac_bootstrap_already_complete', status: 409 };
  }
  if (message.includes('partial_state')) {
    return { code: 'phase14_email_hmac_bootstrap_partial_state', status: 409 };
  }
  if (message.includes('value_too_short')) {
    return { code: 'phase14_email_hmac_bootstrap_value_too_short', status: 400 };
  }
  if (message.includes('values_must_be_distinct')) {
    return { code: 'phase14_email_hmac_bootstrap_values_must_be_distinct', status: 400 };
  }
  return { code: 'phase14_email_hmac_bootstrap_unavailable', status: 503 };
}

function safeResult(value: unknown): {
  provisionedAt: string;
  fingerprints: {
    provider_webhook_db_hmac: string;
    provider_lookup_db_hmac: string;
  };
} | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const result = value as BootstrapResult;
  if (typeof result.provisioned_at !== 'string') return null;
  if (!result.fingerprints || typeof result.fingerprints !== 'object' || Array.isArray(result.fingerprints)) {
    return null;
  }
  const fingerprints = result.fingerprints as Record<string, unknown>;
  const webhook = fingerprints.provider_webhook_db_hmac;
  const lookup = fingerprints.provider_lookup_db_hmac;
  if (typeof webhook !== 'string' || !FINGERPRINT.test(webhook)) return null;
  if (typeof lookup !== 'string' || !FINGERPRINT.test(lookup)) return null;
  return {
    provisionedAt: result.provisioned_at,
    fingerprints: {
      provider_webhook_db_hmac: webhook,
      provider_lookup_db_hmac: lookup,
    },
  };
}

export async function POST(request: Request) {
  // This route is deliberately absent outside Vercel Production. Removing the
  // deployment secret after success disables the route even in Production.
  if (!isProductionRuntime()) return json({ ok: false, error: 'not_found' }, 404);

  const expectedBootstrapSecret = process.env[BOOTSTRAP_SECRET_ENV]?.trim();
  if (!expectedBootstrapSecret || expectedBootstrapSecret.length < MIN_BOOTSTRAP_SECRET_LENGTH) {
    return json({ ok: false, error: 'not_found' }, 404);
  }

  const suppliedBootstrapSecret = readBearer(request);
  if (!suppliedBootstrapSecret || !constantTimeEqual(suppliedBootstrapSecret, expectedBootstrapSecret)) {
    return json({ ok: false, error: 'forbidden' }, 403);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: 'invalid_request' }, 400);
  }
  if (!validBody(body)) {
    return json({ ok: false, error: 'invalid_request' }, 400);
  }

  try {
    const db = createSupabaseServiceClient() as any;
    const { data, error } = await db.rpc('bootstrap_phase14_email_hmac_secrets', {
      p_webhook_secret: body.webhookSecret,
      p_lookup_secret: body.lookupSecret,
    });
    if (error) {
      const failure = safeRpcFailure(error);
      return json({ ok: false, error: failure.code }, failure.status);
    }
    const result = safeResult(data);
    if (!result) return json({ ok: false, error: 'phase14_email_hmac_bootstrap_unavailable' }, 503);
    return json({ ok: true, ...result });
  } catch {
    return json({ ok: false, error: 'phase14_email_hmac_bootstrap_unavailable' }, 503);
  }
}
