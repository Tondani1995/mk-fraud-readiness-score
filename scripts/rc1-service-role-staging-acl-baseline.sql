\set ON_ERROR_STOP on

-- Disposable PostgreSQL only: reproduce the permanent staging 45-migration effective CRUD state
-- before migration 46. This file is never an application migration and must never be run against
-- staging or Production.
\if :{?RC1_DISPOSABLE_LOCAL_ACK}
\else
  \set RC1_DISPOSABLE_LOCAL_ACK ''
\endif
select set_config(
  'rc1.disposable_local_ack',
  :'RC1_DISPOSABLE_LOCAL_ACK',
  false
);

do $$
begin
  if current_database() <> 'postgres'
     or current_setting('rc1.disposable_local_ack', true) <> 'acknowledged-local-only' then
    raise exception 'rc1_service_role_baseline_disposable_loopback_only';
  end if;
end;
$$;

revoke select, insert, update, delete on all tables in schema public from service_role;

grant select on table
  public.app_settings,
  public.assessment_events,
  public.assessment_resume_events,
  public.audit_logs,
  public.email_events,
  public.email_provider_events,
  public.manual_report_delivery_attempts,
  public.manual_report_generation_attempts,
  public.payment_automation_records,
  public.payment_sessions,
  public.payment_transition_events,
  public.payment_unmatched_events,
  public.phase14_ai_route_policies,
  public.phase14_feature_policies,
  public.phase14_security_gates,
  public.report_events,
  public.reports
to service_role;

grant insert on table
  public.assessment_events,
  public.assessment_resume_events,
  public.audit_logs,
  public.email_events,
  public.email_provider_events,
  public.payment_automation_records,
  public.payment_sessions,
  public.payment_transition_events,
  public.payment_unmatched_events,
  public.report_events,
  public.reports
to service_role;

grant update on table
  public.assessment_events,
  public.audit_logs,
  public.email_events,
  public.email_provider_events,
  public.payment_automation_records,
  public.payment_sessions,
  public.report_events,
  public.reports
to service_role;

grant delete on table
  public.assessment_events,
  public.audit_logs,
  public.email_events,
  public.email_provider_events,
  public.report_events
to service_role;

do $$
begin
  if has_table_privilege('service_role','public.methodology_versions','SELECT') then
    raise exception 'rc1_service_role_baseline_methodology_unexpected_access';
  end if;
  if has_table_privilege('service_role','public.admin_profiles','SELECT') then
    raise exception 'rc1_service_role_baseline_admin_profile_unexpected_access';
  end if;
end;
$$;
