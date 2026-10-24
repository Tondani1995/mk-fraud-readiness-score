import { calculateAdaptiveReadinessScore } from '@/lib/scoring/adaptive-scoring';
import { buildAdaptiveVisualReviewState, buildSnapshotVisualReviewFixture } from '@/lib/visual-review/fixtures';
import type { AdaptiveControlResponses } from '@/lib/adaptive/engine';

export const CALCULATED_VARIANTS = ['mixed-controls', 'critical-controls', 'strong-controls', 'partial-coverage', 'visibility-limited'] as const;
export type CalculatedVariant = typeof CALCULATED_VARIANTS[number];

/** Pure engine invocation, using the existing preview graph and the G27 test methodology adapter.
 * Does not activate a graph, access the database, invoke AI or change the production methodology.
 */
export function buildCalculatedSnapshotFixture(variant: CalculatedVariant) {
  const state = buildAdaptiveVisualReviewState('review');
  const graph = state.graph;
  const methodology = {
    domains: graph.domains.map((domain) => ({
      id: `review-${domain.domainCode}`, domainCode: domain.domainCode, name: domain.name,
      weightPct: domain.weightPct, domainType: 'control' as const, isCore: Boolean((domain as typeof domain & { isCore?: boolean }).isCore), sortOrder: domain.sortOrder,
      questions: graph.questions.filter((question) => question.domainCode === domain.domainCode).map((question, index) => ({
        id: question.questionId, questionCode: question.questionCode, domainCode: question.domainCode, domainName: domain.name,
        prompt: question.prompt, helpText: null, weight: question.weight, isCritical: question.isCritical, isHardGate: question.isHardGate,
        nAAllowed: false, nARuleKey: null, triggerKey: null, sortOrder: index
      }))
    })), responseScale: [], exposureFactors: []
  };
  const controlResponses: AdaptiveControlResponses = {};
  const active = state.path.activeNodes.filter((node) => node.kind !== 'gateway');
  active.forEach((node, index) => {
    const question = graph.questions.find((question) => question.questionId === node.nodeId)!;
    if (variant === 'partial-coverage' && index >= active.length - 9) return;
    if (variant === 'visibility-limited' && index % 2 === 0) {
      controlResponses[node.nodeId] = { responseState: 'unknown', responseValue: null };
      return;
    }
    const value = variant === 'strong-controls' ? 5
      : variant === 'critical-controls' ? 1
      : variant === 'mixed-controls' ? (question.domainCode === 'D7' ? 1 : question.domainCode === 'D3' ? 2 : 4)
      : 3;
    controlResponses[node.nodeId] = { responseState: 'maturity', responseValue: value };
  });
  const result = calculateAdaptiveReadinessScore({ graph, methodology, gatewayAnswers: state.gatewayAnswers, controlResponses });
  return {
    ...buildSnapshotVisualReviewFixture('score-60'), ...result.summary,
    assessmentReference: `CALCULATED-${variant.toUpperCase()}`,
    scoreRunId: `calculated-${variant}`, methodologyVersionId: graph.methodologyVersion,
    domains: result.domainResults.map((domain) => ({ ...domain, weightPct: domain.domainWeightPct })),
    resultStatus: result.resultStatus, adaptiveMetrics: result.metrics,
    comparabilityStatement: result.metrics.scoreComparabilityStatement
  };
}
