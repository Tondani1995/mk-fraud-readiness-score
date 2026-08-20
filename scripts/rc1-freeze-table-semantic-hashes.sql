-- Deterministic semantic inventory for the three RC1 freeze control tables.
-- This deliberately excludes environment-level default privileges and owned-sequence ACLs:
-- those are deployment-environment properties rather than table-definition semantics.
with targets(table_name) as (
  values
    ('rc1_operation_freeze_state'),
    ('rc1_operation_freeze_audit'),
    ('rc1_certification_secret_write_tokens')
),
base as (
  select
    c.oid,
    n.nspname as schema_name,
    c.relname as table_name,
    c.relowner,
    c.relpersistence,
    c.relkind,
    c.relispartition,
    c.relreplident,
    c.relrowsecurity,
    c.relforcerowsecurity
  from targets t
  join pg_class c on c.relname = t.table_name
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
),
inventories as (
  select
    b.table_name,
    jsonb_build_object(
      'schema', b.schema_name,
      'table', b.table_name,
      'owner', pg_get_userbyid(b.relowner),
      'persistence', case b.relpersistence
        when 'p' then 'permanent'
        when 'u' then 'unlogged'
        else 'temporary'
      end,
      'partitioned', b.relkind = 'p',
      'is_partition', b.relispartition,
      'partition_strategy', (
        select case pt.partstrat
          when 'r' then 'range'
          when 'l' then 'list'
          when 'h' then 'hash'
          else null
        end
        from pg_partitioned_table pt
        where pt.partrelid = b.oid
      ),
      'replica_identity', case b.relreplident
        when 'd' then 'default'
        when 'n' then 'nothing'
        when 'f' then 'full'
        when 'i' then 'index'
      end,
      'row_level_security', b.relrowsecurity,
      'force_row_level_security', b.relforcerowsecurity,
      'columns', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'ordinal', a.attnum,
            'name', a.attname,
            'data_type', format_type(a.atttypid, a.atttypmod),
            'type_identity', jsonb_build_object(
              'schema', tn.nspname,
              'name', typ.typname,
              'kind', typ.typtype,
              'domain_base_type', case
                when typ.typtype = 'd' then format_type(typ.typbasetype, typ.typtypmod)
                else null
              end,
              'enum_labels', case
                when typ.typtype = 'e' then (
                  select jsonb_agg(e.enumlabel order by e.enumsortorder)
                  from pg_enum e
                  where e.enumtypid = typ.oid
                )
                else null
              end
            ),
            'collation', case
              when a.attcollation = 0 then null
              else jsonb_build_object('schema', cn.nspname, 'name', coll.collname)
            end,
            'nullable', not a.attnotnull,
            'default_expression', case
              when ad.oid is null then null
              else regexp_replace(
                btrim(pg_get_expr(ad.adbin, ad.adrelid, false)),
                '\s+',
                ' ',
                'g'
              )
            end,
            'generated_state', case a.attgenerated
              when '' then 'none'
              when 's' then 'stored'
              when 'v' then 'virtual'
            end,
            'identity_state', case a.attidentity
              when '' then 'none'
              when 'a' then 'always'
              when 'd' then 'by_default'
            end
          )
          order by a.attnum
        )
        from pg_attribute a
        join pg_type typ on typ.oid = a.atttypid
        join pg_namespace tn on tn.oid = typ.typnamespace
        left join pg_attrdef ad
          on ad.adrelid = a.attrelid
         and ad.adnum = a.attnum
        left join pg_collation coll on coll.oid = a.attcollation
        left join pg_namespace cn on cn.oid = coll.collnamespace
        where a.attrelid = b.oid
          and a.attnum > 0
          and not a.attisdropped
      ), '[]'::jsonb),
      'constraints', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'name', con.conname,
            'type', case con.contype
              when 'p' then 'primary_key'
              when 'u' then 'unique'
              when 'c' then 'check'
              when 'f' then 'foreign_key'
              else con.contype::text
            end,
            'columns', coalesce((
              select jsonb_agg(att.attname order by k.ord)
              from unnest(con.conkey) with ordinality k(attnum, ord)
              join pg_attribute att
                on att.attrelid = con.conrelid
               and att.attnum = k.attnum
            ), '[]'::jsonb),
            'referenced_table', case
              when con.contype = 'f' then (
                select format('%I.%I', rn.nspname, rc.relname)
                from pg_class rc
                join pg_namespace rn on rn.oid = rc.relnamespace
                where rc.oid = con.confrelid
              )
              else null
            end,
            'referenced_columns', case
              when con.contype = 'f' then coalesce((
                select jsonb_agg(att.attname order by k.ord)
                from unnest(con.confkey) with ordinality k(attnum, ord)
                join pg_attribute att
                  on att.attrelid = con.confrelid
                 and att.attnum = k.attnum
              ), '[]'::jsonb)
              else null
            end,
            'definition', regexp_replace(
              btrim(pg_get_constraintdef(con.oid, false)),
              '\s+',
              ' ',
              'g'
            ),
            'validated', con.convalidated,
            'deferrable', con.condeferrable,
            'initially_deferred', con.condeferred
          )
          order by con.contype, con.conname
        )
        from pg_constraint con
        where con.conrelid = b.oid
          and con.contype in ('p', 'u', 'c', 'f')
      ), '[]'::jsonb),
      'indexes', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'name', ic.relname,
            'method', am.amname,
            'unique', ix.indisunique,
            'primary', ix.indisprimary,
            'valid', ix.indisvalid,
            'ready', ix.indisready,
            'definition', regexp_replace(
              btrim(pg_get_indexdef(ix.indexrelid, 0, false)),
              '\s+',
              ' ',
              'g'
            ),
            'key_expressions', coalesce((
              select jsonb_agg(
                regexp_replace(
                  btrim(pg_get_indexdef(ix.indexrelid, pos, false)),
                  '\s+',
                  ' ',
                  'g'
                )
                order by pos
              )
              from generate_series(1, ix.indnkeyatts) pos
            ), '[]'::jsonb),
            'included_columns', coalesce((
              select jsonb_agg(a.attname order by pos)
              from generate_series(ix.indnkeyatts + 1, ix.indnatts) pos
              join pg_attribute a
                on a.attrelid = b.oid
               and a.attnum = ix.indkey[pos - 1]
            ), '[]'::jsonb),
            'predicate', case
              when ix.indpred is null then null
              else regexp_replace(
                btrim(pg_get_expr(ix.indpred, ix.indrelid, false)),
                '\s+',
                ' ',
                'g'
              )
            end
          )
          order by ic.relname
        )
        from pg_index ix
        join pg_class ic on ic.oid = ix.indexrelid
        join pg_am am on am.oid = ic.relam
        where ix.indrelid = b.oid
      ), '[]'::jsonb),
      'triggers', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'name', trg.tgname,
            'timing', case
              when (trg.tgtype & 64) <> 0 then 'instead_of'
              when (trg.tgtype & 2) <> 0 then 'before'
              else 'after'
            end,
            'level', case
              when (trg.tgtype & 1) <> 0 then 'row'
              else 'statement'
            end,
            'events', (
              select jsonb_agg(event order by event)
              from (
                values
                  (case when (trg.tgtype & 4) <> 0 then 'insert' end),
                  (case when (trg.tgtype & 8) <> 0 then 'delete' end),
                  (case when (trg.tgtype & 16) <> 0 then 'update' end),
                  (case when (trg.tgtype & 32) <> 0 then 'truncate' end)
              ) e(event)
              where event is not null
            ),
            'enabled', case trg.tgenabled
              when 'O' then 'origin'
              when 'D' then 'disabled'
              when 'R' then 'replica'
              when 'A' then 'always'
            end,
            'called_function', format(
              '%I.%I(%s)',
              pn.nspname,
              p.proname,
              pg_get_function_identity_arguments(p.oid)
            ),
            'when_expression', case
              when trg.tgqual is null then null
              else regexp_replace(
                btrim(pg_get_expr(trg.tgqual, trg.tgrelid, false)),
                '\s+',
                ' ',
                'g'
              )
            end
          )
          order by trg.tgname
        )
        from pg_trigger trg
        join pg_proc p on p.oid = trg.tgfoid
        join pg_namespace pn on pn.oid = p.pronamespace
        where trg.tgrelid = b.oid
          and not trg.tgisinternal
      ), '[]'::jsonb),
      'rls_policies', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'name', pol.polname,
            'command', case pol.polcmd
              when 'r' then 'select'
              when 'a' then 'insert'
              when 'w' then 'update'
              when 'd' then 'delete'
              when '*' then 'all'
            end,
            'permissive', pol.polpermissive,
            'roles', coalesce((
              select jsonb_agg(
                case
                  when role_oid = 0 then 'PUBLIC'
                  else pg_get_userbyid(role_oid)
                end
                order by case
                  when role_oid = 0 then 'PUBLIC'
                  else pg_get_userbyid(role_oid)
                end
              )
              from unnest(pol.polroles) role_oid
            ), '[]'::jsonb),
            'using', case
              when pol.polqual is null then null
              else regexp_replace(
                btrim(pg_get_expr(pol.polqual, pol.polrelid, false)),
                '\s+',
                ' ',
                'g'
              )
            end,
            'with_check', case
              when pol.polwithcheck is null then null
              else regexp_replace(
                btrim(pg_get_expr(pol.polwithcheck, pol.polrelid, false)),
                '\s+',
                ' ',
                'g'
              )
            end
          )
          order by pol.polname
        )
        from pg_policy pol
        where pol.polrelid = b.oid
      ), '[]'::jsonb),
      'table_grants', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'grantor', pg_get_userbyid(x.grantor),
            'grantee', case
              when x.grantee = 0 then 'PUBLIC'
              else pg_get_userbyid(x.grantee)
            end,
            'privilege', x.privilege_type,
            'grantable', x.is_grantable
          )
          order by
            case
              when x.grantee = 0 then 'PUBLIC'
              else pg_get_userbyid(x.grantee)
            end,
            x.privilege_type,
            pg_get_userbyid(x.grantor)
        )
        from aclexplode(
          coalesce(
            (
              select c.relacl
              from pg_class c
              where c.oid = b.oid
            ),
            acldefault('r', b.relowner)
          )
        ) x
      ), '[]'::jsonb),
      'owned_sequences', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'schema', sn.nspname,
            'name', seq.relname,
            'owned_by_column', a.attname
          )
          order by sn.nspname, seq.relname
        )
        from pg_depend dep
        join pg_class seq
          on seq.oid = dep.objid
         and seq.relkind = 'S'
        join pg_namespace sn on sn.oid = seq.relnamespace
        join pg_attribute a
          on a.attrelid = b.oid
         and a.attnum = dep.refobjsubid
        where dep.refobjid = b.oid
          and dep.deptype in ('a', 'i')
      ), '[]'::jsonb)
    ) as inventory
  from base b
),
hashes as (
  select
    table_name,
    encode(
      extensions.digest(convert_to(inventory::text, 'UTF8'), 'sha256'),
      'hex'
    ) as semantic_sha256
  from inventories
)
select jsonb_object_agg(
  table_name,
  semantic_sha256
  order by table_name
)::text as rc1_actual_freeze_table_semantic_hashes_json
from hashes
\gset
