/**
 * MK Fraud Readiness Comprehensive — frozen product contract.
 *
 * There is one customer-facing Comprehensive product and one commercial
 * contract: an automated analytical assessment at R35,000 incl VAT. No human
 * review is included, no evidence is independently validated, no operating
 * effectiveness is tested and no assurance opinion is provided.
 *
 * The product was previously implemented as a reviewed engagement with evidence
 * intake, named reviewer validation and sign-off before delivery. That was
 * pre-launch implementation and was never sold — the joint-launch catalogue
 * migration records zero orders against the product code in both Production and
 * Staging. It has been migrated in place, not superseded.
 *
 * Reviewer and evidence-validation infrastructure still exists in the repository
 * because it is independently useful for future manual Advisory work. It must
 * never appear in the Comprehensive fulfilment path. `COMPREHENSIVE_FORBIDDEN_
 * FULFILMENT_DEPENDENCIES` names what that means concretely, and a deterministic
 * gate enforces it.
 *
 * This module states the contract. It performs no analysis and renders nothing.
 */

export const COMPREHENSIVE_PRODUCT_CONTRACT_VERSION = 'mk-comprehensive-product-contract-v1' as const;

/** What the customer buys. */
export const COMPREHENSIVE_PRODUCT = {
  name: 'MK Fraud Readiness Comprehensive',
  priceCents: 3_500_000,
  currency: 'ZAR',
  vatInclusive: true,
  fulfilmentModel: 'automated_analytical',
  humanReviewIncluded: false
} as const;

/**
 * The assurance boundary, stated as two closed lists.
 *
 * Comprehensive analyses what the assessment recorded. It may tell management
 * what evidence should exist, what should be tested and what should be
 * verified. It may never claim MK did any of those things.
 */
export const COMPREHENSIVE_MAY_ANALYSE = [
  'assessment responses',
  'scores and score movement',
  'patterns and relationships between responses',
  'risk exposure implied by the recorded position',
  'control design implications',
  'management priorities',
  'conditional fraud scenarios',
  'target control states',
  'implementation roadmaps',
  'evidence that management should hold'
] as const;

export const COMPREHENSIVE_MUST_NOT_CLAIM = [
  'reviewed documentary evidence',
  'tested operating effectiveness',
  'interviewed personnel',
  'inspected sites',
  'validated controls independently',
  'sample-tested transactions',
  'provided external assurance',
  'issued an audit or forensic opinion',
  'confirmed that a fraud event occurred'
] as const;

/**
 * Phrasing that distinguishes a permitted instruction from a prohibited claim.
 *
 * The difference is grammatical person, not vocabulary: "management should
 * obtain evidence of X" is analysis; "MK verified X" is an assurance claim.
 */
export const COMPREHENSIVE_PERMITTED_EVIDENCE_VOICE = [
  'management should obtain evidence of',
  'management should be able to produce',
  'this control should be evidenced by',
  'an acceptable example would be',
  'management should verify'
] as const;

/**
 * Every entry names a subject, because that is what makes a claim prohibited.
 *
 * "Bank-detail changes are independently verified via callback" is control
 * design — the organisation's own process — and is required output. "No evidence
 * has been independently verified" is a denial and is also required output.
 * Neither says MK did anything. Listing the bare adverbial phrase rejected both,
 * which is the keyword-without-sense mistake this contract exists to prevent.
 */
export const COMPREHENSIVE_PROHIBITED_EVIDENCE_VOICE = [
  'MK verified',
  'MK reviewed',
  'MK inspected',
  'MK tested',
  'MK validated',
  'MK confirmed',
  'MK independently verified',
  'we verified',
  'we reviewed',
  'we tested',
  'our review confirmed',
  'reviewer concluded',
  'reviewer confirmed',
  'signed off by MK'
] as const;

/**
 * Fulfilment dependencies the automated product may not have.
 *
 * These are the concrete artefacts of the retired reviewed engagement. A
 * Comprehensive order must be fulfillable from a verified payment and a
 * completed assessment alone — no reviewer, no upload, no manual approval.
 */
export const COMPREHENSIVE_FORBIDDEN_FULFILMENT_DEPENDENCIES = [
  'named reviewer assignment',
  'reviewer sign-off',
  'review_incomplete',
  'evidence intake from the customer',
  'reviewer-uploaded presentation template',
  'manual manuscript approval',
  'engagement review state'
] as const;

/**
 * Provenance model.
 *
 * Every customer-facing statement in a Comprehensive report resolves to one of
 * these origins, and the origin determines what the statement may assert. This
 * is the contract the deterministic gates check against.
 */
export type ComprehensiveProvenance =
  /** A value the customer supplied through the assessment. Reproduced, never reinterpreted. */
  | 'ASSESSMENT_RESPONSE'
  /** Computed by the scoring engine from responses. Traceable to a score run. */
  | 'DERIVED_SCORE'
  /** Computed by the deterministic evidence model from responses and scores. */
  | 'DERIVED_ANALYSIS'
  /**
   * Standing control-design knowledge from the question playbook library,
   * selected by the organisation's response. The design is standard practice,
   * not a finding about this organisation, and must not be phrased as one.
   */
  | 'CONTROL_LIBRARY'
  /** Bounded AI interpretation of the above. Adds meaning, never facts. */
  | 'AI_INTERPRETATION'
  /** Fixed product copy: boundaries, headings, method statements. */
  | 'PRODUCT_COPY';

export const COMPREHENSIVE_PROVENANCE_RULES: Readonly<Record<ComprehensiveProvenance, {
  mayAssertOrganisationFact: boolean;
  mayAssertVerification: boolean;
  note: string;
}>> = {
  ASSESSMENT_RESPONSE: { mayAssertOrganisationFact: true, mayAssertVerification: false, note: 'Self-reported. Always attributed as self-assessed.' },
  DERIVED_SCORE: { mayAssertOrganisationFact: true, mayAssertVerification: false, note: 'Traceable to the score run.' },
  DERIVED_ANALYSIS: { mayAssertOrganisationFact: true, mayAssertVerification: false, note: 'Follows deterministically from responses and scores.' },
  CONTROL_LIBRARY: { mayAssertOrganisationFact: false, mayAssertVerification: false, note: 'Standard control design. Never stated as an observation about this organisation.' },
  AI_INTERPRETATION: { mayAssertOrganisationFact: false, mayAssertVerification: false, note: 'May interpret authorised facts. May not introduce new ones.' },
  PRODUCT_COPY: { mayAssertOrganisationFact: false, mayAssertVerification: false, note: 'Fixed copy, identical across reports.' }
};

/**
 * The ceiling on what the current assessment can support.
 *
 * The complete organisation-specific input is 68 question responses on a 0..4
 * scale, adaptive scope metadata and the organisation name. There is no free
 * text, no process description, no systems inventory, no transaction volume and
 * no incident history. Anything requiring those is out of contract until the
 * questionnaire captures them.
 */
export const COMPREHENSIVE_UNSUPPORTED_CLAIMS = [
  'monetary quantification of fraud exposure',
  'process-specific control design',
  'actual incident history',
  'systems or vendor population detail',
  'named individuals as control owners',
  'sector typologies beyond the standing library'
] as const;

export interface ComprehensiveProductContract {
  version: typeof COMPREHENSIVE_PRODUCT_CONTRACT_VERSION;
  product: typeof COMPREHENSIVE_PRODUCT;
  mayAnalyse: readonly string[];
  mustNotClaim: readonly string[];
  permittedEvidenceVoice: readonly string[];
  prohibitedEvidenceVoice: readonly string[];
  forbiddenFulfilmentDependencies: readonly string[];
  unsupportedClaims: readonly string[];
  provenanceRules: typeof COMPREHENSIVE_PROVENANCE_RULES;
}

export const COMPREHENSIVE_PRODUCT_CONTRACT: ComprehensiveProductContract = {
  version: COMPREHENSIVE_PRODUCT_CONTRACT_VERSION,
  product: COMPREHENSIVE_PRODUCT,
  mayAnalyse: COMPREHENSIVE_MAY_ANALYSE,
  mustNotClaim: COMPREHENSIVE_MUST_NOT_CLAIM,
  permittedEvidenceVoice: COMPREHENSIVE_PERMITTED_EVIDENCE_VOICE,
  prohibitedEvidenceVoice: COMPREHENSIVE_PROHIBITED_EVIDENCE_VOICE,
  forbiddenFulfilmentDependencies: COMPREHENSIVE_FORBIDDEN_FULFILMENT_DEPENDENCIES,
  unsupportedClaims: COMPREHENSIVE_UNSUPPORTED_CLAIMS,
  provenanceRules: COMPREHENSIVE_PROVENANCE_RULES
};

/**
 * Does customer-facing text claim MK performed verification?
 *
 * Deliberately sense-aware, following the Essential lesson that a bare keyword
 * list cannot tell a claim from an instruction: "management should verify the
 * supplier bank change" is required output, while "MK verified the supplier bank
 * change" is a prohibited assurance claim. Only the second is a violation.
 */
export function claimsVerification(text: string): { violation: boolean; matched?: string } {
  const value = String(text ?? '');

  // What makes a sentence an assurance claim is the subject, not the verb.
  // "bank-detail changes are independently verified by callback" is a control
  // design and must pass; "MK independently validated the controls" must not.
  // Matching subject-then-verb also survives adverbs and auxiliaries, which a
  // list of literal phrases cannot: "MK validated" was caught while "MK
  // independently validated" and "MK has verified" walked straight through.
  const SUBJECT = '(?:MK(?:\\s+Fraud\\s+Insights)?|we|our\\s+(?:review|testing|fieldwork|assessment|inspection)|the\\s+reviewer|reviewer)';
  const MODIFIER = '(?:\\s+(?:has|have|had|was|were|is|are|also|already|independently|separately|subsequently|\\w+ly))*';
  const VERB = '(?:verified|reviewed|inspected|tested|validated|confirmed|examined|audited|vouched|substantiated)';
  const subjectVerb = new RegExp(`\\b${SUBJECT}${MODIFIER}\\s+${VERB}\\b`, 'i');
  const match = value.match(subjectVerb);
  if (match) return { violation: true, matched: match[0] };

  for (const phrase of COMPREHENSIVE_PROHIBITED_EVIDENCE_VOICE) {
    const pattern = new RegExp(`(?<!\\bmanagement should\\s)(?<!\\bshould be\\s)\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (pattern.test(value)) return { violation: true, matched: phrase };
  }
  return { violation: false };
}
