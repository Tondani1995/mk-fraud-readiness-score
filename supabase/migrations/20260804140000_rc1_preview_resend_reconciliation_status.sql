-- G23: read the one-use reconciliation marker without consuming it on a provider failure.

begin;

create or replace function public.preview_development_resend_webhook_reconciliation_done()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'phase14_service_role_required';
  end if;
  return exists (
    select 1
    from public.rc1_preview_resend_webhook_reconciliation_runs
    where operation_key = 'resend_preview_webhook'
  );
end;
$$;

revoke all on function public.preview_development_resend_webhook_reconciliation_done()
  from public, anon, authenticated, service_role;
grant execute on function public.preview_development_resend_webhook_reconciliation_done()
  to service_role;

commit;
