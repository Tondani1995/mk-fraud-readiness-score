import { unstable_noStore as noStore } from 'next/cache';
import { trackAssessmentEvent } from '@/lib/analytics/assessment-events';
import { queueInternalNotification } from '@/lib/notifications/internal-notifications';
import { recordPhase1OrderNotifications } from '@/lib/notifications/phase1-order-notifications';
import { createSupabaseServiceClient } from '@/lib/supabase/server';
import type { AdminSession } from '@/lib/auth/admin-route';

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

export function formatOrderAmount(amountCents: number | null | undefined, currency: string | null | undefined) {
  const amount = Number(amountCents ?? 0) / 100;
  return `${currency ?? 'ZAR'} ${amount.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

function makeOrderReference() {
  const year = new Date().getUTCFullYear();
  const random = Math.random().toString(36).slice(2, 10).toUpperCase();
  return `MKORD-${year}-${random}`;
}

export async function getActiveEftInstructions() {
  const db = service();
  const { data: activeSetting } = await db
    .from('eft_settings')
    .select('bank_name,account_holder,account_number,branch_code,account_type,currency,payment_reference_instruction,customer_instruction,contact_email,is_active,updated_at')
    .eq('is_active', true)
    .maybeSingle();

  if (activeSetting) {
    return {
      active: true,
      bankName: activeSetting.bank_name,
      accountHolder: activeSetting.account_holder,
      accountNumber: activeSetting.account_number,
      branchCode: activeSetting.branch_code,
      accountType: activeSetting.account_type,
      currency: activeSetting.currency,
      paymentReferenceInstruction: activeSetting.payment_reference_instruction,
      customerInstruction: activeSetting.customer_instruction,
      contactEmail: activeSetting.contact_email,
      message: activeSetting.customer_instruction
    };
  }

  const { data } = await db
    .from('app_settings')
    .select('value_json')
    .eq('setting_key', 'eft_instructions')
    .maybeSingle();

  const value = data?.value_json ?? {};
  return {
    active: value.active === true,
    bankName: value.bank_name ?? value.bankName,
    accountHolder: value.account_holder ?? value.accountHolder,
    accountNumber: value.account_number ?? value.accountNumber,
    branchCode: value.branch_code ?? value.branchCode,
    accountType: value.account_type ?? value.accountType ?? null,
    currency: value.currency ?? 'ZAR',
    paymentReferenceInstruction: value.payment_reference_instruction ?? value.paymentReferenceInstruction ?? 'Use your order reference as the payment reference.',
    customerInstruction: value.customer_instruction ?? value.customerInstruction ?? 'MK Fraud Insights confirms EFT payments manually before any detailed report is released.',
    contactEmail: value.contact_email ?? value.contactEmail ?? 'hello@mkfraud.co.za',
    message: value.message ?? 'MK Fraud Insights will send EFT instructions directly after reviewing the report request.'
  };
}

export async function buildEftInstructionSnapshot() {
  const instructions = await getActiveEftInstructions();
  return {
    ...instructions,
    capturedAt: new Date().toISOString(),
    paymentGateway: false,
    proofUpload: false,
    reportUnlock: false
  };
}

async function getDefaultDetailedReportProduct(db: any) {
  const { data: product } = await db
    .from('products')
    .select('id,product_code,name,price_cents,currency,requires_payment_verification,delivery_mode,active')
    .eq('active', true)
    .eq('requires_payment_verification', true)
    .order('display_order', { ascending: true })
    .limit(1)
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
      optionCode: 'full_report_5000',
      metadata
    }),
    queueInternalNotification({
      notificationType: 'eft_order_created',
      assessmentId: input.assessment.id,
      organisationId: input.assessment.organisation_id,
      respondentId: input.assessment.primary_respondent_id,
      orderId: order.id,
      dataRequestId: input.dataRequest?.id ?? null,
      optionCode: 'full_report_5000',
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

  const product = await getDefaultDetailedReportProduct(db);
  if (!product) return null;

  const organisationName = input.organisation?.legal_name ?? input.organisation?.trading_name ?? 'Organisation';
  const respondentName = input.respondent?.full_name ?? null;
  const respondentEmail = input.respondent?.email ?? input.dataRequest?.requested_by_email ?? null;
  const eftSnapshot = await buildEftInstructionSnapshot();

  let inserted: any = null;
  let lastError: any = null;

  for (let attempt = 0; attempt < 3 && !inserted; attempt += 1) {
    const { data, error } = await db
      .from('orders')
      .insert({
        order_reference: makeOrderReference(),
        assessment_id: input.assessment.id,
        report_request_id: input.dataRequest?.id ?? null,
        product_id: product.id,
        product_name: product.name,
        amount_cents: product.price_cents,
        currency: product.currency ?? 'ZAR',
        status: 'awaiting_payment',
        requested_by_respondent_id: input.assessment.primary_respondent_id,
        customer_email: respondentEmail,
        customer_name: respondentName,
        organisation_name: organisationName,
        eft_instructions_snapshot: eftSnapshot
      })
      .select('id,order_reference,status,product_name,amount_cents,currency,customer_email,customer_name,organisation_name,created_at,eft_instructions_snapshot')
      .single();

    if (!error) inserted = data;
    lastError = error;
  }

  if (!inserted) throw new Error(lastError?.message ?? 'Order could not be created.');

  await db.from('order_events').insert([
    {
      order_id: inserted.id,
      event_type: 'assessment_completed',
      note: 'Assessment completion is linked to this order.',
      metadata_json: {
        actor_type: 'system',
        assessment_reference: input.assessment.assessment_reference
      },
      created_at: input.assessment.submitted_at ?? inserted.created_at
    },
    {
      order_id: inserted.id,
      event_type: 'order_created_from_report_request',
      new_status: inserted.status,
      metadata_json: {
        actor_type: 'respondent_token',
        assessment_reference: input.assessment.assessment_reference,
        data_request_id: input.dataRequest?.id ?? null,
        payment_gateway: false,
        proof_upload: false,
        report_unlock: false
      }
    }
  ]);

  await db.from('audit_logs').insert({
    actor_type: 'respondent_token',
    assessment_id: input.assessment.id,
    entity_table: 'orders',
    entity_id: inserted.id,
    action: 'manual_eft_order_created',
    after_json: {
      order_reference: inserted.order_reference,
      product_name: inserted.product_name,
      status: inserted.status,
      report_unlock: false
    }
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
      optionCode: 'full_report_5000',
      metadata: {
        order_reference: detail.order.order_reference,
        previous_status: currentStatus,
        next_status: input.nextStatus
      }
    });
  }

  return { ok: true, order: updated };
}
