import { trackAssessmentEvent } from '@/lib/analytics/assessment-events';
import { queueInternalNotification } from '@/lib/notifications/internal-notifications';
import { buildEftInstructionSnapshot, customerSafeEftInstructions, formatOrderAmount, type CustomerSafeEftInstructions } from '@/lib/orders/eft-instructions';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import {
  paidProductForTier,
  tierForProductCode,
  type CommercialTier,
  type SelfServicePaidTier
} from './product-catalogue';
import type { ProductPriceVersion } from './order-price-entitlement';

/**
 * Order creation for the two self-service paid tiers.
 *
 * The amount on an order is never taken from a constant in this file. It is read from the product's
 * CURRENT price version row, and the order records which version it was created against, so the
 * order's entitlement stays resolvable after the catalogue moves on (see order-price-entitlement.ts).
 *
 * Essential and Comprehensive may originate from the same assessment. They are separate order rows
 * against separate products, and nothing downstream treats one as the other: fulfilment checks the
 * product code and binds its automated report package to the exact order/report/version.
 */

export type PaidOrderCreationReason =
  | 'tier_not_self_service'
  | 'product_missing'
  | 'product_inactive'
  | 'price_version_missing'
  | 'price_version_mismatch'
  | 'eft_instructions_unavailable'
  | 'order_insert_failed';

export type PaidOrderCreationResult =
  | {
      ok: true;
      created: boolean;
      tier: SelfServicePaidTier;
      orderId: string;
      orderReference: string;
      productCode: string;
      productName: string;
      amountCents: number;
      currency: string;
      amountDisplay: string;
      status: string;
      paymentReference: string;
      eftInstructions: CustomerSafeEftInstructions;
      invoiceRequested: boolean;
      invoiceDetails: Record<string, string> | null;
    }
  | { ok: false; reason: PaidOrderCreationReason; message: string };

function service() {
  return createSupabaseServiceClient() as any;
}

function paymentReferenceFor(orderReference: string) {
  return orderReference.replace(/[^A-Z0-9-]/gi, '').toUpperCase();
}

function toPriceVersion(row: any): ProductPriceVersion {
  return {
    id: row.id,
    productId: row.product_id,
    versionNumber: row.version_number,
    priceCents: row.price_cents,
    currency: row.currency,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to ?? null
  };
}

/** Loads every price version for a product, newest window first. */
export async function loadPriceVersionsForProduct(db: any, productId: string): Promise<ProductPriceVersion[]> {
  const { data, error } = await db
    .from('product_price_versions')
    .select('id,product_id,version_number,price_cents,currency,effective_from,effective_to')
    .eq('product_id', productId)
    .order('effective_from', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(toPriceVersion);
}

/**
 * Maps a Postgres error raised by create_paid_order() to a typed reason. The RPC raises named,
 * stable errors precisely so the route can report a specific cause instead of a generic failure.
 */
function reasonForRpcError(message: string): PaidOrderCreationReason {
  if (message.includes('paid_order_tier_not_self_service')) return 'tier_not_self_service';
  if (message.includes('paid_order_product_not_found')) return 'product_missing';
  if (message.includes('paid_order_product_inactive')) return 'product_inactive';
  if (message.includes('paid_order_open_price_version_invalid')) return 'price_version_missing';
  if (message.includes('paid_order_price_version_not_effective')) return 'price_version_missing';
  if (message.includes('paid_order_catalogue_contract_mismatch')) return 'price_version_mismatch';
  if (message.includes('paid_order_price_entitlement_inconsistent')) return 'price_version_mismatch';
  if (message.includes('paid_order_assessment_not_found')) return 'product_missing';
  return 'order_insert_failed';
}

/**
 * Creates a paid order for the chosen tier through one transactional database primitive.
 *
 * Atomicity is the whole point: the order and authoritative creation trail commit together or not at
 * all, under a lock on the assessment row. Two concurrent requests for one tier therefore produce
 * one order for that product; the loser observes the existing order rather than creating a second
 * paid-product request.
 *
 * The amount is never sent by this function as a value to store. It is sent as the contract this
 * build compiled against, and the database refuses the write if its own current price version
 * disagrees -- which is what stops a stale deployment writing a mispriced order after a reprice.
 *
 * Notifications and analytics run AFTER the commit, deliberately outside the transaction.
 */
export async function createPaidOrderForAssessment(input: {
  tier: unknown;
  assessment: any;
  organisation?: any | null;
  respondent?: any | null;
  /** Only Essential links an order to a detailed-report data request; Comprehensive does not. */
  dataRequest?: any | null;
  invoiceRequested?: boolean;
  invoiceDetails?: Record<string, string> | null;
}): Promise<PaidOrderCreationResult> {
  const product = paidProductForTier(input.tier);
  if (!product) {
    return {
      ok: false,
      reason: 'tier_not_self_service',
      message: 'Only the Essential and Comprehensive tiers can be ordered through the platform. Advisory is scoped manually.'
    };
  }

  const tier = product.tier as SelfServicePaidTier;
  const db = service();

  // A read, and safe to do before the transaction: the snapshot is an immutable copy of whatever
  // EFT profile is active now, and the order row stores it verbatim.
  const eftSnapshot = await buildEftInstructionSnapshot();
  const customerSafeEft = customerSafeEftInstructions(eftSnapshot);
  if (!customerSafeEft) {
    return {
      ok: false,
      reason: 'eft_instructions_unavailable',
      message: 'EFT payment instructions are temporarily unavailable. The order was not created; please contact MK Fraud Insights.'
    };
  }

  const invoiceRequested = input.invoiceRequested === true;
  const invoiceDetails = invoiceRequested ? input.invoiceDetails ?? null : null;

  const { data, error } = await db.rpc('create_paid_order_with_invoice', {
    p_tier: tier,
    p_assessment_id: input.assessment.id,
    p_expected_product_code: product.productCode,
    p_expected_amount_cents: product.priceCents,
    p_expected_currency: product.currency,
    p_report_request_id: input.dataRequest?.id ?? null,
    p_customer_email: input.respondent?.email ?? input.dataRequest?.requested_by_email ?? null,
    p_customer_name: input.respondent?.full_name ?? null,
    p_organisation_name: input.organisation?.legal_name ?? input.organisation?.trading_name ?? 'Organisation',
    p_product_name: product.label,
    p_eft_instructions_snapshot: eftSnapshot,
    p_requested_by_respondent_id: input.assessment.primary_respondent_id ?? null,
    p_assessment_reference: input.assessment.assessment_reference ?? null,
    p_invoice_requested: invoiceRequested,
    p_invoice_details: invoiceDetails ?? {}
  });

  if (error) {
    const message = String(error.message ?? '');
    return { ok: false, reason: reasonForRpcError(message), message: message || `The ${product.label} order could not be created.` };
  }
  if (!data) {
    return { ok: false, reason: 'order_insert_failed', message: `The ${product.label} order could not be created.` };
  }

  const { data: boundOrder, error: boundOrderError } = await db
    .from('orders')
    .select('eft_instructions_snapshot')
    .eq('id', data.order_id)
    .maybeSingle();
  const boundEft = customerSafeEftInstructions(boundOrder?.eft_instructions_snapshot);
  if (boundOrderError || !boundEft) {
    return {
      ok: false,
      reason: 'eft_instructions_unavailable',
      message: 'The order was not returned with a payable EFT snapshot. Contact MK Fraud Insights before making payment.'
    };
  }

  const created = data.created === true;

  // Post-commit only. A notification failure must never undo an authoritative commercial write, so
  // these run after the transaction and their outcome does not change the result.
  if (created) {
    const metadata = {
      assessment_reference: input.assessment.assessment_reference,
      order_reference: data.order_reference,
      tier,
      product_code: product.productCode,
      amount_cents: data.amount_cents
    };

    await Promise.all([
      trackAssessmentEvent({
        eventType: tier === 'comprehensive' ? 'comprehensive_order_created' : 'eft_order_created',
        assessmentId: input.assessment.id,
        organisationId: input.assessment.organisation_id,
        respondentId: input.assessment.primary_respondent_id,
        orderId: data.order_id,
        dataRequestId: input.dataRequest?.id ?? null,
        optionCode: tier,
        metadata
      }),
      queueInternalNotification({
        notificationType: tier === 'comprehensive' ? 'comprehensive_order_created' : 'eft_order_created',
        assessmentId: input.assessment.id,
        organisationId: input.assessment.organisation_id,
        respondentId: input.assessment.primary_respondent_id,
        orderId: data.order_id,
        dataRequestId: input.dataRequest?.id ?? null,
        optionCode: tier,
        metadata
      })
    ]);
  }

  return {
    ok: true,
    created,
    tier,
    orderId: data.order_id,
    orderReference: data.order_reference,
    productCode: data.product_code,
    productName: data.product_name,
    amountCents: data.amount_cents,
    currency: data.currency,
    amountDisplay: formatOrderAmount(data.amount_cents, data.currency),
    status: data.status,
    paymentReference: paymentReferenceFor(data.order_reference),
    eftInstructions: boundEft,
    invoiceRequested,
    invoiceDetails
  };
}

export type OrderProductState = {
  orderReference: string;
  tier: CommercialTier | null;
  productCode: string | null;
  productName: string;
  amountCents: number | null;
  currency: string | null;
  amountDisplay: string;
  status: string;
  paymentReference: string;
  createdAt: string;
  priceVersion: { id: string; versionNumber: number; priceCents: number; currency: string } | null;
  automatedFulfilment: {
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
  } | null;
};

/** Read model for "what did this customer buy and where is it". */
export async function getOrderProductState(orderReference: string): Promise<OrderProductState | null> {
  const db = service();
  const { data: order, error } = await db
    .from('orders')
    .select('id,order_reference,status,amount_cents,currency,product_name,created_at,product_price_version_id,products:product_id(product_code)')
    .eq('order_reference', orderReference)
    .maybeSingle();

  if (error || !order) return null;

  const product = Array.isArray(order.products) ? order.products[0] : order.products;

  const { data: versionRow } = order.product_price_version_id
    ? await db
      .from('product_price_versions')
      .select('id,version_number,price_cents,currency')
      .eq('id', order.product_price_version_id)
      .maybeSingle()
    : { data: null };

  const expectedReportType = product?.product_code === 'mk_validated_assessment'
    ? 'mk_validated'
    : product?.product_code === 'essential_self_assessment'
      ? 'essential_self_assessment'
      : null;
  const { data: attempt } = await db
    .from('manual_report_generation_attempts')
    .select('id,status,output_report_id,automatic_delivery_authorization_id,error_category,created_at')
    .eq('order_id', order.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const { data: report } = expectedReportType
    ? await db
      .from('reports')
      .select('id,report_type,status,storage_status,version_number,file_name,mime_type,file_size_bytes,order_id')
      .eq('order_id', order.id)
      .eq('report_type', expectedReportType)
      .order('version_number', { ascending: false })
      .limit(1)
      .maybeSingle()
    : { data: null };
  const { data: register } = report && product?.product_code === 'mk_validated_assessment'
    ? await db
      .from('report_artifacts')
      .select('artefact_type,file_name,mime_type,file_size_bytes,artifact_version,storage_status,release_state,engagement_id')
      .eq('report_id', report.id)
      .eq('artefact_type', 'supporting_register')
      .is('engagement_id', null)
      .eq('storage_status', 'VERIFIED')
      .eq('release_state', 'released')
      .maybeSingle()
    : { data: null };
  const { data: authorization } = attempt?.automatic_delivery_authorization_id
    ? await db
      .from('report_delivery_authorizations')
      .select('id,status')
      .eq('id', attempt.automatic_delivery_authorization_id)
      .maybeSingle()
    : { data: null };

  const reportReady = Boolean(
    report
      && report.status === 'released'
      && report.storage_status === 'VERIFIED'
        && register
        && register.storage_status === 'VERIFIED'
        && register.release_state === 'released'
      && Number(register.artifact_version) === Number(report.version_number)
  );
  const generationStatus = attempt?.status ?? null;
  const recoveryRequired = Boolean(
    attempt && ['REPORT_FAILED', 'GENERATION_FAILED', 'DELIVERY_FAILED', 'RECONCILIATION_REQUIRED'].includes(String(attempt.status).toUpperCase())
  );
  const automatedState: OrderProductState['automatedFulfilment'] = expectedReportType
    ? {
      state: recoveryRequired
        ? 'recovery_required'
        : reportReady && authorization?.status === 'finalized'
          ? 'delivered'
          : reportReady
            ? 'ready'
            : order.status === 'payment_received' || order.status === 'verified'
              ? 'preparing'
              : 'awaiting_payment',
      generationStatus,
      deliveryStatus: authorization?.status ?? null,
      reportId: report?.id ?? null,
      versionNumber: report ? Number(report.version_number) : null,
      deliverables: reportReady && report
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
        : []
    }
    : null;

  return {
    orderReference: order.order_reference,
    tier: tierForProductCode(product?.product_code ?? null),
    productCode: product?.product_code ?? null,
    productName: order.product_name,
    amountCents: order.amount_cents,
    currency: order.currency,
    amountDisplay: formatOrderAmount(order.amount_cents, order.currency),
    status: order.status,
    paymentReference: paymentReferenceFor(order.order_reference),
    createdAt: order.created_at,
    priceVersion: versionRow
      ? {
        id: versionRow.id,
        versionNumber: versionRow.version_number,
        priceCents: versionRow.price_cents,
        currency: versionRow.currency
      }
      : null,
    automatedFulfilment: automatedState
  };
}
