-- MK Fraud Readiness Score V1 - Phase 13 customer commercial conversion journey
-- Purpose: add additive personalised-report enquiry fields on data_requests.
-- This migration does not mutate scoring, methodology, reports, orders or prior assessment outcomes.

begin;

alter table public.data_requests
  add column if not exists request_reference text,
  add column if not exists primary_reason text,
  add column if not exists areas_of_focus text[] not null default '{}'::text[],
  add column if not exists preferred_contact_method text,
  add column if not exists preferred_consultation_timeframe text,
  add column if not exists consent_contact boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists data_requests_request_reference_uidx
  on public.data_requests(request_reference)
  where request_reference is not null;

create index if not exists data_requests_request_type_status_created_idx
  on public.data_requests(request_type, status, created_at desc);
create index if not exists data_requests_assessment_idx
  on public.data_requests(assessment_id);
create index if not exists data_requests_organisation_idx
  on public.data_requests(organisation_id);
create index if not exists data_requests_created_at_idx
  on public.data_requests(created_at desc);
create index if not exists data_requests_updated_at_idx
  on public.data_requests(updated_at desc);

create unique index if not exists data_requests_active_personalised_report_uidx
  on public.data_requests(assessment_id)
  where request_type = 'personalised_report_50000'
    and status in ('received', 'open', 'in_review')
    and assessment_id is not null;

do $$
begin
  alter table public.data_requests drop constraint if exists data_requests_personalised_reason_chk;
  alter table public.data_requests
    add constraint data_requests_personalised_reason_chk
    check (
      request_type <> 'personalised_report_50000'
      or primary_reason in (
        'understand_control_weaknesses',
        'design_strengthen_programme',
        'respond_incident_audit_control',
        'prepare_governance_response',
        'review_policies_controls',
        'other'
      )
    );

  alter table public.data_requests drop constraint if exists data_requests_personalised_focus_areas_chk;
  alter table public.data_requests
    add constraint data_requests_personalised_focus_areas_chk
    check (
      request_type <> 'personalised_report_50000'
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

  alter table public.data_requests drop constraint if exists data_requests_personalised_contact_method_chk;
  alter table public.data_requests
    add constraint data_requests_personalised_contact_method_chk
    check (
      request_type <> 'personalised_report_50000'
      or preferred_contact_method in ('email', 'phone', 'video_meeting')
    );

  alter table public.data_requests drop constraint if exists data_requests_personalised_timeframe_chk;
  alter table public.data_requests
    add constraint data_requests_personalised_timeframe_chk
    check (
      request_type <> 'personalised_report_50000'
      or preferred_consultation_timeframe in ('within_one_week', 'within_two_weeks', 'within_one_month', 'exploring_options')
    );

  alter table public.data_requests drop constraint if exists data_requests_personalised_reference_format_chk;
  alter table public.data_requests
    add constraint data_requests_personalised_reference_format_chk
    check (request_reference is null or request_reference ~ '^MKENQ-[0-9]{4}-[A-F0-9]{8}$');

  if not exists (
    select 1 from pg_trigger where tgname = 'trg_data_requests_updated_at'
  ) then
    create trigger trg_data_requests_updated_at
      before update on public.data_requests
      for each row execute function public.set_updated_at();
  end if;
end $$;

alter table public.data_requests enable row level security;
revoke all on table public.data_requests from anon, authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'data_requests' and policyname = 'data_requests_admin_select_commercial'
  ) then
    create policy data_requests_admin_select_commercial on public.data_requests
      for select using (public.current_admin_role() in ('platform_admin', 'reviewer', 'approver', 'finance_admin', 'read_only_admin'));
  end if;
end $$;

insert into public.app_settings (setting_key, value_json)
values (
  'phase13_customer_commercial_conversion',
  '{"status":"code_ready_pending_migration_uat","manual_eft_only":true,"full_report_offer":"R5,000 including VAT","personalised_report_offer":"From R50,000 including VAT","customer_instant_download":false,"automated_report_release":false,"payment_gateway":false,"proof_upload":false,"public_benchmarks":false,"live_ai_recommendations":false}'::jsonb
)
on conflict (setting_key) do update set value_json = excluded.value_json, updated_at = now();

commit;
