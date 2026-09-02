import { createSupabaseServiceClient } from '@/lib/supabase/server';
import {
  budgetStatusFromProjectedZar,
  EXPECTED_PRODUCTION,
  MONITORING_FORECAST,
  PRODUCTION_MONITOR_NAME,
  type ProductionOverallStatus
} from '@/lib/monitoring/contracts';
import { evaluateProductionReadiness } from '@/lib/monitoring/production-readiness';
import { readProductionFunnelMetrics } from '@/lib/monitoring/production-monitor';

type SyntheticRun = {
  assessmentReference: string;
  monitoringRunId: string | null;
  status: string;
  createdAt: string;
  submittedAt: string | null;
  currentScoreRunId: string | null;
};

async function rows(query: any): Promise<any[]> {
  try {
    const { data, error } = await query;
    if (error || data == null) return [];
    return Array.isArray(data) ? data : [data];
  } catch {
    return [];
  }
}

function latestSynthetic(rows: SyntheticRun[], kind: string) {
  return rows
    .filter((row) => row.monitoringRunId?.toLowerCase().startsWith(`${kind}-`))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))[0] ?? null;
}

export type ProductionMonitoringSnapshot = {
  checkedAt: string;
  readiness: Awaited<ReturnType<typeof evaluateProductionReadiness>>;
  overallStatus: ProductionOverallStatus;
  funnel: Awaited<ReturnType<typeof readProductionFunnelMetrics>>;
  heartbeat: {
    status: string;
    lastStartedAt: string | null;
    lastCompletedAt: string | null;
    deploymentSha: string | null;
    durationMs: number | null;
    runCount: number;
    consecutiveFailures: number;
    safeSummary: Record<string, unknown>;
  } | null;
  alerts: Array<{
    alertKey: string;
    status: string;
    priority: string | null;
    category: string;
    route: string | null;
    stage: string | null;
    errorCategory: string | null;
    firstDetectedAt: string | null;
    lastSeenAt: string | null;
    occurrenceCount: number;
  }>;
  recentMonitorEvents: Array<{
    stage: string;
    outcome: string;
    route: string | null;
    errorCategory: string | null;
    occurredAt: string;
  }>;
  latestDrift: Array<{
    checkKey: string;
    category: string;
    status: string;
    deploymentSha: string | null;
    safeSummary: string;
    checkedAt: string;
  }>;
  synthetic: {
    core: SyntheticRun | null;
    fullDesktop: SyntheticRun | null;
    fullMobile: SyntheticRun | null;
  };
  ai: {
    actualProviderCostMicros: number | null;
    actualNarrativeRuns: number;
    averageProviderCostMicros: number | null;
    projectedMonthlyAiCostZar: number | null;
    hardCeilingZar: number;
  };
  budget: {
    projectedMonthlyMonitoringCostZar: number | null;
    status: 'GREEN' | 'AMBER' | 'RED' | 'PENDING';
    checklyMonthlyCostUsd: number;
    sentryMonthlyCostUsd: number;
    resendMonthlyCostZar: number;
    vercelMonthlyCostZar: number;
    supabaseMonthlyCostZar: number;
  };
  contract: {
    expectedSupabaseProjectRef: string;
    gaMeasurementId: string;
    gaPropertyId: string;
    checklyPlan: string;
    sentryPlan: string;
  };
};

export async function getProductionMonitoringSnapshot(): Promise<ProductionMonitoringSnapshot> {
  const db = createSupabaseServiceClient() as any;
  const now = new Date();
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const origin = process.env.NEXT_PUBLIC_APP_URL?.trim() || null;
  const [readiness, funnel, heartbeatRows, alertRows, monitorEventRows, driftRows, syntheticRows, narrativeRows] = await Promise.all([
    evaluateProductionReadiness({ origin, db, now }),
    readProductionFunnelMetrics(db, since),
    rows(db.from('production_monitor_heartbeats').select('monitor_name,status,last_started_at,last_completed_at,deployment_sha,duration_ms,run_count,consecutive_failures,safe_summary_json').eq('monitor_name', PRODUCTION_MONITOR_NAME).maybeSingle()),
    rows(db.from('phase14_operational_alerts').select('alert_key,status,monitoring_priority,category,route,stage,error_category,first_detected_at,last_seen_at,occurrence_count').eq('source', 'production_monitor').in('status', ['open', 'acknowledged']).order('last_seen_at', { ascending: false }).limit(30)),
    rows(db.from('production_monitor_events').select('stage,outcome,route,error_category,occurred_at').gte('occurred_at', since).order('occurred_at', { ascending: false }).limit(50)),
    rows(db.from('production_monitor_drift_checks').select('check_key,category,status,deployment_sha,safe_summary,checked_at').order('checked_at', { ascending: false }).limit(50)),
    rows(db.from('assessments').select('id,assessment_reference,monitoring_run_id,status,created_at,submitted_at,current_score_run_id').eq('monitoring_synthetic', true).order('created_at', { ascending: false }).limit(100)),
    rows(db.from('free_snapshot_narratives').select('assessment_id,provider_cost_micros,updated_at').gte('updated_at', since).limit(1000))
  ]);

  const synthetic = (syntheticRows as any[]).map((row) => ({
    assessmentReference: row.assessment_reference,
    monitoringRunId: row.monitoring_run_id ?? null,
    status: row.status,
    createdAt: row.created_at,
    submittedAt: row.submitted_at ?? null,
    currentScoreRunId: row.current_score_run_id ?? null
  })) as SyntheticRun[];
  const syntheticAssessmentIds = new Set(syntheticRows.map((row: any) => row.id).filter(Boolean));
  const syntheticNarratives = (narrativeRows as any[]).filter((row) => syntheticAssessmentIds.has(row.assessment_id));
  const providerCosts = syntheticNarratives
    .map((row) => Number(row.provider_cost_micros))
    .filter((value) => Number.isFinite(value) && value >= 0);
  const actualProviderCostMicros = providerCosts.length ? providerCosts.reduce((sum, value) => sum + value, 0) : null;
  const averageProviderCostMicros = providerCosts.length ? actualProviderCostMicros! / providerCosts.length : null;
  // provider_cost_micros is provider accounting in USD micro-units. The forecast uses the brief's
  // conservative R20/USD guard and is shown as a planning guard, never as an invoice amount.
  const projectedMonthlyAiCostZar = averageProviderCostMicros === null
    ? null
    : (averageProviderCostMicros / 1_000_000) * 20 * (MONITORING_FORECAST.checkly.fullDesktopBrowserRunsPer31DayMonth + MONITORING_FORECAST.checkly.fullMobileBrowserRunsPer31DayMonth);
  const fixedProjectedCostZar = MONITORING_FORECAST.resend.monthlyIncrementalCostZar
    + MONITORING_FORECAST.vercel.monthlyIncrementalCostZar
    + MONITORING_FORECAST.supabase.monthlyIncrementalCostZar;
  const projectedMonthlyMonitoringCostZar = projectedMonthlyAiCostZar === null ? null : fixedProjectedCostZar + projectedMonthlyAiCostZar;
  const budgetStatus = projectedMonthlyMonitoringCostZar === null ? 'PENDING' : budgetStatusFromProjectedZar(projectedMonthlyMonitoringCostZar);
  const heartbeat = heartbeatRows[0] ?? null;
  const heartbeatStatus = heartbeat ? {
    status: heartbeat.status,
    lastStartedAt: heartbeat.last_started_at ?? null,
    lastCompletedAt: heartbeat.last_completed_at ?? null,
    deploymentSha: heartbeat.deployment_sha ?? null,
    durationMs: heartbeat.duration_ms == null ? null : Number(heartbeat.duration_ms),
    runCount: Number(heartbeat.run_count ?? 0),
    consecutiveFailures: Number(heartbeat.consecutive_failures ?? 0),
    safeSummary: heartbeat.safe_summary_json ?? {}
  } : null;

  return {
    checkedAt: now.toISOString(),
    readiness,
    overallStatus: readiness.status,
    funnel,
    heartbeat: heartbeatStatus,
    alerts: (alertRows as any[]).map((row) => ({
      alertKey: row.alert_key,
      status: row.status,
      priority: row.monitoring_priority ?? null,
      category: row.category,
      route: row.route ?? null,
      stage: row.stage ?? null,
      errorCategory: row.error_category ?? null,
      firstDetectedAt: row.first_detected_at ?? null,
      lastSeenAt: row.last_seen_at ?? null,
      occurrenceCount: Number(row.occurrence_count ?? 1)
    })),
    recentMonitorEvents: (monitorEventRows as any[]).map((row) => ({
      stage: row.stage,
      outcome: row.outcome,
      route: row.route ?? null,
      errorCategory: row.error_category ?? null,
      occurredAt: row.occurred_at
    })),
    latestDrift: (driftRows as any[]).map((row) => ({
      checkKey: row.check_key,
      category: row.category,
      status: row.status,
      deploymentSha: row.deployment_sha ?? null,
      safeSummary: row.safe_summary,
      checkedAt: row.checked_at
    })).filter((row, index, all) => all.findIndex((candidate) => candidate.checkKey === row.checkKey) === index).slice(0, 20),
    synthetic: {
      core: latestSynthetic(synthetic, 'core'),
      fullDesktop: latestSynthetic(synthetic, 'full-desktop'),
      fullMobile: latestSynthetic(synthetic, 'full-mobile')
    },
    ai: {
      actualProviderCostMicros,
      actualNarrativeRuns: providerCosts.length,
      averageProviderCostMicros,
      projectedMonthlyAiCostZar,
      hardCeilingZar: MONITORING_FORECAST.ai.hardMonthlyCeilingZar
    },
    budget: {
      projectedMonthlyMonitoringCostZar,
      status: budgetStatus,
      checklyMonthlyCostUsd: MONITORING_FORECAST.checkly.monthlyCostUsd,
      sentryMonthlyCostUsd: MONITORING_FORECAST.sentry.monthlyCostUsd,
      resendMonthlyCostZar: MONITORING_FORECAST.resend.monthlyIncrementalCostZar,
      vercelMonthlyCostZar: MONITORING_FORECAST.vercel.monthlyIncrementalCostZar,
      supabaseMonthlyCostZar: MONITORING_FORECAST.supabase.monthlyIncrementalCostZar
    },
    contract: {
      expectedSupabaseProjectRef: EXPECTED_PRODUCTION.supabaseProjectRef,
      gaMeasurementId: EXPECTED_PRODUCTION.gaMeasurementId,
      gaPropertyId: EXPECTED_PRODUCTION.gaPropertyId,
      checklyPlan: MONITORING_FORECAST.checkly.plan,
      sentryPlan: MONITORING_FORECAST.sentry.plan
    }
  };
}
