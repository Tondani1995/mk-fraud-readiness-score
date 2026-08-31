/**
 * Server-side validation for the two enquiry intakes that have no private token to authenticate
 * them: the public MK Advisory enquiry and the general website contact enquiry.
 *
 * Nothing here trusts the browser. Every choice field is checked against the approved allow-list
 * that the database also enforces, every free-text field is stripped of angle brackets and length
 * bounded before it is stored, and the honeypot is treated as a silent success so an automated
 * submitter learns nothing from the response.
 */

import {
  ALLOWED_ADVISORY_CONTACT_METHODS,
  ALLOWED_ADVISORY_FOCUS_AREAS,
  ALLOWED_ADVISORY_REASONS,
  ALLOWED_ADVISORY_TIMEFRAMES,
  ALLOWED_WEBSITE_SERVICE_INTERESTS
} from '@/lib/enquiries/taxonomy';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const LIMITS = {
  name: 120,
  email: 254,
  company: 160,
  phone: 40,
  notes: 800,
  message: 4000
} as const;

/** Collapse whitespace, drop angle brackets, bound length. Returns '' for anything unusable. */
export function cleanText(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

/** Same, but newlines are preserved because a message body legitimately has paragraphs. */
export function cleanMultiline(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/[<>]/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLength);
}

function choice(value: unknown, allowed: Set<string>, label: string, errors: string[]) {
  if (typeof value === 'string' && allowed.has(value)) return value;
  errors.push(`${label} must be one of the approved options.`);
  return null;
}

function focusAreas(value: unknown, errors: string[]) {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push('At least one approved area of focus is required.');
    return [];
  }
  const cleaned: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || !ALLOWED_ADVISORY_FOCUS_AREAS.has(item)) {
      errors.push('Areas of focus must contain only approved options.');
      return [];
    }
    if (!cleaned.includes(item)) cleaned.push(item);
  }
  return cleaned;
}

/** A filled honeypot means an automated submitter; the caller reports success and stores nothing. */
export function honeypotTripped(body: unknown): boolean {
  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const value = record.botcheck ?? record.website ?? record.company_website;
  return typeof value === 'string' && value.trim().length > 0;
}

export type PublicAdvisoryEnquiryInput = {
  contactName: string;
  email: string;
  companyName: string;
  contactPhone: string | null;
  primaryReason: string;
  areasOfFocus: string[];
  preferredContactMethod: string;
  preferredConsultationTimeframe: string;
  notes: string | null;
};

export function parsePublicAdvisoryEnquiry(
  body: unknown
): { ok: true; data: PublicAdvisoryEnquiryInput } | { ok: false; errors: string[] } {
  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const errors: string[] = [];

  const contactName = cleanText(record.contactName, LIMITS.name);
  const email = cleanText(record.email, LIMITS.email).toLowerCase();
  const companyName = cleanText(record.companyName, LIMITS.company);
  const contactPhone = cleanText(record.contactPhone, LIMITS.phone);

  if (contactName.length < 2) errors.push('Your full name is required.');
  if (!EMAIL_RE.test(email)) errors.push('A valid work email address is required.');
  if (companyName.length < 2) errors.push('Your organisation name is required.');

  const primaryReason = choice(record.primaryReason, ALLOWED_ADVISORY_REASONS, 'Primary reason', errors);
  const areas = focusAreas(record.areasOfFocus, errors);
  const preferredContactMethod = choice(
    record.preferredContactMethod,
    ALLOWED_ADVISORY_CONTACT_METHODS,
    'Preferred contact method',
    errors
  );
  const preferredConsultationTimeframe = choice(
    record.preferredConsultationTimeframe,
    ALLOWED_ADVISORY_TIMEFRAMES,
    'Preferred timeframe',
    errors
  );

  // Consent is a database CHECK for every mk_advisory row, so it is refused here rather than
  // allowed to fail as an opaque 500 at the insert.
  if (record.consentContact !== true) {
    errors.push('Consent is required before MK Fraud Insights can contact you about this enquiry.');
  }

  if (errors.length || !primaryReason || !preferredContactMethod || !preferredConsultationTimeframe) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      contactName,
      email,
      companyName,
      contactPhone: contactPhone || null,
      primaryReason,
      areasOfFocus: areas,
      preferredContactMethod,
      preferredConsultationTimeframe,
      notes: cleanMultiline(record.notes, LIMITS.notes) || null
    }
  };
}

export type WebsiteContactEnquiryInput = {
  contactName: string;
  email: string;
  companyName: string | null;
  contactPhone: string | null;
  serviceInterest: string;
  message: string;
};

export function parseWebsiteContactEnquiry(
  body: unknown
): { ok: true; data: WebsiteContactEnquiryInput } | { ok: false; errors: string[] } {
  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const errors: string[] = [];

  const contactName = cleanText(record.name ?? record.contactName, LIMITS.name);
  const email = cleanText(record.email, LIMITS.email).toLowerCase();
  const companyName = cleanText(record.company ?? record.companyName, LIMITS.company);
  const contactPhone = cleanText(record.phone ?? record.contactPhone, LIMITS.phone);
  const message = cleanMultiline(record.message, LIMITS.message);

  if (contactName.length < 2) errors.push('Your name is required.');
  if (!EMAIL_RE.test(email)) errors.push('A valid email address is required.');
  if (message.length < 10) errors.push('Please tell us a little about what you need.');

  const serviceInterest = choice(
    record.service ?? record.serviceInterest,
    ALLOWED_WEBSITE_SERVICE_INTERESTS,
    'Service',
    errors
  );

  if (errors.length || !serviceInterest) return { ok: false, errors };

  return {
    ok: true,
    data: {
      contactName,
      email,
      companyName: companyName || null,
      contactPhone: contactPhone || null,
      serviceInterest,
      message
    }
  };
}
