\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

select encode(extensions.digest(convert_to(string_agg(payload,E'\n' order by payload),'utf8'),'sha256'),'hex')
from (
  select 'fulfilment|'||id||'|'||order_id||'|'||assessment_id||'|'||score_run_id||'|'||
    idempotency_key||'|'||trigger_source from public.report_fulfilments where id='27000000-0000-0000-0000-000000000004'
  union all select 'run|'||id||'|'||fulfilment_id||'|'||attempt_number||'|'||generation_mode||'|'||
    evidence_checksum from public.report_generation_runs where id='27000000-0000-0000-0000-000000000005'
  union all select 'report|'||id||'|'||assessment_id||'|'||order_id||'|'||score_run_id||'|'||
    report_reference||'|'||version_number||'|'||checksum from public.reports where id='27000000-0000-0000-0000-000000000006'
  union all select 'email|'||id||'|'||assessment_id||'|'||order_id||'|'||report_id||'|'||
    recipient_email||'|'||provider_message_id from public.email_events where id='27000000-0000-0000-0000-000000000007'
  union all select 'provider|'||id||'|'||email_event_id||'|'||provider||'|'||provider_event_id||'|'||
    provider_message_id from public.email_provider_events where id='27000000-0000-0000-0000-000000000008'
) preserved(payload);
