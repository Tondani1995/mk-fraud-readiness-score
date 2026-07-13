# Numeric migration repair rollback plan

Status: controller-review-only. Do not execute without explicit controller approval.

## Scope

This rollback only reverts migration-history metadata for the numeric foundational versions:

```text
0001 0002 0003 0004 0005 0006 0007 0009
```

It must not change public schema objects, storage buckets, customer data, assessments, orders, reports, fulfilments, generation runs, email events or Phase 14 flags.

## Preferred rollback command

Use Supabase CLI repair with the same pinned CLI version used for validation:

```bash
supabase --version
# Expected pinned validation version: 2.81.3

supabase link --project-ref jvjxlphdyzerrhwcgkup

supabase migration repair 0001 0002 0003 0004 0005 0006 0007 0009 \
  --status reverted

supabase migration list
```

## Read-only pre-checks

Run before rollback:

```sql
select version, name, cardinality(statements) as statement_count
from supabase_migrations.schema_migrations
where version in ('0001','0002','0003','0004','0005','0006','0007','0009')
order by version;

select count(*) as public_table_count
from information_schema.tables
where table_schema = 'public'
  and table_type = 'BASE TABLE';

select count(*) as assessment_count from public.assessments;
select count(*) as order_count from public.orders;
select count(*) as report_count from public.reports;
select count(*) as fulfilment_count from public.report_fulfilments;
select count(*) as generation_run_count from public.report_generation_runs;
select count(*) as email_event_count from public.email_events;

select setting_key, value_json
from public.app_settings
where setting_key = 'phase14_autonomous_report_engine';
```

## Read-only post-checks

Run after rollback:

```sql
select version, name
from supabase_migrations.schema_migrations
where version in ('0001','0002','0003','0004','0005','0006','0007','0009')
order by version;

select count(*) as public_table_count
from information_schema.tables
where table_schema = 'public'
  and table_type = 'BASE TABLE';

select count(*) as assessment_count from public.assessments;
select count(*) as order_count from public.orders;
select count(*) as report_count from public.reports;
select count(*) as fulfilment_count from public.report_fulfilments;
select count(*) as generation_run_count from public.report_generation_runs;
select count(*) as email_event_count from public.email_events;

select setting_key, value_json
from public.app_settings
where setting_key = 'phase14_autonomous_report_engine';
```

## Expected post-rollback state

- `supabase_migrations.schema_migrations` no longer has versions `0001`, `0002`, `0003`, `0004`, `0005`, `0006`, `0007` or `0009`.
- Public table count is unchanged.
- Assessment/order/report/fulfilment/generation/email row counts are unchanged.
- Phase 14 flags remain unchanged and disabled.
- No storage object is created, updated or deleted.
- No customer email is sent.

## Emergency SQL equivalence

If the CLI is unavailable and the controller explicitly approves SQL equivalence, the metadata-only operation is:

```sql
begin;

delete from supabase_migrations.schema_migrations
where version in ('0001','0002','0003','0004','0005','0006','0007','0009');

commit;
```

This SQL is not preferred. It exists only as an emergency equivalence reference for controller review.