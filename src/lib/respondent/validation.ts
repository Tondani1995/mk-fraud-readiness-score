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
