import { unstable_noStore as noStore } from 'next/cache';
import type { AdminSession } from '@/lib/auth/admin-route';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

const PERSONALISED_REQUEST_TYPE = 'personalised_report_50000';

const CHOICE_LABELS: Record<string, string> = {
  understand_control_weaknesses: 'Understand current fraud-control weaknesses',
  design_strengthen_programme: 'Design or strengthen a fraud-risk programme',
  respond_incident_audit_control: 'Respond to an incident, audit finding or control concern',
  prepare_governance_response: 'Prepare a management, board or governance response',
  review_policies_controls: 'Review policies, procedures or operating controls',
  fraud_governance_oversight: 'Fraud governance and oversight',
  fraud_risk_identification_assessment: 'Fraud-risk identification and assessment',
  operational_fraud_controls: 'Operational fraud controls',
  third_party_supplier_procurement_risk: 'Third-party, supplier and procurement risk',
  digital_identity_channel_fraud: 'Digital, identity and channel fraud',
  fraud_monitoring_detection: 'Fraud monitoring and detection',
  incident_response_investigations: 'Incident response and investigations',
  fraud_culture_awareness: 'Fraud culture and awareness',
  email: 'Email',
  phone: 'Phone',
  video_meeting: 'Video meeting',
  within_one_week: 'Within one week',
  within_two_weeks: 'Within two weeks',
  within_one_month: 'Within one month',
  exploring_options: 'Exploring options',
  other: 'Other'
};

function service() {
  return createSupabaseServiceClient() as any;
}

export function cleanEnquiryStatus(status: string | null | undefined) {
  return (status ?? 'received').replace(/_/g, ' ');
}

export function labelForChoice(value: string | null | undefined) {
  if (!value) return 'Not captured';
  return CHOICE_LABELS[value] ?? value.replace(/_/g, ' ');
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
