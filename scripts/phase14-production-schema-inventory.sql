\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

-- Read-only Phase 14 production-boundary inventory.  The scope contains only
-- metadata, grants, policies, flags and storage configuration; it selects no
-- customer, assessment, order, report or email row.
with inventory as materialized (
  select 'TABLE|'||c.oid::regclass::text||'|rls='||c.relrowsecurity::text as line
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind in ('r','p') and c.relname in (
    'app_settings','reports','email_events','report_fulfilments',
    'report_generation_runs','email_provider_events'
  )
  union all
  select 'COLUMN|'||table_name||'|'||ordinal_position||'|'||column_name||'|'||
    data_type||'|'||coalesce(udt_schema||'.'||udt_name,'')||'|nullable='||is_nullable||
    '|default='||coalesce(column_default,'')
  from information_schema.columns
  where table_schema='public' and table_name in (
    'app_settings','reports','email_events','report_fulfilments',
    'report_generation_runs','email_provider_events'
  )
  union all
  select 'CONSTRAINT|'||con.conrelid::regclass::text||'|'||con.conname||'|'||
    pg_get_constraintdef(con.oid,true)
  from pg_constraint con
  where con.conrelid in (
    select c.oid from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in (
      'app_settings','reports','email_events','report_fulfilments',
      'report_generation_runs','email_provider_events'
    )
  )
  union all
  select 'INDEX|'||schemaname||'.'||tablename||'|'||indexname||'|'||indexdef
  from pg_indexes where schemaname='public' and tablename in (
    'app_settings','reports','email_events','report_fulfilments',
    'report_generation_runs','email_provider_events'
  )
  union all
  select 'POLICY|'||schemaname||'.'||tablename||'|'||policyname||'|'||cmd||'|roles='||
    array_to_string(roles,',')||'|qual='||coalesce(qual,'')||'|check='||coalesce(with_check,'')
  from pg_policies where schemaname='public' and tablename in (
    'app_settings','reports','email_events','report_fulfilments',
    'report_generation_runs','email_provider_events'
  )
  union all
  select 'TABLE_GRANT|'||c.oid::regclass::text||'|'||
    coalesce(pg_get_userbyid(x.grantee),'PUBLIC')||'|'||x.privilege_type||'|grantable='||x.is_grantable
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) x
  where n.nspname='public' and c.relname in (
    'app_settings','reports','email_events','report_fulfilments',
    'report_generation_runs','email_provider_events'
  )
  union all
  select 'FUNCTION|'||p.oid::regprocedure::text||'|security_definer='||p.prosecdef::text||
    '|sha256='||encode(extensions.digest(convert_to(pg_get_functiondef(p.oid),'utf8'),'sha256'),'hex')
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in ('current_admin_role','is_admin_role','set_updated_at')
  union all
  select 'FUNCTION_GRANT|'||p.oid::regprocedure::text||'|'||
    coalesce(pg_get_userbyid(x.grantee),'PUBLIC')||'|'||x.privilege_type||'|grantable='||x.is_grantable
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) x
  where n.nspname='public' and p.proname in ('current_admin_role','is_admin_role','set_updated_at')
  union all
  select 'TRIGGER|'||c.oid::regclass::text||'|'||t.tgname||'|'||pg_get_triggerdef(t.oid,true)
  from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
  where not t.tgisinternal and n.nspname='public' and c.relname in (
    'app_settings','reports','email_events','report_fulfilments',
    'report_generation_runs','email_provider_events'
  )
  union all
  select 'FLAG|'||setting_key||'|'||value_json::text from public.app_settings
  where setting_key='phase14_autonomous_report_engine'
  union all
  select 'BUCKET|'||id||'|public='||public::text||'|limit='||coalesce(file_size_limit::text,'')||
    '|mime='||coalesce(array_to_string(allowed_mime_types,','),'')
  from storage.buckets where id='generated-reports'
), digest as (
  select encode(extensions.digest(convert_to(string_agg(line,E'\n' order by line),'utf8'),'sha256'),'hex') hash
  from inventory
)
select line from inventory
union all select 'ZZ|inventory_sha256|'||hash from digest
order by 1;
