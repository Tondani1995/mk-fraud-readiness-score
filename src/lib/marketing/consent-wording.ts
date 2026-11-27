/**
 * The exact MK Fraud Signals permission wording, shared by the browser form and the server
 * evidence record. Browser-safe: no Node imports. The words on screen are
 *   before + "Privacy Policy" + after
 * and that concatenation MUST equal CONSENT_WORDING (pinned by scripts/marketing-newsletter-tests.mjs).
 * Any change to these strings requires a new CONSENT_WORDING_VERSION.
 */

export const CONSENT_WORDING_VERSION = 'mk-fraud-signals-consent-v1-2026-11-27' as const;

export const CONSENT_WORDING_DISPLAY = {
  before:
    'Yes, send me MK Fraud Signals, a weekly email from MK Fraud Insights with practitioner-led fraud risk analysis and an occasional invitation to related MK services. ' +
    'I can unsubscribe at any time using the link in every issue. MK Fraud Insights processes my email address as described in its ',
  link: 'Privacy Policy',
  after: ', using Resend (EU) to deliver the email.'
} as const;

export const CONSENT_WORDING = `${CONSENT_WORDING_DISPLAY.before}${CONSENT_WORDING_DISPLAY.link}${CONSENT_WORDING_DISPLAY.after}`;
