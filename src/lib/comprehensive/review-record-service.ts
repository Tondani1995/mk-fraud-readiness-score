import { createSupabaseServiceClient } from '@/lib/supabase/server';
import type { AdminRole } from '@/lib/types/domain';
import type { PersistedComprehensiveReviewRecordRow } from '@/lib/reports/comprehensive/persisted-review-adapter';
import { REVIEWER_ELIGIBLE_ROLES } from './engagement-service';
import { buildComprehensiveReviewerInputFromPersisted } from '@/lib/reports/comprehensive/persisted-review-adapter';

const WRITABLE_ROLES: readonly AdminRole[] = ['platform_admin', 'reviewer', 'approver'];

function service() {
  return createSupabaseServiceClient() as any;
}

function unwrap(value: any) {
  return Array.isArray(value) ? value[0] : value;
}

function toRow(row: any): PersistedComprehensiveReviewRecordRow {
  return {
    id: row.id,
    engagementId: row.engagement_id,
    recordType: row.record_type,
    subjectKey: row.subject_key,
    reviewerAdminUserId: row.reviewer_admin_user_id,
    reviewerConclusion: row.reviewer_conclusion,
    reviewerObservation: row.reviewer_observation ?? null,
    evidenceRefs: Array.isArray(row.evidence_refs) ? row.evidence_refs : [],
    decisionOptions: Array.isArray(row.decision_options) ? row.decision_options : [],
    managementAction: row.management_action && typeof row.management_action === 'object' ? row.management_action : {},
    recordVersion: Number(row.record_version),
    updatedAt: row.updated_at
  };
}

export async function listComprehensiveReviewRecords(engagementId: string): Promise<PersistedComprehensiveReviewRecordRow[]> {
  const { data, error } = await service()
    .from('comprehensive_review_records')
    .select('id,engagement_id,record_type,subject_key,reviewer_admin_user_id,reviewer_conclusion,reviewer_observation,evidence_refs,decision_options,management_action,record_version,updated_at')
    .eq('engagement_id', engagementId)
    .order('record_type', { ascending: true })
    .order('subject_key', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []).map(toRow);
}

/** Loads the persisted production boundary; absent mandatory human records fail closed in the adapter. */
export async function loadComprehensiveReviewerInput(engagementId: string) {
  const db = service();
  const { data: engagement, error: engagementError } = await db
    .from('comprehensive_engagements')
    .select('id,reviewer_admin_user_id,reviewer_assigned_at,signed_off_by,signed_off_at,sign_off_statement,signed_off_artifact_version,reviewer:reviewer_admin_user_id(full_name,role)')
    .eq('id', engagementId)
    .maybeSingle();
  if (engagementError || !engagement) throw new Error(engagementError?.message ?? 'Comprehensive engagement not found.');
  const reviewer = unwrap(engagement.reviewer);
  const { data: evidence, error: evidenceError } = await db
    .from('comprehensive_evidence_items')
    .select('id,original_filename,evidence_label,validation_status,reviewer_observation,reviewed_by,reviewed_at')
    .eq('engagement_id', engagementId);
  if (evidenceError) throw new Error(evidenceError.message);
  const records = await listComprehensiveReviewRecords(engagementId);
  return buildComprehensiveReviewerInputFromPersisted({
    engagement: {
      id: engagement.id,
      reviewerAdminUserId: engagement.reviewer_admin_user_id,
      reviewerName: reviewer?.full_name ?? null,
      reviewerRole: reviewer?.role ?? null,
      reviewerReviewDate: engagement.reviewer_assigned_at ?? null,
      signedOffBy: engagement.signed_off_by,
      signedOffAt: engagement.signed_off_at,
      signOffStatement: engagement.sign_off_statement,
      signedOffArtifactVersion: engagement.signed_off_artifact_version ?? null
    },
    evidence: (evidence ?? []).map((row: any) => ({
      id: row.id,
      originalFilename: row.original_filename,
      evidenceLabel: row.evidence_label,
      validationStatus: row.validation_status,
      reviewerObservation: row.reviewer_observation,
      reviewedBy: row.reviewed_by,
      reviewedAt: row.reviewed_at
    })),
    records
  });
}

export type ReviewRecordWrite = {
  recordType: 'finding' | 'risk' | 'control_design' | 'decision' | 'management_action';
  subjectKey: string;
  reviewerConclusion: string;
  reviewerObservation?: string | null;
  evidenceRefs?: string[];
  decisionOptions?: string[];
  managementAction?: Record<string, unknown>;
  expectedVersion?: number | null;
};

export async function upsertComprehensiveReviewRecord(input: {
  engagementId: string;
  actor: { id: string; role: AdminRole };
  write: ReviewRecordWrite;
}) {
  if (!WRITABLE_ROLES.includes(input.actor.role)) return { ok: false as const, reason: 'forbidden', message: 'You are not authorised to record Comprehensive reviewer input.' };
  const db = service();
  const { data: engagement, error: engagementError } = await db
    .from('comprehensive_engagements')
    .select('id,reviewer_admin_user_id')
    .eq('id', input.engagementId)
    .maybeSingle();
  if (engagementError) return { ok: false as const, reason: 'write_failed', message: engagementError.message };
  if (!engagement) return { ok: false as const, reason: 'engagement_not_found', message: 'Comprehensive engagement not found.' };
  if (!engagement.reviewer_admin_user_id) return { ok: false as const, reason: 'reviewer_not_assigned', message: 'Assign a named reviewer before recording human review.' };
  if (engagement.reviewer_admin_user_id !== input.actor.id && !['platform_admin', 'approver'].includes(input.actor.role)) {
    return { ok: false as const, reason: 'forbidden', message: 'Only the named reviewer or an authorised approver may record review input.' };
  }
  const { data: reviewer } = await db.from('admin_profiles').select('id,role,status').eq('id', engagement.reviewer_admin_user_id).maybeSingle();
  if (!reviewer || reviewer.status !== 'active' || !REVIEWER_ELIGIBLE_ROLES.includes(reviewer.role)) {
    return { ok: false as const, reason: 'reviewer_not_eligible', message: 'The named reviewer is no longer eligible.' };
  }

  const { data: existing, error: existingError } = await db
    .from('comprehensive_review_records')
    .select('id,record_version,created_by')
    .eq('engagement_id', input.engagementId)
    .eq('record_type', input.write.recordType)
    .eq('subject_key', input.write.subjectKey.trim())
    .maybeSingle();
  if (existingError) return { ok: false as const, reason: 'write_failed', message: existingError.message };
  const expected = input.write.expectedVersion ?? null;
  if (existing && expected !== null && Number(existing.record_version) !== expected) {
    return { ok: false as const, reason: 'concurrent_modification', message: 'This review record changed. Reload before saving.' };
  }
  if (existing && expected === null) return { ok: false as const, reason: 'concurrency_token_required', message: 'An existing review record requires its current version.' };

  const payload = {
    engagement_id: input.engagementId,
    record_type: input.write.recordType,
    subject_key: input.write.subjectKey.trim(),
    reviewer_admin_user_id: engagement.reviewer_admin_user_id,
    reviewer_conclusion: input.write.reviewerConclusion.trim(),
    reviewer_observation: input.write.reviewerObservation?.trim() || null,
    evidence_refs: input.write.evidenceRefs ?? [],
    decision_options: input.write.decisionOptions ?? [],
    management_action: input.write.managementAction ?? {},
    record_version: existing ? Number(existing.record_version) + 1 : 1,
    created_by: existing ? existing.created_by : input.actor.id,
    updated_by: input.actor.id
  };
  const query = existing
    ? db.from('comprehensive_review_records').update(payload).eq('id', existing.id).eq('record_version', Number(existing.record_version)).select('*').maybeSingle()
    : db.from('comprehensive_review_records').insert(payload).select('*').maybeSingle();
  const { data, error } = await query;
  if (error) return { ok: false as const, reason: error.code === '23505' ? 'concurrent_modification' : 'write_failed', message: error.message };
  if (!data) return { ok: false as const, reason: 'concurrent_modification', message: 'The review record changed while saving. Reload and try again.' };
  return { ok: true as const, record: toRow(data) };
}
