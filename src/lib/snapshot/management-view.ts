import type { FreeSnapshot } from '@/lib/snapshot/free-snapshot';
import type { CommercialSnapshotInsights } from '@/lib/snapshot/commercial-insights';

/** Presentation of recorded facts and the existing domain interpretations; never a scoring layer. */
export function buildManagementView(snapshot: FreeSnapshot, insights: CommercialSnapshotInsights) {
  const metrics = snapshot.adaptiveMetrics;
  const traces = metrics?.questionTraces ?? [];
  const applicable = traces.filter((trace) => trace.applicable);
  const domainCodes = new Set(snapshot.domains.map((domain) => domain.domainCode));
  const unknown = (trace: typeof traces[number]) => trace.triggeredRules.includes('unknown_response_excluded_from_score_denominator');
  const unanswered = (trace: typeof traces[number]) => trace.triggeredRules.includes('unanswered_applicable');
  // Legacy/partial projections must not turn aggregate counts into invented control findings.
  const reconciled = Boolean(metrics && traces.length && new Set(traces.map((trace) => trace.questionCode)).size === traces.length
    && applicable.every((trace) => domainCodes.has(trace.domainCode)
      && (trace.responseValue === null
        ? Number(unknown(trace)) + Number(unanswered(trace)) === 1
        : Number.isInteger(trace.responseValue) && trace.responseValue >= 0 && trace.responseValue <= 5 && !unknown(trace) && !unanswered(trace))
      && trace.isCriticalGap === (trace.responseValue !== null && trace.responseValue <= 2 && trace.isCritical)
      && trace.isMajorGap === (trace.responseValue !== null && trace.responseValue <= 1 && trace.isHardGate))
    && applicable.length === metrics.applicableCount
    && applicable.filter(unknown).length === metrics.unknownCount
    && applicable.filter(unanswered).length === metrics.unansweredApplicableCount
    && applicable.filter((trace) => trace.isCriticalGap).length === snapshot.criticalGapCount
    && applicable.filter((trace) => trace.isMajorGap).length === snapshot.majorGapCount
    && snapshot.domains.every((domain) => applicable.filter((trace) => trace.domainCode === domain.domainCode && trace.isCriticalGap).length === domain.criticalGapCount));
  const insufficient = snapshot.resultStatus === 'INSUFFICIENT_VISIBILITY';
  return {
    insufficient,
    reconciled,
    priorities: insufficient ? [] : insights.priorityAreas.map((area) => ({
      ...area,
      domain: snapshot.domains.find((domain) => domain.domainCode === area.domainCode)!,
      controls: reconciled ? applicable.filter((trace) => trace.domainCode === area.domainCode && (trace.isCriticalGap || trace.isMajorGap)) : []
    })),
    strengths: insufficient ? [] : insights.strengths,
    domains: snapshot.domains.map((domain) => {
      const rows = applicable.filter((trace) => trace.domainCode === domain.domainCode);
      return { ...domain, responses: reconciled ? {
        applicable: rows.length,
        known: rows.filter((trace) => trace.responseValue !== null).length,
        unknown: rows.filter(unknown).length,
        unanswered: rows.filter(unanswered).length
      } : null };
    })
  };
}
