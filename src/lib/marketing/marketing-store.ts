
/**
 * The only file that calls the MK Fraud Signals database functions. Every call is a literal RPC
 * name so the service-role privilege contract can inventory it (scripts/rc1-service-role-
 * privilege-contract.manifest.json, nov2026MarketingConsentPrivilegeReview).
 */

export type StoreClient = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }> };

function unwrap<T>(label: string, result: { data: unknown; error: { code?: string; message?: string } | null }): T {
  if (result.error) throw new Error(`${label}_failed:${result.error.code ?? 'unknown'}`);
  return result.data as T;
}

export type RequestSubscriptionArgs = {
  p_email: string;
  p_email_hash: string;
  p_permission: string;
  p_wording_version: string;
  p_wording_sha256: string;
  p_wording_text: string;
  p_source: string;
  p_source_path: string | null;
  p_ip_hash: string | null;
  p_user_agent_hash: string | null;
  p_token_hash: string;
  p_token_ttl_seconds: number;
  p_cooldown_seconds: number;
  p_evidence: Record<string, unknown>;
};

export type RequestSubscriptionResult = {
  action: 'send_confirmation' | 'already_subscribed' | 'held_no_email' | 'suppressed_no_email' | 'cooldown_no_email';
  subscriber_id: string;
  request_event_id?: string;
};

export type ConfirmSubscriptionResult = {
  outcome: 'confirmed' | 'held' | 'invalid' | 'already_used' | 'expired' | 'superseded' | 'suppressed' | 'already_subscribed';
  subscriber_id?: string;
  email?: string;
  state_version?: number;
};

export type ReconciliationRow = {
  id: string;
  email: string;
  status: 'subscribed' | 'unsubscribed' | 'suppressed' | 'held' | 'erased';
  hold_reason: string | null;
  suppression_reason: string | null;
  consent_confirmed_at: string | null;
  unsubscribed_at: string | null;
  suppressed_at: string | null;
  restriction_decision: 'clear' | 'restricted' | 'ambiguous' | 'unchecked';
  resend_contact_id: string | null;
  state_version: number;
  sync_status: string;
  sync_attempts: number;
  last_synced_at?: string | null;
};

export function marketingStore(injected?: StoreClient) {
  // The service-role client (createSupabaseServiceClient) is loaded on first use, so pure handlers
  // and tests can import this module without the Supabase runtime.
  let cached: StoreClient | null = injected ?? null;
  const db = async (): Promise<StoreClient> => {
    if (!cached) {
      const { createSupabaseServiceClient } = await import('@/lib/supabase/server');
      cached = createSupabaseServiceClient() as unknown as StoreClient;
    }
    return cached;
  };
  return {
    async requestSubscription(args: RequestSubscriptionArgs): Promise<RequestSubscriptionResult> {
      return unwrap('marketing_request_subscription', await (await db()).rpc('marketing_request_subscription', args));
    },
    async peekConfirmationToken(tokenHash: string): Promise<{ state: 'valid' | 'invalid' | 'already_used' | 'expired' | 'superseded'; email?: string }> {
      return unwrap('marketing_peek_confirmation_token', await (await db()).rpc('marketing_peek_confirmation_token', { p_token_hash: tokenHash }));
    },
    async confirmSubscription(args: {
      p_token_hash: string;
      p_ip_hash: string | null;
      p_user_agent_hash: string | null;
      p_restriction_decision: string;
      p_restriction_evidence: Record<string, unknown>;
    }): Promise<ConfirmSubscriptionResult> {
      return unwrap('marketing_confirm_subscription', await (await db()).rpc('marketing_confirm_subscription', args));
    },
    async applyProviderEffect(args: {
      p_provider_event_id: string;
      p_event_type: string;
      p_payload_sha256: string;
      p_email_hash: string | null;
      p_effect: string;
      p_occurred_at: string;
      p_detail: Record<string, unknown>;
    }): Promise<{ outcome: string; subscriber_id?: string }> {
      return unwrap('marketing_apply_provider_effect', await (await db()).rpc('marketing_apply_provider_effect', args));
    },
    async recordSyncOutcome(args: {
      p_subscriber_id: string;
      p_expected_version: number;
      p_outcome: 'synced' | 'failed' | 'held';
      p_resend_contact_id: string | null;
      p_error: string | null;
      p_hold_reason: string | null;
      p_restriction_decision: string | null;
      p_restriction_evidence: Record<string, unknown> | null;
    }): Promise<{ outcome: string }> {
      return unwrap('marketing_record_sync_outcome', await (await db()).rpc('marketing_record_sync_outcome', args));
    },
    async claimProviderLift(subscriberId: string, expectedVersion: number): Promise<{ claimed: boolean; reason?: string; state_version?: number }> {
      return unwrap('marketing_claim_provider_lift', await (await db()).rpc('marketing_claim_provider_lift', { p_subscriber_id: subscriberId, p_expected_version: expectedVersion }));
    },
    async reconciliationBatch(limit: number): Promise<ReconciliationRow[]> {
      return unwrap('marketing_reconciliation_batch', await (await db()).rpc('marketing_reconciliation_batch', { p_limit: limit }));
    },
    async audienceSnapshot(): Promise<Record<string, unknown>> {
      return unwrap('marketing_audience_snapshot', await (await db()).rpc('marketing_audience_snapshot', {}));
    }
  };
}

export type MarketingStore = ReturnType<typeof marketingStore>;
