\set ON_ERROR_STOP on

-- Disposable-local reproduction of the current production-compatible ledger
-- boundary. It deliberately ends at platform hardening (0016 equivalent).
begin;
delete from supabase_migrations.schema_migrations;
insert into supabase_migrations.schema_migrations(version,name,statements) values
('0001','0001_phase2_v1_1_schema_rls',array['disposable production-history reproduction']),
('0002','0002_phase4_dev_seed',array['disposable production-history reproduction']),
('0003','0003_phase5_methodology_seed',array['disposable production-history reproduction']),
('0004','0004_phase4_v1_2_rate_limiting',array['disposable production-history reproduction']),
('0005','0005_phase5_v1_1_guards',array['disposable production-history reproduction']),
('0006','0006_phase6_scoring_guards',array['disposable production-history reproduction']),
('0007','0007_phase6_v1_1_atomic_scoring',array['disposable production-history reproduction']),
('0009','0009_methodology_copy_polish',array['disposable production-history reproduction']),
('20260708181207','0010_phase9_manual_eft_order_flow',array['disposable production-history reproduction']),
('20260708193238','phase10_report_engine_additions',array['disposable production-history reproduction']),
('20260708193318','phase9_phase10_private_storage_buckets',array['disposable production-history reproduction']),
('20260708194834','phase10_v2_report_engine_content',array['disposable production-history reproduction']),
('20260709033522','phase10_v2_report_template_seed',array['disposable production-history reproduction']),
('20260710220504','0012_phase13_commercial_event_foundation',array['disposable production-history reproduction']),
('20260710220746','0013_phase13_event_index_cleanup',array['disposable production-history reproduction']),
('20260711211557','0014_phase13_customer_commercial_conversion',array['disposable production-history reproduction']),
('20260711211654','0015_phase13_data_request_policy_cleanup',array['disposable production-history reproduction']),
('20260712153438','platform_database_hardening',array['disposable production-history reproduction']);

insert into public.app_settings(setting_key,value_json)
values('phase1_history_preservation_fixture',jsonb_build_object('preserve',true,'nonce','production-compatible'))
on conflict(setting_key) do update set value_json=excluded.value_json,updated_at=now();
commit;
