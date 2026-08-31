import {
  isCurrentLegalAcceptance,
  TERMS_ACCEPTANCE_ERROR,
  type LegalAcceptanceInput
} from '@/lib/legal/fraud-readiness-terms';

export type StartAssessmentInput = {
  fullName: string;
  email: string;
  roleTitle?: string;
  phone?: string;
  organisationName: string;
  tradingName?: string;
  industry?: string;
  sector?: string;
  province?: string;
  employeeBand?: string;
  annualRevenueBand?: string;
  consentPrivacy: boolean;
  consentResearch: boolean;
};

/**
 * The adaptive journey additionally requires an explicit click-wrap acceptance of the current
 * Fraud Readiness Assessment Terms and Privacy Notice.
 */
export type AdaptiveStartAssessmentInput = StartAssessmentInput & {
  legalAcceptance: LegalAcceptanceInput;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

function cleanOptional(value: unknown): string | null {
  const cleaned = clean(value);
  return cleaned.length ? cleaned : null;
}

export function parseStartAssessmentInput(body: unknown): { ok: true; data: StartAssessmentInput } | { ok: false; errors: string[] } {
  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  const errors: string[] = [];

  const fullName = clean(record.fullName);
  const email = clean(record.email).toLowerCase();
  const organisationName = clean(record.organisationName);
  const consentPrivacy = record.consentPrivacy === true;
  const consentResearch = record.consentResearch === true;

  if (fullName.length < 2) errors.push('Full name is required.');
  if (!EMAIL_RE.test(email)) errors.push('A valid work email address is required.');
  if (organisationName.length < 2) errors.push('Organisation name is required.');
  if (!consentPrivacy) errors.push('Privacy consent is required to start the assessment.');

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    data: {
      fullName,
      email,
      roleTitle: cleanOptional(record.roleTitle) ?? undefined,
      phone: cleanOptional(record.phone) ?? undefined,
      organisationName,
      tradingName: cleanOptional(record.tradingName) ?? undefined,
      industry: cleanOptional(record.industry) ?? undefined,
      sector: cleanOptional(record.sector) ?? undefined,
      province: cleanOptional(record.province) ?? undefined,
      employeeBand: cleanOptional(record.employeeBand) ?? undefined,
      annualRevenueBand: cleanOptional(record.annualRevenueBand) ?? undefined,
      consentPrivacy,
      consentResearch
    }
  };
}

/**
 * Adaptive start parsing.
 *
 * A strict superset of the shared parser: everything it rejects is still rejected, and a new
 * assessment additionally cannot be created unless the request carries the versions of the terms
 * and privacy notice currently in force. Client-side state alone is not acceptance — this check
 * runs on the request itself, and the database trigger added by
 * 20260831180000_fraud_readiness_terms_acceptance.sql refuses the insert independently.
 *
 * The optional research consent is read by the shared parser and is deliberately never required
 * here: bundling product-improvement consent into mandatory service terms would remove the
 * customer's ability to decline it.
 */
export function parseAdaptiveStartAssessmentInput(
  body: unknown
): { ok: true; data: AdaptiveStartAssessmentInput } | { ok: false; errors: string[] } {
  const base = parseStartAssessmentInput(body);
  if (!base.ok) return base;

  const record = typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
  if (!isCurrentLegalAcceptance(record.legalAcceptance)) {
    return { ok: false, errors: [TERMS_ACCEPTANCE_ERROR] };
  }

  return {
    ok: true,
    data: {
      ...base.data,
      legalAcceptance: {
        termsVersion: record.legalAcceptance.termsVersion,
        privacyNoticeVersion: record.legalAcceptance.privacyNoticeVersion
      }
    }
  };
}
