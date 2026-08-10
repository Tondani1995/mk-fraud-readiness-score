import { NextResponse } from 'next/server';
import { getRc1OperationFreezeResponse } from '@/lib/rc1/operation-freeze';
import { validateSnapshotToken } from '@/lib/respondent/tokens';
import { createPaidOrderForAssessment } from '@/lib/commercial/order-service';
import { isSelfServicePaidTier } from '@/lib/commercial/product-catalogue';

/**
 * Creates a paid order for the tier the customer chose.
 *
 * The same assessment may order Essential and Comprehensive; they become separate orders against
 * separate products, and nothing downstream lets one entitle the other. Advisory is rejected here
 * because it is not orderable through the platform at all.
 *
 * Authorisation is the existing private snapshot token, consumed non-destructively, exactly as the
 * pre-existing report-request route does.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function deny(errors: string[], status: number) {
  return NextResponse.json({ ok: false, errors }, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request, props: { params: Promise<{ assessmentRef: string }> }) {
  const params = await props.params;
  const frozen = await getRc1OperationFreezeResponse('order_create');
  if (frozen) return frozen;

  const body = await request.json().catch(() => ({} as Record<string, unknown>));

  if (!body?.snapshotToken) return deny(['Private snapshot link required.'], 403);

  if (!isSelfServicePaidTier(body?.tier)) {
    return deny(['Choose either the Essential or the Comprehensive product. Advisory is scoped manually.'], 400);
  }

  const validation = await validateSnapshotToken({
    assessmentReference: params.assessmentRef,
    rawToken: String(body.snapshotToken),
    ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
    consume: false
  });

  if (!validation.ok) return deny(['Private snapshot link required.'], 403);

  const result = await createPaidOrderForAssessment({
    tier: body.tier,
    assessment: validation.assessment,
    organisation: validation.organisation,
    respondent: validation.respondent
  });

  if (!result.ok) {
    const status = result.reason === 'tier_not_self_service' ? 400 : 409;
    return NextResponse.json(
      { ok: false, reason: result.reason, errors: [result.message] },
      { status, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      created: result.created,
      tier: result.tier,
      order: {
        orderReference: result.orderReference,
        productName: result.productName,
        amountCents: result.amountCents,
        currency: result.currency,
        amountDisplay: result.amountDisplay,
        status: result.status,
        paymentReference: result.paymentReference
      },
      engagement: result.engagementId
        ? { id: result.engagementId, state: result.engagementState }
        : null,
      manualConfirmationNote: 'Use your order reference as the payment reference. MK Fraud Insights confirms EFT payments manually before any deliverable is released.'
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  );
}
