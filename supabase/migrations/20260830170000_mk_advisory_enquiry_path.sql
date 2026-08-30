-- MK Fraud Readiness Score: current MK Advisory enquiry path.
--
-- This is additive. Historical personalised_report_50000 rows remain readable and are not
-- rewritten. Current Snapshot submissions use mk_advisory and never create orders or fulfilment.

begin;

create unique index if not exists data_requests_active_mk_advisory_uidx
  on public.data_requests(assessment_id)
  where request_type = 'mk_advisory'
    and status in ('received', 'open', 'in_review')
    and assessment_id is not null;

do $$
begin
  alter table public.data_requests drop constraint if exists data_requests_advisory_reason_chk;
  alter table public.data_requests
    add constraint data_requests_advisory_reason_chk
    check (
      request_type <> 'mk_advisory'
      or primary_reason in (
        'understand_control_weaknesses',
        'design_strengthen_programme',
        'respond_incident_audit_control',
        'prepare_governance_response',
        'review_policies_controls',
        'other'
      )
    );

  alter table public.data_requests drop constraint if exists data_requests_advisory_focus_areas_chk;
  alter table public.data_requests
    add constraint data_requests_advisory_focus_areas_chk
    check (
      request_type <> 'mk_advisory'
      or (
        coalesce(cardinality(areas_of_focus), 0) >= 1
        and areas_of_focus <@ array[
          'fraud_governance_oversight',
          'fraud_risk_identification_assessment',
          'operational_fraud_controls',
          'third_party_supplier_procurement_risk',
          'digital_identity_channel_fraud',
          'fraud_monitoring_detection',
          'incident_response_investigations',
          'fraud_culture_awareness',
          'other'
        ]::text[]
      )
    );

  alter table public.data_requests drop constraint if exists data_requests_advisory_contact_method_chk;
  alter table public.data_requests
    add constraint data_requests_advisory_contact_method_chk
    check (
      request_type <> 'mk_advisory'
      or preferred_contact_method in ('email', 'phone', 'video_meeting')
    );

  alter table public.data_requests drop constraint if exists data_requests_advisory_timeframe_chk;
  alter table public.data_requests
    add constraint data_requests_advisory_timeframe_chk
    check (
      request_type <> 'mk_advisory'
      or preferred_consultation_timeframe in ('within_one_week', 'within_two_weeks', 'within_one_month', 'exploring_options')
    );

  alter table public.data_requests drop constraint if exists data_requests_advisory_consent_chk;
  alter table public.data_requests
    add constraint data_requests_advisory_consent_chk
    check (request_type <> 'mk_advisory' or consent_contact is true);
end $$;

do $$
begin
  alter table public.assessment_events drop constraint if exists assessment_events_known_event_type_chk;
  alter table public.assessment_events
    add constraint assessment_events_known_event_type_chk check (event_type in (
      'assessment_started',
      'assessment_submitted',
      'snapshot_viewed',
      'executive_summary_viewed',
      'report_options_opened',
      'report_option_selected',
      'full_report_5000_selected',
      'personalised_report_50000_selected',
      'essential_selected',
      'comprehensive_selected',
      'advisory_selected',
      'advisory_enquiry_submitted',
      'comprehensive_order_created',
      'comprehensive_evidence_submitted',
      'comprehensive_review_signed_off',
      'eft_order_created',
      'payment_marked_received',
      'report_generated',
      'admin_report_downloaded',
      'report_emailed_to_customer',
      'internal_notification_queued',
      'internal_notification_sent',
      'internal_notification_failed'
    ));
end $$;

commit;
