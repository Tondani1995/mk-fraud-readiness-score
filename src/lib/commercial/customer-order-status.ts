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

const EVIDENCE_ACCEPTING_STATES = new Set(['payment_received', 'evidence_requested', 'evidence_received', 'in_review']);

const EVIDENCE_GUIDANCE = [
  'MK may contact you directly if clarification is needed before preparing the selected Comprehensive package.'
];

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
  let engagement: CustomerPaidOrderStatus['engagement'] = null;
  if (tier === 'comprehensive') {
    const { data: row } = await db
      .from('comprehensive_engagements')
      .select('id,state,state_version,reviewer_admin_user_id,signed_off_by,signed_off_artifact_version')
      .eq('order_id', order.id)
      .maybeSingle();
    if (row) {
      const { data: evidence } = await db.from('comprehensive_evidence_items')
        .select('id,original_filename,evidence_label,content_type,size_bytes,uploaded_at,validation_status,reviewer_observation')
        .eq('engagement_id', row.id)
        .order('uploaded_at', { ascending: false });
      const evidenceRows = evidence ?? [];
      const evidenceAccepting = EVIDENCE_ACCEPTING_STATES.has(row.state);
      engagement = {
        state: row.state,
        stateVersion: Number(row.state_version),
        evidenceCount: evidenceRows.length,
        reviewedEvidenceCount: evidenceRows.filter((item: any) => ['reviewed', 'supported', 'not_supported', 'insufficient', 'not_applicable'].includes(item.validation_status)).length,
        reviewerAssigned: Boolean(row.reviewer_admin_user_id),
        signedOff: Boolean(row.signed_off_by),
        signedOffArtifactVersion: row.signed_off_artifact_version ? Number(row.signed_off_artifact_version) : null,
        evidenceAccepting,
        evidenceGuidance: EVIDENCE_GUIDANCE,
        evidence: evidenceRows.map((item: any) => ({
          id: item.id,
          originalFilename: item.original_filename,
          evidenceLabel: item.evidence_label ?? null,
          contentType: item.content_type,
          sizeBytes: Number(item.size_bytes),
          uploadedAt: item.uploaded_at,
          validationStatus: item.validation_status,
          reviewerObservation: item.reviewer_observation ?? null
        })),
        releasedArtifacts: [],
        customerAccessToken: null,
        customerAccessTokenExpiresAt: null
      };
    }
  }
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
