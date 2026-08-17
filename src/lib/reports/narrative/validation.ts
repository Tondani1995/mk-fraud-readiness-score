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
  { code: 'mechanical_field_label', pattern: /\b(?:within .{0,100}, the specific control on whether|recorded control condition)\b/i, message: 'Questionnaire-to-paragraph construction is prohibited.' },
  { code: 'accusatory_tone', pattern: /\bmanagement failed\b|\bthe organisation cannot detect fraud\b/i, message: 'Accusatory or absolute customer language is prohibited.' }
];

export interface AssuranceLanguageClassification {
  category: 'prohibited_assurance' | 'customer_control_activity';
  matched: string;
}

const ABSOLUTELY_PROHIBITED_ASSURANCE = [
  /\b(?:evidence-linked|evidence-based)\b.{0,100}\b(?:assurance|validation|validated|verified|confirmed|effective|operating effectiveness)\b/i,
  /\b(?:assurance|validation|validated|verified|confirmed|effective|operating effectiveness)\b.{0,100}\b(?:evidence-linked|evidence-based)\b/i,
  /\bvalidated operating effectiveness\b/i,
  /\bevidence validated\b/i,
  /\breviewer judgement\b/i,
  /\bMK\b.{0,100}\b(?:independently\s+(?:verified|reviewed)|independent\s+(?:verification|review)|reviewed evidence|tested\s+(?:the\s+)?(?:operation|operating effectiveness|controls?)|independently confirmed)\b/i,
  /\b(?:the assessment|this assessment|the findings?|the report|this report)\b.{0,100}\b(?:independently\s+(?:verified|reviewed)|independent\s+(?:verification|review)|provides?\s+(?:independent\s+)?assurance|confirmed)\b/i,
  /\b(?:independent\s+(?:verification|review)|independently\s+(?:verified|reviewed))\b.{0,100}\b(?:confirmed|established|demonstrates?|shows?)\b.{0,100}\b(?:control|operating effectiveness|operates? effectively)\b/i,
  /\boperating effectiveness\b.{0,80}\b(?:was|were|has been|have been|is|are)\s+(?:independently\s+(?:verified|reviewed)|validated|established|confirmed)\b/i,
  /\b(?:the\s+)?evidence\b.{0,40}\b(?:was|were|has been|have been)\s+validated\b/i,
  /\b(?:MK(?:'s)?|the reviewer(?:'s)?)\s+review\b.{0,100}\b(?:confirmed|established|assured|operating effectiveness)\b/i,
  /\b(?:the report|this report)\b.{0,80}\bprovides?\s+(?:independent\s+)?assurance\b/i
];

const NEGATED_ASSURANCE_DISCLAIMER = /\b(?:not|does not|do not|without)\s+(?:a\s+statement\s+that\s+)?(?:existing\s+)?(?:evidence|controls?|operating effectiveness)\s+(?:has been|was|were|is|are)\s+(?:independently\s+)?(?:validated|verified|confirmed|established|assured)\b/i;

const AMBIGUOUS_CONTROL_VERIFICATION = /\bindependent(?:ly)?\s+(?:verif(?:y|ied)|verification|review(?:ed)?)\b/i;
const CONTROL_ACTIVITY_SUBJECT = /\b(?:supplier|bank[- ]detail|payment|profile|identity|privileged(?:[- ]access)?|access|recertification|activation|change(?:s)?|approval|callback|verification step|control(?:s)? activity|control design|payment release|release)\b/i;
const CONTROL_ACTIVITY_ACTION = /\b(?:should|must|require(?:s|d)?|need(?:s)?\s+to|include(?:s)?|involve(?:s)?|subject to|through|before|after|during|retain\s+(?:proof|evidence)|record|complete(?:d)?|is|are)\b/i;
const DIRECT_CONTROL_ACTIVITY = /\bindependent(?:ly)?\s+(?:verif(?:y|ied)|review(?:ed)?)\s+(?:supplier|bank[- ]detail|payment|profile|identity|privileged(?:[- ]access)?|access|recertification|changes?)\b/i;
const MK_ASSURANCE_ACTOR = /\b(?:by|from)\s+MK\b/i;
// A recommendation for the customer to perform an independent review is a control-design action,
// not a claim that MK, the assessment or the report has provided assurance. Keep the exception
// deliberately normative: past-tense assertions remain fail-closed unless another existing control
// activity rule proves them safe.
const CUSTOMER_RECOMMENDED_INDEPENDENT_REVIEW = /(?:^|[.!?]\s+)\s*independently\s+(?:review|verify)\b|\b(?:should|must|need(?:s)?\s+to|is required to|are required to)\s+independently\s+(?:review|verify)\b/i;
// Even normative wording remains prohibited when the proposed reviewer is MK or the report itself.
const PROHIBITED_ASSURANCE_SUBJECT = /\b(?:MK|the assessment|this assessment|the findings?|the report|this report)\b.{0,120}\b(?:should|must|need(?:s)?\s+to|is required to|are required to)?\s*independently\s+(?:review|verify)\b/i;
// Narrow, deterministic exception for the supplied management-versus-assurance role-separation
// control. Generic independent-review wording remains fail-closed.
const CUSTOMER_GOVERNANCE_ROLE_SEPARATION = /\b(?:management|internal audit|equivalent assurance function|assurance function)\b.{0,180}\bindependent review(?: responsibilities)?\b|\bindependent review(?: responsibilities)?\b.{0,180}\b(?:management|internal audit|equivalent assurance function|assurance function)\b/i;

/**
 * Classifies only assurance language in customer-facing narrative text. Explicit claims about MK,
 * the assessment, the report or operating effectiveness remain blocking. The ambiguous
 * independent-verification/review wording is allowed only when it is clearly framed as a customer
 * control activity; otherwise it fails closed.
 */
export function classifyAssuranceLanguage(text: string): AssuranceLanguageClassification | null {
  const assuranceText = text.replace(NEGATED_ASSURANCE_DISCLAIMER, '');
  for (const pattern of ABSOLUTELY_PROHIBITED_ASSURANCE) {
    const match = assuranceText.match(pattern);
    if (match) return { category: 'prohibited_assurance', matched: match[0] };
  }

  const ambiguous = assuranceText.match(AMBIGUOUS_CONTROL_VERIFICATION);
  if (!ambiguous) return null;
  if (MK_ASSURANCE_ACTOR.test(assuranceText) || PROHIBITED_ASSURANCE_SUBJECT.test(assuranceText)) {
    return { category: 'prohibited_assurance', matched: ambiguous[0] };
  }

  const hasControlSubject = CONTROL_ACTIVITY_SUBJECT.test(assuranceText);
  const hasControlAction = CONTROL_ACTIVITY_ACTION.test(assuranceText);
  if ((hasControlSubject && hasControlAction)
    || DIRECT_CONTROL_ACTIVITY.test(assuranceText)
    || CUSTOMER_RECOMMENDED_INDEPENDENT_REVIEW.test(assuranceText)
    || CUSTOMER_GOVERNANCE_ROLE_SEPARATION.test(assuranceText)) {
    return { category: 'customer_control_activity', matched: ambiguous[0] };
  }
  return { category: 'prohibited_assurance', matched: ambiguous[0] };
}

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
    const assurance = classifyAssuranceLanguage(text);
    if (assurance?.category === 'prohibited_assurance') input.issues.push(issue('assurance_claim', path, `Unsupported assurance language is prohibited outside Advisory (${assurance.matched}).`));
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
