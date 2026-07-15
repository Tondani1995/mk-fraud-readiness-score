import type {
  NarrativeValidationIssue,
  NarrativeValidationResult,
  PremiumReportAiEditorialPlan,
  PremiumReportEvidencePack
} from './types';

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

function body(value: unknown, path: string, issues: NarrativeValidationIssue[]): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    issues.push(issue('invalid_ai_body', path, 'A non-empty narrative body is required.'));
    return '';
  }
  if (value.length > MAX_BODY_CHARS) {
    issues.push(issue('ai_body_too_long', path, `Narrative body exceeds ${MAX_BODY_CHARS} characters.`));
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

function refs(value: unknown, path: string, known: Set<string>, issues: NarrativeValidationIssue[]) {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== 'string')) {
    issues.push(issue('invalid_evidence_refs', path, 'One or more evidence identifiers are required.'));
    return [];
  }
  const normalised = value.map((item) => normaliseAiIdentifier(item as string));
  if (new Set(normalised).size !== normalised.length) issues.push(issue('duplicate_evidence_ref', path, 'Evidence identifiers must be unique.'));
  normalised.forEach((ref) => {
    if (!known.has(ref)) issues.push(issue('unknown_evidence_ref', path, `Evidence identifier ${ref} is not present in the deterministic evidence pack.`));
  });
  return normalised;
}

export function validatePremiumReportAiEditorialPlan(
  value: unknown,
  evidence: PremiumReportEvidencePack,
  now = new Date()
): NarrativeValidationResult {
  const issues: NarrativeValidationIssue[] = [];
  const known = new Set(evidence.items.map((item) => normaliseAiIdentifier(item.id)));
  if (!record(value)) {
    return { ok: false, issues: [issue('invalid_ai_plan_schema', '$', 'AI output must be a grounded-narrative object.')], checkedAt: now.toISOString(), schemaVersion: evidence.schemaVersion };
  }
  validateKeys(value, ROOT_KEYS, '$', issues);
  refs(value.executiveEvidenceRefs, 'executiveEvidenceRefs', known, issues);
  body(value.executiveBody, 'executiveBody', issues);
  refs(value.falseComfortEvidenceRefs, 'falseComfortEvidenceRefs', known, issues);
  body(value.falseComfortBody, 'falseComfortBody', issues);
  refs(value.leadershipEvidenceRefs, 'leadershipEvidenceRefs', known, issues);
  body(value.leadershipBody, 'leadershipBody', issues);

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
      const evidenceRefs = refs(entry.evidenceRefs, `${path}.evidenceRefs`, known, issues);
      if (!evidenceRefs.includes(`domain:${code}`)) issues.push(issue('missing_own_evidence', `${path}.evidenceRefs`, `Domain ${code} must cite its deterministic domain evidence.`));
      body(entry.body, `${path}.body`, issues);
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
      const evidenceRefs = refs(entry.evidenceRefs, `${path}.evidenceRefs`, known, issues);
      if (!evidenceRefs.includes(`gap:${code}`)) issues.push(issue('missing_own_evidence', `${path}.evidenceRefs`, `Gap ${code} must cite its deterministic gap evidence.`));
      body(entry.body, `${path}.body`, issues);
    });
  }
  expectedGaps.forEach((code) => {
    if (!seenGaps.has(code)) issues.push(issue('missing_gap', 'gapEvidence', `Gap ${code} is missing.`));
  });

  return { ok: issues.length === 0, issues, checkedAt: now.toISOString(), schemaVersion: evidence.schemaVersion };
}

export function asPremiumReportAiEditorialPlan(value: unknown) {
  return value as PremiumReportAiEditorialPlan;
}
