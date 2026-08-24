/**
 * LEGACY / ADVISORY-ONLY boundary. This reviewed-engagement service is retained for historical
 * Advisory/database compatibility. Active self-service Comprehensive order, fulfilment, status,
 * release and customer access must not import it.
 */
import { trackAssessmentEvent } from '@/lib/analytics/assessment-events';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { evaluatePaymentVerificationEvidence, isValidPaymentSourceEvent } from '@/lib/payments/payment-verification';
import { EVIDENCE_DECIDED_STATUSES } from '@/lib/commercial/evidence-policy';
import {
  evaluateTransition,
  isComprehensiveEngagementState,
  type ComprehensiveEngagementState
} from '@/lib/commercial/comprehensive-lifecycle';
import type { AdminRole } from '@/lib/types/domain';

/**
 * Comprehensive engagement operations: named-reviewer assignment, auditable state transitions and
 * reviewer sign-off.
 *
 * Concurrency: every transition writes with an (id, state, state_version) predicate. Two
 * administrators acting at once cannot both succeed - the loser matches zero rows and is told the
 * engagement moved, rather than overwriting a decision it never saw.
 */

function service() {
  return createSupabaseServiceClient() as any;
}

/** Who may move an engagement INTO a given state. Payment is a finance concern, review is not. */
const TRANSITION_ROLES: Readonly<Record<ComprehensiveEngagementState, readonly AdminRole[]>> = Object.freeze({
  awaiting_payment: [],
  payment_received: ['platform_admin', 'finance_admin'],
  evidence_requested: ['platform_admin', 'reviewer', 'approver'],
  evidence_received: ['platform_admin', 'reviewer', 'approver'],
  in_review: ['platform_admin', 'reviewer', 'approver'],
  review_complete: ['platform_admin', 'reviewer', 'approver'],
  delivered: ['platform_admin', 'approver'],
  cancelled: ['platform_admin', 'finance_admin']
});

export const REVIEWER_ASSIGNMENT_ROLES: readonly AdminRole[] = ['platform_admin', 'approver'];
export const REVIEWER_ELIGIBLE_ROLES: readonly AdminRole[] = ['platform_admin', 'reviewer', 'approver'];
export const ENGAGEMENT_READ_ROLES: readonly AdminRole[] = [
  'platform_admin',
  'reviewer',
  'approver',
  'finance_admin',
  'read_only_admin'
];

export function canAssignComprehensiveReviewer(role: AdminRole) {
  return REVIEWER_ASSIGNMENT_ROLES.includes(role);
}

export function canReadComprehensiveEngagement(role: AdminRole) {
  return ENGAGEMENT_READ_ROLES.includes(role);
}

export function canTransitionInto(role: AdminRole, state: ComprehensiveEngagementState) {
  return TRANSITION_ROLES[state].includes(role);
}

export type EngagementFailureReason =
  | 'engagement_not_found'
  | 'forbidden'
  | 'reviewer_not_found'
  | 'reviewer_not_eligible'
  | 'invalid_state'
  | 'transition_rejected'
  | 'concurrent_modification'
  | 'sign_off_statement_required'
  | 'write_failed';

export type EngagementFailure = { ok: false; reason: EngagementFailureReason; message: string };

export type EngagementRecord = {
  id: string;
  orderId: string;
  orderReference: string;
  assessmentId: string;
  assessmentReference: string | null;
  organisationId: string | null;
  state: ComprehensiveEngagementState;
  stateVersion: number;
  stateChangedAt: string;
  reviewerAdminUserId: string | null;
  reviewerName: string | null;
  reviewerEmail: string | null;
  reviewerAssignedAt: string | null;
  signedOffBy: string | null;
  signedOffAt: string | null;
  signOffStatement: string | null;
  signedOffArtifactVersion: number | null;
  deliveredAt: string | null;
  evidenceCount: number;
  unreviewedEvidenceCount: number;
};

const ENGAGEMENT_SELECT =
  'id,order_id,assessment_id,organisation_id,state,state_version,state_changed_at,'
  + 'reviewer_admin_user_id,reviewer_assigned_at,signed_off_by,signed_off_at,sign_off_statement,delivered_at,'
  + 'signed_off_artifact_version,'
  + 'orders:order_id(order_reference,status,amount_cents,currency,verified_at,verified_by),'
  + 'assessments:assessment_id(assessment_reference),'
  + 'reviewer:reviewer_admin_user_id(full_name,email)';

function unwrap(value: any) {
  return Array.isArray(value) ? value[0] : value;
}

async function countEvidence(db: any, engagementId: string) {
  const { data } = await db
    .from('comprehensive_evidence_items')
    .select('id,validation_status')
    .eq('engagement_id', engagementId);

  const rows = data ?? [];
  const unreviewed = rows.filter(
    (row: any) => !(EVIDENCE_DECIDED_STATUSES as readonly string[]).includes(row.validation_status)
  ).length;
  return { evidenceCount: rows.length, unreviewedEvidenceCount: unreviewed };
}

function toRecord(row: any, counts: { evidenceCount: number; unreviewedEvidenceCount: number }): EngagementRecord {
  const order = unwrap(row.orders);
  const assessment = unwrap(row.assessments);
  const reviewer = unwrap(row.reviewer);
  return {
    id: row.id,
    orderId: row.order_id,
    orderReference: order?.order_reference ?? '',
    assessmentId: row.assessment_id,
    assessmentReference: assessment?.assessment_reference ?? null,
    organisationId: row.organisation_id ?? null,
    state: row.state,
    stateVersion: row.state_version,
    stateChangedAt: row.state_changed_at,
    reviewerAdminUserId: row.reviewer_admin_user_id ?? null,
    reviewerName: reviewer?.full_name ?? null,
    reviewerEmail: reviewer?.email ?? null,
    reviewerAssignedAt: row.reviewer_assigned_at ?? null,
    signedOffBy: row.signed_off_by ?? null,
    signedOffAt: row.signed_off_at ?? null,
    signOffStatement: row.sign_off_statement ?? null,
    signedOffArtifactVersion: row.signed_off_artifact_version ?? null,
    deliveredAt: row.delivered_at ?? null,
    ...counts
  };
}

export async function getEngagementByOrderReference(
  orderReference: string
): Promise<EngagementRecord | null> {
  const db = service();
  const { data: order } = await db
    .from('orders')
    .select('id')
    .eq('order_reference', orderReference)
    .maybeSingle();
  if (!order) return null;

  const { data: row } = await db
    .from('comprehensive_engagements')
    .select(ENGAGEMENT_SELECT)
    .eq('order_id', order.id)
    .maybeSingle();
  if (!row) return null;

  return toRecord(row, await countEvidence(db, row.id));
}

/**
 * Whether the engagement's order carries valid payment-verification evidence.
 *
 * This deliberately reuses the existing G29 payment contract (evaluatePaymentVerificationEvidence)
 * and reads the same rows, with the same filters, that assemble-report-data.ts uses for Essential.
 * Comprehensive must not get a second, weaker definition of "paid".
 */
async function isOrderPaymentVerified(db: any, orderId: string): Promise<boolean> {
  const { data: order } = await db
    .from('orders')
    .select('id,status,amount_cents,currency,verified_at,verified_by')
    .eq('id', orderId)
    .maybeSingle();
  if (!order) return false;

  const { data: paymentRows, error: paymentError } = await db
    .from('payment_transition_events')
    .select('id,new_state,source,actor_reference,provider_transaction_reference,provider_event_reference,provider_event_at,verification_result,processing_result,amount_cents,currency')
    .eq('order_id', orderId)
    .eq('new_state', 'PAID')
    .eq('processing_result', 'applied')
    .order('created_at', { ascending: false });

  if (paymentError || !paymentRows?.length) return false;

  const actorIds = [...new Set(
    paymentRows
      .filter((row: any) => row.source === 'manual_admin' && /^[0-9a-f-]{36}$/i.test(row.actor_reference ?? ''))
      .map((row: any) => row.actor_reference)
  )];

  const { data: verifierRows } = actorIds.length
    ? await db.from('admin_profiles').select('id,status,role').in('id', actorIds)
    : { data: [] as any[] };
  const verifiers = new Map<string, { status: string | null; role: string | null }>(
    (verifierRows ?? []).map((row: any) => [String(row.id).toLowerCase(), { status: row.status ?? null, role: row.role ?? null }])
  );

  const evidenceFor = (row: any) => {
    const verifier = verifiers.get(String(row.actor_reference ?? '').toLowerCase());
    return {
      paymentState: row.new_state ?? null,
      confirmationSource: row.source ?? null,
      actorReference: row.actor_reference ?? null,
      providerTransactionReference: row.provider_transaction_reference ?? null,
      providerEventReference: row.provider_event_reference ?? null,
      providerEventAt: row.provider_event_at ?? null,
      verificationResult: row.verification_result ?? null,
      processingResult: row.processing_result ?? null,
      paymentEventId: row.id ?? null,
      amountCents: row.amount_cents ?? null,
      orderAmountCents: order.amount_cents ?? null,
      currency: row.currency ?? null,
      orderCurrency: order.currency ?? null,
      orderVerifiedAt: order.verified_at ?? null,
      orderVerifiedBy: order.verified_by ?? null,
      manualVerifierStatus: verifier?.status ?? null,
      manualVerifierRole: verifier?.role ?? null,
      priorValidSourceEvent: false,
      transitionCount: paymentRows.length
    };
  };

  const evidence = paymentRows.map(evidenceFor);
  const priorValidSourceEvent = evidence.some((item: any) => isValidPaymentSourceEvent({ ...item, transitionCount: 1 }));

  return evidence.some((item: any) => evaluatePaymentVerificationEvidence({ ...item, priorValidSourceEvent }).valid);
}

export async function assignComprehensiveReviewer(input: {
  orderReference: string;
  reviewerAdminUserId: string;
  actor: { id: string; role: AdminRole };
  note?: string | null;
}): Promise<{ ok: true; engagement: EngagementRecord; reassigned: boolean } | EngagementFailure> {
  if (!canAssignComprehensiveReviewer(input.actor.role)) {
    return { ok: false, reason: 'forbidden', message: 'You are not authorised to assign a Comprehensive reviewer.' };
  }

  const db = service();
  const engagement = await getEngagementByOrderReference(input.orderReference);
  if (!engagement) {
    return { ok: false, reason: 'engagement_not_found', message: 'No Comprehensive engagement exists for that order.' };
  }

  const { data: reviewer } = await db
    .from('admin_profiles')
    .select('id,full_name,email,role,status')
    .eq('id', input.reviewerAdminUserId)
    .maybeSingle();

  if (!reviewer || reviewer.status !== 'active') {
    return { ok: false, reason: 'reviewer_not_found', message: 'The nominated reviewer is not an active administrator.' };
  }
  if (!REVIEWER_ELIGIBLE_ROLES.includes(reviewer.role)) {
    return {
      ok: false,
      reason: 'reviewer_not_eligible',
      message: `Role "${reviewer.role}" cannot be named as the reviewer of a Comprehensive engagement.`
    };
  }

  const reassigned = Boolean(engagement.reviewerAdminUserId) && engagement.reviewerAdminUserId !== reviewer.id;
  const assignedAt = new Date().toISOString();

  const { data: updated, error } = await db
    .from('comprehensive_engagements')
    .update({
      reviewer_admin_user_id: reviewer.id,
      reviewer_assigned_at: assignedAt,
      reviewer_assigned_by: input.actor.id
    })
    .eq('id', engagement.id)
    .eq('state_version', engagement.stateVersion)
    .select('id')
    .maybeSingle();

  if (error) return { ok: false, reason: 'write_failed', message: error.message };
  if (!updated) {
    return {
      ok: false,
      reason: 'concurrent_modification',
      message: 'The engagement changed while the reviewer assignment was being recorded. Reload and try again.'
    };
  }

  await db.from('comprehensive_engagement_events').insert({
    engagement_id: engagement.id,
    event_type: reassigned ? 'reviewer_reassigned' : 'reviewer_assigned',
    previous_state: engagement.state,
    new_state: engagement.state,
    actor_type: 'admin',
    actor_admin_user_id: input.actor.id,
    note: input.note?.trim() || null,
    metadata_json: {
      reviewer_admin_user_id: reviewer.id,
      reviewer_email: reviewer.email,
      previous_reviewer_admin_user_id: engagement.reviewerAdminUserId,
      order_reference: engagement.orderReference
    }
  });

  await db.from('audit_logs').insert({
    actor_type: 'admin',
    actor_user_id: input.actor.id,
    assessment_id: engagement.assessmentId,
    entity_table: 'comprehensive_engagements',
    entity_id: engagement.id,
    action: reassigned ? 'comprehensive_reviewer_reassigned' : 'comprehensive_reviewer_assigned',
    before_json: { reviewer_admin_user_id: engagement.reviewerAdminUserId },
    after_json: { reviewer_admin_user_id: reviewer.id, order_reference: engagement.orderReference }
  });

  const refreshed = await getEngagementByOrderReference(input.orderReference);
  return { ok: true, engagement: refreshed ?? engagement, reassigned };
}

export async function transitionComprehensiveEngagement(input: {
  orderReference: string;
  nextState: unknown;
  note?: string | null;
  signOffStatement?: string | null;
  actor: { id: string; role: AdminRole };
  /** Optimistic-concurrency guard supplied by the caller when it has already read the engagement. */
  expectedStateVersion?: number | null;
}): Promise<{ ok: true; engagement: EngagementRecord } | EngagementFailure> {
  if (!isComprehensiveEngagementState(input.nextState)) {
    return { ok: false, reason: 'invalid_state', message: 'Unknown Comprehensive engagement state.' };
  }
  const nextState = input.nextState;

  if (!canTransitionInto(input.actor.role, nextState)) {
    return {
      ok: false,
      reason: 'forbidden',
      message: `Role "${input.actor.role}" cannot move a Comprehensive engagement to "${nextState}".`
    };
  }

  const db = service();
  const engagement = await getEngagementByOrderReference(input.orderReference);
  if (!engagement) {
    return { ok: false, reason: 'engagement_not_found', message: 'No Comprehensive engagement exists for that order.' };
  }

  if (
    typeof input.expectedStateVersion === 'number'
    && input.expectedStateVersion !== engagement.stateVersion
  ) {
    return {
      ok: false,
      reason: 'concurrent_modification',
      message: 'The engagement has already moved since it was read.'
    };
  }

  const paymentVerified = nextState === 'payment_received'
    ? await isOrderPaymentVerified(db, engagement.orderId)
    : true;

  const evaluation = evaluateTransition(engagement.state, nextState, {
    paymentVerified,
    reviewerAssigned: Boolean(engagement.reviewerAdminUserId),
    unreviewedEvidenceCount: engagement.unreviewedEvidenceCount,
    note: input.note ?? null
  });

  if (!evaluation.allowed) {
    return { ok: false, reason: 'transition_rejected', message: evaluation.message };
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { state: nextState };

  if (nextState === 'review_complete') {
    const statement = input.signOffStatement?.trim();
    if (!statement) {
      return {
        ok: false,
        reason: 'sign_off_statement_required',
        message: 'A reviewer sign-off statement is required to complete a Comprehensive review.'
      };
    }
    patch.signed_off_by = input.actor.id;
    patch.signed_off_at = now;
    patch.sign_off_statement = statement;
    const { data: releaseRows, error: releaseError } = await db
      .from('report_artifacts')
      .select('artifact_version,engagement_id,storage_status,release_state')
      .eq('engagement_id', engagement.id)
      .eq('storage_status', 'VERIFIED')
      .in('release_state', ['verified', 'released']);
    if (releaseError) return { ok: false, reason: 'write_failed', message: releaseError.message };
    const versions = [...new Set((releaseRows ?? []).map((row: any) => Number(row.artifact_version)).filter((version: number) => Number.isInteger(version) && version > 0))];
    if (versions.length !== 1) {
      return {
        ok: false,
        reason: 'transition_rejected',
        message: 'All Comprehensive deliverables must be present as one verified artifact version before sign-off.'
      };
    }
    patch.signed_off_artifact_version = versions[0];
  }

  if (nextState === 'in_review' && engagement.state === 'review_complete') {
    // Withdrawing sign-off is the only legal way to clear these, and the database trigger enforces
    // that it can only happen on exactly this transition.
    patch.signed_off_by = null;
    patch.signed_off_at = null;
    patch.sign_off_statement = null;
    patch.signed_off_artifact_version = null;
  }

  if (nextState === 'delivered') patch.delivered_at = now;

  const { data: updated, error } = await db
    .from('comprehensive_engagements')
    .update(patch)
    .eq('id', engagement.id)
    .eq('state', engagement.state)
    .eq('state_version', engagement.stateVersion)
    .select('id,state,state_version')
    .maybeSingle();

  if (error) return { ok: false, reason: 'write_failed', message: error.message };
  if (!updated) {
    return {
      ok: false,
      reason: 'concurrent_modification',
      message: 'Another administrator changed this engagement first. Reload and try again.'
    };
  }

  const events: any[] = [{
    engagement_id: engagement.id,
    event_type: 'state_changed',
    previous_state: engagement.state,
    new_state: nextState,
    actor_type: 'admin',
    actor_admin_user_id: input.actor.id,
    note: input.note?.trim() || null,
    metadata_json: {
      order_reference: engagement.orderReference,
      actor_role: input.actor.role,
      state_version: updated.state_version
    }
  }];

  if (nextState === 'review_complete') {
    events.push({
      engagement_id: engagement.id,
      event_type: 'review_signed_off',
      previous_state: engagement.state,
      new_state: nextState,
      actor_type: 'admin',
      actor_admin_user_id: input.actor.id,
      note: input.signOffStatement?.trim() ?? null,
      metadata_json: { order_reference: engagement.orderReference, reviewer_admin_user_id: engagement.reviewerAdminUserId }
    });
  }

  if (nextState === 'in_review' && engagement.state === 'review_complete') {
    events.push({
      engagement_id: engagement.id,
      event_type: 'sign_off_withdrawn',
      previous_state: engagement.state,
      new_state: nextState,
      actor_type: 'admin',
      actor_admin_user_id: input.actor.id,
      note: input.note?.trim() ?? null,
      metadata_json: {
        order_reference: engagement.orderReference,
        withdrawn_sign_off_by: engagement.signedOffBy,
        withdrawn_sign_off_at: engagement.signedOffAt
      }
    });
  }

  await db.from('comprehensive_engagement_events').insert(events);

  await db.from('audit_logs').insert({
    actor_type: 'admin',
    actor_user_id: input.actor.id,
    assessment_id: engagement.assessmentId,
    entity_table: 'comprehensive_engagements',
    entity_id: engagement.id,
    action: 'comprehensive_engagement_state_changed',
    before_json: { state: engagement.state, state_version: engagement.stateVersion },
    after_json: { state: nextState, state_version: updated.state_version, order_reference: engagement.orderReference }
  });

  if (nextState === 'review_complete') {
    await trackAssessmentEvent({
      eventType: 'comprehensive_review_signed_off',
      assessmentId: engagement.assessmentId,
      organisationId: engagement.organisationId,
      orderId: engagement.orderId,
      optionCode: 'comprehensive',
      metadata: {
        order_reference: engagement.orderReference,
        reviewer_admin_user_id: engagement.reviewerAdminUserId ?? 'unassigned'
      }
    });
  }

  const refreshed = await getEngagementByOrderReference(input.orderReference);
  return { ok: true, engagement: refreshed ?? engagement };
}
