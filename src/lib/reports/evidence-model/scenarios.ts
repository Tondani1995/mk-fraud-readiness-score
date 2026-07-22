import type { AssembledReportData } from '../types';
import { stableToken, stableUnique } from './deterministic';
import type { MaterialFinding, PlausibleScenario, RiskRegisterEntry, ScenarioBasis } from './types';

const GAP_DISCLAIMER = "This is a plausible scenario derived from the organisation's self-assessment evidence. It is not an allegation that the event has occurred.";
const ASSURANCE_DISCLAIMER = "This is a plausible assurance-validation scenario derived from the organisation's self-assessment evidence. It tests resilience, is not an allegation, and does not assert that a control weakness or event exists.";

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
  return {
    id: `SC-${stableToken(`${risk.id}|${suffix || 'primary'}`)}`,
    scenarioType,
    scenarioBasis: basis,
    title: resilience ? `Resilience validation: ${risk.title}` : risk.title,
    confirmedOperatingContext: ordered.map((finding) => `${finding.questionCode}: ${finding.responseMeaning}; self-assessed, not independently verified.`),
    entryPoint: `An ordinary process, system, person or third-party interaction relevant to ${risk.affectedDomains.join(', ')}.`,
    linkedControlWeaknesses: resilience ? [] : ordered.map((finding) => finding.title),
    fraudSequence: resilience
      ? `Test whether the self-reported controls would prevent, detect and respond if ${risk.riskEvent}. This is a resilience exercise, not a claim that the control failed.`
      : `An actor exploits the recorded control condition so that ${risk.riskEvent}.`,
    controlsExpected: stableUnique(ordered.map((finding) => finding.expectedControlStandard)),
    concealmentMechanism: resilience
      ? 'The exercise tests whether apparently legitimate activity would be distinguished from misuse through retained operating evidence.'
      : 'The activity may appear routine until complete population review, independent approval or exception monitoring exposes it.',
    whyControlsMayNotCatchIt: resilience
      ? 'The controls are self-reported as operating but have not been independently validated with the required population and evidence.'
      : ordered.map((finding) => `${finding.questionCode}: ${finding.responseMeaning}`).join('; '),
    earlyWarningIndicators: stableUnique([
      ...ordered.map((finding) => finding.escalationThreshold),
      'An exception, access, approval or incident record that cannot be reconciled to the complete in-scope population.'
    ]),
    likelyImpact: stableUnique([risk.financialImpact, risk.operationalImpact, risk.legalRegulatoryImpact ?? '', risk.reputationalImpact ?? '']),
    financialImpact: risk.financialImpact,
    operationalImpact: risk.operationalImpact,
    immediateContainment: resilience
      ? `Select a current complete population and independently test ${lead.questionCode} against its minimum evidence characteristics.`
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
