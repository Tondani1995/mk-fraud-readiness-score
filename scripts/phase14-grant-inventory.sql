\pset pager off
\echo 'TABLE GRANT INVENTORY'
with inventory(table_name,classification) as (values
  ('reports','authoritative'),('report_fulfilments','authoritative'),
  ('report_generation_runs','authoritative'),('report_ai_attempts','authoritative'),
  ('report_generation_claims','authoritative'),('report_delivery_authorizations','authoritative'),
  ('report_delivery_finalizations','authoritative'),('report_delivery_remediations','authoritative'),
  ('phase14_worker_capabilities','authoritative'),('phase14_feature_policies','authoritative'),
  ('phase14_security_gates','authoritative'),('phase14_ai_route_policies','authoritative'),
  ('phase14_storage_cleanup_queue','authoritative'),('phase14_operational_alerts','authoritative'),
  ('phase14_provider_attestations','authoritative'),
  ('phase14_provider_attestation_consumptions','authoritative'),
  ('audit_logs','shared_guarded'),('report_events','shared_guarded'),
  ('assessment_events','shared_guarded'),('email_events','shared_guarded'),
  ('email_provider_events','shared_guarded')
)
select classification,table_name,
  has_table_privilege('service_role','public.'||table_name,'SELECT') as service_select,
  has_table_privilege('service_role','public.'||table_name,'INSERT') as service_insert,
  has_table_privilege('service_role','public.'||table_name,'UPDATE') as service_update,
  has_table_privilege('service_role','public.'||table_name,'DELETE') as service_delete,
  has_table_privilege('service_role','public.'||table_name,'TRUNCATE') as service_truncate
from inventory order by classification,table_name;

\echo 'FUNCTION EXECUTE INVENTORY'
select p.proname,pg_get_function_identity_arguments(p.oid) as arguments,
  has_function_privilege('public',p.oid,'EXECUTE') as public_execute,
  has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,
  has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,
  has_function_privilege('service_role',p.oid,'EXECUTE') as service_execute
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and (
  p.proname like '%phase14%' or p.proname like '%premium_report%'
  or p.proname='apply_email_provider_event_atomic'
) order by p.proname,arguments;

\echo 'REVIEWED STATE-TRANSITION MAPPING'
select * from (values
  ('workflow start','claim_premium_report_workflow_start / record_premium_report_workflow_start'),
  ('fulfilment progress','transition_premium_report_fulfilment'),
  ('generation provenance','record_premium_report_generation_run'),
  ('generation completion','complete_phase14_generation_operation'),
  ('AI attempt','claim_phase14_ai_attempt / settle_phase14_ai_attempt'),
  ('delivery','worker_*premium_report_delivery / finalize_premium_report_delivery'),
  ('provider webhook','ingest_phase14_provider_webhook'),
  ('provider lookup receipt','record_phase14_provider_lookup_attestation'),
  ('operator reconciliation','resolve_premium_report_delivery_reconciliation'),
  ('download event','record_phase14_report_download'),
  ('cleanup','claim_phase14_storage_cleanup_jobs / complete_phase14_storage_cleanup_job'),
  ('operational alert','record_phase14_operational_alert')
) as mapping(state_class,reviewed_rpc) order by state_class;
