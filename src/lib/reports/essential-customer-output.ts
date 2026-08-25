const RETIRED_REGISTER_PATTERN = /(?:Essential Supporting Register|supporting-register\.xlsx|supporting register)/i;
const ESSENTIAL_CUSTOMER_RESIDUE = /\bSCENARIO-\d+\b|\(D\d+\)|the relevant control|the relevant roadmap action|the relevant assessed control|the relevant evidence requirement|authoritative roadmap dependency IDs|\bERP\b|personal-data obligations may be breached|majority of activity is never examined|(?:Essential Supporting Register|supporting-register\.xlsx|\.xlsx\b)/i;

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

  if (ESSENTIAL_CUSTOMER_RESIDUE.test(cleaned)) {
    throw new Error('essential_customer_output_normalisation_incomplete');
  }
  return cleaned;
}
