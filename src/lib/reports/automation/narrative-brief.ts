import {
  PREMIUM_REPORT_AI_BODY_MAX_CHARS,
  type NarrativeSectionBrief,
  type PremiumReportEvidencePack,
  type PremiumReportNarrativeBrief,
  type ReportEvidenceItem
} from './types';
import {
  COMMERCIAL_QUALITY_SAFE_ADMIN_MESSAGE,
  ReportCommercialQualityError
} from '../commercial-quality';
import type { AdvisoryEvidenceModel } from '../evidence-model';

const UNIVERSAL_PROHIBITIONS = [
  'new findings, risks, controls, decisions, owners or roadmap actions',
  'legal, regulatory, benchmark, certification or guarantee conclusions',
  'fraud allegations or claims of independent verification',
  'markdown, headings, bullets, sales language or generic consultancy filler'
];

function stableUnique(values: string[]) {
  return [...new Set(values.filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

function orderedUnique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function ids(items: ReportEvidenceItem[]) {
  return stableUnique(items.map((item) => item.id));
}

function orderedIds(items: ReportEvidenceItem[]) {
  return orderedUnique(items.map((item) => item.id));
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
  const required = orderedUnique(requiredEvidenceRefs);
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

function briefInvalid(message: string, entityId?: string): never {
  throw new ReportCommercialQualityError(
    [{
      code: 'QG_AI_NARRATIVE_BRIEF_INVALID',
      severity: 'violation',
      message,
      entityId,
      source: 'ai-narrative-brief'
    }],
    [],
    COMMERCIAL_QUALITY_SAFE_ADMIN_MESSAGE
  );
}

function resolveExactlyOne(
  evidence: PremiumReportEvidencePack,
  kind: ReportEvidenceItem['kind'],
  evidenceId: string,
  authoritativeId: string
) {
  const matches = evidence.items.filter((item) => item.kind === kind && item.id === evidenceId);
  if (matches.length !== 1) {
    briefInvalid(
      `Authoritative ${kind} ${authoritativeId} resolved to ${matches.length} evidence items; exactly one is required.`,
      authoritativeId
    );
  }
  return matches[0];
}

function resolveAuthoritativeItems<T extends { id: string }>(
  evidence: PremiumReportEvidencePack,
  kind: ReportEvidenceItem['kind'],
  entries: T[],
  prefix: string
) {
  return entries.map((entry) => resolveExactlyOne(evidence, kind, `${prefix}:${entry.id}`, entry.id));
}

function linkedAuthoritativeItems(model: AdvisoryEvidenceModel, domainCode: string, questionCode?: string) {
  const findings = model.materialFindings.filter((finding) =>
    questionCode ? finding.questionCode === questionCode : finding.domainCode === domainCode
  );
  const findingIds = new Set(findings.map((finding) => finding.id));
  const questionCodes = new Set(findings.map((finding) => finding.questionCode));
  if (questionCode) questionCodes.add(questionCode);

  const risks = model.riskRegister.filter((risk) =>
    risk.linkedFindingIds.some((id) => findingIds.has(id))
    || risk.linkedQuestionCodes.some((code) => questionCodes.has(code))
    || (!questionCode && risk.affectedDomains.includes(domainCode))
  );
  const riskIds = new Set(risks.map((risk) => risk.id));
  const contradictions = model.contradictions.filter((item) =>
    item.linkedFindingIds.some((id) => findingIds.has(id))
    || (item.linkedRiskId !== null && riskIds.has(item.linkedRiskId))
  );
  const scenarios = model.scenarios.filter((scenario) =>
    scenario.linkedFindingIds.some((id) => findingIds.has(id))
    || scenario.linkedQuestionCodes.some((code) => questionCodes.has(code))
    || scenario.linkedRiskIds.some((id) => riskIds.has(id))
  );
  const controls = model.controlImprovements.filter((control) =>
    findingIds.has(control.linkedFindingId)
    || control.linkedRiskIds.some((id) => riskIds.has(id))
    || questionCodes.has(control.linkedQuestionCode)
  );
  return { findings, risks, contradictions, scenarios, controls };
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

function allBriefSections(brief: PremiumReportNarrativeBrief) {
  return [
    brief.executive,
    brief.falseComfort,
    brief.leadership,
    ...Object.values(brief.domains),
    ...Object.values(brief.gaps)
  ];
}

export function assertPremiumReportNarrativeBrief(
  evidence: PremiumReportEvidencePack,
  brief: PremiumReportNarrativeBrief
) {
  const evidenceCounts = new Map<string, number>();
  evidence.items.forEach((item) => evidenceCounts.set(item.id, (evidenceCounts.get(item.id) ?? 0) + 1));
  const defects: Array<{ message: string; entityId: string }> = [];

  for (const entry of allBriefSections(brief)) {
    const required = entry.requiredEvidenceRefs;
    const allowed = entry.allowedEvidenceRefs;
    if (required.length === 0) {
      defects.push({ message: `Mandatory section ${entry.sectionId} has no required evidence reference.`, entityId: entry.sectionId });
    }
    if (new Set(required).size !== required.length) {
      defects.push({ message: `Section ${entry.sectionId} contains duplicate required evidence references.`, entityId: entry.sectionId });
    }
    if (new Set(allowed).size !== allowed.length) {
      defects.push({ message: `Section ${entry.sectionId} contains duplicate allowed evidence references.`, entityId: entry.sectionId });
    }
    if (!Number.isInteger(entry.maxCharacters) || entry.maxCharacters < 1 || entry.maxCharacters > PREMIUM_REPORT_AI_BODY_MAX_CHARS) {
      defects.push({ message: `Section ${entry.sectionId} has an invalid maxCharacters limit.`, entityId: entry.sectionId });
    }
    for (const ref of required) {
      if ((evidenceCounts.get(ref) ?? 0) !== 1) {
        defects.push({ message: `Required reference ${ref} for ${entry.sectionId} must resolve exactly once.`, entityId: entry.sectionId });
      }
      if (!allowed.includes(ref)) {
        defects.push({ message: `Required reference ${ref} is not allowed for ${entry.sectionId}.`, entityId: entry.sectionId });
      }
    }
    for (const ref of allowed) {
      if ((evidenceCounts.get(ref) ?? 0) !== 1) {
        defects.push({ message: `Allowed reference ${ref} for ${entry.sectionId} must resolve exactly once.`, entityId: entry.sectionId });
      }
    }
  }

  if (defects.length > 0) {
    throw new ReportCommercialQualityError(
      defects.map((defect) => ({
        code: 'QG_AI_NARRATIVE_BRIEF_INVALID' as const,
        severity: 'violation' as const,
        message: defect.message,
        entityId: defect.entityId,
        source: 'ai-narrative-brief'
      })),
      [],
      COMMERCIAL_QUALITY_SAFE_ADMIN_MESSAGE
    );
  }
  return brief;
}

export function buildPremiumReportNarrativeBrief(
  evidence: PremiumReportEvidencePack
): PremiumReportNarrativeBrief {
  const items = [...evidence.items].sort((left, right) => left.id.localeCompare(right.id));
  const model = evidence.advisoryModel;
  const risks = model
    ? resolveAuthoritativeItems(evidence, 'risk', model.riskRegister, 'risk')
    : items.filter((item) => item.kind === 'risk');
  const caps = items.filter((item) => item.kind === 'maturity_cap');
  const contradictions = model
    ? resolveAuthoritativeItems(evidence, 'contradiction', model.contradictions, 'contradiction')
    : items.filter((item) => item.kind === 'contradiction');
  const decisions = model
    ? resolveAuthoritativeItems(evidence, 'leadership_decision', model.leadershipDecisions, 'decision')
    : items.filter((item) => item.kind === 'leadership_decision');
  const roadmap = model
    ? resolveAuthoritativeItems(evidence, 'roadmap_action', model.roadmapActions, 'roadmap')
    : items.filter((item) => item.kind === 'roadmap_action');
  const limitation = items.filter((item) => item.kind === 'assessment_limitation');
  const assurance = model
    ? resolveAuthoritativeItems(
      evidence,
      'material_finding',
      model.materialFindings.filter((finding) => finding.materialityClass === 'assurance_priority'),
      'finding'
    )
    : items.filter((item) =>
      item.kind === 'material_finding' && itemMentions(item.value, 'assurance_priority')
    );

  const executiveAllowed = ids([
    ...items.filter((item) => [
      'overall_score', 'final_maturity', 'calculated_maturity', 'exposure_score', 'exposure_band',
      'material_finding', 'maturity_cap', 'contradiction', 'risk', 'leadership_decision',
      'assessment_limitation'
    ].includes(item.kind)),
  ]);
  const executiveRequired = orderedIds([
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
  const falseComfortRequired = orderedIds([
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
    ? orderedIds([...decisions.slice(0, 3), ...risks.slice(0, 2), ...roadmap.slice(0, 3), ...limitation])
    : orderedIds([
      ...firstByKind(items, 'final_maturity'),
      ...firstByKind(items, 'domain'),
      ...firstByKind(items, 'gap')
    ]);

  const domains: Record<string, NarrativeSectionBrief> = {};
  for (const domain of items.filter((item) => item.kind === 'domain' && item.domainCode)) {
    const related = itemsForDomain(items, domain.domainCode!);
    const linked = model ? linkedAuthoritativeItems(model, domain.domainCode!) : null;
    const required = orderedIds([
      domain,
      ...related.filter((item) => item.kind === 'question_response'),
      ...(linked
        ? resolveAuthoritativeItems(evidence, 'material_finding', linked.findings, 'finding')
        : related.filter((item) => item.kind === 'material_finding')),
      ...(linked
        ? resolveAuthoritativeItems(evidence, 'risk', linked.risks.slice(0, 1), 'risk')
        : firstByKind(related, 'risk')),
      ...(linked
        ? resolveAuthoritativeItems(evidence, 'contradiction', linked.contradictions.slice(0, 1), 'contradiction')
        : firstByKind(related, 'contradiction')),
      ...(linked
        ? resolveAuthoritativeItems(evidence, 'plausible_scenario', linked.scenarios.slice(0, 1), 'scenario')
        : firstByKind(related, 'plausible_scenario')),
      ...(linked
        ? resolveAuthoritativeItems(evidence, 'control_improvement', linked.controls.slice(0, 1), 'control')
        : firstByKind(related, 'control_improvement')),
      ...limitation
    ]);
    domains[domain.domainCode!] = section(
      `domain:${domain.domainCode}`,
      'Explain this domain’s evidence, material implications and relevant cross-domain relationship in one substantive paragraph.',
      required,
      stableUnique([...ids([...related, ...limitation]), ...required]),
      ['domain-specific evidence', 'material advisory implication', 'self-assessment limitation']
    );
  }

  const gaps: Record<string, NarrativeSectionBrief> = {};
  for (const gap of items.filter((item) => item.kind === 'gap' && item.questionCode)) {
    const related = itemsForGap(items, gap.questionCode!, gap.domainCode);
    const linked = model ? linkedAuthoritativeItems(model, gap.domainCode ?? '', gap.questionCode!) : null;
    const required = orderedIds([
      gap,
      ...related.filter((item) => item.kind === 'question_response'),
      ...(linked
        ? resolveAuthoritativeItems(evidence, 'material_finding', linked.findings, 'finding')
        : related.filter((item) => item.kind === 'material_finding')),
      ...(linked
        ? resolveAuthoritativeItems(evidence, 'risk', linked.risks.slice(0, 1), 'risk')
        : firstByKind(related, 'risk')),
      ...(linked
        ? resolveAuthoritativeItems(evidence, 'contradiction', linked.contradictions.slice(0, 1), 'contradiction')
        : firstByKind(related, 'contradiction')),
      ...(linked
        ? resolveAuthoritativeItems(evidence, 'control_improvement', linked.controls.slice(0, 1), 'control')
        : firstByKind(related, 'control_improvement')),
      ...(linked
        ? resolveAuthoritativeItems(evidence, 'plausible_scenario', linked.scenarios.slice(0, 1), 'scenario')
        : firstByKind(related, 'plausible_scenario'))
    ]);
    gaps[gap.questionCode!] = section(
      `gap:${gap.questionCode}`,
      'Explain the exact control condition, plausible fraud mechanism, implication and control/evidence priority concisely.',
      required,
      stableUnique([...ids(related), ...required]),
      ['control condition', 'fraud mechanism', 'implication', 'control and evidence priority'],
      1_200
    );
  }

  const brief: PremiumReportNarrativeBrief = {
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
  return assertPremiumReportNarrativeBrief(evidence, brief);
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
