import { z } from 'zod';
import { generateText, Output } from 'ai';
import type { ComprehensiveManagementModel } from './management-model';
import { claimsVerification } from './product-contract';
import { comprehensiveAssessmentScopeStatement, type ComprehensiveAssessmentScope } from './assessment-scope';
import type { NarrativeRecoveryBudget } from '../narrative/recovery-policy';
import {
  COMPREHENSIVE_PRIMARY_MODEL,
  COMPREHENSIVE_TECHNICAL_MODEL_CHAIN,
  COMPREHENSIVE_MAX_TARGETED_REPAIRS,
  assertComprehensiveRecoveryBudget,
  classifyComprehensiveRecoveryIssue,
  comprehensiveRecoveryDecision,
  dominantComprehensiveRecoverySeverity,
  emptyComprehensiveRecoveryBudget
} from './recovery-policy';

/**
 * Bounded interpretation for the Comprehensive management core.
 *
 * The analysis creates the value; this explains it. Six slots, each with its own
 * source authority and its own management question, and none of them permitted
 * to introduce a finding, risk, control, owner, action, measure or number that
 * the deterministic model did not already produce.
 *
 * One structured request returns all six. Six independent calls would cost six
 * times the latency for no reliability gain, and the slots share one brief, so
 * they are generated together and validated apart. A field that fails is
 * repaired on its own; the other five are never regenerated.
 *
 * Nothing here touches the registers. Those are deterministic and stay that way.
 */

export const COMPREHENSIVE_INTERPRETATION_VERSION = 'mk-comprehensive-interpretation-v1' as const;
/**
 * Comprehensive is a R35k management product and its proven writer model is an
 * explicit product contract. Do not inherit this from Essential's fallback
 * ordering: changing an unrelated tier's model policy must never silently
 * change the model that writes Comprehensive interpretation.
 */
export const COMPREHENSIVE_INTERPRETATION_MODEL = COMPREHENSIVE_PRIMARY_MODEL;

export type InterpretationSlotId =
  | 'executiveInterpretation'
  | 'whyThisMatters'
  | 'managementImplication'
  | 'controlProgrammeSynthesis'
  | 'implementationSynthesis'
  | 'conclusion';

export interface InterpretationSlotContract {
  id: InterpretationSlotId;
  /** Where this appears in the report. */
  label: string;
  managementQuestion: string;
  responsibility: string;
  mayUse: string[];
  mustNotDo: string[];
  minWords: number;
  maxWords: number;
}

export const INTERPRETATION_CONTRACTS: ReadonlyArray<InterpretationSlotContract> = [
  {
    id: 'executiveInterpretation',
    label: 'Executive interpretation',
    managementQuestion: 'Where does this organisation stand, and what is the most important relationship between its capabilities?',
    responsibility: 'Explain the assessed position and the single most important relationship between capabilities.',
    mayUse: ['overall score', 'maturity band', 'the report posture', 'domain profile', 'management theme titles and counts'],
    mustNotDo: ['name the posture as a mode or label', 'list individual findings', 'describe control designs', 'restate the roadmap'],
    minWords: 110, maxWords: 190
  },
  {
    id: 'whyThisMatters',
    label: 'Why this matters',
    managementQuestion: 'Why does the material exposure pattern matter operationally?',
    // The first live run answered this by walking all six themes in order,
    // each as "X contains N risks, <participle> Y". Every sentence carried a
    // consequence, so nothing was false — it simply read the table aloud at
    // uniform weight. Prioritising is the work; the table already lists.
    responsibility: 'Take the two or three largest exposure concentrations and explain the operating mechanism: how value or trust actually leaves the organisation through normal activity. Prioritise; do not survey.',
    mayUse: ['the largest exposure themes and their risk counts', 'fraud mechanisms named in the themes'],
    mustNotDo: ['walk through every exposure theme in turn', 'give each theme one sentence of equal weight', 'invent an incident', 'invent a financial impact', 'repeat the executive interpretation', 'describe control designs'],
    minWords: 90, maxWords: 170
  },
  {
    id: 'managementImplication',
    label: 'Management implication',
    managementQuestion: 'What response does this require from management?',
    // The first live run produced a list of governance abstractions —
    // "accountable mandates, escalation authority, target standards,
    // sequencing principles" — that would fit any report at any score. The
    // decision agenda holds the specifics; anchor on those instead.
    responsibility: 'Name the specific decisions this organisation has to take, drawn from the decision agenda, and say what each one unblocks. Concrete choices with owners, not governance abstractions.',
    mayUse: ['decision agenda entries and their owners', 'management theme titles', 'control programme priorities'],
    mustNotDo: ['list generic governance activities that would fit any organisation', 'repeat individual roadmap actions', 'repeat detailed control specifications', 'repeat why this matters'],
    minWords: 90, maxWords: 170
  },
  {
    id: 'controlProgrammeSynthesis',
    label: 'Control programme synthesis',
    managementQuestion: 'How do the recommended control programmes work together?',
    responsibility: 'Explain how the programmes reinforce one another and where the dependencies sit.',
    mayUse: ['control programme titles', 'control counts', 'accountable roles', 'evidence volumes'],
    mustNotDo: ['repeat every control blueprint', 'state that a control currently exists', 'claim MK tested anything'],
    minWords: 110, maxWords: 190
  },
  {
    id: 'implementationSynthesis',
    label: 'Implementation synthesis',
    managementQuestion: 'Why is the implementation sequenced this way?',
    responsibility: 'Explain the logic of the sequence and what each horizon unlocks for the next.',
    mayUse: ['phase names', 'action counts per phase', 'programmes advanced per phase', 'decision prerequisites'],
    mustNotDo: ['repeat the action register', 'invent dates', 'invent costs or effort estimates'],
    minWords: 90, maxWords: 170
  },
  {
    id: 'conclusion',
    label: 'Conclusion',
    managementQuestion: 'What would successful progression actually mean?',
    responsibility: 'Close with what good looks like and how management would know it is being achieved.',
    mayUse: ['assessed position', 'programme priorities', 'measurement logic'],
    mustNotDo: ['introduce new analysis', 'repeat the executive interpretation'],
    minWords: 70, maxWords: 150
  }
];

const SUSTAINMENT_WHY_THIS_MATTERS_CONTRACT: InterpretationSlotContract = {
  id: 'whyThisMatters',
  label: 'Why this matters',
  managementQuestion: 'What does the strong position depend on, and what could cause it to deteriorate?',
  responsibility: 'Explain why the selected assurance and resilience priorities matter to preserving the reported position. Connect the capabilities to their dependencies and deterioration signals. Treat them as capabilities to confirm and sustain, never as current weaknesses or material exposures.',
  mayUse: ['assurance priority capabilities and why they matter', 'resilience dependencies and deterioration conditions', 'assurance coverage postures and capabilities to preserve'],
  mustNotDo: ['describe a current material exposure concentration', 'convert an assurance priority into a finding or weakness', 'imply a control has failed', 'claim evidence has been validated', 'survey every domain in turn'],
  minWords: 90, maxWords: 170
};

function interpretationContractsForBrief(brief: InterpretationBrief): ReadonlyArray<InterpretationSlotContract> {
  if (brief.narrativeMode !== 'SUSTAINMENT') return INTERPRETATION_CONTRACTS;
  return INTERPRETATION_CONTRACTS.map((contract) =>
    contract.id === 'whyThisMatters' ? SUSTAINMENT_WHY_THIS_MATTERS_CONTRACT : contract
  );
}

export const interpretationSchema = z.object({
  executiveInterpretation: z.string().min(1),
  whyThisMatters: z.string().min(1),
  managementImplication: z.string().min(1),
  controlProgrammeSynthesis: z.string().min(1),
  implementationSynthesis: z.string().min(1),
  conclusion: z.string().min(1)
}).strict();

export type ComprehensiveInterpretation = z.infer<typeof interpretationSchema>;

/**
 * The deterministic brief.
 *
 * Deliberately small: theme and programme summaries, not registers. Sending 34
 * control designs and 139 evidence items would cost tokens to produce prose that
 * must not mention them anyway.
 */
export interface InterpretationBrief {
  organisationName: string;
  score: number;
  maturity: string;
  narrativeMode: string;
  assessmentScope?: ComprehensiveAssessmentScope | null;
  domains: Array<{ name: string; score: number; band: string }>;
  managementThemes: Array<{ title: string; findings: number; critical: number; hardGate: number; question: string }>;
  exposureThemes: Array<{ title: string; risks: number; question: string }>;
  controlProgrammes: Array<{ title: string; controls: number; evidence: number; measures: number; owner: string; horizons: string[] }>;
  governance: Array<{ role: string; type: string; controls: number; decisions: number }>;
  decisions: Array<{ decision: string; whyNow: string; owner: string; targetPeriod: string }>;
  phases: Array<{ phase: string; actions: number; programmes: string[] }>;
  assuranceCoverage: Array<{
    domain: string; score: number; maturity: string; posture: string;
    capabilityToPreserve: string; deteriorationSignal: string; reviewRhythm: string;
  }>;
  assurancePriorities: Array<{
    capability: string; domain: string; priorityClass: string; whyItMatters: string;
    deteriorationTrigger: string; earlyWarningSignal: string; accountableExecutive: string;
  }>;
  resilienceTests: Array<{
    capability: string; domain: string; dependencyToTest: string[];
    deteriorationCondition: string; effectivenessSignal: string; reviewRhythm: string;
  }>;
  totals: { findings: number; risks: number; controls: number; evidenceItems: number; actions: number };
}

export function buildInterpretationBrief(input: {
  model: ComprehensiveManagementModel;
  organisationName: string;
  score: number;
  maturity: string;
  assessmentScope?: ComprehensiveAssessmentScope | null;
  domains: Array<{ name: string; score: number; band: string }>;
}): InterpretationBrief {
  const { model } = input;
  const roleName = new Map(model.core.governanceRoles.map((role) => [role.canonicalRoleId, role.displayRole]));
  return {
    organisationName: input.organisationName,
    score: input.score,
    maturity: input.maturity,
    narrativeMode: model.narrativeMode,
    assessmentScope: input.assessmentScope ?? null,
    domains: input.domains,
    managementThemes: model.core.managementThemes.map((theme) => ({ title: theme.title, findings: theme.findingIds.length, critical: theme.criticalFindingCount, hardGate: theme.hardGateFindingCount, question: theme.managementQuestion })),
    exposureThemes: model.core.exposureThemes.map((theme) => ({ title: theme.title, risks: theme.riskIds.length, question: theme.managementQuestion })),
    controlProgrammes: model.core.controlProgrammes.map((programme) => ({ title: programme.title, controls: programme.controlIds.length, evidence: programme.evidenceItemCount, measures: programme.measureCount, owner: roleName.get(programme.accountableRoleId) ?? '', horizons: programme.targetPeriods })),
    governance: model.core.governanceRoles.map((role) => ({ role: role.displayRole, type: role.roleType, controls: role.controls.length, decisions: role.decisions.length })),
    decisions: model.core.decisionAgenda.map((decision) => ({ decision: decision.decisionRequired, whyNow: decision.whyNow, owner: decision.ownerRole, targetPeriod: decision.targetPeriod })),
    phases: model.core.implementationPhases.map((phase) => ({ phase: phase.phase, actions: phase.actionIds.length, programmes: phase.programmeIds })),
    assuranceCoverage: model.registers.assuranceCoverage.map((row) => ({
      domain: row.domain,
      score: row.score,
      maturity: row.maturity,
      posture: row.posture,
      capabilityToPreserve: row.capabilityToPreserve,
      deteriorationSignal: row.deteriorationSignal,
      reviewRhythm: row.reviewRhythm
    })),
    assurancePriorities: model.registers.assurancePriorities.map((row) => ({
      capability: row.capability,
      domain: row.domain,
      priorityClass: row.priorityClass,
      whyItMatters: row.whyItMatters,
      deteriorationTrigger: row.deteriorationTrigger,
      earlyWarningSignal: row.earlyWarningSignal,
      accountableExecutive: row.accountableExecutive
    })),
    resilienceTests: model.registers.resilienceTests.map((row) => ({
      capability: row.capability,
      domain: row.domain,
      dependencyToTest: row.dependencyToTest,
      deteriorationCondition: row.deteriorationCondition,
      effectivenessSignal: row.effectivenessSignal,
      reviewRhythm: row.reviewRhythm
    })),
    totals: {
      findings: model.registers.findings.length, risks: model.registers.risks.length,
      controls: model.registers.controls.length,
      evidenceItems: model.registers.evidence.reduce((sum, group) => sum + group.items.length, 0),
      actions: model.registers.actions.length
    }
  };
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type InterpretationIssueKind = 'HARD_TRUTH' | 'SEMANTIC' | 'QUALITY';
export interface InterpretationIssue { slot: InterpretationSlotId; kind: InterpretationIssueKind; code: string; detail: string }

const words = (value: string): number => value.trim().split(/\s+/).filter(Boolean).length;

/** Every number the brief authorises, as bare tokens. */
function authorisedNumbers(brief: InterpretationBrief): Set<string> {
  const out = new Set<string>();
  const add = (value: unknown) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return;
    out.add(String(num));
    out.add(num.toFixed(2));
    out.add(String(Math.round(num)));
  };
  add(brief.score);
  if (brief.assessmentScope) {
    add(brief.assessmentScope.applicableCount);
    add(brief.assessmentScope.excludedCount);
    add(brief.assessmentScope.redirectedCount);
    add(brief.assessmentScope.invalidatedCount);
    add(brief.assessmentScope.unknownCount);
    add(brief.assessmentScope.unansweredApplicableCount);
    add(brief.assessmentScope.assessmentCoveragePct);
    add(brief.assessmentScope.controlVisibilityPct);
  }
  for (const domain of brief.domains) add(domain.score);
  for (const theme of brief.managementThemes) { add(theme.findings); add(theme.critical); add(theme.hardGate); }
  for (const theme of brief.exposureThemes) add(theme.risks);
  for (const programme of brief.controlProgrammes) { add(programme.controls); add(programme.evidence); add(programme.measures); }
  for (const phase of brief.phases) add(phase.actions);
  for (const value of Object.values(brief.totals)) add(value);
  for (const row of brief.assuranceCoverage) add(row.score);
  add(brief.managementThemes.length); add(brief.exposureThemes.length);
  add(brief.controlProgrammes.length); add(brief.decisions.length); add(brief.phases.length);
  add(brief.governance.length); add(brief.domains.length);
  add(brief.assuranceCoverage.length); add(brief.assurancePriorities.length); add(brief.resilienceTests.length);
  // Ordinals and durations that appear in phase names are part of the brief.
  for (const phase of brief.phases) for (const token of phase.phase.match(/\d+/g) ?? []) out.add(token);
  return out;
}

/** Language that only makes sense if someone examined the organisation. */
const OBSERVATION_VOICE = [
  /\bwe (?:observed|found|noted|saw)\b/i,
  /\bour (?:review|testing|fieldwork)\b/i,
  /\bwas found to\b/i,
  /\bevidence (?:showed|confirmed|demonstrated)\b/i
];

/** Consultancy filler that adds length without meaning. */
const FILLER = [
  /\bin today's (?:business )?environment\b/i,
  /\bit is important to note\b/i,
  /\bbest[- ]in[- ]class\b/i,
  /\bworld[- ]class\b/i,
  /\bleverage synergies\b/i,
  /\bat the end of the day\b/i,
  /\bgoing forward,? it\b/i
];

/** Remediation language a sustainment report must not use about itself. */
const MANUFACTURED_WEAKNESS = [
  /\bcritical (?:gap|weakness|failure)\b/i,
  /\bmaterial weakness\b/i,
  /\bcontrol failure\b/i,
  /\bseverely\b/i,
  /\bremediate the (?:failure|breakdown)\b/i
];

const NEGATOR = /\b(?:no|not|never|none|without|nothing)\b/i;

/** Internal construct names that must never reach a customer-facing page. */
const ENGINE_VOCABULARY = [
  /\b(?:SUSTAINMENT|REMEDIATION|MIXED)\b/,
  /\b(?:sustainment|remediation|mixed)\s+mode\b/i,
  /\bnarrative\s+mode\b/i,
  /\bsemantic\s+famil(?:y|ies)\b/i,
  /\bfact\s+pack\b/i,
  /\bhard[- ]gate\b/i,
  /\bbounded\s+(?:slot|section|narrative)\b/i,
  /\bmanagement\s+model\b/i
];

/**
 * Executive abbreviations mapped to the canonical label they stand in for.
 *
 * Deliberately a short explicit list rather than derived initials: the canonical
 * "Chief Executive / Managing Director" yields no acronym a reader would guess,
 * so derivation would miss the exact drift that prompted the rule.
 */
const EXECUTIVE_ABBREVIATIONS: Record<string, string> = {
  CEO: 'chief executive',
  CFO: 'chief financial',
  COO: 'chief operating',
  CTO: 'chief technology',
  CIO: 'chief information',
  CRO: 'chief risk',
  CISO: 'chief information security',
  CPO: 'chief people'
};

export function validateInterpretation(result: Partial<ComprehensiveInterpretation>, brief: InterpretationBrief): InterpretationIssue[] {
  const issues: InterpretationIssue[] = [];
  const allowed = authorisedNumbers(brief);
  const entries = interpretationContractsForBrief(brief).map((contract) => [contract, String(result[contract.id] ?? '')] as const);

  for (const [contract, text] of entries) {
    const slot = contract.id;
    if (!text.trim()) { issues.push({ slot, kind: 'HARD_TRUTH', code: 'EMPTY', detail: 'no text returned' }); continue; }
    if (text.includes('\u2014')) issues.push({ slot, kind: 'HARD_TRUTH', code: 'EM_DASH', detail: 'customer narrative contains an em dash' });

    // HARD TRUTH — every number must be one the deterministic model produced.
    //
    // Not \b\d+: there is no word boundary between the R and the digits of
    // "R450000", so a word-boundary pattern let every invented rand figure —
    // the single most damaging fabrication this product could make — through
    // untouched. Anchor on "a digit not preceded by a digit" instead, and
    // strip separators before comparing so "450,000" cannot hide either.
    for (const raw of text.match(/(?<![\d.])\d[\d,]*(?:\.\d+)?/g) ?? []) {
      const token = raw.replace(/,/g, '');
      if (!allowed.has(token)) issues.push({ slot, kind: 'HARD_TRUTH', code: 'UNSUPPORTED_NUMBER', detail: `"${raw}" is not in the deterministic brief` });
    }
    // HARD TRUTH — no assurance claim, no claim of observation.
    const verification = claimsVerification(text);
    if (verification.violation) issues.push({ slot, kind: 'HARD_TRUTH', code: 'ASSURANCE_CLAIM', detail: verification.matched ?? '' });
    for (const pattern of OBSERVATION_VOICE) {
      if (pattern.test(text)) issues.push({ slot, kind: 'HARD_TRUTH', code: 'CLAIMS_OBSERVATION', detail: String(pattern) });
    }
    // HARD TRUTH — adaptive scope is part of the scored truth, not optional prose.
    // A provisional V1.2 result must never be narrated as definitive or fully
    // comparable simply because a numeric score exists.
    if (brief.assessmentScope?.resultStatus === 'PROVISIONAL') {
      if (slot === 'executiveInterpretation' && !/\b(?:provisional|directional)\b/i.test(text)) {
        issues.push({ slot, kind: 'HARD_TRUTH', code: 'PROVISIONAL_STATUS_OMITTED', detail: 'executive interpretation must identify the reported position as provisional or directional' });
      }
      if (/\b(?:definitive result|definitive position|fully comparable|confirmed maturity|confirmed readiness)\b/i.test(text)) {
        issues.push({ slot, kind: 'HARD_TRUTH', code: 'PROVISIONAL_STATUS_CONTRADICTED', detail: 'provisional result described as definitive, confirmed or fully comparable' });
      }
    }

    // HARD TRUTH — the maturity band and mode may not be contradicted.
    for (const band of ['Reactive', 'Developing', 'Structured', 'Strategic']) {
      if (band === brief.maturity) continue;
      const pattern = new RegExp(`\\b${band}\\b\\s+maturity|maturity\\s+(?:band\\s+)?(?:of\\s+)?${band}\\b`, 'i');
      if (pattern.test(text)) issues.push({ slot, kind: 'HARD_TRUTH', code: 'MATURITY_CONTRADICTION', detail: `states ${band}; assessed band is ${brief.maturity}` });
    }
    // HARD TRUTH — a sustainment report must not manufacture weakness.
    if (brief.narrativeMode === 'SUSTAINMENT') {
      for (const pattern of MANUFACTURED_WEAKNESS) {
        const match = text.match(pattern);
        if (!match) continue;
        const lead = text.slice(Math.max(0, (match.index ?? 0) - 40), match.index ?? 0);
        if (NEGATOR.test(lead)) continue;
        issues.push({ slot, kind: 'HARD_TRUTH', code: 'MANUFACTURED_WEAKNESS', detail: match[0] });
      }
      // A high-readiness report may discuss conditional resilience exposure, but
      // it must not recast assurance priorities as a present material exposure.
      // The live V1.2 proof exposed this gap: "the material exposure is
      // concentrated in..." passed because it did not literally say "weakness".
      if (slot === 'whyThisMatters') {
        const currentExposure = text.match(/\b(?:the\s+)?material\s+exposure\s+(?:is|sits|lies|remains|concentrates?|is\s+concentrated)\b/i)
          ?? text.match(/\bcurrent\s+(?:material\s+)?exposure\s+(?:is|sits|lies|remains|concentrates?)\b/i);
        if (currentExposure) {
          issues.push({
            slot,
            kind: 'HARD_TRUTH',
            code: 'SUSTAINMENT_EXPOSURE_AS_WEAKNESS',
            detail: currentExposure[0]
          });
        }
      }
    }
    // HARD TRUTH — the machinery must not appear on the customer's page.
    //
    // Defence in depth behind withholding the token from the prompt: a
    // sustainment report still described itself as being "in SUSTAINMENT mode".
    // Bare "mixed" is ordinary English, so only the engine's own casing and the
    // "<label> mode" construction count.
    for (const pattern of ENGINE_VOCABULARY) {
      const match = text.match(pattern);
      if (match) issues.push({ slot, kind: 'HARD_TRUTH', code: 'ENGINE_VOCABULARY', detail: match[0] });
    }

    // SEMANTIC — one accountability, one label.
    //
    // C3 collapsed 55-72 raw role labels to a canonical set so that a reader
    // meets each accountability under exactly one name. An early live run
    // wrote "CFO" and "CEO / Managing Director" against a register saying
    // "Chief Financial Officer" and "Chief Executive / Managing Director" —
    // nothing invented, but two names for one office in one document.
    for (const [abbreviation, prefix] of Object.entries(EXECUTIVE_ABBREVIATIONS)) {
      if (!new RegExp(`\\b${abbreviation}\\b`).test(text)) continue;
      const canonical = brief.governance.find((entry) => entry.role.toLowerCase().startsWith(prefix));
      if (canonical) issues.push({ slot, kind: 'SEMANTIC', code: 'ROLE_LABEL_DRIFT', detail: `"${abbreviation}" should be "${canonical.role}"` });
    }

    // QUALITY — structural monotony.
    //
    // Not a keyword rule: it counts sentences built to the same shape,
    // "<subject> <verb> <number>". Three or more in one slot is the register
    // being read aloud in sequence rather than interpreted.
    const recitations = (text.match(/\b(?:contains|has|carries|includes|comprises|adds|holds)\s+\d/gi) ?? []).length;
    if (recitations >= 3) issues.push({ slot, kind: 'QUALITY', code: 'REGISTER_RECITATION', detail: `${recitations} count-listing clauses; the table already lists them` });

    // QUALITY
    const count = words(text);
    if (count < contract.minWords) issues.push({ slot, kind: 'QUALITY', code: 'TOO_SHORT', detail: `${count} words, minimum ${contract.minWords}` });
    if (count > contract.maxWords) issues.push({ slot, kind: 'QUALITY', code: 'TOO_LONG', detail: `${count} words, maximum ${contract.maxWords}` });
    for (const pattern of FILLER) {
      if (pattern.test(text)) issues.push({ slot, kind: 'QUALITY', code: 'FILLER', detail: String(pattern) });
    }
  }

  // SEMANTIC — no two slots may carry the same sentence, and none may be a
  // paraphrase of another. Shared role and programme names are expected, so
  // similarity is measured on content words with those stripped.
  const stop = new Set('the a an and or of to in for on with is are as that this it its by be should must can will not from at their which where what how one any each every management fraud risk organisation control controls'.split(' '));
  const tokens = (text: string) => new Set(text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((word) => word.length > 3 && !stop.has(word)));
  const sentences = (text: string) => text.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim().toLowerCase()).filter((sentence) => sentence.split(/\s+/).length >= 8);
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const [left, leftText] = entries[i]!;
      const [right, rightText] = entries[j]!;
      if (!leftText.trim() || !rightText.trim()) continue;
      const shared = sentences(leftText).filter((sentence) => sentences(rightText).includes(sentence));
      if (shared.length) issues.push({ slot: right.id, kind: 'SEMANTIC', code: 'DUPLICATE_SENTENCE', detail: `repeats ${left.id}` });
      const a = tokens(leftText); const b = tokens(rightText);
      const inter = [...a].filter((token) => b.has(token)).length;
      const union = new Set([...a, ...b]).size;
      const similarity = union ? inter / union : 0;
      if (similarity > 0.55) issues.push({ slot: right.id, kind: 'SEMANTIC', code: 'DUPLICATE_RESPONSIBILITY', detail: `${(similarity * 100).toFixed(0)}% content overlap with ${left.id}` });
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

function contractBlock(contract: InterpretationSlotContract): string {
  return [
    `### ${contract.id}`,
    `Question it answers: ${contract.managementQuestion}`,
    `Your responsibility: ${contract.responsibility}`,
    `You may draw on: ${contract.mayUse.join('; ')}.`,
    `You must not: ${contract.mustNotDo.join('; ')}.`,
    `Length: ${contract.minWords}-${contract.maxWords} words.`
  ].join('\n');
}

/**
 * How the report's posture reads to a customer.
 *
 * The engine's mode token must not travel to the writer. Given the raw string,
 * a sustainment report opened with "The report is in SUSTAINMENT mode" — the
 * machinery's own vocabulary on a customer's page. A sentence of plain English
 * is also better guidance than a label the writer has to decode.
 */
const POSTURE: Record<string, string> = {
  REMEDIATION: 'This assessment calls for remediation: material weaknesses must be closed before the reported position can be relied on.',
  MIXED: 'This assessment is uneven: real capability exists alongside material weaknesses, and both are true at once.',
  SUSTAINMENT: 'This assessment is strong: the priority is sustaining and independently confirming the reported position, not remediating failure. Do not manufacture weakness that the analysis does not show.'
};

export function buildInterpretationPrompt(brief: InterpretationBrief, only?: InterpretationSlotId[]): string {
  const contracts = interpretationContractsForBrief(brief).filter((contract) => !only || only.includes(contract.id));
  // narrativeMode is retained on the brief for validation and withheld here.
  const { narrativeMode, ...visible } = brief;
  const promptBrief = {
    ...visible,
    // High-readiness management objects are the authority for Sustainment
    // interpretation. They are management summaries, not the six analytical
    // registers. Outside Sustainment they are withheld entirely.
    assuranceCoverage: narrativeMode === 'SUSTAINMENT' ? visible.assuranceCoverage : [],
    assurancePriorities: narrativeMode === 'SUSTAINMENT' ? visible.assurancePriorities : [],
    resilienceTests: narrativeMode === 'SUSTAINMENT' ? visible.resilienceTests : [],
    assessmentScope: visible.assessmentScope
      ? {
        ...visible.assessmentScope,
        customerStatement: comprehensiveAssessmentScopeStatement(visible.assessmentScope)
      }
      : null,
    posture: POSTURE[narrativeMode] ?? ''
  };
  const adaptiveRule = brief.assessmentScope?.resultStatus === 'PROVISIONAL'
    ? '- This is a provisional adaptive result. The executiveInterpretation must say once, naturally, that the position is provisional or directional. Do not describe it as definitive, confirmed or fully comparable. Legitimate exclusions are outside scope, not weaknesses; oversight-routed controls remain scored.'
    : null;
  return [
    'You are writing the management interpretation for an MK Fraud Readiness Comprehensive report.',
    '',
    'The analysis below is already complete and is the only authority you have. Your job is to explain what it means to an executive: connect, prioritise and give significance. You are not summarising and you are not adding analysis.',
    '',
    'ABSOLUTE RULES',
    '- Every number you use must appear in the analysis below. Do not compute new ones, including percentages.',
    '- Do not invent a finding, risk, control, owner, action, measure, date, cost or incident.',
    '- Never state or imply that MK examined evidence, tested a control, interviewed anyone or verified anything. The assessment is self-reported by the organisation.',
    '- Never state that a control currently exists or currently operates. Recommended designs are what good practice requires, not what the organisation does.',
    '- Write for a CFO or Head of Risk. Plain, specific, unhedged. No consultancy filler.',
    '- Each field below answers a different question. Do not repeat another field.',
    '- Do not use em dashes. Use normal sentence punctuation instead.',
    ...(adaptiveRule ? [adaptiveRule] : []),
    '',
    '================ THE ANALYSIS ================',
    JSON.stringify(promptBrief),
    '',
    '================ WHAT TO WRITE ================',
    contracts.map(contractBlock).join('\n\n'),
    '',
    '================ OUTPUT ================',
    `Return exactly one JSON object with exactly these keys and no others: ${contracts.map((contract) => contract.id).join(', ')}.`,
    'Each value is a plain string of prose. No Markdown, no code fences, no commentary, no additional keys.'
  ].join('\n');
}

export interface InterpretationAccounting {
  /** Backwards-compatible total provider dispatch count. */
  calls: number;
  /** Backwards-compatible alias for targetedRepairCount. */
  repairs: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costMicros: number;
  durationMs: number;
  /** Model that produced the current accepted/rejected candidate. */
  model: string;
  modelsUsed: string[];
  repairedSlots: InterpretationSlotId[];
  recovery: NarrativeRecoveryBudget;
}

export interface InterpretationRun {
  interpretation: ComprehensiveInterpretation;
  issues: InterpretationIssue[];
  accounting: InterpretationAccounting;
}

export class ComprehensiveInterpretationAcceptanceError extends Error {
  readonly issueCodes: string[];
  constructor(message: string, issueCodes: string[] = []) {
    super(message);
    this.name = 'ComprehensiveInterpretationAcceptanceError';
    this.issueCodes = [...issueCodes];
  }
}

/**
 * Final fail-closed boundary between bounded interpretation and customer output.
 *
 * Recovery is allowed only inside the same bounded policy used by Essential.
 * Hard-truth failures remain unreleasable, and exhausting the recovery budget
 * never weakens validation. There is deliberately no arbitrary one-call cap.
 */
export function assertComprehensiveInterpretationAccepted(run: InterpretationRun): void {
  try {
    assertComprehensiveRecoveryBudget(run.accounting.recovery);
  } catch (error) {
    throw new ComprehensiveInterpretationAcceptanceError(
      error instanceof Error ? error.message : 'Comprehensive recovery budget is invalid.',
      ['RECOVERY_BUDGET']
    );
  }
  if (run.accounting.calls !== run.accounting.recovery.totalCalls) {
    throw new ComprehensiveInterpretationAcceptanceError(
      `Comprehensive interpretation accounting mismatch: calls=${run.accounting.calls}, recovery.totalCalls=${run.accounting.recovery.totalCalls}.`,
      ['CALL_ACCOUNTING']
    );
  }
  if (run.accounting.repairs !== run.accounting.recovery.targetedRepairCount) {
    throw new ComprehensiveInterpretationAcceptanceError(
      `Comprehensive interpretation repair accounting mismatch: repairs=${run.accounting.repairs}, targetedRepairCount=${run.accounting.recovery.targetedRepairCount}.`,
      ['REPAIR_ACCOUNTING']
    );
  }
  if (run.accounting.recovery.initialGenerationCount !== 1) {
    throw new ComprehensiveInterpretationAcceptanceError(
      `Comprehensive interpretation requires exactly one initial generation; received ${run.accounting.recovery.initialGenerationCount}.`,
      ['INITIAL_GENERATION_BUDGET']
    );
  }
  if (run.issues.length > 0) {
    const codes = [...new Set(run.issues.map((issue) => issue.code))].sort();
    throw new ComprehensiveInterpretationAcceptanceError(
      `Comprehensive interpretation failed final acceptance with ${run.issues.length} unresolved issue(s): ${codes.join(', ')}.`,
      codes
    );
  }
}

/**
 * Same credential rule as the Essential bounded writer: the model string carries
 * the provider, and the gateway is pinned to it so a silent substitution cannot
 * change who wrote the report.
 */
function requireCredential(model: string): { model: string; provider: string } {
  const runningOnVercel = process.env.VERCEL === '1' || Boolean(process.env.VERCEL_ENV);
  const hasGatewayCredential = Boolean(
    process.env.AI_GATEWAY_API_KEY
      || process.env.VERCEL_AI_GATEWAY_API_KEY
      || process.env.VERCEL_OIDC_TOKEN
  );
  if (!model || (!hasGatewayCredential && !runningOnVercel)) {
    throw new Error('No AI gateway credential is available for Comprehensive interpretation.');
  }
  return { model, provider: model.split('/')[0]?.trim() || 'vercel-ai-gateway' };
}

const SYSTEM = 'You are the MK Fraud Readiness Comprehensive interpretation writer. The deterministic analysis you are given is the only authority. RETURN EXACTLY ONE JSON OBJECT as plain text: no commentary, no Markdown, no code fences, no additional keys.';

function parseObject(raw: string): Record<string, unknown> {
  const trimmed = raw.trim().replace(/^\`\`\`(?:json)?\s*/i, '').replace(/\`\`\`$/, '').trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('No JSON object in provider output.');
  return JSON.parse(trimmed.slice(start, end + 1)) as Record<string, unknown>;
}

function nextModel(model: string): string | null {
  const index = COMPREHENSIVE_TECHNICAL_MODEL_CHAIN.indexOf(model as (typeof COMPREHENSIVE_TECHNICAL_MODEL_CHAIN)[number]);
  return index >= 0 && index < COMPREHENSIVE_TECHNICAL_MODEL_CHAIN.length - 1
    ? COMPREHENSIVE_TECHNICAL_MODEL_CHAIN[index + 1]!
    : null;
}

function repairPrompt(
  brief: InterpretationBrief,
  current: Partial<ComprehensiveInterpretation>,
  issues: InterpretationIssue[],
  slots: InterpretationSlotId[]
): string {
  const reasons = slots.map((slot) =>
    `- ${slot}: ${issues.filter((issue) => issue.slot === slot).map((issue) => `${issue.code} (${issue.detail})`).join('; ')}`
  ).join('\n');
  return [
    buildInterpretationPrompt(brief, slots),
    '',
    '================ TARGETED REPAIR ================',
    'Correct only the named rejected fields. Preserve every deterministic fact and every accepted field. Do not add analysis.',
    reasons,
    '',
    'PREVIOUS TEXT:',
    JSON.stringify(Object.fromEntries(slots.map((slot) => [slot, current[slot] ?? '']))),
    '',
    `Return exactly one JSON object with exactly these keys: ${slots.join(', ')}.`
  ].join('\n');
}

function coherencePrompt(brief: InterpretationBrief, current: ComprehensiveInterpretation, issues: InterpretationIssue[]): string {
  return [
    buildInterpretationPrompt(brief),
    '',
    '================ BOUNDED COHERENCE PASS ================',
    'The six fields below already carry the authorised meaning. Improve only the editorial defects named below.',
    'Do not add, remove or change any fact, number, owner, decision, programme, timing, maturity statement or assurance boundary.',
    issues.map((issue) => `- ${issue.slot}: ${issue.code} (${issue.detail})`).join('\n'),
    '',
    'CURRENT SIX FIELDS:',
    JSON.stringify(current),
    '',
    'Return exactly one JSON object with all six required keys.'
  ].join('\n');
}

/**
 * One initial six-slot generation followed by Essential-aligned bounded recovery.
 *
 * Recovery sequence:
 * - hard truth: stop; never auto-repair;
 * - repairable semantic wording: up to four targeted slot repairs;
 * - persistent semantic rejection: at most one complete six-slot regeneration;
 * - quality-only rejection: at most one model-rung escalation;
 * - residual quality-only rejection: at most one bounded coherence pass;
 * - provider/transport failure: technical fallback Luna -> Terra -> Sol.
 *
 * Every provider dispatch, token and cost is accounted. Validation remains the
 * release authority throughout.
 */
export async function generateComprehensiveInterpretation(brief: InterpretationBrief, options?: {
  model?: string;
  timeoutMs?: number;
}): Promise<InterpretationRun> {
  let activeModel = options?.model ?? COMPREHENSIVE_INTERPRETATION_MODEL;
  requireCredential(activeModel);
  const timeoutMs = options?.timeoutMs ?? 240_000;
  const recovery = emptyComprehensiveRecoveryBudget();
  const accounting: InterpretationAccounting = {
    calls: 0,
    repairs: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    costMicros: 0,
    durationMs: 0,
    model: activeModel,
    modelsUsed: [],
    repairedSlots: [],
    recovery
  };
  const startedAt = Date.now();

  const callWithTechnicalFallback = async (prompt: string, requestedModel = activeModel): Promise<Record<string, unknown>> => {
    let model = requestedModel;
    let lastError: unknown;
    while (model) {
      const resolved = requireCredential(model);
      accounting.calls += 1;
      recovery.totalCalls += 1;
      if (!accounting.modelsUsed.includes(model)) accounting.modelsUsed.push(model);
      try {
        const response: any = await generateText({
          model: resolved.model,
          system: SYSTEM,
          prompt,
          output: Output.text(),
          maxOutputTokens: 6_000,
          maxRetries: 0,
          providerOptions: { gateway: { only: [resolved.provider] } },
          abortSignal: AbortSignal.timeout(timeoutMs)
        });
        const inputTokens = Number(response?.usage?.inputTokens ?? 0);
        const outputTokens = Number(response?.usage?.outputTokens ?? 0);
        const totalTokens = Number(response?.usage?.totalTokens ?? 0);
        const cost = Number(response?.providerMetadata?.gateway?.cost ?? 0);
        accounting.inputTokens += inputTokens;
        accounting.outputTokens += outputTokens;
        accounting.totalTokens += totalTokens;
        recovery.totalTokens += totalTokens;
        if (Number.isFinite(cost)) {
          const micros = Math.round(cost * 1e6);
          accounting.costMicros += micros;
          recovery.totalProviderCostMicros += micros;
        }
        const raw = typeof response.output === 'string' ? response.output : typeof response.text === 'string' ? response.text : '';
        activeModel = model;
        accounting.model = model;
        try {
          return parseObject(raw);
        } catch {
          // A provider returned a response but not the required object. Treat that
          // as a rejected generation, not a transport outage that may silently
          // walk the technical fallback chain.
          return {};
        }
      } catch (error) {
        lastError = error;
        const fallback = nextModel(model);
        if (!fallback) throw error;
        recovery.technicalFallbackCount += 1;
        model = fallback;
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Comprehensive provider call failed.');
  };

  const initial = await callWithTechnicalFallback(buildInterpretationPrompt(brief), activeModel);
  recovery.initialGenerationCount = 1;
  let current = interpretationSchema.partial().parse(initial) as Partial<ComprehensiveInterpretation>;
  let issues = validateInterpretation(current, brief);

  while (issues.length > 0) {
    const severity = dominantComprehensiveRecoverySeverity(issues);
    if (!severity || severity === 'HARD_TRUTH_FAILURE') break;

    const decision = comprehensiveRecoveryDecision({ budget: recovery, issues });
    if (!decision) break;

    if (decision.action === 'TARGETED_REPAIR') {
      if (recovery.targetedRepairCount >= COMPREHENSIVE_MAX_TARGETED_REPAIRS) break;
      const repairableSlots = [...new Set(
        issues
          .filter((issue) => classifyComprehensiveRecoveryIssue(issue) === 'REPAIRABLE_SEMANTIC_FAILURE')
          .map((issue) => issue.slot)
      )];
      if (!repairableSlots.length) break;
      const repaired = await callWithTechnicalFallback(repairPrompt(brief, current, issues, repairableSlots), activeModel);
      recovery.targetedRepairCount += 1;
      accounting.repairs = recovery.targetedRepairCount;
      for (const slot of repairableSlots) {
        const value = repaired[slot];
        if (typeof value === 'string' && value.trim()) {
          current = { ...current, [slot]: value.trim() };
          if (!accounting.repairedSlots.includes(slot)) accounting.repairedSlots.push(slot);
        }
      }
      issues = validateInterpretation(current, brief);
      continue;
    }

    if (decision.action === 'FULL_REGENERATION') {
      const regenerated = await callWithTechnicalFallback(buildInterpretationPrompt(brief), activeModel);
      recovery.fullRegenerationCount += 1;
      current = interpretationSchema.partial().parse(regenerated) as Partial<ComprehensiveInterpretation>;
      issues = validateInterpretation(current, brief);
      continue;
    }

    if (decision.action === 'QUALITY_ESCALATION') {
      const escalatedModel = nextModel(activeModel);
      if (!escalatedModel) break;
      const escalated = await callWithTechnicalFallback(buildInterpretationPrompt(brief), escalatedModel);
      recovery.qualityEscalationCount += 1;
      activeModel = accounting.model;
      current = interpretationSchema.partial().parse(escalated) as Partial<ComprehensiveInterpretation>;
      issues = validateInterpretation(current, brief);
      continue;
    }

    if (decision.action === 'COHERENCE_PASS' && severity === 'QUALITY_FAILURE') {
      const complete = interpretationSchema.safeParse(current);
      if (!complete.success) break;
      const coherent = await callWithTechnicalFallback(coherencePrompt(brief, complete.data, issues), activeModel);
      recovery.coherenceCount += 1;
      current = interpretationSchema.partial().parse(coherent) as Partial<ComprehensiveInterpretation>;
      issues = validateInterpretation(current, brief);
      continue;
    }

    break;
  }

  accounting.durationMs = Date.now() - startedAt;
  accounting.repairs = recovery.targetedRepairCount;
  accounting.calls = recovery.totalCalls;
  assertComprehensiveRecoveryBudget(recovery);
  return { interpretation: interpretationSchema.parse(current), issues, accounting };
}

/** Map the six slots onto the renderer's commentary keys. */
export function interpretationToCommentary(interpretation: ComprehensiveInterpretation): Record<string, string> {
  return {
    'EXECUTIVE-POSITION': interpretation.executiveInterpretation,
    DIAGNOSIS: interpretation.whyThisMatters,
    EXPOSURE: interpretation.managementImplication,
    'CONTROL-PROGRAMMES': interpretation.controlProgrammeSynthesis,
    IMPLEMENTATION: interpretation.implementationSynthesis,
    CONCLUSION: interpretation.conclusion
  };
}
