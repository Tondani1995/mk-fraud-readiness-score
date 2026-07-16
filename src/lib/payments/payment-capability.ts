import { createSupabaseServiceClient } from '@/lib/supabase/server';

export const PAYMENT_AUTOMATION_UNAVAILABLE_MESSAGE =
  'Payment automation is not yet activated in this environment. Manual payment recording remains available.';
export const PAYMENT_AUTOMATION_ERROR_MESSAGE =
  'Payment automation capability could not be verified. Provider payment processing remains blocked.';

export type PaymentAutomationCapability = {
  status: 'available' | 'unavailable' | 'error';
  schemaVersion: '0024' | null;
  message: string | null;
  missingObjects?: string[];
  missingPermissions?: string[];
};

function strings(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

export async function getPaymentAutomationCapability(db = createSupabaseServiceClient() as any): Promise<PaymentAutomationCapability> {
  const { data: marker, error: markerError } = await db.from('app_settings').select('value_json')
    .eq('setting_key', 'v2_phase23_payment_automation').maybeSingle();
  if (markerError) {
    console.error('payment_capability', { stage: 'marker', outcome: 'error', code: markerError.code ?? null });
    return { status: 'error', schemaVersion: null, message: PAYMENT_AUTOMATION_ERROR_MESSAGE };
  }
  if (marker?.value_json?.schema_version !== '0024') {
    return { status: 'unavailable', schemaVersion: null, message: PAYMENT_AUTOMATION_UNAVAILABLE_MESSAGE };
  }
  const { data, error } = await db.rpc('payment_automation_capability');
  if (error || !data) {
    console.error('payment_capability', { stage: 'verification', outcome: 'error', code: error?.code ?? null });
    return { status: 'error', schemaVersion: '0024', message: PAYMENT_AUTOMATION_ERROR_MESSAGE };
  }
  const missingObjects = strings(data.missing_objects);
  const missingPermissions = strings(data.missing_permissions);
  if (data.status === 'error' || missingPermissions.length) {
    return { status: 'error', schemaVersion: '0024', message: PAYMENT_AUTOMATION_ERROR_MESSAGE, missingObjects, missingPermissions };
  }
  if (data.available !== true || data.schema_version !== '0024') {
    return { status: 'unavailable', schemaVersion: '0024', message: PAYMENT_AUTOMATION_UNAVAILABLE_MESSAGE, missingObjects, missingPermissions };
  }
  return { status: 'available', schemaVersion: '0024', message: null, missingObjects, missingPermissions };
}
