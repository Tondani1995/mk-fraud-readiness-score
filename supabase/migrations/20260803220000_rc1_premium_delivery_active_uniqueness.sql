-- RC1: concurrent authenticated certification requests must share one active delivery attempt.
--
-- The existing authorize_premium_report_delivery() advisory lock serialises its own transaction,
-- but that transaction ends before the provider dispatch begins. A second request can therefore
-- observe the first authorization in queued status and create a second email event. This additive
-- partial unique index makes the active-attempt invariant durable; the application maps the
-- constraint race to the existing in-progress outcome. Terminal historical attempts remain
-- allowed, preserving bounce/remediation history and provider idempotency contracts.

begin;

do $$
begin
  if to_regclass('public.report_delivery_authorizations') is null then
    raise exception 'rc1_premium_delivery_active_uniqueness_missing_table';
  end if;
  if exists (
    select 1
    from public.report_delivery_authorizations
    where status in ('queued', 'claimed', 'dispatching', 'reconciliation_required', 'retry_scheduled')
    group by report_id, recipient_email
    having count(*) > 1
  ) then
    raise exception 'rc1_premium_delivery_active_uniqueness_existing_duplicate';
  end if;
end;
$$;

create unique index if not exists report_delivery_authorizations_one_active_uidx
  on public.report_delivery_authorizations(report_id, recipient_email)
  where status in ('queued', 'claimed', 'dispatching', 'reconciliation_required', 'retry_scheduled');

commit;
