import type { FreeSnapshot } from './free-snapshot';
import type { CommercialSnapshotInsights } from './commercial-insights';
import type { SnapshotNarrativeContent } from './narrative';

function safeOrganisationName(value: string | null | undefined) {
  const name = String(value ?? '').replace(/\s+/g, ' ').trim();
  return name ? name.slice(0, 120) : 'Your organisation';
}

function deterministicPrioritySignals(insights: CommercialSnapshotInsights): [string, string] {
  const signals = insights.priorityAreas.slice(0, 2).map((area) => `${area.domainName}: ${area.readinessStatus}.`);
  if (signals.length < 1) signals.push('Recorded responses identify an area for management attention.');
  if (signals.length < 2) signals.push('Coverage and applicability should guide interpretation.');
  return [signals[0], signals[1]];
}

/**
 * Browser-safe deterministic Snapshot copy. It only phrases already persisted Snapshot facts;
 * server-side callers validate the resulting content before it is cached or rendered.
 */
export function buildDeterministicSnapshotNarrativeContent(input: {
  snapshot: FreeSnapshot;
  insights: CommercialSnapshotInsights;
}): SnapshotNarrativeContent {
  const maturity = input.snapshot.finalMaturity?.toLowerCase() ?? 'recorded';
  const prioritySignals = deterministicPrioritySignals(input.insights);
  const focusNames = input.insights.priorityAreas.slice(0, 2).map((area) => area.domainName);
  return {
    headline: `${safeOrganisationName(input.snapshot.organisationName)} has a ${maturity} fraud-readiness position.`,
    executiveDiagnosis: input.snapshot.resultStatus === 'INSUFFICIENT_VISIBILITY'
      ? 'The recorded responses do not provide enough visibility for a reliable readiness view. The result shows where further information is needed.'
      : `The recorded responses place the organisation in a ${maturity} fraud-readiness position. The current picture highlights where management attention is needed.`,
    strength: input.insights.strengths[0]
      ? `${input.insights.strengths[0].domainName} is the clearest recorded foundation in this Snapshot.`
      : 'The assessment provides a clear baseline for prioritising the next management actions.',
    prioritySignals,
    managementImplication: focusNames.length
      ? `Leadership should focus first on ${focusNames.join(' and ')}, assign clear ownership and track evidence of progress.`
      : 'Leadership should use the recorded result to set clear ownership for the next management actions.'
  };
}
