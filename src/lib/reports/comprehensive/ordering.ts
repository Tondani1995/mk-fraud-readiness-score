/**
 * Canonical customer-facing ordering for the Comprehensive product.
 *
 * The analytical model may arrive in database, lexical or insertion order. A
 * single comparator is used by assembly, narrative input, PDF and workbook
 * adapters so the two customer artefacts cannot disagree about sequence.
 */

export const COMPREHENSIVE_HORIZON_ORDER = [
  '30 days',
  '60 days',
  '90 days',
  '3-6 months',
  '6-12 months'
] as const;

function numericSuffix(value: string): number | null {
  const match = String(value ?? '').trim().match(/(?:^|\D)(\d+)(?:\D|$)/);
  return match ? Number(match[1]) : null;
}

export function compareDomainCodes(left: string, right: string): number {
  const leftNumber = numericSuffix(left);
  const rightNumber = numericSuffix(right);
  if (leftNumber !== null && rightNumber !== null && leftNumber !== rightNumber) return leftNumber - rightNumber;
  if (leftNumber !== null && rightNumber === null) return -1;
  if (leftNumber === null && rightNumber !== null) return 1;
  return String(left ?? '').localeCompare(String(right ?? ''));
}

export function compareDomainRows<T extends { domainCode?: string; domainName?: string; name?: string }>(left: T, right: T): number {
  return compareDomainCodes(
    left.domainCode ?? left.domainName ?? left.name ?? '',
    right.domainCode ?? right.domainName ?? right.name ?? ''
  );
}

export function compareHorizons(left: string, right: string): number {
  const leftRank = COMPREHENSIVE_HORIZON_ORDER.indexOf(left as typeof COMPREHENSIVE_HORIZON_ORDER[number]);
  const rightRank = COMPREHENSIVE_HORIZON_ORDER.indexOf(right as typeof COMPREHENSIVE_HORIZON_ORDER[number]);
  const safeLeft = leftRank < 0 ? COMPREHENSIVE_HORIZON_ORDER.length : leftRank;
  const safeRight = rightRank < 0 ? COMPREHENSIVE_HORIZON_ORDER.length : rightRank;
  return safeLeft - safeRight || String(left).localeCompare(String(right));
}

const WORK_TYPE_ORDER: Readonly<Record<string, number>> = {
  IMPLEMENT: 1,
  CONFIRM: 1,
  EMBED_AND_EVIDENCE: 2,
  ASSURE_AND_REVIEW: 3
};

export function compareProgrammeActions<T extends {
  workType?: string;
  targetPeriod?: string;
  action?: string;
  deliverable?: string;
  actionId?: string;
  id?: string;
  domainCode?: string;
  domainName?: string;
}>(left: T, right: T): number {
  const leftPeriod = left.targetPeriod ?? '';
  const rightPeriod = right.targetPeriod ?? '';
  return compareHorizons(leftPeriod, rightPeriod)
    || (WORK_TYPE_ORDER[left.workType ?? ''] ?? 9) - (WORK_TYPE_ORDER[right.workType ?? ''] ?? 9)
    || compareDomainCodes(left.domainCode ?? left.domainName ?? '', right.domainCode ?? right.domainName ?? '')
    || String(left.action ?? left.deliverable ?? '').localeCompare(String(right.action ?? right.deliverable ?? ''))
    || String(left.actionId ?? left.id ?? '').localeCompare(String(right.actionId ?? right.id ?? ''));
}

export function sortByCanonicalDomain<T extends { domainCode?: string; domainName?: string; name?: string }>(values: readonly T[]): T[] {
  return [...values].sort(compareDomainRows);
}

export function sortByCanonicalHorizon<T extends { horizon?: string; phase?: string; targetPeriod?: string }>(values: readonly T[]): T[] {
  return [...values].sort((left, right) => compareHorizons(left.horizon ?? left.phase ?? left.targetPeriod ?? '', right.horizon ?? right.phase ?? right.targetPeriod ?? ''));
}
