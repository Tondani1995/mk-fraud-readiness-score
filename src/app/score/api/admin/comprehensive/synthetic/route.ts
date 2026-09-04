import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { requireAuthenticatedAdmin } from '@/lib/auth/admin-route';
import { getRc1OperationFreezeResponse } from '@/lib/rc1/operation-freeze';
import {
  generateSyntheticComprehensiveReport,
  SyntheticComprehensiveGenerationError
} from '@/lib/comprehensive/synthetic-fixture-generation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

async function readBody(request: Request): Promise<Record<string, unknown>> {
  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) return await request.json().catch(() => ({})) as Record<string, unknown>;
  if (contentType.includes('form')) return Object.fromEntries(await request.formData());
  return {};
}

/**
 * Platform-admin-only owner-review fixture route.
 *
 * This route intentionally has no order reference and imports no payment, invoice, engagement,
 * email or customer-delivery service. The database claim RPC repeats the synthetic marker and
 * service-role checks, so a route mistake cannot turn an ordinary assessment into a fixture.
 */
export async function POST(request: Request) {
  const technicalReference = crypto.randomUUID();
  const frozen = await getRc1OperationFreezeResponse('generation');
  if (frozen) return frozen;

  let admin;
  try {
    admin = await requireAuthenticatedAdmin(['platform_admin']);
  } catch {
    return NextResponse.json({
      ok: false,
      reason: 'forbidden',
      message: 'An authenticated platform administrator session is required for synthetic owner-review generation.',
      technicalReference
    }, { status: 403, headers: { 'Cache-Control': 'private, no-store' } });
  }

  const body = await readBody(request);
  const assessmentReference = String(body.assessmentReference ?? body.assessment_reference ?? '').trim();
  const requestKey = String(
    request.headers.get('x-idempotency-key') ?? body.requestKey ?? body.request_key ?? ''
  ).trim();
  if (!assessmentReference || !requestKey) {
    return NextResponse.json({
      ok: false,
      reason: 'request_identity_required',
      message: 'assessmentReference and x-idempotency-key are required.',
      technicalReference
    }, { status: 400, headers: { 'Cache-Control': 'private, no-store' } });
  }

  try {
    const result = await generateSyntheticComprehensiveReport({
      assessmentReference,
      requestedBy: admin.id,
      requestKey
    });
    return NextResponse.json({
      ok: true,
      syntheticDemonstration: true,
      ownerReviewOnly: true,
      ...result
    }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const mapped = error instanceof SyntheticComprehensiveGenerationError
      ? error
      : new SyntheticComprehensiveGenerationError('synthetic_generation_failed', 'Synthetic Comprehensive report generation failed. Inspect the technical reference.', 500, technicalReference);
    console.error('synthetic_comprehensive_generation_route', {
      outcome: 'failed',
      assessmentReference,
      reason: mapped.reason,
      technicalReference: mapped.technicalReference || technicalReference
    });
    return NextResponse.json({
      ok: false,
      syntheticDemonstration: true,
      reason: mapped.reason,
      message: mapped.message,
      technicalReference: mapped.technicalReference || technicalReference
    }, { status: mapped.status, headers: { 'Cache-Control': 'private, no-store' } });
  }
}
