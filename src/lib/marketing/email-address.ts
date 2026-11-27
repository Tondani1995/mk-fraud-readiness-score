import { createHmac } from 'node:crypto';

/**
 * Address handling for the newsletter. Normalisation is deliberately conservative: lower-case and
 * trim only. Provider-specific rewriting (Gmail dots, plus tags) would merge addresses the person
 * may consider distinct, and would make the stored address differ from the one they confirmed.
 */

const EMAIL_PATTERN = /^[^\s@<>()[\]\\,;:"]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export function normaliseNewsletterEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  if (email.length < 6 || email.length > 254) return null;
  if (!EMAIL_PATTERN.test(email)) return null;
  const [local] = email.split('@');
  if (!local || local.length > 64) return null;
  return email;
}

export function emailDomain(email: string): string {
  return email.slice(email.lastIndexOf('@') + 1);
}

/**
 * Consumer mailbox domains. A subscriber on one of these has no organisational association that a
 * domain can reveal, so restriction screening relies on an Attio person match only.
 */
const PERSONAL_MAILBOX_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com', 'icloud.com',
  'me.com', 'mac.com', 'yahoo.com', 'yahoo.co.za', 'ymail.com', 'aol.com', 'proton.me',
  'protonmail.com', 'gmx.com', 'gmx.net', 'zoho.com', 'mweb.co.za', 'webmail.co.za', 'telkomsa.net',
  'vodamail.co.za', 'iafrica.com', 'absamail.co.za', 'lantic.net', 'hey.com', 'fastmail.com'
]);

export function isPersonalMailboxDomain(domain: string): boolean {
  return PERSONAL_MAILBOX_DOMAINS.has(domain.toLowerCase());
}

/**
 * Keyed hash for logs, rate-limit keys and provider-event correlation. Never log a raw address.
 */
export function newsletterEmailHash(email: string, pepper: string): string {
  return createHmac('sha256', pepper).update('mk-newsletter-email-v1\0' + email, 'utf8').digest('hex');
}
