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
  schemaVersion: PREMIUM_REPORT_SCHEMA_VERSION
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
    promptVersion: optionalText(source.premium_report_prompt_version)
      ?? DEFAULT_PREMIUM_REPORT_AUTOMATION_FLAGS.promptVersion,
    schemaVersion: optionalText(source.premium_report_schema_version)
      ?? DEFAULT_PREMIUM_REPORT_AUTOMATION_FLAGS.schemaVersion
  };
}

export async function getPremiumReportAutomationFlags(): Promise<PremiumReportAutomationFlags> {
  try {
    const db = createSupabaseServiceClient() as any;
    const [{ data, error }, { data: gate, error: gateError }] = await Promise.all([
      db
      .from('app_settings')
      .select('setting_key,value_json')
      .in('setting_key', ['phase14_autonomous_report_engine', 'phase14_delivery_policy']),
      db.from('phase14_security_gates')
        .select('required_version,satisfied_version,status')
        .eq('gate_key', 'phase14-premium-report')
        .maybeSingle()
    ]);

    if (error || gateError || !data || !gate) return { ...DEFAULT_PREMIUM_REPORT_AUTOMATION_FLAGS };
    const merged = Object.assign({}, ...(data as Array<{ value_json?: Record<string, unknown> }>).map((row) => row.value_json ?? {}));
    const parsed = parsePremiumReportAutomationFlags(merged);
    const securityGateSatisfied = gate.status === 'satisfied'
      && Number(gate.satisfied_version) >= Number(gate.required_version);
    return {
      ...parsed,
      securityGateSatisfied,
      securityGateVersion: securityGateSatisfied ? Number(gate.satisfied_version) : null,
      autoFulfilmentEnabled: securityGateSatisfied && parsed.autoFulfilmentEnabled,
      aiNarrativeEnabled: securityGateSatisfied && parsed.aiNarrativeEnabled,
      autoEmailEnabled: securityGateSatisfied && parsed.autoEmailEnabled,
      manualDeliveryEnabled: securityGateSatisfied && parsed.manualDeliveryEnabled,
      testRecipientOverrideEnabled: securityGateSatisfied && parsed.testRecipientOverrideEnabled,
      testRecipientOverride: securityGateSatisfied ? parsed.testRecipientOverride : null
    };
  } catch (error) {
    console.error('Phase 14 feature flags could not be loaded; automation remains disabled.', error);
    return { ...DEFAULT_PREMIUM_REPORT_AUTOMATION_FLAGS };
  }
}
