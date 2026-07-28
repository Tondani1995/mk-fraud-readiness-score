\set ON_ERROR_STOP on
\pset pager off
\pset format unaligned
\pset tuples_only on

-- RC1 Production preflight. READ ONLY and fail closed.
-- Required values are supplied by the controller-approved, non-PII manifest:
--   rc1_approved_rpc_baseline_json
--   rc1_expected_baseline_counts_json
--   rc1_approved_protected_state_fingerprint
--   rc1_approved_email_status_counts_json
--   rc1_approved_email_status_fingerprint
-- The script never emits UUIDs, order references, emails, names, report content or function bodies.
\if :{?rc1_approved_rpc_baseline_json}
\else
\echo STOP|missing_rc1_approved_rpc_baseline_json
\quit 3
\endif
\if :{?rc1_expected_baseline_counts_json}
\else
\echo STOP|missing_rc1_expected_baseline_counts_json
\quit 3
\endif
\if :{?rc1_approved_protected_state_fingerprint}
\else
\echo STOP|missing_rc1_approved_protected_state_fingerprint
\quit 3
\endif
\if :{?rc1_approved_email_status_counts_json}
\else
\echo STOP|missing_rc1_approved_email_status_counts_json
\quit 3
\endif
\if :{?rc1_approved_email_status_fingerprint}
\else
\echo STOP|missing_rc1_approved_email_status_fingerprint
\quit 3
\endif
\if :{?rc1_expected_application_freeze_mode}
\else
\echo STOP|missing_rc1_expected_application_freeze_mode
\quit 3
\endif

set statement_timeout = '30s';
begin;
set transaction read only;

\echo RC1_PREFLIGHT_BEGIN

select 'application_freeze_mode_result|' || case
  when :'rc1_expected_application_freeze_mode' = 'frozen' then 'PASS'
  else 'STOP'
end;

select 'ledger_total_result|' || case when count(*) = 34 then 'PASS' else 'STOP' end
from supabase_migrations.schema_migrations;
select 'ledger_newest_result|' || case when max(version) = '20260721150808' then 'PASS' else 'STOP' end
from supabase_migrations.schema_migrations;

with pending(version) as (
  values ('20260722120000'), ('20260722143000'), ('20260724150000'), ('20260724160000'),
         ('20260724170000'), ('20260724180000'), ('20260725090000'),
         ('20260725150000'), ('20260728120000')
)
select 'pending_versions_result|' || case when count(m.version) = 0 then 'PASS' else 'STOP' end
from pending p left join supabase_migrations.schema_migrations m using (version);

with expected(table_name, column_name, expected_count) as (
  values
    ('manual_report_generation_attempts','lease_owner',0),
    ('manual_report_generation_attempts','lease_expires_at',0),
    ('report_delivery_authorizations','lease_owner',0),
    ('report_delivery_authorizations','lease_token',1),
    ('report_delivery_authorizations','lease_expires_at',1)
), actual as (
  select e.*, count(c.column_name)::integer as actual_count
  from expected e
  left join information_schema.columns c
    on c.table_schema='public' and c.table_name=e.table_name and c.column_name=e.column_name
  group by e.table_name,e.column_name,e.expected_count
)
select 'pre_migration_capability_result|' || case when
  count(*)=5 and bool_and(actual_count=expected_count)
  and to_regclass('public.customer_report_access_tokens') is null
  and to_regclass('public.rc1_operation_freeze_state') is null
  and to_regprocedure('public.rc1_freeze_status()') is null
then 'PASS' else 'STOP' end
from actual;

with current_reports as (
  select distinct on (r.order_id, r.report_type)
    r.order_id, r.report_type, r.id as report_id, r.storage_status
  from public.reports r
  join public.orders o on o.id = r.order_id
  where o.status = 'payment_received' and r.status not in ('superseded', 'voided')
  order by r.order_id, r.report_type, r.version_number desc, r.created_at desc, r.id
), classified as (
  select o.id,
    case when r.order_id is null then 'NO_REPORT'
         when r.storage_status = 'VERIFIED' then 'CURRENT_VERIFIED'
         when r.storage_status = 'NOT_STORED' then 'CURRENT_NOT_STORED'
         else 'OTHER_CURRENT_STATE' end as classification
  from public.orders o
  left join current_reports r on r.order_id = o.id and r.report_type = 'essential_self_assessment'
  where o.status = 'payment_received'
), counts as (
  select count(*) as payment_received,
    count(*) filter (where classification = 'CURRENT_VERIFIED') as current_verified,
    count(*) filter (where classification = 'CURRENT_NOT_STORED') as current_not_stored,
    count(*) filter (where classification = 'NO_REPORT') as no_report,
    count(*) filter (where classification = 'OTHER_CURRENT_STATE') as other_current_state
  from classified
)
select 'classification_counts_result|' || case when
  payment_received = 18 and current_verified = 2 and current_not_stored = 13 and
  no_report = 3 and other_current_state = 0 and
  encode(extensions.digest(convert_to(
    format('payment_received=%s|CURRENT_VERIFIED=%s|CURRENT_NOT_STORED=%s|NO_REPORT=%s|OTHER_CURRENT_STATE=%s',
      payment_received, current_verified, current_not_stored, no_report, other_current_state), 'UTF8'), 'sha256'), 'hex') =
    '282e23d1aade6ddffd0d0e6a09ad3963ba04d0f299fc1188f2d43ab4afd9c47b'
then 'PASS' else 'STOP' end
from counts;

select 'duplicate_current_reports_result|' || case when not exists (
  select 1 from public.reports r
  join public.orders o on o.id = r.order_id
  where o.status = 'payment_received' and r.status not in ('superseded', 'voided')
  group by r.order_id, r.report_type having count(*) > 1
) then 'PASS' else 'STOP' end;

with protected_reports as (
  select r.*, o.customer_email, o.updated_at as order_updated_at
  from public.reports r
  join public.orders o on o.id = r.order_id
  where o.status = 'payment_received'
    and r.report_type = 'essential_self_assessment'
    and r.status not in ('superseded', 'voided')
    and r.storage_status = 'VERIFIED'
    and r.version_number = (select max(r2.version_number) from public.reports r2
                             where r2.order_id = r.order_id and r2.report_type = r.report_type
                               and r2.status not in ('superseded', 'voided'))
), protected as (
  select encode(extensions.digest(convert_to(jsonb_build_object(
    'order_id',r.order_id,
    'report_id',r.id,
    'report_type',r.report_type,
    'report_version',r.version_number,
    'report_status',r.status,
    'storage_status',r.storage_status,
    'storage_locator_fingerprint',encode(extensions.digest(convert_to(
      coalesce(r.storage_bucket,'') || ':' || coalesce(r.storage_path,''),'UTF8'),'sha256'),'hex'),
    'order_recipient_fingerprint',encode(extensions.digest(convert_to(
      lower(coalesce(r.customer_email::text,'')),'UTF8'),'sha256'),'hex'),
    'manual_delivery_state_fingerprint',coalesce((
      select encode(extensions.digest(convert_to(coalesce(string_agg(jsonb_build_object(
        'status',m.status,
        'recipient_fingerprint',encode(extensions.digest(convert_to(
          lower(coalesce(m.recipient_email::text,'')),'UTF8'),'sha256'),'hex'),
        'updated_at',m.updated_at
      )::text,'|' order by m.id),''),'UTF8'),'sha256'),'hex')
      from public.manual_report_delivery_attempts m
      where m.order_id=r.order_id and m.report_id=r.id
    ),''),
    'delivery_authorization_state_fingerprint',coalesce((
      select encode(extensions.digest(convert_to(coalesce(string_agg(jsonb_build_object(
        'status',d.status,
        'recipient_fingerprint',encode(extensions.digest(convert_to(
          lower(coalesce(d.recipient_email::text,'')),'UTF8'),'sha256'),'hex'),
        'lease_token_present',d.lease_token is not null,
        'lease_expires_at',d.lease_expires_at,
        'updated_at',d.updated_at
      )::text,'|' order by d.id),''),'UTF8'),'sha256'),'hex')
      from public.report_delivery_authorizations d
      where d.order_id=r.order_id and d.report_id=r.id
    ),''),
    'report_updated_at',r.updated_at,
    'order_updated_at',r.order_updated_at
  )::text,'UTF8'),'sha256'),'hex') as row_fingerprint
  from protected_reports r
)
select 'protected_state_fingerprint_result|' || case when count(*) = 2 and
  encode(extensions.digest(convert_to(coalesce(string_agg(row_fingerprint, '|' order by row_fingerprint), ''), 'UTF8'), 'sha256'), 'hex') =
    :'rc1_approved_protected_state_fingerprint'
then 'PASS' else 'STOP' end
from protected;

select 'active_generation_result|' || case when count(*) = 0 then 'PASS' else 'STOP' end
from public.manual_report_generation_attempts
where status in ('REPORT_QUEUED','REPORT_GENERATING','DELIVERY_QUEUED','RETRY_SCHEDULED','AWAITING_QUALITY_REVIEW');
select 'active_delivery_lease_result|' || case when count(*) = 0 then 'PASS' else 'STOP' end
from public.report_delivery_authorizations
where lease_token is not null or lease_expires_at is not null or status in ('claimed','dispatching');
with provider_modes as (
  select coalesce(value_json->>'mode',value_json#>>'{}') as mode
  from public.app_settings
  where setting_key in ('email_provider_mode','phase14_email_provider_mode')
)
select 'provider_mode_database_visibility_result|' || case
  when count(*)=0 then 'NOT_DATABASE_VISIBLE'
  when bool_and(mode='disabled') then 'PASS'
  else 'STOP' end
from provider_modes;
with status_counts as (
  select coalesce(jsonb_object_agg(status, event_count), '{}'::jsonb) as value
  from (
    select status, count(*) as event_count
    from public.email_events
    group by status
    order by status
  ) counts
)
select 'email_status_baseline_result|' || case when
  value = :'rc1_approved_email_status_counts_json'::jsonb
  and encode(extensions.digest(convert_to(value::text, 'UTF8'), 'sha256'), 'hex') =
      :'rc1_approved_email_status_fingerprint'
then 'PASS' else 'STOP' end
from status_counts;
select 'provider_database_activity_result|' || case when
  (select count(*) from public.email_provider_events)=0
then 'PASS' else 'STOP' end;
select 'delivery_state_result|' || case when
  (select count(*) from public.report_delivery_authorizations where status in ('queued','dispatching','ready')) = 0
  and (select count(*) from public.report_delivery_finalizations) = 0
  and (select count(*) from public.report_delivery_remediations) = 0
then 'PASS' else 'STOP' end;

with expected(key, value) as (
  select key, value from jsonb_each_text(:'rc1_expected_baseline_counts_json'::jsonb)
), actual(key, value) as (
  values
    ('order_events', (select count(*)::text from public.order_events)),
    ('report_events', (select count(*)::text from public.report_events)),
    ('email_events', (select count(*)::text from public.email_events)),
    ('email_provider_events', (select count(*)::text from public.email_provider_events)),
    ('report_delivery_authorizations', (select count(*)::text from public.report_delivery_authorizations)),
    ('report_delivery_finalizations', (select count(*)::text from public.report_delivery_finalizations)),
    ('report_delivery_remediations', (select count(*)::text from public.report_delivery_remediations)),
    ('phase14_operational_alerts', (select count(*)::text from public.phase14_operational_alerts)),
    ('manual_report_generation_attempts', (select count(*)::text from public.manual_report_generation_attempts)),
    ('reports', (select count(*)::text from public.reports)),
    ('payment_automation_records', (select count(*)::text from public.payment_automation_records)),
    ('customer_report_access_tokens', case when to_regclass('public.customer_report_access_tokens') is null then '0' else 'EARLY_PRESENT' end),
    ('storage.objects', (select count(*)::text from storage.objects)),
    ('orders', (select count(*)::text from public.orders))
)
select 'baseline_counts_result|' || case when
  (select count(*) from expected) = 14 and
  not exists (select 1 from expected e left join actual a using (key) where a.value is null or a.value <> e.value)
then 'PASS' else 'STOP' end;

with expected(key, fingerprint) as (
  select key, value from jsonb_each_text(:'rc1_approved_rpc_baseline_json'::jsonb)
),
actual as (
  select e.key, e.fingerprint, count(p.oid) as matches,
    max(md5(pg_get_functiondef(p.oid))) as actual_fingerprint
  from expected e
  left join pg_proc p on p.pronamespace = 'public'::regnamespace
    and p.proname = substring(e.key from '^([^()]+)')
    and replace(replace(array_to_string(array(select format_type(t, null) from unnest(p.proargtypes) t), ','), 'timestamp with time zone', 'timestamptz'), ' ', '') = substring(e.key from '\((.*)\)$')
  group by e.key, e.fingerprint
)
select 'rpc_baseline_result|' || case when
  (select count(*) from expected) = 5 and
  not exists (select 1 from actual where matches <> 1 or actual_fingerprint is distinct from fingerprint)
then 'PASS' else 'STOP' end;

\echo RC1_PREFLIGHT_END
rollback;
