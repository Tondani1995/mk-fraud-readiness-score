/**
 * Deterministic presentation validation.
 *
 * Guards the product contract the analytical validators cannot see: that the
 * report reads as a professional advisory document rather than an engineering
 * artefact or a wall of prose. Layout passing is not the same as the page being
 * readable, so density is checked here as well.
 */
import type { EssentialReportPresentationModel } from './presentation-model';
import { scenarioPresentationForExposure } from './content-families';

export const ESSENTIAL_PRESENTATION_VALIDATION_VERSION = 'mk-essential-presentation-validation-v1';

export type PresentationIssueCode =
  | 'NO_INTERNAL_LANGUAGE'
  | 'NO_RAW_INTERNAL_IDS'
  | 'NO_EMPTY_PAGE'
  | 'VALID_SCORE_PROFILE'
  | 'VALID_EXHIBIT_SOURCE_REFS'
  | 'VALID_EXPOSURE_COUNT'
  | 'SCENARIO_PRIMARY_OWNERSHIP'
  | 'NO_SCENARIO_BLEED'
  | 'ROADMAP_STAGE_COMPLETENESS'
  | 'ROADMAP_SEQUENCE_COMPLETENESS'
  | 'REPORT_BASIS_ONCE'
  | 'CUSTOMER_WORD_ENVELOPE'
  | 'PAGE_DENSITY'
  | 'NO_CUSTOMER_TRUNCATION_ELLIPSIS'
  | 'NO_EM_DASH'
  | 'PRESENTATION_LABEL_TOO_LONG'
  | 'EXPOSURE_FAMILY_OWNERSHIP'
  | 'SCENARIO_FAMILY_OWNERSHIP'
  | 'TARGET_STATE_NOT_EVIDENCE'
  | 'NO_MANUFACTURED_WEAKNESS'
  | 'SCENARIO_MECHANIC_CONTAMINATION';

export interface PresentationIssue { code: PresentationIssueCode; message: string }

export interface EssentialPresentationValidation {
  ok: boolean;
  version: typeof ESSENTIAL_PRESENTATION_VALIDATION_VERSION;
  customerWordCount: number;
  pageCount: number;
  issues: PresentationIssue[];
}

/**
 * Engineering vocabulary that must never appear on a customer page.
 *
 * Split in two, because a flat token list cannot tell a leak from ordinary
 * English. CASE-10 was rejected for "capable of prompt response as the business
 * changes" — *prompt* the adjective, matched by a pattern that exists to catch
 * the engineering noun. The same mistake had already been found twice: "AI"
 * inside a legitimate organisation name, and severity keywords in the
 * sustainment classifier.
 *
 * Unambiguous terms are engine vocabulary in any sentence. Context-dependent
 * terms are ordinary business English that only leaks when it appears in an
 * engineering construction, so those are matched by phrase.
 */
const INTERNAL_LANGUAGE = [
  /\bsection engine\b/i, /\bowner preview\b/i, /\bowner review\b/i, /\bfact pack\b/i,
  /\bsupabase\b/i, /\bcommercial qa\b/i, /\bnarrative mode\b/i, /\bclaim ref(?:erence)?s?\b/i,
  /\bdeterministic\b/i, /\bstory plan\b/i, /\bpresentation model\b/i, /\bsemantic famil(?:y|ies)\b/i,
  /\bslot plan\b/i, /\bslot id\b/i, /\bcluster id\b/i, /\bnarrative role\b/i,
  /\brepair (?:attempt|pass|call|budget)\b/i, /\bformat retry\b/i, /\bfail(?:ed|s)? closed\b/i,
  /\bprovider call\b/i, /\btoken budget\b/i, /\bword envelope\b/i
];

/**
 * Words that are engine vocabulary in one sense and ordinary advisory English in
 * another. Only the engineering construction is a leak.
 */
const CONTEXT_DEPENDENT_LANGUAGE: Array<{ term: string; engineering: RegExp[] }> = [
  // "prompt response", "prompt escalation", "prompt investigation" are correct English.
  { term: 'prompt', engineering: [/\bsystem prompt\b/i, /\bthe prompts?\b/i, /\bprompts?\s+(?:template|version|contract|injection|scaffold|engineering)\b/i, /\b(?:generation|writer|model)\s+prompt\b/i] },
  // "time slot", "a slot in the schedule" are correct English.
  { term: 'slot', engineering: [/\bnarrative slots?\b/i, /\bbounded slots?\b/i, /\bslots?\s+(?:id|identifier|contract|budget)\b/i, /\bSLOT-\d/i, /\bper-slot\b/i] },
  // A manufacturer legitimately has production lines, staff and facilities.
  { term: 'production', engineering: [/\bproduction\s+(?:environment|deployment|database|branch|build|pipeline|release)\b/i, /\bin production\b/i, /\bproduction and staging\b/i] },
  // Capital, staff and resources are legitimately deployed.
  { term: 'deployment', engineering: [/\bdeployment\s+(?:pipeline|environment|target|branch|slot)\b/i, /\bcontinuous deployment\b/i] },
  // "bounded by", "a bounded review" are correct English.
  { term: 'bounded', engineering: [/\bbounded\s+(?:generation|narrative|section|slot|manuscript|report|engine)\b/i] },
  // AI-enabled fraud is a legitimate subject; organisation names may contain "AI".
  { term: 'AI', engineering: [/\bAI\s+(?:generation|writer|model|call|output|prompt|pipeline)\b/i, /\bthe AI\b/, /\bAI-generated\b/i, /\bgenerative AI (?:call|output)\b/i] }
];

/** Exposed so regression tests can exercise the classification directly. */
export const INTERNAL_LANGUAGE_PATTERNS = { unambiguous: INTERNAL_LANGUAGE, contextDependent: CONTEXT_DEPENDENT_LANGUAGE };

/** Internal identifiers that must stay in the private record. */
const INTERNAL_IDS = [
  /\bFACT-\d+/i, /\bCLAIM-\d+/i, /\bDOMAIN-D\d+/i, /\bSCENARIO-\d{3}/i, /\bFINDING-\d{3}/i,
  /\bROADMAP-\d{3}/i, /\bCONTROL-\d{3}/i, /\bMF-D\d+-Q\d+/i, /\bRA-D\d+-Q\d+/i, /\bCI-D\d+-Q\d+/i,
  /\bD\d+-Q\d+/i, /\bSYNTH-[A-Z_]+/, /\bEX-[A-Z-]+/
];

/**
 * Text the customer supplied, which the engine must reproduce faithfully.
 *
 * Two real organisations are named "PRE-G30 COST-BUDGET-CORRECTED FINAL AI
 * CERTIFICATION - JOURNEY 5" and "PRE-G30-AI-CERT-20260805 Organisation". The
 * internal-language scan matched "AI" inside them and failed both reports. The
 * validator guards engine vocabulary reaching customer prose; it has no business
 * policing what an organisation calls itself.
 */
function customerProvidedText(model: EssentialReportPresentationModel): string[] {
  return [model.reportIdentity.organisationName].filter(Boolean);
}

/** Strips customer-provided substrings so only engine-authored text is scanned. */
function withoutCustomerText(surface: string, provided: string[]): string {
  return provided.reduce((text, value) => text.split(value).join(' '), surface);
}

function customerSurfaces(model: EssentialReportPresentationModel): string[] {
  const out: string[] = [model.cover.centralJudgement, model.conclusion, model.reportBasis];
  out.push(...model.domainProfile.rows.map((r) => `${r.title} ${r.band}`));
  out.push(model.readinessScore.strongest.title, model.readinessScore.weakest.title, model.readinessScore.maturity);
  for (const c of model.materialContrasts?.contrasts ?? []) out.push(c.strongerTitle, c.weakerTitle, c.interpretation);
  for (const r of model.diagnosis.rows) out.push(r.pattern, r.whyItMatters, ...r.signals.map((s) => s.title));
  if (model.diagnosis.interpretation) out.push(model.diagnosis.interpretation);
  for (const r of model.exposures?.rows ?? []) out.push(r.exposure, r.whyItMatters, r.interruptionPoint);
  for (const r of model.strengths?.rows ?? []) out.push(r.capability, r.currentStandard, r.managementValue);
  for (const r of model.watchpoints?.rows ?? []) out.push(r.currentStrength, r.dependency, r.deteriorationTrigger, r.managementResponse);
  for (const s of model.scenarios?.scenarios ?? []) out.push(s.title, s.entryPoint, s.controlBreak, s.howItUnfolds, s.immediateInterruption, ...s.warningIndicators);
  if (model.scenarios) out.push(model.scenarios.assuranceNote);
  for (const r of model.priorities.rows) out.push(r.outcome, r.whyNow, r.accountableRole, r.betterLooksLike);
  for (const st of model.roadmap.stages) { out.push(st.stage, st.primaryOutcome); for (const a of st.actions) out.push(a.action, a.owner, ...a.dependsOn); }
  if (model.roadmap.interpretation) out.push(model.roadmap.interpretation);
  for (const r of model.dashboard.rows) out.push(r.measure, r.current, r.expectation);
  for (const p of model.pages) { out.push(p.question, p.heading); if (p.commentary) out.push(p.commentary); }
  return out.filter(Boolean);
}

function words(value: string): number {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * What a sentence in a sustainment report is actually claiming.
 *
 * A high-readiness report may legitimately say that a strength depends on
 * something, that it could deteriorate, or that one capability is less developed
 * than another. What it may not do is assert that a control is currently absent,
 * failing or in crisis, because a sustainment assessment carries no evidence for
 * that: there is no exposure register behind it.
 *
 * The previous check was a flat keyword scan, so "no critical gap identified in
 * this domain" — a statement that the organisation is *sound* — was rejected as
 * a manufactured weakness. Severity vocabulary alone does not make a claim; what
 * the sentence does with it does.
 */
export type SustainmentClaimClassification =
  | 'NEGATED_ABSENCE'
  | 'DETERIORATION_RISK'
  | 'RELATIVE_LIMITATION'
  | 'SUPPORTED_WATCHPOINT'
  | 'MATERIAL_WEAKNESS_CLAIM'
  | 'NEUTRAL';

export interface SustainmentClaim {
  sentence: string;
  classification: SustainmentClaimClassification;
  trigger: string;
}

/**
 * Assertions that are their own evidence of a manufactured weakness. Negation is
 * part of the claim here ("there is no ownership"), so it cannot excuse it.
 */
const ABSENCE_ASSERTIONS: Array<{ label: string; pattern: RegExp; negatable: boolean }> = [
  // The negator is part of the claim in these two, so it cannot excuse them.
  { label: 'asserts controls are absent', pattern: /\b(?:there\s+(?:is|are)\s+)?no\s+(?:effective\s+|formal\s+|defined\s+)?(?:controls?|control\s+environment|oversight|ownership|accountability|monitoring|escalation\s+route|governance)\b/i, negatable: false },
  { label: 'asserts a capability does not exist', pattern: /\b(?:does|do)\s+not\s+(?:have|maintain|operate|perform)\s+(?:any\s+)?(?:controls?|monitoring|oversight|governance|process)\b/i, negatable: false },
  // These name a condition, so "no material weakness was identified" denies it.
  { label: 'asserts a control failure', pattern: /\b(?:control|governance|oversight)\s+(?:failure|breakdown|collapse)\b/i, negatable: true },
  { label: 'asserts a material weakness', pattern: /\bmaterial\s+weakness(?:es)?\b/i, negatable: true }
];

/**
 * Severity vocabulary whose meaning depends entirely on how the sentence uses
 * it. Each one is a manufactured weakness only when it survives every mitigator.
 */
const SEVERITY_TERMS: Array<{ label: string; pattern: RegExp }> = [
  { label: 'critical deficiency', pattern: /\bcritical\s+(?:gap|gaps|weakness(?:es)?|deficienc\w+|failure|issue|gap\s+count)\b/i },
  { label: 'severe', pattern: /\bsevere(?:ly)?\b/i },
  { label: 'crisis', pattern: /\bcrisis\b/i },
  { label: 'urgent', pattern: /\burgent(?:ly)?\b/i },
  { label: 'state of failure', pattern: /\b(?:is|are|remains?|stays?)\s+(?:currently\s+)?(?:inadequate|deficient|ineffective|absent|missing|non-existent|nonexistent|failing|broken|unreliable)\b/i },
  { label: 'fails to operate', pattern: /\b(?:fails?|failing)\s+to\s+(?:operate|prevent|detect|identify|control|escalate)\b/i }
];

/** The weakness term is denied rather than asserted: "no critical gap identified". */
const NEGATORS = /\b(?:no|not|never|none|nor|without|free\s+of|absence\s+of|nothing|neither)\b/i;

/** The sentence describes what could happen, not what is happening. */
// Deliberately excludes a bare "should": "management should" opens most advisory
// sentences and would excuse any assertion that followed it.
const CONDITIONAL = /\b(?:if|unless|could|would|may|might|risks?|at\s+risk\s+of|over\s+time|in\s+the\s+event|becomes?|drift\w*|erode\w*|deteriorat\w*|slip\w*|lapse\w*|going\s+forward)\b|\bwere\s+\w+\s+to\b|\bshould\s+(?:it|they|this|that|the\s+\w+)\s+(?:drift|lapse|slip|weaken|decline|deteriorate)\b/i;

/** The sentence ranks capabilities against each other rather than condemning one. */
const RELATIVE = /\b(?:relative(?:ly)?|compared\s+(?:with|to)|less\s+(?:mature|developed|advanced)|lower\s+than|weakest|lowest|least\s+developed|stronger\s+than|more\s+mature\s+than|behind\s+the\s+others?)\b/i;

/** The sentence frames the point as something to keep watching, not something broken. */
// Framing phrases only. The bare word "monitoring" is a capability name, not a
// framing device: "monitoring fails to detect unusual activity" is an assertion.
const WATCHPOINT = /\b(?:watchpoint|keep\s+under\s+review|keep\s+monitoring|depends?\s+on|dependent\s+on|sustain\w*|preserv\w*|maintain\w*|early\s+warning|ongoing\s+attention|continued\s+\w+)\b|\b(?:should|must)\s+(?:continue\s+to\s+)?monitor\b/i;

function sentencesOf(text: string): string[] {
  return String(text ?? '')
    .split(/(?<=[.!?])\s+/)
    .flatMap((sentence) => sentence.split(/\s+[\u2014–-]\s+/))
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

export function sustainmentClaims(text: string): SustainmentClaim[] {
  return sentencesOf(text).map((sentence) => {
    const absence = ABSENCE_ASSERTIONS.find((entry) => entry.pattern.test(sentence));
    if (absence) {
      const at = sentence.search(absence.pattern);
      const denied = absence.negatable && NEGATORS.test(sentence.slice(0, at >= 0 ? at : sentence.length));
      if (denied) return { sentence, classification: 'NEGATED_ABSENCE' as const, trigger: absence.label };
      return { sentence, classification: 'MATERIAL_WEAKNESS_CLAIM' as const, trigger: absence.label };
    }

    const severity = SEVERITY_TERMS.find((entry) => entry.pattern.test(sentence));
    if (!severity) return { sentence, classification: 'NEUTRAL' as const, trigger: '' };

    // The mitigators are checked against the text leading up to the term, and
    // against the sentence as a whole, because "no critical gap" negates ahead
    // of the term while "unless review lapses, the critical dependency..."
    // qualifies the whole clause.
    const index = sentence.search(severity.pattern);
    const lead = sentence.slice(0, index >= 0 ? index : sentence.length);
    if (NEGATORS.test(lead)) return { sentence, classification: 'NEGATED_ABSENCE' as const, trigger: severity.label };
    if (CONDITIONAL.test(sentence)) return { sentence, classification: 'DETERIORATION_RISK' as const, trigger: severity.label };
    if (RELATIVE.test(sentence)) return { sentence, classification: 'RELATIVE_LIMITATION' as const, trigger: severity.label };
    if (WATCHPOINT.test(sentence)) return { sentence, classification: 'SUPPORTED_WATCHPOINT' as const, trigger: severity.label };
    return { sentence, classification: 'MATERIAL_WEAKNESS_CLAIM' as const, trigger: severity.label };
  });
}

export function validateEssentialPresentation(model: EssentialReportPresentationModel): EssentialPresentationValidation {
  const issues: PresentationIssue[] = [];
  const surfaces = customerSurfaces(model);
  const allText = surfaces.join('\n');
  const customerWordCount = surfaces.reduce((sum, text) => sum + words(text), 0);

  if (allText.includes('\u2014')) {
    issues.push({ code: 'NO_EM_DASH', message: 'Customer-facing Essential presentation contains an em dash.' });
  }

  const provided = customerProvidedText(model);
  const engineAuthored = surfaces.map((text) => withoutCustomerText(text, provided));
  for (const pattern of INTERNAL_LANGUAGE) {
    const hit = engineAuthored.find((text) => pattern.test(text));
    if (hit) issues.push({ code: 'NO_INTERNAL_LANGUAGE', message: `Customer surface contains engineering language matching ${pattern}: "${hit.slice(0, 90)}"` });
  }
  for (const { term, engineering } of CONTEXT_DEPENDENT_LANGUAGE) {
    for (const pattern of engineering) {
      const hit = engineAuthored.find((text) => pattern.test(text));
      if (hit) issues.push({ code: 'NO_INTERNAL_LANGUAGE', message: `Customer surface uses "${term}" in its engineering sense (${pattern}): "${hit.slice(0, 90)}"` });
    }
  }
  for (const pattern of INTERNAL_IDS) {
    const hit = surfaces.find((text) => pattern.test(text));
    if (hit) issues.push({ code: 'NO_RAW_INTERNAL_IDS', message: `Customer surface exposes an internal identifier matching ${pattern}: "${hit.slice(0, 90)}"` });
  }

  // Every non-cover page must carry a heading and at least one exhibit or commentary.
  for (const page of model.pages) {
    if (page.kind === 'cover') continue;
    if (!page.heading || (!page.exhibitIds.length && !page.commentary)) {
      issues.push({ code: 'NO_EMPTY_PAGE', message: `Page ${page.page} (${page.kind}) carries neither an exhibit nor commentary.` });
    }
  }

  if (!(model.readinessScore.score >= 0 && model.readinessScore.score <= 100) || !model.readinessScore.maturity) {
    issues.push({ code: 'VALID_SCORE_PROFILE', message: 'Readiness score or maturity is missing or out of range.' });
  }
  if (model.domainProfile.rows.length === 0) {
    issues.push({ code: 'VALID_SCORE_PROFILE', message: 'Domain profile contains no rows.' });
  }
  const unsorted = model.domainProfile.rows.some((row, index, all) => index > 0 && row.score < all[index - 1]!.score);
  if (unsorted) issues.push({ code: 'VALID_SCORE_PROFILE', message: 'Domain profile is not ordered weakest first.' });

  const exhibits = [model.readinessScore, model.domainProfile, model.diagnosis, model.priorities, model.roadmap, model.dashboard,
    ...(model.materialContrasts ? [model.materialContrasts] : []), ...(model.exposures ? [model.exposures] : []), ...(model.scenarios ? [model.scenarios] : [])];
  for (const exhibit of exhibits) {
    if (!exhibit.sourceRefs.length) issues.push({ code: 'VALID_EXHIBIT_SOURCE_REFS', message: `Exhibit ${exhibit.exhibitId} carries no source references.` });
  }

  if (model.exposures && (model.exposures.rows.length < 1 || model.exposures.rows.length > 5)) {
    issues.push({ code: 'VALID_EXPOSURE_COUNT', message: `Priority exposure count ${model.exposures.rows.length} is outside the supported range.` });
  }

  // Each scenario owns one family, and no family appears twice.
  const families = (model.scenarios?.scenarios ?? []).map((s) => s.family).filter(Boolean);
  if (new Set(families).size !== families.length) {
    issues.push({ code: 'SCENARIO_PRIMARY_OWNERSHIP', message: 'Two scenarios claim the same primary content family.' });
  }
  // Bleed: a scenario re-stating another scenario's control break verbatim.
  const breaks = (model.scenarios?.scenarios ?? []).map((s) => s.controlBreak.toLowerCase().trim()).filter(Boolean);
  if (new Set(breaks).size !== breaks.length) {
    issues.push({ code: 'NO_SCENARIO_BLEED', message: 'Two scenarios describe the same control break.' });
  }

  // Authoritative roadmap assurance.
  //
  // This is the layer that owns it. The roadmap exhibit is what the customer
  // reads and what the PDF renders, so completeness is proved against the
  // structure that becomes the page — not against literal "30 days" markers in
  // intermediate manuscript prose that never reaches the exhibit. Prose that
  // happens to contain the markers is not evidence the roadmap is complete, and
  // prose that omits them is not evidence it is broken.
  const EXPECTED_WINDOWS = [
    { marker: '30', window: '0–30 days' },
    { marker: '60', window: '31–60 days' },
    { marker: '90', window: '61–90 days' }
  ];
  const stages = model.roadmap.stages;
  if (stages.length !== EXPECTED_WINDOWS.length) {
    issues.push({ code: 'ROADMAP_SEQUENCE_COMPLETENESS', message: `The roadmap carries ${stages.length} stages; the first 90 days requires exactly ${EXPECTED_WINDOWS.length}.` });
  }
  EXPECTED_WINDOWS.forEach((expected, index) => {
    const stage = stages[index];
    if (!stage) {
      issues.push({ code: 'ROADMAP_SEQUENCE_COMPLETENESS', message: `The roadmap has no ${expected.marker}-day stage.` });
      return;
    }
    // Sequencing is positional and explicit: stage n must be the nth window.
    if (!new RegExp(`^${expected.marker}\\b`).test(stage.stage.trim())) {
      issues.push({ code: 'ROADMAP_SEQUENCE_COMPLETENESS', message: `Roadmap stage ${index + 1} is "${stage.stage}"; the ${expected.marker}-day stage belongs in that position.` });
    }
    if (stage.window.trim() !== expected.window) {
      issues.push({ code: 'ROADMAP_SEQUENCE_COMPLETENESS', message: `Roadmap stage "${stage.stage}" covers "${stage.window}" rather than ${expected.window}.` });
    }
  });
  for (const stage of stages) {
    if (!stage.primaryOutcome || stage.actions.length === 0) {
      issues.push({ code: 'ROADMAP_STAGE_COMPLETENESS', message: `Roadmap stage "${stage.stage}" has no outcome or no actions.` });
      continue;
    }
    // An action management cannot act on is not an action. Each needs the work,
    // someone accountable, what it produces and how completion is proved.
    for (const action of stage.actions) {
      const missing = ([['action', action.action], ['owner', action.owner], ['deliverable', action.deliverable], ['completion criterion', action.completionTest]] as Array<[string, string]>)
        .filter(([, value]) => !String(value ?? '').trim())
        .map(([field]) => field);
      if (missing.length) {
        issues.push({ code: 'ROADMAP_STAGE_COMPLETENESS', message: `Roadmap action "${String(action.action ?? '(unnamed)').slice(0, 60)}" in "${stage.stage}" is missing: ${missing.join(', ')}.` });
      }
    }
  }
  // The same work sequenced twice tells management to do it twice.
  const roadmapActions = stages.flatMap((stage) => stage.actions.map((action) => String(action.action ?? '').toLowerCase().trim())).filter(Boolean);
  if (new Set(roadmapActions).size !== roadmapActions.length) {
    issues.push({ code: 'ROADMAP_SEQUENCE_COMPLETENESS', message: 'The roadmap sequences the same action in more than one window.' });
  }

  const basisOccurrences = (allText.match(/has not independently tested/gi) ?? []).length;
  if (basisOccurrences !== 1) {
    issues.push({ code: 'REPORT_BASIS_ONCE', message: `The assurance boundary appears ${basisOccurrences} times; it must appear exactly once.` });
  }

  // One envelope, not one per mode.
  //
  // The four real high-readiness assessments produced 711-727 words before the
  // sustainment grammar existed, and 921-925 after it. That sits inside the
  // range remediation reports occupy (903-1,285 across the seven real cases), so
  // the evidence does not support a separate sustainment floor. The original
  // shortfall was missing analysis, not an unreachable threshold, and lowering
  // the floor would have hidden that.
  if (customerWordCount < 900 || customerWordCount > 2_600) {
    issues.push({ code: 'CUSTOMER_WORD_ENVELOPE', message: `Customer word count ${customerWordCount} is outside the 900-2,600 envelope for Essential.` });
  }

  // A strong organisation must not be given a problem it does not have.
  if (model.narrativeMode === 'SUSTAINMENT') {
    if ((model.exposures?.rows.length ?? 0) > 0) {
      issues.push({ code: 'NO_MANUFACTURED_WEAKNESS', message: 'A sustainment report carries a priority fraud exposure register.' });
    }
    for (const text of surfaces) {
      const manufactured = sustainmentClaims(text).find((claim) => claim.classification === 'MATERIAL_WEAKNESS_CLAIM');
      if (manufactured) {
        issues.push({ code: 'NO_MANUFACTURED_WEAKNESS', message: `Sustainment prose asserts a present material weakness the assessment does not support (${manufactured.trigger}): "${manufactured.sentence.slice(0, 120)}"` });
        break;
      }
    }
  }

  // Truncation: an ellipsis in customer content means a field was clipped to fit,
  // which loses meaning silently. A dedicated short label is required instead.
  for (const text of surfaces) {
    if (/…|\.\.\./.test(text)) {
      issues.push({ code: 'NO_CUSTOMER_TRUNCATION_ELLIPSIS', message: `Customer surface contains truncated content: "${text.slice(0, 90)}"` });
      break;
    }
  }

  // Exhibit labels are labels. A value this long is a specification that has been
  // routed to the wrong place.
  const labelSurfaces: Array<{ label: string; value: string; max: number }> = [
    ...(model.scenarios?.scenarios ?? []).flatMap((s) => [
      { label: `scenario ${s.scenarioId} entry`, value: s.entryPointShort, max: 90 },
      { label: `scenario ${s.scenarioId} control break`, value: s.controlBreakShort, max: 90 },
      { label: `scenario ${s.scenarioId} exposure`, value: s.exposureShort, max: 90 }
    ]),
    ...(model.exposures?.rows ?? []).map((r) => ({ label: `exposure ${r.rank} interruption`, value: r.interruptionPoint, max: 160 })),
    ...model.priorities.rows.map((r) => ({ label: `priority ${r.rank} outcome`, value: r.outcome, max: 90 }))
  ];
  for (const entry of labelSurfaces) {
    if (entry.value.length > entry.max) {
      issues.push({ code: 'PRESENTATION_LABEL_TOO_LONG', message: `${entry.label} is ${entry.value.length} characters against a ${entry.max} limit; it needs a dedicated short label.` });
    }
  }

  // Family ownership: every exposure and scenario must resolve to a family, and no
  // two rows may claim the same one. Positional pairing previously explained the
  // identity exposure with evidence content and the containment exposure with
  // monitoring content -- both plausible, both wrong.
  const exposureFamilies = (model.exposures?.rows ?? []).map((r) => r.family);
  if (exposureFamilies.some((f) => !f)) {
    issues.push({ code: 'EXPOSURE_FAMILY_OWNERSHIP', message: 'An exposure row does not resolve to a content family.' });
  }
  if (new Set(exposureFamilies).size !== exposureFamilies.length) {
    issues.push({ code: 'EXPOSURE_FAMILY_OWNERSHIP', message: 'Two exposure rows claim the same content family.' });
  }
  const scenarioFamilies = (model.scenarios?.scenarios ?? []).map((s) => s.family);
  if (scenarioFamilies.some((f) => !f)) {
    issues.push({ code: 'SCENARIO_FAMILY_OWNERSHIP', message: 'A scenario does not resolve to a content family.' });
  }
  if (new Set(scenarioFamilies).size !== scenarioFamilies.length) {
    issues.push({ code: 'SCENARIO_FAMILY_OWNERSHIP', message: 'Two scenarios claim the same content family.' });
  }

  // A scenario's flow and its narrative must describe the same fraud mechanic.
  // Previously a detection-evasion narrative sat under identity-change nodes:
  // the families matched, so every family check passed, while the page described
  // two different frauds.
  for (const scenario of model.scenarios?.scenarios ?? []) {
    const terms = scenarioPresentationForExposure(scenario.scenarioFamily)?.mechanicTerms;
    if (!terms || !scenario.howItUnfolds) continue;
    if (!terms.test(scenario.howItUnfolds)) {
      issues.push({ code: 'SCENARIO_MECHANIC_CONTAMINATION', message: `Scenario ${scenario.scenarioId} describes a different mechanic from its pathway nodes: "${scenario.howItUnfolds.slice(0, 90)}"` });
    }
  }

  // "What good looks like" describes an operating state. An artefact name is
  // evidence, and belongs in the supporting register.
  const ARTEFACT_LANGUAGE = /\bRACI\b|\bregister\b|\bchecklist\b|\bcoverage report\b|\bevidence pack\b|\bcallback record\b|\bapproval record\b|\bscreening\b/i;
  for (const row of model.priorities.rows) {
    if (ARTEFACT_LANGUAGE.test(row.betterLooksLike)) {
      issues.push({ code: 'TARGET_STATE_NOT_EVIDENCE', message: `Priority ${row.rank} states an evidence artefact rather than a target operating state: "${row.betterLooksLike.slice(0, 80)}"` });
    }
  }

  // Density: a page whose only content is continuous prose is a wall of text.
  for (const page of model.pages) {
    if (page.kind === 'cover') continue;
    const commentaryWords = words(page.commentary ?? '');
    if (!page.exhibitIds.length && commentaryWords > 220) {
      issues.push({ code: 'PAGE_DENSITY', message: `Page ${page.page} is ${commentaryWords} words of prose with no analytical exhibit.` });
    }
  }

  return {
    ok: issues.length === 0,
    version: ESSENTIAL_PRESENTATION_VALIDATION_VERSION,
    customerWordCount,
    pageCount: model.pages.length,
    issues
  };
}
