import type {
  NarrativeValidationIssue,
  NarrativeValidationResult,
  PremiumReportEvidencePack,
  PremiumReportNarrative,
  ReportEvidenceItem
} from './types';

const PROHIBITED_PATTERNS: Array<{ code: string; pattern: RegExp; message: string }> = [
  { code: 'unsupported_benchmark', pattern: /\b(industry|market|sector)\s+(average|benchmark|norm|percentile)\b/i, message: 'Unsupported benchmark language is not allowed.' },
  { code: 'certification_claim', pattern: /\b(certified|certification|accredited|accreditation)\b/i, message: 'Certification or accreditation claims are not allowed.' },
  { code: 'compliance_conclusion', pattern: /\b(fully compliant|legally compliant|regulatory compliance is confirmed|meets all regulatory requirements)\b/i, message: 'The report may not make a legal or regulatory compliance conclusion.' },
  { code: 'guarantee_claim', pattern: /\b(guarantee[sd]?|will eliminate|will prevent all|fraud[- ]proof|zero fraud)\b/i, message: 'Guarantees and absolute fraud-prevention claims are not allowed.' },
  { code: 'secret_leakage', pattern: /\b(service[_ -]?role|supabase[_ -]?(key|url)|api[_ -]?key|vercel[_ -]?(token|oidc)|bearer token|access token)\b/i, message: 'Internal credentials or infrastructure identifiers are not allowed.' },
  { code: 'internal_reference', pattern: /\b(score_run_id|assessment_id|question_id|report_fulfilment|generation_run_id)\b/i, message: 'Internal database identifiers are not allowed.' }
];

const MATURITY_BANDS = ['Reactive', 'Developing', 'Structured', 'Strategic'] as const;
const EXPOSURE_BANDS = ['Low', 'Moderate', 'High', 'Severe'] as const;

function issue(code: string, path: string, message: string): NarrativeValidationIssue {
  return { code, path, message, blocking: true };
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function nonEmptyText(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0;
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && item.trim().length > 0);
}

function collectNumbers(value: unknown, target: Set<string>) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    target.add(String(value));
    target.add(String(Math.round(value)));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectNumbers(item, target));
    return;
  }
  if (record(value)) Object.values(value).forEach((item) => collectNumbers(item, target));
}

function evidenceByKind(evidence: PremiumReportEvidencePack, kind: ReportEvidenceItem['kind']) {
  return evidence.items.filter((item) => item.kind === kind);
}

function sectionText(value: { title?: string; body: string }) {
  return `${value.title ?? ''}\n${value.body}`.trim();
}

function validateText(path: string, value: { title?: string; body: string }, allowedNumbers: Set<string>, issues: NarrativeValidationIssue[]) {
  if (value.title !== undefined && value.title.length > 140) issues.push(issue('title_too_long', `${path}.title`, 'Title exceeds 140 characters.'));
  if (value.body.length > 2500) issues.push(issue('body_too_long', `${path}.body`, 'Body exceeds 2,500 characters.'));

  const text = sectionText(value);
  for (const rule of PROHIBITED_PATTERNS) {
    if (rule.pattern.test(text)) issues.push(issue(rule.code, path, rule.message));
  }

  const numbers = text.match(/\b\d+(?:\.\d+)?%?\b/g) ?? [];
  for (const token of numbers) {
    const normalised = token.replace('%', '');
    if (!allowedNumbers.has(normalised)) {
      issues.push(issue('unsupported_numeric_claim', path, `Numeric claim "${token}" is not present in the deterministic evidence pack.`));
    }
  }
}

function validateEvidenceRefs(path: string, refs: unknown, knownRefs: Set<string>, requiredRef: string | null, issues: NarrativeValidationIssue[]) {
  if (!stringArray(refs)) {
    issues.push(issue('invalid_evidence_refs', `${path}.evidenceRefs`, 'At least one valid evidence reference is required.'));
    return;
  }

  const seen = new Set<string>();
  for (const ref of refs) {
    if (seen.has(ref)) issues.push(issue('duplicate_evidence_ref', `${path}.evidenceRefs`, `Evidence reference ${ref} is duplicated.`));
    seen.add(ref);
    if (!knownRefs.has(ref)) issues.push(issue('unknown_evidence_ref', `${path}.evidenceRefs`, `Evidence reference ${ref} does not exist.`));
  }

  if (requiredRef && !seen.has(requiredRef)) {
    issues.push(issue('missing_own_evidence', `${path}.evidenceRefs`, `Section must cite ${requiredRef}.`));
  }
}

function maturityMentions(text: string) {
  return MATURITY_BANDS.filter((band) => new RegExp(`\\b${band}\\b`, 'i').test(text));
}

function exposureMentions(text: string) {
  return EXPOSURE_BANDS.filter((band) => new RegExp(`\\b${band}\\s+exposure\\b`, 'i').test(text));
}

export function validatePremiumReportNarrative(
  narrative: unknown,
  evidence: PremiumReportEvidencePack,
  now = new Date()
): NarrativeValidationResult {
  const issues: NarrativeValidationIssue[] = [];
  const knownRefs = new Set(evidence.items.map((item) => item.id));
  const allowedNumbers = new Set<string>();
  evidence.items.forEach((item) => collectNumbers(item.value, allowedNumbers));

  if (!record(narrative)) {
    return {
      ok: false,
      issues: [issue('invalid_schema', '$', 'Narrative output must be an object.')],
      checkedAt: now.toISOString(),
      schemaVersion: evidence.schemaVersion
    };
  }

  const output = narrative as unknown as PremiumReportNarrative;
  const executive = output.executiveDiagnosis;
  const falseComfort = output.falseComfort;
  const leadership = output.leadershipAttention;

  if (!record(executive) || !nonEmptyText(executive.title) || !nonEmptyText(executive.body)) {
    issues.push(issue('invalid_executive_diagnosis', 'executiveDiagnosis', 'Executive diagnosis requires a non-empty title and body.'));
  } else {
    validateText('executiveDiagnosis', executive, allowedNumbers, issues);
    validateEvidenceRefs('executiveDiagnosis', executive.evidenceRefs, knownRefs, 'score:final_maturity', issues);
  }

  if (!record(falseComfort) || !nonEmptyText(falseComfort.title) || !nonEmptyText(falseComfort.body)) {
    issues.push(issue('invalid_false_comfort', 'falseComfort', 'False-comfort section requires a non-empty title and body.'));
  } else {
    validateText('falseComfort', falseComfort, allowedNumbers, issues);
    validateEvidenceRefs('falseComfort', falseComfort.evidenceRefs, knownRefs, null, issues);
  }

  if (!record(leadership) || !nonEmptyText(leadership.body)) {
    issues.push(issue('invalid_leadership_attention', 'leadershipAttention', 'Leadership-attention section requires a non-empty body.'));
  } else {
    validateText('leadershipAttention', leadership, allowedNumbers, issues);
    validateEvidenceRefs('leadershipAttention', leadership.evidenceRefs, knownRefs, null, issues);
  }

  const expectedDomains = evidenceByKind(evidence, 'domain');
  const expectedDomainCodes = new Set(expectedDomains.map((item) => item.domainCode).filter((value): value is string => Boolean(value)));
  if (!Array.isArray(output.domainNarratives)) {
    issues.push(issue('invalid_domain_narratives', 'domainNarratives', 'Domain narratives must be an array.'));
  } else {
    const seen = new Set<string>();
    output.domainNarratives.forEach((section, index) => {
      const path = `domainNarratives[${index}]`;
      if (!record(section) || !nonEmptyText(section.domainCode) || !nonEmptyText(section.title) || !nonEmptyText(section.body)) {
        issues.push(issue('invalid_domain_narrative', path, 'Each domain narrative requires domainCode, title and body.'));
        return;
      }
      if (seen.has(section.domainCode)) issues.push(issue('duplicate_domain_narrative', `${path}.domainCode`, `Domain ${section.domainCode} is duplicated.`));
      seen.add(section.domainCode);
      if (!expectedDomainCodes.has(section.domainCode)) issues.push(issue('unknown_domain', `${path}.domainCode`, `Domain ${section.domainCode} is not in the evidence pack.`));
      validateText(path, section, allowedNumbers, issues);
      validateEvidenceRefs(path, section.evidenceRefs, knownRefs, `domain:${section.domainCode}`, issues);

      const domainEvidence = expectedDomains.find((item) => item.domainCode === section.domainCode);
      const expectedBand = record(domainEvidence?.value) && typeof domainEvidence.value.maturityBand === 'string'
        ? domainEvidence.value.maturityBand
        : null;
      const mentions = maturityMentions(sectionText(section));
      if (expectedBand && mentions.some((band) => band.toLowerCase() !== expectedBand.toLowerCase())) {
        issues.push(issue('domain_maturity_contradiction', path, `Domain narrative contradicts the deterministic ${expectedBand} band.`));
      }
    });

    for (const domainCode of expectedDomainCodes) {
      if (!seen.has(domainCode)) issues.push(issue('missing_domain_narrative', 'domainNarratives', `Missing narrative for domain ${domainCode}.`));
    }
  }

  const expectedGaps = evidenceByKind(evidence, 'gap');
  const expectedGapCodes = new Set(expectedGaps.map((item) => item.questionCode).filter((value): value is string => Boolean(value)));
  if (!Array.isArray(output.gapCommentary)) {
    issues.push(issue('invalid_gap_commentary', 'gapCommentary', 'Gap commentary must be an array.'));
  } else {
    const seen = new Set<string>();
    output.gapCommentary.forEach((section, index) => {
      const path = `gapCommentary[${index}]`;
      if (!record(section) || !nonEmptyText(section.questionCode) || !nonEmptyText(section.body)) {
        issues.push(issue('invalid_gap_section', path, 'Each gap section requires questionCode and body.'));
        return;
      }
      if (seen.has(section.questionCode)) issues.push(issue('duplicate_gap_commentary', `${path}.questionCode`, `Gap ${section.questionCode} is duplicated.`));
      seen.add(section.questionCode);
      if (!expectedGapCodes.has(section.questionCode)) issues.push(issue('unknown_gap', `${path}.questionCode`, `Gap ${section.questionCode} is not in the evidence pack.`));
      validateText(path, section, allowedNumbers, issues);
      validateEvidenceRefs(path, section.evidenceRefs, knownRefs, `gap:${section.questionCode}`, issues);
    });

    for (const questionCode of expectedGapCodes) {
      if (!seen.has(questionCode)) issues.push(issue('missing_gap_commentary', 'gapCommentary', `Missing commentary for gap ${questionCode}.`));
    }
  }

  const finalMaturityItem = evidence.items.find((item) => item.id === 'score:final_maturity');
  const finalMaturity = typeof finalMaturityItem?.value === 'string' ? finalMaturityItem.value : null;
  if (finalMaturity && record(executive)) {
    const mentions = maturityMentions(sectionText(executive));
    if (mentions.some((band) => band.toLowerCase() !== finalMaturity.toLowerCase())) {
      issues.push(issue('overall_maturity_contradiction', 'executiveDiagnosis', `Executive diagnosis contradicts the deterministic ${finalMaturity} maturity result.`));
    }
  }

  const exposureItem = evidence.items.find((item) => item.id === 'score:exposure_band');
  const exposureBand = typeof exposureItem?.value === 'string' ? exposureItem.value : null;
  if (exposureBand && record(executive)) {
    const mentions = exposureMentions(sectionText(executive));
    if (mentions.some((band) => band.toLowerCase() !== exposureBand.toLowerCase())) {
      issues.push(issue('exposure_band_contradiction', 'executiveDiagnosis', `Executive diagnosis contradicts the deterministic ${exposureBand} exposure band.`));
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    checkedAt: now.toISOString(),
    schemaVersion: evidence.schemaVersion
  };
}
