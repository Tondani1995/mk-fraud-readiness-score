import { createSupabaseServiceClient } from '@/lib/supabase/server';
import type { AdminSession } from '@/lib/auth/admin-route';

const ASSESSMENT_PAGE_SIZE = 20;

type AdminDataResult<T = any> = {
  data: T | null;
  error: unknown;
};

function emptyResult<T>(data: T): AdminDataResult<T> {
  return { data, error: null };
}

export type AdminAssessmentListFilters = {
  status?: string;
  page?: number;
};

export async function getAdminAssessmentList(filters: AdminAssessmentListFilters = {}) {
  const service = createSupabaseServiceClient() as any;
  const page = Math.max(1, filters.page ?? 1);
  const from = (page - 1) * ASSESSMENT_PAGE_SIZE;
  const to = from + ASSESSMENT_PAGE_SIZE - 1;

  let query: any = service
    .from('assessments')
    .select('id,assessment_reference,status,started_at,submitted_at,locked_at,current_score_run_id,organisations(legal_name,trading_name,sector,industry),respondents(full_name,email,role_title)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status);

  const { data: assessments, count, error } = await query;
  if (error) {
    console.error('admin assessment list query failed', error);
    return { assessments: [], count: 0, page, pageSize: ASSESSMENT_PAGE_SIZE, scoreRunsById: new Map<string, any>() };
  }

  const scoreRunIds = (assessments ?? []).map((assessment: any) => assessment.current_score_run_id).filter(Boolean);
  let scoreRunsById = new Map<string, any>();

  if (scoreRunIds.length) {
    const { data: scoreRuns, error: scoreError } = await service
      .from('score_runs')
      .select('id,overall_score,final_maturity,calculated_maturity,exposure_score,exposure_band,coverage_pct,critical_gap_count,major_gap_count,status,locked_at')
      .in('id', scoreRunIds);

    if (scoreError) console.error('admin score-run list query failed', scoreError);
    scoreRunsById = new Map((scoreRuns ?? []).map((scoreRun: any) => [scoreRun.id, scoreRun]));
  }

  return {
    assessments: assessments ?? [],
    count: count ?? 0,
    page,
    pageSize: ASSESSMENT_PAGE_SIZE,
    scoreRunsById
  };
}

export async function getAdminAssessmentDetail(assessmentReference: string, admin?: AdminSession) {
  const service = createSupabaseServiceClient() as any;

  const { data: assessment, error } = await service
    .from('assessments')
    .select('id,assessment_reference,status,started_at,submitted_at,locked_at,current_score_run_id,methodology_version_id,organisations(*),respondents(*)')
    .eq('assessment_reference', assessmentReference)
    .maybeSingle();

  if (error) {
    console.error('admin assessment detail query failed', { assessmentReference, error });
    return null;
  }
  if (!assessment) return null;

  const scoreRunResult: AdminDataResult<any> = assessment.current_score_run_id
    ? await service
      .from('score_runs')
      .select('id,run_number,run_type,status,overall_score,calculated_maturity,final_maturity,exposure_score,exposure_band,coverage_pct,n_a_rate_pct,critical_gap_count,major_gap_count,cap_applied,cap_reason,input_hash,created_at,locked_at')
      .eq('id', assessment.current_score_run_id)
      .maybeSingle()
    : emptyResult(null);

  const domainResult: AdminDataResult<any[]> = assessment.current_score_run_id
    ? await service
      .from('score_domain_results')
      .select('raw_score,weighted_contribution,coverage_pct,critical_gap_count,flags_json,domains(domain_code,name,weight_pct,sort_order)')
      .eq('score_run_id', assessment.current_score_run_id)
    : emptyResult([]);

  const answerResult: AdminDataResult<any[]> = await service
    .from('assessment_answers')
    .select('id,response_value,is_not_applicable,n_a_reason,answered_at,updated_at,questions(question_code,prompt,weight,is_critical,is_hard_gate,n_a_allowed,domains(domain_code,name,sort_order))')
    .eq('assessment_id', assessment.id);

  const exposureResult: AdminDataResult<any[]> = await service
    .from('exposure_answers')
    .select('points_awarded,raw_value_json,answered_at,exposure_factors(factor_code,name,max_points,sort_order)')
    .eq('assessment_id', assessment.id);

  const traceResult: AdminDataResult<any[]> = assessment.current_score_run_id
    ? await service
      .from('score_question_traces')
      .select('response_value,normalised_score,question_weight,applicable,numerator_contribution,denominator_contribution,is_critical_gap,is_major_gap,triggered_rules,questions(question_code,prompt,is_critical,is_hard_gate,domains(domain_code,name,sort_order))')
      .eq('score_run_id', assessment.current_score_run_id)
    : emptyResult([]);

  const capResult: AdminDataResult<any[]> = assessment.current_score_run_id
    ? await service
      .from('maturity_cap_events')
      .select('rule_code,cap_to,reason,created_at')
      .eq('score_run_id', assessment.current_score_run_id)
    : emptyResult([]);

  const requestResult: AdminDataResult<any[]> = await service
    .from('data_requests')
    .select('id,request_type,status,requested_by_email,notes,fulfilled_at,created_at')
    .eq('assessment_id', assessment.id)
    .order('created_at', { ascending: false });

  const auditResult: AdminDataResult<any[]> = await service
    .from('audit_logs')
    .select('actor_type,actor_user_id,entity_table,entity_id,action,created_at')
    .eq('assessment_id', assessment.id)
    .order('created_at', { ascending: false })
    .limit(20);

  for (const [label, result] of Object.entries({ scoreRunResult, domainResult, answerResult, exposureResult, traceResult, capResult, requestResult, auditResult })) {
    if (result.error) console.error(`admin assessment ${label} query failed`, result.error);
  }

  if (admin) {
    await service.from('audit_logs').insert({
      actor_type: 'admin',
      actor_user_id: admin.id,
      assessment_id: assessment.id,
      entity_table: 'assessments',
      entity_id: assessment.id,
      action: 'admin_assessment_detail_viewed',
      after_json: {
        assessment_reference: assessment.assessment_reference,
        status: assessment.status
      }
    });
  }

  return {
    assessment,
    scoreRun: scoreRunResult.data,
    domainResults: domainResult.data ?? [],
    answers: answerResult.data ?? [],
    exposureAnswers: exposureResult.data ?? [],
    questionTraces: traceResult.data ?? [],
    maturityCapEvents: capResult.data ?? [],
    dataRequests: requestResult.data ?? [],
    auditEvents: auditResult.data ?? []
  };
}

export async function getAdminMethodologyConfig() {
  const service = createSupabaseServiceClient() as any;
  const { data: activeMethodology } = await service
    .from('methodology_versions')
    .select('id,version_code,title,status,effective_from,approved_at')
    .eq('status', 'active')
    .maybeSingle();

  const domains: AdminDataResult<any[]> = activeMethodology?.id
    ? await service.from('domains').select('domain_code,name,weight_pct,domain_type,is_core,sort_order').eq('methodology_version_id', activeMethodology.id).order('sort_order')
    : emptyResult([]);

  const questions: AdminDataResult<any[]> = activeMethodology?.id
    ? await service.from('questions').select('question_code,prompt,weight,is_critical,is_hard_gate,n_a_allowed,n_a_rule_key,active,sort_order,domains(domain_code,name,sort_order)').eq('methodology_version_id', activeMethodology.id).order('sort_order')
    : emptyResult([]);

  const exposureFactors: AdminDataResult<any[]> = activeMethodology?.id
    ? await service.from('exposure_factors').select('factor_code,name,max_points,input_type,options_json,sort_order').eq('methodology_version_id', activeMethodology.id).order('sort_order')
    : emptyResult([]);

  const contentBlocks: AdminDataResult<any[]> = activeMethodology?.id
    ? await service.from('report_content_blocks').select('block_key,block_type,domain_code,maturity_band,severity,title,status,version_number,updated_at').eq('methodology_version_id', activeMethodology.id).order('block_key')
    : emptyResult([]);

  return {
    activeMethodology,
    domains: domains.data ?? [],
    questions: questions.data ?? [],
    exposureFactors: exposureFactors.data ?? [],
    contentBlocks: contentBlocks.data ?? []
  };
}

export async function getAdminProductConfig() {
  const service = createSupabaseServiceClient() as any;
  const [products, appSettings] = await Promise.all([
    service.from('products').select('product_code,name,price_cents,currency,requires_payment_verification,delivery_mode,active,display_order,updated_at').order('display_order'),
    service.from('app_settings').select('setting_key,setting_json,updated_at').order('setting_key')
  ]);

  if (products.error) console.error('admin products query failed', products.error);
  if (appSettings.error) console.error('admin app settings query failed', appSettings.error);

  return {
    products: products.data ?? [],
    appSettings: appSettings.data ?? []
  };
}

export async function getAdminAuditLog() {
  const service = createSupabaseServiceClient() as any;
  const { data, error } = await service
    .from('audit_logs')
    .select('actor_type,actor_user_id,assessment_id,entity_table,entity_id,action,before_json,after_json,created_at')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('admin audit-log query failed', error);
    return [];
  }
  return data ?? [];
}
