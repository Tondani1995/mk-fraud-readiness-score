import { unstable_noStore as noStore } from 'next/cache';
import { trackAssessmentEvent } from '@/lib/analytics/assessment-events';
import { COMMERCIAL_OPTION_CODES } from '@/lib/snapshot/commercial-insights';
import { queueInternalNotification } from '@/lib/notifications/internal-notifications';
import { recordPhase1OrderNotifications } from '@/lib/notifications/phase1-order-notifications';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import { buildEftInstructionSnapshot, formatOrderAmount, getActiveEftInstructions } from '@/lib/orders/eft-instructions';
import { COMMERCIAL_CURRENCY, ESSENTIAL_PRICE_CENTS, ESSENTIAL_PRODUCT_CODE } from '@/lib/commercial/product-catalogue';
import type { AdminSession } from '@/lib/auth/admin-route';

export { buildEftInstructionSnapshot, formatOrderAmount, getActiveEftInstructions };

export type ManualOrderStatus = 'draft' | 'awaiting_payment' | 'payment_received' | 'cancelled' | 'expired';

const CUSTOMER_STATUSES: ManualOrderStatus[] = ['draft', 'awaiting_payment', 'payment_received', 'cancelled', 'expired'];

export type CustomerOrderConfirmation = {
  orderReference: string;
  productName: string;
  amountDisplay: string;
  status: ManualOrderStatus;
  paymentReference: string;
  manualConfirmationNote: string;
  eftInstructions: {
    active: boolean;
    bankName?: string;
    accountHolder?: string;
    accountNumber?: string;
    branchCode?: string;
    accountType?: string | null;
    currency?: string;
    paymentReferenceInstruction?: string;
    customerInstruction?: string;
    contactEmail?: string;
    message?: string;
  };
};

function service() {
  return createSupabaseServiceClient() as any;
}

function normaliseStatus(status: string | null | undefined): ManualOrderStatus {
  if (status === 'created') return 'draft';
  if (status === 'verified') return 'payment_received';
  if (CUSTOMER_STATUSES.includes(status as ManualOrderStatus)) return status as ManualOrderStatus;
  return 'awaiting_payment';
}

function paymentReference(orderReference: string) {
  return orderReference.replace(/[^A-Z0-9-]/gi, '').toUpperCase();
}

/**
 * The Essential product, resolved by its authoritative product code.
 *
 * Previously this picked "the first active product that requires payment verification, ordered by
 * display_order". That was only ever correct while Essential happened to be the lowest-ordered paid
 * product; with Comprehensive now also active and payment-verified, an ordering change would have
 * silently sold the wrong product. The code is now named explicitly.
 */
async function getEssentialProduct(db: any) {
  const { data: product } = await db
    .from('products')
    .select('id,product_code,name,price_cents,currency,requires_payment_verification,delivery_mode,active')
    .eq('product_code', ESSENTIAL_PRODUCT_CODE)
    .eq('active', true)
    .maybeSingle();

  return product ?? null;
}

function toCustomerOrder(order: any): CustomerOrderConfirmation {
  const snapshot = order.eft_instructions_snapshot ?? {};
  return {
    orderReference: order.order_reference,
    productName: order.product_name,
    amountDisplay: formatOrderAmount(order.amount_cents, order.currency),
    status: normaliseStatus(order.status),
    paymentReference: paymentReference(order.order_reference),
    manualConfirmationNote: 'MK Fraud Insights will confirm EFT payment manually before any detailed report is released.',
    eftInstructions: {
      active: snapshot.active === true,
      bankName: snapshot.bankName ?? snapshot.bank_name,
      accountHolder: snapshot.accountHolder ?? snapshot.account_holder,
      accountNumber: snapshot.accountNumber ?? snapshot.account_number,
      branchCode: snapshot.branchCode ?? snapshot.branch_code,
      accountType: snapshot.accountType ?? snapshot.account_type ?? null,
      currency: snapshot.currency ?? 'ZAR',
      paymentReferenceInstruction: snapshot.paymentReferenceInstruction ?? snapshot.payment_reference_instruction ?? 'Use your order reference as the payment reference.',
      customerInstruction: snapshot.customerInstruction ?? snapshot.customer_instruction ?? 'MK Fraud Insights confirms EFT payments manually before any detailed report is released.',
      contactEmail: snapshot.contactEmail ?? snapshot.contact_email ?? 'hello@mkfraud.co.za',
      message: snapshot.message ?? 'MK Fraud Insights will send EFT instructions directly after reviewing the report request.'
    }
  };
}

async function trackEftOrderEvent(input: {
  assessment: any;
  dataRequest: any;
  organisation?: any | null;
  respondent?: any | null;
}, order: any, created: boolean) {
  const metadata = {
    assessment_reference: input.assessment.assessment_reference,
    order_reference: order.order_reference,
    product_name: order.product_name,
    order_created: created
  };

  await Promise.all([
    trackAssessmentEvent({
      eventType: 'eft_order_created',
      assessmentId: input.assessment.id,
      organisationId: input.assessment.organisation_id,
      respondentId: input.assessment.primary_respondent_id,
      orderId: order.id,
      dataRequestId: input.dataRequest?.id ?? null,
      optionCode: COMMERCIAL_OPTION_CODES.essential,
      metadata
    }),
    queueInternalNotification({
      notificationType: 'eft_order_created',
      assessmentId: input.assessment.id,
      organisationId: input.assessment.organisation_id,
      respondentId: input.assessment.primary_respondent_id,
      orderId: order.id,
      dataRequestId: input.dataRequest?.id ?? null,
      optionCode: COMMERCIAL_OPTION_CODES.essential,
      metadata
    })
  ]);
}

export async function createOrGetOrderForReportRequest(input: {
  assessment: any;
  dataRequest: any;
  organisation?: any | null;
  respondent?: any | null;
}) {
  const db = service();

  const existing = input.dataRequest?.id
    ? await db
      .from('orders')
      .select('id,order_reference,status,product_id,product_name,amount_cents,currency,customer_email,customer_name,organisation_name,created_at,eft_instructions_snapshot,products:product_id(product_code,name)')
      .eq('assessment_id', input.assessment.id)
      .eq('report_request_id', input.dataRequest.id)
      .maybeSingle()
    : { data: null };

  if (existing.data) {
    await trackEftOrderEvent(input, existing.data, false);
    await recordPhase1OrderNotifications({
      ...input,
      order: existing.data,
      product: Array.isArray(existing.data.products) ? existing.data.products[0] : existing.data.products,
      eftSnapshot: existing.data.eft_instructions_snapshot
    });
    return toCustomerOrder(existing.data);
  }

  // Creation goes through the one transactional primitive (create_paid_order), so the order, its
  // price-version binding and its authoritative creation trail commit together. Nothing here reads
  // a price constant: the RPC is told which catalogue contract this build compiled against and
  // refuses the write if the database disagrees.
  const product = await getEssentialProduct(db);
  if (!product) return null;

  const eftSnapshot = await buildEftInstructionSnapshot();

  const { data: created, error: createError } = await db.rpc('create_paid_order', {
    p_tier: 'essential',
    p_assessment_id: input.assessment.id,
    p_expected_product_code: ESSENTIAL_PRODUCT_CODE,
    p_expected_amount_cents: ESSENTIAL_PRICE_CENTS,
    p_expected_currency: COMMERCIAL_CURRENCY,
    p_report_request_id: input.dataRequest?.id ?? null,
    p_customer_email: input.respondent?.email ?? input.dataRequest?.requested_by_email ?? null,
    p_customer_name: input.respondent?.full_name ?? null,
    p_organisation_name: input.organisation?.legal_name ?? input.organisation?.trading_name ?? 'Organisation',
    p_product_name: product.name,
    p_eft_instructions_snapshot: eftSnapshot,
    p_requested_by_respondent_id: input.assessment.primary_respondent_id ?? null,
    p_assessment_reference: input.assessment.assessment_reference ?? null
  });

  if (createError) throw new Error(createError.message ?? 'Order could not be created.');
  if (!created) throw new Error('Order could not be created.');

  const inserted = {
    id: created.order_id,
    order_reference: created.order_reference,
    status: created.status,
    product_name: created.product_name,
    amount_cents: created.amount_cents,
    currency: created.currency,
    customer_email: input.respondent?.email ?? input.dataRequest?.requested_by_email ?? null,
    customer_name: input.respondent?.full_name ?? null,
    organisation_name: input.organisation?.legal_name ?? input.organisation?.trading_name ?? 'Organisation',
    created_at: new Date().toISOString(),
    eft_instructions_snapshot: eftSnapshot
  };

  // create_paid_order() already wrote the order_created_from_report_request event and the audit row
  // inside the transaction. The assessment-completion marker is a presentational backdated event
  // and stays here, post-commit.
  await db.from('order_events').insert({
    order_id: inserted.id,
    event_type: 'assessment_completed',
    note: 'Assessment completion is linked to this order.',
    metadata_json: {
      actor_type: 'system',
      assessment_reference: input.assessment.assessment_reference
    },
    created_at: input.assessment.submitted_at ?? inserted.created_at
  });

  await trackEftOrderEvent(input, inserted, true);
  await recordPhase1OrderNotifications({
    ...input,
    order: inserted,
    product,
    eftSnapshot
  });

  return toCustomerOrder(inserted);
}

export async function getAdminOrderList(filters: { status?: string; search?: string } = {}) {
  noStore();
  const db = service();
  const rows: any[] = [];
  const pageSize = 1_000;
  for (let from = 0; ; from += pageSize) {
    let query: any = db
      .from('orders')
      .select('id,order_reference,status,amount_cents,currency,product_name,customer_email,customer_name,organisation_name,created_at,updated_at,assessments(assessment_reference,status),data_requests(status,request_type,created_at)')
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);
    if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status);
    if (filters.search) {
      const term = filters.search.trim();
      if (term) query = query.or(`order_reference.ilike.%${term}%,organisation_name.ilike.%${term}%`);
    }
    const { data, error } = await query;
    if (error) {
      console.error('admin order list query failed', { from, message: error.message });
      return rows;
    }
    rows.push(...(data ?? []));
    if ((data?.length ?? 0) < pageSize) break;
  }
  return rows;
}

export async function getAdminOrderDetail(orderReference: string) {
  noStore();
  const db = service();
  const { data: order, error } = await db
    .from('orders')
    .select('*,assessments(assessment_reference,status,submitted_at,current_score_run_id,organisations(legal_name,trading_name),respondents(full_name,email)),data_requests(id,status,request_type,requested_by_email,notes,created_at),products(product_code,name,delivery_mode,requires_payment_verification)')
    .eq('order_reference', orderReference)
    .maybeSingle();

  if (error) {
    console.error('admin order detail query failed', error);
    return null;
  }
  if (!order) return null;

  const [{ data: events }, { data: auditEvents }] = await Promise.all([
    db.from('order_events').select('id,event_type,previous_status,new_status,note,actor_admin_user_id,metadata_json,created_at').eq('order_id', order.id).order('created_at', { ascending: false }),
    db.from('audit_logs').select('id,actor_type,actor_user_id,action,before_json,after_json,created_at').eq('entity_table', 'orders').eq('entity_id', order.id).order('created_at', { ascending: false }).limit(25)
  ]);

  return { order, events: events ?? [], auditEvents: auditEvents ?? [] };
}

function transitionNeedsNote(current: ManualOrderStatus, next: ManualOrderStatus) {
  return current === 'payment_received' || current === 'cancelled' || current === 'expired' || next === 'cancelled' || next === 'expired';
}

export async function updateAdminOrderStatus(input: {
  orderReference: string;
  nextStatus: ManualOrderStatus;
  note?: string;
  admin: AdminSession;
}) {
  const db = service();
  const detail = await getAdminOrderDetail(input.orderReference);
  if (!detail) return { ok: false, error: 'Order not found.' };

  const currentStatus = normaliseStatus(detail.order.status);
  if (!CUSTOMER_STATUSES.includes(input.nextStatus)) return { ok: false, error: 'Unsupported order status.' };
  if (transitionNeedsNote(currentStatus, input.nextStatus) && !input.note?.trim()) {
    return { ok: false, error: 'A note is required for this status change.' };
  }

  const { data: updated, error } = await db
    .from('orders')
    .update({
      status: input.nextStatus,
      admin_notes: input.note?.trim() || detail.order.admin_notes,
      updated_by_admin_user_id: input.admin.id,
      verified_by: input.nextStatus === 'payment_received' ? input.admin.id : detail.order.verified_by,
      verified_at: input.nextStatus === 'payment_received' ? new Date().toISOString() : detail.order.verified_at
    })
    .eq('id', detail.order.id)
    .select('id,order_reference,status')
    .single();

  if (error) return { ok: false, error: error.message };

  const statusEvents: any[] = [
    {
      order_id: detail.order.id,
      event_type: 'admin_status_updated',
      previous_status: detail.order.status,
      new_status: input.nextStatus,
      note: input.note?.trim() || null,
      actor_admin_user_id: input.admin.id,
      metadata_json: {
        payment_gateway: false,
        proof_upload: false,
        automatic_pdf_generation: false,
        report_unlock: false
      }
    },
    {
      order_id: detail.order.id,
      event_type: 'payment_status_changed',
      previous_status: detail.order.status,
      new_status: input.nextStatus,
      note: input.note?.trim() || 'Payment state updated by an authorised finance administrator.',
      actor_admin_user_id: input.admin.id,
      metadata_json: { automatic_generation_started: false }
    }
  ];
  if (input.note?.trim()) {
    statusEvents.push({
      order_id: detail.order.id,
      event_type: 'admin_note_added',
      note: input.note.trim(),
      actor_admin_user_id: input.admin.id,
      metadata_json: { related_transition: 'payment_status_changed' }
    });
  }
  await db.from('order_events').insert(statusEvents);

  await db.from('audit_logs').insert({
    actor_type: 'admin',
    actor_user_id: input.admin.id,
    assessment_id: detail.order.assessment_id,
    entity_table: 'orders',
    entity_id: detail.order.id,
    action: 'manual_eft_order_status_updated',
    before_json: { status: detail.order.status },
    after_json: {
      status: updated.status,
      order_reference: detail.order.order_reference,
      payment_gateway: false,
      proof_upload: false,
      pdf_generation: false,
      report_unlock: false
    }
  });

  if (input.nextStatus === 'payment_received') {
    await trackAssessmentEvent({
      eventType: 'payment_marked_received',
      assessmentId: detail.order.assessment_id,
      orderId: detail.order.id,
      dataRequestId: detail.order.report_request_id ?? null,
      optionCode: COMMERCIAL_OPTION_CODES.essential,
      metadata: {
        order_reference: detail.order.order_reference,
        previous_status: currentStatus,
        next_status: input.nextStatus
      }
    });
  }

  return { ok: true, order: updated };
}
