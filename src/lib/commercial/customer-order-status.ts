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
  'Upload current organisation-level records that show how the control operates in practice.',
  'Remove unnecessary personal information before upload and use the optional label to identify the control or process.',
  'One file is accepted per upload; MK will record a separate reviewer status for each item.'
];

export async function getCustomerPaidOrderStatus(input: { assessmentId: string; orderReference: string }): Promise<CustomerPaidOrderStatus | null> {
  const db = createSupabaseServiceClient() as any;
  const { data: order, error } = await db
    .from('orders')
    .select('id,assessment_id,order_reference,status,amount_cents,currency,product_name,created_at,verified_at,customer_email,eft_instructions_snapshot,products:product_id(product_code)')
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
      const { data: releasedArtifacts } = await db.from('report_artifacts')
        .select('artefact_type,file_name,mime_type,file_size_bytes,artifact_version,release_state')
        .eq('engagement_id', row.id)
        .eq('artifact_version', row.signed_off_artifact_version ?? 0)
        .eq('release_state', 'released')
        .eq('storage_status', 'VERIFIED')
        .order('artefact_type', { ascending: true });
      const evidenceAccepting = EVIDENCE_ACCEPTING_STATES.has(row.state);
      let customerAccessToken: string | null = null;
      let customerAccessTokenExpiresAt: string | null = null;
      if (row.state === 'delivered' && row.signed_off_artifact_version && order.customer_email) {
        const { data: report } = await db.from('reports')
          .select('id,status,storage_status')
          .eq('order_id', order.id)
          .eq('report_type', 'mk_validated')
          .eq('version_number', row.signed_off_artifact_version)
          .eq('status', 'released')
          .eq('storage_status', 'VERIFIED')
          .order('version_number', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (report) {
          const { data: access } = await db.rpc('issue_customer_report_access_token', {
            p_order_id: order.id,
            p_report_id: report.id,
            p_recipient_email: order.customer_email,
            p_ttl_seconds: 3600
          });
          if (access?.token) {
            customerAccessToken = String(access.token);
            customerAccessTokenExpiresAt = access.expires_at ?? null;
          }
        }
      }
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
        releasedArtifacts: (releasedArtifacts ?? []).map((item: any) => ({
          artefactType: item.artefact_type,
          fileName: item.file_name,
          mimeType: item.mime_type,
          fileSizeBytes: Number(item.file_size_bytes),
          artifactVersion: Number(item.artifact_version)
        })),
        customerAccessToken,
        customerAccessTokenExpiresAt
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
    eftInstructions: customerSafeEftInstructions(order.eft_instructions_snapshot),
    createdAt: order.created_at,
    engagement
  };
}
