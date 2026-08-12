import type { LeadershipDecision } from '../evidence-model/types';
import type { DecisionOptionDetail, DecisionOptionSet } from './types';

const DECISION_OPTIONS: Record<string, Array<Omit<DecisionOptionDetail, 'option'> & { option: string }>> = {
  accountable_executive_mandate: [
    { option: 'Name one accountable executive with explicit decision rights', cost: 'Executive attention and a signed mandate.', benefit: 'Creates a single route for ownership, escalation and resource decisions.', tradeOff: 'Requires the named executive to resolve cross-functional blockers.' },
    { option: 'Create a dedicated fraud-risk programme owner', cost: 'Dedicated capacity and management reporting effort.', benefit: 'Improves coordination across domains and keeps the treatment plan visible.', tradeOff: 'May create a coordination layer unless process owners retain delivery accountability.' },
    { option: 'Split ownership by risk pathway with one executive sponsor', cost: 'Multiple owner commitments and a sponsor forum.', benefit: 'Matches ownership to operational processes while retaining executive escalation.', tradeOff: 'Needs clear boundaries to avoid gaps between pathway owners.' }
  ],
  risk_acceptance_or_remediation: [
    { option: 'Remediate within the approved target period', cost: 'Immediate process and control-delivery capacity.', benefit: 'Reduces the recorded exposure pathway with a defined completion horizon.', tradeOff: 'Competes with other operational priorities in the near term.' },
    { option: 'Time-bound acceptance with a compensating control', cost: 'Owner attention, expiry tracking and interim control operation.', benefit: 'Makes a temporary acceptance explicit while limiting unmanaged exposure.', tradeOff: 'Leaves residual exposure until the expiry decision is revisited.' },
    { option: 'Commission targeted specialist remediation', cost: 'Bounded specialist budget and internal handover time.', benefit: 'Adds focused design capacity where the risk is complex or time-sensitive.', tradeOff: 'Requires procurement, scope control and retained internal ownership.' }
  ],
  control_design_standard: [
    { option: 'Adopt the approved control blueprint as the minimum standard', cost: 'Implementation effort across the named process population.', benefit: 'Creates a consistent baseline for objective, ownership, proof and escalation.', tradeOff: 'May require process changes where current practice is materially different.' },
    { option: 'Tailor the blueprint by process while preserving the minimum fields', cost: 'Design workshops and documented deviations.', benefit: 'Fits operational reality without losing the control objective or proof standard.', tradeOff: 'Needs oversight review to prevent inconsistent weakening.' },
    { option: 'Pilot the blueprint in the highest-risk process before scaling', cost: 'Pilot management time, measurement and subsequent rollout.', benefit: 'Tests usability and effectiveness measures before wider adoption.', tradeOff: 'Leaves other processes on the prior design during the pilot period.' }
  ],
  funding_resource_allocation: [
    { option: 'Fund delivery through existing teams and confirmed capacity', cost: 'Reprioritisation and protected management time.', benefit: 'Keeps capability and accountability inside the organisation.', tradeOff: 'May extend delivery where specialist capacity is already constrained.' },
    { option: 'Fund bounded specialist support for the named priority', cost: 'Targeted external budget and handover effort.', benefit: 'Accelerates complex design or implementation work.', tradeOff: 'Requires scope, procurement and transfer of ownership.' },
    { option: 'Use a hybrid internal and specialist delivery plan', cost: 'Internal capacity plus a defined specialist work package.', benefit: 'Retains internal accountability while accelerating the constrained workstream.', tradeOff: 'Needs explicit interfaces so responsibility is not diluted.' }
  ],
  sequencing_dependency: [
    { option: 'Complete prerequisites before dependent control work', cost: 'Early focus on ownership, data or process foundations.', benefit: 'Reduces the risk of downstream controls being built on incomplete inputs.', tradeOff: 'Later controls may start after the first target period.' },
    { option: 'Run workstreams in parallel with explicit dependency guardrails', cost: 'Cross-workstream coordination and dependency tracking.', benefit: 'Shortens the overall path while making prerequisites visible.', tradeOff: 'Requires disciplined escalation when a dependency slips.' },
    { option: 'Defer the dependent control with an interim containment measure', cost: 'Interim control operation and expiry management.', benefit: 'Prevents unmanaged exposure while a prerequisite is prepared.', tradeOff: 'The interim measure may be less efficient or less complete.' }
  ],
  external_specialist_support: [
    { option: 'Deliver through internal fraud-risk and process expertise', cost: 'Protected internal capacity and management time.', benefit: 'Builds durable ownership and context inside the organisation.', tradeOff: 'May move slowly where specialist capability is immature.' },
    { option: 'Use a bounded specialist work package with internal handover', cost: 'Specialist budget, procurement and handover effort.', benefit: 'Adds focused capability against the named complex priority.', tradeOff: 'Requires clear scope and internal acceptance of the output.' },
    { option: 'Combine internal ownership with specialist challenge and design', cost: 'Internal capacity plus targeted specialist budget.', benefit: 'Keeps the decision and ownership internal while strengthening the design.', tradeOff: 'Needs explicit boundaries and a defined end to specialist support.' }
  ],
  governance_reporting_cadence: [
    { option: 'Monthly implementation review with quarterly control-effectiveness review', cost: 'A recurring management pack and oversight agenda.', benefit: 'Surfaces delivery slippage and effectiveness exceptions at useful intervals.', tradeOff: 'Requires reliable measures and clear escalation ownership.' },
    { option: 'Quarterly programme review with event-triggered escalation', cost: 'Quarterly reporting plus defined trigger monitoring.', benefit: 'Reduces routine reporting effort while retaining escalation for material change.', tradeOff: 'Smaller delivery slippage may remain unseen between quarterly reviews.' },
    { option: 'Monthly pathway-owner review with consolidated executive reporting', cost: 'Owner-level review time and a consolidated reporting process.', benefit: 'Connects operational action to executive decisions without duplicating every detail.', tradeOff: 'Needs consistent pathway measures and disciplined consolidation.' }
  ]
};

/** Approved deterministic decision library used by the Comprehensive blueprint. */
export function buildDecisionOptionSets(decisions: LeadershipDecision[]): DecisionOptionSet[] {
  return decisions.map((decision) => {
    const details = DECISION_OPTIONS[decision.decisionCategory] ?? DECISION_OPTIONS.control_design_standard;
    return {
      decisionId: decision.id,
      viableOptions: details.map((detail) => detail.option),
      optionDetails: details,
      deterministicRecommendation: decision.recommendedDecision,
      recommendationRationale: `The recorded assessment links this decision to ${decision.linkedFindingIds.length} material finding(s) and ${decision.linkedRiskIds.length} risk(s). Management should confirm the final route, cost and delivery capacity for this issue.`,
      owner: decision.accountableExecutive,
      targetPeriod: decision.targetPeriod,
      targetDate: decision.deadline,
      consequenceOfDelay: decision.consequenceOfDelay
    };
  });
}
