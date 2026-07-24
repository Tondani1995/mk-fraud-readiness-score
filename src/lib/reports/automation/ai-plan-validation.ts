import type {
  NarrativeValidationIssue,
  NarrativeValidationResult,
  PremiumReportAiEditorialPlan,
  PremiumReportEvidencePack,
  PremiumReportNarrativeBrief,
  NarrativeSectionBrief
} from './types';
import { buildPremiumReportNarrativeBrief } from './narrative-brief';

const ROOT_KEYS = new Set([
  'executiveEvidenceRefs',
  'executiveBody',
  'falseComfortEvidenceRefs',
  'falseComfortBody',
  'leadershipEvidenceRefs',
  'leadershipBody',
  'domainEvidence',
  'gapEvidence'
]);
const DOMAIN_KEYS = new Set(['domainCode', 'evidenceRefs', 'body']);
const GAP_KEYS = new Set(['questionCode', 'evidenceRefs', 'body']);
const MAX_BODY_CHARS = 2000;
const MARKDOWN_PATTERN = /(^|\n)\s*(?:#{1,6}\s|[-*+]\s+|\d+[.)]\s+|```)|\[[^\]]+\]\([^)]+\)/m;
const GENERIC_BODY_PATTERN = /\b(?:robust framework|holistic approach|best[- ]in[- ]class|world[- ]class|journey of continuous improvement|enhance the control environment|stakeholders should work together)\b/i;
/** Jaccard similarity at or above 0.88 is treated as materially duplicated prose. */
export const NARRATIVE_DUPLICATE_SIMILARITY_THRESHOLD = 0.88;

function body(
  value: unknown,
  path: string,
  brief: NarrativeSectionBrief,
  issues: NarrativeValidationIssue[]
): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    issues.push(issue('invalid_ai_body', path, 'A non-empty narrative body is required.'));
    return '';
  }
  if (value.length > brief.maxCharacters) {
    issues.push(issue(
      'ai_section_body_too_long',
      path,
      `Narrative body for ${brief.sectionId} exceeds its ${brief.maxCharacters}-character limit.`
    ));
  }
  if (value.length > MAX_BODY_CHARS) {
    issues.push(issue('ai_body_too_long', path, `Narrative body exceeds ${MAX_BODY_CHARS} characters.`));
  }
  if (MARKDOWN_PATTERN.test(value)) {
    issues.push(issue('ai_body_markdown_forbidden', path, 'Narrative bodies must be plain paragraphs without markdown, headings or bullets.'));
  }
  if (GENERIC_BODY_PATTERN.test(value)) {
    issues.push(issue('generic_narrative_body', path, 'Generic consultancy filler is not acceptable narrative.'));
  }
  return value;
}

function issue(code: string, path: string, message: string): NarrativeValidationIssue {
  return { code, path, message, blocking: true };
}

function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function normaliseAiIdentifier(value: string) {
  return value.normalize('NFKC').trim();
}

function validateKeys(value: Record<string, unknown>, allowed: Set<string>, path: string, issues: NarrativeValidationIssue[]) {
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) issues.push(issue('ai_schema_field_forbidden', `${path}.${key}`, 'AI output contains a field capable of carrying unauthorised content.'));
  }
}

function refs(
  value: unknown,
  path: string,
  known: Set<string>,
  brief: NarrativeSectionBrief,
  issues: NarrativeValidationIssue[]
) {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== 'string')) {
    issues.push(issue('invalid_evidence_refs', path, 'One or more evidence identifiers are required.'));
    return [];
  }
  const normalised = value.map((item) => normaliseAiIdentifier(item as string));
  if (new Set(normalised).size !== normalised.length) issues.push(issue('duplicate_evidence_ref', path, 'Evidence identifiers must be unique.'));
  normalised.forEach((ref) => {
    if (!known.has(ref)) issues.push(issue('unknown_evidence_ref', path, `Evidence identifier ${ref} is not present in the deterministic evidence pack.`));
    if (!brief.allowedEvidenceRefs.includes(ref)) {
      issues.push(issue('section_evidence_scope_violation', path, `Evidence identifier ${ref} is outside the deterministic scope for ${brief.sectionId}.`));
    }
  });
  brief.requiredEvidenceRefs.forEach((ref) => {
    if (!normalised.includes(ref)) {
      issues.push(issue('missing_required_section_evidence', path, `Section ${brief.sectionId} must cite required evidence ${ref}.`));
    }
  });
  return normalised;
}

function normalisedTokens(value: string) {
  return new Set(value.toLowerCase().normalize('NFKC').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((token) => token.length > 2));
}

function similarity(left: string, right: string) {
  const a = normalisedTokens(left);
  const b = normalisedTokens(right);
  if (a.size < 8 || b.size < 8) return 0;
  const intersection = [...a].filter((token) => b.has(token)).length;
  return intersection / (a.size + b.size - intersection);
}

function validateDistinctBodies(bodies: Array<{ path: string; value: string }>, issues: NarrativeValidationIssue[]) {
  for (let left = 0; left < bodies.length; left += 1) {
    for (let right = left + 1; right < bodies.length; right += 1) {
      if (similarity(bodies[left].value, bodies[right].value) >= NARRATIVE_DUPLICATE_SIMILARITY_THRESHOLD) {
        issues.push(issue('duplicate_narrative_body', bodies[right].path, `Narrative body materially duplicates ${bodies[left].path}.`));
      }
    }
  }
}

export function validatePremiumReportAiEditorialPlan(
  value: unknown,
  evidence: PremiumReportEvidencePack,
  brief: PremiumReportNarrativeBrief = buildPremiumReportNarrativeBrief(evidence),
  now = new Date()
): NarrativeValidationResult {
  const issues: NarrativeValidationIssue[] = [];
  const known = new Set(evidence.items.map((item) => normaliseAiIdentifier(item.id)));
  if (!record(value)) {
    return { ok: false, issues: [issue('invalid_ai_plan_schema', '$', 'AI output must be a grounded-narrative object.')], checkedAt: now.toISOString(), schemaVersion: evidence.schemaVersion };
  }
  validateKeys(value, ROOT_KEYS, '$', issues);
  refs(value.executiveEvidenceRefs, 'executiveEvidenceRefs', known, brief.executive, issues);
  body(value.executiveBody, 'executiveBody', brief.executive, issues);
  refs(value.falseComfortEvidenceRefs, 'falseComfortEvidenceRefs', known, brief.falseComfort, issues);
  body(value.falseComfortBody, 'falseComfortBody', brief.falseComfort, issues);
  refs(value.leadershipEvidenceRefs, 'leadershipEvidenceRefs', known, brief.leadership, issues);
  body(value.leadershipBody, 'leadershipBody', brief.leadership, issues);

  const expectedDomains = new Set(evidence.items.filter((item) => item.kind === 'domain' && item.domainCode).map((item) => normaliseAiIdentifier(item.domainCode!)));
  const seenDomains = new Set<string>();
  if (!Array.isArray(value.domainEvidence)) {
    issues.push(issue('invalid_domain_evidence', 'domainEvidence', 'Domain evidence must be an array.'));
  } else {
    value.domainEvidence.forEach((entry, index) => {
      const path = `domainEvidence[${index}]`;
      if (!record(entry) || typeof entry.domainCode !== 'string') {
        issues.push(issue('invalid_domain_evidence', path, 'Domain evidence requires a domainCode and evidenceRefs.'));
        return;
      }
      validateKeys(entry, DOMAIN_KEYS, path, issues);
      const code = normaliseAiIdentifier(entry.domainCode);
      if (!expectedDomains.has(code)) issues.push(issue('unknown_domain', `${path}.domainCode`, `Domain ${code} is not in the deterministic evidence pack.`));
      if (seenDomains.has(code)) issues.push(issue('duplicate_domain', `${path}.domainCode`, `Domain ${code} is duplicated.`));
      seenDomains.add(code);
      const sectionBrief = brief.domains[code];
      if (!sectionBrief) {
        issues.push(issue('missing_domain_brief', `${path}.domainCode`, `Domain ${code} has no deterministic narrative brief.`));
        return;
      }
      const evidenceRefs = refs(entry.evidenceRefs, `${path}.evidenceRefs`, known, sectionBrief, issues);
      if (!evidenceRefs.includes(`domain:${code}`)) issues.push(issue('missing_own_evidence', `${path}.evidenceRefs`, `Domain ${code} must cite its deterministic domain evidence.`));
      body(entry.body, `${path}.body`, sectionBrief, issues);
    });
  }
  expectedDomains.forEach((code) => {
    if (!seenDomains.has(code)) issues.push(issue('missing_domain', 'domainEvidence', `Domain ${code} is missing.`));
  });

  const expectedGaps = new Set(evidence.items.filter((item) => item.kind === 'gap' && item.questionCode).map((item) => normaliseAiIdentifier(item.questionCode!)));
  const seenGaps = new Set<string>();
  if (!Array.isArray(value.gapEvidence)) {
    issues.push(issue('invalid_gap_evidence', 'gapEvidence', 'Gap evidence must be an array.'));
  } else {
    value.gapEvidence.forEach((entry, index) => {
      const path = `gapEvidence[${index}]`;
      if (!record(entry) || typeof entry.questionCode !== 'string') {
        issues.push(issue('invalid_gap_evidence', path, 'Gap evidence requires a questionCode and evidenceRefs.'));
        return;
      }
      validateKeys(entry, GAP_KEYS, path, issues);
      const code = normaliseAiIdentifier(entry.questionCode);
      if (!expectedGaps.has(code)) issues.push(issue('unknown_gap', `${path}.questionCode`, `Gap ${code} is not in the deterministic evidence pack.`));
      if (seenGaps.has(code)) issues.push(issue('duplicate_gap', `${path}.questionCode`, `Gap ${code} is duplicated.`));
      seenGaps.add(code);
      const sectionBrief = brief.gaps[code];
      if (!sectionBrief) {
        issues.push(issue('missing_gap_brief', `${path}.questionCode`, `Gap ${code} has no deterministic narrative brief.`));
        return;
      }
      const evidenceRefs = refs(entry.evidenceRefs, `${path}.evidenceRefs`, known, sectionBrief, issues);
      if (!evidenceRefs.includes(`gap:${code}`)) issues.push(issue('missing_own_evidence', `${path}.evidenceRefs`, `Gap ${code} must cite its deterministic gap evidence.`));
      body(entry.body, `${path}.body`, sectionBrief, issues);
    });
  }
  expectedGaps.forEach((code) => {
    if (!seenGaps.has(code)) issues.push(issue('missing_gap', 'gapEvidence', `Gap ${code} is missing.`));
  });

  if (Array.isArray(value.domainEvidence)) {
    validateDistinctBodies(value.domainEvidence
      .filter((entry): entry is Record<string, unknown> => record(entry) && typeof entry.body === 'string')
      .map((entry, index) => ({ path: `domainEvidence[${index}].body`, value: entry.body as string })), issues);
  }
  if (Array.isArray(value.gapEvidence)) {
    validateDistinctBodies(value.gapEvidence
      .filter((entry): entry is Record<string, unknown> => record(entry) && typeof entry.body === 'string')
      .map((entry, index) => ({ path: `gapEvidence[${index}].body`, value: entry.body as string })), issues);
  }

  return { ok: issues.length === 0, issues, checkedAt: now.toISOString(), schemaVersion: evidence.schemaVersion };
}

export function asPremiumReportAiEditorialPlan(value: unknown) {
  return value as PremiumReportAiEditorialPlan;
}
