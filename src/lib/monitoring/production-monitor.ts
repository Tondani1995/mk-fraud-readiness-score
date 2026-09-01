import { sendEmail as defaultSendEmail, type SendEmailResult } from '@/lib/notifications/email-provider';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { evaluateProductionReadiness, type ReadinessContext, type ReadinessFailureInjection } from './production-readiness';
import { isSafeOpaqueReference, PRODUCTION_MONITOR_NAME, type MonitoringPriority, type ReadinessCheck, type ReadinessEvaluation, type ProductionOverallStatus } from './contracts';
import { sanitiseMonitoringDetails, sanitiseMonitoringRoute } from './privacy';

export type ProductionMonitorEventInput = {
  monitorName?: string;
  stage: string;
  outcome: 'pass' | 'warn' | 'fail';
  route?: string | null;
  httpStatus?: number | null;
  errorCategory?: string | null;
  deploymentSha?: string | null;
  safeReference?: string | null;
  synthetic?: boolean;
  details?: Record<string, unknown>;
  db?: any;
};

export type ProductionMonitorDependencies = {
  db?: any;
  now?: () => Date;
  evaluateReadiness?: (context: ReadinessContext) => Promise<ReadinessEvaluation>;
  sendEmail?: typeof defaultSendEmail;
};

export type MonitorAlertCandidate = {
  alertKey: string;
  priority: MonitoringPriority;
  category: string;
  route?: string | null;
  stage?: string | null;
  errorCategory?: string | null;
  deploymentSha?: string | null;
  safeReference?: string | null;
  detail?: Record<string, unknown>;
};

export type AlertNotificationDecision = 'send_initial' | 'send_reminder' | 'suppress';

export function alertNotificationDecision(input: {
  existing?: { status?: string | null; last_notified_at?: string | null } | null;
  now: Date;
  cooldownMinutes?: number;
}): AlertNotificationDecision {
  if (!input.existing || input.existing.status === 'resolved' || !input.existing.last_notified_at) return 'send_initial';
  const cooldownMinutes = input.cooldownMinutes ?? 240;
  const lastNotified = new Date(input.existing.last_notified_at).getTime();
  if (!Number.isFinite(lastNotified)) return 'send_initial';
  return input.now.getTime() - lastNotified >= cooldownMinutes * 60_000 ? 'send_reminder' : 'suppress';
}

export function recoveryNotificationAllowed(existing: { status?: string | null; last_notified_at?: string | null; last_recovery_notified_at?: string | null } | null | undefined) {
  return Boolean(existing && existing.status !== 'resolved' && existing.last_notified_at && !existing.last_recovery_notified_at);
}

function validSha(value: string | null | undefined) {
  return typeof value === 'string' && /^[0-9a-f]{40}$/i.test(value) ? value.toLowerCase() : null;
}

export async function recordProductionMonitorEvent(input: ProductionMonitorEventInput) {
  const db = input.db ?? (createSupabaseServiceClient() as any);
  try {
    const { error } = await db.from('production_monitor_events').insert({
      monitor_name: input.monitorName ?? PRODUCTION_MONITOR_NAME,
      stage: String(input.stage).slice(0, 100),
      outcome: input.outcome,
      route: input.route ? sanitiseMonitoringRoute(input.route) : null,
      http_status: input.httpStatus ?? null,
      error_category: input.errorCategory ? String(input.errorCategory).replace(/[^a-z0-9_.-]/gi, '').slice(0, 120) || null : null,
      deployment_sha: validSha(input.deploymentSha),
      safe_reference: isSafeOpaqueReference(input.safeReference) ? input.safeReference : null,
      synthetic: input.synthetic === true,
      detail_json: sanitiseMonitoringDetails(input.details)
    });
    if (error) throw error;
    return { ok: true as const };
  } catch {
    // Observability must never turn a customer request into a second failure. The structured log is
    // intentionally low-cardinality and contains no provider/database message.
    console.error('production_monitor_event_record_failed', {
      stage: String(input.stage).slice(0, 100),
      route: input.route ? sanitiseMonitoringRoute(input.route) : '/unknown',
      outcome: input.outcome
    });
    return { ok: false as const };
  }
}

async function upsertHeartbeat(db: any, input: Record<string, unknown>) {
  try {
    const { error } = await db.from('production_monitor_heartbeats').upsert(input, { onConflict: 'monitor_name' });
    if (error) throw error;
    return true;
  } catch {
    console.error('production_monitor_heartbeat_write_failed');
    return false;
  }
}

async function recordDriftChecks(db: any, evaluation: ReadinessEvaluation) {
  const rows = evaluation.checks.map((check) => ({
    check_key: check.key,
    category: driftCategoryForCheck(check),
    status: check.status,
    deployment_sha: evaluation.currentDeploymentSha,
    safe_summary: check.safeCode
  }));
  try {
    const { error } = await db.from('production_monitor_drift_checks').insert(rows);
    if (error) throw error;
    return true;
  } catch {
    console.error('production_monitor_drift_write_failed');
    return false;
  }
}

function driftCategoryForCheck(check: ReadinessCheck) {
  if (check.category === 'release') return 'release';
  if (check.category === 'adaptive') return 'adaptive';
  if (check.category === 'methodology') return 'methodology';
  if (check.category === 'commercial') return 'commercial';
  if (check.category === 'legal') return 'legal';
  if (check.category === 'analytics') return 'analytics';
  if (check.category === 'seo') return 'seo';
  if (check.category === 'public_route') return 'public_route';
  return 'dependency';
}

export async function readProductionFunnelMetrics(db: any, since: string) {
  const [eventRows, syntheticRows, monitorRows, emailRows] = await Promise.all([
    db.from('assessment_events').select('assessment_id,event_type,event_count,last_seen_at,metadata_json').gte('last_seen_at', since).limit(10000),
    db.from('assessments').select('id').eq('monitoring_synthetic', true).gte('created_at', since).limit(10000),
    db.from('production_monitor_events').select('stage,outcome,route,error_category,occurred_at').gte('occurred_at', since).eq('outcome', 'fail').limit(10000),
    db.from('email_events').select('id,status').gte('created_at', since).in('status', ['send_failed', 'reconciliation_required']).not('notification_type', 'is', null).limit(10000)
  ]);

  const syntheticIds = new Set((syntheticRows.data ?? []).map((row: any) => row.id));
  const byEvent = new Map<string, Set<string>>();
  const progressAttempts = new Map<string, number>();
  for (const row of (eventRows.data ?? []) as any[]) {
    if (syntheticIds.has(row.assessment_id) || row.metadata_json?.monitoring_synthetic === true) continue;
    const ids = byEvent.get(row.event_type) ?? new Set<string>();
    ids.add(row.assessment_id);
    byEvent.set(row.event_type, ids);
    if (row.event_type === 'assessment_progress_activity') progressAttempts.set(row.assessment_id, Number(row.event_count ?? 0));
  }
  const uniqueCount = (eventType: string) => byEvent.get(eventType)?.size ?? 0;
  const submittedIds = byEvent.get('assessment_submitted') ?? new Set<string>();
  const snapshotSucceededIds = byEvent.get('snapshot_generation_succeeded') ?? new Set<string>();
  const submittedWithoutSnapshot = [...submittedIds].filter((assessmentId) => !snapshotSucceededIds.has(assessmentId)).length;
  const failureRows = (monitorRows.data ?? []) as any[];
  return {
    starts: uniqueCount('assessment_started'),
    firstAnswers: uniqueCount('first_answer_saved'),
    progressAssessments: uniqueCount('assessment_progress_activity'),
    progressAttempts: [...progressAttempts.values()].reduce((total, value) => total + value, 0),
    submissions: uniqueCount('assessment_submitted'),
    snapshotGenerationSucceeded: uniqueCount('snapshot_generation_succeeded'),
    snapshotGenerationFailed: uniqueCount('snapshot_generation_failed'),
    snapshotViews: uniqueCount('snapshot_viewed'),
    productSelections: uniqueCount('product_selected') + uniqueCount('report_option_selected'),
    orders: uniqueCount('order_recorded'),
    apiFailures: failureRows.length,
    apiFailureRows: failureRows,
    submittedWithoutSnapshot,
    notificationFailures: (emailRows.data ?? []).length
  };
}

const readFunnelMetrics = readProductionFunnelMetrics;

function routePriority(route: string | null | undefined, category: string) {
  if (category.includes('adaptive') || category.includes('database') || category.includes('public_home') || category.includes('public_score_start') || category.includes('public_fraud_readiness') || route?.includes('/adaptive/start') || route?.includes('/adaptive/submit')) return 'P1' as const;
  if (route?.includes('/adaptive/') || category.includes('snapshot') || category.includes('provider') || category.includes('runtime')) return 'P2' as const;
  return 'P3' as const;
}

export function candidatesForEvaluation(evaluation: ReadinessEvaluation): MonitorAlertCandidate[] {
  return evaluation.checks.filter((check) => check.status === 'FAIL' || check.status === 'WARN').map((check) => ({
    alertKey: `production-readiness:${check.key}`,
    priority: check.status === 'FAIL' ? routePriority(check.key, check.category) : 'P3',
    category: `readiness_${check.key}`,
    route: check.key.startsWith('public_') ? check.key.replace(/^public_/, '/') : null,
    stage: check.category,
    errorCategory: check.safeCode,
    deploymentSha: evaluation.currentDeploymentSha,
    detail: { check_status: check.status }
  }));
}

export function candidatesForFunnel(metrics: Awaited<ReturnType<typeof readProductionFunnelMetrics>>, deploymentSha: string | null): MonitorAlertCandidate[] {
  const candidates: MonitorAlertCandidate[] = [];
  if (metrics.submittedWithoutSnapshot > 0) {
    candidates.push({ alertKey: 'funnel:submitted_without_snapshot', priority: 'P1', category: 'submitted_without_snapshot', stage: 'snapshot', errorCategory: 'snapshot_missing_after_submission', deploymentSha, detail: { count: metrics.submittedWithoutSnapshot } });
  }
  if (metrics.snapshotGenerationFailed > 0) {
    candidates.push({ alertKey: 'funnel:snapshot_generation_failed', priority: 'P1', category: 'snapshot_generation_failed', stage: 'snapshot', errorCategory: 'snapshot_generation_failure', deploymentSha, detail: { count: metrics.snapshotGenerationFailed } });
  }
  if (metrics.notificationFailures > 0) {
    candidates.push({ alertKey: 'funnel:internal_notification_failure', priority: 'P2', category: 'internal_notification_failure', stage: 'notification', errorCategory: 'internal_provider_failure', deploymentSha, detail: { count: metrics.notificationFailures } });
  }
  if (metrics.apiFailures >= 3) {
    candidates.push({ alertKey: 'funnel:elevated_api_failures', priority: 'P2', category: 'elevated_api_failures', stage: 'api', errorCategory: 'elevated_api_failure_rate', deploymentSha, detail: { count: metrics.apiFailures } });
  }
  // Abandonment alone is never an incident. These warnings require a meaningful sample and compare
  // a completed operational step with the next one, so a quiet site does not generate noise.
  if (metrics.starts >= 5 && metrics.firstAnswers / metrics.starts < 0.5) {
    candidates.push({ alertKey: 'funnel:first_answer_collapse', priority: 'P3', category: 'funnel_first_answer_collapse', stage: 'first_answer', errorCategory: 'funnel_signal', deploymentSha, detail: { starts: metrics.starts, first_answers: metrics.firstAnswers } });
  }
  if (metrics.submissions >= 5 && metrics.snapshotViews / metrics.submissions < 0.5) {
    candidates.push({ alertKey: 'funnel:snapshot_view_collapse', priority: 'P3', category: 'funnel_snapshot_view_collapse', stage: 'snapshot_view', errorCategory: 'funnel_signal', deploymentSha, detail: { submissions: metrics.submissions, snapshot_views: metrics.snapshotViews } });
  }
  return candidates;
}

function subjectForAlert(candidate: MonitorAlertCandidate, recovery = false) {
  const prefix = recovery ? '[RECOVERED]' : `[MK ${candidate.priority}]`;
  return `${prefix} Fraud Readiness ${candidate.stage ?? 'production monitor'} ${recovery ? 'recovered' : 'requires attention'}`;
}

function textForAlert(candidate: MonitorAlertCandidate, input: { firstDetected?: string | null; detectedAt: string; occurrenceCount?: number; durationMinutes?: number | null; recovery?: boolean }) {
  const lines = [
    `Severity: ${candidate.priority}${candidate.priority === 'P1' ? ' CRITICAL' : candidate.priority === 'P2' ? ' HIGH' : ' WARNING'}`,
    `Environment: Production`,
    `Stage: ${candidate.stage ?? 'monitoring'}`,
    `Route: ${candidate.route ?? 'not route-specific'}`,
    `Failure: ${candidate.errorCategory ?? candidate.category}`,
    `Detected: ${input.detectedAt} UTC`,
    input.firstDetected ? `First detected: ${input.firstDetected} UTC` : null,
    input.occurrenceCount ? `Failure count: ${input.occurrenceCount}` : null,
    input.recovery ? `Outage duration: ${input.durationMinutes ?? 0} minutes` : null,
    `Current deployment: ${candidate.deploymentSha ?? 'unavailable'}`,
    candidate.safeReference ? `Technical reference: ${candidate.safeReference}` : null,
    input.recovery ? 'Recovery guidance: confirm the next scheduled monitor run remains healthy.' : 'Recovery guidance: inspect the Production monitoring dashboard and the linked runbook.'
  ];
  return lines.filter((line): line is string => Boolean(line)).join('\n');
}

async function sendMonitoringEmail(candidate: MonitorAlertCandidate, input: { firstDetected?: string | null; detectedAt: string; occurrenceCount?: number; durationMinutes?: number | null; recovery?: boolean }, dependencies: ProductionMonitorDependencies) {
  const recipient = process.env.MK_INTERNAL_NOTIFICATIONS_EMAIL?.trim() || process.env.MK_INTERNAL_LEADS_EMAIL?.trim();
  if (!recipient) return { sent: false as const, reason: 'recipient_missing' as const };
  const sendEmail = dependencies.sendEmail ?? defaultSendEmail;
  const result: SendEmailResult = await sendEmail({
    from: process.env.MK_REPORT_EMAIL_FROM?.trim() || 'MK Fraud Insights <hello@mkfraud.co.za>',
    to: recipient,
    replyTo: process.env.MK_REPORT_EMAIL_REPLY_TO?.trim() || null,
    subject: subjectForAlert(candidate, input.recovery),
    text: textForAlert(candidate, input),
    html: `<p>${textForAlert(candidate, input).replace(/\n/g, '<br>')}</p>`,
    audience: 'internal',
    idempotencyKey: `production-monitor:${candidate.alertKey}:${input.recovery ? 'recovery' : 'incident'}:${input.occurrenceCount ?? 1}`
  });
  return result.ok && result.mode !== 'disabled'
    ? { sent: true as const, reason: 'sent' as const }
    : { sent: false as const, reason: 'provider_unavailable' as const };
}

async function syncAlert(db: any, candidate: MonitorAlertCandidate, now: Date, dependencies: ProductionMonitorDependencies) {
  const { data: existing } = await db.from('phase14_operational_alerts').select('id,status,last_notified_at,last_recovery_notified_at,first_detected_at,occurrence_count').eq('alert_key', candidate.alertKey).maybeSingle();
  const { data: recorded, error } = await db.rpc('record_production_monitor_alert', {
    p_alert_key: candidate.alertKey,
    p_priority: candidate.priority,
    p_category: candidate.category,
    p_route: candidate.route ?? null,
    p_stage: candidate.stage ?? null,
    p_error_category: candidate.errorCategory ?? null,
    p_deployment_sha: validSha(candidate.deploymentSha),
    p_safe_reference: isSafeOpaqueReference(candidate.safeReference) ? candidate.safeReference : null,
    p_detail: sanitiseMonitoringDetails(candidate.detail),
    p_now: now.toISOString()
  });
  if (error || !recorded) return { ok: false as const, emailed: false };
  const decision = alertNotificationDecision({ existing, now });
  if (decision === 'suppress') return { ok: true as const, emailed: false, decision };
  const email = await sendMonitoringEmail(candidate, {
    firstDetected: existing?.first_detected_at ?? now.toISOString(),
    detectedAt: now.toISOString(),
    occurrenceCount: Number(recorded.occurrence_count ?? existing?.occurrence_count ?? 1)
  }, dependencies);
  if (email.sent) {
    await db.rpc('mark_production_monitor_alert_notified', { p_alert_key: candidate.alertKey, p_notified_at: now.toISOString(), p_is_recovery: false });
  }
  return { ok: true as const, emailed: email.sent, decision };
}

async function resolveRecoveredAlerts(db: any, activeKeys: Set<string>, now: Date, dependencies: ProductionMonitorDependencies) {
  const { data: openAlerts } = await db.from('phase14_operational_alerts').select('alert_key,status,last_notified_at,last_recovery_notified_at,first_detected_at,last_seen_at,occurrence_count,route,stage,error_category,deployment_sha,safe_reference,monitoring_priority,category').eq('source', 'production_monitor').in('status', ['open', 'acknowledged']).limit(100);
  let recovered = 0;
  for (const row of (openAlerts ?? []) as any[]) {
    if (activeKeys.has(row.alert_key)) continue;
    const { data: resolved, error } = await db.rpc('resolve_production_monitor_alert', { p_alert_key: row.alert_key, p_now: now.toISOString() });
    if (error || !resolved) continue;
    recovered += 1;
    if (!recoveryNotificationAllowed(row)) continue;
    const candidate: MonitorAlertCandidate = {
      alertKey: row.alert_key,
      priority: row.monitoring_priority === 'P1' || row.monitoring_priority === 'P2' || row.monitoring_priority === 'P3' ? row.monitoring_priority : 'P2',
      category: row.category,
      route: row.route,
      stage: row.stage,
      errorCategory: row.error_category,
      deploymentSha: row.deployment_sha,
      safeReference: row.safe_reference
    };
    const first = row.first_detected_at ? new Date(row.first_detected_at).getTime() : now.getTime();
    const durationMinutes = Math.max(0, Math.round((now.getTime() - first) / 60_000));
    const email = await sendMonitoringEmail(candidate, { firstDetected: row.first_detected_at, detectedAt: now.toISOString(), occurrenceCount: Number(row.occurrence_count ?? 1), durationMinutes, recovery: true }, dependencies);
    if (email.sent) await db.rpc('mark_production_monitor_alert_notified', { p_alert_key: row.alert_key, p_notified_at: now.toISOString(), p_is_recovery: true });
  }
  return recovered;
}

export async function runProductionMonitor(input: { origin?: string | null; daily?: boolean; failureInjection?: ReadinessFailureInjection } = {}, dependencies: ProductionMonitorDependencies = {}) {
  const db = dependencies.db ?? (createSupabaseServiceClient() as any);
  const nowFactory = dependencies.now ?? (() => new Date());
  const started = nowFactory();
  const deploymentSha = validSha(process.env.VERCEL_GIT_COMMIT_SHA);
  let previousHeartbeat: any = null;
  try {
    const { data } = await db.from('production_monitor_heartbeats').select('run_count,consecutive_failures').eq('monitor_name', PRODUCTION_MONITOR_NAME).maybeSingle();
    previousHeartbeat = data;
  } catch {
    previousHeartbeat = null;
  }
  const nextRunCount = Number(previousHeartbeat?.run_count ?? 0) + 1;
  await upsertHeartbeat(db, {
    monitor_name: PRODUCTION_MONITOR_NAME,
    last_started_at: started.toISOString(),
    status: 'running',
    deployment_sha: deploymentSha,
    updated_at: started.toISOString()
  });

  try {
    const evaluate = dependencies.evaluateReadiness ?? evaluateProductionReadiness;
    const readiness = await evaluate({ origin: input.origin, db, now: started, failureInjection: input.failureInjection });
    const since = new Date(started.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const metrics = await readProductionFunnelMetrics(db, since);
    const candidates = [...candidatesForEvaluation(readiness), ...candidatesForFunnel(metrics, deploymentSha)];
    const activeKeys = new Set(candidates.map((candidate) => candidate.alertKey));
    let emailsSent = 0;
    for (const candidate of candidates) {
      const result = await syncAlert(db, candidate, started, dependencies);
      if (result.emailed) emailsSent += 1;
    }
    const recovered = await resolveRecoveredAlerts(db, activeKeys, started, dependencies);
    if (input.daily) await recordDriftChecks(db, readiness);
    const status: ProductionOverallStatus = candidates.some((candidate) => candidate.priority === 'P1') ? 'INCIDENT' : candidates.length ? 'DEGRADED' : readiness.status;
    const completed = nowFactory();
    const durationMs = Math.max(0, completed.getTime() - started.getTime());
    await upsertHeartbeat(db, {
      monitor_name: PRODUCTION_MONITOR_NAME,
      last_started_at: started.toISOString(),
      last_completed_at: completed.toISOString(),
      status: status === 'INCIDENT' ? 'failed' : status === 'DEGRADED' ? 'degraded' : 'healthy',
      deployment_sha: deploymentSha,
      duration_ms: durationMs,
      run_count: nextRunCount,
      consecutive_failures: status === 'INCIDENT' ? Number(previousHeartbeat?.consecutive_failures ?? 0) + 1 : 0,
      safe_summary_json: { status, candidate_count: candidates.length, recovery_count: recovered, emails_sent: emailsSent },
      updated_at: completed.toISOString()
    });
    return { ok: status !== 'INCIDENT', status, readiness, metrics, candidateCount: candidates.length, emailsSent, recovered, durationMs };
  } catch {
    const completed = nowFactory();
    await upsertHeartbeat(db, {
      monitor_name: PRODUCTION_MONITOR_NAME,
      last_started_at: started.toISOString(),
      last_completed_at: completed.toISOString(),
      status: 'failed',
      deployment_sha: deploymentSha,
      duration_ms: Math.max(0, completed.getTime() - started.getTime()),
      run_count: nextRunCount,
      consecutive_failures: Number(previousHeartbeat?.consecutive_failures ?? 0) + 1,
      safe_summary_json: { status: 'INCIDENT', candidate_count: 0, runner_failure: true },
      updated_at: completed.toISOString()
    });
    await recordProductionMonitorEvent({ db, stage: 'monitor_runner', outcome: 'fail', errorCategory: 'monitor_runner_failure', deploymentSha });
    return { ok: false as const, status: 'INCIDENT' as const, errorCategory: 'monitor_runner_failure' as const };
  }
}
