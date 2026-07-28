import { NextResponse } from 'next/server';

export const RC1_OPERATION_SURFACES = [
  'assessment_start',
  'assessment_write',
  'assessment_submit',
  'assessment_score',
  'order_create',
  'payment_status',
  'payment_webhook',
  'generation',
  'backlog',
  'worker',
  'quality_review',
  'delivery',
  'customer_token',
  'recipient_correction',
  'resend_webhook',
  'operational_alert',
  'activation_control',
  'storage_cleanup'
] as const;

export type Rc1OperationSurface = (typeof RC1_OPERATION_SURFACES)[number];
export type Rc1FreezeResponseKind = 'mutation' | 'provider_webhook' | 'worker';

type Rc1FreezeStatus = {
  state?: unknown;
  freeze_epoch?: unknown;
  release_evidence_fingerprint?: unknown;
  canary_authorization_active?: unknown;
};

type StatusResolver = () => Promise<unknown>;

const STATUS_TIMEOUT_MS = 3_000;
const EVIDENCE_FINGERPRINT = /^[0-9a-f]{64}$/;

function interpretedMode(value: string | undefined): 'frozen' | 'released' {
  return value === 'released' ? 'released' : 'frozen';
}

function isReleasedStatus(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const status = value as Rc1FreezeStatus;
  return status.state === 'released'
    && Number.isSafeInteger(status.freeze_epoch)
    && Number(status.freeze_epoch) > 0
    && typeof status.release_evidence_fingerprint === 'string'
    && EVIDENCE_FINGERPRINT.test(status.release_evidence_fingerprint)
    && status.release_evidence_fingerprint !== '0'.repeat(64)
    && status.canary_authorization_active === false;
}

async function defaultStatusResolver(): Promise<unknown> {
  const { createSupabaseServiceClient } = await import('@/lib/supabase/server');
  const db = createSupabaseServiceClient() as any;
  const { data, error } = await db.rpc('rc1_freeze_status');
  if (error) throw new Error('rc1_freeze_status_unavailable');
  return data;
}

async function resolveWithTimeout(
  resolver: StatusResolver,
  timeoutMs: number
): Promise<unknown> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      resolver(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('rc1_freeze_status_timeout')),
          timeoutMs
        );
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function isRc1OperationFrozen(options: {
  mode?: string;
  statusResolver?: StatusResolver;
  timeoutMs?: number;
} = {}): Promise<boolean> {
  const mode = interpretedMode(
    options.mode ?? process.env.MK_RC1_OPERATION_FREEZE_MODE
  );
  if (mode === 'frozen') return true;

  try {
    const status = await resolveWithTimeout(
      options.statusResolver ?? defaultStatusResolver,
      options.timeoutMs ?? STATUS_TIMEOUT_MS
    );
    return !isReleasedStatus(status);
  } catch {
    return true;
  }
}

function frozenPayload(kind: Rc1FreezeResponseKind) {
  return kind === 'worker'
    ? { ok: false, error: 'RC1_OPERATION_FROZEN', claimed: false }
    : { ok: false, error: 'RC1_OPERATION_FROZEN' };
}

export async function getRc1OperationFreezeResponse(
  _surface: Rc1OperationSurface,
  kind: Rc1FreezeResponseKind = 'mutation'
): Promise<NextResponse | null> {
  if (!(await isRc1OperationFrozen())) return null;
  const status = kind === 'provider_webhook' ? 503 : 423;
  const headers = kind === 'provider_webhook'
    ? { 'Retry-After': '60' }
    : undefined;
  return NextResponse.json(frozenPayload(kind), { status, headers });
}
