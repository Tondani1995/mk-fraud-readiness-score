import { NextResponse } from 'next/server';
import { getRc1CustomerFreezeResponse } from '@/lib/rc1/operation-freeze';
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

type InvoiceDetails = Record<string, string>;
const REQUIRED_INVOICE_FIELDS = ['organisationLegalName', 'attention', 'billingEmail', 'addressLine1', 'city', 'province', 'postalCode', 'country'];

function cleanInvoiceField(value: unknown, maximum = 240) {
  return typeof value === 'string' ? value.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, maximum) : '';
}

function parseInvoiceDetails(value: unknown, fallback: { organisation: string; email: string }) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const details: InvoiceDetails = {
    organisationLegalName: cleanInvoiceField(raw.organisationLegalName) || fallback.organisation,
    attention: cleanInvoiceField(raw.attention),
    billingEmail: cleanInvoiceField(raw.billingEmail, 160) || fallback.email,
    addressLine1: cleanInvoiceField(raw.addressLine1),
    addressLine2: cleanInvoiceField(raw.addressLine2),
    city: cleanInvoiceField(raw.city),
    province: cleanInvoiceField(raw.province),
    postalCode: cleanInvoiceField(raw.postalCode, 40),
    country: cleanInvoiceField(raw.country, 80),
    vatNumber: cleanInvoiceField(raw.vatNumber, 80),
    companyRegistrationNumber: cleanInvoiceField(raw.companyRegistrationNumber, 100),
    purchaseOrderReference: cleanInvoiceField(raw.purchaseOrderReference, 120)
  };
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.billingEmail);
  if (!validEmail || REQUIRED_INVOICE_FIELDS.some((field) => !details[field])) return null;
  return details;
}

function customerOrderFailure(reason: string) {
  switch (reason) {
    case 'eft_instructions_unavailable': return 'EFT instructions are temporarily unavailable. Your order was not created; please contact MK Fraud Insights.';
    case 'tier_not_self_service': return 'Choose either the Essential or Comprehensive product. Advisory is scoped manually.';
    case 'price_version_missing':
    case 'price_version_mismatch':
    case 'product_missing':
    case 'product_inactive':
    case 'order_insert_failed':
    default: return 'The order could not be created at this stage. Please try again or contact MK Fraud Insights.';
  }
}

export async function POST(request: Request, props: { params: Promise<{ assessmentRef: string }> }) {
  const params = await props.params;
  const frozen = await getRc1CustomerFreezeResponse('order_create');
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

  const invoiceRequested = body?.invoiceRequested === true;
  const invoiceDetails = invoiceRequested
    ? parseInvoiceDetails(body?.invoiceDetails, {
        organisation: validation.organisation?.legal_name ?? validation.organisation?.trading_name ?? 'Organisation',
        email: validation.respondent?.email ?? ''
      })
    : {};
  if (invoiceRequested && !invoiceDetails) return deny(['Complete the required invoice and billing details before continuing.'], 400);

  const result = await createPaidOrderForAssessment({
    tier: body.tier,
    assessment: validation.assessment,
    organisation: validation.organisation,
    respondent: validation.respondent,
    invoiceRequested,
    invoiceDetails
  });

  if (!result.ok) {
    const status = result.reason === 'tier_not_self_service' ? 400 : result.reason === 'eft_instructions_unavailable' ? 503 : 409;
    return NextResponse.json(
      { ok: false, errors: [customerOrderFailure(result.reason)] },
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
        paymentReference: result.paymentReference,
        eftInstructions: result.eftInstructions,
        deliveryEmail: validation.respondent?.email ?? null,
        invoiceRequested: result.invoiceRequested,
        invoiceDetails: result.invoiceDetails,
        assessmentReference: params.assessmentRef
      },
      manualConfirmationNote: 'Use your order reference as the payment reference. MK confirms EFT payment manually before an MK operator prepares and checks the purchased report.'
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  );
}
