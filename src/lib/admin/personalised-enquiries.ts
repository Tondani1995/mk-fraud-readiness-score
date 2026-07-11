import { unstable_noStore as noStore } from 'next/cache';
import type { AdminSession } from '@/lib/auth/admin-route';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

const PERSONALISED_REQUEST_TYPE = 'personalised_report_50000';

function service() {
  return createSupabaseServiceClient() as any;
}

export function cleanEnquiryStatus(status: string | null | undefined) {
  return (status ?? 'received').replace(/_/g, ' ');
}

export function labelForChoice(value: string | null | undefined) {
  if (!value) return 'Not captured';
  return value.replace(/_/g, ' ');
}

export async function getAdminPersonalisedEnquiryList(filters: { status?: string; search?: string } = {}) {
  noStore();
  const db = service();
  let query: any = db
    .from('data_requests')
    .select('id,request_reference,status,primary_reason,preferred_contact_method,preferred_consultation_timeframe,areas_of_focus,requested_by_email,created_at,updated_at,assessments(assessment_reference,status),organisations(legal_name,trading_name),respondents(full_name,email)')
    .eq('request_type', PERSONALISED_REQUEST_TYPE)
    .order('created_at', { ascending: false })
    .limit(100);

  if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status);
  if (filters.search) {
    const term = filters.search.trim();
    if (term) query = query.or(`request_reference.ilike.%${term}%,requested_by_email.ilike.%${term}%`);
  }

  const { data, error } = await query;
  if (error) {
    console.error('admin personalised enquiry list query failed', error);
    return [];
  }

  return data ?? [];
}

export async function getAdminPersonalisedEnquiryDetail(requestReference: string) {
  noStore();
  const db = service();
  const { data, error } = await db
    .from('data_requests')
    .select('id,request_reference,status,primary_reason,areas_of_focus,preferred_contact_method,preferred_consultation_timeframe,consent_contact,requested_by_email,notes,created_at,updated_at,assessment_id,organisation_id,respondent_id,assessments(assessment_reference,status,current_score_run_id,submitted_at),organisations(legal_name,trading_name),respondents(full_name,email)')
    .eq('request_type', PERSONALISED_REQUEST_TYPE)
    .eq('request_reference', requestReference)
    .maybeSingle();

  if (error) {
    console.error('admin personalised enquiry detail query failed', error);
    return null;
  }

  return data ?? null;
}

export async function recordPersonalisedEnquiryOpened(enquiry: any, admin: AdminSession) {
  const db = service();
  await db.from('audit_logs').insert({
    actor_type: 'admin',
    actor_user_id: admin.id,
    assessment_id: enquiry.assessment_id ?? null,
    entity_table: 'data_requests',
    entity_id: enquiry.id,
    action: 'personalised_enquiry_opened',
    after_json: {
      request_reference: enquiry.request_reference,
      request_type: PERSONALISED_REQUEST_TYPE,
      report_generation: false,
      order_created: false
    }
  });
}
