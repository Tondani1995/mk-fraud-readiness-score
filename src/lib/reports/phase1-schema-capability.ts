import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { logCapabilityQueryFailure, type DiagnosticContext, type QueryFailureDiagnostic } from './capability-diagnostics';

export const PHASE1_SCHEMA_UNAVAILABLE_MESSAGE =
  'Phase 1 fulfilment upgrade is not yet activated in this environment.';
export const PHASE1_SCHEMA_ERROR_MESSAGE =
  'Phase 1 fulfilment capability could not be verified. Manual fulfilment remains blocked.';

export type Phase1SchemaCapabilityStatus = 'available' | 'unavailable' | 'error';

export type Phase1SchemaCapability = {
  status: Phase1SchemaCapabilityStatus;
  schemaVersion: '0023' | null;
  message: string | null;
  failedQuery?: QueryFailureDiagnostic | null;
  checks?: {
    missingTables: string[];
    missingReportColumns: string[];
    missingEmailColumns: string[];
    missingFunctions: string[];
    missingPermissions: string[];
  };
};

type CapabilityRpcResult = {
  status?: Phase1SchemaCapabilityStatus;
  available?: boolean;
  schema_version?: string;
  missing_tables?: unknown;
  missing_report_columns?: unknown;
  missing_email_columns?: unknown;
  missing_functions?: unknown;
  missing_permissions?: unknown;
};

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export async function getPhase1SchemaCapability(
  db = createSupabaseServiceClient() as any,
  context?: DiagnosticContext
): Promise<Phase1SchemaCapability> {
  const { data: marker, error: markerError } = await db
    .from('app_settings')
    .select('value_json')
    .eq('setting_key', 'v2_phase1_manual_fulfilment')
    .maybeSingle();

  if (markerError) {
    const failedQuery = logCapabilityQueryFailure('app_settings:v2_phase1_manual_fulfilment', markerError, context);
    return { status: 'error', schemaVersion: null, message: PHASE1_SCHEMA_ERROR_MESSAGE, failedQuery };
  }

  if (!marker || marker.value_json?.schema_version !== '0023') {
    return { status: 'unavailable', schemaVersion: null, message: PHASE1_SCHEMA_UNAVAILABLE_MESSAGE };
  }

  const { data, error } = await db.rpc('phase1_manual_fulfilment_capability');
  if (error || !data) {
    const failedQuery = logCapabilityQueryFailure(
      'rpc:phase1_manual_fulfilment_capability',
      error ?? { code: null, details: 'RPC returned no data', hint: null },
      context
    );
    return { status: 'error', schemaVersion: '0023', message: PHASE1_SCHEMA_ERROR_MESSAGE, failedQuery };
  }

  const result = data as CapabilityRpcResult;
  const checks = {
    missingTables: strings(result.missing_tables),
    missingReportColumns: strings(result.missing_report_columns),
    missingEmailColumns: strings(result.missing_email_columns),
    missingFunctions: strings(result.missing_functions),
    missingPermissions: strings(result.missing_permissions)
  };
  if (result.status === 'error' || checks.missingPermissions.length > 0) {
    console.error('phase1_schema_capability', {
      stage: 'verification',
      outcome: 'error',
      missingPermissionCount: checks.missingPermissions.length
    });
    const failedQuery: QueryFailureDiagnostic = {
      query: 'rpc:phase1_manual_fulfilment_capability',
      code: null,
      safeMessage: 'RPC reported missing database permissions.',
      details: checks.missingPermissions.length ? checks.missingPermissions.join(', ') : null,
      hint: null
    };
    return { status: 'error', schemaVersion: '0023', message: PHASE1_SCHEMA_ERROR_MESSAGE, checks, failedQuery };
  }
  if (result.available !== true || result.schema_version !== '0023') {
    console.error('phase1_schema_capability', {
      stage: 'verification',
      outcome: 'unavailable',
      missingCount: Object.values(checks).reduce((total, values) => total + values.length, 0)
    });
    return { status: 'unavailable', schemaVersion: '0023', message: PHASE1_SCHEMA_UNAVAILABLE_MESSAGE, checks };
  }

  return { status: 'available', schemaVersion: '0023', message: null, checks };
}

export const getFulfilmentSchemaCapability = getPhase1SchemaCapability;

export class Phase1SchemaCapabilityError extends Error {
  readonly capability: Phase1SchemaCapability;

  // Explicit field + assignment, not TypeScript parameter-property shorthand -- see the matching
  // note on ReportCommercialQualityError (commercial-quality.ts) for why. Behaviourally identical
  // to the prior version.
  constructor(capability: Phase1SchemaCapability) {
    super(capability.message ?? PHASE1_SCHEMA_ERROR_MESSAGE);
    this.name = 'Phase1SchemaCapabilityError';
    this.capability = capability;
  }
}

export async function requirePhase1SchemaCapability(db = createSupabaseServiceClient() as any) {
  const capability = await getPhase1SchemaCapability(db);
  if (capability.status !== 'available') throw new Phase1SchemaCapabilityError(capability);
  return capability;
}
