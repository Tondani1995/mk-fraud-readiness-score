import { unstable_noStore as noStore } from 'next/cache';
import type { AdminSession } from '@/lib/auth/admin-route';
import { createSupabaseServiceClient } from '@/lib/supabase/server';

import {
  ADVISORY_REQUEST_TYPE,
  LEGACY_PERSONALISED_REQUEST_TYPE,
  WEBSITE_CONTACT_REQUEST_TYPE
} from '@/lib/enquiries/taxonomy';

export { ADVISORY_REQUEST_TYPE, LEGACY_PERSONALISED_REQUEST_TYPE, WEBSITE_CONTACT_REQUEST_TYPE };

// Presentation lives in a framework-free module; re-exported so callers keep one import.
export {
  cleanEnquiryStatus,
  enquiryContactEmail,
  enquiryContactName,
  enquiryOrganisationName,
  enquiryTypeLabel,
  labelForChoice
} from '@/lib/enquiries/presentation';

/** Every enquiry type the queue answers. One queue, not a second admin application. */
export const ADMIN_ENQUIRY_REQUEST_TYPES = [
  ADVISORY_REQUEST_TYPE,
  WEBSITE_CONTACT_REQUEST_TYPE,
  LEGACY_PERSONALISED_REQUEST_TYPE
] as const;

function service() {
  return createSupabaseServiceClient() as any;
}

export async function getAdminPersonalisedEnquiryList(filters: { status?: string; search?: string } = {}) {
  noStore();
  const db = service();
  let query: any = db
    .from('data_requests')
    .select('id,request_reference,request_type,status,primary_reason,preferred_contact_method,preferred_consultation_timeframe,areas_of_focus,requested_by_email,contact_name,company_name,contact_phone,service_interest,enquiry_source,assessment_id,created_at,updated_at,assessments(assessment_reference,status),organisations(legal_name,trading_name),respondents(full_name,email)')
    .in('request_type', ADMIN_ENQUIRY_REQUEST_TYPES as unknown as string[])
    .order('created_at', { ascending: false })
    .limit(100);

  if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status);
  if (filters.search) {
    const term = filters.search.trim();
    // A public enquiry has no respondent row, so name and company must be searchable directly.
    if (term) {
      const safe = term.replace(/[,()%]/g, ' ').trim();
      if (safe) {
        query = query.or(
          `request_reference.ilike.%${safe}%,requested_by_email.ilike.%${safe}%,contact_name.ilike.%${safe}%,company_name.ilike.%${safe}%`
        );
      }
    }
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
    .select('id,request_reference,request_type,status,primary_reason,areas_of_focus,preferred_contact_method,preferred_consultation_timeframe,consent_contact,requested_by_email,contact_name,company_name,contact_phone,service_interest,enquiry_source,notes,created_at,updated_at,assessment_id,organisation_id,respondent_id,assessments(assessment_reference,status,current_score_run_id,submitted_at),organisations(legal_name,trading_name),respondents(full_name,email)')
    .in('request_type', ADMIN_ENQUIRY_REQUEST_TYPES as unknown as string[])
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
    action:
      enquiry.request_type === ADVISORY_REQUEST_TYPE
        ? 'advisory_enquiry_opened'
        : enquiry.request_type === WEBSITE_CONTACT_REQUEST_TYPE
          ? 'website_contact_enquiry_opened'
          : 'personalised_enquiry_opened',
    after_json: {
      request_reference: enquiry.request_reference,
      request_type: enquiry.request_type ?? LEGACY_PERSONALISED_REQUEST_TYPE,
      enquiry_source: enquiry.enquiry_source ?? null,
      assessment_linked: Boolean(enquiry.assessment_id),
      report_generation: false,
      order_created: false
    }
  });
}
