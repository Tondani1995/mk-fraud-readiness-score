import type { AssembledReportData, RoadmapItem } from './types';

const OWNER_BY_DOMAIN: Record<string, string> = {
  'Fraud Leadership and Governance': 'Executive sponsor / CEO',
  'Fraud Risk Identification': 'Risk owner / Operations lead',
  'Operational Fraud Controls': 'COO / process owner',
  'Fraud Detection Capability': 'Fraud analytics / monitoring owner',
  'Fraud Incident Response': 'Incident response lead',
  'Whistleblowing and Reporting Culture': 'Ethics / HR / Compliance lead',
  'Third-Party and Supply Chain Fraud Risk': 'Procurement / vendor-risk owner',
  'Digital and Identity Fraud Risk': 'Digital product / identity-control owner',
  'Fraud Culture and Awareness': 'People / training lead',
  'Continuous Improvement and Fraud Risk Monitoring': 'Risk governance owner'
};

function ownerFor(domainName: string) {
  return OWNER_BY_DOMAIN[domainName] ?? 'Executive sponsor';
}

function priorityForScore(score: number | null) {
  if (score === null) return 95;
  if (score < 40) return 90;
  if (score < 65) return 75;
  if (score < 80) return 50;
  return 25;
}

function defaultActions(domainName: string) {
  return {
    action30: `Confirm ownership, current control evidence and the most material gap in ${domainName}.`,
    action60: `Implement or tighten the minimum repeatable control set for ${domainName}.`,
    action90: `Test whether the improved ${domainName} controls work consistently under realistic operating pressure.`
  };
}

export function selectRoadmap(data: AssembledReportData) {
  const items: RoadmapItem[] = [];

  for (const gap of data.criticalMajorGaps) {
    items.push({
      ruleCode: gap.isCriticalGap ? 'maturity-cap-gap' : 'major-gap',
      domainCode: gap.domainCode,
      domainName: gap.domainName,
      ownerRole: ownerFor(gap.domainName),
      rationale: gap.isCriticalGap
        ? 'This item is prioritised first because it affects the overall readiness band, not just the local domain score.'
        : 'This item is prioritised because it represents a material weakness in a live fraud-control area.',
      severity: gap.isCriticalGap ? 'Maturity cap' : 'Major gap',
      ...defaultActions(gap.domainName),
      priorityScore: gap.isCriticalGap ? 120 : 100
    });
  }

  for (const domain of data.domainResults) {
    if (items.some((item) => item.domainName === domain.domainName)) continue;
    const priorityScore = priorityForScore(domain.rawScore);
    if (priorityScore < 50) continue;
    items.push({
      ruleCode: 'domain-score-priority',
      domainCode: domain.domainCode,
      domainName: domain.domainName,
      ownerRole: ownerFor(domain.domainName),
      rationale: 'This domain is prioritised because the score indicates a gap between current practice and a repeatable fraud-control system.',
      severity: domain.rawScore !== null && domain.rawScore < 40 ? 'Critical priority' : 'Priority',
      ...defaultActions(domain.domainName),
      priorityScore
    });
  }

  const ranked = items.sort((a, b) => b.priorityScore - a.priorityScore).slice(0, 4);
  return {
    thirtyDay: ranked,
    sixtyDay: ranked,
    ninetyDay: ranked
  };
}
