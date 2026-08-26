with categories(category, row_text) as (
  select 'tables',
    format('%s|%s|%s|%s|%s', n.nspname, c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity)
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public','phase14_private')
    and c.relkind in ('r','p','v','m','f')
  union all
  select 'columns',
    format('%s|%s|%s|%s|%s|%s|%s|%s|%s',
      n.nspname, c.relname, a.attnum, a.attname,
      pg_catalog.format_type(a.atttypid, a.atttypmod),
      a.attnotnull, coalesce(pg_get_expr(d.adbin, d.adrelid), ''),
      a.attidentity, a.attgenerated)
  from pg_attribute a
  join pg_class c on c.oid = a.attrelid
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where n.nspname in ('public','phase14_private')
    and c.relkind in ('r','p','v','m','f')
    and a.attnum > 0 and not a.attisdropped
  union all
  select 'indexes',
    format('%s|%s|%s|%s', n.nspname, c.relname, i.relname, pg_get_indexdef(i.oid))
  from pg_index x
  join pg_class i on i.oid = x.indexrelid
  join pg_class c on c.oid = x.indrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public','phase14_private')
  union all
  select 'constraints',
    format('%s|%s|%s|%s|%s', n.nspname, t.relname, con.conname, con.contype, pg_get_constraintdef(con.oid, true))
  from pg_constraint con
  join pg_class t on t.oid = con.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname in ('public','phase14_private')
  union all
  select 'functions',
    format('%s|%s|%s|%s|%s|%s|%s|%s',
      n.nspname, p.proname, pg_get_function_identity_arguments(p.oid),
      pg_get_function_result(p.oid), p.prokind, p.prosecdef, p.provolatile,
      coalesce(array_to_string(p.proconfig, ','), ''))
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public','phase14_private')
  union all
  select 'function_definitions',
    format('%s|%s|%s|%s',
      n.nspname, p.proname, pg_get_function_identity_arguments(p.oid), pg_get_functiondef(p.oid))
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public','phase14_private')
    and not exists (
      select 1 from pg_depend d
      where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
    )
  union all
  select 'policies',
    format('%s|%s|%s|%s|%s|%s|%s|%s',
      p.schemaname, p.tablename, p.policyname, p.permissive, p.cmd,
      coalesce((select array_to_string(array_agg(role_name order by role_name), ',') from unnest(p.roles) as role_name), ''),
      coalesce(p.qual, ''), coalesce(p.with_check, ''))
  from pg_policies p
  where p.schemaname in ('public','phase14_private')
  union all
  select 'table_grants',
    format('%s|%s|%s|%s|%s',
      n.nspname, c.relname,
      case when x.grantee = 0 then 'PUBLIC' else r.rolname end,
      x.privilege_type, x.is_grantable)
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) x
  left join pg_roles r on r.oid = x.grantee
  where n.nspname in ('public','phase14_private')
    and c.relkind in ('r','p','v','m','f')
    and (x.grantee = 0 or r.rolname in ('anon','authenticated','service_role'))
  union all
  select 'application_table_grants',
    format('%s|%s|%s|%s|%s',
      n.nspname, c.relname,
      case when x.grantee = 0 then 'PUBLIC' else r.rolname end,
      x.privilege_type, x.is_grantable)
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) x
  left join pg_roles r on r.oid = x.grantee
  where n.nspname in ('public','phase14_private')
    and c.relkind in ('r','p','v','m','f')
    and (x.grantee = 0 or r.rolname in ('anon','authenticated'))
  union all
  select 'function_grants',
    format('%s|%s|%s|%s|%s|%s',
      n.nspname, p.proname, pg_get_function_identity_arguments(p.oid),
      case when x.grantee = 0 then 'PUBLIC' else r.rolname end,
      x.privilege_type, x.is_grantable)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
  left join pg_roles r on r.oid = x.grantee
  where n.nspname in ('public','phase14_private')
    and (x.grantee = 0 or r.rolname in ('anon','authenticated','service_role'))
  union all
  select 'application_function_grants',
    format('%s|%s|%s|%s|%s|%s',
      n.nspname, p.proname, pg_get_function_identity_arguments(p.oid),
      case when x.grantee = 0 then 'PUBLIC' else r.rolname end,
      x.privilege_type, x.is_grantable)
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) x
  left join pg_roles r on r.oid = x.grantee
  where n.nspname in ('public','phase14_private')
    and (x.grantee = 0 or r.rolname in ('anon','authenticated'))
    and not exists (
      select 1 from pg_depend d
      where d.classid = 'pg_proc'::regclass and d.objid = p.oid and d.deptype = 'e'
    )
  union all
  select 'triggers',
    format('%s|%s|%s|%s', n.nspname, c.relname, t.tgname, pg_get_triggerdef(t.oid, true))
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public','phase14_private') and not t.tgisinternal
  union all
  select 'types',
    format('%s|%s|%s|%s', n.nspname, t.typname, t.typtype, coalesce(e.enumlabel, ''))
  from pg_type t
  join pg_namespace n on n.oid = t.typnamespace
  left join pg_enum e on e.enumtypid = t.oid
  where n.nspname in ('public','phase14_private') and t.typtype in ('e','d')
)
select category, count(*)::int as row_count,
       md5(coalesce(string_agg(row_text, E'\n' order by row_text collate "C"), '')) as signature
from categories
group by category
order by category;
