# Migration inventory and production-history mapping

Status: prepared for controller review only. This document is descriptive; it does not execute or approve any migration.

## Evidence sources

- GitHub branch inspected: `phase14/autonomous-premium-report-engine`.
- Production Supabase project inspected read-only: `jvjxlphdyzerrhwcgkup`.
- Historical local ZIP checkout was used only to summarize older foundational migration contents where the current workspace was not a normal git checkout.
- Supabase CLI was not available in this workspace, so no local `supabase db push`, `supabase migration list`, or advisor command was run.

## Repository migration order

The clean-project replay order should be lexical by migration filename:

1. `0001_phase2_v1_1_schema_rls.sql`
2. `0002_phase4_dev_seed.sql`
3. `0003_phase5_methodology_seed.sql`
4. `0004_phase4_v1_2_rate_limiting.sql`
5. `0005_phase5_v1_1_guards.sql`
6. `0006_phase6_scoring_guards.sql`
7. `0007_phase6_v1_1_atomic_scoring.sql`
8. `0009_methodology_copy_polish.sql`
9. `0010_phase9_manual_eft_order_flow.sql`
10. `0011_phase10_pdf_report_engine_additions.sql`
11. `0012_phase13_commercial_event_foundation.sql`
12. `0013_phase13_event_index_cleanup.sql`
13. `0014_phase13_customer_commercial_conversion.sql`
14. `0015_phase13_data_request_policy_cleanup.sql`
15. `0016_platform_database_hardening.sql`
16. `0017_phase14_autonomous_report_engine.sql`
17. `0018_phase14_pdf_email_delivery.sql`
18. `0019_phase14_email_delivery_state_hardening.sql`

No `0008` file was confirmed.

## Inventory

| File | Dependency posture | Creates/alters | Seed/data changes | Idempotency notes | Production-history representation |
| --- | --- | --- | --- | --- | --- |
| `0001_phase2_v1_1_schema_rls.sql` | Foundation. Must run first on an empty project. | Extensions `pgcrypto`, `citext`; enum types; core tables for admins, methodology, organisations, respondents, assessments, tokens, answers, scoring, orders, reports, emails, audit logs, data requests and app settings; RLS policies; triggers and helper functions. | Seeds base products and app settings. | Mixed. Many objects are plain `create table` / `create type`, so this is intended for empty-project bootstrap, not repeated production execution. | Not represented in production ledger, but production currently contains the expected foundational tables and enums. |
| `0002_phase4_dev_seed.sql` | Depends on `0001`. | None expected beyond inserts. | Seeds early methodology, domains, questions, exposure factors, applicability rules, recommendation rules and app settings. | Seed migration uses conflict-safe patterns in the inspected historical file. Needs clean replay proof. | Not represented in production ledger. |
| `0003_phase5_methodology_seed.sql` | Depends on methodology tables from `0001`. | None expected beyond inserts. | Seeds Phase 5 methodology data, response scale, domains, questions, exposure factors, recommendation rules and settings. | Seed migration uses conflict-safe patterns in the inspected historical file. Needs clean replay proof. | Not represented in production ledger. |
| `0004_phase4_v1_2_rate_limiting.sql` | Depends on `pgcrypto` from `0001`. | Creates `rate_limit_hits`, index, RLS, service-only policy and `check_rate_limit`. | None. | Uses `if not exists` / `create or replace` patterns. | Not represented in production ledger, but production contains `rate_limit_hits`. |
| `0005_phase5_v1_1_guards.sql` | Depends on assessment, exposure and methodology tables. | Creates/replaces guard functions and triggers for answers, exposure answers and methodology immutability. | Updates app settings. | Functions are replaceable; triggers are dropped/recreated. | Not represented in production ledger. |
| `0006_phase6_scoring_guards.sql` | Depends on scoring tables. | Adds scoring indexes, score-run guard functions and triggers. | Updates app settings. | Uses `if not exists`, `create or replace`, and drop/create trigger patterns. | Not represented in production ledger. |
| `0007_phase6_v1_1_atomic_scoring.sql` | Depends on scoring tables and Phase 6 guards. | Adds identity guards and `complete_score_run_atomic`. | Updates app settings. | Uses replaceable functions and drop/create triggers. | Not represented in production ledger. |
| `0009_methodology_copy_polish.sql` | Depends on methodology V1.0/V1.1 records and seed data. | Temporarily disables/enables methodology triggers; updates methodology/question/exposure copy. | Retires/activates methodology versions and updates app settings. | Contains updates and trigger toggles; must be replay-tested on clean fixture data only. | Not represented in production ledger. |
| `0010_phase9_manual_eft_order_flow.sql` | Depends on core order/product/report-request tables. | Creates `eft_settings`, alters `orders`, creates `order_events`, indexes/RLS/policies. | Seeds active EFT settings and app settings. | Mostly additive/guarded; includes backfill updates. | Represented as `20260708181207` / `0010_phase9_manual_eft_order_flow`. |
| `0011_phase10_pdf_report_engine_additions.sql` | Depends on report, report_event, report_template and storage schemas. | Alters `report_events`; creates private `generated-reports` bucket; seeds report template/content and app settings. | Seeds Phase 10 report template/content. | Additive/seed-oriented. Does not cover all split production Phase 10 records by filename. | Production has split records: `phase10_report_engine_additions`, `phase9_phase10_private_storage_buckets`, `phase10_v2_report_engine_content`, `phase10_v2_report_template_seed`. |
| `0012_phase13_commercial_event_foundation.sql` | Depends on assessments, organisations, respondents, orders, data_requests and reports. | Creates `assessment_events` and notification queue structures, indexes, dedupe constraints, RLS and settings. | Seeds/updates settings. | Uses additive guarded patterns and dedupe upsert behaviour. | Represented as `20260710220504` / `0012_phase13_commercial_event_foundation`. |
| `0013_phase13_event_index_cleanup.sql` | Depends on `assessment_events`. | Adds `assessment_events_respondent_idx`; drops redundant dedupe index. | None. | Re-executable through `if not exists` and `drop index if exists`. | Represented as `20260710220746` / `0013_phase13_event_index_cleanup`. |
| `0014_phase13_customer_commercial_conversion.sql` | Depends on `data_requests`. | Adds personalised advisory fields, indexes, constraints and updated-at trigger. | None. | Additive, with guarded constraints and trigger creation. | Represented as `20260711211557` / `0014_phase13_customer_commercial_conversion`. |
| `0015_phase13_data_request_policy_cleanup.sql` | Depends on `data_requests`. | Drops redundant policy; adds respondent FK index. | None. | Re-executable through `drop policy if exists` and `create index if not exists`. | Represented as `20260711211654` / `0015_phase13_data_request_policy_cleanup`. |
| `0016_platform_database_hardening.sql` | Depends on admin profiles, reports, assessment_answers and `set_updated_at`. | Hardens `set_updated_at` search path; alters admin policy; adds `reports_order_id_idx` and `assessment_answers_question_id_idx`. | None. | Re-executable for function and indexes; policy alteration expects policy to exist. | Represented as `20260712153438` / `platform_database_hardening`, not by filename. |
| `0017_phase14_autonomous_report_engine.sql` | Depends on orders, assessments, score_runs, reports, app_settings and admin role helper. | Creates `report_fulfilments`, `report_generation_runs`, report links, indexes, RLS, policies, triggers and Phase 14 flags. | Seeds/updates Phase 14 app setting with automation flags off. | Additive/guarded in repository form. Production history is split into multiple smaller records. | Production has split records `phase14_report_fulfilment_core`, `phase14_report_generation_runs`, `phase14_report_links`, `phase14_report_security_and_flags`. |
| `0018_phase14_pdf_email_delivery.sql` | Depends on `email_events` and reports. | Adds provider/delivery columns and email indexes. | None. | Additive guarded alter/index statements. | Represented as `20260712182003` / `phase14_pdf_email_delivery`. |
| `0019_phase14_email_delivery_state_hardening.sql` | Depends on `email_events` and admin role helper. | Creates `email_provider_events`, indexes, RLS and admin policy. | None. | Additive guarded table/index creation; policy is plain create and expects first run only. | Represented as `20260712184501` / `phase14_email_delivery_state_hardening`. |

## Production migration ledger observed read-only

| Version | Name | Repository mapping |
| --- | --- | --- |
| `20260708181207` | `0010_phase9_manual_eft_order_flow` | `0010_phase9_manual_eft_order_flow.sql` |
| `20260708193238` | `phase10_report_engine_additions` | Split Phase 10, related to `0011` content |
| `20260708193318` | `phase9_phase10_private_storage_buckets` | Split storage-bucket migration, related to Phase 10 runtime |
| `20260708194834` | `phase10_v2_report_engine_content` | Split Phase 10 content |
| `20260709033522` | `phase10_v2_report_template_seed` | Split Phase 10 template seed |
| `20260710220504` | `0012_phase13_commercial_event_foundation` | `0012_phase13_commercial_event_foundation.sql` |
| `20260710220746` | `0013_phase13_event_index_cleanup` | `0013_phase13_event_index_cleanup.sql` |
| `20260711211557` | `0014_phase13_customer_commercial_conversion` | `0014_phase13_customer_commercial_conversion.sql` |
| `20260711211654` | `0015_phase13_data_request_policy_cleanup` | `0015_phase13_data_request_policy_cleanup.sql` |
| `20260712153438` | `platform_database_hardening` | `0016_platform_database_hardening.sql` |
| `20260712180303` | `phase14_report_fulfilment_core` | Split Phase 14, related to `0017` |
| `20260712180317` | `phase14_report_generation_runs` | Split Phase 14, related to `0017` |
| `20260712180329` | `phase14_report_links` | Split Phase 14, related to `0017` |
| `20260712180346` | `phase14_report_security_and_flags` | Split Phase 14, related to `0017` |
| `20260712182003` | `phase14_pdf_email_delivery` | `0018_phase14_pdf_email_delivery.sql` |
| `20260712184501` | `phase14_email_delivery_state_hardening` | `0019_phase14_email_delivery_state_hardening.sql` |

## Gap summary

1. Production migration history has no records for repository migrations `0001`, `0002`, `0003`, `0004`, `0005`, `0006`, `0007` or `0009`.
2. Production schema appears to contain the corresponding foundational objects, so the issue is metadata/history reproducibility rather than missing live foundation tables.
3. Production uses timestamped versions while repository filenames use numeric prefixes, and several production records are split names that do not exactly match repository filenames.
4. A clean Supabase branch replay cannot be trusted until the version/name mapping is made explicit and validated in a disposable environment.