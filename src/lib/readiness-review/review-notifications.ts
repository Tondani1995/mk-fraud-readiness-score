import { getEmailProviderMode, sendEmail } from '@/lib/notifications/email-provider';
import { isRecipientPermitted, recipientAllowlist } from '@/lib/notifications/phase1-order-notifications';
import { defaultStalledLeadInactivityHours } from '@/lib/notifications/internal-assessment-notifications';
import { claimNotification, contactFor, releaseNotification, stalledReviews, type NotificationKind, type ReviewContact } from './contacts';

/**
 * MK's internal notifications for the revised review (owner decision, 15 November 2026): when a real organisation starts,
 * when it finishes, and when a review stalls. They go to MK's own leads mailbox through the existing email provider and
 * its recipient rules; nothing is sent to the respondent, and no private review link is ever included.
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
  /** Answers recorded so far (actions in the log, a close proxy for screens answered). */
  actionCount?: number;
  lastActivityAt?: string;
  inactiveHours?: number;
};

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
    stalled: `The Fraud Readiness review for ${n.organisationLabel} has had no activity for at least ${n.inactiveHours ?? defaultStalledLeadInactivityHours()} hours and has not been completed.`
  }[n.kind];
  const rows: [string, string][] = [
    ['Organisation', n.organisationLabel],
    ['Name', n.contact.fullName],
    ['Work email', n.contact.email],
    ['Role', n.contact.roleTitle ?? 'Not given'],
    ...(n.actionCount !== undefined ? [['Answers recorded', String(n.actionCount)] as [string, string]] : []),
    ...(n.lastActivityAt ? [['Last activity', new Date(n.lastActivityAt).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'] as [string, string]] : [])
  ];
  const text = `${lead}\n\n${rows.map(([k, v]) => `${k}: ${v}`).join('\n')}\n\nThe respondent's private review link is not included in this email.`;
  const html = `<p>${escape(lead)}</p><table cellpadding="4" style="border-collapse:collapse">${rows
    .map(([k, v]) => `<tr><td style="color:#475569">${escape(k)}</td><td>${escape(v)}</td></tr>`)
    .join('')}</table><p style="color:#475569">The respondent's private review link is not included in this email.</p>`;
  return { subject, text, html };
}

/**
 * Sends one notification at most once: the notification is claimed in the database before the provider call and the
 * claim is released if the send fails, so a later attempt can send it. Never throws; the outcome is returned.
 */
export async function sendReviewNotice(sessionId: string, notice: ReviewNotice): Promise<{ sent: boolean; reason?: string }> {
  const recipient = internalRecipient();
  if (!recipient || !permitted(recipient)) return { sent: false, reason: 'recipient_not_configured' };
  try {
    const claimed = await claimNotification(sessionId, notice.kind, notice.kind === 'stalled' ? notice.actionCount ?? null : null);
    if (!claimed) return { sent: false, reason: 'already_sent' };
    const message = reviewNoticeMessage(notice);
    const result = await sendEmail({
      audience: 'internal',
      from: process.env.MK_REPORT_EMAIL_FROM?.trim() || 'MK Fraud Insights <hello@mkfraud.co.za>',
      to: recipient,
      replyTo: notice.contact.email,
      subject: message.subject,
      html: message.html,
      text: message.text,
      idempotencyKey: `review-${notice.kind}-${sessionId}${notice.kind === 'stalled' ? `-${notice.actionCount ?? 0}` : ''}`
    } as any);
    if (!result.ok) {
      await releaseNotification(sessionId, notice.kind).catch(() => undefined);
      return { sent: false, reason: 'provider_failed' };
    }
    return { sent: true };
  } catch (error) {
    console.warn('review_notification_failed', { kind: notice.kind, message: error instanceof Error ? error.message.slice(0, 160) : 'unknown' });
    return { sent: false, reason: 'error' };
  }
}

/** Sends the completion notice for a real session with a contact, once. */
export async function notifyReviewCompleted(sessionId: string) {
  const c = await contactFor(sessionId).catch(() => null);
  if (!c || c.fictional) return { sent: false, reason: 'no_contact' };
  return sendReviewNotice(sessionId, { kind: 'completed', organisationLabel: c.organisationLabel, contact: c, actionCount: c.actionCount });
}

/** The hourly stalled-lead pass for reviews: each period of inactivity is notified once. */
export async function monitorReviewStalledLeads(now = new Date(), hours = defaultStalledLeadInactivityHours()) {
  const cutoff = new Date(now.getTime() - hours * 3_600_000);
  const stalled = await stalledReviews(cutoff);
  let notified = 0;
  for (const s of stalled) {
    const r = await sendReviewNotice(s.sessionId, {
      kind: 'stalled',
      organisationLabel: s.organisationLabel,
      contact: { fullName: s.fullName, email: s.email, roleTitle: s.roleTitle },
      actionCount: s.actionCount,
      lastActivityAt: s.lastActivityAt,
      inactiveHours: hours
    });
    if (r.sent) notified += 1;
  }
  return { inspected: stalled.length, notified };
}
