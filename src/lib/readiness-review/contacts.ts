import { createClient } from '@supabase/supabase-js';
import { reviewDatabaseConfig, reviewStoreKind } from './database-config';
import { ActionRejected } from './session';

/**
 * The person answering a review (owner decision, 15 November 2026): full name, work email and role, collected on the
 * start form in production. Stored apart from the answer log (readiness_review.session_contacts), service role only.
 */
export type ReviewContact = { fullName: string; email: string; roleTitle: string | null };
export type StoredReviewContact = ReviewContact & {
  organisationLabel: string;
  fictional: boolean;
  actionCount: number;
  lastActionAt: string | null;
  createdAt: string;
  bound: boolean;
  completedAt?: string | null;
  completedNotifiedAt?: string | null;
  /** Distinct questions the respondent has answered: meaningful progress, unlike the raw action count. */
  answersRecorded?: number;
  lastRespondentActivityAt?: string | null;
};
export type NotificationKind = 'started' | 'completed' | 'stalled';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Validates the start form's contact fields; the messages are shown to the person starting. */
export function validateContact(input: unknown): ReviewContact {
  const x = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const clean = (v: unknown, max: number) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  const fullName = clean(x.fullName, 120);
  const email = clean(x.email, 254).toLowerCase();
  const roleTitle = clean(x.roleTitle, 120) || null;
  if (!fullName) throw new ActionRejected('invalid_input', 'Enter your full name.');
  if (!EMAIL.test(email)) throw new ActionRejected('invalid_input', 'Enter a valid work email address.');
  return { fullName, email, roleTitle };
}

let cached: any = null;
/** The review store's database client, or null where the review store is not a database (the local file harness). */
function db(): any {
  if (reviewStoreKind() !== 'database') return null;
  if (!cached) {
    const config = reviewDatabaseConfig();
    cached = createClient(config.url, config.serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { 'x-client-info': 'mk-readiness-review-contacts' } }
    });
  }
  return cached;
}

async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const client = db();
  if (!client) throw new Error('review_contacts_unavailable');
  const { data, error } = await client.rpc(fn, args);
  if (error) throw new Error(`${fn}_failed: ${error.code ?? ''} ${error.message ?? ''}`.trim());
  return data as T;
}

export function contactsAvailable() {
  return reviewStoreKind() === 'database';
}

export async function recordContact(sessionId: string, contact: ReviewContact): Promise<boolean> {
  return rpc<boolean>('review_record_session_contact', { p: { sessionId, ...contact } });
}

export async function contactFor(sessionId: string): Promise<StoredReviewContact | null> {
  if (!contactsAvailable()) return null;
  return (await rpc<StoredReviewContact | null>('review_session_contact', { p_session_id: sessionId })) ?? null;
}

export async function claimNotification(sessionId: string, kind: NotificationKind, actionCount: number | null = null): Promise<boolean> {
  return rpc<boolean>('review_claim_contact_notification', { p_session_id: sessionId, p_kind: kind, p_action_count: actionCount });
}

export async function releaseNotification(sessionId: string, kind: NotificationKind): Promise<void> {
  await rpc<void>('review_release_contact_notification', { p_session_id: sessionId, p_kind: kind });
}

/** lastActivityAt is the respondent's own last activity (answers and corrections); system serve events do not count. */
export type StalledReview = { sessionId: string; organisationLabel: string; fullName: string; email: string; roleTitle: string | null; actionCount: number; answersRecorded: number; startedAt: string; lastActivityAt: string };
export async function stalledReviews(inactiveBefore: Date): Promise<StalledReview[]> {
  if (!contactsAvailable()) return [];
  return (await rpc<StalledReview[]>('review_stalled_contacts', { p_inactive_before: inactiveBefore.toISOString() })) ?? [];
}

/** Records that the respondent finished, once, independently of whether the completion notice is sent. */
export async function markCompleted(sessionId: string): Promise<boolean> {
  return rpc<boolean>('review_mark_session_completed', { p_session_id: sessionId });
}

/**
 * Records a notification after it was processed successfully. For "stalled", activityAt identifies the episode (the
 * respondent's last activity), so the same episode is recorded once and a resumed review starts a new one.
 */
export async function recordNotified(sessionId: string, kind: NotificationKind, activityAt: string | null = null): Promise<boolean> {
  return rpc<boolean>('review_record_contact_notified', { p_session_id: sessionId, p_kind: kind, p_activity_at: activityAt });
}

/** Completed real reviews whose completion notice has not been recorded yet. */
export async function completionsPendingNotification(): Promise<{ sessionId: string; completedAt: string }[]> {
  if (!contactsAvailable()) return [];
  return (await rpc<{ sessionId: string; completedAt: string }[]>('review_completions_pending_notification', {})) ?? [];
}

/** Automatic stalled notices cover episodes that became stalled after this time; earlier ones go through recovery. */
export async function stalledNotificationsFrom(): Promise<Date | null> {
  if (!contactsAvailable()) return null;
  const value = await rpc<string | null>('review_stalled_notifications_from', {});
  return value ? new Date(value) : null;
}

/** First accepted public campaign identity, kept only in the server-side review store. */
export async function recordReviewCampaign(sessionId: string, content: string): Promise<boolean> {
  return rpc<boolean>('review_record_campaign_attribution', { p_session_id: sessionId, p_content: content });
}
