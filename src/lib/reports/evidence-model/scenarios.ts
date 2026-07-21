import type { AssembledReportData } from '../types';
import type { MaterialFinding, PlausibleScenario } from './types';

const DISCLAIMER =
  "This is a plausible scenario derived from the organisation's self-assessment responses. It is not an allegation that the event has occurred.";

function findingsForDomain(findings: MaterialFinding[], code: string): MaterialFinding[] {
  return findings.filter((f) => f.domainCode === code);
}

function exposureRatio(data: AssembledReportData, factorCode: string): number {
  const answer = data.exposureAnswers.find((a) => a.factorCode === factorCode);
  if (!answer || answer.maxPoints <= 0) return 0;
  return answer.pointsAwarded / answer.maxPoints;
}

function exposureLabel(data: AssembledReportData, factorCode: string): string | null {
  return data.exposureAnswers.find((a) => a.factorCode === factorCode)?.name ?? null;
}

interface ScenarioBuilder {
  id: string;
  applies: (data: AssembledReportData, findings: MaterialFinding[]) => boolean;
  build: (data: AssembledReportData, findings: MaterialFinding[]) => Omit<PlausibleScenario, 'id' | 'disclaimer' | 'linkedRiskId'>;
}

const BUILDERS: ScenarioBuilder[] = [
  {
    id: 'supplier-payment-fraud',
    applies: (data, findings) => findingsForDomain(findings, 'D7').length > 0 && exposureRatio(data, 'EXP-02') >= 0.5,
    build: (data, findings) => {
      const d7 = findingsForDomain(findings, 'D7');
      return {
        title: 'Supplier or vendor payment redirected via impersonation or an unverified bank-detail change',
        confirmedOperatingContext: [
          `Third-party/supplier dependency rated "${exposureLabel(data, 'EXP-02')}"`,
          ...d7.map((f) => `${f.questionPrompt} -- ${f.responseMeaning}`)
        ],
        entryPoint: 'Supplier onboarding or an in-flight payment run',
        linkedControlWeaknesses: d7.map((f) => f.title),
        fraudSequence:
          'An impersonator (or a compromised supplier account) submits a bank-detail change or invoices as a legitimate or fraudulently onboarded supplier. Without independent due diligence at onboarding and without callback verification of bank-detail changes, the change or invoice is accepted and paid.',
        concealmentMechanism:
          'The payment looks like routine supplier activity in the accounting system; without a monthly exception report to a function outside the payment team, there is no independent trigger to notice the pattern.',
        whyControlsMayNotCatchIt: d7.map((f) => `${f.questionPrompt}: ${f.responseMeaning}`).join('; '),
        earlyWarningIndicators: [
          'A bank-detail change request arriving outside the supplier\'s normal communication channel',
          'Urgency or pressure attached to a payment or detail-change request',
          'A new supplier with limited verifiable trading history being fast-tracked'
        ],
        likelyImpact: ['Direct financial loss', 'Supplier relationship dispute', 'Operational disruption while the error is unwound'],
        immediateContainment: 'Freeze further payments to the affected supplier account, notify the bank, and preserve all related correspondence and system logs before anything is altered.',
        longerTermResponse: 'Implement the D7 control design: due-diligence checklist at onboarding and callback-verified bank-detail changes, evidenced in the payment file, with monthly exception reporting to the CFO.',
        linkedFindingIds: d7.map((f) => f.id)
      };
    }
  },
  {
    id: 'privileged-access-exploitation',
    applies: (data, findings) =>
      (findingsForDomain(findings, 'D3').some((f) => f.isHardGate) || findingsForDomain(findings, 'D8').some((f) => f.isHardGate)) &&
      (exposureRatio(data, 'EXP-01') >= 0.5 || exposureRatio(data, 'EXP-07') >= 0.5),
    build: (data, findings) => {
      const linked = [...findingsForDomain(findings, 'D3'), ...findingsForDomain(findings, 'D8')].filter((f) => f.isHardGate || f.isCriticalControl);
      return {
        title: 'Excess system or digital access is used to manipulate records or payments undetected',
        confirmedOperatingContext: [
          exposureRatio(data, 'EXP-01') >= 0.5 ? `High-risk process footprint rated "${exposureLabel(data, 'EXP-01')}"` : null,
          exposureRatio(data, 'EXP-07') >= 0.5 ? `Manual intervention / exception volume rated "${exposureLabel(data, 'EXP-07')}"` : null,
          ...linked.map((f) => `${f.questionPrompt} -- ${f.responseMeaning}`)
        ].filter((x): x is string => Boolean(x)),
        entryPoint: 'A user or system account with access beyond current role requirements',
        linkedControlWeaknesses: linked.map((f) => f.title),
        fraudSequence:
          'A user (internal, or an external party using a compromised credential) retains system or data access beyond what their current role requires. Combined with manual override or exception-handling capability, that access is used to create, adjust or approve a transaction that would not withstand a properly-scoped review.',
        concealmentMechanism:
          'Without a fixed-cycle, independent access review, excess access is not itself a visible anomaly -- it only becomes visible if the resulting transaction is separately flagged, which manual/exception-heavy environments make less likely.',
        whyControlsMayNotCatchIt: linked.map((f) => `${f.questionPrompt}: ${f.responseMeaning}`).join('; '),
        earlyWarningIndicators: [
          'An account with privileged access outside its documented business justification',
          'A transaction pattern that only makes sense with system-level access',
          'Access not revoked promptly after a role change or exit'
        ],
        likelyImpact: ['Direct financial loss or record manipulation', 'Loss of data integrity', 'Extended detection time'],
        immediateContainment: 'Suspend the specific account\'s access pending review, and preserve access logs before they age out or are overwritten.',
        longerTermResponse: 'Implement the D3/D8 control designs: least-privilege access reviewed on a fixed independent cycle, with revocation SLAs on role change or exit.',
        linkedFindingIds: linked.map((f) => f.id)
      };
    }
  },
  {
    id: 'incident-concealment',
    applies: (data, findings) => findingsForDomain(findings, 'D5').length > 0 || findingsForDomain(findings, 'D6').length > 0,
    build: (data, findings) => {
      const d5 = findingsForDomain(findings, 'D5');
      const d6 = findingsForDomain(findings, 'D6');
      const d1HardGate = findingsForDomain(findings, 'D1').filter((f) => f.isHardGate);
      const linked = [...d5, ...d6, ...d1HardGate];
      return {
        title: 'A suspected fraud is noticed but not reported, or is reported and then mishandled',
        confirmedOperatingContext: linked.map((f) => `${f.questionPrompt} -- ${f.responseMeaning}`),
        entryPoint: 'An employee or manager who notices something irregular',
        linkedControlWeaknesses: linked.map((f) => f.title),
        fraudSequence:
          'Someone inside the organisation notices behaviour consistent with fraud. If the reporting channel is not trusted or well known, the concern is not raised. If it is raised, an underdeveloped incident-response process risks a delayed, inconsistent, or evidence-compromising response.',
        concealmentMechanism:
          'Concealment here is passive rather than active: it is the absence of a reliable reporting and response pathway, not active covering-up, that allows the matter to continue or evidence to be lost.',
        whyControlsMayNotCatchIt: linked.map((f) => `${f.questionPrompt}: ${f.responseMeaning}`).join('; '),
        earlyWarningIndicators: [
          'Informal comments or rumours about irregular activity that never reach a formal channel',
          'A reporting channel with very low or zero recorded usage over an extended period',
          'Inconsistent handling of the few cases that are reported'
        ],
        likelyImpact: ['Extended, compounding financial loss', 'Loss of usable evidence', 'Reputational and morale damage once eventually discovered'],
        immediateContainment: 'If a concern surfaces through any channel, however informal, treat it as a live matter: preserve records immediately and route it to a named accountable person, not a general inbox.',
        longerTermResponse: 'Implement the D5 and D6 control designs: a rehearsed incident-response plan with evidence preservation, and a genuinely trusted, independently operated whistleblowing channel.',
        linkedFindingIds: linked.map((f) => f.id)
      };
    }
  },
  {
    id: 'identity-digital-fraud',
    applies: (data, findings) => findingsForDomain(findings, 'D8').length > 0 && exposureRatio(data, 'EXP-04') >= 0.5,
    build: (data, findings) => {
      const d8 = findingsForDomain(findings, 'D8');
      return {
        title: 'Identity data is misused to gain access, redirect a benefit, or impersonate a legitimate party',
        confirmedOperatingContext: [`Identity and personal-data dependency rated "${exposureLabel(data, 'EXP-04')}"`, ...d8.map((f) => `${f.questionPrompt} -- ${f.responseMeaning}`)],
        entryPoint: 'A digital channel or system holding identity/personal data',
        linkedControlWeaknesses: d8.map((f) => f.title),
        fraudSequence:
          'Given the organisation\'s dependency on identity and personal data, weak restriction or review of who can access that data increases the chance it is used to impersonate a legitimate customer, employee or supplier -- for example to redirect a benefit, approve a change, or gain further access.',
        concealmentMechanism:
          'Identity misuse often looks like a legitimate interaction at the point it occurs; without independently reviewed access controls, there is no secondary check to catch it.',
        whyControlsMayNotCatchIt: d8.map((f) => `${f.questionPrompt}: ${f.responseMeaning}`).join('; '),
        earlyWarningIndicators: ['Unusual pattern of access to identity/personal data outside normal business hours or volume', 'Multiple failed identity-verification attempts followed by a success', 'Customer or staff reports of impersonation'],
        likelyImpact: ['Direct financial loss', 'Data protection / regulatory exposure', 'Loss of stakeholder trust'],
        immediateContainment: 'Restrict access to the affected data/system pending review and notify affected parties per the organisation\'s data-breach process if personal data is involved.',
        longerTermResponse: 'Implement the D8 control design: a privileged-access register with independent, fixed-cycle re-certification.',
        linkedFindingIds: d8.map((f) => f.id)
      };
    }
  },
  {
    id: 'cash-asset-manual-override',
    applies: (data, findings) => findingsForDomain(findings, 'D3').length > 0 && exposureRatio(data, 'EXP-05') >= 0.5 && exposureRatio(data, 'EXP-07') >= 0.5,
    build: (data, findings) => {
      const d3 = findingsForDomain(findings, 'D3');
      return {
        title: 'Manual override capability is used to misappropriate cash, stock or a high-value asset',
        confirmedOperatingContext: [
          `Cash, stock or high-value asset handling rated "${exposureLabel(data, 'EXP-05')}"`,
          `Manual intervention / exception volume rated "${exposureLabel(data, 'EXP-07')}"`,
          ...d3.map((f) => `${f.questionPrompt} -- ${f.responseMeaning}`)
        ],
        entryPoint: 'A manual override, adjustment or exception-handling step in an operational process',
        linkedControlWeaknesses: d3.map((f) => f.title),
        fraudSequence:
          'The combination of severe manual-intervention volume and weak, unreviewed access controls means a manual override or adjustment can be used to misappropriate cash, stock or another high-value asset without a corresponding, independently reviewed authorisation trail.',
        concealmentMechanism:
          'A high volume of legitimate manual exceptions provides cover: a fraudulent override is one entry among many, and without independent review of access and overrides, it is not distinguishable from routine activity.',
        whyControlsMayNotCatchIt: d3.map((f) => `${f.questionPrompt}: ${f.responseMeaning}`).join('; '),
        earlyWarningIndicators: ['A rising rate of manual overrides or exceptions from a single user or location', 'Physical stock or cash counts diverging from system records', 'Overrides concentrated outside normal business hours'],
        likelyImpact: ['Direct financial or inventory loss', 'Distorted management information', 'Erosion of control credibility once discovered'],
        immediateContainment: 'Perform an immediate reconciliation of the affected cash/stock line and restrict override capability to a second, independent approver pending review.',
        longerTermResponse: 'Implement the D3 control design: least-privilege access reviewed on a fixed independent cycle, extended to cover override/exception authority specifically.',
        linkedFindingIds: d3.map((f) => f.id)
      };
    }
  }
];

function genericFallbackScenario(data: AssembledReportData, findings: MaterialFinding[], index: number): Omit<PlausibleScenario, 'id' | 'disclaimer' | 'linkedRiskId'> | null {
  const weakestDomains = [...data.domainResults]
    .filter((d) => d.rawScore !== null)
    .sort((a, b) => (a.rawScore ?? 0) - (b.rawScore ?? 0));
  const domain = weakestDomains[index];
  if (!domain) return null;
  const domainFindings = findings.filter((f) => f.domainCode === domain.domainCode);
  return {
    title: `A control gap in ${domain.domainName.toLowerCase()} is exploited without early detection`,
    confirmedOperatingContext: [`${domain.domainName} scored ${Math.round(domain.rawScore ?? 0)}/100`, ...domainFindings.map((f) => `${f.questionPrompt} -- ${f.responseMeaning}`)],
    entryPoint: `A process or system within ${domain.domainName.toLowerCase()}`,
    linkedControlWeaknesses: domainFindings.map((f) => f.title),
    fraudSequence: `Given the assessed weaknesses in ${domain.domainName.toLowerCase()}, a party with knowledge of the gap could exploit it in the ordinary course of business without triggering an existing control.`,
    concealmentMechanism: 'Without the control improvements identified for this domain, there is no independent mechanism specifically designed to surface this pattern.',
    whyControlsMayNotCatchIt: domainFindings.map((f) => `${f.questionPrompt}: ${f.responseMeaning}`).join('; ') || 'This domain scored low enough overall to represent active exposure rather than a specific isolated gap.',
    earlyWarningIndicators: ['Deviations from expected process in this domain that are not currently monitored'],
    likelyImpact: ['Financial or operational impact proportionate to this domain\'s role in the business'],
    immediateContainment: 'Escalate to the accountable owner named for this domain and review recent activity for anomalies.',
    longerTermResponse: `Implement the control design identified for ${domain.domainName}.`,
    linkedFindingIds: domainFindings.map((f) => f.id)
  };
}

export function buildPlausibleScenarios(data: AssembledReportData, findings: MaterialFinding[]): PlausibleScenario[] {
  const scenarios: PlausibleScenario[] = [];
  let seq = 0;

  for (const builder of BUILDERS) {
    if (builder.applies(data, findings)) {
      const built = builder.build(data, findings);
      scenarios.push({ id: `SC-${String(++seq).padStart(2, '0')}`, disclaimer: DISCLAIMER, linkedRiskId: '', ...built });
    }
  }

  // Section 20 requires at least three scenarios. Top up with domain-specific generic scenarios
  // (weakest domains first) rather than repeating a template, so output stays evidence-linked.
  let fallbackIndex = 0;
  while (scenarios.length < 3) {
    const fallback = genericFallbackScenario(data, findings, fallbackIndex++);
    if (!fallback) break;
    // Skip if this domain is already covered by a triggered template, to avoid near-duplicate scenarios.
    const alreadyCovered = scenarios.some((s) => s.linkedFindingIds.some((id) => fallback.linkedFindingIds.includes(id)));
    if (alreadyCovered && fallback.linkedFindingIds.length > 0) continue;
    scenarios.push({ id: `SC-${String(++seq).padStart(2, '0')}`, disclaimer: DISCLAIMER, linkedRiskId: '', ...fallback });
  }

  return scenarios;
}
