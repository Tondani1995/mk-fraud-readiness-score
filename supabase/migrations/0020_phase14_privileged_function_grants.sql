-- Phase 14 database-security hardening.
-- Restrict direct execution of privileged SECURITY DEFINER functions to the
-- server-side service role. This preserves function definitions, RLS policies,
-- scoring behaviour, workflow behaviour and Phase 14 feature flags.

begin;

revoke execute on function public.check_rate_limit(text, integer, integer) from public;
revoke execute on function public.check_rate_limit(text, integer, integer) from anon;
revoke execute on function public.check_rate_limit(text, integer, integer) from authenticated;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;

revoke execute on function public.complete_score_run_atomic(
  uuid,
  uuid,
  public.score_run_type,
  text,
  uuid,
  jsonb,
  jsonb,
  jsonb,
  jsonb
) from public;
revoke execute on function public.complete_score_run_atomic(
  uuid,
  uuid,
  public.score_run_type,
  text,
  uuid,
  jsonb,
  jsonb,
  jsonb,
  jsonb
) from anon;
revoke execute on function public.complete_score_run_atomic(
  uuid,
  uuid,
  public.score_run_type,
  text,
  uuid,
  jsonb,
  jsonb,
  jsonb,
  jsonb
) from authenticated;
grant execute on function public.complete_score_run_atomic(
  uuid,
  uuid,
  public.score_run_type,
  text,
  uuid,
  jsonb,
  jsonb,
  jsonb,
  jsonb
) to service_role;

revoke execute on function public.current_admin_role() from public;
revoke execute on function public.current_admin_role() from anon;
revoke execute on function public.current_admin_role() from authenticated;
grant execute on function public.current_admin_role() to service_role;

revoke execute on function public.is_admin_role(public.admin_role[]) from public;
revoke execute on function public.is_admin_role(public.admin_role[]) from anon;
revoke execute on function public.is_admin_role(public.admin_role[]) from authenticated;
grant execute on function public.is_admin_role(public.admin_role[]) to service_role;

comment on function public.check_rate_limit(text, integer, integer) is
  'Atomic fixed-window rate limiter. Direct execution is restricted to the service role; application calls must go through trusted server-side code.';

comment on function public.complete_score_run_atomic(
  uuid,
  uuid,
  public.score_run_type,
  text,
  uuid,
  jsonb,
  jsonb,
  jsonb,
  jsonb
) is
  'Atomic score-run persistence RPC. Direct execution is restricted to the service role; assessment scoring must go through trusted server-side code.';

comment on function public.current_admin_role() is
  'Admin-role helper for trusted server-side and RLS evaluation. Direct client execution is revoked from public, anon and authenticated roles.';

comment on function public.is_admin_role(public.admin_role[]) is
  'Admin-role predicate for trusted server-side and RLS evaluation. Direct client execution is revoked from public, anon and authenticated roles.';

commit;
