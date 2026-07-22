import { earliestPeriod, periodDays, stableUnique } from './deterministic';
import type {
  FunctionalAgendaItem,
  LeadershipDecision,
  LeadershipDecisionCategory,
  MaterialFinding,
  RiskRegisterEntry,
  RoadmapAction
} from './types';

const DECISION_ORDER: LeadershipDecisionCategory[] = [
  'accountable_executive_mandate',
  'risk_acceptance_or_remediation',
  'control_design_standard',
  'funding_resource_allocation',
  'independent_validation',
  'sequencing_dependency',
  'external_specialist_support',
  'governance_reporting_cadence'
];

interface DecisionText {
  decisionRequired: string;
  whyNow: string;
  recommendedDecision: string;
  consequenceOfDelay: string;
  immediateNextDeliverable: string;
}

function makeDecision(
  category: LeadershipDecisionCategory,
  findings: MaterialFinding[],
  risks: RiskRegisterEntry[],
  text: DecisionText
): LeadershipDecision | null {
  if (findings.length === 0 && risks.length === 0) return null;
  const lead = [...findings].sort((a, b) => b.materialityScore - a.materialityScore || a.questionCode.localeCompare(b.questionCode))[0];
  const linkedFindingIds = stableUnique(findings.map((finding) => finding.id));
  const linkedRiskIds = stableUnique(risks.map((risk) => risk.id));
  const evidenceRefs = stableUnique([
    ...findings.flatMap((finding) => ['finding:' + finding.id, 'question:' + finding.questionCode]),
    ...risks.map((risk) => 'risk:' + risk.id)
  ]);
  const targetPeriod = earliestPeriod(findings.map((finding) => finding.targetPeriod));
  return {
    id: 'DEC-' + category.toUpperCase().replace(/_/g, '-'),
    decisionCategory: category,
    decisionRequired: text.decisionRequired,
    evidenceDrivingIt: String(findings.length) + ' linked finding(s) and ' + String(risks.length) + ' consolidated risk(s) drive this decision.',
    whyNow: text.whyNow,
    recommendedDecision: text.recommendedDecision,
    accountableExecutive: lead?.accountableOwner ?? 'CEO / Managing Director',
    implementationOwner: lead?.processOwner ?? 'Head of Risk',
    oversightFunction: lead?.oversightFunction ?? 'Board / Audit Committee',
    targetPeriod,
    deadline: targetPeriod,
    consequenceOfDelay: text.consequenceOfDelay,
    immediateNextDeliverable: text.immediateNextDeliverable,
    linkedFindingIds,
    linkedRiskIds,
    evidenceRefs
  };
}

function risksFor(findings: MaterialFinding[], risks: RiskRegisterEntry[]) {
  const ids = new Set(findings.map((finding) => finding.id));
  return risks.filter((risk) => risk.linkedFindingIds.some((id) => ids.has(id)));
}

export function buildLeadershipDecisions(findings: MaterialFinding[], risks: RiskRegisterEntry[]): LeadershipDecision[] {
  const ordered = [...findings].sort((a, b) => b.materialityScore - a.materialityScore || a.questionCode.localeCompare(b.questionCode));
  const gaps = ordered.filter((finding) => finding.materialityClass !== 'assurance_priority');
  const assurance = ordered.filter((finding) => finding.materialityClass === 'assurance_priority');
  const highRisks = risks.filter((risk) => risk.priority === 'Critical' || risk.priority === 'High');
  const candidates: Array<LeadershipDecision | null> = [];

  if (gaps.length === 0) {
    candidates.push(makeDecision('independent_validation', assurance, risks, {
      decisionRequired: 'Approve independent validation of the strongest self-reported control claims.',
      whyNow: 'A clean assessment remains decision-useful only if leadership verifies operation across the complete population.',
      recommendedDecision: 'Commission a risk-based operating-effectiveness review using the evidence checklist.',
      consequenceOfDelay: 'The clean result remains an unverified assertion and may create false comfort.',
      immediateNextDeliverable: 'Approved assurance scope, complete population definition and evidence-request list.'
    }));
  } else {
    const mandate = gaps.filter((finding) => finding.domainCode === 'D1' || finding.isHardGate || finding.maturityCapStatus === 'capping');
    candidates.push(makeDecision('accountable_executive_mandate', mandate, risksFor(mandate, risks), {
      decisionRequired: 'Approve accountable executive mandates and escalation authority for priority remediation.',
      whyNow: 'Hard-gate, governance and maturity-limiting controls require authority to allocate resources and resolve blockers.',
      recommendedDecision: 'Name one accountable executive per linked control and approve a 30-day escalation route.',
      consequenceOfDelay: 'Priority controls remain ownerless or blocked and the maturity reading remains constrained.',
      immediateNextDeliverable: 'Signed mandate with decision rights, owners and escalation cadence.'
    }));
    const riskFindings = gaps.filter((finding) => highRisks.some((risk) => risk.linkedFindingIds.includes(finding.id)));
    candidates.push(makeDecision('risk_acceptance_or_remediation', riskFindings, highRisks, {
      decisionRequired: 'Choose and record remediation rather than passive acceptance for Critical and High risks.',
      whyNow: 'Plausible consequence pathways require an explicit leadership treatment decision.',
      recommendedDecision: 'Approve linked treatments; any temporary acceptance must name an owner, expiry and compensating control.',
      consequenceOfDelay: 'Known risk pathways remain untreated without a documented acceptance basis.',
      immediateNextDeliverable: 'Signed treatment decision for every Critical and High risk.'
    }));
    candidates.push(makeDecision('control_design_standard', gaps, risks, {
      decisionRequired: 'Approve exact question-level control designs as the minimum implementation standard.',
      whyNow: 'Functions need one design baseline rather than independent interpretations of the findings.',
      recommendedDecision: 'Adopt the control-improvement register; deviations require documented oversight approval.',
      consequenceOfDelay: 'Partial or inconsistent designs fail to address the causal pathway.',
      immediateNextDeliverable: 'Approved design baseline and named implementation owners.'
    }));
    const resource = gaps.filter((finding) => finding.implementationDifficulty === 'High');
    candidates.push(makeDecision('funding_resource_allocation', resource, risksFor(resource, risks), {
      decisionRequired: 'Approve specialist capacity and resources for high-difficulty controls.',
      whyNow: 'High-difficulty controls cannot meet target periods without committed capacity.',
      recommendedDecision: 'Fund the named supporting functions and require a resource-confirmed delivery plan.',
      consequenceOfDelay: 'The highest-complexity gaps remain open despite nominal approval.',
      immediateNextDeliverable: 'Resource plan showing accountable people, capacity and approved spend.'
    }));
    const dependent = gaps.filter((finding) => finding.dependencies.length > 0);
    candidates.push(makeDecision('sequencing_dependency', dependent, risksFor(dependent, risks), {
      decisionRequired: 'Approve prerequisite-first sequencing for dependent improvements.',
      whyNow: 'Dependent controls cannot operate reliably before prerequisite ownership, data or processes exist.',
      recommendedDecision: 'Use authoritative roadmap dependency IDs and escalate threatened prerequisites.',
      consequenceOfDelay: 'Downstream controls are implemented on incomplete foundations.',
      immediateNextDeliverable: 'Dependency-confirmed delivery sequence with escalation owners.'
    }));
  }

  const cadenceFindings = assurance.length > 0 ? assurance : ordered.slice(0, Math.min(3, ordered.length));
  candidates.push(makeDecision('governance_reporting_cadence', cadenceFindings, risksFor(cadenceFindings, risks), {
    decisionRequired: 'Approve a fixed governance cadence for evidence validation and overdue escalation.',
    whyNow: 'The linked registers require continuing governance to become a managed programme.',
    recommendedDecision: 'Require monthly implementation reporting and quarterly independent evidence review.',
    consequenceOfDelay: 'Actions lose momentum and self-reported claims remain unverified.',
    immediateNextDeliverable: 'First governance-pack date, owner and required evidence fields.'
  }));

  const unique = new Map<string, LeadershipDecision>();
  for (const item of candidates.filter((value): value is LeadershipDecision => Boolean(value))) {
    const key = item.decisionCategory + '|' + item.evidenceRefs.join('|');
    if (!unique.has(key)) unique.set(key, item);
  }
  return [...unique.values()]
    .sort((a, b) => DECISION_ORDER.indexOf(a.decisionCategory) - DECISION_ORDER.indexOf(b.decisionCategory) || a.id.localeCompare(b.id))
    .slice(0, 6);
}

export function buildFunctionalAgenda(findings: MaterialFinding[], risks: RiskRegisterEntry[]): FunctionalAgendaItem[] {
  const items: FunctionalAgendaItem[] = [];
  const seen = new Set<string>();
  const ordered = [...findings].sort((a, b) => b.materialityScore - a.materialityScore || a.questionCode.localeCompare(b.questionCode));
  for (const finding of ordered) {
    const risk = risks.find((item) => item.linkedFindingIds.includes(finding.id));
    const assurance = finding.materialityClass === 'assurance_priority';
    const roles = [
      { kind: 'ACCOUNTABILITY', fn: finding.accountableOwner, question: assurance ? 'What complete operating evidence will you accept to validate ' + finding.questionCode + ' without treating self-assessment as assurance?' : 'Will you mandate and resource remediation of ' + finding.questionCode + ' by ' + finding.targetPeriod + ', and what delay threshold will you escalate?' },
      { kind: 'OPERATION', fn: finding.processOwner || finding.accountableOwner, question: assurance ? 'Can you reconcile the complete population and demonstrate that ' + finding.questionCode + ' operated at the stated frequency?' : 'Who will deliver the exact design for ' + finding.questionCode + ', retain the evidence and prove effectiveness?' },
      { kind: 'OVERSIGHT', fn: finding.oversightFunction, question: assurance ? 'How will you independently test ' + finding.questionCode + ' rather than rely on management self-report?' : 'How will you challenge remediation evidence for ' + finding.questionCode + ' and report exceptions independently?' }
    ];
    for (const role of roles) {
      if (!role.fn) continue;
      const key = role.fn + '|' + finding.domainCode + '|' + role.kind;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({
        id: 'AGENDA-' + finding.questionCode + '-' + role.kind,
        function: role.fn,
        question: role.question,
        linkedFindingId: finding.id,
        linkedRiskId: risk?.id ?? null,
        evidenceRefs: stableUnique(['finding:' + finding.id, 'question:' + finding.questionCode, ...(risk ? ['risk:' + risk.id] : [])])
      });
    }
  }
  return items.sort((a, b) => a.function.localeCompare(b.function) || a.id.localeCompare(b.id));
}

const QUESTION_DEPENDENCIES: Record<string, string[]> = {
  'D5-Q05': ['D5-Q01'],
  'D7-Q04': ['D7-Q01'],
  'D8-Q04': ['D3-Q04']
};

export function buildRoadmapActions(findings: MaterialFinding[], risks: RiskRegisterEntry[]): RoadmapAction[] {
  const actionByQuestion = new Map(findings.map((finding) => [finding.questionCode, 'RA-' + finding.questionCode]));
  const actions = findings.map((finding) => {
    const linkedRisks = risks.filter((risk) => risk.linkedFindingIds.includes(finding.id));
    const linkedRiskIds = stableUnique(linkedRisks.map((risk) => risk.id));
    const dependencyIds = stableUnique((QUESTION_DEPENDENCIES[finding.questionCode] ?? []).map((code) => actionByQuestion.get(code) ?? '').filter(Boolean));
    const assurance = finding.materialityClass === 'assurance_priority';
    const deliverable = assurance
      ? 'Independently validate ' + finding.questionCode + ' across the complete population and record whether every minimum evidence characteristic is met.'
      : 'Apply immediate escalation at "' + finding.escalationThreshold + '" and deliver the exact control design: ' + finding.recommendedControl;
    return {
      id: 'RA-' + finding.questionCode,
      period: finding.targetPeriod,
      domainCode: finding.domainCode,
      domainName: finding.domainName,
      deliverable,
      accountableExecutive: finding.accountableOwner,
      processOwner: finding.processOwner || finding.accountableOwner,
      oversightFunction: finding.oversightFunction,
      supportingFunctions: stableUnique(finding.supportingFunctions),
      linkedFindingIds: [finding.id],
      linkedRiskIds,
      dependencyIds,
      implementationDifficulty: finding.implementationDifficulty,
      successMeasure: finding.effectivenessMeasure,
      evidenceOfCompletion: stableUnique(finding.evidenceToRequest).join('; '),
      escalationThreshold: finding.escalationThreshold,
      evidenceRefs: stableUnique(['finding:' + finding.id, 'question:' + finding.questionCode, ...linkedRiskIds.map((id) => 'risk:' + id)]),
      accountableOwner: finding.processOwner || finding.accountableOwner,
      linkedFindingId: finding.id,
      linkedRiskId: linkedRiskIds[0] ?? '',
      dependency: dependencyIds.join('; ') || 'None'
    } satisfies RoadmapAction;
  });

  const urgency = (action: RoadmapAction) => {
    const finding = findings.find((item) => item.id === action.linkedFindingId);
    return (finding?.isHardGate ? 10000 : 0) + (finding?.maturityCapStatus === 'capping' ? 5000 : 0) + (100 - periodDays(action.period)) + (finding?.materialityScore ?? 0);
  };
  const remaining = [...actions];
  const ordered: RoadmapAction[] = [];
  while (remaining.length > 0) {
    const completed = new Set(ordered.map((action) => action.id));
    const ready = remaining.filter((action) => action.dependencyIds.every((id) => completed.has(id)));
    const pool = ready.length > 0 ? ready : remaining;
    pool.sort((a, b) => urgency(b) - urgency(a) || a.id.localeCompare(b.id));
    const next = pool[0];
    ordered.push(next);
    remaining.splice(remaining.findIndex((action) => action.id === next.id), 1);
  }
  return ordered;
}
