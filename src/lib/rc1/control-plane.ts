import { NextResponse } from 'next/server';
import { getAdminAccessTokenFromCookies } from '@/lib/auth/session-cookies';
import { decodeAalClaimForDisplayOnly } from '@/lib/auth/mfa';
import {
  createSupabaseAnonServerClient,
  createSupabaseAuthenticatedServerClient,
} from '@/lib/supabase/server';

const SECRET_KEYS = new Set([
  'provider_webhook_db_hmac',
  'provider_lookup_db_hmac',
]);
const FINGERPRINT = /^[0-9a-f]{64}$/;
const ZERO_FINGERPRINT = '0'.repeat(64);
const MIN_SECRET_LENGTH = 32;
const MIN_REASON_LENGTH = 10;
const MAX_REASON_LENGTH = 500;

type Rc1Operator = {
  accessToken: string;
  role: string;
  aal: 'aal1' | 'aal2' | null;
};

type RpcResult = {
  data: unknown;
  error: { message?: string } | null;
};

export type Rc1ControlPlaneDependencies = {
  mode?: string;
  resolveOperator?: () => Promise<Rc1Operator | null>;
  rpc?: (
    accessToken: string,
    functionName: string,
    args?: Record<string, unknown>,
  ) => Promise<RpcResult>;
};

type FreezeStatus = {
  state: 'frozen' | 'released';
  freeze_epoch: number;
  activated_at: string;
  released_at: string | null;
  activation_reason_fingerprint: string;
  release_evidence_fingerprint: string | null;
  canary_authorization_active: false;
};

function json(payload: Record<string, unknown>, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  });
}

function exactMode(dependencies: Rc1ControlPlaneDependencies): string | undefined {
  return dependencies.mode ?? process.env.MK_RC1_OPERATION_FREEZE_MODE;
}

async function defaultResolveOperator(): Promise<Rc1Operator | null> {
  const accessToken = getAdminAccessTokenFromCookies();
  if (!accessToken) return null;

  try {
    const anon = createSupabaseAnonServerClient();
    const { data: userData, error: userError } = await anon.auth.getUser(accessToken);
    if (userError || !userData.user) return null;

    // This authenticated, self-only RLS read is a route pre-check. Each mutating RPC
    // independently re-establishes platform_admin + AAL2 from auth.uid()/auth.jwt().
    const authenticated = createSupabaseAuthenticatedServerClient(accessToken);
    const { data: profile, error: profileError } = await authenticated
      .from('admin_profiles')
      .select('role,status')
      .eq('id', userData.user.id)
      .maybeSingle();
    if (profileError || !profile || profile.status !== 'active') return null;

    return {
      accessToken,
      role: String(profile.role),
      aal: decodeAalClaimForDisplayOnly(accessToken),
    };
  } catch {
    return null;
  }
}

async function defaultRpc(
  accessToken: string,
  functionName: string,
  args: Record<string, unknown> = {},
): Promise<RpcResult> {
  const db = createSupabaseAuthenticatedServerClient(accessToken) as any;
  return db.rpc(functionName, args);
}

async function requireOperator(
  dependencies: Rc1ControlPlaneDependencies,
): Promise<Rc1Operator | NextResponse> {
  const operator = await (dependencies.resolveOperator ?? defaultResolveOperator)();
  if (!operator) return json({ ok: false, error: 'RC1_CONTROL_SESSION_REQUIRED' }, 401);
  if (operator.role !== 'platform_admin') {
    return json({ ok: false, error: 'RC1_CONTROL_PLATFORM_ADMIN_REQUIRED' }, 403);
  }
  if (operator.aal !== 'aal2') {
    return json({ ok: false, error: 'RC1_CONTROL_AAL2_REQUIRED' }, 403);
  }
  return operator;
}

function isOperator(value: Rc1Operator | NextResponse): value is Rc1Operator {
  return !(value instanceof NextResponse);
}

function positiveInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) && Number(value) > 0 ? Number(value) : null;
}

function meaningfulReason(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const reason = value.trim();
  return reason.length >= MIN_REASON_LENGTH && reason.length <= MAX_REASON_LENGTH
    ? reason
    : null;
}

function nonzeroFingerprint(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const fingerprint = value.trim().toLowerCase();
  return FINGERPRINT.test(fingerprint) && fingerprint !== ZERO_FINGERPRINT
    ? fingerprint
    : null;
}

function normalizeFreezeStatus(value: unknown): FreezeStatus | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const status = value as Record<string, unknown>;
  const state = status.state;
  const epoch = positiveInteger(status.freeze_epoch);
  if ((state !== 'frozen' && state !== 'released') || epoch === null) return null;
  if (status.canary_authorization_active !== false) return null;
  if (typeof status.activated_at !== 'string' || !status.activated_at) return null;
  if (
    typeof status.activation_reason_fingerprint !== 'string'
    || !FINGERPRINT.test(status.activation_reason_fingerprint)
  ) return null;

  const releasedAt = status.released_at;
  const evidence = status.release_evidence_fingerprint;
  if (state === 'frozen' && (releasedAt !== null || evidence !== null)) return null;
  if (
    state === 'released'
    && (
      typeof releasedAt !== 'string'
      || !releasedAt
      || nonzeroFingerprint(evidence) === null
    )
  ) return null;

  return {
    state,
    freeze_epoch: epoch,
    activated_at: status.activated_at,
    released_at: releasedAt as string | null,
    activation_reason_fingerprint: status.activation_reason_fingerprint,
    release_evidence_fingerprint: evidence as string | null,
    canary_authorization_active: false,
  };
}

async function readJsonBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value = await request.json();
    return value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

async function callRpc(
  dependencies: Rc1ControlPlaneDependencies,
  operator: Rc1Operator,
  name: string,
  args?: Record<string, unknown>,
): Promise<RpcResult> {
  return (dependencies.rpc ?? defaultRpc)(operator.accessToken, name, args);
}

export function createRc1CertificationSecretPost(
  dependencies: Rc1ControlPlaneDependencies = {},
) {
  return async function POST(request: Request) {
    if (exactMode(dependencies) !== 'frozen') {
      return json({ ok: false, error: 'RC1_CONTROL_EXPLICIT_FROZEN_MODE_REQUIRED' }, 423);
    }
    const operator = await requireOperator(dependencies);
    if (!isOperator(operator)) return operator;

    const body = await readJsonBody(request);
    if (!body) return json({ ok: false, error: 'RC1_CONTROL_INVALID_BODY' }, 400);
    const secretKey = typeof body.secretKey === 'string' ? body.secretKey.trim() : '';
    const secretValue = typeof body.secretValue === 'string' ? body.secretValue : '';
    const confirmValue = typeof body.confirmValue === 'string' ? body.confirmValue : '';
    const reason = meaningfulReason(body.reason);
    const expectedEpoch = positiveInteger(body.expectedFreezeEpoch);
    if (!SECRET_KEYS.has(secretKey)) {
      return json({ ok: false, error: 'RC1_CONTROL_SECRET_KEY_INVALID' }, 400);
    }
    if (secretValue.length < MIN_SECRET_LENGTH) {
      return json({ ok: false, error: 'RC1_CONTROL_SECRET_TOO_SHORT' }, 400);
    }
    if (secretValue !== confirmValue) {
      return json({ ok: false, error: 'RC1_CONTROL_SECRET_CONFIRMATION_MISMATCH' }, 400);
    }
    if (!reason) return json({ ok: false, error: 'RC1_CONTROL_REASON_REQUIRED' }, 400);
    if (expectedEpoch === null) {
      return json({ ok: false, error: 'RC1_CONTROL_EXPECTED_EPOCH_REQUIRED' }, 400);
    }

    const { data, error } = await callRpc(
      dependencies,
      operator,
      'rc1_provision_certification_runtime_secret',
      {
        p_secret_key: secretKey,
        p_secret_value: secretValue,
        p_reason: reason,
        p_expected_freeze_epoch: expectedEpoch,
      },
    );
    if (error || !data || typeof data !== 'object' || Array.isArray(data)) {
      return json({ ok: false, error: 'RC1_CONTROL_SECRET_PROVISION_FAILED' }, 409);
    }
    const result = data as Record<string, unknown>;
    const keys = Object.keys(result).sort();
    if (
      keys.join(',') !== 'fingerprint,rotated_at,secret_key'
      || result.secret_key !== secretKey
      || typeof result.rotated_at !== 'string'
      || !result.rotated_at
      || nonzeroFingerprint(result.fingerprint) === null
    ) {
      return json({ ok: false, error: 'RC1_CONTROL_UNEXPECTED_RPC_RESPONSE' }, 502);
    }

    return json({
      ok: true,
      secret: {
        secret_key: result.secret_key,
        rotated_at: result.rotated_at,
        fingerprint: result.fingerprint,
      },
    });
  };
}

export function createRc1FreezeStatusGet(
  dependencies: Rc1ControlPlaneDependencies = {},
) {
  return async function GET() {
    const mode = exactMode(dependencies);
    if (mode !== 'frozen' && mode !== 'released') {
      return json({ ok: false, error: 'RC1_CONTROL_EXPLICIT_MODE_REQUIRED' }, 423);
    }
    const operator = await requireOperator(dependencies);
    if (!isOperator(operator)) return operator;
    const { data, error } = await callRpc(dependencies, operator, 'rc1_freeze_status');
    const status = error ? null : normalizeFreezeStatus(data);
    return status
      ? json({ ok: true, freeze: status })
      : json({ ok: false, error: 'RC1_CONTROL_STATUS_UNAVAILABLE' }, 503);
  };
}

export function createRc1FreezeActivatePost(
  dependencies: Rc1ControlPlaneDependencies = {},
) {
  return async function POST(request: Request) {
    if (exactMode(dependencies) !== 'frozen') {
      return json({ ok: false, error: 'RC1_CONTROL_EXPLICIT_FROZEN_MODE_REQUIRED' }, 423);
    }
    const operator = await requireOperator(dependencies);
    if (!isOperator(operator)) return operator;
    const body = await readJsonBody(request);
    const reason = meaningfulReason(body?.reason);
    if (!reason) return json({ ok: false, error: 'RC1_CONTROL_REASON_REQUIRED' }, 400);
    const { data, error } = await callRpc(
      dependencies,
      operator,
      'rc1_activate_freeze',
      { reason },
    );
    const status = error ? null : normalizeFreezeStatus(data);
    return status?.state === 'frozen'
      ? json({ ok: true, freeze: status })
      : json({ ok: false, error: 'RC1_CONTROL_ACTIVATION_FAILED' }, 409);
  };
}

export function createRc1FreezeReleasePost(
  dependencies: Rc1ControlPlaneDependencies = {},
) {
  return async function POST(request: Request) {
    // This exact mode is the controller-approved same-SHA release sequence: the app
    // changes first but remains closed until the database RPC completes.
    if (exactMode(dependencies) !== 'released') {
      return json({ ok: false, error: 'RC1_CONTROL_EXPLICIT_RELEASED_MODE_REQUIRED' }, 423);
    }
    const operator = await requireOperator(dependencies);
    if (!isOperator(operator)) return operator;
    const body = await readJsonBody(request);
    const reason = meaningfulReason(body?.reason);
    const evidence = nonzeroFingerprint(body?.evidenceFingerprint);
    const expectedEpoch = positiveInteger(body?.expectedFreezeEpoch);
    if (!reason) return json({ ok: false, error: 'RC1_CONTROL_REASON_REQUIRED' }, 400);
    if (!evidence) return json({ ok: false, error: 'RC1_CONTROL_EVIDENCE_REQUIRED' }, 400);
    if (expectedEpoch === null) {
      return json({ ok: false, error: 'RC1_CONTROL_EXPECTED_EPOCH_REQUIRED' }, 400);
    }
    const { data, error } = await callRpc(
      dependencies,
      operator,
      'rc1_release_freeze',
      {
        reason,
        evidence_fingerprint: evidence,
        expected_freeze_epoch: expectedEpoch,
      },
    );
    const status = error ? null : normalizeFreezeStatus(data);
    return status?.state === 'released'
      ? json({ ok: true, freeze: status })
      : json({ ok: false, error: 'RC1_CONTROL_RELEASE_FAILED' }, 409);
  };
}
