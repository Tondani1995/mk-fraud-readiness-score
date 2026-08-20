/**
 * Supported operating exposures, derived only from evidence the assessment captured.
 *
 * Fraud scenarios previously carried no operating-model context at all: two organisations
 * with the same weak control family received byte-identical prose, because the scenario
 * library is keyed on the weakness alone. This derives the small set of operating facts
 * the customer actually stated at the adaptive gateways, so a scenario can be framed
 * around the organisation's real environment.
 *
 * Two rules govern everything here.
 *
 * An exposure exists only when a gateway answer establishes it. Nothing is inferred from
 * the organisation's name, and nothing is inferred from its sector: `G01` is `other` for
 * most organisations, so it carries almost no information and is deliberately unused.
 * Concepts the assessment never captures -- fleets, fuel cards, subcontractors, patients,
 * bookings, couriers -- have no derivation path and cannot be produced.
 *
 * Absence of evidence is not evidence of absence. An unanswered gateway yields no
 * exposure, which makes the scenario fall back to its existing neutral wording. A generic
 * scenario is always preferable to a fabricated specific one.
 */

export type OperatingExposureId =
  | 'CASH_HANDLING'
  | 'SIGNIFICANT_CASH_HANDLING'
  | 'DIGITAL_CUSTOMER_ACTIVITY'
  | 'REFUNDS_AND_ADJUSTMENTS'
  | 'DISTRIBUTED_OPERATIONS'
  | 'SINGLE_SITE_OPERATIONS'
  | 'PHYSICAL_STOCK_OR_ASSETS'
  | 'OUTSOURCED_SUPPLIER_MANAGEMENT'
  | 'INTERNAL_SUPPLIER_MANAGEMENT'
  | 'OUTSOURCED_PAYROLL'
  | 'TEMPORARY_OR_SUBCONTRACTED_WORKFORCE'
  | 'PERSONAL_DATA_HELD'
  | 'THIRD_PARTY_DIGITAL_DEPENDENCE';

export interface SupportedExposure {
  id: OperatingExposureId;
  /** Gateway ids that established it, for the evidence trace. */
  evidence: string[];
  /** The answer values relied on, so a trace can be audited without the raw table. */
  values: string[];
}

export type GatewayAnswers = Readonly<Record<string, string>> | undefined;

/** Each exposure names the gateway it needs and the answers that establish it. */
const RULES: ReadonlyArray<{ id: OperatingExposureId; gateway: string; accepts: readonly string[] }> = [
  { id: 'CASH_HANDLING', gateway: 'G05', accepts: ['minor', 'significant'] },
  { id: 'SIGNIFICANT_CASH_HANDLING', gateway: 'G05', accepts: ['significant'] },
  { id: 'PHYSICAL_STOCK_OR_ASSETS', gateway: 'G06', accepts: ['yes'] },
  { id: 'DIGITAL_CUSTOMER_ACTIVITY', gateway: 'G08', accepts: ['yes', 'platform'] },
  { id: 'PERSONAL_DATA_HELD', gateway: 'G09', accepts: ['yes'] },
  { id: 'REFUNDS_AND_ADJUSTMENTS', gateway: 'G10', accepts: ['yes'] },
  { id: 'DISTRIBUTED_OPERATIONS', gateway: 'G11', accepts: ['yes'] },
  { id: 'SINGLE_SITE_OPERATIONS', gateway: 'G11', accepts: ['no'] },
  { id: 'TEMPORARY_OR_SUBCONTRACTED_WORKFORCE', gateway: 'G12', accepts: ['yes'] },
  { id: 'THIRD_PARTY_DIGITAL_DEPENDENCE', gateway: 'G13', accepts: ['yes'] },
  { id: 'OUTSOURCED_SUPPLIER_MANAGEMENT', gateway: 'G03', accepts: ['outsourced', 'shared_service'] },
  { id: 'INTERNAL_SUPPLIER_MANAGEMENT', gateway: 'G03', accepts: ['internal'] },
  { id: 'OUTSOURCED_PAYROLL', gateway: 'G07', accepts: ['outsourced', 'shared_service'] }
];

export function deriveSupportedOperatingExposures(answers: GatewayAnswers): SupportedExposure[] {
  if (!answers) return [];
  const supported: SupportedExposure[] = [];
  for (const rule of RULES) {
    const value = answers[rule.gateway];
    // 'unknown' is an explicit gateway option meaning the customer could not say. It
    // establishes nothing, so it must never satisfy an exposure.
    if (!value || value === 'unknown') continue;
    if (!rule.accepts.includes(value)) continue;
    supported.push({ id: rule.id, evidence: [rule.gateway], values: [value] });
  }
  return supported;
}

export function hasExposure(exposures: readonly SupportedExposure[], id: OperatingExposureId): boolean {
  return exposures.some((exposure) => exposure.id === id);
}

export function evidenceFor(exposures: readonly SupportedExposure[], id: OperatingExposureId): string[] {
  return exposures.find((exposure) => exposure.id === id)?.evidence ?? [];
}
