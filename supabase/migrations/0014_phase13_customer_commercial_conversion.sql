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
  if not exists (
    select 1 from pg_constraint where conname = 'data_requests_personalised_reason_chk'
  ) then
    alter table public.data_requests
      add constraint data_requests_personalised_reason_chk
      check (
        request_type <> 'personalised_report_50000'
        or primary_reason is null
        or primary_reason in (
          'board_or_executive_readout',
          'control_improvement_planning',
          'fraud_risk_review',
          'pre_audit_or_assurance',
          'other'
        )
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'data_requests_personalised_contact_method_chk'
  ) then
    alter table public.data_requests
      add constraint data_requests_personalised_contact_method_chk
      check (
        request_type <> 'personalised_report_50000'
        or preferred_contact_method is null
        or preferred_contact_method in ('email', 'phone', 'video_call')
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'data_requests_personalised_timeframe_chk'
  ) then
    alter table public.data_requests
      add constraint data_requests_personalised_timeframe_chk
      check (
        request_type <> 'personalised_report_50000'
        or preferred_consultation_timeframe is null
        or preferred_consultation_timeframe in ('this_week', 'two_weeks', 'this_month', 'exploring')
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'data_requests_personalised_reference_format_chk'
  ) then
    alter table public.data_requests
      add constraint data_requests_personalised_reference_format_chk
      check (request_reference is null or request_reference ~ '^MKENQ-[0-9]{4}-[A-F0-9]{8}$');
  end if;

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
  '{"status":"code_ready_pending_migration_uat","manual_eft_only":true,"customer_instant_download":false,"automated_report_release":false,"payment_gateway":false,"proof_upload":false,"public_benchmarks":false,"live_ai_recommendations":false}'::jsonb
)
on conflict (setting_key) do update set value_json = excluded.value_json, updated_at = now();

commit;
