import type {
  DurableAttemptRecord,
  DurableNarrativeAttemptStore
} from './durable-ai-attempts';

/**
 * Phase 1 binding for the shared durable AI wrapper. The SQL RPCs perform the authoritative
 * active-attempt, feature-policy, security-gate, route-allowlist, parent-binding and combined
 * attempt-budget checks. This adapter deliberately contains no direct provider call.
 */
export function createManualNarrativeAttemptStore(input: {
  db: any;
  manualGenerationAttemptId: string;
}): DurableNarrativeAttemptStore {
  const { db, manualGenerationAttemptId } = input;
  return {
    authorize: async (requestedProvider) => {
      const { data, error } = await db.rpc('authorize_manual_report_ai_action', {
        p_manual_generation_attempt_id: manualGenerationAttemptId,
        p_requested_provider: requestedProvider
      });
      if (error || !data) throw error ?? new Error('Manual report AI authorisation failed.');
      return data;
    },
    findReusableAttempt: async (fingerprint, kind) => {
      const { data, error } = await db
        .from('report_ai_attempts')
        .select('id,status,output_json,attempt_number,accounting_status')
        .eq('generation_identity', fingerprint.generationIdentity)
        .eq('evidence_checksum', fingerprint.evidenceChecksum)
        .eq('requested_provider', fingerprint.requestedProvider)
        .eq('requested_model', fingerprint.requestedModel)
        .eq('prompt_version', fingerprint.promptVersion)
        .eq('schema_version', fingerprint.schemaVersion)
        .eq('attempt_kind', kind)
        .order('attempt_number', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as DurableAttemptRecord | null;
    },
    countChargeableAttempts: async (fingerprint) => {
      const { count, error } = await db
        .from('report_ai_attempts')
        .select('id', { count: 'exact', head: true })
        .eq('generation_identity', fingerprint.generationIdentity)
        .eq('evidence_checksum', fingerprint.evidenceChecksum)
        .eq('requested_provider', fingerprint.requestedProvider)
        .eq('requested_model', fingerprint.requestedModel)
        .eq('prompt_version', fingerprint.promptVersion)
        .eq('schema_version', fingerprint.schemaVersion)
        .neq('status', 'failed_before_provider');
      if (error) throw error;
      return count ?? 0;
    },
    claimAttempt: async (payload) => {
      const { data, error } = await db.rpc('claim_manual_report_ai_attempt', {
        p_attempt: { ...payload, manual_generation_attempt_id: manualGenerationAttemptId }
      });
      if (error || !data) throw error ?? new Error('Manual report AI attempt could not be persisted before provider dispatch.');
      return data as DurableAttemptRecord;
    },
    settleAttempt: async (attemptId, result) => {
      const { data, error } = await db.rpc('settle_manual_report_ai_attempt', {
        p_attempt_id: attemptId,
        p_result: result
      });
      if (error || !data) throw error ?? new Error('Manual report AI attempt settlement failed.');
      return data;
    }
  };
}
