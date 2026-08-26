import { createSupabaseServiceClient } from '@/lib/supabase/server';
import type {
  AssembledReportData,
  DomainResultRecord,
  ExposureAnswerRecord,
  GapQuestionRecord,
  MaturityCapEventRecord,
  QuestionTraceRecord,
  RecommendationRuleRecord,
  ScoreBand
} from './types';
import { getOfficialResponseLabels } from './response-labels';
import {
  evaluatePaymentVerificationEvidence,
  isValidPaymentSourceEvent,
  type PaymentVerificationEvidence
} from '@/lib/payments/payment-verification';
import type { AdaptiveResultMetrics, AdaptiveResultStatus } from '@/lib/scoring/adaptive-scoring';

/**
 * Parses a recommendation rule's numeric score band from its structured condition_json where
 * possible, falling back to the human-readable title. Both fields are immutable production data
 * (recommendation_rules cannot be UPDATEd once its methodology version is in use -- see the
 * immutability trigger), so this has to tolerate the two live phrasings without requiring a data
 * change: "<=39" / "40-59" / "60-79" / ">=80" (phase1_trigger family) and the same text duplicated
 * under trigger_text (workbook_trigger family). Replaces the old approach of hardcoding needles like
 * "40-64" that never matched the real "40-59" title text.
 */
export function parseScoreBand(conditionJson: unknown, title: string | null): ScoreBand | null {
  const raw =
    (conditionJson && typeof conditionJson === 'object'
      ? (conditionJson as Record<string, unknown>).trigger_text ?? (conditionJson as Record<string, unknown>).trigger
      : null) ?? title ?? '';
  const text = String(raw);

  const lte = text.match(/<=\s*(\d+)/);
  if (lte) return { min: -Infinity, max: Number(lte[1]) };

  const gte = text.match(/>=\s*(\d+)/);
  if (gte) return { min: Number(gte[1]), max: Infinity };

  const range = text.match(/(\d+)\s*-\s*(\d+)/);
  if (range) return { min: Number(range[1]), max: Number(range[2]) };

  return null;
}

export type ReportAssemblyErrorReason =
  | 'order_not_found'
  | 'order_not_eligible'
  | 'assessment_not_scored'
  | 'entitlement_snapshot_failed'
  | 'score_run_missing_domain_results'
  | 'score_run_missing_question_traces';

export class ReportAssemblyError extends Error {
  readonly reason: ReportAssemblyErrorReason;

  // Explicit field + assignment, not TypeScript parameter-property shorthand -- see the matching
  // note on ReportCommercialQualityError (commercial-quality.ts) for why (node --experimental-
  // strip-types cannot codegen parameter properties, and this file is in the Checkpoint B lifecycle
  // test's real-orchestration import chain via phase1-manual-fulfilment.ts). Behaviourally
  // identical to the prior version; the reason union is unchanged, just named and hoisted so it can
  // be referenced without repeating it.
  constructor(reason: ReportAssemblyErrorReason, message: string) {
    super(message);
    this.name = 'ReportAssemblyError';
    this.reason = reason;
  }
}

function nullableNumber(value: unknown) {
  return value === null || value === undefined ? null : Number(value);
}

async function loadScoredAssessment(supabase: any, assessmentId: string) {
  // The local migration-replay suites restart PostgREST while retaining the same
  // application process. Give the committed score pointer a short read-after-write
  // window before classifying the order as commercially incomplete.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const result = await supabase
      .from('assessments')
      .select('id, assessment_reference, organisation_id, current_score_run_id, status, assessment_mode, submitted_at, locked_at, organisations:organisation_id(legal_name,trading_name), respondents:primary_respondent_id(full_name,email)')
      .eq('id', assessmentId)
      .maybeSingle();
    if (result.error || result.data?.current_score_run_id) return result;
    if (attempt < 4) await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return await supabase
    .from('assessments')
    .select('id, assessment_reference, organisation_id, current_score_run_id, status, assessment_mode, submitted_at, locked_at, organisations:organisation_id(legal_name,trading_name), respondents:primary_respondent_id(full_name,email)')
    .eq('id', assessmentId)
    .maybeSingle();
}

export type ReportAssemblyTarget =
  | string
  | { assessmentReference: string };

export async function assembleReportData(target: ReportAssemblyTarget): Promise<AssembledReportData> {
  const supabase = createSupabaseServiceClient();

  const assessmentScoped = typeof target !== 'string';
  const orderReference = typeof target === 'string' ? target : null;
  let order: any = null;
  let assessmentScopedProduct: any = null;
  let assessmentSeed: any = null;

  if (!assessmentScoped) {
    const { data, error } = await supabase
      .from('orders')
      .select('id, order_reference, status, product_id, product_price_version_id, created_at, assessment_id, amount_cents, currency, organisation_name, customer_name, customer_email, verified_at, verified_by, products:product_id(product_code, name, price_cents, currency, requires_payment_verification, delivery_mode, active)')
      .eq('order_reference', orderReference)
      .maybeSingle();
    if (error || !data) throw new ReportAssemblyError('order_not_found', `Order ${orderReference} was not found.`);
    order = data;
    assessmentSeed = { id: order.assessment_id };
  } else {
    const { data, error } = await supabase
      .from('assessments')
      .select('id')
      .eq('assessment_reference', (target as { assessmentReference: string }).assessmentReference)
      .maybeSingle();
    if (error || !data) {
      throw new ReportAssemblyError('assessment_not_scored', 'The requested assessment was not found.');
    }
    assessmentSeed = data;
    const { data: product, error: productError } = await supabase
      .from('products')
      .select('id, product_code, name, price_cents, currency, requires_payment_verification, delivery_mode, active')
      .eq('product_code', 'essential_self_assessment')
      .eq('active', true)
      .maybeSingle();
    if (productError || !product) {
      throw new ReportAssemblyError('entitlement_snapshot_failed', 'The Essential product catalogue entry is unavailable.');
    }
    assessmentScopedProduct = product;
    order = {
      id: null,
      order_reference: null,
      status: null,
      product_id: product.id,
      product_price_version_id: null,
      created_at: null,
      assessment_id: data.id,
      amount_cents: null,
      currency: product.currency ?? null,
      organisation_name: null,
      customer_name: null,
      customer_email: null,
      verified_at: null,
      verified_by: null,
      products: product
    };
  }

  const { data: assessment, error: assessmentError } = await loadScoredAssessment(supabase, assessmentSeed.id);

  if (assessmentError || !assessment || !assessment.current_score_run_id) {
    throw new ReportAssemblyError(
      'assessment_not_scored',
      assessmentScoped
        ? 'The requested assessment has no current score run.'
        : `Assessment for order ${orderReference} has no current score run.`
    );
  }

  const { data: scoreRunBase, error: scoreRunError } = await supabase
    .from('score_runs')
    .select('id, assessment_id, methodology_version_id, overall_score, calculated_maturity, final_maturity, exposure_score, exposure_band, coverage_pct, n_a_rate_pct, critical_gap_count, major_gap_count, cap_applied, cap_reason, status, locked_at, input_hash')
    .eq('id', assessment.current_score_run_id)
    .eq('assessment_id', assessment.id)
    .eq('status', 'completed')
    .maybeSingle();

  if (scoreRunError || !scoreRunBase) throw new ReportAssemblyError('assessment_not_scored', `Score run ${assessment.current_score_run_id} is missing or incomplete.`);

  const { data: methodologyVersion, error: methodologyVersionError } = await supabase
    .from('methodology_versions')
    .select('version_code')
    .eq('id', scoreRunBase.methodology_version_id)
    .maybeSingle();
  if (methodologyVersionError || !methodologyVersion?.version_code) {
    throw new ReportAssemblyError('assessment_not_scored', 'The locked score run methodology is unavailable.');
  }
  const methodologyVersionCode = String(methodologyVersion.version_code).trim();

  const scoreRunRow = scoreRunBase as typeof scoreRunBase & {
    adaptive_result_status?: AdaptiveResultStatus | null;
    adaptive_metrics_json?: AdaptiveResultMetrics | null;
  };

  const { data: adaptiveColumns, error: adaptiveColumnsError } = await supabase
    .from('score_runs')
    .select('adaptive_result_status,adaptive_metrics_json')
    .eq('id', scoreRunRow.id)
    .maybeSingle();
  if (adaptiveColumnsError
    && adaptiveColumnsError.code !== '42703'
    && !String(adaptiveColumnsError.message ?? '').toLowerCase().includes('does not exist')) {
    throw adaptiveColumnsError;
  }
  if (adaptiveColumns) Object.assign(scoreRunRow, adaptiveColumns);

  let paymentRows: any[] = [];
  let paymentError: any = null;
  if (!assessmentScoped) {
    const paymentResult = await supabase
      .from('payment_transition_events')
      .select('id,new_state,source,actor_reference,amount_cents,currency,provider_transaction_reference,provider_event_reference,provider_event_at,verification_result,processing_result')
      .eq('order_id', order.id)
      .eq('new_state', 'PAID')
      .eq('processing_result', 'applied')
      .order('created_at', { ascending: false });
    paymentRows = paymentResult.data ?? [];
    paymentError = paymentResult.error;
  }
  const legacyPaymentSchemaUnavailable = Boolean(paymentError && (
    paymentError.code === '42P01'
    || paymentError.code === 'PGRST205'
    || String(paymentError.message ?? '').toLowerCase().includes('payment_transition_events')
  ));
  if (paymentError && !legacyPaymentSchemaUnavailable) {
    throw new ReportAssemblyError('entitlement_snapshot_failed', 'Payment verification evidence could not be loaded.');
  }

  const manualActorIds = [...new Set([
    ...(paymentRows ?? [])
    .filter((row: any) => row.source === 'manual_admin' && /^[0-9a-f-]{36}$/i.test(row.actor_reference ?? ''))
    .map((row: any) => row.actor_reference),
    ...(legacyPaymentSchemaUnavailable && /^[0-9a-f-]{36}$/i.test(order.verified_by ?? '') ? [order.verified_by] : [])
  ])];
  const { data: verifierRows, error: verifierError } = manualActorIds.length > 0
    ? await supabase.from('admin_profiles').select('id,status,role').in('id', manualActorIds)
    : { data: [], error: null };
  if (verifierError) throw new ReportAssemblyError('entitlement_snapshot_failed', 'Payment verifier evidence could not be loaded.');
  const verifiers = new Map((verifierRows ?? []).map((row: any) => [String(row.id).toLowerCase(), row]));

  const paymentEvidenceForRow = (row: any): PaymentVerificationEvidence => {
    const verifier = verifiers.get(String(row.actor_reference ?? '').toLowerCase());
    return {
      paymentState: row.new_state ?? null,
      confirmationSource: row.source ?? null,
      actorReference: row.actor_reference ?? null,
      providerTransactionReference: row.provider_transaction_reference ?? null,
      providerEventReference: row.provider_event_reference ?? null,
      providerEventAt: row.provider_event_at ?? null,
      verificationResult: row.verification_result ?? null,
      processingResult: row.processing_result ?? null,
      paymentEventId: row.id ?? null,
      amountCents: nullableNumber(row.amount_cents),
      orderAmountCents: nullableNumber(order.amount_cents),
      currency: row.currency ?? null,
      orderCurrency: order.currency ?? null,
      orderVerifiedAt: order.verified_at ?? null,
      orderVerifiedBy: order.verified_by ?? null,
      manualVerifierStatus: verifier?.status ?? null,
      manualVerifierRole: verifier?.role ?? null,
      priorValidSourceEvent: false,
      transitionCount: paymentRows?.length ?? 0
    };
  };

  const sourceEvidence = (paymentRows ?? []).map(paymentEvidenceForRow);
  const priorValidSourceEvent = sourceEvidence.some((evidence) => isValidPaymentSourceEvent({ ...evidence, transitionCount: 1 }));
  const legacyEvidence: PaymentVerificationEvidence | null = legacyPaymentSchemaUnavailable
    && order.status === 'payment_received'
    && Boolean(order.verified_at)
    && Boolean(order.verified_by)
    ? {
      paymentState: 'PAID',
      confirmationSource: 'manual_admin',
      actorReference: order.verified_by,
      providerTransactionReference: null,
      providerEventReference: null,
      providerEventAt: null,
      verificationResult: 'authorised_manual_confirmation',
      processingResult: 'applied',
      // Compatibility marker only; no transition row is claimed to exist before 0024.
      paymentEventId: order.id,
      amountCents: nullableNumber(order.amount_cents),
      orderAmountCents: nullableNumber(order.amount_cents),
      currency: order.currency ?? null,
      orderCurrency: order.currency ?? null,
      orderVerifiedAt: order.verified_at ?? null,
      orderVerifiedBy: order.verified_by ?? null,
      manualVerifierStatus: verifierRows?.[0]?.status ?? null,
      manualVerifierRole: verifierRows?.[0]?.role ?? null,
      priorValidSourceEvent: false,
      transitionCount: 1,
      legacyOrderVerification: true
    }
    : null;
  const paymentVerification: PaymentVerificationEvidence = sourceEvidence.length > 0
    ? { ...sourceEvidence[0], priorValidSourceEvent, transitionCount: sourceEvidence.length }
    : legacyEvidence ?? {
      paymentState: null,
      confirmationSource: null,
      actorReference: null,
      providerTransactionReference: null,
      providerEventReference: null,
      providerEventAt: null,
      verificationResult: null,
      processingResult: null,
      paymentEventId: null,
      amountCents: null,
      orderAmountCents: nullableNumber(order.amount_cents),
      currency: null,
      orderCurrency: order.currency ?? null,
      orderVerifiedAt: order.verified_at ?? null,
      orderVerifiedBy: order.verified_by ?? null,
      manualVerifierStatus: null,
      manualVerifierRole: null,
      priorValidSourceEvent: false,
      transitionCount: 0
    };

  const [
    { count: expectedDomainCount, error: expectedDomainError },
    { count: actualDomainCount, error: actualDomainError },
    { count: expectedTraceCount, error: expectedTraceError },
    { count: actualTraceCount, error: actualTraceError }
  ] = await Promise.all([
    supabase.from('domains').select('id', { count: 'exact', head: true })
      .eq('methodology_version_id', scoreRunRow.methodology_version_id),
    supabase.from('score_domain_results').select('domain_id', { count: 'exact', head: true })
      .eq('score_run_id', scoreRunRow.id),
    supabase.from('questions').select('id', { count: 'exact', head: true })
      .eq('methodology_version_id', scoreRunRow.methodology_version_id).eq('active', true),
    supabase.from('score_question_traces').select('question_id', { count: 'exact', head: true })
      .eq('score_run_id', scoreRunRow.id)
  ]);
  if (expectedDomainError || actualDomainError || expectedTraceError || actualTraceError) {
    throw new ReportAssemblyError('entitlement_snapshot_failed', 'Report completeness counts could not be loaded.');
  }

  const { data: domainRows, error: domainError } = await supabase
    .from('score_domain_results')
    .select('raw_score, weighted_contribution, coverage_pct, critical_gap_count, domains:domain_id(domain_code, name, weight_pct, sort_order)')
    .eq('score_run_id', scoreRunRow.id);

  if (domainError || !domainRows || domainRows.length === 0) {
    throw new ReportAssemblyError('score_run_missing_domain_results', `Score run ${scoreRunRow.id} has no domain results.`);
  }

  const domainResults: DomainResultRecord[] = domainRows
    .map((row: any) => ({
      domainCode: row.domains.domain_code,
      domainName: row.domains.name,
      weightPct: Number(row.domains.weight_pct),
      rawScore: row.raw_score === null ? null : Number(row.raw_score),
      weightedContribution: row.weighted_contribution === null ? null : Number(row.weighted_contribution),
      coveragePct: row.coverage_pct === null ? null : Number(row.coverage_pct),
      criticalGapCount: row.critical_gap_count,
      sortOrder: row.domains.sort_order
    }))
    .sort((a: any, b: any) => a.sortOrder - b.sortOrder)
    .map(({ sortOrder: _sortOrder, ...rest }: any) => rest);

  const { data: traceRows, error: traceError } = await supabase
    .from('score_question_traces')
    .select('response_value, normalised_score, applicable, triggered_rules, is_critical_gap, is_major_gap, questions:question_id(question_code, prompt, is_critical, is_hard_gate, domains:domain_id(domain_code, name))')
    .eq('score_run_id', scoreRunRow.id);

  if (traceError) throw new ReportAssemblyError('score_run_missing_question_traces', `Failed to load question traces for score run ${scoreRunRow.id}.`);

  // Operating-model evidence the customer already gave at the adaptive gateways.
  //
  // Read-only and additive. Scoring never sees it: question traces flatten applicability
  // to a single boolean, which by scoring time is true for almost every control, so the
  // assembled data carried no way to tell a cash-handling multi-site operator from a
  // single-site online one. Report narrative needs that distinction; nothing analytical
  // does. Absent rows are normal for pre-adaptive assessments and yield an empty map.
  const { data: gatewayRows } = await supabase
    .from('adaptive_gateway_answers')
    .select('question_id, response_value')
    .eq('assessment_id', scoreRunRow.assessment_id);

  const adaptiveGatewayAnswers: Readonly<Record<string, string>> = Object.freeze(
    Object.fromEntries(
      (gatewayRows ?? [])
        .filter((row: any) => typeof row?.question_id === 'string' && typeof row?.response_value === 'string')
        .map((row: any) => [row.question_id, row.response_value])
    )
  );

  const questionTraces: QuestionTraceRecord[] = (traceRows ?? []).map((row: any) => ({
    questionCode: row.questions.question_code,
    domainCode: row.questions.domains.domain_code,
    domainName: row.questions.domains.name,
    prompt: row.questions.prompt,
    responseValue: row.response_value,
    normalisedScore: row.normalised_score === null ? null : Number(row.normalised_score),
    applicable: Boolean(row.applicable),
    triggeredRules: Array.isArray(row.triggered_rules) ? row.triggered_rules : [],
    isCritical: row.questions.is_critical,
    isHardGate: row.questions.is_hard_gate,
    isCriticalGap: row.is_critical_gap,
    isMajorGap: row.is_major_gap
  })).sort((a, b) => a.questionCode.localeCompare(b.questionCode));

  const criticalMajorGaps: GapQuestionRecord[] = questionTraces
    .filter((trace) => trace.isCriticalGap || trace.isMajorGap)
    .map(({ normalisedScore: _normalisedScore, applicable: _applicable, triggeredRules: _triggeredRules, ...gap }) => gap);

  // The official scale is loaded once for the score run's persisted methodology version. This is
  // deliberately not an active-methodology lookup and not a per-finding query.
  const officialResponseLabels = await getOfficialResponseLabels(scoreRunRow.methodology_version_id);

  // related_domain_id can be null on question-level cap events (every question belongs to a
  // domain, but the cap-writing path only ever persisted the question reference for those rules).
  // Resolve the domain through the question as a fallback rather than mutating locked score-run
  // history: maturity_cap_events rows are guarded by guard_score_trace_write once the parent score
  // run is completed/locked, so a data backfill is not possible (and would be the wrong fix anyway
  // -- resolving at read time is resilient to any future rule that has the same gap).
  const { data: capRows } = await supabase
    .from('maturity_cap_events')
    .select(
      'rule_code, cap_to, reason, question:related_question_id(question_code, prompt, question_domain:domain_id(domain_code, name)), domain:related_domain_id(domain_code, name)'
    )
    .eq('score_run_id', scoreRunRow.id);

  const maturityCapEvents: MaturityCapEventRecord[] = (capRows ?? []).map((row: any) => {
    const directDomain = row.domain ?? null;
    const questionDomain = row.question?.question_domain ?? null;
    const resolvedDomain = directDomain ?? questionDomain;
    return {
      ruleCode: row.rule_code,
      capTo: row.cap_to,
      reason: row.reason,
      relatedQuestionCode: row.question?.question_code ?? null,
      relatedQuestionPrompt: row.question?.prompt ?? null,
      relatedDomainCode: resolvedDomain?.domain_code ?? null,
      relatedDomainName: resolvedDomain?.name ?? null
    };
  });

  const { data: exposureRows } = await supabase
    .from('exposure_answers')
    .select('points_awarded, raw_value_json, exposure_factors:exposure_factor_id(factor_code, name, max_points, sort_order)')
    .eq('assessment_id', assessment.id);

  const exposureAnswers: ExposureAnswerRecord[] = (exposureRows ?? [])
    .map((row: any) => ({
      factorCode: row.exposure_factors.factor_code,
      name: row.exposure_factors.name,
      selectedLabel: row.raw_value_json?.selectedLabel ?? row.raw_value_json?.selectedValue ?? 'Captured',
      pointsAwarded: Number(row.points_awarded),
      maxPoints: Number(row.exposure_factors.max_points),
      sortOrder: row.exposure_factors.sort_order
    }))
    .sort((a: any, b: any) => a.sortOrder - b.sortOrder)
    .map(({ sortOrder: _sortOrder, ...rest }: any) => rest);

  // recommendation_rules is immutable once its methodology_version_id is used by any assessment
  // (trg_recommendation_rules_immutability / prevent_methodology_mutation_after_use) -- both
  // methodology versions in production are already in use, so this data cannot be edited or
  // deduplicated in place. The fix has to live in how we parse the existing, unmutated rows.
  const { data: ruleRows } = await supabase
    .from('recommendation_rules')
    .select('rule_code, title, severity, condition_json, action_30, action_60, action_90')
    .eq('active', true)
    .not('action_30', 'is', null);

  // Duplicate rows exist (two seeding generations -- "REC-xx"/workbook_trigger and
  // "domain_score_xx"/phase1_trigger -- plus exact re-seeds within each). They are content-identical
  // per rule, so first-match dedup by a content key is safe: it doesn't hide distinct rules, only
  // repeated copies of the same one. True cleanup would require a new methodology version and is
  // out of scope here; documented as a known limitation.
  const seen = new Set<string>();
  const recommendationRules: RecommendationRuleRecord[] = [];
  for (const row of ruleRows ?? []) {
    const dedupeKey = `${row.title}::${row.severity}::${row.action_30}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    recommendationRules.push({
      ruleCode: row.rule_code,
      title: row.title,
      severity: row.severity,
      scoreBand: parseScoreBand(row.condition_json, row.title),
      action30: row.action_30,
      action60: row.action_60,
      action90: row.action_90
    });
  }

  const product = assessmentScopedProduct
    ?? (Array.isArray(order.products) ? order.products[0] : order.products);

  // The product's full price history. Entitlement resolves the order's amount against the version
  // that applied when the order was created, so a later catalogue reprice cannot de-entitle it.
  const priceVersionRows = assessmentScoped
    ? []
    : ((await supabase
      .from('product_price_versions')
      .select('id, product_id, version_number, price_cents, currency, effective_from, effective_to')
      .eq('product_id', order.product_id)
      .order('effective_from', { ascending: false })).data ?? []);

  const productPriceVersions = (priceVersionRows ?? []).map((row: any) => ({
    id: row.id,
    productId: row.product_id,
    versionNumber: row.version_number,
    priceCents: row.price_cents,
    currency: row.currency,
    effectiveFrom: row.effective_from,
    effectiveTo: row.effective_to ?? null
  }));

  return {
    orderId: order.id,
    orderReference: order.order_reference,
    orderAssessmentId: order.assessment_id,
    assessmentId: assessment.id,
    organisationId: assessment.organisation_id,
    currentScoreRunId: assessment.current_score_run_id,
    orderVerifiedAt: order.verified_at ?? null,
    orderVerifiedBy: order.verified_by ?? null,
    paymentVerification,
    organisationName: (assessment.organisations as any)?.legal_name ?? (assessment.organisations as any)?.trading_name ?? order.organisation_name ?? 'Organisation',
    respondentName: (assessment.respondents as any)?.full_name ?? order.customer_name ?? 'Respondent',
    customerEmail: String(order.customer_email ?? (assessment.respondents as any)?.email ?? '').trim().toLowerCase(),
    assessmentReference: assessment.assessment_reference,
    reportReference: `RPT-${assessment.assessment_reference}`,
    generatedAt: new Date().toISOString(),
    packageName: (product as any)?.name ?? 'Detailed Fraud Readiness Report',
    productCode: (product as any)?.product_code ?? null,
    orderStatus: order.status,
    amountCents: nullableNumber(order.amount_cents),
    currency: order.currency ?? null,
    productPriceCents: nullableNumber((product as any)?.price_cents),
    productCurrency: (product as any)?.currency ?? null,
    productId: order.product_id ?? null,
    orderCreatedAt: order.created_at ?? null,
    productPriceVersionId: order.product_price_version_id ?? null,
    productPriceVersions,
    requiresPaymentVerification: (product as any)?.requires_payment_verification ?? null,
    deliveryMode: (product as any)?.delivery_mode ?? null,
    productActive: (product as any)?.active ?? null,
    scoreRun: {
      id: scoreRunRow.id,
      assessmentId: scoreRunRow.assessment_id,
      methodologyVersionId: scoreRunRow.methodology_version_id,
      ...{ methodologyVersionCode },
      status: scoreRunRow.status,
      lockedAt: scoreRunRow.locked_at ?? null,
      inputHash: scoreRunRow.input_hash ?? null,
      overallScore: scoreRunRow.overall_score === null ? null : Number(scoreRunRow.overall_score),
      calculatedMaturity: scoreRunRow.calculated_maturity,
      finalMaturity: scoreRunRow.final_maturity,
      exposureScore: scoreRunRow.exposure_score === null ? null : Number(scoreRunRow.exposure_score),
      exposureBand: scoreRunRow.exposure_band,
      coveragePct: Number(scoreRunRow.coverage_pct),
      nARatePct: Number(scoreRunRow.n_a_rate_pct),
      criticalGapCount: scoreRunRow.critical_gap_count,
      majorGapCount: scoreRunRow.major_gap_count,
      capApplied: scoreRunRow.cap_applied,
      capReason: scoreRunRow.cap_reason,
      adaptiveResultStatus: scoreRunRow.adaptive_result_status ?? null,
      adaptiveMetrics: scoreRunRow.adaptive_metrics_json && Object.keys(scoreRunRow.adaptive_metrics_json).length ? scoreRunRow.adaptive_metrics_json : null
    },
    domainResults,
    exposureAnswers,
    questionTraces,
    criticalMajorGaps,
    officialResponseLabels,
    maturityCapEvents,
    recommendationRules,
    expectedDomainResultCount: Number(expectedDomainCount ?? 0),
    actualDomainResultCount: Number(actualDomainCount ?? 0),
    expectedQuestionTraceCount: Number(expectedTraceCount ?? 0),
    actualQuestionTraceCount: Number(actualTraceCount ?? 0),
    adaptiveScope: scoreRunRow.adaptive_metrics_json && Object.keys(scoreRunRow.adaptive_metrics_json).length ? scoreRunRow.adaptive_metrics_json : null,
    adaptiveGatewayAnswers
  };
}
