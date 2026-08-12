import type { LeadershipDecision } from '../evidence-model/types';
import type { ReviewerDecisionReview } from './types';

type OptionDetail = NonNullable<ReviewerDecisionReview['optionDetails']>[number];

function optionDetail(option: string, index: number): OptionDetail {
  const labels = [
    {
      benefit: 'Builds durable ownership inside the organisation.',
      tradeOff: 'Uses internal capacity and may move more slowly where capability is immature.',
      rejectionReason: 'Not preferred where the target period cannot be met with internal capacity.'
    },
    {
      benefit: 'Adds focused specialist capacity against the named priority.',
      tradeOff: 'Introduces external cost, handover effort and a dependency on clear scope.',
      rejectionReason: undefined
    },
    {
      benefit: 'Combines internal accountability with targeted specialist support.',
      tradeOff: 'Needs explicit boundaries so ownership and escalation are not diluted.',
      rejectionReason: 'Not preferred where the organisation cannot fund or coordinate both routes.'
    }
  ];
  const template = labels[index] ?? labels[2];
  return {
    option,
    cost: 'Cost and effort require management confirmation before approval.',
    benefit: template.benefit,
    tradeOff: template.tradeOff,
    rejectionReason: template.rejectionReason
  };
}

function recordedTradeOff(text: string | undefined, label: string): string | undefined {
  if (!text) return undefined;
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escaped}[^.]*?Trade-off:\\s*(.*?)(?=\\s+Option\\s+[ABC]\\b|\\s+Management decision:|$)`, 'i').exec(text);
  return match?.[1]?.trim().replace(/[.]$/, '') || undefined;
}

function recordedRejectionReason(option: string): string | undefined {
  const match = /\((rejected[^)]*)\)/i.exec(option);
  return match?.[1]?.trim();
}

function enrichDecisionReview(decision: LeadershipDecision, review: ReviewerDecisionReview | undefined): ReviewerDecisionReview {
  const options = review?.viableOptions?.length ? review.viableOptions : [
    'Option A — deliver through existing internal ownership',
    'Option B — use bounded specialist support',
    'Option C — combine internal ownership with targeted specialist support'
  ];
  const optionDetails = options.slice(0, 3).map((option, index) => {
    const base = review?.optionDetails?.[index] ?? optionDetail(option, index);
    const tradeOff = recordedTradeOff(review?.reviewerRecommendation, option) ?? base.tradeOff;
    return { ...base, tradeOff, rejectionReason: recordedRejectionReason(option) ?? base.rejectionReason };
  });
  const keyTradeOffs = review?.keyTradeOffs?.length
    ? review.keyTradeOffs
    : optionDetails.map((option) => `${option.option}: ${option.tradeOff}`);
  const reviewerRecommendation = review?.reviewerRecommendation ?? `Deterministic recommendation: ${decision.recommendedDecision}`;
  const recommendationRationale = review?.recommendationRationale
    ?? 'The recommendation follows the linked deterministic finding and risk priorities; management must confirm the final route, cost and delivery capacity.';
  return {
    decisionId: decision.id,
    viableOptions: options.slice(0, 3),
    keyTradeOffs,
    optionDetails,
    reviewerRecommendation,
    recommendationRationale,
    managementBoardDecision: review?.managementBoardDecision ?? 'Management to confirm the selected option, accountable owner and decision date.',
    owner: review?.owner ?? decision.accountableExecutive,
    targetDate: review?.targetDate ?? decision.deadline
  };
}

export function enrichDecisionReviews(
  decisions: LeadershipDecision[],
  reviews: ReviewerDecisionReview[]
): ReviewerDecisionReview[] {
  const byId = new Map(reviews.map((review) => [review.decisionId, review]));
  return decisions.map((decision) => enrichDecisionReview(decision, byId.get(decision.id)));
}
