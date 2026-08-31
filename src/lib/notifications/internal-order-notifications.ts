import { queueAndDispatchInternalNotification, type InternalAssessmentNotificationDependencies } from '@/lib/notifications/internal-assessment-notifications';
import { buildInternalOrderCreatedMessage, buildInternalPaymentReceivedMessage } from '@/lib/notifications/message-templates';
import type { InvoiceDetails } from '@/lib/commercial/invoice-details';
import type { SelfServicePaidTier } from '@/lib/commercial/product-catalogue';

function paymentReference(orderReference: string) {
  return orderReference.replace(/[^A-Z0-9-]/gi, '').toUpperCase();
}

function adminUrl(orderReference: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim() || 'https://mkfraud.co.za';
  return `${base.replace(/\/$/, '')}/score/admin/orders/${encodeURIComponent(orderReference)}`;
}

function closedInvoiceDetails(value: InvoiceDetails | Record<string, unknown> | null | undefined): Record<string, string> | null {
  if (!value) return null;
  const source = value as Record<string, unknown>;
  return {
    legalName: typeof source.legalName === 'string' ? source.legalName : '',
    addressee: typeof source.addressee === 'string' ? source.addressee : '',
    billingEmail: typeof source.billingEmail === 'string' ? source.billingEmail : '',
    billingAddress: typeof source.billingAddress === 'string' ? source.billingAddress : '',
    vatNumber: typeof source.vatNumber === 'string' ? source.vatNumber : '',
    registrationNumber: typeof source.registrationNumber === 'string' ? source.registrationNumber : '',
    purchaseOrderReference: typeof source.purchaseOrderReference === 'string' ? source.purchaseOrderReference : ''
  };
}

export async function notifyInternalOrderCreated(input: {
  tier: SelfServicePaidTier;
  assessment: any;
  organisation?: any | null;
  respondent?: any | null;
  dataRequest?: any | null;
  order: any;
  product?: any | null;
  invoiceDetails?: InvoiceDetails | Record<string, unknown> | null;
  dependencies?: InternalAssessmentNotificationDependencies;
}) {
  const orderReference = String(input.order.order_reference);
  const productName = String(input.order.product_name ?? input.product?.name ?? (input.tier === 'comprehensive' ? 'Comprehensive Fraud Readiness' : 'Essential Fraud Readiness'));
  const invoiceRequested = Boolean(input.order.invoice_requested);
  const invoiceDetails = invoiceRequested ? closedInvoiceDetails(input.invoiceDetails ?? input.order.invoice_details) : null;
  const recipient = process.env.MK_INTERNAL_LEADS_EMAIL?.trim() || process.env.MK_INTERNAL_NOTIFICATIONS_EMAIL?.trim() || null;
  return queueAndDispatchInternalNotification({
    queue: {
      notificationType: input.tier === 'comprehensive' ? 'comprehensive_order_created' : 'eft_order_created',
      assessmentId: input.assessment.id,
      organisationId: input.assessment.organisation_id ?? null,
      respondentId: input.assessment.primary_respondent_id ?? null,
      orderId: input.order.id,
      dataRequestId: input.dataRequest?.id ?? null,
      optionCode: input.tier,
      recipientEmail: recipient,
      dedupeKey: `internal_order_created:${input.order.id}`,
      metadata: {
        assessment_reference: input.assessment.assessment_reference ?? null,
        order_reference: orderReference,
        tier: input.tier,
        product_code: input.product?.product_code ?? input.order.product_code ?? null,
        product_name: productName,
        amount_cents: Number(input.order.amount_cents ?? 0),
        currency: input.order.currency ?? 'ZAR',
        invoice_requested: invoiceRequested,
        invoice_details: invoiceDetails,
        payment_reference: paymentReference(orderReference)
      }
    },
    organisationId: input.assessment.organisation_id ?? null,
    respondentId: input.assessment.primary_respondent_id ?? null,
    message: buildInternalOrderCreatedMessage({
      orderReference,
      assessmentReference: input.assessment.assessment_reference ?? null,
      organisationName: input.order.organisation_name ?? input.organisation?.legal_name ?? input.organisation?.trading_name ?? null,
      customerName: input.order.customer_name ?? input.respondent?.full_name ?? null,
      customerEmail: input.order.customer_email ?? input.respondent?.email ?? null,
      customerPhone: input.respondent?.phone ?? input.respondent?.phone_number ?? null,
      productName,
      amountCents: Number(input.order.amount_cents ?? 0),
      currency: input.order.currency ?? 'ZAR',
      paymentReference: paymentReference(orderReference),
      invoiceRequested,
      invoiceDetails,
      adminUrl: adminUrl(orderReference)
    })
  }, input.dependencies);
}

export async function notifyInternalPaymentReceived(input: {
  assessmentId: string | null;
  order: any;
  source: string;
  verifiedAtIso: string;
  dependencies?: InternalAssessmentNotificationDependencies;
}) {
  const orderReference = String(input.order.order_reference);
  const recipient = process.env.MK_INTERNAL_LEADS_EMAIL?.trim() || process.env.MK_INTERNAL_NOTIFICATIONS_EMAIL?.trim() || null;
  return queueAndDispatchInternalNotification({
    queue: {
      notificationType: 'payment_received',
      assessmentId: input.assessmentId ?? '',
      orderId: input.order.id,
      recipientEmail: recipient,
      dedupeKey: `internal_payment_received:${input.order.id}:${input.source}`,
      metadata: {
        order_reference: orderReference,
        amount_cents: Number(input.order.amount_cents ?? 0),
        currency: input.order.currency ?? 'ZAR',
        payment_source: input.source,
        verified_at: input.verifiedAtIso,
        payment_reference: paymentReference(orderReference)
      }
    },
    message: buildInternalPaymentReceivedMessage({
      orderReference,
      amountCents: Number(input.order.amount_cents ?? 0),
      currency: input.order.currency ?? 'ZAR',
      paymentSource: input.source,
      verifiedAtIso: input.verifiedAtIso,
      adminUrl: adminUrl(orderReference)
    })
  }, input.dependencies);
}
