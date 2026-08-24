-- Retire the RC1 launch ceremony from ordinary product operations.
--
-- This is a forward-only compatibility migration. The historical freeze state,
-- control-plane RPCs and Comprehensive route checks remain available for audit
-- and source compatibility, but the live operational trigger must not block
-- normal assessment, order, report and fulfilment work. Existing deployed
-- functions that still call rc1_require_operation_open(text) retain their
-- signature; the call is now a no-op until those functions are naturally
-- replaced. Authentication, RLS, private storage, webhook verification and
-- application-level authorisation remain independent controls.

begin;

do $$
declare
  trigger_row record;
begin
  for trigger_row in
    select n.nspname as schema_name, c.relname as relation_name
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and t.tgname = 'trg_rc1_operation_freeze'
      and not t.tgisinternal
  loop
    execute format(
      'drop trigger if exists %I on %I.%I',
      'trg_rc1_operation_freeze',
      trigger_row.schema_name,
      trigger_row.relation_name
    );
  end loop;
end;
$$;

create or replace function public.rc1_require_operation_open(surface text)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  -- The RC1 operational freeze is retired. Keep this signature as a harmless
  -- compatibility seam for already-deployed routines; it is not an auth or
  -- data-isolation control.
  return;
end;
$$;

comment on function public.rc1_require_operation_open(text) is
  'Retired RC1 compatibility seam; ordinary operations are governed by authentication, RLS, private storage, webhook verification and route authorisation.';

commit;
