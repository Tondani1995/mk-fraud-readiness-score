import {
  evaluatePaymentVerificationEvidence,
  isValidPaymentSourceEvent,
  type PaymentVerificationEvidence
} from '@/lib/payments/payment-verification';
import { validateOrderPriceEntitlement } from '@/lib/commercial/order-price-entitlement';
import { tierForProductCode } from '@/lib/commercial/product-catalogue';
import {
  COMPREHENSIVE_REPORT_TYPE,
  ESSENTIAL_SELF_ASSESSMENT_REPORT_TYPE,
  PREMIUM_REPORT_ELIGIBLE_ORDER_STATUS,
  ReportEntitlementError
} from '@/lib/reports/report-entitlement';
import { requireRevisedCommercial } from '@/lib/readiness-review/commercial-environment';

/**
 * B5: the order context for a paid report on a revised (readiness_review) assessment. Returns null for any other
 * assessment, so the existing MFRS path is untouched. For a revised assessment it applies the same commercial rules
 * as validatePremiumReportGenerationEntitlement (payment evidence, order status, product tier, price version, ZAR,
 * order-assessment relationship), and replaces the MFRS score-run checks with the revised binding checks: an
 * unscored, locked, completed run whose input digest is the bound report input.
 */

export type RevisedOrderContext = {
  orderId: string;
  orderReference: string;
  assessmentId: string;
  assessmentReference: string;
  organisationId: string;
  organisationName: string;
  customerName: string | null;
  scoreRunId: string;
  reportType: typeof ESSENTIAL_SELF_ASSESSMENT_REPORT_TYPE | typeof COMPREHENSIVE_REPORT_TYPE;
  product: 'essential' | 'comprehensive';
  binding: {
    sessionId: string;
    inputDigest: string;
    logDigest: string;
    actionCount: number;
    engineBuild: string;
    outstandingTotal: number;
    boundAt: string;
  };
};

function reject(reason: ConstructorParameters<typeof ReportEntitlementError>[0], message: string): never {
  throw new ReportEntitlementError(reason, message);
}
const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

export async function loadRevisedOrder(db: any, orderReference: string): Promise<RevisedOrderContext | null> {
  const { data: order, error: orderError } = await db
    .from('orders')
    .select('id, order_reference, status, product_id, product_price_version_id, created_at, assessment_id, amount_cents, currency, organisation_name, customer_name, verified_at, verified_by, products:product_id(product_code, currency)')
    .eq('order_reference', orderReference)
    .maybeSingle();
  if (orderError || !order) return null;
  const { data: assessment, error: assessmentError } = await db
    .from('assessments')
    .select('id, assessment_reference, organisation_id, assessment_mode, current_score_run_id, status, organisations:organisation_id(legal_name, trading_name)')
    .eq('id', order.assessment_id)
    .maybeSingle();
  if (assessmentError || !assessment || assessment.assessment_mode !== 'readiness_review') return null;

  // From here the order is a revised order: every failure is a refusal, never a fall-through to the MFRS path.
  requireRevisedCommercial();

  const { data: run, error: runError } = await db
    .from('score_runs')
    .select('id, assessment_id, status, locked_at, input_hash, overall_score, adaptive_result_status, adaptive_metrics_json')
    .eq('id', assessment.current_score_run_id)
    .maybeSingle();
  if (runError || !run) reject('assessment_not_scored', 'The revised assessment has no bound score-run record.');
  if (run.assessment_id !== assessment.id) reject('relationship_mismatch', 'The revised run does not belong to the ordered assessment.');
  if (run.status !== 'completed' || !run.locked_at) reject('score_run_not_locked', 'The revised run is not completed and locked.');
  if (run.adaptive_result_status !== 'REVISED_UNSCORED' || run.overall_score !== null) {
    reject('assessment_not_scored', 'A revised assessment must carry an unscored run; no revised scoring method is approved.');
  }
  if (!/^[0-9a-f]{64}$/.test(run.input_hash ?? '')) reject('score_run_input_hash_invalid', 'The revised run has no valid input digest.');

  const { data: binding, error: bindingError } = await db.rpc('review_commercial_binding', { p_assessment_id: assessment.id });
  if (bindingError || !binding) reject('relationship_mismatch', 'The revised assessment has no answer-log binding.');
  if (binding.input_digest !== run.input_hash || binding.score_run_id !== run.id) {
    reject('relationship_mismatch', 'The revised run and its answer-log binding disagree.');
  }

  // ---- Commercial rules, identical to the existing entitlement. ----
  if (order.assessment_id !== assessment.id) reject('relationship_mismatch', 'Order and assessment relationships are inconsistent.');
  const product = Array.isArray(order.products) ? order.products[0] : order.products;
  const productCode = product?.product_code ?? null;
  const tier = tierForProductCode(productCode);
  if (tier !== 'essential' && tier !== 'comprehensive') reject('order_not_eligible', `Product ${productCode ?? 'unknown'} is not eligible for premium report generation.`);
  if (order.status !== PREMIUM_REPORT_ELIGIBLE_ORDER_STATUS) {
    reject('order_not_eligible', `Order has status "${order.status ?? 'unknown'}" and is not eligible for premium report generation.`);
  }
  if (order.currency !== 'ZAR' || product?.currency !== 'ZAR') reject('order_not_eligible', 'Premium report generation only supports ZAR entitlements.');

  const { data: paymentRows, error: paymentError } = await db
    .from('payment_transition_events')
    .select('id,new_state,source,actor_reference,amount_cents,currency,provider_transaction_reference,provider_event_reference,provider_event_at,verification_result,processing_result')
    .eq('order_id', order.id)
    .eq('new_state', 'PAID')
    .eq('processing_result', 'applied')
    .order('created_at', { ascending: false });
  if (paymentError) reject('order_not_verified', 'Payment verification evidence could not be loaded.');
  const actorIds = [...new Set((paymentRows ?? [])
    .filter((row: any) => row.source === 'manual_admin' && /^[0-9a-f-]{36}$/i.test(row.actor_reference ?? ''))
    .map((row: any) => row.actor_reference))];
  const { data: verifierRows } = actorIds.length
    ? await db.from('admin_profiles').select('id,status,role').in('id', actorIds)
    : { data: [] };
  const verifiers = new Map((verifierRows ?? []).map((row: any) => [String(row.id).toLowerCase(), row]));
  const evidenceFor = (row: any): PaymentVerificationEvidence => {
    const verifier: any = verifiers.get(String(row.actor_reference ?? '').toLowerCase());
    return {
      paymentState: row.new_state ?? null, confirmationSource: row.source ?? null, actorReference: row.actor_reference ?? null,
      providerTransactionReference: row.provider_transaction_reference ?? null, providerEventReference: row.provider_event_reference ?? null,
      providerEventAt: row.provider_event_at ?? null, verificationResult: row.verification_result ?? null,
      processingResult: row.processing_result ?? null, paymentEventId: row.id ?? null, amountCents: num(row.amount_cents),
      orderAmountCents: num(order.amount_cents), currency: row.currency ?? null, orderCurrency: order.currency ?? null,
      orderVerifiedAt: order.verified_at ?? null, orderVerifiedBy: order.verified_by ?? null,
      manualVerifierStatus: verifier?.status ?? null, manualVerifierRole: verifier?.role ?? null,
      priorValidSourceEvent: false, transitionCount: paymentRows?.length ?? 0
    };
  };
  const evidence = (paymentRows ?? []).map(evidenceFor);
  if (!evidence.length) reject('order_not_verified', 'Premium report generation requires valid payment verification evidence (no_payment_event).');
  const priorValid = evidence.some((e: PaymentVerificationEvidence) => isValidPaymentSourceEvent({ ...e, transitionCount: 1 }));
  const payment = evaluatePaymentVerificationEvidence({ ...evidence[0], priorValidSourceEvent: priorValid, transitionCount: evidence.length });
  if (!payment.valid) reject('order_not_verified', `Premium report generation requires valid payment verification evidence (${payment.reason}).`);

  const { data: versionRows } = await db
    .from('product_price_versions')
    .select('id, product_id, version_number, price_cents, currency, effective_from, effective_to')
    .eq('product_id', order.product_id)
    .order('effective_from', { ascending: false });
  const versions = (versionRows ?? []).map((row: any) => ({
    id: row.id, productId: row.product_id, versionNumber: row.version_number, priceCents: row.price_cents,
    currency: row.currency, effectiveFrom: row.effective_from, effectiveTo: row.effective_to ?? null
  }));
  if (!versions.length || versions.some((v: any) => v.productId !== order.product_id)) {
    reject('order_price_not_entitled', 'The order product identity and its price-version history do not agree.');
  }
  const price = validateOrderPriceEntitlement({
    orderId: order.id, productId: order.product_id, amountCents: num(order.amount_cents), currency: order.currency,
    createdAt: order.created_at, productPriceVersionId: order.product_price_version_id ?? null
  }, versions);
  if (!price.valid) reject('order_price_not_entitled', `The order amount is not the price that applied when the order was created (${price.reason}).`);

  const organisation = Array.isArray(assessment.organisations) ? assessment.organisations[0] : assessment.organisations;
  return {
    orderId: order.id,
    orderReference: order.order_reference,
    assessmentId: assessment.id,
    assessmentReference: assessment.assessment_reference,
    organisationId: assessment.organisation_id,
    organisationName: organisation?.trading_name || organisation?.legal_name || order.organisation_name || 'Organisation',
    customerName: order.customer_name ?? null,
    scoreRunId: run.id,
    reportType: tier === 'comprehensive' ? COMPREHENSIVE_REPORT_TYPE : ESSENTIAL_SELF_ASSESSMENT_REPORT_TYPE,
    product: tier,
    binding: {
      sessionId: binding.session_id,
      inputDigest: binding.input_digest,
      logDigest: binding.log_digest,
      actionCount: Number(binding.action_count),
      engineBuild: binding.engine_build,
      outstandingTotal: Number(binding.outstanding_total),
      boundAt: binding.bound_at
    }
  };
}
