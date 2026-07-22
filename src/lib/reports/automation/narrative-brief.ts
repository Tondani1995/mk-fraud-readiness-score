import {
  PREMIUM_REPORT_AI_BODY_MAX_CHARS,
  type NarrativeSectionBrief,
  type PremiumReportEvidencePack,
  type PremiumReportNarrativeBrief,
  type ReportEvidenceItem
} from './types';

const UNIVERSAL_PROHIBITIONS = [
  'new findings, risks, controls, decisions, owners or roadmap actions',
  'legal, regulatory, benchmark, certification or guarantee conclusions',
  'fraud allegations or claims of independent verification',
  'markdown, headings, bullets, sales language or generic consultancy filler'
];

function stableUnique(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function ids(items: ReportEvidenceItem[]) {
  return stableUnique(items.map((item) => item.id));
}

function itemMentions(value: unknown, token: string) {
  return JSON.stringify(value).includes(`\"${token}\"`);
}

function section(
  sectionId: string,
  purpose: string,
  requiredEvidenceRefs: string[],
  allowedEvidenceRefs: string[],
  requiredThemes: string[],
  maxCharacters = PREMIUM_REPORT_AI_BODY_MAX_CHARS
): NarrativeSectionBrief {
  const allowed = stableUnique(allowedEvidenceRefs);
  const required = stableUnique(requiredEvidenceRefs).filter((ref) => allowed.includes(ref));
  return {
    sectionId,
    purpose,
    requiredEvidenceRefs: required,
    allowedEvidenceRefs: allowed,
    requiredThemes,
    prohibitedThemes: UNIVERSAL_PROHIBITIONS,
    maxCharacters
  };
}

function itemsForDomain(items: ReportEvidenceItem[], domainCode: string) {
  const ownRef = `domain:${domainCode}`;
  return items.filter((item) =>
    item.id === ownRef
    || item.domainCode === domainCode
    || item.evidenceRefs?.includes(ownRef)
    || itemMentions(item.value, domainCode)
  );
}

function itemsForGap(items: ReportEvidenceItem[], questionCode: string, domainCode?: string) {
  const gapRef = `gap:${questionCode}`;
  const questionRef = `question:${questionCode}`;
  const domainRef = domainCode ? `domain:${domainCode}` : null;
  return items.filter((item) =>
    item.id === gapRef
    || item.id === questionRef
    || item.questionCode === questionCode
    || item.evidenceRefs?.includes(gapRef)
    || item.evidenceRefs?.includes(questionRef)
    || itemMentions(item.value, questionCode)
    || (domainRef !== null && item.id === domainRef)
  );
}

function firstByKind(items: ReportEvidenceItem[], kind: ReportEvidenceItem['kind'], count = 1) {
  return items.filter((item) => item.kind === kind).slice(0, count);
}

export function buildPremiumReportNarrativeBrief(
  evidence: PremiumReportEvidencePack
): PremiumReportNarrativeBrief {
  const items = [...evidence.items].sort((left, right) => left.id.localeCompare(right.id));
  const risks = items.filter((item) => item.kind === 'risk');
  const caps = items.filter((item) => item.kind === 'maturity_cap');
  const contradictions = items.filter((item) => item.kind === 'contradiction');
  const decisions = items.filter((item) => item.kind === 'leadership_decision');
  const roadmap = items.filter((item) => item.kind === 'roadmap_action');
  const limitation = items.filter((item) => item.kind === 'assessment_limitation');
  const assurance = items.filter((item) =>
    item.kind === 'material_finding' && itemMentions(item.value, 'assurance_priority')
  );

  const executiveAllowed = ids([
    ...items.filter((item) => [
      'overall_score', 'final_maturity', 'calculated_maturity', 'exposure_score', 'exposure_band',
      'material_finding', 'maturity_cap', 'contradiction', 'risk', 'leadership_decision',
      'assessment_limitation'
    ].includes(item.kind)),
  ]);
  const executiveRequired = ids([
    ...items.filter((item) => ['overall_score', 'final_maturity', 'exposure_band'].includes(item.kind)),
    ...risks.slice(0, 2), ...caps.slice(0, 2), ...contradictions.slice(0, 1),
    ...decisions.slice(0, 2), ...limitation
  ]);

  const falseComfortDrivers = contradictions.length > 0
    ? contradictions
    : caps.length > 0
      ? caps
      : assurance;
  const falseComfortAllowedItems = stableUnique(ids([
    ...items.filter((item) => [
      'overall_score', 'final_maturity', 'exposure_band', 'domain', 'gap', 'question_response', 'material_finding',
      'maturity_cap', 'contradiction', 'risk', 'evidence_checklist', 'assessment_limitation'
    ].includes(item.kind))
  ])).map((id) => items.find((item) => item.id === id)!).filter(Boolean);
  const falseComfortRequired = ids([
    ...falseComfortDrivers.slice(0, 2), ...limitation,
    ...firstByKind(items, 'final_maturity'), ...firstByKind(items, 'exposure_band')
  ]);

  const advisoryLeadershipItems = items.filter((item) => [
    'risk', 'leadership_decision', 'roadmap_action', 'evidence_checklist', 'control_improvement',
    'assessment_limitation'
  ].includes(item.kind));
  const leadershipAllowedItems = advisoryLeadershipItems.length > 0
    ? advisoryLeadershipItems
    : items.filter((item) => ['final_maturity', 'domain', 'gap'].includes(item.kind));
  const leadershipRequired = advisoryLeadershipItems.length > 0
    ? ids([...decisions.slice(0, 3), ...risks.slice(0, 2), ...roadmap.slice(0, 3), ...limitation])
    : ids([
      ...firstByKind(items, 'final_maturity'),
      ...firstByKind(items, 'domain'),
      ...firstByKind(items, 'gap')
    ]);

  const domains: Record<string, NarrativeSectionBrief> = {};
  for (const domain of items.filter((item) => item.kind === 'domain' && item.domainCode)) {
    const related = itemsForDomain(items, domain.domainCode!);
    const required = ids([
      domain,
      ...related.filter((item) => item.kind === 'question_response'),
      ...related.filter((item) => item.kind === 'material_finding'),
      ...firstByKind(related, 'risk'),
      ...firstByKind(related, 'contradiction'),
      ...firstByKind(related, 'plausible_scenario'),
      ...firstByKind(related, 'control_improvement'),
      ...limitation
    ]);
    domains[domain.domainCode!] = section(
      `domain:${domain.domainCode}`,
      'Explain this domain’s evidence, material implications and relevant cross-domain relationship in one substantive paragraph.',
      required,
      ids([...related, ...limitation]),
      ['domain-specific evidence', 'material advisory implication', 'self-assessment limitation']
    );
  }

  const gaps: Record<string, NarrativeSectionBrief> = {};
  for (const gap of items.filter((item) => item.kind === 'gap' && item.questionCode)) {
    const related = itemsForGap(items, gap.questionCode!, gap.domainCode);
    const required = ids([
      gap,
      ...related.filter((item) => item.kind === 'question_response'),
      ...related.filter((item) => item.kind === 'material_finding'),
      ...firstByKind(related, 'risk'),
      ...firstByKind(related, 'control_improvement'),
      ...firstByKind(related, 'plausible_scenario')
    ]);
    gaps[gap.questionCode!] = section(
      `gap:${gap.questionCode}`,
      'Explain the exact control condition, plausible fraud mechanism, implication and control/evidence priority concisely.',
      required,
      ids(related),
      ['control condition', 'fraud mechanism', 'implication', 'control and evidence priority'],
      1_200
    );
  }

  return {
    version: 'mk-essential-narrative-brief-v1',
    executive: section(
      'executive',
      'Synthesize the overall position, material drivers and leadership meaning in two or three compact paragraphs.',
      executiveRequired,
      executiveAllowed,
      ['overall score and final maturity', 'exposure position', 'material risks or caps', 'leadership meaning', 'self-assessment limitation']
    ),
    falseComfort: section(
      'false_comfort',
      'Explain the precise masking or assurance issue and what evidence requires independent validation in one or two paragraphs.',
      falseComfortRequired,
      ids(falseComfortAllowedItems),
      ['why the headline result is insufficient alone', 'specific masking or assurance issue', 'independent evidence to validate']
    ),
    leadership: section(
      'leadership',
      'Explain decisions, sequencing, accountability categories and consequence of delay in one or two paragraphs; do not repeat a task list.',
      leadershipRequired,
      ids(leadershipAllowedItems),
      ['leadership decisions', 'sequencing and dependencies', 'accountability', 'consequence of delay']
    ),
    domains,
    gaps
  };
}

export function allBriefAllowedEvidenceRefs(brief: PremiumReportNarrativeBrief) {
  return stableUnique([
    ...brief.executive.allowedEvidenceRefs,
    ...brief.falseComfort.allowedEvidenceRefs,
    ...brief.leadership.allowedEvidenceRefs,
    ...Object.values(brief.domains).flatMap((entry) => entry.allowedEvidenceRefs),
    ...Object.values(brief.gaps).flatMap((entry) => entry.allowedEvidenceRefs)
  ]);
}
