-- Atomic consumption for the three access-token security counters.
--
-- All three families validated eligibility in the application and incremented afterwards:
--
--   assessment_tokens (resume)    src/lib/respondent/tokens.ts  -- select use_count/max_uses,
--   assessment_tokens (snapshot)  src/lib/respondent/tokens.ts     compare in JS, later UPDATE
--   customer_report_access_tokens src/lib/reports/customer-report-access.ts -- access_count + 1
--
-- Two application instances can therefore observe the same pre-increment count, both pass the
-- comparison, and both consume the same remaining allowance. The last-use case is the sharp one: a
-- token with one use left can be spent several times concurrently, and the final stored count is a
-- lost update rather than the number of accesses actually granted.
--
-- The fix is a single conditional UPDATE per family. Eligibility and the limit live in the WHERE
-- clause, so Postgres evaluates them against the row it is actually locking: concurrent callers
-- serialise on that row and every caller after the allowance is exhausted matches zero rows and is
-- refused. There is no window between the check and the increment because they are one statement.
--
-- Deliberately two narrow functions rather than a token framework -- these are two different tables
-- with different binding rules. Raw tokens are never passed or stored; callers continue to hash
-- first and pass only the digest, exactly as the existing lookups do.

begin;

-- 1. Assessment tokens: resume and snapshot share this table and differ only by token_type.
create or replace function public.consume_assessment_token(
  p_token_hash text,
  p_token_type text,
  p_ip_hash text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.assessment_tokens%rowtype;
  v_exists public.assessment_tokens%rowtype;
begin
  if coalesce(trim(p_token_hash), '') = '' or p_token_type not in ('resume', 'snapshot') then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_token');
  end if;

  -- Check + limit + increment in ONE statement. A concurrent caller either matches this row before
  -- the allowance is exhausted, or matches nothing at all.
  update public.assessment_tokens
  set use_count = use_count + 1,
      last_used_at = now(),
      last_used_ip_hash = coalesce(p_ip_hash, last_used_ip_hash)
  where token_hash = p_token_hash
    and token_type = p_token_type::public.assessment_token_type
    and revoked_at is null
    and expires_at > now()
    and use_count < max_uses
  returning * into v_row;

  if found then
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'token_id', v_row.id,
      'assessment_id', v_row.assessment_id,
      'use_count', v_row.use_count,
      'max_uses', v_row.max_uses
    );
  end if;

  -- Nothing consumed. Distinguish why, for customer-safe messaging, without ever consuming a use.
  select * into v_exists from public.assessment_tokens
  where token_hash = p_token_hash and token_type = p_token_type::public.assessment_token_type;
  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_token');
  end if;
  if v_exists.revoked_at is not null then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'revoked_token');
  end if;
  if v_exists.expires_at <= now() then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'expired_token');
  end if;
  return pg_catalog.jsonb_build_object('ok', false, 'reason', 'token_use_limit_reached');
end;
$$;

revoke all on function public.consume_assessment_token(text, text, text)
  from public, anon, authenticated;
grant execute on function public.consume_assessment_token(text, text, text) to service_role;

-- 2. Customer report access. The allowance is an application policy value rather than a column, so
--    it is passed in and still enforced inside the same statement that increments.
create or replace function public.consume_customer_report_access_token(
  p_token_hash text,
  p_max_uses integer
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.customer_report_access_tokens%rowtype;
  v_exists public.customer_report_access_tokens%rowtype;
begin
  if coalesce(trim(p_token_hash), '') = '' or coalesce(p_max_uses, 0) <= 0 then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_token');
  end if;

  update public.customer_report_access_tokens
  set access_count = access_count + 1,
      last_accessed_at = now()
  where token_hash = p_token_hash
    and revoked_at is null
    and expires_at > now()
    and access_count < p_max_uses
  returning * into v_row;

  if found then
    return pg_catalog.jsonb_build_object(
      'ok', true,
      'token_id', v_row.id,
      'order_id', v_row.order_id,
      'report_id', v_row.report_id,
      'recipient_email', v_row.recipient_email,
      'purpose', v_row.purpose,
      'access_count', v_row.access_count
    );
  end if;

  select * into v_exists from public.customer_report_access_tokens where token_hash = p_token_hash;
  if not found then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'invalid_token');
  end if;
  if v_exists.revoked_at is not null then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'reason', 'revoked_token',
      'token_id', v_exists.id, 'order_id', v_exists.order_id, 'report_id', v_exists.report_id);
  end if;
  if v_exists.expires_at <= now() then
    return pg_catalog.jsonb_build_object(
      'ok', false, 'reason', 'expired_token',
      'token_id', v_exists.id, 'order_id', v_exists.order_id, 'report_id', v_exists.report_id);
  end if;
  return pg_catalog.jsonb_build_object(
    'ok', false, 'reason', 'rate_limited',
    'token_id', v_exists.id, 'order_id', v_exists.order_id, 'report_id', v_exists.report_id);
end;
$$;

revoke all on function public.consume_customer_report_access_token(text, integer)
  from public, anon, authenticated;
grant execute on function public.consume_customer_report_access_token(text, integer) to service_role;

-- Apply-time and replay-time assertion of the properties that matter.
do $$
declare
  v_def text;
begin
  foreach v_def in array array[
    pg_catalog.pg_get_functiondef('public.consume_assessment_token(text,text,text)'::regprocedure),
    pg_catalog.pg_get_functiondef('public.consume_customer_report_access_token(text,integer)'::regprocedure)
  ] loop
    if pg_catalog.strpos(v_def, 'security definer') = 0 and pg_catalog.strpos(v_def, 'SECURITY DEFINER') = 0 then
      raise exception 'atomic_token_consumption_not_security_definer';
    end if;
    if pg_catalog.strpos(v_def, 'search_path') = 0 then
      raise exception 'atomic_token_consumption_missing_search_path';
    end if;
    -- The limit must be enforced in the same statement that increments.
    if pg_catalog.strpos(v_def, 'revoked_at is null') = 0
       or pg_catalog.strpos(v_def, 'expires_at > now()') = 0 then
      raise exception 'atomic_token_consumption_missing_eligibility_predicate';
    end if;
  end loop;

  if exists (
    select 1 from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('consume_assessment_token', 'consume_customer_report_access_token')
      and (p.proacl::text like '%=X/%public%' or p.proacl::text like '%anon=X%'
           or p.proacl::text like '%authenticated=X%')
  ) then
    raise exception 'atomic_token_consumption_privilege_broadened';
  end if;
end;
$$;

commit;
