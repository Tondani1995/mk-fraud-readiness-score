/**
 * Closed-vocabulary customer-output residue contract. Keep one rule per customer-visible
 * residue category so the final fail-closed guard can report a safe diagnostic code without
 * persisting or logging the matched prose.
 */
export const ESSENTIAL_CUSTOMER_RESIDUE_RULES = [
  { code: 'customer_residue_scenario_id', category: 'Scenario ID', pattern: /\bSCENARIO-\d+\b/i },
  { code: 'customer_residue_domain_id', category: 'Parenthesized domain ID', pattern: /\(D\d+\)/i },
  { code: 'customer_residue_control_placeholder', category: 'Control placeholder', pattern: /the relevant control/i },
  { code: 'customer_residue_roadmap_placeholder', category: 'Roadmap placeholder', pattern: /the relevant roadmap action/i },
  { code: 'customer_residue_assessed_control_placeholder', category: 'Assessed-control placeholder', pattern: /the relevant assessed control/i },
  { code: 'customer_residue_evidence_requirement_placeholder', category: 'Evidence-requirement placeholder', pattern: /the relevant evidence requirement/i },
  { code: 'customer_residue_roadmap_dependency_id', category: 'Roadmap dependency IDs', pattern: /authoritative roadmap dependency IDs/i },
  { code: 'customer_residue_erp', category: 'ERP acronym', pattern: /\bERP\b/i },
  { code: 'customer_residue_personal_data_obligations', category: 'Personal-data obligations', pattern: /personal-data obligations may be breached/i },
  { code: 'customer_residue_majority_unexamined', category: 'Unexamined activity claim', pattern: /majority of activity is never examined/i },
  { code: 'customer_residue_retired_register', category: 'Retired supporting-register promise', pattern: /(?:Essential Supporting Register|supporting-register\.xlsx|supporting register)/i },
  { code: 'customer_residue_xlsx', category: 'Spreadsheet artifact filename', pattern: /\.xlsx\b/i }
] as const;

export type EssentialCustomerResidueCode = typeof ESSENTIAL_CUSTOMER_RESIDUE_RULES[number]['code'];

/** The authoritative final pattern is assembled from the closed-vocabulary rules above. */
export const ESSENTIAL_CUSTOMER_RESIDUE = new RegExp(
  ESSENTIAL_CUSTOMER_RESIDUE_RULES.map(({ pattern }) => `(?:${pattern.source})`).join('|'),
  'i'
);

const RETIRED_REGISTER_PATTERN = /(?:Essential Supporting Register|supporting-register\.xlsx|supporting register)/i;

export class EssentialCustomerResidueError extends Error {
  readonly code: EssentialCustomerResidueCode;

  constructor(code: EssentialCustomerResidueCode) {
    super(code);
    this.name = 'EssentialCustomerResidueError';
    this.code = code;
  }
}

function firstCustomerResidue(value: string) {
  return ESSENTIAL_CUSTOMER_RESIDUE_RULES.find(({ pattern }) => pattern.test(value));
}

/**
 * Final customer-facing normalisation for the Essential PDF.
 *
 * The manuscript and deterministic evidence model remain authoritative. This seam removes only
 * known presentation residue that must never be exposed to a paying customer: internal identifiers,
 * retired package promises, recovery placeholders and a small number of over-specific stock phrases.
 * It deliberately fails closed if any known residue survives the bounded replacements.
 */
export function normaliseEssentialCustomerHtml(html: string): string {
  let cleaned = html;

  // Essential is a PDF-only product. Remove only the individual paragraph that contains a retired
  // register promise; never let the scrubber span across sibling paragraphs or headings.
  cleaned = cleaned.replace(/<p\b[^>]*>[\s\S]*?<\/p>/gi, (paragraph) =>
    RETIRED_REGISTER_PATTERN.test(paragraph) ? '' : paragraph
  );

  cleaned = cleaned
    .replace(/\s*\((?:D\d+|SCENARIO-\d+)\)/g, '')
    .replace(/\s*\(the relevant control(?:,\s*the relevant control)*\)/gi, '')
    .replace(/\s*\(the relevant roadmap action(?:\s+and\s+the relevant roadmap action)?\)/gi, '');

  cleaned = cleaned
    .replace(/Execute the the relevant roadmap action stabilisation item:/gi, 'Execute the priority supplier-onboarding stabilisation action:')
    .replace(/Implement the the relevant roadmap action,\s*the relevant roadmap action and the relevant roadmap action items:/gi, 'Implement the priority 60-day actions:')
    .replace(/the relevant control and the relevant control guide the sequencing and design standard applied to these changes\./gi, 'The agreed sequencing and control standards guide the design of these changes.')
    .replace(/Use authoritative roadmap dependency IDs and escalate threatened prerequisites\./gi, 'Sequence dependent improvements explicitly and escalate any threatened prerequisite.')
    .replace(/\bERP activation\b/gi, 'supplier-record activation')
    .replace(/activated in the ERP/gi, 'activated in the supplier record');

  cleaned = cleaned
    .replace(/Manual review cannot cover transaction volume,\s*so without data-driven tests the majority of activity is never examined and structured schemes persist undetected\./gi,
      'Partly designed detection can leave material anomalies outside consistent data-driven review.')
    .replace(/risk that manual review cannot cover transaction volume,\s*so without data-driven tests the majority of activity is never examined and structured schemes persist undetected\. Consequence pathway: Alert backlogs can conceal important anomalies;\s*unreviewed exceptions can allow losses to compound\./gi,
      'risk that partly designed detection leaves material anomalies outside consistent data-driven review, allowing structured schemes to persist without timely challenge. Consequence pathway: unreviewed exceptions can leave important anomalies unresolved and allow losses to compound.')
    .replace(/This recorded condition is considered in the diagnosis, priority findings, risks and roadmap that follow where it is material to the executive priority set\./gi, '')
    .replace(/security and personal-data obligations may be breached/gi,
      'security and confidentiality obligations may be breached')
    .replace(/<p>\s*<\/p>/gi, '');

  const residue = firstCustomerResidue(cleaned);
  if (residue) throw new EssentialCustomerResidueError(residue.code);
  return cleaned;
}
