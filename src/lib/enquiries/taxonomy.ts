/**
 * The single MK Advisory enquiry taxonomy.
 *
 * These values are a database contract, not presentation: `data_requests` carries CHECK
 * constraints (20260830170000_mk_advisory_enquiry_path.sql) that reject any `mk_advisory` row
 * whose reason, focus areas, contact method or timeframe fall outside these sets. The
 * assessment-linked Snapshot journey and the public pre-assessment journey both read from here,
 * so there is exactly one Advisory model rather than two that drift apart.
 *
 * Adding a value here without the matching migration will be rejected at the database.
 */

export const ADVISORY_REQUEST_TYPE = 'mk_advisory' as const;
export const WEBSITE_CONTACT_REQUEST_TYPE = 'website_contact' as const;
export const LEGACY_PERSONALISED_REQUEST_TYPE = 'personalised_report_50000' as const;

/** Where an enquiry entered the platform. Presentation and triage only; never an entitlement. */
export const ENQUIRY_SOURCES = ['snapshot_advisory', 'public_advisory', 'website_contact'] as const;
export type EnquirySource = (typeof ENQUIRY_SOURCES)[number];

export const ADVISORY_REASONS = [
  ['understand_control_weaknesses', 'Understand current fraud-control weaknesses'],
  ['design_strengthen_programme', 'Design or strengthen a fraud-risk programme'],
  ['respond_incident_audit_control', 'Respond to an incident, audit finding or control concern'],
  ['prepare_governance_response', 'Prepare a management, board or governance response'],
  ['review_policies_controls', 'Review policies, procedures or operating controls'],
  ['other', 'Other']
] as const;

export const ADVISORY_FOCUS_AREAS = [
  ['fraud_governance_oversight', 'Fraud governance and oversight'],
  ['fraud_risk_identification_assessment', 'Fraud-risk identification and assessment'],
  ['operational_fraud_controls', 'Operational fraud controls'],
  ['third_party_supplier_procurement_risk', 'Third-party, supplier and procurement risk'],
  ['digital_identity_channel_fraud', 'Digital, identity and channel fraud'],
  ['fraud_monitoring_detection', 'Fraud monitoring and detection'],
  ['incident_response_investigations', 'Incident response and investigations'],
  ['fraud_culture_awareness', 'Fraud culture and awareness'],
  ['other', 'Other']
] as const;

export const ADVISORY_CONTACT_METHODS = [
  ['email', 'Email'],
  ['phone', 'Phone'],
  ['video_meeting', 'Video meeting']
] as const;

export const ADVISORY_TIMEFRAMES = [
  ['within_one_week', 'Within one week'],
  ['within_two_weeks', 'Within two weeks'],
  ['within_one_month', 'Within one month'],
  ['exploring_options', 'Exploring options']
] as const;

/** Service interests offered on the general website contact form. */
export const WEBSITE_SERVICE_INTERESTS = [
  ['mk-advisory', 'MK Advisory Engagement'],
  ['fraud-health-check', 'Fraud Health Check'],
  ['threat-intelligence', 'Threat Intelligence for Fraud'],
  ['programme-design', 'Fraud Programme Design'],
  ['awareness', 'Awareness & Resilience'],
  ['controls', 'Internal Fraud Controls'],
  ['other', 'Other / Not Sure']
] as const;

const values = (pairs: ReadonlyArray<readonly [string, string]>) => new Set(pairs.map(([value]) => value));

export const ALLOWED_ADVISORY_REASONS = values(ADVISORY_REASONS);
export const ALLOWED_ADVISORY_FOCUS_AREAS = values(ADVISORY_FOCUS_AREAS);
export const ALLOWED_ADVISORY_CONTACT_METHODS = values(ADVISORY_CONTACT_METHODS);
export const ALLOWED_ADVISORY_TIMEFRAMES = values(ADVISORY_TIMEFRAMES);
export const ALLOWED_WEBSITE_SERVICE_INTERESTS = values(WEBSITE_SERVICE_INTERESTS);

export const ENQUIRY_ACTIVE_STATUSES = ['received', 'open', 'in_review'] as const;

/** MKENQ-YYYY-XXXXXXXX. The format is enforced by a CHECK constraint on data_requests. */
export const ENQUIRY_REFERENCE_PATTERN = /^MKENQ-[0-9]{4}-[A-F0-9]{8}$/;
