import { createHash, createHmac, randomBytes } from 'node:crypto';
import {
  CONFIRMATION_RESEND_COOLDOWN_SECONDS,
  CONFIRMATION_TOKEN_TTL_SECONDS,
  CONSENT_WORDING,
  CONSENT_WORDING_VERSION,
  NEWSLETTER_PERMISSION,
  consentWordingSha256,
  type NewsletterSource
} from '@/lib/marketing/consent';
import { newsletterEmailHash } from '@/lib/marketing/email-address';
import { screenSubscriberAgainstAttio, type AttioRestrictionConfig, type RestrictionResult } from '@/lib/marketing/attio-restrictions';
import {
  applyResendSyncPlan,
  readRemoteContact,
  sendConfirmationEmail,
  type MarketingResendConfig
} from '@/lib/marketing/resend-marketing';
import { planLiftsProviderWithdrawal, planResendContactSync, type LocalSubscriber } from '@/lib/marketing/subscription-state';
import type { MarketingStore, ReconciliationRow } from '@/lib/marketing/marketing-store';

export type NewsletterDeps = {
  store: MarketingStore;
  resend: MarketingResendConfig;
  attio: AttioRestrictionConfig | null;
  pepper: string;
  siteUrl: string;
  screen?: (email: string, config: AttioRestrictionConfig | null) => Promise<RestrictionResult>;
  readRemote?: typeof readRemoteContact;
  applyPlan?: typeof applyResendSyncPlan;
  sendConfirmation?: typeof sendConfirmationEmail;
  tokenBytes?: () => string;
};

/** Generic answer for every outcome so the form never reveals whether an address is known. */
export const GENERIC_SUBSCRIBE_RESPONSE = 'Thank you. If this address can receive MK Fraud Signals, a confirmation email is on its way. Please click the link in it to complete your subscription.';

function hashPart(value: string | null | undefined, pepper: string, label: string): string | null {
  if (!value) return null;
  return createHmac('sha256', pepper).update(`mk-newsletter-${label}-v1\0${value}`, 'utf8').digest('hex');
}

export function hashConfirmationToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

export type SubscribeInput = {
  email: string;
  source: NewsletterSource;
  sourcePath: string | null;
  ip: string | null;
  userAgent: string | null;
  attribution: Record<string, string>;
};

export async function requestNewsletterSubscription(deps: NewsletterDeps, input: SubscribeInput) {
  const rawToken = deps.tokenBytes ? deps.tokenBytes() : randomBytes(32).toString('base64url');
  const emailHash = newsletterEmailHash(input.email, deps.pepper);
  const result = await deps.store.requestSubscription({
    p_email: input.email,
    p_email_hash: emailHash,
    p_permission: NEWSLETTER_PERMISSION,
    p_wording_version: CONSENT_WORDING_VERSION,
    p_wording_sha256: consentWordingSha256(),
    p_wording_text: CONSENT_WORDING,
    p_source: input.source,
    p_source_path: input.sourcePath,
    p_ip_hash: hashPart(input.ip, deps.pepper, 'ip'),
    p_user_agent_hash: hashPart(input.userAgent, deps.pepper, 'ua'),
    p_token_hash: hashConfirmationToken(rawToken),
    p_token_ttl_seconds: CONFIRMATION_TOKEN_TTL_SECONDS,
    p_cooldown_seconds: CONFIRMATION_RESEND_COOLDOWN_SECONDS,
    // Campaign labels only (utm_*). Never click IDs, never the address.
    p_evidence: { attribution: input.attribution }
  });

  if (result.action !== 'send_confirmation') {
    return { action: result.action, emailSent: false };
  }

  const confirmUrl = new URL('/mk-fraud-signals/confirm', deps.siteUrl);
  confirmUrl.searchParams.set('token', rawToken);
  await (deps.sendConfirmation ?? sendConfirmationEmail)(deps.resend, {
    to: input.email,
    confirmUrl: confirmUrl.toString(),
    idempotencyKey: `mk-signals-confirm-${result.request_event_id ?? hashConfirmationToken(rawToken).slice(0, 24)}`
  });
  return { action: result.action, emailSent: true };
}

export async function confirmNewsletterSubscription(deps: NewsletterDeps, input: { rawToken: string; ip: string | null; userAgent: string | null }) {
  const tokenHash = hashConfirmationToken(input.rawToken);
  // Resolve the address without consuming the token, screen it against Attio, then record the
  // confirmation together with the screening decision in one atomic write.
  const peek = await deps.store.peekConfirmationToken(tokenHash);
  if (peek.state !== 'valid' || !peek.email) return { outcome: peek.state };

  const restriction = await (deps.screen ?? screenSubscriberAgainstAttio)(peek.email, deps.attio);
  const confirmed = await deps.store.confirmSubscription({
    p_token_hash: tokenHash,
    p_ip_hash: hashPart(input.ip, deps.pepper, 'ip'),
    p_user_agent_hash: hashPart(input.userAgent, deps.pepper, 'ua'),
    p_restriction_decision: restriction.decision,
    p_restriction_evidence: restriction.evidence as unknown as Record<string, unknown>
  });

  if (confirmed.outcome !== 'confirmed' || !confirmed.subscriber_id || !confirmed.email || confirmed.state_version === undefined) {
    // 'held' lands here too: consent is recorded, distribution is blocked pending review.
    return { outcome: confirmed.outcome };
  }

  // Best-effort immediate provider sync; a failure leaves sync_status 'pending' for the reconciler.
  const sync = await syncOneSubscriber(deps, {
    id: confirmed.subscriber_id,
    email: confirmed.email,
    status: 'subscribed',
    hold_reason: null,
    suppression_reason: null,
    consent_confirmed_at: new Date().toISOString(),
    unsubscribed_at: null,
    suppressed_at: null,
    restriction_decision: 'clear',
    resend_contact_id: null,
    state_version: confirmed.state_version,
    sync_status: 'pending',
    sync_attempts: 0,
    // First sync after a fresh confirmation: the only sync allowed to lift an older provider withdrawal.
    last_synced_at: null
  });
  return { outcome: 'confirmed', providerSync: sync.outcome };
}

function toLocal(row: ReconciliationRow, restriction: RestrictionResult['decision']): LocalSubscriber {
  return {
    status: row.status,
    holdReason: row.hold_reason as LocalSubscriber['holdReason'],
    suppressionReason: row.suppression_reason as LocalSubscriber['suppressionReason'],
    consentConfirmedAt: row.consent_confirmed_at,
    unsubscribedAt: row.unsubscribed_at,
    suppressedAt: row.suppressed_at,
    restrictionDecision: restriction,
    resendContactId: row.resend_contact_id,
    lastSyncedAt: row.last_synced_at ?? null
  };
}

/**
 * Bring one person's provider state in line with local state. Re-screens restrictions every time
 * for anyone who would receive email, so a restriction ChatGPT adds in Attio applies before the
 * next broadcast. A restriction-only hold that clears is released here (and only here).
 */
export async function syncOneSubscriber(deps: NewsletterDeps, row: ReconciliationRow): Promise<{ outcome: string; detail?: string }> {
  const screen = deps.screen ?? screenSubscriberAgainstAttio;
  // Only a hold caused by an unreachable Attio is re-screened for automatic release.
  const restrictionOnlyHold = row.status === 'held' && row.hold_reason === 'restriction_check_unavailable';
  const reachable = row.status === 'subscribed' || restrictionOnlyHold;

  let restriction: RestrictionResult | null = null;
  if (reachable) {
    restriction = await screen(row.email, deps.attio);
    if (restriction.decision !== 'clear') {
      const reason = restriction.decision === 'restricted' ? 'restricted_organisation' : restriction.decision === 'ambiguous' ? 'ambiguous_organisation' : 'restriction_check_unavailable';
      await removeFromDistributionIfPresent(deps, row);
      await deps.store.recordSyncOutcome({
        p_subscriber_id: row.id, p_expected_version: row.state_version, p_outcome: 'held', p_resend_contact_id: row.resend_contact_id,
        p_error: restriction.evidence.detail, p_hold_reason: reason, p_restriction_decision: restriction.decision,
        p_restriction_evidence: restriction.evidence as unknown as Record<string, unknown>
      });
      return { outcome: 'held', detail: reason };
    }
  }

  if (restrictionOnlyHold && restriction?.decision === 'clear') {
    // Release first (database decides, under the version guard); the next pass syncs the provider.
    const released = await deps.store.recordSyncOutcome({
      p_subscriber_id: row.id, p_expected_version: row.state_version, p_outcome: 'synced', p_resend_contact_id: row.resend_contact_id,
      p_error: null, p_hold_reason: null, p_restriction_decision: 'clear',
      p_restriction_evidence: restriction.evidence as unknown as Record<string, unknown>
    });
    return { outcome: released.outcome };
  }

  const local = toLocal(row, restriction?.decision ?? row.restriction_decision);

  try {
    const remote = await (deps.readRemote ?? readRemoteContact)(deps.resend, row.email);
    const plan = planResendContactSync(local, remote);
    if (plan.action === 'hold') {
      await removeFromDistributionIfPresent(deps, row);
      await deps.store.recordSyncOutcome({
        p_subscriber_id: row.id, p_expected_version: row.state_version, p_outcome: 'held', p_resend_contact_id: remote.contactId,
        p_error: plan.reason, p_hold_reason: plan.holdReason, p_restriction_decision: restriction?.decision ?? null,
        p_restriction_evidence: (restriction?.evidence as unknown as Record<string, unknown>) ?? null
      });
      return { outcome: 'held', detail: plan.reason };
    }
    let contactId = remote.contactId;
    let version = row.state_version;
    if (plan.action === 'apply') {
      if (planLiftsProviderWithdrawal(plan, remote)) {
        // Write-ahead, single use per consent: claimed before the Resend write, never re-claimable.
        const claim = await deps.store.claimProviderLift(row.id, version);
        if (!claim.claimed || claim.state_version === undefined) {
          await removeFromDistributionIfPresent(deps, row);
          await deps.store.recordSyncOutcome({
            p_subscriber_id: row.id, p_expected_version: version, p_outcome: 'held', p_resend_contact_id: remote.contactId,
            p_error: `provider_lift_refused:${claim.reason ?? 'unknown'}`, p_hold_reason: 'provider_state_conflict',
            p_restriction_decision: restriction?.decision ?? null,
            p_restriction_evidence: (restriction?.evidence as unknown as Record<string, unknown>) ?? null
          });
          return { outcome: 'held', detail: `provider_lift_refused:${claim.reason ?? 'unknown'}` };
        }
        version = claim.state_version;
      }
      contactId = (await (deps.applyPlan ?? applyResendSyncPlan)(deps.resend, row.email, plan, remote.contactId)).contactId;
    }
    const recorded = await deps.store.recordSyncOutcome({
      p_subscriber_id: row.id, p_expected_version: version, p_outcome: 'synced', p_resend_contact_id: contactId,
      p_error: null, p_hold_reason: null, p_restriction_decision: restriction?.decision ?? null,
      p_restriction_evidence: (restriction?.evidence as unknown as Record<string, unknown>) ?? null
    });
    return { outcome: recorded.outcome === 'synced' ? 'synced' : recorded.outcome };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'sync_error';
    await deps.store.recordSyncOutcome({
      p_subscriber_id: row.id, p_expected_version: row.state_version, p_outcome: 'failed', p_resend_contact_id: null,
      p_error: message, p_hold_reason: null, p_restriction_decision: null, p_restriction_evidence: null
    });
    return { outcome: 'failed', detail: message };
  }
}

async function removeFromDistributionIfPresent(deps: NewsletterDeps, row: ReconciliationRow) {
  try {
    const remote = await (deps.readRemote ?? readRemoteContact)(deps.resend, row.email);
    if (remote.exists && remote.inSignalsSegment) {
      await (deps.applyPlan ?? applyResendSyncPlan)(deps.resend, row.email, {
        action: 'apply', createContact: false, setUnsubscribed: null, topic: null, addToSignalsSegment: false, removeFromSignalsSegment: true
      }, remote.contactId);
    }
  } catch {
    // Removal is retried by the next reconciliation; the local hold already blocks eligibility.
  }
}

export async function reconcileNewsletterBatch(deps: NewsletterDeps, limit = 25) {
  const rows = await deps.store.reconciliationBatch(limit);
  const outcomes: Record<string, number> = {};
  for (const row of rows) {
    const result = await syncOneSubscriber(deps, row);
    outcomes[result.outcome] = (outcomes[result.outcome] ?? 0) + 1;
  }
  return { examined: rows.length, outcomes };
}
