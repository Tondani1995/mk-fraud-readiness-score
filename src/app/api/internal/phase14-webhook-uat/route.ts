import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { POST as handleResendWebhook } from '@/app/api/webhooks/resend/route';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const EXPECTED_BRANCH = 'phase14/autonomous-premium-report-engine';
const TARGET_REPORT_ID = '66216b58-2e45-44e0-afe8-0d02f808dd7d';
const TARGET_EMAIL_EVENT_ID = 'aadabe2c-edeb-48e0-af1c-a17c47e330c9';

function forbidden() {
  return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
}

function assertPreviewHarnessAllowed() {
  return process.env.VERCEL_ENV === 'preview'
    && process.env.VERCEL_GIT_COMMIT_REF === EXPECTED_BRANCH;
}

function signPayload(input: { id: string; timestamp: string; payload: string; secret: string }) {
  const key = Buffer.from(input.secret.slice('whsec_'.length), 'base64');
  return `v1,${crypto.createHmac('sha256', key).update(`${input.id}.${input.timestamp}.${input.payload}`).digest('base64')}`;
}

async function invokeWebhook(input: {
  type: string;
  eventId: string;
  providerMessageId: string;
  createdAt: string;
  secret: string;
  timestamp?: string;
  signature?: string;
  includeHeaders?: boolean;
  reason?: string;
}) {
  const payload = JSON.stringify({
    type: input.type,
    created_at: input.createdAt,
    data: {
      email_id: input.providerMessageId,
      failed: input.reason ? { reason: input.reason } : undefined,
      bounce: input.reason ? { message: input.reason } : undefined
    }
  });
  const timestamp = input.timestamp ?? String(Math.floor(Date.now() / 1000));
  const signature = input.signature ?? signPayload({ id: input.eventId, timestamp, payload, secret: input.secret });
  const headers = new Headers({ 'content-type': 'application/json' });
  if (input.includeHeaders !== false) {
    headers.set('svix-id', input.eventId);
    headers.set('svix-timestamp', timestamp);
    headers.set('svix-signature', signature);
  }
  const response = await handleResendWebhook(new Request('https://phase14-uat.local/score/api/webhooks/resend', {
    method: 'POST',
    headers,
    body: payload
  }));
  const body = await response.json().catch(() => ({}));
  return { status: response.status, body };
}

async function getEmailEvent(db: any, id: string) {
  const { data, error } = await db
    .from('email_events')
    .select('id,status,recipient_email,provider_message_id,provider_event_id,delivered_at,delivery_updated_at,error_message,metadata_json,report_id')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function providerEventCount(db: any, providerEventId: string) {
  const { count, error } = await db
    .from('email_provider_events')
    .select('id', { count: 'exact', head: true })
    .eq('provider', 'resend')
    .eq('provider_event_id', providerEventId);
  if (error) throw error;
  return count ?? 0;
}

async function cleanupSyntheticFixtures(db: any, runId: string) {
  const { data: syntheticEvents, error: lookupError } = await db
    .from('email_events')
    .select('id')
    .contains('metadata_json', { phase14_webhook_uat_run: runId });
  if (lookupError) throw lookupError;
  const ids = (syntheticEvents ?? []).map((row: { id: string }) => row.id);
  if (!ids.length) return { syntheticEmailEventsDeleted: 0, syntheticProviderEventsDeleted: 0 };

  const { error: providerDeleteError, count: providerCount } = await db
    .from('email_provider_events')
    .delete({ count: 'exact' })
    .in('email_event_id', ids);
  if (providerDeleteError) throw providerDeleteError;

  const { error: eventDeleteError, count: eventCount } = await db
    .from('email_events')
    .delete({ count: 'exact' })
    .in('id', ids);
  if (eventDeleteError) throw eventDeleteError;

  return {
    syntheticEmailEventsDeleted: eventCount ?? 0,
    syntheticProviderEventsDeleted: providerCount ?? 0
  };
}

export async function POST() {
  if (!assertPreviewHarnessAllowed()) return forbidden();

  const secret = process.env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret?.startsWith('whsec_')) {
    return NextResponse.json({ ok: false, error: 'webhook_secret_missing' }, { status: 503 });
  }

  const db = createSupabaseServiceClient() as any;
  const runId = `phase14-webhook-uat-${Date.now()}`;
  const now = new Date();
  const deliveredAt = now.toISOString();
  const olderValidEventAt = new Date(now.getTime() - 120_000).toISOString();
  const staleTimestamp = String(Math.floor((Date.now() - 10 * 60 * 1000) / 1000));

  await cleanupSyntheticFixtures(db, runId);

  const { data: report, error: reportError } = await db
    .from('reports')
    .select('id,report_reference,checksum,storage_bucket,storage_path,status')
    .eq('id', TARGET_REPORT_ID)
    .maybeSingle();
  if (reportError) throw reportError;
  if (!report) return NextResponse.json({ ok: false, error: 'target_report_missing' }, { status: 404 });

  const targetBefore = await getEmailEvent(db, TARGET_EMAIL_EVENT_ID);
  if (!targetBefore?.provider_message_id) {
    return NextResponse.json({ ok: false, error: 'target_provider_message_missing' }, { status: 409 });
  }

  const attachment = await db.storage.from(report.storage_bucket).download(report.storage_path);
  if (attachment.error || !attachment.data) {
    return NextResponse.json({ ok: false, error: 'attachment_download_failed' }, { status: 500 });
  }
  const attachmentBuffer = Buffer.from(await attachment.data.arrayBuffer());
  const attachmentChecksum = crypto.createHash('sha256').update(attachmentBuffer).digest('hex');

  const syntheticRows = [
    {
      recipient_email: 'admin+phase14-bounced-uat@mkfraud.co.za',
      template_key: 'phase14_webhook_uat',
      provider_message_id: `${runId}-bounce-message`,
      status: 'sent',
      notification_type: 'phase14_webhook_uat',
      dedupe_key: `${runId}:bounce`,
      attempt_number: 1,
      metadata_json: { phase14_webhook_uat_run: runId, fixture: 'bounce' }
    },
    {
      recipient_email: 'admin+phase14-complained-uat@mkfraud.co.za',
      template_key: 'phase14_webhook_uat',
      provider_message_id: `${runId}-complaint-message`,
      status: 'sent',
      notification_type: 'phase14_webhook_uat',
      dedupe_key: `${runId}:complaint`,
      attempt_number: 1,
      metadata_json: { phase14_webhook_uat_run: runId, fixture: 'complaint' }
    },
    {
      recipient_email: 'admin+phase14-unrelated-uat@mkfraud.co.za',
      template_key: 'phase14_webhook_uat',
      provider_message_id: `${runId}-unrelated-message`,
      status: 'sent',
      notification_type: 'phase14_webhook_uat',
      dedupe_key: `${runId}:unrelated`,
      attempt_number: 1,
      metadata_json: { phase14_webhook_uat_run: runId, fixture: 'unrelated' }
    }
  ];
  const { data: insertedFixtures, error: fixtureError } = await db
    .from('email_events')
    .insert(syntheticRows)
    .select('id,provider_message_id,recipient_email,metadata_json');
  if (fixtureError) throw fixtureError;

  const byFixture = Object.fromEntries((insertedFixtures ?? []).map((row: any) => [row.metadata_json.fixture, row]));

  const missingSignature = await invokeWebhook({
    type: 'email.delivered',
    eventId: `${runId}-missing-signature`,
    providerMessageId: targetBefore.provider_message_id,
    createdAt: deliveredAt,
    secret,
    includeHeaders: false
  });
  const invalidSignature = await invokeWebhook({
    type: 'email.delivered',
    eventId: `${runId}-invalid-signature`,
    providerMessageId: targetBefore.provider_message_id,
    createdAt: deliveredAt,
    secret,
    signature: 'v1,invalid-signature'
  });
  const staleSignature = await invokeWebhook({
    type: 'email.delivered',
    eventId: `${runId}-stale-signature`,
    providerMessageId: targetBefore.provider_message_id,
    createdAt: deliveredAt,
    secret,
    timestamp: staleTimestamp
  });

  const deliveredEventId = `${runId}-delivered`;
  const delivered = await invokeWebhook({
    type: 'email.delivered',
    eventId: deliveredEventId,
    providerMessageId: targetBefore.provider_message_id,
    createdAt: deliveredAt,
    secret
  });
  const duplicateDelivered = await invokeWebhook({
    type: 'email.delivered',
    eventId: deliveredEventId,
    providerMessageId: targetBefore.provider_message_id,
    createdAt: deliveredAt,
    secret
  });

  const outOfOrderSent = await invokeWebhook({
    type: 'email.sent',
    eventId: `${runId}-older-sent`,
    providerMessageId: targetBefore.provider_message_id,
    createdAt: olderValidEventAt,
    secret
  });

  const unknownMessage = await invokeWebhook({
    type: 'email.delivered',
    eventId: `${runId}-unknown-message`,
    providerMessageId: `${runId}-unknown-provider-message`,
    createdAt: deliveredAt,
    secret
  });

  const bounced = await invokeWebhook({
    type: 'email.bounced',
    eventId: `${runId}-bounced`,
    providerMessageId: byFixture.bounce.provider_message_id,
    createdAt: deliveredAt,
    secret,
    reason: 'phase14_uat_synthetic_bounce'
  });
  const complained = await invokeWebhook({
    type: 'email.complained',
    eventId: `${runId}-complained`,
    providerMessageId: byFixture.complaint.provider_message_id,
    createdAt: deliveredAt,
    secret,
    reason: 'phase14_uat_synthetic_complaint'
  });

  const targetAfter = await getEmailEvent(db, TARGET_EMAIL_EVENT_ID);
  const bouncedAfter = await getEmailEvent(db, byFixture.bounce.id);
  const complainedAfter = await getEmailEvent(db, byFixture.complaint.id);
  const unrelatedAfter = await getEmailEvent(db, byFixture.unrelated.id);
  const deliveredEventCount = await providerEventCount(db, deliveredEventId);

  const cleanup = await cleanupSyntheticFixtures(db, runId);

  return NextResponse.json({
    ok: true,
    runId,
    environment: process.env.VERCEL_ENV,
    branch: process.env.VERCEL_GIT_COMMIT_REF,
    commit: process.env.VERCEL_GIT_COMMIT_SHA,
    report: {
      id: report.id,
      reference: report.report_reference,
      status: report.status,
      checksumMatchesStorage: attachmentChecksum === report.checksum,
      checksumMatchesEmailMetadata: targetAfter?.metadata_json?.attachment_checksum === report.checksum,
      attachmentBytesPositive: attachmentBuffer.length > 0
    },
    targetBefore: {
      status: targetBefore.status,
      recipient: targetBefore.recipient_email,
      hasProviderMessageId: Boolean(targetBefore.provider_message_id)
    },
    cases: {
      missingSignature,
      invalidSignature,
      staleTimestamp: staleSignature,
      delivered,
      duplicateDelivered,
      outOfOrderSent,
      unknownMessage,
      bounced,
      complained
    },
    targetAfter: {
      id: targetAfter?.id,
      status: targetAfter?.status,
      recipient: targetAfter?.recipient_email,
      deliveredAtPresent: Boolean(targetAfter?.delivered_at),
      providerEventId: targetAfter?.provider_event_id,
      lastProviderEventType: targetAfter?.metadata_json?.last_provider_event_type,
      lastProviderEventCreatedAt: targetAfter?.metadata_json?.last_provider_event_created_at
    },
    syntheticAfter: {
      bouncedStatus: bouncedAfter?.status,
      bouncedError: bouncedAfter?.error_message,
      complainedStatus: complainedAfter?.status,
      complainedError: complainedAfter?.error_message,
      unrelatedStatus: unrelatedAfter?.status,
      unrelatedRecipient: unrelatedAfter?.recipient_email
    },
    providerEventDedupe: {
      deliveredEventIdCount: deliveredEventCount
    },
    cleanup
  }, { headers: { 'Cache-Control': 'no-store' } });
}
