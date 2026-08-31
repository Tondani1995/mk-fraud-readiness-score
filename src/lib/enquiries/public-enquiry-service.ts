/**
 * Persistence for the two enquiry intakes that carry no assessment identity.
 *
 * Both write into `public.data_requests` — the same table the accepted Snapshot Advisory workflow
 * uses — rather than a second enquiry system. `assessment_id`, `organisation_id` and
 * `respondent_id` are all nullable there, so a lead is stored with those left NULL. No placeholder
 * assessment, organisation or respondent row is ever fabricated to satisfy a foreign key: a
 * fabricated assessment would appear in the assessment queue, in counts and in scoring surfaces as
 * though someone had begun an assessment.
 *
 * Writes go through the service-role client only. `data_requests` has RLS enabled and all grants
 * revoked from anon and authenticated (0014_phase13_customer_commercial_conversion.sql), so no
 * browser can reach the table directly and no service-role credential is ever sent to a browser.
 *
 * Nothing here creates an order, a payment obligation, a report or a customer email.
 */

import { randomBytes } from 'node:crypto';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { sanitiseEventMetadata } from '@/lib/analytics/assessment-events';
import { ADVISORY_REQUEST_TYPE, WEBSITE_CONTACT_REQUEST_TYPE, type EnquirySource } from '@/lib/enquiries/taxonomy';
import type { PublicAdvisoryEnquiryInput, WebsiteContactEnquiryInput } from '@/lib/enquiries/validation';

export type PersistedEnquiry = {
  id: string;
  requestReference: string;
  status: string;
  createdAt: string;
};

/** MKENQ-YYYY-XXXXXXXX, matching the CHECK constraint on data_requests.request_reference. */
export function makeEnquiryReference(now: Date = new Date()) {
  return `MKENQ-${now.getUTCFullYear()}-${randomBytes(4).toString('hex').toUpperCase()}`;
}

type Db = any;

function db(dependencies: { db?: Db } = {}): Db {
  return dependencies.db ?? (createSupabaseServiceClient() as any);
}

/**
 * Insert with one retry on a reference collision.
 *
 * `request_reference` is uniquely indexed. Four random bytes collide vanishingly rarely, but a
 * collision must not surface to a prospect as a failed enquiry, so a single fresh reference is
 * tried before the error is allowed to propagate.
 */
async function insertEnquiry(client: Db, payload: Record<string, unknown>): Promise<PersistedEnquiry> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { data, error } = await client
      .from('data_requests')
      .insert({ ...payload, request_reference: makeEnquiryReference() })
      .select('id,request_reference,status,created_at')
      .single();
    if (!error) {
      return {
        id: data.id,
        requestReference: data.request_reference,
        status: data.status,
        createdAt: data.created_at
      };
    }
    const isReferenceCollision = String(error.code) === '23505' && String(error.message ?? '').includes('request_reference');
    if (!isReferenceCollision || attempt === 1) throw error;
  }
  throw new Error('enquiry_reference_allocation_failed');
}

export async function persistPublicAdvisoryEnquiry(
  input: PublicAdvisoryEnquiryInput,
  dependencies: { db?: Db } = {}
): Promise<PersistedEnquiry> {
  return insertEnquiry(db(dependencies), {
    // No assessment, organisation or respondent exists for a pre-assessment prospect.
    assessment_id: null,
    organisation_id: null,
    respondent_id: null,
    request_type: ADVISORY_REQUEST_TYPE,
    status: 'received',
    enquiry_source: 'public_advisory' satisfies EnquirySource,
    requested_by_email: input.email,
    contact_name: input.contactName,
    company_name: input.companyName,
    contact_phone: input.contactPhone,
    primary_reason: input.primaryReason,
    areas_of_focus: input.areasOfFocus,
    preferred_contact_method: input.preferredContactMethod,
    preferred_consultation_timeframe: input.preferredConsultationTimeframe,
    consent_contact: true,
    notes: input.notes,
    updated_at: new Date().toISOString()
  });
}

export async function persistWebsiteContactEnquiry(
  input: WebsiteContactEnquiryInput,
  dependencies: { db?: Db } = {}
): Promise<PersistedEnquiry> {
  return insertEnquiry(db(dependencies), {
    assessment_id: null,
    organisation_id: null,
    respondent_id: null,
    request_type: WEBSITE_CONTACT_REQUEST_TYPE,
    status: 'received',
    enquiry_source: 'website_contact' satisfies EnquirySource,
    requested_by_email: input.email,
    contact_name: input.contactName,
    company_name: input.companyName,
    contact_phone: input.contactPhone,
    service_interest: input.serviceInterest,
    // A general contact enquiry carries none of the Advisory taxonomy. The mk_advisory CHECK
    // constraints are scoped by request_type, so these stay null without conflict.
    primary_reason: null,
    preferred_contact_method: null,
    preferred_consultation_timeframe: null,
    consent_contact: true,
    notes: input.message,
    updated_at: new Date().toISOString()
  });
}

/**
 * Queue exactly one internal MK notification for a persisted enquiry.
 *
 * This is a deliberate sibling of queueInternalNotification rather than a change to it: that
 * function requires an assessment id for its dedupe key and for the assessment event it writes,
 * and a public lead has neither. The row shape, template convention and queued status are the
 * same, so the existing delivery worker treats it identically — no provider or delivery-mode
 * behaviour is altered.
 *
 * The dedupe key is the enquiry reference, which is unique, so a repeated call for the same
 * enquiry can never queue a second email.
 */
export async function queuePublicEnquiryNotification(
  input: {
    notificationType: 'public_advisory_enquiry_submitted' | 'website_contact_enquiry_submitted';
    enquiry: PersistedEnquiry;
    recipientEmail?: string | null;
    metadata: Record<string, unknown>;
  },
  dependencies: { db?: Db } = {}
): Promise<{ ok: boolean; status: 'queued' | 'already_queued' | 'skipped_no_recipient' | 'failed'; emailEventId?: string; error?: string }> {
  const recipient = input.recipientEmail?.trim() || process.env.MK_INTERNAL_LEADS_EMAIL?.trim() || '';
  if (!recipient) return { ok: false, status: 'skipped_no_recipient', error: 'MK_INTERNAL_LEADS_EMAIL is not configured' };

  const client = db(dependencies);
  const dedupeKey = `internal_notification:${input.notificationType}:enquiry:${input.enquiry.requestReference}`;

  try {
    const { data: existing, error: existingError } = await client
      .from('email_events')
      .select('id')
      .eq('dedupe_key', dedupeKey)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) return { ok: true, status: 'already_queued', emailEventId: existing.id };

    const { data: inserted, error: insertError } = await client
      .from('email_events')
      .insert({
        assessment_id: null,
        order_id: null,
        report_id: null,
        data_request_id: input.enquiry.id,
        recipient_email: recipient,
        template_key: `internal_${input.notificationType}`,
        notification_type: input.notificationType,
        dedupe_key: dedupeKey,
        status: 'queued',
        metadata_json: {
          ...sanitiseEventMetadata(input.metadata),
          request_reference: input.enquiry.requestReference,
          order_created: false,
          payment_obligation: false,
          report_generation: false
        }
      })
      .select('id')
      .single();
    if (insertError) throw insertError;
    return { ok: true, status: 'queued', emailEventId: inserted.id };
  } catch (error) {
    // A notification failure must not lose the lead: the enquiry is already persisted and visible
    // in the admin queue, so the caller reports success and this is recorded for operations.
    console.error('public enquiry notification queue failed', {
      requestReference: input.enquiry.requestReference,
      message: error instanceof Error ? error.message : 'unknown_error'
    });
    return { ok: false, status: 'failed', error: error instanceof Error ? error.message : 'unknown_error' };
  }
}

/** Audit evidence for an enquiry created without an authenticated actor. */
export async function recordPublicEnquiryAudit(
  input: {
    enquiry: PersistedEnquiry;
    requestType: string;
    enquirySource: EnquirySource;
    ipHash: string | null;
    notificationStatus: string;
  },
  dependencies: { db?: Db } = {}
) {
  const client = db(dependencies);
  const { error } = await client.from('audit_logs').insert({
    // 'system' rather than a new enum value: audit_actor_type is ('admin','respondent_token',
    // 'system') and is referenced by certified fulfilment SQL, so extending it for a lead form is
    // more blast radius than the distinction is worth. The server is genuinely the actor here --
    // there is no authenticated submitter -- and after_json.enquiry_source records where the
    // enquiry actually came from, which is what an auditor would query on.
    actor_type: 'system',
    assessment_id: null,
    entity_table: 'data_requests',
    entity_id: input.enquiry.id,
    action: 'public_enquiry_created',
    ip_hash: input.ipHash,
    after_json: {
      request_reference: input.enquiry.requestReference,
      request_type: input.requestType,
      enquiry_source: input.enquirySource,
      notification_status: input.notificationStatus,
      order_created: false,
      payment_obligation: false,
      report_generation: false
    }
  });
  if (error) console.error('public enquiry audit insert failed', error);
}
