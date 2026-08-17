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
  [/\bChief Technology Officer\b|\bCTO\b/g, 'Technology / security accountable owner'],
  [/\bChief Information Security Officer\b|\bCISO\b/g, 'Technology / security accountable owner'],
  [/\bChief People Officer\b|\bChief Human Resources Officer\b/g, 'People / workforce accountable owner'],
  [/\bHead of (?:People|HR)\b/g, 'People / workforce accountable owner'],
  [/\bGeneral Counsel\b/g, 'Legal / investigations accountable owner'],
  [/\bChair of (?:the )?Audit Committee\b|\bAudit Committee Chair\b/g, 'Governing body / independent oversight'],
  [/\bAudit Committee\b/g, 'Governing body / independent oversight'],
  [/\bChief Financial Officer\b|\bCFO\b/g, 'Finance / operations accountable owner'],
  [/\bChief Operating Officer\b|\bCOO\b/g, 'Finance / operations accountable owner'],
  [/\bHead of Risk\b|\bChief Risk Officer\b/g, 'Risk / compliance accountable owner'],
  [/\bSecurity Operations Centre\b|\bSecurity Operations Center\b|\bSOC\b/g, 'the security monitoring function'],
  [/\bLearning and Development\b/g, 'the workforce training function']
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
const EXPOSURE_GATED_PHRASES: ReadonlyArray<{ pattern: RegExp; requires: Parameters<typeof hasExposure>[1]; neutral: string }> = [
  { pattern: /such as refund abuse or stock write-off manipulation/gi, requires: 'PHYSICAL_STOCK_OR_ASSETS', neutral: 'in a material value-bearing process' },
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

  for (const { pattern, requires, neutral } of EXPOSURE_GATED_PHRASES) {
    if (hasExposure(context.exposures, requires)) continue;
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
