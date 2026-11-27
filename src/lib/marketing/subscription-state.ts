/**
 * MK Fraud Signals subscription state: pure rules, no I/O.
 *
 * Authority model (see docs/marketing/mk-fraud-signals-architecture.md):
 *   - Supabase holds consent EVIDENCE and the reconciled subscription state.
 *   - Resend holds operational preferences (global unsubscribe, topic opt-out) and suppression.
 *   - Attio holds commercial relationship and organisation RESTRICTION data.
 *
 * Two invariants are enforced by every function here:
 *   1. A withdrawal (unsubscribe, topic opt-out), bounce, complaint or explicit suppression is
 *      sticky. No CRM value, retry, reconciliation or stale record can reverse it. Only a fresh,
 *      confirmed consent that is NEWER than the withdrawal may lift a withdrawal, and nothing
 *      automated lifts a bounce, complaint or manual suppression.
 *   2. When the three systems disagree, distribution fails closed: the person is not eligible
 *      until a human reviews the conflict.
 */

export type SubscriberStatus =
  | 'pending_confirmation'
  | 'subscribed'
  | 'unsubscribed'
  | 'suppressed'
  | 'held'
  | 'erased';

export type HoldReason =
  | 'restricted_organisation'
  | 'ambiguous_organisation'
  | 'restriction_check_unavailable'
  | 'provider_state_conflict'
  | 'provider_resubscribe_without_fresh_consent'
  | 'contact_quota'
  | 'manual_review';

export type SuppressionReason = 'hard_bounce' | 'complaint' | 'provider_suppression' | 'manual';

export type RestrictionDecision = 'clear' | 'restricted' | 'ambiguous' | 'unchecked';

export type LocalSubscriber = {
  status: SubscriberStatus;
  holdReason: HoldReason | null;
  suppressionReason: SuppressionReason | null;
  consentConfirmedAt: string | null;
  unsubscribedAt: string | null;
  suppressedAt: string | null;
  restrictionDecision: RestrictionDecision;
  resendContactId: string | null;
  /** Last successful provider sync. A provider withdrawal seen after this cannot predate MK's consent. */
  lastSyncedAt?: string | null;
};

export type RemoteContact = {
  exists: boolean;
  contactId: string | null;
  unsubscribed: boolean | null;
  topicSubscription: 'opt_in' | 'opt_out' | null;
  inSignalsSegment: boolean;
  suppressed: boolean;
};

const ms = (iso: string | null) => (iso ? Date.parse(iso) : Number.NaN);

/** Fresh consent lifts a withdrawal only when it was confirmed strictly after the withdrawal. */
export function consentIsNewerThanWithdrawal(local: Pick<LocalSubscriber, 'consentConfirmedAt' | 'unsubscribedAt'>): boolean {
  const confirmed = ms(local.consentConfirmedAt);
  if (!Number.isFinite(confirmed)) return false;
  const withdrawn = ms(local.unsubscribedAt);
  return !Number.isFinite(withdrawn) || confirmed > withdrawn;
}

/**
 * May this sync lift a withdrawal that Resend reports (global unsubscribe or topic opt-out)?
 * Only the FIRST sync after a fresh confirmation may, and only when that confirmation is newer than
 * any withdrawal MK has recorded. Once a sync has succeeded after the consent, any provider
 * withdrawal observed later must have happened after the consent, including one whose webhook was
 * missed: so Resend wins and the person is held for review.
 */
export function canLiftProviderWithdrawal(local: Pick<LocalSubscriber, 'consentConfirmedAt' | 'unsubscribedAt' | 'lastSyncedAt'>): boolean {
  if (!consentIsNewerThanWithdrawal(local)) return false;
  const synced = ms(local.lastSyncedAt ?? null);
  return !Number.isFinite(synced) || ms(local.consentConfirmedAt) > synced;
}

export type EligibilityDecision = {
  eligible: boolean;
  reasons: string[];
};

/**
 * Decide whether one person may receive the next MK Fraud Signals issue. Every condition must be
 * positively true; an unknown is a "no".
 */
export function decideDistributionEligibility(local: LocalSubscriber, remote: RemoteContact | null): EligibilityDecision {
  const reasons: string[] = [];
  if (local.status !== 'subscribed') reasons.push(`local_status_${local.status}`);
  if (!local.consentConfirmedAt) reasons.push('no_confirmed_consent');
  if (local.suppressionReason || local.suppressedAt) reasons.push('locally_suppressed');
  if (local.restrictionDecision !== 'clear') reasons.push(`restriction_${local.restrictionDecision}`);
  if (local.unsubscribedAt && !consentIsNewerThanWithdrawal(local)) reasons.push('withdrawal_not_superseded');

  if (!remote) {
    reasons.push('provider_state_unknown');
  } else {
    if (!remote.exists || !remote.contactId) reasons.push('provider_contact_missing');
    if (local.resendContactId && remote.contactId && local.resendContactId !== remote.contactId) {
      reasons.push('provider_contact_id_mismatch');
    }
    if (remote.unsubscribed !== false) reasons.push('provider_globally_unsubscribed_or_unknown');
    if (remote.topicSubscription !== 'opt_in') reasons.push('provider_topic_not_opted_in');
    if (!remote.inSignalsSegment) reasons.push('provider_not_in_signals_segment');
    if (remote.suppressed) reasons.push('provider_suppressed');
  }

  return { eligible: reasons.length === 0, reasons };
}

export type ResendSyncPlan =
  | { action: 'none'; reason: string }
  | {
      action: 'apply';
      createContact: boolean;
      /** Only ever `false` when fresh newer consent exists; `true` propagates a local withdrawal. */
      setUnsubscribed: boolean | null;
      topic: 'opt_in' | 'opt_out' | null;
      addToSignalsSegment: boolean;
      removeFromSignalsSegment: boolean;
    }
  | { action: 'hold'; holdReason: HoldReason; reason: string };

/**
 * Plan the provider writes that bring Resend in line with local state, without ever weakening a
 * withdrawal. The plan never re-subscribes a contact that Resend reports as unsubscribed unless
 * the local consent was confirmed after the recorded withdrawal.
 */
export function planResendContactSync(local: LocalSubscriber, remote: RemoteContact): ResendSyncPlan {
  // Withdrawals and suppressions flow outward, always.
  if (local.status === 'unsubscribed' || local.status === 'suppressed' || local.status === 'erased') {
    if (!remote.exists) return { action: 'none', reason: 'withdrawn_and_absent_from_provider' };
    return {
      action: 'apply',
      createContact: false,
      setUnsubscribed: remote.unsubscribed === true ? null : true,
      topic: remote.topicSubscription === 'opt_out' ? null : 'opt_out',
      addToSignalsSegment: false,
      removeFromSignalsSegment: remote.inSignalsSegment
    };
  }

  if (local.status === 'pending_confirmation') {
    return { action: 'none', reason: 'awaiting_confirmation' };
  }

  if (local.status === 'held') {
    // A held person is kept out of the distribution segment but nothing they chose is changed.
    if (remote.exists && remote.inSignalsSegment) {
      return {
        action: 'apply',
        createContact: false,
        setUnsubscribed: null,
        topic: null,
        addToSignalsSegment: false,
        removeFromSignalsSegment: true
      };
    }
    return { action: 'none', reason: 'held_pending_review' };
  }

  // status === 'subscribed'
  if (local.restrictionDecision !== 'clear') {
    return { action: 'hold', holdReason: local.restrictionDecision === 'restricted' ? 'restricted_organisation' : local.restrictionDecision === 'ambiguous' ? 'ambiguous_organisation' : 'restriction_check_unavailable', reason: 'restriction_not_clear' };
  }
  if (!local.consentConfirmedAt) {
    return { action: 'hold', holdReason: 'manual_review', reason: 'subscribed_without_confirmed_consent' };
  }
  if (remote.suppressed) {
    return { action: 'hold', holdReason: 'provider_state_conflict', reason: 'provider_suppressed_while_locally_subscribed' };
  }
  if (remote.exists && remote.unsubscribed === true && !canLiftProviderWithdrawal(local)) {
    // Resend says withdrawn and we hold no newer confirmed consent: Resend wins, never us.
    return { action: 'hold', holdReason: 'provider_state_conflict', reason: 'provider_unsubscribed_without_newer_consent' };
  }
  if (remote.exists && remote.topicSubscription === 'opt_out' && !canLiftProviderWithdrawal(local)) {
    return { action: 'hold', holdReason: 'provider_state_conflict', reason: 'provider_topic_opt_out_without_newer_consent' };
  }

  const needsUnsubscribeLift = remote.exists && remote.unsubscribed === true;
  const plan = {
    action: 'apply' as const,
    createContact: !remote.exists,
    setUnsubscribed: needsUnsubscribeLift ? false : remote.exists ? null : false,
    topic: remote.topicSubscription === 'opt_in' ? null : 'opt_in' as const,
    addToSignalsSegment: !remote.inSignalsSegment,
    removeFromSignalsSegment: false
  };
  if (!plan.createContact && plan.setUnsubscribed === null && plan.topic === null && !plan.addToSignalsSegment) {
    return { action: 'none', reason: 'already_in_sync' };
  }
  return plan;
}

/** Does this plan re-subscribe a contact that Resend currently reports as withdrawn? */
export function planLiftsProviderWithdrawal(plan: ResendSyncPlan, remote: RemoteContact): boolean {
  if (plan.action !== 'apply' || !remote.exists) return false;
  return (plan.setUnsubscribed === false && remote.unsubscribed === true)
    || (plan.topic === 'opt_in' && remote.topicSubscription === 'opt_out');
}

export type ProviderEffect =
  | { kind: 'global_unsubscribe'; email: string }
  | { kind: 'topic_opt_out'; email: string }
  | { kind: 'topic_opt_in_from_provider'; email: string }
  | { kind: 'hard_bounce'; email: string }
  | { kind: 'complaint'; email: string }
  | { kind: 'provider_suppression'; email: string; origin: string | null }
  | { kind: 'engagement'; email: string; engagement: 'delivered' | 'clicked' }
  | { kind: 'contact_deleted'; email: string }
  | { kind: 'ignored'; reason: string };

type RawEvent = { type?: unknown; data?: Record<string, unknown> | null };

function firstRecipient(data: Record<string, unknown>): string | null {
  const to = data.to;
  if (Array.isArray(to) && typeof to[0] === 'string') return to[0].trim().toLowerCase();
  return null;
}

function contactEmail(data: Record<string, unknown>): string | null {
  return typeof data.email === 'string' ? data.email.trim().toLowerCase() : null;
}

/**
 * Translate a verified Resend webhook event into the one effect MK acts on. Email events that do
 * not belong to a broadcast are transactional (Fraud Readiness) traffic and are ignored here, so
 * this endpoint can never interfere with the report-delivery state machine.
 */
export function mapResendMarketingEvent(event: RawEvent, signalsTopicId: string | null): ProviderEffect {
  const type = typeof event.type === 'string' ? event.type : '';
  const data = event.data && typeof event.data === 'object' ? event.data : {};

  if (type === 'contact.updated') {
    const email = contactEmail(data);
    if (!email) return { kind: 'ignored', reason: 'contact_event_without_email' };
    if (data.unsubscribed === true) return { kind: 'global_unsubscribe', email };
    return { kind: 'ignored', reason: 'contact_update_without_withdrawal' };
  }
  if (type === 'contact.deleted') {
    const email = contactEmail(data);
    return email ? { kind: 'contact_deleted', email } : { kind: 'ignored', reason: 'contact_event_without_email' };
  }
  if (type === 'contact.topics.updated') {
    const email = contactEmail(data);
    if (!email) return { kind: 'ignored', reason: 'topic_event_without_email' };
    if (!signalsTopicId) return { kind: 'ignored', reason: 'signals_topic_not_configured' };
    const topics = Array.isArray(data.topics) ? data.topics as Array<Record<string, unknown>> : [];
    const signals = topics.find((topic) => topic?.id === signalsTopicId);
    if (!signals) return { kind: 'ignored', reason: 'other_topic' };
    if (signals.subscription === 'opt_out') return { kind: 'topic_opt_out', email };
    if (signals.subscription === 'opt_in') return { kind: 'topic_opt_in_from_provider', email };
    return { kind: 'ignored', reason: 'unknown_topic_subscription' };
  }
  if (type === 'suppression.added') {
    const email = contactEmail(data);
    if (!email) return { kind: 'ignored', reason: 'suppression_without_email' };
    return { kind: 'provider_suppression', email, origin: typeof data.origin === 'string' ? data.origin : null };
  }

  if (type.startsWith('email.')) {
    const isBroadcast = typeof data.broadcast_id === 'string' && data.broadcast_id.length > 0;
    if (!isBroadcast) return { kind: 'ignored', reason: 'transactional_email_event' };
    const email = firstRecipient(data);
    if (!email) return { kind: 'ignored', reason: 'email_event_without_recipient' };
    if (type === 'email.bounced') {
      const bounce = data.bounce && typeof data.bounce === 'object' ? data.bounce as Record<string, unknown> : {};
      return bounce.type === 'Permanent' ? { kind: 'hard_bounce', email } : { kind: 'ignored', reason: 'soft_bounce' };
    }
    if (type === 'email.complained') return { kind: 'complaint', email };
    if (type === 'email.suppressed') return { kind: 'provider_suppression', email, origin: 'send_time' };
    if (type === 'email.delivered') return { kind: 'engagement', email, engagement: 'delivered' };
    if (type === 'email.clicked') return { kind: 'engagement', email, engagement: 'clicked' };
    return { kind: 'ignored', reason: `unhandled_${type}` };
  }

  return { kind: 'ignored', reason: type ? `unhandled_${type}` : 'missing_type' };
}

/**
 * Apply a provider effect to local state. Returns the next state, or null when nothing changes.
 * The precedence is strict: suppression > withdrawal > hold > anything else.
 */
export function applyProviderEffect(local: LocalSubscriber, effect: ProviderEffect, occurredAt: string): LocalSubscriber | null {
  switch (effect.kind) {
    case 'hard_bounce':
    case 'complaint':
    case 'provider_suppression': {
      const reason: SuppressionReason = effect.kind === 'hard_bounce' ? 'hard_bounce' : effect.kind === 'complaint' ? 'complaint' : 'provider_suppression';
      if (local.status === 'suppressed' && local.suppressionReason === reason) return null;
      // A complaint outranks a bounce outranks a generic suppression; never downgrade the reason.
      const rank = { manual: 4, complaint: 3, hard_bounce: 2, provider_suppression: 1 } as const;
      const keep = local.suppressionReason && rank[local.suppressionReason] >= rank[reason];
      return { ...local, status: 'suppressed', suppressionReason: keep ? local.suppressionReason : reason, suppressedAt: local.suppressedAt ?? occurredAt, holdReason: null };
    }
    case 'global_unsubscribe':
    case 'topic_opt_out':
    case 'contact_deleted': {
      if (local.status === 'suppressed' || local.status === 'erased') return null;
      const withdrawnAt = local.unsubscribedAt && Date.parse(local.unsubscribedAt) > Date.parse(occurredAt) ? local.unsubscribedAt : occurredAt;
      // A withdrawal older than the current consent was superseded by that consent; ignore it.
      if (local.consentConfirmedAt && Date.parse(local.consentConfirmedAt) > Date.parse(occurredAt)) return null;
      if (local.status === 'unsubscribed' && local.unsubscribedAt === withdrawnAt) return null;
      return { ...local, status: 'unsubscribed', unsubscribedAt: withdrawnAt, holdReason: null };
    }
    case 'topic_opt_in_from_provider': {
      // Re-ticking the topic on the provider's preference page is not evidenced consent on MK's
      // wording. Hold for review and ask the person to confirm on the website instead.
      if (local.status === 'subscribed' || local.status === 'suppressed' || local.status === 'erased') return null;
      return { ...local, status: 'held', holdReason: 'provider_resubscribe_without_fresh_consent' };
    }
    case 'engagement':
    case 'ignored':
      return null;
  }
}
