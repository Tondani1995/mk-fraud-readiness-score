\set ON_ERROR_STOP on
\pset pager off
\pset format unaligned
\pset tuples_only on

-- RC1 Production postflight. READ ONLY and fail closed.
-- Required invocation variables:
--   rc1_cutover_started_at, rc1_preflight_newest_version,
--   rc1_preflight_protected_state_fingerprint, rc1_preflight_baseline_counts_json.
-- No customer identifiers, UUIDs, emails, names, report content or function bodies are emitted.
\if :{?rc1_cutover_started_at}
\else
\echo STOP|missing_rc1_cutover_started_at
\quit 3
\endif
\if :{?rc1_preflight_newest_version}
\else
\echo STOP|missing_rc1_preflight_newest_version
\quit 3
\endif
\if :{?rc1_preflight_protected_state_fingerprint}
\else
\echo STOP|missing_rc1_preflight_protected_state_fingerprint
\quit 3
\endif
\if :{?rc1_preflight_baseline_counts_json}
\else
\echo STOP|missing_rc1_preflight_baseline_counts_json
\quit 3
\endif
\if :{?rc1_approved_postflight_rpc_fingerprints_json}
\else
\echo STOP|missing_rc1_approved_postflight_rpc_fingerprints_json
\quit 3
\endif

set statement_timeout = '30s';
begin;
set transaction read only;

\echo RC1_POSTFLIGHT_BEGIN

select 'ledger_total_result|' || case when count(*) = 41 then 'PASS' else 'STOP' end
from supabase_migrations.schema_migrations;
select 'ledger_newest_result|' || case when max(version) = '20260725150000' then 'PASS' else 'STOP' end
from supabase_migrations.schema_migrations;
select 'preflight_ledger_boundary_result|' || case when
  (select count(*) from supabase_migrations.schema_migrations where version <= :'rc1_preflight_newest_version') = 34
  and (select count(*) from supabase_migrations.schema_migrations where version > :'rc1_preflight_newest_version') = 7
then 'PASS' else 'STOP' end;
select 'duplicate_version_result|' || case when not exists (
  select 1 from supabase_migrations.schema_migrations group by version having count(*) > 1
) then 'PASS' else 'STOP' end;

with authorised(version, name) as (
  values
    ('20260722143000','checkpoint_e_phase1_ai_attempt_binding'),
    ('20260724150000','release_a_backlog_reconciliation'),
    ('20260724160000','release_b_durable_fulfilment'),
    ('20260724170000','release_c_email_secure_delivery'),
    ('20260724180000','release_c_closure_delivery_exceptions'),
    ('20260725090000','release_c_runtime_secret_admin_provisioning'),
    ('20260725150000','release_d_operational_alert_lifecycle')
), found as (
  select a.version, a.name, count(m.version) as matches
  from authorised a left join supabase_migrations.schema_migrations m
    on m.version = a.version and m.name = a.name
  group by a.version, a.name
)
select 'authorised_ledger_pairs_result|' || case when count(*) = 7 and bool_and(matches = 1) then 'PASS' else 'STOP' end
from found;

select 'unlisted_post_preflight_result|' || case when not exists (
  select 1 from supabase_migrations.schema_migrations
  where version > :'rc1_preflight_newest_version'
    and version not in ('20260722143000','20260724150000','20260724160000','20260724170000',
                        '20260724180000','20260725090000','20260725150000')
) then 'PASS' else 'STOP' end;

with expected(table_name, column_name) as (
  values
    ('report_ai_attempts','manual_generation_attempt_id'), ('report_ai_attempts','manual_order_id'),
    ('report_ai_attempts','manual_assessment_id'), ('report_ai_attempts','manual_score_run_id'),
    ('manual_report_generation_attempts','generation_mode'), ('manual_report_generation_attempts','evidence_checksum'),
    ('manual_report_generation_attempts','prompt_version'), ('manual_report_generation_attempts','schema_version'),
    ('manual_report_generation_attempts','requested_provider'), ('manual_report_generation_attempts','requested_model'),
    ('manual_report_generation_attempts','resolved_provider'), ('manual_report_generation_attempts','resolved_model'),
    ('manual_report_generation_attempts','structured_ai_output_json'), ('manual_report_generation_attempts','final_narrative_json'),
    ('manual_report_generation_attempts','final_validation_json'), ('manual_report_generation_attempts','initial_validation_json'),
    ('manual_report_generation_attempts','repair_validation_json'), ('manual_report_generation_attempts','ai_usage_json'),
    ('manual_report_generation_attempts','narrative_fallback_reason'), ('manual_report_generation_attempts','narrative_prepared_at'),
    ('manual_report_generation_attempts','lease_owner'), ('manual_report_generation_attempts','lease_expires_at'),
    ('manual_report_generation_attempts','heartbeat_at'), ('manual_report_generation_attempts','next_attempt_at'),
    ('manual_report_generation_attempts','max_attempts'), ('manual_report_generation_attempts','quality_reviewed_by'),
    ('manual_report_generation_attempts','quality_reviewed_at'), ('manual_report_generation_attempts','quality_review_decision'),
    ('manual_report_generation_attempts','quality_review_reason'), ('manual_report_generation_attempts','regenerated_from_attempt_id'),
    ('manual_report_generation_attempts','delivery_queued_at'),
    ('report_generation_runs','final_narrative_json'), ('report_generation_runs','initial_validation_json'),
    ('report_generation_runs','repair_validation_json'),
    ('report_delivery_authorizations','next_attempt_at'), ('report_delivery_authorizations','max_attempts'),
    ('report_delivery_authorizations','retry_count'),
    ('phase14_operational_alerts','acknowledged_at'), ('phase14_operational_alerts','acknowledged_by'),
    ('phase14_operational_alerts','resolved_by'), ('phase14_operational_alerts','last_status_changed_at')
), found as (
  select e.table_name, e.column_name, count(c.column_name) as matches
  from expected e left join information_schema.columns c
    on c.table_schema = 'public' and c.table_name = e.table_name and c.column_name = e.column_name
  group by e.table_name, e.column_name
)
select 'introduced_columns_result|' || case when count(*) = 41 and bool_and(matches = 1) then 'PASS' else 'STOP' end
from found;

with expected(table_name, column_name, type_name, not_null) as (
  values
    ('backlog_reconciliation_records','id','uuid',true),
    ('backlog_reconciliation_records','order_id','uuid',true),
    ('backlog_reconciliation_records','report_id','uuid',false),
    ('backlog_reconciliation_records','classification','text',true),
    ('backlog_reconciliation_records','resolution_note','text',true),
    ('backlog_reconciliation_records','assigned_owner','uuid',false),
    ('backlog_reconciliation_records','next_action','text',false),
    ('backlog_reconciliation_records','completion_date','date',false),
    ('backlog_reconciliation_records','evidence_reference','text',false),
    ('backlog_reconciliation_records','classified_by','uuid',true),
    ('backlog_reconciliation_records','classified_at','timestamptz',true),
    ('backlog_reconciliation_records','created_at','timestamptz',true),
    ('backlog_reconciliation_records','updated_at','timestamptz',true),
    ('customer_report_access_tokens','id','uuid',true),
    ('customer_report_access_tokens','order_id','uuid',true),
    ('customer_report_access_tokens','report_id','uuid',true),
    ('customer_report_access_tokens','recipient_email','citext',true),
    ('customer_report_access_tokens','token_hash','text',true),
    ('customer_report_access_tokens','purpose','text',true),
    ('customer_report_access_tokens','issued_at','timestamptz',true),
    ('customer_report_access_tokens','expires_at','timestamptz',true),
    ('customer_report_access_tokens','revoked_at','timestamptz',false),
    ('customer_report_access_tokens','revoked_reason','text',false),
    ('customer_report_access_tokens','issued_by','uuid',false),
    ('customer_report_access_tokens','last_accessed_at','timestamptz',false),
    ('customer_report_access_tokens','access_count','int4',true),
    ('customer_report_access_tokens','created_at','timestamptz',true),
    ('customer_report_access_tokens','updated_at','timestamptz',true)
), actual as (
  select c.table_name, c.column_name, c.udt_name, c.is_nullable = 'NO' as not_null
  from information_schema.columns c where c.table_schema = 'public'
), mismatches as (
  select e.* from expected e left join actual a using (table_name, column_name)
  where a.column_name is null or a.udt_name <> e.type_name or a.not_null <> e.not_null
), expected_counts as (select count(*) as n from expected), actual_counts as (
  select count(*) as n from actual a join expected e using (table_name, column_name)
)
select 'backlog_token_full_structure_result|' || case when
  (select n from expected_counts) = 28 and (select n from actual_counts) = 28
  and not exists (select 1 from mismatches)
  and (select count(*) from actual where table_name in ('backlog_reconciliation_records','customer_report_access_tokens')) = 28
then 'PASS' else 'STOP' end;

with expected(index_name) as (
  values
    ('report_ai_attempts_manual_generation_idx'),
    ('backlog_reconciliation_records_classification_idx'),
    ('backlog_reconciliation_records_assigned_owner_idx'),
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
), found as (
  select e.index_name, count(c.oid) as matches
  from expected e left join pg_class c on c.relname = e.index_name
    and c.relnamespace = 'public'::regnamespace and c.relkind = 'i'
  group by e.index_name
)
select 'derived_index_list_result|' || case when count(*) = 14 and bool_and(matches = 1) then 'PASS' else 'STOP' end
from found;

with expected(name, args, search_path, positive_role) as (
  values
    ('authorize_manual_report_ai_action','uuid,text','""', 'service_role'),
    ('claim_manual_report_ai_attempt','jsonb','""', 'service_role'),
    ('settle_manual_report_ai_attempt','uuid,jsonb','""', 'service_role'),
    ('record_manual_report_narrative_provenance','uuid,jsonb','""', 'service_role'),
    ('record_premium_report_generation_run','uuid,uuid,jsonb','""', 'authenticated'),
    ('classify_backlog_order','uuid,uuid,text,text,uuid,text,date,text','public, pg_temp','authenticated'),
    ('backlog_reconciliation_queue','','public, pg_temp','authenticated'),
    ('claim_next_fulfilment_job','text,integer','public, pg_temp','service_role'),
    ('fail_fulfilment_job','uuid,text,text,text,text','public, pg_temp','service_role'),
    ('submit_for_quality_review','uuid,text','public, pg_temp','service_role'),
    ('recover_expired_fulfilment_leases','','public, pg_temp','service_role'),
    ('approve_quality_review','uuid,text','public, pg_temp','authenticated'),
    ('reject_quality_review','uuid,text','public, pg_temp','authenticated'),
    ('retry_fulfilment_job','uuid','public, pg_temp','authenticated'),
    ('recover_fulfilment_job','uuid','public, pg_temp','authenticated'),
    ('claim_payment_report_generation','text,text,text','public, pg_temp','service_role'),
    ('record_payment_transition','text,text,text,text,integer,text,text,text,timestamptz,text,text,text,text,text','public, pg_temp','service_role'),
    ('claim_next_delivery','text,integer','public, pg_temp','service_role'),
    ('mark_delivery_dispatch_started','uuid,uuid','public, pg_temp','service_role'),
    ('finalize_delivery','uuid,uuid,text','public, pg_temp','service_role'),
    ('fail_delivery','uuid,uuid,text,text,text','public, pg_temp','service_role'),
    ('retry_delivery','uuid','public, pg_temp','authenticated'),
    ('revoke_customer_report_access_token','uuid,text','public, pg_temp','authenticated'),
    ('issue_customer_report_access_token','uuid,uuid,text,integer','public, pg_temp','service_role'),
    ('reissue_customer_report_access_token','uuid,uuid,text,text,integer,boolean','public, pg_temp','authenticated'),
    ('apply_email_provider_event_atomic','text,text,text,text,timestamptz,text,jsonb','""', 'NONE'),
    ('correct_delivery_recipient_and_queue','uuid,text,text','public, pg_temp','authenticated'),
    ('set_phase14_runtime_secret','text,text,text','""', 'authenticated'),
    ('transition_phase14_operational_alert','uuid,text,text','""', 'authenticated')
), actual as (
  select e.*, p.oid, p.prosecdef,
    coalesce((select split_part(cfg, '=', 2) from unnest(coalesce(p.proconfig, array[]::text[])) cfg where cfg like 'search_path=%' limit 1), 'UNSET') as actual_search_path
  from expected e left join pg_proc p on p.pronamespace = 'public'::regnamespace
    and p.proname = e.name and replace(replace(array_to_string(array(select format_type(t, null) from unnest(p.proargtypes) t), ','), 'timestamp with time zone', 'timestamptz'), ' ', '') = e.args
), rpc_check as (
  select a.*, md5(pg_get_functiondef(a.oid)) as definition_fingerprint,
    case when a.positive_role = 'NONE' then true
         else has_function_privilege(a.positive_role, a.oid, 'EXECUTE') end as positive_grant,
    has_function_privilege('public', a.oid, 'EXECUTE') as public_grant,
    has_function_privilege('anon', a.oid, 'EXECUTE') as anon_grant,
    has_function_privilege('authenticated', a.oid, 'EXECUTE') as authenticated_grant,
    has_function_privilege('service_role', a.oid, 'EXECUTE') as service_role_grant
  from actual a where a.oid is not null
)
select 'rpc_combined_result|' || case when
  (select count(*) from actual) = 29 and (select count(*) from rpc_check) = 29
  and not exists (select 1 from actual where oid is null or not prosecdef or actual_search_path <> search_path)
  and (select count(*) from rpc_check where not positive_grant or public_grant or anon_grant
       or (positive_role = 'NONE' and (authenticated_grant or service_role_grant))
       or md5(pg_get_functiondef(oid)) <> coalesce((select value from jsonb_each_text(:'rc1_approved_postflight_rpc_fingerprints_json'::jsonb)
           where key = name || '(' || args || ')'), 'MISSING')) = 0
then 'PASS' else 'STOP' end;

with expected(table_name, policy_name, command) as (
  values
    ('backlog_reconciliation_records','backlog_reconciliation_records_admin_select','SELECT'),
    ('customer_report_access_tokens','customer_report_access_tokens_admin_select','SELECT')
), actual as (
  select schemaname, tablename, policyname, cmd, roles, qual
  from pg_policies where schemaname = 'public'
), table_flags as (
  select c.relname, c.relrowsecurity from pg_class c
  where c.relnamespace = 'public'::regnamespace
    and c.relname in ('backlog_reconciliation_records','customer_report_access_tokens')
)
select 'rls_policy_result|' || case when
  (select count(*) from table_flags) = 2 and (select count(*) from table_flags where relrowsecurity) = 2
  and (select count(*) from actual where tablename in ('backlog_reconciliation_records','customer_report_access_tokens')) = 2
  and (select count(*) from expected e join actual a on a.tablename=e.table_name and a.policyname=e.policy_name and a.cmd=e.command) = 2
  and not exists (select 1 from actual a where a.tablename in ('backlog_reconciliation_records','customer_report_access_tokens')
    and (a.roles::text like '%anon%' or a.roles::text like '%public%' or coalesce(a.qual,'') ~* '(^|[^a-z])true([^a-z]|$)'))
then 'PASS' else 'STOP' end;

with protected_reports as (
  select r.*,o.customer_email,o.updated_at as order_updated_at
  from public.reports r join public.orders o on o.id=r.order_id
  where o.status = 'payment_received' and r.report_type = 'essential_self_assessment'
    and r.status not in ('superseded','voided') and r.storage_status = 'VERIFIED'
    and r.version_number = (select max(r2.version_number) from public.reports r2
      where r2.order_id=r.order_id and r2.report_type=r.report_type and r2.status not in ('superseded','voided'))
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
    :'rc1_preflight_protected_state_fingerprint'
then 'PASS' else 'STOP' end
from protected;
select 'duplicate_current_reports_result|' || case when not exists (
  select 1 from public.reports r join public.orders o on o.id=r.order_id
  where o.status='payment_received' and r.status not in ('superseded','voided')
  group by r.order_id, r.report_type having count(*) > 1
) then 'PASS' else 'STOP' end;
select 'protected_orders_unchanged_result|' || case when not exists (
  select 1 from public.manual_report_generation_attempts a join (
    select r.order_id from public.reports r where r.storage_status='VERIFIED' and r.report_type='essential_self_assessment'
  ) p on p.order_id=a.order_id where a.created_at >= :'rc1_cutover_started_at'::timestamptz
) and not exists (
  select 1 from public.reports r join public.orders o on o.id=r.order_id
  where o.status='payment_received' and r.storage_status='VERIFIED' and r.created_at >= :'rc1_cutover_started_at'::timestamptz
) then 'PASS' else 'STOP' end;

with baseline(key, value) as (select key, value from jsonb_each_text(:'rc1_preflight_baseline_counts_json'::jsonb)), actual(key, value) as (
  values
    ('order_events',(select count(*)::text from public.order_events)),
    ('report_events',(select count(*)::text from public.report_events)),
    ('email_events',(select count(*)::text from public.email_events)),
    ('email_provider_events',(select count(*)::text from public.email_provider_events)),
    ('report_delivery_authorizations',(select count(*)::text from public.report_delivery_authorizations)),
    ('report_delivery_finalizations',(select count(*)::text from public.report_delivery_finalizations)),
    ('report_delivery_remediations',(select count(*)::text from public.report_delivery_remediations)),
    ('phase14_operational_alerts',(select count(*)::text from public.phase14_operational_alerts)),
    ('manual_report_generation_attempts',(select count(*)::text from public.manual_report_generation_attempts)),
    ('reports',(select count(*)::text from public.reports)),
    ('payment_automation_records',(select count(*)::text from public.payment_automation_records)),
    ('customer_report_access_tokens',(select count(*)::text from public.customer_report_access_tokens)),
    ('storage.objects',(select count(*)::text from storage.objects)),
    ('orders',(select count(*)::text from public.orders))
), no_change as (
  select b.key, b.value, a.value as actual_value from baseline b left join actual a using (key)
)
select 'no_change_aggregate_result|' || case when
  (select count(*) from baseline)=14
  and not exists (select 1 from no_change where actual_value is null or actual_value <> value)
  and (select count(*) from public.manual_report_generation_attempts where created_at >= :'rc1_cutover_started_at'::timestamptz) = 0
  and (select count(*) from public.reports where created_at >= :'rc1_cutover_started_at'::timestamptz) = 0
  and (select count(*) from public.payment_automation_records where created_at >= :'rc1_cutover_started_at'::timestamptz) = 0
  and (select count(*) from public.email_events where created_at >= :'rc1_cutover_started_at'::timestamptz) = 0
  and (select count(*) from public.email_provider_events where received_at >= :'rc1_cutover_started_at'::timestamptz) = 0
  and (select count(*) from public.report_delivery_authorizations where updated_at >= :'rc1_cutover_started_at'::timestamptz) = 0
  and (select count(*) from public.report_delivery_finalizations where finalized_at >= :'rc1_cutover_started_at'::timestamptz) = 0
  and (select count(*) from public.report_delivery_remediations where created_at >= :'rc1_cutover_started_at'::timestamptz) = 0
  and (select count(*) from public.customer_report_access_tokens where created_at >= :'rc1_cutover_started_at'::timestamptz) = 0
  and (select count(*) from public.customer_report_access_tokens) = 0
  and (select count(*) from public.phase14_operational_alerts where last_status_changed_at >= :'rc1_cutover_started_at'::timestamptz) = 0
  and (select count(*) from storage.objects where created_at >= :'rc1_cutover_started_at'::timestamptz) = 0
then 'PASS' else 'STOP' end;

select 'worker_lease_result|' || case when not exists (
  select 1 from public.manual_report_generation_attempts where lease_owner is not null or lease_expires_at is not null
) and not exists (
  select 1 from public.report_delivery_authorizations where lease_token is not null or lease_expires_at is not null
) then 'PASS' else 'STOP' end;

\echo RC1_POSTFLIGHT_END
rollback;
