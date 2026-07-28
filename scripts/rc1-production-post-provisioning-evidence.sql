\set ON_ERROR_STOP on
\pset pager off
\pset format unaligned
\pset tuples_only on

-- RC1 read-only evidence after the two frozen certification HMACs are provisioned.
-- Required variables:
--   rc1_expected_freeze_epoch
--   rc1_expected_business_counts_json
-- This script computes secret fingerprints internally and never emits secret values,
-- identifiers, emails, object names, paths, or function bodies.
\if :{?rc1_expected_freeze_epoch}
\else
\echo STOP|missing_rc1_expected_freeze_epoch
\quit 3
\endif
\if :{?rc1_expected_business_counts_json}
\else
\echo STOP|missing_rc1_expected_business_counts_json
\quit 3
\endif

set statement_timeout = '30s';
begin;
set transaction read only;

\echo RC1_POST_PROVISIONING_EVIDENCE_BEGIN

with fingerprints as (
  select secret_key,
    encode(extensions.digest(convert_to(secret_value,'UTF8'),'sha256'),'hex') as fingerprint
  from phase14_private.runtime_secrets
  where secret_key in ('provider_webhook_db_hmac','provider_lookup_db_hmac')
)
select 'certification_secret_manifest_result|' || case when
  (select count(*) from fingerprints)=2
  and (select count(distinct secret_key) from fingerprints)=2
  and (select count(distinct fingerprint) from fingerprints)=2
  and not exists (select 1 from fingerprints where fingerprint !~ '^[0-9a-f]{64}$')
then 'PASS' else 'STOP' end;

with fingerprints as (
  select encode(extensions.digest(convert_to(secret_value,'UTF8'),'sha256'),'hex') as fingerprint
  from phase14_private.runtime_secrets
  where secret_key in ('provider_webhook_db_hmac','provider_lookup_db_hmac')
), evidence as (
  select a.evidence_fingerprint
  from public.rc1_operation_freeze_audit a
  where a.event_type='CERTIFICATION_SECRET_PROVISIONED'
    and a.freeze_epoch=:'rc1_expected_freeze_epoch'::bigint
)
select 'certification_secret_audit_result|' || case when
  (select count(*) from evidence)=2
  and not exists (
    select 1 from fingerprints f
    left join evidence e on e.evidence_fingerprint=f.fingerprint
    where e.evidence_fingerprint is null
  )
then 'PASS' else 'STOP' end;

select 'certification_freeze_unchanged_result|' || case when
  (select count(*) from public.rc1_operation_freeze_state)=1
  and (select state from public.rc1_operation_freeze_state where singleton)='FROZEN'
  and (select freeze_epoch from public.rc1_operation_freeze_state where singleton)
    = :'rc1_expected_freeze_epoch'::bigint
  and (select active_canary_authorization_hash is null
       and active_canary_expires_at is null
       from public.rc1_operation_freeze_state where singleton)
  and (select count(*) from public.rc1_certification_secret_write_tokens)=0
then 'PASS' else 'STOP' end;

with current_counts as (
  select jsonb_build_object(
    'order_events',(select count(*)::text from public.order_events),
    'report_events',(select count(*)::text from public.report_events),
    'email_events',(select count(*)::text from public.email_events),
    'email_provider_events',(select count(*)::text from public.email_provider_events),
    'report_delivery_authorizations',(select count(*)::text from public.report_delivery_authorizations),
    'report_delivery_finalizations',(select count(*)::text from public.report_delivery_finalizations),
    'report_delivery_remediations',(select count(*)::text from public.report_delivery_remediations),
    'phase14_operational_alerts',(select count(*)::text from public.phase14_operational_alerts),
    'manual_report_generation_attempts',(select count(*)::text from public.manual_report_generation_attempts),
    'reports',(select count(*)::text from public.reports),
    'payment_automation_records',(select count(*)::text from public.payment_automation_records),
    'customer_report_access_tokens',(select count(*)::text from public.customer_report_access_tokens),
    'storage.objects',(select count(*)::text from storage.objects),
    'orders',(select count(*)::text from public.orders)
  ) as value
)
select 'certification_business_aggregate_result|' || case when
  (select value from current_counts)=:'rc1_expected_business_counts_json'::jsonb
then 'PASS' else 'STOP' end;

\echo RC1_POST_PROVISIONING_EVIDENCE_COMPLETE
rollback;
