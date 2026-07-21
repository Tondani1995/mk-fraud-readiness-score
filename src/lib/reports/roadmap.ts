import type { AssembledReportData, DomainResultRecord, RoadmapItem } from './types';

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

function priorityFor(domain: DomainResultRecord, cappedDomainCodes: Set<string>, gapCounts: Map<string, number>) {
  const score = domain.rawScore ?? 0;
  const scorePressure = 100 - score;
  const weightedPressure = Number(domain.weightPct || 1) * scorePressure;
  const gapBoost = (gapCounts.get(domain.domainCode) ?? 0) * 35;
  const capBoost = cappedDomainCodes.has(domain.domainCode) ? 10000 : 0;
  return capBoost + weightedPressure + gapBoost;
}

function severityFor(domain: DomainResultRecord, isCapped: boolean, hasGap: boolean) {
  if (isCapped) return 'Maturity-limiting priority';
  if (hasGap) return 'Priority gap';
  if (domain.rawScore === null || domain.rawScore < 40) return 'Critical priority';
  if (domain.rawScore < 65) return 'Improvement priority';
  if (domain.rawScore < 80) return 'Strengthening priority';
  return 'Protect and test';
}

function rationaleFor(domain: DomainResultRecord, isCapped: boolean, hasGap: boolean) {
  if (isCapped) {
    return `Sequenced first because ${domain.domainName} contains a control issue that changes how the whole readiness result should be interpreted.`;
  }
  if (hasGap) {
    return 'Prioritised because a specific control weakness in this domain was material enough to be flagged in the persisted score trace.';
  }
  if (domain.rawScore === null || domain.rawScore < 40) {
    return `${domain.domainName} is scoring low enough to represent active exposure rather than a longer-term improvement item.`;
  }
  if (domain.rawScore < 65) {
    return `${domain.domainName} has useful pieces in place, but they are not yet operating as a repeatable control system.`;
  }
  if (domain.rawScore < 80) {
    return `${domain.domainName} is functioning, so the work is evidence, consistency and pressure-testing rather than basic build-out.`;
  }
  return `${domain.domainName} is a strength worth actively protecting rather than assuming it will hold under change.`;
}

function defaultActions(domainName: string) {
  return {
    action30: `Confirm ownership, current evidence and the highest-risk gap in ${domainName}.`,
    action60: `Implement or tighten the minimum repeatable control rhythm for ${domainName}.`,
    action90: `Test whether the improved ${domainName} controls work consistently under realistic pressure.`
  };
}

function matchingRule(data: AssembledReportData, domain: DomainResultRecord, isCapped: boolean) {
  if (isCapped) return data.recommendationRules.find((rule) => rule.severity === 'Maturity cap');
  const score = domain.rawScore ?? 0;
  // Match against the rule's parsed numeric band (see parseScoreBand in assemble-report-data.ts)
  // instead of a hardcoded substring needle. The old needles ("40-64", "65-79", "80+") never matched
  // the real stored titles ("40-59", "60-79", ">=80"), so only the <=39 band ever fired in practice.
  return data.recommendationRules.find(
    (rule) => rule.scoreBand !== null && score >= rule.scoreBand.min && score <= rule.scoreBand.max
  );
}

export function selectRoadmap(data: AssembledReportData): { agenda: RoadmapItem[] } {
  const cappedDomainCodes = new Set(
    data.maturityCapEvents.map((event) => event.relatedDomainCode).filter((code): code is string => Boolean(code))
  );
  const gapCounts = new Map<string, number>();
  for (const gap of data.criticalMajorGaps) {
    gapCounts.set(gap.domainCode, (gapCounts.get(gap.domainCode) ?? 0) + 1);
  }

  const ranked = [...data.domainResults]
    .map((domain) => ({
      domain,
      isCapped: cappedDomainCodes.has(domain.domainCode),
      hasGap: gapCounts.has(domain.domainCode),
      priorityScore: priorityFor(domain, cappedDomainCodes, gapCounts)
    }))
    .sort((a, b) => b.priorityScore - a.priorityScore)
    .slice(0, 4);

  const agenda = ranked.map(({ domain, isCapped, hasGap, priorityScore }) => {
    const rule = matchingRule(data, domain, isCapped);
    const defaults = defaultActions(domain.domainName);
    return {
      ruleCode: rule?.ruleCode ?? 'domain-agenda-priority',
      domainCode: domain.domainCode,
      domainName: domain.domainName,
      ownerRole: ownerFor(domain.domainName),
      rationale: rationaleFor(domain, isCapped, hasGap),
      severity: severityFor(domain, isCapped, hasGap),
      action30: rule?.action30 ?? defaults.action30,
      action60: rule?.action60 ?? defaults.action60,
      action90: rule?.action90 ?? defaults.action90,
      priorityScore
    };
  });

  return { agenda };
}
