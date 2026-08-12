import type { LeadershipDecision } from '../evidence-model/types';
import type { DecisionOptionDetail, DecisionOptionSet } from './types';

const OPTION_TEMPLATES: Array<Omit<DecisionOptionDetail, 'option'>> = [
  { cost: 'Internal capacity and management time.', benefit: 'Builds durable ownership inside the organisation.', tradeOff: 'May move more slowly where capability is immature.' },
  { cost: 'Targeted specialist budget and handover effort.', benefit: 'Adds focused capacity against the named priority.', tradeOff: 'Requires clear scope, procurement and transfer of ownership.' },
  { cost: 'Combined internal capacity plus targeted specialist budget.', benefit: 'Keeps accountability internal while accelerating the priority design.', tradeOff: 'Needs explicit boundaries so ownership and escalation are not diluted.' }
];

function optionLabel(index: number): string {
  return ['Option A — deliver through existing internal ownership', 'Option B — use bounded specialist support', 'Option C — combine internal ownership with targeted specialist support'][index] ?? `Option ${index + 1}`;
}

function optionDetails(): DecisionOptionDetail[] {
  return OPTION_TEMPLATES.map((template, index) => ({ option: optionLabel(index), ...template }));
}

/** Approved deterministic decision library used by the Comprehensive blueprint. */
export function buildDecisionOptionSets(decisions: LeadershipDecision[]): DecisionOptionSet[] {
  return decisions.map((decision) => ({
    decisionId: decision.id,
    viableOptions: optionDetails().map((detail) => detail.option),
    optionDetails: optionDetails(),
    deterministicRecommendation: decision.recommendedDecision,
    recommendationRationale: `The recorded assessment links this decision to ${decision.linkedFindingIds.length} material finding(s) and ${decision.linkedRiskIds.length} risk(s). Management should confirm the final route, cost and delivery capacity.`,
    owner: decision.accountableExecutive,
    targetPeriod: decision.targetPeriod,
    targetDate: decision.deadline,
    consequenceOfDelay: decision.consequenceOfDelay
  }));
}
