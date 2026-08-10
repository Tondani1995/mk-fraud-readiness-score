import { createSupabaseServiceClient } from '@/lib/supabase/server';
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
  paymentVerified: boolean;
  createdAt: string;
  engagement: {
    state: string;
    stateVersion: number;
    evidenceCount: number;
    reviewedEvidenceCount: number;
    reviewerAssigned: boolean;
    signedOff: boolean;
  } | null;
};

export async function getCustomerPaidOrderStatus(input: { assessmentId: string; orderReference: string }): Promise<CustomerPaidOrderStatus | null> {
  const db = createSupabaseServiceClient() as any;
  const { data: order, error } = await db
    .from('orders')
    .select('id,assessment_id,order_reference,status,amount_cents,currency,product_name,created_at,verified_at,products:product_id(product_code)')
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
      .select('id,state,state_version,reviewer_admin_user_id,signed_off_by')
      .eq('order_id', order.id)
      .maybeSingle();
    if (row) {
      const { data: evidence } = await db.from('comprehensive_evidence_items').select('validation_status').eq('engagement_id', row.id);
      const evidenceRows = evidence ?? [];
      engagement = {
        state: row.state,
        stateVersion: Number(row.state_version),
        evidenceCount: evidenceRows.length,
        reviewedEvidenceCount: evidenceRows.filter((item: any) => ['reviewed', 'supported', 'not_supported', 'insufficient', 'not_applicable'].includes(item.validation_status)).length,
        reviewerAssigned: Boolean(row.reviewer_admin_user_id),
        signedOff: Boolean(row.signed_off_by)
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
    paymentVerified: Boolean(order.verified_at) || order.status === 'verified',
    createdAt: order.created_at,
    engagement
  };
}
