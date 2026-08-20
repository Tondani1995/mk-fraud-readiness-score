-- G23: one-use marker for the exact Preview-development Resend webhook reconciliation action.
-- This marker is Staging-only and is not a replacement for the provider's own configuration.

begin;

create table if not exists public.rc1_preview_resend_webhook_reconciliation_runs (
  operation_key text primary key,
  deployment_id text not null,
  completed_at timestamptz not null default now(),
  constraint rc1_preview_resend_reconciliation_key_check
    check (operation_key = 'resend_preview_webhook'),
  constraint rc1_preview_resend_reconciliation_deployment_check
    check (deployment_id ~ '^dpl_[A-Za-z0-9_-]+$')
);

alter table public.rc1_preview_resend_webhook_reconciliation_runs enable row level security;
revoke all on table public.rc1_preview_resend_webhook_reconciliation_runs from public, anon, authenticated, service_role;

create or replace function public.preview_development_record_resend_webhook_reconciliation(
  p_deployment_id text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' then
    raise exception 'phase14_service_role_required';
  end if;
  if p_deployment_id is null or p_deployment_id !~ '^dpl_[A-Za-z0-9_-]+$' then
    raise exception 'preview_development_reconciliation_deployment_invalid';
  end if;
  insert into public.rc1_preview_resend_webhook_reconciliation_runs(operation_key, deployment_id)
  values ('resend_preview_webhook', p_deployment_id)
  on conflict (operation_key) do nothing
  returning operation_key into v_key;
  return v_key is not null;
end;
$$;

revoke all on function public.preview_development_record_resend_webhook_reconciliation(text)
  from public, anon, authenticated, service_role;
grant execute on function public.preview_development_record_resend_webhook_reconciliation(text)
  to service_role;

commit;
