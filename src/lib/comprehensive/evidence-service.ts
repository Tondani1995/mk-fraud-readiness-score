import { randomUUID } from 'node:crypto';
import { trackAssessmentEvent } from '@/lib/analytics/assessment-events';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import {
  COMPREHENSIVE_EVIDENCE_BUCKET,
  EVIDENCE_RETENTION_POLICY_KEY,
  evaluateEvidenceUpload,
  evidenceStoragePath,
  isEvidenceDecided,
  isEvidenceValidationStatus,
  type EvidenceValidationStatus
} from '@/lib/commercial/evidence-policy';
import type { AdminRole } from '@/lib/types/domain';

/**
 * Comprehensive client-evidence intake and reviewer validation.
 *
 * ACCESS MODEL
 *   * Upload is authorised by the assessment's snapshot token, which the caller must already have
 *     validated. The engagement is then looked up FROM the assessment, never from a client-supplied
 *     engagement id, so a caller holding one assessment's token cannot attach evidence to another
 *     engagement.
 *   * Objects are written to a private bucket under a server-derived path. No public URL is ever
 *     produced, and no signed URL is minted here.
 *   * Reads are reviewer-role administrators only, and always scoped by engagement.
 */

function service() {
  return createSupabaseServiceClient() as any;
}

export const EVIDENCE_REVIEW_ROLES: readonly AdminRole[] = ['platform_admin', 'reviewer', 'approver'];

export function canReviewComprehensiveEvidence(role: AdminRole) {
  return EVIDENCE_REVIEW_ROLES.includes(role);
}

export type EvidenceFailureReason =
  | 'engagement_not_found'
  | 'engagement_not_accepting_evidence'
  | 'forbidden'
  | 'rejected_by_policy'
  | 'storage_upload_failed'
  | 'evidence_not_found'
  | 'evidence_engagement_mismatch'
  | 'invalid_validation_status'
  | 'observation_required'
  | 'write_failed';

export type EvidenceFailure = { ok: false; reason: EvidenceFailureReason; message: string };

export type EvidenceItem = {
  id: string;
  engagementId: string;
  orderReference: string;
  originalFilename: string;
  evidenceLabel: string | null;
  contentType: string;
  sizeBytes: number;
  uploadedAt: string;
  submittedByEmail: string | null;
  validationStatus: EvidenceValidationStatus;
  reviewerObservation: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  retentionPolicyKey: string;
  /** Always true. Present so a caller can assert it rather than assume it. */
  privateStorage: true;
};

const EVIDENCE_SELECT =
  'id,engagement_id,order_id,assessment_id,original_filename,evidence_label,content_type,size_bytes,'
  + 'uploaded_at,submitted_by_email,validation_status,reviewer_observation,reviewed_by,reviewed_at,'
  + 'retention_policy_key,orders:order_id(order_reference)';

function toItem(row: any): EvidenceItem {
  const order = Array.isArray(row.orders) ? row.orders[0] : row.orders;
  return {
    id: row.id,
    engagementId: row.engagement_id,
    orderReference: order?.order_reference ?? '',
    originalFilename: row.original_filename,
    evidenceLabel: row.evidence_label ?? null,
    contentType: row.content_type,
    sizeBytes: Number(row.size_bytes),
    uploadedAt: row.uploaded_at,
    submittedByEmail: row.submitted_by_email ?? null,
    validationStatus: row.validation_status,
    reviewerObservation: row.reviewer_observation ?? null,
    reviewedBy: row.reviewed_by ?? null,
    reviewedAt: row.reviewed_at ?? null,
    retentionPolicyKey: row.retention_policy_key,
    privateStorage: true
  };
}

function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, maxLength);
  return cleaned || null;
}

/** States in which a customer may still add evidence. */
const EVIDENCE_ACCEPTING_STATES = ['payment_received', 'evidence_requested', 'evidence_received', 'in_review'];

export async function submitComprehensiveEvidence(input: {
  /** Already token-validated by the caller. */
  assessment: { id: string; assessment_reference: string; organisation_id: string | null; primary_respondent_id: string | null };
  respondent?: { id: string; email: string | null } | null;
  filename: unknown;
  contentType: unknown;
  sizeBytes: unknown;
  evidenceLabel?: unknown;
  fileBody: ArrayBuffer | Uint8Array;
}): Promise<{ ok: true; evidence: EvidenceItem } | EvidenceFailure> {
  const acceptance = evaluateEvidenceUpload({
    filename: input.filename,
    contentType: input.contentType,
    sizeBytes: input.sizeBytes
  });
  if (!acceptance.accepted) {
    return { ok: false, reason: 'rejected_by_policy', message: acceptance.message };
  }

  const db = service();

  // The engagement is resolved FROM the token-validated assessment. Nothing the caller sends can
  // redirect this to a different engagement.
  const { data: engagement } = await db
    .from('comprehensive_engagements')
    .select('id,order_id,assessment_id,organisation_id,state,orders:order_id(order_reference)')
    .eq('assessment_id', input.assessment.id)
    .neq('state', 'cancelled')
    .maybeSingle();

  if (!engagement) {
    return {
      ok: false,
      reason: 'engagement_not_found',
      message: 'This assessment has no active Comprehensive engagement.'
    };
  }

  if (!EVIDENCE_ACCEPTING_STATES.includes(engagement.state)) {
    return {
      ok: false,
      reason: 'engagement_not_accepting_evidence',
      message: `A Comprehensive engagement in "${engagement.state}" is not accepting evidence.`
    };
  }

  const evidenceId = randomUUID();
  const organisationId = engagement.organisation_id ?? input.assessment.organisation_id;
  const order = Array.isArray(engagement.orders) ? engagement.orders[0] : engagement.orders;
  const storagePath = evidenceStoragePath({
    organisationId: String(organisationId ?? input.assessment.id),
    orderReference: order?.order_reference ?? 'MKORD',
    evidenceId,
    filename: acceptance.filename
  });

  const body = input.fileBody instanceof Uint8Array ? input.fileBody : new Uint8Array(input.fileBody);
  const { error: uploadError } = await db.storage
    .from(COMPREHENSIVE_EVIDENCE_BUCKET)
    .upload(storagePath, body, { contentType: acceptance.contentType, upsert: false });

  if (uploadError) {
    return { ok: false, reason: 'storage_upload_failed', message: 'The evidence file could not be stored.' };
  }

  const { data: inserted, error: insertError } = await db
    .from('comprehensive_evidence_items')
    .insert({
      id: evidenceId,
      engagement_id: engagement.id,
      order_id: engagement.order_id,
      assessment_id: engagement.assessment_id,
      organisation_id: organisationId,
      storage_bucket: COMPREHENSIVE_EVIDENCE_BUCKET,
      storage_path: storagePath,
      original_filename: acceptance.filename,
      content_type: acceptance.contentType,
      size_bytes: acceptance.sizeBytes,
      submitted_by_respondent_id: input.assessment.primary_respondent_id,
      submitted_by_email: input.respondent?.email ?? null,
      submitter_context_json: {
        assessment_reference: input.assessment.assessment_reference,
        source: 'comprehensive_evidence_intake'
      },
      evidence_label: cleanText(input.evidenceLabel, 200),
      validation_status: 'received',
      retention_policy_key: EVIDENCE_RETENTION_POLICY_KEY
    })
    .select(EVIDENCE_SELECT)
    .single();

  if (insertError) {
    return { ok: false, reason: 'write_failed', message: insertError.message };
  }

  await db.from('comprehensive_evidence_events').insert({
    evidence_item_id: inserted.id,
    engagement_id: engagement.id,
    event_type: 'evidence_uploaded',
    new_status: 'received',
    actor_type: 'respondent_token',
    metadata_json: {
      assessment_reference: input.assessment.assessment_reference,
      content_type: acceptance.contentType,
      size_bytes: acceptance.sizeBytes
    }
  });

  await db.from('audit_logs').insert({
    actor_type: 'respondent_token',
    assessment_id: engagement.assessment_id,
    entity_table: 'comprehensive_evidence_items',
    entity_id: inserted.id,
    action: 'comprehensive_evidence_submitted',
    after_json: {
      engagement_id: engagement.id,
      content_type: acceptance.contentType,
      size_bytes: acceptance.sizeBytes,
      public_object: false
    }
  });

  await trackAssessmentEvent({
    eventType: 'comprehensive_evidence_submitted',
    assessmentId: engagement.assessment_id,
    organisationId: organisationId ?? null,
    respondentId: input.assessment.primary_respondent_id,
    orderId: engagement.order_id,
    optionCode: 'comprehensive',
    metadata: { evidence_item_id: inserted.id, content_type: acceptance.contentType }
  });

  return { ok: true, evidence: toItem(inserted) };
}

export async function listEngagementEvidence(input: {
  engagementId: string;
  actorRole: AdminRole;
}): Promise<{ ok: true; evidence: EvidenceItem[] } | EvidenceFailure> {
  if (!canReviewComprehensiveEvidence(input.actorRole)) {
    return { ok: false, reason: 'forbidden', message: 'You are not authorised to read Comprehensive evidence.' };
  }

  const db = service();
  const { data, error } = await db
    .from('comprehensive_evidence_items')
    .select(EVIDENCE_SELECT)
    .eq('engagement_id', input.engagementId)
    .order('uploaded_at', { ascending: false });

  if (error) return { ok: false, reason: 'write_failed', message: error.message };
  return { ok: true, evidence: (data ?? []).map(toItem) };
}

export async function recordEvidenceValidation(input: {
  engagementId: string;
  evidenceItemId: string;
  validationStatus: unknown;
  observation?: unknown;
  actor: { id: string; role: AdminRole };
}): Promise<{ ok: true; evidence: EvidenceItem } | EvidenceFailure> {
  if (!canReviewComprehensiveEvidence(input.actor.role)) {
    return { ok: false, reason: 'forbidden', message: 'You are not authorised to review Comprehensive evidence.' };
  }
  if (!isEvidenceValidationStatus(input.validationStatus)) {
    return { ok: false, reason: 'invalid_validation_status', message: 'Unknown evidence validation status.' };
  }
  const validationStatus = input.validationStatus;
  const observation = cleanText(input.observation, 2_000);

  // A negative or inconclusive finding must say why. Supplying evidence never on its own validates
  // a control, so "not_supported" and "insufficient" always carry a reviewer's reasoning.
  if ((validationStatus === 'not_supported' || validationStatus === 'insufficient') && !observation) {
    return {
      ok: false,
      reason: 'observation_required',
      message: 'A reviewer observation is required when evidence is recorded as not supported or insufficient.'
    };
  }

  const db = service();
  const { data: existing } = await db
    .from('comprehensive_evidence_items')
    .select('id,engagement_id,validation_status,reviewer_observation')
    .eq('id', input.evidenceItemId)
    .maybeSingle();

  if (!existing) {
    return { ok: false, reason: 'evidence_not_found', message: 'That evidence item does not exist.' };
  }
  // Cross-order access guard: the item must belong to the engagement the caller named.
  if (existing.engagement_id !== input.engagementId) {
    return {
      ok: false,
      reason: 'evidence_engagement_mismatch',
      message: 'That evidence item does not belong to this engagement.'
    };
  }

  const decided = isEvidenceDecided(validationStatus);
  const reviewedAt = new Date().toISOString();

  const { data: updated, error } = await db
    .from('comprehensive_evidence_items')
    .update({
      validation_status: validationStatus,
      reviewer_observation: observation ?? existing.reviewer_observation,
      reviewed_by: decided ? input.actor.id : null,
      reviewed_at: decided ? reviewedAt : null
    })
    .eq('id', existing.id)
    .eq('engagement_id', input.engagementId)
    .select(EVIDENCE_SELECT)
    .maybeSingle();

  if (error) return { ok: false, reason: 'write_failed', message: error.message };
  if (!updated) {
    return { ok: false, reason: 'write_failed', message: 'The evidence validation could not be recorded.' };
  }

  const events: any[] = [{
    evidence_item_id: existing.id,
    engagement_id: input.engagementId,
    event_type: 'validation_status_changed',
    previous_status: existing.validation_status,
    new_status: validationStatus,
    actor_type: 'admin',
    actor_admin_user_id: input.actor.id,
    metadata_json: { actor_role: input.actor.role }
  }];

  if (observation && observation !== existing.reviewer_observation) {
    events.push({
      evidence_item_id: existing.id,
      engagement_id: input.engagementId,
      event_type: 'reviewer_observation_recorded',
      previous_status: existing.validation_status,
      new_status: validationStatus,
      actor_type: 'admin',
      actor_admin_user_id: input.actor.id,
      observation,
      metadata_json: { actor_role: input.actor.role, replaced_previous_observation: Boolean(existing.reviewer_observation) }
    });
  }

  await db.from('comprehensive_evidence_events').insert(events);

  await db.from('comprehensive_engagement_events').insert({
    engagement_id: input.engagementId,
    event_type: 'evidence_validation_recorded',
    actor_type: 'admin',
    actor_admin_user_id: input.actor.id,
    metadata_json: {
      evidence_item_id: existing.id,
      previous_status: existing.validation_status,
      new_status: validationStatus
    }
  });

  return { ok: true, evidence: toItem(updated) };
}
