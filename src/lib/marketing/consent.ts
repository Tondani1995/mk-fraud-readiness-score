import { createHash } from 'node:crypto';

/**
 * MK Fraud Signals consent contract.
 *
 * The wording shown beside the subscribe control is the permission the person grants. It is
 * versioned and hashed so that every consent event can prove exactly which words were on screen.
 * Changing the wording REQUIRES a new version: old evidence keeps pointing at the old hash, and
 * the test suite fails if the text changes while the version string does not.
 *
 * POPIA section 69 permits electronic direct marketing to a person who has given consent. Consent
 * here is: voluntary (never bundled with an assessment, enquiry or purchase), specific (one
 * publication, one channel), informed (frequency, sender, withdrawal and privacy policy stated)
 * and confirmed (double opt-in: nothing is distributed until the person clicks the confirmation
 * link sent to the address). Nothing else, prior outreach, assessment completion, an existing
 * CRM record or the absence of an objection, is ever treated as permission.
 */

import { CONSENT_WORDING, CONSENT_WORDING_VERSION } from '@/lib/marketing/consent-wording';

export { CONSENT_WORDING, CONSENT_WORDING_VERSION };

export const NEWSLETTER_PERMISSION = 'mk_fraud_signals_weekly_email' as const;

/** The exact SHA-256 of the wording above. The test suite recomputes and pins it. */
export function consentWordingSha256(wording: string = CONSENT_WORDING): string {
  return createHash('sha256').update(wording, 'utf8').digest('hex');
}

/** Places a subscribe control may appear. Anything else is rejected rather than stored. */
export const NEWSLETTER_SOURCES = [
  'footer',
  'publication_page',
  'insight_article',
  'commercial_resource'
] as const;

export type NewsletterSource = (typeof NEWSLETTER_SOURCES)[number];

export function isNewsletterSource(value: unknown): value is NewsletterSource {
  return typeof value === 'string' && (NEWSLETTER_SOURCES as readonly string[]).includes(value);
}

/** A confirmation link is valid for 72 hours, then a fresh request is needed. */
export const CONFIRMATION_TOKEN_TTL_SECONDS = 72 * 60 * 60;

/** A pending request does not trigger a second confirmation email inside this window. */
export const CONFIRMATION_RESEND_COOLDOWN_SECONDS = 10 * 60;

/** Same-path, non-identifying source path. Query strings and fragments are never stored. */
export function sanitiseSourcePath(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null;
  const path = trimmed.split(/[?#]/, 1)[0] ?? '';
  if (!/^\/[A-Za-z0-9/_\-.]*$/.test(path)) return null;
  // Private product surfaces carry tokens or references in the path; never record them.
  if (/^\/(score|review|admin)(\/|$)/.test(path)) return null;
  return path.slice(0, 200);
}
