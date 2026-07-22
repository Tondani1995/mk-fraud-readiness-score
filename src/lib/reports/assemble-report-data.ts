import { createSupabaseServiceClient } from '@/lib/supabase/server';
import type {
  AssembledReportData,
  DomainResultRecord,
  ExposureAnswerRecord,
  GapQuestionRecord,
  MaturityCapEventRecord,
  RecommendationRuleRecord,
  ScoreBand
} from './types';

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

export async function assembleReportData(orderReference: string): Promise<AssembledReportData> {
  const supabase = createSupabaseServiceClient();

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id, order_reference, status, product_id, assessment_id, amount_cents, currency, organisation_name, customer_name, customer_email, verified_at, verified_by, products:product_id(product_code, name, price_cents, currency, requires_payment_verification, delivery_mode, active)')
    .eq('order_reference', orderReference)
    .maybeSingle();

  if (orderError || !order) throw new ReportAssemblyError('order_not_found', `Order ${orderReference} was not found.`);

  const { data: assessment, error: assessmentError } = await supabase
    .from('assessments')
    .select('id, assessment_reference, organisation_id, current_score_run_id, organisations:organisation_id(legal_name,trading_name), respondents:primary_respondent_id(full_name,email)')
    .eq('id', order.assessment_id)
    .maybeSingle();

  if (assessmentError || !assessment || !assessment.current_score_run_id) {
    throw new ReportAssemblyError('assessment_not_scored', `Assessment for order ${orderReference} has no current score run.`);
  }

  const { data: scoreRunRow, error: scoreRunError } = await supabase
    .from('score_runs')
    .select('id, assessment_id, methodology_version_id, overall_score, calculated_maturity, final_maturity, exposure_score, exposure_band, coverage_pct, n_a_rate_pct, critical_gap_count, major_gap_count, cap_applied, cap_reason, status, locked_at, input_hash')
    .eq('id', assessment.current_score_run_id)
    .eq('status', 'completed')
    .maybeSingle();

  if (scoreRunError || !scoreRunRow) throw new ReportAssemblyError('assessment_not_scored', `Score run ${assessment.current_score_run_id} is missing or incomplete.`);

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

  const product = Array.isArray(order.products) ? order.products[0] : order.products;

  return {
    orderId: order.id,
    orderReference: order.order_reference,
    orderAssessmentId: order.assessment_id,
    assessmentId: assessment.id,
    organisationId: assessment.organisation_id,
    currentScoreRunId: assessment.current_score_run_id,
    orderVerifiedAt: order.verified_at ?? null,
    orderVerifiedBy: order.verified_by ?? null,
    organisationName: (assessment.organisations as any)?.legal_name ?? (assessment.organisations as any)?.trading_name ?? order.organisation_name ?? 'Organisation',
    respondentName: (assessment.respondents as any)?.full_name ?? order.customer_name ?? 'Respondent',
    customerEmail: String(order.customer_email ?? '').trim().toLowerCase(),
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
      methodologyVersionId: scoreRunRow.methodology_version_id,
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
    expectedDomainResultCount: Number(expectedDomainCount ?? 0),
    actualDomainResultCount: Number(actualDomainCount ?? 0),
    expectedQuestionTraceCount: Number(expectedTraceCount ?? 0),
    actualQuestionTraceCount: Number(actualTraceCount ?? 0)
  };
}
