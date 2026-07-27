\set ON_ERROR_STOP on
\pset pager off
\pset format unaligned
\pset tuples_only on

-- RC1 production postflight. READ ONLY.
-- Required invocation variable: rc1_cutover_started_at='ISO-8601 UTC timestamp'.
-- This script emits aggregate state, object existence and definition fingerprints only.
-- It never selects customer identifiers, emails, order references, UUIDs or payloads.
set statement_timeout = '30s';
begin;
set transaction read only;

\echo RC1_POSTFLIGHT_BEGIN

with authorised(version, name) as (
  values
    ('20260722143000','checkpoint_e_phase1_ai_attempt_binding'),
    ('20260724150000','release_a_backlog_reconciliation'),
    ('20260724160000','release_b_durable_fulfilment'),
    ('20260724170000','release_c_email_secure_delivery'),
    ('20260724180000','release_c_closure_delivery_exceptions'),
    ('20260725090000','release_c_runtime_secret_admin_provisioning'),
    ('20260725150000','release_d_operational_alert_lifecycle')
)
select 'authorised_ledger_rows|' || count(*)
from authorised a join supabase_migrations.schema_migrations m
  on m.version = a.version and m.name = a.name;
select 'authorised_ledger_result|' || case when count(*) = 7 then 'PASS' else 'STOP' end
from (
  select m.version
  from supabase_migrations.schema_migrations m
  where m.version in ('20260722143000','20260724150000','20260724160000',
                      '20260724170000','20260724180000','20260725090000','20260725150000')
  group by m.version having count(*) = 1
) one_each;
select 'authorised_ledger_duplicate_versions|' || count(*)
from supabase_migrations.schema_migrations
where version in ('20260722143000','20260724150000','20260724160000',
                  '20260724170000','20260724180000','20260725090000','20260725150000')
group by version having count(*) > 1;

with required(table_name) as (
  values ('backlog_reconciliation_records'), ('customer_report_access_tokens')
)
select 'required_tables_result|' || case when count(*) = 2 then 'PASS' else 'STOP' end
from required r join information_schema.tables t
  on t.table_schema = 'public' and t.table_name = r.table_name;

with required(table_name, column_name) as (
  values
    ('report_ai_attempts','manual_generation_attempt_id'),
    ('manual_report_generation_attempts','generation_mode'),
    ('manual_report_generation_attempts','lease_owner'),
    ('manual_report_generation_attempts','lease_expires_at'),
    ('manual_report_generation_attempts','heartbeat_at'),
    ('manual_report_generation_attempts','next_attempt_at'),
    ('manual_report_generation_attempts','max_attempts'),
    ('manual_report_generation_attempts','quality_reviewed_by'),
    ('manual_report_generation_attempts','quality_reviewed_at'),
    ('manual_report_generation_attempts','quality_review_decision'),
    ('manual_report_generation_attempts','quality_review_reason'),
    ('manual_report_generation_attempts','regenerated_from_attempt_id'),
    ('manual_report_generation_attempts','delivery_queued_at'),
    ('report_generation_runs','final_narrative_json'),
    ('report_delivery_authorizations','next_attempt_at'),
    ('report_delivery_authorizations','max_attempts'),
    ('report_delivery_authorizations','retry_count'),
    ('phase14_operational_alerts','acknowledged_at'),
    ('phase14_operational_alerts','acknowledged_by'),
    ('phase14_operational_alerts','resolved_by'),
    ('phase14_operational_alerts','last_status_changed_at')
)
select 'required_columns_result|' || case when count(*) = 21 then 'PASS' else 'STOP' end
from required r join information_schema.columns c
  on c.table_schema = 'public' and c.table_name = r.table_name and c.column_name = r.column_name;

with required(index_name) as (
  values
    ('report_ai_attempts_manual_generation_idx'),
    ('manual_report_generation_attempts_status_next_attempt_idx'),
    ('manual_report_generation_attempts_lease_expiry_idx'),
    ('report_delivery_authorizations_status_next_attempt_idx'),
    ('report_delivery_authorizations_lease_expiry_idx'),
    ('customer_report_access_tokens_active_uidx'),
    ('customer_report_access_tokens_order_idx'),
    ('customer_report_access_tokens_expiry_idx'),
    ('phase14_operational_alerts_severity_created_idx'),
    ('phase14_operational_alerts_list_idx'),
    ('phase14_operational_alerts_open_critical_idx'),
    ('phase14_operational_alerts_category_idx')
)
select 'required_indexes_result|' || case when count(*) = 12 then 'PASS' else 'STOP' end
from required r join pg_class c on c.relname = r.index_name
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public';

with expected(name, args) as (
  values
    ('claim_next_fulfilment_job','text,integer'),
    ('fail_fulfilment_job','uuid,text,text,text,text'),
    ('submit_for_quality_review','uuid,text'),
    ('approve_quality_review','uuid,text'),
    ('reject_quality_review','uuid,text'),
    ('retry_fulfilment_job','uuid'),
    ('recover_fulfilment_job','uuid'),
    ('claim_payment_report_generation','text,text,text'),
    ('record_payment_transition','text,text,text,text,integer,text,text,text,timestamptz,text,text,text,text,text'),
    ('classify_backlog_order','uuid,uuid,text,text,uuid,text,date,text'),
    ('backlog_reconciliation_queue',''),
    ('claim_next_delivery','text,integer'),
    ('mark_delivery_dispatch_started','uuid,uuid'),
    ('finalize_delivery','uuid,uuid,text'),
    ('fail_delivery','uuid,uuid,text,text,text'),
    ('retry_delivery','uuid'),
    ('issue_customer_report_access_token','uuid,uuid,text,integer'),
    ('revoke_customer_report_access_token','uuid,text'),
    ('reissue_customer_report_access_token','uuid,uuid,text,text,integer,boolean'),
    ('apply_email_provider_event_atomic','text,text,text,text,timestamptz,text,jsonb'),
    ('correct_delivery_recipient_and_queue','uuid,text,text'),
    ('set_phase14_runtime_secret','text,text,text'),
    ('transition_phase14_operational_alert','uuid,text,text'),
    ('authorize_manual_report_ai_action','uuid,text'),
    ('claim_manual_report_ai_attempt','jsonb'),
    ('settle_manual_report_ai_attempt','uuid,jsonb'),
    ('record_manual_report_narrative_provenance','uuid,jsonb')
), found as (
  select e.name, e.args, p.oid
  from expected e left join pg_proc p
    on p.pronamespace = 'public'::regnamespace
   and p.proname = e.name
   and replace(pg_get_function_identity_arguments(p.oid), ' ', '') = e.args
)
select 'required_rpc_signatures_result|' || case when count(*) filter (where oid is not null) = 27 then 'PASS' else 'STOP' end
from found;
with expected(name, args) as (
  values
    ('claim_next_fulfilment_job','text,integer'),
    ('fail_fulfilment_job','uuid,text,text,text,text'),
    ('submit_for_quality_review','uuid,text'),
    ('approve_quality_review','uuid,text'),
    ('reject_quality_review','uuid,text'),
    ('retry_fulfilment_job','uuid'),
    ('recover_fulfilment_job','uuid'),
    ('claim_payment_report_generation','text,text,text'),
    ('record_payment_transition','text,text,text,text,integer,text,text,text,timestamptz,text,text,text,text,text'),
    ('classify_backlog_order','uuid,uuid,text,text,uuid,text,date,text'),
    ('backlog_reconciliation_queue',''),
    ('claim_next_delivery','text,integer'),
    ('mark_delivery_dispatch_started','uuid,uuid'),
    ('finalize_delivery','uuid,uuid,text'),
    ('fail_delivery','uuid,uuid,text,text,text'),
    ('retry_delivery','uuid'),
    ('issue_customer_report_access_token','uuid,uuid,text,integer'),
    ('revoke_customer_report_access_token','uuid,text'),
    ('reissue_customer_report_access_token','uuid,uuid,text,text,integer,boolean'),
    ('apply_email_provider_event_atomic','text,text,text,text,timestamptz,text,jsonb'),
    ('correct_delivery_recipient_and_queue','uuid,text,text'),
    ('set_phase14_runtime_secret','text,text,text'),
    ('transition_phase14_operational_alert','uuid,text,text'),
    ('authorize_manual_report_ai_action','uuid,text'),
    ('claim_manual_report_ai_attempt','jsonb'),
    ('settle_manual_report_ai_attempt','uuid,jsonb'),
    ('record_manual_report_narrative_provenance','uuid,jsonb')
), found as (
  select e.name, e.args, p.oid
  from expected e left join pg_proc p
    on p.pronamespace = 'public'::regnamespace
   and p.proname = e.name
   and replace(pg_get_function_identity_arguments(p.oid), ' ', '') = e.args
)
select 'rpc_definition_fingerprint|' || name || '(' || args || ')|' ||
  coalesce(md5(pg_get_functiondef(oid)), 'MISSING') || '|security_definer=' ||
  coalesce((select prosecdef::text from pg_proc where oid = found.oid), 'MISSING') ||
  '|search_path_controlled=' || coalesce((select
    exists(select 1 from unnest(coalesce(proconfig, ARRAY[]::text[])) cfg where cfg like 'search_path=%')::text
    from pg_proc where oid = found.oid)::text, 'MISSING')
from found order by name, args;

select 'key_grants_result|' || case when
  exists (select 1 from information_schema.role_table_grants
          where grantee = 'authenticated' and table_schema = 'public'
            and table_name = 'backlog_reconciliation_records' and privilege_type = 'SELECT') and
  exists (select 1 from information_schema.role_table_grants
          where grantee = 'authenticated' and table_schema = 'public'
            and table_name = 'customer_report_access_tokens' and privilege_type = 'SELECT') and
  (select coalesce(bool_and(has_function_privilege('service_role', p.oid, 'EXECUTE')), false)
   from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'claim_next_fulfilment_job'
     and replace(pg_get_function_identity_arguments(p.oid), ' ', '') = 'text,integer') and
  (select coalesce(bool_and(has_function_privilege('service_role', p.oid, 'EXECUTE')), false)
   from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'claim_next_delivery'
     and replace(pg_get_function_identity_arguments(p.oid), ' ', '') = 'text,integer') and
  (select coalesce(bool_and(has_function_privilege('authenticated', p.oid, 'EXECUTE')), false)
   from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'classify_backlog_order'
     and replace(pg_get_function_identity_arguments(p.oid), ' ', '') = 'uuid,uuid,text,text,uuid,text,date,text') and
  (select coalesce(bool_and(has_function_privilege('authenticated', p.oid, 'EXECUTE')), false)
   from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'approve_quality_review'
     and replace(pg_get_function_identity_arguments(p.oid), ' ', '') = 'uuid,text') and
  (select coalesce(bool_and(has_function_privilege('authenticated', p.oid, 'EXECUTE')), false)
   from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'issue_customer_report_access_token'
     and replace(pg_get_function_identity_arguments(p.oid), ' ', '') = 'uuid,uuid,text,integer') and
  (select coalesce(bool_and(has_function_privilege('authenticated', p.oid, 'EXECUTE')), false)
   from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'set_phase14_runtime_secret'
     and replace(pg_get_function_identity_arguments(p.oid), ' ', '') = 'text,text,text') and
  (select coalesce(bool_and(has_function_privilege('authenticated', p.oid, 'EXECUTE')), false)
   from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = 'transition_phase14_operational_alert'
     and replace(pg_get_function_identity_arguments(p.oid), ' ', '') = 'uuid,text,text')
then 'PASS' else 'STOP' end;

with current_reports as (
  select distinct on (r.order_id) r.order_id, r.storage_status
  from public.reports r join public.orders o on o.id = r.order_id
  where o.status = 'payment_received' and r.status not in ('superseded','voided')
  order by r.order_id, r.version_number desc, r.created_at desc, r.id
), protected as (
  select o.id
  from public.orders o join current_reports r on r.order_id = o.id
  where o.status = 'payment_received' and r.storage_status = 'VERIFIED'
)
select 'current_verified_protected_result|' || case when
  (select count(*) from protected) = 2 and
  (select count(*) from public.manual_report_generation_attempts a join protected p on p.id = a.order_id
   where a.status in ('REPORT_QUEUED','REPORT_GENERATING','DELIVERY_QUEUED','RETRY_SCHEDULED','AWAITING_QUALITY_REVIEW')
      or a.lease_owner is not null) = 0
then 'PASS' else 'STOP' end;
select 'duplicate_current_reports_result|' || case when not exists (
  select 1 from public.reports where status not in ('superseded','voided')
  group by assessment_id, report_type having count(*) > 1
) then 'PASS' else 'STOP' end;
select 'worker_claim_result|' || case when not exists (
  select 1 from public.manual_report_generation_attempts where lease_owner is not null
) then 'PASS' else 'STOP' end;

\if :{?rc1_cutover_started_at}
select 'postflight_new_order_events|' || count(*) from public.order_events
where created_at >= :'rc1_cutover_started_at'::timestamptz;
select 'postflight_new_email_events|' || count(*) from public.email_events
where created_at >= :'rc1_cutover_started_at'::timestamptz;
select 'postflight_new_provider_events|' || count(*) from public.email_provider_events
where created_at >= :'rc1_cutover_started_at'::timestamptz;
select 'postflight_new_delivery_authorizations|' || count(*) from public.report_delivery_authorizations
where authorised_at >= :'rc1_cutover_started_at'::timestamptz;
select 'no_new_email_or_delivery_result|' || case when
  (select count(*) from public.email_events where created_at >= :'rc1_cutover_started_at'::timestamptz) = 0 and
  (select count(*) from public.email_provider_events where created_at >= :'rc1_cutover_started_at'::timestamptz) = 0 and
  (select count(*) from public.report_delivery_authorizations where authorised_at >= :'rc1_cutover_started_at'::timestamptz) = 0
then 'PASS' else 'STOP' end;
\else
\echo STOP|rc1_cutover_started_at was not supplied; no event-window conclusion is valid
\endif

\echo RC1_POSTFLIGHT_END
rollback;
