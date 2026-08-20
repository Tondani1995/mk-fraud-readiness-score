import type { AdvisoryEvidenceModel } from '../evidence-model';

/**
 * Customer-visible adaptation for Comprehensive.
 *
 * The analytical model may legitimately use standing playbook labels and neutral
 * placeholders internally. A paid report must not turn those into assertions about
 * the customer's organisation. This layer changes presentation only: identifiers,
 * scores, linkages, periods, severities and analytical classifications are untouched.
 */
const IDENTIFIER_KEY = /(^id$|Id$|Ids$|Ref$|Refs$|Code$|code$|^phase$|^targetPeriod$|^severity$|^materialityClass$|^status$|Class$|Family$)/;

const ROLE_REPLACEMENTS: ReadonlyArray<[RegExp, string]> = [
  [/\bChief Technology Officer\b|\bCTO\b/gi, 'Technology security accountable owner'],
  [/\bChief Information Security Officer\b|\bCISO\b/gi, 'Technology security accountable owner'],
  [/\bChief People Officer\b|\bChief Human Resources Officer\b/gi, 'People workforce accountable owner'],
  [/\bHead of (?:People|HR)\b/gi, 'People workforce accountable owner'],
  [/\bGeneral Counsel\b/gi, 'Legal investigations accountable owner'],
  [/\bChair of (?:the )?Audit[- ]Committee\b|\bAudit[- ]Committee Chair\b/gi, 'Independent governing oversight'],
  [/\bAudit[- ]Committee\b/gi, 'Independent governing oversight'],
  [/\bChief Financial Officer\b|\bCFO\b/gi, 'Finance operations accountable owner'],
  [/\bChief Operating Officer\b|\bCOO\b/gi, 'Operations accountable owner'],
  [/\bHead of Risk\b|\bChief Risk Officer\b/gi, 'Risk compliance accountable owner'],
  [/\bSecurity Operations Centre\b|\bSecurity Operations Center\b|\bSOC\b/gi, 'security monitoring function'],
  [/\bLearning and Development\b/gi, 'workforce training function']
];

function cleanText(value: string): string {
  let text = value;

  // Generic case-validation placeholders are internal analytical fallbacks, not
  // acceptable customer copy. Handle the specific phrase first so "Impact" does
  // not match inside "Operating impact".
  text = text
    .replace(/\bOperating impact requires case-specific validation\.?/gi,
      'The operational consequence depends on the affected process, system or service.')
    .replace(/\bImpact requires case-specific validation\.?/gi,
      'The financial consequence depends on the value and transactions affected.')
    .replace(/\bOperating\s+The financial consequence depends on the value and transactions affected\.?/gi,
      'The operational consequence depends on the affected process, system or service.')
    .replace(/\bThe strong self-reported response should be validated\b/gi,
      'The self-reported response should be validated')
    .replace(/\bstrong self-reported response\b/gi, 'self-reported response')
    .replace(/\binduction packs, payslip inserts, notice boards at depots and sites, intranet and supervisor briefings\b/gi,
      'induction, workforce communication channels, operating-location notices where relevant and manager briefings')
    .replace(/\bpayslip inserts?\b/gi, 'workforce communication channels')
    .replace(/\b(?:depots|branches|sites)\b/gi, 'operating locations')
    .replace(/\boperating locations\s+and\s+operating locations\b/gi, 'operating locations');

  for (const [pattern, replacement] of ROLE_REPLACEMENTS) text = text.replace(pattern, replacement);

  // Composite playbook labels often contain the same formal owner twice after
  // adaptation (for example CFO / COO). Keep one functional owner label instead.
  text = text
    .replace(/\bFinance operations accountable owner\s*\/\s*Operations accountable owner\b/gi,
      'Finance and operations accountable owner')
    .replace(/\bOperations accountable owner\s*\/\s*Finance operations accountable owner\b/gi,
      'Finance and operations accountable owner')
    .replace(/\b([A-Za-z ]+ accountable owner)\s*\/\s*\1\b/gi, '$1')
    .replace(/\bIndependent governing oversight\s*\/\s*Independent governing oversight\b/gi,
      'Independent governing oversight');

  return text.replace(/\s{2,}/g, ' ').trim();
}

export function adaptComprehensiveEvidenceModel(model: AdvisoryEvidenceModel): AdvisoryEvidenceModel {
  const walk = (value: unknown, key = ''): unknown => {
    if (typeof value === 'string') return IDENTIFIER_KEY.test(key) ? value : cleanText(value);
    if (Array.isArray(value)) return value.map((item) => walk(item));
    if (!value || typeof value !== 'object') return value;
    const copy: Record<string, unknown> = {};
    for (const [childKey, item] of Object.entries(value as Record<string, unknown>)) {
      copy[childKey] = walk(item, childKey);
    }
    return copy;
  };
  return walk(model) as AdvisoryEvidenceModel;
}

function boundedControlResponse(value: string): string {
  const cleaned = cleanText(value).replace(/\s*\.\s*;\s*/g, '. ');
  if (!cleaned) return cleaned;

  // A scenario may link to several controls and the Fact Pack can concatenate
  // all full control designs. The scenario table needs the first actual break
  // point, not an appendix-sized control catalogue. Select the first complete
  // control clause deterministically and retain the linked IDs for traceability.
  const firstControl = cleaned.split(/\.\s+(?=[A-Z][A-Za-z ]{2,40}\b(?:must|defines?|performs?|maintains?|opens?|requires?|publishes?|ensures?|exports?))/)[0] ?? cleaned;
  const firstClause = (firstControl.split(/;\s*/)[0] ?? firstControl).trim();
  if (firstClause.length <= 320) return /[.!?]$/.test(firstClause) ? firstClause : `${firstClause}.`;

  const slice = firstClause.slice(0, 317);
  const boundary = Math.max(slice.lastIndexOf(', '), slice.lastIndexOf(' '));
  const out = slice.slice(0, boundary > 180 ? boundary : 317).trim().replace(/[,:;\-]+$/, '');
  return `${out}.`;
}

/**
 * The Fact Pack remains authoritative for the scenario. This only bounds the
 * customer-visible interruption-point field and cleans the same presentation
 * artefacts as the register model. No scenario, risk or control linkage changes.
 */
export function adaptComprehensiveScenarioFacts<T extends readonly any[]>(facts: T): T {
  return facts.map((scenario) => {
    if (!scenario || typeof scenario !== 'object') return scenario;
    const copy: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(scenario as Record<string, unknown>)) {
      if (typeof value === 'string' && !IDENTIFIER_KEY.test(key)) {
        copy[key] = key === 'requiredControlResponse' ? boundedControlResponse(value) : cleanText(value);
      } else if (Array.isArray(value)) {
        copy[key] = value.map((item) => typeof item === 'string' ? cleanText(item) : item);
      } else {
        copy[key] = value;
      }
    }
    return copy;
  }) as unknown as T;
}

export { cleanText as cleanComprehensiveCustomerText };
