import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { getAdminSession } from '@/lib/auth/admin-route';
import { logPremiumReportPhase } from '@/lib/reports/automation/phase-timing';
import {
  generateManualPhase1Report,
  Phase1GenerationError,
  type ManualGenerationAction
} from '@/lib/reports/phase1-manual-fulfilment';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Next.js requires this segment configuration to be statically analyzable.
export const maxDuration = 300;

const REPORT_GENERATION_ROLES = new Set(['platform_admin', 'reviewer', 'approver']);
const ACTIONS = new Set<ManualGenerationAction>(['admin_generate', 'admin_retry', 'admin_regenerate']);

type HandlerContext = { params: Promise<{ orderReference: string }> };

function wantsHtml(request: Request) {
  return request.headers.get('accept')?.includes('text/html') ?? false;
}

function jsonOrRedirect(
  request: Request,
  orderReference: string,
  payload: Record<string, unknown>,
  status = 200
) {
  if (wantsHtml(request)) {
    const url = new URL(`/score/admin/orders/${orderReference}`, request.url);
    url.searchParams.set(payload.ok ? 'report_generated' : 'report_error', String(payload.ok ? '1' : payload.reason ?? 'generation_failed'));
    if (typeof payload.message === 'string') url.searchParams.set('message', payload.message.slice(0, 240));
    return NextResponse.redirect(url, { status: 303 });
  }
  return NextResponse.json(payload, { status, headers: { 'Cache-Control': 'no-store' } });
}

async function submittedValues(request: Request) {
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) return await request.json().catch(() => ({})) as Record<string, unknown>;
  if (contentType.includes('form')) return Object.fromEntries(await request.formData());
  return {} as Record<string, unknown>;
}

export async function POST(request: Request, context: HandlerContext) {
  const routeStartedAt = Date.now();
  const technicalReference = crypto.randomUUID();
  logPremiumReportPhase({ phase: 'route_received', status: 'started', startedAt: routeStartedAt, technicalReference });
  const admin = await getAdminSession();
  logPremiumReportPhase({ phase: 'admin_authenticated', status: admin ? 'completed' : 'failed', startedAt: routeStartedAt, technicalReference });
  const { orderReference } = (await context.params);
  if (!admin || !REPORT_GENERATION_ROLES.has(admin.role)) {
    logPremiumReportPhase({ phase: 'request_completed', status: 'failed', startedAt: routeStartedAt, technicalReference });
    return jsonOrRedirect(request, orderReference, {
      ok: false,
      reason: 'forbidden',
      message: 'You are not authorised to generate reports.'
    }, 403);
  }

  const submitted = await submittedValues(request);
  const candidateAction = String(submitted.action ?? 'admin_generate') as ManualGenerationAction;
  const action = ACTIONS.has(candidateAction) ? candidateAction : 'admin_generate';
  const requestKey = String(
    request.headers.get('x-idempotency-key')
      ?? submitted.requestKey
      ?? submitted.request_key
      ?? crypto.randomUUID()
  );

  try {
    const result = await generateManualPhase1Report({
      orderReference,
      requestedBy: admin.id,
      requestKey,
      action
    });
    logPremiumReportPhase({ phase: 'request_completed', status: 'completed', startedAt: routeStartedAt, technicalReference, generationAttemptId: result.attemptId, reportReference: result.reportReference });
    return jsonOrRedirect(request, orderReference, { ok: true, ...result });
  } catch (error) {
    const mapped = error instanceof Phase1GenerationError
      ? error
      : new Phase1GenerationError('generation_failed', 'Report generation failed. Retry or contact support.', 500);
    console.error('phase1_generation_route', {
      orderReference,
      action,
      reason: mapped.reason,
      technicalReference: mapped.technicalReference ?? null
    });
    logPremiumReportPhase({ phase: 'request_completed', status: 'failed', startedAt: routeStartedAt, technicalReference });
    return jsonOrRedirect(request, orderReference, {
      ok: false,
      reason: mapped.reason,
      message: mapped.message,
      technicalReference: mapped.technicalReference ?? null
    }, mapped.status);
  }
}
