import type { AssembledReportData } from '../types';
import type { FunctionalAgendaItem, LeadershipDecision, MaterialFinding, RiskRegisterEntry, RoadmapAction } from './types';

const FUNCTION_BY_DOMAIN: Record<string, string[]> = {
  D1: ['CEO / Managing Director', 'Internal Audit'],
  D2: ['Head of Risk'],
  D3: ['COO', 'Operations'],
  D4: ['Head of Risk', 'Internal Audit'],
  D5: ['Legal / Compliance', 'Fraud / Investigations'],
  D6: ['HR / People', 'Legal / Compliance'],
  D7: ['CFO', 'Procurement'],
  D8: ['Technology / Information Security'],
  D9: ['HR / People'],
  D10: ['Head of Risk', 'Internal Audit']
};

function daysFromNow(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function buildLeadershipDecisions(findings: MaterialFinding[], riskRegister: RiskRegisterEntry[]): LeadershipDecision[] {
  const priorityFindings = findings
    .filter((f) => f.materialityClass !== 'assurance_priority' && (f.isHardGate || f.maturityCapStatus === 'capping' || f.isCriticalControl))
    .slice(0, 6);

  return priorityFindings.map((finding, index) => {
    const risk = riskRegister.find((r) => r.linkedFindingIds.includes(finding.id));
    return {
      id: `LD-${String(index + 1).padStart(2, '0')}`,
      decisionRequired: `Approve and fund the control design for: ${finding.title}`,
      evidenceDrivingIt: `Assessment response "${finding.responseMeaning}" on "${finding.questionPrompt}" (${finding.gapClassification} gap${finding.maturityCapStatus === 'capping' ? ', currently limiting the overall maturity reading' : ''}).`,
      whyNow: finding.isHardGate
        ? 'This is a hard-gate critical control: it is actively limiting how the overall readiness result can be interpreted until resolved.'
        : 'This is a critical control weighted heavily enough in this methodology to warrant early leadership attention.',
      recommendedDecision: finding.recommendedControl,
      accountableExecutive: finding.accountableOwner,
      deadline: daysFromNow(finding.targetPeriod === '30 days' ? 30 : finding.targetPeriod === '60 days' ? 60 : 90),
      consequenceOfDelay: `${finding.likelyFinancialImpact} ${finding.likelyOperationalImpact}`.trim(),
      immediateNextDeliverable: `Assign ${finding.processOwner || finding.accountableOwner} to produce: ${finding.evidenceToRequest[0] ?? 'the first piece of required evidence'}.`
    } satisfies LeadershipDecision;
  }).concat(
    riskRegister.length > 0
      ? [{
          id: `LD-${String(priorityFindings.length + 1).padStart(2, '0')}`,
          decisionRequired: 'Assign an accountable owner to maintain the fraud-readiness risk register and control-improvement register produced by this report',
          evidenceDrivingIt: `${riskRegister.length} risk-register entries were generated from this assessment; none currently have a standing owner beyond this report.`,
          whyNow: 'Without a named owner, register entries risk becoming a one-off document rather than a live management tool.',
          recommendedDecision: 'Name a single accountable owner (typically Head of Risk or equivalent) to maintain both registers and report progress at the existing governance cadence.',
          accountableExecutive: 'CEO / Managing Director',
          deadline: daysFromNow(30),
          consequenceOfDelay: 'Findings from this report lose momentum and the assessment becomes a point-in-time exercise rather than an ongoing control programme.',
          immediateNextDeliverable: 'Confirmed owner name and first review date on the calendar.'
        }]
      : []
  );
}

export function buildFunctionalAgenda(findings: MaterialFinding[], riskRegister: RiskRegisterEntry[]): FunctionalAgendaItem[] {
  const items: FunctionalAgendaItem[] = [];
  const seenPerFunction = new Set<string>();
  for (const finding of findings) {
    const functions = FUNCTION_BY_DOMAIN[finding.domainCode] ?? [];
    const risk = riskRegister.find((r) => r.linkedFindingIds.includes(finding.id));
    for (const fn of functions) {
      const key = `${fn}::${finding.domainCode}`;
      if (seenPerFunction.has(key)) continue;
      seenPerFunction.add(key);
      items.push({
        function: fn,
        question: `On "${finding.questionPrompt}" (assessed as ${finding.responseMeaning}): what would it take to move this to fully in place, and who owns that by ${finding.targetPeriod === '30 days' ? 'the next 30 days' : finding.targetPeriod === '60 days' ? 'the next 60 days' : 'the next quarter'}?`,
        linkedFindingId: finding.id,
        linkedRiskId: risk?.id ?? null
      });
    }
  }
  return items;
}

export function buildRoadmapActions(findings: MaterialFinding[], riskRegister: RiskRegisterEntry[]): RoadmapAction[] {
  return findings.map((finding, index) => {
    const risk = riskRegister.find((r) => r.linkedFindingIds.includes(finding.id));
    return {
      id: `RA-${String(index + 1).padStart(2, '0')}`,
      period: finding.targetPeriod,
      deliverable: finding.recommendedControl,
      accountableOwner: finding.processOwner || finding.accountableOwner,
      linkedFindingId: finding.id,
      linkedRiskId: risk?.id ?? '',
      dependency: finding.isHardGate ? 'None blocking -- should be sequenced first given its effect on the maturity reading.' : 'May depend on completion of higher-priority hard-gate actions in the same period.',
      implementationDifficulty: finding.implementationDifficulty,
      successMeasure: finding.effectivenessMeasure,
      evidenceOfCompletion: finding.evidenceToRequest.join('; ')
    } satisfies RoadmapAction;
  });
}
