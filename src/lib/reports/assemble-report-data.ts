import { createSupabaseServiceClient } from '@/lib/supabase/server';
import type {
  AssembledReportData,
  DomainResultRecord,
  ExposureAnswerRecord,
  GapQuestionRecord,
  MaturityCapEventRecord,
  RecommendationRuleRecord
} from './types';

export class ReportAssemblyError extends Error {
  constructor(
    public readonly reason:
      | 'order_not_found'
      | 'order_not_eligible'
      | 'assessment_not_scored'
      | 'entitlement_snapshot_failed'
      | 'score_run_missing_domain_results'
      | 'score_run_missing_question_traces',
    message: string
  ) {
    super(message);
    this.name = 'ReportAssemblyError';
  }
}

function nullableNumber(value: unknown) {
  return value === null || value === undefined ? null : Number(value);
}

export async function assembleReportData(orderReference: string): Promise<AssembledReportData> {
  const supabase = createSupabaseServiceClient();

  const { data: entitlementContext, error: entitlementError } = await supabase.rpc(
    'assert_premium_report_generation_entitlement',
    { p_order_reference: orderReference }
  );
  if (entitlementError || !entitlementContext) {
    throw new ReportAssemblyError(
      'entitlement_snapshot_failed',
      `Transactional premium-report entitlement failed: ${entitlementError?.message ?? 'no context returned'}`
    );
  }
  const context = entitlementContext as Record<string, unknown>;

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, order_reference, status, product_id, assessment_id, amount_cents, currency, organisation_name, customer_name, verified_at, verified_by, products:product_id(product_code, name, price_cents, currency, requires_payment_verification, delivery_mode, active)')
    .eq('order_reference', orderReference)
    .maybeSingle();

  if (orderError || !order) throw new ReportAssemblyError('order_not_found', `Order ${orderReference} was not found.`);

  const { data: assessment, error: assessmentError } = await supabase
    .from('assessments')
    .select('id, assessment_reference, current_score_run_id, organisations:organisation_id(legal_name,trading_name), respondents:primary_respondent_id(full_name,email)')
    .eq('id', order.assessment_id)
    .maybeSingle();

  if (assessmentError || !assessment || !assessment.current_score_run_id) {
    throw new ReportAssemblyError('assessment_not_scored', `Assessment for order ${orderReference} has no current score run.`);
  }

  const { data: scoreRunRow, error: scoreRunError } = await supabase
    .from('score_runs')
    .select('id, assessment_id, overall_score, calculated_maturity, final_maturity, exposure_score, exposure_band, coverage_pct, n_a_rate_pct, critical_gap_count, major_gap_count, cap_applied, cap_reason, status, locked_at, input_hash')
    .eq('id', assessment.current_score_run_id)
    .eq('status', 'completed')
    .maybeSingle();

  if (scoreRunError || !scoreRunRow) throw new ReportAssemblyError('assessment_not_scored', `Score run ${assessment.current_score_run_id} is missing or incomplete.`);

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
    .select('response_value, is_critical_gap, is_major_gap, questions:question_id(question_code, prompt, is_critical, is_hard_gate, domains:domain_id(domain_code, name))')
    .eq('score_run_id', scoreRunRow.id)
    .or('is_critical_gap.eq.true,is_major_gap.eq.true');

  if (traceError) throw new ReportAssemblyError('score_run_missing_question_traces', `Failed to load question traces for score run ${scoreRunRow.id}.`);

  const criticalMajorGaps: GapQuestionRecord[] = (traceRows ?? []).map((row: any) => ({
    questionCode: row.questions.question_code,
    domainCode: row.questions.domains.domain_code,
    domainName: row.questions.domains.name,
    prompt: row.questions.prompt,
    responseValue: row.response_value,
    isCritical: row.questions.is_critical,
    isHardGate: row.questions.is_hard_gate,
    isCriticalGap: row.is_critical_gap,
    isMajorGap: row.is_major_gap
  }));

  const { data: capRows } = await supabase
    .from('maturity_cap_events')
    .select('rule_code, cap_to, reason, questions:related_question_id(question_code), domains:related_domain_id(domain_code)')
    .eq('score_run_id', scoreRunRow.id);

  const maturityCapEvents: MaturityCapEventRecord[] = (capRows ?? []).map((row: any) => ({
    ruleCode: row.rule_code,
    capTo: row.cap_to,
    reason: row.reason,
    relatedQuestionCode: row.questions?.question_code ?? null,
    relatedDomainCode: row.domains?.domain_code ?? null
  }));

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

  const { data: ruleRows } = await supabase
    .from('recommendation_rules')
    .select('rule_code, title, severity, action_30, action_60, action_90')
    .eq('active', true)
    .not('action_30', 'is', null);

  const seen = new Set<string>();
  const recommendationRules: RecommendationRuleRecord[] = [];
  for (const row of ruleRows ?? []) {
    if (seen.has(row.rule_code)) continue;
    seen.add(row.rule_code);
    recommendationRules.push({
      ruleCode: row.rule_code,
      title: row.title,
      severity: row.severity,
      action30: row.action_30,
      action60: row.action_60,
      action90: row.action_90,
      firedForDomainCodes: []
    });
  }

  const product = Array.isArray(order.products) ? order.products[0] : order.products;

  return {
    orderId: order.id,
    orderReference: order.order_reference,
    orderAssessmentId: order.assessment_id,
    assessmentId: assessment.id,
    currentScoreRunId: assessment.current_score_run_id,
    orderVerifiedAt: order.verified_at ?? null,
    orderVerifiedBy: order.verified_by ?? null,
    organisationName: (assessment.organisations as any)?.legal_name ?? (assessment.organisations as any)?.trading_name ?? order.organisation_name ?? 'Organisation',
    respondentName: (assessment.respondents as any)?.full_name ?? order.customer_name ?? 'Respondent',
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
    requiresPaymentVerification: (product as any)?.requires_payment_verification ?? null,
    deliveryMode: (product as any)?.delivery_mode ?? null,
    productActive: (product as any)?.active ?? null,
    scoreRun: {
      id: scoreRunRow.id,
      assessmentId: scoreRunRow.assessment_id,
      status: scoreRunRow.status,
      lockedAt: scoreRunRow.locked_at ?? null,
      inputHash: scoreRunRow.input_hash ?? null,
      overallScore: Number(scoreRunRow.overall_score),
      calculatedMaturity: scoreRunRow.calculated_maturity,
      finalMaturity: scoreRunRow.final_maturity,
      exposureScore: Number(scoreRunRow.exposure_score),
      exposureBand: scoreRunRow.exposure_band,
      coveragePct: Number(scoreRunRow.coverage_pct),
      nARatePct: Number(scoreRunRow.n_a_rate_pct),
      criticalGapCount: scoreRunRow.critical_gap_count,
      majorGapCount: scoreRunRow.major_gap_count,
      capApplied: scoreRunRow.cap_applied,
      capReason: scoreRunRow.cap_reason
    },
    domainResults,
    exposureAnswers,
    criticalMajorGaps,
    maturityCapEvents,
    recommendationRules,
    expectedDomainResultCount: Number(context.expected_domain_count),
    actualDomainResultCount: Number(context.actual_domain_count),
    expectedQuestionTraceCount: Number(context.expected_trace_count),
    actualQuestionTraceCount: Number(context.actual_trace_count)
  };
}
