\set ON_ERROR_STOP on
begin;

-- 'reports' predates Phase 14 (migration 0001) and is a cross-phase shared table: migration
-- 0023 (Phase 1's own manual-fulfilment-recovery migration, out of scope for this remediation
-- pass) explicitly grants service_role direct `select, insert, update` on it for its own
-- security-definer-gated RPCs (already locked down via `revoke all ... grant execute ... to
-- service_role` in that same migration) -- a disclosed, intentional, pre-existing design
-- independent of Phase 14's own tables below, which stay strictly RPC-only. It is checked
-- separately, alongside this file's other shared tables further down (audit_logs,
-- report_events, assessment_events, email_events, email_provider_events), where only the
-- genuinely-never-acceptable TRUNCATE privilege is asserted absent.
do $test$
begin
  if has_table_privilege('service_role','public.reports','TRUNCATE') then
    raise exception 'service_role retains truncate privilege on reports';
  end if;
end;
$test$;

do $test$
declare v_table text;
begin
  foreach v_table in array array[
    'report_fulfilments','report_generation_runs','report_ai_attempts',
    'report_generation_claims','report_delivery_authorizations',
    'report_delivery_finalizations','phase14_worker_capabilities',
    'phase14_feature_policies','phase14_security_gates','phase14_ai_route_policies',
    'phase14_operational_alerts','phase14_storage_cleanup_queue',
    'report_delivery_remediations','phase14_provider_attestations',
    'phase14_provider_attestation_consumptions'
  ] loop
    if has_table_privilege('service_role','public.'||v_table,'INSERT')
       or has_table_privilege('service_role','public.'||v_table,'UPDATE')
       or has_table_privilege('service_role','public.'||v_table,'DELETE')
       or has_table_privilege('service_role','public.'||v_table,'TRUNCATE') then
      raise exception 'service_role retains mutation privilege on %',v_table;
    end if;
  end loop;
end;
$test$;

do $test$
declare v_table text;
begin
  foreach v_table in array array[
    'audit_logs','report_events','assessment_events','email_events','email_provider_events'
  ] loop
    if has_table_privilege('service_role','public.'||v_table,'TRUNCATE') then
      raise exception 'service_role retains shared-table truncate privilege on %',v_table;
    end if;
  end loop;
end;
$test$;

do $test$
begin
  begin
    insert into public.audit_logs(actor_type,entity_table,action,after_json)
    values('system','reports','report_generated','{}');
    raise exception 'shared Phase 14 audit guard was bypassed';
  exception when others then
    if sqlerrm='shared Phase 14 audit guard was bypassed' then raise; end if;
    if sqlerrm not like '%phase14_authoritative_transition_required%'
       and sqlerrm not like '%phase14_authoritative_rpc_required%' then raise; end if;
  end;
end;
$test$;

do $test$
declare v_row record;
begin
  select * into v_row from public.phase14_feature_policies where policy_key='manual_download';
  if not found or v_row.enabled or v_row.approved_gate_version is not null then
    raise exception 'manual_download must be seeded disabled and unapproved';
  end if;
  select * into v_row from public.phase14_feature_policies where policy_key='provider_webhook_ingestion';
  if not found or v_row.enabled then raise exception 'webhook ingestion must be seeded disabled'; end if;
  select * into v_row from public.phase14_ai_route_policies where requested_provider='openai';
  if not found or v_row.enabled then raise exception 'AI route must be seeded disabled'; end if;
end;
$test$;

do $test$
declare v_def text;
begin
  select pg_get_functiondef('public.authorize_phase14_worker_operation(text,text,uuid,uuid,uuid,uuid,uuid,text,integer,text)'::regprocedure)
    into v_def;
  if v_def ~* 'issue_secret[^_]' or v_def ~* '''issue_secret''' or v_def ~* '''lease_token''' then
    raise exception 'opaque worker authorization function returns durable secret material';
  end if;
  if has_function_privilege('service_role','public.claim_phase14_worker_capability(uuid,text)','EXECUTE') then
    raise exception 'legacy secret-bearing worker claim remains executable';
  end if;
  if has_function_privilege('service_role',
      'public.worker_recover_stale_premium_report_email_send(uuid,text,uuid)','EXECUTE') then
    raise exception 'legacy secret-bearing recovery facade remains executable';
  end if;
  if has_function_privilege('service_role',
      'public.phase14_activate_worker_operation(uuid,text[],uuid,uuid,uuid,uuid,uuid,text)','EXECUTE') then
    raise exception 'internal worker activation helper remains directly executable';
  end if;
end;
$test$;

do $test$
begin
  if not exists(select 1 from information_schema.columns where table_schema='public'
    and table_name='phase14_storage_cleanup_queue' and column_name='deletion_verified_at') then
    raise exception 'cleanup deletion verification column missing';
  end if;
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname='cleanup_expired_premium_report_claims'
      and pg_get_functiondef(p.oid) like '%repeat(''0'',64)%') then
    raise exception 'zero-checksum cleanup fallback remains';
  end if;
end;
$test$;

do $test$
begin
  begin
    perform public.ingest_phase14_provider_webhook(
      'resend','evt-forgery','msg-forgery','email.sent',now()::text,
      repeat('a',64),'{}',extract(epoch from now())::bigint,gen_random_uuid(),repeat('b',64)
    );
    raise exception 'generic caller forged webhook ingestion';
  exception when others then
    if sqlerrm='generic caller forged webhook ingestion' then raise; end if;
  end;
end;
$test$;

rollback;
