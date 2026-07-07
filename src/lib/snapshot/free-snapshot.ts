import { createSupabaseServiceClient } from '@/lib/supabase/server';
import type { ExposureBand, MaturityBand } from '@/lib/types/domain';

export type FreeSnapshotDomain = {
  domainId: string;
  domainCode: string;
  domainName: string;
  weightPct: number;
  rawScore: number | null;
  weightedContribution: number | null;
  coveragePct: number;
  criticalGapCount: number;
};

export type FreeSnapshot = {
  assessmentReference: string;
  organisationName: string;
  respondentName: string | null;
  scoreRunId: string;
  runNumber: number;
  overallScore: number;
  calculatedMaturity: MaturityBand;
  finalMaturity: MaturityBand;
  exposureScore: number;
  exposureBand: ExposureBand;
  coveragePct: number;
  nARatePct: number;
  criticalGapCount: number;
  majorGapCount: number;
  capApplied: boolean;
  capReason: string | null;
  scoredAt: string | null;
  domains: FreeSnapshotDomain[];
};

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export async function loadFreeSnapshotByReference(assessmentReference: string, explicitScoreRunId?: string | null): Promise<FreeSnapshot | null> {
  const service = createSupabaseServiceClient();

  const { data: assessment, error: assessmentError } = await service
    .from('assessments')
    .select('id,assessment_reference,organisation_id,primary_respondent_id,status,current_score_run_id')
    .eq('assessment_reference', assessmentReference)
    .maybeSingle();

  if (assessmentError) throw assessmentError;
  if (!assessment) return null;

  const scoreRunId = explicitScoreRunId ?? assessment.current_score_run_id;
  if (!scoreRunId) return null;

  const [{ data: scoreRun, error: scoreRunError }, { data: organisation }, { data: respondent }] = await Promise.all([
    service
      .from('score_runs')
      .select('id,run_number,status,overall_score,calculated_maturity,final_maturity,exposure_score,exposure_band,coverage_pct,n_a_rate_pct,critical_gap_count,major_gap_count,cap_applied,cap_reason,locked_at,created_at')
      .eq('id', scoreRunId)
      .eq('assessment_id', assessment.id)
      .maybeSingle(),
    service.from('organisations').select('legal_name,trading_name').eq('id', assessment.organisation_id).maybeSingle(),
    assessment.primary_respondent_id
      ? service.from('respondents').select('full_name,email').eq('id', assessment.primary_respondent_id).maybeSingle()
      : Promise.resolve({ data: null, error: null })
  ]);

  if (scoreRunError) throw scoreRunError;
  if (!scoreRun || scoreRun.status !== 'completed') return null;

  const { data: domainRows, error: domainRowsError } = await service
    .from('score_domain_results')
    .select('domain_id,raw_score,weighted_contribution,coverage_pct,critical_gap_count')
    .eq('score_run_id', scoreRun.id);

  if (domainRowsError) throw domainRowsError;

  const domainIds = (domainRows ?? []).map((row: any) => row.domain_id).filter(Boolean);
  const { data: domains, error: domainsError } = domainIds.length
    ? await service.from('domains').select('id,domain_code,name,weight_pct,sort_order').in('id', domainIds)
    : { data: [], error: null };

  if (domainsError) throw domainsError;

  const domainById = new Map((domains ?? []).map((domain: any) => [domain.id, domain]));
  const snapshotDomains = (domainRows ?? [])
    .map((row: any) => {
      const domain = domainById.get(row.domain_id);
      return {
        domainId: row.domain_id,
        domainCode: domain?.domain_code ?? '',
        domainName: domain?.name ?? 'Domain',
        weightPct: asNumber(domain?.weight_pct),
        rawScore: row.raw_score === null ? null : asNumber(row.raw_score),
        weightedContribution: row.weighted_contribution === null ? null : asNumber(row.weighted_contribution),
        coveragePct: asNumber(row.coverage_pct),
        criticalGapCount: Number(row.critical_gap_count ?? 0),
        sortOrder: Number(domain?.sort_order ?? 999)
      };
    })
    .sort((a: any, b: any) => a.sortOrder - b.sortOrder)
    .map(({ sortOrder: _sortOrder, ...domain }: any) => domain);

  return {
    assessmentReference: assessment.assessment_reference,
    organisationName: organisation?.legal_name ?? organisation?.trading_name ?? 'Organisation',
    respondentName: respondent?.full_name ?? respondent?.email ?? null,
    scoreRunId: scoreRun.id,
    runNumber: Number(scoreRun.run_number ?? 1),
    overallScore: asNumber(scoreRun.overall_score),
    calculatedMaturity: scoreRun.calculated_maturity,
    finalMaturity: scoreRun.final_maturity,
    exposureScore: asNumber(scoreRun.exposure_score),
    exposureBand: scoreRun.exposure_band,
    coveragePct: asNumber(scoreRun.coverage_pct),
    nARatePct: asNumber(scoreRun.n_a_rate_pct),
    criticalGapCount: Number(scoreRun.critical_gap_count ?? 0),
    majorGapCount: Number(scoreRun.major_gap_count ?? 0),
    capApplied: Boolean(scoreRun.cap_applied),
    capReason: scoreRun.cap_reason,
    scoredAt: scoreRun.locked_at ?? scoreRun.created_at ?? null,
    domains: snapshotDomains
  };
}
