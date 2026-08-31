/**
 * Fraud Readiness Assessment terms and privacy acceptance — the one place that states which
 * legal versions a new assessment must be created against.
 *
 * Why versions rather than a boolean: a click-wrap acceptance is only evidence if the record says
 * WHAT was accepted. A boolean `consent_privacy` column cannot answer "which wording did this
 * respondent see?" two years later. These identifiers are written onto the assessment at creation
 * and are never rewritten, so an acceptance always resolves to the document that was displayed.
 *
 * Bumping a version deliberately invalidates client-side state: a customer who accepted the
 * previous wording is asked again. That is the intended behaviour of a version bump and the reason
 * the constants live here rather than in a component.
 *
 * The wording still carries an INTERNAL review status (see LEGAL_REVIEW_STATUS). That status is
 * for MK's own release workflow and is deliberately never rendered to a customer.
 */

export const FRAUD_READINESS_TERMS_VERSION = 'FRA-TERMS-2026.1' as const;
export const PRIVACY_NOTICE_VERSION = 'MKFI-PRIVACY-2026.1' as const;

/** Route of the full assessment-specific terms document the click-wrap gate links to. */
export const FRAUD_READINESS_TERMS_PATH = '/fraud-readiness-assessment-terms' as const;
/** Route of the general privacy notice the click-wrap gate links to. */
export const PRIVACY_NOTICE_PATH = '/privacy-policy' as const;

/**
 * INTERNAL ONLY. Never render this on a customer-facing surface.
 *
 * It records, for MK's release workflow, that the wording is still awaiting sign-off by a South
 * African legal practitioner. A customer who is being asked to accept these terms must not be told
 * the document is unfinished: it would undermine the acceptance it is attached to, and the terms
 * are either fit to present or they are not published. The public page and the click-wrap dialog
 * therefore show the version identifier and nothing about review state.
 */
export const LEGAL_REVIEW_STATUS =
  'Draft for legal review. This wording has been prepared for review by a South African legal practitioner and has not yet been confirmed as final.' as const;

export type LegalAcceptanceInput = {
  termsVersion: string;
  privacyNoticeVersion: string;
};

export type LegalAcceptanceRecord = {
  termsVersion: string;
  termsAcceptedAt: string;
  privacyNoticeVersion: string;
  privacyAcknowledgedAt: string;
};

export const REQUIRED_LEGAL_ACCEPTANCE: LegalAcceptanceInput = Object.freeze({
  termsVersion: FRAUD_READINESS_TERMS_VERSION,
  privacyNoticeVersion: PRIVACY_NOTICE_VERSION
});

export const TERMS_ACCEPTANCE_ERROR =
  'The current Fraud Readiness Assessment Terms and Privacy Notice must be accepted before an assessment can be started.';

/**
 * Whether a submitted acceptance matches the versions currently in force.
 *
 * Deliberately an exact match rather than "any non-empty value": accepting a superseded version is
 * not acceptance of the current one, and a client that sends an arbitrary string must not pass.
 */
export function isCurrentLegalAcceptance(value: unknown): value is LegalAcceptanceInput {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    record.termsVersion === FRAUD_READINESS_TERMS_VERSION &&
    record.privacyNoticeVersion === PRIVACY_NOTICE_VERSION
  );
}

/**
 * Build the persisted acceptance record. The timestamps are taken server-side: a client-supplied
 * acceptance time is not evidence of anything.
 */
export function buildLegalAcceptanceRecord(now: Date = new Date()): LegalAcceptanceRecord {
  const acceptedAt = now.toISOString();
  return {
    termsVersion: FRAUD_READINESS_TERMS_VERSION,
    termsAcceptedAt: acceptedAt,
    privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
    privacyAcknowledgedAt: acceptedAt
  };
}

/**
 * The two mandatory acknowledgements, as presented. Research/product-improvement consent is
 * deliberately NOT in this list: bundling an optional research consent into the mandatory service
 * terms would make it non-optional, which is exactly what POPIA does not permit.
 */
export const REQUIRED_ACKNOWLEDGEMENTS = Object.freeze([
  Object.freeze({
    id: 'terms',
    label: 'I have read and accept the Fraud Readiness Assessment Terms.'
  }),
  Object.freeze({
    id: 'privacy',
    label:
      'I acknowledge the Privacy Notice and understand how my information will be used to provide this service.'
  })
] as const);

/** Concise readable summary shown inside the gate. The full document is linked, never inlined. */
export const TERMS_SUMMARY_POINTS = Object.freeze([
  'You confirm you are authorised by your organisation to provide the information you enter.',
  'The assessment is self-reported. MK Fraud Insights does not verify your answers, test whether controls operate, or provide an audit, investigation, assurance or legal opinion.',
  'Outputs support management judgement. They do not guarantee that fraud will be detected or prevented, and responsibility for decisions stays with your management.',
  'Your information is treated as confidential and processed under the Privacy Notice, in line with POPIA.',
  'Automated tools, including AI, are used in preparing the analysis under MK Fraud Insights control.',
  'These terms are governed by South African law.'
]);
