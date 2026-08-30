import type { FreeSnapshot } from './free-snapshot';
import type { CommercialSnapshotInsights } from './commercial-insights';
import type { SnapshotNarrativeContent } from './narrative';

function safeOrganisationName(value: string | null | undefined) {
  const name = String(value ?? '').replace(/\s+/g, ' ').trim();
  return name ? name.slice(0, 120) : 'Your organisation';
}

export function buildDeterministicSnapshotPrioritySignals(
  attentionAreas: readonly string[],
  nextStepDirection: string
): [string, string] {
  const areas = [...new Set(attentionAreas
    .map((area) => area.replace(/\s+/g, ' ').trim())
    .filter(Boolean))].slice(0, 2);
  const overallDirection = nextStepDirection.trim()
    ? 'The overall management direction is to use this result to guide the next management actions.'
    : 'Leadership should use the overall result to determine the next management focus.';

  if (areas.length >= 2) {
    return [
      `The recorded responses point to ${areas[0]} as an area requiring management attention.`,
      `The recorded responses point to ${areas[1]} as the next area to examine in more detail.`
    ];
  }
  if (areas.length === 1) {
    return [
      `The recorded responses point to ${areas[0]} as an area requiring management attention.`,
      overallDirection
    ];
  }
  return [
    'The recorded responses do not identify a specific area for priority attention.',
    overallDirection
  ];
}

/**
 * Last-resort customer-safe copy. The result shell remains authoritative in the Snapshot UI;
 * this copy is deliberately free of domain names, diagnostic counts and technical details so
 * an unexpected richer-narrative validation failure cannot make a valid result inaccessible.
 */
export function buildMinimalSafeSnapshotNarrativeContent(): SnapshotNarrativeContent {
  return {
    headline: 'Your recorded self-assessment result is ready.',
    executiveDiagnosis: 'The recorded responses provide a result for management review.',
    strength: 'The self-assessment does not support a specific strength statement in this view.',
    prioritySignals: [
      'The recorded responses identify areas for management attention.',
      'The result points to the next management focus.'
    ],
    managementImplication: 'Leadership should use the recorded result to guide the next management actions.'
  };
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
  const prioritySignals = buildDeterministicSnapshotPrioritySignals(
    input.insights.priorityAreas.map((area) => area.domainName),
    input.insights.leadershipPriority
  );
  const focusNames = input.insights.priorityAreas.slice(0, 2).map((area) => area.domainName);
  return {
    headline: `${safeOrganisationName(input.snapshot.organisationName)} has a ${maturity} fraud-readiness position.`,
    executiveDiagnosis: input.snapshot.resultStatus === 'INSUFFICIENT_VISIBILITY'
      ? 'The recorded responses do not yet support a reliable readiness interpretation. The result shows where further information is needed.'
      : `The recorded responses place the organisation in a ${maturity} fraud-readiness position. The current picture highlights where management attention is needed.`,
    strength: input.insights.strengths[0]
      ? `${input.insights.strengths[0].domainName} is the clearest recorded foundation in this Snapshot.`
      : 'The recorded responses do not yet support identifying a dependable organisational strength.',
    prioritySignals,
    managementImplication: focusNames.length
      ? `Leadership should focus first on ${focusNames.join(' and ')}, assign clear ownership and track evidence of progress.`
      : 'Leadership should use the recorded result to set clear ownership for the next management actions.'
  };
}
