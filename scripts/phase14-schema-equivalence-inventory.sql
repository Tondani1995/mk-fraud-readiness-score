\set ON_ERROR_STOP on
select object_kind||E'\t'||object_name||E'\t'||definition
from (
  select 'table' object_kind,n.nspname||'.'||c.relname object_name,
    concat('rls=',c.relrowsecurity,';force=',c.relforcerowsecurity,';acl=',coalesce(c.relacl::text,'')) definition
  from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','phase14_private') and c.relkind in ('r','p')
  union all
  select 'column',table_schema||'.'||table_name||'.'||column_name,
    concat(data_type,';',udt_schema,'.',udt_name,';nullable=',is_nullable,
      ';default=',coalesce(column_default,''))
  from information_schema.columns where table_schema in ('public','phase14_private')
  union all
  select 'constraint',n.nspname||'.'||c.relname||'.'||con.conname,
    pg_get_constraintdef(con.oid,true)
  from pg_constraint con join pg_class c on c.oid=con.conrelid
    join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','phase14_private')
  union all
  select 'index',schemaname||'.'||indexname,indexdef
  from pg_indexes where schemaname in ('public','phase14_private')
  union all
  select 'function',n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')',
    pg_get_functiondef(p.oid)||';acl='||coalesce(p.proacl::text,'')
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname in ('public','phase14_private') and p.prokind in ('f','p')
  union all
  select 'trigger',n.nspname||'.'||c.relname||'.'||t.tgname,pg_get_triggerdef(t.oid,true)
  from pg_trigger t join pg_class c on c.oid=t.tgrelid
    join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','phase14_private') and not t.tgisinternal
  union all
  select 'policy',schemaname||'.'||tablename||'.'||policyname,
    concat('permissive=',permissive,';roles=',roles::text,';cmd=',cmd,
      ';qual=',coalesce(qual,''),';check=',coalesce(with_check,''))
  from pg_policies where schemaname in ('public','phase14_private')
) inventory
order by object_kind,object_name,definition;
