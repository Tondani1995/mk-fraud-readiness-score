/**
 * Heartbeat for the stalled-lead job (both Fraud Readiness flows). The job runs every 15 minutes; the production monitor
 * reads this row and raises a technical incident to MK's monitoring mailbox when the job stops, fails or keeps degrading.
 * The summary holds counts only: no organisation, respondent or contact details.
 */
export const STALLED_LEAD_MONITOR_NAME = 'stalled-lead-monitor';

type PassSummary = Record<string, unknown> | null | undefined;

function counts(pass: PassSummary) {
  if (!pass || typeof pass !== 'object') return null;
  const pick = (key: string) => (typeof (pass as any)[key] === 'number' ? (pass as any)[key] : undefined);
  return Object.fromEntries(
    ['inspected', 'stalled', 'notified', 'alreadyNotified', 'deferredToRecovery', 'failed', 'completionsRetried', 'inactivityMinutes']
      .map((key) => [key, pick(key)])
      .filter(([, value]) => value !== undefined)
  );
}

function deploymentSha() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA?.trim().toLowerCase();
  return sha && /^[0-9a-f]{40}$/.test(sha) ? sha : null;
}

/** Records one run. Never throws: a heartbeat failure must not change the job's own result. */
export async function recordStalledLeadMonitorHeartbeat(
  db: any,
  input: { startedAt: Date; status: 'healthy' | 'degraded' | 'failed'; adaptive?: PassSummary; review?: PassSummary; now?: Date }
) {
  try {
    const now = input.now ?? new Date();
    const { data: previous } = await db
      .from('production_monitor_heartbeats')
      .select('run_count,consecutive_failures')
      .eq('monitor_name', STALLED_LEAD_MONITOR_NAME)
      .maybeSingle();
    const runCount = Number(previous?.run_count ?? 0) + 1;
    const consecutiveFailures = input.status === 'healthy' ? 0 : Number(previous?.consecutive_failures ?? 0) + 1;
    const { error } = await db.from('production_monitor_heartbeats').upsert({
      monitor_name: STALLED_LEAD_MONITOR_NAME,
      status: input.status,
      last_started_at: input.startedAt.toISOString(),
      last_completed_at: now.toISOString(),
      deployment_sha: deploymentSha(),
      duration_ms: Math.max(0, now.getTime() - input.startedAt.getTime()),
      run_count: runCount,
      consecutive_failures: consecutiveFailures,
      safe_summary_json: { adaptive: counts(input.adaptive), review: counts(input.review) },
      updated_at: now.toISOString()
    }, { onConflict: 'monitor_name' });
    if (error) throw error;
    return { recorded: true as const };
  } catch (error) {
    console.error('stalled_lead_monitor_heartbeat_write_failed', { message: error instanceof Error ? error.message.slice(0, 160) : 'unknown' });
    return { recorded: false as const };
  }
}

/**
 * Readiness of the stalled-lead job from its heartbeat. The job runs every 15 minutes, so a heartbeat older than
 * 35 minutes means at least two runs were missed. A row that has never run (just after the migration) is a warning,
 * not an incident.
 */
export function stalledLeadMonitorReadiness(input: {
  heartbeat: { status?: string | null; last_completed_at?: string | null; consecutive_failures?: number | null } | null | undefined;
  now: Date;
  production: boolean;
  staleMinutes?: number;
}): { status: 'PASS' | 'WARN' | 'FAIL'; safeCode: string } {
  const staleMs = (input.staleMinutes ?? 35) * 60_000;
  const heartbeat = input.heartbeat;
  if (!heartbeat || heartbeat.status === 'never_run') return { status: 'WARN', safeCode: 'stalled_lead_monitor_not_yet_run' };
  const age = heartbeat.last_completed_at ? input.now.getTime() - new Date(heartbeat.last_completed_at).getTime() : Number.POSITIVE_INFINITY;
  const fail = input.production ? 'FAIL' as const : 'WARN' as const;
  if (age > staleMs) return { status: fail, safeCode: 'stalled_lead_monitor_stale' };
  if (heartbeat.status === 'failed') return { status: fail, safeCode: 'stalled_lead_monitor_failed' };
  // One degraded run (for example a single provider failure) is retried on the next run; two in a row is an incident.
  if (heartbeat.status === 'degraded') {
    return Number(heartbeat.consecutive_failures ?? 0) >= 2
      ? { status: fail, safeCode: 'stalled_lead_monitor_repeatedly_degraded' }
      : { status: 'WARN', safeCode: 'stalled_lead_monitor_degraded' };
  }
  return { status: 'PASS', safeCode: 'stalled_lead_monitor_healthy' };
}
