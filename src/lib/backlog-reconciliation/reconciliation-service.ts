import { getAdminAccessTokenFromCookies } from '@/lib/auth/session-cookies';
import { createSupabaseAuthenticatedServerClient } from '@/lib/supabase/server';
import type { AdminRole } from '@/lib/types/domain';

// Release A backlog reconciliation. Lets an authorised operator classify every
// payment_received order into a fixed disposition without direct SQL edits. Mirrors the
// role-check-before-call + note-length validation style used by confirmManualPayment() in
// src/lib/payments/payment-service.ts, and reuses the AAL-agnostic authenticated-client
// pattern from createPhase14PrivilegedClient() in src/lib/reports/phase14-security.ts so
// that public.classify_backlog_order() and public.backlog_reconciliation_queue() can rely
// on auth.uid() for their own internal role checks (they are security definer functions,
// see supabase/migrations/20260724150000_release_a_backlog_reconciliation.sql).

export const BACKLOG_CLASSIFICATIONS = [
  'genuine_customer_order',
  'internal_test_order',
  'legacy_superseded',
  'cancelled',
  'refunded',
  'delivered_outside_platform',
  'report_still_owed',
  'payment_requires_review',
  'unresolved_exception'
] as const;

export type BacklogClassification = (typeof BACKLOG_CLASSIFICATIONS)[number];

// Roles permitted to write a classification (matches classify_backlog_order()'s internal check).
export const BACKLOG_CLASSIFY_ROLES: AdminRole[] = ['platform_admin', 'finance_admin'];

// Roles permitted to read the queue / export (matches backlog_reconciliation_queue()'s internal check).
export const BACKLOG_QUEUE_VIEW_ROLES: AdminRole[] = ['platform_admin', 'finance_admin', 'reviewer', 'approver'];

export type BacklogQueueItem = {
  orderId: string;
  orderReference: string;
  productName: string;
  paymentState: string;
  paymentConfirmedAt: string | null;
  reportId: string | null;
  reportStatus: string | null;
  reportVersion: number | null;
  storageStatus: string | null;
  deliveryState: string;
  exceptionAgeDays: number;
  assignedOwner: string | null;
  assignedOwnerName: string | null;
  classification: BacklogClassification | null;
  resolutionNote: string | null;
  nextAction: string | null;
  completionDate: string | null;
  classifiedBy: string | null;
  classifiedAt: string | null;
};

export type ClassifyBacklogOrderInput = {
  orderId: string;
  reportId?: string | null;
  classification: BacklogClassification;
  resolutionNote: string;
  assignedOwner?: string | null;
  nextAction?: string | null;
  completionDate?: string | null;
  evidenceReference?: string | null;
};

export type BacklogServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; reason: string };

function privilegedClient() {
  const accessToken = getAdminAccessTokenFromCookies();
  if (!accessToken) return null;
  return createSupabaseAuthenticatedServerClient(accessToken) as any;
}

function mapRow(row: Record<string, unknown>): BacklogQueueItem {
  return {
    orderId: String(row.order_id),
    orderReference: String(row.order_reference ?? ''),
    productName: String(row.product_name ?? ''),
    paymentState: String(row.payment_state ?? ''),
    paymentConfirmedAt: (row.payment_confirmed_at as string | null) ?? null,
    reportId: (row.report_id as string | null) ?? null,
    reportStatus: (row.report_status as string | null) ?? null,
    reportVersion: row.report_version === null || row.report_version === undefined ? null : Number(row.report_version),
    storageStatus: (row.storage_status as string | null) ?? null,
    deliveryState: (row.delivery_state as string | null) ?? 'N/A',
    exceptionAgeDays: Number(row.exception_age_days ?? 0),
    assignedOwner: (row.assigned_owner as string | null) ?? null,
    assignedOwnerName: (row.assigned_owner_name as string | null) ?? null,
    classification: (row.classification as BacklogClassification | null) ?? null,
    resolutionNote: (row.resolution_note as string | null) ?? null,
    nextAction: (row.next_action as string | null) ?? null,
    completionDate: (row.completion_date as string | null) ?? null,
    classifiedBy: (row.classified_by as string | null) ?? null,
    classifiedAt: (row.classified_at as string | null) ?? null
  };
}

function mapError(error: { message?: string } | null): { message: string; reason: string } {
  const text = String(error?.message ?? '');
  if (text.includes('backlog_reconciliation_no_session')) {
    return { reason: 'no_session', message: 'Your admin session has expired. Sign in again.' };
  }
  if (text.includes('backlog_reconciliation_profile_inactive')) {
    return { reason: 'profile_inactive', message: 'Your admin profile is not active.' };
  }
  if (text.includes('backlog_reconciliation_role_forbidden')) {
    return { reason: 'forbidden', message: 'You are not authorised to manage backlog reconciliation.' };
  }
  if (text.includes('backlog_reconciliation_note_too_short')) {
    return { reason: 'note_too_short', message: 'A resolution note of at least 5 characters is required.' };
  }
  if (text.includes('backlog_reconciliation_classification_invalid')) {
    return { reason: 'classification_invalid', message: 'Select a valid classification.' };
  }
  if (text.includes('backlog_reconciliation_order_not_found')) {
    return { reason: 'order_not_found', message: 'Order not found.' };
  }
  if (text.includes('backlog_reconciliation_report_mismatch')) {
    return { reason: 'report_mismatch', message: 'The selected report does not belong to this order.' };
  }
  if (text.includes('backlog_reconciliation_owner_invalid')) {
    return { reason: 'owner_invalid', message: 'The assigned owner must reference an active admin profile.' };
  }
  return { reason: 'query_failed', message: 'Backlog reconciliation could not be completed. Try again.' };
}

export async function listBacklogQueue(): Promise<BacklogServiceResult<BacklogQueueItem[]>> {
  const client = privilegedClient();
  if (!client) return { ok: false, reason: 'no_session', message: 'Your admin session has expired. Sign in again.' };

  const { data, error } = await client.rpc('backlog_reconciliation_queue');
  if (error) {
    const mapped = mapError(error);
    return { ok: false, reason: mapped.reason, message: mapped.message };
  }
  return { ok: true, data: (data ?? []).map(mapRow) };
}

export async function classifyOrder(input: ClassifyBacklogOrderInput): Promise<BacklogServiceResult<BacklogQueueItem>> {
  const note = input.resolutionNote?.trim() ?? '';
  if (note.length < 5) {
    return { ok: false, reason: 'note_too_short', message: 'A resolution note of at least 5 characters is required.' };
  }
  if (!BACKLOG_CLASSIFICATIONS.includes(input.classification)) {
    return { ok: false, reason: 'classification_invalid', message: 'Select a valid classification.' };
  }
  if (!input.orderId) {
    return { ok: false, reason: 'order_required', message: 'An order id is required.' };
  }

  const client = privilegedClient();
  if (!client) return { ok: false, reason: 'no_session', message: 'Your admin session has expired. Sign in again.' };

  const { data, error } = await client.rpc('classify_backlog_order', {
    p_order_id: input.orderId,
    p_report_id: input.reportId ?? null,
    p_classification: input.classification,
    p_resolution_note: note,
    p_assigned_owner: input.assignedOwner ?? null,
    p_next_action: input.nextAction?.trim() || null,
    p_completion_date: input.completionDate ?? null,
    p_evidence_reference: input.evidenceReference?.trim() || null
  });

  if (error || !data) {
    const mapped = mapError(error);
    return { ok: false, reason: mapped.reason, message: mapped.message };
  }
  return { ok: true, data: mapRow(data as Record<string, unknown>) };
}
