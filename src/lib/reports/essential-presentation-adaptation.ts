import { deriveSupportedOperatingExposures, hasExposure, type SupportedExposure } from './narrative/operating-exposures';

/**
 * Essential-only presentation adaptation.
 *
 * The question playbooks are authoritative and shared with Comprehensive, so they are not
 * rewritten here. They do, however, carry two things that reached a customer who had no
 * evidence for either: illustrative operating routes such as refund abuse and stock
 * write-offs, and formal enterprise titles such as Chief Technology Officer. A
 * professional-services organisation with no recorded workforce-size or formal-structure
 * evidence was told to route work through both.
 *
 * This adapts presentation only. What a control must do, the evidence it requires, its
 * cadence and its escalation threshold are untouched -- only the illustrative route and
 * the owner label change, and only where the assessment does not license them.
 */

/** Formal titles replaced by function-first ownership when structure is not evidenced. */
const ROLE_ADAPTATIONS: ReadonlyArray<[RegExp, string]> = [
  [/\bChief Technology Officer\b|\bCTO\b/gi, 'Technology / security accountable owner'],
  [/\bChief Information Security Officer\b|\bCISO\b/gi, 'Technology / security accountable owner'],
  [/\bChief People Officer\b|\bChief Human Resources Officer\b/gi, 'People / workforce accountable owner'],
  [/\bHead of (?:People|HR)\b/gi, 'People / workforce accountable owner'],
  [/\bGeneral Counsel\b/gi, 'Legal / investigations accountable owner'],
  [/\bChair of (?:the )?Audit Committee\b|\bAudit Committee Chair\b/gi, 'Governing body / independent oversight'],
  [/\bAudit Committee\b/gi, 'Governing body / independent oversight'],
  [/\bChief Financial Officer\b|\bCFO\b/gi, 'Finance / operations accountable owner'],
  [/\bChief Operating Officer\b|\bCOO\b/gi, 'Finance / operations accountable owner'],
  [/\bHead of Risk\b|\bChief Risk Officer\b/gi, 'Risk / compliance accountable owner'],
  [/\bSecurity Operations Centre\b|\bSecurity Operations Center\b|\bSOC\b/gi, 'the security monitoring function'],
  [/\bLearning and Development\b/gi, 'the workforce training function']
];

/** Structural assumptions with no gateway evidence behind them. */
const STRUCTURE_ADAPTATIONS: ReadonlyArray<[RegExp, string]> = [
  [/\bpayslip inserts?\b/gi, 'the workforce communication channels used by the organisation'],
  [/\b(?:depots|branches|sites)\b/gi, 'operating locations']
];

/**
 * Illustrative operating routes, each with the exposure that licenses it. Where the
 * exposure is absent the example is replaced by bounded neutral wording rather than
 * deleted, so the underlying control weakness still reads as a weakness.
 */
const EXPOSURE_GATED_PHRASES: ReadonlyArray<{ pattern: RegExp; requires: string; neutral: string }> = [
  // The combined phrase names two routes with different evidence, so each half is gated
  // on its own exposure; only when neither is evidenced does the example become neutral.
  { pattern: /such as refund abuse or stock write-off manipulation/gi, requires: 'BOTH_REFUND_AND_STOCK', neutral: '@@SPLIT@@' },
  { pattern: /\bstock write-off manipulation\b/gi, requires: 'PHYSICAL_STOCK_OR_ASSETS', neutral: 'manipulation of a value-bearing adjustment' },
  { pattern: /\brefund abuse\b/gi, requires: 'REFUNDS_AND_ADJUSTMENTS', neutral: 'misuse of a manual adjustment' },
  { pattern: /\bstock\b/gi, requires: 'PHYSICAL_STOCK_OR_ASSETS', neutral: 'held assets' },
  { pattern: /\bcash handling\b/gi, requires: 'CASH_HANDLING', neutral: 'value handling' }
];

export interface EssentialAdaptationContext {
  exposures: SupportedExposure[];
  /** Titles the assessment itself evidences may stand; nothing else is invented. */
  evidencedTitles: readonly string[];
}

export function buildEssentialAdaptationContext(gatewayAnswers: Readonly<Record<string, string>> | undefined, evidencedTitles: readonly string[] = []): EssentialAdaptationContext {
  return { exposures: deriveSupportedOperatingExposures(gatewayAnswers), evidencedTitles };
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
    // A title the assessment actually records is real and may stand. Matching uses a
    // non-global copy: a global regex carries lastIndex between calls, so reusing it for
    // test() would make the same input adapt differently on a second pass.
    const probe = new RegExp(pattern.source, pattern.flags.replace('g', ''));
    if (context.evidencedTitles.some((title) => probe.test(title))) continue;
    text = text.replace(pattern, replacement);
  }

  for (const [pattern, replacement] of STRUCTURE_ADAPTATIONS) {
    text = text.replace(pattern, replacement);
  }

  // Collapse any duplicate owner label produced by two titles mapping to one function.
  return text.replace(/\b([A-Z][a-z]+ \/ [a-z]+ accountable owner)(\s*\/\s*\1)+/g, '$1');
}


/** Keys carrying identity or references, which must never be rewritten. */
const IDENTIFIER_KEY = /(^id$|Id$|Ids$|Ref$|Refs$|Code$|code$|^phase$|^targetPeriod$|^severity$|^materialityClass$|^status$|Class$|Family$)/;

/**
 * An Essential-only adapted copy of the advisory evidence model.
 *
 * Every Essential consumer -- projection, Fact Pack, renderer and supporting register --
 * must read the same adapted text, or the PDF suppresses a claim the writer still sees.
 * The shared model is deep-copied rather than mutated, because Comprehensive consumes the
 * original and its accepted output must not change.
 */
export function adaptEssentialEvidenceModel<T>(model: T, gatewayAnswers: Readonly<Record<string, string>> | undefined, evidencedTitles: readonly string[] = []): T {
  const context = buildEssentialAdaptationContext(gatewayAnswers, evidencedTitles);
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
  return walk(model) as T;
}
