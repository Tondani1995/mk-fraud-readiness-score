/**
 * One display vocabulary for roles used by the Comprehensive report.
 *
 * Role context is deliberately explicit.  An executive accountability is not
 * the same thing as a process owner or an oversight function, even when the
 * source library uses a short label or a composite such as "CFO / COO".
 */
export type RoleContext = 'executive' | 'process' | 'oversight' | 'generic';

export interface NormalisedRole {
  id: string;
  label: string;
  context: RoleContext;
}

const EXECUTIVE_ALIASES: Readonly<Record<string, string>> = {
  CEO: 'Chief Executive / Managing Director',
  'CHIEF EXECUTIVE': 'Chief Executive / Managing Director',
  'MANAGING DIRECTOR': 'Chief Executive / Managing Director',
  CFO: 'Chief Financial Officer',
  'CHIEF FINANCIAL OFFICER': 'Chief Financial Officer',
  COO: 'Chief Operating Officer',
  'CHIEF OPERATING OFFICER': 'Chief Operating Officer',
  CTO: 'Chief Technology Officer',
  'CHIEF TECHNOLOGY OFFICER': 'Chief Technology Officer',
  CIO: 'Chief Information Officer',
  'CHIEF INFORMATION OFFICER': 'Chief Information Officer',
  CISO: 'Chief Information Security Officer',
  'CHIEF INFORMATION SECURITY OFFICER': 'Chief Information Security Officer',
  'GENERAL COUNSEL': 'General Counsel',
  FINANCE: 'Chief Financial Officer',
  'CHIEF PEOPLE OFFICER': 'Chief People Officer',
  'CHIEF HUMAN RESOURCES OFFICER': 'Chief People Officer'
};

const PROCESS_ALIASES: Readonly<Record<string, string>> = {
  'FINANCE OPERATIONS ACCOUNTABLE OWNER': 'Finance and payment operations',
  'FINANCE AND PAYMENT OPERATIONS': 'Finance and payment operations',
  FINANCE: 'Finance and payment operations',
  'FINANCE CONTROL': 'Finance and payment operations',
  'ACCOUNTS PAYABLE': 'Finance and payment operations',
  'PROCUREMENT / VENDOR MASTER': 'Procurement and vendor management',
  'PROCUREMENT AND VENDOR MANAGEMENT': 'Procurement and vendor management',
  'SECURITY MONITORING / SOC': 'Technology and information security',
  'SECURITY MONITORING': 'Technology and information security',
  SOC: 'Technology and information security',
  'SECURITY MONITORING FUNCTION': 'Technology and information security',
  'TECHNOLOGY SECURITY ACCOUNTABLE OWNER': 'Technology and information security',
  'PEOPLE WORKFORCE ACCOUNTABLE OWNER': 'People, learning and ethics',
  'OPERATIONS ACCOUNTABLE OWNER': 'Named business process owners',
  'INVESTIGATION AND INCIDENT RESPONSE': 'Investigation and incident response',
  'LEGAL INVESTIGATIONS ACCOUNTABLE OWNER': 'Investigation and incident response',
  'RISK COMPLIANCE ACCOUNTABLE OWNER': 'Risk function',
  'RISK FUNCTION': 'Risk function',
  'HEAD OF RISK': 'Risk function',
  'HEAD OF RISK AND BUSINESS CONTROL OWNERS': 'Risk function and named business process owners',
  'HEAD OF RISK WITH INCIDENT LEAD': 'Risk function with investigation and incident response',
  'HEAD OF RISK WITH CONTROL OWNERS': 'Risk function with named business process owners',
  'FRAUD INCIDENT-RESPONSE LEAD': 'Investigation and incident response',
  'IDENTITY AND ACCESS MANAGEMENT': 'Technology and information security',
  'TECHNOLOGY AND INFORMATION SECURITY': 'Technology and information security',
  'NAMED PROCESS OWNERS': 'Named business process owners',
  'BUSINESS CONTROL OWNERS': 'Named business process owners'
};

const OVERSIGHT_ALIASES: Readonly<Record<string, string>> = {
  'AUDIT COMMITTEE CHAIR': 'Audit Committee Chair',
  'CHAIR OF THE AUDIT COMMITTEE': 'Audit Committee Chair',
  'INDEPENDENT REVIEWER': 'Independent reviewer',
  'EQUIVALENT INDEPENDENT REVIEWER': 'Independent reviewer',
  'INDEPENDENT ASSURANCE REVIEWER': 'Independent reviewer',
  'INDEPENDENT GOVERNING OVERSIGHT': 'Independent governing oversight',
  'AUDIT COMMITTEE': 'Audit Committee',
  'RISK COMMITTEE': 'Risk Committee',
  'INTERNAL AUDIT': 'Internal Audit',
  'FINANCE CONTROL / INTERNAL AUDIT': 'Finance control / Internal Audit',
  'INFORMATION SECURITY / INTERNAL AUDIT': 'Information security / Internal Audit',
  'INFORMATION SECURITY / RISK': 'Information security / Risk',
  'LEGAL / COMPLIANCE': 'Legal / Compliance',
  LEGAL: 'Legal',
  COMPLIANCE: 'Compliance',
  BOARD: 'Board'
};

function key(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toUpperCase();
}

function aliasesFor(context: RoleContext): Readonly<Record<string, string>> {
  if (context === 'executive') return EXECUTIVE_ALIASES;
  if (context === 'process') return PROCESS_ALIASES;
  if (context === 'oversight') return OVERSIGHT_ALIASES;
  return { ...EXECUTIVE_ALIASES, ...PROCESS_ALIASES, ...OVERSIGHT_ALIASES };
}

const OVERSIGHT_ROLE_PATTERN = /^(?:audit committee(?: chair)?|chair (?:of )?(?:the )?audit committee|board|risk committee|internal audit|(?:equivalent )?independent (?:assurance )?reviewer|independent governing oversight|legal|compliance|risk|finance control|information security)(?:\b|$)/i;

function roleParts(value: string): string[] {
  return value.split(/\s*\/\s*|\s+\bor\s+/i).map((part) => part.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

function isOversightRolePart(value: string): boolean {
  const part = key(value);
  return OVERSIGHT_ALIASES[part] !== undefined || OVERSIGHT_ROLE_PATTERN.test(value);
}

function normaliseAtom(value: string, context: RoleContext): string {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (!trimmed) return '';
  return aliasesFor(context)[key(trimmed)] ?? aliasesFor('generic')[key(trimmed)] ?? trimmed;
}

/** Preserve oversight terms when a source field put them in the wrong role slot. */
export function normaliseOversightRoleLabel(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  return roleParts(raw)
    .filter(isOversightRolePart)
    .map((part) => normaliseAtom(part, 'oversight'))
    .filter(Boolean)
    .filter((part, index, parts) => parts.indexOf(part) === index)
    .join(' / ');
}

/** Normalise one role label while retaining meaningful composite alternatives. */
export function normaliseRoleLabel(value: unknown, context: RoleContext): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const parts = roleParts(raw);
  const eligibleParts = context === 'executive' || context === 'process'
    ? parts.filter((part) => !isOversightRolePart(part))
    : parts;
  return eligibleParts
    .map((part) => normaliseAtom(part, context))
    .filter(Boolean)
    .filter((part, index, parts) => parts.indexOf(part) === index)
    .join(' / ');
}

/**
 * Normalise role terms inside narrative text.  This generic form expands
 * abbreviations but does not turn an executive role into a process owner.
 */
export function normaliseRoleText(value: unknown): string {
  let text = String(value ?? '');
  const replacements: ReadonlyArray<[RegExp, string]> = [
    [/\bCEO\b/gi, 'Chief Executive / Managing Director'],
    [/\bCFO\b/gi, 'Chief Financial Officer'],
    [/\bCOO\b/gi, 'Chief Operating Officer'],
    [/\bCTO\b/gi, 'Chief Technology Officer'],
    [/\bCIO\b/gi, 'Chief Information Officer'],
    [/\bCISO\b/gi, 'Chief Information Security Officer'],
    [/\bFinance operations accountable owner\b/gi, 'Finance and payment operations'],
    [/\bTechnology security accountable owner\b/gi, 'Technology and information security'],
    [/\bPeople workforce accountable owner\b/gi, 'People, learning and ethics'],
    [/\bOperations accountable owner\b/gi, 'Named business process owners'],
    [/\bRisk compliance accountable owner\b/gi, 'Risk function'],
    [/\bHead of Risk and business control owners\b/gi, 'Risk function and named business process owners'],
    [/\bHead of Risk with incident lead\b/gi, 'Risk function with investigation and incident response'],
    [/\bHead of Risk with control owners\b/gi, 'Risk function with named business process owners'],
    [/\bSecurity monitoring\s*\/\s*SOC\b/gi, 'Technology and information security'],
    [/\bsecurity monitoring function\b/gi, 'Technology and information security'],
    [/\bHead of Risk\b/gi, 'Risk function']
  ];
  for (const [pattern, replacement] of replacements) text = text.replace(pattern, replacement);
  return text.replace(/\s{2,}/g, ' ').trim();
}

export function roleIdentity(value: unknown, context: RoleContext): NormalisedRole {
  const label = normaliseRoleLabel(value, context);
  const id = `ROLE-${key(label || 'UNSPECIFIED').replace(/[^A-Z0-9]+/g, '-')}`;
  return { id, label: label || 'Unspecified', context };
}

export const ROLE_NORMALISATION_VERSION = 'mk-role-normalisation-v1' as const;
