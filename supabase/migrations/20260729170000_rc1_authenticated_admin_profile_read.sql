-- RC1 authenticated control-plane profile read.
--
-- The control plane validates the caller's JWT, then performs an authenticated,
-- RLS-governed lookup of only id, role, and status. This migration supplies the
-- minimum underlying column privileges required for PostgreSQL to evaluate the
-- existing admin_profiles policies. It does not change a policy, function,
-- trigger, table definition, service-role grant, or write privilege.

begin;

do $$
declare
  relation_kind "char";
  relation_owner text;
  rls_enabled boolean;
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise exception 'rc1_authenticated_profile_read_missing_role: authenticated';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    raise exception 'rc1_authenticated_profile_read_missing_role: anon';
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    raise exception 'rc1_authenticated_profile_read_missing_role: service_role';
  end if;

  select c.relkind, owner_role.rolname, c.relrowsecurity
    into relation_kind, relation_owner, rls_enabled
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_roles owner_role on owner_role.oid = c.relowner
  where n.nspname = 'public'
    and c.relname = 'admin_profiles';

  if relation_kind is null then
    raise exception 'rc1_authenticated_profile_read_missing_table: public.admin_profiles';
  end if;
  if relation_kind not in ('r', 'p') then
    raise exception 'rc1_authenticated_profile_read_wrong_relation_kind: public.admin_profiles (%)',
      relation_kind;
  end if;
  if relation_owner <> 'postgres' then
    raise exception 'rc1_authenticated_profile_read_wrong_owner: public.admin_profiles (%)',
      relation_owner;
  end if;
  if not rls_enabled then
    raise exception 'rc1_authenticated_profile_read_rls_disabled: public.admin_profiles';
  end if;
end;
$$;

create temporary table rc1_authenticated_profile_expected_columns (
  ordinal smallint primary key,
  column_name text unique not null,
  type_name text not null,
  not_null boolean not null,
  identity_kind text not null,
  generated_kind text not null
) on commit drop;

insert into rc1_authenticated_profile_expected_columns values
  (1, 'id', 'uuid', true, '', ''),
  (2, 'email', 'citext', true, '', ''),
  (3, 'full_name', 'text', false, '', ''),
  (4, 'role', 'admin_role', true, '', ''),
  (5, 'status', 'user_status', true, '', ''),
  (6, 'mfa_required', 'boolean', true, '', ''),
  (7, 'created_at', 'timestamp with time zone', true, '', ''),
  (8, 'updated_at', 'timestamp with time zone', true, '', ''),
  (9, 'last_login_at', 'timestamp with time zone', false, '', '');

do $$
begin
  if exists (
    (
      select
        a.attnum::smallint,
        a.attname,
        format_type(a.atttypid, a.atttypmod),
        a.attnotnull,
        a.attidentity::text,
        a.attgenerated::text
      from pg_attribute a
      where a.attrelid = 'public.admin_profiles'::regclass
        and a.attnum > 0
        and not a.attisdropped
      except
      select ordinal, column_name, type_name, not_null, identity_kind, generated_kind
      from rc1_authenticated_profile_expected_columns
    )
    union all
    (
      select ordinal, column_name, type_name, not_null, identity_kind, generated_kind
      from rc1_authenticated_profile_expected_columns
      except
      select
        a.attnum::smallint,
        a.attname,
        format_type(a.atttypid, a.atttypmod),
        a.attnotnull,
        a.attidentity::text,
        a.attgenerated::text
      from pg_attribute a
      where a.attrelid = 'public.admin_profiles'::regclass
        and a.attnum > 0
        and not a.attisdropped
    )
  ) then
    raise exception 'rc1_authenticated_profile_read_column_definition_mismatch';
  end if;

  if (select count(*) from pg_policy
      where polrelid = 'public.admin_profiles'::regclass) <> 2 then
    raise exception 'rc1_authenticated_profile_read_policy_count_mismatch';
  end if;

  if not exists (
    select 1
    from pg_policy
    where polrelid = 'public.admin_profiles'::regclass
      and polname = 'admin_profiles_select'
      and polcmd = 'r'
      and polpermissive
      and polroles = array[0::oid]
      and pg_get_expr(polqual, polrelid)
        = '((id = ( SELECT auth.uid() AS uid)) OR is_admin_role(ARRAY[''platform_admin''::admin_role]))'
      and polwithcheck is null
  ) then
    raise exception 'rc1_authenticated_profile_read_select_policy_mismatch';
  end if;

  if not exists (
    select 1
    from pg_policy
    where polrelid = 'public.admin_profiles'::regclass
      and polname = 'admin_profiles_platform_admin_manage'
      and polcmd = '*'
      and polpermissive
      and polroles = array[0::oid]
      and pg_get_expr(polqual, polrelid)
        = 'is_admin_role(ARRAY[''platform_admin''::admin_role])'
      and pg_get_expr(polwithcheck, polrelid)
        = 'is_admin_role(ARRAY[''platform_admin''::admin_role])'
  ) then
    raise exception 'rc1_authenticated_profile_read_platform_policy_mismatch';
  end if;

  if has_table_privilege('authenticated', 'public.admin_profiles', 'SELECT') then
    raise exception 'rc1_authenticated_profile_read_table_select_already_present';
  end if;

  if exists (
    select 1
    from pg_attribute a
    where a.attrelid = 'public.admin_profiles'::regclass
      and a.attnum > 0
      and not a.attisdropped
      and a.attname not in ('id', 'role', 'status')
      and has_column_privilege(
        'authenticated',
        'public.admin_profiles',
        a.attname,
        'SELECT'
      )
  ) then
    raise exception 'rc1_authenticated_profile_read_unapproved_column_select_present';
  end if;

  if has_table_privilege('authenticated', 'public.admin_profiles', 'INSERT')
     or has_table_privilege('authenticated', 'public.admin_profiles', 'UPDATE')
     or has_table_privilege('authenticated', 'public.admin_profiles', 'DELETE') then
    raise exception 'rc1_authenticated_profile_read_authenticated_write_present';
  end if;
end;
$$;

create temporary table rc1_authenticated_profile_before_table_acl on commit drop as
select
  role_name,
  privilege_name,
  case
    when role_name = 'PUBLIC' then exists (
      select 1
      from pg_class relation
      cross join lateral aclexplode(
        coalesce(relation.relacl, acldefault('r', relation.relowner))
      ) acl
      where relation.oid = 'public.admin_profiles'::regclass
        and acl.grantee = 0
        and acl.privilege_type = privilege_name
    )
    else has_table_privilege(
      role_name,
      'public.admin_profiles',
      privilege_name
    )
  end as allowed
from unnest(array['PUBLIC', 'anon', 'authenticated', 'service_role']) role_name
cross join unnest(
  array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']
) privilege_name;

create temporary table rc1_authenticated_profile_before_column_acl on commit drop as
select
  role_name,
  a.attnum,
  a.attname,
  privilege_name,
  case
    when role_name = 'PUBLIC' then exists (
      select 1
      from aclexplode(coalesce(a.attacl, acldefault('c', owner_relation.relowner))) acl
      where acl.grantee = 0
        and acl.privilege_type = privilege_name
    )
    else has_column_privilege(
      role_name,
      'public.admin_profiles',
      a.attname,
      privilege_name
    )
  end as allowed
from pg_attribute a
join pg_class owner_relation
  on owner_relation.oid = a.attrelid
cross join unnest(array['PUBLIC', 'anon', 'authenticated', 'service_role']) role_name
cross join unnest(array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) privilege_name
where a.attrelid = 'public.admin_profiles'::regclass
  and a.attnum > 0
  and not a.attisdropped;

create temporary table rc1_authenticated_profile_before_functions on commit drop as
select
  p.oid,
  p.oid::regprocedure::text as signature,
  pg_get_functiondef(p.oid) as definition,
  coalesce(p.proacl::text, '') as acl,
  p.prosecdef,
  coalesce(array_to_string(p.proconfig, E'\n'), '') as configuration,
  p.proowner
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prokind in ('f', 'p');

create temporary table rc1_authenticated_profile_before_policies on commit drop as
select
  p.oid,
  p.polrelid,
  p.polname,
  p.polcmd,
  p.polpermissive,
  p.polroles,
  coalesce(pg_get_expr(p.polqual, p.polrelid), '') as using_expression,
  coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') as check_expression
from pg_policy p
join pg_class relation on relation.oid = p.polrelid
join pg_namespace n on n.oid = relation.relnamespace
where n.nspname = 'public';

create temporary table rc1_authenticated_profile_before_triggers on commit drop as
select
  trigger_row.oid,
  trigger_row.tgrelid,
  trigger_row.tgname,
  pg_get_triggerdef(trigger_row.oid, true) as definition,
  trigger_row.tgenabled
from pg_trigger trigger_row
join pg_class relation on relation.oid = trigger_row.tgrelid
join pg_namespace n on n.oid = relation.relnamespace
where n.nspname = 'public'
  and not trigger_row.tgisinternal;

create temporary table rc1_authenticated_profile_before_relation on commit drop as
select
  c.oid,
  c.relkind,
  c.relowner,
  c.relpersistence,
  c.relreplident,
  c.relrowsecurity,
  c.relforcerowsecurity
from pg_class c
where c.oid = 'public.admin_profiles'::regclass;

create temporary table rc1_authenticated_profile_before_attributes on commit drop as
select
  a.attnum,
  a.attname,
  a.atttypid,
  a.atttypmod,
  a.attnotnull,
  a.atthasdef,
  a.attidentity,
  a.attgenerated,
  a.attcollation,
  a.attstorage,
  a.attcompression,
  coalesce(pg_get_expr(default_row.adbin, default_row.adrelid), '') as default_expression
from pg_attribute a
left join pg_attrdef default_row
  on default_row.adrelid = a.attrelid
 and default_row.adnum = a.attnum
where a.attrelid = 'public.admin_profiles'::regclass
  and a.attnum > 0
  and not a.attisdropped;

create temporary table rc1_authenticated_profile_before_constraints on commit drop as
select
  constraint_row.oid,
  constraint_row.conname,
  constraint_row.contype,
  pg_get_constraintdef(constraint_row.oid, true) as definition
from pg_constraint constraint_row
where constraint_row.conrelid = 'public.admin_profiles'::regclass;

create temporary table rc1_authenticated_profile_before_indexes on commit drop as
select
  index_row.indexrelid,
  pg_get_indexdef(index_row.indexrelid) as definition
from pg_index index_row
where index_row.indrelid = 'public.admin_profiles'::regclass;

grant select (id, role, status)
on public.admin_profiles
to authenticated;

do $$
declare
  changed record;
begin
  if has_table_privilege('authenticated', 'public.admin_profiles', 'SELECT') then
    raise exception 'rc1_authenticated_profile_read_table_select_added';
  end if;

  if not has_column_privilege(
    'authenticated', 'public.admin_profiles', 'id', 'SELECT'
  ) or not has_column_privilege(
    'authenticated', 'public.admin_profiles', 'role', 'SELECT'
  ) or not has_column_privilege(
    'authenticated', 'public.admin_profiles', 'status', 'SELECT'
  ) then
    raise exception 'rc1_authenticated_profile_read_required_column_select_missing';
  end if;

  if exists (
    select 1
    from pg_attribute a
    where a.attrelid = 'public.admin_profiles'::regclass
      and a.attnum > 0
      and not a.attisdropped
      and a.attname not in ('id', 'role', 'status')
      and has_column_privilege(
        'authenticated',
        'public.admin_profiles',
        a.attname,
        'SELECT'
      )
  ) then
    raise exception 'rc1_authenticated_profile_read_unapproved_column_select_added';
  end if;

  if has_table_privilege('authenticated', 'public.admin_profiles', 'INSERT')
     or has_table_privilege('authenticated', 'public.admin_profiles', 'UPDATE')
     or has_table_privilege('authenticated', 'public.admin_profiles', 'DELETE') then
    raise exception 'rc1_authenticated_profile_read_authenticated_write_added';
  end if;

  if has_table_privilege('anon', 'public.admin_profiles', 'SELECT')
     or has_table_privilege('anon', 'public.admin_profiles', 'INSERT')
     or has_table_privilege('anon', 'public.admin_profiles', 'UPDATE')
     or has_table_privilege('anon', 'public.admin_profiles', 'DELETE') then
    raise exception 'rc1_authenticated_profile_read_anon_expansion';
  end if;

  if exists (
    select 1
    from pg_attribute a
    where a.attrelid = 'public.admin_profiles'::regclass
      and a.attnum > 0
      and not a.attisdropped
      and has_column_privilege(
        'anon',
        'public.admin_profiles',
        a.attname,
        'SELECT'
      )
  ) then
    raise exception 'rc1_authenticated_profile_read_anon_column_expansion';
  end if;

  if exists (
    select 1
    from pg_class relation
    cross join lateral aclexplode(
      coalesce(relation.relacl, acldefault('r', relation.relowner))
    ) acl
    where relation.oid = 'public.admin_profiles'::regclass
      and acl.grantee = 0
      and acl.privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
  ) or exists (
    select 1
    from pg_attribute a
    cross join lateral aclexplode(
      coalesce(
        a.attacl,
        acldefault(
          'c',
          (select relowner from pg_class
           where oid = 'public.admin_profiles'::regclass)
        )
      )
    ) acl
    where a.attrelid = 'public.admin_profiles'::regclass
      and a.attnum > 0
      and not a.attisdropped
      and acl.grantee = 0
      and acl.privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
  ) then
    raise exception 'rc1_authenticated_profile_read_public_expansion';
  end if;

  for changed in
    select before.*
    from rc1_authenticated_profile_before_table_acl before
    where before.allowed is distinct from
      case
        when before.role_name = 'PUBLIC' then exists (
          select 1
          from pg_class relation
          cross join lateral aclexplode(
            coalesce(relation.relacl, acldefault('r', relation.relowner))
          ) acl
          where relation.oid = 'public.admin_profiles'::regclass
            and acl.grantee = 0
            and acl.privilege_type = before.privilege_name
        )
        else has_table_privilege(
          before.role_name,
          'public.admin_profiles',
          before.privilege_name
        )
      end
  loop
    raise exception 'rc1_authenticated_profile_read_unapproved_table_acl_change: % %',
      changed.role_name, changed.privilege_name;
  end loop;

  for changed in
    select before.*
    from rc1_authenticated_profile_before_column_acl before
    where before.allowed is distinct from
      case
        when before.role_name = 'PUBLIC' then exists (
          select 1
          from pg_attribute attribute_row
          join pg_class relation on relation.oid = attribute_row.attrelid
          cross join lateral aclexplode(
            coalesce(attribute_row.attacl, acldefault('c', relation.relowner))
          ) acl
          where attribute_row.attrelid = 'public.admin_profiles'::regclass
            and attribute_row.attnum = before.attnum
            and acl.grantee = 0
            and acl.privilege_type = before.privilege_name
        )
        else has_column_privilege(
          before.role_name,
          'public.admin_profiles',
          before.attname,
          before.privilege_name
        )
      end
      and not (
        before.role_name = 'authenticated'
        and before.privilege_name = 'SELECT'
        and before.attname in ('id', 'role', 'status')
        and before.allowed = false
      )
  loop
    raise exception 'rc1_authenticated_profile_read_unapproved_column_acl_change: % % %',
      changed.role_name, changed.attname, changed.privilege_name;
  end loop;

  if exists (
    (
      select * from rc1_authenticated_profile_before_functions
      except
      select
        p.oid,
        p.oid::regprocedure::text,
        pg_get_functiondef(p.oid),
        coalesce(p.proacl::text, ''),
        p.prosecdef,
        coalesce(array_to_string(p.proconfig, E'\n'), ''),
        p.proowner
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.prokind in ('f', 'p')
    )
    union all
    (
      select
        p.oid,
        p.oid::regprocedure::text,
        pg_get_functiondef(p.oid),
        coalesce(p.proacl::text, ''),
        p.prosecdef,
        coalesce(array_to_string(p.proconfig, E'\n'), ''),
        p.proowner
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'
        and p.prokind in ('f', 'p')
      except
      select * from rc1_authenticated_profile_before_functions
    )
  ) then
    raise exception 'rc1_authenticated_profile_read_function_definition_changed';
  end if;

  if exists (
    (
      select * from rc1_authenticated_profile_before_policies
      except
      select
        p.oid,
        p.polrelid,
        p.polname,
        p.polcmd,
        p.polpermissive,
        p.polroles,
        coalesce(pg_get_expr(p.polqual, p.polrelid), ''),
        coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')
      from pg_policy p
      join pg_class relation on relation.oid = p.polrelid
      join pg_namespace n on n.oid = relation.relnamespace
      where n.nspname = 'public'
    )
    union all
    (
      select
        p.oid,
        p.polrelid,
        p.polname,
        p.polcmd,
        p.polpermissive,
        p.polroles,
        coalesce(pg_get_expr(p.polqual, p.polrelid), ''),
        coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '')
      from pg_policy p
      join pg_class relation on relation.oid = p.polrelid
      join pg_namespace n on n.oid = relation.relnamespace
      where n.nspname = 'public'
      except
      select * from rc1_authenticated_profile_before_policies
    )
  ) then
    raise exception 'rc1_authenticated_profile_read_rls_policy_changed';
  end if;

  if exists (
    (
      select * from rc1_authenticated_profile_before_triggers
      except
      select
        trigger_row.oid,
        trigger_row.tgrelid,
        trigger_row.tgname,
        pg_get_triggerdef(trigger_row.oid, true),
        trigger_row.tgenabled
      from pg_trigger trigger_row
      join pg_class relation on relation.oid = trigger_row.tgrelid
      join pg_namespace n on n.oid = relation.relnamespace
      where n.nspname = 'public'
        and not trigger_row.tgisinternal
    )
    union all
    (
      select
        trigger_row.oid,
        trigger_row.tgrelid,
        trigger_row.tgname,
        pg_get_triggerdef(trigger_row.oid, true),
        trigger_row.tgenabled
      from pg_trigger trigger_row
      join pg_class relation on relation.oid = trigger_row.tgrelid
      join pg_namespace n on n.oid = relation.relnamespace
      where n.nspname = 'public'
        and not trigger_row.tgisinternal
      except
      select * from rc1_authenticated_profile_before_triggers
    )
  ) then
    raise exception 'rc1_authenticated_profile_read_trigger_changed';
  end if;

  if exists (
    (
      select * from rc1_authenticated_profile_before_relation
      except
      select
        c.oid,
        c.relkind,
        c.relowner,
        c.relpersistence,
        c.relreplident,
        c.relrowsecurity,
        c.relforcerowsecurity
      from pg_class c
      where c.oid = 'public.admin_profiles'::regclass
    )
    union all
    (
      select
        c.oid,
        c.relkind,
        c.relowner,
        c.relpersistence,
        c.relreplident,
        c.relrowsecurity,
        c.relforcerowsecurity
      from pg_class c
      where c.oid = 'public.admin_profiles'::regclass
      except
      select * from rc1_authenticated_profile_before_relation
    )
  ) or exists (
    (
      select * from rc1_authenticated_profile_before_attributes
      except
      select
        a.attnum,
        a.attname,
        a.atttypid,
        a.atttypmod,
        a.attnotnull,
        a.atthasdef,
        a.attidentity,
        a.attgenerated,
        a.attcollation,
        a.attstorage,
        a.attcompression,
        coalesce(pg_get_expr(default_row.adbin, default_row.adrelid), '')
      from pg_attribute a
      left join pg_attrdef default_row
        on default_row.adrelid = a.attrelid
       and default_row.adnum = a.attnum
      where a.attrelid = 'public.admin_profiles'::regclass
        and a.attnum > 0
        and not a.attisdropped
    )
    union all
    (
      select
        a.attnum,
        a.attname,
        a.atttypid,
        a.atttypmod,
        a.attnotnull,
        a.atthasdef,
        a.attidentity,
        a.attgenerated,
        a.attcollation,
        a.attstorage,
        a.attcompression,
        coalesce(pg_get_expr(default_row.adbin, default_row.adrelid), '')
      from pg_attribute a
      left join pg_attrdef default_row
        on default_row.adrelid = a.attrelid
       and default_row.adnum = a.attnum
      where a.attrelid = 'public.admin_profiles'::regclass
        and a.attnum > 0
        and not a.attisdropped
      except
      select * from rc1_authenticated_profile_before_attributes
    )
  ) or exists (
    (
      select * from rc1_authenticated_profile_before_constraints
      except
      select
        constraint_row.oid,
        constraint_row.conname,
        constraint_row.contype,
        pg_get_constraintdef(constraint_row.oid, true)
      from pg_constraint constraint_row
      where constraint_row.conrelid = 'public.admin_profiles'::regclass
    )
    union all
    (
      select
        constraint_row.oid,
        constraint_row.conname,
        constraint_row.contype,
        pg_get_constraintdef(constraint_row.oid, true)
      from pg_constraint constraint_row
      where constraint_row.conrelid = 'public.admin_profiles'::regclass
      except
      select * from rc1_authenticated_profile_before_constraints
    )
  ) or exists (
    (
      select * from rc1_authenticated_profile_before_indexes
      except
      select
        index_row.indexrelid,
        pg_get_indexdef(index_row.indexrelid)
      from pg_index index_row
      where index_row.indrelid = 'public.admin_profiles'::regclass
    )
    union all
    (
      select
        index_row.indexrelid,
        pg_get_indexdef(index_row.indexrelid)
      from pg_index index_row
      where index_row.indrelid = 'public.admin_profiles'::regclass
      except
      select * from rc1_authenticated_profile_before_indexes
    )
  ) then
    raise exception 'rc1_authenticated_profile_read_table_definition_changed';
  end if;
end;
$$;

commit;
