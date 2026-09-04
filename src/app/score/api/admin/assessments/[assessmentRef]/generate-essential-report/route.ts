import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/admin-route';
import {
  generateManualPhase1Report,
  Phase1GenerationError,
  type ManualGenerationAction
} from '@/lib/reports/phase1-manual-fulfilment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const GENERATION_ROLES = new Set(['platform_admin', 'reviewer', 'approver']);
const ACTIONS = new Set<ManualGenerationAction>([
  'assessment_admin_generate',
  'assessment_admin_retry',
  'assessment_admin_regenerate'
]);

type RouteContext = { params: Promise<{ assessmentRef: string }> };

async function submittedValues(request: Request) {
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return await request.json().catch(() => ({})) as Record<string, unknown>;
  }
  if (contentType.includes('form')) return Object.fromEntries(await request.formData());
  return {} as Record<string, unknown>;
}

export async function POST(request: Request, context: RouteContext) {
  const routeStartedAt = Date.now();
  const technicalReference = crypto.randomUUID();
  const { assessmentRef } = await context.params;
  // The controlled Staging/Preview console is intentionally deployment-link accessible per the
  // current owner decision. Keep the existing persisted runtime actor and role boundary so
  // generated evidence remains attributable without introducing a browser login requirement.
  const admin = await getAdminSession();
  if (!GENERATION_ROLES.has(admin.role)) {
    return NextResponse.json({
      ok: false,
      reason: 'forbidden',
      message: 'You are not authorised to generate assessment reports.',
      technicalReference
    }, { status: 403, headers: { 'Cache-Control': 'private, no-store' } });
  }

  const submitted = await submittedValues(request);
  const requestedAction = String(submitted.action ?? 'assessment_admin_generate') as ManualGenerationAction;
  if (!ACTIONS.has(requestedAction)) {
    return NextResponse.json({
      ok: false,
      reason: 'invalid_action',
      message: 'The assessment report action is not recognised.',
      technicalReference
    }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
  }
  const action = requestedAction as Extract<ManualGenerationAction, 'assessment_admin_generate' | 'assessment_admin_retry' | 'assessment_admin_regenerate'>;
  const requestKey = String(
    request.headers.get('x-idempotency-key')
      ?? submitted.requestKey
      ?? submitted.request_key
      ?? crypto.randomUUID()
  ).trim();

  try {
    const result = await generateManualPhase1Report({
      assessmentReference: assessmentRef,
      requestedBy: admin.id,
      requestKey,
      action
    });
    console.info('assessment_essential_generation_route', {
      outcome: 'completed',
      assessmentReference: assessmentRef,
      action,
      reportId: result.reportId,
      attemptId: result.attemptId ?? null,
      elapsedMs: Date.now() - routeStartedAt
    });
    return NextResponse.json({ ok: true, ...result }, {
      headers: { 'Cache-Control': 'private, no-store' }
    });
  } catch (error) {
    const mapped = error instanceof Phase1GenerationError
      ? error
      : new Phase1GenerationError('generation_failed', 'Assessment report generation failed. Retry or contact support.', 500, technicalReference);
    console.error('assessment_essential_generation_route', {
      outcome: 'failed',
      assessmentReference: assessmentRef,
      action,
      reason: mapped.reason,
      technicalReference: mapped.technicalReference ?? technicalReference,
      elapsedMs: Date.now() - routeStartedAt
    });
    return NextResponse.json({
      ok: false,
      reason: mapped.reason,
      message: mapped.message,
      technicalReference: mapped.technicalReference ?? technicalReference
    }, { status: mapped.status, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
