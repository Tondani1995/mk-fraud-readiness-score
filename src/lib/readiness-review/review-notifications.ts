import { getEmailProviderMode } from '@/lib/notifications/email-provider';
import { isRecipientPermitted, recipientAllowlist } from '@/lib/notifications/phase1-order-notifications';
import {
  defaultStalledLeadInactivityMinutes,
  queueAndDispatchInternalNotification,
  type InternalAssessmentNotificationDependencies,
  type StalledLeadControl
} from '@/lib/notifications/internal-assessment-notifications';
import type { InternalNotificationType } from '@/lib/notifications/internal-notifications';
import {
  completionsPendingNotification,
  contactFor,
  recordNotified,
  stalledNotificationsFrom,
  stalledReviews,
  type NotificationKind,
  type ReviewContact,
  type StalledReview
} from './contacts';

/**
 * MK's internal notifications for the revised review (owner decision, 15 November 2026): when a real organisation starts,
 * when it finishes, and when a review stalls. They go to MK's own leads mailbox; nothing is sent to the respondent, and
 * no private review link or answer is ever included.
 *
 * Correction, 25 November 2026: delivery now uses the same durable queue as every other MK internal notification
 * (public.email_events). Each notification is one row with a deterministic dedupe key, claimed under a lease before the
 * provider call and settled afterwards, so concurrent workers, scheduler retries and restarts cannot send it twice, a
 * failed send stays recoverable, and the production monitor sees failures. The review's own markers are written only
 * after a notification has been processed successfully.
 */
function internalRecipient() {
  return process.env.MK_INTERNAL_LEADS_EMAIL?.trim() || process.env.MK_INTERNAL_NOTIFICATIONS_EMAIL?.trim() || null;
}

function permitted(recipient: string) {
  if (!isRecipientPermitted(recipient)) return false;
  if (getEmailProviderMode() === 'test') return Boolean(recipientAllowlist()?.includes(recipient.trim().toLowerCase()));
  return true;
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export type ReviewNotice = {
  kind: NotificationKind;
  organisationLabel: string;
  contact: ReviewContact;
  /** Distinct questions the respondent has answered. */
  answersRecorded?: number;
  /** The respondent's own last activity. For "stalled" it also identifies the inactivity episode. */
  lastActivityAt?: string;
  inactiveMinutes?: number;
  /** MK's console page for this review (the console's access check applies; it is not the respondent's private link). */
  consoleUrl?: string;
};

/** The console page for a review, on the same base address as the order emails' console links. */
export function reviewConsoleUrl(sessionId: string) {
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim() || 'https://mkfraud.co.za';
  return `${base.replace(/\/$/, '')}/score/admin/reviews/${encodeURIComponent(sessionId)}`;
}

function durationText(minutes: number) {
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }
  return `${minutes} minutes`;
}

export function reviewNoticeMessage(n: ReviewNotice) {
  const who = `${n.contact.fullName}${n.contact.roleTitle ? `, ${n.contact.roleTitle}` : ''}`;
  const subject = {
    started: `Fraud Readiness review started: ${n.organisationLabel}`,
    completed: `Fraud Readiness review completed: ${n.organisationLabel}`,
    stalled: `Fraud Readiness review stalled: ${n.organisationLabel}`
  }[n.kind];
  const lead = {
    started: `${who} has started a Fraud Readiness review for ${n.organisationLabel}.`,
    completed: `${who} has completed a Fraud Readiness review for ${n.organisationLabel}. Their Snapshot is ready and a report can now be ordered from it.`,
    stalled: `The Fraud Readiness review for ${n.organisationLabel} has had no respondent activity for at least ${durationText(n.inactiveMinutes ?? defaultStalledLeadInactivityMinutes())} and has not been completed.`
  }[n.kind];
  const rows: [string, string][] = [
    ['Organisation', n.organisationLabel],
    ['Name', n.contact.fullName],
    ['Work email', n.contact.email],
    ['Role', n.contact.roleTitle ?? 'Not given'],
    ...(n.answersRecorded !== undefined ? [['Questions answered', String(n.answersRecorded)] as [string, string]] : []),
    ...(n.lastActivityAt ? [['Last respondent activity', new Date(n.lastActivityAt).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'] as [string, string]] : [])
  ];
  const consoleLine = n.consoleUrl ? `\n\nOpen in the console: ${n.consoleUrl}` : '';
  const text = `${lead}\n\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}${consoleLine}\n\nThe respondent's private review link is not included in this email.`;
  const html = `<p>${escape(lead)}</p><table cellpadding="4" style="border-collapse:collapse">${rows
    .map(([k, v]) => `<tr><td style="color:#475569">${escape(k)}</td><td>${escape(v)}</td></tr>`)
    .join('')}</table>${n.consoleUrl ? `<p><a href="${escape(n.consoleUrl)}" style="color:#001030;font-weight:600">Open in the console</a></p>` : ''}<p style="color:#475569">The respondent's private review link is not included in this email.</p>`;
  return { subject, text, html };
}

const NOTIFICATION_TYPE: Record<NotificationKind, InternalNotificationType> = {
  started: 'review_started',
  completed: 'review_completed',
  stalled: 'review_stalled'
};

/** One email_events row per notification: once per session for started and completed, once per episode for stalled. */
export function reviewNotificationDedupeKey(sessionId: string, kind: NotificationKind, episodeActivityAt?: string | null) {
  if (kind !== 'stalled') return `review_${kind}:${sessionId}`;
  if (!episodeActivityAt) throw new Error('review_stalled_episode_missing');
  return `review_stalled:${sessionId}:last_activity:${new Date(episodeActivityAt).toISOString()}`;
}

export type ReviewNoticeOutcome = { sent: boolean; reason?: string; status?: string; emailEventId?: string };
export type ReviewNotificationDependencies = InternalAssessmentNotificationDependencies & {
  recordNotifiedImpl?: typeof recordNotified;
};

/**
 * Queues and dispatches one review notification through public.email_events. Never throws; the outcome is returned.
 * The review marker is recorded only when the notification was processed (sent now, already sent, or recorded with
 * sending disabled); a failed send leaves the row recoverable and the marker unset, so the next run retries it.
 */
export async function sendReviewNotice(sessionId: string, notice: ReviewNotice, dependencies: ReviewNotificationDependencies = {}): Promise<ReviewNoticeOutcome> {
  const recipient = internalRecipient();
  if (!recipient || !permitted(recipient)) return { sent: false, reason: 'recipient_not_configured' };
  try {
    const message = reviewNoticeMessage({ ...notice, consoleUrl: notice.consoleUrl ?? reviewConsoleUrl(sessionId) });
    const result: any = await queueAndDispatchInternalNotification({
      queue: {
        notificationType: NOTIFICATION_TYPE[notice.kind],
        assessmentId: null,
        recipientEmail: recipient,
        dedupeKey: reviewNotificationDedupeKey(sessionId, notice.kind, notice.lastActivityAt),
        // Operational metadata only: no respondent contact details, answers or private links.
        metadata: {
          review_session_id: sessionId,
          review_notification: notice.kind,
          ...(notice.kind === 'stalled' ? {
            last_activity_at: notice.lastActivityAt ? new Date(notice.lastActivityAt).toISOString() : null,
            inactivity_minutes: notice.inactiveMinutes ?? null,
            progress_question_count: notice.answersRecorded ?? null
          } : {})
        } as any
      },
      message
    }, dependencies);
    const status = String(result?.status ?? '');
    const processed = result?.ok === true && ['sent', 'already_sent', 'recorded_disabled', 'already_notified', 'provider_disabled'].includes(status);
    if (!processed) {
      // Another worker holds the lease: not a failure, and not ours to record.
      if (status === 'claim_lease_active' || status === 'claimed_by_another_attempt') return { sent: false, reason: 'in_progress', status, emailEventId: result?.emailEventId };
      return { sent: false, reason: 'provider_failed', status, emailEventId: result?.emailEventId };
    }
    await (dependencies.recordNotifiedImpl ?? recordNotified)(sessionId, notice.kind, notice.kind === 'stalled' ? notice.lastActivityAt ?? null : null);
    return { sent: status === 'sent', reason: status === 'sent' ? undefined : status, status, emailEventId: result?.emailEventId };
  } catch (error) {
    console.warn('review_notification_failed', { kind: notice.kind, message: error instanceof Error ? error.message.slice(0, 160) : 'unknown' });
    return { sent: false, reason: 'error' };
  }
}

/** Sends the completion notice for a real session with a contact, once. */
export async function notifyReviewCompleted(sessionId: string, dependencies: ReviewNotificationDependencies & { contactForImpl?: typeof contactFor } = {}) {
  const c = await (dependencies.contactForImpl ?? contactFor)(sessionId).catch(() => null);
  if (!c || c.fictional) return { sent: false, reason: 'no_contact' };
  return sendReviewNotice(sessionId, {
    kind: 'completed',
    organisationLabel: c.organisationLabel,
    contact: c,
    answersRecorded: c.answersRecorded,
    lastActivityAt: c.lastRespondentActivityAt ?? undefined
  }, dependencies);
}

export type ReviewMonitorStore = {
  stalledReviews: typeof stalledReviews;
  stalledNotificationsFrom: typeof stalledNotificationsFrom;
  completionsPendingNotification: typeof completionsPendingNotification;
};
const defaultStore: ReviewMonitorStore = { stalledReviews, stalledNotificationsFrom, completionsPendingNotification };

/**
 * The stalled-review pass, run every 15 minutes with the adaptive pass and under the same control. Each inactivity
 * episode is notified once; an episode that became stalled before the correction went live (the boundary) is left to
 * the owner-approved recovery operation. Completion notices that failed earlier are retried here.
 */
export async function monitorReviewStalledLeads(
  control: StalledLeadControl,
  options: { now?: Date; store?: ReviewMonitorStore; dependencies?: ReviewNotificationDependencies; completionNotifier?: typeof notifyReviewCompleted } = {}
) {
  const now = options.now ?? new Date();
  const store = options.store ?? defaultStore;
  if (!control.enabled) return { disabled: true, inspected: 0, notified: 0, alreadyNotified: 0, deferredToRecovery: 0, failed: 0, completionsRetried: 0 };
  const thresholdMs = control.inactivityMinutes * 60_000;
  const cutoff = new Date(now.getTime() - thresholdMs);
  const boundary = await store.stalledNotificationsFrom();
  const stalled: StalledReview[] = await store.stalledReviews(cutoff);
  let notified = 0;
  let alreadyNotified = 0;
  let deferredToRecovery = 0;
  let failed = 0;
  for (const s of stalled) {
    const stalledAt = new Date(s.lastActivityAt).getTime() + thresholdMs;
    if (boundary && stalledAt < boundary.getTime()) {
      deferredToRecovery += 1;
      continue;
    }
    const r = await sendReviewNotice(s.sessionId, {
      kind: 'stalled',
      organisationLabel: s.organisationLabel,
      contact: { fullName: s.fullName, email: s.email, roleTitle: s.roleTitle },
      answersRecorded: s.answersRecorded,
      lastActivityAt: s.lastActivityAt,
      inactiveMinutes: control.inactivityMinutes
    }, options.dependencies);
    if (r.sent) notified += 1;
    else if (r.reason === 'provider_failed' || r.reason === 'error' || r.reason === 'recipient_not_configured') failed += 1;
    else alreadyNotified += 1;
  }

  let completionsRetried = 0;
  const pending = await store.completionsPendingNotification();
  for (const p of pending) {
    // Only completions after the boundary are retried automatically, for the same no-replay reason.
    if (boundary && new Date(p.completedAt).getTime() < boundary.getTime()) continue;
    const r = await (options.completionNotifier ?? notifyReviewCompleted)(p.sessionId, options.dependencies);
    completionsRetried += 1;
    if (!r.sent && (r.reason === 'provider_failed' || r.reason === 'error')) failed += 1;
  }
  return { inspected: stalled.length, notified, alreadyNotified, deferredToRecovery, failed, completionsRetried, inactivityMinutes: control.inactivityMinutes };
}

export type RecoveryEntry = {
  sessionId: string;
  organisationLabel: string;
  lastActivityAt: string;
  questionsAnswered: number;
  stalledAt: string;
  beforeBoundary: boolean;
  outcome: 'would_notify' | 'notified' | 'already_notified' | 'failed' | 'not_eligible';
  detail?: string;
};

/**
 * Owner-approved recovery for stalled episodes the automatic pass leaves alone (those that stalled before the
 * correction's go-live boundary). It only ever considers the named sessions, and only those the stalled query still
 * returns: real, unfinished, not ordered, and not yet notified for their current episode. A dry run reports what would
 * be sent; an executed run sends through the same queue and dedupe keys, so repeating it never sends twice.
 */
export async function recoverStalledReviews(
  control: StalledLeadControl,
  input: { sessionIds: string[]; execute: boolean; now?: Date; store?: ReviewMonitorStore; dependencies?: ReviewNotificationDependencies }
): Promise<{ executed: boolean; entries: RecoveryEntry[] }> {
  const now = input.now ?? new Date();
  const store = input.store ?? defaultStore;
  const thresholdMs = control.inactivityMinutes * 60_000;
  const boundary = await store.stalledNotificationsFrom();
  const candidates = new Map((await store.stalledReviews(new Date(now.getTime() - thresholdMs))).map((s) => [s.sessionId, s]));
  const entries: RecoveryEntry[] = [];
  for (const sessionId of [...new Set(input.sessionIds)]) {
    const s = candidates.get(sessionId);
    if (!s) {
      entries.push({ sessionId, organisationLabel: '', lastActivityAt: '', questionsAnswered: 0, stalledAt: '', beforeBoundary: false, outcome: 'not_eligible', detail: 'not a current stalled episode (finished, ordered, fictional, resumed recently or already notified)' });
      continue;
    }
    const stalledAt = new Date(new Date(s.lastActivityAt).getTime() + thresholdMs);
    const base = {
      sessionId,
      organisationLabel: s.organisationLabel,
      lastActivityAt: new Date(s.lastActivityAt).toISOString(),
      questionsAnswered: s.answersRecorded,
      stalledAt: stalledAt.toISOString(),
      beforeBoundary: Boolean(boundary && stalledAt < boundary)
    };
    if (!input.execute) {
      entries.push({ ...base, outcome: 'would_notify' });
      continue;
    }
    const r = await sendReviewNotice(sessionId, {
      kind: 'stalled',
      organisationLabel: s.organisationLabel,
      contact: { fullName: s.fullName, email: s.email, roleTitle: s.roleTitle },
      answersRecorded: s.answersRecorded,
      lastActivityAt: s.lastActivityAt,
      inactiveMinutes: control.inactivityMinutes
    }, input.dependencies);
    entries.push({ ...base, outcome: r.sent ? 'notified' : r.reason === 'provider_failed' || r.reason === 'error' ? 'failed' : 'already_notified', detail: r.status });
  }
  return { executed: input.execute, entries };
}
