import type { AssembledReportData } from '../types';
import type { Contradiction, ContradictionPattern, MaterialFinding } from './types';

function domainScore(data: AssembledReportData, code: string): number | null {
  return data.domainResults.find((d) => d.domainCode === code)?.rawScore ?? null;
}

function domainName(data: AssembledReportData, code: string): string {
  return data.domainResults.find((d) => d.domainCode === code)?.domainName ?? code;
}

function findingsForDomain(findings: MaterialFinding[], code: string): MaterialFinding[] {
  return findings.filter((f) => f.domainCode === code);
}

const STRUCTURED_THRESHOLD = 65;
const STRONG_EXPOSURE_RATIO = 0.5;

/**
 * Deterministic contradiction rules, evaluated against real domain scores / findings / exposure
 * answers -- not against any single organisation's data specifically, so a materially different
 * assessment (different scores, different exposure answers, different failed controls) produces a
 * materially different contradiction set. See evidence-model/index.ts for how this is wired up, and
 * the second-fixture smoke test for a concrete proof of differentiation.
 */
export function buildContradictions(data: AssembledReportData, findings: MaterialFinding[]): Contradiction[] {
  const contradictions: Contradiction[] = [];
  let seq = 0;
  const nextId = () => `CX-${String(++seq).padStart(2, '0')}`;

  const add = (
    pattern: ContradictionPattern,
    title: string,
    drivingResponses: string,
    whyItMatters: string,
    falseComfortRisk: string,
    whatLeadershipShouldVerify: string,
    fraudPathwayEnabled: string,
    linkedFindingIds: string[]
  ) => {
    contradictions.push({
      id: nextId(),
      pattern,
      title,
      drivingResponses,
      whyItMatters,
      falseComfortRisk,
      whatLeadershipShouldVerify,
      fraudPathwayEnabled,
      linkedFindingIds,
      linkedRiskId: null // linked by index.ts once risk register IDs exist
    });
  };

  // 1. Strong detection, weak incident response.
  const d4 = domainScore(data, 'D4');
  const d5 = domainScore(data, 'D5');
  if (d4 !== null && d5 !== null && d4 >= STRUCTURED_THRESHOLD && d5 < STRUCTURED_THRESHOLD) {
    add(
      'strong_detection_weak_response',
      `Strong detection (${domainName(data, 'D4')}, ${Math.round(d4)}/100) sits alongside a weak incident response capability (${domainName(data, 'D5')}, ${Math.round(d5)}/100)`,
      `${domainName(data, 'D4')} scored ${Math.round(d4)} while ${domainName(data, 'D5')} scored ${Math.round(d5)}.`,
      'Detecting a problem and being able to respond to it well are different capabilities. Strong detection with a weak response process means issues are more likely to be found than to be handled well once found.',
      'Leadership may assume that because fraud would be detected, it would also be handled correctly -- these are separate claims.',
      'Whether the incident response plan has actually been rehearsed, and who is accountable for running it.',
      'A detected incident is mishandled -- evidence lost, escalation delayed, or containment botched -- turning a contained issue into a larger one.',
      findingsForDomain(findings, 'D5').map((f) => f.id)
    );
  }

  // 2. Strong risk identification, weak continuous improvement.
  const d2 = domainScore(data, 'D2');
  const d10 = domainScore(data, 'D10');
  if (d2 !== null && d10 !== null && d2 >= STRUCTURED_THRESHOLD && d10 < STRUCTURED_THRESHOLD) {
    add(
      'strong_identification_weak_improvement',
      `Risks are well identified (${domainName(data, 'D2')}, ${Math.round(d2)}/100) but rarely acted on over time (${domainName(data, 'D10')}, ${Math.round(d10)}/100)`,
      `${domainName(data, 'D2')} scored ${Math.round(d2)} while ${domainName(data, 'D10')} scored ${Math.round(d10)}.`,
      'Identifying a risk without a fixed review cycle to act on it means the risk register can become a list of known-but-unaddressed problems.',
      'A strong risk register can create the appearance of being on top of fraud risk even when little changes as a result of it.',
      'Whether any risk identified in the last cycle actually resulted in a control change.',
      'A known risk sits unaddressed long enough for it to be exploited, with the organisation unable to say it was unaware.',
      findingsForDomain(findings, 'D10').map((f) => f.id)
    );
  }

  // 3. Strong domain average masking a failed critical control, generalised across all domains.
  for (const domain of data.domainResults) {
    if (domain.rawScore === null || domain.rawScore < STRUCTURED_THRESHOLD) continue;
    const domainFindings = findingsForDomain(findings, domain.domainCode).filter((f) => f.isHardGate || f.isCriticalControl);
    if (domainFindings.length === 0) continue;
    add(
      'strong_domain_failed_critical_control',
      `${domain.domainName} scores well overall (${Math.round(domain.rawScore)}/100) but contains a failed critical control`,
      `Domain average of ${Math.round(domain.rawScore)} includes: ${domainFindings.map((f) => `"${f.questionPrompt}" (${f.responseMeaning})`).join('; ')}.`,
      'A domain average is a blend. A strong average can sit on top of one control that this methodology treats as non-negotiable, which strength elsewhere cannot offset.',
      'Leadership reading the domain score alone would reasonably conclude this domain is in good shape.',
      'The specific control(s) named here, independent of the domain score.',
      'The specific weak control is exploited precisely because the domain\'s overall strength creates confidence that nothing there needs a second look.',
      domainFindings.map((f) => f.id)
    );
  }

  // 4. High/severe exposure combined with a material control gap in the linked domain(s).
  const exposureDomainMap: Record<string, string[]> = {
    'EXP-01': ['D3', 'D4'],
    'EXP-02': ['D7'],
    'EXP-03': ['D8'],
    'EXP-04': ['D8', 'D9'],
    'EXP-05': ['D3'],
    'EXP-07': ['D3', 'D4'],
    'EXP-08': ['D5', 'D6']
  };
  for (const answer of data.exposureAnswers) {
    const ratio = answer.maxPoints > 0 ? answer.pointsAwarded / answer.maxPoints : 0;
    if (ratio < STRONG_EXPOSURE_RATIO) continue;
    const linkedDomains = exposureDomainMap[answer.factorCode] ?? [];
    const weakLinked = linkedDomains.filter((code) => findingsForDomain(findings, code).length > 0);
    if (weakLinked.length === 0) continue;
    const linkedIds = weakLinked.flatMap((code) => findingsForDomain(findings, code).map((f) => f.id));
    add(
      'exposure_outpaces_control',
      `${answer.name} is rated "${answer.selectedLabel}" while the control area(s) meant to manage it show material gaps`,
      `Exposure factor "${answer.name}" selected as "${answer.selectedLabel}"; linked domain(s) ${weakLinked.map((c) => domainName(data, c)).join(', ')} have flagged findings.`,
      'High inherent exposure needs correspondingly strong controls. Exposure and control strength are being read as if independent when they are not.',
      'That controls "exist" in the linked domain may be read as sufficient regardless of how exposed the organisation actually is to this specific risk.',
      'Whether the control(s) in the linked domain(s) are proportionate to this specific exposure, not just present in general.',
      'The organisation\'s own operating characteristics (not a hypothetical) create the opportunity; the control gap is what fails to stop it.',
      linkedIds
    );
  }

  // 5. Whistleblowing channel present per methodology, but scoring weak per assessment.
  const d6 = domainScore(data, 'D6');
  if (d6 !== null && d6 < STRUCTURED_THRESHOLD) {
    add(
      'whistleblowing_present_but_weak',
      `A whistleblowing channel exists but is not yet a reliable route for concerns to surface (${domainName(data, 'D6')}, ${Math.round(d6)}/100)`,
      `${domainName(data, 'D6')} scored ${Math.round(d6)}, below the level this methodology treats as a reliable reporting culture.`,
      'A channel that exists on paper is not the same as one people will actually use. Low awareness or low trust makes the channel a formality rather than a working control.',
      'Having a whistleblowing policy can be mistaken for having a working whistleblowing culture.',
      'Whether staff know the channel exists, trust it, and have used it -- not just whether it is documented.',
      'Fraud that a colleague notices goes unreported because the reporting route is not trusted or not known.',
      findingsForDomain(findings, 'D6').map((f) => f.id)
    );
  }

  // 6. Parallel access-control weakness across operational and digital domains.
  const d3Findings = findingsForDomain(findings, 'D3').filter((f) => f.isHardGate || f.isCriticalControl);
  const d8Findings = findingsForDomain(findings, 'D8').filter((f) => f.isHardGate || f.isCriticalControl);
  if (d3Findings.length > 0 && d8Findings.length > 0) {
    add(
      'access_control_gap_operational_and_digital',
      `Access-control weaknesses appear in both operational systems (${domainName(data, 'D3')}) and digital systems (${domainName(data, 'D8')})`,
      `${domainName(data, 'D3')}: "${d3Findings[0].questionPrompt}" (${d3Findings[0].responseMeaning}). ${domainName(data, 'D8')}: "${d8Findings[0].questionPrompt}" (${d8Findings[0].responseMeaning}).`,
      'The same underlying discipline -- granting and reviewing access on a least-privilege basis -- is failing in two places at once, which suggests a systemic gap rather than two unrelated issues.',
      'Treating these as two separate, domain-specific findings may understate the risk of a single person or credential having excess reach across both operational and digital systems.',
      'Whether the same access-review process (or lack of one) is the common root cause across both domains.',
      'Excess access in one system is used as a stepping stone to excess access or manipulation in the other, with neither domain\'s review catching the combination.',
      [...d3Findings, ...d8Findings].map((f) => f.id)
    );
  }

  return contradictions;
}
