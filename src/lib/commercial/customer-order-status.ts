import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { customerSafeEftInstructions, type CustomerSafeEftInstructions } from '@/lib/orders/eft-instructions';
import { tierForProductCode, type CommercialTier } from './product-catalogue';

function paymentReferenceFor(orderReference: string) {
  return orderReference.replace(/[^A-Z0-9-]/gi, '').toUpperCase();
}

export type CustomerPaidOrderStatus = {
  orderReference: string;
  tier: CommercialTier | null;
  productName: string;
  amountCents: number;
  currency: string;
  amountDisplay: string;
  paymentReference: string;
  orderStatus: string;
  invoiceRequested: boolean;
  paymentVerified: boolean;
  eftInstructions: CustomerSafeEftInstructions | null;
  createdAt: string;
  engagement: {
    state: string;
    stateVersion: number;
    evidenceCount: number;
    reviewedEvidenceCount: number;
    reviewerAssigned: boolean;
    signedOff: boolean;
    signedOffArtifactVersion: number | null;
    evidenceAccepting: boolean;
    evidenceGuidance: string[];
    evidence: Array<{
      id: string;
      originalFilename: string;
      evidenceLabel: string | null;
      contentType: string;
      sizeBytes: number;
      uploadedAt: string;
      validationStatus: string;
      reviewerObservation: string | null;
    }>;
    releasedArtifacts: Array<{
      artefactType: string;
      fileName: string;
      mimeType: string;
      fileSizeBytes: number;
      artifactVersion: number;
    }>;
    customerAccessToken: string | null;
    customerAccessTokenExpiresAt: string | null;
  } | null;
};

export async function getCustomerPaidOrderStatus(input: { assessmentId: string; orderReference: string }): Promise<CustomerPaidOrderStatus | null> {
  const db = createSupabaseServiceClient() as any;
  const { data: order, error } = await db
    .from('orders')
    .select('id,assessment_id,order_reference,status,amount_cents,currency,product_name,created_at,verified_at,invoice_requested,customer_email,eft_instructions_snapshot,products:product_id(product_code)')
    .eq('assessment_id', input.assessmentId)
    .eq('order_reference', input.orderReference)
    .maybeSingle();
  if (error || !order) return null;
  const product = Array.isArray(order.products) ? order.products[0] : order.products;
  const tier = tierForProductCode(product?.product_code ?? null);
  // The active customer status surface is deliberately independent of the retired reviewed-
  // engagement lifecycle. The released PDF and supporting register are reached through the
  // separate, token-bound delivery route after automated release.
  const engagement: CustomerPaidOrderStatus['engagement'] = null;
  const amountCents = Number(order.amount_cents);
  return {
    orderReference: order.order_reference,
    tier,
    productName: order.product_name,
    amountCents,
    currency: order.currency,
    amountDisplay: new Intl.NumberFormat('en-ZA', { style: 'currency', currency: order.currency, maximumFractionDigits: 0 }).format(amountCents / 100),
    paymentReference: paymentReferenceFor(order.order_reference),
    orderStatus: order.status,
    invoiceRequested: Boolean(order.invoice_requested),
    paymentVerified: Boolean(order.verified_at) || order.status === 'verified',
    eftInstructions: customerSafeEftInstructions(order.eft_instructions_snapshot),
    createdAt: order.created_at,
    engagement
  };
}
