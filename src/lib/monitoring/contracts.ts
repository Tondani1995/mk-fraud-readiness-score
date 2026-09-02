import {
  ADVISORY_PRICE_FROM_CENTS,
  COMMERCIAL_CATALOGUE,
  COMPREHENSIVE_PRICE_CENTS,
  ESSENTIAL_PRICE_CENTS,
  FREE_SNAPSHOT_PRODUCT_CODE,
  COMPREHENSIVE_PRODUCT_CODE,
  ESSENTIAL_PRODUCT_CODE
} from '@/lib/commercial/product-catalogue';

export const PRODUCTION_MONITOR_NAME = 'production-incident-monitor';
export const PRODUCTION_READINESS_PATH = '/score/api/internal/production-readiness';
export const PRODUCTION_MONITOR_PATH = '/score/api/internal/production-monitor';
export const CLIENT_ERROR_PATH = '/score/api/internal/client-error';

export const EXPECTED_PRODUCTION = Object.freeze({
  environment: 'production',
  supabaseProjectRef: 'iszihmmbgsfefawqmnwo',
  adaptiveGraphVersion: 'MFRS-V1.2-ADAPTIVE-CANDIDATE-20260821',
  adaptiveGraphFingerprint: '6f1f098a713b1a2f2bf6fc52a1733bf4ffafea8adccedaccc0b721e55bbe45c7',
  activeMethodologyVersion: 'MFRS-V1.1',
  gaMeasurementId: 'G-LRTK98KGB8',
  gaPropertyId: '552214282',
  gaWebStreamId: '15539513030',
  canonicalRoute: '/fraud-readiness',
  legacyCompatibilityRoute: '/fraud-readiness-score',
  sitemapRoute: '/sitemap.xml',
  robotsRoute: '/robots.txt'
} as const);

export const READINESS_REQUIRED_ENVIRONMENT = [
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'ASSESSMENT_TOKEN_PEPPER',
  'NEXT_PUBLIC_GA_MEASUREMENT_ID',
  'GA_PROPERTY_ID',
  'MK_EMAIL_PROVIDER_MODE',
  'MK_INTERNAL_NOTIFICATIONS_EMAIL'
] as const;

export const READINESS_OPTIONAL_MONITOR_ENVIRONMENT = [
  'MK_PRODUCTION_READINESS_SECRET',
  'MK_PRODUCTION_MONITOR_SECRET',
  'MK_SYNTHETIC_MONITOR_SECRET'
] as const;

export const EXPECTED_PUBLIC_PRODUCTS = Object.freeze([
  {
    productCode: FREE_SNAPSHOT_PRODUCT_CODE,
    priceCents: COMMERCIAL_CATALOGUE.free.priceCents,
    currency: 'ZAR',
    requiresPaymentVerification: false,
    deliveryMode: 'instant_snapshot'
  },
  {
    productCode: ESSENTIAL_PRODUCT_CODE,
    priceCents: ESSENTIAL_PRICE_CENTS,
    currency: 'ZAR',
    requiresPaymentVerification: true,
    deliveryMode: 'mk_controlled_pdf'
  },
  {
    productCode: COMPREHENSIVE_PRODUCT_CODE,
    priceCents: COMPREHENSIVE_PRICE_CENTS,
    currency: 'ZAR',
    requiresPaymentVerification: true,
    deliveryMode: 'mk_controlled_pdf'
  }
] as const);

export const EXPECTED_ADVISORY_PRICE_FROM_CENTS = ADVISORY_PRICE_FROM_CENTS;

export type MonitoringStatus = 'PASS' | 'WARN' | 'FAIL';
export type ProductionOverallStatus = 'HEALTHY' | 'DEGRADED' | 'INCIDENT';
export type MonitoringPriority = 'P1' | 'P2' | 'P3';
export type MonitoringAlertState = 'open' | 'acknowledged' | 'resolved';

export type ReadinessCheck = {
  key: string;
  category: string;
  status: MonitoringStatus;
  safeCode: string;
};

export type ReadinessEvaluation = {
  status: ProductionOverallStatus;
  checks: ReadinessCheck[];
  checkedAt: string;
  currentDeploymentSha: string | null;
  adaptiveActivationSha?: string | null;
  adaptiveActivationAligned?: boolean;
  configuredSupabaseProjectRef: string | null;
};

export function overallStatusFromChecks(checks: readonly Pick<ReadinessCheck, 'status'>[]): ProductionOverallStatus {
  if (checks.some((check) => check.status === 'FAIL')) return 'INCIDENT';
  if (checks.some((check) => check.status === 'WARN')) return 'DEGRADED';
  return 'HEALTHY';
}

export function monitoringPriorityToLegacySeverity(priority: MonitoringPriority): 'critical' | 'warning' {
  return priority === 'P1' ? 'critical' : 'warning';
}

export const MONITORING_FORECAST = Object.freeze({
  checkly: {
    plan: 'Hobby',
    monthlyCostUsd: 0,
    // Three uptime checks are active in Checkly today. The readiness check is
    // planned for the later owner-approved cutover and must not be presented
    // as active monitoring before it is created.
    uptimeMonitors: 3,
    uptimeCadenceMinutes: 5,
    apiChecks: 0,
    apiCadenceMinutes: 5,
    apiRunsPer31DayMonth: 0,
    plannedUptimeMonitors: 4,
    plannedApiChecks: 1,
    plannedApiRunsPer31DayMonth: 8928,
    coreBrowserRunsPer31DayMonth: 372,
    fullDesktopBrowserRunsPer31DayMonth: 124,
    fullMobileBrowserRunsPer31DayMonth: 31,
    browserRunsPer31DayMonth: 527,
    browserPlanAllowance: 1000,
    apiPlanAllowance: 10000
  },
  sentry: {
    plan: 'Developer',
    monthlyCostUsd: 0,
    monthlyErrorAllowance: 5000,
    tracesSampleRate: 0
  },
  resend: {
    monthlyIncrementalCostZar: 0
  },
  vercel: {
    monthlyIncrementalCostZar: 0
  },
  supabase: {
    monthlyIncrementalCostZar: 0
  },
  ai: {
    targetMonthlyCostZar: 10,
    hardMonthlyCeilingZar: 20
  },
  hardBudgetZar: 100
} as const);

export function budgetStatusFromProjectedZar(projectedZar: number): 'GREEN' | 'AMBER' | 'RED' {
  if (projectedZar >= MONITORING_FORECAST.hardBudgetZar * 0.8) return 'RED';
  if (projectedZar >= MONITORING_FORECAST.hardBudgetZar * 0.5) return 'AMBER';
  return 'GREEN';
}

export function isValidDeploymentSha(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{40}$/i.test(value);
}

export function isValidGaMeasurementId(value: unknown): value is string {
  return typeof value === 'string' && /^G-[A-Z0-9]{6,20}$/i.test(value.trim());
}

export function isSafeOpaqueReference(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9._:-]{1,120}$/.test(value);
}
