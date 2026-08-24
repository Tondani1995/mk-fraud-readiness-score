/**
 * Customer-safe operating-context language for the Essential presentation.
 *
 * The Fact Pack already carries versioned, provenance-bearing gateway facts. This
 * module is deliberately a small presentation vocabulary over those facts: it
 * may select a context-specific population or rationale, but it cannot infer a
 * business activity that the governed context did not establish.
 */

import {
  contextAffirms,
  contextFact,
  type OperatingContextFact,
  type OperatingContextKey
} from '../narrative/operating-context';

export interface EssentialOrganisationContext {
  facts: readonly OperatingContextFact[];
  operatingEnvironment?: string;
  workforce?: string;
  externalSuppliers: boolean;
  supplierManagementExternal: boolean;
  procurementInternal: boolean;
  physicalCash: boolean;
  stockOrAssets: boolean;
  payrollInternal: boolean;
  customerDigitalChannels: boolean;
  personalOrIdentityData: boolean;
  manualAdjustments: boolean;
  multiSite: boolean;
  temporaryWorkforce: boolean;
  remoteAccess: boolean;
  higherRiskApprovalsTwoOrMore: boolean;
}

const CONTEXT_KEYS: readonly OperatingContextKey[] = [
  'OPERATING_ENVIRONMENT',
  'WORKFORCE_SIZE',
  'EXTERNAL_SUPPLIERS_PRESENT',
  'SUPPLIER_MANAGEMENT_MODEL',
  'PROCUREMENT_MODEL',
  'PHYSICAL_CASH_EXPOSURE',
  'STOCK_OR_PHYSICAL_ASSETS',
  'PAYROLL_DELIVERY_MODEL',
  'CUSTOMER_DIGITAL_CHANNELS',
  'PERSONAL_OR_IDENTITY_DATA',
  'MANUAL_FINANCIAL_OR_STOCK_ADJUSTMENTS',
  'MULTI_SITE_OR_DISTRIBUTED_OPERATIONS',
  'TEMPORARY_SEASONAL_OR_SUBCONTRACTED_WORKFORCE',
  'REMOTE_SYSTEM_OR_DATA_ACCESS',
  'HIGHER_RISK_PAYMENT_APPROVAL_MODEL'
];

function governedFacts(facts: readonly OperatingContextFact[] | undefined): OperatingContextFact[] {
  if (!Array.isArray(facts)) return [];
  const allowed = new Set(CONTEXT_KEYS);
  return facts.filter((fact) =>
    allowed.has(fact.key)
    && fact.customerNarrativeAllowed
    && fact.provenance === 'RECORDED_GATEWAY_RESPONSE'
    && fact.sourceOptionId === fact.value
  );
}

function valueLabel(facts: readonly OperatingContextFact[], key: OperatingContextKey): string | undefined {
  return contextFact(facts, key)?.sourceOptionLabel?.trim() || undefined;
}

function lower(value: string | undefined): string {
  return value ? value.charAt(0).toLowerCase() + value.slice(1) : '';
}

function list(values: string[]): string {
  const items = values.filter(Boolean);
  if (items.length <= 1) return items[0] ?? '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

export function buildEssentialOrganisationContext(
  facts: readonly OperatingContextFact[] | undefined
): EssentialOrganisationContext {
  const safeFacts = governedFacts(facts);
  const affirmed = (key: OperatingContextKey, ...values: string[]) => contextAffirms(safeFacts, key, ...values);
  return {
    facts: safeFacts,
    operatingEnvironment: valueLabel(safeFacts, 'OPERATING_ENVIRONMENT'),
    workforce: valueLabel(safeFacts, 'WORKFORCE_SIZE'),
    externalSuppliers: affirmed('EXTERNAL_SUPPLIERS_PRESENT'),
    supplierManagementExternal: affirmed('SUPPLIER_MANAGEMENT_MODEL', 'external_provider'),
    procurementInternal: affirmed('PROCUREMENT_MODEL', 'dedicated_internal', 'organisation'),
    physicalCash: affirmed('PHYSICAL_CASH_EXPOSURE'),
    stockOrAssets: affirmed('STOCK_OR_PHYSICAL_ASSETS'),
    payrollInternal: affirmed('PAYROLL_DELIVERY_MODEL', 'organisation'),
    customerDigitalChannels: affirmed('CUSTOMER_DIGITAL_CHANNELS'),
    personalOrIdentityData: affirmed('PERSONAL_OR_IDENTITY_DATA'),
    manualAdjustments: affirmed('MANUAL_FINANCIAL_OR_STOCK_ADJUSTMENTS'),
    multiSite: affirmed('MULTI_SITE_OR_DISTRIBUTED_OPERATIONS'),
    temporaryWorkforce: affirmed('TEMPORARY_SEASONAL_OR_SUBCONTRACTED_WORKFORCE'),
    remoteAccess: affirmed('REMOTE_SYSTEM_OR_DATA_ACCESS'),
    higherRiskApprovalsTwoOrMore: affirmed('HIGHER_RISK_PAYMENT_APPROVAL_MODEL', 'two_or_more')
  };
}

function environmentLabel(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalised = value.toLowerCase();
  if (normalised.includes('manufacturing') || normalised.includes('production')) return 'manufacturing and production';
  if (normalised.includes('logistics') || normalised.includes('distribution')) return 'logistics and distribution';
  if (normalised.includes('professional')) return 'professional services';
  return lower(value).replace(/\s+or\s+/gi, ' and ');
}

/** One concise orientation clause, used only where the report needs to explain context. */
export function organisationContextSummary(context: EssentialOrganisationContext): string {
  const parts: string[] = [];
  const environment = environmentLabel(context.operatingEnvironment);
  if (environment) parts.push(`a ${environment} environment`);
  if (context.workforce) parts.push(`a workforce of ${lower(context.workforce)}`);
  if (context.externalSuppliers) {
    parts.push(context.supplierManagementExternal
      ? 'external supplier relationships managed primarily by an external service provider'
      : 'external supplier relationships');
  }
  if (context.physicalCash && context.stockOrAssets) parts.push('physical cash and stock or valuable physical assets');
  else if (context.physicalCash) parts.push('physical cash handling');
  else if (context.stockOrAssets) parts.push('stock or valuable physical assets');
  if (context.multiSite) parts.push('more than one operating location');
  if (context.temporaryWorkforce) parts.push('temporary, seasonal or subcontracted workers');
  return list(parts);
}

function withLocations(context: EssentialOrganisationContext, value: string): string {
  return context.multiSite ? `${value} across operating locations` : value;
}

/**
 * The population named by a target state or deliverable. It is intentionally
 * composed from affirmative context only; negative and unknown answers add no
 * population and therefore cannot leak into customer scope.
 */
export function contextScopeForFamily(
  context: EssentialOrganisationContext,
  semanticFamily: string
): string | undefined {
  const family = String(semanticFamily ?? '').toUpperCase();
  switch (family) {
    case 'SUPPLIER_ONBOARDING': {
      if (!context.externalSuppliers) return undefined;
      const handoff = context.supplierManagementExternal && context.procurementInternal
        ? 'between the external service provider and internal procurement'
        : context.supplierManagementExternal
          ? 'managed by the external service provider'
          : 'in the supplier-management process';
      return withLocations(context, `supplier activations and bank-detail changes ${handoff}`);
    }
    case 'IDENTITY_VERIFICATION': {
      const points: string[] = [];
      if (context.externalSuppliers) points.push('supplier activation');
      if (context.temporaryWorkforce) points.push('temporary or subcontracted workforce onboarding');
      if (context.personalOrIdentityData) points.push('customer, user, employee or supplier identity changes');
      if (context.remoteAccess) points.push('remote account and access changes');
      if (points.length === 0) points.push('in-scope onboarding and sensitive profile or account changes');
      return withLocations(context, list(points));
    }
    case 'DETECTION_MONITORING': {
      const populations: string[] = [];
      if (context.externalSuppliers) populations.push('supplier and payment activity');
      if (context.physicalCash) populations.push('cash handling and banking');
      if (context.stockOrAssets) populations.push('stock and physical-asset movements');
      if (context.payrollInternal) populations.push('payroll changes and exceptions');
      if (context.customerDigitalChannels) populations.push('customer or user digital activity');
      if (context.manualAdjustments) populations.push('manual financial or stock adjustments');
      if (populations.length === 0) populations.push('material transaction and operational activity');
      return withLocations(context, list(populations));
    }
    case 'EVIDENCE_INTEGRITY':
      return context.multiSite
        ? 'material suspected-fraud matters and records collected across operating locations'
        : 'material suspected-fraud matters and records collected during an investigation';
    case 'FRAUD_RISK_IDENTIFICATION': {
      const processes: string[] = [];
      const environment = environmentLabel(context.operatingEnvironment);
      if (environment) processes.push(environment);
      if (context.externalSuppliers) processes.push('supplier relationships');
      if (context.physicalCash) processes.push('cash handling');
      if (context.stockOrAssets) processes.push('stock and physical assets');
      if (context.payrollInternal) processes.push('payroll');
      if (context.temporaryWorkforce) processes.push('workforce and subcontractor processes');
      if (processes.length === 0) return undefined;
      const processScope = list(processes);
      return withLocations(context, /\bprocesses$/i.test(processScope) ? processScope : `${processScope} processes`);
    }
    case 'FRAUD_GOVERNANCE':
      if (context.multiSite && context.externalSuppliers) return 'material fraud risks and key controls across operating locations and supplier hand-offs';
      if (context.multiSite) return 'material fraud risks and key controls across operating locations';
      if (context.externalSuppliers) return 'material fraud risks and key controls across supplier hand-offs';
      return undefined;
    case 'CONTINUOUS_IMPROVEMENT':
      return contextScopeForFamily(context, 'FRAUD_RISK_IDENTIFICATION')
        ?? (context.multiSite ? 'material processes across operating locations' : undefined);
    default:
      return undefined;
  }
}

/** A short, non-repeating explanation of why the governed context changes the priority. */
export function contextRationaleForFamily(
  context: EssentialOrganisationContext,
  semanticFamily: string
): string | undefined {
  const family = String(semanticFamily ?? '').toUpperCase();
  switch (family) {
    case 'SUPPLIER_ONBOARDING':
      if (context.externalSuppliers && context.supplierManagementExternal && context.procurementInternal) {
        return 'The hand-off between the external supplier-management provider and internal procurement is the point that needs an auditable challenge.';
      }
      if (context.externalSuppliers) return 'External supplier relationships make activation and bank-detail changes the point that needs an auditable challenge.';
      return undefined;
    case 'IDENTITY_VERIFICATION':
      if (context.externalSuppliers && context.temporaryWorkforce) return 'Supplier activation and temporary or subcontracted workforce onboarding create sensitive change points that need a trusted verification route.';
      if (context.externalSuppliers) return 'Supplier activation is the clearest sensitive change point requiring a trusted verification route.';
      if (context.temporaryWorkforce) return 'Temporary or subcontracted workforce onboarding creates a sensitive change point requiring a trusted verification route.';
      return undefined;
    case 'DETECTION_MONITORING':
      if (context.physicalCash && context.stockOrAssets && context.multiSite) return 'Physical cash, stock or valuable assets and multiple operating locations create review populations that must be covered deliberately rather than left to incidental discovery.';
      if ((context.physicalCash || context.stockOrAssets) && context.multiSite) return 'Value-bearing activity is spread across more than one operating location, so monitoring must reconcile the full population rather than rely on local review.';
      if (context.externalSuppliers) return 'Supplier and payment activity creates a defined population for exception review, including changes that pass through an external provider.';
      if (context.multiSite) return 'More than one operating location makes complete population coverage and overdue escalation material to the control.';
      return undefined;
    case 'EVIDENCE_INTEGRITY':
      if (context.multiSite && context.temporaryWorkforce) return 'A suspected matter may span operating locations and different worker groups, so first-report routing and custody need to travel with the records.';
      if (context.multiSite) return 'A suspected matter may span operating locations, so first-report routing and custody need to travel with the records.';
      if (context.temporaryWorkforce) return 'Different worker groups may handle relevant records, so first-report routing and custody need to be explicit.';
      return undefined;
    case 'FRAUD_RISK_IDENTIFICATION':
      if (context.multiSite && context.externalSuppliers && context.temporaryWorkforce) return 'Multiple locations, external supplier relationships and a temporary or subcontracted workforce create hand-offs that a single undifferentiated risk view can miss.';
      if (context.multiSite && context.externalSuppliers) return 'Multiple locations and external supplier relationships create hand-offs that a single undifferentiated risk view can miss.';
      if (context.multiSite) return 'Multiple operating locations create hand-offs that a single undifferentiated risk view can miss.';
      if (context.externalSuppliers) return 'External supplier relationships create hand-offs that a single undifferentiated risk view can miss.';
      return undefined;
    case 'FRAUD_GOVERNANCE':
      if (context.multiSite && context.externalSuppliers) return 'Ownership must remain clear across operating locations and the external supplier-management hand-off.';
      if (context.multiSite) return 'Ownership must remain clear across operating locations.';
      if (context.externalSuppliers) return 'Ownership must remain clear across the external supplier-management hand-off.';
      return undefined;
    case 'CONTINUOUS_IMPROVEMENT':
      if (context.multiSite && context.temporaryWorkforce) return 'The review cycle needs to catch change across operating locations and a temporary or subcontracted workforce before controls quietly decay.';
      if (context.multiSite) return 'The review cycle needs to catch change across operating locations before controls quietly decay.';
      if (context.temporaryWorkforce) return 'The review cycle needs to catch change across a temporary or subcontracted workforce before controls quietly decay.';
      return undefined;
    default:
      return undefined;
  }
}
