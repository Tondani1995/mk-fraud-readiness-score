# Production history and schema evidence — read only

Captured at `2026-07-15T10:02:05.444Z` from project `jvjxlphdyzerrhwcgkup` by metadata-only queries. No customer row was selected. No production or UAT write was performed.

## Accurate production boundary

Production has the early, disabled Phase 14 fulfilment, generation-provenance, report-linkage, flag, PDF-delivery and email-state foundation. Production does not have the security-gate closure or the fourth, fifth, sixth and sixth-handoff remediation controls. The existing automation flags are all disabled.

## Exact migration ledger

| Version | Name |
| --- | --- |
| `0001` | `0001_phase2_v1_1_schema_rls` |
| `0002` | `0002_phase4_dev_seed` |
| `0003` | `0003_phase5_methodology_seed` |
| `0004` | `0004_phase4_v1_2_rate_limiting` |
| `0005` | `0005_phase5_v1_1_guards` |
| `0006` | `0006_phase6_scoring_guards` |
| `0007` | `0007_phase6_v1_1_atomic_scoring` |
| `0009` | `0009_methodology_copy_polish` |
| `20260708181207` | `0010_phase9_manual_eft_order_flow` |
| `20260708193238` | `phase10_report_engine_additions` |
| `20260708193318` | `phase9_phase10_private_storage_buckets` |
| `20260708194834` | `phase10_v2_report_engine_content` |
| `20260709033522` | `phase10_v2_report_template_seed` |
| `20260710220504` | `0012_phase13_commercial_event_foundation` |
| `20260710220746` | `0013_phase13_event_index_cleanup` |
| `20260711211557` | `0014_phase13_customer_commercial_conversion` |
| `20260711211654` | `0015_phase13_data_request_policy_cleanup` |
| `20260712153438` | `platform_database_hardening` |
| `20260712180303` | `phase14_report_fulfilment_core` |
| `20260712180317` | `phase14_report_generation_runs` |
| `20260712180329` | `phase14_report_links` |
| `20260712180346` | `phase14_report_security_and_flags` |
| `20260712182003` | `phase14_pdf_email_delivery` |
| `20260712184501` | `phase14_email_delivery_state_hardening` |

The former numeric-history repair is already present. It must not be executed again.

## Exact read-only schema inventory

The checked query is `scripts/phase14-production-schema-inventory.sql`. Its scope is the existing production boundary: `app_settings`, `reports`, `email_events`, `report_fulfilments`, `report_generation_runs`, `email_provider_events`, their columns, constraints, indexes, RLS state, policies, table grants and triggers; `current_admin_role`, `is_admin_role`, `set_updated_at`, their body hashes and grants; the Phase 14 setting; and the private report bucket.

- Inventory lines: `361` (360 normalized entries plus the digest line)
- Inventory SHA-256: `417dfbf2fb7fdea1727d7dc9d84d0463a597db6b545def32de18d2e15d8509cd`
- `current_admin_role()` body SHA-256: `8d3fca1ab8bc5009ba4672e0d052bdc1e573612bf9a7b3d687d27ac847fc12e6`
- `is_admin_role(admin_role[])` body SHA-256: `8aa3bb32c44dc7b6e136f331c1022ac20e30d0897590963ea6e9e0cc94d21dcf`
- `set_updated_at()` body SHA-256: `2dae843b6f8dec31f24c782a17635d85aad7ca6bbb47f7379598e0a5a24e1bb2`
- Tables are RLS-enabled.
- Policies present: `app_settings_admin_select`, `app_settings_platform_admin_manage`, `email_events_admin_select`, `email_provider_events_admin_select`, `report_fulfilments_admin_select`, `report_generation_runs_admin_select`, `reports_admin_manage`, `reports_admin_select`.
- Triggers present: `trg_report_fulfilments_updated_at`, `trg_reports_updated_at`.
- Bucket `generated-reports` is private with a `52,428,800` byte limit.

The exact flag JSON reports `status=foundation_only`, automatic fulfilment off, AI narrative off, automatic email off, R50,000 automation off and no test-recipient override. Deterministic scoring remains authoritative.

Only aggregate row counts were read as a preservation baseline: `reports=15`, `email_events=59`, `report_fulfilments=1`, `report_generation_runs=0`, `email_provider_events=0`. No identifiers or row contents were read.

## Isolation

This evidence was captured by `list_migrations` and read-only SQL. No migration, repair, DDL, DML, secret, identity, email, AI call, webhook call, gate change, policy change or route enablement was performed.
