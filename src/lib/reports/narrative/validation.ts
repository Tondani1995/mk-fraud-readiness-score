import type { NarrativeFactPack } from './fact-pack';
import type { NarrativeManuscript, NarrativeManuscriptSection, NarrativeSpine } from './manuscript';
import type { NarrativeStoryPlan } from './story-plan';

export interface NarrativeValidationIssue {
  code: string;
  path: string;
  message: string;
  blocking: true;
}

export interface NarrativeValidationReport {
  ok: boolean;
  stage: 'spine' | 'manuscript' | 'coherence';
  bibleVersion: string;
  checkedAt: string;
  checkedHeadings: number;
  checkedParagraphs: number;
  checkedClaims: number;
  issues: NarrativeValidationIssue[];
}

const PROHIBITED = [
  { code: 'raw_question_id', pattern: /\bD\d+-Q\d+\b/i, message: 'Raw question IDs are not customer-facing prose.' },
  { code: 'raw_internal_id', pattern: /\b(?:MF|RISK|SC|CI|RA|DEC|DECISION|THEME|FINDING|CONTROL|PROOF|ROADMAP)-[A-Z0-9-]+\b/i, message: 'Raw internal IDs are not customer-facing prose.' },
  { code: 'raw_machine_identifier', pattern: /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+){1,}\b/, message: 'Underscore-delimited machine identifiers are not customer-facing prose.' },
  { code: 'raw_enum', pattern: /\b(?:control_failure|control_gap|maturity_constraint|assurance_priority|cross_domain_dependency)\b/i, message: 'Raw internal materiality enums are not customer-facing prose.' },
  { code: 'internal_methodology', pattern: /\b(?:hard gate|cap event|aggregate maturity result|priority score|the named record)\b/i, message: 'Internal methodology terms are not customer-facing prose.' },
  { code: 'generic_scenario', pattern: /(?:the recorded control condition is engaged through|an actor exploits the recorded control condition|threat actor exploits the recorded control condition)/i, message: 'Generic stitched scenario language is prohibited.' },
  { code: 'assurance_claim', pattern: /\b(?:evidence-linked|evidence-based|independently verified|independent verification|validated operating effectiveness|evidence validated|reviewer judgement)\b/i, message: 'Unsupported assurance language is prohibited outside Advisory.' },
  { code: 'mechanical_field_label', pattern: /\b(?:within .{0,100}, the specific control on whether|recorded control condition)\b/i, message: 'Questionnaire-to-paragraph construction is prohibited.' },
  { code: 'accusatory_tone', pattern: /\bmanagement failed\b|\bthe organisation cannot detect fraud\b/i, message: 'Accusatory or absolute customer language is prohibited.' }
];

function issue(code: string, path: string, message: string): NarrativeValidationIssue { return { code, path, message, blocking: true }; }
function record(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }
function clean(value: unknown): string { return String(value ?? '').trim(); }
function textOf(block: { text?: string } | undefined): string { return clean(block?.text); }
function blocks(manuscript: NarrativeManuscript): Array<{ path: string; block: { text?: string; claimRefs?: string[] } }> {
  const result: Array<{ path: string; block: { text?: string; claimRefs?: string[] } }> = [];
  manuscript.sections.forEach((section, sectionIndex) => {
    result.push({ path: `sections[${sectionIndex}].heading`, block: section.heading });
    section.paragraphs.forEach((paragraph, paragraphIndex) => result.push({ path: `sections[${sectionIndex}].paragraphs[${paragraphIndex}]`, block: paragraph }));
    if (section.transition) result.push({ path: `sections[${sectionIndex}].transition`, block: section.transition });
  });
  return result;
}

function numericValues(pack: NarrativeFactPack): Set<string> {
  const values = new Set<string>();
  const source = JSON.stringify(pack);
  for (const match of source.matchAll(/\b\d+(?:\.\d+)?%?\b/g)) values.add(match[0].replace('%', ''));
  return values;
}

function validateBlocks(input: { blocks: Array<{ path: string; block: { text?: string; claimRefs?: string[] } }>; pack: NarrativeFactPack; issues: NarrativeValidationIssue[]; allowEmptyClaimsForTransition: boolean }): number {
  const known = new Set(input.pack.facts.map((fact) => fact.id));
  const numbers = numericValues(input.pack);
  let claims = 0;
  input.blocks.forEach(({ path, block }) => {
    const text = textOf(block);
    if (!text) { input.issues.push(issue('empty_narrative_block', path, 'Narrative block must contain prose.')); return; }
    const refs = Array.isArray(block.claimRefs) ? block.claimRefs : [];
    if (refs.length === 0 && !(input.allowEmptyClaimsForTransition && path.endsWith('.transition'))) input.issues.push(issue('missing_provenance', path, 'Every material heading and paragraph must carry claim references.'));
    for (const ref of refs) {
      claims += 1;
      if (!known.has(ref)) input.issues.push(issue('unknown_claim_ref', `${path}.claimRefs`, `Claim reference ${ref} is not in the Fact Pack.`));
    }
    for (const rule of PROHIBITED) if (rule.pattern.test(text)) input.issues.push(issue(rule.code, path, rule.message));
    for (const token of text.match(/\b\d+(?:\.\d+)?%?\b/g) ?? []) if (!numbers.has(token.replace('%', ''))) input.issues.push(issue('unsupported_numeric_claim', path, `Numeric claim ${token} is not present in the Fact Pack.`));
    if (/^\s*(?:[-*+]\s|\d+[.)]\s|#{1,6}\s|```)/m.test(text)) input.issues.push(issue('non_prose_format', path, 'Narrative blocks must be connected plain prose, not bullets or nested headings.'));
  });
  return claims;
}

function base(stage: NarrativeValidationReport['stage'], pack: NarrativeFactPack): NarrativeValidationReport {
  return { ok: false, stage, bibleVersion: pack.bibleVersion, checkedAt: new Date().toISOString(), checkedHeadings: 0, checkedParagraphs: 0, checkedClaims: 0, issues: [] };
}

export function validateNarrativeSpine(spine: NarrativeSpine, pack: NarrativeFactPack): NarrativeValidationReport {
  const report = base('spine', pack);
  if (spine.bibleVersion !== '1.1' || spine.schemaVersion !== 'mk-reporting-bible-1.1-manuscript-v1') report.issues.push(issue('wrong_bible_version', '$', 'Narrative spine must use the v1.1 manuscript contract.'));
  report.checkedHeadings = 0;
  report.checkedParagraphs = 4;
  report.checkedClaims = validateBlocks({ blocks: [
    { path: 'executiveDiagnosis', block: spine.executiveDiagnosis },
    { path: 'systemicThemeSummary', block: spine.systemicThemeSummary },
    { path: 'centralManagementImplication', block: spine.centralManagementImplication },
    { path: 'route', block: spine.route }
  ], pack, issues: report.issues, allowEmptyClaimsForTransition: false });
  report.ok = report.issues.length === 0;
  return report;
}

function expectedSectionIds(plan: NarrativeStoryPlan): Set<string> { return new Set(plan.movements.flatMap((movement) => movement.sectionIds)); }

export function validateNarrativeManuscript(manuscript: NarrativeManuscript, pack: NarrativeFactPack, plan: NarrativeStoryPlan, stage: 'manuscript' | 'coherence' = 'manuscript'): NarrativeValidationReport {
  const report = base(stage, pack);
  if (manuscript.bibleVersion !== '1.1' || manuscript.schemaVersion !== 'mk-reporting-bible-1.1-manuscript-v1') report.issues.push(issue('wrong_bible_version', '$', 'Manuscript must use the v1.1 manuscript contract.'));
  if (manuscript.productTier !== pack.productTier) report.issues.push(issue('wrong_product_tier', 'productTier', 'Manuscript tier does not match Fact Pack.'));
  if (manuscript.organisationName !== pack.organisation.name) report.issues.push(issue('organisation_mismatch', 'organisationName', 'Manuscript organisation does not match the Fact Pack.'));
  const expected = expectedSectionIds(plan);
  const actual = new Set(manuscript.sections.map((section) => section.sectionId));
  for (const id of expected) if (!actual.has(id)) report.issues.push(issue('missing_section', 'sections', `Required Story Plan section ${id} is missing.`));
  for (const id of actual) if (!expected.has(id)) report.issues.push(issue('unexpected_section', 'sections', `Section ${id} is not in the Story Plan.`));
  if (actual.size !== manuscript.sections.length) report.issues.push(issue('duplicate_section', 'sections', 'Manuscript section IDs must be unique.'));
  const all = blocks(manuscript);
  report.checkedHeadings = manuscript.sections.length;
  report.checkedParagraphs = manuscript.sections.reduce((count, section) => count + section.paragraphs.length, 0);
  report.checkedClaims = validateBlocks({ blocks: all, pack, issues: report.issues, allowEmptyClaimsForTransition: true });
  const spineValidation = validateNarrativeSpine(manuscript.spine, pack);
  report.issues.push(...spineValidation.issues.map((item) => ({ ...item, path: `spine.${item.path}` })));
  report.ok = report.issues.length === 0;
  return report;
}

export function assertNarrativeValidation(report: NarrativeValidationReport): void {
  if (!report.ok) throw new Error(`Narrative validation failed: ${report.issues.map((item) => `${item.code} at ${item.path}`).join(', ')}`);
}
