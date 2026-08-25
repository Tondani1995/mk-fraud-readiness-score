import crypto from 'node:crypto';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { requirePhase14Action, Phase14AuthorizationError } from '../phase14-security';
import { assertReportAccessEligible, resolveCurrentReportId, ReportAccessEligibilityError } from '../report-access-eligibility';
import { getEmailProviderMode } from '@/lib/notifications/email-provider';
import { recipientAllowlist } from '@/lib/notifications/phase1-order-notifications';
import { deliverPremiumReportEmail } from './report-delivery-service';
import {
  assertApprovedRecipient,
  assertCertificationEnvironment,
  assertExactlyOneValidPaymentTransition,
  assertTestProviderMode,
  PremiumReportInitiationPolicyError,
  type PremiumReportAdminInitiationInput
} from './premium-report-admin-initiation-policy';
import type { AdminSession } from '@/lib/auth/admin-route';

const SHA256 = /^[0-9a-f]{64}$/;
const ACTIVE_DELIVERY_STATUSES = ['queued', 'claimed', 'dispatching', 'reconciliation_required', 'retry_scheduled'];

type OrderRow = {
  id: string;
  order_reference: string;
  assessment_id: string;
  status: string;
  customer_email: string | null;
  verified_at: string | null;
  verified_by: string | null;
};

type ReportRow = {
  id: string;
  report_reference: string;
  order_id: string | null;
  assessment_id: string;
  score_run_id: string;
  report_type: string;
  status: string;
  version_number: number;
  storage_status: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  checksum: string | null;
  fulfilment_id: string | null;
};

export class PremiumReportAdminInitiationError extends Error {
  constructor(
    readonly reason: string,
    message: string,
    readonly status = 409
  ) {
    super(message);
    this.name = 'PremiumReportAdminInitiationError';
  }
}

function fingerprint(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function safeErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error ?? 'unknown');
}

function mapEligibilityError(error: ReportAccessEligibilityError) {
  return new PremiumReportAdminInitiationError(error.reason, 'The report is not eligible for controlled delivery.', 409);
}

function mapDatabaseError(error: unknown, fallback: string) {
  const message = safeErrorMessage(error);
  const known = [
    'delivery_order_not_paid',
    'delivery_manual_verification_missing',
    'delivery_relationship_mismatch',
    'delivery_score_run_ineligible',
    'delivery_stale_score_run',
    'delivery_report_not_current',
    'delivery_report_status_forbidden',
    'delivery_storage_metadata_invalid',
    'report_storage_object_missing',
    'report_storage_metadata_mismatch',
    'delivery_recipient_override_forbidden',
    'phase14_policy_disabled',
    'phase14_security_gate_unsatisfied'
  ];
  const reason = known.find((candidate) => message.includes(candidate)) ?? fallback;
  return new PremiumReportAdminInitiationError(reason, 'The report delivery request was refused by the delivery controls.', 409);
}

async function resolveOrder(db: any, input: PremiumReportAdminInitiationInput) {
  const query = db.from('orders').select('id,order_reference,assessment_id,status,customer_email,verified_at,verified_by');
  const result = input.orderId
    ? await query.eq('id', input.orderId).maybeSingle()
    : await query.eq('order_reference', input.orderReference).maybeSingle();
  if (result.error || !result.data) {
    throw new PremiumReportAdminInitiationError('order_not_found', 'The order could not be resolved.', 404);
  }
  const order = result.data as OrderRow;
  if (input.orderId && input.orderReference && order.order_reference !== input.orderReference) {
    throw new PremiumReportAdminInitiationError('order_selector_mismatch', 'The supplied order selectors do not identify the same order.');
  }
  return order;
}

async function resolveReport(db: any, input: PremiumReportAdminInitiationInput) {
  const query = db.from('reports').select('id,report_reference,order_id,assessment_id,score_run_id,report_type,status,version_number,storage_status,storage_bucket,storage_path,checksum,fulfilment_id');
  const result = input.reportId
    ? await query.eq('id', input.reportId).maybeSingle()
    : await query.eq('report_reference', input.reportReference).maybeSingle();
  if (result.error || !result.data) {
    throw new PremiumReportAdminInitiationError('report_not_found', 'The report could not be resolved.', 404);
  }
  const report = result.data as ReportRow;
  if (input.reportId && input.reportReference && report.report_reference !== input.reportReference) {
    throw new PremiumReportAdminInitiationError('report_selector_mismatch', 'The supplied report selectors do not identify the same report.');
  }
  return report;
}

async function recordAudit(db: any, action: string, orderId: string, reportId: string, after: Record<string, unknown>) {
  const { error } = await db.from('audit_logs').insert({
    actor_type: 'admin',
    assessment_id: after.assessment_id ?? null,
    entity_table: 'reports',
    entity_id: reportId,
    action,
    after_json: {
      order_fingerprint: fingerprint(orderId),
      report_fingerprint: fingerprint(reportId),
      ...after
    }
  });
  if (error) {
    throw new PremiumReportAdminInitiationError('audit_persistence_failed', 'The delivery audit record could not be persisted.', 500);
  }
}

async function loadExistingActiveAuthorization(db: any, reportId: string, recipient: string) {
  const { data, error } = await db.from('report_delivery_authorizations')
    .select('id,status,email_event_id,provider_message_id,recipient_email,test_delivery')
    .eq('report_id', reportId)
    .eq('recipient_email', recipient)
    .in('status', ACTIVE_DELIVERY_STATUSES)
    .order('authorised_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as {
    id: string;
    status: string;
    email_event_id: string;
    provider_message_id: string | null;
    recipient_email: string;
    test_delivery: boolean;
  };
}

function isActiveAuthorizationUniqueViolation(error: any) {
  return error?.code === '23505'
    && String(error?.message ?? '').includes('report_delivery_authorizations_one_active_uidx');
}

async function deliverWithConcurrencyRecovery(input: {
  db: any;
  reportId: string;
  recipient: string;
  recipientOverride: string | null;
}) {
  try {
    return await deliverPremiumReportEmail({
      reportId: input.reportId,
      actor: { actorType: 'admin', action: 'admin_send' },
      recipientOverride: input.recipientOverride,
      allowNonProductionTestOverride: input.recipientOverride !== null
    });
  } catch (error) {
    if (!isActiveAuthorizationUniqueViolation(error)) throw error;
    const existing = await loadExistingActiveAuthorization(input.db, input.reportId, input.recipient);
    if (!existing) throw error;
    return {
      emailEventId: existing.email_event_id,
      providerMessageId: existing.provider_message_id,
      recipient: existing.recipient_email,
      reusedExistingSend: true,
      status: 'in_progress',
      testDelivery: existing.test_delivery
    };
  }
}

export async function initiatePremiumReportDelivery(
  input: PremiumReportAdminInitiationInput,
  admin: AdminSession
) {
  try {
    // Authorise the admin action before reading commercial records or writing audit evidence.
    await requirePhase14Action('email_delivery');
  } catch (error) {
    if (error instanceof Phase14AuthorizationError) {
      throw new PremiumReportAdminInitiationError(
        error.reason,
        'The delivery action is not authorised.',
        403
      );
    }
    throw mapDatabaseError(error, 'delivery_initiation_failed');
  }

  assertCertificationEnvironment(process.env.VERCEL_ENV, process.env.NODE_ENV);
  assertTestProviderMode(getEmailProviderMode());

  const db = createSupabaseServiceClient() as any;
  const order = await resolveOrder(db, input);
  const report = await resolveReport(db, input);

  if (report.order_id !== order.id || report.assessment_id !== order.assessment_id) {
    throw new PremiumReportAdminInitiationError('report_order_mismatch', 'The report does not belong to the supplied order.');
  }
  if (order.status !== 'payment_received') {
    throw new PremiumReportAdminInitiationError('order_not_paid', 'The order is not payment_received.');
  }
  if (!order.verified_at || !order.verified_by) {
    throw new PremiumReportAdminInitiationError('payment_verification_missing', 'The order has no valid payment verification.');
  }
  if (report.storage_status !== 'VERIFIED' || !report.storage_bucket || !report.storage_path || !SHA256.test(report.checksum ?? '')) {
    throw new PremiumReportAdminInitiationError('storage_unverified', 'The report Storage verification is incomplete.');
  }
  if (!['generated', 'approved', 'released'].includes(report.status) || report.status === 'superseded' || report.status === 'voided') {
    throw new PremiumReportAdminInitiationError('report_status_ineligible', 'The report is not in a delivery-ready state.');
  }

  const { count: transitionCount, error: transitionError } = await db.from('payment_transition_events')
    .select('id', { count: 'exact', head: true })
    .eq('order_id', order.id)
    .eq('new_state', 'PAID')
    .eq('processing_result', 'applied');
  if (transitionError) throw new PremiumReportAdminInitiationError('payment_transition_lookup_failed', 'The payment transition evidence could not be verified.', 503);
  try {
    assertExactlyOneValidPaymentTransition(transitionCount);
  } catch (error) {
    if (error instanceof PremiumReportInitiationPolicyError) {
      throw new PremiumReportAdminInitiationError(error.reason, error.message, error.status);
    }
    throw error;
  }

  const { data: assessment, error: assessmentError } = await db.from('assessments')
    .select('id,current_score_run_id')
    .eq('id', order.assessment_id)
    .maybeSingle();
  const { data: scoreRun, error: scoreRunError } = await db.from('score_runs')
    .select('id,assessment_id,status,locked_at,input_hash')
    .eq('id', report.score_run_id)
    .maybeSingle();
  if (assessmentError || scoreRunError || !assessment || !scoreRun
      || scoreRun.assessment_id !== assessment.id
      || assessment.current_score_run_id !== scoreRun.id
      || scoreRun.status !== 'completed'
      || !scoreRun.locked_at
      || !SHA256.test(scoreRun.input_hash ?? '')) {
    throw new PremiumReportAdminInitiationError('score_run_relationship_invalid', 'The report score-run relationship is not valid for delivery.');
  }

  const currentReportId = await resolveCurrentReportId(db, report.assessment_id, report.report_type);
  try {
    assertReportAccessEligible({
      report,
      currentReportId,
      expectedOrderId: order.id,
      purpose: 'email_delivery'
    });
  } catch (error) {
    if (error instanceof ReportAccessEligibilityError) throw mapEligibilityError(error);
    throw error;
  }

  const customerRecipient = order.customer_email?.trim().toLowerCase() ?? null;
  if (!customerRecipient) throw new PremiumReportAdminInitiationError('recipient_missing', 'The order has no customer recipient.', 409);
  const recipient = (input.recipient ?? customerRecipient).trim().toLowerCase();
  const allowlist = recipientAllowlist();
  assertApprovedRecipient(recipient, allowlist);
  const recipientOverride = recipient === customerRecipient ? null : recipient;
  if (recipientOverride && (!process.env.VERCEL_ENV || process.env.VERCEL_ENV.toLowerCase() === 'production')) {
    throw new PremiumReportAdminInitiationError('recipient_override_environment_forbidden', 'A recipient override is permitted only on a named non-Production deployment.', 403);
  }
  if (!recipientOverride && !report.fulfilment_id) {
    throw new PremiumReportAdminInitiationError('fulfilment_missing', 'The customer delivery path has no delivery-ready fulfilment binding.', 409);
  }

  await recordAudit(db, 'premium_report_admin_delivery_initiation_requested', order.id, report.id, {
    assessment_id: report.assessment_id,
    actor_fingerprint: fingerprint(admin.id),
    provider_mode: 'test',
    recipient_allowlisted: true,
    recipient_override: Boolean(recipientOverride),
    payment_transition_count: transitionCount,
    report_status: report.status
  });

  let result;
  try {
    result = await deliverWithConcurrencyRecovery({ db, reportId: report.id, recipient, recipientOverride });
  } catch (error) {
    if (error instanceof PremiumReportAdminInitiationError) throw error;
    throw mapDatabaseError(error, 'delivery_initiation_failed');
  }

  await recordAudit(db, 'premium_report_admin_delivery_initiation_completed', order.id, report.id, {
    assessment_id: report.assessment_id,
    actor_fingerprint: fingerprint(admin.id),
    provider_mode: 'test',
    outcome: result.status === 'in_progress' ? 'in_progress' : result.reusedExistingSend ? 'reused_existing_outcome' : 'provider_accepted',
    test_delivery: result.testDelivery
  });

  return {
    reportId: report.id,
    orderId: order.id,
    emailEventId: result.emailEventId,
    providerMessageId: result.providerMessageId,
    status: result.status,
    reusedExistingSend: result.reusedExistingSend,
    testDelivery: result.testDelivery,
    inProgress: result.status === 'in_progress'
  };
}
