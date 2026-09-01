import { NextResponse } from 'next/server';
import { PRODUCTION_READINESS_PATH } from '@/lib/monitoring/contracts';
import { publicReadinessPayload } from '@/lib/monitoring/production-readiness';
import { evaluateProductionReadiness } from '@/lib/monitoring/production-readiness';
import { verifyReadinessRequest } from '@/lib/monitoring/signatures';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * External-monitor surface only. It is deliberately separate from the internal monitor runner:
 * this route performs reads and public-route GETs only, returns status names without configuration
 * values, and refuses to operate without the deployment-provisioned monitor secret.
 */
export async function GET(request: Request) {
  const secret = process.env.MK_PRODUCTION_READINESS_SECRET;
  if (!verifyReadinessRequest(request, secret, PRODUCTION_READINESS_PATH)) {
    return NextResponse.json({ ok: false, status: 'UNAUTHORISED' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }

  const origin = request.headers.get('x-forwarded-host')
    ? `${request.headers.get('x-forwarded-proto') ?? 'https'}://${request.headers.get('x-forwarded-host')}`
    : new URL(request.url).origin;

  try {
    const evaluation = await evaluateProductionReadiness({ origin });
    const payload = publicReadinessPayload(evaluation);
    return NextResponse.json(payload, {
      status: evaluation.status === 'INCIDENT' ? 503 : 200,
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch {
    return NextResponse.json({ ok: false, status: 'INCIDENT' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}

