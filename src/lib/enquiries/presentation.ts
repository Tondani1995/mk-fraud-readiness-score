/**
 * Pure presentation helpers for the enquiry queue.
 *
 * Separate from the admin data reader because that module imports `next/cache`, which makes the
 * labels unreachable from anything that is not a Next.js server component — including tests. These
 * functions have no I/O and no framework dependency.
 */

import {
  ADVISORY_REQUEST_TYPE,
  WEBSITE_CONTACT_REQUEST_TYPE
} from '@/lib/enquiries/taxonomy';

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
  'mk-advisory': 'MK Advisory Engagement',
  'fraud-health-check': 'Fraud Health Check',
  'threat-intelligence': 'Threat Intelligence for Fraud',
  'programme-design': 'Fraud Programme Design',
  awareness: 'Awareness & Resilience',
  controls: 'Internal Fraud Controls',
  within_one_week: 'Within one week',
  within_two_weeks: 'Within two weeks',
  within_one_month: 'Within one month',
  exploring_options: 'Exploring options',
  other: 'Other'
};

export function cleanEnquiryStatus(status: string | null | undefined) {
  return (status ?? 'received').replace(/_/g, ' ');
}

export function labelForChoice(value: string | null | undefined) {
  if (!value) return 'Not captured';
  return CHOICE_LABELS[value] ?? value.replace(/_/g, ' ');
}

/**
 * The queue must distinguish an Advisory enquiry raised from a completed assessment from one
 * raised by a prospect who has not assessed yet. They are the same commercial workflow, but they
 * are not the same conversation: one arrives with a readiness result MK can read before calling,
 * the other arrives cold. The distinction is drawn from whether an assessment is actually linked,
 * not from enquiry_source alone, so a historical row with no source still classifies correctly.
 */
export function enquiryTypeLabel(requestType: string | null | undefined, assessmentId?: string | null) {
  if (requestType === WEBSITE_CONTACT_REQUEST_TYPE) return 'Website contact';
  if (requestType === ADVISORY_REQUEST_TYPE) {
    return assessmentId ? 'MK Advisory — assessment linked' : 'MK Advisory — public enquiry';
  }
  return 'Personalised report (historical)';
}

/** Contact identity, whichever of the two shapes the enquiry carries it in. */
export function enquiryContactName(enquiry: any) {
  return enquiry?.respondents?.full_name ?? enquiry?.contact_name ?? enquiry?.requested_by_email ?? 'Not captured';
}

export function enquiryContactEmail(enquiry: any) {
  return enquiry?.respondents?.email ?? enquiry?.requested_by_email ?? 'Not captured';
}

export function enquiryOrganisationName(enquiry: any) {
  return (
    enquiry?.organisations?.legal_name ??
    enquiry?.organisations?.trading_name ??
    enquiry?.company_name ??
    'Not captured'
  );
}

