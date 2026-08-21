import type { AssembledReportData } from '../types';
import type { NarrativeFactPack } from '../narrative/fact-pack';
import {
  adjudicateTextFirstValidation,
  essentialCandidateId,
  essentialSemanticSpanHash,
  validateEssentialFinalHtml,
  type EssentialValidationCascadeResult
} from '../essential-validation-cascade';
import type {
  ParsedBlueprintMarkdown,
  TextFirstValidationIssue,
  TextFirstValidationReport
} from '../narrative/blueprint-text';
import { adjudicateAssuranceProposition } from '../narrative/assurance-adjudication';
import { normaliseRoleText } from './role-normalisation';
import {
  INTERPRETATION_CONTRACTS,
  validateInterpretation,
  type ComprehensiveInterpretation,
  type InterpretationBrief,
  type InterpretationIssue,
  type InterpretationSlotId
} from './interpretation';

/**
 * Comprehensive uses the same Essential cascade and shared assurance classifier.  The only
 * adapter here is the shape of the six bounded interpretation blocks: there is no Blueprint
 * manuscript to parse, so the adapter presents those blocks to the proven cascade as one
 * provider-authored chapter and keeps the same candidate -> context -> evidence -> document ->
 * final ledger.
 */
export const COMPREHENSIVE_SAFETY_VERSION = 'mk-comprehensive-essential-safety-v1' as const;

export const COMPREHENSIVE_INTERPRETATION_PATHS: Readonly<Record<InterpretationSlotId, string>> = {
  executiveInterpretation: 'comprehensive.interpretation.executiveInterpretation',
  whyThisMatters: 'comprehensive.interpretation.whyThisMatters',
  managementImplication: 'comprehensive.interpretation.managementImplication',
  controlProgrammeSynthesis: 'comprehensive.interpretation.controlProgrammeSynthesis',
  implementationSynthesis: 'comprehensive.interpretation.implementationSynthesis',
  conclusion: 'comprehensive.interpretation.conclusion'
};

export interface ComprehensiveSafetyRepair {
  kind: 'role_normalisation';
  slots: InterpretationSlotId[];
  replacements: number;
}

export interface ComprehensiveSafetyRun {
  policyVersion: typeof COMPREHENSIVE_SAFETY_VERSION;
  publishable: boolean;
  interpretation: ComprehensiveInterpretation;
  issues: InterpretationIssue[];
  repairs: ComprehensiveSafetyRepair[];
  cascade: EssentialValidationCascadeResult;
  acceptedSemanticDecisions: EssentialValidationCascadeResult['acceptedSemanticDecisions'];
  candidateTrace: Array<{
    slot: InterpretationSlotId;
    path: string;
    spanHash: string;
    disposition: 'ALLOW' | 'REPAIR' | 'REJECT' | 'HOLD';
    reasonCode: string;
  }>;
}

const SLOT_IDS = INTERPRETATION_CONTRACTS.map((contract) => contract.id);

// Customer prose is allowed to contain ordinary hyphenated words such as
// "decision-maker".  Canonical report identifiers are emitted in their stable
// uppercase form, so keep this detector case-sensitive; otherwise the DECISION-
// prefix would turn a normal English compound into a false raw-ID finding.
const RAW_INTERNAL_ID = /\b(?:D\d+-Q\d+|(?:MF|RISK|SC|CI|RA|DEC|DECISION|THEME|FINDING|CONTROL|PROOF|ROADMAP)-[A-Z0-9-]+)\b/;
const SECRET_OR_INFRASTRUCTURE = /\b(?:AI_GATEWAY_API_KEY|VERCEL_AI_GATEWAY_API_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_ANON_KEY|DATABASE_URL|postgres(?:ql)?|supabase|vercel|deployment|technical reference|admin route|Preview environment)\b/i;
const INVENTED_EVENT = /\b(?:the organisation|the company's?|Cedar Ridge(?:'s)?|it)\s+(?:suffered|experienced|lost|reported|detected|identified|discovered)\b|\b(?:an incident|fraud|a loss)\s+(?:occurred|has occurred|was detected|was reported)\b/i;
const UNSUPPORTED_BENCHMARK = /\b(?:industry average|peer(?:s)?|benchmark(?:ed|ing)?|percentile|market average|typical for organisations)\b/i;
const COMPLETED_ASSURANCE = /\b(?:is|are|was|were|has|have|had)\s+(?:been\s+)?(?:independently\s+)?(?:verified|validated|tested|confirmed|assured|audited)\b/i;
const EXPOSURE_BANDS = ['Low', 'Moderate', 'High', 'Very high'] as const;

function parsedInterpretation(interpretation: ComprehensiveInterpretation): ParsedBlueprintMarkdown {
  return {
    ok: true,
    markdown: SLOT_IDS.map((slot) => `## ${slot}`).join('\n\n'),
    errors: [],
    chapters: [{
      chapterId: 'COMPREHENSIVE-INTERPRETATION',
      title: 'Comprehensive interpretation',
      sections: [{
        chapterId: 'COMPREHENSIVE-INTERPRETATION',
        sectionId: 'COMPREHENSIVE-INTERPRETATION-SECTION',
        title: 'Bounded management interpretation',
        paragraphs: SLOT_IDS.map((slot) => ({ text: interpretation[slot], permittedClaimRefs: [] })),
        subsections: [],
        permittedClaimRefs: []
      }]
    }]
  };
}

function reportFromIssues(issues: InterpretationIssue[]): TextFirstValidationReport {
  const hardTruth: TextFirstValidationIssue[] = [];
  const quality: TextFirstValidationIssue[] = [];
  for (const issue of issues) {
    const target = issue.kind === 'QUALITY' ? quality : hardTruth;
    const code = issue.code === 'UNSUPPORTED_NUMBER' ? 'unsupported_numeric_claim'
      : issue.code === 'ASSURANCE_CLAIM' ? 'assurance_claim'
        : issue.code === 'CLAIMS_OBSERVATION' ? 'unsupported_observation_claim'
          : issue.code === 'FILLER' ? 'mechanical_format'
            : issue.code.toLowerCase();
    target.push({
      code,
      severity: issue.kind === 'QUALITY' ? 'QUALITY_FAILURE' : 'HARD_TRUTH_FAILURE',
      path: COMPREHENSIVE_INTERPRETATION_PATHS[issue.slot],
      matchedSpan: issue.detail,
      message: issue.detail
    });
  }
  return {
    ok: hardTruth.length === 0,
    hardTruth: { status: hardTruth.length ? 'FAIL' : 'PASS', issues: hardTruth },
    semanticCandidates: { status: 'PASS', issues: [] },
    repairableSemantic: { status: 'PASS', issues: [] },
    quality: { status: quality.length ? 'QUALITY_FAILURE' : 'PASS', issues: quality },
    sectionCount: 1,
    subsectionCount: 0,
    paragraphCount: SLOT_IDS.length
  };
}

function slotIssues(issues: readonly InterpretationIssue[], slot: InterpretationSlotId): InterpretationIssue[] {
  return issues.filter((issue) => issue.slot === slot);
}

function safetyIssueForSurface(brief: InterpretationBrief, slot: InterpretationSlotId, text: string): InterpretationIssue[] {
  const issues: InterpretationIssue[] = [];
  if (RAW_INTERNAL_ID.test(text)) issues.push({ slot, kind: 'HARD_TRUTH', code: 'RAW_INTERNAL_IDENTIFIER', detail: 'Technical identifiers must remain in the supporting registers.' });
  if (SECRET_OR_INFRASTRUCTURE.test(text)) issues.push({ slot, kind: 'HARD_TRUTH', code: 'SECRET_OR_INFRASTRUCTURE_REFERENCE', detail: 'Secrets and infrastructure references are not customer-facing content.' });
  const explicitLimitation = /\b(?:not|no|never|without)\b[^.]{0,80}\b(?:incident|fraud|loss)\b/i.test(text) || /\bnot a claim that\b/i.test(text);
  const organisationStem = brief.organisationName.split('(')[0]?.trim() ?? brief.organisationName;
  const namedOrganisationEvent = organisationStem && new RegExp(`\\b${organisationStem.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&')}(?:'s)?\\s+(?:suffered|experienced|lost|reported|detected|identified|discovered)\\b`, 'i').test(text);
  const eventSentence = text.split(/[.!?]/, 1)[0] ?? text;
  if ((INVENTED_EVENT.test(text) || namedOrganisationEvent) && !explicitLimitation && !/\b(?:could|may|might|if|should|would|potentially|conditional)\b/i.test(eventSentence)) {
    issues.push({ slot, kind: 'HARD_TRUTH', code: 'INVENTED_INCIDENT_OR_LOSS', detail: 'The evidence pack does not record a completed incident or loss.' });
  }
  if (UNSUPPORTED_BENCHMARK.test(text) && !/\b(?:no|not|without)\s+(?:benchmark|peer|industry)\b/i.test(text)) {
    issues.push({ slot, kind: 'HARD_TRUTH', code: 'UNSUPPORTED_BENCHMARK', detail: 'The evidence pack contains no benchmark or peer comparison.' });
  }
  const exposureBand = brief.evidencePack.assessment.exposureBand;
  if (exposureBand) {
    for (const band of EXPOSURE_BANDS) {
      if (band === exposureBand) continue;
      const pattern = new RegExp(`\\b${band.replace(' ', '\\s+')}\\b\\s+exposure`, 'i');
      if (pattern.test(text)) issues.push({ slot, kind: 'HARD_TRUTH', code: 'EXPOSURE_CONTRADICTION', detail: `states ${band} exposure; assessed exposure is ${exposureBand}` });
    }
  }
  if (COMPLETED_ASSURANCE.test(text) && !/\b(?:should|must|needs to|would|could|may|whether|not|no|without)\b/i.test(text)) {
    const assurance = adjudicateAssuranceProposition(text);
    if (assurance.disposition !== 'ALLOW') issues.push({ slot, kind: assurance.disposition === 'REJECT' ? 'HARD_TRUTH' : 'SEMANTIC', code: 'ASSURANCE_CLAIM', detail: assurance.matched ?? 'Completed assurance language requires adjudication.' });
  }
  return issues;
}

function semanticDecisionForSlot(
  brief: InterpretationBrief,
  slot: InterpretationSlotId,
  text: string,
  issues: readonly InterpretationIssue[]
): { disposition: 'ALLOW' | 'REPAIR' | 'REJECT' | 'HOLD'; reasonCode: string } {
  const assurance = adjudicateAssuranceProposition(text);
  if (assurance.disposition === 'REJECT') return { disposition: 'REJECT', reasonCode: assurance.reasonCode };
  if (assurance.disposition === 'AMBIGUOUS') return { disposition: 'HOLD', reasonCode: assurance.reasonCode };
  const current = slotIssues(issues, slot);
  if (current.some((issue) => issue.kind === 'HARD_TRUTH')) return { disposition: 'REJECT', reasonCode: current[0]!.code.toLowerCase() };
  if (current.some((issue) => issue.kind === 'QUALITY')) return { disposition: 'REJECT', reasonCode: 'customer_visible_quality_failure' };
  if (current.some((issue) => issue.kind === 'SEMANTIC')) return { disposition: 'HOLD', reasonCode: 'unresolved_semantic_ambiguity' };
  return { disposition: 'ALLOW', reasonCode: 'grounded' };
}

function effectiveInterpretationIssues(brief: InterpretationBrief, interpretation: ComprehensiveInterpretation): InterpretationIssue[] {
  const base = validateInterpretation(interpretation, brief);
  const surface = SLOT_IDS.flatMap((slot) => safetyIssueForSurface(brief, slot, interpretation[slot]));
  // The shared adjudicator is authoritative for assurance context. A recommendation, proof
  // criterion or explicit limitation is not retained as a false hard failure from the older
  // slot validator; positive/ambiguous assurance remains blocked by the shared result below.
  return [...base.filter((issue) => issue.code !== 'ASSURANCE_CLAIM'), ...surface];
}

function buildCascade(
  interpretation: ComprehensiveInterpretation,
  brief: InterpretationBrief,
  factPack: NarrativeFactPack,
  issues: InterpretationIssue[]
): EssentialValidationCascadeResult {
  const parsed = parsedInterpretation(interpretation);
  const report = reportFromIssues(issues);
  const semanticDecisions = SLOT_IDS.map((slot) => {
    const path = COMPREHENSIVE_INTERPRETATION_PATHS[slot];
    const decision = semanticDecisionForSlot(brief, slot, interpretation[slot], issues);
    return {
      candidateId: essentialCandidateId('semantic_grounding_block', path, interpretation[slot]),
      disposition: decision.disposition,
      reasonCode: decision.reasonCode
    } as const;
  });
  return adjudicateTextFirstValidation({
    parsed,
    report,
    factPack,
    semanticDecisions,
    requireSemanticReviewer: true,
    semanticGroundingBlocks: SLOT_IDS.map((slot) => ({ path: COMPREHENSIVE_INTERPRETATION_PATHS[slot], span: interpretation[slot] }))
  });
}

function traceForCascade(cascade: EssentialValidationCascadeResult, interpretation: ComprehensiveInterpretation): ComprehensiveSafetyRun['candidateTrace'] {
  return SLOT_IDS.map((slot) => {
    const path = COMPREHENSIVE_INTERPRETATION_PATHS[slot];
    const candidate = cascade.candidates.find((item) => item.ruleCode === 'semantic_grounding_block' && item.path === path);
    const finalDisposition = candidate?.finalDisposition;
    const disposition = finalDisposition === 'ACCEPT' ? 'ALLOW'
      : finalDisposition === 'REPAIR' ? 'REPAIR'
        : finalDisposition === 'REJECT' ? 'REJECT' : 'HOLD';
    const decision = candidate?.decisions.find((item) => item.layer === 'CONTEXT_ADJUDICATION');
    return { slot, path, spanHash: essentialSemanticSpanHash(interpretation[slot]), disposition, reasonCode: decision?.reasonCode ?? 'missing_candidate' };
  });
}

/**
 * Validates and, once only, applies the closed role-label repair already used by the Comprehensive
 * role layer. No phrase dictionary rewrites assurance or factual content. Anything else is
 * rejected or held by the shared Essential cascade.
 */
export function validateComprehensiveInterpretationSafety(input: {
  interpretation: ComprehensiveInterpretation;
  brief: InterpretationBrief;
  factPack: NarrativeFactPack;
}): ComprehensiveSafetyRun {
  let interpretation = input.interpretation;
  const repairs: ComprehensiveSafetyRepair[] = [];
  let issues = effectiveInterpretationIssues(input.brief, interpretation);
  const roleSlots = issues.filter((issue) => issue.code === 'ROLE_LABEL_DRIFT').map((issue) => issue.slot);
  if (roleSlots.length) {
    const repaired: ComprehensiveInterpretation = { ...interpretation };
    let replacements = 0;
    for (const slot of roleSlots) {
      const next = normaliseRoleText(repaired[slot]);
      if (next !== repaired[slot]) replacements += 1;
      repaired[slot] = next;
    }
    interpretation = repaired;
    repairs.push({ kind: 'role_normalisation', slots: [...new Set(roleSlots)], replacements });
    issues = effectiveInterpretationIssues(input.brief, interpretation);
  }
  const cascade = buildCascade(interpretation, input.brief, input.factPack, issues);
  return {
    policyVersion: COMPREHENSIVE_SAFETY_VERSION,
    publishable: cascade.publishable && issues.length === 0,
    interpretation,
    issues,
    repairs,
    cascade,
    acceptedSemanticDecisions: cascade.acceptedSemanticDecisions,
    candidateTrace: traceForCascade(cascade, interpretation)
  };
}

export function validateComprehensiveFinalHtml(input: {
  html: string;
  data: AssembledReportData;
  safety: ComprehensiveSafetyRun;
}): EssentialValidationCascadeResult {
  return validateEssentialFinalHtml({
    html: input.html,
    data: input.data,
    carryForwardSemanticDecisions: input.safety.acceptedSemanticDecisions
  });
}
