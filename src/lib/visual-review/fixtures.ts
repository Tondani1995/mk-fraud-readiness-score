import type { AdaptiveControlResponses, AdaptiveGatewayAnswers, AdaptiveGraph } from '@/lib/adaptive/engine';
import { deriveAdaptiveIntegritySignals, resolveAdaptivePath } from '@/lib/adaptive/engine';
import type { AdaptiveResultMetrics, AdaptiveResultStatus } from '@/lib/scoring/adaptive-scoring';
import type { FreeSnapshot, FreeSnapshotDomain } from '@/lib/snapshot/free-snapshot';
import type { SelfServicePaidTier } from '@/lib/commercial/product-catalogue';
import v12Graph from '@/lib/adaptive/candidates/adaptive-graph-v1-2-candidate.json' with { type: 'json' };

/**
 * Deterministic, read-only fixtures for owner visual review.
 *
 * These builders are deliberately separate from request handlers and persistence code. The
 * adaptive fixtures are resolved by the same pure graph engine used by the customer journey;
 * the snapshot fixtures have the same persisted projection consumed by SnapshotResult. Nothing
 * in this module imports Supabase, token validation or an API route.
 */

export type AdaptiveVisualReviewVariant = 'early' | 'mid' | 'late' | 'review' | 'submitted';

export type SnapshotVisualReviewVariant = 'score-100' | 'score-60' | 'score-20' | 'insufficient-visibility';

export const VISUAL_REVIEW_ASSESSMENT_REFERENCE = 'VISUAL-2026-OWNER-REVIEW';

const GRAPH = v12Graph as unknown as AdaptiveGraph;

function firstGatewayAnswers(): AdaptiveGatewayAnswers {
  return Object.fromEntries(
    GRAPH.gateways.map((gateway) => [gateway.questionId, gateway.responseOptions[0]?.value ?? 'unknown'])
  );
}

function responseFor(value: number): { responseState: 'maturity'; responseValue: number } {
  return { responseState: 'maturity', responseValue: value };
}

function responsesFor(nodes: ReturnType<typeof resolveAdaptivePath>['activeNodes'], count: number, value = 3): AdaptiveControlResponses {
  return Object.fromEntries(
    nodes
      .filter((node) => node.kind !== 'gateway')
      .slice(0, Math.max(0, count))
      .map((node) => [node.nodeId, responseFor(value)])
  );
}

function allResponses(path: ReturnType<typeof resolveAdaptivePath>, value = 3): AdaptiveControlResponses {
  return responsesFor(path.activeNodes, path.activeNodes.filter((node) => node.kind !== 'gateway').length, value);
}

function adaptiveStateFor(variant: AdaptiveVisualReviewVariant) {
  const gatewayAnswers = variant === 'early' ? {} : firstGatewayAnswers();
  const initialPath = resolveAdaptivePath({ graph: GRAPH, gatewayAnswers });
  const activeControlCount = initialPath.activeNodes.filter((node) => node.kind !== 'gateway').length;

  let controlResponses: AdaptiveControlResponses = {};
  if (variant === 'mid') {
    controlResponses = responsesFor(initialPath.activeNodes, Math.max(1, Math.floor(activeControlCount * 0.45)), 3);
  } else if (variant === 'late') {
    controlResponses = responsesFor(initialPath.activeNodes, Math.max(1, activeControlCount - 2), 4);
  } else if (variant === 'review' || variant === 'submitted') {
    controlResponses = allResponses(initialPath, 4);
  }

  const path = resolveAdaptivePath({ graph: GRAPH, gatewayAnswers, controlResponses });
  const screen = variant === 'early'
    ? 'gateway'
    : variant === 'review'
      ? 'review'
      : variant === 'submitted'
        ? 'complete'
        : 'question';
  const currentQuestionId = variant === 'early'
    ? path.currentNextNode
    : variant === 'review' || variant === 'submitted'
      ? null
      : path.currentNextNode;
  const visitedQuestionIds = variant === 'early'
    ? []
    : path.nodes
      .filter((node) => node.state === 'profile-only' || (node.kind !== 'gateway' && Boolean(controlResponses[node.nodeId])))
      .map((node) => node.nodeId);
  const navigation = {
    graph_version_id: 'visual-review-graph',
    current_question_id: currentQuestionId,
    visited_question_ids: visitedQuestionIds,
    current_screen: screen,
    save_sequence: 12,
    last_saved_at: '2026-09-01T08:00:00.000Z',
    submitted_at: variant === 'submitted' ? '2026-09-01T08:05:00.000Z' : null
  };

  return {
    graph: GRAPH,
    responseScale: GRAPH.responseScale,
    gateways: GRAPH.gateways,
    gatewayAnswers,
    controlResponses,
    guidanceByQuestion: {},
    navigation,
    path,
    signals: deriveAdaptiveIntegritySignals({
      graph: GRAPH,
      path,
      navigation: { currentQuestionId, currentScreen: screen },
      gatewayAnswers
    })
  };
}

export function buildAdaptiveVisualReviewState(variant: AdaptiveVisualReviewVariant) {
  return adaptiveStateFor(variant);
}

function domain(code: string, name: string, rawScore: number | null, criticalGapCount = 0, coveragePct = 100, weightPct = 10): FreeSnapshotDomain {
  return {
    domainId: `visual-${code.toLowerCase()}`,
    domainCode: code,
    domainName: name,
    weightPct,
    rawScore,
    weightedContribution: rawScore === null ? null : rawScore * (weightPct / 100),
    coveragePct,
    criticalGapCount
  };
}

function adaptiveMetrics(resultStatus: AdaptiveResultStatus, assessmentCoveragePct: number, controlVisibilityPct: number, unknownSharePct: number): AdaptiveResultMetrics {
  return {
    resultStatus,
    graphVersion: GRAPH.graphVersion,
    graphFingerprint: GRAPH.graphFingerprint,
    applicableCount: 68,
    applicableWeight: 100,
    excludedCount: 0,
    excludedWeight: 0,
    redirectedCount: 0,
    redirectedWeight: 0,
    invalidatedCount: 0,
    invalidatedWeight: 0,
    profileOnlyCount: GRAPH.gateways.length,
    unknownCount: 0,
    unknownWeight: 0,
    unansweredApplicableCount: 0,
    unansweredApplicableWeight: 0,
    assessmentCoveragePct,
    controlVisibilityPct,
    exposureAssessed: resultStatus !== 'INSUFFICIENT_VISIBILITY',
    visibilityGaps: [],
    materialExclusionSharePct: 0,
    unknownSharePct,
    scoreComparabilityStatement: 'Synthetic deterministic fixture for visual review only.',
    limitationReasons: [],
    excludedQuestionCodes: [],
    redirectedQuestionCodes: [],
    invalidatedQuestionCodes: [],
    unknownQuestionCodes: [],
    questionTraces: []
  };
}

function baseSnapshot(): FreeSnapshot {
  return {
    assessmentId: 'visual-review-assessment',
    assessmentReference: VISUAL_REVIEW_ASSESSMENT_REFERENCE,
    organisationName: 'Siyakhula Holdings (Pty) Ltd',
    respondentName: 'Nomsa Dlamini',
    respondentEmail: 'nomsa@siyakhula.example',
    scoreRunId: 'visual-review-score-run',
    methodologyVersionId: 'visual-review-methodology',
    runNumber: 1,
    overallScore: 60,
    calculatedMaturity: 'Developing',
    finalMaturity: 'Developing',
    exposureScore: null,
    exposureBand: null,
    coveragePct: 87,
    nARatePct: 6,
    criticalGapCount: 0,
    majorGapCount: 4,
    capApplied: false,
    capReason: null,
    scoredAt: '2026-09-01T08:00:00.000Z',
    domains: [
      domain('D1', 'Fraud Leadership and Governance', 58, 0, 100, 12),
      domain('D2', 'Fraud Risk Identification', 62, 0, 100, 12),
      domain('D3', 'Operational Fraud Controls', 55, 0, 100, 12),
      domain('D4', 'Fraud Detection Capability', 61, 0, 100, 12),
      domain('D5', 'Fraud Incident Response', 59, 0, 100, 10),
      domain('D6', 'Whistleblowing and Reporting Culture', 64, 0, 100, 10),
      domain('D7', 'Third-Party and Supply Chain Fraud Risk', 49, 0, 100, 10),
      domain('D8', 'Data and Systems Integrity', 68, 0, 100, 10),
      domain('D9', 'People and Conduct Risk', 54, 0, 100, 10)
    ],
    resultStatus: 'NORMAL',
    adaptiveMetrics: adaptiveMetrics('NORMAL', 87, 91, 6),
    comparabilityStatement: null
  };
}

function score100Snapshot(): FreeSnapshot {
  return {
    ...baseSnapshot(),
    overallScore: 100,
    calculatedMaturity: 'Strategic',
    finalMaturity: 'Strategic',
    coveragePct: 100,
    nARatePct: 0,
    majorGapCount: 0,
    domains: [
      domain('D1', 'Fraud Leadership and Governance', 100, 0, 100, 12),
      domain('D2', 'Fraud Risk Identification', 96, 0, 100, 12),
      domain('D3', 'Operational Fraud Controls', 100, 0, 100, 12),
      domain('D4', 'Fraud Detection Capability', 98, 0, 100, 12),
      domain('D5', 'Fraud Incident Response', 94, 0, 100, 10),
      domain('D6', 'Whistleblowing and Reporting Culture', 97, 0, 100, 10),
      domain('D7', 'Third-Party and Supply Chain Fraud Risk', 95, 0, 100, 10),
      domain('D8', 'Data and Systems Integrity', 100, 0, 100, 10),
      domain('D9', 'People and Conduct Risk', 99, 0, 100, 10)
    ],
    adaptiveMetrics: adaptiveMetrics('NORMAL', 100, 100, 0)
  };
}

function score20Snapshot(): FreeSnapshot {
  return {
    ...baseSnapshot(),
    overallScore: 20,
    calculatedMaturity: 'Reactive',
    finalMaturity: 'Reactive',
    coveragePct: 82,
    nARatePct: 8,
    criticalGapCount: 4,
    majorGapCount: 0,
    domains: [
      domain('D1', 'Fraud Leadership and Governance', 16, 2, 100, 12),
      domain('D2', 'Fraud Risk Identification', 24, 1, 100, 12),
      domain('D3', 'Operational Fraud Controls', 19, 1, 100, 12),
      domain('D4', 'Fraud Detection Capability', 20, 0, 100, 12),
      domain('D5', 'Fraud Incident Response', 14, 0, 100, 10),
      domain('D6', 'Whistleblowing and Reporting Culture', 22, 0, 100, 10),
      domain('D7', 'Third-Party and Supply Chain Fraud Risk', 21, 0, 100, 10),
      domain('D8', 'Data and Systems Integrity', 27, 0, 100, 10),
      domain('D9', 'People and Conduct Risk', 18, 0, 100, 10)
    ],
    adaptiveMetrics: adaptiveMetrics('NORMAL', 82, 84, 8)
  };
}

function insufficientVisibilitySnapshot(): FreeSnapshot {
  return {
    ...baseSnapshot(),
    overallScore: null,
    calculatedMaturity: null,
    finalMaturity: null,
    coveragePct: 41,
    nARatePct: 46,
    criticalGapCount: 0,
    majorGapCount: 0,
    resultStatus: 'INSUFFICIENT_VISIBILITY',
    domains: baseSnapshot().domains.map((item) => ({ ...item, rawScore: null, weightedContribution: null, coveragePct: 0, criticalGapCount: 0 })),
    adaptiveMetrics: adaptiveMetrics('INSUFFICIENT_VISIBILITY', 41, 38, 46)
  };
}

export function buildSnapshotVisualReviewFixture(variant: SnapshotVisualReviewVariant): FreeSnapshot {
  if (variant === 'score-100') return score100Snapshot();
  if (variant === 'score-20') return score20Snapshot();
  if (variant === 'insufficient-visibility') return insufficientVisibilitySnapshot();
  return baseSnapshot();
}

export function snapshotVisualReviewTitle(variant: SnapshotVisualReviewVariant) {
  return {
    'score-100': 'Snapshot · score 100 · Strategic / Essential recommendation',
    'score-60': 'Snapshot · score 60 · Developing / Comprehensive recommendation',
    'score-20': 'Snapshot · score 20 · Reactive / Comprehensive recommendation',
    'insufficient-visibility': 'Snapshot · Not issued · insufficient visibility'
  }[variant];
}

export type VisualReviewOrder = {
  tier: SelfServicePaidTier;
  orderReference: string;
  productName: string;
  amountDisplay: string;
  paymentReference: string;
  invoiceRequested: boolean;
  assessmentReference: string;
  eftInstructions: {
    active: true;
    bankName: string;
    accountHolder: string;
    accountNumber: string;
    branchCode: string;
    accountType: string | null;
    currency: string;
    paymentReferenceInstruction: string;
    customerInstruction: string;
    contactEmail: string | null;
  };
};

export function buildVisualReviewOrder(tier: SelfServicePaidTier): VisualReviewOrder {
  const label = tier === 'essential' ? 'Essential' : 'Comprehensive';
  const amount = tier === 'essential' ? 'R7 500 incl. VAT' : 'R35 000 incl. VAT';
  const slug = tier.toUpperCase();
  return {
    tier,
    orderReference: `VISUAL-${slug}-ORDER`,
    productName: label,
    amountDisplay: amount,
    paymentReference: `VISUAL-${slug}-PAYMENT`,
    invoiceRequested: false,
    assessmentReference: VISUAL_REVIEW_ASSESSMENT_REFERENCE,
    eftInstructions: {
      active: true,
      bankName: 'MK Fraud Insights Review Bank',
      accountHolder: 'MK Fraud Insights (Pty) Ltd',
      accountNumber: '0000000000',
      branchCode: '000000',
      accountType: 'Cheque',
      currency: 'ZAR',
      paymentReferenceInstruction: 'Use the payment reference exactly as shown.',
      customerInstruction: 'This is synthetic visual-review data and is not a live payment instruction.',
      contactEmail: 'hello@mkfraud.co.za'
    }
  };
}
