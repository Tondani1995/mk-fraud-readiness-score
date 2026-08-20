import { consequenceClause } from './registers';
import type { AssembledReportData } from '../types';
import { stableToken, stableUnique } from './deterministic';
import type { MaterialFinding, PlausibleScenario, RiskRegisterEntry, ScenarioBasis } from './types';

const GAP_DISCLAIMER = "This is a plausible scenario derived from the organisation's self-assessment evidence. It is not an allegation that the event has occurred.";
const ASSURANCE_DISCLAIMER = "This is a plausible assurance-validation scenario derived from the organisation's self-assessment evidence. It tests resilience, is not an allegation, and does not assert that a control weakness or event exists.";


/**
 * Mechanism presentation for the scenario types the model ALREADY carries
 * (SCENARIO_TYPES_BY_QUESTION / playbook relatedScenarioTypes). This introduces no new taxonomy and
 * no new facts: each entry only renders a scenario type the linked evidence already asserts.
 *
 * V7 titled every scenario with the generic risk title ("Fraud Risk Identification control
 * effectiveness risk") and gave every one the same entry point ("An ordinary process, system,
 * person or third-party interaction relevant to <domain>."), so two materially different mechanisms
 * were indistinguishable to a reader paying for advisory work.
 *
 * `rank` orders the choice when a scenario links several types, so output is deterministic.
 */
const SCENARIO_MECHANISMS: Record<string, { rank: number; title: string; entryPoint: string }> = {
  privileged_access_exploitation: {
    rank: 10,
    title: 'Privileged-access misuse escapes independent review',
    entryPoint: 'A privileged, administrative or emergency-access account operating without independent periodic review.'
  },
  segregation_of_duties_bypass: {
    rank: 9,
    title: 'Segregation-of-duties weakness enables end-to-end transaction control',
    entryPoint: 'A user or role able to initiate and approve the same transaction without independent maker-checker evidence.'
  },
  supplier_payment_redirection: {
    rank: 9,
    title: 'Supplier bank-detail change enables payment diversion',
    entryPoint: 'A supplier-master or bank-detail amendment progressing without independent verification of the requester.'
  },
  supplier_onboarding_fraud: {
    rank: 8,
    title: 'Supplier activation without verification admits a fictitious or conflicted vendor',
    entryPoint: 'A new or reactivated supplier progressing to payment before independent registration and ownership verification.'
  },
  account_takeover: {
    rank: 8,
    title: 'Account takeover proceeds without detection',
    entryPoint: 'A credential reset, device change or session anomaly on an account with transaction authority.'
  },
  digital_access_abuse: {
    rank: 7,
    title: 'Digital access rights outlive their business justification',
    entryPoint: 'A user entitlement retained after a role change, exit or contract end without an access review.'
  },
  digital_transaction_abuse: {
    rank: 7,
    title: 'Anomalous digital transactions persist without challenge',
    entryPoint: 'A digital payment or adjustment falling outside expected pattern with no operating review evidence.'
  },
  access_abuse: {
    rank: 6,
    title: 'Access rights are exercised beyond approved role requirements',
    entryPoint: 'A user entitlement exercised outside the approved role matrix without independent review.'
  },
  incident_response_breakdown: {
    rank: 5,
    title: 'A reported incident stalls before containment or escalation',
    entryPoint: 'A suspected-fraud report entering intake without a severity decision or named incident owner.'
  },
  evidence_compromise: {
    rank: 5,
    title: 'Evidence relating to a suspected matter is lost or altered',
    entryPoint: 'Records relating to a suspected matter held without retention, legal-hold or custody control.'
  },
  suppressed_reporting: {
    rank: 4,
    title: 'Concerns go unreported or are routed to an implicated party',
    entryPoint: 'A concern raised through a channel that an implicated manager can see, influence or close.'
  }
};

/** The strongest supported mechanism across the linked findings, or null when none is asserted. */
function selectedMechanism(findings: MaterialFinding[]) {
  const types = stableUnique(findings.flatMap((finding) => finding.linkedScenarioTypes ?? []));
  const known = types
    .map((type) => ({ type, entry: SCENARIO_MECHANISMS[type] }))
    .filter((candidate): candidate is { type: string; entry: typeof SCENARIO_MECHANISMS[string] } =>
      Boolean(candidate.entry));
  if (known.length === 0) return null;
  // Deterministic: highest rank wins, ties broken lexically on the type name.
  known.sort((left, right) => right.entry.rank - left.entry.rank || left.type.localeCompare(right.type));
  return known[0];
}

function priorityRank(priority: RiskRegisterEntry['priority']): number {
  return { Critical: 4, High: 3, Medium: 2, Low: 1 }[priority];
}

function scenarioForRisk(risk: RiskRegisterEntry, linked: MaterialFinding[], suffix = ''): PlausibleScenario {
  const ordered = [...linked].sort((a, b) => b.materialityScore - a.materialityScore || a.questionCode.localeCompare(b.questionCode));
  const basis: ScenarioBasis = ordered.every((finding) => finding.materialityClass === 'assurance_priority')
    ? 'assurance_validation'
    : 'control_gap';
  const lead = ordered[0];
  const evidenceRefs = stableUnique([
    `risk:${risk.id}`,
    ...ordered.flatMap((finding) => [`finding:${finding.id}`, `question:${finding.questionCode}`])
  ]);
  const scenarioType = risk.id.replace(/^RISK-/, '').toLowerCase().replace(/-/g, '_');
  const resilience = basis === 'assurance_validation';
  const mechanism = selectedMechanism(ordered);
  return {
    id: `SC-${stableToken(`${risk.id}|${suffix || 'primary'}`)}`,
    scenarioType,
    scenarioBasis: basis,
    // risk.title is already the resilience-safe variant when basis === 'assurance_validation' (see
    // registers.ts buildRiskRegister), so no separate "Resilience validation:" prefix is added here
    // -- that would just duplicate the framing already carried in the title text itself.
    // Mechanism-specific where the linked evidence asserts a scenario type; otherwise the finding's
    // own authored fraud mechanism, which is still evidence-derived. Only if neither exists does the
    // risk title remain. Resilience scenarios keep the risk's own resilience-safe title so a
    // self-reported operating control is never restated as an asserted weakness.
    title: resilience
      ? risk.title
      : mechanism?.entry.title
        ?? (lead?.fraudMechanism ? consequenceClause(lead.fraudMechanism) : risk.title),
    confirmedOperatingContext: ordered.map((finding) => `${finding.domainName}: ${finding.responseMeaning}; self-assessed, not independently verified.`),
    // Where no scenario type is asserted the entry point still comes from evidence -- the lead
    // finding's own recorded control condition -- rather than the domain placeholder, which said
    // nothing a reader could act on. Neutral, not invented: it restates a condition already in the
    // report.
    entryPoint: mechanism
      ? mechanism.entry.entryPoint
      : lead
        ? `The recorded control condition is engaged through ${consequenceClause(lead.title).replace(/\.$/, '')}.`
        : `An ordinary process, system, person or third-party interaction relevant to ${stableUnique(ordered.map((finding) => finding.domainName)).join(', ')}.`,
    linkedControlWeaknesses: resilience ? [] : ordered.map((finding) => finding.title),
    fraudSequence: resilience
      ? `Test whether the self-reported controls would prevent, detect and respond if ${risk.riskEvent}. This is a resilience exercise, not a claim that the control failed.`
      : [
        `A threat actor exploits the recorded control condition so that ${risk.riskEvent}.`,
        `Misuse can occur when an actor exploits the recorded control condition and ${risk.riskEvent}.`,
        `An unauthorised actor uses the recorded control condition to create a pathway where ${risk.riskEvent}.`
      ][stableToken(`${risk.id}|${suffix || 'primary'}`).charCodeAt(0) % 3],
    controlsExpected: stableUnique(ordered.map((finding) => finding.expectedControlStandard)),
    concealmentMechanism: resilience
      ? 'The exercise tests whether apparently legitimate activity would be distinguished from misuse through retained operating evidence.'
      : 'The activity may appear routine until complete population review, independent approval or exception monitoring exposes it.',
    whyControlsMayNotCatchIt: resilience
      ? 'The controls are self-reported as operating but have not been independently validated with the required population and evidence.'
      : ordered.map((finding) => `${finding.domainName}: ${consequenceClause(finding.responseMeaning)}`).join('; '),
    earlyWarningIndicators: stableUnique([
      ...ordered.map((finding) => finding.escalationThreshold),
      'An exception, access, approval or incident record that cannot be reconciled to the complete in-scope population.'
    ]),
    likelyImpact: stableUnique([risk.financialImpact, risk.operationalImpact, risk.legalRegulatoryImpact ?? '', risk.reputationalImpact ?? '']),
    financialImpact: risk.financialImpact,
    operationalImpact: risk.operationalImpact,
    immediateContainment: resilience
      ? `Select a current complete population and independently test whether "${lead.questionPrompt.replace(/\.$/, '')}" holds against its minimum evidence characteristics.`
      : `Escalate to ${lead.accountableOwner}, preserve relevant records and apply the control's escalation threshold: ${lead.escalationThreshold}`,
    longerTermResponse: lead.recommendedControl,
    linkedFindingIds: stableUnique(ordered.map((finding) => finding.id)),
    linkedQuestionCodes: stableUnique(ordered.map((finding) => finding.questionCode)),
    linkedRiskIds: [risk.id],
    linkedRiskId: risk.id,
    evidenceRefs,
    disclaimer: resilience ? ASSURANCE_DISCLAIMER : GAP_DISCLAIMER
  };
}

export function buildPlausibleScenarios(
  _data: AssembledReportData,
  findings: MaterialFinding[],
  risks: RiskRegisterEntry[]
): PlausibleScenario[] {
  const weakAssessment = findings.some((finding) => finding.materialityClass !== 'assurance_priority');
  const eligibleRisks = [...risks].filter((risk) => {
    const linked = findings.filter((finding) => risk.linkedFindingIds.includes(finding.id));
    return linked.length > 0 && (weakAssessment
      ? linked.some((finding) => finding.materialityClass !== 'assurance_priority')
      : linked.every((finding) => finding.materialityClass === 'assurance_priority'));
  }).sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority) || a.id.localeCompare(b.id));

  const minimum = weakAssessment ? 3 : 2;
  const maximum = weakAssessment ? 5 : 3;
  const scenarios = eligibleRisks.slice(0, maximum).map((risk) =>
    scenarioForRisk(risk, findings.filter((finding) => risk.linkedFindingIds.includes(finding.id)))
  );

  if (scenarios.length < minimum) {
    const represented = new Set(scenarios.flatMap((scenario) => scenario.linkedFindingIds));
    const topUps = [...findings]
      .filter((finding) => !represented.has(finding.id))
      .filter((finding) => weakAssessment ? finding.materialityClass !== 'assurance_priority' : finding.materialityClass === 'assurance_priority')
      .sort((a, b) => b.materialityScore - a.materialityScore || a.questionCode.localeCompare(b.questionCode));
    for (const finding of topUps) {
      if (scenarios.length >= minimum) break;
      const risk = risks.find((item) => item.linkedFindingIds.includes(finding.id));
      if (risk) scenarios.push(scenarioForRisk(risk, [finding], finding.questionCode));
    }
  }

  return scenarios.sort((a, b) => a.id.localeCompare(b.id));
}
