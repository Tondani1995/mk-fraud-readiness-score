import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { customerSafeEftInstructions, type CustomerSafeEftInstructions } from '@/lib/orders/eft-instructions';
import { tierForProductCode, type CommercialTier } from './product-catalogue';

function paymentReferenceFor(orderReference: string) {
  return orderReference.replace(/[^A-Z0-9-]/gi, '').toUpperCase();
}

export type AutomatedCustomerFulfilment = {
  state: 'awaiting_payment' | 'preparing' | 'ready' | 'delivered' | 'recovery_required';
  generationStatus: string | null;
  deliveryStatus: string | null;
  reportId: string | null;
  versionNumber: number | null;
  deliverables: Array<{
    artefactType: 'main_report_pdf' | 'supporting_register_xlsx';
    fileName: string;
    mimeType: string;
    fileSizeBytes: number;
    artifactVersion: number;
  }>;
  customerAccessToken: string | null;
  customerAccessTokenExpiresAt: string | null;
};

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
  automatedFulfilment: AutomatedCustomerFulfilment | null;
};

/** Customer read model for the automated analytical lifecycle. */
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
  const reportType = product?.product_code === 'mk_validated_assessment'
    ? 'mk_validated'
    : product?.product_code === 'essential_self_assessment'
      ? 'essential_self_assessment'
      : null;

  let automatedFulfilment: AutomatedCustomerFulfilment | null = null;
  if (reportType) {
    const [{ data: attempt }, { data: report }] = await Promise.all([
      db.from('manual_report_generation_attempts')
        .select('id,status,output_report_id,automatic_delivery_authorization_id,created_at')
        .eq('order_id', order.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      db.from('reports')
        .select('id,report_type,status,storage_status,version_number,file_name,mime_type,file_size_bytes,order_id')
        .eq('order_id', order.id)
        .eq('report_type', reportType)
        .order('version_number', { ascending: false })
        .limit(1)
        .maybeSingle()
    ]);

    const [{ data: register }, { data: authorization }] = await Promise.all([
      report
        ? db.from('report_artifacts')
          .select('artefact_type,file_name,mime_type,file_size_bytes,artifact_version,storage_status,release_state,engagement_id')
          .eq('report_id', report.id)
          .eq('artefact_type', 'supporting_register')
          .is('engagement_id', null)
          .eq('storage_status', 'VERIFIED')
          .eq('release_state', 'released')
          .maybeSingle()
        : Promise.resolve({ data: null }),
      attempt?.automatic_delivery_authorization_id
        ? db.from('report_delivery_authorizations')
          .select('id,status')
          .eq('id', attempt.automatic_delivery_authorization_id)
          .maybeSingle()
        : Promise.resolve({ data: null })
    ]);

    const packageReady = Boolean(
      report
        && report.status === 'released'
        && report.storage_status === 'VERIFIED'
        && Number(report.file_size_bytes) > 0
        && register
        && register.storage_status === 'VERIFIED'
        && register.release_state === 'released'
        && Number(register.artifact_version) === Number(report.version_number)
    );
    let customerAccessToken: string | null = null;
    let customerAccessTokenExpiresAt: string | null = null;
    if (packageReady && report && order.customer_email) {
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

    const generationStatus = attempt?.status ?? null;
    const recoveryRequired = Boolean(attempt && /FAILED|RECONCILIATION|ERROR/i.test(String(attempt.status)));
    automatedFulfilment = {
      state: recoveryRequired
        ? 'recovery_required'
        : packageReady && authorization?.status === 'finalized'
          ? 'delivered'
          : packageReady
            ? 'ready'
            : order.status === 'payment_received' || order.status === 'verified'
              ? 'preparing'
              : 'awaiting_payment',
      generationStatus,
      deliveryStatus: authorization?.status ?? null,
      reportId: report?.id ?? null,
      versionNumber: report ? Number(report.version_number) : null,
      deliverables: packageReady && report
        ? [
          {
            artefactType: 'main_report_pdf',
            fileName: report.file_name,
            mimeType: report.mime_type,
            fileSizeBytes: Number(report.file_size_bytes),
            artifactVersion: Number(report.version_number)
          },
          ...(register ? [{
            artefactType: 'supporting_register_xlsx' as const,
            fileName: register.file_name,
            mimeType: register.mime_type,
            fileSizeBytes: Number(register.file_size_bytes),
            artifactVersion: Number(register.artifact_version)
          }] : [])
        ]
        : [],
      customerAccessToken,
      customerAccessTokenExpiresAt
    };
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
    paymentVerified: Boolean(order.verified_at) || order.status === 'verified' || order.status === 'payment_received',
    eftInstructions: customerSafeEftInstructions(order.eft_instructions_snapshot),
    createdAt: order.created_at,
    automatedFulfilment
  };
}
