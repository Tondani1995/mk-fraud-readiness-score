import type { AdaptiveResultMetrics, AdaptiveResultStatus, AssembledReportData } from '../types';

/**
 * Customer-safe projection of adaptive assessment scope for Comprehensive.
 *
 * This is presentation context only. It never changes score, maturity,
 * applicability or the deterministic management model.
 */
export interface ComprehensiveAssessmentScope {
  resultStatus: AdaptiveResultStatus;
  applicableCount: number;
  excludedCount: number;
  redirectedCount: number;
  invalidatedCount: number;
  unknownCount: number;
  unansweredApplicableCount: number;
  assessmentCoveragePct: number;
  controlVisibilityPct: number;
  scoreComparabilityStatement: string;
  limitationReasons: string[];
}

function project(metrics: AdaptiveResultMetrics): ComprehensiveAssessmentScope {
  return {
    resultStatus: metrics.resultStatus,
    applicableCount: metrics.applicableCount,
    excludedCount: metrics.excludedCount,
    redirectedCount: metrics.redirectedCount,
    invalidatedCount: metrics.invalidatedCount,
    unknownCount: metrics.unknownCount,
    unansweredApplicableCount: metrics.unansweredApplicableCount,
    assessmentCoveragePct: metrics.assessmentCoveragePct,
    controlVisibilityPct: metrics.controlVisibilityPct,
    scoreComparabilityStatement: metrics.scoreComparabilityStatement,
    limitationReasons: [...metrics.limitationReasons]
  };
}

export function comprehensiveAssessmentScopeFromData(data: AssembledReportData): ComprehensiveAssessmentScope | null {
  const metrics = data.adaptiveScope ?? data.scoreRun.adaptiveMetrics ?? null;
  if (!metrics) return null;

  const recordedStatus = data.scoreRun.adaptiveResultStatus ?? metrics.resultStatus;
  if (recordedStatus !== metrics.resultStatus) {
    throw new Error(
      `Comprehensive adaptive scope status mismatch: score run ${recordedStatus}, metrics ${metrics.resultStatus}.`
    );
  }
  return project(metrics);
}

/**
 * One plain-English scope statement shared by the renderer and provider brief.
 * Avoids calling legitimate exclusions weaknesses or calling oversight routing
 * uncertainty when the customer supplied a valid oversight response.
 */
export function comprehensiveAssessmentScopeStatement(scope: ComprehensiveAssessmentScope): string {
  const parts: string[] = [];

  if (scope.resultStatus === 'PROVISIONAL') {
    parts.push(
      'This is a provisional adaptive result. The score is usable as a directional management view, but it should not be compared mechanically with assessments that had materially different scope.'
    );
  } else if (scope.resultStatus === 'INSUFFICIENT_VISIBILITY') {
    parts.push(
      'The adaptive assessment did not provide enough visibility for a reliable scored result.'
    );
  } else {
    parts.push(
      'The result reflects the control areas applicable to this organisation under the adaptive assessment.'
    );
  }

  if (scope.excludedCount > 0) {
    parts.push(
      `${scope.excludedCount} control area${scope.excludedCount === 1 ? ' was' : 's were'} outside the assessed scope and ${scope.excludedCount === 1 ? 'is' : 'are'} not treated as ${scope.excludedCount === 1 ? 'a weakness' : 'weaknesses'}.`
    );
  }
  if (scope.redirectedCount > 0) {
    parts.push(
      `${scope.redirectedCount} control area${scope.redirectedCount === 1 ? ' was' : 's were'} completed through the applicable oversight question set and ${scope.redirectedCount === 1 ? 'remains' : 'remain'} in the scored scope.`
    );
  }
  if (scope.unknownCount > 0) {
    parts.push(
      `${scope.unknownCount} applicable control area${scope.unknownCount === 1 ? ' has' : 's have'} an unknown response.`
    );
  }
  if (scope.unansweredApplicableCount > 0) {
    parts.push(
      `${scope.unansweredApplicableCount} applicable control area${scope.unansweredApplicableCount === 1 ? ' is' : 's are'} unanswered.`
    );
  }
  if (scope.limitationReasons.length > 0) {
    parts.push(...scope.limitationReasons);
  }

  return parts.join(' ');
}
