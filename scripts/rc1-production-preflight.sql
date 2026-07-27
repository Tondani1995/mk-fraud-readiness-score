\set ON_ERROR_STOP on
\pset pager off
\pset format unaligned
\pset tuples_only on

-- RC1 production preflight. READ ONLY.
-- Run with the production connection only after the owner has supplied the approved
-- recovery-point evidence. This script emits aggregate counts, versions and fingerprints;
-- it deliberately never selects order references, names, email addresses, UUIDs or payloads.
set statement_timeout = '30s';
begin;
set transaction read only;

\echo RC1_PREFLIGHT_BEGIN

select 'ledger_total|' || count(*) from supabase_migrations.schema_migrations;
select 'ledger_total_result|' || case when count(*) = 34 then 'PASS' else 'STOP' end
from supabase_migrations.schema_migrations;
select 'ledger_newest|' || coalesce(max(version), 'MISSING') from supabase_migrations.schema_migrations;
select 'ledger_newest_result|' || case when max(version) = '20260721150808' then 'PASS' else 'STOP' end
from supabase_migrations.schema_migrations;

with pending(version) as (
  values
    ('20260722143000'), ('20260724150000'), ('20260724160000'),
    ('20260724170000'), ('20260724180000'), ('20260725090000'),
    ('20260725150000')
)
select 'authorised_pending_already_recorded|' || count(*)
from pending p join supabase_migrations.schema_migrations m using (version);
select 'authorised_pending_result|' || case when count(*) = 0 then 'PASS' else 'STOP' end
from (
  select m.version
  from supabase_migrations.schema_migrations m
  where m.version in ('20260722143000','20260724150000','20260724160000',
                      '20260724170000','20260724180000','20260725090000','20260725150000')
) already;

with current_reports as (
  select distinct on (r.order_id) r.order_id, r.storage_status
  from public.reports r
  join public.orders o on o.id = r.order_id
  where o.status = 'payment_received'
    and r.status not in ('superseded', 'voided')
  order by r.order_id, r.version_number desc, r.created_at desc, r.id
), classified as (
  select o.id,
    case
      when r.order_id is null then 'NO_REPORT'
      when r.storage_status = 'VERIFIED' then 'CURRENT_VERIFIED'
      when r.storage_status = 'NOT_STORED' then 'CURRENT_NOT_STORED'
      else 'OTHER_CURRENT_STATE'
    end as classification
  from public.orders o left join current_reports r on r.order_id = o.id
  where o.status = 'payment_received'
)
select 'payment_received_total|' || count(*) from classified;
select 'payment_received_total_result|' || case when count(*) = 18 then 'PASS' else 'STOP' end
from public.orders where status = 'payment_received';
with current_reports as (
  select distinct on (r.order_id) r.order_id, r.storage_status
  from public.reports r join public.orders o on o.id = r.order_id
  where o.status = 'payment_received' and r.status not in ('superseded','voided')
  order by r.order_id, r.version_number desc, r.created_at desc, r.id
), classified as (
  select case when r.order_id is null then 'NO_REPORT'
              when r.storage_status = 'VERIFIED' then 'CURRENT_VERIFIED'
              when r.storage_status = 'NOT_STORED' then 'CURRENT_NOT_STORED'
              else 'OTHER_CURRENT_STATE' end classification
  from public.orders o left join current_reports r on r.order_id = o.id
  where o.status = 'payment_received'
)
select 'classification_counts|' ||
  count(*) filter (where classification = 'CURRENT_VERIFIED') || '|' ||
  count(*) filter (where classification = 'CURRENT_NOT_STORED') || '|' ||
  count(*) filter (where classification = 'NO_REPORT') || '|' ||
  count(*) filter (where classification = 'OTHER_CURRENT_STATE')
from classified;
with current_reports as (
  select distinct on (r.order_id) r.order_id, r.storage_status
  from public.reports r join public.orders o on o.id = r.order_id
  where o.status = 'payment_received' and r.status not in ('superseded','voided')
  order by r.order_id, r.version_number desc, r.created_at desc, r.id
), classified as (
  select case when r.order_id is null then 'NO_REPORT'
              when r.storage_status = 'VERIFIED' then 'CURRENT_VERIFIED'
              when r.storage_status = 'NOT_STORED' then 'CURRENT_NOT_STORED'
              else 'OTHER_CURRENT_STATE' end classification
  from public.orders o left join current_reports r on r.order_id = o.id
  where o.status = 'payment_received'
)
select 'classification_result|' || case when
  count(*) filter (where classification = 'CURRENT_VERIFIED') = 2 and
  count(*) filter (where classification = 'CURRENT_NOT_STORED') = 13 and
  count(*) filter (where classification = 'NO_REPORT') = 3 and
  count(*) filter (where classification = 'OTHER_CURRENT_STATE') = 0
then 'PASS' else 'STOP' end from classified;

select 'active_generation_attempts|' || count(*)
from public.manual_report_generation_attempts
where status in ('REPORT_QUEUED','REPORT_GENERATING','DELIVERY_QUEUED',
                 'RETRY_SCHEDULED','AWAITING_QUALITY_REVIEW');
select 'active_generation_result|' || case when count(*) = 0 then 'PASS' else 'STOP' end
from public.manual_report_generation_attempts
where status in ('REPORT_QUEUED','REPORT_GENERATING','DELIVERY_QUEUED',
                 'RETRY_SCHEDULED','AWAITING_QUALITY_REVIEW');
select 'payment_automation_records|' || count(*) from public.payment_automation_records;
select 'payment_automation_result|' || case when count(*) = 0 then 'PASS' else 'STOP' end
from public.payment_automation_records;

select 'unexpected_activity|' ||
  (select count(*) from public.report_delivery_authorizations) || '|' ||
  (select count(*) from public.report_delivery_finalizations) || '|' ||
  (select count(*) from public.report_delivery_remediations) || '|' ||
  (select count(*) from public.email_provider_events) || '|' ||
  (select count(*) from public.phase14_provider_attestations) || '|' ||
  (select count(*) from public.phase14_operational_alerts);
select 'unexpected_activity_result|' || case when
  (select count(*) from public.report_delivery_authorizations) = 0 and
  (select count(*) from public.report_delivery_finalizations) = 0 and
  (select count(*) from public.report_delivery_remediations) = 0 and
  (select count(*) from public.email_provider_events) = 0 and
  (select count(*) from public.phase14_provider_attestations) = 0 and
  (select count(*) from public.phase14_operational_alerts) = 0
then 'PASS' else 'STOP' end;

select 'database_visible_email_provider_mode|' || coalesce(
  (select value_json->>'mode' from public.app_settings
   where setting_key in ('email_provider_mode','phase14_email_provider_mode') limit 1),
  'NOT_DATABASE_VISIBLE');
select 'database_visible_phase14_security_gate_rows|' || count(*) from public.phase14_security_gates;

with expected(name, args) as (
  values
    ('claim_payment_report_generation','text,text,text'),
    ('record_payment_transition','text,text,text,text,integer,text,text,text,timestamptz,text,text,text,text,text'),
    ('approve_quality_review','uuid,text'),
    ('claim_premium_report_delivery','uuid,text'),
    ('invalidate_phase14_authority_on_gate_change',''),
    ('set_phase14_runtime_secret','text,text')
), found as (
  select e.name, e.args, p.oid
  from expected e left join pg_proc p
    on p.pronamespace = 'public'::regnamespace
   and p.proname = e.name
   and replace(pg_get_function_identity_arguments(p.oid), ' ', '') = e.args
)
select 'rpc_fingerprint|' || name || '(' || args || ')|' ||
  coalesce(md5(pg_get_functiondef(oid)), 'MISSING')
from found order by name, args;

\echo RC1_PREFLIGHT_END
rollback;
