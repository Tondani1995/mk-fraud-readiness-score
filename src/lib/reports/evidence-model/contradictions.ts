import type { AssembledReportData } from '../types';
import { stableToken, stableUnique } from './deterministic';
import type { Contradiction, ContradictionPattern, MaterialFinding, RiskRegisterEntry } from './types';

const STRONG_THRESHOLD = 65;

interface Candidate {
  pattern: ContradictionPattern;
  title: string;
  drivingResponses: string;
  whyItMatters: string;
  falseComfortRisk: string;
  whatLeadershipShouldVerify: string;
  fraudPathwayEnabled: string;
  linkedFindingIds: string[];
}

function score(data: AssembledReportData, code: string): number | null {
  return data.domainResults.find((domain) => domain.domainCode === code)?.rawScore ?? null;
}

function name(data: AssembledReportData, code: string): string {
  return data.domainResults.find((domain) => domain.domainCode === code)?.domainName ?? code;
}

function family(pattern: ContradictionPattern): string {
  return pattern === 'exposure_outpaces_control' ? 'exposure_control_mismatch' : pattern;
}

function bestRisk(findingIds: string[], risks: RiskRegisterEntry[]): RiskRegisterEntry | null {
  return [...risks].map((risk) => ({ risk, overlap: risk.linkedFindingIds.filter((id) => findingIds.includes(id)).length }))
    .filter((item) => item.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap || a.risk.id.localeCompare(b.risk.id))[0]?.risk ?? null;
}

/** Consolidates equivalent evidence patterns before applying a context-sensitive presentation cap. */
export function buildContradictions(
  data: AssembledReportData,
  findings: MaterialFinding[],
  risks: RiskRegisterEntry[] = []
): Contradiction[] {
  const weak = findings.filter((finding) => finding.materialityClass !== 'assurance_priority' && (finding.responseValue ?? 5) <= 2);
  if (weak.length === 0) return [];
  const candidates: Candidate[] = [];
  const inDomain = (code: string) => weak.filter((finding) => finding.domainCode === code);
  const add = (candidate: Candidate) => {
    const linkedFindingIds = stableUnique(candidate.linkedFindingIds);
    if (linkedFindingIds.length > 0) candidates.push({ ...candidate, linkedFindingIds });
  };

  if ((score(data, 'D4') ?? -1) >= STRONG_THRESHOLD && inDomain('D5').length > 0) {
    add({
      pattern: 'strong_detection_weak_response',
      title: 'Strong detection sits alongside weak incident response',
      drivingResponses: `${name(data, 'D4')} scored ${Math.round(score(data, 'D4') as number)}/100 while weak D5 responses remain selected.`,
      whyItMatters: 'Detection and response are separate capabilities; finding an incident does not ensure it is contained, investigated or escalated correctly.',
      falseComfortRisk: 'The detection score may be read as proof that a detected fraud would also be handled effectively.',
      whatLeadershipShouldVerify: 'Has the incident plan been rehearsed, and can named decision-makers demonstrate containment and evidence-preservation decisions?',
      fraudPathwayEnabled: 'A detected incident expands because containment, command or escalation is delayed.',
      linkedFindingIds: inDomain('D5').map((finding) => finding.id)
    });
  }

  if ((score(data, 'D2') ?? -1) >= STRONG_THRESHOLD && inDomain('D10').length > 0) {
    add({
      pattern: 'strong_identification_weak_improvement',
      title: 'Strong risk identification sits alongside weak continuous improvement',
      drivingResponses: `${name(data, 'D2')} scored ${Math.round(score(data, 'D2') as number)}/100 while weak D10 responses remain selected.`,
      whyItMatters: 'Known risks can remain unaddressed when review, learning and control-change cycles do not operate reliably.',
      falseComfortRisk: 'A complete risk register may be mistaken for evidence that identified risks are being treated.',
      whatLeadershipShouldVerify: 'Which identified risk produced a completed and evidenced control change in the last review cycle?',
      fraudPathwayEnabled: 'A known risk remains untreated long enough to be exploited.',
      linkedFindingIds: inDomain('D10').map((finding) => finding.id)
    });
  }

  for (const domain of [...data.domainResults].sort((a, b) => a.domainCode.localeCompare(b.domainCode))) {
    if ((domain.rawScore ?? -1) < STRONG_THRESHOLD) continue;
    const failed = inDomain(domain.domainCode).filter((finding) => finding.isCriticalControl || finding.isHardGate);
    if (failed.length === 0) continue;
    add({
      pattern: 'strong_domain_failed_critical_control',
      title: `${domain.domainName} scores strongly but contains a failed critical control`,
      drivingResponses: `Domain score ${Math.round(domain.rawScore as number)}/100; failed critical evidence: ${failed.map((finding) => `${finding.domainName} — ${finding.responseMeaning}`).join('; ')}.`,
      whyItMatters: 'A blended domain average can mask a control the methodology treats as non-negotiable.',
      falseComfortRisk: 'Leadership may rely on the aggregate domain score and miss the exact failed control.',
      whatLeadershipShouldVerify: `Can current operating evidence independently demonstrate the control(s) covering ${stableUnique(failed.map((finding) => finding.domainName)).join('; ')}?`,
      fraudPathwayEnabled: 'The specific failed control is exploited while the aggregate score discourages deeper review.',
      linkedFindingIds: failed.map((finding) => finding.id)
    });
  }

  const exposureNames = new Map(data.exposureAnswers.map((answer) => [answer.factorCode, answer.name]));
  const exposureFindings = weak.filter((finding) => finding.linkedExposureFactorCodes.length > 0);
  const exposureGroups = new Map<string, MaterialFinding[]>();
  for (const finding of exposureFindings) {
    const key = stableUnique(finding.linkedExposureFactorCodes).join('|');
    exposureGroups.set(key, [...(exposureGroups.get(key) ?? []), finding]);
  }
  for (const [factorKey, linked] of [...exposureGroups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const factorCodes = factorKey.split('|');
    add({
      pattern: 'exposure_outpaces_control',
      title: 'Recorded operating exposure outpaces linked control strength',
      drivingResponses: `High/severe exposure evidence (${factorCodes.map((code) => exposureNames.get(code) ?? code).join(', ')}) is linked to weak responses in ${stableUnique(linked.map((finding) => finding.domainName)).join(', ')}.`,
      whyItMatters: 'Higher inherent exposure requires stronger and more reliably evidenced preventive, detective and response controls.',
      falseComfortRisk: 'The existence of a control may be read as sufficient without testing whether it is proportionate to the recorded exposure.',
      whatLeadershipShouldVerify: 'Are the linked controls complete, current and tested against the specific exposure recorded in this assessment?',
      fraudPathwayEnabled: 'The organisation’s operating characteristics create an opportunity that the linked control weakness does not reliably interrupt.',
      linkedFindingIds: linked.map((finding) => finding.id)
    });
  }

  const access = weak.filter((finding) => ['D3-Q04', 'D8-Q04'].includes(finding.questionCode));
  if (new Set(access.map((finding) => finding.domainCode)).size === 2) {
    add({
      pattern: 'access_control_gap_operational_and_digital',
      title: 'Operational and privileged-access weaknesses indicate one systemic access-governance issue',
      drivingResponses: access.map((finding) => `${finding.domainName} — ${finding.responseMeaning}`).sort().join('; '),
      whyItMatters: 'Excess access across ordinary and privileged environments can create an end-to-end manipulation and concealment route.',
      falseComfortRisk: 'Treating the findings as unrelated domain issues understates the common identity and recertification dependency.',
      whatLeadershipShouldVerify: 'Is one complete identity, role and recertification population used across ordinary and privileged access reviews?',
      fraudPathwayEnabled: 'Excess access in one system is used to reach, execute or conceal activity in another.',
      linkedFindingIds: access.map((finding) => finding.id)
    });
  }

  const consolidated = new Map<string, Candidate>();
  for (const candidate of candidates) {
    const key = `${family(candidate.pattern)}|${candidate.linkedFindingIds.join('|')}`;
    if (!consolidated.has(key)) consolidated.set(key, candidate);
  }

  const materiality = (candidate: Candidate) => candidate.linkedFindingIds.reduce((total, id) => total + (findings.find((finding) => finding.id === id)?.materialityScore ?? 0), 0);
  const cap = weak.length >= 3 ? 5 : 3;
  return [...consolidated.values()]
    .sort((a, b) => materiality(b) - materiality(a) || family(a.pattern).localeCompare(family(b.pattern)) || a.linkedFindingIds.join('|').localeCompare(b.linkedFindingIds.join('|')))
    .slice(0, cap)
    .map((candidate) => {
      const risk = bestRisk(candidate.linkedFindingIds, risks);
      const evidenceRefs = stableUnique([
        ...candidate.linkedFindingIds.map((id) => `finding:${id}`),
        ...(risk ? [`risk:${risk.id}`] : [])
      ]);
      return {
        id: `CX-${stableToken(`${family(candidate.pattern)}|${candidate.linkedFindingIds.join('|')}`)}`,
        ...candidate,
        linkedRiskId: risk?.id ?? null,
        evidenceRefs,
        materialityScore: materiality(candidate)
      } satisfies Contradiction;
    });
}
