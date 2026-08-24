import { exposuresFromContext, hasExposure, type SupportedExposure } from './narrative/operating-exposures';
import {
  deriveNarrativeOperatingContext,
  type OperatingContextFact
} from './narrative/operating-context';

/**
 * Essential-only presentation adaptation.
 *
 * The question playbooks are authoritative and shared with Comprehensive, so they are not
 * rewritten here. They do, however, carry things that can reach a customer without evidence:
 * illustrative operating routes such as refund abuse and stock write-offs, and formal enterprise
 * titles or structures such as Chief Technology Officer or an Audit Committee. A smaller
 * organisation with no recorded workforce-size or formal-structure evidence must not be told it
 * has those structures.
 *
 * This adapts presentation only. What a control must do, the evidence it requires, its cadence and
 * its escalation threshold are untouched. The shared Comprehensive model is never mutated.
 */

/** Formal titles replaced by function-first ownership when structure is not evidenced. */
const ROLE_ADAPTATIONS: ReadonlyArray<[RegExp, string]> = [
  [/\bChief Technology Officer\b|\bCTO\b/gi, 'Technology / security accountable owner'],
  [/\bChief Information Security Officer\b|\bCISO\b/gi, 'Technology / security accountable owner'],
  [/\bChief People Officer\b|\bChief Human Resources Officer\b/gi, 'People / workforce accountable owner'],
  [/\bHead of (?:People|HR)\b/gi, 'People / workforce accountable owner'],
  [/\bGeneral Counsel\b/gi, 'Legal / investigations accountable owner'],
  [/\bChair of (?:the )?Audit[- ]Committee\b|\bAudit[- ]Committee Chair\b/gi, 'Governing body / independent oversight'],
  [/\bAudit[- ]Committee\b/gi, 'Governing body / independent oversight'],
  [/\bChief Financial Officer\b|\bCFO\b/gi, 'Finance / operations accountable owner'],
  [/\bChief Operating Officer\b|\bCOO\b/gi, 'Finance / operations accountable owner'],
  [/\bHead of Risk\b|\bChief Risk Officer\b/gi, 'Risk / compliance accountable owner'],
  [/\bSecurity Operations Centre\b|\bSecurity Operations Center\b|\bSOC\b/gi, 'the security monitoring function'],
  [/\bLearning and Development\b/gi, 'the workforce training function']
];

/** Structural assumptions with no gateway evidence behind them. */
const STRUCTURE_ADAPTATIONS: ReadonlyArray<[RegExp, string]> = [
  [/\bpayslip inserts?\b/gi, 'the workforce communication channels used by the organisation'],
  [/\b(?:depots|branches|sites)\b/gi, 'operating locations'],
  [/\baudit, compliance, operations and risk functions\b/gi, 'relevant operational, control and oversight responsibilities'],
  [/\binduction packs, the workforce communication channels used by the organisation, notice boards at operating locations, intranet and supervisor briefings\b/gi, 'induction and onboarding materials, the workforce communication channels used by the organisation, and supervisor briefings'],
  [/\binduction packs, the workforce communication channels used by the organisation, appropriate workforce communication channels and operating locations, internal workforce communication channel and supervisor briefings\b/gi, 'induction and onboarding materials, workforce communication channels used by the organisation, and supervisor briefings'],
  [/\bnotice boards? at operating locations\b/gi, 'appropriate workforce communication channels'],
  [/\bintranet\b/gi, 'internal workforce communication channel'],
  [/\bfraud forum\b/gi, 'management fraud-risk review route']
];

/**
 * Illustrative operating routes, each with the exposure that licenses it. Where the exposure is
 * absent the example is replaced by bounded neutral wording rather than deleted, so the underlying
 * control weakness still reads as a weakness.
 */
const EXPOSURE_GATED_PHRASES: ReadonlyArray<{ pattern: RegExp; requires: string; neutral: string }> = [
  // The combined phrase names two routes with different evidence, so each half is gated on its own
  // exposure; only when neither is evidenced does the example become neutral.
  { pattern: /such as refund abuse or stock write-off manipulation/gi, requires: 'BOTH_REFUND_AND_STOCK', neutral: '@@SPLIT@@' },
  { pattern: /\bstock write-off manipulation\b/gi, requires: 'PHYSICAL_STOCK_OR_ASSETS', neutral: 'manipulation of a value-bearing adjustment' },
  { pattern: /\brefund abuse\b/gi, requires: 'REFUNDS_AND_ADJUSTMENTS', neutral: 'misuse of a manual adjustment' },
  { pattern: /\bstock\b/gi, requires: 'PHYSICAL_STOCK_OR_ASSETS', neutral: 'held assets' },
  { pattern: /\bcash handling\b/gi, requires: 'CASH_HANDLING', neutral: 'value handling' }
];

export interface EssentialAdaptationContext {
  /** The canonical source facts used to derive every exposure below. */
  operatingContext: readonly OperatingContextFact[];
  exposures: SupportedExposure[];
  /** Titles the assessment itself evidences may stand; nothing else is invented. */
  evidencedTitles: readonly string[];
}

export interface EssentialAdaptationInput {
  gatewayAnswers?: Readonly<Record<string, string>> | null;
  graphVersion?: string | null;
}

export function buildEssentialAdaptationContext(
  input: EssentialAdaptationInput | Readonly<Record<string, string>> | undefined,
  evidencedTitles: readonly string[] = []
): EssentialAdaptationContext {
  const isStructured = Boolean(input && Object.prototype.hasOwnProperty.call(input, 'gatewayAnswers'));
  const gatewayAnswers = isStructured
    ? (input as EssentialAdaptationInput).gatewayAnswers
    : input as Readonly<Record<string, string>> | undefined;
  const graphVersion = isStructured ? (input as EssentialAdaptationInput).graphVersion : undefined;
  const operatingContext = graphVersion && gatewayAnswers && Object.keys(gatewayAnswers).length > 0
    ? deriveNarrativeOperatingContext({ graphVersion, gatewayAnswers })
    : [];
  return { operatingContext, exposures: exposuresFromContext(operatingContext), evidencedTitles };
}

/**
 * Customer-visible cleanup that removes presentation artefacts and known unsupported organisational
 * assertions without changing any score, finding, risk, control or evidence requirement.
 */
function applyEssentialCustomerBoundary(value: string): string {
  return value
    // The assessment does not contain peer-benchmark or organisation-size evidence.
    .replace(/\bmeaningfully ahead of many of similar size\b/gi, 'stronger in some assessed areas than in others')
    .replace(/\bahead of most comparable operating environments\b/gi, 'at a mature reported level across the assessment')
    // The assessment does not establish workforce count, key-person concentration or succession.
    .replace(/If the one or two people who currently hold this knowledge left tomorrow,[^.]*\./gi,
      'If current control knowledge is not documented and transferable, continuity could weaken during staff or role changes.')
    .replace(/\bfraud defences depend on people(?: right now)?, not systems\b/gi, 'fraud controls are not yet consistently embedded')
    .replace(/\bconcentration risk in people, not process\b/gi, 'uneven process embedding and control consistency')
    .replace(/\bdependency on specific people rather than embedded process\b/gi, 'uneven process embedding and control consistency')
    .replace(/\bprotection still relies on specific people being present, informed and paying attention, rather than being built into the way the organisation works every day\b/gi,
      'controls are present but are not yet consistently embedded, documented and evidenced across the assessed environment')
    .replace(/\ba basic response process that does not depend on one person being available when pressure hits\b/gi,
      'a basic response process with clear ownership and continuity when pressure hits')
    // Deterministic scenario prose should read as advisory analysis, not a generation template.
    .replace(/A threat actor exploits the recorded control condition so that /gi, 'If the assessed weakness is exploited, ')
    .replace(/Misuse can occur when an actor exploits the recorded control condition and /gi, 'The assessed weakness creates a pathway in which ')
    .replace(/An unauthorised actor uses the recorded control condition to create a pathway where /gi, 'If the assessed weakness is exploited, ')
    // Handle the more-specific operating fallback before the generic impact fallback; the old
    // order matched the "Impact" substring inside "Operating impact" and produced malformed copy.
    .replace(/\bOperating impact requires case-specific validation\.?/gi,
      'The operational consequence depends on the affected process, system or service.')
    .replace(/\bImpact requires case-specific validation\.?/gi,
      'The financial consequence depends on the value and transactions affected.')
    // Defensive cleanup for text produced by the previous faulty replacement order.
    .replace(/\bOperating\s+The financial consequence depends on the value and transactions affected\.?/gi,
      'The operational consequence depends on the affected process, system or service.')
    // Internal authoring labels/punctuation are not customer copy. Cover ASCII and typographic dashes.
    .replace(/\bDirect\s*(?:--|—|–|-)\s*/gi, '')
    .replace(/\s+--\s+/g, ' — ')
    // A replacement can consume the original full stop but leave the join semicolon behind.
    // Never show the customer a malformed ".;" sequence.
    .replace(/\.\s*;\s*/g, '; ')
    // Remove a deterministic duplicate introduced when generic location labels are adapted twice.
    .replace(/\boperating locations\s+and\s+operating locations\b/gi, 'operating locations')
    // Keep the supporting appendix usable on a printed page without dropping the control intent.
    .replace(
      /make the reporting channel reachable externally through a public web route and published contact detail, reference it in supplier onboarding packs, contracts and purchase orders and in customer-facing material where relevant, accept anonymous external reports, and triage them under the same independence and conflict rules as internal reports with feedback provided where the reporter is contactable/gi,
      'publish an external web/contact route, reference it in relevant supplier and customer materials, permit anonymous reports, apply the same conflict-free triage rules as internal reports, and provide feedback where the reporter is contactable'
    );
}

/** Adapt one customer-facing string. Returns it unchanged when everything is licensed. */
export function adaptEssentialText(value: string, context: EssentialAdaptationContext): string {
  if (!value) return value;
  let text = value;

  const stock = hasExposure(context.exposures, 'PHYSICAL_STOCK_OR_ASSETS');
  const refunds = hasExposure(context.exposures, 'REFUNDS_AND_ADJUSTMENTS');
  text = text.replace(/such as refund abuse or stock write-off manipulation/gi, () => {
    if (stock && refunds) return 'such as refund abuse or stock write-off manipulation';
    if (stock) return 'such as stock write-off manipulation';
    if (refunds) return 'such as refund abuse';
    return 'in a material value-bearing process';
  });

  for (const { pattern, requires, neutral } of EXPOSURE_GATED_PHRASES) {
    if (neutral === '@@SPLIT@@') continue;
    if (hasExposure(context.exposures, requires as Parameters<typeof hasExposure>[1])) continue;
    text = text.replace(pattern, neutral);
  }

  for (const [pattern, replacement] of ROLE_ADAPTATIONS) {
    // A title the assessment actually records is real and may stand. Matching uses a non-global
    // copy: a global regex carries lastIndex between calls, so reusing it for test() would make the
    // same input adapt differently on a second pass.
    const probe = new RegExp(pattern.source, pattern.flags.replace('g', ''));
    if (context.evidencedTitles.some((title) => probe.test(title))) continue;
    text = text.replace(pattern, replacement);
  }

  for (const [pattern, replacement] of STRUCTURE_ADAPTATIONS) {
    text = text.replace(pattern, replacement);
  }

  text = applyEssentialCustomerBoundary(text);

  // Collapse any duplicate owner label produced by two titles mapping to one function.
  return text.replace(/\b([A-Z][a-z]+ \/ [a-z]+ accountable owner)(\s*\/\s*\1)+/g, '$1');
}

export interface EssentialScenarioStateFinding {
  questionPrompt: string;
  responseLabel: string;
}

function responseLabelForPrompt(
  findings: ReadonlyArray<EssentialScenarioStateFinding>,
  promptFragment: string
): string | null {
  const needle = promptFragment.toLowerCase();
  return findings.find((finding) => finding.questionPrompt.toLowerCase().includes(needle))?.responseLabel ?? null;
}

/**
 * Correct closed scenario-synthesis phrases where one maturity label was incorrectly applied to
 * several different controls. The replacement is derived only from the recorded finding labels;
 * no score, finding, scenario pathway or recommendation is changed.
 */
export function groundEssentialScenarioStateLanguage(
  value: string,
  findings: ReadonlyArray<EssentialScenarioStateFinding>
): string {
  if (!value) return value;
  let text = value;

  const monitoringLabel = responseLabelForPrompt(
    findings,
    'monitors transactions or operational activity for unusual patterns, anomalies or red flags'
  );
  if (monitoringLabel) {
    text = text.replace(
      /The current (?:control )?weakness(?: in the pathway| linked to this pathway)? is that monitoring and exception review are at an initial or ad hoc stage\./gi,
      `The current control weakness in the pathway is that transaction and activity monitoring is self-assessed as "${monitoringLabel}".`
    );
  }

  const evidenceLabel = responseLabelForPrompt(
    findings,
    'evidence linked to suspected fraud is identified, preserved and handled appropriately'
  );
  const reportingLabel = responseLabelForPrompt(
    findings,
    'provides a confidential or anonymous channel for reporting suspected fraud or misconduct'
  );
  if (evidenceLabel && reportingLabel) {
    text = text.replace(
      /The current (?:control )?weakness is that evidence preservation, reporting and custody are at an initial or ad hoc stage\./gi,
      `The current control conditions are not at one shared maturity stage: evidence preservation and custody are self-assessed as "${evidenceLabel}", while confidential or anonymous reporting is self-assessed as "${reportingLabel}".`
    );
  }

  return text;
}

/** Keys carrying identity or references, which must never be rewritten. */
const IDENTIFIER_KEY = /(^id$|Id$|Ids$|Ref$|Refs$|Code$|code$|^phase$|^targetPeriod$|^severity$|^materialityClass$|^status$|Class$|Family$)/;

interface EssentialRoadmapCandidate {
  id?: string;
  period?: string;
  domainCode?: string;
  deliverable?: string;
  processOwner?: string;
  accountableExecutive?: string;
  dependencyIds?: unknown[];
  linkedFindingIds?: unknown[];
}

const FOUNDATION_DOMAIN_PRIORITY: Readonly<Record<string, number>> = {
  D1: 60,
  D2: 55,
  D5: 50,
  D6: 45,
  D4: 40,
  D10: 35
};

function foundationCandidateScore(
  action: EssentialRoadmapCandidate,
  materialityByFindingId: ReadonlyMap<string, number>
): number {
  const text = `${action.deliverable ?? ''} ${action.processOwner ?? ''} ${action.accountableExecutive ?? ''}`;
  const keywordScore = /owner|govern|escalat|risk register|monitor|report|evidence|intake|preserv/i.test(text) ? 200 : 0;
  const periodScore = action.period === '60 days' ? 100 : 0;
  const linkedMateriality = (action.linkedFindingIds ?? [])
    .map((id) => materialityByFindingId.get(String(id)) ?? 0)
    .reduce((highest, score) => Math.max(highest, score), 0);
  return linkedMateriality * 10
    + (FOUNDATION_DOMAIN_PRIORITY[action.domainCode ?? ''] ?? 0)
    + keywordScore
    + periodScore;
}

/**
 * A report labelled 30/60/90 must contain real work in all three windows. Keep several genuine
 * 30-day foundation actions in the Essential-only model even when an existing 30-day action sits
 * outside the bounded customer projection. We therefore top the model up to three 30-day actions,
 * choosing only high-priority dependency-free 60-day foundation work and always leaving at least
 * one 60-day action untouched. Nothing is invented or duplicated: ids, deliverables, owners,
 * linkages and evidence refs remain the same; only Essential timing is brought forward.
 */
function ensureEssentialThirtyDayFoundation<T>(model: T): T {
  if (!model || typeof model !== 'object') return model;
  const record = model as Record<string, unknown>;
  const actions = record.roadmapActions;
  if (!Array.isArray(actions) || actions.length === 0) return model;

  const materialityByFindingId = new Map<string, number>();
  if (Array.isArray(record.materialFindings)) {
    for (const item of record.materialFindings) {
      if (!item || typeof item !== 'object') continue;
      const finding = item as { id?: unknown; materialityScore?: unknown };
      if (!finding.id) continue;
      materialityByFindingId.set(String(finding.id), Number(finding.materialityScore) || 0);
    }
  }

  const existingThirtyDayCount = actions.filter(
    (item) => item && typeof item === 'object' && (item as EssentialRoadmapCandidate).period === '30 days'
  ).length;
  const candidates = actions
    .filter((item): item is EssentialRoadmapCandidate => Boolean(item && typeof item === 'object'))
    .filter((item) => item.period === '60 days' && (item.dependencyIds?.length ?? 0) === 0)
    .sort((left, right) =>
      foundationCandidateScore(right, materialityByFindingId) - foundationCandidateScore(left, materialityByFindingId)
      || String(left.id ?? '').localeCompare(String(right.id ?? '')));

  // Preserve a real 60-day layer. With one or fewer dependency-free 60-day actions there is
  // nothing safe to bring forward without emptying that window.
  const convertibleCount = Math.min(
    Math.max(0, 3 - existingThirtyDayCount),
    Math.max(0, candidates.length - 1)
  );
  if (convertibleCount === 0) return model;

  const chosen = new Set(candidates.slice(0, convertibleCount));
  record.roadmapActions = actions.map((item) =>
    chosen.has(item as EssentialRoadmapCandidate) ? { ...item, period: '30 days' } : item
  );
  return model;
}

interface EssentialLeadershipDecisionCandidate {
  decisionRequired?: string;
  targetPeriod?: string;
}

function ensureEssentialThirtyDayOwnershipDecision<T>(model: T): T {
  if (!model || typeof model !== 'object') return model;
  const record = model as Record<string, unknown>;
  if (!Array.isArray(record.leadershipDecisions)) return model;
  record.leadershipDecisions = record.leadershipDecisions.map((item) => {
    if (!item || typeof item !== 'object') return item;
    const decision = item as EssentialLeadershipDecisionCandidate;
    if (decision.targetPeriod !== '60 days') return item;
    if (!/accountable executive mandates and escalation authority/i.test(decision.decisionRequired ?? '')) return item;
    return { ...item, targetPeriod: '30 days' };
  });
  return model;
}

/**
 * An Essential-only adapted copy of the advisory evidence model.
 *
 * Every Essential consumer -- projection, Fact Pack, renderer and PDF quality gates -- must read
 * the same adapted text, or the PDF suppresses a claim the writer still sees. The shared model is
 * deep-copied rather than mutated, because Comprehensive consumes the original and its accepted
 * output must not change.
 */
export function adaptEssentialEvidenceModel<T>(
  model: T,
  gatewayAnswers: Readonly<Record<string, string>> | undefined,
  evidencedTitles: readonly string[] = [],
  graphVersion?: string | null
): T {
  const context = buildEssentialAdaptationContext({ gatewayAnswers, graphVersion }, evidencedTitles);
  const walk = (value: unknown): unknown => {
    if (typeof value === 'string') return adaptEssentialText(value, context);
    if (Array.isArray(value)) return value.map(walk);
    if (!value || typeof value !== 'object') return value;
    const copy: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      copy[key] = IDENTIFIER_KEY.test(key) ? item : walk(item);
    }
    return copy;
  };
  return ensureEssentialThirtyDayOwnershipDecision(ensureEssentialThirtyDayFoundation(walk(model) as T));
}
