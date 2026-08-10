import { trackAssessmentEvent } from '@/lib/analytics/assessment-events';
import { queueInternalNotification } from '@/lib/notifications/internal-notifications';
import { buildEftInstructionSnapshot, formatOrderAmount } from '@/lib/orders/eft-instructions';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { COMPREHENSIVE_INITIAL_STATE } from './comprehensive-lifecycle';
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
 * against separate products, and nothing downstream treats one as the other: Essential report
 * generation checks the Essential product code, and the Comprehensive workflow is reachable only
 * through a comprehensive_engagements row, which only a Comprehensive order creates.
 */

export type PaidOrderCreationReason =
  | 'tier_not_self_service'
  | 'product_missing'
  | 'product_inactive'
  | 'price_version_missing'
  | 'price_version_mismatch'
  | 'engagement_already_active'
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
      engagementId: string | null;
      engagementState: string | null;
    }
  | { ok: false; reason: PaidOrderCreationReason; message: string };

function service() {
  return createSupabaseServiceClient() as any;
}

function makeOrderReference() {
  const year = new Date().getUTCFullYear();
  const random = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `MKORD-${year}-${random}`;
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

async function loadCatalogueProduct(db: any, productCode: string) {
  const { data, error } = await db
    .from('products')
    .select('id,product_code,name,price_cents,currency,requires_payment_verification,delivery_mode,active')
    .eq('product_code', productCode)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

export async function createPaidOrderForAssessment(input: {
  tier: unknown;
  assessment: any;
  organisation?: any | null;
  respondent?: any | null;
  /** Only Essential links an order to a detailed-report data request; Comprehensive does not. */
  dataRequest?: any | null;
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

  const catalogueRow = await loadCatalogueProduct(db, product.productCode);
  if (!catalogueRow) {
    return { ok: false, reason: 'product_missing', message: `Product ${product.productCode} is not present in the catalogue.` };
  }
  if (catalogueRow.active !== true) {
    return { ok: false, reason: 'product_inactive', message: `Product ${product.productCode} is not active.` };
  }

  const versions = await loadPriceVersionsForProduct(db, catalogueRow.id);
  const current = versions.filter((version) => version.effectiveTo === null);
  if (current.length !== 1) {
    return {
      ok: false,
      reason: 'price_version_missing',
      message: `Product ${product.productCode} does not have exactly one current price version.`
    };
  }
  const priceVersion = current[0];

  // The catalogue module and the database must agree about what this product costs right now. A
  // divergence means one of them has been edited without the other, and creating an order at either
  // value would be guessing.
  if (priceVersion.priceCents !== product.priceCents || priceVersion.currency !== product.currency) {
    return {
      ok: false,
      reason: 'price_version_mismatch',
      message: `The current ${product.label} price version does not match the authoritative catalogue price.`
    };
  }

  if (tier === 'comprehensive') {
    const { data: liveEngagement } = await db
      .from('comprehensive_engagements')
      .select('id,state,order_id,orders:order_id(order_reference,status,amount_cents,currency,product_name)')
      .eq('assessment_id', input.assessment.id)
      .neq('state', 'cancelled')
      .maybeSingle();

    if (liveEngagement) {
      const order = Array.isArray(liveEngagement.orders) ? liveEngagement.orders[0] : liveEngagement.orders;
      return {
        ok: true,
        created: false,
        tier,
        orderId: liveEngagement.order_id,
        orderReference: order?.order_reference ?? '',
        productCode: product.productCode,
        productName: order?.product_name ?? product.label,
        amountCents: order?.amount_cents ?? priceVersion.priceCents,
        currency: order?.currency ?? priceVersion.currency,
        amountDisplay: formatOrderAmount(order?.amount_cents ?? priceVersion.priceCents, order?.currency ?? priceVersion.currency),
        status: order?.status ?? 'awaiting_payment',
        paymentReference: paymentReferenceFor(order?.order_reference ?? ''),
        engagementId: liveEngagement.id,
        engagementState: liveEngagement.state
      };
    }
  }

  const organisationName = input.organisation?.legal_name ?? input.organisation?.trading_name ?? 'Organisation';
  const respondentEmail = input.respondent?.email ?? input.dataRequest?.requested_by_email ?? null;
  const eftSnapshot = await buildEftInstructionSnapshot();

  let inserted: any = null;
  let lastError: any = null;
  for (let attempt = 0; attempt < 3 && !inserted; attempt += 1) {
    const { data, error } = await db
      .from('orders')
      .insert({
        order_reference: makeOrderReference(),
        assessment_id: input.assessment.id,
        report_request_id: input.dataRequest?.id ?? null,
        product_id: catalogueRow.id,
        product_name: product.label,
        product_price_version_id: priceVersion.id,
        amount_cents: priceVersion.priceCents,
        currency: priceVersion.currency,
        status: 'awaiting_payment',
        requested_by_respondent_id: input.assessment.primary_respondent_id,
        customer_email: respondentEmail,
        customer_name: input.respondent?.full_name ?? null,
        organisation_name: organisationName,
        eft_instructions_snapshot: eftSnapshot
      })
      .select('id,order_reference,status,product_name,amount_cents,currency,created_at')
      .single();
    if (!error) inserted = data;
    lastError = error;
  }

  if (!inserted) {
    return {
      ok: false,
      reason: 'order_insert_failed',
      message: lastError?.message ?? `The ${product.label} order could not be created.`
    };
  }

  let engagementId: string | null = null;
  let engagementState: string | null = null;

  if (tier === 'comprehensive') {
    const { data: engagement, error: engagementError } = await db
      .from('comprehensive_engagements')
      .insert({
        order_id: inserted.id,
        assessment_id: input.assessment.id,
        organisation_id: input.assessment.organisation_id ?? null,
        state: COMPREHENSIVE_INITIAL_STATE
      })
      .select('id,state')
      .single();

    if (engagementError) {
      // The unique index on (assessment_id) where state <> 'cancelled' is the authority; a race
      // that loses it means another request already opened the engagement.
      return {
        ok: false,
        reason: 'engagement_already_active',
        message: 'A Comprehensive engagement already exists for this assessment.'
      };
    }

    engagementId = engagement.id;
    engagementState = engagement.state;

    await db.from('comprehensive_engagement_events').insert({
      engagement_id: engagement.id,
      event_type: 'engagement_created',
      new_state: engagement.state,
      actor_type: 'respondent_token',
      metadata_json: {
        order_reference: inserted.order_reference,
        assessment_reference: input.assessment.assessment_reference,
        product_code: product.productCode,
        amount_cents: inserted.amount_cents
      }
    });
  }

  await db.from('order_events').insert({
    order_id: inserted.id,
    event_type: 'order_created_from_report_request',
    new_status: inserted.status,
    metadata_json: {
      actor_type: 'respondent_token',
      assessment_reference: input.assessment.assessment_reference,
      tier,
      product_code: product.productCode,
      product_price_version_id: priceVersion.id,
      payment_gateway: false,
      proof_upload: false,
      report_unlock: false
    }
  });

  await db.from('audit_logs').insert({
    actor_type: 'respondent_token',
    assessment_id: input.assessment.id,
    entity_table: 'orders',
    entity_id: inserted.id,
    action: 'paid_order_created',
    after_json: {
      order_reference: inserted.order_reference,
      tier,
      product_code: product.productCode,
      amount_cents: inserted.amount_cents,
      currency: inserted.currency,
      product_price_version_id: priceVersion.id,
      status: inserted.status
    }
  });

  const metadata = {
    assessment_reference: input.assessment.assessment_reference,
    order_reference: inserted.order_reference,
    tier,
    product_code: product.productCode,
    amount_cents: inserted.amount_cents
  };

  await Promise.all([
    trackAssessmentEvent({
      eventType: tier === 'comprehensive' ? 'comprehensive_order_created' : 'eft_order_created',
      assessmentId: input.assessment.id,
      organisationId: input.assessment.organisation_id,
      respondentId: input.assessment.primary_respondent_id,
      orderId: inserted.id,
      dataRequestId: input.dataRequest?.id ?? null,
      optionCode: tier,
      metadata
    }),
    queueInternalNotification({
      notificationType: tier === 'comprehensive' ? 'comprehensive_order_created' : 'eft_order_created',
      assessmentId: input.assessment.id,
      organisationId: input.assessment.organisation_id,
      respondentId: input.assessment.primary_respondent_id,
      orderId: inserted.id,
      dataRequestId: input.dataRequest?.id ?? null,
      optionCode: tier,
      metadata
    })
  ]);

  return {
    ok: true,
    created: true,
    tier,
    orderId: inserted.id,
    orderReference: inserted.order_reference,
    productCode: product.productCode,
    productName: inserted.product_name,
    amountCents: inserted.amount_cents,
    currency: inserted.currency,
    amountDisplay: formatOrderAmount(inserted.amount_cents, inserted.currency),
    status: inserted.status,
    paymentReference: paymentReferenceFor(inserted.order_reference),
    engagementId,
    engagementState
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
  engagement: { id: string; state: string; reviewerAssigned: boolean; signedOff: boolean } | null;
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

  const { data: engagement } = await db
    .from('comprehensive_engagements')
    .select('id,state,reviewer_admin_user_id,signed_off_by')
    .eq('order_id', order.id)
    .maybeSingle();

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
    engagement: engagement
      ? {
        id: engagement.id,
        state: engagement.state,
        reviewerAssigned: Boolean(engagement.reviewer_admin_user_id),
        signedOff: Boolean(engagement.signed_off_by)
      }
      : null
  };
}
