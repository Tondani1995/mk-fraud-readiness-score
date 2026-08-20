import { NextResponse } from 'next/server';
import { getAdminAccessTokenFromCookies } from '@/lib/auth/session-cookies';
import { decodeAalClaimForDisplayOnly } from '@/lib/auth/mfa';
import { getRc1OperationFreezeResponse } from '@/lib/rc1/operation-freeze';
import {
  createSupabaseAnonServerClient,
  createSupabaseAuthenticatedServerClient,
  createSupabaseServiceClient,
} from '@/lib/supabase/server';
import { classifySupabaseStorageResult } from '@/lib/reports/storage-error-classifier';

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

/**
 * RC1 synthetic-certification cleanup route.
 *
 * This is a deliberately thin transport. Every authority decision stays in
 * public.rc1_cleanup_synthetic_certification: platform_admin, AAL2, the environment enablement
 * row, the MKTEST-RC1- provenance check, the transaction-local score-trace allowance and the
 * audited deletion. The route adds only three things the database cannot see -- the RC1 operation
 * freeze for the activation_control surface, a fail-fast shape check so a malformed request never
 * reaches the function, and a projection that keeps the response free of raw database payload.
 *
 * The RPC is invoked through the operator's own JWT via callRpc(), exactly like the freeze routes.
 * It is revoked from service_role in 20260730130000, so there is no service-role path to bypass
 * the authority model even if this route were changed carelessly.
 */
const SYNTHETIC_CERTIFICATION_REFERENCE = /^MKTEST-RC1-[0-9]{8}-[0-9]{2}$/;
const SAFE_COUNT_KEY = /^[a-z][a-z0-9_]{2,63}$/;

/**
 * Closed vocabulary of refusal reasons the cleanup function can raise.
 *
 * The route must never echo a raw database message -- it can quote row detail -- but returning
 * nothing at all made a real staging refusal undiagnosable, which is the same failure mode Section
 * B and Section C were built to remove. These are fixed identifiers raised by
 * rc1_cleanup_synthetic_certification and rc1_require_platform_admin; anything not on this list
 * collapses to `unclassified`.
 */
const CLEANUP_REFUSAL_REASONS = new Set([
  'rc1_synthetic_cleanup:reference_not_synthetic',
  'rc1_synthetic_cleanup:meaningful_reason_required',
  'rc1_synthetic_cleanup:not_enabled_in_this_environment',
  'rc1_synthetic_cleanup:storage_proof_required',
  'rc1_synthetic_cleanup:storage_target_mismatch',
  'rc1_synthetic_cleanup:storage_objects_remaining',
  'rc1_synthetic_cleanup:storage_closure_required',
  'rc1_synthetic_cleanup:unsafe_storage_target',
  'rc1_synthetic_cleanup:duplicate_storage_target',
  'rc1_synthetic_cleanup:storage_target_limit_exceeded',
  'rc1_freeze_control:no_session',
  'rc1_freeze_control:malformed_session',
  'rc1_freeze_control:expired_session',
  'rc1_freeze_control:inactive_session',
  'rc1_freeze_control:platform_admin_required',
  'rc1_freeze_control:aal2_required',
]);

/** Extracts a known refusal identifier, never arbitrary database text. */
const PARK_REFUSAL_REASONS = new Set([
  'attempt_required',
  'meaningful_reason_required',
  'attempt_not_found',
  'attempt_already_published',
  'attempt_actively_claimed',
  'attempt_not_parkable',
]);

function safeRefusalReason(error: { message?: string } | null): string {
  const message = typeof error?.message === 'string' ? error.message : '';
  for (const known of CLEANUP_REFUSAL_REASONS) {
    if (message.includes(known)) return known;
  }
  // Surface the operation-frozen family without the offending surface name.
  if (/rc1_operation_frozen:/.test(message)) return 'rc1_operation_frozen';
  // Parking refusals are already a closed vocabulary raised by rc1_park_fulfilment_attempt.
  const parking = message.match(/rc1_park_attempt:([a-z_]+)/);
  if (parking && PARK_REFUSAL_REASONS.has(parking[1])) return `rc1_park_attempt:${parking[1]}`;
  return 'unclassified';
}

/**
 * Storage side of the cleanup.
 *
 * 20260731130000 stopped the prohibited direct `delete from storage.objects` and replaced it with
 * a count, which left the route deleting the report row that names the PDF while the PDF itself
 * stayed in a private bucket -- unreferenced and unfindable. SQL genuinely cannot remove the
 * bytes, so the removal happens here, between two database decisions:
 *
 *   1. rc1_prepare_synthetic_storage_cleanup, through the operator's own JWT, decides which exact
 *      bucket/path pairs may be removed. Nothing in the request body reaches it but the reference.
 *   2. the Storage API removes precisely those pairs, and only those.
 *   3. rc1_cleanup_synthetic_certification re-derives the same targets and independently refuses
 *      to delete a single row while any of them still exists.
 *
 * The service role appears only in step 2. It cannot execute either RPC -- both are revoked from
 * it -- so it can never authorise its own work.
 */
const STORAGE_TARGET_LIMIT = 25;
const SAFE_STORAGE_BUCKET = /^[a-z0-9][a-z0-9._-]{1,62}$/;
const TARGET_FINGERPRINT = /^[0-9a-f]{64}$/;

export type Rc1StorageTarget = { bucket: string; path: string };

/**
 * Re-validates the resolved targets in the route as well as the database.
 *
 * The database has already applied these rules; repeating them here means a future change that
 * loosened the RPC still could not turn this route into an arbitrary object deleter.
 */
function safeStorageTarget(value: unknown): Rc1StorageTarget | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const target = value as Record<string, unknown>;
  const bucket = typeof target.bucket === 'string' ? target.bucket : '';
  const path = typeof target.path === 'string' ? target.path : '';
  if (!SAFE_STORAGE_BUCKET.test(bucket)) return null;
  if (path.length === 0 || path.length > 400) return null;
  if (path.startsWith('/') || path.includes('..') || path.includes('\\')) return null;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(path)) return null;
  return { bucket, path };
}

export type Rc1StorageResolution = {
  targets: Rc1StorageTarget[];
  fingerprint: string;
  count: number;
};

function normalizeStorageResolution(value: unknown, reference: string): Rc1StorageResolution | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const resolution = value as Record<string, unknown>;
  if (resolution.reference !== reference) return null;

  const fingerprint = typeof resolution.target_fingerprint === 'string'
    ? resolution.target_fingerprint.trim().toLowerCase()
    : '';
  if (!TARGET_FINGERPRINT.test(fingerprint)) return null;

  const count = resolution.target_count;
  if (!Number.isSafeInteger(count) || Number(count) < 0 || Number(count) > STORAGE_TARGET_LIMIT) {
    return null;
  }
  if (!Array.isArray(resolution.targets)) return null;
  if (resolution.targets.length !== Number(count)) return null;

  const targets: Rc1StorageTarget[] = [];
  const seen = new Set<string>();
  for (const entry of resolution.targets) {
    const target = safeStorageTarget(entry);
    if (!target) return null;
    const key = `${target.bucket}\n${target.path}`;
    if (seen.has(key)) return null;
    seen.add(key);
    targets.push(target);
  }
  return { targets, fingerprint, count: Number(count) };
}

export type Rc1StorageRemovalOutcome = 'removed' | 'removal_failed' | 'still_present';

export type Rc1SyntheticCleanupDependencies = Rc1ControlPlaneDependencies & {
  freezeResponse?: () => Promise<NextResponse | null>;
  removeStorageTargets?: (targets: Rc1StorageTarget[]) => Promise<Rc1StorageRemovalOutcome>;
};

/**
 * Removes the resolved objects with the service role, then proves each one is gone.
 *
 * Absence is established by the established Phase 14 pattern: a download that classifies as
 * `object_not_found`. A delete the provider merely accepted is not evidence, so anything short of
 * an explicit not-found leaves the objects reported as still present and the database untouched.
 */
async function defaultRemoveStorageTargets(
  targets: Rc1StorageTarget[],
): Promise<Rc1StorageRemovalOutcome> {
  if (targets.length === 0) return 'removed';
  const db = createSupabaseServiceClient() as any;
  for (const target of targets) {
    const { error } = await db.storage.from(target.bucket).remove([target.path]);
    if (error && classifySupabaseStorageResult(error) !== 'object_not_found') {
      return 'removal_failed';
    }
  }
  for (const target of targets) {
    const { data, error } = await db.storage.from(target.bucket).download(target.path);
    if (!error || classifySupabaseStorageResult(error) !== 'object_not_found' || data) {
      return 'still_present';
    }
  }
  return 'removed';
}

/** Keeps only closed-vocabulary table names mapped to non-negative integer counts. */
function safeDeletedCounts(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const counts: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!SAFE_COUNT_KEY.test(key)) continue;
    if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < 0) continue;
    counts[key] = raw;
  }
  return counts;
}

/**
 * RC1 orphan-remediation route.
 *
 * The synthetic-journey cleanup is scoped to rows reachable from a MKTEST-RC1- organisation, which
 * is the right boundary. Provider callbacks can nevertheless arrive for an email event that no
 * longer exists, or for none at all, leaving rows that reference no business record and never can
 * again. This route removes exactly that residue.
 *
 * Two phases with a fingerprint-and-count contract. `prepare` measures; `execute` re-derives the
 * candidate set inside the database and refuses unless the fingerprint and total still match, so a
 * candidate that appeared, vanished or was substituted between the calls cannot be removed. The
 * browser supplies a reason and the two values it was given -- never a record id, provider id,
 * recipient or predicate. Every authority decision stays in the database functions.
 */
const REMEDIATION_PHASES = new Set(['prepare', 'execute']);
const SAFE_RELATION_KEY = /^[a-z][a-z0-9_]{2,63}$/;

const REMEDIATION_REFUSAL_REASONS = new Set([
  'rc1_orphan_remediation:not_enabled_in_this_environment',
  'rc1_orphan_remediation:database_not_released',
  'rc1_orphan_remediation:meaningful_reason_required',
  'rc1_orphan_remediation:expected_result_required',
  'rc1_orphan_remediation:candidate_total_mismatch',
  'rc1_orphan_remediation:candidate_fingerprint_mismatch',
  'rc1_orphan_remediation:candidate_limit_exceeded',
  'rc1_orphan_remediation:candidate_still_linked',
  'rc1_freeze_control:no_session',
  'rc1_freeze_control:malformed_session',
  'rc1_freeze_control:expired_session',
  'rc1_freeze_control:inactive_session',
  'rc1_freeze_control:platform_admin_required',
  'rc1_freeze_control:aal2_required',
]);

function safeRemediationReason(error: { message?: string } | null): string {
  const message = typeof error?.message === 'string' ? error.message : '';
  for (const known of REMEDIATION_REFUSAL_REASONS) {
    if (message.includes(known)) return known;
  }
  if (/rc1_operation_frozen:/.test(message)) return 'rc1_operation_frozen';
  return 'unclassified';
}

/** Keeps only closed-vocabulary relation names mapped to non-negative integer counts. */
function safeRelationCounts(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const counts: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!SAFE_RELATION_KEY.test(key)) continue;
    if (typeof raw !== 'number' || !Number.isSafeInteger(raw) || raw < 0) continue;
    counts[key] = raw;
  }
  return counts;
}

/**
 * RC1 certification-enablement route.
 *
 * The two RC1 certification flags are inert until an operator grants them, and nothing could grant
 * them through an audited path: update_phase14_feature_policy refuses every key except the two
 * Phase 14 settings, leaving only a direct database edit or service_role. This route is the
 * audited alternative -- the database function owns the allow-list, the AAL2 requirement and the
 * audit, and app_settings sits on the activation_control freeze surface, so a grant is only
 * possible inside a deliberate RELEASED window.
 */
const CERTIFICATION_ENABLEMENT_KEYS = new Set([
  'rc1_synthetic_certification_cleanup',
  'rc1_orphan_remediation',
]);

const ENABLEMENT_REFUSAL_REASONS = new Set([
  'rc1_certification_enablement:setting_key_forbidden',
  'rc1_certification_enablement:enabled_required',
  'rc1_certification_enablement:meaningful_reason_required',
  'rc1_freeze_control:no_session',
  'rc1_freeze_control:malformed_session',
  'rc1_freeze_control:expired_session',
  'rc1_freeze_control:inactive_session',
  'rc1_freeze_control:platform_admin_required',
  'rc1_freeze_control:aal2_required',
]);

function safeEnablementReason(error: { message?: string } | null): string {
  const message = typeof error?.message === 'string' ? error.message : '';
  for (const known of ENABLEMENT_REFUSAL_REASONS) {
    if (message.includes(known)) return known;
  }
  if (/rc1_operation_frozen:/.test(message)) return 'rc1_operation_frozen';
  return 'unclassified';
}

export function createRc1CertificationEnablementPost(
  dependencies: Rc1SyntheticCleanupDependencies = {},
) {
  return async function POST(request: Request) {
    const frozen = await (
      dependencies.freezeResponse
        ?? (() => getRc1OperationFreezeResponse('activation_control'))
    )();
    if (frozen) return frozen;

    const operator = await requireOperator(dependencies);
    if (!isOperator(operator)) return operator;

    const body = await readJsonBody(request);
    if (!body) return json({ ok: false, error: 'RC1_CONTROL_INVALID_BODY' }, 400);

    const settingKey = typeof body.settingKey === 'string' ? body.settingKey.trim() : '';
    if (!CERTIFICATION_ENABLEMENT_KEYS.has(settingKey)) {
      return json({ ok: false, error: 'RC1_ENABLEMENT_KEY_FORBIDDEN' }, 400);
    }
    if (typeof body.enabled !== 'boolean') {
      return json({ ok: false, error: 'RC1_ENABLEMENT_STATE_REQUIRED' }, 400);
    }
    const reason = meaningfulReason(body.reason);
    if (!reason) return json({ ok: false, error: 'RC1_CONTROL_REASON_REQUIRED' }, 400);

    const { data, error } = await callRpc(
      dependencies,
      operator,
      'rc1_set_certification_enablement',
      { p_setting_key: settingKey, p_enabled: body.enabled, p_reason: reason },
    );
    if (error || !data || typeof data !== 'object' || Array.isArray(data)) {
      return json({ ok: false, error: 'RC1_ENABLEMENT_REFUSED', reason: safeEnablementReason(error) }, 409);
    }
    const result = data as Record<string, unknown>;
    if (result.setting_key !== settingKey || typeof result.enabled !== 'boolean') {
      return json({ ok: false, error: 'RC1_ENABLEMENT_UNEXPECTED_RPC_RESPONSE' }, 502);
    }
    return json({ ok: true, settingKey, enabled: result.enabled, scope: 'staging_certification_only' });
  };
}

const SYNTHETIC_REFERENCE = /^MKTEST-RC1-[0-9]{8}-[0-9]{2}$/;

// Journey references are the assessment's own public identifier, not a row id. The shape is pinned
// here so nothing resembling an id, an address or a predicate can reach the RPC.
const ASSESSMENT_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9-]{2,99}$/;

const MARKING_REFUSAL_REASONS = new Set([
  'rc1_synthetic_marking:meaningful_reason_required',
  'rc1_synthetic_marking:synthetic_reference_invalid',
  'rc1_synthetic_marking:assessment_reference_required',
  'rc1_synthetic_marking:not_enabled_in_this_environment',
  'rc1_synthetic_marking:database_not_released',
  'rc1_synthetic_marking:assessment_not_found',
  'rc1_synthetic_marking:organisation_already_marked_or_missing',
  'rc1_synthetic_marking:organisation_not_recent',
  'rc1_synthetic_marking:organisation_has_other_assessments',
  'rc1_synthetic_marking:organisation_already_in_use',
  'rc1_synthetic_marking:marking_did_not_apply_exactly_once',
  'rc1_freeze_control:no_session',
  'rc1_freeze_control:malformed_session',
  'rc1_freeze_control:expired_session',
  'rc1_freeze_control:inactive_session',
  'rc1_freeze_control:platform_admin_required',
  'rc1_freeze_control:aal2_required',
]);

function safeMarkingReason(error: { message?: string } | null): string {
  const message = typeof error?.message === 'string' ? error.message : '';
  for (const known of MARKING_REFUSAL_REASONS) {
    if (message.includes(known)) return known;
  }
  if (/rc1_operation_frozen:/.test(message)) return 'rc1_operation_frozen';
  return 'unclassified';
}

export function createRc1SyntheticMarkingPost(
  dependencies: Rc1SyntheticCleanupDependencies = {},
) {
  return async function POST(request: Request) {
    const frozen = await (
      dependencies.freezeResponse
        ?? (() => getRc1OperationFreezeResponse('activation_control'))
    )();
    if (frozen) return frozen;

    const operator = await requireOperator(dependencies);
    if (!isOperator(operator)) return operator;

    const body = await readJsonBody(request);
    if (!body) return json({ ok: false, error: 'RC1_CONTROL_INVALID_BODY' }, 400);

    const assessmentReference = typeof body.assessmentReference === 'string'
      ? body.assessmentReference.trim()
      : '';
    if (!ASSESSMENT_REFERENCE.test(assessmentReference)) {
      return json({ ok: false, error: 'RC1_MARKING_ASSESSMENT_REFERENCE_REQUIRED' }, 400);
    }
    const syntheticReference = typeof body.syntheticReference === 'string'
      ? body.syntheticReference.trim().toUpperCase()
      : '';
    if (!SYNTHETIC_REFERENCE.test(syntheticReference)) {
      return json({ ok: false, error: 'RC1_MARKING_SYNTHETIC_REFERENCE_REQUIRED' }, 400);
    }
    const reason = meaningfulReason(body.reason);
    if (!reason) return json({ ok: false, error: 'RC1_CONTROL_REASON_REQUIRED' }, 400);

    const { data, error } = await callRpc(
      dependencies,
      operator,
      'rc1_mark_synthetic_certification_organisation',
      {
        p_assessment_reference: assessmentReference,
        p_synthetic_reference: syntheticReference,
        p_reason: reason,
      },
    );
    if (error || !data || typeof data !== 'object' || Array.isArray(data)) {
      return json({ ok: false, error: 'RC1_MARKING_REFUSED', reason: safeMarkingReason(error) }, 409);
    }
    const result = data as Record<string, unknown>;
    if (result.synthetic_reference !== syntheticReference || result.marked !== 1) {
      return json({ ok: false, error: 'RC1_MARKING_UNEXPECTED_RPC_RESPONSE' }, 502);
    }
    return json({ ok: true, syntheticReference, marked: 1 });
  };
}

export function createRc1OrphanRemediationPost(
  dependencies: Rc1SyntheticCleanupDependencies = {},
) {
  return async function POST(request: Request) {
    const frozen = await (
      dependencies.freezeResponse
        ?? (() => getRc1OperationFreezeResponse('activation_control'))
    )();
    if (frozen) return frozen;

    const operator = await requireOperator(dependencies);
    if (!isOperator(operator)) return operator;

    const body = await readJsonBody(request);
    if (!body) return json({ ok: false, error: 'RC1_CONTROL_INVALID_BODY' }, 400);

    const phase = typeof body.phase === 'string' ? body.phase.trim() : '';
    if (!REMEDIATION_PHASES.has(phase)) {
      return json({ ok: false, error: 'RC1_REMEDIATION_PHASE_INVALID' }, 400);
    }

    if (phase === 'prepare') {
      const { data, error } = await callRpc(dependencies, operator, 'rc1_prepare_orphan_remediation');
      if (error || !data || typeof data !== 'object' || Array.isArray(data)) {
        return json({ ok: false, error: 'RC1_REMEDIATION_REFUSED', reason: safeRemediationReason(error) }, 409);
      }
      const result = data as Record<string, unknown>;
      const total = result.total;
      const fingerprint = typeof result.fingerprint === 'string' ? result.fingerprint : '';
      if (!Number.isSafeInteger(total) || Number(total) < 0 || !FINGERPRINT.test(fingerprint)) {
        return json({ ok: false, error: 'RC1_REMEDIATION_UNEXPECTED_RPC_RESPONSE' }, 502);
      }
      return json({
        ok: true,
        phase: 'prepare',
        total: Number(total),
        fingerprint,
        counts: safeRelationCounts(result.counts),
        classification: result.classification === 'already_clean' ? 'already_clean' : 'removable_orphans',
      });
    }

    const reason = meaningfulReason(body.reason);
    if (!reason) return json({ ok: false, error: 'RC1_CONTROL_REASON_REQUIRED' }, 400);
    const expectedFingerprint = typeof body.expectedFingerprint === 'string'
      ? body.expectedFingerprint.trim().toLowerCase()
      : '';
    if (!FINGERPRINT.test(expectedFingerprint)) {
      return json({ ok: false, error: 'RC1_REMEDIATION_EXPECTED_FINGERPRINT_REQUIRED' }, 400);
    }
    const expectedTotal = body.expectedTotal;
    if (!Number.isSafeInteger(expectedTotal) || Number(expectedTotal) < 0) {
      return json({ ok: false, error: 'RC1_REMEDIATION_EXPECTED_TOTAL_REQUIRED' }, 400);
    }

    const { data, error } = await callRpc(
      dependencies,
      operator,
      'rc1_execute_orphan_remediation',
      {
        p_reason: reason,
        p_expected_fingerprint: expectedFingerprint,
        p_expected_total: Number(expectedTotal),
      },
    );
    if (error || !data || typeof data !== 'object' || Array.isArray(data)) {
      return json({ ok: false, error: 'RC1_REMEDIATION_REFUSED', reason: safeRemediationReason(error) }, 409);
    }
    const result = data as Record<string, unknown>;
    if (typeof result.already_clean !== 'boolean' || !Number.isSafeInteger(result.total)) {
      return json({ ok: false, error: 'RC1_REMEDIATION_UNEXPECTED_RPC_RESPONSE' }, 502);
    }
    return json({
      ok: true,
      phase: 'execute',
      already_clean: result.already_clean,
      total: Number(result.total),
      deleted: safeRelationCounts(result.deleted),
    });
  };
}

const ATTEMPT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * RC1 fulfilment-attempt parking.
 *
 * Available while the operation is FROZEN: standing a queued attempt down is a containment action,
 * not a journey mutation, and the whole point is to make a released window safe to open. The
 * database still owns every authority and eligibility decision.
 */
export function createRc1ParkFulfilmentAttemptPost(
  dependencies: Rc1ControlPlaneDependencies = {},
) {
  return async function POST(request: Request) {
    const operator = await requireOperator(dependencies);
    if (!isOperator(operator)) return operator;

    const body = await readJsonBody(request);
    if (!body) return json({ ok: false, error: 'RC1_CONTROL_INVALID_BODY' }, 400);

    const attemptId = typeof body.attemptId === 'string' ? body.attemptId.trim() : '';
    if (!ATTEMPT_ID.test(attemptId)) {
      return json({ ok: false, error: 'RC1_PARK_ATTEMPT_ID_INVALID' }, 400);
    }
    const reason = meaningfulReason(body.reason);
    if (!reason) return json({ ok: false, error: 'RC1_CONTROL_REASON_REQUIRED' }, 400);

    const technicalReference = crypto.randomUUID();
    const { data, error } = await callRpc(
      dependencies,
      operator,
      'rc1_park_fulfilment_attempt',
      { p_attempt_id: attemptId, p_reason: reason },
    );
    if (error || !data || typeof data !== 'object' || Array.isArray(data)) {
      // Diagnostic only: SQLSTATE and the closed-vocabulary identifiers, never raw SQL, tokens,
      // narrative, credentials or row values. Without this the refusal is indistinguishable from
      // any other and the underlying Postgres exception is unreachable.
      const raw = (error ?? {}) as Record<string, unknown>;
      const message = typeof raw.message === 'string' ? raw.message : '';
      const safeIdentifier = message.match(/rc1_park_attempt:[a-z_]+/)?.[0]
        ?? message.match(/function ([a-z_]+\.[a-z_"]+)\(/)?.[1]
        ?? message.match(/^[a-z_]+ "([a-zA-Z0-9_]+)"/)?.[1]
        ?? null;
      console.error('rc1_park_attempt_refused', {
        sqlstate: typeof raw.code === 'string' ? raw.code : null,
        safeIdentifier,
        classifiedReason: safeRefusalReason(error),
        attemptId,
        technicalReference,
      });
      return json({ ok: false, error: 'RC1_PARK_REFUSED', reason: safeRefusalReason(error) }, 409);
    }

    const result = data as Record<string, unknown>;
    // Identifiers and status only: no attempt payload, no report content, no actor identity.
    return json({
      ok: true,
      attemptId,
      status: typeof result.status === 'string' ? result.status : null,
      previousStatus: typeof result.previous_status === 'string' ? result.previous_status : null,
      alreadyParked: result.already_parked === true,
      claimable: result.claimable === true,
    });
  };
}

export function createRc1SyntheticCleanupPost(
  dependencies: Rc1SyntheticCleanupDependencies = {},
) {
  return async function POST(request: Request) {
    // Cleanup mutates authoritative business tables, so it is only available inside a deliberate
    // RELEASED window. This is the same freeze check every other mutating surface uses.
    const frozen = await (
      dependencies.freezeResponse
        ?? (() => getRc1OperationFreezeResponse('activation_control'))
    )();
    if (frozen) return frozen;

    const operator = await requireOperator(dependencies);
    if (!isOperator(operator)) return operator;

    const body = await readJsonBody(request);
    if (!body) return json({ ok: false, error: 'RC1_CONTROL_INVALID_BODY' }, 400);

    const reference = typeof body.reference === 'string' ? body.reference.trim() : '';
    if (!SYNTHETIC_CERTIFICATION_REFERENCE.test(reference)) {
      return json({ ok: false, error: 'RC1_CLEANUP_REFERENCE_NOT_SYNTHETIC' }, 400);
    }
    const reason = meaningfulReason(body.reason);
    if (!reason) return json({ ok: false, error: 'RC1_CONTROL_REASON_REQUIRED' }, 400);

    // Step 1 -- the database decides what may be removed. Only `reference` reaches it; a bucket or
    // path in the request body is read by nothing here and cannot influence the answer.
    const resolution = await callRpc(
      dependencies,
      operator,
      'rc1_prepare_synthetic_storage_cleanup',
      { p_reference: reference },
    );
    if (resolution.error) {
      return json(
        { ok: false, error: 'RC1_CLEANUP_TARGET_RESOLUTION_REFUSED', reason: safeRefusalReason(resolution.error) },
        409,
      );
    }
    const resolved = normalizeStorageResolution(resolution.data, reference);
    if (!resolved) {
      // Resolution failure: no Storage call and no database cleanup.
      return json({ ok: false, error: 'RC1_CLEANUP_UNSAFE_STORAGE_TARGET' }, 502);
    }

    // Step 2 -- the Storage API removes exactly those objects, then each is proven gone.
    const outcome = await (dependencies.removeStorageTargets ?? defaultRemoveStorageTargets)(
      resolved.targets,
    );
    if (outcome === 'removal_failed') {
      return json({ ok: false, error: 'RC1_CLEANUP_STORAGE_REMOVAL_FAILED' }, 502);
    }
    if (outcome !== 'removed') {
      return json({ ok: false, error: 'RC1_CLEANUP_STORAGE_ABSENCE_UNVERIFIED' }, 502);
    }

    // Step 3 -- the database re-derives the same targets and refuses while any still exists. The
    // fingerprint and count are passed so it can prove these are the objects that were authorised,
    // not merely that some objects are absent.
    const { data, error } = await callRpc(
      dependencies,
      operator,
      'rc1_cleanup_synthetic_certification',
      {
        p_reference: reference,
        p_reason: reason,
        p_expected_target_fingerprint: resolved.fingerprint,
        p_expected_target_count: resolved.count,
      },
    );
    if (error || !data || typeof data !== 'object' || Array.isArray(data)) {
      // The database message can quote row detail, so only a classified identifier from the closed
      // vocabulary above is returned -- never the raw text.
      return json({ ok: false, error: 'RC1_CLEANUP_REFUSED', reason: safeRefusalReason(error) }, 409);
    }

    const result = data as Record<string, unknown>;
    if (result.reference !== reference || typeof result.already_clean !== 'boolean') {
      return json({ ok: false, error: 'RC1_CLEANUP_UNEXPECTED_RPC_RESPONSE' }, 502);
    }

    // Counts and a status only: no bucket, no path, no fingerprint, nothing customer-shaped.
    return json({
      ok: true,
      reference,
      already_clean: result.already_clean,
      deleted: safeDeletedCounts(result.deleted),
      storage: { targets: resolved.count, verified_absent: resolved.count },
    });
  };
}
