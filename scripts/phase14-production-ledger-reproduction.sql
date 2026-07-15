\set ON_ERROR_STOP on

-- Disposable-local only: replace the local migration ledger with the exact
-- read-only production versions/names.  This never targets a linked project.
begin;
delete from supabase_migrations.schema_migrations;
insert into supabase_migrations.schema_migrations(version,name,statements) values
('0001','0001_phase2_v1_1_schema_rls',array['disposable exact-production-history reproduction']),
('0002','0002_phase4_dev_seed',array['disposable exact-production-history reproduction']),
('0003','0003_phase5_methodology_seed',array['disposable exact-production-history reproduction']),
('0004','0004_phase4_v1_2_rate_limiting',array['disposable exact-production-history reproduction']),
('0005','0005_phase5_v1_1_guards',array['disposable exact-production-history reproduction']),
('0006','0006_phase6_scoring_guards',array['disposable exact-production-history reproduction']),
('0007','0007_phase6_v1_1_atomic_scoring',array['disposable exact-production-history reproduction']),
('0009','0009_methodology_copy_polish',array['disposable exact-production-history reproduction']),
('20260708181207','0010_phase9_manual_eft_order_flow',array['disposable exact-production-history reproduction']),
('20260708193238','phase10_report_engine_additions',array['disposable exact-production-history reproduction']),
('20260708193318','phase9_phase10_private_storage_buckets',array['disposable exact-production-history reproduction']),
('20260708194834','phase10_v2_report_engine_content',array['disposable exact-production-history reproduction']),
('20260709033522','phase10_v2_report_template_seed',array['disposable exact-production-history reproduction']),
('20260710220504','0012_phase13_commercial_event_foundation',array['disposable exact-production-history reproduction']),
('20260710220746','0013_phase13_event_index_cleanup',array['disposable exact-production-history reproduction']),
('20260711211557','0014_phase13_customer_commercial_conversion',array['disposable exact-production-history reproduction']),
('20260711211654','0015_phase13_data_request_policy_cleanup',array['disposable exact-production-history reproduction']),
('20260712153438','platform_database_hardening',array['disposable exact-production-history reproduction']),
('20260712180303','phase14_report_fulfilment_core',array['disposable exact-production-history reproduction']),
('20260712180317','phase14_report_generation_runs',array['disposable exact-production-history reproduction']),
('20260712180329','phase14_report_links',array['disposable exact-production-history reproduction']),
('20260712180346','phase14_report_security_and_flags',array['disposable exact-production-history reproduction']),
('20260712182003','phase14_pdf_email_delivery',array['disposable exact-production-history reproduction']),
('20260712184501','phase14_email_delivery_state_hardening',array['disposable exact-production-history reproduction']);
commit;

select version||E'\t'||name from supabase_migrations.schema_migrations order by version,name;
