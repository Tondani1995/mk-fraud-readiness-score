import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { trackAssessmentEvent } from '@/lib/analytics/assessment-events';
import {
  queueInternalNotification,
  type InternalNotificationQueueDependencies,
  type QueueInternalNotificationInput,
  type QueueInternalNotificationResult
} from '@/lib/notifications/internal-notifications';
import {
  getEmailProviderMode,
  sendEmail as defaultSendEmail,
  type EmailProviderMode,
  type SendEmailResult
} from '@/lib/notifications/email-provider';
import {
  buildAssessmentCompletedInternalMessage,
  buildAssessmentStalledLeadMessage
} from '@/lib/notifications/message-templates';
import {
  isRecipientPermitted,
  providerIdempotencyKeyFor,
  recipientAllowlist
} from '@/lib/notifications/phase1-order-notifications';

const STALLED_LEAD_SETTING_KEY = 'v12_adaptive_stalled_lead_controls';
const DEFAULT_STALLED_LEAD_INACTIVITY_HOURS = 24;
const MIN_STALLED_LEAD_INACTIVITY_HOURS = 1;
const MAX_STALLED_LEAD_INACTIVITY_HOURS = 168;
const INTERNAL_NOTIFICATION_CLAIM_LEASE_MS = 10 * 60 * 1000;
const INTERNAL_NOTIFICATION_MAX_ATTEMPTS = 5;
const RECOVERABLE_INTERNAL_NOTIFICATION_STATUSES = ['queued', 'recorded_disabled', 'send_failed'];

type InternalAssessmentNotificationDependencies = {
  createClient?: typeof createSupabaseServiceClient;
  /** Shared client seam for provider-free lifecycle tests and queue/dispatch consistency. */
  db?: any;
  sendEmailImpl?: typeof defaultSendEmail;
  providerModeImpl?: typeof getEmailProviderMode;
  now?: () => Date;
  trackAssessmentEventImpl?: typeof trackAssessmentEvent;
};

type InternalNotificationMessage = {
  subject: string;
  text: string;
  html: string;
};

type AssessmentCompletionRow = {
  id: string;
  assessment_reference: string;
  assessment_mode: string | null;
  organisation_id: string;
  primary_respondent_id: string | null;
  status: string;
  submitted_at: string | null;
  locked_at: string | null;
  current_score_run_id: string | null;
  organisations?: { legal_name?: string | null; trading_name?: string | null } | null;
  respondents?: { full_name?: string | null; email?: string | null } | null;
};

function internalRecipient() {
  return process.env.MK_INTERNAL_LEADS_EMAIL?.trim()
    || process.env.MK_INTERNAL_NOTIFICATIONS_EMAIL?.trim()
    || null;
}

function safeProviderError(result: SendEmailResult) {
  return result.ok
    ? null
    : 'The internal MK notification provider request failed.';
}

function internalProviderModeIsPermitted(providerMode: EmailProviderMode, recipient: string) {
  if (!isRecipientPermitted(recipient)) return false;
  // Test mode is an explicitly allowlisted staging action. Do not rely on an unset allowlist
  // being an implicit permission, because the provider abstraction can call a real transport when
  // RESEND_API_KEY is present.
  if (providerMode === 'test') {
    const allowlist = recipientAllowlist();
    return Boolean(allowlist?.includes(recipient.trim().toLowerCase()));
  }
  return true;
}

async function recordDispatchEvent(input: {
  assessmentId: string;
  organisationId?: string | null;
  respondentId?: string | null;
  notificationType: QueueInternalNotificationInput['notificationType'];
  emailEventId: string;
  status: 'sent' | 'recorded_disabled' | 'failed';
  providerMode: EmailProviderMode | 'external';
}, dependencies: InternalAssessmentNotificationDependencies = {}) {
  const eventType = input.status === 'failed' ? 'internal_notification_failed' : 'internal_notification_sent';
  const trackEvent = dependencies.trackAssessmentEventImpl ?? trackAssessmentEvent;
  await trackEvent({
    eventType,
    assessmentId: input.assessmentId,
    organisationId: input.organisationId,
    respondentId: input.respondentId,
    metadata: {
      notification_type: input.notificationType,
      email_event_id: input.emailEventId,
      dispatch_status: input.status,
      provider_mode: input.providerMode
    }
  });
}

/**
 * Dispatches one already-recorded internal email event. The email row is claimed before the
 * provider call, and the event id is the provider idempotency key. This adapter deliberately
 * writes no order_events: both V1.2 completion and stalled-lead alerts are assessment-only.
 */
export async function dispatchInternalAssessmentNotification(input: {
  emailEventId: string;
  assessmentId: string;
  organisationId?: string | null;
  respondentId?: string | null;
  notificationType: QueueInternalNotificationInput['notificationType'];
  message: InternalNotificationMessage;
}, dependencies: InternalAssessmentNotificationDependencies = {}) {
  const db = dependencies.db ?? (dependencies.createClient ?? createSupabaseServiceClient)() as any;
  const now = dependencies.now ?? (() => new Date());
  const providerModeImpl = dependencies.providerModeImpl ?? getEmailProviderMode;
  const providerMode = providerModeImpl();
  const { data: event, error: eventError } = await db
    .from('email_events')
    .select('id,status,retry_count,sent_at,provider_message_id,recipient_email,updated_at')
    .eq('id', input.emailEventId)
    .maybeSingle();

  if (eventError) throw eventError;
  if (!event) return { ok: false as const, status: 'event_not_found' as const };
  if (event.sent_at || event.provider_message_id || event.status === 'sent') {
    return { ok: true as const, status: 'already_sent' as const, emailEventId: event.id };
  }
  if (!event.recipient_email) {
    return { ok: false as const, status: 'recipient_missing' as const, emailEventId: event.id };
  }
  if (providerMode === 'disabled' && event.status === 'recorded_disabled') {
    return { ok: true as const, status: 'provider_disabled' as const, emailEventId: event.id };
  }
  if (!internalProviderModeIsPermitted(providerMode, event.recipient_email)) {
    await db.from('email_events').update({
      status: 'send_failed',
      provider_mode: 'disabled',
      error_message: providerMode === 'test'
        ? 'Test-mode recipient is not on the configured MK allowlist.'
        : 'Internal notification recipient is not allowlisted.',
      updated_at: now().toISOString()
    }).eq('id', event.id).is('sent_at', null).is('provider_message_id', null);
    await recordDispatchEvent({
      assessmentId: input.assessmentId,
      organisationId: input.organisationId,
      respondentId: input.respondentId,
      notificationType: input.notificationType,
      emailEventId: event.id,
      status: 'failed',
      providerMode: 'disabled'
    }, dependencies);
    return { ok: false as const, status: 'recipient_not_permitted' as const, emailEventId: event.id };
  }

  const attempt = Number(event.retry_count ?? 0) + 1;
  if (attempt > INTERNAL_NOTIFICATION_MAX_ATTEMPTS) {
    await db.from('email_events').update({
      status: 'reconciliation_required',
      error_message: 'Internal notification recovery attempt ceiling reached.',
      updated_at: now().toISOString()
    }).eq('id', event.id).is('sent_at', null).is('provider_message_id', null);
    return { ok: false as const, status: 'attempt_ceiling_reached' as const, emailEventId: event.id };
  }

  const leaseCutoff = new Date(now().getTime() - INTERNAL_NOTIFICATION_CLAIM_LEASE_MS).toISOString();
  const staleSending = event.status === 'sending'
    && Boolean(event.updated_at)
    && event.updated_at < leaseCutoff;
  if (event.status === 'sending' && !staleSending) {
    return { ok: true as const, status: 'claim_lease_active' as const, emailEventId: event.id };
  }
  if (!RECOVERABLE_INTERNAL_NOTIFICATION_STATUSES.includes(event.status ?? '') && !staleSending) {
    return { ok: true as const, status: 'not_recoverable' as const, emailEventId: event.id };
  }

  const claimStamp = now().toISOString();
  let claim = db.from('email_events')
    .update({ status: 'sending', retry_count: attempt, updated_at: claimStamp })
    .eq('id', event.id)
    .is('sent_at', null)
    .is('provider_message_id', null)
    .in('status', [...RECOVERABLE_INTERNAL_NOTIFICATION_STATUSES, ...(staleSending ? ['sending'] : [])]);
  if (staleSending) claim = claim.lt('updated_at', leaseCutoff);
  const { data: claimed, error: claimError } = await claim.select('id').maybeSingle();
  if (claimError) throw claimError;
  if (!claimed) return { ok: true as const, status: 'claimed_by_another_attempt' as const, emailEventId: event.id };

  const sendEmail = dependencies.sendEmailImpl ?? defaultSendEmail;
  // Disabled mode records the durable notification state but never even invokes the provider
  // seam. This keeps local/provider-free and staging-disabled runs incapable of reaching a real
  // transport through an injected implementation, while the queued row remains recoverable when
  // MK explicitly enables the provider later.
  const sendResult = providerMode === 'disabled'
    ? { ok: true as const, mode: 'disabled' as const, providerMessageId: null }
    : await sendEmail({
      from: process.env.MK_REPORT_EMAIL_FROM?.trim() || 'MK Fraud Insights <hello@mkfraud.co.za>',
      to: event.recipient_email,
      replyTo: process.env.MK_REPORT_EMAIL_REPLY_TO?.trim() || null,
      subject: input.message.subject,
      text: input.message.text,
      html: input.message.html,
      idempotencyKey: providerIdempotencyKeyFor(event.id)
    });
  const actualProviderMode: EmailProviderMode | 'external' = sendResult.mode === 'disabled' ? 'disabled' : 'external';
  const sentSuccessfully = sendResult.ok && sendResult.mode !== 'disabled';
  const finalStatus = !sendResult.ok ? 'send_failed' : sentSuccessfully ? 'sent' : 'recorded_disabled';
  const { error: settleError } = await db.from('email_events').update({
    status: finalStatus,
    provider_mode: actualProviderMode,
    provider_message_id: sentSuccessfully ? sendResult.providerMessageId : null,
    sent_at: sentSuccessfully ? now().toISOString() : null,
    error_message: safeProviderError(sendResult),
    updated_at: now().toISOString()
  }).eq('id', event.id).eq('status', 'sending');
  if (settleError) throw settleError;

  await recordDispatchEvent({
    assessmentId: input.assessmentId,
    organisationId: input.organisationId,
    respondentId: input.respondentId,
    notificationType: input.notificationType,
    emailEventId: event.id,
    status: sentSuccessfully ? 'sent' : finalStatus === 'recorded_disabled' ? 'recorded_disabled' : 'failed',
    providerMode: actualProviderMode
  }, dependencies);

  return {
    ok: sentSuccessfully || finalStatus === 'recorded_disabled',
    status: finalStatus,
    emailEventId: event.id,
    retryCount: attempt,
    providerMode: actualProviderMode
  } as const;
}

async function queueAndDispatchInternalNotification(input: {
  queue: QueueInternalNotificationInput;
  message: InternalNotificationMessage;
  organisationId?: string | null;
  respondentId?: string | null;
}, dependencies: InternalAssessmentNotificationDependencies = {}) {
  const db = dependencies.db ?? (dependencies.createClient ?? createSupabaseServiceClient)() as any;
  const queueDependencies: InternalNotificationQueueDependencies = {
    db,
    trackAssessmentEventImpl: dependencies.trackAssessmentEventImpl
  };
  const queued = await queueInternalNotification(input.queue, queueDependencies);
  if (!queued.ok || !queued.emailEventId) return queued;
  return dispatchInternalAssessmentNotification({
    emailEventId: queued.emailEventId,
    assessmentId: input.queue.assessmentId,
    organisationId: input.organisationId,
    respondentId: input.respondentId,
    notificationType: input.queue.notificationType,
    message: input.message
  }, { ...dependencies, db });
}

export async function notifyScoredAssessmentCompletion(input: {
  assessmentReference: string;
  scoreRunId: string;
  snapshotAvailable: boolean;
  adminUrl: string;
}, dependencies: InternalAssessmentNotificationDependencies = {}) {
  if (!input.snapshotAvailable) return { ok: false as const, status: 'snapshot_unavailable' as const };

  const db = dependencies.db ?? (dependencies.createClient ?? createSupabaseServiceClient)() as any;
  const { data: assessment, error: assessmentError } = await db
    .from('assessments')
    .select('id,assessment_reference,assessment_mode,organisation_id,primary_respondent_id,status,submitted_at,locked_at,current_score_run_id,organisations(legal_name,trading_name),respondents(full_name,email)')
    .eq('assessment_reference', input.assessmentReference)
    .maybeSingle();
  if (assessmentError) throw assessmentError;
  if (!assessment) return { ok: false as const, status: 'assessment_not_found' as const };

  const typedAssessment = assessment as AssessmentCompletionRow;
  if (!typedAssessment.submitted_at || !typedAssessment.locked_at
    || !['scored', 'snapshot_available', 'report_requested', 'under_review', 'closed'].includes(typedAssessment.status)
    || typedAssessment.current_score_run_id !== input.scoreRunId) {
    return { ok: false as const, status: 'assessment_not_authoritatively_completed' as const };
  }

  const { data: scoreRun, error: scoreError } = await db
    .from('score_runs')
    .select('id,status,locked_at,overall_score,final_maturity')
    .eq('id', input.scoreRunId)
    .eq('assessment_id', typedAssessment.id)
    .maybeSingle();
  if (scoreError) throw scoreError;
  if (!scoreRun || scoreRun.status !== 'completed' || !scoreRun.locked_at) {
    return { ok: false as const, status: 'score_run_not_locked' as const };
  }

  const organisationName = typedAssessment.organisations?.legal_name
    ?? typedAssessment.organisations?.trading_name
    ?? null;
  const respondentName = typedAssessment.respondents?.full_name ?? null;
  const respondentEmail = typedAssessment.respondents?.email ?? null;
  const completedAt = typedAssessment.submitted_at;
  const metadata = {
    assessment_reference: typedAssessment.assessment_reference,
    assessment_mode: typedAssessment.assessment_mode ?? 'legacy_fixed',
    score_run_id: input.scoreRunId,
    completed_at: completedAt,
    overall_score: scoreRun.overall_score === null ? null : Number(scoreRun.overall_score),
    final_maturity: scoreRun.final_maturity,
    snapshot_available: true,
    admin_url: input.adminUrl
  };

  return queueAndDispatchInternalNotification({
    queue: {
      notificationType: 'assessment_completed',
      assessmentId: typedAssessment.id,
      organisationId: typedAssessment.organisation_id,
      respondentId: typedAssessment.primary_respondent_id,
      recipientEmail: internalRecipient(),
      dedupeKey: `assessment_completed_scored:${typedAssessment.id}`,
      metadata
    },
    organisationId: typedAssessment.organisation_id,
    respondentId: typedAssessment.primary_respondent_id,
    message: buildAssessmentCompletedInternalMessage({
      assessmentReference: typedAssessment.assessment_reference,
      organisationName,
      respondentName,
      respondentEmail,
      completedAt,
      overallScore: scoreRun.overall_score === null ? null : Number(scoreRun.overall_score),
      finalMaturity: scoreRun.final_maturity,
      adminUrl: input.adminUrl
    })
  }, dependencies);
}

type StalledLeadControl = {
  enabled: boolean;
  inactivityHours: number;
};

function parseStalledLeadControl(value: unknown): StalledLeadControl {
  if (!value || typeof value !== 'object') return { enabled: true, inactivityHours: DEFAULT_STALLED_LEAD_INACTIVITY_HOURS };
  const raw = value as Record<string, unknown>;
  const configuredHours = Number(raw.inactivity_hours);
  const inactivityHours = Number.isInteger(configuredHours)
    && configuredHours >= MIN_STALLED_LEAD_INACTIVITY_HOURS
    && configuredHours <= MAX_STALLED_LEAD_INACTIVITY_HOURS
    ? configuredHours
    : DEFAULT_STALLED_LEAD_INACTIVITY_HOURS;
  return { enabled: raw.enabled !== false, inactivityHours };
}

function isoTime(value: unknown) {
  if (typeof value !== 'string') return null;
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.getTime()) ? null : timestamp;
}

function latestActivity(values: unknown[], fallback: string) {
  const valid = values.map(isoTime).filter((value): value is Date => Boolean(value));
  const selected = valid.reduce<Date | null>((latest, value) => !latest || value > latest ? value : latest, null);
  return selected ?? isoTime(fallback) ?? new Date(0);
}

function clampProgress(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(100, Math.max(0, Math.round(parsed * 100) / 100));
}

type StalledLeadEmailEvent = {
  id: string;
  status?: string | null;
  retry_count?: number | null;
  sent_at?: string | null;
  provider_message_id?: string | null;
  recipient_email?: string | null;
  updated_at?: string | null;
  dedupe_key?: string | null;
  metadata_json?: Record<string, unknown> | null;
};

type StalledLeadEpisodeResolution = {
  kind: 'provider_bound' | 'recoverable' | 'existing' | 'new';
  event: StalledLeadEmailEvent | null;
  episodeKey: string;
};

const TERMINAL_PROVIDER_SENT_STATUSES = new Set([
  'sent',
  'delivered',
  'provider_accepted',
  'delivered_double',
  'finalized'
]);

function stalledEpisodeKey(assessmentId: string, lastActivityAt: string) {
  return `assessment_stalled:${assessmentId}:last_activity:${lastActivityAt}`;
}

function providerBoundStalledLeadEvent(event: StalledLeadEmailEvent) {
  return Boolean(event.provider_message_id)
    || Boolean(event.sent_at)
    || TERMINAL_PROVIDER_SENT_STATUSES.has(String(event.status ?? '').toLowerCase());
}

function recoverableStalledLeadEvent(event: StalledLeadEmailEvent, currentTime: Date) {
  if (RECOVERABLE_INTERNAL_NOTIFICATION_STATUSES.includes(event.status ?? '')) return true;
  if (event.status !== 'sending') return false;
  const updatedAt = isoTime(event.updated_at);
  if (!updatedAt) return false;
  return updatedAt.getTime() <= currentTime.getTime() - INTERNAL_NOTIFICATION_CLAIM_LEASE_MS;
}

async function resolveExistingStalledLeadEpisode(
  db: any,
  assessmentId: string,
  lastActivityAt: string,
  currentTime: Date
): Promise<StalledLeadEpisodeResolution> {
  const canonicalKey = stalledEpisodeKey(assessmentId, lastActivityAt);
  const { data, error } = await db
    .from('email_events')
    .select('id,status,retry_count,sent_at,provider_message_id,recipient_email,updated_at,dedupe_key,metadata_json')
    .eq('assessment_id', assessmentId)
    .eq('notification_type', 'assessment_stalled_lead')
    .eq('metadata_json->>last_activity_at', lastActivityAt)
    .limit(100);

  if (error) throw error;
  const events = (Array.isArray(data) ? data : data ? [data] : []) as StalledLeadEmailEvent[];
  const providerBound = events.find((event) => providerBoundStalledLeadEvent(event));
  if (providerBound) {
    return {
      kind: 'provider_bound',
      event: providerBound,
      // Historical threshold-bearing keys remain the identity used by the alert upsert.
      episodeKey: providerBound.dedupe_key || canonicalKey
    };
  }

  const recoverable = events.find((event) => recoverableStalledLeadEvent(event, currentTime));
  if (recoverable) {
    return {
      kind: 'recoverable',
      event: recoverable,
      // Reusing a historical row also reuses its existing operational-alert identity.
      episodeKey: recoverable.dedupe_key || canonicalKey
    };
  }

  const existing = events[0];
  if (existing) {
    return {
      kind: 'existing',
      event: existing,
      // An active or otherwise non-recoverable row is still the same activity episode. Never
      // create a threshold-specific replacement while that row remains authoritative.
      episodeKey: existing.dedupe_key || canonicalKey
    };
  }

  return { kind: 'new', event: null, episodeKey: canonicalKey };
}

export function defaultStalledLeadInactivityHours() {
  return DEFAULT_STALLED_LEAD_INACTIVITY_HOURS;
}

export async function monitorAdaptiveStalledLeads(input: {
  adminUrlFor: (assessmentReference: string) => string;
}, dependencies: InternalAssessmentNotificationDependencies = {}) {
  const db = dependencies.db ?? (dependencies.createClient ?? createSupabaseServiceClient)() as any;
  const now = dependencies.now ?? (() => new Date());
  const { data: setting, error: settingError } = await db
    .from('app_settings')
    .select('value_json')
    .eq('setting_key', STALLED_LEAD_SETTING_KEY)
    .maybeSingle();
  if (settingError) console.warn('stalled_lead_control_setting_unavailable', { reason: settingError.message });
  const control = parseStalledLeadControl(setting?.value_json);
  if (!control.enabled) return { ok: true as const, disabled: true, inspected: 0, stalled: 0, notified: 0 };

  const { data: assessments, error: assessmentsError } = await db
    .from('assessments')
    .select('id,assessment_reference,organisation_id,primary_respondent_id,status,assessment_mode,started_at,updated_at,completion_percentage,organisations(legal_name,trading_name),respondents(full_name,email)')
    .eq('status', 'draft')
    .eq('assessment_mode', 'adaptive')
    .limit(500);
  if (assessmentsError) throw assessmentsError;

  const assessmentIds = (assessments ?? []).map((assessment: any) => assessment.id).filter(Boolean);
  const { data: navigationStates, error: navigationError } = assessmentIds.length
    ? await db.from('assessment_navigation_states').select('assessment_id,last_saved_at,updated_at').in('assessment_id', assessmentIds)
    : { data: [], error: null };
  if (navigationError) throw navigationError;
  const navigationByAssessment = new Map<string, { last_saved_at?: string | null; updated_at?: string | null }>(
    (navigationStates ?? []).map((state: any) => [state.assessment_id, state] as const)
  );
  const cutoff = now().getTime() - control.inactivityHours * 60 * 60 * 1000;
  let stalled = 0;
  let notified = 0;

  for (const assessment of assessments ?? []) {
    const navigation = navigationByAssessment.get(assessment.id);
    const activity = latestActivity([
      assessment.started_at,
      assessment.updated_at,
      navigation?.last_saved_at,
      navigation?.updated_at
    ], assessment.started_at);
    if (activity.getTime() > cutoff) continue;
    stalled += 1;
    const organisationName = assessment.organisations?.legal_name ?? assessment.organisations?.trading_name ?? null;
    const respondentName = assessment.respondents?.full_name ?? null;
    const respondentEmail = assessment.respondents?.email ?? null;
    const lastActivityAt = activity.toISOString();
    const episode = await resolveExistingStalledLeadEpisode(db, assessment.id, lastActivityAt, now());
    const adminUrl = input.adminUrlFor(assessment.assessment_reference);
    const message = buildAssessmentStalledLeadMessage({
      assessmentReference: assessment.assessment_reference,
      organisationName,
      respondentName,
      respondentEmail,
      lastActivityAt,
      progressPct: clampProgress(assessment.completion_percentage),
      adminUrl
    });
    const result = episode.kind === 'provider_bound'
      ? { ok: true as const, status: 'already_notified' as const, emailEventId: episode.event!.id }
      : episode.kind === 'recoverable' || episode.kind === 'existing'
        ? await dispatchInternalAssessmentNotification({
          emailEventId: episode.event!.id,
          assessmentId: assessment.id,
          organisationId: assessment.organisation_id,
          respondentId: assessment.primary_respondent_id,
          notificationType: 'assessment_stalled_lead',
          message
        }, { ...dependencies, db })
        : await queueAndDispatchInternalNotification({
          queue: {
            notificationType: 'assessment_stalled_lead',
            assessmentId: assessment.id,
            organisationId: assessment.organisation_id,
            respondentId: assessment.primary_respondent_id,
            recipientEmail: internalRecipient(),
            dedupeKey: episode.episodeKey,
            metadata: {
              assessment_reference: assessment.assessment_reference,
              organisation: organisationName,
              respondent: respondentName,
              respondent_email: respondentEmail,
              last_activity_at: lastActivityAt,
              progress_pct: clampProgress(assessment.completion_percentage),
              inactivity_hours: control.inactivityHours,
              admin_url: adminUrl
            }
          },
          organisationId: assessment.organisation_id,
          respondentId: assessment.primary_respondent_id,
          message
        }, dependencies);
    if (result.ok) notified += 1;

    const emailEventId = result.ok && 'emailEventId' in result ? result.emailEventId : null;
    const { error: alertError } = await db.rpc('record_assessment_stalled_lead_alert', {
      p_alert_key: episode.episodeKey,
      p_assessment_id: assessment.id,
      p_email_event_id: emailEventId,
      p_detail_json: {
        assessment_reference: assessment.assessment_reference,
        organisation: organisationName,
        respondent: respondentName,
        respondent_email: respondentEmail,
        last_activity_at: lastActivityAt,
        progress_pct: clampProgress(assessment.completion_percentage),
        inactivity_hours: control.inactivityHours,
        admin_url: adminUrl,
        email_event_id: emailEventId
      }
    });
    if (alertError) throw alertError;
  }

  return {
    ok: true as const,
    disabled: false,
    inspected: (assessments ?? []).length,
    stalled,
    notified,
    inactivityHours: control.inactivityHours
  };
}
