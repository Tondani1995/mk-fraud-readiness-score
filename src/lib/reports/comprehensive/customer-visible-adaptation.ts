import type { AdvisoryEvidenceModel } from '../evidence-model';
import { normaliseRoleText } from './role-normalisation';

/**
 * Customer-visible adaptation for Comprehensive.
 *
 * The analytical model may legitimately use standing playbook labels and neutral
 * placeholders internally. A paid report must not turn those into assertions about
 * the customer's organisation. This layer changes presentation only: identifiers,
 * scores, linkages, periods, severities and analytical classifications are untouched.
 */
const IDENTIFIER_KEY = /(^id$|Id$|Ids$|Ref$|Refs$|Code$|code$|^phase$|^targetPeriod$|^severity$|^materialityClass$|^status$|Class$|Family$)/;

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

  // Role wording is normalised once here for narrative text. Structured role
  // fields are normalised with an explicit context in the assembly layer.
  return normaliseRoleText(text.replace(/\s{2,}/g, ' '));
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
