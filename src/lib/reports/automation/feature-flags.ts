import { createSupabaseServiceClient } from '@/lib/supabase/server';
import {
  PREMIUM_REPORT_PROMPT_VERSION,
  PREMIUM_REPORT_SCHEMA_VERSION,
  type PremiumReportAutomationFlags
} from './types';

export const DEFAULT_PREMIUM_REPORT_AUTOMATION_FLAGS: PremiumReportAutomationFlags = Object.freeze({
  securityGateSatisfied: false,
  securityGateVersion: null,
  autoFulfilmentEnabled: false,
  aiNarrativeEnabled: false,
  autoEmailEnabled: false,
  manualDeliveryEnabled: false,
  testRecipientOverrideEnabled: false,
  testRecipientOverride: null,
  model: process.env.MK_REPORT_AI_MODEL?.trim() || 'openai/gpt-5.5',
  promptVersion: PREMIUM_REPORT_PROMPT_VERSION,
  schemaVersion: PREMIUM_REPORT_SCHEMA_VERSION,
  contractVersionMismatch: null
});

function enabled(value: unknown) {
  return value === true;
}

function optionalText(value: unknown) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

export function parsePremiumReportAutomationFlags(value: unknown): PremiumReportAutomationFlags {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  return {
    securityGateSatisfied: false,
    securityGateVersion: null,
    autoFulfilmentEnabled: enabled(source.premium_report_auto_fulfilment_enabled),
    aiNarrativeEnabled: enabled(source.premium_report_ai_narrative_enabled),
    autoEmailEnabled: enabled(source.premium_report_auto_email_enabled),
    manualDeliveryEnabled: enabled(source.premium_report_manual_delivery_enabled),
    testRecipientOverrideEnabled: enabled(source.premium_report_test_recipient_override_enabled),
    testRecipientOverride: optionalText(source.premium_report_test_recipient_override),
    model: optionalText(source.premium_report_ai_model)
      ?? process.env.MK_REPORT_AI_MODEL?.trim()
      ?? DEFAULT_PREMIUM_REPORT_AUTOMATION_FLAGS.model,
    // The COMPILED constants are the contract. A database setting cannot relabel the executable
    // prompt and schema: it may only assert what it expects to be deployed. Where it asserts
    // something different, that is a deployment error and AI must fail closed rather than run under
    // a false version label -- the labels participate in durable-attempt identity and reuse.
    promptVersion: PREMIUM_REPORT_PROMPT_VERSION,
    schemaVersion: PREMIUM_REPORT_SCHEMA_VERSION,
    contractVersionMismatch: contractVersionMismatch(source)
  };
}

/**
 * Returns a safe diagnostic when the database asserts a different contract version, or null when it
 * asserts nothing or agrees. Deliberately carries no prose or evidence -- only the version labels.
 */
export function contractVersionMismatch(source: Record<string, unknown>): string | null {
  const declaredPrompt = optionalText(source.premium_report_prompt_version);
  const declaredSchema = optionalText(source.premium_report_schema_version);
  const mismatched: string[] = [];
  if (declaredPrompt !== null && declaredPrompt !== PREMIUM_REPORT_PROMPT_VERSION) {
    mismatched.push(`prompt_version declared ${declaredPrompt}, compiled ${PREMIUM_REPORT_PROMPT_VERSION}`);
  }
  if (declaredSchema !== null && declaredSchema !== PREMIUM_REPORT_SCHEMA_VERSION) {
    mismatched.push(`schema_version declared ${declaredSchema}, compiled ${PREMIUM_REPORT_SCHEMA_VERSION}`);
  }
  return mismatched.length > 0 ? `ai_contract_version_mismatch: ${mismatched.join('; ')}` : null;
}

export async function getPremiumReportAutomationFlags(dbOverride?: any): Promise<PremiumReportAutomationFlags> {
  try {
    const db = dbOverride ?? createSupabaseServiceClient() as any;
    const [
      { data, error },
      { data: gate, error: gateError },
      { data: policyRows, error: policyError }
    ] = await Promise.all([
      db
      .from('app_settings')
      .select('setting_key,value_json')
      .in('setting_key', ['phase14_autonomous_report_engine', 'phase14_delivery_policy']),
      db.from('phase14_security_gates')
        .select('required_version,satisfied_version,status')
        .eq('gate_key', 'phase14-premium-report')
        .maybeSingle(),
      db.from('phase14_feature_policies').select('policy_key,enabled')
    ]);

    if (error || gateError || policyError || !data || !gate || !policyRows) {
      return { ...DEFAULT_PREMIUM_REPORT_AUTOMATION_FLAGS };
    }
    const merged = Object.assign({}, ...(data as Array<{ value_json?: Record<string, unknown> }>).map((row) => row.value_json ?? {}));
    const parsed = parsePremiumReportAutomationFlags(merged);
    const policies = new Map(
      (policyRows as Array<{ policy_key: string; enabled: boolean }>)
        .map((row) => [row.policy_key, row.enabled === true])
    );
    const securityGateSatisfied = gate.status === 'satisfied'
      && Number(gate.satisfied_version) >= Number(gate.required_version);
    return {
      ...parsed,
      securityGateSatisfied,
      securityGateVersion: securityGateSatisfied ? Number(gate.satisfied_version) : null,
      autoFulfilmentEnabled: securityGateSatisfied && policies.get('automatic_fulfilment') === true && parsed.autoFulfilmentEnabled,
      aiNarrativeEnabled: securityGateSatisfied && policies.get('ai_narrative') === true && parsed.aiNarrativeEnabled,
      autoEmailEnabled: securityGateSatisfied && policies.get('automatic_email') === true && parsed.autoEmailEnabled,
      manualDeliveryEnabled: securityGateSatisfied && policies.get('manual_delivery') === true && parsed.manualDeliveryEnabled,
      testRecipientOverrideEnabled: securityGateSatisfied && policies.get('recipient_override') === true && parsed.testRecipientOverrideEnabled,
      testRecipientOverride: securityGateSatisfied && policies.get('recipient_override') === true
        ? parsed.testRecipientOverride
        : null
    };
  } catch (error) {
    console.error('Phase 14 feature flags could not be loaded; automation remains disabled.', error);
    return { ...DEFAULT_PREMIUM_REPORT_AUTOMATION_FLAGS };
  }
}
