/**
 * Supported operating exposures, derived from the recorded operating context.
 *
 * Scenario prose is keyed on control weakness alone, so two organisations with the same weak
 * control family once received byte-identical narrative. These exposures exist to let a
 * scenario be framed around the environment the customer actually described.
 *
 * They used to be derived by reading gateway codes directly, which is how a V1.2 assessment
 * came to infer a multi-site operation from a personal-data answer. Derivation now runs
 * through `operating-context`, which resolves meaning semantically per graph version. An
 * exposure can therefore only ever be as wrong as the semantic registration, and that is one
 * governed table rather than rules scattered across a file.
 *
 * The two standing rules still hold. An exposure exists only where an answer establishes it,
 * and concepts the assessment never captures -- fleets, fuel cards, patients, couriers -- have
 * no derivation path and cannot be produced. Absence of evidence remains absence: an
 * unanswered or unknown gateway yields no exposure, and the scenario keeps its neutral
 * wording, because a generic scenario is always preferable to a fabricated specific one.
 */

import {
  deriveOperatingContext, contextAffirms, contextNegates,
  type OperatingContextFact, type OperatingContextKey
} from './operating-context';

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

export type GatewayAnswers = Readonly<Record<string, string>> | null | undefined;

/**
 * Each exposure names the semantic key it needs and the recorded positions that establish it.
 *
 * `requires: 'AFFIRMED'` accepts only a positive answer, optionally narrowed to specific
 * option values. `requires: 'NEGATED'` accepts only an explicit recorded negative, which is
 * how SINGLE_SITE_OPERATIONS stays distinct from "we never asked".
 */
const RULES: ReadonlyArray<{
  id: OperatingExposureId;
  key: OperatingContextKey;
  requires: 'AFFIRMED' | 'NEGATED';
  /** When present, only these option values satisfy the rule. */
  values?: readonly string[];
}> = [
  { id: 'CASH_HANDLING', key: 'PHYSICAL_CASH_EXPOSURE', requires: 'AFFIRMED' },
  // V1.1 graded cash exposure; V1.2 asks a plain yes/no, so this narrows to nothing there
  // rather than treating an ungraded "yes" as significant.
  { id: 'SIGNIFICANT_CASH_HANDLING', key: 'PHYSICAL_CASH_EXPOSURE', requires: 'AFFIRMED', values: ['significant'] },
  { id: 'PHYSICAL_STOCK_OR_ASSETS', key: 'STOCK_OR_PHYSICAL_ASSETS', requires: 'AFFIRMED' },
  { id: 'DIGITAL_CUSTOMER_ACTIVITY', key: 'CUSTOMER_DIGITAL_CHANNELS', requires: 'AFFIRMED' },
  { id: 'PERSONAL_DATA_HELD', key: 'PERSONAL_OR_IDENTITY_DATA', requires: 'AFFIRMED' },
  { id: 'REFUNDS_AND_ADJUSTMENTS', key: 'MANUAL_FINANCIAL_OR_STOCK_ADJUSTMENTS', requires: 'AFFIRMED' },
  { id: 'DISTRIBUTED_OPERATIONS', key: 'MULTI_SITE_OR_DISTRIBUTED_OPERATIONS', requires: 'AFFIRMED' },
  { id: 'SINGLE_SITE_OPERATIONS', key: 'MULTI_SITE_OR_DISTRIBUTED_OPERATIONS', requires: 'NEGATED' },
  { id: 'TEMPORARY_OR_SUBCONTRACTED_WORKFORCE', key: 'TEMPORARY_SEASONAL_OR_SUBCONTRACTED_WORKFORCE', requires: 'AFFIRMED' },
  // V1.1 asked about remote working and third-party platform dependence in one question. V1.2
  // separates them and has no equivalent, so this simply does not resolve there.
  { id: 'THIRD_PARTY_DIGITAL_DEPENDENCE', key: 'REMOTE_SYSTEM_OR_DATA_ACCESS', requires: 'AFFIRMED', values: ['platform'] },
  {
    id: 'OUTSOURCED_SUPPLIER_MANAGEMENT', key: 'SUPPLIER_MANAGEMENT_MODEL', requires: 'AFFIRMED',
    // A shared, group or hybrid model is deliberately neither: it does not establish an
    // external provider as the accountable management route.
    values: ['outsourced', 'external_provider']
  },
  {
    id: 'INTERNAL_SUPPLIER_MANAGEMENT', key: 'SUPPLIER_MANAGEMENT_MODEL', requires: 'AFFIRMED',
    values: ['internal', 'organisation']
  },
  {
    id: 'OUTSOURCED_PAYROLL', key: 'PAYROLL_DELIVERY_MODEL', requires: 'AFFIRMED',
    values: ['outsourced', 'external_provider']
  }
];

export interface DeriveExposuresInput {
  graphVersion: string | null | undefined;
  gatewayAnswers: GatewayAnswers;
  graph?: import('./operating-context').CompiledOperatingGraph;
}

/** Resolve exposures from an already-derived context, so callers can share one derivation. */
export function exposuresFromContext(facts: readonly OperatingContextFact[]): SupportedExposure[] {
  const supported: SupportedExposure[] = [];
  for (const rule of RULES) {
    const satisfied = rule.requires === 'AFFIRMED'
      ? contextAffirms(facts, rule.key, ...(rule.values ?? []))
      : contextNegates(facts, rule.key);
    if (!satisfied) continue;
    const fact = facts.find((candidate) => candidate.key === rule.key)!;
    supported.push({ id: rule.id, evidence: [fact.sourceGatewayCode], values: [fact.value] });
  }
  return supported;
}

/**
 * Resolve exposures for one assessment.
 *
 * An assessment with no gateway answers at all pre-dates the adaptive instrument and derives
 * nothing, which is correct. An assessment that *has* answers but whose graph is unregistered
 * throws, because interpreting one instrument through another's mapping is the defect this
 * whole module exists to make impossible.
 */
export function deriveSupportedOperatingExposures(input: DeriveExposuresInput): SupportedExposure[] {
  if (!input || !input.gatewayAnswers || Object.keys(input.gatewayAnswers).length === 0) return [];
  return exposuresFromContext(deriveOperatingContext({
    graphVersion: input.graphVersion,
    gatewayAnswers: input.gatewayAnswers,
    graph: input.graph
  }));
}

export function hasExposure(exposures: readonly SupportedExposure[], id: OperatingExposureId): boolean {
  return exposures.some((exposure) => exposure.id === id);
}

export function evidenceFor(exposures: readonly SupportedExposure[], id: OperatingExposureId): string[] {
  return exposures.find((exposure) => exposure.id === id)?.evidence ?? [];
}
