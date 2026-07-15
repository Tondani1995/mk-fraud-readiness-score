\set ON_ERROR_STOP on

-- Disposable-local only. Reproduce the exact grants observed read-only in
-- production before proving that the missing grant/security closure removes
-- the broad runtime surface. Never execute against a linked project.
grant all privileges on table public.app_settings,public.email_events,public.reports
  to anon,authenticated,service_role;
grant all privileges on table public.email_provider_events,public.report_fulfilments,
  public.report_generation_runs to service_role;
revoke execute on function public.current_admin_role() from public;
revoke execute on function public.is_admin_role(public.admin_role[]) from public;
grant execute on function public.current_admin_role(),public.is_admin_role(public.admin_role[])
  to authenticated,service_role;
grant execute on function public.set_updated_at() to anon,authenticated,service_role;
update storage.buckets set file_size_limit=52428800,allowed_mime_types=null
where id='generated-reports';
alter table public.report_fulfilments
  drop constraint report_fulfilments_idempotency_key_unique,
  add constraint report_fulfilments_idempotency_key_key unique(idempotency_key);
